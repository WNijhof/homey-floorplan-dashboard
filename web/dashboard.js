/* global HomeyWeb */
/*
 * The extras of the full-screen web page around the widget, in the style of Energy Dashboard:
 * date and connection in the header, a switch to sister dashboards, screen settings and a link to the editor.
 */
(function () {
  'use strict';

  var STRINGS = {
    en: {
      split: 'Energy beside it', landing: 'Back to the start after', minutes: ' min', never: 'Never', peopleOn: 'Show who is home', guestView: 'Guest view (no editing or unlocking)', screenName: 'Name of this screen', screenNote: 'With a name the choices are kept on Homey, so another tablet takes them over with ?screen=name after the address. A Flow can also address this screen.', cameraPick: 'Camera',
      theme: 'Light or dark', themeAuto: 'As this device', themeLight: 'Light', themeDark: 'Dark', themeSun: 'With the sun', simple: 'Simple view (for slower screens)', saver: 'Clock after 5 minutes', saverOff: 'Off', saverNight: 'At night', saverAlways: 'Always',
      home: 'Home', settings: 'This screen', start: 'Start screen', startHouse: 'The house', startLevel: 'A storey', edit: 'Edit floor plan', plan: 'Floor plan', view: 'View', turn: 'Turn',
      glow: 'Light glow', tint: 'Tint rooms by', furniture: 'Furniture', values: 'Values beside devices', side: 'Side panel',
      weather: 'Weather', agenda: 'Calendar', none: 'Nothing', right: 'Right', bottom: 'Below', soft: 'Soft', bright: 'Bright', off: 'Off',
      temperature: 'Temperature', humidity: 'Humidity', steep: '2.5D', d3: '3D', close: 'Done',
      fullscreen: 'Full screen', note: 'These choices are kept on this screen only.', live: 'Live', connecting: 'Connecting…', offline: 'No connection',
      tap: 'Tapping a device', controls: 'Shows its controls', toggle: 'Switches it at once', names: 'Names on the plan', devices: 'Devices', all: 'Devices and furniture',
      report: 'Report a problem', reportNote: 'Is a device missing, or does something look wrong? Send the maker a report: which kinds of devices the app finds and how your plan is built, without names, rooms or address.',
      reportPlan: 'Include my floor plan (names replaced)', reportMail: 'Mail the report', reportGithub: 'Share on GitHub', reportCopy: 'Copy the report', reportMaking: 'Making the report…',
      reportFailed: 'Could not make the report', reportCopied: 'The report is on your clipboard. If it is not in the e-mail or the issue yet, paste it there.', reportCopiedOnly: 'The report is on your clipboard. Send it to the maker directly, for example in a private message on the forum.',
      reportAsk: 'What does not work well? (for example: my thermostat shows no temperature)', reportPaste: '(Paste the report here; it is on your clipboard.)',
    },
    nl: {
      split: 'Energie ernaast', landing: 'Terug naar het begin na', minutes: ' min', never: 'Nooit', peopleOn: 'Toon wie er thuis is', guestView: 'Gastweergave (niet bewerken of ontgrendelen)', screenName: 'Naam van dit scherm', screenNote: 'Met een naam staan de keuzes op Homey, zodat een andere tablet ze overneemt met ?screen=naam achter het adres. Een Flow kan dit scherm ook aanspreken.', cameraPick: 'Camera',
      theme: 'Licht of donker', themeAuto: 'Zoals dit apparaat', themeLight: 'Licht', themeDark: 'Donker', themeSun: 'Met de zon mee', simple: 'Eenvoudige weergave (voor tragere schermen)', saver: 'Klok na 5 minuten', saverOff: 'Uit', saverNight: "'s Nachts", saverAlways: 'Altijd',
      home: 'Huis', settings: 'Dit scherm', start: 'Startscherm', startHouse: 'Het huis', startLevel: 'Een verdieping', edit: 'Plattegrond bewerken', plan: 'Plattegrond', view: 'Weergave', turn: 'Draaien',
      glow: 'Lichtgloed', tint: 'Kamers kleuren op', furniture: 'Meubels', values: 'Waarden naast apparaten', side: 'Zijpaneel',
      weather: 'Weer', agenda: 'Agenda', none: 'Niets', right: 'Rechts', bottom: 'Onder', soft: 'Zacht', bright: 'Fel', off: 'Uit',
      temperature: 'Temperatuur', humidity: 'Luchtvochtigheid', steep: '2.5D', d3: '3D', close: 'Klaar',
      fullscreen: 'Volledig scherm', note: 'Deze keuzes gelden alleen voor dit scherm.', live: 'Live', connecting: 'Verbinden…', offline: 'Geen verbinding',
      tap: 'Tikken op een apparaat', controls: 'Toont de bediening', toggle: 'Schakelt direct', names: 'Namen op de plattegrond', devices: 'Apparaten', all: 'Apparaten en meubels',
      report: 'Probleem melden', reportNote: 'Ontbreekt er een apparaat of klopt er iets niet? Stuur de maker een rapport: welke soorten apparaten de app vindt en hoe je plattegrond is opgebouwd, zonder namen, kamers of adres.',
      reportPlan: 'Mijn plattegrond meesturen (namen vervangen)', reportMail: 'Rapport mailen', reportGithub: 'Delen op GitHub', reportCopy: 'Rapport kopiëren', reportMaking: 'Rapport maken…',
      reportFailed: 'Rapport maken mislukt', reportCopied: 'Het rapport staat op je klembord. Staat het nog niet in de mail of het issue, plak het er dan in.', reportCopiedOnly: 'Het rapport staat op je klembord. Stuur het rechtstreeks naar de maker, bijvoorbeeld in een privébericht op het forum.',
      reportAsk: 'Wat werkt er niet goed? (bijvoorbeeld: mijn thermostaat toont geen temperatuur)', reportPaste: '(Plak hier het rapport; het staat op je klembord.)',
    },
  };
  var lang = (navigator.language || 'en').slice(0, 2);
  var T = STRINGS[lang] || STRINGS.en;
  var Homey = HomeyWeb.Homey;
  var $ = function (id) { return document.getElementById(id); };
  var LEVEL_KEY = 'fp-level-after-settings';

  // Screen settings reload the page: come back on the level that was on screen.
  (function restoreLevel() {
    var id = null;
    try { id = sessionStorage.getItem(LEVEL_KEY); sessionStorage.removeItem(LEVEL_KEY); } catch (e) { /* private mode */ }
    if (id && window.__widgetState) window.__widgetState().levelId = id;
  }());

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function nameOf(n) { return typeof n === 'string' ? n : (n && (n[lang] || n.en)) || ''; }
  var svg = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var ICONS = {
    sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>'),
  };

  /* ---------------------------------------------- header: date, status */

  function today() {
    var d = new Date();
    $('today-label').textContent = d.toLocaleDateString(navigator.language, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function status(kind) {
    var el = $('status');
    el.className = 'status' + (kind === 'live' ? ' live' : kind === 'error' ? ' error' : '');
    el.querySelector('span').textContent = kind === 'live' ? T.live : kind === 'error' ? T.offline : T.connecting;
  }
  HomeyWeb.onConnection(status);

  /* -------------------------------------------------- switch and tools */

  function renderSwitch(siblings) {
    var nav = $('app-switch');
    nav.hidden = !siblings.length;
    if (!siblings.length) return;
    // The house itself is the first tab beside it
    var html = [];
    siblings.forEach(function (s) {
      var href = s.path || location.protocol + '//' + location.hostname + ':' + s.port + '/';
      html.push('<a href="' + esc(href) + '" data-sibling="' + esc(s.key) + '">' + esc(s.icon || '') + ' ' + esc(nameOf(s.name)) + '</a>');
    });
    nav.innerHTML = html.join('');
  }

  function renderTools() {
    var full = document.fullscreenEnabled ? '<button type="button" class="icon-button" data-tb="full" title="' + esc(T.fullscreen) + '">' + ICONS.expand + '</button>' : '';
    $('toolbar').innerHTML = full
      + '<button type="button" class="icon-button" data-tb="theme" title="' + esc(T.theme) + '">' + (window.FpTheme.isDark() ? ICONS.sun : ICONS.moon) + '</button>'
      + '<button type="button" class="icon-button" data-tb="report" title="' + esc(T.report) + '">' + ICONS.alert + '</button>'
      + '<button type="button" class="icon-button" data-tb="settings" title="' + esc(T.settings) + '">' + ICONS.gear + '</button>'
      + '<a class="icon-button" href="editor" title="' + esc(T.edit) + '">' + ICONS.pencil + '</a>';
  }

  /* ------------------------------------------------- screen settings */

  function select(id, value, options) {
    return '<label class="fp-row"><span class="fp-name">' + esc(T[id] || id) + '</span><select data-set="' + id + '">'
      + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
      + '</select></label>';
  }
  function check(id, value) {
    return '<label class="fp-row"><span class="fp-name">' + esc(T[id] || id) + '</span><input type="checkbox" data-set="' + id + '"' + (value !== false ? ' checked' : '') + '></label>';
  }

  // In the guest view the settings ask for the edit PIN first.
  function openSettings() {
    if (!Homey.getSettings().guest) { showSettings(); return; }
    HomeyWeb.request('GET', '/edit').then(function (e) {
      if (e && e.pinRequired && !e.unlocked) return HomeyWeb.askPin().then(showSettings);
      return showSettings();
    }).catch(function () {});
  }

  function showSettings() {
    var s = Homey.getSettings();
    // View and turn as they are on screen now, so Done keeps what the 2D/3D and turn buttons chose
    var now = window.__widgetState && window.__widgetState();
    if (now) { s.view = now.view; s.turn = String(now.turn); }
    var can3d = !!(window.FloorplanView3D && window.FloorplanView3D.supported);
    var canHouse = !!(window.FloorplanHouse3D && window.FloorplanHouse3D.supported);
    HomeyWeb.request('GET', '/plans').then(function (plans) {
      var planId = s.plan && s.plan.id;
      var views = [['2d', '2D']].concat(can3d ? [['3d', T.d3]] : []).concat([['steep', T.steep]]);
      var body = [
        select('theme', window.FpTheme.choice(), [['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark], ['sun', T.themeSun]]),
        plans.length > 1 ? select('plan', planId || (plans[0] && plans[0].id), plans.map(function (p) { return [p.id, p.name]; })) : '',
        canHouse ? select('start', s.start === 'level' ? 'level' : 'house', [['house', T.startHouse], ['level', T.startLevel]]) : '',
        select('view', s.view, views),
        select('turn', s.turn, [['0', '0°'], ['1', '90°'], ['2', '180°'], ['3', '270°']]),
        select('glow', s.glow, [['soft', T.soft], ['bright', T.bright], ['off', T.off]]),
        select('tint', s.tint, [['none', T.none], ['temperature', T.temperature], ['humidity', T.humidity]]),
        select('tap', s.tapAction, [['controls', T.controls], ['toggle', T.toggle]]),
        select('names', s.names, [['none', T.none], ['devices', T.devices], ['all', T.all]]),
        check('furniture', s.furniture), check('values', s.values),
        select('side', s.sidebar, [['none', T.none], ['right', T.right], ['bottom', T.bottom], ['energy', T.split]]),
        check('weather', s.sideWeather), check('agenda', s.sideAgenda),
        select('saver', s.saver || 'off', [['off', T.saverOff], ['night', T.saverNight], ['always', T.saverAlways]]),
        select('landing', s.landing || '0', [['0', T.never], ['2', '2' + T.minutes], ['5', '5' + T.minutes], ['15', '15' + T.minutes]]),
        '<label class="fp-row"><span class="fp-name">' + esc(T.peopleOn) + '</span><input type="checkbox" data-set="people"' + (s.people !== false ? ' checked' : '') + '></label>',
        '<label class="fp-row"><span class="fp-name">' + esc(T.guestView) + '</span><input type="checkbox" data-set="guest"' + (s.guest ? ' checked' : '') + '></label>',
        '<label class="fp-row"><span class="fp-name">' + esc(T.screenName) + '</span><input type="text" maxlength="40" data-set="screenName" value="' + esc(HomeyWeb.screenName()) + '"></label>',
        '<p class="fp-sub" style="text-transform:none;letter-spacing:0">' + esc(T.screenNote) + '</p>',
        '<label class="fp-row"><span class="fp-name">' + esc(T.simple) + '</span><input type="checkbox" data-set="simple"' + (s.simple ? ' checked' : '') + '></label>',
        '<p class="fp-sub" style="text-transform:none;letter-spacing:0">' + esc(T.note) + '</p>',
        '<button type="button" class="fp-btn primary" data-tb="apply">' + esc(T.close) + '</button>',
      ].join('');
      $('sheet-title').textContent = T.settings;
      $('sheet-body').innerHTML = body;
      $('sheet').hidden = false;
    });
  }

  function applySettings() {
    var map = { side: 'sidebar', weather: 'sideWeather', agenda: 'sideAgenda', tap: 'tapAction' };
    var values = {};
    Array.prototype.forEach.call(document.querySelectorAll('#sheet-body [data-set]'), function (el) {
      var key = map[el.dataset.set] || el.dataset.set;
      values[key] = el.type === 'checkbox' ? el.checked : el.value;
    });
    if (values.plan) values.plan = { id: values.plan };
    window.FpTheme.set(values.theme);
    delete values.theme;
    var name = values.screenName;
    delete values.screenName;
    Homey.setSettings(values);
    HomeyWeb.screenName(name);
    var saved = name ? HomeyWeb.request('PUT', '/screens/' + encodeURIComponent(name), Homey.getSettings()).catch(function () {}) : Promise.resolve();
    var now = window.__widgetState && window.__widgetState();
    try { if (now && now.levelId) sessionStorage.setItem(LEVEL_KEY, now.levelId); } catch (e) { /* private mode */ }
    saved.then(function () { location.reload(); });
  }

  /* ------------------------------------------------- report a problem */

  // Makes the anonymous report, copies it, and opens an e-mail to the maker with it when it fits.
  // Nothing is sent until the user sends that e-mail.
  var MAIL_LIMIT = 1800;
  var GITHUB_LIMIT = 7000;
  var ISSUES = 'https://github.com/WNijhof/homey-floorplan-dashboard/issues/new';

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      // Without focus the clipboard can wait forever; after half a second the old way is used.
      var late = new Promise(function (resolve) { setTimeout(function () { resolve('late'); }, 500); });
      return Promise.race([navigator.clipboard.writeText(text), late])
        .then(function (r) { if (r === 'late') copyFallback(text); })
        .catch(function () { copyFallback(text); });
    }
    copyFallback(text);
    return Promise.resolve();
  }
  function copyFallback(text) {
    // The dashboard runs on http in the home network, where navigator.clipboard is often missing.
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) { /* the report is shown and can be selected */ }
    document.body.removeChild(area);
  }

  function openReport() {
    $('sheet-title').textContent = T.report;
    $('sheet-body').innerHTML = '<p class="fp-sub" style="text-transform:none;letter-spacing:0">' + esc(T.reportNote) + '</p>'
      + '<label class="fp-row"><span class="fp-name">' + esc(T.reportPlan) + '</span><input type="checkbox" id="report-plan"></label>'
      + '<button type="button" class="fp-btn primary" data-tb="report-mail">✉ ' + esc(T.reportMail) + '</button>'
      + '<button type="button" class="fp-btn" data-tb="report-github">↗ ' + esc(T.reportGithub) + '</button>'
      + '<button type="button" class="fp-btn" data-tb="report-copy">' + esc(T.reportCopy) + '</button>'
      + '<p class="fp-sub" id="report-status" style="text-transform:none;letter-spacing:0"></p>'
      + '<textarea id="report-text" class="fp-report" readonly hidden></textarea>';
    $('sheet').hidden = false;
  }

  // kind: 'mail', 'github' or 'copy'.
  function sendReport(kind) {
    var status = $('report-status');
    status.textContent = T.reportMaking;
    // A window opened right away is not blocked; it gets its address once the report is made.
    var tab = kind === 'github' ? window.open('about:blank', '_blank') : null;
    HomeyWeb.request('GET', '/diagnosis-report' + ($('report-plan').checked ? '?plan=1' : '')).then(function (shared) {
      var pretty = JSON.stringify(shared.report, null, 2);
      var box = $('report-text');
      box.value = pretty;
      box.hidden = false;
      return copyText(pretty).then(function () {
        var subject = 'Diagnose HomeDeck ' + (shared.report.app || '');
        if (kind === 'mail' && shared.email) {
          var full = T.reportAsk + '\n\n\n' + JSON.stringify(shared.report) + '\n';
          var body = encodeURIComponent(full).length < MAIL_LIMIT ? full : T.reportAsk + '\n\n\n' + T.reportPaste + '\n';
          location.href = 'mailto:' + shared.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
          status.textContent = T.reportCopied;
        } else if (kind === 'github') {
          var issue = T.reportAsk + '\n\n\n```json\n' + pretty + '\n```\n';
          var text = encodeURIComponent(issue).length < GITHUB_LIMIT ? issue : T.reportAsk + '\n\n\n' + T.reportPaste + '\n';
          var url = ISSUES + '?title=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
          if (tab) tab.location.href = url; else window.open(url, '_blank');
          status.textContent = T.reportCopied;
        } else status.textContent = T.reportCopiedOnly;
      });
    }).catch(function (err) {
      if (tab) tab.close();
      status.textContent = T.reportFailed + ': ' + ((err && err.message) || err);
    });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-tb]');
    if (!b) return;
    if (b.dataset.tb === 'report') openReport();
    if (b.dataset.tb === 'report-mail') sendReport('mail');
    if (b.dataset.tb === 'report-github') sendReport('github');
    if (b.dataset.tb === 'report-copy') sendReport('copy');
    if (b.dataset.tb === 'settings') openSettings();
    if (b.dataset.tb === 'apply') applySettings();
    if (b.dataset.tb === 'theme') { window.FpTheme.set(window.FpTheme.isDark() ? 'light' : 'dark'); renderTools(); }
    if (b.dataset.tb === 'full') {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
    }
  });

  // Keep a wall tablet awake while the dashboard is shown, where the browser allows it.
  function keepAwake() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').catch(function () {});
  }
  document.addEventListener('visibilitychange', keepAwake);
  document.addEventListener('click', keepAwake, { once: true });

  // The heading and tab title in the language of the page (the HTML holds the Dutch one).
  $('title').textContent = T.home;
  document.title = T.home;
  today();
  setInterval(today, 60000);
  renderTools();
  HomeyWeb.request('GET', '/siblings').then(renderSwitch).catch(function () {});
}());
