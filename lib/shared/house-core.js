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
  const PHOTO_KINDS = ['home', 'level'].concat(OBJECTS);
  const PLACES = ['door', 'path', 'drive', 'garden'];
  // Which lamps are outside, from their name; every place can also be chosen in the editor.
  const PLACE_NAMES = {
    door: /(voordeur|front ?door|porch|portiek|entree buiten|buitenlamp voor)/i,
    path: /(tuinpad|\bpad\b|\bpath\b|walkway)/i,
    drive: /(oprit|driveway|carport|garage)/i,
    garden: /(tuin|garden|terras|terrace|buiten|outdoor|outside|achterom|schutting|fence)/i,
  };

  const pick = (v, list, fallback) => (list.indexOf(v) >= 0 ? v : fallback);
  const clamp = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

  // Click areas on the own photo: a part or a storey, with its corners as fractions of the photo.
  function cleanAreas(list) {
    return (Array.isArray(list) ? list : [])
      .filter((a) => a && PHOTO_KINDS.indexOf(a.kind) >= 0 && Array.isArray(a.pts) && a.pts.length >= 3)
      .map((a) => Object.assign({ kind: a.kind, pts: a.pts.map((p) => [clamp(p[0], 0, 1, 0), clamp(p[1], 0, 1, 0)]) }, a.id ? { id: String(a.id) } : {}));
  }

  /** plan.house with every field filled in and checked. */
  function settings(plan) {
    const h = (plan && plan.house) || {};
    const o = h.objects || {};
    const objects = {};
    for (const k of OBJECTS) objects[k] = { show: pick(o[k] && o[k].show, SHOW, 'auto') };
    objects.solar.panels = Math.round(clamp(o.solar && o.solar.panels, 0, 60, 0)); // 0: as many as fit nicely
    objects.solar.kwp = clamp(o.solar && o.solar.kwp, 0, 100, 0); // 0: estimated from the panels, for the forecast
    objects.solar.layout = pick(o.solar && o.solar.layout, ['sunny', 'both'], 'sunny'); // both: on both roof halves, such as east and west
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
      carport: pick(h.carport, ['none', 'left', 'right'], 'none'),
      facade: pick(h.facade, ['darkplaster', 'brick', 'darkbrick', 'yellowbrick', 'plaster'], 'darkplaster'),
      scene: pick(h.scene, ['garden', 'studio'], 'garden'), // in its garden, or the house alone
      roofColor: pick(h.roofColor, ['anthracite', 'red', 'black'], 'anthracite'),
      frames: pick(h.frames, ['anthracite', 'white'], 'anthracite'),
      door: typeof h.door === 'string' && /^#[0-9a-f]{6}$/i.test(h.door) ? h.door : '#2f4a3a',
      objects,
      forecast: h.forecast === true, // asks Forecast.Solar, which then knows roughly where the house is
      front: pick(h.front, ['bottom', 'top', 'left', 'right'], 'bottom'), // which side of the floor plan is the front
      outdoor: PLACES.reduce((o, p) => { o[p] = h.outdoor && typeof h.outdoor[p] === 'string' && h.outdoor[p] ? h.outdoor[p] : 'auto'; return o; }, {}),
      // an own photo instead of the model, with height / width as ratio
      photo: h.photo && typeof h.photo.src === 'string' && h.photo.src ? { src: h.photo.src, ratio: clamp(h.photo.ratio, 0.2, 5, 0.75), areas: cleanAreas(h.photo.areas) } : null,
    };
  }

  // Levels that are not storeys of the house.
  const OUTSIDE = /^(tuin|garden|buiten|outside|outdoor|terras|terrace|oprit|driveway)\b/i;
  const BESIDE = /^(overig|other|misc|kelder|basement|cellar|schuur|shed|garage)\b/i; // on the plan, not a storey of the house
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
    const storeys = levels.filter((l) => !OUTSIDE.test(l.name || '') && !BESIDE.test(l.name || ''));
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

  /** The roof faces with panels: the sunny one, or both halves of the roof (a flat roof stays one face, with rows in two directions). */
  function solarSides(set) {
    const side = sunnySide(set);
    if (set.objects.solar.layout !== 'both' || side === 'top') return [side];
    return [side, { front: 'back', back: 'front', left: 'right', right: 'left' }[side]];
  }

  /** Where the sun stands at this place: its height above the horizon and compass direction, in degrees. */
  function sunPosition(lat, lon, date) {
    const rad = Math.PI / 180;
    const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
    const declination = -23.44 * Math.cos(rad * (360 / 365) * (day + 10)) * rad;
    const hourAngle = (date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15 - 12) * 15 * rad;
    const height = Math.asin(Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle));
    const east = -Math.cos(declination) * Math.sin(hourAngle);
    const north = Math.sin(declination) * Math.cos(lat * rad) - Math.cos(declination) * Math.cos(hourAngle) * Math.sin(lat * rad);
    return { height: height / rad, azimuth: (Math.atan2(east, north) / rad + 360) % 360 };
  }

  /** Whether the sun is down at this place: below 4 degrees, when it starts to get dark (dusk counts as day). */
  function isNight(lat, lon, date) {
    return sunPosition(lat, lon, date).height < -4;
  }

  /** The outdoor lamps per place: { door: [device ids], ... }. devices: a Map of the devices of the plan. */
  function outdoorLamps(plan, devices) {
    const set = settings(plan);
    const out = { door: [], path: [], drive: [], garden: [] };
    const lights = [...(devices ? devices.values() : [])].filter((d) => d.cls === 'light');
    const outside = new Set(((plan && plan.levels) || []).filter((l) => OUTSIDE.test(l.name || '')).flatMap((l) => (l.items || []).map((i) => i.deviceId)));
    for (const d of lights) {
      const place = PLACES.find((p) => PLACE_NAMES[p].test(d.name || ''));
      if (place && set.outdoor[place] === 'auto') out[place].push(d.id);
      else if (!place && outside.has(d.id) && set.outdoor.garden === 'auto') out.garden.push(d.id);
    }
    for (const p of PLACES) if (set.outdoor[p] !== 'auto') out[p] = set.outdoor[p] === 'none' ? [] : [set.outdoor[p]];
    return out;
  }

  /**
   * The room behind a spot on the outside of the house: u from left to right as seen from the front (0..1), v from the
   * back to the front (0..1). Null without rooms; the nearest room when the spot is in none.
   */
  function roomBehind(level, set, u, v) {
    const rooms = (level && level.rooms) || [];
    if (!rooms.length) return null;
    const pts = rooms.flatMap((r) => r.points);
    const x0 = Math.min(...pts.map((p) => p[0])); const x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])); const y1 = Math.max(...pts.map((p) => p[1]));
    const [fx, fy] = { bottom: [u, v], top: [1 - u, 1 - v], left: [1 - v, u], right: [v, 1 - u] }[set.front];
    const x = x0 + fx * (x1 - x0); const y = y0 + fy * (y1 - y0);
    const inside = (ps) => {
      let hit = false;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
        if ((ps[i][1] > y) !== (ps[j][1] > y) && x < ((ps[j][0] - ps[i][0]) * (y - ps[i][1])) / (ps[j][1] - ps[i][1]) + ps[i][0]) hit = !hit;
      }
      return hit;
    };
    const room = rooms.find((r) => inside(r.points));
    if (room) return room.id;
    const middle = (r) => [r.points.reduce((s, p) => s + p[0], 0) / r.points.length, r.points.reduce((s, p) => s + p[1], 0) / r.points.length];
    const gap = (r) => { const m = middle(r); return Math.hypot(m[0] - x, m[1] - y); };
    return rooms.slice().sort((a, b) => gap(a) - gap(b))[0].id;
  }

  /** What the weather means for the view of the house, from the icon of the forecast: clear, partly, cloudy, rain or snow. */
  function weatherKind(iconId) {
    const id = String(iconId || '');
    if (/snow|sleet|hail/i.test(id)) return 'snow';
    if (/rain|drizzle|shower|thunder|storm/i.test(id)) return 'rain';
    if (/partly/i.test(id)) return 'partly';
    if (/cloud|overcast|fog|mist/i.test(id)) return 'cloudy';
    return 'clear';
  }

  /* ------------------------------------------------- the drawn house (SVG) */

  // Colours of the drawing, like the 3D house.
  const SVG_THEMES = {
    light: { wall: '#f1ede6', side: '#ddd6ca', roof: '#5b5f66', roofSide: '#474a50', glass: '#8fb4cf', lit: '#ffd58a', door: '#7a5a3c', panel: '#1d2b44', ground: '#cfdcbc', drive: '#d9d5cd', neighbour: '#d9d6d0', post: '#8a8f96', car: '#3a5f8f', unit: '#eceef0', cabinet: '#5f7d5a', card: '#ffffff', text: '#1d1f23', dim: '#6b6f78' },
    dark: { wall: '#9d988f', side: '#827d75', roof: '#3b3e44', roofSide: '#2c2e33', glass: '#223040', lit: '#ffc766', door: '#4d3a28', panel: '#16223a', ground: '#2a3326', drive: '#3a3936', neighbour: '#55524d', post: '#6f747b', car: '#2f4f78', unit: '#b5b8bc', cabinet: '#4a6346', card: '#232427', text: '#f1f1f1', dim: '#a9abb1' },
  };

  const v3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    mid: (pts) => pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]),
  };

  function fmtW(w, lang) {
    if (typeof w !== 'number') return '–';
    const a = Math.abs(w);
    return a >= 1000 ? `${(a / 1000).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW` : `${Math.round(a)} W`;
  }

  const escXml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The text on the card of each part: [title, value].
  function cardValues(e, T, lang) {
    const bat = e.battery;
    return {
      home: [T.home, fmtW(e.homeW, lang)],
      solar: [T.solar, fmtW(e.solarW, lang)],
      grid: [typeof e.gridW === 'number' && e.gridW < 0 ? T.gridOut : T.gridIn, fmtW(e.gridW, lang)],
      battery: [`${T.battery}${bat && typeof bat.soc === 'number' ? ` ${Math.round(bat.soc)}%` : ''}`, bat ? fmtW(bat.watts, lang) : '–'],
      car: [`${T.car}${e.ev && e.ev.car && typeof e.ev.car.soc === 'number' ? ` ${Math.round(e.ev.car.soc)}%` : ''}`, e.ev ? fmtW(e.ev.watts, lang) : '–'],
      heatpump: [T.heatpump, e.heating ? fmtW(e.heating.watts, lang) : '–'],
      airco: [T.airco, e.airco ? fmtW(e.airco.reduce((s, a) => s + (a.on ? a.watts || 0 : 0), 0), lang) : '–'],
    };
  }

  // A card above the point px, py.
  function cardAt(k, px, py, [title, value]) {
    const w = Math.max(String(title).length * 0.2, String(value).length * 0.27) + 0.6;
    return { k, px, y: py - 1.05, x: px - w / 2, w, h: 1, title, value };
  }

  // The cards in order, moved up when they would cover something in boxes. Returns their SVG and the highest edge.
  function placeCards(list, boxes, t) {
    let top = Infinity;
    const hits = (c) => boxes.find((b) => c.x < b.x + b.w + 0.1 && c.x + c.w > b.x - 0.1 && c.y < b.y + b.h + 0.1 && c.y + c.h > b.y - 0.1);
    const svg = list.map((c) => {
      for (let i = 0, b = hits(c); b && i < 10; i++, b = hits(c)) c.y = b.y - c.h - 0.15;
      boxes.push(c);
      top = Math.min(top, c.y - 0.1);
      return `<g data-house="${c.k}" class="fp-hcard"><rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="1" rx="0.3" fill="${t.card}" fill-opacity="0.92" stroke="rgba(0,0,0,0.08)" stroke-width="0.02"/>`
        + `<text x="${c.px.toFixed(2)}" y="${(c.y + 0.37).toFixed(2)}" font-size="0.32" fill="${t.dim}" text-anchor="middle">${escXml(c.title)}</text>`
        + `<text x="${c.px.toFixed(2)}" y="${(c.y + 0.85).toFixed(2)}" font-size="0.42" font-weight="700" fill="${t.text}" text-anchor="middle">${escXml(c.value)}</text></g>`;
    }).join('');
    return { svg, top };
  }

  // A storey name, right of x (or centred on it when centre is true) at height py.
  function storeyTag(levelId, name, x, py, t, boxes) {
    const w = String(name || '').length * 0.2 + 0.6;
    boxes.push({ x, y: py - 0.32, w, h: 0.64 });
    return `<g data-house="level" data-id="${escXml(levelId || '')}" class="fp-hcard"><rect x="${x.toFixed(2)}" y="${(py - 0.32).toFixed(2)}" width="${w.toFixed(2)}" height="0.64" rx="0.32" fill="${t.card}" fill-opacity="0.9"/><text x="${(x + w / 2).toFixed(2)}" y="${(py + 0.11).toFixed(2)}" font-size="0.3" font-weight="600" fill="${t.text}" text-anchor="middle">${escXml(name || '')}</text></g>`;
  }

  /**
   * The own photo with its click areas and a card on each part, in the units of the drawn house so the cards are
   * as big. Works on every screen, also without 3D. opts as drawing(); returns { svg, viewBox }, or null without a photo.
   */
  function photoView(plan, opts) {
    const o = opts || {};
    const { photo } = settings(plan);
    if (!photo) return null;
    const t = o.dark ? SVG_THEMES.dark : SVG_THEMES.light;
    const W = 22; const H = W * photo.ratio;
    const values = cardValues(o.energy || {}, o.texts || {}, o.lang || 'en');
    const names = new Map(((plan && plan.levels) || []).map((l) => [l.id, l.name]));
    const areas = []; const tags = []; const list = []; const boxes = [];
    for (const a of photo.areas) {
      if (a.kind === 'level' && !names.has(a.id)) continue;
      const pts = a.pts.map((p) => [p[0] * W, p[1] * H]);
      const attr = `data-house="${a.kind}"${a.id ? ` data-id="${escXml(a.id)}"` : ''}`;
      areas.push(`<polygon class="fp-harea" points="${pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}" fill="#fff" fill-opacity="0" stroke="#fff" stroke-opacity="0.45" stroke-width="0.04" stroke-linejoin="round" ${attr}/>`);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      if (a.kind === 'level') {
        const name = names.get(a.id);
        const w = String(name || '').length * 0.2 + 0.6;
        tags.push(storeyTag(a.id, name, Math.min(W - w - 0.1, Math.max(0.1, cx - w / 2)), cy, t, boxes));
      } else {
        const c = cardAt(a.kind, cx, Math.min(...pts.map((p) => p[1])), values[a.kind]);
        c.x = Math.min(W - c.w - 0.1, Math.max(0.1, c.x)); c.px = c.x + c.w / 2; c.y = Math.max(0.1, c.y);
        list.push(c);
      }
    }
    list.sort((p, q) => q.y - p.y);
    const lines = photoFlows(photo.areas, o.energy, W, H);
    const image = `<image href="${escXml(photo.src)}" x="0" y="0" width="${W}" height="${H.toFixed(2)}" preserveAspectRatio="xMidYMid slice"/>`;
    return { svg: image + areas.join('') + lines + tags.join('') + placeCards(list, boxes, t).svg, viewBox: [0, 0, W, H] };
  }

  // Lines over the photo between the parts and the house, with dashes that run the way the power goes.
  function photoFlows(areas, energy, W, H) {
    const e = energy || {};
    if (!e.updated || Date.now() - Date.parse(e.updated) > 10 * 60000) return '';
    const middle = (kind) => {
      const a = areas.find((x) => x.kind === kind);
      if (!a) return null;
      return [(a.pts.reduce((s, p) => s + p[0], 0) / a.pts.length) * W, (a.pts.reduce((s, p) => s + p[1], 0) / a.pts.length) * H];
    };
    const home = middle('home') || [W / 2, H * 0.6];
    const bat = e.battery ? e.battery.watts : null;
    const run = [
      ['solar', e.solarW, '#f5a700'],
      ['grid', e.gridW, '#6f86a8'],
      ['battery', typeof bat === 'number' ? -bat : null, '#2fb350'],
      ['car', e.ev && typeof e.ev.watts === 'number' ? -e.ev.watts : null, '#3a7bd5'],
      ['heatpump', e.heating && typeof e.heating.watts === 'number' ? -e.heating.watts : null, '#e0663a'],
    ];
    return run.map(([kind, w, color]) => {
      const from = middle(kind);
      if (!from || typeof w !== 'number' || Math.abs(w) < 20) return '';
      // w above zero: from the part to the house
      const [a, b] = w > 0 ? [from, home] : [home, from];
      const bend = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) + Math.abs(a[1] - b[1]) * 0.25];
      const speed = Math.max(0.6, 2.4 - Math.sqrt(Math.abs(w)) / 40).toFixed(1);
      return `<path class="fp-hflow" d="M${a[0].toFixed(2)} ${a[1].toFixed(2)}Q${bend[0].toFixed(2)} ${bend[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.09" stroke-linecap="round" stroke-dasharray="0.3 0.35" pointer-events="none" style="animation-duration:${speed}s"/>`;
    }).join('');
  }

  /**
   * The house as a fixed isometric drawing, for screens without 3D (older wall tablets). Seen from the front
   * corner on the carport side. Storeys carry data-house="level" and data-id, the parts data-house="<kind>".
   * opts: { energy, dark, lang, texts, lit: Set of level ids with a lamp on }. Returns { svg, viewBox }.
   */
  function drawing(plan, opts) {
    const o = opts || {};
    const set = settings(plan);
    const sh = shape(plan);
    const t = o.dark ? SVG_THEMES.dark : SVG_THEMES.light;
    const T = o.texts || {};
    const e = o.energy || {};
    const present = e.present || {};
    const W = sh.width; const D = sh.depth; const E = sh.eaves;
    let carport = set.carport;
    if (set.type === 'semi' && carport === set.neighbour) carport = carport === 'left' ? 'right' : 'left';
    if (set.type === 'terraced') carport = 'none';
    // Seen from the carport side: mirror x when the carport is on the left
    const sx = carport === 'left' || (carport === 'none' && set.type === 'semi' && set.neighbour === 'right') ? -1 : 1;
    const view = [sx, 1.2, 1];
    const faces = [];
    const face = (pts, fill, center, extra) => faces.push(Object.assign({ pts, fill, center }, extra || {}));
    const boxFaces = (x0, x1, y0, y1, z0, z1, fill, sideFill, extra) => {
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], fill, c, extra);
      face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], fill, c, extra);
      face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], sideFill, c, extra);
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], sideFill, c, extra);
      face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill, c, extra);
    };

    // Neighbours as plain blocks
    const sides = set.type === 'semi' ? [set.neighbour] : set.type === 'terraced' ? ['left', 'right'] : [];
    for (const side of sides) {
      const s = side === 'left' ? -1 : 1;
      boxFaces(s * W - W / 2, s * W + W / 2, 0, E, -D / 2, D / 2, t.neighbour, t.neighbour, { opacity: 0.6 });
    }
    // The storeys, with windows on the two sides in view
    const lit = o.lit || new Set();
    sh.floors.forEach((f, i) => {
      const pick = { pick: 'level', id: f.levelId, levelName: f.name };
      boxFaces(-W / 2, W / 2, f.base, f.base + f.height, -D / 2, D / 2, t.wall, t.side, pick);
      const glass = lit.has(f.levelId) ? t.lit : t.glass;
      const cols = Math.max(2, Math.round(W / 2.6));
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + (W / cols) * (c + 0.5);
        const y0 = f.base + (i === 0 ? 0.9 : 0.85);
        if (i === 0 && Math.abs(x) < 1.1) continue; // room for the front door
        face([[x - 0.6, y0, D / 2 + 0.01], [x + 0.6, y0, D / 2 + 0.01], [x + 0.6, y0 + 1.35, D / 2 + 0.01], [x - 0.6, y0 + 1.35, D / 2 + 0.01]], glass, [x, y0, 0], { flat: true, pick });
      }
      if (i === 0) face([[-0.5, 0, D / 2 + 0.01], [0.5, 0, D / 2 + 0.01], [0.5, 2.15, D / 2 + 0.01], [-0.5, 2.15, D / 2 + 0.01]], t.door, [0, 1, 0], { flat: true, pick });
      const sideCols = Math.max(1, Math.round(D / 3.2));
      for (let c = 0; c < sideCols; c++) {
        const z = -D / 2 + (D / sideCols) * (c + 0.5);
        const y0 = f.base + 0.85; const xs = sx * (W / 2 + 0.01);
        face([[xs, y0, z - 0.45], [xs, y0, z + 0.45], [xs, y0 + 1.35, z + 0.45], [xs, y0 + 1.35, z - 0.45]], glass, [0, y0, z], { flat: true, pick });
      }
    });
    // The roof, from the same shapes as the 3D house
    const roofPick = { pick: 'level', id: sh.attic ? sh.attic.levelId : sh.floors[sh.floors.length - 1].levelId };
    const turned = set.ridge === 'depth' && set.roof !== 'flat';
    const L = turned ? D : W; const S = turned ? W : D;
    const rise = (S / 2) * Math.tan((set.pitch * Math.PI) / 180);
    // Roof points in the roof's own frame (length along x), turned into the house frame
    const rp = (x, y, z) => (turned ? [z, E + y, -x] : [x, E + y, z]);
    const roofFaces = {};
    if (set.roof === 'flat') {
      boxFaces(-W / 2 - 0.15, W / 2 + 0.15, E, E + 0.3, -D / 2 - 0.15, D / 2 + 0.15, t.roofSide, t.roofSide, roofPick);
      roofFaces.top = [[-W / 2, E + 0.31, D / 2], [W / 2, E + 0.31, D / 2], [W / 2, E + 0.31, -D / 2], [-W / 2, E + 0.31, -D / 2]];
    } else {
      const r = set.roof === 'hip' ? Math.max(0, L / 2 - S / 2) : L / 2;
      const ov = 0.3;
      const slopes = {
        a: [rp(-L / 2 - ov, 0, S / 2 + ov), rp(L / 2 + ov, 0, S / 2 + ov), rp(r, rise, 0), rp(-r, rise, 0)],
        b: [rp(L / 2 + ov, 0, -S / 2 - ov), rp(-L / 2 - ov, 0, -S / 2 - ov), rp(-r, rise, 0), rp(r, rise, 0)],
      };
      const c = [0, E, 0];
      face(slopes.a, t.roof, c, roofPick);
      face(slopes.b, t.roof, c, roofPick);
      if (set.roof === 'hip') {
        face([rp(L / 2 + ov, 0, S / 2 + ov), rp(L / 2 + ov, 0, -S / 2 - ov), rp(r, rise, 0)], t.roofSide, c, roofPick);
        face([rp(-L / 2 - ov, 0, -S / 2 - ov), rp(-L / 2 - ov, 0, S / 2 + ov), rp(-r, rise, 0)], t.roofSide, c, roofPick);
      } else {
        face([rp(L / 2, 0, S / 2), rp(L / 2, 0, -S / 2), rp(L / 2, rise, 0)], t.side, c, roofPick);
        face([rp(-L / 2, 0, -S / 2), rp(-L / 2, 0, S / 2), rp(-L / 2, rise, 0)], t.side, c, roofPick);
      }
      // a and b are the front and back slopes, or the right and left ones when the ridge runs front to back
      if (turned) { roofFaces.right = slopes.a; roofFaces.left = slopes.b; } else { roofFaces.front = slopes.a; roofFaces.back = slopes.b; }
      // the ends of a hip roof slope too
      if (set.roof === 'hip') {
        const up = [rp(L / 2 + ov, 0, S / 2 + ov), rp(L / 2 + ov, 0, -S / 2 - ov), rp(r, rise, 0)];
        const down = [rp(-L / 2 - ov, 0, -S / 2 - ov), rp(-L / 2 - ov, 0, S / 2 + ov), rp(-r, rise, 0)];
        if (turned) { roofFaces.back = up; roofFaces.front = down; } else { roofFaces.right = up; roofFaces.left = down; }
      }
    }
    const anchors = { home: [0, E + rise + 1.2, 0] };
    // Solar panels: the sunny roof face, a little smaller
    if (shows(set, 'solar', present)) {
      solarSides(set).forEach((side, i) => {
        const rf = roofFaces[side] || (i === 0 ? roofFaces.top : null);
        if (!rf) return;
        const m = v3.mid(rf);
        const lift = (p) => [p[0], p[1] + 0.05, p[2]];
        face(rf.slice(0, 4).map((p) => lift([m[0] + (p[0] - m[0]) * 0.78, m[1] + (p[1] - m[1]) * 0.72, m[2] + (p[2] - m[2]) * 0.72])), t.panel, [0, E, 0], { pick: 'solar', panel: true });
        if (i === 0) anchors.solar = [m[0], m[1] + 1.4, m[2]];
      });
    }
    const cx = sx * (W / 2 + 2.0); const cz = D / 2 - 3.4;
    if (carport !== 'none') {
      for (const [dx, dz] of [[1, -1], [1, 1]]) boxFaces(cx + sx * dx * 1.7 - 0.07, cx + sx * dx * 1.7 + 0.07, 0, 2.45, cz + dz * 3 - 0.07, cz + dz * 3 + 0.07, t.post, t.post);
      boxFaces(cx - 1.9, cx + 1.9, 2.45, 2.6, cz - 3.2, cz + 3.2, t.post, t.post, { opacity: 0.85 });
    }
    if (shows(set, 'car', present)) {
      const x = cx + sx * 0.25; const z = cz + 0.4;
      boxFaces(x - 0.9, x + 0.9, 0.15, 0.9, z - 2.15, z + 2.15, t.car, t.car, { pick: 'car' });
      boxFaces(x - 0.75, x + 0.75, 0.9, 1.45, z - 1.2, z + 0.9, '#1e2733', '#1e2733', { pick: 'car' });
      anchors.car = [x, 2.4, z];
    }
    if (shows(set, 'battery', present)) {
      const under = set.objects.battery.place === 'carport' && carport !== 'none';
      const x = (under || carport === 'none' ? sx : -sx) * (W / 2 + 0.22); const z = under ? D / 2 - 5.6 : -D / 4;
      boxFaces(x - 0.16, x + 0.16, 0, 1.1, z - 0.37, z + 0.37, '#f4f5f7', '#dcdfe3', { pick: 'battery' });
      anchors.battery = [x, 2.0, z];
    }
    if (shows(set, 'heatpump', present)) {
      const x = sx * (W / 2 + 0.23); const z = -D / 2 + 1.0;
      boxFaces(x - 0.21, x + 0.21, 0, 0.85, z - 0.52, z + 0.52, t.unit, t.unit, { pick: 'heatpump' });
      anchors.heatpump = [x, 1.6, z];
    }
    if (shows(set, 'airco', present)) {
      const top = sh.floors.length > 1 ? sh.floors[1] : sh.floors[0];
      const x = -sx * (W / 2 - 0.9); const y = top.base + 0.25;
      boxFaces(x - 0.4, x + 0.4, y, y + 0.6, D / 2 + 0.02, D / 2 + 0.38, t.unit, t.unit, { pick: 'airco' });
      anchors.airco = [x, y + 1.3, D / 2 + 0.3];
    }
    if (shows(set, 'grid', present)) {
      const x = -sx * (W / 2 + 3);
      boxFaces(x - 0.35, x + 0.35, 0, 1.15, D / 2 + 4, D / 2 + 4.4, t.cabinet, t.cabinet, { pick: 'grid' });
      anchors.grid = [x, 2.0, D / 2 + 4.2];
    }

    // Isometric projection, nearest faces last; faces turned away are left out
    const P = (p) => [(p[0] * sx - p[2]) * 0.866, (p[0] * sx + p[2]) * 0.5 - p[1]];
    const depth = (p) => p[0] * sx + p[2] + p[1] * 0.05;
    const drawn = [];
    for (const f of faces) {
      const n0 = v3.cross(v3.sub(f.pts[1], f.pts[0]), v3.sub(f.pts[2], f.pts[0]));
      const m = v3.mid(f.pts);
      const n = v3.dot(n0, v3.sub(m, f.center)) < 0 ? n0.map((v) => -v) : n0;
      if (!f.flat && !f.panel && v3.dot(n, view) <= 0) continue;
      drawn.push({ f, d: depth(m) + (f.flat || f.panel ? 0.02 : 0) });
    }
    drawn.sort((a, b) => a.d - b.d);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const parts = drawn.map(({ f }) => {
      const pts = f.pts.map(P);
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const attr = f.pick ? ` data-house="${f.pick}"${f.id ? ` data-id="${escXml(f.id)}"` : ''}` : '';
      return `<polygon points="${pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}" fill="${f.fill}"${f.opacity ? ` fill-opacity="${f.opacity}"` : ''} stroke="${f.panel ? '#9aa3ae' : 'rgba(0,0,0,0.12)'}" stroke-width="0.03" stroke-linejoin="round"${attr}/>`;
    });
    // Ground under it all
    const pad = 3;
    const ground = `<ellipse cx="${((x0 + x1) / 2).toFixed(2)}" cy="${(y1 - 1).toFixed(2)}" rx="${((x1 - x0) / 2 + 1).toFixed(2)}" ry="${((x1 - x0) / 4 + 0.5).toFixed(2)}" fill="${t.ground}" fill-opacity="0.7"/>`;
    // Cards with the values, and the names of the storeys
    const values = cardValues(e, T, o.lang || 'en');
    // Storey names on the left front corner; cards above their parts, moved up when they would cover each other
    const boxes = [];
    const tags = sh.floors.map((f) => {
      const [px, py] = P([-sx * W / 2, f.base + f.height / 2, D / 2]);
      const w = String(f.name || '').length * 0.2 + 0.6;
      x0 = Math.min(x0, px - w - 0.3);
      return storeyTag(f.levelId, f.name, px - w - 0.2, py, t, boxes);
    });
    const list = Object.keys(anchors).map((k) => {
      const [px, py] = P(anchors[k]);
      return cardAt(k, px, py, values[k]);
    }).sort((p, q) => q.y - p.y);
    const cards = placeCards(list, boxes, t);
    y0 = Math.min(y0, cards.top);
    const vb = [x0 - pad, y0 - 0.5, x1 - x0 + pad * 2, y1 - y0 + pad];
    return { svg: ground + parts.join('') + tags.join('') + cards.svg, viewBox: vb };
  }

  return { settings, shape, shows, sunnySide, solarSides, sunPosition, isNight, outdoorLamps, roomBehind, weatherKind, drawing, photoView, OBJECTS, TYPES, ROOFS, PLACES };
}));
