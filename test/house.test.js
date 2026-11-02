'use strict';

const test = require('node:test');
const assert = require('node:assert');
const house = require('../lib/shared/house-core');
const { summarize } = require('../lib/EnergyHub');
const { demoEnergyDevices } = require('./demo-energy');
const { demoPlan } = require('./demo-house');

test('house settings get defaults and drop unknown values', () => {
  const s = house.settings({ house: { roof: 'dome', pitch: 80, carport: 'left', objects: { solar: { show: 'off', panels: 12.4 } } } });
  assert.strictEqual(s.roof, 'gable');
  assert.strictEqual(s.pitch, 55);
  assert.strictEqual(s.carport, 'left');
  assert.strictEqual(s.objects.solar.show, 'off');
  assert.strictEqual(s.objects.solar.panels, 12);
  assert.strictEqual(s.objects.battery.show, 'auto');
});

test('own photo: checked areas, a card on each part, storeys to tap, nothing else', () => {
  const plan = {
    levels: [{ id: 'l1', name: 'Begane <grond>', rooms: [] }],
    house: {
      photo: {
        src: 'data:image/jpeg;base64,AAAA',
        ratio: 0.5,
        areas: [
          { kind: 'solar', pts: [[0.1, 0.1], [0.4, 0.1], [0.4, 3], [0.1, 0.3]] },
          { kind: 'level', id: 'l1', pts: [[0.5, 0.5], [0.9, 0.5], [0.9, 0.9]] },
          { kind: 'level', id: 'gone', pts: [[0, 0], [1, 0], [1, 1]] },
          { kind: 'bogus', pts: [[0, 0], [1, 0], [1, 1]] },
          { kind: 'grid', pts: [[0, 0], [1, 0]] },
        ],
      },
    },
  };
  const set = house.settings(plan);
  assert.strictEqual(set.photo.areas.length, 3);
  assert.strictEqual(set.photo.areas[0].pts[2][1], 1, 'a corner stays on the photo');
  const out = house.photoView(plan, { energy: { solarW: 2500 }, lang: 'nl', texts: { solar: 'Zon' } });
  assert.deepStrictEqual(out.viewBox, [0, 0, 22, 11]);
  assert.match(out.svg, /<image href="data:image\/jpeg;base64,AAAA"/);
  assert.match(out.svg, /<polygon class="fp-harea"[^>]*data-house="solar"/);
  assert.match(out.svg, /<g data-house="solar" class="fp-hcard"/);
  assert.match(out.svg, /2,5 kW/);
  assert.match(out.svg, /data-house="level" data-id="l1"/);
  assert.match(out.svg, /Begane &lt;grond&gt;/);
  assert.ok(!/gone|bogus/.test(out.svg));
  assert.strictEqual(house.photoView({ levels: [] }, {}), null);
});

test('own photo: a text in the picture field cannot break out of the page', () => {
  const out = house.photoView({ house: { photo: { src: '"><script>alert(1)</script>', areas: [] } } }, {});
  assert.ok(!out.svg.includes('<script>'));
});

test('the sun: day and night at the place of the Homey', () => {
  const at = (iso) => new Date(iso);
  assert.strictEqual(house.isNight(52.1, 5.1, at('2026-06-21T11:30:00Z')), false, 'summer noon');
  assert.strictEqual(house.isNight(52.1, 5.1, at('2026-12-21T23:00:00Z')), true, 'winter midnight');
  assert.strictEqual(house.isNight(52.1, 5.1, at('2026-12-21T07:30:00Z')), false, 'winter dawn is light enough');
  assert.strictEqual(house.isNight(52.1, 5.1, at('2026-12-21T17:30:00Z')), true, 'winter evening');
  assert.strictEqual(house.isNight(52.1, 5.1, at('2026-06-21T20:00:00Z')), false, 'summer evening is still light');
  assert.strictEqual(house.isNight(-33.9, 151.2, at('2026-01-15T02:00:00Z')), false, 'Sydney at noon');
});

