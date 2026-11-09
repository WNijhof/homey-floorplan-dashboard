'use strict';

const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/shared/floorplan-core');
const MODELS = require('../lib/shared/models');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const room = (extra) => Object.assign({ id: 'r1', name: 'Woonkamer', points: [[0, 0], [400, 0], [400, 300], [0, 300]] }, extra);
const render = (level, view) => core.render({ plan: { levels: [level] }, level, devices: new Map(), view: { mode: view || '2d' }, idPrefix: 't' });

test('colours and pictures of a plan are checked', () => {
  assert.strictEqual(core.cleanColor('#a8bfa6'), '#a8bfa6');
  assert.strictEqual(core.cleanColor('#abc'), '#abc');
  assert.strictEqual(core.cleanColor('red'), null);
  assert.strictEqual(core.cleanColor('#12345'), null);
  assert.strictEqual(core.cleanColor('url(javascript:1)'), null);
  assert.strictEqual(core.cleanImage({ src: 'https://example.com/a.png' }), null, 'only data in the plan itself');
  assert.strictEqual(core.cleanImage({ src: 'data:image/svg+xml;base64,AAAA' }), null);
  assert.strictEqual(core.cleanImage({ src: `${PNG}" onload="x` }), null, 'nothing that could leave the attribute');
  const img = core.cleanImage({ src: PNG, w: 99999, h: -4, rot: 'x' });
  assert.deepStrictEqual([img.w, img.h, img.rot, img.ox], [3000, 1, 0, 0], 'sizes stay within bounds');
});

test('the paint of a wall: the room, with a wall of its own on top', () => {
  const r = room({ paint: { color: '#aabbcc', bands: [{ from: 0, to: 90, color: '#223344' }], edges: { 1: { color: '#ff0000' }, 2: { bands: [] } } } });
  assert.strictEqual(core.paintOf(r, 0).color, '#aabbcc');
  const own = core.paintOf(r, 1);
  assert.strictEqual(own.color, '#ff0000');
  assert.strictEqual(own.bands.length, 1, 'bands of the room stay when the wall has none of its own');
  assert.strictEqual(core.paintOf(r, 2).bands.length, 0, 'a wall can have no bands at all');
  assert.strictEqual(core.paintOf(room({}), 0), null, 'nothing chosen: the theme');
  assert.strictEqual(core.paintOf(room({ paint: { bands: [{ from: 50, to: 50, color: '#fff' }] } }), 0), null, 'an empty band counts for nothing');
  assert.strictEqual(core.paintOf(room({ paint: { color: 'blue' } }), 0), null);
});

test('the edge of a room a wall belongs to, and how corners shift the paint of its walls', () => {
  const r = room({ paint: { edges: { 0: { color: '#111111' }, 2: { color: '#222222' } } } });
  assert.strictEqual(core.roomEdgeNear(r, [200, 2], 6), 0);
  assert.strictEqual(core.roomEdgeNear(r, [398, 150], 6), 1);
  assert.strictEqual(core.roomEdgeNear(r, [200, 150], 6), -1, 'the middle of the room is on no wall');
  core.reindexEdges(r, 'insert', 0); // a corner halfway the first wall: both halves keep its colour, the later walls move up
  r.points.splice(1, 0, [200, 0]);
  assert.deepStrictEqual(Object.keys(r.paint.edges), ['0', '1', '3']);
  assert.strictEqual(r.paint.edges[1].color, '#111111');
  assert.strictEqual(r.paint.edges[3].color, '#222222');
  core.reindexEdges(r, 'delete', 1); // and taking it away again
  r.points.splice(1, 1);
  assert.deepStrictEqual(Object.keys(r.paint.edges), ['0', '2']);
  assert.strictEqual(r.paint.edges[2].color, '#222222');
});

