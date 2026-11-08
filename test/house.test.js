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
  assert.deepStrictEqual(house.outdoorLamps(plan, devices), { door: ['a'], path: [], drive: ['c'], garden: ['b', 'e'], spots: [] });
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

test('a metering plug with a dim value and an air conditioner with a light are not lamps', () => {
  const core = require('../lib/shared/floorplan-core');
  // HomeWizard Energy Socket: dim is the brightness of its LED ring
  assert.strictEqual(core.deviceKind({ cls: 'socket', caps: { onoff: true, dim: 0.5, measure_power: 90, meter_power: 12.5 } }), 'socket');
  // A dimmer that does not meter its energy as a socket is still a lamp
  assert.strictEqual(core.deviceKind({ cls: 'socket', caps: { onoff: true, dim: 0.5, measure_power: 12 } }), 'light');
  // An air conditioner whose app offers a dim value for its display: a thermostat, never a lamp
  assert.strictEqual(core.deviceKind({ cls: 'other', caps: { onoff: true, dim: 1, target_temperature: 21 } }), 'thermostat');
  // A real lamp is untouched
  assert.strictEqual(core.deviceKind({ cls: 'light', caps: { onoff: true, dim: 0.5, measure_power: 9, meter_power: 3 } }), 'light');
});

test('grid connection, air conditioner, dormer and neighbours get defaults and checked values', () => {
  const d = house.settings({});
  assert.strictEqual(d.objects.grid.place, 'auto');
  assert.strictEqual(d.objects.airco.place, 'auto');
  assert.strictEqual(d.dormerAt, 'back');
  assert.strictEqual(d.dormerSize, 'normal');
  assert.deepStrictEqual([d.neighbourW, d.neighbourD, d.neighbourShift, d.neighbourRoof], [0, 0, 0, 'same']);
  const s = house.settings({ house: {
    objects: { grid: { place: 'left' }, airco: { place: 'right' } },
    dormerAt: 'front', dormerSize: 'full', neighbourW: 7.5, neighbourD: 45, neighbourShift: -2, neighbourRoof: 'flat',
  } });
  assert.strictEqual(s.objects.grid.place, 'left');
  assert.strictEqual(s.objects.airco.place, 'right');
  assert.strictEqual(s.dormerAt, 'front');
  assert.strictEqual(s.dormerSize, 'full');
  assert.strictEqual(s.neighbourW, 7.5);
  assert.strictEqual(s.neighbourD, 30, 'kept to 30 m');
  assert.strictEqual(s.neighbourShift, -2);
  assert.strictEqual(s.neighbourRoof, 'flat');
  const bad = house.settings({ house: { objects: { grid: { place: 'up' }, airco: { place: 'roof' } }, dormerAt: 'side', dormerSize: 'huge', neighbourW: 'wide', neighbourRoof: 'dome' } });
  assert.strictEqual(bad.objects.grid.place, 'auto');
  assert.strictEqual(bad.objects.airco.place, 'auto');
  assert.strictEqual(bad.dormerAt, 'back');
  assert.strictEqual(bad.dormerSize, 'normal');
  assert.strictEqual(bad.neighbourW, 0);
  assert.strictEqual(bad.neighbourRoof, 'same');
});

test('lower roofs, mirrored neighbours and the drawn garden get defaults and checked values', () => {
  const d = house.settings({});
  assert.deepStrictEqual([d.lowRoof, d.lowPitch, d.lowFlat, d.neighbourMirror, d.gardenOwn], ['flat', 20, 0, false, true]);
  const s = house.settings({ house: { lowRoof: 'lean', lowPitch: 90, lowFlat: 1.5, neighbourMirror: true, gardenOwn: false } });
  assert.deepStrictEqual([s.lowRoof, s.lowPitch, s.lowFlat, s.neighbourMirror, s.gardenOwn], ['lean', 45, 1.5, true, false]);
  const bad = house.settings({ house: { lowRoof: 'dome', lowPitch: 'steep', lowFlat: 9, neighbourMirror: 'yes', gardenOwn: 0 } });
  assert.deepStrictEqual([bad.lowRoof, bad.lowPitch, bad.lowFlat, bad.neighbourMirror, bad.gardenOwn], ['flat', 20, 3, false, true]);
});

