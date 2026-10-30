// Runs inside the Energy page at /energy/ (see scripts/ui-check.js energy): Energy Dashboard's page on HomeDeck's port.
(async function () {
  const report = {};
  window.__report = report;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const has = (id) => document.querySelector(`[data-block="${id}"]`);
    for (let i = 0; i < 50 && !has('flow'); i++) await wait(100);

    // The blocks of Energy Dashboard, also the ones the plan names: costs, history, Sankey, gas and water
    report.blocks = ['flow', 'costs', 'sankey', 'gas', 'water', 'solar', 'battery', 'heating'].every((id) => has(id));
    // The switch goes back to the house on the same port, the settings stay under the page
    const back = document.querySelector('.app-switch a');
    report.backToHouse = !!back && back.getAttribute('href') === '../' && new URL(back.href).pathname === '/';
    report.settingsLink = [...document.querySelectorAll('a')].some((a) => new URL(a.href).pathname === '/energy/instellingen/');

    // Another period loads its history
    const tab = [...document.querySelectorAll('button')].find((b) => /^(Week)$/.test(b.textContent.trim()));
    tab.click();
    await wait(800);
    report.period = tab.classList.contains('active');

    // The settings page opens right away when there is no PIN, with the energy devices and the contract
    const frame = document.createElement('iframe');
    frame.src = 'instellingen/';
    frame.style.cssText = 'width:900px;height:600px';
    document.body.appendChild(frame);
    const filled = () => { const p1 = frame.contentDocument && frame.contentDocument.querySelector('select[name=p1]'); return p1 && p1.options.length > 1; };
    for (let i = 0; i < 80 && !filled(); i++) await wait(100);
    const doc = frame.contentDocument;
    report.settingsOpen = !!filled() && !doc.getElementById('settings-form').hidden && !(doc.getElementById('settings-pin') && !doc.getElementById('settings-pin').hidden);
    report.settingsBack = !!doc.querySelector('.web-back a') && new URL(doc.querySelector('.web-back a').href).pathname === '/energy/';

  } catch (err) {
    report.threw = String((err && err.stack) || err);
  }
  report.noErrors = errors.length ? errors.slice(0, 3).join(' | ') : true;
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
}());
