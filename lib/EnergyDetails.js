'use strict';

const { discover, powerCapability, batteryPowerCapabilities, invertedPower } = require('./energy/energy');
const { ForecastService, pvForecastDays } = require('./energy/forecast');
const house = require('./shared/house-core');
const { contractFrom, allInFunction } = require('./energy/tariffs');

const STEP = 15 * 60 * 1000;
const HOLD = 20 * 60 * 1000; // a reading counts for at most this long when the next one is late
const CACHE_TTL = 60 * 1000;
const GAS_TTL = 5 * 60 * 1000;
const KWP_PER_PANEL = 0.42;

const classOf = (d) => d.virtualClass || d.class;

/**
 * Power over the day per 15 minutes from Insights entries [{ t: Date|number, v: W }] of one or more devices
 * (each holds its value until the next entry). Returns [{ t, w }] from midnight up to now.
 */
function curve(lists, from, now) {
  const out = [];
  for (let t = from; t <= now; t += STEP) {
    let w = 0; let seen = false;
    for (const entries of lists) {
      // the average of the readings in this step, else the last one before it
      const inStep = entries.filter((e) => e.t >= t && e.t < t + STEP);
      if (inStep.length) { w += inStep.reduce((s, e) => s + e.v, 0) / inStep.length; seen = true; continue; }
      const before = entries.filter((e) => e.t < t).pop();
      if (before && t - before.t <= HOLD) { w += before.v; seen = true; }
    }
    out.push({ t, w: seen ? Math.round(w) : null });
  }
  return out;
}

/** kWh in and out from entries of a power that can be positive and negative (a battery, the grid). */
function energyOf(entries, now) {
  let pos = 0; let neg = 0;
  for (let i = 0; i < entries.length; i++) {
    const end = i + 1 < entries.length ? entries[i + 1].t : now;
    const hours = Math.min(end - entries[i].t, HOLD) / 3600000;
    const wh = entries[i].v * hours;
    if (wh > 0) pos += wh; else neg -= wh;
  }
  return { in: Math.round(pos / 10) / 100, out: Math.round(neg / 10) / 100 };
}

/**
 * The solar planes for the forecast: the roof faces with panels on the house view, their pitch and the panels.
 * Forecast.Solar wants the direction as -180..180 with 0 south (east negative).
 */
function solarPlanes(plan) {
  const set = house.settings(plan);
  const sides = house.solarSides(set);
  const dir = { front: set.facing, back: (set.facing + 180) % 360, left: (set.facing + 90) % 360, right: (set.facing + 270) % 360, top: 180 };
  const panels = set.objects.solar.kwp > 0 ? 0 : set.objects.solar.panels || 10;
  const kwp = set.objects.solar.kwp > 0 ? set.objects.solar.kwp : Math.round(panels * KWP_PER_PANEL * 10) / 10;
  const azimuth = (a) => ((a - 180 + 540) % 360) - 180;
  // A flat roof with both directions: low rows, half to the east and half to the west
  if (sides[0] === 'top' && set.objects.solar.layout === 'both') return [-90, 90].map((a) => ({ kwp: Math.round(kwp * 50) / 100, tilt: 10, azimuth: a }));
  return sides.map((side) => ({ kwp: Math.round((kwp / sides.length) * 100) / 100, tilt: side === 'top' ? 15 : set.pitch, azimuth: azimuth(dir[side]) }));
}

/** The details behind a part of the house view: today's power from Insights, the solar forecast. */
class EnergyDetails {

  constructor(app) {
    this.app = app;
    this.forecast = new ForecastService({ log: (m) => app.log(m) });
    this.cache = new Map();
    this.logIds = null;
  }

  get api() { return this.app.hub.api; }

  async knownLogs() {
    if (!this.logIds || Date.now() - this.logIds.at > 10 * 60000) {
      const logs = await this.api.insights.getLogs();
      this.logIds = { at: Date.now(), ids: new Set(Object.values(logs).map((l) => l.id)) };
    }
    return this.logIds.ids;
  }

