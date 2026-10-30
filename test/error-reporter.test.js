'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ErrorReporter, scrub, frames } = require('../lib/ErrorReporter');

function makeApp({ on = true, names = {} } = {}) {
  const timers = [];
  return {
    timers,
    getConfig: () => ({ reportErrors: on }),
    plans: { list: () => [{ name: 'Huize Jansen', actions: [{ name: 'Filmavond' }], levels: [{ name: 'Zolder', rooms: [{ name: 'Kamer van Sanne' }], items: [{ label: 'Lamp Pieter' }] }] }] },
    hub: {
      getDevices: async () => names.devices || [{ name: 'Lamp bij Anna', cls: 'light' }, { name: 'Sensor', cls: 'sensor' }, { name: 'Lamp 2', cls: 'light' }],
      getZones: async () => [{ name: 'Tuinhuis' }],
    },
    homey: { manifest: { version: '0.2.0' }, version: '12.3.0', setTimeout: (fn) => { timers.push(fn); return 1; } },
  };
}

function reporter(opts = {}, app = makeApp(opts)) {
  const sent = [];
  const r = new ErrorReporter(app, { endpoint: 'https://relay.example/report', send: async (url, body) => { sent.push(body); }, now: opts.now });
  return { r, sent, app };
}

test('nothing personal survives the cleaning', () => {
  const names = ['Kamer van Sanne', 'Lamp bij Anna'];
  const cases = [
    ['Device Lamp bij Anna failed in Kamer van Sanne', ['Anna', 'Sanne']],
    ['mail naar piet.jansen+test@voorbeeld.nl lukt niet', ['piet', 'voorbeeld']],
    ['connect to http://192.168.1.20:8080/x?token=abc failed', ['192.168', 'token', 'abc']],
    ['from 192.168.1.20 and fe80::1ff:fe23:4567:890a', ['192.168', 'fe80']],
    ['device 8f14e45f-ceea-4676-a1c2-3c1c6d3b9a11 gone', ['8f14e45f']],
    ['token 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', ['9f86d081']],
    ['locatie 52.123456 5.123456', ['52.123', '5.1234']],
    ['bel 06 12345678 of +31 6 12345678', ['12345678']],
    ['Unknown room "Slaapkamer Bas"', ['Bas']],
    ["kan 'Eigen Flow van Mia' niet starten", ['Mia']],
  ];
  for (const [text, gone] of cases) {
    const out = scrub(text, names);
    for (const word of gone) assert.ok(!out.includes(word), `${word} in ${out}`);
  }
  assert.strictEqual(scrub('Cannot read properties of undefined (reading level)'), 'Cannot read properties of undefined (reading level)', 'an ordinary error stays readable');
  assert.ok(scrub('x'.repeat(1000)).length <= 300);
});

test('of a stack only the place in the app stays, without the folders around it', () => {
  const stack = 'Error: boom\n    at f (C:\\Users\\Wiebe\\Downloads\\Claude\\app\\lib\\HouseExtras.js:12:3)\n    at /userdata/x\n    at g (/app/node_modules/homey-api/x.js:1:1)\n    at h (/app/web/editor.js:90:1)';
  const out = frames(stack);
  assert.deepStrictEqual(out, ['lib/HouseExtras.js:12', 'web/editor.js:90']);
  assert.ok(!JSON.stringify(out).includes('Wiebe'));
});

test('off by default: nothing is kept and nothing is sent', async () => {
  const { r, sent } = reporter({ on: false });
  r.capture(new Error('boom'));
  await r.flush();
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(r.waiting.size, 0);
  const noAddress = new ErrorReporter(makeApp(), { endpoint: '', send: async () => { throw new Error('no'); } });
  assert.strictEqual(noAddress.enabled, false, 'without an address nothing can leave');
});

test('a report holds no names and no id of this Homey', async () => {
  const { r, sent } = reporter();
  r.capture(new Error('Lamp bij Anna in Tuinhuis of Huize Jansen: Filmavond, Kamer van Sanne, Lamp Pieter, Zolder'));
  await r.flush();
  assert.strictEqual(sent.length, 1);
  const text = JSON.stringify(sent[0]);
  for (const word of ['Anna', 'Tuinhuis', 'Jansen', 'Filmavond', 'Sanne', 'Pieter', 'Zolder']) assert.ok(!text.includes(word), word);
  assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['app', 'count', 'fingerprint', 'homey', 'kinds', 'message', 'source', 'version', 'where'].sort());
  assert.deepStrictEqual(sent[0].kinds, { light: 2, sensor: 1 });
});

