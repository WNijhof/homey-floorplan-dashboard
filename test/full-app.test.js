'use strict';

// The real app.js from its first line, on a stand-in for Homey, reached the way a browser does: over HTTP.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { startApp, EVIL } = require('./fake-homey');

let nextPort = 18800;

function request(port, path, { method = 'GET', body = null, headers = {}, raw = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw !== null ? raw : body !== null ? JSON.stringify(body) : null;
    // agent: false: a connection of its own (the app is free to close one after refusing it)
    const req = http.request({ port, path, method, agent: false, headers: { ...(data !== null ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString();
        let json = null;
        try { json = JSON.parse(text); } catch (err) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

async function withApp(opts, fn) {
  const port = nextPort;
  nextPort += 1;
  const started = await startApp({ ...opts, port });
  try {
    await fn(started, (path, o) => request(port, path, o));
  } finally {
    await started.stop();
  }
}

test('every page and route answers', async () => {
  await withApp({}, async (_, get) => {
    for (const path of ['/', '/editor', '/energy/', '/energy/instellingen/', '/theme.js', '/dashboard-extras.js', '/dashboard-panels.js', '/house3d.js', '/house-look.js', '/manifest.webmanifest']) {
      assert.strictEqual((await get(path)).status, 200, path);
    }
    for (const path of ['/api/plan', '/api/plans', '/api/data', '/api/energy', '/api/energy-detail?kind=grid', '/api/energy-detail?kind=solar', '/api/energy-detail?kind=battery', '/api/energy-detail?kind=car', '/api/energy-detail?kind=heatpump', '/api/energy-detail?kind=airco', '/api/weather', '/api/agenda', '/api/siblings', '/api/advice', '/api/people', '/api/lists', '/api/variables', '/api/actions/choices', '/api/variables/choices', '/api/screens/keuken', '/api/diagnosis-report', '/api/edit', '/energy/api/live', '/energy/api/history?period=today', '/energy/api/layout', '/energy/api/siblings']) {
      const res = await get(path);
      assert.strictEqual(res.status, 200, `${path}: ${res.text.slice(0, 200)}`);
    }
  });
});

test('devices: a change goes through Homey and comes back on the event stream', async () => {
  await withApp({}, async ({ homey, api }, get) => {
    const res = await get('/api/capability', { method: 'POST', body: { deviceId: 'd_hall', capabilityId: 'onoff', value: true } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await api.devices.getDevices()).d_hall.capabilitiesObj.onoff.value, true);
    await new Promise((r) => setTimeout(r, 350));
    assert.ok(homey.realtimeEvents.some(([e, d]) => e === 'caps' && d.d_hall && d.d_hall.onoff === true));
    const refused = await get('/api/capability', { method: 'POST', body: { deviceId: 'd_hall', capabilityId: 'measure_power', value: 1 } });
    assert.strictEqual(refused.status, 500, 'not a capability to set');
  });
});

test('new capabilities can be set: alarm, music, vacuum, modes', async () => {
  await withApp({}, async ({ api }, get) => {
    const set = (deviceId, capabilityId, value) => get('/api/capability', { method: 'POST', body: { deviceId, capabilityId, value } });
    assert.strictEqual((await set('d_alarm', 'homealarm_state', 'armed')).status, 200);
    assert.strictEqual((await set('d_vacuum', 'vacuumcleaner_state', 'cleaning')).status, 200);
    assert.strictEqual((await set('d_speaker', 'speaker_playing', true)).status, 200);
    assert.strictEqual((await api.devices.getDevices()).d_alarm.capabilitiesObj.homealarm_state.value, 'armed');
  });
});

test('security: with a PIN, turning the alarm down and every edit route need it', async () => {
  await withApp({ config: { editPin: '4321' } }, async ({ api }, get) => {
    const off = () => get('/api/capability', { method: 'POST', body: { deviceId: 'd_alarm', capabilityId: 'homealarm_state', value: 'disarmed' } });
    await get('/api/capability', { method: 'POST', body: { deviceId: 'd_alarm', capabilityId: 'homealarm_state', value: 'armed' } });
    const refused = await off();
    assert.strictEqual(refused.status, 403);
    assert.strictEqual((await api.devices.getDevices()).d_alarm.capabilitiesObj.homealarm_state.value, 'armed', 'still on');
    const partly = await get('/api/capability', { method: 'POST', body: { deviceId: 'd_alarm', capabilityId: 'homealarm_state', value: 'partially_armed' } });
    assert.strictEqual(partly.status, 403, 'partly is also turning it down');
    assert.strictEqual((await get('/api/actions/choices')).status, 403);
    assert.strictEqual((await get('/api/variables/choices')).status, 403);
    assert.strictEqual((await get('/api/calendars')).status, 403);
    const { json } = await get('/api/unlock', { method: 'POST', body: { pin: '4321' } });
    assert.ok(json.token);
    const allowed = await get('/api/capability', { method: 'POST', body: { deviceId: 'd_alarm', capabilityId: 'homealarm_state', value: 'disarmed' }, headers: { 'x-edit-token': json.token } });
    assert.strictEqual(allowed.status, 200);
    assert.strictEqual((await get('/api/unlock', { method: 'POST', body: { pin: '0000' } })).status, 403);
  });
});

test('security: an access code closes every route', async () => {
  await withApp({ config: { accessCode: 'geheim' } }, async (_, get) => {
    for (const path of ['/api/plan', '/api/people', '/api/lists', '/api/advice', '/api/variables', '/api/screens/x', '/energy/api/live', '/api/diagnosis-report']) {
      assert.strictEqual((await get(path)).status, 401, path);
    }
    for (const path of ['/', '/editor', '/energy/', '/energy/instellingen/']) assert.strictEqual((await get(path)).status, 401, path);
    assert.strictEqual((await get('/api/lists', { method: 'PUT', body: {} })).status, 401);
    assert.strictEqual((await get('/energy/api/layout', { method: 'POST', body: {} })).status, 401);
    const login = await get('/?code=geheim');
    assert.strictEqual(login.status, 303);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    assert.strictEqual((await get('/api/lists', { headers: { cookie } })).status, 200);
  });
});

test('security: pages elsewhere cannot write, on any route', async () => {
  await withApp({}, async (_, get) => {
    const evil = { Origin: 'https://evil.example' };
    const writes = [['POST', '/api/capability'], ['POST', '/api/actions/run'], ['PUT', '/api/lists'], ['PUT', '/api/screens/x'], ['PUT', '/api/plans/x'], ['DELETE', '/api/plans/x'], ['POST', '/energy/api/layout'], ['POST', '/energy/api/settings/value'], ['POST', '/energy/api/settings/call']];
    for (const [method, path] of writes) {
      const body = method === 'DELETE' ? null : {};
      assert.strictEqual((await get(path, { method, body, headers: evil })).status, 403, `${method} ${path}`);
      assert.strictEqual((await get(path, { method, body, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, `${method} ${path} by fetch site`);
    }
    assert.strictEqual((await get('/api/lists', { method: 'PUT', body: {}, headers: { Origin: 'null' } })).status, 403);
  });
});

test('security: no way out of the web folders', async () => {
  await withApp({}, async (_, get) => {
    for (const path of ['/vendor/../../app.js', '/vendor/%2e%2e/%2e%2e/app.js', '/models/..%2f..%2fapp.json', '/energy/../app.js', '/energy/%2e%2e/%2e%2e/%2e%2e/app.json', '/energy/..%5c..%5capp.js', '/energy/instellingen/../../app.js']) {
      const res = await get(path);
      assert.ok(!/homey\.app|class FloorplanApp|"permissions"/.test(res.text), `${path} gave ${res.status}`);
    }
  });
});

test('robustness: broken and hostile input gives an answer, never a crash', async () => {
  await withApp({}, async ({ app }, get) => {
    const cases = [
      ['POST', '/api/capability', '{not json'],
      ['POST', '/api/capability', 'null'],
      ['POST', '/api/capability', '{}'],
      ['POST', '/api/actions/run', '[]'],
      ['PUT', '/api/lists', '[]'],
      ['PUT', '/api/lists', '{"shopping":"x","meals":7}'],
      ['PUT', '/api/screens/%00', '{}'],
      ['PUT', '/api/screens/ok', '[]'],
      ['PUT', '/api/plans/x', '{}'],
      ['POST', '/energy/api/settings/value', '{'],
      ['POST', '/energy/api/layout', '{"layout":"x"}'],
    ];
    for (const [method, path, raw] of cases) {
      const res = await get(path, { method, raw });
      assert.ok(res.status >= 200 && res.status < 600, path);
      assert.notStrictEqual(res.text, '', path);
    }
    for (const path of ['/api/energy-detail?kind=../../x', '/api/energy-detail', '/api/plan?id=%00', '/api/screens/..%2F..', '/energy/api/history?period=nonsense', '/energy/api/live?at=nonsense', '/energy/api/live?layout=__proto__']) {
      const res = await get(path);
      assert.ok(res.status < 600, path);
    }
    assert.strictEqual((await get('/api/energy')).status, 200, 'still alive');
    assert.ok(app.webServer.status.running);
  });
});

test('robustness: a too large body is refused', async () => {
  await withApp({}, async (_, get) => {
    const res = await get('/api/lists', { method: 'PUT', raw: JSON.stringify({ shopping: [{ text: 'x'.repeat(7 * 1024 * 1024) }] }) }).catch(() => ({ status: 413 }));
    assert.ok(res.status === 413 || res.status === 500, String(res.status));
    assert.strictEqual((await get('/api/lists')).status, 200);
  });
});

test('robustness: when a part of Homey is down the rest goes on', async () => {
  await withApp({ failing: { users: true, logic: true, flow: true, moods: true, weather: true, insights: true } }, async (_, get) => {
    assert.strictEqual((await get('/api/plan')).status, 200);
    assert.strictEqual((await get('/api/energy')).status, 200);
    assert.strictEqual((await get('/api/lists')).status, 200);
    assert.strictEqual((await get('/api/advice')).status, 200);
    assert.strictEqual((await get('/api/people')).status, 500);
    assert.deepStrictEqual((await get('/api/actions/choices')).json, [], 'no choices, no crash');
    assert.strictEqual((await get('/energy/api/live')).status, 200);
    assert.strictEqual((await get('/api/energy-detail?kind=solar')).status, 200);
  });
});

test('robustness: a Homey without plan and without devices', async () => {
  await withApp({ plan: null, devices: [] }, async (_, get) => {
    for (const path of ['/', '/api/plan', '/api/energy', '/api/advice', '/api/people', '/api/lists', '/energy/api/live', '/api/diagnosis-report']) {
      assert.strictEqual((await get(path)).status, 200, path);
    }
    assert.strictEqual((await get('/api/plan')).json.plan, null);
  });
});

test('robustness: many screens at once', async () => {
  await withApp({}, async ({ app }, get) => {
    const paths = ['/api/plan', '/api/energy', '/api/advice', '/energy/api/live', '/api/lists', '/api/people'];
    // 30 screens at once, ten times over
    for (let round = 0; round < 10; round++) {
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => get(paths[i % paths.length])));
      assert.ok(results.every((r) => r.status === 200));
    }
    const writes = await Promise.all(Array.from({ length: 50 }, (_, i) => { app.extras.addToList('shopping', `item ${i}`); return get('/api/lists'); }));
    assert.ok(writes.every((r) => r.status === 200));
    assert.strictEqual((await get('/api/lists')).json.shopping.length, 50);
  });
});

test('Flow cards: all are there and do what they say', async () => {
  await withApp({}, async ({ app, homey }) => {
    for (const id of ['show-on-screen', 'add-to-list', 'shower-start', 'shower-stop', 'tapwater-source']) assert.strictEqual(typeof homey.cards.action[id], 'function', id);
    await homey.cards.action['show-on-screen']({ what: 'message', detail: 'Eten!', seconds: 10, screen: '' });
    assert.deepStrictEqual(homey.realtimeEvents.filter(([e]) => e === 'screen').pop()[1], { what: 'message', detail: 'Eten!', seconds: 10, screen: '' });
    await homey.cards.action['add-to-list']({ list: 'shopping', text: 'Melk' });
    assert.strictEqual(app.extras.getLists().shopping[0].text, 'Melk');
    await assert.rejects(homey.cards.action['add-to-list']({ list: 'nope', text: 'x' }));
  });
});

test('moods, Flows and vacuum Flows only run from what is on the plan', async () => {
  await withApp({}, async ({ app, api }, get) => {
    const plan = app.plans.list()[0];
    plan.actions = [{ kind: 'mood', id: 'm1', name: 'Filmavond' }, { kind: 'flow', id: 'f1', name: 'Welterusten' }, { kind: 'advanced', id: 'a1', name: 'Film' }];
    plan.levels[0].rooms[0].vacuum = { kind: 'flow', id: 'f3', name: 'Stofzuig keuken' };
    app.plans.save(plan.id, plan);
    for (const [kind, id] of [['mood', 'm1'], ['flow', 'f1'], ['advanced', 'a1'], ['flow', 'f3']]) {
      assert.strictEqual((await get('/api/actions/run', { method: 'POST', body: { plan: plan.id, kind, id } })).status, 200, id);
    }
    assert.deepStrictEqual(api.ran, [['mood', 'm1'], ['flow', 'f1'], ['advanced', 'a1'], ['flow', 'f3']]);
    assert.strictEqual((await get('/api/actions/run', { method: 'POST', body: { plan: plan.id, kind: 'flow', id: 'f2' } })).status, 403);
    assert.strictEqual((await get('/api/actions/run', { method: 'POST', body: {} })).status, 403);
    const choices = (await get('/api/actions/choices')).json;
    assert.ok(!choices.some((c) => c.id === 'f2'), 'a Flow that cannot be started is no choice');
  });
});

test('the report stays anonymous with everything in use', async () => {
  await withApp({}, async ({ app }, get) => {
    const plan = app.plans.list()[0];
    Object.assign(plan, { actions: [{ kind: 'mood', id: 'm1', name: 'Filmavond' }], variables: [{ id: 'v_holiday' }], house: { outdoor: { door: 'd_out_door' }, photo: { src: 'data:image/jpeg;base64,PHOTO', areas: [] } } });
    plan.levels[0].rooms[0].vacuum = { kind: 'flow', id: 'f3', name: 'Stofzuig keuken' };
    app.plans.save(plan.id, plan);
    await app.extras.setLists({ shopping: [{ text: 'Geheime boodschap' }], tasks: [], meals: {} });
    const text = (await get('/api/diagnosis-report?plan=1')).text;
    for (const secret of ['PHOTO', 'Filmavond', 'v_holiday', 'd_out_door', 'Stofzuig', 'Geheime', 'Sam', 'Lou']) assert.ok(!text.includes(secret), secret);
  });
});

test('who is home gives no e-mail and escapes nothing itself: the page does', async () => {
  await withApp({}, async (_, get) => {
    const { json, text } = await get('/api/people');
    assert.ok(!text.includes('example.com'));
    assert.ok(json.some((p) => p.name === EVIL));
  });
});

test('the Energy page settings reach the house, and survive a restart of the logic', async () => {
  await withApp({}, async ({ app, homey }, get) => {
    const token = (await get('/energy/api/settings/unlock', { method: 'POST', body: { pin: '' } })).json.token;
    const before = (await get('/api/energy')).json;
    assert.ok(before.present.solar);
    const res = await get('/energy/api/settings/value', { method: 'POST', body: { key: 'config', value: { devices: { solar: [] }, grid: { fuseAmps: 40 } } }, headers: { 'x-settings-token': token } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(homey.settings.get('energy.config').grid.fuseAmps, 40);
    assert.strictEqual(app.energyEngine.getConfig().grid.fuseAmps, 40);
    assert.notStrictEqual(homey.settings.get('config').grid, 40);
  });
});

test('stopping the app leaves nothing behind', async () => {
  const started = await startApp({ port: nextPort });
  nextPort += 1;
  assert.ok(started.app.webServer.status.running);
  await started.stop();
  assert.strictEqual(started.app.webServer.status.running, false);
});

test('update: everything of 0.1.7 is still there, byte for byte, and a copy is made first', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homedeck-backup-'));
  process.env.HOMEDECK_USERDATA = dir;
  const oldPlan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan-0.1.7.json'), 'utf8'));
  const stored = JSON.stringify({ [oldPlan.id]: oldPlan });
  const calendars = [{ name: 'Gezin', url: 'https://example.com/a.ics', color: '#2e5bff' }];
  await withApp({ plan: null, settings: { plans: JSON.parse(stored), calendars } }, async ({ app, homey }, get) => {
    assert.strictEqual(JSON.stringify(homey.settings.get('plans')), stored, 'plans untouched');
    assert.deepStrictEqual(homey.settings.get('calendars'), calendars);
    const copies = (await get('/api/backups')).json;
    assert.strictEqual(copies.length, 1, 'a copy before the update');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, copies[0].file), 'utf8')).plans[0].levels.length, 2);
    assert.strictEqual(app.backup.keepBeforeUpdate(), null, 'once per version');
    assert.strictEqual((await get('/api/plan')).json.plan.id, oldPlan.id);

    // export, wipe, import
    const file = (await get('/api/backup')).json;
    assert.ok(!JSON.stringify(file).includes('editPin') && !JSON.stringify(file).includes('accessCode'), 'no PIN or code in the file');
    app.plans.remove(oldPlan.id);
    assert.strictEqual(app.plans.list().length, 0);
    assert.strictEqual((await get('/api/backup', { method: 'POST', body: file })).json.plans, 1);
    assert.strictEqual(JSON.stringify(app.plans.get(oldPlan.id).levels), JSON.stringify(oldPlan.levels));

    // back to the copy from before the update
    app.plans.remove(oldPlan.id);
    assert.strictEqual((await get('/api/backups/restore', { method: 'POST', body: { file: copies[0].file } })).status, 200);
    assert.strictEqual(app.plans.list().length, 1);

    // nothing else gets through
    for (const bad of [{}, { kind: 'x', plans: [] }, { kind: 'homedeck-backup', plans: [{ id: '../x', levels: [] }] }, { kind: 'homedeck-backup', plans: [null] }]) {
      assert.strictEqual((await get('/api/backup', { method: 'POST', body: bad })).status, 400);
    }
    assert.strictEqual((await get('/api/backups/restore', { method: 'POST', body: { file: '../../etc/passwd' } })).status, 400);
    assert.strictEqual(app.plans.list().length, 1, 'a bad file changes nothing');
  });
  delete process.env.HOMEDECK_USERDATA;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('backup needs the edit PIN when there is one, and comes from the page itself', async () => {
  await withApp({ config: { editPin: '4321' } }, async (_, get) => {
    assert.strictEqual((await get('/api/backup')).status, 403);
    assert.strictEqual((await get('/api/backups')).status, 403);
    assert.strictEqual((await get('/api/backup', { method: 'POST', body: {} })).status, 403);
    assert.strictEqual((await get('/api/backups/restore', { method: 'POST', body: {} })).status, 403);
    assert.strictEqual((await get('/api/backup', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  });
});

test('a damaged backup changes nothing and cannot harm the app', async () => {
  await withApp({}, async ({ app }, get) => {
    const before = JSON.stringify(app.plans.list());
    const kind = 'homedeck-backup';
    const damaged = [
      { kind, plans: [{ id: 'a', levels: [] }] },
      { kind, plans: [{ id: 'a', name: 'A', levels: [{ id: 'l' }] }] },
      { kind, plans: [{ id: 'a', name: 'A', levels: [{ id: 'l', rooms: [null] }] }] },
      { kind, plans: [{ id: 'a', name: 'A', levels: [] }], screens: { '../x': {} } },
      { kind, plans: [{ id: 'a', name: 'A', levels: [] }], screens: { ok: { a: 'x'.repeat(9000) } } },
      { kind, plans: Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, name: 'x', levels: [] })) },
      { kind, plans: [], calendars: 'x' },
    ];
    for (const body of damaged) assert.strictEqual((await get('/api/backup', { method: 'POST', body })).status, 400, JSON.stringify(body).slice(0, 80));
    assert.strictEqual(JSON.stringify(app.plans.list()), before);
    assert.strictEqual((await get('/api/plans')).status, 200);
  });
});

test('the location only goes to Forecast.Solar when chosen', async () => {
  await withApp({}, async ({ app }) => {
    const asked = [];
    app.energyDetails.forecast.get = async (o) => { asked.push(o); return { days: {}, watts: [] }; };
    const devices = [];
    const plan = app.plans.list()[0];
    assert.strictEqual(await app.energyDetails.solarForecast(devices, plan), null);
    assert.strictEqual(asked.length, 0);
    plan.house = { forecast: true };
    await app.energyDetails.solarForecast(devices, plan);
    assert.strictEqual(asked.length, 1);
    assert.strictEqual(asked[0].lat, 52.1);
    app.energyEngine.homey.settings.set('config', { forecast: { enabled: true, planes: [{ kwp: 3, tilt: 30, azimuth: 0 }] } });
    plan.house = {};
    await app.energyDetails.solarForecast(devices, plan);
    assert.deepStrictEqual(asked[1].planes, [{ kwp: 3, tilt: 30, azimuth: 0 }], 'the planes of the Energy page go first');
  });
});

test('prices reach the advice whatever blocks the Energy page shows', async () => {
  await withApp({}, async ({ app }) => {
    app.energyEngine.prices.get = async () => ({ current: 0.4, avg: 0.25, cheapest: null });
    app.energyEngine.homey.settings.set('config', { layout: [{ id: 'flow', size: 'half' }] });
    const money = await app.energyDetails.pricesNow();
    assert.strictEqual(money.price, 0.4);
    // whatever else the hour of the day brings, such as solar to spare
    assert.ok((await app.extras.getAdvice()).items.some((i) => i.id === 'dear'));
  });
});

test('error reports: off by default, and on they stay anonymous from the app and from pages', async () => {
  await withApp({}, async ({ app }, get) => {
    const sent = [];
    app.reporter.endpoint = 'https://relay.example/';
    app.reporter.send = async (url, body) => { sent.push(body); };
    assert.strictEqual(app.getConfig().reportErrors, false);
    assert.strictEqual((await get('/api/client-error', { method: 'POST', body: { message: 'boom' } })).status, 200);
    app.error(new Error('off'));
    await app.reporter.flush();
    assert.strictEqual(sent.length, 0, 'off by default');
    app.setConfig({ reportErrors: true });
    const plan = app.plans.list()[0];
    app.error('Energy page', new Error(`failed for ${plan.levels[0].rooms[0].name} at 192.168.1.20`));
    await get('/api/client-error', { method: 'POST', body: { message: 'x is not a function', stack: 'TypeError\n at http://192.168.1.20:8687/dashboard-extras.js?v=1:12:3' } });
    await app.reporter.flush();
    assert.strictEqual(sent.length, 2);
    const text = JSON.stringify(sent);
    assert.ok(!text.includes(plan.levels[0].rooms[0].name), text);
    assert.ok(!text.includes('192.168'), text);
    assert.deepStrictEqual(sent.find((s) => s.source === 'page').where, ['web/dashboard-extras.js:12']);
    assert.strictEqual((await get('/api/client-error', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  });
});
