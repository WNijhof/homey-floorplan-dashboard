/* global HomeyWeb */
/*
 * What a screen in the house adds to the plan: a strip that only shows what needs attention, buttons for moods and
 * Flows, the "I'm leaving" check, a clock for the night, and the doorbell. Works on the state of widget.js.
 */
(function () {
  'use strict';

  var STRINGS = {
    en: {
      leave: "I'm leaving", leaveTitle: 'Before you go', allFine: 'Everything is closed and off.', open: 'Open', unlocked: 'Not locked', lights: 'Lamps on', lightsOff: 'All lamps are off', allOff: 'Turn all lamps off', sure: 'Tap again to turn them off', done: 'Done',
      openCount: ' open', rainOpen: 'Rain is coming, %n open', lowBattery: ' low on battery', cheapest: 'Cheapest at ', cheapNow: 'Electricity is cheap now', tomorrow: 'Tomorrow: ', today: 'Today: ', ring: 'Someone is at the door', runFailed: 'Could not start',
    },
    nl: {
      leave: 'Ik ga weg', leaveTitle: 'Voordat je gaat', allFine: 'Alles is dicht en uit.', open: 'Open', unlocked: 'Niet op slot', lights: 'Lampen aan', lightsOff: 'Alle lampen zijn uit', allOff: 'Alle lampen uit', sure: 'Tik nogmaals om ze uit te doen', done: 'Klaar',
      openCount: ' open', rainOpen: 'Er komt regen, %n open', lowBattery: ' batterij bijna leeg', cheapest: 'Goedkoopst om ', cheapNow: 'Stroom is nu goedkoop', tomorrow: 'Morgen: ', today: 'Vandaag: ', ring: 'Er staat iemand aan de deur', runFailed: 'Starten lukte niet',
    },
  };
  var lang = (navigator.language || 'en').slice(0, 2);
  var T = STRINGS[lang] || STRINGS.en;
  var $ = function (id) { return document.getElementById(id); };
  var st = function () { return window.__widgetState(); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ALARMS = ['alarm_smoke', 'alarm_water', 'alarm_co', 'alarm_co2', 'alarm_heat', 'alarm_gas', 'alarm_fire'];
  var BELL = ['alarm_generic', 'alarm_doorbell', 'doorbell', 'button'];
  var BINS = /(container|afval|vuilnis|kliko|\bgft\b|\bpmd\b|oud papier|\bbins?\b|trash|garbage|recycl|rubbish)/i;
  var core = window.FloorplanCore;
  var agenda = [];
  var waste = null; // from a waste app on the Homey, then the agenda is not asked

  function devices() {
    var list = [];
    st().devices.forEach(function (d) { list.push(d); });
    return list;
  }
  var isOpen = function (d) { return d.caps.alarm_contact === true; };
  // Also what only its name tells is a lamp, on a plug; other sockets (a fridge) stay on
  var LAMP_NAME = /(lamp|licht|light|verlichting)/i;
  var isLightOn = function (d) { return (core.deviceKind(d) === 'light' || ('onoff' in d.caps && LAMP_NAME.test(d.name))) && core.isOn(d); };
  function send(deviceId, capabilityId, value) {
    return HomeyWeb.request('POST', '/capability', { deviceId: deviceId, capabilityId: capabilityId, value: value });
  }

  /* --------------------------------------- what needs attention right now */

  function attention() {
    var out = [];
    var all = devices();
    all.forEach(function (d) {
      if (ALARMS.some(function (a) { return d.caps[a] === true; })) out.push({ cls: 'alarm', icon: '🚨', text: d.name });
    });
    var open = all.filter(isOpen);
    if (open.length) {
      var weather = st().weather;
      var soon = weather && Array.isArray(weather.hourly) ? weather.hourly.slice(0, 3) : [];
      var rain = window.HouseCore && soon.some(function (h) { return window.HouseCore.weatherKind(h.iconId) === 'rain'; });
      out.push(rain ? { cls: 'warn', icon: '🌧', text: T.rainOpen.replace('%n', open.length), leave: true } : { icon: '🚪', text: open.length + T.openCount, leave: true });
    }
    var low = all.filter(function (d) { return d.caps.alarm_battery === true || (typeof d.caps.measure_battery === 'number' && d.caps.measure_battery < 15); });
    if (low.length) out.push({ icon: '🪫', text: low.length + T.lowBattery });
    var now = new Date();
    var morning = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (waste && waste.today && now.getHours() < 12) out.push({ icon: '🗑', text: T.today + waste.today });
    if (waste && waste.tomorrow) out.push({ icon: '🗑', text: T.tomorrow + waste.tomorrow });
    agenda.forEach(function (e) {
      var days = Math.floor((new Date(e.start) - morning) / 86400000);
      if (!waste && BINS.test(e.title || '') && days >= 0 && days <= 1 && (days === 1 || now.getHours() < 12)) out.push({ icon: '🗑', text: (days ? T.tomorrow : T.today) + e.title });
    });
    return out.concat(window.FpPanels.chips()).slice(0, 6);
  }

  function actions() {
    var plan = st().plan;
    return (plan && plan.actions) || [];
  }

  function renderStrip() {
    var strip = $('strip');
    var items = attention();
    var buttons = actions();
    strip.hidden = !st().plan;
    fill('attention', items.map(function (i) {
      return '<button type="button" class="fp-chip ' + (i.cls || '') + '"' + (i.leave ? ' data-x="leave"' : i.x ? ' data-sheet="' + i.x + '"' : '') + '>' + i.icon + ' ' + esc(i.text) + '</button>';
    }).join(''));
    fill('actions', buttons.map(function (a, n) {
      return '<button type="button" class="fp-chip action" data-x="run" data-n="' + n + '">' + (a.kind === 'mood' ? '🎨' : '▶') + ' ' + esc(a.name) + '</button>';
    }).join('') + window.FpPanels.buttons().map(function (b) {
      return '<button type="button" class="fp-chip action" data-sheet="' + b[0] + '">' + b[1] + ' ' + esc(b[2]) + '</button>';
    }).join('') + '<button type="button" class="fp-chip action" data-x="leave">👋 ' + esc(T.leave) + '</button>');
  }

  // Only when something changed: a button being pressed stays the same button.
  var filled = {};
  function fill(id, html) {
    if (filled[id] === html) return;
    filled[id] = html;
    $(id).innerHTML = html;
  }

  /* -------------------------------------------------------- I'm leaving */

  var armed = false;
  function renderLeave() {
    var all = devices();
    var group = function (title, list) {
      return list.length ? '<p class="fp-sub">' + esc(title) + '</p>' + list.map(function (d) { return '<div class="fp-row"><span class="fp-name">' + esc(d.name) + '</span></div>'; }).join('') : '';
    };
    var open = all.filter(isOpen);
    var unlocked = all.filter(function (d) { return d.caps.locked === false; });
    var lights = all.filter(isLightOn);
    var body = group(T.open, open) + group(T.unlocked, unlocked) + group(T.lights, lights);
    if (!body) body = '<p>' + esc(T.allFine) + '</p>';
    else if (!lights.length) body += '<p class="fp-sub">' + esc(T.lightsOff) + '</p>';
    if (lights.length) body += '<button type="button" class="fp-btn primary" data-x="lights-off">' + esc(armed ? T.sure : T.allOff) + '</button>';
    $('sheet-title').textContent = T.leaveTitle;
    $('sheet-body').innerHTML = body;
    $('sheet').hidden = false;
  }

  /* ------------------------------------------------- the clock at night */

  var lastTouch = Date.now();
  var saving = false;
  function saverWanted() {
    var mode = HomeyWeb.Homey.getSettings().saver || 'off';
    if (mode === 'off' || Date.now() - lastTouch < 5 * 60000 || !$('sheet').hidden) return false;
    if (mode === 'always') return true;
    var e = st().energy;
    var hour = new Date().getHours();
    return e && typeof e.night === 'boolean' ? e.night : hour >= 23 || hour < 7;
  }
  function setSaver(on) {
    if (on === saving) return;
    saving = on;
    $('saver').hidden = !on;
    // with the page out of view its 3D stops drawing
    $('app').style.display = on ? 'none' : '';
    if (!on) window.dispatchEvent(new Event('resize'));
    if (on) drawClock();
  }
  function drawClock() {
    var now = new Date();
    var weather = st().weather;
    var temp = weather && weather.now && typeof weather.now.temperature === 'number' ? ' · ' + Math.round(weather.now.temperature) + '°' : '';
    $('saver-time').textContent = now.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
    $('saver-date').textContent = now.toLocaleDateString(navigator.language, { weekday: 'long', day: 'numeric', month: 'long' }) + temp;
    // a slow walk over the screen, so nothing burns in
    var m = now.getMinutes();
    $('saver').firstElementChild.style.transform = 'translate(' + ((m * 7) % 30 - 15) + 'vw,' + ((m * 11) % 40 - 20) + 'vh)';
  }
  function touched() {
    lastTouch = Date.now();
    setSaver(false);
  }

  /* ---------------------------------------------------------- the doorbell */

  var bells = {};
  function isBell(d) {
    return d.cls === 'doorbell' || /(deurbel|doorbell)/i.test(d.name || '');
  }
  function ring(d) {
    touched();
    $('ring-name').textContent = d.name;
    $('ring-text').textContent = T.ring;
    var img = $('ring-img');
    img.hidden = !d.camera;
    // Homey serves the picture of a camera on its own address
    if (d.camera) img.src = location.protocol + '//' + location.hostname + d.camera + (d.camera.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    $('ring').hidden = false;
    clearTimeout(ring.timer);
    ring.timer = setTimeout(function () { $('ring').hidden = true; }, 45000);
  }
  function watchBells() {
    devices().filter(isBell).forEach(function (d) {
      var now = BELL.some(function (c) { return d.caps[c] === true; });
      if (now && bells[d.id] === false) ring(d);
      bells[d.id] = now;
    });
  }

  // The alarm goes off, or smoke, CO or water: over everything, also over the clock at night.
  var sirenFor = null;
  function watchAlarm() {
    var a = window.FpPanels.alarm();
    var danger = devices().filter(function (d) { return ALARMS.some(function (c) { return d.caps[c] === true; }); })[0];
    var who = (a && a.firing) || danger || null;
    var id = who ? who.id : null;
    if (id === sirenFor) return;
    sirenFor = id;
    $('siren').hidden = !who;
    if (!who) return;
    touched();
    $('siren-name').textContent = who.name;
    $('siren-off').hidden = !(a && a.firing) || !!HomeyWeb.Homey.getSettings().guest;
  }

  /* ---------------------------------------------------------------- start */

  function loadSlow() {
    HomeyWeb.request('GET', '/agenda').then(function (a) { agenda = (a && a.events) || []; renderStrip(); }).catch(function () {});
    HomeyWeb.request('GET', '/waste').then(function (w) { waste = w; renderStrip(); }).catch(function () {});
    if (window.__widgetState && st().plan) window.FpPanels.loadSlow();
  }

  /* ------------------------------------------- what a Flow asks to show */

  var backTimers = {};
  function goTo(levelId) {
    var tab = document.querySelector('#levels [data-level="' + levelId + '"]');
    if (tab) tab.click();
  }
  function restoreIn(what, seconds, undo) {
    clearTimeout(backTimers[what]);
    backTimers[what] = seconds > 0 ? setTimeout(undo, seconds * 1000) : null;
  }
  function energyOverlay(show) {
    var box = $('energy-view');
    box.hidden = !show;
    box.innerHTML = show ? '<iframe src="energy/?embed=1" title="Energy"></iframe>' : '';
  }
  // Only on the named screen, or on all of them
  function onScreen(msg) {
    if (!msg || (msg.screen && msg.screen !== HomeyWeb.screenName())) return;
    touched();
    var from = st().levelId;
    var seconds = msg.seconds;
    if (msg.what === 'camera' && window.FpPanels.showCamera()) restoreIn('camera', seconds, function () { $('camview').hidden = true; });
    if (msg.what === 'message') { window.FpPanels.message(msg.detail); restoreIn('message', seconds, function () { $('ring').hidden = true; }); }
    if (msg.what === 'energy') { energyOverlay(true); restoreIn('energy', seconds, function () { energyOverlay(false); }); }
    if (msg.what === 'house' || msg.what === 'level') {
      var level = msg.what === 'house' ? { id: 'house' } : st().plan.levels.filter(function (l) { return l.name.toLowerCase() === msg.detail.toLowerCase(); })[0] || st().plan.levels[0];
      goTo(level.id);
      restoreIn('level', seconds, function () { goTo(from); });
    }
  }

  /* --------------------------------------------------- back to the start */

  function goHome() {
    var s = HomeyWeb.Homey.getSettings();
    var minutes = Number(s.landing);
    if (!minutes || saving || Date.now() - lastTouch < minutes * 60000 || !$('sheet').hidden) return;
    var start = s.start === 'level' ? (s.level && s.level.id) || st().plan.levels[0].id : 'house';
    if (st().levelId !== start) goTo(start);
  }

  /* ---------------------------------------------------- how this screen is */

  function applyScreen() {
    var s = HomeyWeb.Homey.getSettings();
    document.body.classList.toggle('fp-guest', !!s.guest);
    if (s.sidebar === 'energy' && !$('split-energy')) {
      var frame = document.createElement('iframe');
      frame.id = 'split-energy';
      frame.className = 'card fp-split';
      frame.title = 'Energy';
      frame.src = 'energy/?embed=1';
      document.querySelector('.layout').appendChild(frame);
    }
  }

  document.addEventListener('click', function (ev) {
    var sheet = ev.target.closest && ev.target.closest('[data-sheet]');
    if (sheet) window.FpPanels.open(sheet.dataset.sheet);
    if (ev.target.id === 'energy-view') energyOverlay(false);
    var b = ev.target.closest && ev.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'leave') { armed = false; renderLeave(); }
    if (b.dataset.x === 'lights-off') {
      if (!armed) { armed = true; renderLeave(); return; }
      armed = false;
      devices().filter(isLightOn).forEach(function (d) { send(d.id, 'onoff', false).catch(function () {}); });
      $('sheet').hidden = true;
    }
    if (b.dataset.x === 'run') {
      var a = actions()[Number(b.dataset.n)];
      if (!a) return;
      b.disabled = true;
      HomeyWeb.request('POST', '/actions/run', { plan: st().plan.id, kind: a.kind, id: a.id })
        .catch(function () { b.title = T.runFailed; b.classList.add('alarm'); })
        .then(function () { setTimeout(function () { b.disabled = false; b.classList.remove('alarm'); }, 1500); });
    }
  });
  $('ring').addEventListener('click', function () { $('ring').hidden = true; });
  $('siren-off').addEventListener('click', function () { var a = window.FpPanels.alarm(); if (a) send((a.firing || a.device).id, 'homealarm_state', 'disarmed').catch(function () {}); });
  ['pointerdown', 'keydown'].forEach(function (name) { window.addEventListener(name, touched, true); });

  var started = false;
  setInterval(function () {
    if (!window.__widgetState || !st().plan) return;
    if (!started) { started = true; applyScreen(); loadSlow(); }
    watchBells();
    watchAlarm();
    goHome();
    if (saverWanted()) setSaver(true);
    if (saving) drawClock(); else { renderStrip(); window.FpPanels.tick(); }
  }, 1000);
  applyScreen();
  HomeyWeb.Homey.on('screen', onScreen);
  HomeyWeb.Homey.on('lists', function () { window.FpPanels.reloadLists(); });
  HomeyWeb.Homey.on('advice', function (a) { window.FpPanels.state.advice = (a && a.items) || []; });
  setInterval(loadSlow, 5 * 60000);

  window.__extras = { touched: touched, setSaver: setSaver, attention: attention, onScreen: onScreen, goHome: goHome };
}());
