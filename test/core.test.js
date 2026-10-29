'use strict';

const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/shared/floorplan-core');
const { samplePlan, sampleDevices } = require('./sample');

const { rect } = core.geom;

test('shared room edges become one wall', () => {
  const level = core.newLevel('L');
  level.rooms = [
    { id: 'a', points: rect(0, 0, 300, 300) },
    { id: 'b', points: rect(300, 0, 600, 300) },
  ];
  const walls = core.levelWalls(level);
  assert.strictEqual(walls.length, 7);
  const shared = walls.find((w) => w.rooms.length === 2);
  assert.deepStrictEqual(shared.rooms.sort(), ['a', 'b']);
});

test('a door splits its wall into two pieces plus a lintel in 2.5D', () => {
  const level = core.newLevel('L');
  const wall = { id: 'w', a: [0, 0], b: [400, 0], t: 12 };
  const door = { id: 'd', type: 'door', x: 200, y: 0, angle: 0, width: 80 };
  const flat = core.wallPieces(wall, [door], level, false);
  assert.strictEqual(flat.length, 2);
  assert.deepStrictEqual(flat.map((p) => [p.a[0], p.b[0]]), [[0, 160], [240, 400]]);
  const tall = core.wallPieces(wall, [door], level, true);
  assert.ok(tall.some((p) => p.part === 'lintel' && p.z0 === 210 && p.z1 === level.wallHeight));
});

test('openings on a different or crossing wall are ignored', () => {
  const wall = { a: [0, 0], b: [400, 0], t: 12 };
  const perpendicular = { x: 200, y: 0, angle: Math.PI / 2, width: 80 };
  const far = { x: 200, y: 50, angle: 0, width: 80 };
  assert.strictEqual(core.openingsOnWall(wall, [perpendicular, far]).length, 0);
});

test('window pieces include a sill', () => {
  const level = core.newLevel('L');
  const pieces = core.wallPieces({ a: [0, 0], b: [400, 0], t: 12 }, [{ type: 'window', x: 200, y: 0, angle: 0, width: 100 }], level, true);
  assert.ok(pieces.some((p) => p.part === 'sill' && p.z1 === 90));
});

test('room readings average the zone, or use a chosen device', () => {
  const devices = [
    { id: 't1', zone: 'z', caps: { measure_temperature: 20 } },
    { id: 't2', zone: 'z', caps: { measure_temperature: 22, measure_humidity: 50 } },
    { id: 'th', zone: 'z', caps: { target_temperature: 21 } },
    { id: 'x', zone: 'other', caps: { measure_temperature: 5 } },
  ];
  const room = { id: 'r', zoneId: 'z', points: rect(0, 0, 100, 100) };
  assert.deepStrictEqual(core.roomReadings(room, devices), { temperature: 21, humidity: 50, target: 21, climateId: 'th' });
  assert.strictEqual(core.roomReadings({ ...room, tempDevice: 'x' }, devices).temperature, 5);
});

test('room temperature comes from the thermostat, not from a boiler in the same zone', () => {
  const devices = [
    { id: 'boiler', zone: 'attic', cls: 'boiler', caps: { measure_temperature: 58, target_temperature: 60 } },
    { id: 'heater', zone: 'attic', cls: 'heater', caps: { measure_temperature: 61, target_temperature: 55 } },
    { id: 'tado', zone: 'attic', cls: 'thermostat', caps: { measure_temperature: 19.4, target_temperature: 19, measure_humidity: 55 } },
  ];
  const room = { id: 'r', zoneId: 'attic', points: [[0, 0], [100, 0], [100, 100], [0, 100]] };
  assert.deepStrictEqual(core.roomReadings(room, devices), { temperature: 19.4, humidity: 55, target: 19, climateId: 'tado' });
  // Without a thermostat: only plausible room temperatures count.
  const noThermostat = devices.filter((d) => d.id !== 'tado').concat([{ id: 's', zone: 'attic', cls: 'sensor', caps: { measure_temperature: 18 } }]);
  assert.deepStrictEqual(core.roomReadings(room, noThermostat), { temperature: 18, humidity: null, target: null, climateId: null });
});

