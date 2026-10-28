'use strict';

const https = require('https');
const http = require('http');

/*
 * Minimal iCalendar (RFC 5545) reader for showing upcoming events on the dashboard.
 * Supports DTSTART/DTEND/DURATION (UTC, TZID and all-day), RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL,
 * COUNT, UNTIL, BYDAY for weekly), EXDATE and RECURRENCE-ID overrides.
 */

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(s) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

/** Offset in minutes of `timeZone` at the given UTC instant. */
function tzOffset(utcMs, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return (asUtc - utcMs) / 60000;
  } catch (err) {
    return 0;
  }
}

/** Wall-clock time in a time zone to a UTC timestamp. */
function zonedToUtc(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const first = guess - tzOffset(guess, timeZone) * 60000;
  return guess - tzOffset(first, timeZone) * 60000;
}

/** Parses a DATE or DATE-TIME value: { ms, allDay, local: {y,mo,d,h,mi,s}, tz } */
function parseDate(value, params, defaultTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (!m[4] || params.VALUE === 'DATE') {
    return { ms: zonedToUtc(y, mo, d, 0, 0, 0, defaultTz), allDay: true, local: { y, mo, d, h: 0, mi: 0, s: 0 }, tz: defaultTz };
  }
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { ms: Date.UTC(y, mo, d, h, mi, s), allDay: false, local: null, tz: 'UTC' };
  const tz = params.TZID || defaultTz;
  return { ms: zonedToUtc(y, mo, d, h, mi, s, tz), allDay: false, local: { y, mo, d, h, mi, s }, tz };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return null;
  const ms = ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 86400 + Number(m[4] || 0) * 3600 + Number(m[5] || 0) * 60 + Number(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseICS(text, defaultTz) {
  const events = [];
  let cur = null;
  for (const raw of unfold(text)) {
    if (raw === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (raw === 'END:VEVENT') { if (cur && cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const line = parseLine(raw);
    if (!line) continue;
    switch (line.name) {
      case 'UID': cur.uid = line.value; break;
      case 'SUMMARY': cur.summary = unescapeText(line.value); break;
      case 'LOCATION': cur.location = unescapeText(line.value); break;
      case 'DTSTART': cur.start = parseDate(line.value, line.params, defaultTz); break;
      case 'DTEND': cur.end = parseDate(line.value, line.params, defaultTz); break;
      case 'DURATION': cur.duration = parseDuration(line.value); break;
      case 'RRULE': cur.rrule = Object.fromEntries(line.value.split(';').map((kv) => kv.split('='))); break;
      case 'EXDATE': for (const v of line.value.split(',')) { const d = parseDate(v, line.params, defaultTz); if (d) cur.exdates.push(d.ms); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(line.value, line.params, defaultTz); break;
      case 'STATUS': cur.status = line.value; break;
      default: break;
    }
  }
  return events;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Start times of an event between from and to (ms), expanding RRULE on wall-clock time. */
function occurrences(ev, from, to, limit = 500) {
  const start = ev.start;
  const len = ev.end ? ev.end.ms - start.ms : (ev.duration != null ? ev.duration : (start.allDay ? 86400000 : 0));
  const out = [];
  const push = (ms) => { if (ms + Math.max(len, 1) > from && ms < to && !ev.exdates.includes(ms)) out.push({ start: ms, end: ms + len }); };
  if (!ev.rrule) { push(start.ms); return out; }

  const r = ev.rrule;
  const freq = r.FREQ;
  const interval = Number(r.INTERVAL || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? parseDate(r.UNTIL, {}, start.tz).ms : Infinity;
  const base = start.local || (() => {
    const d = new Date(start.ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  })();
  const tz = start.local ? start.tz : 'UTC';
  const at = (y, mo, d) => zonedToUtc(y, mo, d, base.h, base.mi, base.s, tz);
  const byDay = freq === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map((x) => DAYS.indexOf(x.slice(-2))).filter((x) => x >= 0) : null;

  let n = 0;
  for (let i = 0; i < limit * 4 && n < count; i++) {
    let candidates;
    if (freq === 'DAILY') candidates = [new Date(Date.UTC(base.y, base.mo, base.d + i * interval))];
    else if (freq === 'WEEKLY') {
      const weekStart = new Date(Date.UTC(base.y, base.mo, base.d + i * 7 * interval));
      if (byDay) {
        const dow = weekStart.getUTCDay();
        const monday = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() - ((dow + 6) % 7)));
        candidates = byDay.map((wd) => new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + ((wd + 6) % 7)))).sort((a, b) => a - b);
      } else candidates = [weekStart];
    } else if (freq === 'MONTHLY') candidates = [new Date(Date.UTC(base.y, base.mo + i * interval, base.d))].filter((d) => d.getUTCDate() === base.d);
    else if (freq === 'YEARLY') candidates = [new Date(Date.UTC(base.y + i * interval, base.mo, base.d))].filter((d) => d.getUTCDate() === base.d);
    else { push(start.ms); break; }

    let stop = false;
    for (const c of candidates) {
      const ms = at(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
      if (ms < start.ms) continue;
      if (ms > until || n >= count) { stop = true; break; }
      n++;
      if (ms >= to) { stop = true; break; }
      push(ms);
    }
    if (stop || out.length >= limit) break;
  }
  return out;
}

/** Upcoming events across calendars, overrides (RECURRENCE-ID) replacing their series occurrence. */
function upcoming(events, from, to, max) {
  const overrides = new Map();
  for (const ev of events) if (ev.recurrenceId) overrides.set(`${ev.uid}|${ev.recurrenceId.ms}`, ev);
  const out = [];
  for (const ev of events) {
    if (ev.status === 'CANCELLED') continue;
    if (ev.recurrenceId) {
      for (const o of occurrences({ ...ev, rrule: null }, from, to)) out.push({ ...o, ev });
      continue;
    }
    for (const o of occurrences(ev, from, to)) {
      if (overrides.has(`${ev.uid}|${o.start}`)) continue;
      out.push({ ...o, ev });
    }
  }
  return out.sort((a, b) => a.start - b.start).slice(0, max).map((o) => ({
    title: o.ev.summary || '', location: o.ev.location || '', start: o.start, end: o.end, allDay: o.ev.start.allDay,
    calendar: o.ev.calendar, color: o.ev.color,
  }));
}

function fetchText(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const u = url.replace(/^webcal:/i, 'https:');
    const lib = u.startsWith('http:') ? http : https;
    const req = lib.get(u, { headers: { 'User-Agent': 'Homey-Floorplan-Live' }, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(fetchText(new URL(res.headers.location, u).toString(), redirects - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let size = 0; const chunks = [];
      res.on('data', (c) => { size += c.length; if (size > 10 * 1024 * 1024) req.destroy(new Error('Calendar too large')); else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

module.exports = { parseICS, occurrences, upcoming, fetchText, zonedToUtc, tzOffset };
