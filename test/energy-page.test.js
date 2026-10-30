'use strict';

// Energy Dashboard's logic inside HomeDeck, with a stand-in Homey: its settings stay apart from HomeDeck's, and its page
// answers under /energy/ on HomeDeck's web server.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { EnergyEngine } = require('../lib/EnergyEngine');
const { WebServer } = require('../lib/WebServer');
const { EnergyHub } = require('../lib/EnergyHub');
const { demoEnergyDevices } = require('./demo-energy');
const { createEnergyDemo } = require('./energy-demo');

function fakeHomey(port) {
  const store = new Map([['config', { port, accessCode: '', editPin: '' }]]);
  const listeners = [];
  const timers = [];
  return {
    timers,
    manifest: { id: 'x', version: '9.9.9', author: { name: 'Dev' } },
    clock: { getTimezone: () => 'Europe/Amsterdam' },
    cloud: { getLocalAddress: async () => '192.0.2.1:80' },
    geolocation: { getLatitude: () => 52.1, getLongitude: () => 5.1 },
    notifications: { createNotification: async () => {} },
    i18n: { getLanguage: () => 'nl' },
    flow: {
      getActionCard: () => ({ registerRunListener() {} }),
      createToken: async () => ({ setValue: async () => {}, unregister: async () => {} }),
    },
    api: { getApiApp: () => ({ getInstalled: async () => false }) },
    settings: {
      get: (k) => store.get(k),
      set: (k, v) => { store.set(k, v); listeners.forEach((fn) => fn(k)); },
      unset: (k) => store.delete(k),
      getKeys: () => [...store.keys()],
      on: (event, fn) => listeners.push(fn),
    },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); timers.push(t); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref(); timers.push(t); return t; },
    clearTimeout: (t) => clearTimeout(t),
    clearInterval: (t) => clearInterval(t),
  };
}

function fakeApi() {
  const devices = Object.fromEntries(demoEnergyDevices('nl', new Date(2026, 9, 1, 13)).map((d) => [d.id, d]));
  return {
    devices: { getDevices: async () => devices },
    zones: { getZones: async () => ({}) },
    insights: { getLogs: async () => ({}), getLogEntries: async () => ({ values: [] }) },
    energy: new Proxy({}, { get: () => async () => { throw new Error('no Energy manager here'); } }),
    apps: { getApp: async () => null },
  };
}

function hostFor(homey) {
  const host = {
    homey,
    log() {},
    error() {},
    hub: { api: fakeApi() },
    hubReady: Promise.resolve(),
    getConfig: () => homey.settings.get('config'),
    async getEnergyPage() { return { server: host.energyEngine.webServer }; },
  };
  return host;
}

const request = (port, path, { method = 'GET', body = null, origin = null, token = null } = {}) => new Promise((resolve, reject) => {
  const headers = { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(token ? { 'X-Settings-Token': token } : {}) };
  const req = http.request({ port, path, method, headers }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { text += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }));
  });
  req.on('error', reject);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

test('Energy page: the real app logic under /energy/, with settings of its own', async (t) => {
  const port = 18690;
  const homey = fakeHomey(port);
  const host = hostFor(homey);
  const engine = new EnergyEngine(host);
  await engine.onInit();
  host.energyEngine = engine;
  const server = new WebServer({ app: host });
  await server.start(port);
  t.after(async () => { homey.timers.forEach(clearTimeout); await server.stop(); });

  // no port of its own: it reports HomeDeck's
  assert.strictEqual(engine.webServer.status.port, port);
  assert.strictEqual(engine.getConfig().accessCode, '');

  const redirect = await request(port, '/energy');
  assert.strictEqual(redirect.status, 301);
  assert.strictEqual(redirect.headers.location, 'energy/');

  const page = await request(port, '/energy/');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /site\.js\?v=9\.9\.9/);

  const live = (await request(port, '/energy/api/live')).json();
  assert.ok(typeof live.solarW === 'number', 'live solar power');
  assert.ok(Array.isArray(live.layout) && live.layout.length > 3, 'the blocks of the page');
  assert.strictEqual(live.version, '9.9.9');

  assert.deepStrictEqual((await request(port, '/energy/api/siblings')).json().map((s) => s.path), ['../']);
  assert.strictEqual((await request(port, '/energy/api/history?period=today')).status, 200);

  // the settings page opens without a PIN when HomeDeck has none, and saves under its own key
  const open = await request(port, '/energy/instellingen');
  assert.strictEqual(open.status, 301);
  assert.strictEqual(open.headers.location, 'instellingen/');
  const settings = await request(port, '/energy/instellingen/');
  assert.strictEqual(settings.status, 200);
  assert.match(settings.text, /\.\.\/settings-web\.js/);
  assert.ok((await request(port, '/energy/api/settings/unlock', { method: 'POST', body: { pin: '' } })).json().token);
  const own = JSON.stringify(homey.settings.get('config'));
  const saved = await request(port, '/energy/api/settings/value', { method: 'POST', body: { key: 'config', value: { grid: { fuseAmps: 35 } } }, token: 'open' });
  assert.strictEqual(saved.status, 200);
  assert.strictEqual(JSON.stringify(homey.settings.get('config')), own, "HomeDeck's own config is untouched");
  assert.strictEqual(homey.settings.get('energy.config').grid.fuseAmps, 35);
  assert.strictEqual(engine.getConfig().grid.fuseAmps, 35);

  // a page elsewhere cannot write here, in the browser of someone at home
  const blocked = await request(port, '/energy/api/settings/value', { method: 'POST', body: { key: 'config', value: {} }, origin: 'https://evil.example' });
  assert.strictEqual(blocked.status, 403);
  const blockedApi = await request(port, '/api/capability', { method: 'POST', body: {}, origin: 'null' });
  assert.strictEqual(blockedApi.status, 403);
  const own2 = await request(port, '/energy/api/settings/value', { method: 'POST', body: { key: 'config', value: { grid: { fuseAmps: 35 } } }, origin: `http://localhost:${port}`, token: 'open' });
  assert.strictEqual(own2.status, 200);
  assert.strictEqual((await request(port, '/energy/api/settings/value?key=config', { token: '' })).status, 401, 'without the header of the page');

  // the house view reads what is chosen on the Energy page
  const hub = new EnergyHub({ api: host.hub.api }, () => engine.getConfig());
  assert.ok(typeof (await hub.getLive()).homeW === 'number');
});

