'use strict';
const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/shared/floorplan-core');

const level = (a, b) => ({
  wallHeight: 260,
  rooms: [
    { id: 'a', name: 'Huis', points: [[0, 0], [400, 0], [400, 300], [0, 300]], ...a },
    { id: 'b', name: 'Schuur', points: [[400, 0], [700, 0], [700, 300], [400, 300]], ...b },
  ],
  walls: [],
});
const heights = (lv) => Object.fromEntries(core.levelWalls(lv).map((w) => [w.id, w.height || null]));

test('a room can have lower walls than the level; a shared wall is as high as the higher room', () => {
  const h = heights(level({}, { wallHeight: 220 }));
  assert.strictEqual(h['b:0'], 220);
  assert.strictEqual(h['b:1'], 220);
  assert.strictEqual(h['a:0'], null);
  const shared = core.levelWalls(level({}, { wallHeight: 220 })).find((w) => w.rooms.length === 2);
  assert.ok(shared && !shared.height, 'the wall to the room with the level height keeps that height');
  const both = core.levelWalls(level({ wallHeight: 180 }, { wallHeight: 220 })).find((w) => w.rooms.length === 2);
  assert.strictEqual(both.height, 220);
});
