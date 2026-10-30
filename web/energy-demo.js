/*
 * Energy page on the demo site (scripts/build-demo.js): answers the page's calls in the browser with Energy Dashboard's
 * demo data (energy-demo-data.js), made when the site was built and moved to today's date. Layout changes stay here.
 */
(function () {
  'use strict';

  var lang = (navigator.language || 'en').slice(0, 2) === 'nl' ? 'nl' : 'en';
  var data = window.FP_ENERGY_DEMO_DATA[lang];
  var DAY = 86400000;
  var days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(window.FP_ENERGY_DEMO_DATA.built).setHours(0, 0, 0, 0)) / DAY);
  var ISO = /^\d{4}-\d\d-\d\dT/;
  var layout = null;

  // Every date in the data, as many days later as the site is old
  function moved(x) {
    if (typeof x === 'string') return ISO.test(x) ? new Date(Date.parse(x) + days * DAY).toISOString() : x;
    if (typeof x === 'number') return x > 1.5e12 && x < 2.5e12 ? x + days * DAY : x;
    if (Array.isArray(x)) return x.map(moved);
    if (x && typeof x === 'object') {
      var out = {};
      Object.keys(x).forEach(function (k) { out[k] = moved(x[k]); });
      return out;
    }
    return x;
  }

  function answer(path) {
    var url = new URL(path, 'http://demo');
    var p = url.pathname;
    if (p === '/live') {
      var live = moved(data.live[new Date().getHours()]);
      if (layout) live.layout = layout;
      return live;
    }
    if (p === '/history') return moved(data.history[url.searchParams.get('period') || 'today']);
    if (p === '/layout') return Object.assign({}, data.layout, layout ? { layout: layout, customLayout: true } : {});
    if (p === '/siblings') return [{ key: 'home', icon: '🏠', name: { en: 'Home', nl: 'Huis' }, path: '../' }];
    if (p === '/diagnosis-report') return { email: null, report: { demo: true } };
    throw new Error('Not in the demo');
  }

  window.FP_ENERGY_DEMO = {
    get: function (path) {
      return new Promise(function (resolve) { resolve(answer(path)); });
    },
    post: function (path, body) {
      return new Promise(function (resolve) {
        if (path === '/layout' && body && Array.isArray(body.layout)) layout = body.layout;
        resolve(answer('/layout'));
      });
    },
  };
}());
