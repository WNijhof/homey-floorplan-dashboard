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

// The whole drawing turned, with soft edges like a rendered PDF: every wall then runs at a slant.
function turned(img, degrees) {
  const a = (degrees * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  const { width: w, height: h, data } = img;
  const W = Math.ceil(w * Math.abs(c) + h * Math.abs(s)); const H = Math.ceil(w * Math.abs(s) + h * Math.abs(c));
  const out = new Uint8Array(W * H).fill(255);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 255 : data[y * w + x]);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const dx = X - W / 2; const dy = Y - H / 2;
      const x = w / 2 + dx * c + dy * s; const y = h / 2 - dx * s + dy * c;
      const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = x - x0; const fy = y - y0;
      out[Y * W + X] = Math.round(at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy);
    }
  }
  // From a point of the plan (cm) to the turned picture
  const toPicture = (px, py) => {
    const x = (px + img.margin) * img.scale - w / 2; const y = (py + img.margin) * img.scale - h / 2;
    return [W / 2 + x * c - y * s, H / 2 + x * s + y * c];
  };
  return { width: W, height: H, data: out, toPicture };
}

for (const degrees of [30, 45, 17]) {
  test(`a drawing at a slant of ${degrees} degrees: rooms, doors and windows`, () => {
    const scale = 1;
    const img = turned(rasterPlan({ scale }), degrees);
    const r = D.detect(img, { pxPerCm: scale });
    assert.strictEqual(r.slants.length, 1, `direction found: ${r.slants}`);
    assert.ok(Math.abs((r.slants[0] * 180) / Math.PI - (degrees % 90)) < 1.5, `direction ${(r.slants[0] * 180) / Math.PI}`);
    assert.strictEqual(r.rooms.length, Object.keys(ROOMS).length, 'rooms');
    const near = (o, p, tol) => Math.hypot(o.x - p[0], o.y - p[1]) <= tol;
    assert.strictEqual(r.openings.filter((o) => o.type === 'door').length, DOORS.length, 'doors');
    assert.strictEqual(r.openings.filter((o) => o.type === 'window').length, WINDOWS.length, 'windows');
    for (const d of DOORS) assert.ok(r.openings.some((o) => o.type === 'door' && near(o, img.toPicture(d.x, d.y), 12)), `door at ${d.x},${d.y}`);
    for (const wdw of WINDOWS) assert.ok(r.openings.some((o) => o.type === 'window' && near(o, img.toPicture(wdw.x, wdw.y), 12)), `window at ${wdw.x},${wdw.y}`);
    // The sides of the rooms keep the direction of the drawing
    const bent = r.rooms.flatMap((room) => room.points.map((p, i) => {
      const q = room.points[(i + 1) % room.points.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const off = (((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI - degrees) % 90 + 90) % 90;
      return len > 60 ? Math.min(off, 90 - off) : 0;
    }));
    assert.ok(Math.max(...bent) < 4, `sides off by ${Math.max(...bent)}`);
    // In plan centimetres the rooms stay as they were, and neighbours share their corners
    const plan = D.toPlan(r, 1, (x, y) => [x, y]);
    assert.strictEqual(plan.rooms.length, Object.keys(ROOMS).length);
    const area = (pts) => Math.abs(pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const want = Object.values(ROOMS).map(area).sort((a, b) => a - b);
    const got = plan.rooms.map(area).sort((a, b) => a - b);
    want.forEach((v, i) => assert.ok(Math.abs(got[i] - v) / v < 0.1, `room area ${got[i]} vs ${v}`));
    assert.ok(plan.openings.every((o) => Math.abs(Math.sin(2 * (o.angle - (degrees * Math.PI) / 180))) < 0.05), 'openings along the walls');
    // Each room has its four corners, not a staircase
    assert.ok(r.rooms.every((room) => room.points.length <= 8), JSON.stringify(r.rooms.map((x) => x.points.length)));
  });
}

test('a straight house with one wall at a slant and a door in it', () => {
  const W = 900; const H = 700; const data = new Uint8Array(W * H).fill(255);
  const stroke = (a, b, t, v = 30) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = (x - a[0]) * u[0] + (y - a[1]) * u[1]; const d = Math.abs((x - a[0]) * u[1] - (y - a[1]) * u[0]);
        if (s >= -t / 2 && s <= L + t / 2 && d <= t / 2) data[y * W + x] = v;
      }
    }
  };
  // A house with a corner cut off at 45 degrees and an inner wall parallel to that corner, with a door in it
  const outer = [[100, 100], [550, 100], [800, 350], [800, 600], [100, 600]];
  outer.forEach((p, i) => stroke(p, outer[(i + 1) % outer.length], 26));
  stroke([300, 100], [800, 600], 12);
  const mid = [550, 350]; const u = [Math.SQRT1_2, Math.SQRT1_2];
  stroke([mid[0] - u[0] * 37, mid[1] - u[1] * 37], [mid[0] + u[0] * 37, mid[1] + u[1] * 37], 16, 255);
  const r = D.detect({ width: W, height: H, data }, { pxPerCm: 1 });
  assert.strictEqual(r.rooms.length, 2, `rooms ${r.rooms.length}, slants ${r.slants}`);
  const door = r.openings.find((o) => Math.hypot(o.x - mid[0], o.y - mid[1]) < 12);
  assert.ok(door, JSON.stringify(r.openings));
  assert.ok(Math.abs(Math.sin(door.angle - Math.PI / 4)) < 0.05, `door angle ${door.angle}`);
  assert.ok(Math.abs(door.width - 90) <= 10, `door width ${door.width}`);
  // Straight sides stay straight, the slanted ones stay slanted
  const dirs = r.rooms.flatMap((room) => room.points.map((p, i) => { const q = room.points[(i + 1) % room.points.length]; return Math.abs(Math.sin(2 * Math.atan2(q[1] - p[1], q[0] - p[0]))); }));
  assert.ok(dirs.some((d) => d > 0.98) && dirs.some((d) => d < 0.02), JSON.stringify(dirs));
});