test('without the names nothing is sent', async () => {
  const app = makeApp();
  app.hub.getDevices = async () => { throw new Error('no connection'); };
  const { r, sent } = reporter({}, app);
  r.capture(new Error('Lamp bij Anna'));
  await r.flush();
  assert.strictEqual(sent.length, 0);
});

test('the same error once, with a count, and a limit on the rest', async () => {
  let t = 1e12;
  const { r, sent } = reporter({ now: () => t });
  for (let i = 0; i < 50; i++) r.capture(new Error('boom 12'));
  r.capture(new Error('boom 13'));
  await r.flush();
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].count, 51);
  r.capture(new Error('boom 12'));
  await r.flush();
  assert.strictEqual(sent.length, 1, 'known, not again');
  for (let i = 0; i < 30; i++) r.capture(new Error(`other ${String.fromCharCode(97 + i)}`));
  await r.flush();
  assert.strictEqual(sent.length, 5, 'at most 5 an hour');
  t += 2 * 3600000;
  for (let i = 0; i < 30; i++) r.capture(new Error(`again ${String.fromCharCode(97 + i)}`));
  await r.flush();
  assert.strictEqual(sent.length, 10);
});

test('reporting never harms the app', async () => {
  const { r } = reporter();
  r.send = async () => { throw new Error('offline'); };
  r.capture(new Error('boom'));
  await assert.doesNotReject(r.flush());
  const broken = new ErrorReporter({ getConfig() { throw new Error('x'); } }, { endpoint: 'https://x', send: async () => {} });
  assert.doesNotThrow(() => broken.capture(new Error('boom')));
  assert.doesNotThrow(() => r.capture(null));
  assert.doesNotThrow(() => r.capture('text'));
});

test('relay: only what it expects, cleaned again, one issue per error, and limits', async () => {
  const { default: worker, check } = await import('../relay/worker.mjs');
  const good = { app: 'homedeck', version: '0.2.0', homey: '12.3.0', source: 'app', fingerprint: '0123456789abcdef', message: 'boom at http://x.y/z from 192.168.1.2 mail a@b.nl', where: ['lib/App.js:1'], count: 1, kinds: { light: 3 } };
  const clean = check(good);
  assert.ok(!/x\.y|192\.168|a@b/.test(clean.message), clean.message);
  for (const bad of [null, {}, { ...good, app: 'x' }, { ...good, version: 'x' }, { ...good, fingerprint: 'zz' }, { ...good, source: 'x' }, { ...good, message: 'x'.repeat(301) }, { ...good, where: ['/Users/x/y.js'] }, { ...good, count: 0 }]) assert.strictEqual(check(bad), null);
  assert.ok(!('evil' in check({ ...good, kinds: { evil: 'x', light: 2 }, extra: 'secret' }).kinds));

  const store = new Map();
  const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', LIMITS: { get: async (k) => store.get(k) || null, put: async (k, v) => store.set(k, v) } };
  const calls = [];
  const realFetch = global.fetch;
  let issues = [];
  global.fetch = async (url, init) => {
    calls.push([init.method, url, init.body]);
    if (init.method === 'GET') return { ok: true, json: async () => issues };
    return { ok: true, json: async () => ({}) };
  };
  const post = (body, method = 'POST') => worker.fetch(new Request('https://relay.example/', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), env);
  try {
    assert.strictEqual((await post(good)).status, 201);
    assert.ok(calls.some(([m, u]) => m === 'POST' && u.endsWith('/repos/o/r/issues')));
    issues = [{ number: 7 }];
    assert.strictEqual((await post(good)).status, 202);
    assert.ok(calls.some(([, u]) => u.endsWith('/issues/7/comments')));
    assert.strictEqual((await post({ nonsense: true })).status, 400);
    assert.strictEqual((await post(good, 'GET')).status, 405);
    assert.strictEqual((await post({ ...good, message: 'x'.repeat(5000) })).status, 413);
    for (let i = 0; i < 18; i++) await post(good);
    assert.strictEqual((await post(good)).status, 429, 'a flood of one error stops');
    assert.ok(!JSON.stringify(calls).includes('192.168'));
  } finally {
    global.fetch = realFetch;
  }
});
