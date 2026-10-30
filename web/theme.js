/*
 * Light or dark, for every web page of the app: as this device, always light, always dark, or with the sun. Loaded at the
 * top of the page, so nothing flashes in the wrong colours. The choice is kept where the Energy page keeps its own (same
 * address, same browser), so both pages always agree. Sets data-theme on <html>; the style sheets read that.
 */
(function () {
  'use strict';

  var KEY = 'energy-dashboard-screen';
  var COLORS = { light: '#f2f2f7', dark: '#000000' };
  var night = null;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function choice() {
    return read().theme || 'auto';
  }
  // 'light', 'dark', or null when the device decides.
  function current() {
    var c = choice();
    if (c === 'light' || c === 'dark') return c;
    if (c === 'sun' && night !== null) return night ? 'dark' : 'light';
    return null;
  }
  function apply() {
    var root = document.documentElement;
    var theme = current();
    if ((root.dataset.theme || null) === theme) return;
    if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (meta) {
      if (!meta.dataset.device) meta.dataset.device = meta.content;
      meta.content = theme ? COLORS[theme] : meta.dataset.device;
    });
    window.dispatchEvent(new Event('fp-theme'));
  }

  window.FpTheme = {
    choice: choice,
    current: current,
    isDark: function () {
      var theme = current();
      return theme ? theme === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },
    set: function (value) {
      var saved = read();
      saved.theme = value;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* private mode: for this visit only */ }
      apply();
      window.dispatchEvent(new Event('fp-theme'));
    },
    // Whether the sun is down, for the choice "with the sun".
    setNight: function (value) {
      night = value;
      apply();
    },
  };
  apply();
}());
