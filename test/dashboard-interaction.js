// Runs inside the web dashboard served by scripts/dev-server.js (see scripts/ui-check.js dashboard).
(async function () {
  const report = {};
  window.__report = report;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // A shader that does not compile only shows in the console, and leaves the rooms see-through.
    const consoleError = console.error;
    const shaderErrors = [];
    console.error = (...args) => { if (/Shader Error|WebGLProgram/.test(String(args[0]))) shaderErrors.push(String(args[0]).slice(0, 300)); consoleError.apply(console, args); };
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

    // A smoke detector shows its state beside the marker, and a tap names what it watches.
    const smokeMark = document.querySelector('.fp-device[data-id="i_s1"]');
    report.smokeValue = /OK/.test(smokeMark.textContent);
    press(smokeMark.querySelector('circle:nth-of-type(2)'));
    await wait(450);
    const smokeText = (document.querySelector('#quick .fp-quick-body') || {}).textContent || '';
    report.smokeQuick = /(Smoke|Rook)OK/.test(smokeText) && /(Heat|Hitte)OK/.test(smokeText) && /87%/.test(smokeText);
    st().devices.get('d_smoke').caps.alarm_smoke = null;
    window.dispatchEvent(new Event('fp-theme'));
    press(document.querySelector('.fp-device[data-id="i_s1"] circle:nth-of-type(2)'));
    await wait(450);
    report.smokeSilent = /(No report yet|Nog geen melding)/.test(document.querySelector('#quick .fp-quick-body').textContent);
    st().devices.get('d_smoke').caps.alarm_smoke = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Tapping a room in 2D moves in on it beside its card; closing the card moves back.
    press(document.querySelector('.fp-label[data-kind=room]'));
    await wait(650);
    report.roomFocus2d = !document.getElementById('sheet').hidden && st().zoom && st().zoom.k > 1.2 && document.getElementById('sheet').classList.contains('beside');
    document.getElementById('sheet-close').click();
    await wait(650);
    report.roomBack2d = !st().zoom;

    // Music: on the right with every speaker to choose from, a speaker as a picture on the plan.
    const media = document.getElementById('media');
    report.mediaRight = media.parentNode === document.getElementById('side') && /So What/.test(media.textContent) && /Kind of Blue/.test(media.textContent) && document.querySelectorAll('#media .fp-media-chip').length === 2;
    report.speakerBox2d = !!document.querySelector('image[href*="k-speakerSmall"]');
    document.querySelector('#media [data-p=speaker][data-dev=d_speaker]').click();
    await wait(100);
    report.mediaChoice = /Sonos/.test(document.querySelector('#media .fp-media-where').textContent) && !/So What/.test(media.textContent) && !media.hidden;
    document.querySelector('#media [data-p=speaker][data-dev=d_speaker2]').click();

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
    const cardBox = sheet.querySelector('.fp-sheet-card').getBoundingClientRect();
    const covered = [...document.querySelectorAll('.fp3-dev:not(.behind)')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.left > cardBox.left && r.right < cardBox.right && r.top > cardBox.top && r.bottom < cardBox.bottom)
      .every((r) => { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !hit || !hit.closest('.fp3-dev'); });
    report.sheetOverLabels = !!sheet && covered;
    // The card stands beside the room and the view moves in; closing it moves back.
    const v3 = st().v3d;
    const away = () => v3.camera.position.distanceTo(v3.controls.target);
    const near = away();
    report.roomFocus3d = !!v3.home && document.getElementById('sheet').classList.contains('beside') && v3.shift > 0;
    document.getElementById('sheet-close').click();
    await wait(200);
    report.roomBack3d = !v3.home && !v3.shift && away() > near * 1.1 && !document.getElementById('sheet').classList.contains('beside');

    // A value the tidy-up hid stays hidden through live updates, also when its own number changes.
    const plugBadge = document.querySelector('.fp3-dev[data-id="i_p1"]');
    const plugVal = plugBadge.querySelector('.fp3-val');
    v3.shownVals.delete('i_p1'); plugVal.style.visibility = 'hidden';
    v3.updateLive();
    report.valueKept = plugBadge.querySelector('.fp3-val') === plugVal && plugVal.style.visibility === 'hidden';
    st().devices.get('d_plug').caps.measure_power += 7;
    v3.updateLive();
    report.valueStaysHidden = plugBadge.querySelector('.fp3-val').style.visibility === 'hidden';
    v3.declutterNames();

    // A lamp lights its own room and leaves the room behind the wall alone. Measured on the real picture.
    const gl = v3.renderer.getContext();
    const pixel = (x, y) => {
      const p = new (v3.camera.position.constructor)(x * 0.01, 0.02, y * 0.01).project(v3.camera);
      const c = v3.renderer.domElement;
      v3.renderer.render(v3.scene, v3.camera);
      const px = new Uint8Array(4);
      gl.readPixels(Math.round((p.x + 1) / 2 * c.width), Math.round((p.y + 1) / 2 * c.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px[0] + px[1] + px[2];
    };
    const lvl = st().plan.levels[0];
    const lamp = lvl.items.find((i) => i.id === 'i_l1');
    const roomAt = (p) => lvl.rooms.find((r) => window.FloorplanCore.geom.pointInPolygon(p, r.points));
    const lampHome = roomAt([lamp.x, lamp.y]);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let nextRoom = null;
    for (let d = 40; d < 300 && !nextRoom; d += 10) for (const u of dirs) { const p = [lamp.x + u[0] * d, lamp.y + u[1] * d]; const r = roomAt(p); if (r && r !== lampHome) { nextRoom = [p[0] + u[0] * 30, p[1] + u[1] * 30]; break; } }
    const lampDev = st().devices.get(lamp.deviceId);
    lampDev.caps.onoff = false; v3.updateLive();
    await wait(100);
    const lampOff = [[[70, 70], [-70, 70], [70, -70], [-70, -70]].reduce((sum, o) => sum + pixel(lamp.x + o[0], lamp.y + o[1]), 0), pixel(nextRoom[0], nextRoom[1])];
    lampDev.caps.onoff = true; if ('dim' in lampDev.caps) lampDev.caps.dim = 1; v3.updateLive();
    await wait(100);
    // Far brighter than real, so a leak cannot hide in the daylight of the test.
    const bright = v3.lamps.find((l) => l.item.id === 'i_l1').light;
    bright.intensity *= 40;
    const lampOn = [[[70, 70], [-70, 70], [70, -70], [-70, -70]].reduce((sum, o) => sum + pixel(lamp.x + o[0], lamp.y + o[1]), 0), pixel(nextRoom[0], nextRoom[1])];
    const roomDecay = bright.decay;
    bright.decay = 1.6; // without its room the same lamp does shine through the wall
    const leak = pixel(nextRoom[0], nextRoom[1]);
    bright.decay = roomDecay;
    bright.intensity /= 40;
    report.lightStaysInRoom = !!nextRoom && lampOff[0] > 30 && lampOff[1] > 30 && lampOn[0] > lampOff[0] + 6 && Math.abs(lampOn[1] - lampOff[1]) <= 3 && leak > lampOff[1] + 6;
    report.lightMeasured = lampOff.concat(lampOn, [leak]).join(' ');
    report.noShaderErrors = shaderErrors.length === 0;

    // A speaker can be a box: a model in the room, no lamp.
    for (let i = 0; i < 30 && !(v3.holderOf('i_sp') && v3.holderOf('i_sp').children.length); i++) await wait(100);
    report.speakerBox3d = v3.holderOf('i_sp').children.length > 0 && !v3.lamps.some((l) => l.item.id === 'i_sp');
    // Outer walls know their outside: the walls between the camera and the house drop, the far ones stay up.
    const outer = v3.walls.filter((w) => w.exterior);
    const { cx, cz } = v3.bounds;
    report.wallsOutward = outer.length >= 4 && outer.every((w) => w.nx * (w.mesh.position.x - cx) + w.nz * (w.mesh.position.z - cz) > 0);
    const cam = v3.camera.position;
    const far = (w) => Math.hypot(w.mesh.position.x - cam.x, w.mesh.position.z - cam.z);
    const byDistance = outer.filter((w) => w.z0 < 0.01).sort((a, b) => far(a) - far(b));
    report.nearWallsLow = byDistance[0].target < byDistance[0].h && byDistance[byDistance.length - 1].target === byDistance[byDistance.length - 1].h;
    if (!report.nearWallsLow) report.wallsSeen = byDistance.map((w) => `${far(w).toFixed(1)}:${w.target.toFixed(2)}/${w.h.toFixed(2)}`).join(' ');
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

    // The camera on the side is chosen in the screen settings, or switched off.
    {
      st().devices.set('cam1', { id: 'cam1', name: 'Oprit', cls: 'camera', caps: {}, camera: '/api/image/c1' });
      st().devices.set('cam2', { id: 'cam2', name: 'Tuin', cls: 'camera', caps: {}, camera: '/api/image/c2' });
      document.querySelector('[data-tb="settings"]').click();
      for (let i = 0; i < 30 && !document.querySelector('#sheet-body [data-set="cameraPick"]'); i++) await wait(100);
      const pick = document.querySelector('#sheet-body [data-set="cameraPick"]');
      const opts = pick ? [...pick.options].map((o) => o.value) : [];
      const card = () => document.getElementById('cam-card');
      window.HomeyWeb.Homey.setSettings({ camera: 'cam2' });
      window.FpPanels.tick();
      const second = !card() || (!card().hidden && document.getElementById('cam-img').src.includes('/api/image/c2'));
      window.HomeyWeb.Homey.setSettings({ camera: 'off' });
      window.FpPanels.tick();
      const off = !card() || card().hidden;
      // A doorbell Flow still shows a camera over the screen
      const flow = window.FpPanels.showCamera() && !document.getElementById('camview').hidden;
      document.getElementById('camview').click();
      report.cameraChoice = opts.includes('cam1') && opts.includes('cam2') && opts.includes('off') && second && off && flow;
      if (!report.cameraChoice) report.cameraSeen = JSON.stringify({ opts, second, off, flow, card: !!card() });
      window.HomeyWeb.Homey.setSettings({ camera: undefined });
      st().devices.delete('cam1'); st().devices.delete('cam2');
      window.FpPanels.tick();
      document.getElementById('sheet').hidden = true;
    }

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
    report.attentionOpen = window.__extras.attention().some((a) => a.list === 'open');
    // The chips of the strip show the devices they are about
    door.caps.measure_battery = 9;
    await wait(1200);
    document.querySelector('#attention [data-list=battery]').click();
    report.batteryList = !document.getElementById('sheet').hidden && document.getElementById('sheet-body').textContent.includes(door.name) && /9%/.test(document.getElementById('sheet-body').textContent);
    document.querySelector('#attention [data-list=open]').click();
    report.openList = document.getElementById('sheet-body').textContent.includes(door.name) && !document.querySelector('#sheet-body [data-x=lights-off]');
    document.getElementById('sheet-close').click();
    delete door.caps.measure_battery;
    // I'm leaving: what is open, and all lamps off after a second tap
    const lit = anyDevice.filter((d) => d.cls === 'light' && d.caps.onoff === true);
    await wait(1200);
    // A lamp can stay on: untick it, and the button leaves it alone
    const stay = lit[0];
    document.querySelector('#actions [data-x=leave]').click();
    const box = document.querySelector(`[data-leave-lamp="${stay.id}"]`);
    box.click();
    report.leaveKeeps = window.HomeyWeb.Homey.getSettings().leaveKeep.includes(stay.id) && !document.querySelector(`[data-leave-lamp="${stay.id}"]`).checked;
    document.querySelector(`[data-leave-lamp="${stay.id}"]`).click();
    report.leaveKeepsBack = !window.HomeyWeb.Homey.getSettings().leaveKeep.includes(stay.id);
    document.getElementById('sheet-close').click();
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
