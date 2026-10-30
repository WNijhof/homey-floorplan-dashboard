// Copied from Energy Dashboard (homey-app/app.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

const crypto = require('crypto');
const fs = require('fs');

const {
  PERIODS, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard, layoutName, savedLayout, historyCsv, buildZoneFlow, consumptionDevices, nettingSummary,
  expectedSolar, estimatedDevices, gridPower, timelineDay, recordTimeline, buildLiveAt, buildGroups, buildPhases, hasUsageEstimate, isCopy, isGridMeter, consumerStatus,
  collectNights, pruneNights, batteryAdvice, nightSource, lastNight, meterCapabilities,
  billForecast, meterTotals, heatDue, collectHeat, pruneHeat, heatmapDays, localDate, HEAT_VERSION,
  mergeNights, tankReading, tankSensors, showerSample, measuredFlow, recordTapwater, withoutShower, connectionMaxW, importMeterExport, UploadParts, batteryViews, lastYearMonths, monthTotals, batteryDirection,
} = require('./energy');
const { PriceService, currencySymbol } = require('./prices');
const { ForecastService, recordForecast, totalKwp, pvForecastDays } = require('./forecast');
const { WeatherService } = require('./weather');
const { AlertMonitor, buildAlerts, recordBaseload } = require('./alerts');
const { contractFrom, allInFunction, describeTariff, isLow, dynamicGas, SUPPLIERS } = require('./tariffs');
const { Co2Service, co2Summary, countryOf } = require('./co2');
const { PeakTracker, peakSummary } = require('./peak');
const { TapTracker, tapSummary, replayTaps, mergeTaps, tapCsv } = require('./tapcheck');
const { EnergyServer: WebServer } = require('../EnergyServer');
const {
  fingerprint, validLog, emptyLog, recordDay, recordMonths, pruneLog, composeHistory, logCsv, missingDays,
} = require('./historylog');

const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
// The app's own history (lib/historylog.js), in a file because it outgrows the settings
const HISTORY_FILE = '/userdata/history.json';
// The app's logs that a backup holds; the settings themselves (contract, PIN, access code) stay out
const BACKUP_KEYS = ['nightLog', 'nightImport', 'heatLog', 'peakLog', 'forecastLog', 'baseloadLog', 'monthTotals', 'showerLog', 'tapLog', 'tapwaterLog'];
const LOGS_CACHE_TTL = 10 * 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;
// The settings page on the web: how long a right PIN lasts, and what it can never change
const SETTINGS_TOKEN_TTL = 12 * 3600 * 1000;
const WEB_HIDDEN_SETTINGS = ['port', 'accessCode', 'editPin'];
// How often the log of nights is read again while last night is still missing
const NIGHTS_RETRY = 60 * 60 * 1000;
// A log of an older version is filled in once more: version 2 reads Homey Energy's day reports
const NIGHT_LOG_VERSION = 2;
const ZONES_CACHE_TTL = 10 * 60 * 1000;
const CONTACT_EMAIL = 'drpeppers@duck.com';
const NETTING_CACHE_TTL = 60 * 60 * 1000;
const ENERGY_LIVE_TTL = 5 * 1000;
const ENERGY_LIVE_WAIT = 2 * 1000;
// A day of Insights for looking back: today gets a new step every 5 minutes, yesterday is done
const TIMELINE_TTL = { today: 2 * 60 * 1000, yesterday: 30 * 60 * 1000 };
const TIMELINE_FRESH = 30 * 1000;
// How long a live answer waits for something slow before going without it (null)
const LIVE_WAIT = 1500;
const soon = promise => Promise.race([
  Promise.resolve(promise).catch(() => null),
  new Promise(resolve => setTimeout(() => resolve(null), LIVE_WAIT)),
]);

// Prices can come from the app Power by the Hour (see lib/prices.js). Its earlier prices are read
// from Insights, in the finest resolution that reaches back far enough.
const POWERHOUR_APP = 'com.gruijter.powerhour';
// Sister apps with a dashboard web page of their own; the pages show a switch to each one that is installed
const SIBLINGS = [
  { appId: 'com.drpeppers.floorplandashboard', key: 'home', icon: '🏠', name: { en: 'Home', nl: 'Huis' } },
];
const SIBLINGS_CACHE_TTL = 60 * 1000;
const HOUR = 3600 * 1000;
const POWERHOUR_RESOLUTIONS = [
  [24 * HOUR, 'last24Hours'], [7 * 24 * HOUR, 'last7Days'], [31 * 24 * HOUR, 'last31Days'],
  [92 * 24 * HOUR, 'last3Months'], [183 * 24 * HOUR, 'last6Months'],
];

// 8080 is used by much other software; installs from before 0.2.4 keep it, see keepOldPort()
const OLD_PORT = 8080;

const DEFAULTS = {
  port: 8686,
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '', count: {} },
  boiler: { liters: 80, coldWaterTemp: null, showerTemp: 40, showerFlow: 8, warmFrom: 50, topSensor: '', bottomSensor: '', calibrate: false, valve: false, tapCheck: false, tapCheckSince: '', tapCheckPower: '' },
  battery: { invertPower: false },
  grid: { fuseAmps: 25, capacityTariff: null, capacityMin: 2.5 },
  // currency: '' follows Homey Energy, else a code such as 'SEK' chosen in the settings
  prices: { source: 'auto', currency: '' },
  tariffs: {},
};

function slimDevice(d) {
  const capabilitiesObj = {};
  for (const [id, cap] of Object.entries(d.capabilitiesObj || {})) capabilitiesObj[id] = { value: cap?.value ?? null };
  return {
    id: d.id,
    name: d.name,
    class: d.class,
    virtualClass: d.virtualClass,
    // The app and driver, e.g. homey:app:com.tweakers.zendure:zendure, for the diagnosis
    driverId: d.driverId || d.driverUri || null,
    zone: d.zone,
    available: d.available,
    capabilities: d.capabilities || [],
    capabilitiesObj,
    energyObj: d.energyObj || null,
    // What the user set for Energy in Homey (such as excluding the device), for the diagnosis:
    // it is not in energyObj
    energy: d.energy || null,
    energySettings: Object.fromEntries(Object.entries(d.settings || {}).filter(([key]) => /energy/i.test(key))),
    flags: d.flags || [],
  };
}

// A named layout set back to "default" keeps its own copy of the automatic layout
function defaultLayoutFor(saved) {
  return Array.isArray(saved.layout) && saved.layout.length ? saved.layout : null;
}

class EnergyDashboardApp {

  async onInit() {
    // Apps run in UTC; days, hours and "last night" must follow the time zone of the Homey
    process.env.TZ = this.homey.clock.getTimezone();
    this.devicesCache = { at: 0, devices: null };
    this.logsCache = { at: 0, ids: null };
    this.baseloadCache = { at: 0, data: null };
    this.historyCache = new Map();
    this.timelineCache = new Map();
    this.zonesCache = { at: 0, names: null };
    this.energyLiveCache = { at: 0, report: null };
    // Prices from Homey Energy, or EnergyZero; see lib/prices.js
    this.prices = new PriceService({
      log: this.log.bind(this),
      source: () => this.getConfig().prices.source,
      homey: {
        prices: async date => (await this.getApi()).energy.fetchDynamicElectricityPrices({ date }),
        userCosts: async () => (await this.getApi()).energy.getDynamicElectricityPriceUserCosts(),
        priceType: async () => (await this.getApi()).energy.getElectricityPriceType(),
        fixedPrice: async () => (await this.getApi()).energy.getOptionElectricityPriceFixed(),
        currency: async () => (await this.getApi()).energy.getCurrency(),
      },
      powerhour: {
        installed: () => this.homey.api.getApiApp(POWERHOUR_APP).getInstalled(),
        prices: () => this.homey.api.getApiApp(POWERHOUR_APP).get('/dap-prices'),
        history: (device, from, now) => this.powerhourHistory(device, from, now),
      },
    });
    // The monthly peak for the Belgian capacity tariff, measured once a minute
    this.peakTracker = new PeakTracker(this.homey.settings.get('peakLog') || {});
    this.homey.setTimeout(() => this.seedPeak().catch(err => this.error(`Peak: ${err.message}`)), 30 * 1000);
    this.forecast = new ForecastService({ log: this.log.bind(this) });
    this.weather = new WeatherService({ log: this.log.bind(this) });
    this.co2 = new Co2Service({ log: this.log.bind(this) });
    this.pinGuard = new PinGuard();

    this.keepOldPort();
    this.webServer = new WebServer({ app: this, log: this.log.bind(this), error: this.error.bind(this) });
    await this.webServer.start(this.getConfig().port);

    // Once a minute: which devices are on, for the warnings (and their notifications)
    this.alertMonitor = new AlertMonitor();
    this.notified = new Map();
    this.homey.setInterval(() => this.checkAlerts().catch(err => this.error(`Alerts: ${err.message}`)), 60 * 1000);

    // Opt-in: a button in the shower marks the start and the end, which calibrates the shower head
    this.homey.flow.getActionCard('shower-start').registerRunListener(() => this.showerStart());
    this.homey.flow.getActionCard('shower-stop').registerRunListener(() => this.showerStop());
    // Opt-in (boiler setting "valve"): a Flow that switches a three-way valve tells where hot tap water comes from now
    this.homey.flow.getActionCard('tapwater-source').registerRunListener(args => this.tapwaterSource(args));
    // Opt-in (boiler setting "tapCheck"): does the gas boiler fire when hot tap water is drawn
    this.tapTracker = new TapTracker(this.homey.settings.get('tapLog') || {});
    this.homey.setInterval(() => this.trackTaps().catch(err => this.error(`Tap check: ${err.message}`)), 30 * 1000);

    // A tag per group in the fuse box (load in % of its fuse, and watts), for Flows
    this.groupTokens = new Map();
    this.homey.setInterval(() => this.updateGroupTokens().catch(err => this.error(`Group tags: ${err.message}`)), 30 * 1000);
    this.homey.setTimeout(() => this.updateGroupTokens().catch(err => this.error(`Group tags: ${err.message}`)), 10 * 1000);
    // And tags for the whole house
    this.houseTokens = new Map();
    this.homey.setInterval(() => this.updateHouseTokens().catch(err => this.error(`House tags: ${err.message}`)), 30 * 1000);
    this.homey.setTimeout(() => this.updateHouseTokens().catch(err => this.error(`House tags: ${err.message}`)), 15 * 1000);

    // The app's own history: yesterday's hours after midnight, the finished months once
    this.historyLog = this.readHistoryLog();
    this.homey.setInterval(() => this.keepHistory().catch(err => this.error(`History log: ${err.message}`)), 3600 * 1000);
    this.homey.setTimeout(() => this.keepHistory().catch(err => this.error(`History log: ${err.message}`)), 3 * 60 * 1000);

    // The log of nights for the battery size block grows also when no screen is open: Homey
    // Energy keeps the day reports it is read from for only a month
    this.homey.setInterval(() => this.keepNights().catch(err => this.error(`Nights: ${err.message}`)), 6 * 3600 * 1000);
    this.homey.setTimeout(() => this.keepNights().catch(err => this.error(`Nights: ${err.message}`)), 2 * 60 * 1000);

    // New settings can change the port, the devices and the prices
    // Only the settings themselves; the app's own logs are kept in other keys
    this.homey.settings.on('set', key => {
      if (key !== 'config') return;
      this.historyCache.clear();
      this.timelineCache.clear();
      this.prices.homeyInfo = null;
      this.baseloadCache = { at: 0, data: null };
      this.nettingCache = null;
      this.billCache = null;
      this.slowTokens = null;
      this.webServer.start(this.getConfig().port).catch(this.error);
    });
  }

