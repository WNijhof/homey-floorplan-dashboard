/* global FloorplanCore */
'use strict';

(function () {
  const core = FloorplanCore;

  const STRINGS = {
    en: {
      noPlan: 'No floor plan yet. Draw one in the HomeDeck editor.',
      on: 'On', brightness: 'Brightness', position: 'Position', open: 'Open', close: 'Close', stop: 'Stop',
      target: 'Target', temperature: 'Temperature', humidity: 'Humidity', power: 'Power',
      locked: 'Locked', unlocked: 'Unlocked', lock: 'Lock', unlock: 'Unlock', confirmUnlock: 'Tap again to unlock',
      lights: 'Lights', allOn: 'All on', allOff: 'All off', devices: 'Devices', play: 'Play', pause: 'Pause',
      openState: 'Open', closedState: 'Closed', motion: 'Motion', noMotion: 'No motion', alarm: 'Alarm', ok: 'OK',
      unavailable: 'Unavailable', failed: 'Could not reach the device', more: 'More',
      today: 'Today', tomorrow: 'Tomorrow', allDay: 'All day', agendaError: 'Calendar could not be loaded',
      zoomReset: 'Show the whole level',
      house: 'House', home: 'House', solar: 'Solar panels', grid: 'Grid', gridIn: 'From the grid', gridOut: 'To the grid', battery: 'Battery',
      charging: 'Charging', discharging: 'Supplying', idle: 'Resting', car: 'Car', heatpump: 'Heat pump', airco: 'Air conditioning', off: 'Off',
      now: 'Now', session: 'This session', soc: 'Charge', use: 'Use', noEnergy: 'No reading yet',
      expectedToday: 'Expected today', expectedTomorrow: 'Expected tomorrow', produced: 'Produced', forecast: 'Forecast',
      importedToday: 'From the grid today', exportedToday: 'To the grid today', chargedToday: 'Charged today', dischargedToday: 'Supplied today',
      socToday: 'Charge level today', gridNote: 'Above the line power comes from the grid, below it goes back.',
      solarToHome: 'Used in the house', solarToGrid: 'To the grid', solarToBattery: 'Into the battery',
      costToday: 'Costs today', priceNow: 'Price now', allEnergy: 'All energy', cheapest: 'Cheapest 3 hours', gas: 'Gas', water: 'Water', gasToday: 'Gas today', waterToday: 'Water today', meter: 'Meter', fullAt: 'Full at', emptyAt: 'Empty at', vacuumRoom: 'Vacuum this room', thermostat_mode: 'Mode', fan_mode: 'Fan',
    },
    nl: {
      noPlan: 'Nog geen plattegrond. Teken er een in de editor van HomeDeck.',
      on: 'Aan', brightness: 'Helderheid', position: 'Stand', open: 'Open', close: 'Dicht', stop: 'Stop',
      target: 'Doel', temperature: 'Temperatuur', humidity: 'Luchtvochtigheid', power: 'Vermogen',
      locked: 'Op slot', unlocked: 'Niet op slot', lock: 'Op slot doen', unlock: 'Ontgrendelen', confirmUnlock: 'Tik nogmaals om te ontgrendelen',
      lights: 'Lampen', allOn: 'Alles aan', allOff: 'Alles uit', devices: 'Apparaten', play: 'Afspelen', pause: 'Pauze',
      openState: 'Open', closedState: 'Dicht', motion: 'Beweging', noMotion: 'Geen beweging', alarm: 'Alarm', ok: 'OK',
      unavailable: 'Niet beschikbaar', failed: 'Apparaat niet bereikbaar', more: 'Meer',
      today: 'Vandaag', tomorrow: 'Morgen', allDay: 'Hele dag', agendaError: 'Agenda kon niet worden geladen',
      zoomReset: 'Hele verdieping tonen',
      house: 'Huis', home: 'Huis', solar: 'Zonnepanelen', grid: 'Net', gridIn: 'Van het net', gridOut: 'Naar het net', battery: 'Accu',
      charging: 'Laden', discharging: 'Levert', idle: 'In rust', car: 'Auto', heatpump: 'Warmtepomp', airco: 'Airco', off: 'Uit',
      now: 'Nu', session: 'Deze sessie', soc: 'Lading', use: 'Verbruik', noEnergy: 'Nog geen meting',
      expectedToday: 'Verwacht vandaag', expectedTomorrow: 'Verwacht morgen', produced: 'Opgewekt', forecast: 'Verwachting',
      importedToday: 'Van het net vandaag', exportedToday: 'Naar het net vandaag', chargedToday: 'Geladen vandaag', dischargedToday: 'Geleverd vandaag',
      socToday: 'Lading vandaag', gridNote: 'Boven de lijn komt stroom van het net, eronder gaat het terug.',
      solarToHome: 'In huis gebruikt', solarToGrid: 'Naar het net', solarToBattery: 'In de accu',
      costToday: 'Kosten vandaag', priceNow: 'Prijs nu', allEnergy: 'Alle energie', cheapest: 'Goedkoopste 3 uur', gas: 'Gas', water: 'Water', gasToday: 'Gas vandaag', waterToday: 'Water vandaag', meter: 'Meterstand', fullAt: 'Vol om', emptyAt: 'Leeg om', vacuumRoom: 'Deze kamer stofzuigen', thermostat_mode: 'Stand', fan_mode: 'Ventilator',
    },
  };
  const lang = (navigator.language || 'en').slice(0, 2);
  const T = STRINGS[lang] || STRINGS.en;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    Homey: null,
    settings: {},
    plan: null,
    levelId: null,
    devices: new Map(),
    view: '2d',
    turn: 0,
    sheet: null, // { type: 'device'|'room'|'opening', id }
    unlockArmed: null,
    zoom: null, // web page: { key, k, c } zoom factor and centre of the 2D / 2.5D view
    baseCenter: null,
    energy: null, // web page: the power of sun, grid, battery and car for the house view (GET /energy)
  };
  const HOUSE = 'house'; // the levelId of the house view

  function isDark() {
    if (window.FpTheme) return window.FpTheme.isDark();
    const root = document.documentElement;
    if (root.classList.contains('homey-dark-mode') || document.body.classList.contains('homey-dark-mode')) return true;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function currentLevel() {
    if (!state.plan) return null;
    return state.plan.levels.find((l) => l.id === state.levelId) || state.plan.levels[0] || null;
  }

  /* --------------------------------------------------------------- render */

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function has3d() {
    return !state.settings.simple && !!($('view3d') && window.FloorplanView3D && window.FloorplanView3D.supported);
  }

  // The house from outside (web page only, house3d.js), above the storeys.
  // Without 3D (older tablets) the house is a fixed drawing (HouseCore.drawing).
  function hasHouse() {
    return !!($('house3d') && window.HouseCore);
  }
  function house3d() {
    return !state.settings.simple && !!(window.FloorplanHouse3D && window.FloorplanHouse3D.supported);
  }
  // Browsers with import maps load house3d.js a moment after the page: they wait for it instead of drawing first
  const waits3d = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'));
  function inHouse() {
    return state.levelId === HOUSE && hasHouse();
  }
  // The web page starts on the house, unless this screen chose to start on a storey or pinned one.
  // A widget on a Homey dashboard keeps starting on its plan unless its settings choose the house.
  function startOnHouse() {
    const choice = state.settings.start || (state.Homey && state.Homey.isWeb ? 'house' : 'level');
    return hasHouse() && choice === 'house' && !(state.settings.level && state.settings.level.id);
  }

  function render() {
    const dark = isDark();
    document.documentElement.classList.toggle('fp-dark', dark);
    const level = currentLevel();
    const svg = $('plan');
    $('empty').hidden = !!level;
    if (!level) {
      $('empty').textContent = T.noPlan;
      svg.innerHTML = '';
      return;
    }
    const s = state.settings;
    // The 3D view (web page only, view3d.js) when chosen and available; otherwise the SVG views.
    const box3d = $('view3d');
    const houseBox = $('house3d');
    const house = inHouse();
    if (houseBox) houseBox.hidden = !house;
    // On the web page they keep their place, so the tabs beside them do not move
    for (const id of ['btn-view', 'btn-turn']) {
      if (state.Homey && state.Homey.isWeb) $(id).style.visibility = house ? 'hidden' : '';
      else $(id).hidden = house;
    }
    if (house) {
      if (!state.energy && !state.energyAsked) { state.energyAsked = true; loadEnergy(); }
      if (box3d) box3d.hidden = true;
      // An own photo takes the place of the model, on every screen
      const photo = window.HouseCore.settings(state.plan).photo;
      if (house3d() && !photo) {
        svg.style.display = 'none';
        if (!state.house) state.house = window.FloorplanHouse3D.create(houseBox, { tap: houseTap });
        state.house.sync({ plan: state.plan, energy: state.energy, devices: state.devices, dark, lang, texts: T, weather: state.weather });
      } else {
        houseBox.hidden = true;
        svg.style.display = '';
        if (photo) {
          const out = window.HouseCore.photoView(state.plan, { energy: state.energy, dark, lang, texts: T });
          svg.setAttribute('viewBox', out.viewBox.map((v) => v.toFixed(2)).join(' '));
          // the same picture is not decoded again, and the flow lines keep running
          if (state.photoSvg !== out.svg || !svg.querySelector('image')) { svg.innerHTML = out.svg; state.photoSvg = out.svg; }
        } else if (waits3d && state.Homey.isWeb && !state.settings.simple && !window.FloorplanHouse3D && !state.waited3d) {
          // the 3D house is on its way; draw the plain one only if it does not come
          svg.innerHTML = '';
          if (!state.waitTimer) state.waitTimer = setTimeout(() => { state.waited3d = true; scheduleRender(); }, 3000);
        } else {
          const lit = new Set(state.plan.levels.filter((l) => (l.items || []).some((it) => it.kind === 'device' && core.isLampItem(it, state.devices.get(it.deviceId)) && core.isOn(state.devices.get(it.deviceId)))).map((l) => l.id));
          const out = window.HouseCore.drawing(state.plan, { energy: state.energy, dark, lang, texts: T, lit });
          svg.setAttribute('viewBox', out.viewBox.map((v) => v.toFixed(2)).join(' '));
          svg.innerHTML = out.svg;
        }
      }
      renderLevels();
      if (state.sheet) renderSheet();
      return;
    }
    const can3d = has3d();
    const use3d = state.view === '3d' && can3d;
    if (box3d) box3d.hidden = !use3d;
    svg.style.display = use3d ? 'none' : '';
    $('btn-view').textContent = state.view === '2d' ? '2D' : state.view === '3d' && can3d ? '3D' : '2.5D';
    if (use3d) {
      if (!state.v3d) {
        state.v3d = window.FloorplanView3D.create(box3d, { tap: (kind, id) => tapFor({ kind, id }) });
        setupGestures(box3d);
      }
      state.v3d.sync({ plan: state.plan, level, devices: state.devices, dark, night: state.energy ? state.energy.night : undefined, furniture: s.furniture !== false, turn: state.turn, values: s.values !== false, names: s.names || 'devices' });
      renderLevels();
      if (state.sheet) renderSheet();
      if (state.quick) renderQuick();
      return;
    }
    const opts = {
      plan: state.plan,
      level,
      devices: state.devices,
      view: { mode: state.view === '3d' ? 'steep' : state.view, turn: state.turn },
      palette: dark ? core.DARK_PALETTE : core.LIGHT_PALETTE,
      modelBase: state.Homey && state.Homey.isWeb ? 'models/' : null,
      glow: s.glow || 'soft',
      tint: s.tint || 'none',
      furniture: s.furniture !== false,
      values: s.values !== false,
      names: s.names || 'devices',
      idPrefix: 'w',
      soft: true,
    };
    let out = core.render(opts);
    const [bx, by, bw, bh] = out.viewBox;
    state.baseCenter = [bx + bw / 2, by + bh / 2];
    // Zoomed in: the same plan with a smaller window on it, markers and texts at their usual size.
    const z = state.zoom && state.zoom.key === zoomKey() ? state.zoom : null;
    if (z) {
      const vw = bw / z.k; const vh = bh / z.k;
      z.c = [Math.min(bx + bw - vw / 2, Math.max(bx + vw / 2, z.c[0])), Math.min(by + bh - vh / 2, Math.max(by + vh / 2, z.c[1]))];
      out = core.render(Object.assign({}, opts, { viewBox: [z.c[0] - vw / 2, z.c[1] - vh / 2, vw, vh], markerSize: out.marker / z.k }));
    }
    const reset = document.querySelector('.fp-zoom-reset');
    if (reset) reset.hidden = !z;
    svg.setAttribute('viewBox', out.viewBox.map((v) => v.toFixed(1)).join(' '));
    const before = lampPools(svg);
    svg.innerHTML = out.svg;
    fadeLamps(svg, before, `${level.id}|${state.view}|${state.turn}`);
    renderLevels();
    if (state.sheet) renderSheet();
    if (state.quick) renderQuick();
  }

  // The light of a lamp fades instead of jumping. The drawing is replaced on every update, so a fade keeps its start time
  // and its old light, and goes on where it was when the next update arrives.
  const LAMP_FADE = 450;

  function lampPools(svg) {
    const pools = new Map();
    for (const el of svg.querySelectorAll('[data-lamp]')) pools.set(el.dataset.lamp, { key: el.dataset.key, el, light: oldLight(svg, el) });
    return pools;
  }

  function oldLight(svg, el) {
    const pool = el.cloneNode(true);
    pool.removeAttribute('data-lamp');
    pool.setAttribute('class', 'fp-lamp-out');
    pool.removeAttribute('style');
    const parts = [];
    const fill = /url\(#(.+)\)/.exec(pool.getAttribute('fill') || '');
    const gradient = fill && svg.getElementById(fill[1]);
    if (gradient) {
      const copy = gradient.cloneNode(true);
      copy.id = `${fill[1]}-old`;
      pool.setAttribute('fill', `url(#${copy.id})`);
      parts.push(copy);
    }
    const area = /url\(#(.+)\)/.exec(pool.getAttribute('clip-path') || '');
    const clip = area && svg.getElementById(area[1]);
    if (clip) {
      const copy = clip.cloneNode(true);
      copy.id = `${area[1]}-old`;
      pool.setAttribute('clip-path', `url(#${copy.id})`);
      parts.push(copy);
    }
    return { pool, parts };
  }

  function fadeLamps(svg, before, scope) {
    const fresh = state.lampScope !== scope;
    state.lampScope = scope;
    if (fresh) state.lampFades = new Map();
    const now = Date.now();
    const pools = lampPools(svg);
    const glow = svg.querySelector('.fp-glow');
    const defs = svg.querySelector('defs');
    for (const [id, f] of state.lampFades) if (now - f.start > LAMP_FADE) state.lampFades.delete(id);
    if (!fresh) {
      for (const id of new Set([...before.keys(), ...pools.keys()])) {
        const was = before.get(id); const is = pools.get(id);
        if ((was && was.key) === (is && is.key)) continue;
        state.lampFades.set(id, { start: now, old: was && was.light ? was.light : null });
      }
    }
    if (!glow || !defs) return;
    for (const [id, f] of state.lampFades) {
      const delay = `-${now - f.start}ms`;
      const is = pools.get(id);
      if (is) { is.el.classList.add('fp-lamp-in'); is.el.style.animationDelay = delay; }
      if (f.old) {
        for (const part of f.old.parts) defs.appendChild(part.cloneNode(true));
        const pool = f.old.pool.cloneNode(true);
        pool.style.animationDelay = delay;
        glow.appendChild(pool);
      }
    }
  }

  function renderLevels() {
    const box = $('levels');
    const levels = state.plan ? state.plan.levels : [];
    const pinned = state.settings.level && state.settings.level.id;
    const house = hasHouse();
    box.hidden = levels.length + (house ? 1 : 0) < 2 || !!pinned;
    if (box.hidden) return;
    const active = inHouse() ? HOUSE : (currentLevel() || {}).id;
    const buttons = (house ? [{ id: HOUSE, name: `🏠 ${T.house}` }] : []).concat(levels);
    box.innerHTML = buttons.map((l) => `<button type="button" data-level="${esc(l.id)}" class="${l.id === active ? 'active' : ''}">${esc(l.name)}</button>`).join('');
  }

  /* ---------------------------------------------------------------- house */

  // Taps on the house: a storey opens that level in 3D, the panels, battery, car and so on their details.
  function houseTap(kind, id) {
    if (state.Homey.hapticFeedback) state.Homey.hapticFeedback();
    if (kind === 'level') {
      if (!id || !state.plan.levels.some((l) => l.id === id)) return;
      const open = () => {
        state.levelId = id;
        if (has3d()) state.view = '3d';
        closeSheet();
        scheduleRender();
      };
      if (state.house && house3d() && !window.HouseCore.settings(state.plan).photo) state.house.fly(id, open); else open();
      return;
    }
    // An outdoor lamp on the house: all lamps of that place switch together
    if (kind === 'lamp') {
      const ids = window.HouseCore.outdoorLamps(state.plan, state.devices)[id] || [];
      const on = ids.some((d) => core.isOn(state.devices.get(d)));
      ids.forEach((d) => setCap(d, 'onoff', !on));
      return;
    }
    openSheet({ type: 'energy', id: kind });
    loadDetail(kind);
  }

  // Today's power of a part (and the solar forecast), for its page; the house card itself has no curve.
  const DETAIL = { solar: 'solar', battery: 'battery', grid: 'grid', home: 'grid', car: 'car', heatpump: 'heatpump', airco: 'airco' };
  async function loadDetail(kind) {
    const part = DETAIL[kind];
    if (!part) return;
    try {
      state.details = state.details || {};
      // The house shows everything together: what the sun, the grid and the battery do
      const parts = kind === 'home' ? ['grid', 'solar', 'battery'] : kind === 'car' ? ['car', 'grid'] : [part];
      await Promise.all(parts.map(async (p) => {
        state.details[p] = await state.Homey.api('GET', `/energy-detail?kind=${p}${state.plan ? `&plan=${encodeURIComponent(state.plan.id)}` : ''}`);
      }));
      if (!state.weather && kind === 'solar') state.weather = await state.Homey.api('GET', '/weather').catch(() => null);
      if (state.sheet && state.sheet.type === 'energy' && state.sheet.id === kind) renderSheet();
    } catch (err) { /* the page shows the values of now */ }
  }

  async function loadEnergy() {
    try {
      state.energy = await state.Homey.api('GET', '/energy');
      if (window.FpTheme && typeof state.energy.night === 'boolean') window.FpTheme.setNight(state.energy.night);
      if (inHouse()) scheduleRender();
    } catch (err) { /* the house shows without values */ }
  }

  function fmtW(w) {
    if (typeof w !== 'number') return '–';
    const a = Math.abs(w);
    return a >= 1000 ? `${(a / 1000).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW` : `${Math.round(a)} W`;
  }
  const row = (name, value) => `<div class="fp-row"><span class="fp-name">${esc(name)}</span><span class="fp-val">${esc(value)}</span></div>`;
  const degrees = (v) => `${v.toLocaleString(lang)}°`;

  const kwh = (v) => (typeof v === 'number' ? `${v.toLocaleString(lang, { maximumFractionDigits: 1 })} kWh` : '–');
  const clock = (t) => new Date(t).toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
  const stat = (name, value) => `<div class="fp-stat"><span>${esc(name)}</span><b>${esc(value)}</b></div>`;
  const money = (v, currency, digits) => v.toLocaleString(lang, currency ? { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits } : { minimumFractionDigits: digits, maximumFractionDigits: digits });

  /*
   * A chart of one day: series [{ points: [{ t, w }], cls, area, dash, name }] from `from` to `to`, one y-axis.
   * The points are kept for the crosshair (onChartMove).
   */
  function dayChart(series, from, to, unit) {
    const W = 600; const H = 200; const L = 44; const R = 8; const TOP = 10; const B = 22;
    const all = series.flatMap((s) => s.points.filter((p) => p.w !== null).map((p) => p.w));
    const lo = Math.min(0, ...all);
    const top = unit === '%' ? 100 : Math.max(...all, 1);
    const step = unit === '%' ? 25 : niceStep((top - lo) / 3);
    const max = unit === '%' ? 100 : Math.ceil(top / step) * step;
    const min = lo < 0 ? -Math.ceil(-lo / step) * step : 0;
    const x = (t) => L + ((t - from) / (to - from)) * (W - L - R);
    const y = (v) => TOP + ((max - v) / (max - min || 1)) * (H - TOP - B);
    const label = (v) => (unit === '%' ? `${v}%` : Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })} kW` : `${v} W`);
    const grid = [];
    for (let v = min; v <= max + 1e-6; v += step) {
      grid.push(`<line class="fp-ch-grid${v === 0 ? ' zero' : ''}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="fp-ch-tick" x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(label(v))}</text>`);
    }
    for (let h = 0; h <= 24; h += 6) {
      const t = from + h * 3600000;
      if (t > to) break;
      grid.push(`<text class="fp-ch-tick" x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(h % 24).padStart(2, '0')}:00</text>`);
    }
    const marks = series.map((s) => {
      // gaps in the readings break the line
      const runs = []; let run = [];
      for (const p of s.points) { if (p.w === null || p.t < from || p.t > to) { if (run.length) runs.push(run); run = []; } else run.push(p); }
      if (run.length) runs.push(run);
      return runs.map((r) => {
        const d = r.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join('');
        const area = s.area ? `<path class="fp-ch-area ${s.cls}" d="${d}L${x(r[r.length - 1].t).toFixed(1)},${y(0).toFixed(1)}L${x(r[0].t).toFixed(1)},${y(0).toFixed(1)}Z"/>` : '';
        return `${area}<path class="fp-ch-line ${s.cls}${s.dash ? ' dash' : ''}" d="${d}"/>`;
      }).join('');
    }).join('');
    const legend = series.length > 1 ? `<div class="fp-ch-legend">${series.map((s) => `<span><i class="${s.cls}${s.dash ? ' dash' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    state.chart = { series, from, to, unit, L, R, W, label };
    return `${legend}<div class="fp-chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid.join('')}${marks}<line class="fp-ch-cross" x1="0" x2="0" y1="${TOP}" y2="${H - B}" visibility="hidden"/></svg><div class="fp-ch-tip" hidden></div></div>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  // Crosshair and tooltip: the values of every series at the time under the finger or mouse.
  function onChartMove(ev) {
    const box = ev.target.closest && ev.target.closest('.fp-chart');
    const c = state.chart;
    if (!box || !c) return;
    const svg = box.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width * c.W;
    const t = c.from + ((fx - c.L) / (c.W - c.L - c.R)) * (c.to - c.from);
    const cross = svg.querySelector('.fp-ch-cross');
    const tip = box.querySelector('.fp-ch-tip');
    if (t < c.from || t > c.to) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
    const lines = c.series.map((s) => {
      let best = null;
      for (const p of s.points) if (p.w !== null && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
      return best && Math.abs(best.t - t) <= 20 * 60000 ? `<div><i class="${s.cls}${s.dash ? ' dash' : ''}"></i>${esc(s.name)} <b>${esc(c.label(Math.round(best.w)))}</b></div>` : '';
    }).join('');
    if (!lines) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
    cross.setAttribute('x1', fx.toFixed(1)); cross.setAttribute('x2', fx.toFixed(1)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<span>${esc(new Date(t).toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' }))}</span>${lines}`;
    tip.hidden = false;
    const px = ev.clientX - box.getBoundingClientRect().left;
    tip.style.left = `${Math.min(Math.max(px, 70), box.clientWidth - 70)}px`;
  }

  // The weather of the coming hours, on the solar page.
  function weatherStrip() {
    const data = state.weather;
    const hours = (Array.isArray(data && data.hourly) ? data.hourly : []).filter((h) => pickTemp(h) != null).slice(0, 8);
    if (!hours.length) return '';
    return `<div class="fp-hours fp-detail-hours">${hours.map((h) => {
      const d = toDate(h);
      return `<div class="fp-hour"><span>${esc(d ? d.toLocaleTimeString(navigator.language, { hour: '2-digit' }) : '')}</span><div>${weatherIcon(h.iconId)}</div><b>${Math.round(pickTemp(h))}°</b></div>`;
    }).join('')}</div>`;
  }

  // When the battery is full or empty at the pace of the last hour; from the charge itself, so no size is needed.
  function batteryTime(d, battery) {
    const points = d && d.soc ? d.soc.filter((p) => p.w !== null && p.t > Date.now() - 3600000) : [];
    if (points.length < 3 || typeof battery.soc !== 'number') return null;
    const a = points[0]; const b = points[points.length - 1];
    const perHour = ((b.w - a.w) / (b.t - a.t)) * 3600000;
    if (Math.abs(perHour) < 2) return null;
    const hours = (perHour > 0 ? 100 - battery.soc : -battery.soc) / perHour;
    return hours > 0 && hours < 24 ? { full: perHour > 0, at: Date.now() + hours * 3600000 } : null;
  }

  // The page of a part of the house: the values of now, today's totals and a chart of the day.
  function energySheet(kind) {
    const e = state.energy;
    const title = T[kind] || T.house;
    if (!e) return { title, body: `<p class="fp-sub">${esc(T.noEnergy)}</p>` };
    const d = state.details && state.details[DETAIL[kind]];
    const dayFrom = d ? d.from : new Date().setHours(0, 0, 0, 0);
    const dayTo = dayFrom + 86400000;
    const rows = [];
    let stats = [];
    let chart = '';
    if (kind === 'solar') {
      const fc = d && d.forecast && !d.forecast.error ? d.forecast : null;
      const keyOf = (t) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      stats = [stat(T.now, fmtW(e.solarW)), stat(T.today, kwh(d && d.kWh))];
      if (fc && fc.days) {
        stats.push(stat(T.expectedToday, kwh(fc.days[keyOf(dayFrom)])));
        if (fc.days[keyOf(dayTo)] != null) stats.push(stat(T.expectedTomorrow, kwh(fc.days[keyOf(dayTo)])));
      }
      if (d && d.curve) {
        const series = [{ points: d.curve, cls: 's1', area: true, name: T.produced }];
        if (fc && fc.watts && fc.watts.length) series.push({ points: fc.watts, cls: 's2', dash: true, name: T.forecast });
        chart = dayChart(series, dayFrom, dayTo, 'W');
      }
      if (e.flows) {
        rows.push(row(T.solarToHome, fmtW(e.flows.solarToHome)));
        if (e.battery) rows.push(row(T.solarToBattery, fmtW(e.flows.solarToBattery)));
        rows.push(row(T.solarToGrid, fmtW(e.flows.solarToGrid)));
      }
      chart += weatherStrip();
      if (d && d.forecast && d.forecast.error) rows.push(`<p class="fp-sub">${esc(d.forecast.error)}</p>`);
    } else if (kind === 'water' && e.water) {
      stats = [stat(T.now, typeof e.water.perMinute === 'number' ? `${e.water.perMinute.toLocaleString(lang)} L/min` : '–')];
      if (typeof e.water.total === 'number') stats.push(stat(T.meter, `${e.water.total.toLocaleString(lang)} m³`));
    } else if (kind === 'gas') {
      stats = [stat(T.meter, typeof e.gasM3 === 'number' ? `${e.gasM3.toLocaleString(lang)} m³` : '–')];
    } else if (kind === 'grid') {
      stats = [stat(typeof e.gridW === 'number' && e.gridW < 0 ? T.gridOut : T.gridIn, fmtW(e.gridW))];
      if (d) stats.push(stat(T.importedToday, kwh(d.imported)), stat(T.exportedToday, kwh(d.exported)));
      if (d && typeof d.cost === 'number') stats.push(stat(T.costToday, money(d.cost, d.currency, 2)));
      if (d && typeof d.price === 'number') stats.push(stat(T.priceNow, money(d.price, d.currency, 3)));
      const gas = d && typeof d.gasToday === 'number' ? d.gasToday : e.gasToday;
      if (typeof gas === 'number') stats.push(stat(T.gasToday, `${gas.toLocaleString(lang, { maximumFractionDigits: 2 })} m³`));
      if (d && typeof d.waterToday === 'number') stats.push(stat(T.waterToday, `${Math.round(d.waterToday).toLocaleString(lang)} L`));
      if (d && d.curve) chart = dayChart([{ points: d.curve, cls: 's2', area: true, name: T.grid }], dayFrom, dayTo, 'W');
      rows.push(`<p class="fp-sub">${esc(T.gridNote)}</p>`);
    } else if (kind === 'battery' && e.battery) {
      const w = e.battery.watts;
      stats = [stat(T.soc, typeof e.battery.soc === 'number' ? `${Math.round(e.battery.soc)}%` : '–'), stat(Math.abs(w) < 20 ? T.idle : w > 0 ? T.charging : T.discharging, Math.abs(w) < 20 ? '–' : fmtW(w))];
      if (d) stats.push(stat(T.chargedToday, kwh(d.charged)), stat(T.dischargedToday, kwh(d.discharged)));
      const left = batteryTime(d, e.battery);
      if (left) stats.push(stat(left.full ? T.fullAt : T.emptyAt, clock(left.at)));
      if (d && d.soc && d.soc.some((p) => p.w !== null)) chart = `<p class="fp-sub">${esc(T.socToday)}</p>${dayChart([{ points: d.soc, cls: 's1', area: true, name: T.soc }], dayFrom, dayTo, '%')}`;
      else if (d && d.curve) chart = dayChart([{ points: d.curve, cls: 's1', area: true, name: T.battery }], dayFrom, dayTo, 'W');
    } else if (kind === 'car' && e.ev) {
      stats = [stat(e.ev.charging ? T.charging : T.now, fmtW(e.ev.watts))];
      if (e.ev.car && typeof e.ev.car.soc === 'number') stats.push(stat(T.soc, `${Math.round(e.ev.car.soc)}%`));
      if (e.ev.session && typeof e.ev.session.kWh === 'number') stats.push(stat(T.session, kwh(e.ev.session.kWh)));
      if (d) stats.push(stat(T.today, kwh(d.kWh)));
      if (d && d.curve) chart = dayChart([{ points: d.curve, cls: 's2', area: true, name: T.car }], dayFrom, dayTo, 'W');
      if (e.ev.state) rows.push(row(T.car, e.ev.state));
    } else if ((kind === 'heatpump' && e.heating) || (kind === 'airco' && e.airco)) {
      const units = kind === 'heatpump' ? e.heating.devices.map((h) => ({ name: h.name, on: h.watts > 30, watts: h.watts, temperature: h.temperature })) : e.airco;
      const now = units.reduce((s, u) => s + (u.on ? u.watts || 0 : 0), 0);
      stats.push(stat(T.now, now ? fmtW(now) : T.off));
      if (d) stats.push(stat(T.today, kwh(d.kWh)));
      if (d && d.curve) chart = dayChart([{ points: d.curve, cls: 's2', area: true, name: T[kind] }], dayFrom, dayTo, 'W');
      for (const u of units) {
        rows.push(row(u.name, u.on ? fmtW(u.watts) : T.off));
        if (typeof u.temperature === 'number') rows.push(row(T.temperature, degrees(u.temperature)));
      }
    }
    if (kind === 'home' && d && state.details) {
      const series = [];
      const add = (p, cls, name) => { const x = state.details[p]; if (x && x.curve && x.curve.some((c) => c.w !== null)) series.push({ points: x.curve, cls, name }); };
      add('solar', 's1', T.solar); add('grid', 's2', T.grid); add('battery', 's3', T.battery);
      if (series.length) {
        chart = dayChart(series, dayFrom, dayTo, 'W');
        stats = [stat(T.use, fmtW(e.homeW))];
      }
    }
    if (kind === 'grid' || kind === 'car') {
      const c = state.details && state.details.grid && state.details.grid.cheapest;
      if (c) stats.push(stat(T.cheapest, `${clock(Date.parse(c.start))}–${clock(Date.parse(c.start) + c.hours * 3600000)}`));
    }
    if (stats.length || chart) return { title, body: `${stats.length ? `<div class="fp-stats">${stats.join('')}</div>` : ''}${chart}${rows.join('')}`, wide: true };
    if (kind === 'car' && e.ev) {
      rows.push(row(e.ev.charging ? T.charging : T.now, fmtW(e.ev.watts)));
      if (e.ev.state) rows.push(row(T.car, e.ev.state));
      if (e.ev.session && typeof e.ev.session.kWh === 'number') rows.push(row(T.session, `${e.ev.session.kWh.toLocaleString(lang)} kWh`));
      if (e.ev.car && typeof e.ev.car.soc === 'number') rows.push(row(T.soc, `${Math.round(e.ev.car.soc)}%`));
    } else if (kind === 'heatpump' && e.heating) {
      for (const h of e.heating.devices) {
        rows.push(row(h.name, fmtW(h.watts)));
        if (typeof h.temperature === 'number') rows.push(row(T.temperature, degrees(h.temperature)));
      }
    } else if (kind === 'airco' && e.airco) {
      for (const a of e.airco) {
        rows.push(row(a.name, a.on ? fmtW(a.watts) : T.off));
        if (typeof a.temperature === 'number') rows.push(row(T.temperature, degrees(a.temperature)));
      }
    } else if (kind === 'home') {
      rows.push(row(T.use, fmtW(e.homeW)));
      if (typeof e.solarW === 'number') rows.push(row(T.solar, fmtW(e.solarW)));
      if (typeof e.gridW === 'number') rows.push(row(e.gridW < 0 ? T.gridOut : T.gridIn, fmtW(e.gridW)));
      if (e.battery) rows.push(row(T.battery, `${fmtW(e.battery.watts)}${typeof e.battery.soc === 'number' ? ` · ${Math.round(e.battery.soc)}%` : ''}`));
    }
    return { title, body: rows.join('') || `<p class="fp-sub">${esc(T.noEnergy)}</p>` };
  }

  /* -------------------------------------------------------------- devices */

  async function setCap(deviceId, capabilityId, value) {
    const dev = state.devices.get(deviceId);
    const previous = dev ? dev.caps[capabilityId] : undefined;
    if (dev) { dev.caps[capabilityId] = value; scheduleRender(); }
    try {
      await state.Homey.api('POST', '/capability', { deviceId, capabilityId, value });
    } catch (err) {
      if (dev) { dev.caps[capabilityId] = previous; scheduleRender(); }
      flash(T.failed);
    }
  }

  function flash(text) {
    const el = $('empty');
    el.hidden = false; el.textContent = text;
    setTimeout(() => { el.hidden = !!currentLevel(); }, 2000);
  }

  // Tap: switch lights, plugs, covers and players. Everything else opens its popup.
  function primaryAction(item) {
    const dev = state.devices.get(item.deviceId);
    if (!dev || !dev.available) return openSheet({ type: 'device', id: item.id });
    const kind = core.deviceKind(dev);
    const c = dev.caps;
    if ((kind === 'light' || kind === 'socket' || kind === 'tv') && 'onoff' in c) return setCap(dev.id, 'onoff', !c.onoff);
    if (kind === 'speaker' && 'speaker_playing' in c) return setCap(dev.id, 'speaker_playing', !c.speaker_playing);
    if (kind === 'cover') {
      if (typeof c.windowcoverings_set === 'number') return setCap(dev.id, 'windowcoverings_set', c.windowcoverings_set > 0.5 ? 0 : 1);
      if ('windowcoverings_state' in c) return setCap(dev.id, 'windowcoverings_state', c.windowcoverings_state === 'up' ? 'down' : 'up');
    }
    return openSheet({ type: 'device', id: item.id });
  }

  /* ---------------------------------------------------------------- sheet */

  function openSheet(target) {
    state.sheet = target;
    state.unlockArmed = null;
    $('sheet').hidden = false;
    renderSheet();
  }

  function closeSheet() {
    state.sheet = null;
    $('sheet').hidden = true;
    $('sheet').classList.remove('wide');
  }

  function deviceControls(dev) {
    const c = dev.caps;
    const kind = core.deviceKind(dev);
    const rows = [];
    if (!dev.available) rows.push(`<div class="fp-row"><span class="fp-val">${T.unavailable}</span></div>`);
    if ('onoff' in c) rows.push(`<div class="fp-row"><span class="fp-name">${T.on}</span><button type="button" class="fp-toggle ${c.onoff ? 'on' : ''}" data-act="toggle" data-dev="${esc(dev.id)}" data-cap="onoff"></button></div>`);
    if (typeof c.dim === 'number') rows.push(`<div><div class="fp-row"><span class="fp-name">${T.brightness}</span><span class="fp-val">${Math.round(c.dim * 100)}%</span></div><input class="fp-range" type="range" min="1" max="100" value="${Math.round(c.dim * 100)}" data-act="range" data-dev="${esc(dev.id)}" data-cap="dim" data-scale="100"></div>`);
    if (typeof c.windowcoverings_set === 'number') rows.push(`<div><div class="fp-row"><span class="fp-name">${T.position}</span><span class="fp-val">${Math.round(c.windowcoverings_set * 100)}%</span></div><input class="fp-range" type="range" min="0" max="100" value="${Math.round(c.windowcoverings_set * 100)}" data-act="range" data-dev="${esc(dev.id)}" data-cap="windowcoverings_set" data-scale="100"></div>`);
    if ('windowcoverings_state' in c) rows.push(`<div class="fp-btns"><button type="button" class="fp-btn" data-act="set" data-dev="${esc(dev.id)}" data-cap="windowcoverings_state" data-value="up">${T.open}</button><button type="button" class="fp-btn" data-act="set" data-dev="${esc(dev.id)}" data-cap="windowcoverings_state" data-value="idle">${T.stop}</button><button type="button" class="fp-btn" data-act="set" data-dev="${esc(dev.id)}" data-cap="windowcoverings_state" data-value="down">${T.close}</button></div>`);
    if (typeof c.target_temperature === 'number') {
      const u = (dev.units && dev.units.target_temperature) || {};
      rows.push(`<div class="fp-row"><span class="fp-name">${T.target}</span><div class="fp-steps"><button type="button" class="fp-step" data-act="step" data-dev="${esc(dev.id)}" data-cap="target_temperature" data-step="${-(u.step || 0.5)}">−</button><span class="fp-big">${c.target_temperature}°</span><button type="button" class="fp-step" data-act="step" data-dev="${esc(dev.id)}" data-cap="target_temperature" data-step="${u.step || 0.5}">+</button></div></div>`);
    }
    for (const cap of ['thermostat_mode', 'fan_mode']) {
      const values = dev.units && dev.units[cap] && dev.units[cap].values;
      if (values && cap in c) rows.push(`<div class="fp-row"><span class="fp-name">${esc(T[cap])}</span><select data-act="set-value" data-dev="${esc(dev.id)}" data-cap="${cap}">${values.map((v) => `<option value="${esc(v.id)}"${v.id === c[cap] ? ' selected' : ''}>${esc(v.title[lang] || v.title.en || v.id)}</option>`).join('')}</select></div>`);
    }
    if ('locked' in c) {
      const armed = state.unlockArmed === dev.id;
      rows.push(`<div class="fp-row"><span class="fp-name">${c.locked ? T.locked : T.unlocked}</span><button type="button" class="fp-btn ${c.locked ? (armed ? 'danger' : '') : 'primary'}" data-act="lock" data-dev="${esc(dev.id)}">${c.locked ? (armed ? T.confirmUnlock : T.unlock) : T.lock}</button></div>`);
    }
    if ('speaker_playing' in c) {
      const track = [c.speaker_track, c.speaker_artist].filter(Boolean).join(' — ');
      rows.push(`<div class="fp-row"><span class="fp-name">${esc(track) || '—'}</span><button type="button" class="fp-btn" data-act="toggle" data-dev="${esc(dev.id)}" data-cap="speaker_playing">${c.speaker_playing ? T.pause : T.play}</button></div>`);
    }
    const reads = [];
    if (typeof c.measure_temperature === 'number') reads.push([T.temperature, `${c.measure_temperature.toFixed(1)}°`]);
    if (typeof c.measure_humidity === 'number') reads.push([T.humidity, `${Math.round(c.measure_humidity)}%`]);
    if (typeof c.measure_power === 'number') reads.push([T.power, `${Math.round(c.measure_power)} W`]);
    if ('alarm_contact' in c) reads.push(['', c.alarm_contact ? T.openState : T.closedState]);
    if ('alarm_motion' in c) reads.push(['', c.alarm_motion ? T.motion : T.noMotion]);
    for (const cap of ['alarm_smoke', 'alarm_water', 'alarm_co']) if (cap in c) reads.push(['', c[cap] ? T.alarm : T.ok]);
    for (const [k, v] of reads) rows.push(`<div class="fp-row"><span class="fp-name">${esc(k)}</span><span class="fp-val">${esc(v)}</span></div>`);
    if (!rows.length) rows.push(`<div class="fp-row"><span class="fp-val">${esc(kind)}</span></div>`);
    return rows.join('');
  }

  function itemsInRoom(level, room) {
    return (level.items || []).filter((i) => i.kind === 'device' && core.geom.pointInPolygon([i.x, i.y], room.points));
  }

  function renderSheet() {
    const level = currentLevel();
    if (!level || !state.sheet) return closeSheet();
    const { type, id } = state.sheet;
    if (type === 'energy') {
      const out = energySheet(id);
      $('sheet-title').textContent = out.title;
      // On the web page every part leads on to the Energy page
      $('sheet-body').innerHTML = out.body + (state.Homey.isWeb ? `<a class="fp-link" href="energy/">⚡ ${esc(T.allEnergy)} ›</a>` : '');
      $('sheet').classList.toggle('wide', !!out.wide);
      return;
    }
    let title = ''; let body = '';
    if (type === 'device') {
      const item = level.items.find((i) => i.id === id);
      const dev = item && state.devices.get(item.deviceId);
      if (!dev) return closeSheet();
      title = item.label || dev.name;
      body = deviceControls(dev);
    } else if (type === 'room') {
      const room = level.rooms.find((r) => r.id === id);
      if (!room) return closeSheet();
      title = room.name;
      const rd = core.roomReadings(room, state.devices);
      const parts = [];
      const stats = [];
      if (rd.temperature != null) stats.push(`<div><div class="fp-big">${rd.temperature.toFixed(1)}°</div><div class="fp-sub">${T.temperature}</div></div>`);
      if (rd.humidity != null) stats.push(`<div><div class="fp-big">${Math.round(rd.humidity)}%</div><div class="fp-sub">${T.humidity}</div></div>`);
      if (stats.length) parts.push(`<div class="fp-row" style="justify-content:flex-start;gap:28px">${stats.join('')}</div>`);
      if (rd.climateId) {
        const climate = state.devices.get(rd.climateId);
        const u = (climate.units && climate.units.target_temperature) || {};
        parts.push(`<div class="fp-row"><span class="fp-name">${T.target}</span><div class="fp-steps"><button type="button" class="fp-step" data-act="step" data-dev="${esc(climate.id)}" data-cap="target_temperature" data-step="${-(u.step || 0.5)}">−</button><span class="fp-big">${rd.target}°</span><button type="button" class="fp-step" data-act="step" data-dev="${esc(climate.id)}" data-cap="target_temperature" data-step="${u.step || 0.5}">+</button></div></div>`);
      }
      const devs = itemsInRoom(level, room).map((i) => ({ item: i, dev: state.devices.get(i.deviceId) })).filter((x) => x.dev);
      const lights = devs.filter((x) => core.deviceKind(x.dev) === 'light' && 'onoff' in x.dev.caps);
      if (lights.length) {
        const dimmable = lights.filter((x) => 'dim' in x.dev.caps);
        if (dimmable.length > 1) {
          const lit = dimmable.filter((x) => x.dev.caps.onoff);
          const level = lit.length ? Math.round((lit.reduce((s, x) => s + (x.dev.caps.dim || 0), 0) / lit.length) * 100) : 0;
          parts.push(`<div class="fp-row"><span class="fp-name">${T.brightness}</span><input type="range" min="0" max="100" value="${level}" data-act="room-dim" data-room="${esc(room.id)}"></div>`);
        }
        parts.push(`<div class="fp-row"><span class="fp-name">${T.lights}</span><div class="fp-btns"><button type="button" class="fp-btn" data-act="room-lights" data-room="${esc(room.id)}" data-value="1">${T.allOn}</button><button type="button" class="fp-btn" data-act="room-lights" data-room="${esc(room.id)}" data-value="0">${T.allOff}</button></div></div>`);
      }
      if (room.vacuum && state.Homey.isWeb) parts.push(`<button type="button" class="fp-btn" data-act="vacuum-room" data-room="${esc(room.id)}">🧹 ${esc(T.vacuumRoom)}</button>`);
      for (const x of devs) {
        const c = x.dev.caps;
        const value = core.deviceValueText(x.dev) || '';
        const control = 'onoff' in c
          ? `<button type="button" class="fp-toggle ${c.onoff ? 'on' : ''}" data-act="toggle" data-dev="${esc(x.dev.id)}" data-cap="onoff"></button>`
          : `<button type="button" class="fp-btn" data-act="open-item" data-item="${esc(x.item.id)}">›</button>`;
        parts.push(`<div class="fp-divider"></div><div class="fp-row"><span class="fp-name">${esc(x.item.label || x.dev.name)}</span><span class="fp-val">${esc(value)}</span>${control}</div>`);
      }
      body = parts.join('');
    } else if (type === 'opening') {
      const o = level.openings.find((x) => x.id === id);
      if (!o) return closeSheet();
      const devs = (o.devices || []).map((d) => state.devices.get(d)).filter(Boolean);
      title = devs.length === 1 ? devs[0].name : (o.label || '');
      body = devs.map((d) => `${devs.length > 1 ? `<div class="fp-sub">${esc(d.name)}</div>` : ''}${deviceControls(d)}`).join('<div class="fp-divider"></div>');
    }
    $('sheet-title').textContent = title;
    // Keep a slider steady while the user drags it.
    const active = document.activeElement;
    if (active && active.classList.contains('fp-range') && $('sheet-body').contains(active)) return;
    $('sheet-body').innerHTML = body;
  }

  function onSheetClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const dev = el.dataset.dev && state.devices.get(el.dataset.dev);
    const act = el.dataset.act;
    if (act === 'toggle' && dev) setCap(dev.id, el.dataset.cap, !dev.caps[el.dataset.cap]);
    if (act === 'set' && dev) setCap(dev.id, el.dataset.cap, el.dataset.value);
    if (act === 'step' && dev) {
      const u = (dev.units && dev.units[el.dataset.cap]) || {};
      let v = Math.round((dev.caps[el.dataset.cap] + Number(el.dataset.step)) * 10) / 10;
      if (typeof u.min === 'number') v = Math.max(u.min, v);
      if (typeof u.max === 'number') v = Math.min(u.max, v);
      setCap(dev.id, el.dataset.cap, v);
    }
    if (act === 'lock' && dev) {
      if (dev.caps.locked && state.settings.guest) return;
      if (!dev.caps.locked) setCap(dev.id, 'locked', true);
      else if (state.unlockArmed === dev.id) { state.unlockArmed = null; setCap(dev.id, 'locked', false); }
      else { state.unlockArmed = dev.id; refreshPanels(); setTimeout(() => { if (state.unlockArmed === dev.id) { state.unlockArmed = null; refreshPanels(); } }, 4000); }
    }
    if (act === 'room-lights') {
      const level = currentLevel();
      const room = level.rooms.find((r) => r.id === el.dataset.room);
      const on = el.dataset.value === '1';
      for (const i of itemsInRoom(level, room)) {
        const d = state.devices.get(i.deviceId);
        if (d && core.deviceKind(d) === 'light' && 'onoff' in d.caps && d.caps.onoff !== on) setCap(d.id, 'onoff', on);
      }
    }
    if (act === 'vacuum-room') {
      const room = currentLevel().rooms.find((r) => r.id === el.dataset.room);
      state.Homey.api('POST', '/actions/run', { plan: state.plan.id, kind: room.vacuum.kind, id: room.vacuum.id }).catch(() => {});
    }
    if (act === 'open-item') openSheet({ type: 'device', id: el.dataset.item });
    if (act === 'more') { const q = state.quick; closeQuick(); if (q) openSheet(q.target); }
    if (state.Homey.hapticFeedback) state.Homey.hapticFeedback();
  }

  function onSheetChange(ev) {
    const el = ev.target;
    if (el.dataset.act === 'set-value') { setCap(el.dataset.dev, el.dataset.cap, el.value); return; }
    if (el.dataset.act === 'room-dim') {
      const level = currentLevel();
      const value = Number(el.value) / 100;
      for (const i of itemsInRoom(level, level.rooms.find((r) => r.id === el.dataset.room))) {
        const d = state.devices.get(i.deviceId);
        if (!d || core.deviceKind(d) !== 'light' || !('dim' in d.caps)) continue;
        if (value > 0) setCap(d.id, 'dim', value);
        if ('onoff' in d.caps && d.caps.onoff !== (value > 0)) setCap(d.id, 'onoff', value > 0);
      }
      return;
    }
    if (el.dataset.act !== 'range') return;
    setCap(el.dataset.dev, el.dataset.cap, Number(el.value) / Number(el.dataset.scale || 1));
    el.blur();
  }

  /* ------------------------------------------------------------- gestures */

  // Tap runs the primary action, hold or double tap opens the popup.
  function setupGestures(svg) {
    let press = null;
    let lastTap = { id: null, at: 0, timer: null };

    const targetOf = (ev) => {
      const el = ev.target.closest && ev.target.closest('[data-kind]');
      return el ? { kind: el.dataset.kind, id: el.dataset.id, el } : null;
    };

    svg.addEventListener('pointerdown', (ev) => {
      const t = targetOf(ev);
      if (!t) return;
      if (t.el.classList.contains('fp-device')) t.el.classList.add('pressed');
      press = { t, x: ev.clientX, y: ev.clientY, held: false };
      press.timer = setTimeout(() => {
        if (!press) return;
        press.held = true;
        if (state.Homey.hapticFeedback) state.Homey.hapticFeedback();
        openFor(press.t);
      }, 480);
    });
    const cancel = () => {
      if (!press) return;
      clearTimeout(press.timer);
      press.t.el.classList.remove('pressed');
      press = null;
    };
    svg.addEventListener('pointermove', (ev) => {
      if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 10) cancel();
    });
    svg.addEventListener('pointercancel', cancel);
    svg.addEventListener('pointerleave', cancel);
    svg.addEventListener('pointerup', () => {
      if (!press) return;
      const { t, held } = press;
      cancel();
      if (held) return;
      const now = Date.now();
      if (lastTap.id === t.id && now - lastTap.at < 300) {
        clearTimeout(lastTap.timer);
        lastTap = { id: null, at: 0, timer: null };
        openFor(t);
        return;
      }
      clearTimeout(lastTap.timer);
      lastTap = { id: t.id, at: now, timer: setTimeout(() => { lastTap.id = null; tapFor(t); }, 260) };
    });
  }

  /* ----------------------------------------------------------------- zoom */

  function zoomKey() {
    const level = currentLevel();
    return `${level ? level.id : ''}|${state.view}|${state.turn}`;
  }

  // Web page only: the mouse wheel or two fingers zoom the 2D and 2.5D views, one finger moves around
  // while zoomed in. In the Homey app the widget keeps showing its whole plan, so the dashboard scrolls.
  function setupZoom(svg) {
    svg.style.touchAction = 'none';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'fp-zoom-reset';
    reset.hidden = true;
    reset.title = T.zoomReset;
    reset.setAttribute('aria-label', T.zoomReset);
    reset.textContent = '⤢';
    svg.parentNode.appendChild(reset);
    reset.addEventListener('click', () => { state.zoom = null; scheduleRender(); });

    const toSvg = (cx, cy) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = svg.createSVGPoint();
      p.x = cx; p.y = cy;
      const q = p.matrixTransform(m.inverse());
      return [q.x, q.y];
    };
    const current = () => (state.zoom && state.zoom.key === zoomKey() ? state.zoom : { key: zoomKey(), k: 1, c: state.baseCenter });
    // Zoom by f around p (plan point), which stays under the pointer.
    const zoomAt = (p, f) => {
      const z = current();
      if (!p || !z.c) return;
      const k = Math.min(8, Math.max(1, z.k * f));
      const c = [p[0] + (z.c[0] - p[0]) * (z.k / k), p[1] + (z.c[1] - p[1]) * (z.k / k)];
      state.zoom = k <= 1.02 ? null : { key: z.key, k, c };
      scheduleRender();
    };

    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      zoomAt(toSvg(ev.clientX, ev.clientY), Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });
    const pts = new Map();
    let pinch = null; let pan = null;
    svg.addEventListener('pointerdown', (ev) => {
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid: toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), k: current().k };
        pan = null;
      } else if (pts.size === 1 && state.zoom) pan = { x: ev.clientX, y: ev.clientY, c: state.zoom.c.slice(), moved: false };
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        zoomAt(pinch.mid, (pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.d / current().k);
        return;
      }
      if (!pan || !state.zoom) return;
      const dx = ev.clientX - pan.x; const dy = ev.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 10) return;
      pan.moved = true;
      const m = svg.getScreenCTM();
      const s = m && m.a ? 1 / m.a : 1;
      state.zoom.c = [pan.c[0] - dx * s, pan.c[1] - dy * s];
      scheduleRender();
    });
    const up = (ev) => {
      pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) pan = null;
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  }

  // Tap shows the controls right next to the device (or switches it at once, if that is chosen for this screen).
  function tapFor(t) {
    const level = currentLevel();
    if (!level) return;
    if (state.Homey.hapticFeedback) state.Homey.hapticFeedback();
    const direct = state.settings.tapAction === 'toggle';
    if (t.kind === 'item') {
      const item = level.items.find((i) => i.id === t.id);
      if (!item || item.kind !== 'device') return;
      if (direct) primaryAction(item); else openQuick({ type: 'device', id: item.id }, t.id);
    } else if (t.kind === 'room') openSheet({ type: 'room', id: t.id });
    else if (t.kind === 'opening') {
      const o = level.openings.find((x) => x.id === t.id);
      if (o && (o.devices || []).length) {
        const covers = o.devices.map((d) => state.devices.get(d)).filter((d) => d && core.deviceKind(d) === 'cover');
        if (direct && covers.length === o.devices.length) covers.forEach((d) => primaryAction({ deviceId: d.id, id: t.id }));
        else openQuick({ type: 'opening', id: t.id }, t.id);
      }
    }
  }

  /* ------------------------------------------------------- quick controls */

  function quickBox() {
    let box = document.getElementById('quick');
    if (!box) {
      box = document.createElement('div');
      box.id = 'quick';
      box.className = 'fp-quick';
      box.hidden = true;
      document.querySelector('.fp-stage').appendChild(box);
      box.addEventListener('click', onSheetClick);
      box.addEventListener('change', onSheetChange);
    }
    return box;
  }

  function openQuick(target, anchorId) {
    state.quick = { target, anchorId };
    state.unlockArmed = null;
    renderQuick();
  }

  function closeQuick() {
    state.quick = null;
    const box = document.getElementById('quick');
    if (box) box.hidden = true;
  }

  function refreshPanels() {
    if (state.sheet) renderSheet();
    if (state.quick) renderQuick();
  }

  function renderQuick() {
    const level = currentLevel();
    const q = state.quick;
    if (!level || !q) return closeQuick();
    const box = quickBox();
    let title = ''; let body = '';
    if (q.target.type === 'device') {
      const item = level.items.find((i) => i.id === q.target.id);
      const dev = item && state.devices.get(item.deviceId);
      if (!dev) return closeQuick();
      title = item.label || dev.name;
      body = deviceControls(dev);
    } else {
      const o = level.openings.find((x) => x.id === q.target.id);
      const devs = o ? (o.devices || []).map((d) => state.devices.get(d)).filter(Boolean) : [];
      if (!devs.length) return closeQuick();
      title = devs.length === 1 ? devs[0].name : (o.label || '');
      body = devs.map((d) => `${devs.length > 1 ? `<div class="fp-sub">${esc(d.name)}</div>` : ''}${deviceControls(d)}`).join('<div class="fp-divider"></div>');
    }
    // Keep a slider steady while it is being dragged.
    const active = document.activeElement;
    if (!(active && active.classList.contains('fp-range') && box.contains(active))) {
      box.innerHTML = `<div class="fp-quick-head"><b>${esc(title)}</b><button type="button" class="fp-x" data-act="more" aria-label="${esc(T.more)}">⋯</button></div><div class="fp-quick-body">${body}</div>`;
    }
    box.hidden = false;
    placeQuick(box, q.anchorId);
  }

  // Next to the device on screen: right of it when there is room, else left; kept inside the plan.
  function placeQuick(box, anchorId) {
    const stage = document.querySelector('.fp-stage');
    const anchors = [...stage.querySelectorAll(`[data-id="${CSS.escape(anchorId)}"]`)];
    const anchor = anchors.map((a) => a.getBoundingClientRect()).find((r) => r.width > 0 && r.height > 0);
    const s = stage.getBoundingClientRect();
    const bw = box.offsetWidth; const bh = box.offsetHeight;
    let x = s.width / 2 - bw / 2; let y = s.height / 2 - bh / 2;
    if (anchor) {
      const ax = anchor.left - s.left; const ay = anchor.top - s.top;
      x = ax + anchor.width + 10;
      if (x + bw > s.width - 8) x = ax - bw - 10;
      y = ay + anchor.height / 2 - bh / 2;
    }
    box.style.left = `${Math.max(8, Math.min(s.width - bw - 8, x))}px`;
    box.style.top = `${Math.max(8, Math.min(s.height - bh - 8, y))}px`;
  }

  function openFor(t) {
    const level = currentLevel();
    if (!level) return;
    if (t.kind === 'item') {
      const item = level.items.find((i) => i.id === t.id);
      if (item && item.kind === 'device') openSheet({ type: 'device', id: item.id });
    } else if (t.kind === 'room') openSheet({ type: 'room', id: t.id });
    else if (t.kind === 'opening') openSheet({ type: 'opening', id: t.id });
  }

  /* -------------------------------------------------------- side: clock+wx */

  function tickClock() {
    const now = new Date();
    $('clock-time').textContent = now.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
    $('clock-date').textContent = now.toLocaleDateString(navigator.language, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // Homey's weather objects are passed through as-is; read the common fields defensively.
  function pickTemp(o) {
    if (!o || typeof o !== 'object') return null;
    for (const k of ['temperature', 'temp', 'temperatureCurrent']) if (typeof o[k] === 'number') return o[k];
    return null;
  }
  function pickDesc(o) {
    if (!o || typeof o !== 'object') return '';
    return o.state || o.description || o.condition || o.summary || '';
  }

  // Homey's iconId values look like "clear_day", "partly_cloudy_night", "rain", ...
  function weatherIcon(id) {
    const s = String(id || '');
    if (/thunder/.test(s)) return '⛈️';
    if (/snow|sleet/.test(s)) return '🌨️';
    if (/rain|drizzle|shower/.test(s)) return '🌧️';
    if (/fog|mist|haze/.test(s)) return '🌫️';
    if (/partly/.test(s)) return /night/.test(s) ? '☁️' : '⛅';
    if (/cloud|overcast/.test(s)) return '☁️';
    if (/wind/.test(s)) return '💨';
    if (/clear/.test(s)) return /night/.test(s) ? '🌙' : '☀️';
    return '';
  }

  function toDate(h) {
    const when = h.time != null ? h.time : (h.when || h.date || h.datetime || h.timestamp);
    const d = when != null ? new Date(typeof when === 'number' && when < 1e12 ? when * 1000 : when) : null;
    return d && !isNaN(d) ? d : null;
  }

  async function loadWeather() {
    try {
      const data = await state.Homey.api('GET', '/weather');
      state.weather = data;
      const now = data && data.now;
      const hours = (Array.isArray(data && data.hourly) ? data.hourly : []).filter((h) => pickTemp(h) != null).slice(0, 6);
      const days = (Array.isArray(data && data.daily) ? data.daily : []).filter((h) => typeof h.temperatureMax === 'number').slice(1, 5);
      const t = pickTemp(now);
      const hourHtml = hours.map((h) => {
        const d = toDate(h);
        const label = d ? d.toLocaleTimeString(navigator.language, { hour: '2-digit' }) : '';
        return `<div class="fp-hour"><span>${esc(label)}</span><div>${weatherIcon(h.iconId)}</div><b>${Math.round(pickTemp(h))}°</b></div>`;
      }).join('');
      const dayHtml = days.map((h) => {
        const d = toDate(h);
        const label = d ? d.toLocaleDateString(navigator.language, { weekday: 'short' }) : '';
        return `<div class="fp-hour"><span>${esc(label)}</span><div>${weatherIcon(h.iconId)}</div><b>${Math.round(h.temperatureMax)}°</b><span>${Math.round(h.temperatureMin)}°</span></div>`;
      }).join('');
      $('weather').innerHTML = `${t != null ? `<div class="fp-wnow"><span class="fp-wtemp">${weatherIcon(now.iconId)} ${Math.round(t)}°</span><span class="fp-wdesc">${esc(pickDesc(now))}</span></div>` : ''}${hourHtml ? `<div class="fp-hours">${hourHtml}</div>` : ''}${dayHtml ? `<div class="fp-hours">${dayHtml}</div>` : ''}`;
    } catch (err) {
      $('weather').innerHTML = '';
    }
  }

  function dayLabel(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    if (diff <= 0) return T.today;
    if (diff === 1) return T.tomorrow;
    return d.toLocaleDateString(navigator.language, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  async function loadAgenda() {
    try {
      const data = await state.Homey.api('GET', '/agenda');
      const events = (data && data.events) || [];
      const now = Date.now();
      const time = (ms) => new Date(ms).toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
      let lastDay = '';
      const html = [];
      for (const ev of events.slice(0, state.settings.sidebar === 'bottom' ? 4 : 10)) {
        const start = new Date(Math.max(ev.start, ev.allDay ? ev.start : 0));
        const label = dayLabel(ev.start < now ? new Date(now) : start);
        if (label !== lastDay) { html.push(`<div class="fp-aday">${esc(label)}</div>`); lastDay = label; }
        const when = ev.allDay ? T.allDay : `${time(ev.start)}–${time(ev.end)}`;
        const live = ev.start <= now && ev.end > now ? ' now' : '';
        html.push(`<div class="fp-aev${live}"><i style="background:${esc(ev.color || 'var(--fp-accent)')}"></i><b>${esc(ev.title)}</b><span>${esc(when)}${ev.location ? ` · ${esc(ev.location)}` : ''}</span></div>`);
      }
      if (!events.length && data && data.errors && data.errors.length) html.push(`<div class="fp-aday">${esc(T.agendaError)}</div>`);
      $('agenda').innerHTML = html.join('');
    } catch (err) {
      $('agenda').innerHTML = '';
    }
  }

  function setupSide() {
    const mode = state.settings.sidebar || 'none';
    // 'energy': the Energy page takes the place of the side panel (dashboard-extras.js)
    $('side').hidden = mode === 'none' || mode === 'energy';
    $('app').classList.toggle('side-bottom', mode === 'bottom');
    if ($('side').hidden) return;
    tickClock();
    setInterval(tickClock, 15000);
    if (state.settings.sideWeather !== false) {
      loadWeather();
      setInterval(loadWeather, 15 * 60 * 1000);
    }
    if (state.settings.sideAgenda !== false) {
      loadAgenda();
      setInterval(loadAgenda, 5 * 60 * 1000);
    }
  }

  /* ----------------------------------------------------------------- data */

  async function load() {
    const s = state.settings;
    const planId = s.plan && s.plan.id;
    const res = await state.Homey.api('GET', `/plan${planId ? `?id=${encodeURIComponent(planId)}` : ''}`);
    state.plan = res.plan;
    state.links = res.links || null;
    // In a Homey dashboard: a button to the full-screen web page of this app.
    $('btn-full').hidden = !!state.Homey.isWeb || !(state.links && state.links.dashboard);
    state.devices = new Map((res.devices || []).map((d) => [d.id, d]));
    const pinned = s.level && s.level.id;
    const known = state.levelId === HOUSE ? hasHouse() : state.plan && state.plan.levels.some((l) => l.id === state.levelId);
    if (state.plan && (!state.levelId || !known)) {
      state.levelId = startOnHouse() ? HOUSE : pinned && state.plan.levels.some((l) => l.id === pinned) ? pinned : (state.plan.levels[0] || {}).id;
    }
    scheduleRender();
  }

  function applyCaps(changes) {
    let touched = false;
    for (const [id, caps] of Object.entries(changes || {})) {
      const dev = state.devices.get(id);
      if (!dev) continue;
      Object.assign(dev.caps, caps);
      touched = true;
    }
    if (touched) scheduleRender();
  }

  // Read-only hook for the browser interaction test (test/widget-interaction.js) and the web page's settings.
  window.__widgetState = () => state;

  window.onHomeyReady = async function onHomeyReady(Homey) {
    state.Homey = Homey;
    state.settings = Homey.getSettings() || {};
    // The two lower 2.5D views are gone: screens that had one get the steep view
    const view = ['iso', 'game'].includes(state.settings.view) ? 'steep' : state.settings.view || '2d';
    state.settings.view = view;
    state.view = view;
    state.lastView3d = view === '2d' ? (has3d() ? '3d' : 'steep') : view;
    state.turn = Number(state.settings.turn || 0);
    Homey.ready({ height: `${Number(state.settings.aspect) || 75}%` });

    setupGestures($('plan'));
    // Taps on the drawn house (screens without 3D)
    $('plan').addEventListener('click', (ev) => {
      const el = inHouse() && ev.target.closest && ev.target.closest('[data-house]');
      if (el) houseTap(el.dataset.house, el.dataset.id || null);
    });
    if (Homey.isWeb) setupZoom($('plan'));
    window.addEventListener('fp3d-ready', () => {
      // house3d.js may load after the plan: start on the house once it is there
      if (state.plan && !state.picked && state.levelId !== HOUSE && startOnHouse()) state.levelId = HOUSE;
      scheduleRender();
    });
    if ($('house3d')) {
      // On a Homey dashboard only while the house is in view: a widget on a floor plan asks for nothing
      const wanted = () => !document.hidden && (Homey.isWeb || inHouse());
      if (wanted()) loadEnergy();
      setInterval(() => { if (wanted()) loadEnergy(); }, 10000);
      // the weather on the house, also without the side panel
      if (wanted() && !state.weather) loadWeather();
      setInterval(() => { if (wanted()) loadWeather(); }, 15 * 60 * 1000);
    }
    setupSide();
    $('btn-view').addEventListener('click', () => {
      // 2D <-> 3D on the web page (when the browser can), 2D <-> 2.5D elsewhere.
      if (state.lastView3d === '3d' && !has3d()) state.lastView3d = 'steep';
      if (state.view === '2d' && has3d() && state.settings.view !== 'steep') state.lastView3d = '3d';
      state.view = state.view === '2d' ? state.lastView3d : '2d';
      scheduleRender();
    });
    $('btn-full').addEventListener('click', () => { if (state.links && state.links.dashboard) Homey.popup(state.links.dashboard); });
    $('btn-turn').addEventListener('click', () => {
      state.turn = (state.turn + 1) % 4;
      if (state.view === '3d' && state.v3d) state.v3d.resetCamera(state.turn);
      scheduleRender();
    });
    $('levels').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-level]');
      if (b) { state.levelId = b.dataset.level; state.picked = true; closeSheet(); scheduleRender(); }
    });
    $('sheet').addEventListener('click', (ev) => { if (ev.target === $('sheet')) closeSheet(); });
    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet-body').addEventListener('click', onSheetClick);
    $('sheet-body').addEventListener('pointermove', onChartMove);
    $('sheet-body').addEventListener('pointerdown', onChartMove);
    $('sheet-body').addEventListener('change', onSheetChange);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { closeSheet(); closeQuick(); } });
    // A tap elsewhere (not on the controls, not on another device) closes the quick controls.
    document.addEventListener('pointerdown', (ev) => {
      if (!state.quick) return;
      if (ev.target.closest('#quick') || ev.target.closest('[data-kind="item"], [data-kind="opening"]')) return;
      closeQuick();
    }, true);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleRender);
    window.addEventListener('fp-theme', scheduleRender);

    Homey.on('caps', applyCaps);
    Homey.on('plan', (msg) => { if (!state.plan || !msg || msg.id === state.plan.id) load().catch(() => {}); });
    Homey.on('devices', () => load().catch(() => {}));

    try {
      await load();
    } catch (err) {
      $('empty').hidden = false;
      $('empty').textContent = String(err && err.message ? err.message : err);
    }
  };
}());
