/*
 * Floor plan recognition from a picture, without AI: finds walls, doors, windows and rooms in a drawing
 * (estate agent or architect plan) with plain image processing. Runs in the browser (editor) and in Node (tests).
 *
 * detect({ width, height, data }, options) where data is RGBA (Uint8ClampedArray) or grey (Uint8Array, 1 per pixel).
 * Returns everything in pixels of that image:
 *   { thickness: { wall, outer }, rooms: [{ points, area }], openings: [{ type, x, y, angle, width, swing, hinge }] }
 * Options: pxPerCm (known scale, improves door/passage limits), darkness (0..1 override of the threshold).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FloorplanDetect = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  /* ------------------------------------------------------------ pixels */

  function toGray(img) {
    const n = img.width * img.height;
    if (img.data.length === n) return Uint8Array.from(img.data);
    const g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = img.data[j + 3];
      const l = 0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2];
      g[i] = a < 128 ? 255 : Math.round(l * (a / 255) + 255 * (1 - a / 255));
    }
    return g;
  }

  function otsu(gray) {
    const hist = new Float64Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0; let wB = 0; let best = 0; let thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB; const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  // Chamfer (3-4) distance from every set pixel to the nearest unset pixel, in pixels. With edgeUnset the
  // area outside the image counts as unset (for thickness); without, it is ignored (for growing walls).
  function distance(mask, w, h, edgeUnset) {
    const INF = 1e9;
    const outside = edgeUnset === false ? INF : 0;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? outside : d[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!d[i]) continue;
        d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      }
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
  }

  /* --------------------------------------------------- wall thickness */

  // Thickness of strokes is twice the distance at their centre line (ridge). Thin lines (text, furniture,
  // measurements) give small values; walls give the larger peaks. Returns the inner and outer wall thickness.
  function wallThickness(dark, dt, w, h) {
    const hist = new Float64Array(256);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = dt[i];
        if (v < 1) continue;
        if (v < dt[i - 1] || v < dt[i + 1] || v < dt[i - w] || v < dt[i + w]) continue;
        const t = Math.min(255, Math.round(2 * v));
        hist[t] += 1;
      }
    }
    // Ridge pixels per thickness are about the total length of strokes that thick. Strokes of 1-2 px are lines
    // (text, furniture, measurements); the thinnest thickness with a real share of the length is the inner wall.
    const smooth = (t) => (hist[t - 1] + 2 * hist[t] + (hist[t + 1] || 0)) / 4;
    let max = 0;
    for (let t = 4; t < 255; t++) max = Math.max(max, smooth(t));
    if (!max) return { wall: 3, outer: 4 };
    let outer = 0;
    for (let t = 4; t < 255; t++) if (smooth(t) >= max * 0.2) outer = t;
    // Inner walls are at least about a quarter as thick as outer walls; text and drawing lines are thinner.
    let inner = 0;
    for (let t = Math.max(4, Math.round(outer * 0.25)); t <= outer && !inner; t++) if (smooth(t) >= max * 0.2) inner = t;
    return { wall: Math.max(3, inner), outer: Math.max(inner, outer, 3) };
  }

  // Walls form a connected network; small loose parts that survive the opening (bold letters, symbols,
  // arrows) are removed: anything whose bounding box is smaller than minSize on both sides, unless it is
  // solid like a column or pillar (at least about a wall thick).
  function removeSmallParts(mask, w, h, minSize, dt, t) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const members = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let minX = w; let minY = h; let maxX = 0; let maxY = 0; let thickest = 0;
      members.length = 0;
      while (sp) {
        const i = stack[--sp];
        members.push(i);
        if (dt && dt[i] > thickest) thickest = dt[i];
        const x = i % w; const y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
          }
        }
      }
      const solid = dt && thickest >= t * 0.7 && members.length >= t * t * 3;
      if (!solid && Math.max(maxX - minX, maxY - minY) < minSize) for (const i of members) mask[i] = 0;
    }
  }

  // A frame or border around the whole drawing would hold the outside back. A frame is a line that spans
  // almost the whole picture and lies only along the edge of its own bounding box: it is painted white.
  function removeFrames(gray, w, h, thr) {
    const n = w * h;
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    const members = [];
    for (let s = 0; s < n; s++) {
      if (seen[s] || gray[s] > thr) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let minX = w; let minY = h; let maxX = 0; let maxY = 0;
      members.length = 0;
      while (sp) {
        const i = stack[--sp];
        members.push(i);
        const x = i % w; const y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!seen[j] && gray[j] <= thr) { seen[j] = 1; stack[sp++] = j; }
          }
        }
      }
      const bw = maxX - minX + 1; const bh = maxY - minY + 1;
      if (bw < w * 0.8 || bh < h * 0.8) continue;
      const band = Math.max(3, Math.round(Math.min(bw, bh) * 0.03));
      let onEdge = 0;
      for (const i of members) {
        const x = i % w; const y = (i - x) / w;
        if (x - minX < band || maxX - x < band || y - minY < band || maxY - y < band) onEdge++;
      }
      if (onEdge >= members.length * 0.95) for (const i of members) gray[i] = 255;
    }
  }

  // Bounding box [minX, minY, maxX, maxY] around the walls of the drawing: the biggest connected part of
  // the mask and the parts close to it, without a logo or legend elsewhere on the page.
  function mainDrawing(mask, w, h) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const parts = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let count = 0; let minX = w; let minY = h; let maxX = 0; let maxY = 0;
      while (sp) {
        const i = stack[--sp];
        count++;
        const x = i % w; const y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
      }
      parts.push({ count, box: [minX, minY, maxX, maxY] });
    }
    if (!parts.length) return null;
    parts.sort((p, q) => q.count - p.count);
    // Grow from the biggest part with parts that lie close to it (pieces of the same drawing cut apart by
    // openings); a logo or legend with white space in between stays out.
    const box = parts[0].box.slice();
    let grew = true;
    while (grew) {
      grew = false;
      const reach = 0.08 * Math.max(box[2] - box[0], box[3] - box[1]);
      for (const p of parts) {
        if (p.used || p.count < parts[0].count * 0.02) continue;
        const near = p.box[0] <= box[2] + reach && p.box[2] >= box[0] - reach && p.box[1] <= box[3] + reach && p.box[3] >= box[1] - reach;
        if (!near) continue;
        p.used = true; grew = true;
        box[0] = Math.min(box[0], p.box[0]); box[1] = Math.min(box[1], p.box[1]);
        box[2] = Math.max(box[2], p.box[2]); box[3] = Math.max(box[3], p.box[3]);
      }
    }
    return box;
  }

  /* ----------------------------------------------------------- detect */

  function detect(img, options) {
    const opts = options || {};
    const w = img.width; const h = img.height; const n = w * h;
    const gray = toGray(img);
    let thr = opts.darkness != null ? Math.round(opts.darkness * 255) : Math.min(200, otsu(gray));
    removeFrames(gray, w, h, Math.round((thr + 255) / 2));
    const dark = new Uint8Array(n);
    for (let i = 0; i < n; i++) dark[i] = gray[i] <= thr ? 1 : 0;
    let dtDark = distance(dark, w, h);
    let thick = wallThickness(dark, dtDark, w, h);
    // Large dark areas (roof tiles, a dark floor) would count as one huge wall. Then walls are only the
    // darkest part: split the dark pixels once more and keep the darker half.
    if (opts.darkness == null && thick.outer > 0.06 * Math.min(w, h)) {
      const darker = [];
      for (let i = 0; i < n; i += 3) if (gray[i] <= thr) darker.push(gray[i]);
      thr = otsu(Uint8Array.from(darker));
      for (let i = 0; i < n; i++) dark[i] = gray[i] <= thr ? 1 : 0;
      dtDark = distance(dark, w, h);
      thick = wallThickness(dark, dtDark, w, h);
    }
    // Thin lines (door arcs, window lines) come out lighter on scans and small pictures: a milder threshold for them.
    const inkThr = Math.round((thr + 255) / 2) - 8;
    const ink = new Uint8Array(n);
    for (let i = 0; i < n; i++) ink[i] = gray[i] <= inkThr ? 1 : 0;

    // 1. Walls: open the dark mask with a disc a bit smaller than half the wall thickness.
    const t = thick.wall;
    const r = Math.max(1, t * 0.38);
    const eroded = new Uint8Array(n);
    for (let i = 0; i < n; i++) eroded[i] = dtDark[i] >= r ? 1 : 0;
    const notEroded = new Uint8Array(n);
    for (let i = 0; i < n; i++) notEroded[i] = eroded[i] ? 0 : 1;
    const toWall = distance(notEroded, w, h, false);
    const wall = new Uint8Array(n);
    for (let i = 0; i < n; i++) wall[i] = eroded[i] || toWall[i] <= r + 0.75 ? 1 : 0;
    removeSmallParts(wall, w, h, Math.max(12 * t, 0.04 * Math.max(w, h)), dtDark, t);

    // 2. Horizontal and vertical wall bands: wall pixels whose run across is about a wall thick.
    const runH = new Uint16Array(n); const runV = new Uint16Array(n);
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!wall[y * w + x]) { x++; continue; }
        let e = x; while (e < w && wall[y * w + e]) e++;
        for (let k = x; k < e; k++) runH[y * w + k] = e - x;
        x = e;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (!wall[y * w + x]) { y++; continue; }
        let e = y; while (e < h && wall[e * w + x]) e++;
        for (let k = y; k < e; k++) runV[k * w + x] = e - y;
        y = e;
      }
    }
    const maxBand = thick.outer * 1.5 + 2;
    const bandH = new Uint8Array(n); const bandV = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!wall[i]) continue;
      if (runV[i] <= maxBand && runH[i] >= runV[i] * 1.5) bandH[i] = 1;
      if (runH[i] <= maxBand && runV[i] >= runH[i] * 1.5) bandV[i] = 1;
    }

    // 3. Openings: a gap of non-wall between two pieces of the same wall band.
    const pxPerCm = opts.pxPerCm || null;
    const gapMin = Math.max(t * 1.6, pxPerCm ? 40 * pxPerCm : 0);
    const gapMax = pxPerCm ? 420 * pxPerCm : t * 40;
    const doorMax = pxPerCm ? 135 * pxPerCm : t * 12;
    const openings = [];
    const closed = Uint8Array.from(wall);

    function scanGaps(horizontal) {
      const band = horizontal ? bandH : bandV;
      const L = horizontal ? h : w; const M = horizontal ? w : h;
      const idx = (line, pos) => (horizontal ? line * w + pos : pos * w + line);
      const hits = [];
      for (let line = 0; line < L; line++) {
        let pos = 0;
        while (pos < M) {
          if (!band[idx(line, pos)]) { pos++; continue; }
          let end = pos; while (end < M && wall[idx(line, end)]) end++;
          let next = end; while (next < M && !wall[idx(line, next)]) next++;
          const gap = next - end;
          if (next < M && band[idx(line, next)] && gap >= gapMin && gap <= gapMax) hits.push({ line, a: end, b: next - 1 });
          pos = next;
        }
      }
      // Group hits on nearby lines whose spans mostly overlap into one opening (window lines may interrupt it).
      hits.sort((p, q) => p.line - q.line || p.a - q.a);
      const groups = [];
      const skip = Math.max(3, Math.round(t * 0.6));
      for (const hit of hits) {
        const g = groups.find((x) => hit.line - x.l1 <= skip
          && Math.min(x.b, hit.b) - Math.max(x.a, hit.a) >= 0.6 * Math.min(x.b - x.a, hit.b - hit.a));
        if (g) { g.l1 = hit.line; g.as.push(hit.a); g.bs.push(hit.b); } else groups.push({ l0: hit.line, l1: hit.line, a: hit.a, b: hit.b, as: [hit.a], bs: [hit.b] });
      }
      const median = (v) => v.slice().sort((p, q) => p - q)[Math.floor(v.length / 2)];
      for (const g of groups) { g.a = median(g.as); g.b = median(g.bs); }
      for (const g of groups) {
        // The real depth of the wall at this opening: as far as the wall continues on both sides of the gap.
        const isWallAt = (line, pos) => line >= 0 && line < L && pos >= 0 && pos < M && wall[idx(line, pos)];
        let lo = g.l0; let hi = g.l1;
        while (lo > 0 && lo > g.l0 - maxBand && (isWallAt(lo - 1, g.a - 1) || isWallAt(lo - 1, g.b + 1))) lo--;
        while (hi < L - 1 && hi < g.l1 + maxBand && (isWallAt(hi + 1, g.a - 1) || isWallAt(hi + 1, g.b + 1))) hi++;
        g.l0 = lo; g.l1 = hi;
        const depth = g.l1 - g.l0 + 1;
        if (depth < Math.max(2, t * 0.5) || depth > maxBand * 1.3) continue;
        const width = g.b - g.a + 1;
        // A window has at least one line running along the opening inside the wall; a door or passage has none.
        let lines = 0;
        for (let line = g.l0; line <= g.l1; line++) {
          let c = 0;
          for (let pos = g.a; pos <= g.b; pos++) c += ink[idx(line, pos)];
          if (c >= width * 0.6) lines++;
        }
        let type = lines >= 1 ? 'window' : 'door';
        // A door arc next to the opening makes it a door, also when a threshold line runs through it.
        const swing = { swing: 1, hinge: 1 };
        const doorScore = width <= doorMax ? doorSwing(swing, horizontal, g, idx, L, M) : 0;
        if (doorScore >= 0.55) type = 'door';
        if (type === 'door' && width > doorMax) type = 'passage';
        if (type !== 'passage') {
          for (let line = g.l0; line <= g.l1; line++) for (let pos = g.a; pos <= g.b; pos++) closed[idx(line, pos)] = 1;
        }
        const mid = (g.a + g.b) / 2; const lineMid = (g.l0 + g.l1) / 2;
        const o = { type, width, depth, x: horizontal ? mid : lineMid, y: horizontal ? lineMid : mid, angle: horizontal ? 0 : Math.PI / 2, swing: 1, hinge: 1 };
        if (type === 'door') { o.swing = swing.swing; o.hinge = swing.hinge; }
        if (type === 'passage') {
          // Remembered to close it later if it turns out to connect a room with the outside.
          const at = (line) => { const l = Math.max(0, Math.min(L - 1, line)); const q = Math.round(mid); return idx(l, q); };
          o.bridge = { cells: [], probes: [at(g.l0 - 3), at(g.l1 + 3)] };
          for (let line = g.l0; line <= g.l1; line++) for (let pos = g.a; pos <= g.b; pos++) o.bridge.cells.push(idx(line, pos));
        }
        openings.push(o);
      }
    }

    // Which way a door opens: try the four possibilities (side x hinge end) and look for the quarter-circle
    // arc and the leaf line exactly where that possibility would draw them.
    function doorSwing(o, horizontal, g, idx, L, M) {
      const width = g.b - g.a + 1;
      const darkNear = (line, pos) => {
        for (let dl = -1; dl <= 1; dl++) {
          for (let dp = -1; dp <= 1; dp++) {
            const l = Math.round(line) + dl; const q = Math.round(pos) + dp;
            if (l >= 0 && l < L && q >= 0 && q < M && ink[idx(l, q)] && !wall[idx(l, q)]) return 1;
          }
        }
        return 0;
      };
      let best = { score: -1, side: 1, start: true };
      for (const side of [1, -1]) {
        const face = side > 0 ? g.l1 + 1 : g.l0 - 1;
        for (const start of [true, false]) {
          const hinge = start ? g.a : g.b; const dir = start ? 1 : -1;
          let arc = 0;
          for (let k = 1; k < 24; k++) {
            const th = (Math.PI / 2) * (k / 24);
            arc += darkNear(face + side * Math.sin(th) * width, hinge + dir * Math.cos(th) * width);
          }
          let leaf = 0;
          const steps = Math.max(4, Math.round(width / 2));
          for (let k = 1; k < steps; k++) leaf += darkNear(face + side * (k / steps) * width, hinge + dir);
          const score = arc / 23 + leaf / (steps - 1);
          if (score > best.score) best = { score, side, start };
        }
      }
      // Normal of an opening at `angle` is (-sin, cos): +y for horizontal walls, -x for vertical ones.
      o.swing = horizontal ? best.side : -best.side;
      o.hinge = best.start ? 1 : -1;
      return best.score;
    }

    scanGaps(true);
    scanGaps(false);

    // 4. Rooms: areas enclosed by walls (doors and windows closed), not reaching the edge of the picture.
    const label = new Int32Array(n);
    const minArea = pxPerCm ? 0.3 * 10000 * pxPerCm * pxPerCm : (t * 4) * (t * 4);
    const stack = new Int32Array(n);
    // Regions are first split by walls and by thin lines (window lines, furniture, text), then the pieces
    // inside the house are joined again across thin lines, but never with the outside. So a window drawn in
    // any direction closes a room off, while furniture and text inside a room do not cut it up.
    const barrier = (i) => closed[i] || (ink[i] && !closed[i]);
    // Outside is what the picture's edge reaches through spaces wider than a door: an entrance without a
    // drawn door, or a wide opening, does not pull the hall or the rooms behind it outside.
    // Lines in or right next to a wall (window frames and glass, even when drawn light) belong to the wall
    // line: they hold the outside back and count as wall around a room. Text further away does not.
    const notWall = new Uint8Array(n);
    for (let i = 0; i < n; i++) notWall[i] = closed[i] ? 0 : 1;
    const toWallPx = distance(notWall, w, h, false);
    const wallLine = new Uint8Array(n);
    for (let i = 0; i < n; i++) wallLine[i] = closed[i] || ((ink[i] || gray[i] <= 235) && toWallPx[i] <= maxBand * 0.6) ? 1 : 0;
    function outsideMask() {
      const free = new Uint8Array(n);
      for (let i = 0; i < n; i++) free[i] = wallLine[i] ? 0 : 1;
      const room = distance(free, w, h, false);
      const R = Math.max(3, pxPerCm ? 60 * pxPerCm : t * 5);
      const core = new Uint8Array(n);
      for (let i = 0; i < n; i++) core[i] = room[i] > R ? 1 : 0;
      const reached = new Uint8Array(n);
      let sp = 0;
      for (let i = 0; i < n; i++) {
        const x = i % w; const y = (i - x) / w;
        if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && (core[i] || free[i])) { reached[i] = 1; stack[sp++] = i; }
      }
      while (sp) {
        const i = stack[--sp];
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= n || reached[j] || !core[j]) continue;
          reached[j] = 1; stack[sp++] = j;
        }
      }
      // Grow the reached core back by R through free space only (not through walls), up to the walls.
      const out = new Uint8Array(n);
      const steps = new Uint16Array(n);
      let head = 0; let tail = 0;
      const queue = new Int32Array(n);
      for (let i = 0; i < n; i++) if (reached[i]) { out[i] = 1; queue[tail++] = i; }
      const maxSteps = Math.ceil(R * 1.2) + 1;
      while (head < tail) {
        const i = queue[head++];
        if (steps[i] >= maxSteps) continue;
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= n || out[j] || !free[j]) continue;
          out[j] = 1; steps[j] = steps[i] + 1; queue[tail++] = j;
        }
      }
      return out;
    }
    let outside = null;
    function labelRegions() {
      if (!outside) outside = outsideMask();
      label.fill(-1);
      for (let i = 0; i < n; i++) if (outside[i]) label[i] = -2;
      const cells = [];
      let comp = 0;
      for (let s0 = 0; s0 < n; s0++) {
        if (barrier(s0) || label[s0] !== -1) continue;
        let sp = 0; stack[sp++] = s0; label[s0] = comp;
        let edge = false;
        while (sp) {
          const i = stack[--sp];
          const x = i % w; const y = (i - x) / w;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
          if (x > 0 && !barrier(i - 1) && label[i - 1] === -1) { label[i - 1] = comp; stack[sp++] = i - 1; }
          if (x < w - 1 && !barrier(i + 1) && label[i + 1] === -1) { label[i + 1] = comp; stack[sp++] = i + 1; }
          if (y > 0 && !barrier(i - w) && label[i - w] === -1) { label[i - w] = comp; stack[sp++] = i - w; }
          if (y < h - 1 && !barrier(i + w) && label[i + w] === -1) { label[i + w] = comp; stack[sp++] = i + w; }
        }
        cells.push({ edge });
        comp++;
      }
      // Join cells that touch across thin lines (within 2 px), except cells that reach the outside.
      const parent = cells.map((_, i) => i);
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const near = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (closed[i] || !ink[i]) continue;
          near.length = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const xx = x + dx; const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const l = label[yy * w + xx];
              if (l >= 0 && !cells[l].edge) near.push(l);
            }
          }
          for (let k = 1; k < near.length; k++) { const a = find(near[0]); const b = find(near[k]); if (a !== b) parent[b] = a; }
        }
      }
      // Relabel by joined cell, and give thin-line pixels inside one room to that room (no cracks in outlines).
      for (let i = 0; i < n; i++) if (label[i] >= 0) label[i] = cells[label[i]].edge ? -2 : find(label[i]);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (closed[i] || !ink[i]) continue;
          let room = -1; let mixed = false;
          for (let dy = -2; dy <= 2 && !mixed; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const xx = x + dx; const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const l = label[yy * w + xx];
              if (l === -1) continue;
              if (l === -2 || (room >= 0 && l !== room)) { mixed = true; break; }
              room = l;
            }
          }
          if (!mixed && room >= 0) label[i] = room;
        }
      }
      const comps = new Map();
      for (let i = 0; i < n; i++) {
        const l = label[i];
        if (l < 0) continue;
        const x = i % w; const y = (i - x) / w;
        let c = comps.get(l);
        if (!c) { c = { id: l, area: 0, edge: false, box: [x, y, x, y] }; comps.set(l, c); }
        c.area++;
        if (x < c.box[0]) c.box[0] = x; if (y < c.box[1]) c.box[1] = y; if (x > c.box[2]) c.box[2] = x; if (y > c.box[3]) c.box[3] = y;
      }
      // How much of each region's edge runs along a wall (as opposed to a thin line or open space).
      for (let i = 0; i < n; i++) {
        const l = label[i];
        if (l < 0) continue;
        const x = i % w;
        let boundary = false; let byWall = false;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= n || label[j] === l) continue;
          boundary = true;
          if (wallLine[j]) byWall = true;
        }
        if (!boundary) continue;
        const c = comps.get(l);
        c.edgePx = (c.edgePx || 0) + 1;
        if (byWall) c.wallPx = (c.wallPx || 0) + 1;
      }
      const list = [...comps.values()];
      const edgeComp = { id: -2, area: 0, edge: true, box: [0, 0, w - 1, h - 1] };
      list.byId = (id) => (id === -2 ? edgeComp : comps.get(id));
      return list;
    }
    let comps = labelRegions();
    // A wide opening through which a room runs out of the picture is in an outside wall (a window drawn
    // unclearly, a glass front): close it and count it as a window. Wide openings between rooms stay open.
    let bridged = 0;
    for (const o of openings) {
      if (!o.bridge) continue;
      const [p1, p2] = o.bridge.probes.map((i) => label[i]);
      if (p1 === -2 && p2 === -2) {
        for (const i of o.bridge.cells) closed[i] = 1;
        o.type = 'window';
        bridged++;
      }
    }
    for (const o of openings) delete o.bridge;
    if (bridged) comps = labelRegions();
    // A room is mostly empty paper inside; a solid block (furniture fill, legend) is not.
    const rooms = comps.filter((c) => !c.edge && c.area >= minArea && c.area >= 0.25 * (c.box[2] - c.box[0] + 1) * (c.box[3] - c.box[1] + 1)
      && (c.wallPx || 0) >= 0.7 * (c.edgePx || 1));

    // The drawing itself is the biggest network of walls; rooms and openings far outside it belong to
    // something else on the page (a logo, a legend, a second small drawing).
    const main = mainDrawing(closed, w, h);
    const margin = Math.max(10, t * 3);
    const inMain = (x, y) => !main || (x >= main[0] - margin && y >= main[1] - margin && x <= main[2] + margin && y <= main[3] + margin);
    for (let k = openings.length - 1; k >= 0; k--) if (!inMain(openings[k].x, openings[k].y)) openings.splice(k, 1);
    const roomPolys = [];
    for (const room of rooms.filter((c) => inMain(c.box[0], c.box[1]) && inMain(c.box[2], c.box[3]))) {
      const outline = traceOutline(label, room.id, room.box, w, h);
      if (outline.length < 4) continue;
      let poly = simplify(outline, Math.max(1.5, t * 0.6));
      poly = orthogonalize(poly);
      if (poly.length < 3) continue;
      poly = toCenterline(poly, label, room.id, closed, w, h, t, maxBand);
      roomPolys.push({ points: poly, area: room.area });
    }

    const result = { thickness: thick, threshold: thr, rooms: roomPolys, openings };
    if (opts.debug) result.debug = { wall, closed, ink, outside, label };
    return result;
  }

  /* ---------------------------------------------------- room outlines */

  // Outline of a region as the corners of its pixel squares, walked with the region on the right-hand side.
  // Only the corners where the direction changes are kept.
  function traceOutline(label, id, box, w, h) {
    const cell = (x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === id;
    let sx = -1; let sy = -1;
    for (let y = box[1]; y <= box[3] && sx < 0; y++) {
      for (let x = box[0]; x <= box[2]; x++) if (cell(x, y)) { sx = x; sy = y; break; }
    }
    if (sx < 0) return [];
    const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1]; // right, down, left, up
    let x = sx; let y = sy; let dir = 0;
    const pts = [];
    const limit = 4 * (box[2] - box[0] + 3) * (box[3] - box[1] + 3);
    for (let step = 0; step < limit; step++) {
      const next = nextDir(dir, x, y, cell);
      if (next !== dir || step === 0) pts.push([x, y]);
      dir = next;
      x += DX[dir]; y += DY[dir];
      if (x === sx && y === sy) break;
    }
    return pts;
  }

  // At corner (x, y): the pixels right and left of the edge leaving in each direction. Turn right if the
  // region allows it, else go straight, else turn left, so the region always stays on the right.
  function nextDir(dir, x, y, cell) {
    const rightOf = [[x, y], [x - 1, y], [x - 1, y - 1], [x, y - 1]];
    const leftOf = [[x, y - 1], [x, y], [x - 1, y], [x - 1, y - 1]];
    for (const turn of [1, 0, 3]) {
      const d = (dir + turn) % 4;
      if (cell(rightOf[d][0], rightOf[d][1]) && !cell(leftOf[d][0], leftOf[d][1])) return d;
    }
    return (dir + 2) % 4;
  }

  function simplify(pts, eps) {
    // Douglas-Peucker on a closed outline: split at the two farthest-apart points.
    if (pts.length < 4) return pts;
    let a = 0; let b = 0; let best = -1;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 200))) {
      for (let j = i + 1; j < pts.length; j += Math.max(1, Math.floor(pts.length / 200))) {
        const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
        if (d > best) { best = d; a = i; b = j; }
      }
    }
    const part1 = dp(pts.slice(a, b + 1), eps);
    const part2 = dp(pts.slice(b).concat(pts.slice(0, a + 1)), eps);
    return part1.slice(0, -1).concat(part2.slice(0, -1));
  }

  function dp(pts, eps) {
    if (pts.length < 3) return pts;
    const [x1, y1] = pts[0]; const [x2, y2] = pts[pts.length - 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let far = 0; let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > far) { far = d; idx = i; }
    }
    if (far <= eps) return [pts[0], pts[pts.length - 1]];
    return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
  }

  // Edges within 10° of horizontal or vertical are made exactly so; tiny edges and straight corners disappear.
  function orthogonalize(poly) {
    let p = poly.map((q) => [q[0], q[1]]);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i]; const b = p[(i + 1) % p.length];
        const dx = b[0] - a[0]; const dy = b[1] - a[1];
        if (Math.abs(dy) <= Math.abs(dx) * 0.18) { const m = (a[1] + b[1]) / 2; a[1] = m; b[1] = m; }
        else if (Math.abs(dx) <= Math.abs(dy) * 0.18) { const m = (a[0] + b[0]) / 2; a[0] = m; b[0] = m; }
      }
    }
    // Drop points on a straight line and duplicates.
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const prev = p[(i - 1 + p.length) % p.length]; const cur = p[i]; const next = p[(i + 1) % p.length];
      const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
      const tiny = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 0.5;
      if (!tiny && Math.abs(cross) > 0.5) out.push(cur);
    }
    return out;
  }

  // Moves every edge out to the middle of the wall behind it, measured at a few places along the edge.
  function toCenterline(poly, label, id, closed, w, h, t, maxBand) {
    const lines = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]; const b = poly[(i + 1) % poly.length];
      const ux = b[0] - a[0]; const uy = b[1] - a[1];
      const L = Math.hypot(ux, uy) || 1;
      let nx = uy / L; let ny = -ux / L;
      // Make the normal point out of the room.
      const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
      const px = Math.floor(mx - nx * 2); const py = Math.floor(my - ny * 2);
      if (!(px >= 0 && py >= 0 && px < w && py < h && label[py * w + px] === id)) { nx = -nx; ny = -ny; }
      const samples = [];
      for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const sx = a[0] + (b[0] - a[0]) * f; const sy = a[1] + (b[1] - a[1]) * f;
        let k = 0;
        // Step out of the room into the wall and count how far the wall goes.
        while (k < maxBand * 2) {
          const qx = Math.floor(sx + nx * (k + 0.5)); const qy = Math.floor(sy + ny * (k + 0.5));
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) break;
          if (k > 1 && !closed[qy * w + qx]) break;
          k++;
        }
        if (k > 1) samples.push(k);
      }
      samples.sort((p, q) => p - q);
      const thickness = samples.length ? samples[Math.floor(samples.length / 2)] : t;
      const off = thickness / 2;
      lines.push({ px: a[0] + nx * off, py: a[1] + ny * off, ux, uy });
    }
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l1 = lines[(i - 1 + lines.length) % lines.length]; const l2 = lines[i];
      const den = l1.ux * l2.uy - l1.uy * l2.ux;
      if (Math.abs(den) < 1e-6) { out.push([l2.px, l2.py]); continue; }
      const s = ((l2.px - l1.px) * l2.uy - (l2.py - l1.py) * l2.ux) / den;
      out.push([l1.px + l1.ux * s, l1.py + l1.uy * s]);
    }
    return out;
  }

  /* --------------------------------------------- to plan centimetres */

  /**
   * Converts a detection to plan coordinates: rooms (with corners of neighbouring rooms merged and
   * walls lined up), openings and the wall thickness, all in cm. `toPlan(x, y)` maps image pixels to cm.
   */
  function toPlan(result, cmPerPx, toPlanPoint) {
    const rooms = result.rooms.map((r) => r.points.map(([x, y]) => toPlanPoint(x, y)));
    // Line up walls: x and y values of all corners within a few cm become one.
    const tol = Math.max(4, result.thickness.wall * cmPerPx * 0.6);
    for (const axis of [0, 1]) {
      const vals = [];
      rooms.forEach((pts, ri) => pts.forEach((p, pi) => vals.push({ v: p[axis], ri, pi })));
      vals.sort((a, b) => a.v - b.v);
      let group = [];
      const flush = () => {
        if (!group.length) return;
        const mean = Math.round(group.reduce((s, g) => s + g.v, 0) / group.length);
        for (const g of group) rooms[g.ri][g.pi][axis] = mean;
        group = [];
      };
      for (const v of vals) {
        if (group.length && v.v - group[group.length - 1].v > tol) flush();
        group.push(v);
      }
      flush();
    }
    const cleaned = rooms.map((pts) => pts.filter((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.5;
    })).filter((pts) => pts.length >= 3);
    const openings = result.openings.filter((o) => o.type !== 'passage').map((o) => {
      const c = toPlanPoint(o.x, o.y);
      return { type: o.type, x: Math.round(c[0]), y: Math.round(c[1]), angle: o.angle, width: Math.round(o.width * cmPerPx), swing: o.swing, hinge: o.hinge };
    });
    return {
      rooms: cleaned,
      openings,
      wallThickness: Math.max(6, Math.min(40, Math.round(result.thickness.wall * cmPerPx))),
    };
  }

  return { detect, toPlan, _internals: { otsu, distance, wallThickness, simplify, orthogonalize } };
}));