  async today(deviceId, capability) {
    const id = `homey:device:${deviceId}:${capability}`;
    if (!(await this.knownLogs()).has(id)) return [];
    const read = async (resolution) => {
      const res = await this.api.insights.getLogEntries({ id, resolution });
      return ((res && res.values) || []).filter((e) => typeof e.v === 'number').map((e) => ({ t: new Date(e.t).getTime(), v: e.v }));
    };
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    let entries = await read('today');
    // Some Homeys answer 'today' without entries while the last 24 hours have them
    if (!entries.length) entries = (await read('last24Hours')).filter((e) => e.t >= midnight.getTime());
    return entries;
  }

  // Gas used today: the highest minus the lowest reading of the meter today. From Insights, so also next to Energy Dashboard.
  async gasToday() {
    if (this.gas && Date.now() - this.gas.at < GAS_TTL) return this.gas.value;
    const { slimDevice } = require('./EnergyHub');
    const devices = Object.values(await this.api.devices.getDevices()).map(slimDevice);
    const { p1 } = discover(devices, this.app.energyConfig().devices || {});
    const readings = p1 ? (await this.today(p1.id, 'meter_gas')).map((e) => e.v) : [];
    const value = readings.length ? Math.round((Math.max(...readings) - Math.min(...readings)) * 1000) / 1000 : null;
    this.gas = { at: Date.now(), value };
    return value;
  }

