// Runs inside the widget harness page (see scripts/ui-check.js widget). Writes a report into <pre id="result">.
(async function () {
  const report = {};
  window.__report = report;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = () => window.__widgetState();
  const dev = (id) => st().devices.get(id);
  const marker = (itemId) => document.querySelector(`.fp-device[data-id="${itemId}"] circle:nth-of-type(2)`) || document.querySelector(`.fp-device[data-id="${itemId}"] circle`);
  const press = (el, holdMs) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    // Like a real finger: release on whatever is under the pointer now (the SVG may have re-rendered).
    return wait(holdMs || 0).then(() => (document.elementFromPoint(o.clientX, o.clientY) || el).dispatchEvent(new PointerEvent('pointerup', o)));
  };
  window.__report = report;

  // Tap a light: its controls open next to it (switch and dimmer); the switch there turns it off.
  const before = dev('d_light_living').caps.onoff;
  await press(marker('i_l1'));
  await wait(450);
  const quick = document.getElementById('quick');
  report.quickOpens = !!quick && !quick.hidden && !!quick.querySelector('[data-act=toggle][data-cap=onoff]') && !!quick.querySelector('input[data-cap=dim]');
  report.tapDoesNotSwitch = dev('d_light_living').caps.onoff === before;
  quick.querySelector('[data-act=toggle][data-cap=onoff]').click();
  report.tapToggles = dev('d_light_living').caps.onoff === !before;
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  report.quickCloses = quick.hidden;
  report.nameTags = [...document.querySelectorAll('.fp-device text')].some((t) => t.textContent === 'Living lamp');

  // Hold a light: its popup opens with a brightness slider.
  await press(marker('i_l2'), 600);
  await wait(50);
  report.holdOpensSheet = !document.getElementById('sheet').hidden && !!document.querySelector('#sheet-body input[data-cap=dim]');
  document.getElementById('sheet-close').click();

  // Tap a room: the room card opens with its devices.
  const room = document.querySelector('.fp-label[data-id="r_living"]');
  await press(room);
  await wait(450);
  report.roomCard = !document.getElementById('sheet').hidden && document.getElementById('sheet-title').textContent === 'Living room';
  // Thermostat +: target goes up by 0.5.
  const t0 = dev('d_thermo').caps.target_temperature;
  document.querySelector('#sheet-body [data-act=step][data-step="0.5"]').click();
  report.targetUp = dev('d_thermo').caps.target_temperature === t0 + 0.5;
  document.getElementById('sheet-close').click();

  // The lock asks for a second tap before unlocking.
  const door = document.querySelector('[data-kind=opening][data-id="o_front"]');
  await press(door);
  await wait(450);
  const lockBtn = () => document.querySelector('#quick:not([hidden]) [data-act=lock], #sheet-body [data-act=lock]');
  report.lockSheet = !!lockBtn();
  lockBtn().click();
  report.unlockNeedsConfirm = dev('d_lock').caps.locked === true;
  lockBtn().click();
  report.unlocked = dev('d_lock').caps.locked === false;

  // Realtime updates re-render.
  window.__fakeHomey.emit('caps', { d_light_hall: { onoff: true } });
  await wait(50);
  report.realtime = dev('d_light_hall').caps.onoff === true;

  // Agenda in the side panel (harness settings enable it)
  await wait(100);
  report.agenda = document.querySelectorAll('#agenda .fp-aev').length >= 3;

  } catch (err) {
    report.threw = String(err && err.stack || err);
  }
  report.noErrors = errors.length ? errors.slice(0, 3).join(' | ') : true;
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
}());