test('the drawn garden is measured from the middle of the house, in metres, with the front at +z', () => {
  const plan = (front, extra) => ({
    house: Object.assign({ form: 'plan', front }, extra),
    levels: [
      { id: 'l0', name: 'Ground floor', rooms: [{ id: 'r1', name: 'Living room', points: [[0, 0], [1000, 0], [1000, 800], [0, 800]] }] },
      {
        id: 'lg', name: 'Garden',
        rooms: [
          { id: 'a', name: 'Terrace', points: [[100, -300], [700, -300], [700, -20], [100, -20]] },
          { id: 'b', name: 'Lawn', points: [[-500, -900], [1500, -900], [1500, -400], [-500, -400]], color: '#88aa66' },
          { id: 'c', name: 'Vijver', points: [[1100, -300], [1300, -300], [1200, -100]] },
          { id: 'd', name: 'Driveway', points: [[0, 900], [100, 900]] }, // two points: not a patch
        ],
        items: [
          { kind: 'furniture', type: 'plant', x: 500, y: -500, w: 100, d: 100, h: 300, rot: 0 },
          { kind: 'furniture', type: 'box', x: 500, y: -100, w: 200, d: 100, h: 75, z: 0, rot: 90, color: '#9a6b3f' },
          { kind: 'device', deviceId: 'x', x: 0, y: 0 },
        ],
        walls: [{ id: 'f', a: [0, -600], b: [1000, -600], height: 180, style: 'fence', t: 5 }],
      },
    ],
  });
  const g = house.garden(plan('bottom'));
  assert.deepStrictEqual(g.patches.map((p) => p.kind), ['paving', 'lawn', 'pond'], 'by name, paving otherwise, no patch from two points');
  assert.deepStrictEqual(g.patches[0].pts[0], [-4, -7], 'metres from the middle of the house, the back at -z');
  assert.strictEqual(g.patches[1].color, '#88aa66');
  assert.strictEqual(g.plants.length, 1);
  assert.deepStrictEqual([g.plants[0].x, g.plants[0].z, g.plants[0].h], [0, -9, 3]);
  assert.strictEqual(g.things.length, 1, 'a device is no thing');
  assert.deepStrictEqual([g.things[0].w, g.things[0].d], [1, 2], 'a quarter turn swaps width and depth');
  assert.deepStrictEqual(g.fences[0].a, [-5, -10]);
  assert.strictEqual(g.fences[0].fence, true);
  // The plan turned so that its top is the front: the same garden lies at the front
  assert.deepStrictEqual(house.garden(plan('top')).patches[0].pts[0], [4, 7]);
  // Off, or not a house in the shape of its plan: nothing
  assert.strictEqual(house.garden(plan('bottom', { gardenOwn: false })), null);
  assert.strictEqual(house.garden(plan('bottom', { form: 'simple' })), null);
  const bare = plan('bottom'); bare.levels.pop();
  assert.strictEqual(house.garden(bare), null, 'no garden level');
});

test('a room called shed on the garden level is a building with its doors and windows, the others stay ground', () => {
  const plan = {
    house: { form: 'plan', front: 'bottom' },
    levels: [
      { id: 'l0', name: 'Begane grond', rooms: [{ id: 'r1', name: 'Woonkamer', points: [[0, 0], [1000, 0], [1000, 800], [0, 800]] }] },
      {
        id: 'lg', name: 'Achtertuin',
        rooms: [
          { id: 'g', name: 'Gazon', points: [[0, -900], [1000, -900], [1000, -100], [0, -100]] },
          { id: 's', name: 'Schuurtje', points: [[700, -900], [1000, -900], [1000, -600], [700, -600]] },
        ],
        openings: [
          { id: 'o1', type: 'door', x: 850, y: -600, angle: 0, width: 80 },
          { id: 'o2', type: 'window', x: 1000, y: -750, angle: Math.PI / 2, width: 60 },
          { id: 'o3', type: 'door', x: 300, y: -500, angle: 0, width: 80 }, // far from the shed
        ],
      },
    ],
  };
  const g = house.garden(plan);
  assert.deepStrictEqual(g.patches.map((p) => p.name), ['Gazon'], 'the shed is no patch of ground');
  assert.strictEqual(g.sheds.length, 1);
  const s = g.sheds[0];
  assert.strictEqual(s.kind, 'shed');
  assert.strictEqual(s.height, 2.3);
  assert.deepStrictEqual(s.pts[0], [2, -13]);
  assert.strictEqual(s.openings.length, 2, 'only the openings in its walls');
  const door = s.openings.find((o) => o.door);
  assert.strictEqual(door.edge, 2, 'the door in the edge facing the house');
  assert.strictEqual(door.w, 0.8);
  assert.ok(Math.abs(door.s - 1.5) < 1e-9);
  assert.strictEqual(s.openings.find((o) => !o.door).edge, 1);
});