test('demo: the grid part names its cheapest hours', () => {
  const { demoDetail } = require('./demo-energy');
  assert.strictEqual(demoDetail('grid', new Date()).cheapest.hours, 3);
});

test('the drawing: panels on every roof side of a hip roof', () => {
  for (const facing of [0, 90, 180, 270]) {
    for (const ridge of ['width', 'depth']) {
      const out = house.drawing({ levels: [], house: { roof: 'hip', ridge, facing, objects: { solar: { show: 'on' } } } }, { texts: { solar: 'Zon' } });
      assert.match(out.svg, /<g data-house="solar"/, `${facing} ${ridge}`);
    }
  }
});

test('details: a heat pump on measure_power.in and a battery with two powers are read the right way', async () => {
  const { EnergyDetails } = require('../lib/EnergyDetails');
  const now = new Date();
  const at = new Date(now.getTime() - 30 * 60000);
  const device = (id, cls, caps) => ({ id, name: id, class: cls, capabilities: caps, capabilitiesObj: Object.fromEntries(caps.map((c) => [c, { value: 100 }])) });
  const devices = { p: device('p', 'heatpump', ['measure_power.in']), b: device('b', 'battery', ['measure_battery', 'measure_power.charge', 'measure_power.discharge']) };
  const values = { 'p:measure_power.in': 800, 'b:measure_power.charge': 0, 'b:measure_power.discharge': 500 };
  const logs = Object.keys(values).map((k) => ({ id: `homey:device:${k}` }));
  const api = {
    devices: { getDevices: async () => devices },
    insights: {
      getLogs: async () => logs,
      getLogEntries: async ({ id }) => ({ values: [{ t: at.toISOString(), v: values[id.replace('homey:device:', '')] }] }),
    },
  };
  const details = new EnergyDetails({ log() {}, hub: { api }, energyConfig: () => ({ devices: { heating: ['p'], batteries: ['b'] } }) });
  const heat = await details.build('heatpump', null);
  assert.ok(heat.kWh > 0, 'the heat pump has its energy');
  const battery = await details.build('battery', null);
  assert.ok(battery.discharged > 0 && battery.charged === 0, 'supplied, not charged');
});

test('the sun stands where it should', () => {
  const noon = house.sunPosition(52.1, 5.1, new Date('2026-06-21T11:40:00Z'));
  assert.ok(noon.height > 58 && noon.height < 63, 'high in June');
  assert.ok(Math.abs(noon.azimuth - 180) < 8, 'in the south at noon');
  const morning = house.sunPosition(52.1, 5.1, new Date('2026-06-21T06:00:00Z'));
  assert.ok(morning.azimuth > 70 && morning.azimuth < 120, 'in the east in the morning');
  const evening = house.sunPosition(52.1, 5.1, new Date('2026-06-21T17:00:00Z'));
  assert.ok(evening.azimuth > 240 && evening.azimuth < 300, 'in the west in the evening');
});

test('outdoor lamps: found by name or on a garden level, or chosen', () => {
  const devices = new Map([['a', { id: 'a', name: 'Lamp voordeur', cls: 'light' }], ['b', { id: 'b', name: 'Tuinverlichting', cls: 'light' }], ['c', { id: 'c', name: 'Oprit', cls: 'light' }], ['d', { id: 'd', name: 'Staande lamp', cls: 'light' }], ['e', { id: 'e', name: 'Spot', cls: 'light' }], ['f', { id: 'f', name: 'Tuin thermometer', cls: 'sensor' }]]);
  const plan = { levels: [{ id: 'l', name: 'Tuin', rooms: [], items: [{ deviceId: 'e' }] }] };
  assert.deepStrictEqual(house.outdoorLamps(plan, devices), { door: ['a'], path: [], drive: ['c'], garden: ['b', 'e'] });
  plan.house = { outdoor: { door: 'none', path: 'd' } };
  const chosen = house.outdoorLamps(plan, devices);
  assert.deepStrictEqual(chosen.door, []);
  assert.deepStrictEqual(chosen.path, ['d']);
});