test('a floor picture and decals are drawn at their real size, and only safe ones', () => {
  const level = {
    id: 'l', name: 'g', rooms: [room({ floorImage: { src: PNG, w: 40, h: 25, rot: 15, ox: 5, oy: 6 } })], walls: [], openings: [],
    items: [
      Object.assign(core.newDecal('floor', [100, 100], { src: PNG, w: 80, h: 50 }), { id: 'rug' }),
      Object.assign(core.newDecal('wall', [200, 7], null), { id: 'panel', color: '#336699' }),
      { id: 'bad', kind: 'decal', surface: 'floor', x: 10, y: 10, w: 50, d: 50, src: 'javascript:alert(1)' },
      Object.assign(core.newDecal('floor', [300, 200], null), { id: 'round', round: true, w: 120, d: 80, color: '#8c2f39' }),
    ],
  };
  const flat = render(level).svg;
  assert.match(flat, /<pattern id="t-fi-0"[^>]*width="40"[^>]*height="25"[^>]*rotate\(15\)/, 'the floor picture repeats at 40 x 25 cm, turned');
  assert.match(flat, /fill="url\(#t-fi-0\)"/);
  assert.match(flat, /data-id="rug"[\s\S]*?width="80"[^>]*height="50"/, 'the rug is 80 x 50 cm');
  assert.match(flat, /data-id="panel"/, 'a mark where the wall decal hangs');
  assert.match(flat, /<ellipse[^>]*rx="60"[^>]*ry="40"/, 'round decals are ellipses');
  assert.ok(!/data-id="bad"/.test(flat) && !flat.includes('javascript:'), 'nothing unsafe gets in');
  const iso = render(level, 'iso').svg;
  assert.match(iso, /data-id="rug"/, 'floor decals show in the 2.5D view');
  assert.ok(!/data-id="panel"/.test(iso), 'a decal on a wall is a mark in the plan only');
  // the web pages can swap a long data address for a short one
  const short = core.render({ plan: { levels: [level] }, level, devices: new Map(), view: { mode: '2d' }, idPrefix: 't', imageUrl: () => 'blob:abc' }).svg;
  assert.ok(short.includes('href="blob:abc"') && !short.includes('iVBORw0KGgo'));
});

test('a decal keeps its sizes and starts with what its surface needs', () => {
  const floor = core.newDecal('floor', [10.4, 20.6], { src: PNG, w: 100, h: 40 });
  assert.deepStrictEqual([floor.surface, floor.x, floor.y, floor.w, floor.d, floor.h], ['floor', 10, 21, 100, 40, 0]);
  const wall = core.newDecal('wall', [0, 0], { src: PNG, w: 60, h: 90 });
  assert.deepStrictEqual([wall.surface, wall.w, wall.h, wall.d, wall.z], ['wall', 60, 90, 2, 100]);
  assert.strictEqual(core.decalOf(core.newDecal('floor', [0, 0], null)).color, '#8a9bb0', 'without a picture it is a coloured area');
  assert.strictEqual(core.decalOf({ kind: 'decal', color: 'nope' }), null);
  assert.strictEqual(core.decalOf({ kind: 'furniture' }), null);
});

test('furniture: a colour for each material, a finish, and cabinets drawn to size', () => {
  const sofa = MODELS.get('k-loungeSofa');
  assert.ok(sofa.materials && sofa.materials.length >= 2, 'the colours of the materials of a model are known');
  assert.ok(MODELS.list().every((m) => !m.materials || m.materials.every((c) => /^#[0-9a-f]{6}$/.test(c))));
  const item = { color: '#112233', colors: [null, '#445566', 'bad'], finish: 'metal' };
  assert.deepStrictEqual([0, 1, 2, 3].map((k) => core.slotColor(item, k)), ['#112233', '#445566', null, null]);
  assert.strictEqual(core.finishOf(item), 'metal');
  assert.strictEqual(core.finishOf({ finish: 'sparkly' }), null);
  const vitrine = core.newFurniture('own-vitrine', 100, 100, 'nl');
  assert.deepStrictEqual([vitrine.doors, vitrine.glass, vitrine.finish], [2, 0.5, 'metal'], 'a steel display cabinet with glass in the top half of two doors');
  assert.strictEqual(core.slotColor(vitrine, 0), '#1b1c1f', 'black steel');
  vitrine.colors[1] = '#ffffff';
  assert.strictEqual(core.newFurniture('own-vitrine', 0, 0, 'nl').colors[1], '#1b1c1f', 'a new one starts from the model, not from another piece');
  const entry = MODELS.get('own-vitrine');
  assert.strictEqual(entry.build, 'cabinet');
  assert.strictEqual(entry.slots.length, 3);
  assert.ok(MODELS.get('own-cabinet'));
});
