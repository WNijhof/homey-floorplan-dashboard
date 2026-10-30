'use strict';

// Start-up of Energy Dashboard's page inside HomeDeck, at /energy/. This file is HomeDeck's own (not synced).
// On the demo site energy-demo.js answers instead of the app.
(function () {
  var nl = (navigator.language || 'en').slice(0, 2) === 'nl';
  // Beside or over the house the page shows its blocks only
  if (/[?&]embed=1/.test(location.search)) {
    var style = document.createElement('style');
    style.textContent = '.top { display: none !important; }';
    document.head.appendChild(style);
  }

  function get(path) {
    if (window.FP_ENERGY_DEMO) return window.FP_ENERGY_DEMO.get(path);
    return fetch('api' + path, { cache: 'no-store' }).then(function (res) {
      if (res.status === 401) location.reload();
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
        return data;
      });
    });
  }

  function post(path, body) {
    if (window.FP_ENERGY_DEMO) return window.FP_ENERGY_DEMO.post(path, body);
    return fetch('api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw Object.assign(new Error(data.error || 'Error ' + res.status), { status: res.status });
        return data;
      });
    });
  }

  EnergyDashboard.start({
    get: get,
    post: post,
    missingHint: nl ? 'Kies ze bij de <a href="instellingen/">instellingen</a> van deze pagina.' : 'Choose them in the <a href="instellingen/">settings</a> of this page.',
    settingsUrl: window.FP_ENERGY_DEMO ? null : 'instellingen/',
  });
}());
