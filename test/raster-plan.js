'use strict';

// Draws a floor plan the way estate agent drawings look (filled walls, door arcs, window lines, text, furniture
// outlines, dimension lines) into a grey bitmap, so the recognition can be tested against a known answer.
const zlib = require('zlib');

const ROOMS = {
  hall: [[0, 300], [300, 300], [300, 800], [0, 800]],
  living: [[300, 0], [900, 0], [900, 500], [300, 500]],
  kitchen: [[900, 0], [1300, 0], [1300, 500], [900, 500]],
  toilet: [[300, 500], [500, 500], [500, 800], [300, 800]],
  utility: [[500, 500], [900, 500], [900, 800], [500, 800]],
  bedroom: [[900, 500], [1300, 500], [1300, 800], [900, 800]],
};
const OUTER = [[[300, 0], [1300, 0]], [[1300, 0], [1300, 800]], [[0, 800], [1300, 800]], [[0, 300], [0, 800]], [[0, 300], [300, 300]], [[300, 0], [300, 300]]];
const INNER = [[[300, 300], [300, 800]], [[900, 0], [900, 800]], [[300, 500], [1300, 500]], [[500, 500], [500, 800]]];
// Doors: centre, axis of the wall ('h' or 'v'), width, side the leaf swings to (+1 = +y or +x)
const DOORS = [
  { x: 0, y: 550, axis: 'v', width: 90, side: 1, outer: true },
  { x: 300, y: 420, axis: 'v', width: 80, side: 1 },
  { x: 900, y: 250, axis: 'v', width: 100, side: 1 },
  { x: 300, y: 650, axis: 'v', width: 70, side: 1 },
  { x: 1100, y: 500, axis: 'h', width: 80, side: 1 },
  { x: 700, y: 500, axis: 'h', width: 80, side: 1 },
];
const WINDOWS = [
  { x: 600, y: 0, axis: 'h', width: 240 },
  { x: 1100, y: 0, axis: 'h', width: 160 },
  { x: 1300, y: 650, axis: 'v', width: 140 },
];

function rasterPlan({ scale = 1, margin = 120, ink = 30, names = true } = {}) {
  const W = Math.round((1300 + margin * 2) * scale); const H = Math.round((800 + margin * 2) * scale);
  const g = new Uint8Array(W * H).fill(255);
  const P = (v) => (v + margin) * scale;
  const fill = (x0, y0, x1, y1, v) => {
    for (let y = Math.max(0, Math.floor(Math.min(y0, y1))); y < Math.min(H, Math.ceil(Math.max(y0, y1))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(x0, x1))); x < Math.min(W, Math.ceil(Math.max(x0, x1))); x++) g[y * W + x] = v;
    }
  };
  const line = (x0, y0, x1, y1, width = 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
      fill(x - width / 2, y - width / 2, x + width / 2, y + width / 2, ink);
    }
  };
  const wall = ([a, b], t) => fill(P(Math.min(a[0], b[0]) - t / 2), P(Math.min(a[1], b[1]) - t / 2), P(Math.max(a[0], b[0]) + t / 2), P(Math.max(a[1], b[1]) + t / 2), ink);
  for (const s of OUTER) wall(s, 30);
  for (const s of INNER) wall(s, 10);
  const thicknessAt = (o) => (o.outer || WINDOWS.includes(o) ? 30 : 10);
  for (const d of DOORS) {
    const t = thicknessAt(d) + 2; const half = d.width / 2;
    if (d.axis === 'h') {
      fill(P(d.x - half), P(d.y - t / 2), P(d.x + half), P(d.y + t / 2), 255);
      const hy = P(d.y + (d.side * thicknessAt(d)) / 2); const hx = P(d.x - half);
      line(hx, hy, hx, hy + d.side * d.width * scale, 2);
      for (let k = 0; k <= 40; k++) { const a = (Math.PI / 2) * (k / 40); line(hx + Math.cos(a) * d.width * scale, hy + d.side * Math.sin(a) * d.width * scale, hx + Math.cos(a) * d.width * scale, hy + d.side * Math.sin(a) * d.width * scale, 1); }
    } else {
      fill(P(d.x - t / 2), P(d.y - half), P(d.x + t / 2), P(d.y + half), 255);
      const hx = P(d.x + (d.side * thicknessAt(d)) / 2); const hy = P(d.y - half);
      line(hx, hy, hx + d.side * d.width * scale, hy, 2);
      for (let k = 0; k <= 40; k++) { const a = (Math.PI / 2) * (k / 40); line(hx + d.side * Math.sin(a) * d.width * scale, hy + Math.cos(a) * d.width * scale, hx + d.side * Math.sin(a) * d.width * scale, hy + Math.cos(a) * d.width * scale, 1); }
    }
  }
  for (const wdw of WINDOWS) {
    const t = 30; const half = wdw.width / 2;
    if (wdw.axis === 'h') {
      fill(P(wdw.x - half), P(wdw.y - t / 2 - 1), P(wdw.x + half), P(wdw.y + t / 2 + 1), 255);
      for (const off of [-t / 2, 0, t / 2]) line(P(wdw.x - half), P(wdw.y + off), P(wdw.x + half), P(wdw.y + off), 1);
    } else {
      fill(P(wdw.x - t / 2 - 1), P(wdw.y - half), P(wdw.x + t / 2 + 1), P(wdw.y + half), 255);
      for (const off of [-t / 2, 0, t / 2]) line(P(wdw.x + off), P(wdw.y - half), P(wdw.x + off), P(wdw.y + half), 1);
    }
  }
  // Room names (letter-like strokes), furniture outlines and dimension lines: everything the recognition must ignore.
  for (const pts of names ? Object.values(ROOMS) : []) {
    const cx = (pts[0][0] + pts[2][0]) / 2; const cy = (pts[0][1] + pts[2][1]) / 2;
    for (let k = 0; k < 6; k++) {
      const x = P(cx - 45 + k * 15); const y = P(cy - 8);
      line(x, y, x, y + 16 * scale, 2); line(x, y, x + 9 * scale, y, 2); line(x, y + 8 * scale, x + 7 * scale, y + 8 * scale, 2);
    }
  }
  const box = (x0, y0, x1, y1) => { line(P(x0), P(y0), P(x1), P(y0)); line(P(x1), P(y0), P(x1), P(y1)); line(P(x1), P(y1), P(x0), P(y1)); line(P(x0), P(y1), P(x0), P(y0)); };
  box(1030, 590, 1190, 790); box(1050, 600, 1170, 640); // bed and pillows
  box(480, 380, 700, 470); // sofa
  box(940, 20, 1280, 80); // kitchen counter
  line(P(300), P(-70), P(1300), P(-70)); line(P(300), P(-80), P(300), P(-60)); line(P(1300), P(-80), P(1300), P(-60));
  line(P(-70), P(300), P(-70), P(800)); line(P(-80), P(300), P(-60), P(300)); line(P(-80), P(800), P(-60), P(800));
  return { width: W, height: H, data: g, scale, margin };
}

// Minimal PNG writer for grey images (for the browser test and for looking at the drawing).
function toPng({ width, height, data }) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { rasterPlan, toPng, ROOMS, DOORS, WINDOWS };