  // The default port was 8080 until 0.2.4. An install that ran before has settings of its own
  // (at least the peak log), and keeps that port so its bookmarks and tablets keep working
  keepOldPort() {
    const saved = this.homey.settings.get('config');
    if (saved?.port || !this.homey.settings.getKeys().length) return;
    this.homey.settings.set('config', { ...saved, port: OLD_PORT });
  }

  async onUninit() {
    await this.webServer?.stop();
  }

  // Access to the Homey Web API, to read devices and Insights of other apps
  async getApi() {
    if (!this.apiPromise) {
      this.apiPromise = this.createApi().catch(err => {
        this.apiPromise = null;
        throw err;
      });
    }
    return this.apiPromise;
  }

  getConfig() {
    const saved = this.homey.settings.get('config') || {};
    // Before the choice of source, the settings saved "energyzero" for every price block that was
    // on; only a source chosen in the new list counts as a choice, else Homey or EnergyZero follows
    const prices = { ...DEFAULTS.prices, ...saved.prices };
    if (prices.source === 'energyzero' && !prices.chosen) prices.source = 'auto';
    return {
      port: Number(saved.port) || DEFAULTS.port,
      devices: { ...DEFAULTS.devices, ...saved.devices },
      boiler: this.boilerConfig(saved.boiler),
      battery: { ...DEFAULTS.battery, ...saved.battery },
      grid: { ...DEFAULTS.grid, ...saved.grid },
      prices,
      // Homey has prices that fill in an empty contract, as far as known (for the default layout)
      homeyPrices: Boolean(this.prices?.homeyInfo?.data?.allIn || this.prices?.homeyInfo?.data?.fixed),
      tariffs: { ...DEFAULTS.tariffs, ...saved.tariffs },
      contract: saved.contract || null,
      forecast: { enabled: false, planes: [], ...saved.forecast },
      layout: Array.isArray(saved.layout) && saved.layout.length ? saved.layout : null,
      layouts: saved.layouts && typeof saved.layouts === 'object' ? saved.layouts : {},
      editPin: saved.editPin || '',
      accessCode: saved.accessCode || '',
      alerts: { hours: 4, notify: false, ...saved.alerts },
      groups: Array.isArray(saved.groups) ? saved.groups : [],
      groupsSolarPhases: Array.isArray(saved.groupsSolarPhases) ? saved.groupsSolarPhases : [],
      groupsBatteryPhases: Array.isArray(saved.groupsBatteryPhases) ? saved.groupsBatteryPhases : [],
      groupsExtra: Array.isArray(saved.groupsExtra) ? saved.groupsExtra : [],
    };
  }

  // ---------- Layout editing from the dashboard ----------

  async getLayoutInfo(name = '') {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const layout = layoutName(name);
    return {
      blocks: blockCatalog(),
      name: layout,
      names: Object.keys(cfg.layouts),
      layout: resolveLayout(savedLayout(cfg, layout), found, cfg),
      defaultLayout: defaultLayout(found, cfg),
      customLayout: Boolean(savedLayout(cfg, layout)),
      pinRequired: Boolean(cfg.editPin),
    };
  }

  // Saves the default layout, or a named one; `remove` deletes a named layout
  async saveLayout({ layout, pin, name, remove }) {
    this.pinGuard.check(this.getConfig().editPin, pin);
    const saved = this.homey.settings.get('config') || {};
    const target = layoutName(name);
    if (target) {
      const layouts = { ...(saved.layouts || {}) };
      if (remove) delete layouts[target];
      else layouts[target] = validateLayout(layout) || defaultLayoutFor(saved);
      this.homey.settings.set('config', { ...saved, layouts });
      return this.getLayoutInfo(remove ? '' : target);
    }
    this.homey.settings.set('config', { ...saved, layout: validateLayout(layout) });
    return this.getLayoutInfo();
  }

  // All devices, as small copies with only what the dashboard reads: the full device objects of
  // homey-api carry titles, units and options of every capability, which would stay in memory.
  // Screens asking at the same moment share one request.
  async getDevices() {
    if (this.devicesCache.devices && Date.now() - this.devicesCache.at <= DEVICES_CACHE_TTL) return this.devicesCache.devices;
    if (!this.devicesPending) {
      this.devicesPending = (async () => {
        const api = await this.getApi();
        const devices = Object.values(await api.devices.getDevices()).map(slimDevice);
        this.devicesCache = { at: Date.now(), devices };
        return devices;
      })().finally(() => { this.devicesPending = null; });
    }
    return this.devicesPending;
  }

  async getLogIds() {
    if (!this.logsCache.ids || Date.now() - this.logsCache.at > LOGS_CACHE_TTL) {
      const api = await this.getApi();
      const logs = await api.insights.getLogs();
      this.logsCache = { at: Date.now(), ids: new Set(Object.values(logs).map(log => log.id)) };
    }
    return this.logsCache.ids;
  }

  // A Homey Energy report for the devices per period; `request` comes from reportRequest()
  async energyReport(request) {
    const energy = (await this.getApi()).energy;
    if (request.kind === 'day') return energy.getReportDay({ date: request.date });
    if (request.kind === 'week') return energy.getReportWeek({ isoWeek: request.isoWeek });
    if (request.kind === 'month') return energy.getReportMonth({ yearMonth: request.yearMonth });
    return energy.getReportYear({ year: request.year });
  }

  // Homey Energy's live report, for devices with an estimated use; shared by screens asking at once.
  // The page waits for it at most 2 seconds and otherwise uses the last one: a slow Energy
  // manager should not hold up the whole dashboard (homey-api itself only gives up after 10 s).
  async getEnergyLive() {
    if (Date.now() - this.energyLiveCache.at <= ENERGY_LIVE_TTL) return this.energyLiveCache.report;
    if (!this.energyLivePending) {
      this.energyLivePending = (async () => {
        const report = await (await this.getApi()).energy.getLiveReport({}).catch(() => null);
        this.energyLiveCache = { at: Date.now(), report };
        return report;
      })().finally(() => { this.energyLivePending = null; });
    }
    return Promise.race([this.energyLivePending, new Promise(r => setTimeout(() => r(this.energyLiveCache.report), ENERGY_LIVE_WAIT))]);
  }

  async getEstimated(devices, found) {
    return estimatedDevices(await this.getEnergyLive(), devices, found);
  }

  // ---------- Monthly peak ----------

