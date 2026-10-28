/*
 * Stand-in for Homey's widget/settings object on the web pages served by the app (lib/WebServer.js),
 * so widget.js and editor.js run unchanged: api() over fetch, on() over Server-Sent Events,
 * getSettings() from this browser's storage. Writes that need the edit PIN ask for it once per session.
 */
(function () {
  'use strict';

  var STRINGS = {
    en: { pinTitle: 'Edit PIN', pinPrompt: 'Changing the floor plan needs the edit PIN. You can find or change it in the Homey app, in the settings of Floor Plan Dashboard.', open: 'Unlock', cancel: 'Cancel', wrong: 'Wrong PIN.', locked: 'Too many wrong tries. Try again later.' },
    nl: { pinTitle: 'Bewerk-pincode', pinPrompt: 'Voor het wijzigen van de plattegrond is de bewerk-pincode nodig. Je vindt of wijzigt hem in de Homey-app bij de instellingen van Plattegrond Dashboard.', open: 'Ontgrendelen', cancel: 'Annuleren', wrong: 'Verkeerde pincode.', locked: 'Te vaak fout. Probeer het straks opnieuw.' },
  };
  var T = STRINGS[(navigator.language || 'en').slice(0, 2)] || STRINGS.en;

  var TOKEN_KEY = 'fp.editToken';
  var SETTINGS_KEY = 'fp.dashboard';
  // The web page is a whole screen, so the side panel is on by default (the widget's default is off).
  var DEFAULTS = { view: '2d', turn: '0', glow: 'soft', tint: 'none', furniture: true, values: true, names: 'devices', tapAction: 'controls', sidebar: 'right', sideWeather: true, sideAgenda: true };

  function storageGet(area, key) { try { return window[area].getItem(key); } catch (e) { return null; } }
  function storageSet(area, key, value) { try { if (value == null) window[area].removeItem(key); else window[area].setItem(key, value); } catch (e) { /* private mode */ } }

  function getSettings() {
    var saved = {};
    try { saved = JSON.parse(storageGet('localStorage', SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
    Object.keys(saved).forEach(function (k) { out[k] = saved[k]; });
    return out;
  }

  function setSettings(values) {
    var next = getSettings();
    Object.keys(values).forEach(function (k) { next[k] = values[k]; });
    storageSet('localStorage', SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  /* ------------------------------------------------------------ PIN */

  var pinPromise = null;
  function askPin() {
    if (pinPromise) return pinPromise;
    pinPromise = new Promise(function (resolve, reject) {
      var wrap = document.createElement('div');
      wrap.className = 'hw-pin';
      wrap.innerHTML = '<form class="hw-pin-card"><h2></h2><p></p><input type="password" inputmode="numeric" autocomplete="off" required>'
        + '<div class="hw-pin-error" hidden></div><div class="hw-pin-btns"><button type="button" class="hw-cancel"></button><button type="submit" class="hw-ok"></button></div></form>';
      wrap.querySelector('h2').textContent = T.pinTitle;
      wrap.querySelector('p').textContent = T.pinPrompt;
      wrap.querySelector('.hw-cancel').textContent = T.cancel;
      wrap.querySelector('.hw-ok').textContent = T.open;
      var style = document.createElement('style');
      style.textContent = '.hw-pin{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:1000;padding:16px;font:15px/1.4 system-ui,sans-serif}'
        + '.hw-pin-card{background:#fff;color:#1c1c1e;border-radius:18px;padding:22px;max-width:360px;width:100%;box-sizing:border-box}'
        + '@media (prefers-color-scheme:dark){.hw-pin-card{background:#1c1c1e;color:#f5f5f7}}'
        + '.hw-pin h2{margin:0 0 6px;font-size:20px}.hw-pin p{margin:0 0 12px;opacity:.7}'
        + '.hw-pin input{width:100%;box-sizing:border-box;font:inherit;font-size:20px;letter-spacing:.2em;padding:10px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit}'
        + '.hw-pin-error{color:#ff4d4f;margin-top:8px}.hw-pin-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}'
        + '.hw-pin button{font:inherit;border:0;border-radius:10px;padding:8px 14px;cursor:pointer}.hw-ok{background:#0a84ff;color:#fff}.hw-cancel{background:transparent;color:inherit}';
      wrap.appendChild(style);
      document.body.appendChild(wrap);
      var input = wrap.querySelector('input');
      var error = wrap.querySelector('.hw-pin-error');
      input.focus();
      function done() { wrap.remove(); pinPromise = null; }
      wrap.querySelector('.hw-cancel').addEventListener('click', function () { done(); reject(new Error(T.pinTitle)); });
      wrap.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: input.value }) })
          .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
          .then(function (r) {
            if (r.res.ok && r.data && r.data.token) { storageSet('sessionStorage', TOKEN_KEY, r.data.token); done(); resolve(); return; }
            error.hidden = false;
            error.textContent = r.res.status === 429 ? T.locked : T.wrong;
            input.select();
          })
          .catch(function (err) { error.hidden = false; error.textContent = String(err.message || err); });
      });
    });
    return pinPromise;
  }

  /* ------------------------------------------------------------ API */

  function request(method, path, body) {
    // The demo site has no Homey: web/demo.js answers in the browser.
    if (window.FP_DEMO) return window.FP_DEMO.request(method, path, body);
    var headers = {};
    if (body != null) headers['Content-Type'] = 'application/json';
    var token = storageGet('sessionStorage', TOKEN_KEY);
    if (token) headers['x-edit-token'] = token;
    return fetch('/api' + path, { method: method, headers: headers, body: body != null ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (res) {
        if (res.status === 401) { location.reload(); throw new Error('Access code needed'); }
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.status === 403 && data && data.pin) {
            storageSet('sessionStorage', TOKEN_KEY, null);
            return askPin().then(function () { return request(method, path, body); });
          }
          if (!res.ok) throw new Error((data && data.error) || ('Error ' + res.status));
          return data;
        });
      });
  }

  /* --------------------------------------------------------- events */

  var source = null;
  var listeners = {};
  var wasOpen = false;
  var connectionListeners = [];
  var connection = 'connecting';
  function setConnection(state) {
    connection = state;
    connectionListeners.forEach(function (fn) { fn(state); });
  }
  function connect() {
    if (window.FP_DEMO) { if (connection !== 'live') setConnection('live'); return; }
    if (source || typeof EventSource === 'undefined') return;
    source = new EventSource('/api/events');
    source.onopen = function () {
      // After a dropped connection the page may have missed changes: ask everything again.
      if (wasOpen) (listeners.devices || []).forEach(function (fn) { fn({ reconnected: true }); });
      wasOpen = true;
      setConnection('live');
    };
    source.onerror = function () { setConnection(source.readyState === 2 ? 'error' : 'connecting'); };
  }
  function onConnection(fn) { connectionListeners.push(fn); fn(connection); }
  function on(event, fn) {
    connect();
    (listeners[event] = listeners[event] || []).push(fn);
    if (window.FP_DEMO) { window.FP_DEMO.on(event, fn); return; }
    source.addEventListener(event, function (e) {
      var data = null;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      fn(data);
    });
  }

  var Homey = {
    isWeb: true,
    api: function (method, path, body, cb) {
      var p = request(method, path, body);
      if (typeof cb === 'function') { p.then(function (r) { cb(null, r); }, function (e) { cb(e); }); return undefined; }
      return p;
    },
    on: on,
    ready: function () {},
    getSettings: getSettings,
    setSettings: setSettings,
    getWidgetInstanceId: function () { return 'web'; },
    hapticFeedback: function () { if (navigator.vibrate) navigator.vibrate(8); },
    popup: function (url) { window.open(url, '_blank'); return Promise.resolve(); },
    setHeight: function () { return Promise.resolve(); },
    __: function (key) { return key; },
  };

  window.HomeyWeb = { Homey: Homey, request: request, askPin: askPin, onConnection: onConnection };
  window.addEventListener('load', function () {
    if (typeof window.onHomeyReady === 'function') window.onHomeyReady(Homey);
  });
}());
