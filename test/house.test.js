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
  assert.deepStrictEqual(Object.keys(e.present).filter((k) => e.present[k]).sort(), ['airco', 'battery', 'car', 'ev', 'grid', 'heatpump', 'solar']);
  assert.strictEqual(e.ev.charging, true);
  assert.strictEqual(e.battery.soc, 64);
  // The house uses what comes from the grid, the sun and the battery
  assert.strictEqual(Math.round(e.homeW), Math.round(e.gridW + e.solarW - e.battery.watts));
});