  // A new installation starts with the quarter hours of yesterday and today from Insights
  async seedPeak() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    if (!found.p1) return;
    const read = resolution => (device, capability) => this.getEntries(device.id, capability, resolution).catch(() => []);
    const entries = [...await gridPower(found.p1, read('yesterday'), cfg), ...await gridPower(found.p1, read('today'), cfg)];
    if (this.peakTracker.seed(entries)) this.homey.settings.set('peakLog', this.peakTracker.log);
  }

  getPeak(found, cfg) {
    return peakSummary({ tracker: this.peakTracker, p1: found.p1, grid: cfg.grid });
  }

  // The grid power of this minute for the monthly peak, and the meter's own peak when it has one
  trackPeak(found) {
    const p1 = found.p1;
    if (!p1) return;
    const meter = peakSummary({ tracker: null, p1, grid: {} });
    let changed = this.peakTracker.add(p1.capabilitiesObj?.measure_power?.value);
    if (meter?.source === 'meter' && this.peakTracker.recordMeter(meter.peakW)) changed = true;
    if (changed) this.homey.settings.set('peakLog', this.peakTracker.log);
  }

  // Insights entries of a device capability as [{ t: Date, v: number }] (true or false for
  // on/off), or [] without a log
  // Earlier prices of a Power by the Hour price device, from its Insights: its current price
  // (meter_price_h0) and export price, in the finest resolution that still reaches back to `from`
  async powerhourHistory(device, from, now) {
    const own = (await this.getDevices()).filter(d => String(d.driverId || '').startsWith(`homey:app:${POWERHOUR_APP}:${device.driverType}`));
    const homeyDevice = own.find(d => d.name === device.name) || own[0];
    if (!homeyDevice) return [];
    const age = now - from;
    const resolution = POWERHOUR_RESOLUTIONS.find(([span]) => age <= span)?.[1] || 'last2Years';
    const [prices, exports] = await Promise.all([
      this.getEntries(homeyDevice.id, 'meter_price_h0', resolution).catch(() => []),
      this.getEntries(homeyDevice.id, 'meter_price_h0_export', resolution).catch(() => []),
    ]);
    const exportAt = new Map(exports.map(e => [e.t.getTime(), e.v]));
    return prices
      .filter(e => typeof e.v === 'number' && e.t.getTime() < now)
      .map(e => ({ t: e.t.getTime(), price: e.v, exportPrice: typeof exportAt.get(e.t.getTime()) === 'number' ? exportAt.get(e.t.getTime()) : null }));
  }

  async getEntries(deviceId, capability, resolution) {
    const id = `homey:device:${deviceId}:${capability}`;
    if (!(await this.getLogIds()).has(id)) return [];
    const entries = await this.readLog(id, resolution);
    // Some Homeys answer 'today' with no entries while last24Hours has them (a user's group day
    // bars stayed empty, forum NL #126): then today's part of the last 24 hours
    if (resolution !== 'today' || entries.length) return entries;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return (await this.readLog(id, 'last24Hours')).filter(entry => entry.t >= midnight);
  }

  async readLog(id, resolution) {
    const api = await this.getApi();
    const result = await api.insights.getLogEntries({ id, resolution });
    return (result?.values || [])
      .filter(entry => typeof entry.v === 'number' || typeof entry.v === 'boolean')
      .map(entry => ({ t: new Date(entry.t), v: entry.v }));
  }

  // ---------- Widget ----------

  // Room names by zone id; rooms rarely change, so they are read every ten minutes
  async getZoneNames() {
    if (!this.zonesCache.names || Date.now() - this.zonesCache.at > ZONES_CACHE_TTL) {
      const api = await this.getApi();
      const names = {};
      for (const zone of Object.values(await api.zones.getZones())) names[zone.id] = zone.name;
      this.zonesCache = { at: Date.now(), names };
    }
    return this.zonesCache.names;
  }

  // The power of this moment, for the Energy now widget: a few numbers, drawn by the widget
  // With today's totals, for the widget's "today" view (null while the history is being built)
  async getWidgetNow() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const live = buildLive(devices, discover(devices, cfg.devices), cfg);
    const today = await Promise.race([this.getHistory('today').catch(() => null), new Promise(r => setTimeout(r, 1500))]);
    return {
      solarW: live.solarW,
      gridW: live.gridW,
      homeW: live.homeW,
      batteryW: live.battery ? live.battery.watts : null,
      soc: live.battery?.soc ?? null,
      flows: live.flows,
      today: todayTotals(today?.totals),
    };
  }

  // The load per group in the fuse box, per phase with the rest, for the Groups widget
  async getWidgetGroups() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg, { estimated: await this.getEstimated(devices, found).catch(() => []) });
    return live.groups || { groups: [], phases: [] };
  }

  // The live flow from sources through rooms to devices, for the Energy flows widget
  async getWidgetFlow({ perZone = 3 } = {}) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg);
    if (live.homeW === null) return { nodes: [], links: [], homeW: null, error: 'noP1' };
    const zoneOf = new Map(devices.map(d => [d.id, d.zone]));
    const powered = consumptionDevices(devices, found, 'measure_power')
      .map(d => ({ id: d.id, name: d.name, zone: d.zone, value: d.capabilitiesObj.measure_power?.value }))
      .filter(d => typeof d.value === 'number' && d.value > 0)
      .concat((await this.getEstimated(devices, found).catch(() => []))
        .map(d => ({ id: d.id, name: `≈ ${d.name}`, zone: zoneOf.get(d.id), value: d.watts })));
    const flow = buildZoneFlow({
      solarW: live.solarW || 0,
      gridW: live.gridW || 0,
      batteryW: live.battery ? live.battery.watts : 0,
      homeW: live.homeW,
      flows: live.flows,
    }, powered, await this.getZoneNames(), { perZone: Math.max(0, Math.min(8, Number(perZone) || 0)) });
    return { ...flow, solarW: live.solarW, gridW: live.gridW, updated: live.updated };
  }

  // A day of Insights of every device, for looking back (see recordTimeline). Several screens
  // share one reading; at midnight today's becomes yesterday's, so the date is part of the key.
  getTimeline(day, devices, found, cfg, { fresh = false } = {}) {
    const key = `${day}:${new Date().toDateString()}`;
    const cached = this.timelineCache.get(key);
    // A fresh reading (for a moment after the last one) is shared too, and made at most every 30 s
    if (cached && Date.now() - cached.at < (fresh ? TIMELINE_FRESH : TIMELINE_TTL[day])) return cached.data;
    for (const k of this.timelineCache.keys()) if (!k.endsWith(new Date().toDateString())) this.timelineCache.delete(k);
    const read = (device, capability) => this.getEntries(device.id, capability, day).catch(() => []);
    const data = recordTimeline(read, devices, found, cfg, day);
    this.timelineCache.set(key, { at: Date.now(), data });
    data.catch(() => {
      if (this.timelineCache.get(key)?.data === data) this.timelineCache.delete(key);
    });
    return data;
  }

  // The live dashboard at an earlier moment `at` (milliseconds) of today or yesterday
  async getLiveAt(devices, found, cfg, at) {
    const day = timelineDay(Number(at));
    if (!day) throw Object.assign(new Error('Alleen vandaag en gisteren kun je terugkijken'), { status: 400 });
    const [history, recording] = await Promise.all([this.getHistory(day).catch(() => null), this.getTimeline(day, devices, found, cfg)]);
    const power = history?.power;
    let live = buildLiveAt(recording, devices, found, cfg, Number(at), power);
    // A moment after the last reading of today: read again
    if (!live && day === 'today') live = buildLiveAt(await this.getTimeline(day, devices, found, cfg, { fresh: true }), devices, found, cfg, Number(at), power);
    if (!live) throw Object.assign(new Error('Geen gegevens van dat moment'), { status: 404 });
    return live;
  }

  async getLive(name = '', at = null) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const view = { ...cfg, layout: savedLayout(cfg, layoutName(name)) };
    const live = at
      ? await this.getLiveAt(devices, found, view, at)
      : buildLive(devices, found, view, { estimated: await this.getEstimated(devices, found).catch(() => []) });
    live.version = this.homey.manifest.version;
    live.currency = await this.getCurrency(cfg);
    // Roughly where the Homey is, for a screen that turns dark from sunset to sunrise
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    if (typeof lat === 'number' && typeof lon === 'number') live.place = { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
    const shown = new Set(live.layout.map(b => b.id));

    // Today's totals for the live diagram. The history is cached; while it is being built
    // (the first time, which can take a while) the diagram shows without them. Looking back,
    // buildLiveAt() gave the totals up to that moment.
    let today = null;
    if (!at) {
      today = await Promise.race([this.getHistory('today').catch(() => null), new Promise(r => setTimeout(r, 1500))]);
      live.today = todayTotals(today?.totals);
    }
    // Base load and net metering read a lot of Insights the first time (a year for net
    // metering): the dashboard does not wait for that, the blocks fill on a later poll
    if (shown.has('baseload')) live.baseload = await soon(this.getBaseload(found, cfg));
    if (shown.has('batterysize')) live.batterysize = this.getBatterySize(found, cfg);
    if (shown.has('netting')) live.netting = await soon(this.getNetting());
    if (shown.has('bill')) live.bill = await soon(this.getBill(cfg));
    if (shown.has('heatmap')) live.heatmap = this.getHeatmap(found, today);
    if (shown.has('peak')) live.peak = this.getPeak(found, cfg);
    // Where hot tap water comes from is about now; looking back leaves it out
    const tapwater = !at && cfg.boiler.valve && this.homey.settings.get('tapwaterLog');
    if (tapwater?.source) live.heating = { devices: [], thermostat: null, ...live.heating, tapwater };
    if (!at && cfg.boiler.tapCheck) {
      const tapcheck = tapSummary(this.tapTracker.events, { warmFrom: cfg.boiler.warmFrom, since: cfg.boiler.tapCheckSince });
      live.heating = { devices: [], thermostat: null, ...live.heating, tapcheck };
    }
    // The contract, for the explanation of the amounts in the cost blocks
    live.tariff = describeTariff(contractFrom(cfg), await this.prices.homeyTariff().catch(() => null));
    // Warnings are about now; looking back leaves them out
    if (shown.has('alerts') && !at) live.alerts = await this.getAlerts(found, cfg, 'nl').catch(() => []);
    if (shown.has('prices')) {
      const allIn = allInFunction(contractFrom(cfg), await this.prices.homeyTariff().catch(() => null));
      live.prices = await this.prices.get(cfg.prices, { allIn }).catch(err => ({ error: err.message }));
      // With a dynamic gas contract also the gas price of today (and of the next gas day)
      const gas = await soon(dynamicGas(contractFrom(cfg), this.prices));
      if (gas && live.prices && !live.prices.error) live.prices.gas = gas;
    }
    if (shown.has('co2')) {
      const country = countryOf(this.homey.clock.getTimezone());
      live.co2 = country ? co2Summary(await soon(this.co2.points(country)) || [], { rows: today?.rows, country }) : { country: null };
    }
    return live;
  }

  // The end of net metering, from last year (or this year while last year has too little data).
  // Calculated at most once an hour; the first time reads a year of Insights and prices.
  // While it is calculated again the previous result is returned.
  async getNetting() {
    if (this.nettingCache && Date.now() - this.nettingCache.at < NETTING_CACHE_TTL) return this.nettingCache.data;
    if (!this.nettingPending) {
      this.nettingPending = (async () => {
        const last = await this.getHistory('lastYear', { light: true }).catch(() => null);
        const lastSummary = nettingSummary(last, 'lastYear');
        const data = lastSummary.months >= 10 && lastSummary.extra !== null
          ? lastSummary
          : nettingSummary(await this.getHistory('year', { light: true }).catch(() => null), 'year');
        this.nettingCache = { at: Date.now(), data };
        return data;
      })().finally(() => { this.nettingPending = null; });
      this.nettingPending.catch(err => this.error(`Netting: ${err.message}`));
    }
    return this.nettingCache ? this.nettingCache.data : this.nettingPending;
  }

  // The yearly bill against the advance payments, from the months of this year and last year.
  // Like net metering: at most once an hour, the previous result while it is calculated again.
  async getBill(cfg) {
    if (this.billCache && Date.now() - this.billCache.at < NETTING_CACHE_TTL) return this.billCache.data;
    if (!this.billPending) {
      this.billPending = (async () => {
        const [last, year] = await Promise.all([
          this.getHistory('lastYear', { light: true }).catch(() => null),
          this.getHistory('year', { light: true }).catch(() => null),
        ]);
        const found = discover(await this.getDevices(), cfg.devices);
        const data = billForecast([...(last?.rows || []), ...(year?.rows || [])], contractFrom(cfg), new Date(), meterTotals(found.p1));
        this.billCache = { at: Date.now(), data };
        return data;
      })().finally(() => { this.billPending = null; });
      this.billPending.catch(err => this.error(`Bill: ${err.message}`));
    }
    return this.billCache ? this.billCache.data : this.billPending;
  }

  // Energy per hour over the last 4 weeks. Completed days come from Homey Energy's day reports
  // and are kept in the settings (they do not change); today comes from today's history. Missing
  // days are read in the background, the block shows what the log holds so far. Yesterday
  // without a usable report comes from yesterday's history per hour (the meter readings).
  getHeatmap(found, today) {
    const source = nightSource(found);
    const stored = this.homey.settings.get('heatLog');
    const valid = log => log?.source === source && log.version === HEAT_VERSION;
    const log = valid(stored) ? stored.days || {} : {};
    const due = heatDue(log);
    if (found.p1 && due.length && !this.heatPending && Date.now() - (this.heatTried || 0) > 10 * 60 * 1000) {
      this.heatTried = Date.now();
      const now = new Date();
      const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      const meterDay = async date => (date === yesterday ? (await this.getHistory('yesterday', { light: true }))?.rows : null);
      this.heatPending = collectHeat(date => this.energyReport({ kind: 'day', date }), found, due, now, { place: this.getPlace(), meterDay })
        .then(fresh => {
          const current = this.homey.settings.get('heatLog');
          const days = valid(current) ? current.days || {} : {};
          this.homey.settings.set('heatLog', { source, version: HEAT_VERSION, days: pruneHeat({ ...days, ...fresh }) });
        })
        .catch(err => this.error(`Heat map: ${err.message}`))
        .finally(() => { this.heatPending = null; });
    }
    return { days: heatmapDays(log, today), building: Boolean(this.heatPending), solar: found.solar.length > 0, battery: found.batteries.length > 0 };
  }

  // While it is calculated again the previous result is returned.
  async getBaseload(found, cfg) {
    if (Date.now() - this.baseloadCache.at > BASELOAD_CACHE_TTL && !this.baseloadPending) {
      this.baseloadPending = (async () => {
        const market = await this.prices.get({}).catch(() => null);
        const homey = await this.prices.homeyTariff().catch(() => null);
        this.baseloadCache = { at: Date.now(), data: await buildBaseload(this, found, cfg, market?.avg, homey) };
        // Kept per day, to notice when standby use rises
        const log = this.homey.settings.get('baseloadLog') || {};
        this.homey.settings.set('baseloadLog', recordBaseload(log, this.baseloadCache.data?.watts));
        return this.baseloadCache.data;
      })().finally(() => { this.baseloadPending = null; });
      this.baseloadPending.catch(err => this.error(`Baseload: ${err.message}`));
    }
    return this.baseloadCache.data || this.baseloadPending || null;
  }

  // Battery size: the use while dark per night, kept in the settings for a year. Nights that are
  // missing are read in the background (the first time from as far back as Homey has readings per
  // hour); the block shows what the log holds so far.
  getBatterySize(found, cfg) {
    const source = nightSource(found);
    const stored = this.homey.settings.get('nightLog');
    const log = stored?.source === source ? stored.nights || {} : {};
    const due = !log[lastNight()] || stored?.version !== NIGHT_LOG_VERSION;
    if (found.p1 && due && !this.nightsPending && Date.now() - (this.nightsTried || 0) > NIGHTS_RETRY) {
      this.nightsTried = Date.now();
      const read = (device, capability, resolution) => this.getEntries(device.id, capability, resolution).catch(() => []);
      // Where the Homey is, to know when the sun is down (inverters log nothing at night)
      const place = this.getPlace();
      // Saved after every batch of day reports too, so a restart halfway loses little
      const save = (fresh, version) => this.homey.settings.set('nightLog', { source, version, nights: pruneNights({ ...log, ...fresh }) });
      this.nightsPending = collectNights(read, found, cfg, log, new Date(), {
        place,
        dayReport: date => this.energyReport({ kind: 'day', date }),
        progress: fresh => save(fresh, stored?.version || 1),
      })
        .then(fresh => save(fresh, NIGHT_LOG_VERSION))
        .catch(err => this.error(`Nights: ${err.message}`))
        .finally(() => { this.nightsPending = null; });
    }
    // Homey Energy's month totals for the model, read once a day for months not kept yet
    // Version 2 counts consumption as import + solar - export; older totals are read again
    let months = this.homey.settings.get('monthTotals') || {};
    if (months.version !== 2) months = {};
    delete months.version;
    if (lastYearMonths().some(key => !(key in months)) && !this.monthsPending && Date.now() - (this.monthsTried || 0) > NIGHTS_RETRY) {
      this.monthsTried = Date.now();
      this.monthsPending = this.readMonthTotals(months)
        .catch(err => this.error(`Month totals: ${err.message}`))
        .finally(() => { this.monthsPending = null; });
    }
    const imported = this.homey.settings.get('nightImport');
    const { views, check, fit } = batteryViews(log, imported?.nights, months, { place: this.getPlace() });
    return {
      views,
      building: Boolean(this.nightsPending || this.monthsPending),
      check,
      fit,
      imported: imported ? { from: imported.from, to: imported.to, darkHeight: imported.darkHeight } : null,
    };
  }

  // The totals of the completed months of the last year from Homey Energy's month reports; a
  // month without a report is kept as null, so it is not asked for again
  async readMonthTotals(known) {
    const months = { ...known };
    const wanted = lastYearMonths();
    for (const key of wanted) {
      if (key in months) continue;
      months[key] = monthTotals(await this.energyReport({ kind: 'month', yearMonth: key }).catch(() => null));
    }
    for (const key of Object.keys(months)) if (!wanted.includes(key)) delete months[key];
    this.homey.settings.set('monthTotals', { ...months, version: 2 });
  }

  // Where the Homey is, to know when the sun is down
  getPlace() {
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
  }

  // A meter export from the settings page, in parts of text: kept until the last part is in,
  // then turned into nights (dark by the height of the sun, matched to the measured nights) and
  // saved as `nightImport`. Returns what was found, or the reason it could not be read.
  async importNightsPart(body) {
    this.nightUpload = this.nightUpload || new UploadParts();
    const csv = this.nightUpload.add(body);
    if (csv === null) return { received: Number(body.part) + 1, parts: Number(body.parts) };
    const cfg = this.getConfig();
    const found = discover(await this.getDevices(), cfg.devices);
    const stored = this.homey.settings.get('nightLog');
    const { record, summary } = importMeterExport(csv, {
      log: stored?.source === nightSource(found) ? stored.nights : {},
      place: this.getPlace(),
      maxW: connectionMaxW(cfg, found.p1),
    });
    this.homey.settings.set('nightImport', record);
    return summary;
  }

  async clearNightImport() {
    this.homey.settings.unset('nightImport');
    return { cleared: true };
  }

  // Fills in the log of nights when the battery size block is in any layout
  async keepNights() {
    const cfg = this.getConfig();
    const layouts = [cfg.layout, ...Object.values(cfg.layouts || {})].filter(Array.isArray);
    if (!layouts.some(layout => layout.some(b => b && b.id === 'batterysize'))) return;
    const devices = await this.getDevices();
    this.getBatterySize(discover(devices, cfg.devices), cfg);
  }

  // ---------- Settings on the web page ----------

  // The settings page also works on the dashboard's own web page (/instellingen), which can be
  // reachable from the internet. It always needs the edit PIN: a right PIN gives a token for 12
  // hours. Wrong PINs lock it for a minute, doubling each time up to a day. The port, access code
  // and PIN can only be changed in Homey, so no one can open up or lock out the dashboard from
  // the web page.
  unlockSettings(pin) {
    const cfg = this.getConfig();
    if (!cfg.editPin) {
      throw Object.assign(new Error('Stel eerst een bewerkpincode in bij de instellingen van de app in Homey.'), { status: 403 });
    }
    const guard = this.settingsGuard || (this.settingsGuard = { failures: 0, lockedUntil: 0, locks: 0 });
    if (Date.now() < guard.lockedUntil) {
      const minutes = Math.ceil((guard.lockedUntil - Date.now()) / 60000);
      throw Object.assign(new Error(`Te veel verkeerde pincodes. Probeer het over ${minutes} min opnieuw.`), { status: 429 });
    }
    if (String(pin ?? '') !== String(cfg.editPin)) {
      guard.failures++;
      if (guard.failures >= 5) {
        guard.failures = 0;
        guard.lockedUntil = Date.now() + Math.min(24 * 60, 2 ** guard.locks) * 60 * 1000;
        guard.locks++;
      }
      throw Object.assign(new Error('Verkeerde pincode'), { status: 403 });
    }
    guard.failures = 0;
    guard.locks = 0;
    const token = crypto.randomBytes(24).toString('hex');
    this.settingsTokens = this.settingsTokens || new Map();
    this.settingsTokens.set(token, Date.now() + SETTINGS_TOKEN_TTL);
    return { token };
  }

  checkSettingsToken(token) {
    const tokens = this.settingsTokens || new Map();
    for (const [key, until] of tokens) if (until < Date.now()) tokens.delete(key);
    // A new PIN in Homey ends every session on the web page
    if (!this.getConfig().editPin) tokens.clear();
    if (!token || !tokens.has(String(token))) throw Object.assign(new Error('Pincode nodig'), { status: 401 });
  }

  webSettingValue(key) {
    if (key === 'config') {
      const config = { ...(this.homey.settings.get('config') || {}) };
      for (const hidden of WEB_HIDDEN_SETTINGS) delete config[hidden];
      return config;
    }
    if (key === 'nightImport') return this.homey.settings.get('nightImport') || null;
    throw Object.assign(new Error('Onbekende instelling'), { status: 404 });
  }

  async setWebSetting(key, value) {
    if (key !== 'config' || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw Object.assign(new Error('Onbekende instelling'), { status: 400 });
    }
    const saved = this.homey.settings.get('config') || {};
    const next = { ...value };
    for (const hidden of WEB_HIDDEN_SETTINGS) {
      if (hidden in saved) next[hidden] = saved[hidden];
      else delete next[hidden];
    }
    this.homey.settings.set('config', next);
    return { saved: true };
  }

  // The calls of the settings page, as its Homey.api would make them
  async webSettingsCall({ method, path, body } = {}) {
    const [route, query = ''] = String(path || '').split('?');
    if (method === 'GET' && route === '/settings-info') return this.getSettingsInfo();
    if (method === 'GET' && route === '/diagnosis-report') return this.getDiagnosisReport({ snapshot: /(^|&)snapshot=1(&|$)/.test(query) });
    if (method === 'GET' && route === '/shower-log') return this.getShowerLog();
    if (method === 'POST' && route === '/shower-log/remove') return this.removeShower(body || {});
    if (method === 'POST' && route === '/night-import') return this.importNightsPart(body || {});
    if (method === 'POST' && route === '/night-import/clear') return this.clearNightImport();
    if (method === 'POST' && route === '/backup-import') return this.importBackupPart(body || {});
    if (method === 'GET' && route === '/history-info') return this.getHistoryInfo();
    throw Object.assign(new Error('Onbekend'), { status: 404 });
  }

  // ---------- Warnings ----------

  async getAlerts(found, cfg, lang) {
    const baseload = await this.getBaseload(found, cfg).catch(() => null);
    const market = cfg.prices.source === 'off' ? null : await this.prices.get({}).catch(() => null);
    return buildAlerts({
      price: market ? { market: market.current, currency: await this.getCurrency(cfg) } : null,
      gridW: found.p1?.capabilitiesObj?.measure_power?.value ?? null,
      peak: this.getPeak(found, cfg),
      monitor: this.alertMonitor,
      found,
      baseload,
      baseloadLog: this.homey.settings.get('baseloadLog') || {},
      hours: Number(cfg.alerts.hours) || 4,
      lang,
    });
  }

  // The boiler settings, with the flow measured by the shower button once calibration is on
  boilerConfig(saved) {
    const boiler = { ...DEFAULTS.boiler, ...saved };
    if (!boiler.calibrate) return boiler;
    const samples = this.homey.settings.get('showerLog')?.samples || [];
    return { ...boiler, measuredFlow: measuredFlow(samples), measuredShowers: Math.min(samples.length, 10) };
  }

  // The measured showers for the settings page, and removing one that went wrong
  getShowerLog() {
    return { samples: this.homey.settings.get('showerLog')?.samples || [] };
  }

  removeShower({ at } = {}) {
    const log = this.homey.settings.get('showerLog') || {};
    this.homey.settings.set('showerLog', { ...log, samples: withoutShower(log.samples, Number(at)) });
    return this.getShowerLog();
  }

  async readTank() {
    const cfg = this.getConfig();
    const found = discover(await this.getDevices(), cfg.devices);
    const reading = tankReading(found.boiler, cfg.boiler, found.water);
    return reading && { ...reading, at: Date.now() };
  }

  // "Shower started": remember the tank now. Does nothing while calibration is off.
  async showerStart() {
    if (!this.getConfig().boiler.calibrate) return true;
    const reading = await this.readTank();
    const log = this.homey.settings.get('showerLog') || {};
    this.homey.settings.set('showerLog', { ...log, pending: reading || null });
    return true;
  }

  // "Shower finished": the drop since the start gives the flow of the shower head
  async showerStop() {
    const cfg = this.getConfig();
    if (!cfg.boiler.calibrate) return true;
    const log = this.homey.settings.get('showerLog') || {};
    const end = await this.readTank();
    const sample = showerSample(log.pending, end, cfg.boiler);
    this.log(sample ? `Shower measured: ${sample.flow} L/min` : 'Shower not used for calibration');
    this.homey.settings.set('showerLog', { samples: [...(log.samples || []), ...(sample ? [sample] : [])].slice(-20) });
    return true;
  }

  // The water meter, the tank, the gas meter and the boiler's plug (when chosen) for the tap check;
  // a finished tap goes in the log
  async trackTaps() {
    const cfg = this.getConfig();
    if (!cfg.boiler.tapCheck) return;
    if (!this.tapStarted) this.tapStarted = Date.now();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const plug = cfg.boiler.tapCheckPower ? devices.find(d => d.id === cfg.boiler.tapCheckPower) : null;
    const number = (device, capability) => {
      const v = device?.capabilitiesObj?.[capability]?.value;
      return typeof v === 'number' ? v : null;
    };
    const reading = tankReading(found.boiler, cfg.boiler, found.water);
    const added = this.tapTracker.add({
      at: Date.now(),
      liters: reading?.liters,
      temp: reading?.average,
      gas: number(found.p1, 'meter_gas'),
      power: number(plug, 'measure_power'),
      heating: Boolean(reading?.heating),
    });
    if (!this.homey.settings.get('tapLog')?.replayed && !this.tapReplaying) {
      this.tapReplaying = true;
      await this.replayTaps(found, plug, cfg).catch(err => this.error(`Tap check replay: ${err.message}`));
      this.tapReplaying = false;
    } else if (added) {
      this.homey.settings.set('tapLog', { ...this.homey.settings.get('tapLog'), events: this.tapTracker.events });
    }
  }

  // The first time the check is on: the taps of the last 24 hours from Insights (5-minute steps),
  // so a change made today still has a time before it
  async replayTaps(found, plug, cfg) {
    const read = (device, capability) => (device && capability
      ? this.getEntries(device.id, capability, 'last24Hours').catch(() => [])
      : Promise.resolve([]));
    const points = entries => entries.filter(e => typeof e.v === 'number').map(e => ({ t: e.t.getTime(), v: e.v }));
    const [water, temp, gas, power] = await Promise.all([
      read(found.water, 'meter_water'),
      read(found.boiler, found.boiler && tankSensors(found.boiler, cfg.boiler).top),
      read(found.p1, 'meter_gas'),
      read(plug, 'measure_power'),
    ]);
    const older = replayTaps({ water: points(water), temp: points(temp), gas: points(gas), power: points(power) });
    // Only taps from before the check was on: from then on the live readings are finer
    this.tapTracker.events = mergeTaps(this.tapTracker.events, older.filter(e => e.at < this.tapStarted));
    this.homey.settings.set('tapLog', { replayed: Date.now(), events: this.tapTracker.events });
    this.log(`Tap check: ${older.length} taps found in the last 24 hours`);
  }

  // "Hot tap water from …": the source the Flow switched to, with its reason
  async tapwaterSource({ source, reason }) {
    if (!this.getConfig().boiler.valve) return true;
    const log = this.homey.settings.get('tapwaterLog');
    const next = recordTapwater(log, source, reason);
    if (next !== log) this.homey.settings.set('tapwaterLog', next);
    return true;
  }

  // Tracks the devices, and sends new warnings to the Homey timeline when that is turned on
  // Keeps one pair of tags per group: made for a new group, renamed with it, removed with it
  async updateGroupTokens() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const solarW = found.solar.reduce((sum, d) => sum + Math.abs(Number(d.capabilitiesObj?.measure_power?.value) || 0), 0);
    const estimated = await this.getEstimated(devices, found).catch(() => []);
    const groups = buildGroups(devices, cfg, { phases: buildPhases(found.p1, cfg), solarW, estimated })?.groups || [];
    const wanted = new Map();
    for (const g of groups) {
      wanted.set(`group-${g.id}-load`, { title: this.homey.__('tokens.groupLoad', { name: g.name }), value: Math.round(g.amps / g.fuseAmps * 100) });
      wanted.set(`group-${g.id}-watts`, { title: this.homey.__('tokens.groupWatts', { name: g.name }), value: g.watts });
    }
    await this.syncTokens(this.groupTokens, wanted);
  }

  // Makes the tags in `wanted` (id → { title, value, type }), renames them with their title and
  // removes the ones no longer wanted. A value of null keeps the tag with its last value.
  async syncTokens(tokens, wanted) {
    for (const [id, token] of tokens) {
      if (wanted.get(id)?.title === token.title) continue;
      tokens.delete(id);
      await token.flowToken.unregister().catch(() => {});
    }
    for (const [id, { title, value, type = 'number' }] of wanted) {
      let token = tokens.get(id);
      if (!token) {
        if (value === null) continue;
        token = { title, flowToken: await this.homey.flow.createToken(id, { type, title, value }) };
        tokens.set(id, token);
      }
      if (value !== null) await token.flowToken.setValue(value);
    }
  }

  // Tags for the whole house, for Flows: what goes to the grid, the solar surplus, the home
  // battery, whether the off-peak rate applies now, today's costs and tomorrow's solar. Live
  // values every 30 seconds, the costs and the forecast every 5 minutes.
  async updateHouseTokens() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg);
    const contract = contractFrom(cfg);
    const e = contract.electricity;
    const title = key => this.homey.__(`tokens.${key}`);
    const wanted = new Map();
    const put = (id, value, type = 'number') => wanted.set(id, { title: title(id), value, type });
    if (typeof live.gridW === 'number') put('surplus', Math.round(Math.max(0, -live.gridW)));
    if (found.solar.length && typeof live.homeW === 'number') put('solarSurplus', Math.round(Math.max(0, live.solarW - live.homeW)));
    if (typeof live.battery?.soc === 'number') put('batterySoc', Math.round(live.battery.soc));
    if (e.type === 'fixed' && typeof e.low === 'number') put('lowTariff', isLow(Date.now(), e), 'boolean');

    const slow = this.slowTokens || {};
    if (!slow.at || Date.now() - slow.at > 5 * 60 * 1000) {
      slow.at = Date.now();
      const today = await this.getHistory('today', { light: true }).catch(() => null);
      slow.cost = typeof today?.totals?.cost === 'number' ? Math.round(today.totals.cost * 100) / 100 : null;
      const location = this.getPlace();
      const forecast = cfg.forecast.enabled
        ? location && await this.forecast.get({ ...location, planes: cfg.forecast.planes }).catch(() => null)
        : pvForecastDays(devices);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const kWh = forecast?.days?.[localDate(tomorrow)];
      slow.solarTomorrow = typeof kWh === 'number' ? Math.round(kWh * 10) / 10 : null;
      this.slowTokens = slow;
    }
    if (slow.cost !== null) put('costToday', slow.cost);
    // The CO2 of the grid now and the gas price of today, when they are known here
    const country = countryOf(this.homey.clock.getTimezone());
    const co2Points = country ? await this.co2.points(country).catch(() => []) : [];
    const co2 = co2Points.find(p => p.t <= Date.now() && Date.now() < p.end);
    if (co2) put('co2Now', Math.round(co2.g));
    const gas = await dynamicGas(contract, this.prices).catch(() => null);
    if (gas) put('gasPrice', Math.round(gas.now * 1000) / 1000);
    if (slow.solarTomorrow !== null) put('solarTomorrow', slow.solarTomorrow);
    await this.syncTokens(this.houseTokens, wanted);
  }

  async checkAlerts() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    this.alertMonitor.track(devices, found);
    this.trackPeak(found);
    if (!cfg.alerts.notify) return;
    const lang = this.homey.i18n.getLanguage() === 'nl' ? 'nl' : 'en';
    const today = new Date().toDateString();
    for (const [id, day] of this.notified) if (day !== today) this.notified.delete(id);
    for (const alert of await this.getAlerts(found, cfg, lang)) {
      if (this.notified.has(alert.id)) continue;
      this.notified.set(alert.id, today);
      await this.homey.notifications.createNotification({ excerpt: alert.text }).catch(this.error);
    }
  }

  // ---------- Export ----------

  async getExport(period, lang) {
    if (!PERIODS[period]) throw Object.assign(new Error(`Onbekende periode: ${period}`), { status: 400 });
    return historyCsv(await this.getHistory(period), lang, currencySymbol(await this.getCurrency(this.getConfig())));
  }

  // Every tap of the tap check, oldest first
  getTapExport(lang) {
    return tapCsv(this.tapTracker.events, lang);
  }

  // ---------- Diagnosis ----------

  // What the app finds and reads, for when something does not show: /api/diagnose
  // `anonymous` is for the report a user shares from the settings: no device names, ids, rooms,
  // location or warning texts, only which apps and capabilities the devices have and their values
  async getDiagnosis({ anonymous = false } = {}) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const logs = await this.getLogIds().catch(() => new Set());
    const counters = {};
    const label = (d, role) => {
      counters[role] = (counters[role] || 0) + 1;
      return anonymous ? `${role} ${counters[role]}` : d.name;
    };
    const describeAs = role => d => (d ? {
      name: label(d, role),
      app: d.driverId,
      class: d.virtualClass || d.class,
      available: d.available !== false,
      capabilities: d.capabilities,
      // The values of now, to see which capability holds what (for a hybrid inverter: PV, battery)
      values: Object.fromEntries(Object.entries(d.capabilitiesObj || {}).map(([id, cap]) => [id, cap.value])),
      energy: d.energyObj,
      energyUser: d.energy,
      energySettings: d.energySettings,
      flags: d.flags,
      insights: d.capabilities.filter(c => logs.has(`homey:device:${d.id}:${c}`)),
    } : null);
    const today = await this.getHistory('today').catch(err => ({ error: err.message }));
    const count = async (d, cap) => (d ? (await this.getEntries(d.id, cap, 'today').catch(() => [])).length : null);
    // Devices that look like a battery (or an inverter with one) but were not taken as a battery,
    // to learn how other apps report them
    const taken = new Set(found.batteries.map(d => d.id));
    const batteryLike = devices.filter(d => !taken.has(d.id)
      && (d.capabilities || []).some(c => /batt|battery_charging_state|^measure_battery$|soc/i.test(c))
      && (d.capabilities || []).some(c => /^(measure_power|meter_power)/.test(c)));
    const estimated = await this.getEstimated(devices, found).catch(err => [{ error: err.message }]);
    const alerts = await this.getAlerts(found, cfg, 'nl').catch(err => [{ error: err.message }]);
    const history = await this.describeHistory(found).catch(err => ({ error: err.message }));
    return {
      version: this.homey.manifest.version,
      homey: { language: this.homey.i18n.getLanguage(), timezone: this.homey.clock.getTimezone() },
      layout: resolveLayout(cfg.layout, found, cfg).map(b => b.id),
      found: {
        p1: describeAs('p1')(found.p1),
        solar: found.solar.map(describeAs('solar')),
        batteries: found.batteries.map(describeAs('battery')),
        boiler: describeAs('boiler')(found.boiler),
        heating: found.heating.map(describeAs('heating')),
        evChargers: found.evChargers.map(describeAs('evcharger')),
        cars: (found.cars || []).map(describeAs('car')),
        water: describeAs('water')(found.water),
      },
      batteryLike: batteryLike.slice(0, 10).map(describeAs('battery-like')),
      // Where Homey keeps "Exclude from Energy" is not known yet: the energy settings of every
      // metered device, to find it
      metered: devices.filter(d => (d.capabilities || []).some(c => /^(measure_power|meter_power)/.test(c))).slice(0, 60)
        .map(d => ({ name: label(d, 'device'), app: d.driverId, class: d.virtualClass || d.class, capabilities: d.capabilities, energyUser: d.energy, energySettings: d.energySettings })),
      // The groups in the fuse box as saved, without names
      groups: (Array.isArray(cfg.groups) ? cfg.groups : []).map(g => ({ phases: g.phases, fuseAmps: g.fuseAmps, fixedWatts: g.fixedWatts, devices: (g.devices || []).length })),
      // Which way round each battery's power is read: the setting, and what the app learned from
      // the charging state (votes: below 0 as reported, above 0 turned round)
      batteryDirection: { invertPower: Boolean(cfg.battery?.invertPower), batteries: found.batteries.map(d => ({ name: label(d, 'battery-dir'), ...batteryDirection(d, cfg.battery) })) },
      groupsSolarPhases: cfg.groupsSolarPhases,
      groupsBatteryPhases: cfg.groupsBatteryPhases,
      // Devices not in Homey: only their use, and in how many groups each device is
      groupsExtra: cfg.groupsExtra.map(x => ({ watts: x.watts })),
      groupsShared: (Array.isArray(cfg.groups) ? cfg.groups : []).flatMap(g => g.devices || [])
        .filter((id, i, all) => all.indexOf(id) !== i).length,
      // Whether the power of each device in a group is in Insights, for the day bars (forum NL #116)
      groupsInsights: await this.describeGroupInsights(devices, cfg, logs),
      // The days of the heat map: how many came from a report or the meter readings, why the others are missing
      heatLog: this.describeHeatLog(),
      today: {
        error: today.error || null,
        p1PowerReadings: await count(found.p1, 'measure_power'),
        powerPoints: today.power ? today.power.points.filter(Boolean).length : null,
        totals: today.totals ? { import: today.totals.import, export: today.totals.export, solar: today.totals.solar } : null,
      },
      contract: contractFrom(cfg),
      prices: await this.getPriceInfo(),
      peak: this.getPeak(found, cfg),
      estimated: estimated.slice(0, 10).map(d => (anonymous ? { watts: d.watts, estimated: d.estimated, error: d.error } : d)),
      // How Homey's live report is built (its shape is not documented): only its keys
      liveReport: await this.getEnergyLive().then(r => (r && typeof r === 'object' ? Object.keys(r).slice(0, 20) : r ?? null)).catch(err => ({ error: err.message })),
      // Warning texts hold device names; the anonymous report keeps only which warnings there are
      alerts: anonymous ? alerts.map(a => ({ id: a.id?.replace(/-[\w-]{8,}$/, ''), level: a.level })) : alerts,
      history,
    };
  }

  async describeGroupInsights(devices, cfg, logs) {
    const byId = new Map(devices.map(d => [d.id, d]));
    const ids = [...new Set((Array.isArray(cfg.groups) ? cfg.groups : []).flatMap(g => g.devices || []).map(String))];
    return Promise.all(ids.slice(0, 40).map(async id => {
      const d = byId.get(id);
      if (!d) return { device: false };
      const capability = ['measure_power', 'measure_power.in'].find(c => (d.capabilities || []).includes(c)) || null;
      const logged = Boolean(capability && logs.has(`homey:device:${id}:${capability}`));
      const count = resolution => this.readLog(`homey:device:${id}:${capability}`, resolution).then(list => list.length).catch(err => err.message);
      const readings = logged ? await count('today') : null;
      const last24Hours = logged ? await count('last24Hours') : null;
      return { app: d.driverId, capability, logged, readings, last24Hours, watts: capability ? d.capabilitiesObj?.[capability]?.value ?? null : null };
    }));
  }

  describeHeatLog() {
    const stored = this.homey.settings.get('heatLog');
    const days = Object.entries(stored?.days || {});
    return {
      version: stored?.version || null,
      reports: days.filter(([, d]) => d.imp && !d.meters).length,
      meters: days.filter(([, d]) => d.meters).length,
      missing: Object.fromEntries(days.filter(([, d]) => d.missing).map(([date, d]) => [date, d.why || '?'])),
    };
  }

  // How far back Homey keeps readings, for the battery size block: per Insights resolution the
  // readings of the P1 meter (its power, or else the kWh counter) with their usual step, and the
  // first and last day of Homey Energy's day reports (the only ones with power per 5 minutes; on
  // the owner's Homey a month). Week and month reports only hold totals.
  async describeHistory(found) {
    const insights = {};
    const logs = await this.getLogIds().catch(() => new Set());
    const logged = cap => found.p1 && logs.has(`homey:device:${found.p1.id}:${cap}`);
    const capability = ['measure_power', ...meterCapabilities(found.p1, 'import')].find(logged) || 'measure_power';
    insights.capability = capability;
    if (found.p1) {
      for (const resolution of ['last24Hours', 'last7Days', 'last14Days', 'last31Days', 'last3Months']) {
        const entries = await this.getEntries(found.p1.id, capability, resolution).catch(err => ({ error: err.message }));
        if (!Array.isArray(entries)) { insights[resolution] = entries; continue; }
        const gaps = entries.slice(1).map((e, i) => e.t - entries[i].t).sort((a, b) => a - b);
        insights[resolution] = {
          entries: entries.length,
          stepMinutes: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] / 60000) : null,
          from: entries[0]?.t?.toISOString() || null,
        };
      }
    }
    const available = await (await this.getApi()).energy.getReportsAvailable().catch(err => ({ failed: err.message }));
    const days = Array.isArray(available?.availableDays) ? available.availableDays : [];
    const nights = this.homey.settings.get('nightLog');
    const kinds = {};
    for (const n of Object.values(nights?.nights || {})) {
      const kind = n.missing ? 'missing' : n.skipped ? `skipped:${n.skipped}` : `step${n.step}`;
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
    // The month totals the model works with, and how it fitted
    const monthTotalsKept = { ...(this.homey.settings.get('monthTotals') || {}) };
    delete monthTotalsKept.version;
    const views = batteryViews(nights?.nights || {}, this.homey.settings.get('nightImport')?.nights, monthTotalsKept, { place: this.getPlace() });
    return {
      insights,
      dayReports: available?.failed ? available : { count: days.length, from: days[0] || null, to: days[days.length - 1] || null },
      nightLog: { version: nights?.version || null, kinds },
      monthTotals: monthTotalsKept,
      modelFit: views.fit,
    };
  }


  // The report for "Share diagnosis" in the settings: anonymous, with the date it was made, and
  // the address to mail it to: the contact address of the app in the App Store
  // With `snapshot` the report also holds the dashboard itself: what the page shows now and
  // today's history, with device names, so the developer can open it in the pc version
  // (node server.js --snapshot=<file>) and see exactly this dashboard. Only when the user chose it.
  async getDiagnosisReport({ snapshot = false } = {}) {
    const report = { made: new Date().toISOString().slice(0, 10), ...(await this.getDiagnosis({ anonymous: true })) };
    if (snapshot) {
      const [live, today] = await Promise.all([this.getLive(''), this.getHistory('today').catch(err => ({ error: err.message }))]);
      delete live.place;
      report.snapshot = { made: new Date().toISOString(), live, history: { today } };
    }
    // On installed apps the manifest can lack the author's e-mail; the share buttons then went to
    // GitHub (forum NL #127)
    return { email: this.homey.manifest.author?.email || CONTACT_EMAIL, report };
  }

  // ---------- The app's own history ----------

  readHistoryLog() {
    try {
      return validLog(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')));
    } catch (err) {
      return emptyLog();
    }
  }

  // Written at most once a minute: several periods can be recorded right after each other
  saveHistoryLog(log) {
    if (log === this.historyLog) return;
    this.historyLog = log;
    if (this.historySaveTimer) return;
    this.historySaveTimer = this.homey.setTimeout(() => {
      this.historySaveTimer = null;
      fs.promises.writeFile(HISTORY_FILE, JSON.stringify(this.historyLog)).catch(err => this.error(`History log: ${err.message}`));
    }, 60 * 1000);
  }

  // A light history from the log; null when the log misses an ended day or month. The part
  // running now (today, this month) comes from a shorter period.
  async historyFromLog(period, fp) {
    const kind = PERIODS[period]?.bucket;
    if (kind !== 'day' && kind !== 'month') return null;
    const running = { week: 'today', month: 'today', year: 'month' }[period];
    // Only worth reading the running part when the ended part is all in the log
    if (running && !composeHistory(this.historyLog, period, fp, { rows: [] })) return null;
    const current = running ? await this.getHistory(running, { light: true }) : null;
    return composeHistory(this.historyLog, period, fp, current);
  }

  // Yesterday into the log after midnight, and the finished months of this year and last year
  async keepHistory() {
    const cfg = this.getConfig();
    const found = discover(await this.getDevices(), cfg.devices);
    if (!found.p1) return;
    const fp = fingerprint(contractFrom(cfg), found);
    if (missingDays(this.historyLog, fp, 1).length) await this.getHistory('yesterday', { light: true });
    const now = new Date();
    const kept = key => this.historyLog.months[key]?.fp === fp;
    const ended = [];
    for (let m = 1; m <= 12 + now.getMonth(); m++) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      ended.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, thisYear: d.getFullYear() === now.getFullYear() });
    }
    // A month that ended, not kept yet: the history of its year keeps it
    if (ended.some(m => m.thisYear && !kept(m.key))) await this.getHistory('year', { light: true });
    if (ended.some(m => !m.thisYear && !kept(m.key))) await this.getHistory('lastYear', { light: true });
    this.saveHistoryLog(pruneLog(this.historyLog));
  }

  // How much the log holds, for the settings page
  getHistoryInfo() {
    const days = Object.keys(this.historyLog.days).sort();
    const months = Object.keys(this.historyLog.months).sort();
    return { days: days.length, months: months.length, from: [days[0], months[0]].filter(Boolean).sort()[0] || null };
  }

  // Every hour in the log as CSV
  async getHistoryLogExport(lang) {
    return logCsv(this.historyLog, lang, currencySymbol(await this.getCurrency(this.getConfig())));
  }

  // A backup of everything the app logged (not its settings), to keep or to bring to another Homey
  getBackup() {
    const logs = {};
    for (const key of BACKUP_KEYS) {
      const value = this.homey.settings.get(key);
      if (value !== null && value !== undefined) logs[key] = value;
    }
    return { app: this.homey.manifest.id, version: this.homey.manifest.version, made: new Date().toISOString(), logs, history: this.historyLog };
  }

  // A backup from the settings page, in parts of text like the meter export: the logs in it
  // replace the app's own; the history is merged (days and months the app already has stay)
  async importBackupPart(body) {
    this.backupUpload = this.backupUpload || new UploadParts();
    const text = this.backupUpload.add(body);
    if (text === null) return { received: Number(body.part) + 1, parts: Number(body.parts) };
    let backup = null;
    try {
      backup = JSON.parse(text);
    } catch (err) {
      backup = null;
    }
    if (backup?.app !== this.homey.manifest.id || !backup.logs || typeof backup.logs !== 'object') {
      throw Object.assign(new Error('Geen back-up van deze app'), { status: 400 });
    }
    let restored = 0;
    for (const key of BACKUP_KEYS) {
      if (backup.logs[key] === undefined) continue;
      this.homey.settings.set(key, backup.logs[key]);
      restored++;
    }
    const history = validLog(backup.history);
    const days = { ...history.days, ...this.historyLog.days };
    const months = { ...history.months, ...this.historyLog.months };
    this.saveHistoryLog({ ...this.historyLog, days, months, meta: this.historyLog.meta || history.meta });
    // The trackers keep their logs in memory as well
    this.peakTracker = new PeakTracker(this.homey.settings.get('peakLog') || {});
    this.tapTracker = new TapTracker(this.homey.settings.get('tapLog') || {});
    this.historyCache.clear();
    this.nettingCache = null;
    this.billCache = null;
    return { restored, days: Object.keys(history.days).length, months: Object.keys(history.months).length, made: backup.made || null };
  }

  async getHistory(period = 'today', { light = false } = {}) {
    if (!PERIODS[period]) throw new Error(`Unknown period: ${period}`);
    const key = `${period}${light ? ':light' : ''}`;
    const cached = this.historyCache.get(key);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL) return cached.data;

    // Several screens ask at the same moment; they share one calculation instead of each reading Insights
    const data = this.buildHistory(period, light);
    // Expired periods are dropped, so a period viewed once does not stay in memory
    for (const [k, entry] of this.historyCache) {
      if (Date.now() - entry.at >= HISTORY_CACHE_TTL) this.historyCache.delete(k);
    }
    this.historyCache.set(key, { at: Date.now(), data });
    data.catch(() => {
      if (this.historyCache.get(key)?.data === data) this.historyCache.delete(key);
    });
    return data;
  }

  async buildHistory(period, light) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const location = { lat: this.homey.geolocation.getLatitude(), lon: this.homey.geolocation.getLongitude() };
    const found = discover(devices, cfg.devices);
    // Totals of a period (net metering, the bill) from the app's own history when it holds every
    // ended day or month; only the part running now is read from Insights
    const fp = fingerprint(contractFrom(cfg), found);
    if (light) {
      const composed = await this.historyFromLog(period, fp).catch(err => { this.error(`History log: ${err.message}`); return null; });
      if (composed) return composed;
    }
    const estimated = light ? [] : await this.getEstimated(devices, found).catch(() => []);
    const data = await buildHistory(this, devices, found, period, cfg, { light, prices: this.prices, weather: this.weather, location, estimated });
    // Yesterday only once Insights has its last readings (they can come in a few minutes late)
    if (period === 'yesterday' && new Date().getHours() >= 1) this.saveHistoryLog(recordDay(this.historyLog, data, fp));
    if (period === 'year' || period === 'lastYear') this.saveHistoryLog(recordMonths(this.historyLog, data, fp));
    // Forecast.Solar when it is set up, otherwise the day totals of the app PV Forecast
    const pvForecast = cfg.forecast.enabled ? null : pvForecastDays(devices);
    if (period === 'today' && !light && (cfg.forecast.enabled || pvForecast)) {
      data.forecast = pvForecast || await this.forecast.get({ ...location, planes: cfg.forecast.planes }).catch(() => null);
      const log = this.homey.settings.get('forecastLog') || {};
      // PV Forecast counts what was measured into today's total as the day goes on: today's
      // forecast is the one of last evening (or the first one read), later days keep updating
      const today = Object.keys(pvForecast?.days || {}).sort()[0];
      const fresh = pvForecast ? { days: Object.fromEntries(Object.entries(pvForecast.days).filter(([day]) => day > today || !(day in log))) } : data.forecast;
      if (fresh) this.homey.settings.set('forecastLog', recordForecast(log, fresh));
    }
    if (!light && (cfg.forecast.enabled || pvForecast)) {
      data.expectedSolar = expectedSolar(period, data.rows.map(r => ({ start: new Date(r.start) })), this.homey.settings.get('forecastLog'));
      data.kwp = totalKwp(cfg.forecast.planes) || null;
    }
    if (!light && PREVIOUS[period]) {
      const previous = await this.getHistory(PREVIOUS[period], { light: true }).catch(() => null);
      data.previous = comparableTotals(previous, data);
    }
    return data;
  }

  // The currency of the amounts: the one chosen in the settings, else the one of Homey Energy
  async getCurrency(cfg) {
    return cfg.prices.currency || await this.prices.currency().catch(() => null);
  }

  // Where prices come from now, and what Homey Energy has, for the explanation in the settings
  async getPriceInfo() {
    const state = await this.prices.homeyState().catch(() => null);
    return {
      source: await this.prices.source().catch(() => 'energyzero'),
      homey: state ? { type: state.type, formula: state.formula, usable: Boolean(state.allIn), fixed: state.fixed, currency: state.currency, currencyAnswer: state.currencyAnswer } : null,
    };
  }

  async getDashboardUrl() {
    const address = await this.homey.cloud.getLocalAddress().catch(() => null);
    const host = address ? address.split(':')[0] : '<ip-van-je-homey>';
    return `http://${host}:${this.getConfig().port}`;
  }

  // For sister apps: the port of this dashboard and whether it runs
  getDashboardLink() {
    return { port: this.getConfig().port, running: Boolean(this.webServer?.status.running), name: { en: 'Energy', nl: 'Energie' }, icon: '⚡' };
  }

  // Sister dashboards that are installed and running, asked through app-to-app calls; for the switch in the header
  async getSiblings() {
    if (this.siblingsCache && Date.now() - this.siblingsCache.at < SIBLINGS_CACHE_TTL) return this.siblingsCache.list;
    const list = [];
    await Promise.all(SIBLINGS.map(async s => {
      try {
        const api = this.homey.api.getApiApp(s.appId);
        if (!(await api.getInstalled())) return;
        const link = await api.get('/dashboard-link');
        if (link?.running && link.port) list.push({ key: s.key, icon: s.icon, name: s.name, port: link.port });
      } catch {
        // Not installed, too old to answer or not allowed: no switch for it
      }
    }));
    this.siblingsCache = { at: Date.now(), list };
    return list;
  }

  // Everything the settings page needs: devices to choose from, what was found and the dashboard address
  async getSettingsInfo() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const estimatedIds = new Set((await this.getEstimated(devices, found).catch(() => [])).map(d => d.id));
    const hasCapability = (d, pattern) => (d.capabilities || []).some(c => pattern.test(c));
    return {
      dashboardUrl: await this.getDashboardUrl(),
      server: this.webServer.status,
      blocks: blockCatalog(),
      layout: resolveLayout(cfg.layout, found, cfg),
      defaultLayout: defaultLayout(found, cfg),
      customLayout: Boolean(cfg.layout),
      contract: contractFrom(cfg),
      suppliers: SUPPLIERS,
      prices: await this.getPriceInfo(),
      found: {
        p1: found.p1?.id || null,
        solar: found.solar.map(d => d.id),
        batteries: found.batteries.map(d => d.id),
        boiler: found.boiler?.id || null,
        heating: found.heating.map(d => d.id),
        thermostat: found.thermostat?.id || null,
        evChargers: found.evChargers.map(d => d.id),
        water: found.water?.id || null,
      },
      // Devices without a meter but with an estimate from Homey can be put in a group as well
      devices: devices
        .filter(d => hasCapability(d, /^(measure_power|meter_power|meter_gas|meter_water|measure_temperature|measure_battery)/)
          || hasUsageEstimate(d) || estimatedIds.has(d.id))
        .map(d => ({
          id: d.id,
          name: d.name,
          class: d.virtualClass || d.class,
          power: (d.capabilities || []).includes('measure_power'),
          waterMeter: (d.capabilities || []).includes('meter_water'),
          // A heat pump such as the Weheat gives its electric power as measure_power.in
          heatPump: (d.capabilities || []).includes('measure_power.in'),
          temps: (d.capabilities || []).filter(c => c.startsWith('measure_temperature')),
          estimate: hasUsageEstimate(d) || estimatedIds.has(d.id),
          // A summary of Power by the Hour (Σ): it copies another meter, so it is no group device
          copy: isCopy(d),
          // The P1 meter or another meter of the whole house: no group device either
          gridMeter: d.id === found.p1?.id || isGridMeter(d),
          // Whether the dashboard counts it as a consumer by itself, or why not (Consumers)
          consumer: consumerStatus(d, found),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

}

module.exports = EnergyDashboardApp;
