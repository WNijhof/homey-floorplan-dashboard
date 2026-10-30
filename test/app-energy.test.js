'use strict';

// The rule for the Energy page in the real app.js, with a stand-in for Homey: the built-in page runs unless the app
// Energy Dashboard is installed, and then that app keeps its place.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const { demoEnergyDevices } = require('./demo-energy');

const load = Module._load;
Module._load = function stub(request, ...rest) {
  if (request === 'homey') return { App: class { log() {} error() {} }, env: {} };
  return load.call(this, request, ...rest);
};
const FloorplanApp = require('../app');
Module._load = load;

function makeApp({ energyApp = null } = {}) {
  const store = new Map();
  const timers = [];
  const cards = {};
  const app = new FloorplanApp();
  app.cards = cards;
  app.homey = {
    timers,
    manifest: { id: 'x', version: '9.9.9', author: { name: 'Dev' } },
    clock: { getTimezone: () => 'Europe/Amsterdam' },
    cloud: { getLocalAddress: async () => '192.0.2.1:80' },
    geolocation: { getLatitude: () => 52.1, getLongitude: () => 5.1 },
    notifications: { createNotification: async () => {} },
    i18n: { getLanguage: () => 'nl' },
    flow: {
      getActionCard: (id) => ({ registerRunListener(fn) { cards[id] = fn; } }),
      createToken: async () => ({ setValue: async () => {}, unregister: async () => {} }),
    },
    api: {
      getApiApp: () => ({
        getInstalled: async () => !!energyApp,
        get: async () => energyApp,
      }),
    },
    settings: {
      get: (k) => store.get(k),
      set: (k, v) => store.set(k, v),
      unset: (k) => store.delete(k),
      getKeys: () => [...store.keys()],
      on() {},
    },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); timers.push(t); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref(); timers.push(t); return t; },
    clearTimeout: (t) => clearTimeout(t),
    clearInterval: (t) => clearInterval(t),
  };
  const devices = Object.fromEntries(demoEnergyDevices('nl', new Date(2026, 9, 1, 13)).map((d) => [d.id, d]));
  app.hub = { api: { devices: { getDevices: async () => devices }, apps: { getApp: async () => (energyApp ? { state: 'running', version: '1' } : null) } } };
  app.hubReady = Promise.resolve();
  return app;
}

test('without Energy Dashboard the page is built in, and the switch leads to it', async (t) => {
  const app = makeApp();
  t.after(() => app.homey.timers.forEach(clearTimeout));
  await app.startEnergy();
  assert.ok(app.energyEngine, 'the engine runs');
  assert.strictEqual((await app.getEnergyPage()).server, app.energyEngine.webServer);
  assert.deepStrictEqual((await app.getSiblings()).map((s) => [s.key, s.path]), [['energy', 'energy/']]);
  const first = app.energyEngine;
  await app.startEnergy();
  assert.strictEqual(app.energyEngine, first, 'started once');
});

test('with Energy Dashboard installed that app stays the energy page and nothing runs twice', async () => {
  const app = makeApp({ energyApp: { running: true, port: 8686 } });
  await app.startEnergy();
  assert.strictEqual(app.energyEngine, undefined);
  assert.deepStrictEqual(await app.getEnergyPage(), { port: 8686 });
  assert.deepStrictEqual(app.energyConfig(), {});
  assert.strictEqual(app.homey.timers.length, 0);
});

test('Flow cards say why they do nothing while Energy Dashboard does the work', async () => {
  const app = makeApp({ energyApp: { running: true, port: 8686 } });
  app.guardEnergyCards();
  await app.startEnergy();
  await assert.rejects(app.cards['shower-start'](), /Energie Dashboard is ge/);
});

test('when Energy Dashboard appears later, the built-in page stops and the switch follows', async (t) => {
  const app = makeApp();
  t.after(() => app.homey.timers.forEach(clearTimeout));
  app.guardEnergyCards();
  await app.startEnergy();
  const engine = app.energyEngine;
  assert.ok(engine);
  app.homey.api.getApiApp = () => ({ getInstalled: async () => true, get: async () => ({ running: true, port: 8686 }) });
  await app.startEnergy();
  assert.strictEqual(app.energyEngine, null);
  assert.strictEqual(engine.stopped, true);
  assert.deepStrictEqual(await app.getEnergyPage(), { port: 8686 });
  await assert.rejects(app.cards['shower-stop'](), /Energie Dashboard/);
});

test('nothing is started without a connection to Homey, and the next try can still start it', async (t) => {
  const app = makeApp();
  t.after(() => app.homey.timers.forEach(clearTimeout));
  app.hubReady = Promise.reject(new Error('no connection'));
  app.hubReady.catch(() => {});
  await assert.rejects(app.startEnergy());
  assert.strictEqual(app.energyEngine, undefined);
  app.hubReady = Promise.resolve();
  await app.startEnergy();
  assert.ok(app.energyEngine);
});
