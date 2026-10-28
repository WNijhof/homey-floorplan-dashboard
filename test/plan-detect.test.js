'use strict';

const test = require('node:test');
const assert = require('node:assert');
const D = require('../lib/shared/plan-detect');
const { rasterPlan, ROOMS, DOORS, WINDOWS } = require('./raster-plan');

// Box blur, like the soft edges of a scan or a JPEG.
function blur(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += data[yy * w + xx]; n++; }
      }
      out[y * w + x] = Math.round(s / n);
    }
  }
  return { ...img, data: out };
}

function run(img, scale) {
  const r = D.detect(img, { pxPerCm: scale });
  return D.toPlan(r, 1 / scale, (x, y) => [x / scale - img.margin, y / scale - img.margin]);
}

const box = (pts) => {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

function check(plan, tol) {
  assert.strictEqual(plan.rooms.length, Object.keys(ROOMS).length, 'number of rooms');
  for (const [name, pts] of Object.entries(ROOMS)) {
    const want = box(pts);
    const found = plan.rooms.find((r) => box(r).every((v, i) => Math.abs(v - want[i]) <= tol));
    assert.ok(found, `room ${name} ${JSON.stringify(want)} in ${JSON.stringify(plan.rooms.map(box))}`);
  }
  const doors = plan.openings.filter((o) => o.type === 'door');
  const windows = plan.openings.filter((o) => o.type === 'window');
  assert.strictEqual(doors.length, DOORS.length, 'doors');
  assert.strictEqual(windows.length, WINDOWS.length, 'windows');
  for (const d of DOORS) {
    const o = doors.find((x) => Math.abs(x.x - d.x) <= tol && Math.abs(x.y - d.y) <= tol);
    assert.ok(o, `door at ${d.x},${d.y}`);
    assert.ok(Math.abs(o.width - d.width) <= tol, `door width ${o.width} vs ${d.width}`);
    // Drawn towards +y (horizontal walls) or +x (vertical walls), hinge at the start of the opening.
    assert.strictEqual(o.swing, d.axis === 'h' ? 1 : -1, `door swing at ${d.x},${d.y}`);
    assert.strictEqual(o.hinge, 1, `door hinge at ${d.x},${d.y}`);
  }
  for (const wdw of WINDOWS) assert.ok(windows.some((x) => Math.abs(x.x - wdw.x) <= tol && Math.abs(x.y - wdw.y) <= tol), `window at ${wdw.x},${wdw.y}`);
}

for (const scale of [0.6, 1, 1.5, 2.2]) {
  test(`recognises rooms, doors and windows at ${scale} px/cm`, () => check(run(rasterPlan({ scale }), scale), 4));
}

test('grey walls with soft edges (scan, jpeg)', () => {
  const img = blur(rasterPlan({ scale: 1, ink: 90 }));
  check(run(img, 1), 5);
});

test('without a known scale it still finds the rooms', () => {
  const img = rasterPlan({ scale: 1 });
  const r = D.detect(img);
  assert.strictEqual(r.rooms.length, 6);
});

test('wall thickness is measured', () => {
  const r = D.detect(rasterPlan({ scale: 1 }), { pxPerCm: 1 });
  assert.ok(Math.abs(r.thickness.wall - 10) <= 2, `inner ${r.thickness.wall}`);
  assert.ok(Math.abs(r.thickness.outer - 30) <= 3, `outer ${r.thickness.outer}`);
});

test('an empty picture gives nothing', () => {
  const r = D.detect({ width: 50, height: 40, data: new Uint8Array(2000).fill(255) });
  assert.deepStrictEqual([r.rooms.length, r.openings.length], [0, 0]);
});
