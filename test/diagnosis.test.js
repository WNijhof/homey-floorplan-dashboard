'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createDevApp } = require('../scripts/dev-server');
const { scrub } = require('../lib/Diagnosis');
const { samplePlan, sampleDevices } = require('../test/sample');

test('the diagnosis has the kinds of devices and the plan, but no names', async () => {
  const app = createDevApp({ port: 0 });
  app.recentErrors = ['calendar failed for https://calendar.example.com/private/abc.ics at 192.168.1.20'];
  const { email, report } = await app.getDiagnosisReport();
  const json = JSON.stringify(report);
  assert.ok(email && !/example/.test(email), 'a placeholder address gives way to the contact address');
  assert.strictEqual(report.devices.total, sampleDevices().length);
  assert.ok(report.devices.kinds.light >= 1);
  assert.strictEqual(report.plans[0].levels[0].rooms, samplePlan().levels[0].rooms.length);
  for (const d of sampleDevices()) assert.ok(!json.includes(`"${d.name}"`), `device name ${d.name}`);
  for (const r of samplePlan().levels[0].rooms) assert.ok(!json.includes(r.name), `room name ${r.name}`);
  assert.ok(!json.includes('calendar.example.com') && !json.includes('192.168.1.20'), 'links and addresses are cut out');
  assert.strictEqual(report.snapshot, undefined);
});

test('with the plan, every name is replaced and the devices still match', async () => {
  const app = createDevApp({ port: 0 });
  // An own photo of the house never leaves the Homey
  const own = app.plans.list()[0];
  app.plans.save(own.id, { ...own, actions: [{ kind: 'mood', id: 'moodid', name: 'SECRETMOOD' }], house: { outdoor: { door: 'SECRETLAMP' }, photo: { src: 'data:image/jpeg;base64,SECRETPHOTO', ratio: 0.5, areas: [] } } });
  const { report } = await app.getDiagnosisReport({ plan: true });
  assert.ok(!/SECRET|moodid/.test(JSON.stringify(report)));
  const { plan, devices } = report.snapshot;
  const json = JSON.stringify(report.snapshot);
  for (const r of samplePlan().levels[0].rooms) assert.ok(!json.includes(`"${r.name}"`), r.name);
  for (const d of sampleDevices()) assert.ok(!json.includes(`"${d.name}"`), d.name);
  assert.ok(plan.levels[0].rooms.every((r) => /^Room \d+$/.test(r.name)));
  const ids = new Set(devices.map((d) => d.id));
  const placed = plan.levels.flatMap((l) => l.items).filter((i) => i.kind === 'device');
  assert.ok(placed.length > 0 && placed.every((i) => ids.has(i.deviceId)));
  // Zones stay consistent between rooms and devices, so room temperatures still work.
  const roomZones = new Set(plan.levels[0].rooms.map((r) => r.zoneId));
  assert.ok(devices.some((d) => roomZones.has(d.zone)));
});

test('scrub removes links and addresses', () => {
  assert.strictEqual(scrub('a https://x.y/z b webcal://q 10.0.0.2'), 'a <url> b <url> <ip>');
});