test('windows belong to the room behind them, also when the plan is turned', () => {
  const room = (id, x0, y0, x1, y1) => ({ id, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const level = { rooms: [room('left', 0, 0, 500, 1000), room('right', 500, 0, 1000, 1000)] };
  const at = (front, u, v) => house.roomBehind(level, house.settings({ house: { front } }), u, v);
  assert.strictEqual(at('bottom', 0.2, 0.9), 'left');
  assert.strictEqual(at('bottom', 0.8, 0.9), 'right');
  assert.strictEqual(at('top', 0.2, 0.9), 'right');
  assert.strictEqual(house.roomBehind({ rooms: [] }, house.settings({}), 0.5, 0.5), null);
  assert.strictEqual(house.roomBehind({ rooms: [room('far', 800, 800, 900, 900)] }, house.settings({}), 0, 0), 'far', 'the nearest room');
});

test('weather kinds from the icons of the forecast', () => {
  const k = house.weatherKind;
  assert.deepStrictEqual(['clear_day', 'partly_cloudy_day', 'cloudy', 'rain', 'snow', 'thunderstorm', '', undefined].map(k), ['clear', 'partly', 'cloudy', 'rain', 'snow', 'rain', 'clear', 'clear']);
});

test('own photo: lines show where the power goes, not without a fresh reading', () => {
  const plan = { house: { photo: { src: 'x', ratio: 0.5, areas: [{ kind: 'solar', pts: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]] }, { kind: 'home', pts: [[0.5, 0.5], [0.9, 0.5], [0.9, 0.9]] }, { kind: 'grid', pts: [[0, 0.8], [0.1, 0.8], [0.1, 0.9]] }] } } };
  const fresh = { updated: new Date().toISOString(), solarW: 3000, gridW: 5 };
  assert.strictEqual((house.photoView(plan, { energy: fresh }).svg.match(/fp-hflow/g) || []).length, 1, 'the sun, not 5 W of grid');
  assert.ok(!house.photoView(plan, { energy: { ...fresh, updated: '2020-01-01T00:00:00Z' } }).svg.includes('fp-hflow'));
});

test('house shape follows the storeys of the plan', () => {
  const plan = demoPlan('nl');
  const shape = house.shape(plan);
  assert.strictEqual(shape.floors.length, plan.levels.length);
  assert.ok(shape.width >= 5 && shape.width <= 18);
  assert.ok(shape.floors[1].base > shape.floors[0].base);
  // A garden is no storey, an attic is the space under the roof
  const extra = { ...plan, levels: [...plan.levels, { id: 'a', name: 'Zolder', rooms: [] }, { id: 'g', name: 'Tuin', rooms: [] }] };
  const s2 = house.shape(extra);
  assert.strictEqual(s2.floors.length, plan.levels.length);
  assert.strictEqual(s2.attic.levelId, 'a');
});