test('a garage or shed level can have a flat or a pitched roof of its own', () => {
  const plan = (outRoofs) => ({ house: { outRoofs }, levels: [{ id: 'g', name: 'Garage', rooms: [] }, { id: 's', name: 'Schuur', rooms: [] }] });
  assert.deepStrictEqual(house.outbuildings(plan()).map((b) => b.roof), ['flat', 'pitched'], 'without a choice');
  assert.deepStrictEqual(house.outbuildings(plan({ g: 'pitched', s: 'flat' })).map((b) => b.roof), ['pitched', 'flat']);
  assert.deepStrictEqual(house.outbuildings(plan({ s: 'round' })).map((b) => b.roof), ['flat', 'pitched'], 'an unknown roof is ignored');
  assert.strictEqual(house.settings({ house: { roof: 'gable', outRoofs: { s: 'flat' } } }).roof, 'gable', 'the house keeps its own roof');
});

test('the chimney is on by default and can be switched off', () => {
  assert.strictEqual(house.settings({}).chimney, true);
  assert.strictEqual(house.settings({ house: { chimney: false } }).chimney, false);
  assert.strictEqual(house.settings({ house: { chimney: 'no' } }).chimney, true, 'only a real false switches it off');
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

test('a corner house has one neighbour side, a flat stands in a block with storeys below and above', () => {
  const rooms = [{ id: 'r', points: [[0, 0], [900, 0], [900, 800], [0, 800]] }];
  const plan = { levels: [{ id: 'g', name: 'Begane grond', rooms }], house: { type: 'corner', neighbour: 'right', carport: 'right' } };
  let s = house.settings(plan);
  assert.ok(s.oneSide && !s.between);
  assert.deepStrictEqual(house.freeSide(s), { carport: 'left', cs: -1 }, 'the carport goes on the free side');
  assert.ok(house.drawing(plan, {}).svg.length > 0);
  plan.house = { type: 'flat', flatFloor: 3, flatAbove: 2, roof: 'gable', carport: 'left' };
  s = house.settings(plan);
  assert.ok(s.between && s.roof === 'flat' && s.flatFloor === 3 && s.flatAbove === 2);
  assert.strictEqual(house.freeSide(s).carport, 'none');
  const sh = house.shape(plan);
  assert.strictEqual(sh.lift, 9);
  assert.strictEqual(sh.above, 6);
  assert.strictEqual(sh.floors[0].base, 9, 'the flat starts on the third storey');
  assert.ok(house.drawing(plan, {}).svg.includes('data-house="level"'));
  // other types keep the flat fields at zero
  plan.house = { type: 'detached', flatFloor: 4 };
  assert.strictEqual(house.shape(plan).lift, 0);
});

test('with the form of the floor plan, its outer doors and windows sit in the walls of the house', () => {
  const rooms = [{ id: 'r', points: [[0, 0], [1000, 0], [1000, 800], [0, 800]] }];
  const openings = [
    { id: 'w1', type: 'window', x: 300, y: 800, width: 200, sill: 40, top: 220 }, // front wall
    { id: 'd1', type: 'door', x: 1000, y: 400, width: 90 }, // right side
    { id: 'in', type: 'door', x: 500, y: 400, width: 80 }, // inside: not on the facade
  ];
  const plan = { levels: [{ id: 'g', name: 'Begane grond', rooms, openings }], house: { form: 'plan' } };
  const f = house.shape(plan).form.floors[0];
  assert.strictEqual(f.openings.length, 2);
  const w = f.openings.find((o) => !o.door);
  assert.deepStrictEqual([w.x, w.z, w.n, w.w, w.sill, w.top], [-2, 4, [0, 1], 2, 0.4, 2.2]);
  const d = f.openings.find((o) => o.door);
  assert.deepStrictEqual([d.x, d.z, d.n], [5, 0, [1, 0]]);
});

test('an open wall in an outer wall is an opening from the ground up; the front door can be placed', () => {
  const rooms = [{ id: 'r', points: [[0, 0], [1000, 0], [1000, 800], [0, 800]] }];
  const openings = [
    { id: 'p1', type: 'passage', x: 1000, y: 200, width: 300 }, // right side: the end of a drive-through
    { id: 'p2', type: 'passage', x: 500, y: 400, width: 200 }, // inside: not on the facade
  ];
  const plan = { levels: [{ id: 'g', name: 'Begane grond', rooms, openings }], house: { form: 'plan' } };
  const f = house.shape(plan).form.floors[0];
  assert.strictEqual(f.openings.length, 1);
  const p = f.openings[0];
  assert.deepStrictEqual([p.passage, p.x, p.z, p.n, p.w, p.sill, p.door], [true, 5, -2, [1, 0], 3, 0, undefined]);
  assert.strictEqual(house.settings(plan).doorAt, 'auto');
  assert.strictEqual(house.settings({ house: { doorAt: 'leftmid' } }).doorAt, 'leftmid');
  assert.strictEqual(house.settings({ house: { doorAt: 'roof' } }).doorAt, 'auto');
  assert.strictEqual(house.DOOR_AT.left < house.DOOR_AT.right, true);
});

// A plan of a house in the shape of its plan: a ground floor with an extension at the back, a smaller first floor
// drawn against the back of the level, a front garden level, a cellar and a shed.
function stackedPlan(extra) {
  const room = (id, name, x0, y0, x1, y1) => ({ id, name, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  return Object.assign({
    id: 'p',
    house: { form: 'plan' },
    levels: [
      { id: 'g', name: 'Begane grond', rooms: [room('hall', 'Hal', 0, 0, 800, 600), room('ext', 'Uitbouw', 0, 600, 800, 1000), room('mk', 'Meterkast', 700, 0, 800, 100)], items: [], openings: [] },
      { id: 'u', name: 'Eerste verdieping', rooms: [room('bed', 'Slaapkamer', 0, 400, 800, 1000)], items: [], openings: [] },
      { id: 'v', name: 'Voortuin', rooms: [room('gras', 'Gazon', 0, -500, 800, -100)], items: [], openings: [] },
      { id: 'k', name: 'Souterrain', rooms: [room('k1', 'Opslag', 0, 0, 300, 300)], items: [], openings: [] },
      { id: 's', name: 'Mijn hok', role: 'shed', rooms: [room('s1', 'Hok', 0, 0, 250, 200)], items: [], openings: [] },
    ],
  }, extra || {});
}

test('levels: front garden, cellar and a chosen shed are no storeys', () => {
  const plan = stackedPlan();
  assert.deepStrictEqual(plan.levels.map(house.levelRole), ['storey', 'storey', 'garden', 'other', 'shed']);
  assert.strictEqual(house.levelRole({ name: 'Achtertuin' }), 'garden');
  assert.strictEqual(house.levelRole({ name: 'Back garden' }), 'garden');
  assert.strictEqual(house.levelRole({ name: 'Tuin', role: 'storey' }), 'storey', 'the choice in the editor wins');
  const sh = house.shape(plan);
  assert.strictEqual(sh.floors.length, 2);
  assert.deepStrictEqual(house.outbuildings(plan).map((b) => b.kind), ['shed']);
});

test('storeys line up with the front or back walls of the one below', () => {
  // the plan is drawn with its front at the top (y = 0), so turn it: front at the top of the drawing
  const plan = stackedPlan();
  plan.house.front = 'top';
  const moved = (p) => house.shape(p).form.moved[1];
  assert.deepStrictEqual(moved(plan), [0, 0], 'as drawn, the first floor stays against the back');
  plan.levels[1].alignY = 'front';
  // turned plan: the front wall of the ground floor is at y = 0 (turned -0), the first floor's front at y = 400
  assert.deepStrictEqual(moved(plan).map(Math.abs), [0, 400]);
  plan.levels[1].alignY = 'back';
  assert.deepStrictEqual(moved(plan).map(Math.abs), [0, 0]);
});

test('meter cupboard room, a placed air conditioner and outdoor lamps from the plan', () => {
  const plan = stackedPlan();
  const meter = house.meterRoomSpot(plan);
  assert.ok(meter && meter.floor === 0, 'found on the ground floor');
  plan.levels[1].items.push({ id: 'i1', kind: 'device', deviceId: 'ac', x: 790, y: 700 });
  const ac = house.deviceWallSpot(plan, ['ac']);
  assert.strictEqual(ac.floor, 1);
  assert.deepStrictEqual(ac.n, [1, 0], 'on the right outer wall of the first floor');
  const devices = new Map([['g1', { id: 'g1', name: 'Tuinspot', cls: 'light' }], ['w1', { id: 'w1', name: 'Buitenlamp garage', cls: 'light' }], ['in', { id: 'in', name: 'Hal', cls: 'light' }]]);
  plan.levels[2].items.push({ id: 'i2', kind: 'device', deviceId: 'g1', x: 400, y: -300 });
  plan.levels[0].items.push({ id: 'i3', kind: 'device', deviceId: 'w1', x: 790, y: 300 }, { id: 'i4', kind: 'device', deviceId: 'in', x: 400, y: 300 });
  const out = house.outdoorLamps(plan, devices);
  assert.deepStrictEqual(out.spots.map((s) => [s.id, s.wall]).sort(), [['g1', false], ['w1', true]]);
  assert.deepStrictEqual(out['dev:g1'], ['g1']);
  assert.deepStrictEqual(out.garden, [], 'a placed lamp is not also one of the fixed garden spots');
  assert.deepStrictEqual(out.drive, []);
  // on the garden level right against the house: it hangs on that wall
  devices.set('g2', { id: 'g2', name: 'Tuinlamp', cls: 'light' });
  plan.levels[2].items.push({ id: 'i5', kind: 'device', deviceId: 'g2', x: 400, y: -20 });
  const g2 = house.outdoorLamps(plan, devices).spots.find((s) => s.id === 'g2');
  assert.ok(g2 && g2.wall, 'by the wall');
});

test('a sloping side of the top storey under a flat roof, in the frame of the house', () => {
  const room = (id, name, x0, y0, x1, y1) => ({ id, name, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const plan = { house: { form: 'plan', roof: 'flat' }, levels: [
    { id: 'g', name: 'Begane grond', rooms: [room('a', 'Woonkamer', 0, 0, 800, 1000)] },
    { id: 't', name: '2e verdieping', slope: { sides: ['top'], knee: 100, pitch: 45 }, rooms: [room('b', 'Slaapkamer', 0, 0, 800, 1000)] },
  ] };
  const sh = house.shape(plan);
  assert.strictEqual(sh.floors.length, 2, 'a storey of its own, not an attic');
  const sl = sh.form.floors[1].slope;
  assert.deepStrictEqual(sl.sides, [{ n: [0, -1], edge: 5 }], 'the top of the drawing is the back');
  assert.strictEqual(sl.knee, 1);
  assert.ok(Math.abs(sl.tan - 1) < 1e-9);
  assert.strictEqual(sh.form.floors[0].slope, null);
  plan.house.front = 'left';
  assert.deepStrictEqual(house.shape(plan).form.floors[1].slope.sides[0].n, [-1, 0], 'with the front on the left the top is the left side');
});

test('a lower part keeps the roof chosen for its room', () => {
  const room = (id, name, x0, y0, x1, y1, extra) => Object.assign({ id, name, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }, extra);
  const plan = { house: { form: 'plan', lowRoof: 'lean' }, levels: [
    { id: 'g', name: 'Begane grond', rooms: [room('a', 'Woonkamer', 0, 0, 800, 1000), room('s', 'Schuur', 800, 0, 1100, 400, { roof: 'flat' }), room('e', 'Aanbouw', 800, 400, 1100, 1000)] },
    { id: 'f', name: 'Eerste verdieping', rooms: [room('b', 'Slaapkamer', 0, 0, 800, 1000)] },
  ] };
  const roofs = house.shape(plan).form.floors[0].roofs;
  assert.strictEqual(roofs.length, 2, 'the shed and the extension are two blocks');
  assert.deepStrictEqual(roofs.map((b) => b.roof || '').sort(), ['', 'flat']);
});

test('dormer and ridge raise settings', () => {
  const s = house.settings({ house: { dormer: true, dormerSize: 'ridge', ridgeRaise: 9, dormerShift: 2 } });
  assert.strictEqual(s.dormerSize, 'ridge');
  assert.strictEqual(s.ridgeRaise, 3);
  assert.strictEqual(s.dormerShift, 2);
  assert.strictEqual(house.settings({}).dormerShift, null);
  assert.strictEqual(house.settings({ house: { nightLight: 'bright' } }).nightLight, 'bright');
});

test('a solar reading that is stuck counts as nothing', () => {
  const old = new Date(Date.now() - 2 * 3600000).toISOString();
  const devices = [{ id: 'pv', name: 'Enlighten', class: 'solarpanel', capabilities: ['measure_power'], capabilitiesObj: { measure_power: { value: 1500, lastUpdated: old } } }];
  const live = summarize(devices, {});
  assert.strictEqual(live.solarW, 0);
  assert.strictEqual(live.solarStuck, true);
  devices[0].capabilitiesObj.measure_power.lastUpdated = new Date().toISOString();
  assert.strictEqual(summarize(devices, {}).solarW, 1500);
});

test('a roof terrace is outside the block, and a sloping top storey under a flat roof stays a storey', () => {
  const room = (id, name, x0, y0, x1, y1, extra) => Object.assign({ id, name, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }, extra);
  const levels = [
    { id: 'g', name: 'Begane grond', rooms: [room('a', 'Woonkamer', 0, 0, 1200, 800)] },
    { id: 'u', name: '1e verdieping', rooms: [room('b', 'Slaapkamer', 0, 0, 1200, 800)] },
    { id: 't', name: '2e verdieping', rooms: [room('c', 'Master bedroom', 0, 0, 700, 800), room('d', 'Dakterras', 700, 0, 1200, 800, { walls: false })],
      walls: [{ id: 'w1', a: [700, 0], b: [1200, 0], height: 90 }, { id: 'w2', a: [1200, 0], b: [1200, 800], height: 90 }, { id: 'w3', a: [700, 800], b: [1200, 800], height: 90 }],
      slope: { sides: ['left'], knee: 100, pitch: 45 } },
  ];
  const flat = house.shape({ levels, house: { form: 'plan', roof: 'flat', lowRoof: 'lean' } });
  assert.strictEqual(flat.floors.length, 3, 'the sloping top storey is drawn under a flat roof');
  assert.strictEqual(flat.attic, null);
  const [, first, top] = flat.form.floors;
  assert.deepStrictEqual([flat.form.main.w, flat.form.main.d], [7, 8], 'the roof sits on the rooms, not on the terrace');
  assert.strictEqual(first.roofs.length, 1);
  assert.strictEqual(first.roofs[0].terrace, true, 'the roof under the terrace stays flat');
  assert.deepStrictEqual([first.roofs[0].w, first.roofs[0].d], [5, 8]);
  assert.strictEqual(top.parapets.length, 3, 'the drawn low walls round the terrace');
  assert.ok(top.parapets.every((p) => p.h === 0.9));
  // Without drawn walls: a railing on the three free edges, none against the house
  const bare = levels.map((l) => (l.id === 't' ? { ...l, walls: [] } : l));
  const rails = house.shape({ levels: bare, house: { form: 'plan', roof: 'flat' } }).form.floors[2].parapets;
  assert.strictEqual(rails.length, 3);
  assert.ok(rails.every((p) => p.fence && p.h === 1));
  // Under a pitched roof the sloping level is still the space in the roof
  assert.strictEqual(house.shape({ levels, house: { form: 'plan', roof: 'gable' } }).attic.levelId, 't');
});
