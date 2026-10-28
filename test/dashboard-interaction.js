// Runs inside the web dashboard served by scripts/dev-server.js (see scripts/ui-check.js dashboard).
(async function () {
  const report = {};
  window.__report = report;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = () => window.__widgetState();
    const press = (el) => {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      (document.elementFromPoint(o.clientX, o.clientY) || el).dispatchEvent(new PointerEvent('pointerup', o));
    };

    // Switch to the sister dashboard: same host, its own port.
    const pill = document.querySelector('[data-sibling="energy"]');
    report.switchLink = !!pill && pill.href === `${location.protocol}//${location.hostname}:8686/`;
    // Relative, so it also works under a sub folder (the demo on GitHub Pages).
    report.editorLink = [...document.querySelectorAll('#toolbar a')].some((a) => a.getAttribute('href') === 'editor' && new URL(a.href).pathname === '/editor');
    report.noWidgetFullButton = document.getElementById('btn-full').hidden;

    // A tap goes through the real API and comes back over Server-Sent Events.
    const before = st().devices.get('d_light_hall').caps.onoff;
    press(document.querySelector('.fp-device[data-id="i_l3"] circle:nth-of-type(2)'));
    await wait(450);
    document.querySelector('#quick [data-act=toggle][data-cap=onoff]').click();
    await wait(400);
    const server = (await (await fetch('/api/plan')).json()).devices.find((d) => d.id === 'd_light_hall').caps.onoff;
    report.tapReachesServer = server === !before && st().devices.get('d_light_hall').caps.onoff === !before;

    // Side panel with weather and calendar (on by default on the web page).
    report.sidePanel = !document.getElementById('side').hidden && document.querySelectorAll('#agenda .fp-aev').length === 3 && /11°/.test(document.getElementById('weather').textContent);

    // 3D view: real canvas, badges for devices, room labels, and a tap on a badge switches the device.
    document.getElementById('btn-view').click();
    for (let i = 0; i < 40 && !document.querySelector('.fp3-dev'); i++) await wait(100);
    report.view3d = !document.getElementById('view3d').hidden && !!document.querySelector('.fp3-canvas') && document.querySelectorAll('.fp3-dev').length === 10 && document.querySelectorAll('.fp3-room').length === 6;
    // Badges of devices behind a wall are hidden; others stay visible and can be tapped.
    await wait(300);
    const behind = document.querySelectorAll('.fp3-dev.behind').length;
    report.occlusion = behind >= 1 && behind < 10;
    const visible = document.querySelector('.fp3-dev.is-light:not(.behind)');
    const item = window.__widgetState().plan.levels[0].items.find((i) => i.id === visible.dataset.id);
    const before3d = st().devices.get(item.deviceId).caps.onoff;
    press(visible.querySelector('.fp3-dot'));
    await wait(450);
    const q3 = document.querySelector('#quick [data-act=toggle][data-cap=onoff]');
    if (q3) q3.click();
    await wait(400);
    report.tap3d = st().devices.get(item.deviceId).caps.onoff === !before3d;
    report.nameTags3d = document.querySelectorAll('.fp3-name').length >= 8;
    // A room card covers the 3D labels: none of them shows through it.
    press(document.querySelector('.fp3-room'));
    await wait(450);
    const sheet = document.querySelector('.fp-sheet:not([hidden])');
    const covered = [...document.querySelectorAll('.fp3-dev:not(.behind)')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.top >= 0 && r.left >= 0 && r.top < innerHeight && r.left < innerWidth)
      .every((r) => { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !hit || !hit.closest('.fp3-dev'); });
    report.sheetOverLabels = !!sheet && covered;
    const closeBtn = sheet && sheet.querySelector('[data-act=close], .fp-close');
    if (closeBtn) closeBtn.click(); else if (sheet) sheet.click();
    await wait(200);
    document.getElementById('btn-view').click();
    for (let i = 0; i < 20 && !document.getElementById('view3d').hidden === false; i++) await wait(50);
    for (let i = 0; i < 20 && !document.getElementById('view3d').hidden; i++) await wait(50);
    report.back2d = document.getElementById('view3d').hidden && document.getElementById('plan').style.display !== 'none';
    // Report a problem: the anonymous report is made and shown, without the names of devices.
    {
      document.querySelector('[data-tb=report]').click();
      document.querySelector('[data-tb=report-copy]').click();
      const box = document.getElementById('report-text');
      for (let i = 0; i < 40 && (!box || box.hidden); i++) await wait(50);
      const rep = JSON.parse(box.value);
      const names = [...st().devices.values()].map((d) => d.name);
      report.diagnosis = rep.devices.total === st().devices.size && !names.some((n) => box.value.includes(`"${n}"`));
      document.getElementById('sheet').hidden = true;
    }
    // 2D zoom with the wheel, and back to the whole level with the button.
    {
      const plan = document.getElementById('plan');
      const r = plan.getBoundingClientRect();
      const vb0 = plan.getAttribute('viewBox');
      plan.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: -400 }));
      await wait(100);
      const zoomed = !!st().zoom && st().zoom.k > 1.5 && plan.getAttribute('viewBox') !== vb0;
      const btn = document.querySelector('.fp-zoom-reset');
      const shown = btn && !btn.hidden;
      btn.click();
      await wait(100);
      report.zoom2d = zoomed && shown && !st().zoom && plan.getAttribute('viewBox') === vb0;
    }

    // Screen settings: open, switch to 2.5D, apply (reloads); the choice is kept in this browser.
    document.querySelector('[data-tb="settings"]').click();
    await wait(300);
    const view = document.querySelector('#sheet-body [data-set="view"]');
    report.settingsSheet = !!view;
    view.value = 'iso';
    window.HomeyWeb.Homey.setSettings({ view: 'iso' });
    report.settingsStored = window.HomeyWeb.Homey.getSettings().view === 'iso';
    window.HomeyWeb.Homey.setSettings({ view: '2d' });
  } catch (err) {
    report.threw = String((err && err.stack) || err);
  }
  report.noErrors = errors.length ? errors.slice(0, 3).join(' | ') : true;
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
}());
