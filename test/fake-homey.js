'use strict';

// The real app.js on a stand-in for Homey: its SDK and its Web API, with devices that really change and report back,
// Flow cards that can be run, Insights, moods, users and Logic. For the full tests and the browser checks.
const Module = require('module');
const { demoDevices, demoZones, demoPlan } = require('./demo-house');
const { demoEnergyDevices } = require('./demo-energy');

const EVIL = '<img src=x onerror="window.__xss=1">';

function fakeHomey({ lang = 'nl', config = {} } = {}) {
  const store = new Map([['config', { port: 0, accessCode: '', editPin: '', ...config }]]);
  const listeners = [];
  const cards = { action: {}, trigger: {} };
  const timers = new Set();
  const track = (t) => { t.unref(); timers.add(t); return t; };
  return {
    cards,
    timers,
    store,
    realtimeEvents: [],
    manifest: { id: 'com.drpeppers.floorplandashboard', version: '0.2.0', author: { name: 'Dev', email: 'you@example.com' } },
    version: '12.3.0',
    platform: 'local',
    clock: { getTimezone: () => 'Europe/Amsterdam' },
    cloud: { getLocalAddress: async () => '127.0.0.1:80' },
    geolocation: { getLatitude: () => 52.1, getLongitude: () => 5.1 },
    notifications: { createNotification: async () => {} },
    i18n: { getLanguage: () => lang },
    api: {
      realtime(event, data) { this.parent.realtimeEvents.push([event, data]); },
      getApiApp: () => ({ getInstalled: async () => false, get: async () => null }),
    },
    flow: {
      getActionCard(id) { return { registerRunListener(fn) { cards.action[id] = fn; } }; },
      getTriggerCard(id) { cards.trigger[id] = cards.trigger[id] || []; return { trigger: async (tokens) => { cards.trigger[id].push(tokens); } }; },
      createToken: async () => ({ setValue: async () => {}, unregister: async () => {} }),
    },
    dashboards: { getWidget: () => ({ registerSettingAutocompleteListener() {} }) },
    settings: {
      get: (k) => store.get(k),
      set: (k, v) => { store.set(k, v); listeners.forEach((fn) => fn(k)); },
      unset: (k) => store.delete(k),
      getKeys: () => [...store.keys()],
      on: (event, fn) => listeners.push(fn),
    },
    setTimeout: (fn, ms) => track(setTimeout(fn, ms)),
    setInterval: (fn, ms) => track(setInterval(fn, ms)),
    clearTimeout: (t) => clearTimeout(t),
    clearInterval: (t) => clearInterval(t),
  };
}

function makeDevice(d) {
  const watchers = new Map();
  const capabilitiesObj = {};
  for (const [id, value] of Object.entries(d.caps || {})) capabilitiesObj[id] = { id, value };
  return {
    id: d.id,
    name: d.name,
    class: d.cls,
    zone: d.zone,
    available: true,
    driverId: `homey:app:com.example:${d.cls}`,
    capabilities: Object.keys(d.caps || {}),
    capabilitiesObj,
    images: d.camera ? [{ id: 'cam', imageObj: { url: d.camera } }] : [],
    makeCapabilityInstance(cap, fn) {
      watchers.set(cap, fn);
      return { destroy: () => watchers.delete(cap) };
    },
    report(cap, value) {
      capabilitiesObj[cap].value = value;
      if (watchers.has(cap)) watchers.get(cap)(value);
    },
  };
}