test('device kinds', () => {
  const k = (cls, caps) => core.deviceKind({ cls, caps });
  assert.strictEqual(k('light', { onoff: true }), 'light');
  assert.strictEqual(k('other', { onoff: true, dim: 1 }), 'light');
  assert.strictEqual(k('socket', { onoff: true, dim: 1 }), 'socket');
  assert.strictEqual(k('sensor', { alarm_smoke: false }), 'smoke');
  assert.strictEqual(k('windowcoverings', { windowcoverings_set: 0.5 }), 'cover');
  assert.strictEqual(k('lock', { locked: true }), 'lock');
  assert.strictEqual(k('sensor', { measure_temperature: 20 }), 'sensor');
  // Groups of lamps from a group app, even when the group's class is not "light".
  assert.strictEqual(core.deviceKind({ cls: 'other', group: true, caps: { onoff: true } }), 'light');
  assert.strictEqual(core.deviceKind({ cls: 'socket', group: true, caps: { onoff: true, measure_power: 5 } }), 'socket');
  assert.strictEqual(core.deviceKind({ cls: 'other', caps: { onoff: true } }), 'socket');
});

test('value text beside devices', () => {
  assert.strictEqual(core.deviceValueText({ cls: 'socket', caps: { onoff: true, measure_power: 1530 } }), '1.5 kW');
  assert.strictEqual(core.deviceValueText({ cls: 'light', caps: { onoff: true, dim: 0.42 } }), '42%');
  assert.strictEqual(core.deviceValueText({ cls: 'light', caps: { onoff: false, dim: 0.42 } }), null);
  assert.strictEqual(core.deviceValueText({ cls: 'sensor', caps: { measure_temperature: 19.94, measure_humidity: 51.2 } }), '19.9° · 51%');
  assert.strictEqual(core.deviceValueText({ cls: 'thermostat', caps: { measure_temperature: 20.94, target_temperature: 21 } }), '20.9° → 21°');
});

test('cover state', () => {
  assert.strictEqual(core.coverClosed({ caps: { windowcoverings_set: 0.25 } }), 0.75);
  assert.strictEqual(core.coverClosed({ caps: { windowcoverings_state: 'down' } }), 1);
  assert.strictEqual(core.coverClosed({ caps: {} }), null);
});

test('levels from zones', () => {
  const zones = [
    { id: 'home', name: 'Home', parent: null },
    { id: 'gf', name: 'Ground floor', parent: 'home' },
    { id: 'ff', name: 'First floor', parent: 'home' },
    { id: 'garden', name: 'Garden', parent: 'home' },
    { id: 'k', name: 'Kitchen', parent: 'gf' },
    { id: 'l', name: 'Living', parent: 'gf' },
    { id: 'b', name: 'Bedroom', parent: 'ff' },
  ];
  const levels = core.levelsFromZones(zones);
  assert.deepStrictEqual(levels.map((l) => l.name), ['Ground floor', 'First floor', 'Other']);
  assert.deepStrictEqual(levels[0].rooms.map((r) => r.zoneId), ['k', 'l']);
  assert.deepStrictEqual(levels[2].rooms.map((r) => r.name), ['Garden']);
  // Rooms are laid out without overlapping.
  assert.notDeepStrictEqual(levels[0].rooms[0].points, levels[0].rooms[1].points);
});

test('auto place keeps devices inside the room', () => {
  const room = { id: 'r', points: rect(0, 0, 400, 300) };
  const devs = [
    { id: 'l1', cls: 'light', caps: { onoff: true } },
    { id: 'l2', cls: 'light', caps: { onoff: true } },
    { id: 's', cls: 'sensor', caps: { measure_temperature: 20 } },
    { id: 'p', cls: 'socket', caps: { onoff: true } },
  ];
  const items = core.autoPlace(room, devs);
  assert.strictEqual(items.length, 4);
  for (const i of items) assert.ok(core.geom.pointInPolygon([i.x, i.y], room.points), `${i.deviceId} inside`);
});

test('render produces svg for every view without NaN', () => {
  const plan = samplePlan();
  for (const mode of ['2d', 'iso', 'game', 'steep']) {
    for (const turn of [0, 1, 2, 3]) {
      const out = core.render({ plan, level: plan.levels[0], devices: sampleDevices(), view: { mode, turn }, tint: 'temperature' });
      assert.ok(out.svg.length > 1000);
      assert.ok(!/NaN|undefined/.test(out.svg), `${mode}/${turn} has NaN or undefined`);
      assert.ok(out.viewBox.every(Number.isFinite));
    }
  }
});

test('render escapes names', () => {
  const plan = samplePlan();
  plan.levels[0].rooms[0].name = '<img src=x onerror=alert(1)>';
  const out = core.render({ plan, level: plan.levels[0], devices: [] });
  assert.ok(!out.svg.includes('<img'));
});

test('empty level renders', () => {
  const out = core.render({ plan: core.newPlan(), level: core.newLevel('x'), devices: [] });
  assert.ok(out.viewBox.every(Number.isFinite));
});
