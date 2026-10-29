/* global FloorplanCore */
'use strict';

(function () {
  const core = FloorplanCore;

  const STRINGS = {
    en: {
      noPlan: 'No floor plan yet. Draw one in the app settings of Floorplan Live.',
      on: 'On', brightness: 'Brightness', position: 'Position', open: 'Open', close: 'Close', stop: 'Stop',
      target: 'Target', temperature: 'Temperature', humidity: 'Humidity', power: 'Power',
      locked: 'Locked', unlocked: 'Unlocked', lock: 'Lock', unlock: 'Unlock', confirmUnlock: 'Tap again to unlock',
      lights: 'Lights', allOn: 'All on', allOff: 'All off', devices: 'Devices', play: 'Play', pause: 'Pause',
      openState: 'Open', closedState: 'Closed', motion: 'Motion', noMotion: 'No motion', alarm: 'Alarm', ok: 'OK',
      unavailable: 'Unavailable', failed: 'Could not reach the device', more: 'More',
      today: 'Today', tomorrow: 'Tomorrow', allDay: 'All day', agendaError: 'Calendar could not be loaded',
      zoomReset: 'Show the whole level',
    },
    nl: {
      noPlan: 'Nog geen plattegrond. Teken er een in de app-instellingen van Plattegrond Live.',
      on: 'Aan', brightness: 'Helderheid', position: 'Stand', open: 'Open', close: 'Dicht', stop: 'Stop',
      target: 'Doel', temperature: 'Temperatuur', humidity: 'Luchtvochtigheid', power: 'Vermogen',
      locked: 'Op slot', unlocked: 'Niet op slot', lock: 'Op slot doen', unlock: 'Ontgrendelen', confirmUnlock: 'Tik nogmaals om te ontgrendelen',
      lights: 'Lampen', allOn: 'Alles aan', allOff: 'Alles uit', devices: 'Apparaten', play: 'Afspelen', pause: 'Pauze',
      openState: 'Open', closedState: 'Dicht', motion: 'Beweging', noMotion: 'Geen beweging', alarm: 'Alarm', ok: 'OK',
      unavailable: 'Niet beschikbaar', failed: 'Apparaat niet bereikbaar', more: 'Meer',
      today: 'Vandaag', tomorrow: 'Morgen', allDay: 'Hele dag', agendaError: 'Agenda kon niet worden geladen',
      zoomReset: 'Hele verdieping tonen',
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
  };

  function isDark() {
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
    return !!($('view3d') && window.FloorplanView3D && window.FloorplanView3D.supported);
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
      state.v3d.sync({ plan: state.plan, level, devices: state.devices, dark, furniture: s.furniture !== false, turn: state.turn, values: s.values !== false, names: s.names || 'devices' });
      renderLevels();
      if (state.sheet) renderSheet();
      if (state.quick) renderQuick();
      return;
    }
    const opts = {
      plan: state.plan,
      level,
      devices: state.devices,
      view: { mode: state.view === '3d' ? 'iso' : state.view, turn: state.turn },
      palette: dark ? core.DARK_PALETTE : core.LIGHT_PALETTE,
      modelBase: state.Homey && state.Homey.isWeb ? 'models/' : null,
      glow: s.glow || 'soft',
      tint: s.tint || 'none',
      furniture: s.furniture !== false,
      values: s.values !== false,
      names: s.names || 'devices',
      idPrefix: 'w',
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
    svg.innerHTML = out.svg;
    renderLevels();
    if (state.sheet) renderSheet();
    if (state.quick) renderQuick();
  }

  function renderLevels() {
    const box = $('levels');
    const levels = state.plan ? state.plan.levels : [];
    const pinned = state.settings.level && state.settings.level.id;
    box.hidden = levels.length < 2 || !!pinned;
    if (box.hidden) return;
    box.innerHTML = levels.map((l) => `<button type="button" data-level="${esc(l.id)}" class="${l.id === (currentLevel() || {}).id ? 'active' : ''}">${esc(l.name)}</button>`).join('');
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
        parts.push(`<div class="fp-row"><span class="fp-name">${T.lights}</span><div class="fp-btns"><button type="button" class="fp-btn" data-act="room-lights" data-room="${esc(room.id)}" data-value="1">${T.allOn}</button><button type="button" class="fp-btn" data-act="room-lights" data-room="${esc(room.id)}" data-value="0">${T.allOff}</button></div></div>`);
      }
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
    if (act === 'open-item') openSheet({ type: 'device', id: el.dataset.item });
    if (act === 'more') { const q = state.quick; closeQuick(); if (q) openSheet(q.target); }
    if (state.Homey.hapticFeedback) state.Homey.hapticFeedback();
  }

  function onSheetChange(ev) {
    const el = ev.target;
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
    $('side').hidden = mode === 'none';
    $('app').classList.toggle('side-bottom', mode === 'bottom');
    if (mode === 'none') return;
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
    if (state.plan && (!state.levelId || !state.plan.levels.some((l) => l.id === state.levelId))) {
      state.levelId = pinned && state.plan.levels.some((l) => l.id === pinned) ? pinned : (state.plan.levels[0] || {}).id;
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
    const view = state.settings.view || '2d';
    state.view = view;
    state.lastView3d = view === '2d' ? (has3d() ? '3d' : 'iso') : view;
    state.turn = Number(state.settings.turn || 0);
    Homey.ready({ height: `${Number(state.settings.aspect) || 75}%` });

    setupGestures($('plan'));
    if (Homey.isWeb) setupZoom($('plan'));
    window.addEventListener('fp3d-ready', scheduleRender);
    setupSide();
    $('btn-view').addEventListener('click', () => {
      // 2D <-> 3D on the web page (when the browser can), 2D <-> 2.5D elsewhere.
      if (state.lastView3d === '3d' && !has3d()) state.lastView3d = 'iso';
      if (state.view === '2d' && has3d() && state.settings.view !== 'iso' && state.settings.view !== 'game' && state.settings.view !== 'steep') state.lastView3d = '3d';
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
      if (b) { state.levelId = b.dataset.level; closeSheet(); scheduleRender(); }
    });
    $('sheet').addEventListener('click', (ev) => { if (ev.target === $('sheet')) closeSheet(); });
    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet-body').addEventListener('click', onSheetClick);
    $('sheet-body').addEventListener('change', onSheetChange);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { closeSheet(); closeQuick(); } });
    // A tap elsewhere (not on the controls, not on another device) closes the quick controls.
    document.addEventListener('pointerdown', (ev) => {
      if (!state.quick) return;
      if (ev.target.closest('#quick') || ev.target.closest('[data-kind="item"], [data-kind="opening"]')) return;
      closeQuick();
    }, true);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleRender);

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