function fakeApi({ lang = 'nl', devices: list, failing = {} } = {}) {
  const devices = {};
  for (const d of list) devices[d.id] = makeDevice(d);
  const logic = { v_holiday: { id: 'v_holiday', name: 'Vakantie', type: 'boolean', value: false }, v_guests: { id: 'v_guests', name: 'Gasten', type: 'number', value: 2 }, v_note: { id: 'v_note', name: EVIL, type: 'string', value: EVIL } };
  const flows = { f1: { id: 'f1', name: 'Welterusten', triggerable: true, enabled: true }, f2: { id: 'f2', name: 'Geen knop', triggerable: false }, f3: { id: 'f3', name: 'Stofzuig keuken', triggerable: true } };
  const ran = [];
  const maybe = (name, fn) => async (...args) => { if (failing[name]) throw new Error(`${name} is down`); return fn(...args); };
  const handlers = {};
  return {
    ran,
    logic: { getVariables: maybe('logic', async () => logic), updateVariable: maybe('logic', async ({ id, variable }) => { logic[id].value = variable.value; }) },
    devices: {
      connect: async () => {},
      on: (e, fn) => { handlers[e] = fn; },
      getDevices: maybe('devices', async () => devices),
      setCapabilityValue: maybe('setCapability', async ({ deviceId, capabilityId, value }) => {
        const d = devices[deviceId];
        if (!d) throw new Error('No such device');
        if (!(capabilityId in d.capabilitiesObj)) throw new Error(`No capability ${capabilityId}`);
        d.report(capabilityId, value);
      }),
    },
    zones: { connect: async () => {}, on() {}, getZones: maybe('zones', async () => Object.fromEntries(demoZones(lang).map((z) => [z.id, z]))) },
    insights: {
      getLogs: maybe('insights', async () => []),
      getLogEntries: maybe('insights', async () => ({ values: [] })),
    },
    energy: new Proxy({}, { get: () => async () => { throw new Error('No Energy manager in the stand-in'); } }),
    weather: { getWeather: maybe('weather', async () => ({ temperature: 12, iconId: 'rain', state: 'Regen', forecastHourly: [{ time: Date.now() / 1000, temperature: 12, iconId: 'rain' }], forecast: [] })) },
    apps: { getApp: async () => null },
    flow: {
      getFlows: maybe('flow', async () => flows),
      getAdvancedFlows: maybe('flow', async () => ({ a1: { id: 'a1', name: 'Film', triggerable: true } })),
      triggerFlow: maybe('flow', async ({ id }) => { ran.push(['flow', id]); }),
      triggerAdvancedFlow: maybe('flow', async ({ id }) => { ran.push(['advanced', id]); }),
    },
    moods: { getMoods: maybe('moods', async () => ({ m1: { id: 'm1', name: 'Filmavond' } })), setMood: maybe('moods', async ({ id }) => { ran.push(['mood', id]); }) },
    users: { getUsers: maybe('users', async () => ({ a: { name: 'Sam', present: true, enabled: true, email: 'sam@example.com' }, b: { name: 'Lou', present: false, enabled: true }, c: { name: EVIL, present: true } })) },
    handlers,
  };
}

/** A device list with everything the dashboard can show. */
function fullDevices(lang = 'nl') {
  const compact = (d) => ({ id: d.id, name: d.name, zone: 'z_hall', cls: d.virtualClass || d.class, caps: Object.fromEntries(Object.entries(d.capabilitiesObj || {}).map(([k, v]) => [k, v.value])) });
  return [
    ...demoDevices(lang),
    ...demoEnergyDevices(lang, new Date()).map(compact),
    { id: 'd_cam', name: 'Camera oprit', zone: 'z_hall', cls: 'camera', caps: { alarm_motion: false }, camera: '/api/image/cam1' },
    { id: 'd_bell', name: 'Deurbel', zone: 'z_hall', cls: 'doorbell', caps: { alarm_generic: false }, camera: '/api/image/bell1' },
    { id: 'd_evil', name: EVIL, zone: 'z_hall', cls: 'light', caps: { onoff: true } },
  ];
}

/**
 * Starts the real app. opts: lang, config (accessCode, editPin), devices, failing ({ users: true }), plan.
 * Returns { app, homey, api, stop() }.
 */
async function startApp(opts = {}) {
  const lang = opts.lang || 'nl';
  const api = fakeApi({ lang, devices: opts.devices || fullDevices(lang), failing: opts.failing });
  const load = Module._load;
  Module._load = function stub(request, ...rest) {
    if (request === 'homey') return { App: class { log() {} error() {} }, env: {} };
    if (request === 'homey-api') return { HomeyAPI: { createAppAPI: async () => api } };
    return load.call(this, request, ...rest);
  };
  for (const key of Object.keys(require.cache)) if (/[\\/](app\.js|DeviceHub\.js)$/.test(key) && !key.includes('energy') && !key.includes('node_modules')) delete require.cache[key];
  const App = require('../app');
  Module._load = load;

  const homey = fakeHomey({ lang, config: { port: opts.port || 0, ...(opts.config || {}) } });
  homey.api.parent = homey;
  for (const [key, value] of Object.entries(opts.settings || {})) homey.store.set(key, value);
  const app = new App();
  app.homey = homey;
  await app.onInit();
  await app.hubReady;
  if (opts.plan !== null) {
    const plan = opts.plan || demoPlan(lang);
    app.plans.save(plan.id, plan);
  }
  await app.startEnergy();
  return {
    app,
    homey,
    api,
    port: app.getConfig().port,
    stop: async () => {
      for (const t of homey.timers) { clearTimeout(t); clearInterval(t); }
      await app.onUninit();
    },
  };
}

module.exports = { startApp, fullDevices, fakeHomey, fakeApi, EVIL };
