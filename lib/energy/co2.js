// Copied from Energy Dashboard (lib/co2.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

const https = require('https');

// The CO2 intensity of the electricity grid (g CO2-eq per kWh) per quarter hour, measured so far
// today and forecast for the rest of the day, from Energy-Charts of Fraunhofer ISE (free, no
// account, data under CC BY 4.0: https://api.energy-charts.info). The API allows few requests, so
// the answer is kept for 15 minutes and a failure waits half an hour.

const REQUEST_TIMEOUT = 15 * 1000;
const CACHE_TTL = 15 * 60 * 1000;
const RETRY_AFTER = 30 * 60 * 1000;

// The country of the Homey from its time zone; Energy-Charts knows these countries
const ZONES = {
  'Europe/Amsterdam': 'nl',
  'Europe/Brussels': 'be',
  'Europe/Berlin': 'de',
  'Europe/Busingen': 'de',
  'Europe/Paris': 'fr',
  'Europe/Copenhagen': 'dk',
  'Europe/Rome': 'it',
  'Europe/Luxembourg': 'lu',
};
const countryOf = timezone => ZONES[timezone] || null;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: REQUEST_TIMEOUT }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`CO2 niet beschikbaar (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('CO2 ophalen duurde te lang')));
    req.on('error', reject);
  });
}

// [{ t, end, g, forecast }]: the measured value where there is one, else the forecast
function co2Points(data) {
  const times = Array.isArray(data?.unix_seconds) ? data.unix_seconds : [];
  const measured = Array.isArray(data?.co2eq) ? data.co2eq : [];
  const forecast = Array.isArray(data?.co2eq_forecast) ? data.co2eq_forecast : [];
  const points = [];
  times.forEach((s, i) => {
    const m = measured[i];
    const f = forecast[i];
    const g = typeof m === 'number' ? m : typeof f === 'number' ? f : null;
    if (typeof s === 'number' && typeof g === 'number' && Number.isFinite(g)) points.push({ t: s * 1000, g, forecast: typeof m !== 'number' });
  });
  points.forEach((p, i) => { p.end = points[i + 1]?.t ?? p.t + 15 * 60 * 1000; });
  return points;
}

// The cleanest stretch of `hours` from now on: the lowest average intensity
function cleanestWindow(points, now = Date.now(), hours = 3) {
  const ahead = points.filter(p => p.end > now);
  const span = hours * 3600 * 1000;
  let best = null;
  for (const start of ahead) {
    const from = Math.max(start.t, now);
    const inside = ahead.filter(p => p.t < from + span && p.end > from);
    if (!inside.length || inside[inside.length - 1].end < from + span) break;
    const avg = inside.reduce((s, p) => s + p.g, 0) / inside.length;
    if (!best || avg < best.avg) best = { start: from, avg };
  }
  return best ? { start: new Date(best.start).toISOString(), hours, avg: best.avg } : null;
}

// The CO2 of what was taken from the grid today: per hour the imported kWh times the average
// intensity of that hour (kg). `rows` are the hourly rows of today's history.
function importedCo2(rows, points) {
  if (!Array.isArray(rows) || !points.length) return null;
  let kg = 0;
  let known = false;
  for (const r of rows) {
    const from = new Date(r.start).getTime();
    const inside = points.filter(p => p.t >= from && p.t < from + 3600 * 1000);
    if (!inside.length || !(r.import > 0)) continue;
    kg += r.import * inside.reduce((s, p) => s + p.g, 0) / inside.length / 1000;
    known = true;
  }
  return known ? kg : null;
}

// What the dashboard shows: now, today's range, the cleanest 3 hours and the points for the chart
function co2Summary(points, { now = Date.now(), rows = null, country = null } = {}) {
  if (!points.length) return null;
  const current = points.find(p => p.t <= now && now < p.end) || null;
  const values = points.map(p => p.g);
  return {
    country,
    current: current ? current.g : null,
    currentForecast: current ? current.forecast : null,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    cleanest: cleanestWindow(points, now),
    importedKg: importedCo2(rows, points),
    points: points.map(p => ({ t: new Date(p.t).toISOString(), minutes: Math.round((p.end - p.t) / 60000), g: Math.round(p.g), forecast: p.forecast })),
  };
}

class Co2Service {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.cache = null;
    this.failure = null;
  }

  // The points of today for `country`, or [] when unknown
  async points(country) {
    if (!country) return [];
    if (this.cache && this.cache.country === country && Date.now() - this.cache.at < CACHE_TTL) return this.cache.points;
    if (this.failure && this.failure.country === country && Date.now() - this.failure.at < RETRY_AFTER) return this.cache?.country === country ? this.cache.points : [];
    try {
      const points = co2Points(await getJson(`https://api.energy-charts.info/co2eq?country=${encodeURIComponent(country)}`));
      this.cache = { country, at: Date.now(), points };
      this.failure = null;
      return points;
    } catch (err) {
      this.failure = { country, at: Date.now() };
      this.log(`CO2: ${err.message}`);
      return this.cache?.country === country ? this.cache.points : [];
    }
  }

}

module.exports = { Co2Service, co2Points, co2Summary, cleanestWindow, importedCo2, countryOf };
