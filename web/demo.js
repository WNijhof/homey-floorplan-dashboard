/*
 * Demo without a Homey (the GitHub Pages site, built by scripts/build-demo.js): answers the web pages'
 * API calls in the browser with the demo house (demo-data.js). Lamps switch, values move a little, and
 * changes to the plan stay in this browser only. homey-web.js uses window.FP_DEMO when it is there.
 */
(function () {
  'use strict';

  var REPO = 'https://github.com/WNijhof/homey-floorplan-dashboard';
  var lang = (navigator.language || 'en').slice(0, 2) === 'nl' ? 'nl' : 'en';
  var data = window.FP_DEMO_DATA[lang];
  var KEY = 'fp.demo.' + lang;
  var TEXT = {
    nl: { banner: 'Demo met een voorbeeldhuis. Wijzigingen blijven in deze browser.', reset: 'Opnieuw beginnen', more: 'Over de app', note: 'Dit is de demo: er is geen Homey om een rapport voor te maken.' },
    en: { banner: 'Demo with a sample home. Changes stay in this browser.', reset: 'Start over', more: 'About the app', note: 'This is the demo: there is no Homey to make a report for.' },
  }[lang];

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  var saved = load() || {};
  var plans = saved.plans || [clone(data.plan)];
  var calendars = saved.calendars || [];
  var devices = clone(data.devices);
  var byId = {};
  devices.forEach(function (d) { byId[d.id] = d; });
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ plans: plans, calendars: calendars })); } catch (e) { /* private mode */ } }

  var listeners = {};
  var lists = { shopping: [{ id: '1', text: lang === 'nl' ? 'Melk' : 'Milk', done: false }], tasks: [], meals: {} };
  function emit(event, payload) { (listeners[event] || []).forEach(function (fn) { fn(clone(payload)); }); }

  function at(days, h, m) { var x = new Date(); x.setDate(x.getDate() + days); x.setHours(h, m, 0, 0); return x.getTime(); }
  function weather() {
    var t = Math.round(Date.now() / 1000);
    return {
      now: { temperature: 11.4, state: lang === 'nl' ? 'Half bewolkt' : 'Partly cloudy', iconId: 'partly_cloudy_day' },
      hourly: [0, 1, 2, 3, 4].map(function (i) { return { time: t + i * 3600, temperature: 11 + i * 0.4, iconId: i < 2 ? 'partly_cloudy_day' : 'rain' }; }),
      daily: [0, 1, 2, 3, 4, 5].map(function (i) { return { time: t + i * 86400, temperatureMin: 6 + i, temperatureMax: 13 + i, iconId: i % 2 ? 'clear_day' : 'cloudy' }; }),
    };
  }
  function agenda() {
    var titles = lang === 'nl' ? ['Tandarts', 'Voetbaltraining', 'Groene container aan de straat'] : ['Dentist', 'Football practice', 'Bins out'];
    return {
      events: [
        { title: titles[0], start: at(0, 9, 30), end: at(0, 10, 0), color: '#2e5bff' },
        { title: titles[1], start: at(0, 18, 30), end: at(0, 19, 45), color: '#e0453a' },
        { title: titles[2], start: at(1, 0, 0), end: at(2, 0, 0), allDay: true, color: '#3aa36b' },
      ],
      errors: [],
    };
  }

  // A part of the demo day, moved to today and up to now (the forecast keeps the whole of today and tomorrow)
  function detailToday(d) {
    var midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    var shift = midnight.getTime() - d.from;
    var now = Date.now();
    var move = function (list, cut) { return (list || []).map(function (x) { return { t: x.t + shift, w: x.w }; }).filter(function (x) { return !cut || x.t <= now; }); };
    var out = clone(d);
    out.from = midnight.getTime(); out.now = now;
    out.curve = move(d.curve, true);
    if (d.soc) out.soc = move(d.soc, true);
    if (d.forecast) {
      var days = {};
      var key = function (t) { var x = new Date(t); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); };
      Object.keys(d.forecast.days).sort().forEach(function (k, i) { days[key(midnight.getTime() + i * 86400000)] = d.forecast.days[k]; });
      out.forecast = { source: d.forecast.source, days: days, watts: move(d.forecast.watts, false) };
    }
    return out;
  }

  function fail(status, message) { var e = new Error(message); e.status = status; throw e; }

  function route(method, path, body) {
    var url = new URL(path, 'http://demo');
    var p = url.pathname;
    if (method === 'GET' && p === '/plans') return plans;
    if (method === 'GET' && p === '/plan') {
      var id = url.searchParams.get('id');
      var plan = plans.filter(function (x) { return x.id === id; })[0] || plans[0] || null;
      return { plan: plan, devices: devices, links: { dashboard: './', editor: 'editor' } };
    }
    if (method === 'GET' && p === '/data') return { devices: devices, zones: data.zones };
    if (method === 'GET' && p === '/energy') { var hour = new Date().getHours(); var sun = window.HouseCore ? window.HouseCore.sunPosition(52.1, 5.1, new Date()) : { height: hour > 7 && hour < 18 ? 30 : -20, azimuth: 180 }; return Object.assign({}, data.energy[hour], { gasToday: 3.4, updated: new Date().toISOString(), sun: sun, night: sun.height < -4 }); }
    var part = p === '/energy-detail' && url.searchParams.get('kind');
    if (method === 'GET' && part && data.details[part]) return detailToday(data.details[part]);
    if (method === 'GET' && p === '/weather') return weather();
    if (method === 'GET' && p === '/agenda') return agenda();
    if (method === 'GET' && p === '/siblings') return [{ key: 'energy', icon: '⚡', name: { en: 'Energy', nl: 'Energie' }, path: 'energy/' }];
    if (p === '/backup') {
      if (method === 'POST') { plans = clone(body.plans); persist(); return { plans: plans.length }; }
      return { kind: 'homedeck-backup', version: 'demo', made: new Date().toISOString(), plans: plans, calendars: calendars };
    }
    if (p === '/backups') return [];
    if (p === '/advice') return { items: [{ id: 'cheapAt', at: at(0, 23, 0) }] };
    if (p === '/waste') return null;
    if (p === '/people') return [{ initial: 'S', name: 'Sam', home: true, asleep: false }, { initial: 'L', name: 'Lou', home: false, asleep: false }];
    if (p === '/variables') return [];
    if (p === '/variables/choices') return [];
    if (p === '/lists') {
      if (method === 'PUT') { lists = clone(body); return lists; }
      return lists;
    }
    if (p.indexOf('/screens/') === 0) return method === 'PUT' ? body : null;
    if (p === '/actions/choices') return [{ kind: 'mood', id: 'm1', name: lang === 'nl' ? 'Filmavond' : 'Movie night' }, { kind: 'flow', id: 'f1', name: lang === 'nl' ? 'Welterusten' : 'Good night' }];
    if (p === '/actions/run') return true;
    if (method === 'GET' && p === '/edit') return { pinRequired: false, unlocked: true };
    if (method === 'GET' && p === '/diagnosis-report') return { email: null, report: { demo: true, note: TEXT.note } };
    if (p === '/calendars') {
      if (method === 'PUT') { calendars = clone(body) || []; persist(); }
      return calendars;
    }
    if (method === 'POST' && p === '/capability') {
      var d = byId[body.deviceId];
      if (!d) fail(404, 'Unknown device');
      d.caps[body.capabilityId] = body.value;
      var change = {};
      change[d.id] = {};
      change[d.id][body.capabilityId] = body.value;
      setTimeout(function () { emit('caps', change); }, 60);
      return true;
    }
    var m = /^\/plans\/([\w-]+)$/.exec(p);
    if (m && method === 'PUT') {
      var next = Object.assign({}, clone(body), { id: m[1] });
      plans = plans.filter(function (x) { return x.id !== m[1]; }).concat([next]);
      persist();
      setTimeout(function () { emit('plan', { id: m[1] }); }, 0);
      return next;
    }
    if (m && method === 'DELETE') {
      plans = plans.filter(function (x) { return x.id !== m[1]; });
      persist();
      setTimeout(function () { emit('plan', { id: m[1], deleted: true }); }, 0);
      return true;
    }
    return fail(404, 'Unknown');
  }

  // A living house: temperatures drift a little, the washing machine's power moves, someone walks
  // through the hall now and then.
  function tick() {
    var change = {};
    function set(id, cap, value) { var d = byId[id]; if (!d || d.caps[cap] === value) return; d.caps[cap] = value; (change[id] = change[id] || {})[cap] = value; }
    devices.forEach(function (d) {
      if (typeof d.caps.measure_temperature === 'number' && Math.random() < 0.3) set(d.id, 'measure_temperature', Math.round((d.caps.measure_temperature + (Math.random() - 0.5) * 0.2) * 10) / 10);
      if (typeof d.caps.measure_power === 'number' && d.caps.onoff !== false) set(d.id, 'measure_power', Math.max(5, Math.round(d.caps.measure_power * (0.9 + Math.random() * 0.2))));
      if (typeof d.caps.alarm_motion === 'boolean') set(d.id, 'alarm_motion', Math.random() < 0.25);
    });
    if (Object.keys(change).length) emit('caps', change);
  }
  setInterval(tick, 6000);

  function banner() {
    var el = document.createElement('div');
    el.className = 'fp-demo-banner';
    el.innerHTML = '<span></span><button type="button"></button><a target="_blank" rel="noopener"></a>';
    el.querySelector('span').textContent = TEXT.banner;
    el.querySelector('button').textContent = TEXT.reset;
    el.querySelector('a').textContent = TEXT.more;
    el.querySelector('a').href = REPO;
    el.querySelector('button').addEventListener('click', function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
      location.reload();
    });
    var style = document.createElement('style');
    style.textContent = '.fp-demo-banner{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:900;display:flex;gap:10px;align-items:center;'
      + 'max-width:calc(100% - 32px);box-sizing:border-box;padding:8px 14px;border-radius:14px;background:rgba(28,28,30,.88);color:#f5f5f7;'
      + 'font:13px/1.3 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25);flex-wrap:wrap;justify-content:center}'
      + '.fp-demo-banner button{font:inherit;border:0;border-radius:9px;padding:4px 10px;background:#2e5bff;color:#fff;cursor:pointer}'
      + '.fp-demo-banner a{color:#9db3ff}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  window.addEventListener('load', banner);

  window.FP_DEMO = {
    request: function (method, path, body) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(clone(route(method, path, body))); } catch (e) { reject(e); }
        }, 40);
      });
    },
    on: function (event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
  };
}());
