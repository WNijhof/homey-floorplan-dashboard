/*
 * Floorplan core: data model helpers, geometry and the SVG renderer.
 * Shared between the settings-page editor and the dashboard widget (copied by scripts/sync-shared.js).
 *
 * Plan coordinates are centimetres, x to the right and y downwards.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FloorplanCore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // The model catalogue (lib/shared/models.js): loaded before this file in browsers, required in Node.
  function models() {
    if (typeof FloorplanModels !== 'undefined') return FloorplanModels; // eslint-disable-line no-undef
    try { return require('./models'); } catch (e) { return null; }
  }
  const modelOf = (type) => { const M = models(); return M ? M.get(type) : null; };

  const DEFAULTS = {
    wallHeight: 260,
    wallThickness: 12,
    lowWallHeight: 30,
    doorHeight: 210,
    windowSill: 90,
    windowTop: 210,
    lightReach: 250,
  };

  /* ------------------------------------------------------------------ ids */

  function uid(prefix) {
    return `${prefix || 'x'}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function newPlan(name) {
    return { id: uid('plan'), name: name || 'My home', version: 1, levels: [newLevel('Ground floor')] };
  }

  function newLevel(name) {
    return {
      id: uid('lvl'),
      name: name || 'Level',
      wallHeight: DEFAULTS.wallHeight,
      wallThickness: DEFAULTS.wallThickness,
      rooms: [],
      walls: [],
      openings: [],
      items: [],
      background: null,
    };
  }

  /* -------------------------------------------------------------- geometry */

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a) => Math.hypot(a[0], a[1]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dist = (a, b) => len(sub(a, b));

  function signedArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return s / 2;
  }

  function pointInPolygon(pt, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Projection of p on segment ab: { t (0..1), d (distance), point }. */
  function projectOnSegment(p, a, b) {
    const ab = sub(b, a);
    const l2 = dot(ab, ab) || 1;
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    const point = add(a, mul(ab, t));
    return { t, d: dist(p, point), point };
  }

  function distToPolygonEdges(p, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      best = Math.min(best, projectOnSegment(p, pts[i], pts[(i + 1) % pts.length]).d);
    }
    return best;
  }

  function bbox(pts) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  /** A point well inside the polygon for labels (centroid if inside, else the most interior sample). */
  function labelPoint(pts) {
    const a = signedArea(pts);
    let cx = 0; let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      const f = p[0] * q[1] - q[0] * p[1];
      cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    const c = a ? [cx / (6 * a), cy / (6 * a)] : pts[0];
    if (pointInPolygon(c, pts) && distToPolygonEdges(c, pts) > 30) return c;
    const b = bbox(pts);
    let best = c; let bestD = -1;
    for (let i = 1; i < 16; i++) {
      for (let j = 1; j < 16; j++) {
        const p = [b.minX + (b.w * i) / 16, b.minY + (b.h * j) / 16];
        if (!pointInPolygon(p, pts)) continue;
        const d = distToPolygonEdges(p, pts);
        if (d > bestD) { bestD = d; best = p; }
      }
    }
    return best;
  }

  function rotatePt(p, deg) {
    const r = (deg * Math.PI) / 180; const c = Math.cos(r); const s = Math.sin(r);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  }

  function regularPolygon(cx, cy, rx, ry, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.PI / n;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  }

  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  /* ----------------------------------------------------------------- walls */

  /**
   * All wall segments of a level: room edges (shared edges de-duplicated) plus free walls.
   * Each wall: { id, a, b, t, rooms: [roomId] }.
   */
  function levelWalls(level) {
    const t = level.wallThickness || DEFAULTS.wallThickness;
    const map = new Map();
    const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
    for (const room of level.rooms || []) {
      const pts = room.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length];
        if (dist(a, b) < 1) continue;
        const k1 = `${key(a)}|${key(b)}`; const k2 = `${key(b)}|${key(a)}`;
        const existing = map.get(k1) || map.get(k2);
        if (existing) existing.rooms.push(room.id);
        else map.set(k1, { id: `${room.id}:${i}`, a, b, t, rooms: [room.id], edgeOf: room.id, edgeIndex: i });
      }
    }
    for (const w of level.walls || []) {
      map.set(`w:${w.id}`, { id: w.id, a: w.a, b: w.b, t: w.t || t, rooms: [], free: true });
    }
    return [...map.values()];
  }

  /** Openings that sit on wall ab, as intervals along the wall in cm. */
  function openingsOnWall(wall, openings) {
    const L = dist(wall.a, wall.b);
    if (L < 1) return [];
    const u = norm(sub(wall.b, wall.a));
    const out = [];
    for (const o of openings || []) {
      const rel = sub([o.x, o.y], wall.a);
      const off = Math.abs(cross(u, rel));
      const s = dot(rel, u);
      const ou = [Math.cos(o.angle || 0), Math.sin(o.angle || 0)];
      if (off > wall.t / 2 + 3 || s < -1 || s > L + 1 || Math.abs(cross(u, ou)) > 0.1) continue;
      const half = (o.width || 90) / 2;
      out.push({ opening: o, s0: Math.max(0, s - half), s1: Math.min(L, s + half) });
    }
    return out.sort((p, q) => p.s0 - q.s0);
  }

  /** Splits a wall into solid pieces around openings. 2.5D pieces carry z ranges (lintels, sills). */
  function wallPieces(wall, openings, level, withHeights) {
    const H = level.wallHeight || DEFAULTS.wallHeight;
    const L = dist(wall.a, wall.b);
    const u = norm(sub(wall.b, wall.a));
    const at = (s) => add(wall.a, mul(u, s));
    const gaps = openingsOnWall(wall, openings);
    const pieces = [];
    let cursor = 0; let startIsEnd = true;
    for (const g of gaps) {
      if (g.s0 > cursor + 0.5) pieces.push({ a: at(cursor), b: at(g.s0), z0: 0, z1: H, capA: startIsEnd, capB: false });
      if (withHeights) {
        const isWindow = g.opening.type === 'window';
        const top = isWindow ? (g.opening.top || DEFAULTS.windowTop) : (g.opening.height || DEFAULTS.doorHeight);
        if (top < H) pieces.push({ a: at(g.s0), b: at(g.s1), z0: top, z1: H, capA: false, capB: false, part: 'lintel' });
        if (isWindow) {
          const sill = g.opening.sill != null ? g.opening.sill : DEFAULTS.windowSill;
          if (sill > 0) pieces.push({ a: at(g.s0), b: at(g.s1), z0: 0, z1: sill, capA: false, capB: false, part: 'sill' });
        }
      }
      cursor = Math.max(cursor, g.s1); startIsEnd = false;
    }
    if (L > cursor + 0.5) pieces.push({ a: at(cursor), b: at(L), z0: 0, z1: H, capA: startIsEnd, capB: true });
    return pieces;
  }

  /** Footprint quad of a wall piece, extended by half the thickness at real wall ends for clean corners. */
  function wallQuad(piece, t) {
    const u = norm(sub(piece.b, piece.a));
    const n = [-u[1], u[0]];
    const h = t / 2;
    const a = piece.capA ? sub(piece.a, mul(u, h)) : piece.a;
    const b = piece.capB ? add(piece.b, mul(u, h)) : piece.b;
    return [add(a, mul(n, h)), add(b, mul(n, h)), sub(b, mul(n, h)), sub(a, mul(n, h))];
  }

  /* ------------------------------------------------------------- furniture */

  // Parts are footprints in local coordinates (centred, back of the piece at -d/2) with a height range
  // and a tone. The same parts draw the 2D top view and the 2.5D blocks.
  const CATALOGUE = {
    bed: { name: 'Double bed', group: 'Bedroom', w: 160, d: 200, h: 50 },
    bed_single: { name: 'Single bed', group: 'Bedroom', w: 90, d: 200, h: 50 },
    wardrobe: { name: 'Wardrobe', group: 'Bedroom', w: 200, d: 60, h: 210 },
    nightstand: { name: 'Nightstand', group: 'Bedroom', w: 45, d: 40, h: 50 },
    sofa: { name: 'Sofa', group: 'Living', w: 220, d: 90, h: 80 },
    armchair: { name: 'Armchair', group: 'Living', w: 85, d: 85, h: 80 },
    lowboard: { name: 'Lowboard', group: 'Living', w: 180, d: 40, h: 50 },
    tv: { name: 'TV', group: 'Living', w: 145, d: 8, h: 83, z: 100, mount: 'wall' },
    rug: { name: 'Rug', group: 'Living', w: 200, d: 140, h: 1 },
    plant: { name: 'Plant', group: 'Living', w: 45, d: 45, h: 110 },
    shelf: { name: 'Bookcase', group: 'Living', w: 100, d: 30, h: 190 },
    table: { name: 'Dining table', group: 'Dining', w: 180, d: 90, h: 76 },
    table_round: { name: 'Round table', group: 'Dining', w: 110, d: 110, h: 76 },
    chair: { name: 'Chair', group: 'Dining', w: 45, d: 50, h: 90 },
    kitchen: { name: 'Kitchen units', group: 'Kitchen', w: 240, d: 62, h: 90 },
    island: { name: 'Kitchen island', group: 'Kitchen', w: 180, d: 90, h: 92 },
    fridge: { name: 'Fridge', group: 'Kitchen', w: 70, d: 68, h: 190 },
    wall_cabinet: { name: 'Wall cabinet', group: 'Kitchen', w: 120, d: 35, h: 70, z: 145, mount: 'wall' },
    bath: { name: 'Bath', group: 'Bathroom', w: 170, d: 75, h: 58 },
    shower: { name: 'Shower', group: 'Bathroom', w: 90, d: 90, h: 6 },
    toilet: { name: 'Toilet', group: 'Bathroom', w: 40, d: 68, h: 42 },
    sink: { name: 'Washbasin', group: 'Bathroom', w: 60, d: 46, h: 85 },
    washer: { name: 'Washing machine', group: 'Utility', w: 60, d: 60, h: 85 },
    dryer: { name: 'Dryer', group: 'Utility', w: 60, d: 60, h: 85 },
    desk: { name: 'Desk', group: 'Office', w: 140, d: 70, h: 75 },
    car: { name: 'Car', group: 'Other', w: 180, d: 450, h: 150 },
    box: { name: 'Box', group: 'Other', w: 100, d: 100, h: 100 },
    cylinder: { name: 'Cylinder', group: 'Other', w: 80, d: 80, h: 100 },
  };

  function furnitureParts(item) {
    const entry = modelOf(item.type);
    if (entry) item = { ...item, type: entry.parts };
    const w = item.w; const d = item.d; const h = item.h;
    const x0 = -w / 2; const x1 = w / 2; const y0 = -d / 2; const y1 = d / 2;
    const P = (poly, z0, z1, tone) => ({ poly, z0, z1, tone: tone || 'body' });
    switch (item.type) {
      case 'bed': case 'bed_single': {
        const pw = item.type === 'bed' ? (w - 30) / 2 : w - 20;
        const parts = [P(rect(x0, y0, x1, y1), 0, h - 5), P(rect(x0 + 3, y0 + 45, x1 - 3, y1 - 3), h - 5, h, 'soft'), P(rect(x0, y0, x1, y0 + 8), 0, 95)];
        if (item.type === 'bed') {
          parts.push(P(rect(x0 + 10, y0 + 12, x0 + 10 + pw, y0 + 40), h - 5, h + 8, 'light'));
          parts.push(P(rect(x1 - 10 - pw, y0 + 12, x1 - 10, y0 + 40), h - 5, h + 8, 'light'));
        } else parts.push(P(rect(x0 + 10, y0 + 12, x0 + 10 + pw, y0 + 40), h - 5, h + 8, 'light'));
        return parts;
      }
      case 'sofa': case 'armchair': {
        const arm = Math.min(18, w / 5);
        return [
          P(rect(x0 + arm, y0 + 20, x1 - arm, y1), 0, 42, 'soft'),
          P(rect(x0, y0, x1, y0 + 22), 0, h),
          P(rect(x0, y0, x0 + arm, y1), 0, 60),
          P(rect(x1 - arm, y0, x1, y1), 0, 60),
        ];
      }
      case 'table': case 'desk': case 'island': {
        const legs = [[x0 + 4, y0 + 4], [x1 - 10, y0 + 4], [x0 + 4, y1 - 10], [x1 - 10, y1 - 10]]
          .map(([lx, ly]) => P(rect(lx, ly, lx + 6, ly + 6), 0, h - 4, 'dark'));
        if (item.type === 'island') return [P(rect(x0 + 4, y0 + 4, x1 - 4, y1 - 25), 0, h - 4), P(rect(x0, y0, x1, y1), h - 4, h, 'light')];
        return [...legs, P(rect(x0, y0, x1, y1), h - 4, h, 'light')];
      }
      case 'table_round':
        return [P(regularPolygon(0, 0, 8, 8, 8), 0, h - 4, 'dark'), P(regularPolygon(0, 0, w / 2, d / 2, 20), h - 4, h, 'light')];
      case 'chair':
        return [P(rect(x0, y0 + 6, x1, y1), 0, 46), P(rect(x0, y0, x1, y0 + 6), 0, h)];
      case 'kitchen':
        return [P(rect(x0, y0, x1, y1 - 3), 0, h - 4), P(rect(x0, y0, x1, y1), h - 4, h, 'light'), P(rect(x0 + w * 0.6, y0 + 10, x0 + w * 0.6 + 50, y1 - 12), h, h + 0.5, 'dark')];
      case 'bath':
        return [P(rect(x0, y0, x1, y1), 0, h, 'white'), P(regularPolygon(0, 0, w / 2 - 10, d / 2 - 10, 16), h, h + 0.5, 'water')];
      case 'shower':
        return [P(rect(x0, y0, x1, y1), 0, h, 'white'), P(rect(x0, y0, x1, y0 + 2), 0, 200, 'glass'), P(rect(x0, y0, x0 + 2, y1), 0, 200, 'glass')];
      case 'toilet':
        return [P(rect(x0, y0, x1, y0 + 18), 0, 80, 'white'), P(regularPolygon(0, y0 + 18 + (d - 18) / 2, w / 2, (d - 18) / 2, 14), 0, h, 'white')];
      case 'sink':
        return [P(rect(x0, y0, x1, y1), 0, h, 'white'), P(regularPolygon(0, 2, w / 2 - 8, d / 2 - 8, 14), h, h + 0.5, 'water')];
      case 'washer': case 'dryer':
        return [P(rect(x0, y0, x1, y1), 0, h, 'white'), P(regularPolygon(0, 4, w / 2 - 12, d / 2 - 12, 16), h, h + 0.5, 'glass')];
      case 'plant':
        return [P(regularPolygon(0, 0, w / 3, d / 3, 10), 0, 35, 'dark'), P(regularPolygon(0, 0, w / 2, d / 2, 10), 35, h, 'green')];
      case 'cylinder':
        return [P(regularPolygon(0, 0, w / 2, d / 2, 18), 0, h)];
      case 'tv':
        return [P(rect(x0, y0, x1, y1), 0, h, 'screen')];
      case 'rug':
        return [P(rect(x0, y0, x1, y1), 0, h, 'soft')];
      case 'car':
        return [P(rect(x0, y0, x1, y1), 15, 85, 'accent'), P(rect(x0 + 10, y0 + 120, x1 - 10, y1 - 110), 85, h, 'glass')];
      case 'stairs': case 'stairs_l': case 'stairs_spiral':
        return stairParts(item.type, w, d, h, P);
      case 'lowboard':
        return [P(rect(x0, y0, x1, y1), 8, h), P(rect(x0 + 4, y0 + 4, x0 + 10, y1 - 4), 0, 8, 'dark'), P(rect(x1 - 10, y0 + 4, x1 - 4, y1 - 4), 0, 8, 'dark')];
      default:
        return [P(rect(x0, y0, x1, y1), 0, h)];
    }
  }

  // Staircases: one block per step, each a little higher, so the top view shows the treads and 3D the flight.
  // The flight starts at the front edge (+y) and goes up towards the back.
  function stairParts(type, w, d, h, P) {
    const x0 = -w / 2; const x1 = w / 2; const y0 = -d / 2; const y1 = d / 2;
    const tone = (i) => (i % 2 ? 'light' : 'body');
    let n = Math.max(3, Math.round(h / 18.5));
    const parts = [];
    if (type === 'stairs_spiral') {
      const r = Math.min(w, d) / 2;
      const turn = ((330 / n) * Math.PI) / 180;
      const rise = h / n;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI / 2 - i * turn;
        const wedge = [[0, 0]];
        for (let k = 0; k <= 4; k++) { const a = a0 - (turn * k) / 4; wedge.push([Math.cos(a) * r, Math.sin(a) * r]); }
        parts.push(P(wedge, (i + 1) * rise - 5, (i + 1) * rise, tone(i)));
      }
      parts.push(P(regularPolygon(0, 0, 5, 5, 10), 0, h, 'dark'));
      return parts;
    }
    if (type === 'stairs_l') {
      // Up along the right side, three winders in the back corner, then along the back to the left.
      const sw = Math.min(90, w / 2, d / 2);
      const L1 = d - sw; const L2 = w - sw;
      const n1 = Math.max(1, Math.round(((n - 3) * L1) / (L1 + L2)));
      const n2 = Math.max(1, n - 3 - n1);
      n = n1 + 3 + n2;
      const rise = h / n;
      const run1 = L1 / n1; const run2 = L2 / n2;
      for (let i = 0; i < n1; i++) parts.push(P(rect(x1 - sw, y1 - (i + 1) * run1, x1, y1 - i * run1), 0, (i + 1) * rise, tone(i)));
      const A = [x1 - sw, y0 + sw]; const B = [x1, y0 + sw]; const C = [x1, y0]; const D = [x1 - sw, y0];
      const P1 = [x1, y0 + sw / 3]; const P2 = [x1 - sw / 3, y0];
      [[A, B, P1], [A, P1, C, P2], [A, P2, D]].forEach((poly, k) => parts.push(P(poly, 0, (n1 + k + 1) * rise, tone(n1 + k))));
      for (let j = 0; j < n2; j++) parts.push(P(rect(x1 - sw - (j + 1) * run2, y0, x1 - sw - j * run2, y0 + sw), 0, (n1 + 4 + j) * rise, tone(n1 + 3 + j)));
      return parts;
    }
    const rise = h / n; const run = d / n;
    for (let i = 0; i < n; i++) parts.push(P(rect(x0, y1 - (i + 1) * run, x1, y1 - i * run), 0, (i + 1) * rise, tone(i)));
    return parts;
  }

  function newFurniture(type, x, y, lang) {
    const entry = modelOf(type);
    if (entry) {
      return {
        id: uid('itm'), kind: 'furniture', type, x, y, w: entry.w, d: entry.d, h: entry.h, z: entry.mount === 'floor' ? 0 : entry.z,
        mount: entry.mount, rot: 0, label: entry.name[lang] || entry.name.en, color: null,
      };
    }
    const c = CATALOGUE[type] || CATALOGUE.box;
    return { id: uid('itm'), kind: 'furniture', type, x, y, w: c.w, d: c.d, h: c.h, z: c.z || 0, rot: 0, label: c.name, color: null };
  }

  /* --------------------------------------------------------------- devices */

  /**
   * The model a device is shown with: its chosen fixture, else a ceiling light for a light and a wall
   * thermostat for a thermostat. 'none' keeps it to the badge alone.
   */
  function deviceFixture(item, dev) {
    if (item.fixture === 'none') return null;
    if (item.fixture) return modelOf(item.fixture);
    const M = models();
    if (!M || item.shape) return null;
    const kind = deviceKind(dev);
    if (kind === 'light') return M.get(M.DEFAULT_FIXTURE);
    if (kind === 'thermostat') return M.get(M.DEFAULT_THERMOSTAT);
    return null;
  }

  // A device item that lights up: a light, or anything shown as a lamp (a plug or a group with a lamp fixture).
  function isLampItem(item, dev) {
    if (deviceKind(dev) === 'light' || item.isLight) return true;
    const entry = item.fixture && item.fixture !== 'none' ? modelOf(item.fixture) : null;
    return !!(entry && entry.light);
  }

  function deviceKind(device) {
    if (!device) return 'other';
    const c = device.caps || {};
    const cls = device.cls;
    if (cls === 'light' || ('dim' in c && 'onoff' in c && cls !== 'socket' && cls !== 'fan')) return 'light';
    // A group of lamps from a group app: any light capability, or a group that is only switched.
    if (device.group && ('light_hue' in c || 'light_temperature' in c || ('onoff' in c && !('measure_power' in c) && cls !== 'socket'))) return 'light';
    if ('alarm_smoke' in c || 'alarm_co' in c) return 'smoke';
    if (cls === 'lock' || 'locked' in c) return 'lock';
    if (cls === 'thermostat' || cls === 'heater' || 'target_temperature' in c) return 'thermostat';
    if (cls === 'windowcoverings' || cls === 'blinds' || cls === 'curtain' || cls === 'sunshade' || 'windowcoverings_set' in c || 'windowcoverings_state' in c) return 'cover';
    if (cls === 'speaker' || 'speaker_playing' in c) return 'speaker';
    if (cls === 'tv') return 'tv';
    if ('alarm_contact' in c) return 'contact';
    if ('alarm_motion' in c) return 'motion';
    if (cls === 'socket' || ('onoff' in c)) return 'socket';
    if ('measure_temperature' in c || 'measure_humidity' in c || cls === 'sensor') return 'sensor';
    return 'other';
  }

  // Where a device goes by default: lights and smoke detectors on the ceiling, plugs and sensors on walls.
  function defaultMount(kind) {
    if (kind === 'light' || kind === 'smoke') return 'ceiling';
    if (kind === 'socket' || kind === 'sensor' || kind === 'thermostat' || kind === 'contact' || kind === 'motion' || kind === 'tv' || kind === 'lock') return 'wall';
    return 'floor';
  }

  function isOn(device) {
    if (!device) return false;
    const c = device.caps;
    if ('onoff' in c) return c.onoff === true;
    if ('dim' in c) return c.dim > 0;
    if ('speaker_playing' in c) return c.speaker_playing === true;
    return false;
  }

  /** Fraction of a cover that is closed (0 open .. 1 closed), or null if unknown. */
  function coverClosed(device) {
    if (!device) return null;
    const c = device.caps;
    if (typeof c.windowcoverings_set === 'number') return 1 - c.windowcoverings_set;
    if (c.windowcoverings_state === 'down') return 1;
    if (c.windowcoverings_state === 'up') return 0;
    return null;
  }

  /** Short live value shown beside a device on the plan, e.g. "20.9°", "85 W", "60%". */
  function deviceValueText(device, skip) {
    if (!device) return null;
    const c = { ...device.caps };
    if (skip) for (const cap of skip) delete c[cap];
    const kind = deviceKind(device);
    const parts = [];
    if (typeof c.measure_temperature === 'number') parts.push(`${c.measure_temperature.toFixed(1)}°`);
    if (typeof c.target_temperature === 'number' && kind === 'thermostat') parts.push(`→${c.target_temperature}°`);
    if (typeof c.measure_humidity === 'number') parts.push(`${Math.round(c.measure_humidity)}%`);
    if (kind === 'light' && isOn(device) && typeof c.dim === 'number') parts.push(`${Math.round(c.dim * 100)}%`);
    if (kind === 'cover' && typeof c.windowcoverings_set === 'number') parts.push(`${Math.round(c.windowcoverings_set * 100)}%`);
    if (typeof c.measure_power === 'number' && (c.measure_power >= 1 || kind === 'socket')) {
      parts.push(c.measure_power >= 1000 ? `${(c.measure_power / 1000).toFixed(1)} kW` : `${Math.round(c.measure_power)} W`);
    }
    if (kind === 'speaker' && c.speaker_playing && c.speaker_track) parts.push(`♪ ${String(c.speaker_track).slice(0, 18)}`);
    return parts.length ? parts.slice(0, 2).join(' · ') : null;
  }

  function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }

  function rgbHex(rgb) {
    return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  }

  function hexRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  }

  function mix(hexA, hexB, t) {
    const a = hexRgb(hexA); const b = hexRgb(hexB);
    return rgbHex(a.map((v, i) => v + (b[i] - v) * t));
  }

  const shade = (hex, k) => rgbHex(hexRgb(hex).map((v) => v * k));

  function lightColor(device) {
    const c = (device && device.caps) || {};
    const useColor = c.light_mode === 'color' || (c.light_mode == null && typeof c.light_hue === 'number' && !('light_temperature' in c));
    if (useColor && typeof c.light_hue === 'number') {
      return hsl(c.light_hue * 360, typeof c.light_saturation === 'number' ? c.light_saturation : 1, 0.62);
    }
    if (typeof c.light_temperature === 'number') return mix('#dce8ff', '#ffb25a', c.light_temperature);
    return '#ffcf87';
  }

  function lightIntensity(device) {
    if (!isOn(device)) return 0;
    const c = device.caps;
    return typeof c.dim === 'number' ? Math.max(0.15, c.dim) : 1;
  }

  /** Temperature, humidity and thermostat target for a room, from its zone or its chosen devices. */
  // Devices that measure something other than the air of the room (water in a boiler, a fridge, an oven).
  const NOT_ROOM_CLASS = /boiler|water|heatpump|heat_pump|kettle|oven|fridge|freezer|coffee|cooker|dishwasher|washer|dryer|car|evcharger|vacuum/i;
  const roomish = (d) => !NOT_ROOM_CLASS.test(d.cls || '');
  const plausible = (v) => typeof v === 'number' && v > 5 && v < 35;

  /**
   * Temperature, humidity and thermostat target for a room. Chosen devices win; otherwise the thermostat of
   * the zone, otherwise the average of the room sensors in it (not a boiler or other appliance).
   */
  function roomReadings(room, devices) {
    const byId = devices instanceof Map ? devices : new Map(devices.map((d) => [d.id, d]));
    const inZone = room.zoneId ? [...byId.values()].filter((d) => d.zone === room.zoneId) : [];
    const thermostats = inZone.filter((d) => roomish(d) && plausible(d.caps.target_temperature)
      && (d.caps.measure_temperature == null || plausible(d.caps.measure_temperature)));
    const thermostat = thermostats.find((d) => d.cls === 'thermostat') || thermostats[0] || null;
    const climate = room.climateDevice ? byId.get(room.climateDevice) || null : thermostat;
    const sources = { measure_temperature: [], measure_humidity: [] };
    const pick = (cap, chosen, accept) => {
      if (chosen) {
        const d = byId.get(chosen);
        if (!d || typeof d.caps[cap] !== 'number') return null;
        sources[cap] = [d.id];
        return d.caps[cap];
      }
      if (cap === 'measure_temperature' && climate && plausible(climate.caps.measure_temperature)) {
        sources[cap] = [climate.id];
        return climate.caps.measure_temperature;
      }
      const used = inZone.filter((d) => roomish(d) && accept(d.caps[cap]));
      sources[cap] = used.map((d) => d.id);
      return used.length ? used.reduce((sum, d) => sum + d.caps[cap], 0) / used.length : null;
    };
    const readings = {
      temperature: pick('measure_temperature', room.tempDevice, plausible),
      humidity: pick('measure_humidity', room.humDevice, (v) => typeof v === 'number' && v >= 0 && v <= 100),
      target: climate && typeof climate.caps.target_temperature === 'number' ? climate.caps.target_temperature : null,
      climateId: climate ? climate.id : null,
    };
    // Not enumerable, so comparisons and JSON of the readings stay as they were.
    Object.defineProperty(readings, 'sources', { value: sources, enumerable: false });
    return readings;
  }

  /**
   * What a room label shows, and which device values it takes over: a sensor or thermostat whose
   * temperature, target or humidity is already on the room label does not show it again by itself.
   * Returns { values: ['20.9°', '→ 21°'], hidden: Map(deviceId -> [capability]) }.
   */
  function roomLabel(room, devices, opts) {
    const rd = roomReadings(room, devices);
    const values = [];
    const hidden = new Map();
    const hide = (id, cap) => { if (!hidden.has(id)) hidden.set(id, []); hidden.get(id).push(cap); };
    const showHumidity = rd.humidity != null && ((opts && opts.tint === 'humidity') || rd.temperature == null);
    if (rd.temperature != null) { values.push(`${rd.temperature.toFixed(1)}°`); rd.sources.measure_temperature.forEach((id) => hide(id, 'measure_temperature')); }
    if (rd.target != null) { values.push(`→ ${rd.target}°`); hide(rd.climateId, 'target_temperature'); }
    if (showHumidity) { values.push(`${Math.round(rd.humidity)}%`); rd.sources.measure_humidity.forEach((id) => hide(id, 'measure_humidity')); }
    return { readings: rd, values, hidden };
  }

  function scaleColor(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [v0, c0] = stops[i - 1]; const [v1, c1] = stops[i];
        return mix(c0, c1, (v - v0) / (v1 - v0));
      }
    }
    return stops[stops.length - 1][1];
  }

  // Fixed scales so colours mean the same everywhere: blue cold, green comfortable, orange-red warm.
  const TEMP_STOPS = [[14, '#3d6fd6'], [18, '#39a6c9'], [20, '#46b07a'], [22, '#7cc05a'], [24, '#f0a23c'], [27, '#e0503a']];
  const HUM_STOPS = [[25, '#d8b276'], [40, '#cfc79a'], [50, '#7fbf96'], [65, '#4d8fd6'], [80, '#2f5fc0']];
  const tintColor = (by, v) => (by === 'humidity' ? scaleColor(HUM_STOPS, v) : scaleColor(TEMP_STOPS, v));

  /* ------------------------------------------------------------ projection */

  const ANGLES = { iso: 35.264, game: 30, steep: 50 };

  /**
   * view: { mode: '2d' | 'iso' | 'game' | 'steep', turn: 0..3 }.
   * 2D: plan rotated in quarter turns. 2.5D: rotated an extra 45° and looked at from `elev` degrees,
   * orthographic, so the floor is an affine image of the plan.
   */
  function makeView(view) {
    const mode = view && ANGLES[view.mode] ? view.mode : '2d';
    const turn = ((view && Number(view.turn)) || 0) % 4;
    const is3d = mode !== '2d';
    const phi = ((turn * 90 + (is3d ? 45 : 0)) * Math.PI) / 180;
    const elev = is3d ? (ANGLES[mode] * Math.PI) / 180 : Math.PI / 2;
    const cp = Math.cos(phi); const sp = Math.sin(phi);
    const s = Math.sin(elev); const ch = Math.cos(elev);
    return {
      mode, turn, is3d, cp, sp, s, ch,
      matrix: [cp, s * sp, -sp, s * cp, 0, 0],
      project(x, y, z) { return [x * cp - y * sp, (x * sp + y * cp) * s - (z || 0) * ch]; },
      depth(x, y) { return x * sp + y * cp; },
      // Plan direction's component towards the viewer (positive = faces the viewer).
      facing(nx, ny) { return nx * sp + ny * cp; },
      screenX(nx, ny) { return nx * cp - ny * sp; },
    };
  }

  /* -------------------------------------------------------------- renderer */

  const GLYPHS = {
    light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
    socket: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
    thermostat: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 10v7',
    sensor: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z',
    cover: 'M4 4h16M5 4v13h14V4M5 9h14M5 13h14',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    speaker: 'M7 3h10v18H7zM12 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 7h.01',
    tv: 'M3 5h18v12H3zM8 21h8',
    smoke: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    contact: 'M5 3h10v18H5zM15 5l4 2v12l-4 2M12 12h.01',
    motion: 'M13 3.5a1.5 1.5 0 1 0 0 .1M9 21l2.5-6 3 3v3M8 12l3.5-4 3 3 3 1M11.5 8l-1 7',
    other: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const ptsAttr = (pts) => pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');

  const LIGHT_PALETTE = {
    dark: false, bg: '#f4f3ef', floor: '#ffffff', wall: '#3b3f46', wallTop: '#4a4f57', wallSide: '#d9d6cf',
    body: '#cfc8bd', soft: '#e3ddd3', light: '#efebe4', dark2: '#7d756a', white: '#fbfbfa', water: '#bfdcef',
    glass: '#b9d4e6', green: '#6fa36a', screen: '#26282c', accent: '#5f7fbf', door: '#9b7b5a', window: '#9cc6e4',
    blind: '#6d6a64', text: '#1d1f23', textDim: '#6b6f78', labelBg: 'rgba(255,255,255,0.86)',
    deviceOff: '#ffffff', deviceStroke: '#3b3f46', alarm: '#e0453a', ok: '#3aa36b', grid: '#e8e5de',
  };
  const DARK_PALETTE = {
    dark: true, bg: '#151515', floor: '#2a2b2e', wall: '#cfd0d2', wallTop: '#e7e7e8', wallSide: '#8b8c90',
    body: '#5a5550', soft: '#6b655e', light: '#7a746c', dark2: '#3a3632', white: '#9a9b9e', water: '#4a6a80',
    glass: '#5d7f99', green: '#4f7d4b', screen: '#111214', accent: '#5f7fbf', door: '#6a4f37', window: '#5d8fb5',
    blind: '#8e8a83', text: '#f1f1f1', textDim: '#b5b7bc', labelBg: 'rgba(24,24,26,0.82)',
    deviceOff: '#3a3b3f', deviceStroke: '#d9d9db', alarm: '#ff5a4d', ok: '#4cc47f', grid: '#232427',
  };

  const toneColor = (tone, item, pal) => {
    if (tone === 'body' && item.color) return item.color;
    if (tone === 'dark') return pal.dark2;
    return pal[tone] || pal.body;
  };

  /**
   * Renders one level into an SVG string.
   * opts: { plan, level, devices (array or Map), view, palette, glow: 'soft'|'bright'|'off', tint: 'none'|'temperature'|'humidity',
   *         furniture: bool, labels: bool, showBackground: bool, editor: bool, selected: Set, eink: bool,
   *         viewBox: [x,y,w,h] to skip auto-fit, markerSize }
   * Returns { svg, viewBox, view }.
   */
  function render(opts) {
    const level = opts.level;
    const pal = opts.palette || LIGHT_PALETTE;
    const view = makeView(opts.view);
    const devices = opts.devices instanceof Map ? opts.devices : new Map((opts.devices || []).map((d) => [d.id, d]));
    const glow = opts.eink ? 'off' : (opts.glow || 'soft');
    const showFurniture = opts.furniture !== false;
    const selected = opts.selected || new Set();
    const prefix = opts.idPrefix || 'fp';
    const walls = levelWalls(level);
    const openings = level.openings || [];
    const rooms = level.rooms || [];
    const items = (level.items || []).filter((i) => i.kind === 'device' || showFurniture);
    const t = level.wallThickness || DEFAULTS.wallThickness;

    // Fit
    const allPts = [];
    for (const r of rooms) for (const p of r.points) allPts.push(p);
    for (const w of walls) allPts.push(w.a, w.b);
    for (const i of items) allPts.push([i.x, i.y]);
    if (!allPts.length) allPts.push([0, 0], [500, 400]);
    const H = level.wallHeight || DEFAULTS.wallHeight;
    const screenPts = [];
    for (const p of allPts) {
      screenPts.push(view.project(p[0], p[1], 0));
      if (view.is3d) screenPts.push(view.project(p[0], p[1], H));
    }
    const sb = bbox(screenPts);
    const span = Math.max(sb.w, sb.h, 200);
    const marker = opts.markerSize || Math.max(12, Math.min(28, span / 40));
    const pad = marker * 2.2;
    const viewBox = opts.viewBox || [sb.minX - pad, sb.minY - pad, sb.w + pad * 2, sb.h + pad * 2];

    const defs = [];
    const floor = [];
    const solids = [];
    const top = [];

    const m = view.matrix.map(f1).join(' ');

    // Background picture used for tracing (editor only).
    if (opts.showBackground && level.background && level.background.src) {
      const bg = level.background;
      floor.push(`<image href="${esc(bg.src)}" x="${f1(bg.x)}" y="${f1(bg.y)}" width="${f1(bg.w)}" height="${f1(bg.h)}" opacity="${bg.opacity != null ? bg.opacity : 0.5}" preserveAspectRatio="none" pointer-events="none"/>`);
    }

    // Room floors (+ tint)
    const readings = new Map();
    for (const room of rooms) {
      const rd = roomReadings(room, devices);
      readings.set(room.id, rd);
      const fill = room.color || pal.floor;
      const sel = selected.has(room.id) ? ' data-selected="1"' : '';
      floor.push(`<polygon class="fp-room" data-kind="room" data-id="${esc(room.id)}"${sel} points="${ptsAttr(room.points)}" fill="${fill}"/>`);
      const tintVal = opts.tint === 'temperature' ? rd.temperature : opts.tint === 'humidity' ? rd.humidity : null;
      if (tintVal != null && !opts.eink) {
        floor.push(`<polygon points="${ptsAttr(room.points)}" fill="${tintColor(opts.tint, tintVal)}" opacity="${pal.dark ? 0.42 : 0.38}" pointer-events="none"/>`);
      }
    }

    // Light pools: radial gradients clipped to the room the light is in (walls block light).
    if (glow !== 'off') {
      const pools = [];
      for (const item of items) {
        if (item.kind !== 'device') continue;
        const dev = devices.get(item.deviceId);
        if (!isLampItem(item, dev)) continue;
        const intensity = lightIntensity(dev);
        if (!intensity) continue;
        const room = rooms.find((r) => pointInPolygon([item.x, item.y], r.points));
        const col = lightColor(dev);
        const gid = `${prefix}-g-${item.id}`;
        const strength = (glow === 'bright' ? 0.85 : 0.55) * intensity * (pal.dark ? 1 : 0.75);
        defs.push(`<radialGradient id="${gid}"><stop offset="0" stop-color="${col}" stop-opacity="${f1(strength * 100) / 100}"/><stop offset="0.55" stop-color="${col}" stop-opacity="${f1(strength * 45) / 100}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`);
        let clip = '';
        if (room) {
          const cid = `${prefix}-c-${item.id}`;
          defs.push(`<clipPath id="${cid}" clipPathUnits="userSpaceOnUse"><polygon points="${ptsAttr(room.points)}"/></clipPath>`);
          clip = ` clip-path="url(#${cid})"`;
        }
        const reach = item.reach || DEFAULTS.lightReach;
        pools.push(`<circle cx="${f1(item.x)}" cy="${f1(item.y)}" r="${f1(reach)}" fill="url(#${gid})"${clip}/>`);
      }
      if (pools.length) floor.push(`<g class="fp-glow" pointer-events="none" style="mix-blend-mode:${pal.dark ? 'screen' : 'multiply'}">${pools.join('')}</g>`);
    }

    // Furniture. A chosen colour tints the model's top view and keeps its shading, like the 3D model.
    const tints = new Map();
    const imageFilter = (color) => {
      const filters = [];
      if (color && /^#[0-9a-f]{3,8}$/i.test(color)) {
        if (!tints.has(color)) {
          const id = `${prefix}-tint-${tints.size}`;
          tints.set(color, id);
          const lift = '<feFuncR type="linear" slope="1.25" intercept="0.08"/><feFuncG type="linear" slope="1.25" intercept="0.08"/><feFuncB type="linear" slope="1.25" intercept="0.08"/>';
          defs.push(`<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="saturate" values="0" result="g"/>`
            + `<feComponentTransfer in="g" result="l">${lift}</feComponentTransfer>`
            + `<feFlood flood-color="${color}" result="f"/><feBlend in="f" in2="l" mode="multiply" result="m"/><feComposite in="m" in2="SourceGraphic" operator="in"/></filter>`);
        }
        filters.push(`url(#${tints.get(color)})`);
      }
      if (pal.dark) filters.push('brightness(.82)');
      return filters.length ? ` style="filter:${filters.join(' ')}"` : '';
    };
    const furniture = items.filter((i) => i.kind === 'furniture').sort((a, b) => (a.z || 0) - (b.z || 0));
    if (!view.is3d) {
      for (const item of furniture) {
        const sel = selected.has(item.id) ? ' data-selected="1"' : '';
        const entry = modelOf(item.type);
        let body;
        if (opts.modelBase && entry && entry.file) {
          // Top view rendered from the 3D model (web/models/top), stretched to the piece's size.
          body = `<rect x="${f1(-item.w / 2)}" y="${f1(-item.d / 2)}" width="${f1(item.w)}" height="${f1(item.d)}" fill="transparent"/>`
            + `<image href="${esc(opts.modelBase)}top/${esc(entry.id)}.png" x="${f1(-item.w / 2)}" y="${f1(-item.d / 2)}" width="${f1(item.w)}" height="${f1(item.d)}" preserveAspectRatio="none"${imageFilter(item.color)}/>`;
        } else {
          const parts = furnitureParts(item).sort((a, b) => a.z1 - b.z1);
          body = parts.map((p) => `<polygon points="${ptsAttr(p.poly)}" fill="${toneColor(p.tone, item, pal)}" stroke="${shade(toneColor(p.tone, item, pal), pal.dark ? 1.25 : 0.82)}" stroke-width="1"/>`).join('');
        }
        floor.push(`<g class="fp-item" data-kind="item" data-id="${esc(item.id)}"${sel} transform="translate(${f1(item.x)} ${f1(item.y)}) rotate(${f1(item.rot || 0)})"${item.z && item.mount !== 'surface' ? ' opacity="0.85"' : ''}>${body}</g>`);
      }
    }

    // Lamp fixtures with a model (table and floor lamps) under their badge, in 2D on the web pages.
    if (!view.is3d && opts.modelBase) {
      for (const item of items) {
        if (item.kind !== 'device' || !item.fixture) continue;
        const entry = modelOf(item.fixture);
        if (!entry || !entry.file || entry.mount === 'ceiling') continue;
        const w = item.w || entry.w; const d = item.d || entry.d;
        floor.push(`<image href="${esc(opts.modelBase)}top/${esc(entry.id)}.png" x="${f1(item.x - w / 2)}" y="${f1(item.y - d / 2)}" width="${f1(w)}" height="${f1(d)}" preserveAspectRatio="none" transform="rotate(${f1(item.rot || 0)} ${f1(item.x)} ${f1(item.y)})" pointer-events="none"/>`);
      }
    }

    // Walls and openings
    const blocks = []; // 2.5D prisms: { pts, z0, z1, color, key, attrs }
    const isExteriorFacingViewer = (piece) => {
      const u = norm(sub(piece.b, piece.a));
      let n = [-u[1], u[0]];
      if (view.facing(n[0], n[1]) < 0) n = [-n[0], -n[1]];
      const mid = mul(add(piece.a, piece.b), 0.5);
      const probe = add(mid, mul(n, t / 2 + 25));
      return !rooms.some((r) => pointInPolygon(probe, r.points));
    };

    for (const wall of walls) {
      const pieces = wallPieces(wall, openings, level, view.is3d);
      for (const piece of pieces) {
        const quad = wallQuad(piece, wall.t);
        if (!view.is3d) {
          floor.push(`<polygon class="fp-wall" data-kind="wall" data-id="${esc(wall.id)}" points="${ptsAttr(quad)}" fill="${pal.wall}"/>`);
          continue;
        }
        let z1 = piece.z1;
        if (isExteriorFacingViewer(piece)) {
          if (piece.z0 >= DEFAULTS.lowWallHeight) continue; // lintels of lowered walls disappear
          z1 = Math.min(z1, DEFAULTS.lowWallHeight);
        }
        // Chunk long walls so depth sorting against furniture stays right.
        const L = dist(piece.a, piece.b);
        const n = Math.max(1, Math.ceil(L / 70));
        for (let k = 0; k < n; k++) {
          const ca = add(piece.a, mul(sub(piece.b, piece.a), k / n));
          const cb = add(piece.a, mul(sub(piece.b, piece.a), (k + 1) / n));
          const q = wallQuad({ a: ca, b: cb, capA: piece.capA && k === 0, capB: piece.capB && k === n - 1 }, wall.t);
          blocks.push({ pts: q, z0: piece.z0, z1, color: pal.wallSide, topColor: pal.wallTop, wall: true });
        }
      }
    }

    for (const o of openings) {
      const u = [Math.cos(o.angle || 0), Math.sin(o.angle || 0)];
      const nrm = [-u[1], u[0]];
      const half = (o.width || 90) / 2;
      const c = [o.x, o.y];
      const ends = [sub(c, mul(u, half)), add(c, mul(u, half))];
      const linked = (o.devices || []).map((id) => devices.get(id)).filter(Boolean);
      const contact = linked.find((d) => 'alarm_contact' in d.caps);
      const lock = linked.find((d) => 'locked' in d.caps);
      const cover = linked.find((d) => coverClosed(d) != null);
      const alarm = linked.some((d) => d.caps.alarm_generic === true || d.caps.alarm_tamper === true);
      const sel = selected.has(o.id) ? ' data-selected="1"' : '';
      const ow = t * 0.9;

      if (o.type === 'window') {
        const closed = cover ? coverClosed(cover) : 0;
        const isOpen = contact ? contact.caps.alarm_contact === true : false;
        const glassCol = closed > 0.98 ? (o.blindColor || pal.blind) : pal.window;
        if (!view.is3d) {
          const q = wallQuad({ a: ends[0], b: ends[1] }, ow);
          floor.push(`<polygon class="fp-opening" data-kind="opening" data-id="${esc(o.id)}"${sel} points="${ptsAttr(q)}" fill="${pal.floor}" stroke="${pal.wall}" stroke-width="1.5"/>`);
          floor.push(`<line x1="${f1(ends[0][0])}" y1="${f1(ends[0][1])}" x2="${f1(ends[1][0])}" y2="${f1(ends[1][1])}" stroke="${isOpen ? pal.alarm : glassCol}" stroke-width="${f1(ow * 0.35)}" pointer-events="none"/>`);
          if (closed > 0.02) {
            const side = mul(nrm, (o.blindSide || 1) * (ow / 2 + 3));
            const a = add(ends[0], side); const b = add(ends[0], add(side, mul(u, half * 2 * Math.max(closed, 0.02))));
            floor.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${o.blindColor || pal.blind}" stroke-width="5" stroke-linecap="round" pointer-events="none"/>`);
          }
        } else {
          const sill = o.sill != null ? o.sill : DEFAULTS.windowSill;
          const topZ = o.top || DEFAULTS.windowTop;
          const pane = wallQuad({ a: ends[0], b: ends[1] }, 3);
          blocks.push({ pts: pane, z0: sill, z1: topZ, color: isOpen ? pal.alarm : pal.window, topColor: pal.window, opacity: 0.55, attrs: `data-kind="opening" data-id="${esc(o.id)}"` });
          if (closed > 0.02) {
            const bq = wallQuad({ a: ends[0], b: ends[1] }, 4).map((p) => add(p, mul(nrm, (o.blindSide || 1) * (t / 2 + 3))));
            blocks.push({ pts: bq, z0: topZ - (topZ - sill) * closed, z1: topZ, color: o.blindColor || pal.blind, topColor: o.blindColor || pal.blind });
          }
        }
        continue;
      }

      // Door
      const hingeEnd = (o.hinge || 1) > 0 ? ends[0] : ends[1];
      const freeEnd = (o.hinge || 1) > 0 ? ends[1] : ends[0];
      const swing = mul(nrm, o.swing || 1);
      const open = contact ? contact.caps.alarm_contact === true : null;
      const leafLen = half * 2;
      const leafTip = open === false ? freeEnd : add(hingeEnd, mul(swing, leafLen));
      const lockCol = lock ? (alarm ? pal.alarm : lock.caps.locked ? pal.ok : '#e9a23b') : null;
      if (!view.is3d) {
        const q = wallQuad({ a: ends[0], b: ends[1] }, t + 1);
        floor.push(`<polygon class="fp-opening" data-kind="opening" data-id="${esc(o.id)}"${sel} points="${ptsAttr(q)}" fill="${pal.floor}"/>`);
        const doorCol = alarm ? pal.alarm : (o.color || pal.door);
        floor.push(`<line x1="${f1(hingeEnd[0])}" y1="${f1(hingeEnd[1])}" x2="${f1(leafTip[0])}" y2="${f1(leafTip[1])}" stroke="${doorCol}" stroke-width="4" stroke-linecap="round" pointer-events="none"/>`);
        if (open !== false) {
          const sweep = cross(sub(freeEnd, hingeEnd), sub(leafTip, hingeEnd)) > 0 ? 1 : 0;
          floor.push(`<path d="M${f1(freeEnd[0])} ${f1(freeEnd[1])} A${f1(leafLen)} ${f1(leafLen)} 0 0 ${sweep} ${f1(leafTip[0])} ${f1(leafTip[1])}" fill="none" stroke="${doorCol}" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.7" pointer-events="none"/>`);
        }
        if (lockCol) {
          floor.push(`<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(marker * 0.45)}" fill="${lockCol}" stroke="${pal.bg}" stroke-width="2" pointer-events="none"/>`);
        }
      } else {
        const dh = o.height || DEFAULTS.doorHeight;
        if (open != null) {
          const leaf = wallQuad({ a: hingeEnd, b: leafTip }, 4);
          blocks.push({ pts: leaf, z0: 0, z1: dh, color: alarm ? pal.alarm : (o.color || pal.door), topColor: o.color || pal.door, attrs: `data-kind="opening" data-id="${esc(o.id)}"` });
        }
        if (lockCol) top.push({ type: 'dot', at: view.project(c[0], c[1], 110), color: lockCol });
      }
    }

    // 2D walls drawn last on the floor layer so they cover floor edges.
    if (view.is3d && showFurniture) {
      for (const item of furniture) {
        for (const part of furnitureParts(item)) {
          const pts = part.poly.map((p) => { const r = rotatePt(p, item.rot || 0); return [r[0] + item.x, r[1] + item.y]; });
          const col = toneColor(part.tone, item, pal);
          blocks.push({ pts, z0: (item.z || 0) + part.z0, z1: (item.z || 0) + part.z1, color: col, topColor: col, attrs: `data-kind="item" data-id="${esc(item.id)}"`, selected: selected.has(item.id) });
        }
      }
    }

    if (view.is3d) {
      for (const b of blocks) {
        const c = b.pts.reduce((acc, p) => add(acc, p), [0, 0]).map((v) => v / b.pts.length);
        b.key = view.depth(c[0], c[1]) + b.z0 * 0.01;
      }
      blocks.sort((a, b) => a.key - b.key);
      for (const b of blocks) solids.push(prismSvg(b, view, pal));
    }

    // Furniture names (only when asked for everything)
    if (opts.names === 'all' && !view.is3d) {
      for (const item of furniture) {
        const entry = modelOf(item.type);
        const name = item.label || (entry ? entry.name.nl : '');
        if (!name) continue;
        const nf = Math.max(8, Math.min(18, Math.min(item.w, item.d) * 0.22));
        floor.push(`<text x="${f1(item.x)}" y="${f1(item.y + nf * 0.35)}" text-anchor="middle" font-size="${f1(nf)}" font-weight="500" fill="${pal.textDim}" stroke="${pal.labelBg}" stroke-width="${f1(nf * 0.3)}" paint-order="stroke" pointer-events="none">${esc(name)}</text>`);
      }
    }

    // Labels
    if (opts.labels !== false) {
      for (const room of rooms) {
        if (!room.name) continue;
        const lp = labelPoint(room.points);
        const at = view.project(lp[0], lp[1], 0);
        const { values } = roomLabel(room, devices, opts);
        const lines = values.length ? [room.name, values.join(' ')] : [room.name];
        top.push({ type: 'label', at, lines, roomId: room.id });
      }
    }

    // Values the room labels already show are not repeated beside their devices.
    const shownByRoom = new Map();
    if (opts.labels !== false) {
      for (const room of rooms) {
        for (const [id, caps] of roomLabel(room, devices, opts).hidden) shownByRoom.set(id, (shownByRoom.get(id) || []).concat(caps));
      }
    }

    // Device markers
    for (const item of items) {
      if (item.kind !== 'device') continue;
      const dev = devices.get(item.deviceId);
      const kind = item.shape || (isLampItem(item, dev) ? 'light' : deviceKind(dev));
      const mount = item.mount || defaultMount(kind);
      const z = !view.is3d ? 0 : mount === 'ceiling' ? Math.min(H - 40, 200) : mount === 'wall' ? (item.z || 120) : (item.z || 10);
      top.push({ type: 'device', at: view.project(item.x, item.y, z), item, dev, kind });
    }

    // Top layer SVG
    const fs = marker * 0.82;
    const topSvg = [];
    for (const e of top) {
      if (e.type === 'dot') {
        topSvg.push(`<circle cx="${f1(e.at[0])}" cy="${f1(e.at[1])}" r="${f1(marker * 0.45)}" fill="${e.color}" stroke="${pal.bg}" stroke-width="2" pointer-events="none"/>`);
      }
    }
    const roomBoxes = []; // room labels, which device names keep clear of
    const markerSpots = top.filter((e) => e.type === 'device').map((e) => e.at);
    for (const e of top) {
      if (e.type !== 'label') continue;
      // A device on the room's label point pushes the label below or above it, to the first clear spot.
      const clashes = (at) => markerSpots.some((p) => Math.abs(p[0] - at[0]) < marker * 3 && Math.abs(p[1] - at[1]) < marker * 2.2);
      if (clashes(e.at)) {
        const spot = [2.6, -2.6, 4.4, -4.4, 6.2].map((dy) => [e.at[0], e.at[1] + marker * dy]).find((at) => !clashes(at));
        e.at = spot || [e.at[0], e.at[1] + marker * 2.6];
      }
      const widths = e.lines.map((l, i) => l.length * (i ? fs * 1.15 : fs) * 0.58);
      const w = Math.max(...widths) + fs * 1.4;
      const h = e.lines.length * fs * 1.35 + fs * 0.6;
      const x = e.at[0] - w / 2; const y = e.at[1] - h / 2;
      const texts = e.lines.map((l, i) => `<text x="${f1(e.at[0])}" y="${f1(y + fs * 0.3 + (i + 0.8) * fs * 1.35)}" text-anchor="middle" font-size="${f1(i ? fs * 1.15 : fs)}" fill="${i ? pal.text : pal.textDim}" font-weight="${i ? 600 : 500}">${esc(l)}</text>`).join('');
      roomBoxes.push([x, y, x + w, y + h]);
      topSvg.push(`<g class="fp-label" data-kind="room" data-id="${esc(e.roomId)}"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(fs * 0.5)}" fill="${pal.labelBg}"/>${texts}</g>`);
    }
    // Name tags go under their device, or above it when that is taken; a name that fits nowhere is left out
    // (zooming in makes room). Taken: every device, every value badge and every name already placed.
    const taken = roomBoxes.slice();
    const devices2 = top.filter((e) => e.type === 'device');
    for (const e of devices2) {
      const r = marker * (e.item.size || 1);
      taken.push([e.at[0] - r, e.at[1] - r, e.at[0] + r, e.at[1] + r]);
    }
    const free = (b) => !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
    const marks = [];
    for (const e of devices2) {
      const { item, dev, kind } = e;
      const on = isOn(dev);
      const alarm = dev && ['alarm_smoke', 'alarm_water', 'alarm_co', 'alarm_generic', 'alarm_tamper'].some((cap) => dev.caps[cap] === true);
      const motion = dev && dev.caps.alarm_motion === true;
      let fill = pal.deviceOff; let stroke = pal.deviceStroke; let glyph = pal.deviceStroke;
      if (kind === 'light' && on) { fill = lightColor(dev); glyph = '#3a2a10'; stroke = fill; }
      else if (on) { fill = pal.accent; glyph = '#ffffff'; stroke = fill; }
      if (motion) { fill = '#f2c14e'; glyph = '#3a2a10'; stroke = fill; }
      if (alarm) { fill = pal.alarm; glyph = '#ffffff'; stroke = fill; }
      if (dev && !dev.available) { fill = pal.deviceOff; stroke = pal.textDim; glyph = pal.textDim; }
      const r = marker * (item.size || 1);
      const [x, y] = e.at;
      const sel = selected.has(item.id) ? ' data-selected="1"' : '';
      const halo = kind === 'light' && on && !opts.eink ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.6)}" fill="${fill}" opacity="0.25" pointer-events="none"/>` : '';
      const g = GLYPHS[kind] || GLYPHS.other;
      const k = (r * 1.15) / 24;
      let badge = '';
      const value = opts.values !== false && item.showValue !== false ? deviceValueText(dev, dev && shownByRoom.get(dev.id)) : null;
      if (value) {
        const bf = r * 0.78;
        const bw = value.length * bf * 0.56 + bf * 0.9;
        const bh = bf * 1.5;
        const bx = x + r * 1.15; const by = y - bh / 2;
        badge = `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" rx="${f1(bh / 2)}" fill="${pal.labelBg}" pointer-events="none"/><text x="${f1(bx + bw / 2)}" y="${f1(y + bf * 0.34)}" text-anchor="middle" font-size="${f1(bf)}" font-weight="600" fill="${pal.text}" pointer-events="none">${esc(value)}</text>`;
        taken.push([bx, by, bx + bw, by + bh]);
      }
      marks.push({ e, r, sel, body: `${halo}<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.9)}" fill="transparent"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f1(r * 0.12)}"/><path d="${g}" transform="translate(${f1(x - 12 * k)} ${f1(y - 12 * k)}) scale(${k.toFixed(3)})" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>${badge}` });
    }
    for (const { e, r, sel, body } of marks) {
      const { item, dev } = e;
      const [x, y] = e.at;
      let tag = '';
      const full = opts.names === 'devices' || opts.names === 'all' ? item.label || (dev && dev.name) || '' : '';
      if (full) {
        const name = full.length > 22 ? `${full.slice(0, 21)}…` : full;
        const nf = r * 0.68;
        const w = name.length * nf * 0.56 + nf * 0.4;
        for (const ty of [y + r + nf * 1.25, y - r - nf * 0.45]) {
          const box = [x - w / 2, ty - nf * 0.95, x + w / 2, ty + nf * 0.3];
          if (!free(box) && !selected.has(item.id)) continue;
          taken.push(box);
          tag = `<text x="${f1(x)}" y="${f1(ty)}" text-anchor="middle" font-size="${f1(nf)}" font-weight="600" fill="${pal.text}" stroke="${pal.labelBg}" stroke-width="${f1(nf * 0.35)}" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(name)}</text>`;
          break;
        }
      }
      topSvg.push(`<g class="fp-device" data-kind="item" data-id="${esc(item.id)}"${sel}>${body}${tag}</g>`);
    }

    const svg = [
      `<defs>${defs.join('')}</defs>`,
      `<g class="fp-floor" transform="matrix(${m})">${floor.join('')}</g>`,
      `<g class="fp-solids" pointer-events="none">${solids.join('')}</g>`,
      `<g class="fp-top">${topSvg.join('')}</g>`,
    ].join('');
    return { svg, viewBox, view, marker };
  }

  function prismSvg(b, view, pal) {
    const pts = b.pts;
    const ccw = signedArea(pts) > 0;
    const out = [];
    const op = b.opacity != null ? ` opacity="${b.opacity}"` : '';
    // Side faces facing the viewer, shaded by their horizontal direction on screen.
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      const e = sub(q, p);
      const n = norm(ccw ? [e[1], -e[0]] : [-e[1], e[0]]);
      if (view.facing(n[0], n[1]) <= 0.001) continue;
      const sx = view.screenX(n[0], n[1]);
      const k = (pal.dark ? 0.82 : 0.86) + sx * 0.1;
      const col = shade(b.color, k);
      const quad = [view.project(p[0], p[1], b.z0), view.project(q[0], q[1], b.z0), view.project(q[0], q[1], b.z1), view.project(p[0], p[1], b.z1)];
      out.push(`<polygon points="${ptsAttr(quad)}" fill="${col}" stroke="${col}" stroke-width="0.6" stroke-linejoin="round"${op}/>`);
    }
    const topPts = pts.map((p) => view.project(p[0], p[1], b.z1));
    const tc = b.wall ? b.topColor : shade(b.topColor || b.color, 1.06);
    out.push(`<polygon points="${ptsAttr(topPts)}" fill="${tc}" stroke="${tc}" stroke-width="0.6" stroke-linejoin="round"${op}/>`);
    const attrs = b.attrs ? ` ${b.attrs}` : '';
    const sel = b.selected ? ' data-selected="1"' : '';
    return `<g${attrs}${sel}>${out.join('')}</g>`;
  }

  /* -------------------------------------------------------- zone importing */

  /**
   * Builds levels from Homey zones: zones with child zones become levels, their children rooms.
   * Rooms are laid out in a grid so they can be dragged into place.
   */
  function levelsFromZones(zones) {
    const byParent = new Map();
    for (const z of zones) {
      const k = z.parent || '__root';
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(z);
    }
    const root = (byParent.get('__root') || [])[0];
    if (!root) return [];
    const top = byParent.get(root.id) || [];
    let groups = top.filter((z) => (byParent.get(z.id) || []).length)
      .map((z) => ({ name: z.name, rooms: byParent.get(z.id) }));
    const loose = top.filter((z) => !(byParent.get(z.id) || []).length);
    if (!groups.length) groups = [{ name: root.name, rooms: loose }];
    else if (loose.length) groups.push({ name: 'Other', rooms: loose });

    return groups.map((g) => {
      const level = newLevel(g.name);
      const cols = Math.ceil(Math.sqrt(g.rooms.length));
      g.rooms.forEach((z, i) => {
        const x = (i % cols) * 400; const y = Math.floor(i / cols) * 400;
        level.rooms.push({ id: uid('room'), name: z.name, zoneId: z.id, points: rect(x, y, x + 400, y + 400) });
      });
      return level;
    });
  }

  /** Typical spots for a room's devices: lights spread over the ceiling, others along the walls. */
  function autoPlace(room, deviceList) {
    const b = bbox(room.points);
    const center = labelPoint(room.points);
    const lights = deviceList.filter((d) => defaultMount(deviceKind(d)) === 'ceiling');
    const rest = deviceList.filter((d) => defaultMount(deviceKind(d)) !== 'ceiling');
    const out = [];
    lights.forEach((d, i) => {
      const n = lights.length;
      const p = n === 1 ? center : [b.minX + b.w * (0.25 + 0.5 * ((i % 2))), b.minY + b.h * (0.25 + 0.5 * (Math.floor(i / 2) % 2))];
      out.push(newDeviceItem(d, pointInPolygon(p, room.points) ? p : center));
    });
    // Walk along the room outline for wall devices.
    const perim = room.points.map((p, i) => dist(p, room.points[(i + 1) % room.points.length]));
    const total = perim.reduce((s, v) => s + v, 0);
    rest.forEach((d, i) => {
      let s = (total * (i + 0.5)) / Math.max(rest.length, 1);
      let k = 0;
      while (k < perim.length - 1 && s > perim[k]) { s -= perim[k]; k++; }
      const a = room.points[k]; const bb = room.points[(k + 1) % room.points.length];
      const u = norm(sub(bb, a));
      const inward = mul(signedArea(room.points) > 0 ? [-u[1], u[0]] : [u[1], -u[0]], 22);
      out.push(newDeviceItem(d, add(add(a, mul(u, s)), inward)));
    });
    return out;
  }

  function newDeviceItem(device, p) {
    return { id: uid('dev'), kind: 'device', deviceId: device.id, x: Math.round(p[0]), y: Math.round(p[1]), reach: DEFAULTS.lightReach };
  }

  return {
    DEFAULTS, CATALOGUE, GLYPHS, LIGHT_PALETTE, DARK_PALETTE,
    uid, newPlan, newLevel, newFurniture, newDeviceItem,
    geom: { sub, add, mul, dot, cross, len, norm, dist, signedArea, pointInPolygon, projectOnSegment, bbox, labelPoint, rotatePt, rect },
    levelWalls, openingsOnWall, wallPieces, furnitureParts,
    deviceKind, deviceFixture, isLampItem, defaultMount, isOn, coverClosed, lightColor, lightIntensity, deviceValueText, roomReadings, roomLabel, tintColor, modelOf,
    makeView, render, levelsFromZones, autoPlace,
  };
}));