test('real form: an extension on the ground floor only, with the choice off by default', () => {
  const room = (x0, y0, x1, y1) => ({ id: `r${x0}${y0}`, name: 'r', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const levels = [
    { id: 'g', name: 'Begane grond', rooms: [room(0, 0, 500, 800), room(500, 0, 1000, 800), room(300, 800, 700, 1100)] },
    { id: 'u', name: 'Verdieping', rooms: [room(0, 0, 1000, 800)] },
  ];
  assert.strictEqual(house.shape({ levels }).form, undefined);
  assert.strictEqual(house.settings({}).form, 'simple');
  const s = house.shape({ levels, house: { form: 'plan' } });
  assert.strictEqual(s.width, 10);
  assert.strictEqual(s.depth, 11);
  assert.deepStrictEqual([s.form.main.w, s.form.main.d], [10, 8]);
  const [ground, upper] = s.form.floors;
  assert.strictEqual(ground.runs.length, 8, 'a block with a bump has eight walls');
  assert.strictEqual(upper.runs.length, 4);
  assert.strictEqual(ground.roofs.length, 1, 'only the extension has a roof of its own');
  assert.deepStrictEqual([ground.roofs[0].w, ground.roofs[0].d], [4, 3]);
  assert.strictEqual(upper.roofs.length, 0);
  // The front is +z: with the extension at the bottom of the plan it sticks out to the front
  assert.ok(ground.roofs[0].z > s.form.main.z);
  const back = house.shape({ levels, house: { form: 'plan', front: 'top' } });
  assert.ok(back.form.floors[0].roofs[0].z < back.form.main.z);
  // Every wall has the outside on its normal
  for (const r of ground.runs) {
    const d = [r.b[0] - r.a[0], r.b[1] - r.a[1]];
    assert.ok(-d[1] * r.n[0] + d[0] * r.n[1] > 0);
  }
});

test('real form: storeys stand on each other, also when a level was moved', () => {
  const room = (x0, y0, x1, y1) => ({ id: `r${x0}${y0}`, name: 'r', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const shape = (levels) => house.shape({ levels, house: { form: 'plan' } }).form;
  // Three equal storeys, the top one half a house to the side
  const moved = shape([
    { id: 'a', name: 'a', rooms: [room(0, 0, 1000, 800)] },
    { id: 'b', name: 'b', rooms: [room(0, 0, 1000, 800)] },
    { id: 'c', name: 'c', rooms: [room(500, 300, 1500, 1100)] },
  ]);
  assert.deepStrictEqual(moved.floors[2].rects, moved.floors[0].rects);
  assert.deepStrictEqual([moved.w, moved.d], [10, 8]);
  assert.strictEqual(moved.floors[2].runs.length, 4);
  // A smaller storey inside the one below stays where it was drawn, an extension on the ground floor too
  const inside = shape([{ id: 'a', name: 'a', rooms: [room(0, 0, 1000, 800)] }, { id: 'b', name: 'b', rooms: [room(100, 100, 600, 600)] }]);
  assert.deepStrictEqual([inside.floors[1].rects[0].w, inside.floors[1].rects[0].d], [5, 5]);
  assert.strictEqual(inside.floors[1].rects[0].x, inside.floors[0].rects[0].x - 1.5);
});

test('real form: rooms that nearly touch are one house, a small gap is filled, an L stays an L', () => {
  const room = (id, x0, y0, x1, y1) => ({ id, name: id, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const near = house.shape({ levels: [{ id: 'g', name: 'g', rooms: [room('a', 0, 0, 500, 500), room('b', 512, 0, 1000, 500)] }], house: { form: 'plan' } });
  assert.strictEqual(near.form.floors[0].runs.length, 4);
  const hall = house.shape({ levels: [{ id: 'g', name: 'g', rooms: [room('n', 0, 0, 900, 300), room('s', 0, 500, 900, 800), room('w', 0, 300, 300, 500), room('e', 500, 300, 900, 500)] }], house: { form: 'plan' } });
  assert.strictEqual(hall.form.floors[0].runs.length, 4, 'a hall nobody drew');
  const l = house.shape({ levels: [{ id: 'g', name: 'g', rooms: [room('a', 0, 0, 1000, 500), room('b', 0, 500, 500, 900)] }], house: { form: 'plan' } });
  assert.strictEqual(l.form.floors[0].runs.length, 6);
  assert.strictEqual(l.form.floors[0].roofs.length, 1);
  // Nothing drawn yet: the plain block
  assert.strictEqual(house.shape({ levels: [{ id: 'g', name: 'g', rooms: [] }], house: { form: 'plan' } }).form, undefined);
  // An upper storey without rooms follows the one below
  const up = house.shape({ levels: [{ id: 'g', name: 'g', rooms: [room('a', 0, 0, 800, 800)] }, { id: 'u', name: 'u', rooms: [] }], house: { form: 'plan' } });
  assert.strictEqual(up.form.floors[1].runs.length, 4);
});

test('panels go on the roof side that looks south', () => {
  assert.strictEqual(house.sunnySide(house.settings({ house: { facing: 180 } })), 'front');
  assert.strictEqual(house.sunnySide(house.settings({ house: { facing: 0 } })), 'back');
  assert.strictEqual(house.sunnySide(house.settings({ house: { facing: 90, ridge: 'depth' } })), 'left');
  assert.strictEqual(house.sunnySide(house.settings({ house: { roof: 'flat' } })), 'top');
});

test('objects show when their devices are found, unless chosen otherwise', () => {
  const set = house.settings({ house: { objects: { airco: { show: 'off' }, car: { show: 'on' } } } });
  assert.strictEqual(house.shows(set, 'solar', { solar: true }), true);
  assert.strictEqual(house.shows(set, 'battery', { battery: false }), false);
  assert.strictEqual(house.shows(set, 'airco', { airco: true }), false);
  assert.strictEqual(house.shows(set, 'car', {}), true);
});

test('energy summary of the demo house uses Energy Dashboard\'s calculation', () => {
  const noon = new Date(); noon.setHours(13, 0, 0, 0);
  const e = summarize(demoEnergyDevices('en', noon));
  assert.ok(e.solarW > 2000);
  assert.deepStrictEqual(Object.keys(e.present).filter((k) => e.present[k]).sort(), ['airco', 'battery', 'boiler', 'car', 'ev', 'gas', 'grid', 'heatpump', 'solar']);
  assert.strictEqual(e.ev.charging, true);
  assert.ok(e.battery.soc >= 10 && e.battery.soc <= 100);
  // The house uses what comes from the grid, the sun and the battery
  assert.strictEqual(Math.round(e.homeW), Math.round(e.gridW + e.solarW - e.battery.watts));
});

test('details: power per 15 minutes from Insights entries, kWh in and out', () => {
  const { curve, energyOf, solarPlanes } = require('../lib/EnergyDetails');
  const t0 = new Date(2026, 9, 1).getTime();
  const q = 15 * 60000;
  const entries = [{ t: t0, v: 1000 }, { t: t0 + q, v: -2000 }, { t: t0 + 2 * q, v: 0 }];
  const c = curve([entries], t0, t0 + 3 * q);
  assert.deepStrictEqual(c.map((p) => p.w), [1000, -2000, 0, 0]);
  const e = energyOf(entries, t0 + 3 * q);
  assert.strictEqual(e.in, 0.25);
  assert.strictEqual(e.out, 0.5);
  // Panels on the south roof of a house facing south: tilt is the pitch, direction 0 (south)
  const [plane] = solarPlanes({ house: { facing: 180, pitch: 35, objects: { solar: { panels: 10 } } } });
  assert.deepStrictEqual(plane, { kwp: 4.2, tilt: 35, azimuth: 0 });
  assert.strictEqual(solarPlanes({ house: { facing: 90, objects: { solar: { kwp: 6 } } } })[0].azimuth, -90);
});

test('a level for the rest of the plan is no storey of the house', () => {
  const level = (name) => ({ id: name, name, rooms: [{ points: [[0, 0], [800, 0], [800, 1000], [0, 1000]] }] });
  const plan = { levels: [level('Begane grond'), level('1e verdieping'), level('2e verdieping'), level('Overig'), level('Kelder')] };
  assert.strictEqual(house.shape(plan).floors.length, 3);
});

test('a dimmable socket is a lamp, a plain socket stays a socket', () => {
  const core = require('../lib/shared/floorplan-core');
  assert.strictEqual(core.deviceKind({ cls: 'socket', caps: { onoff: true, dim: 0.5 } }), 'light');
  assert.notStrictEqual(core.deviceKind({ cls: 'socket', caps: { onoff: true, measure_power: 90 } }), 'light');
});

test('panels on both roof halves: two faces and two planes for the forecast', () => {
  const { solarPlanes } = require('../lib/EnergyDetails');
  const both = { house: { facing: 90, ridge: 'width', pitch: 35, objects: { solar: { layout: 'both', panels: 10 } } } };
  assert.deepStrictEqual(house.solarSides(house.settings(both)), ['front', 'back']);
  assert.deepStrictEqual(solarPlanes(both), [{ kwp: 2.1, tilt: 35, azimuth: -90 }, { kwp: 2.1, tilt: 35, azimuth: 90 }]);
  const flat = { house: { roof: 'flat', objects: { solar: { layout: 'both', panels: 10 } } } };
  assert.deepStrictEqual(house.solarSides(house.settings(flat)), ['top']);
  assert.deepStrictEqual(solarPlanes(flat).map((p) => p.azimuth), [-90, 90]);
  assert.strictEqual(house.settings({ house: { objects: { solar: { layout: 'x' } } } }).objects.solar.layout, 'sunny');
  assert.doesNotThrow(() => house.drawing(both, { texts: {} }));
});

test('the heat pump stands beside the house, or lies on a flat roof', () => {
  assert.strictEqual(house.settings({}).objects.heatpump.place, 'ground');
  assert.strictEqual(house.settings({ house: { objects: { heatpump: { place: 'roof' } } } }).objects.heatpump.place, 'roof');
  assert.strictEqual(house.settings({ house: { objects: { heatpump: { place: 'attic' } } } }).objects.heatpump.place, 'ground');
});

test('a garage and a shed stand in the garden, not on top of the house or each other', () => {
  const rect = (x0, y0, x1, y1) => [{ id: `r${x0}${y0}`, name: 'R', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }];
  const plan = {
    levels: [
      { id: 'g', name: 'Begane grond', wallHeight: 260, rooms: rect(0, 0, 1000, 900) },
      { id: 'up', name: 'Verdieping', wallHeight: 260, rooms: rect(0, 0, 1000, 900) },
      { id: 'gar', name: 'Garage', wallHeight: 250, rooms: rect(0, 0, 600, 300) },
      { id: 'sh', name: 'Schuur', rooms: rect(0, 0, 300, 250) },
      { id: 'th', name: 'Tuinhuis', rooms: rect(0, 0, 400, 300) },
    ],
    house: { type: 'detached', carport: 'none' },
  };
  const sh = house.shape(plan);
  assert.deepStrictEqual(sh.floors.map((f) => f.levelId), ['g', 'up'], 'outbuildings are no storeys');
  const { buildings, back, side } = house.yard(plan);
  assert.deepStrictEqual(buildings.map((b) => [b.levelId, b.kind, b.place]), [['gar', 'garage', 'side'], ['sh', 'shed', 'back'], ['th', 'shed', 'back']]);
  const gar = buildings[0];
  assert.ok(gar.w < gar.d, 'the garage door is on its short side');
  assert.strictEqual(Math.sign(gar.x), house.freeSide(house.settings(plan)).cs, 'on the free side');
  const W = sh.width; const D = sh.depth;
  const boxes = buildings.map((b) => [b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2]).concat([[-W / 2, -D / 2, W / 2, D / 2]]);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${i} and ${j} overlap`);
    }
  }
  for (const b of buildings) {
    assert.ok(b.z - b.d / 2 > back && Math.abs(b.x) + b.w / 2 < side, `${b.levelId} inside the garden`);
    if (b.place === 'back') assert.ok(b.z + b.d / 2 < -D / 2 - 3.4, `${b.levelId} leaves the terrace free`);
  }
  // Chosen places: not shown, or at the back; a row of houses has no free side
  plan.house.outbuildings = { sh: 'off', gar: 'back', bogus: 'moon' };
  assert.deepStrictEqual(house.settings(plan).outbuildings, { sh: 'off', gar: 'back' });
  assert.deepStrictEqual(house.yard(plan).buildings.map((b) => [b.levelId, b.place]), [['gar', 'back'], ['th', 'back']]);
  plan.house = { type: 'terraced' };
  assert.ok(house.yard(plan).buildings.every((b) => b.place === 'back'));
  assert.ok(house.drawing(plan, {}).svg.includes('data-id="gar"'), 'the drawing has the garage to tap');
});
