/* global HomeyWeb */
/*
 * The panels of the web page beside the plan: energy advice, the alarm, climate per room, shared lists and meals, Logic
 * variables, cameras, who is home, what is playing and the robot vacuum. dashboard-extras.js shows their chips and buttons.
 */
(function () {
  'use strict';

  var STRINGS = {
    en: {
      surplus: '%v to spare: a good moment for the washing or the car', cheapNow: 'Electricity is cheap until %t', cheapAt: 'Cheapest from %t', dear: 'Electricity is dear now', sunTomorrow: 'A lot of sun tomorrow (%k kWh): charge the car then',
      alarm: 'Alarm', alarmOn: 'Alarm on', alarmPartial: 'Alarm partly on', alarmOff: 'Alarm off', arm: 'On', partial: 'Partly', disarm: 'Off', armPrompt: 'Set the alarm', siren: 'Alarm!',
      climate: 'Climate', noClimate: 'No rooms with a temperature on this plan.', target: 'Target', mode: 'Mode', lists: 'Lists', shopping: 'Shopping', tasks: 'Tasks', meals: 'Meals', add: 'Add', clearDone: 'Remove what is done', mealToday: 'Today we eat',
      mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
      variables: 'Variables', yes: 'Yes', no: 'No', camera: 'Camera', vacuum: 'Vacuum', vacuumBusy: 'Vacuum is cleaning', start: 'Start', dock: 'Back to the dock', stop: 'Stop', home: 'home', away: 'away', asleep: 'asleep', people: 'Who is home', message: 'Message', close: 'Close',
    },
    nl: {
      surplus: '%v over: goed moment voor de was of de auto', cheapNow: 'Stroom is goedkoop tot %t', cheapAt: 'Goedkoopst vanaf %t', dear: 'Stroom is nu duur', sunTomorrow: 'Morgen veel zon (%k kWh): laad de auto dan',
      alarm: 'Alarm', alarmOn: 'Alarm aan', alarmPartial: 'Alarm deels aan', alarmOff: 'Alarm uit', arm: 'Aan', partial: 'Deels', disarm: 'Uit', armPrompt: 'Alarm instellen', siren: 'Alarm!',
      climate: 'Klimaat', noClimate: 'Geen kamers met een temperatuur op deze plattegrond.', target: 'Doel', mode: 'Stand', lists: 'Lijstjes', shopping: 'Boodschappen', tasks: 'Taken', meals: 'Eten', add: 'Toevoegen', clearDone: 'Afgevinkte weghalen', mealToday: 'Vandaag eten we',
      mon: 'Maandag', tue: 'Dinsdag', wed: 'Woensdag', thu: 'Donderdag', fri: 'Vrijdag', sat: 'Zaterdag', sun: 'Zondag',
      variables: 'Variabelen', yes: 'Ja', no: 'Nee', camera: 'Camera', vacuum: 'Stofzuiger', vacuumBusy: 'Stofzuiger is bezig', start: 'Start', dock: 'Terug naar het dock', stop: 'Stop', home: 'thuis', away: 'weg', asleep: 'slaapt', people: 'Wie is er thuis', message: 'Bericht', close: 'Sluiten',
    },
  };
  var lang = (navigator.language || 'en').slice(0, 2);
  var T = STRINGS[lang] || STRINGS.en;
  var $ = function (id) { return document.getElementById(id); };
  var st = function () { return window.__widgetState(); };
  var core = window.FloorplanCore;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var IDLE_VACUUM = /^(docked|charging|stopped|idle|paused)$/;
  var state = { open: null, listTab: 'shopping', lists: null, advice: [], people: [], variables: [], html: {} };

  function devices() {
    var list = [];
    st().devices.forEach(function (d) { list.push(d); });
    return list;
  }
  function find(test) { return devices().filter(test); }
  function send(id, cap, value) { return HomeyWeb.request('POST', '/capability', { deviceId: id, capabilityId: cap, value: value }); }
  function clock(t) { return new Date(t).toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' }); }
  function watts(w) { return w >= 1000 ? (w / 1000).toLocaleString(lang, { maximumFractionDigits: 1 }) + ' kW' : w + ' W'; }
  var guest = function () { return !!HomeyWeb.Homey.getSettings().guest; };
  var alarmDevices = function () { return find(function (d) { return 'homealarm_state' in d.caps; }); };
  var vacuums = function () { return find(function (d) { return d.cls === 'vacuumcleaner' || 'vacuumcleaner_state' in d.caps; }); };
  var cameras = function () { return find(function (d) { return !!d.camera; }); };

  // Replaces content only when it differs, so a finger on a button or a cursor in a field stays where it is.
  function fill(el, html) {
    if (!el || state.html[el.id] === html) return;
    state.html[el.id] = html;
    el.innerHTML = html;
  }

  /* -------------------------------------------------------------- advice */

  function adviceText(a) {
    return T[a.id].replace('%v', a.watts ? watts(a.watts) : '').replace('%t', clock(a.until || a.at || 0)).replace('%k', a.kWh);
  }

  /* --------------------------------------------------------------- alarm */

  // What the alarm says now: armed in any way, and whether it goes off.
  function alarmState() {
    var list = alarmDevices();
    if (!list.length) return null;
    var armed = list.filter(function (d) { return d.caps.homealarm_state && d.caps.homealarm_state !== 'disarmed'; });
    var firing = armed.filter(function (d) { return d.caps.alarm_generic === true || d.caps.alarm_heimdall === true || d.caps.alarm_tamper === true; });
    return { device: armed[0] || list[0], state: (armed[0] || list[0]).caps.homealarm_state || 'disarmed', firing: firing[0] || null };
  }

  function renderAlarm() {
    var row = [['armed', T.arm], ['partially_armed', T.partial]].concat(guest() ? [] : [['disarmed', T.disarm]]);
    return alarmDevices().map(function (d) {
      var now = d.caps.homealarm_state || 'disarmed';
      return '<p class="fp-sub">' + esc(d.name) + '</p><div class="fp-btns fp-wide">' + row.map(function (r) {
        return '<button type="button" class="fp-btn' + (now === r[0] ? ' primary' : '') + '" data-p="alarm" data-dev="' + esc(d.id) + '" data-value="' + r[0] + '">' + esc(r[1]) + '</button>';
      }).join('') + '</div>';
    }).join('');
  }

  /* ------------------------------------------------------------- climate */

  function renderClimate() {
    var plan = st().plan;
    var out = [];
    (plan ? plan.levels : []).forEach(function (level) {
      var rows = [];
      level.rooms.forEach(function (room) {
        var rd = core.roomReadings(room, st().devices);
        if (rd.temperature == null && !rd.climateId) return;
        var value = (rd.temperature != null ? rd.temperature.toFixed(1) + '°' : '') + (rd.humidity != null ? ' · ' + Math.round(rd.humidity) + '%' : '');
        var d = rd.climateId && st().devices.get(rd.climateId);
        var control = '';
        if (d && typeof d.caps.target_temperature === 'number') {
          control = '<div class="fp-steps"><button type="button" class="fp-step" data-act="step" data-dev="' + esc(d.id) + '" data-cap="target_temperature" data-step="-0.5">−</button><b>' + d.caps.target_temperature.toFixed(1) + '°</b><button type="button" class="fp-step" data-act="step" data-dev="' + esc(d.id) + '" data-cap="target_temperature" data-step="0.5">+</button></div>';
          var modes = d.units && d.units.thermostat_mode && d.units.thermostat_mode.values;
          if (modes) {
            control += '<select data-act="set-value" data-dev="' + esc(d.id) + '" data-cap="thermostat_mode">' + modes.map(function (m) {
              return '<option value="' + esc(m.id) + '"' + (m.id === d.caps.thermostat_mode ? ' selected' : '') + '>' + esc(m.title[lang] || m.title.en || m.id) + '</option>';
            }).join('') + '</select>';
          }
        }
        rows.push('<div class="fp-row"><span class="fp-name">' + esc(room.name) + '</span><span class="fp-val">' + esc(value) + '</span>' + control + '</div>');
      });
      if (rows.length) out.push('<p class="fp-sub">' + esc(level.name) + '</p>' + rows.join(''));
    });
    return out.join('') || '<p>' + esc(T.noClimate) + '</p>';
  }

  /* --------------------------------------------------------------- lists */

  function loadLists() {
    return HomeyWeb.request('GET', '/lists').then(function (l) { state.lists = l; }).catch(function () {});
  }
  function saveLists() {
    return HomeyWeb.request('PUT', '/lists', state.lists).then(function (l) { state.lists = l; refresh(); }).catch(function () { loadLists().then(refresh); });
  }
  function renderLists() {
    var l = state.lists;
    if (!l) return '';
    var tabs = ['shopping', 'tasks', 'meals'].map(function (t) {
      return '<button type="button" class="fp-btn' + (state.listTab === t ? ' primary' : '') + '" data-p="list-tab" data-value="' + t + '">' + esc(T[t]) + '</button>';
    }).join('');
    var body;
    if (state.listTab === 'meals') {
      body = DAYS.map(function (d) {
        return '<label class="fp-row"><span class="fp-name">' + esc(T[d]) + '</span><input type="text" maxlength="120" data-p="meal" data-day="' + d + '" value="' + esc(l.meals[d]) + '"></label>';
      }).join('');
    } else {
      var list = l[state.listTab];
      body = list.map(function (i, n) {
        return '<label class="fp-row fp-item' + (i.done ? ' done' : '') + '"><input type="checkbox" data-p="item" data-n="' + n + '"' + (i.done ? ' checked' : '') + '><span class="fp-name">' + esc(i.text) + '</span><button type="button" class="fp-x" data-p="item-remove" data-n="' + n + '" aria-label="×">✕</button></label>';
      }).join('') + '<form class="fp-add" data-p="add"><input type="text" maxlength="120" placeholder="' + esc(T.add) + '…"><button type="submit" class="fp-btn primary">' + esc(T.add) + '</button></form>'
        + (list.some(function (i) { return i.done; }) ? '<button type="button" class="fp-btn" data-p="clear-done">' + esc(T.clearDone) + '</button>' : '');
    }
    return '<div class="fp-btns fp-wide">' + tabs + '</div>' + body;
  }

  /* ----------------------------------------------------------- variables */

  function loadVariables() {
    var plan = st().plan;
    if (!plan || !(plan.variables || []).length) { state.variables = []; return Promise.resolve(); }
    return HomeyWeb.request('GET', '/variables?plan=' + encodeURIComponent(plan.id)).then(function (v) { state.variables = v || []; }).catch(function () {});
  }
  // To read: what a Flow changes, not a switch on the dashboard
  function renderVariables() {
    return state.variables.map(function (v) {
      var value = v.type === 'boolean' ? (v.value ? T.yes : T.no) : v.value;
      return '<div class="fp-row"><span class="fp-name">' + esc(v.name) + '</span><span class="fp-val">' + esc(value) + '</span></div>';
    }).join('');
  }

  /* -------------------------------------------------------------- vacuum */

  function renderVacuum() {
    return vacuums().map(function (d) {
      var c = d.caps;
      var status = c.vacuumcleaner_state || (c.onoff ? T.vacuumBusy : '');
      return '<p class="fp-sub">' + esc(d.name) + (typeof c.measure_battery === 'number' ? ' · ' + Math.round(c.measure_battery) + '%' : '') + '</p><div class="fp-row"><span class="fp-name">' + esc(status) + '</span></div><div class="fp-btns fp-wide">'
        + '<button type="button" class="fp-btn primary" data-p="vacuum" data-dev="' + esc(d.id) + '" data-value="cleaning">' + esc(T.start) + '</button><button type="button" class="fp-btn" data-p="vacuum" data-dev="' + esc(d.id) + '" data-value="stopped">' + esc(T.stop) + '</button><button type="button" class="fp-btn" data-p="vacuum" data-dev="' + esc(d.id) + '" data-value="docked">' + esc(T.dock) + '</button></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ the sheet */

  var SHEETS = {
    climate: [function () { return T.climate; }, renderClimate],
    lists: [function () { return T.lists; }, renderLists],
    alarm: [function () { return T.alarm; }, renderAlarm],
    vacuum: [function () { return T.vacuum; }, renderVacuum],
    variables: [function () { return T.variables; }, renderVariables],
  };
  function open(name) {
    state.open = name;
    state.html['sheet-body'] = null;
    if (name === 'lists' && !state.lists) { loadLists().then(refresh); }
    $('sheet-title').textContent = SHEETS[name][0]();
    $('sheet').hidden = false;
    refresh();
  }
  function refresh() {
    if (state.open && $('sheet').hidden) { state.open = null; state.html['sheet-body'] = null; }
    if (state.open) fill($('sheet-body'), SHEETS[state.open][1]());
    renderSide();
  }

  /* ------------------------------------------------------ side and media */

  function sideCards() {
    var side = $('side');
    if (!side || $('panel-cards')) return;
    var box = document.createElement('div');
    box.id = 'panel-cards';
    box.innerHTML = '<div id="cam-card" class="card side-card" hidden><img id="cam-img" alt=""></div><div id="meal-card" class="card side-card" hidden></div><div id="var-card" class="card side-card" hidden></div>';
    side.insertBefore(box, side.children[1] || null);
  }
  function renderSide() {
    sideCards();
    var meal = state.lists && state.lists.meals[DAYS[(new Date().getDay() + 6) % 7]];
    var mealCard = $('meal-card');
    if (mealCard) {
      mealCard.hidden = !meal;
      fill(mealCard, meal ? '<p class="fp-sub">' + esc(T.mealToday) + '</p><div class="fp-meal">' + esc(meal) + '</div>' : '');
    }
    var varCard = $('var-card');
    if (varCard) {
      varCard.hidden = !state.variables.length;
      fill(varCard, renderVariables());
    }
  }

  var camCount = 0;
  function cameraUrl(d) {
    // Homey serves the picture of a camera on its own address
    return location.protocol + '//' + location.hostname + d.camera + (d.camera.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
  }
  function tickCameras() {
    camCount += 1;
    var list = cameras();
    var chosen = HomeyWeb.Homey.getSettings().camera;
    var cam = list.filter(function (d) { return d.id === chosen; })[0] || list[0];
    var card = $('cam-card');
    if (card) {
      card.hidden = !cam;
      if (cam && camCount % 5 === 1) $('cam-img').src = cameraUrl(cam);
    }
    if (state.showing && !$('camview').hidden && camCount % 2 === 0 && cam) $('camview-img').src = cameraUrl(cam);
  }
  function showCamera() {
    var cam = cameras()[0];
    if (!cam) return false;
    $('camview-img').src = cameraUrl(cam);
    $('camview-name').textContent = cam.name;
    $('camview').hidden = false;
    state.showing = true;
    return true;
  }

  function renderMedia() {
    var box = $('media');
    var speakers = find(function (d) { return 'speaker_playing' in d.caps; });
    var d = speakers.filter(function (s) { return s.caps.speaker_playing === true; })[0];
    box.hidden = !d;
    if (!d) return;
    var c = d.caps;
    var title = [c.speaker_artist, c.speaker_track].filter(Boolean).join(' – ') || d.name;
    fill(box, '<span class="fp-media-title">🎵 ' + esc(title) + '</span><span class="fp-media-keys"><button type="button" class="fp-step" data-p="media" data-dev="' + esc(d.id) + '" data-cap="speaker_prev">⏮</button><button type="button" class="fp-step" data-p="media" data-dev="' + esc(d.id) + '" data-cap="speaker_playing">⏸</button><button type="button" class="fp-step" data-p="media" data-dev="' + esc(d.id) + '" data-cap="speaker_next">⏭</button>'
      + (typeof c.volume_set === 'number' ? '<input type="range" min="0" max="100" value="' + Math.round(c.volume_set * 100) + '" data-p="volume" data-dev="' + esc(d.id) + '">' : '') + '</span>');
  }

  function renderPeople() {
    var box = $('people');
    if (HomeyWeb.Homey.getSettings().people === false || !state.people.length) { box.hidden = true; return; }
    box.hidden = false;
    fill(box, state.people.map(function (p) {
      var word = p.asleep ? T.asleep : p.home ? T.home : T.away;
      return '<i class="' + (p.home ? 'home' : '') + '" title="' + esc(p.name + ': ' + word) + '">' + esc(p.initial) + '</i>';
    }).join(''));
  }

  /* --------------------------------------------------------------- events */

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-p]');
    if (el) {
      var n = Number(el.dataset.n);
      var p = el.dataset.p;
      if (p === 'alarm') send(el.dataset.dev, 'homealarm_state', el.dataset.value).catch(function () {});
      if (p === 'list-tab') { state.listTab = el.dataset.value; refresh(); }
      if (p === 'item-remove') { ev.preventDefault(); state.lists[state.listTab].splice(n, 1); saveLists(); }
      if (p === 'clear-done') { state.lists[state.listTab] = state.lists[state.listTab].filter(function (i) { return !i.done; }); saveLists(); }
      if (p === 'vacuum') send(el.dataset.dev, 'vacuumcleaner_state', el.dataset.value).catch(function () {});
      if (p === 'media') {
        var d = st().devices.get(el.dataset.dev);
        send(el.dataset.dev, el.dataset.cap, el.dataset.cap === 'speaker_playing' ? !d.caps.speaker_playing : true).catch(function () {});
      }
    }
    if (ev.target.id === 'cam-img') showCamera();
    if (ev.target.closest && ev.target.closest('#camview')) { $('camview').hidden = true; state.showing = false; }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.dataset.p === 'item') { state.lists[state.listTab][Number(el.dataset.n)].done = el.checked; saveLists(); }
    if (el.dataset.p === 'meal') { state.lists.meals[el.dataset.day] = el.value; saveLists(); }
    if (el.dataset.p === 'volume') send(el.dataset.dev, 'volume_set', Number(el.value) / 100).catch(function () {});
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.dataset.p !== 'add') return;
    ev.preventDefault();
    var input = ev.target.querySelector('input');
    var value = input.value.trim();
    if (!value) return;
    state.lists[state.listTab].push({ text: value, done: false });
    saveLists().then(function () { var next = document.querySelector('.fp-add input'); if (next) next.focus(); });
  });

  function loadSlow() {
    HomeyWeb.request('GET', '/advice' + (st().plan ? '?plan=' + encodeURIComponent(st().plan.id) : '')).then(function (a) { state.advice = (a && a.items) || []; }).catch(function () {});
    HomeyWeb.request('GET', '/people').then(function (p) { state.people = p || []; renderPeople(); }).catch(function () {});
    loadVariables().then(refresh);
    if (!state.lists) loadLists().then(refresh);
  }

  window.FpPanels = {
    T: T,
    open: open,
    showCamera: showCamera,
    message: function (text) { $('ring-name').textContent = ''; $('ring-text').textContent = text; $('ring-img').hidden = true; $('ring').hidden = false; },
    alarm: alarmState,
    // Short signs for the strip.
    chips: function () {
      var out = [];
      var a = alarmState();
      if (a && a.state !== 'disarmed') out.push({ cls: 'warn', icon: '🛡', text: a.state === 'armed' ? T.alarmOn : T.alarmPartial, x: 'alarm' });
      vacuums().forEach(function (d) {
        var s = d.caps.vacuumcleaner_state;
        if (s ? !IDLE_VACUUM.test(s) : d.caps.onoff === true) out.push({ icon: '🧹', text: T.vacuumBusy, x: 'vacuum' });
      });
      state.advice.slice(0, 2).forEach(function (i) {
        out.push({ cls: i.id === 'dear' ? 'warn' : i.id === 'cheapAt' ? '' : 'good', icon: i.id === 'sunTomorrow' ? '☀' : '⚡', text: adviceText(i) });
      });
      return out;
    },
    // Buttons beside "I'm leaving".
    buttons: function () {
      var out = [['lists', '📝', T.lists], ['climate', '🌡', T.climate]];
      if (alarmDevices().length) out.push(['alarm', '🛡', T.alarm]);
      if (vacuums().length) out.push(['vacuum', '🧹', T.vacuum]);
      if (state.variables.length) out.push(['variables', '🎚', T.variables]);
      return out;
    },
    tick: function () {
      refresh();
      renderMedia();
      tickCameras();
    },
    reloadLists: function () { loadLists().then(refresh); },
    loadSlow: loadSlow,
    state: state,
  };
}());