test('Energy page: with an edit PIN the settings ask for it, and an empty try is no wrong try', async (t) => {
  const homey = fakeHomey(18691);
  homey.settings.set('config', { port: 18691, accessCode: '', editPin: '4321' });
  const engine = new EnergyEngine(hostFor(homey));
  await engine.onInit();
  t.after(() => homey.timers.forEach(clearTimeout));
  for (let i = 0; i < 8; i++) assert.throws(() => engine.unlockSettings(''), (err) => err.status === 401);
  assert.ok(engine.unlockSettings('4321').token);
  assert.throws(() => engine.checkSettingsToken('open'), (err) => err.status === 401);
  homey.settings.set('config', { port: 18691, accessCode: '', editPin: '' });
  assert.throws(() => engine.checkSettingsToken(''), (err) => err.status === 401, 'also without a PIN the header is needed');
  assert.doesNotThrow(() => engine.checkSettingsToken('open'));
});

test('Energy page: a backup of the app Energy Dashboard can be read in', async (t) => {
  const homey = fakeHomey(18692);
  const engine = new EnergyEngine(hostFor(homey));
  await engine.onInit();
  t.after(() => homey.timers.forEach(clearTimeout));
  const backup = JSON.stringify({ app: 'com.drpeppers.energydashboard', made: '2026-10-01', logs: { peakLog: { months: { '2026-09': 3000 } }, showerLog: { samples: [] } }, history: { days: {}, months: {} } });
  const done = await engine.webSettingsCall({ method: 'POST', path: '/backup-import', body: { id: 'x', part: 0, parts: 1, text: backup } });
  assert.strictEqual(done.restored, 2);
  assert.deepStrictEqual(homey.settings.get('energy.showerLog'), { samples: [] });
  const other = JSON.stringify({ app: 'com.example.other', logs: {}, history: {} });
  await assert.rejects(engine.webSettingsCall({ method: 'POST', path: '/backup-import', body: { id: 'y', part: 0, parts: 1, text: other } }), /back-up/);
});

test('Energy page: stopping leaves no timers, no Flow tags and no reaction to settings', async () => {
  const homey = fakeHomey(18693);
  const removed = [];
  homey.flow.createToken = async (id) => ({ setValue: async () => {}, unregister: async () => { removed.push(id); } });
  const engine = new EnergyEngine(hostFor(homey));
  await engine.onInit();
  await engine.updateHouseTokens();
  const count = engine.houseTokens.size;
  assert.ok(count > 0);
  await engine.stop();
  assert.strictEqual(engine.houseTokens.size, 0);
  assert.strictEqual(removed.length, count);
  assert.strictEqual(engine.timers.length, 0);
  assert.strictEqual(engine.webServer.status.running, false);
  const before = engine.historyCache.size;
  engine.historyCache.set('x', 1);
  engine.homey.settings.set('config', {});
  assert.strictEqual(engine.historyCache.size, before + 1, 'a change of the settings no longer does anything');
});

test('Energy page: the demo answers every block', async () => {
  const { engine } = createEnergyDemo({ port: 1, lang: 'en' });
  const live = await engine.getLive();
  assert.ok(live.layout.length > 5);
  for (const period of ['today', 'yesterday', 'week', 'month', 'year']) assert.ok((await engine.getHistory(period)).rows.length, period);
  assert.ok((await engine.getLayoutInfo()).blocks.length > 5);
});
