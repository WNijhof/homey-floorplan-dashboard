/*
 * The house view: the settings of the outside of the house (plan.house) and its size, taken from the floor plan.
 * Shared by the 3D house (web/house3d.js), the editor and the tests. Sizes are metres; the front of the house
 * faces +z (towards the camera), its width runs along x.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HouseCore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const TYPES = ['detached', 'semi', 'terraced'];
  const ROOFS = ['gable', 'hip', 'flat'];
  const SIDES = ['left', 'right'];
  const OBJECTS = ['solar', 'grid', 'battery', 'car', 'heatpump', 'airco'];
  const SHOW = ['auto', 'on', 'off'];
  const BATTERY_PLACES = ['carport', 'wall'];

  const pick = (v, list, fallback) => (list.indexOf(v) >= 0 ? v : fallback);
  const clamp = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

  /** plan.house with every field filled in and checked. */
  function settings(plan) {
    const h = (plan && plan.house) || {};
    const o = h.objects || {};
    const objects = {};
    for (const k of OBJECTS) objects[k] = { show: pick(o[k] && o[k].show, SHOW, 'auto') };
    objects.solar.panels = Math.round(clamp(o.solar && o.solar.panels, 0, 60, 0)); // 0: as many as fit nicely
    objects.battery.place = pick(o.battery && o.battery.place, BATTERY_PLACES, 'carport');
    return {
      type: pick(h.type, TYPES, 'detached'),
      neighbour: pick(h.neighbour, SIDES, 'left'), // the side of the other half of a semi-detached house
      roof: pick(h.roof, ROOFS, 'gable'),
      ridge: pick(h.ridge, ['width', 'depth'], 'width'), // the ridge along the front (width) or front to back
      pitch: clamp(h.pitch, 15, 55, 40),
      facing: clamp(h.facing, 0, 359, 180), // compass direction the front looks at: 180 is south
      dormer: h.dormer === true,
      extension: pick(h.extension, ['none', 'back', 'side'], 'none'),
      carport: pick(h.carport, ['none', 'left', 'right'], 'right'),
      objects,
      photo: h.photo && typeof h.photo.src === 'string' ? { src: h.photo.src, areas: Array.isArray(h.photo.areas) ? h.photo.areas : [] } : null,
    };
  }

  // Levels that are not storeys of the house.
  const OUTSIDE = /^(tuin|garden|buiten|outside|outdoor|terras|terrace|oprit|driveway)\b/i;
  const ATTIC = /(zolder|attic|vliering|loft)/i;

  function levelBox(level) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const r of level.rooms || []) {
      for (const p of r.points || []) {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      }
    }
    return x1 > x0 ? { w: (x1 - x0) / 100, d: (y1 - y0) / 100 } : null;
  }

  /**
   * The size of the house: width and depth from the largest storey (within sensible bounds), the storeys
   * from the levels of the plan. A level called attic (zolder) is the space under the roof.
   */
  function shape(plan) {
    const levels = (plan && plan.levels) || [];
    const storeys = levels.filter((l) => !OUTSIDE.test(l.name || ''));
    const attic = storeys.length > 1 && ATTIC.test(storeys[storeys.length - 1].name || '') ? storeys[storeys.length - 1] : null;
    const floors = attic ? storeys.slice(0, -1) : storeys;
    let w = 0; let d = 0;
    for (const l of floors.length ? floors : storeys) {
      const b = levelBox(l);
      if (b && b.w * b.d > w * d) { w = b.w; d = b.d; }
    }
    if (!w) { w = 9; d = 9; }
    // The view shows the wider side at the front.
    if (d > w * 1.4) { const t = w; w = d; d = t; }
    let base = 0;
    const out = (floors.length ? floors : [{ id: null, name: '', wallHeight: 260 }]).map((l) => {
      const height = clamp((l.wallHeight || 260) / 100, 2.2, 4, 2.6) + 0.3; // with the floor between storeys
      const f = { levelId: l.id, name: l.name, base, height };
      base += height;
      return f;
    });
    return {
      width: clamp(w, 5, 18, 9),
      depth: clamp(d, 5, 14, 9),
      floors: out,
      eaves: base,
      attic: attic ? { levelId: attic.id, name: attic.name } : null,
    };
  }

  /** Whether an object is on the house: chosen on or off, or (auto) when its kind of device is found. */
  function shows(set, kind, present) {
    const s = set.objects[kind] ? set.objects[kind].show : 'auto';
    if (s === 'on') return true;
    if (s === 'off') return false;
    return !!(present && present[kind]);
  }

  /** The roof side that looks most to the south, where the panels go: 'front', 'back', 'left' or 'right'. */
  function sunnySide(set) {
    if (set.roof === 'flat') return 'top';
    const along = set.ridge === 'width' ? ['front', 'back'] : ['left', 'right'];
    // Compass direction each side looks at; left and right as seen by someone in front of the house (x < 0 is left)
    const dir = { front: set.facing, back: (set.facing + 180) % 360, left: (set.facing + 90) % 360, right: (set.facing + 270) % 360 };
    const sides = set.roof === 'hip' ? ['front', 'back', 'left', 'right'] : along;
    const off = (a) => Math.abs(((a - 180 + 540) % 360) - 180);
    return sides.slice().sort((a, b) => off(dir[a]) - off(dir[b]))[0];
  }

  return { settings, shape, shows, sunnySide, OBJECTS, TYPES, ROOFS };
}));
