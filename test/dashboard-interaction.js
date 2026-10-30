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

    // The page starts on the house: cards with the power of each part, a storey tag that opens its level
    for (let i = 0; i < 40 && !(st().energy && /kW|W/.test((document.querySelector('.h3-home em') || {}).textContent || '')); i++) await wait(100);
    report.houseStart = st().levelId === 'house' && !document.getElementById('house3d').hidden && document.getElementById('plan').style.display === 'none';
    report.houseCards = ['solar', 'grid', 'battery', 'car', 'heatpump', 'airco', 'home'].every((k) => document.querySelector(`.h3-${k}`)) && /W/.test(document.querySelector('.h3-home em').textContent);
    document.querySelector('.h3-battery').click();
    await wait(150);
    report.houseSheet = !document.getElementById('sheet').hidden && /%/.test(document.getElementById('sheet-body').textContent);
    document.getElementById('sheet-close').click();
    const firstLevel = st().plan.levels[0].id;
    // (a headless browser asks for less motion, which skips the flight)
    const realMedia = window.matchMedia;
    window.matchMedia = (q) => (/reduced-motion/.test(q) ? { matches: false } : realMedia.call(window, q));
    document.querySelector(`.h3-floor[data-id="${firstLevel}"]`).click();
    report.houseFlies = !!st().house.flying && st().levelId !== firstLevel;
    window.matchMedia = realMedia;
    for (let i = 0; i < 50 && !document.getElementById('house3d').hidden; i++) await wait(100);
    report.houseOpensLevel = st().levelId === firstLevel && document.getElementById('house3d').hidden && document.querySelector('#levels [data-level="house"]') !== null;
    // The rest of the test starts on the plan in 2D
    st().view = '2d';
    document.querySelector(`#levels [data-level="${firstLevel}"]`).click();
    for (let i = 0; i < 40 && !document.querySelector('.fp-device'); i++) await wait(100);

    const closeAnySheet = () => { const x = document.getElementById('sheet-close'); if (x && !document.getElementById('sheet').hidden) x.click(); };

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
    for (let i = 0; i < 40 && (!document.querySelector('.fp3-dev') || document.getElementById('view3d').hidden); i++) await wait(100);
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
    for (let i = 0; i < 100 && !document.getElementById('view3d').hidden; i++) await wait(50);
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
      // Share on GitHub opens a new issue with the report in it.
      const opened = { url: null };
      const tab = { location: {}, close() {} };
      const realOpen = window.open;
      window.open = () => tab;
      document.querySelector('[data-tb=report-github]').click();
      for (let i = 0; i < 40 && !tab.location.href; i++) await wait(50);
      window.open = realOpen;
      opened.url = tab.location.href || '';
      // The report is in the issue, or (when it is too long for a link) the request to paste it.
      report.diagnosisGithub = opened.url.startsWith('https://github.com/WNijhof/homey-floorplan-dashboard/issues/new?title=') && /"devices"|\(Plak|\(Paste/.test(decodeURIComponent(opened.url));
      document.getElementById('sheet').hidden = true;
    }
    // 2D zoom with the wheel, and back to the whole level with the button.
    {
      const plan = document.getElementById('plan');
      await wait(200); // let a redraw that is still pending finish first
      const r = plan.getBoundingClientRect();
      const vb0 = plan.getAttribute('viewBox');
      plan.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: -400 }));
      // Wait for the redraw (a frame or two; slower on a busy machine).
      for (let i = 0; i < 20 && !(st().zoom && plan.getAttribute('viewBox') !== vb0); i++) await wait(50);
      const zoomed = !!st().zoom && st().zoom.k > 1.5 && plan.getAttribute('viewBox') !== vb0;
      const btn = document.querySelector('.fp-zoom-reset');
      const shown = btn && !btn.hidden;
      btn.click();
      for (let i = 0; i < 20 && (st().zoom || plan.getAttribute('viewBox') !== vb0); i++) await wait(50);
      report.zoom2d = zoomed && shown && !st().zoom && plan.getAttribute('viewBox') === vb0;
    }

    // Screen settings: open, switch to 2.5D, apply (reloads); the choice is kept in this browser.
    document.querySelector('[data-tb="settings"]').click();
    await wait(300);
    const view = document.querySelector('#sheet-body [data-set="view"]');
    report.settingsSheet = !!view;
    view.value = 'steep';
    window.HomeyWeb.Homey.setSettings({ view: 'steep' });
    report.settingsStored = window.HomeyWeb.Homey.getSettings().view === 'steep';
    window.HomeyWeb.Homey.setSettings({ view: '2d' });

    // Light or dark: the choice beats the device, reaches the plan, and is the same on the Energy page
    const bg = () => getComputedStyle(document.body).backgroundColor;
    window.FpTheme.set('dark');
    report.themeDark = bg() === 'rgb(0, 0, 0)' && window.FpTheme.isDark();
    await wait(200);
    report.themeDarkPlan = document.documentElement.classList.contains('fp-dark');
    window.FpTheme.set('light');
    report.themeLight = bg() === 'rgb(242, 242, 247)' && !window.FpTheme.isDark();
    await wait(200);
    report.themeLightPlan = !document.documentElement.classList.contains('fp-dark');
    report.themeShared = JSON.parse(localStorage.getItem('energy-dashboard-screen')).theme === 'light';
    document.querySelector('[data-tb=theme]').click();
    report.themeButton = window.FpTheme.current() === 'dark';
    window.FpTheme.set('auto');
    report.themeAuto = !document.documentElement.dataset.theme;
    window.FpTheme.set('sun');
    window.FpTheme.setNight(true);
    report.themeSun = document.documentElement.dataset.theme === 'dark';
    window.FpTheme.set('auto');

    // Attention: only what matters shows; the strip stays short
    const anyDevice = [...st().devices.values()];
    const door = anyDevice.find((d) => d.cls !== 'light') || anyDevice[0];
    door.caps.alarm_contact = true;
    report.attentionOpen = window.__extras.attention().some((a) => a.leave);
    // I'm leaving: what is open, and all lamps off after a second tap
    const lit = anyDevice.filter((d) => d.cls === 'light' && d.caps.onoff === true);
    await wait(1200);
    document.querySelector('#actions [data-x=leave]').click();
    report.leaveSheet = !document.getElementById('sheet').hidden && document.getElementById('sheet-body').textContent.includes(door.name);
    if (lit.length) {
      document.querySelector('[data-x=lights-off]').click();
      report.leaveAsks = !document.getElementById('sheet').hidden;
      document.querySelector('[data-x=lights-off]').click();
      for (let i = 0; i < 30 && lit.some((d) => d.caps.onoff === true); i++) await wait(100);
      report.leaveLightsOff = lit.every((d) => d.caps.onoff === false);
    }
    delete door.caps.alarm_contact;

    // The doorbell shows over everything and wakes the clock
    window.__extras.setSaver(true);
    report.saverOn = !document.getElementById('saver').hidden && document.getElementById('app').style.display === 'none';
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    report.saverOff = document.getElementById('saver').hidden && document.getElementById('app').style.display === '';
    st().devices.set('bell', { id: 'bell', name: 'Deurbel', cls: 'doorbell', caps: { alarm_generic: false }, camera: '/api/image/x' });
    await wait(1200);
    st().devices.get('bell').caps.alarm_generic = true;
    for (let i = 0; i < 30 && document.getElementById('ring').hidden; i++) await wait(100);
    report.doorbell = !document.getElementById('ring').hidden && document.getElementById('ring-name').textContent === 'Deurbel' && document.getElementById('ring-img').src.includes('/api/image/x');
    document.getElementById('ring').click();
    st().devices.delete('bell');

    // A button of the plan starts its mood
    st().plan.actions = [{ kind: 'mood', id: 'm1', name: 'Filmavond' }];
    await wait(1200);
    report.actionShown = /Filmavond/.test(document.getElementById('actions').textContent);

    // An own photo takes the place of the 3D house, with a card and a click area on each part drawn on it.
    closeAnySheet();
    st().plan.house = { photo: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', ratio: 0.6, areas: [{ kind: 'solar', pts: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.4]] }, { kind: 'level', id: firstLevel, pts: [[0.1, 0.5], [0.9, 0.5], [0.9, 0.9]] }] } };
    document.querySelector('#levels [data-level="house"]').click();
    const planSvg = document.getElementById('plan');
    for (let i = 0; i < 80 && !planSvg.querySelector('.fp-harea'); i++) await wait(100);
    report.photoShown = !!planSvg.querySelector('.fp-harea') && !!planSvg.querySelector('image') && document.getElementById('house3d').hidden && planSvg.style.display !== 'none';
    planSvg.querySelector('.fp-harea[data-house="solar"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 30 && document.getElementById('sheet').hidden; i++) await wait(100);
    report.photoTap = !document.getElementById('sheet').hidden;
    report.sheetToEnergy = document.querySelector('#sheet-body .fp-link') && document.querySelector('#sheet-body .fp-link').getAttribute('href') === 'energy/';
    document.getElementById('sheet-close').click();
    planSvg.querySelector(`[data-house="level"][data-id="${firstLevel}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 30 && st().levelId !== firstLevel; i++) await wait(100);
    report.photoStorey = st().levelId === firstLevel;
  } catch (err) {
    report.threw = String((err && err.stack) || err);
  }
  report.noErrors = errors.length ? errors.slice(0, 3).join(' | ') : true;
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
}());