  async get(kind, plan) {
    const key = `${kind}|${plan ? plan.id : ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
    const data = await this.build(kind, plan);
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  async build(kind, plan) {
    const { slimDevice } = require('./EnergyHub');
    const devices = Object.values(await this.api.devices.getDevices()).map(slimDevice);
    const config = this.app.energyConfig();
    const found = discover(devices, config.devices || {});
    const now = Date.now();
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const start = from.getTime();
    // Some devices report under another name, such as measure_power.in on a heat pump
    const powerOf = async (list, cap) => Promise.all(list.map((d) => this.today(d.id, cap || powerCapability(d) || 'measure_power').catch(() => [])));
    const out = { kind, from: start, now };
    if (kind === 'solar') {
      const lists = await powerOf(found.solar);
      out.curve = curve(lists.map((l) => l.map((e) => ({ t: e.t, v: Math.abs(e.v) }))), start, now);
      out.kWh = Math.round(lists.reduce((s, l) => s + energyOf(l.map((e) => ({ t: e.t, v: Math.abs(e.v) })), now).in, 0) * 100) / 100;
      out.forecast = await this.solarForecast(devices, plan).catch((err) => ({ error: err.message }));
    } else if (kind === 'battery') {
      const lists = await Promise.all(found.batteries.map((d) => this.batteryToday(d, config.battery).catch(() => [])));
      out.curve = curve(lists, start, now);
      const e = lists.map((l) => energyOf(l, now));
      out.charged = Math.round(e.reduce((s, x) => s + x.in, 0) * 100) / 100;
      out.discharged = Math.round(e.reduce((s, x) => s + x.out, 0) * 100) / 100;
      out.soc = curve(await powerOf(found.batteries, 'measure_battery'), start, now).map((p) => ({ t: p.t, w: p.w === null ? null : Math.round(p.w / found.batteries.length) }));
    } else if (kind === 'grid' && found.p1) {
      const [list] = await powerOf([found.p1]);
      out.curve = curve([list], start, now);
      const e = energyOf(list, now);
      out.imported = e.in; out.exported = e.out;
      Object.assign(out, await this.moneyToday().catch(() => null));
    } else if (kind === 'car') {
      const lists = await powerOf(found.evChargers);
      out.curve = curve(lists, start, now);
      out.kWh = Math.round(lists.reduce((s, l) => s + energyOf(l, now).in, 0) * 100) / 100;
    } else if (kind === 'heatpump' || kind === 'airco') {
      const list = kind === 'heatpump' ? found.heating : devices.filter((d) => classOf(d) === 'airconditioning');
      const lists = await powerOf(list);
      out.curve = curve(lists, start, now);
      out.kWh = Math.round(lists.reduce((s, l) => s + energyOf(l, now).in, 0) * 100) / 100;
    }
    return out;
  }

  // A battery as positive while charging: from one power, or from one for charging and one for supplying, the right way round.
  async batteryToday(device, cfg) {
    const caps = batteryPowerCapabilities(device);
    if (!caps) return [];
    if (caps.net) {
      const sign = invertedPower(device, cfg || {}) ? -1 : 1;
      return (await this.today(device.id, caps.net)).map((e) => ({ t: e.t, v: e.v * sign }));
    }
    const [charge, discharge] = await Promise.all([caps.charge, caps.discharge].map((c) => (c ? this.today(device.id, c) : [])));
    return charge.map((e) => ({ t: e.t, v: Math.abs(e.v) })).concat(discharge.filter((e) => e.v !== 0).map((e) => ({ t: e.t, v: -Math.abs(e.v) }))).sort((a, b) => a.t - b.t);
  }

  // Prices of now from the price service of the Energy logic: light, and whatever blocks the Energy page shows.
  async pricesNow() {
    const engine = this.app.energyEngine;
    if (!engine) return null;
    const cfg = engine.getConfig();
    const allIn = allInFunction(contractFrom(cfg), await engine.prices.homeyTariff().catch(() => null));
    const prices = await engine.prices.get(cfg.prices, { allIn }).catch(() => null);
    if (!prices) return { price: null, avg: null, cheapest: null, currency: null };
    return { price: typeof prices.current === 'number' ? prices.current : null, avg: typeof prices.avg === 'number' ? prices.avg : null, cheapest: prices.cheapest || null, currency: await engine.getCurrency(cfg) };
  }

  // Today's costs on top, for the page of the grid (not when the sister app keeps them).
  async moneyToday() {
    const engine = this.app.energyEngine;
    if (!engine) return null;
    const [now, today] = await Promise.all([this.pricesNow(), engine.getHistory('today')]);
    const totals = today.totals || {};
    const number = (v) => (typeof v === 'number' ? v : null);
    return { ...now, gasToday: number(totals.gas), waterToday: number(totals.water), cost: number(totals.cost) };
  }

  // Expected kWh of today and tomorrow, for the advice.
  async dayForecast(plan) {
    // Forecast.Solar allows only a few questions an hour
    if (this.daily && Date.now() - this.daily.at < 30 * 60000) return this.daily.data;
    const data = await this.readDayForecast(plan);
    this.daily = { at: Date.now(), data };
    return data;
  }

  async readDayForecast(plan) {
    const { slimDevice } = require('./EnergyHub');
    const devices = Object.values(await this.api.devices.getDevices()).map(slimDevice);
    if (!discover(devices, this.app.energyConfig().devices || {}).solar.length) return null;
    const data = await this.solarForecast(devices, plan);
    if (!data || !data.days) return null;
    const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    return { today: data.days[key(Date.now())] ?? null, tomorrow: data.days[key(Date.now() + 86400000)] ?? null };
  }

  // The PV Forecast app when it is there, else Forecast.Solar for the roof of the house view.
  async solarForecast(devices, plan) {
    const pv = pvForecastDays(devices);
    if (pv) return { source: 'pvforecast', days: pv.days, watts: [] };
    // Forecast.Solar is told where the house is: only when chosen on the Energy page or in the editor
    const own = this.app.energyConfig().forecast;
    const onEnergyPage = !!(own && own.enabled && own.planes && own.planes.length);
    if (!onEnergyPage && !house.settings(plan).forecast) return null;
    const round = (v) => Math.round(v * 100) / 100; // about a kilometre is close enough for the sun
    const lat = round(this.app.homey.geolocation.getLatitude());
    const lon = round(this.app.homey.geolocation.getLongitude());
    const planes = onEnergyPage ? own.planes : solarPlanes(plan);
    const data = await this.forecast.get({ lat, lon, planes });
    return data ? { source: 'forecast.solar', planes, days: data.days, watts: data.watts } : null;
  }

}

module.exports = { EnergyDetails, curve, energyOf, solarPlanes };
