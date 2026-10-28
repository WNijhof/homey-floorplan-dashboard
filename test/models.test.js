'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const MODELS = require('../lib/shared/models');
const core = require('../lib/shared/floorplan-core');

const web = path.join(__dirname, '..', 'web');

test('every catalogue model has its file, tile and top view', () => {
  for (const m of MODELS.list()) {
    assert.ok(MODELS.GROUPS.some((g) => g.id === m.group), `${m.id} group`);
    assert.ok(m.w > 0 && m.d > 0 && m.h > 0, `${m.id} size`);
    assert.ok(['floor', 'wall', 'ceiling', 'surface'].includes(m.mount), `${m.id} mount`);
    if (!m.file) continue;
    assert.ok(fs.existsSync(path.join(web, 'models', m.file)), `${m.id} glb`);
    assert.ok(fs.existsSync(path.join(web, 'models', 'thumbs', `${m.id}.png`)), `${m.id} tile`);
    assert.ok(fs.existsSync(path.join(web, 'models', 'top', `${m.id}.png`)), `${m.id} top`);
  }
});

test('ids are unique and lights have a bulb height', () => {
  const ids = MODELS.list().map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const m of MODELS.lights()) assert.ok(m.light.at >= 0 && m.light.at <= m.h, `${m.id} bulb`);
  assert.ok(MODELS.get(MODELS.DEFAULT_FIXTURE).fixture);
});

test('a model piece is created with its real size and drawn from its top view in 2D', () => {
  const item = core.newFurniture('k-loungeSofa', 100, 100, 'nl');
  assert.deepStrictEqual([item.w, item.d, item.h, item.label, item.mount], [220, 90, 80, 'Bank, 3-zits', 'floor']);
  const lamp = core.newFurniture('k-lampRoundTable', 0, 0, 'en');
  assert.strictEqual(lamp.z, 75);
  const level = core.newLevel('L');
  level.items = [item];
  const withModels = core.render({ plan: core.newPlan(), level, devices: [], modelBase: 'models/' });
  assert.ok(withModels.svg.includes('models/top/k-loungeSofa.png'));
  // Without models (the Homey widget) it falls back to simple shapes.
  const plain = core.render({ plan: core.newPlan(), level, devices: [] });
  assert.ok(!plain.svg.includes('<image') && plain.svg.includes('fp-item'));
  assert.ok(core.furnitureParts(item).length >= 3);
});
