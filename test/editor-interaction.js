// Runs inside the editor harness page (see scripts/ui-check.js). Simulates pointer and keyboard input
// and writes a JSON report into <pre id="result">.
(async function () {
  const report = {};
  window.__report = report;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  try {
  const svg = document.getElementById('canvas');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const toClient = (p) => {
    const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
    const c = pt.matrixTransform(svg.getScreenCTM());
    return [c.x, c.y];
  };
  const fire = (type, p, extra) => {
    const [x, y] = toClient(p);
    // Like pointer capture: anything outside the canvas still goes to the canvas.
    const hit = document.elementFromPoint(x, y);
    const target = hit && svg.contains(hit) ? hit : svg;
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, ...(extra || {}) }));
  };
  const click = (p, extra) => { fire('pointerdown', p, extra); fire('pointerup', p, extra); };
  const drag = (a, b) => { fire('pointerdown', a); fire('pointermove', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); fire('pointermove', b); fire('pointerup', b); };
  const key = (k, extra) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...(extra || {}) }));
  const tool = (t) => document.querySelector(`[data-tool=${t}]`).click();
  const plan = () => JSON.parse(JSON.stringify(window.__editorState().plan));
  const lv = () => plan().levels[0];
  window.__report = report;

  // 1. Draw a room
  const rooms0 = lv().rooms.length;
  tool('room');
  drag([1400, 0], [1700, 300]);
  report.roomAdded = lv().rooms.length === rooms0 + 1;
  const newRoom = lv().rooms[lv().rooms.length - 1];
  report.roomSnapped = JSON.stringify(newRoom.points) === JSON.stringify([[1400, 0], [1700, 0], [1700, 300], [1400, 300]]);

  // 2. Door on its left wall (shared with the kitchen, x = 1300? no: the new room starts at 1400) -> its bottom wall
  tool('door');
  fire('pointermove', [1550, 302]);
  click([1550, 302]);
  const door = lv().openings[lv().openings.length - 1];
  report.doorOnWall = door.type === 'door' && Math.abs(door.y - 300) < 0.5 && Math.abs(door.x - 1550) <= 5;

  // 3. Furniture placed near a wall turns to face it; the catalogue keeps its place in the list
  tool('furniture');
  const panelEl = document.getElementById('panel');
  panelEl.scrollTop = 500;
  const scrolled = panelEl.scrollTop;
  document.querySelector('[data-action=pick-furniture][data-type=k-loungeSofa]').click();
  click([1550, 60]);
  report.catalogueStays = !!document.getElementById('furniture-search') && !!document.querySelector('.ed-selbar') && scrolled > 100 && Math.abs(panelEl.scrollTop - scrolled) < 5;
  const sofa = lv().items[lv().items.length - 1];
  const undoBeforeSofa = window.__editorState().undo.length - 1;
  report.sofaPlaced = sofa.type === 'k-loungeSofa' && sofa.w === 220;
  report.sofaFacesWall = sofa.rot === 0 && Math.abs(sofa.y - (0 + 6 + 45)) <= 1;

  // 3b. Resize with the corner handle, then with proportions kept
  tool('select');
  document.getElementById('zoom-fit').click();
  await wait(20);
  click([1550, 51]);
  await wait(20);
  const sofaNow = () => lv().items.find((i) => i.id === sofa.id);
  const corner = () => { const it = sofaNow(); return [it.x + it.w / 2, it.y + it.d / 2]; };
  let c0 = corner();
  drag(c0, [c0[0] + 40, c0[1]]);
  report.resizeWidth = sofaNow().w === 260 && sofaNow().d === 90 && sofaNow().x === 1570;
  window.__editorState().plan.levels[0].items.find((i) => i.id === sofa.id).lockRatio = true;
  c0 = corner();
  drag(c0, [c0[0] + 26, c0[1]]);
  report.resizeProportional = sofaNow().w === 286 && sofaNow().d === 99 && sofaNow().h === 88;
  key('z', { ctrlKey: true }); key('z', { ctrlKey: true });
  report.resizeUndo = sofaNow().w === 220;
  tool('furniture');

  // 3c. A table lamp put on the sofa's spot lands on top of it
  document.querySelector('[data-action=pick-furniture][data-type=k-lampRoundTable]').click();
  click([1550, 51]);
  const lamp = lv().items[lv().items.length - 1];
  report.lampOnFurniture = lamp.type === 'k-lampRoundTable' && lamp.z === 80;
  key('Delete');

  // 3b2. Copy and paste a piece at the mouse; cut removes it
  {
    tool('select');
    click([1550, 51]);
    const before = lv().items.length;
    key('c', { ctrlKey: true });
    fire('pointermove', [1450, 230]);
    key('v', { ctrlKey: true });
    const copy = lv().items[lv().items.length - 1];
    report.copyPaste = lv().items.length === before + 1 && copy.type === 'k-loungeSofa' && copy.id !== sofa.id && Math.abs(copy.x - 1450) <= 10 && Math.abs(copy.y - 230) <= 10;
    key('x', { ctrlKey: true });
    report.cut = lv().items.length === before && !lv().items.some((i) => i.id === copy.id);
    fire('pointermove', [1450, 250]);
    key('v', { ctrlKey: true });
    report.pasteAfterCut = lv().items.length === before + 1;
    key('Delete');
  }

  // 3d. Drag a piece from the catalogue onto the plan
  tool('furniture');
  const dt = new DataTransfer();
  const tile = document.querySelector('[data-action=pick-furniture][data-type=k-chair]');
  tile.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const [dxp, dyp] = toClient([1500, 220]);
  svg.parentNode.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: dxp, clientY: dyp, dataTransfer: dt }));
  svg.parentNode.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: dxp, clientY: dyp, dataTransfer: dt }));
  const dropped = lv().items[lv().items.length - 1];
  report.dragDrop = dropped.type === 'k-chair' && Math.abs(dropped.x - 1500) <= 10 && Math.abs(dropped.y - 220) <= 10;
  // Quarter turns with the buttons in the bar
  const rot0 = dropped.rot || 0;
  document.querySelector('.ed-selbar [data-action=rot-right]').click();
  const rot1 = lv().items.find((i) => i.id === dropped.id).rot;
  document.querySelector('.ed-selbar [data-action=rot-left]').click();
  document.querySelector('.ed-selbar [data-action=rot-left]').click();
  const rot2 = lv().items.find((i) => i.id === dropped.id).rot;
  report.quarterTurns = rot1 === (rot0 + 90) % 360 && rot2 === (rot0 + 270) % 360;
  key('Delete');

  // 4. Undo removes the sofa, redo brings it back
  // (also undoes everything after it: the lamp from 3c and the chair from 3d)
  while (window.__editorState().undo.length > undoBeforeSofa) key('z', { ctrlKey: true });
  report.undo = !lv().items.some((i) => i.id === sofa.id);
  key('y', { ctrlKey: true });
  report.redo = lv().items.some((i) => i.id === sofa.id);

  // 5. Wall with a typed length
  tool('wall');
  click([1400, 500]);
  fire('pointermove', [1600, 505]);
  for (const ch of '250') key(ch);
  key('Enter');
  const wall = lv().walls[lv().walls.length - 1];
  report.typedWall = wall && Math.round(Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])) === 250;
  key('Escape');

  // 6. Select the new room and drag a corner
  tool('select');
  document.getElementById('zoom-fit').click();
  click([1600, 150]);
  report.roomSelected = window.__editorState().sel && window.__editorState().sel.id === newRoom.id;
  await wait(20);
  drag([1700, 300], [1750, 350]);
  const moved = lv().rooms.find((r) => r.id === newRoom.id);
  report.vertexMoved = moved.points[2][0] === 1750 && moved.points[2][1] === 350;

  // 6b. A crooked corner is put straight with one button
  {
    const r = window.__editorState().plan.levels[0].rooms.find((x) => x.id === newRoom.id);
    r.points[1] = [r.points[1][0] + 12, r.points[1][1] + 9];
    document.querySelector('[data-action=room-straighten]').click();
    const pts = lv().rooms.find((x) => x.id === newRoom.id).points;
    report.straighten = pts.every((p, i) => { const q = pts[(i + 1) % pts.length]; return p[0] === q[0] || p[1] === q[1]; });
  }

  // 6c. An edge a few cm off the line of another wall (the kitchen's top, y = 0) is lined up with it
  {
    const r = window.__editorState().plan.levels[0].rooms.find((x) => x.id === newRoom.id);
    r.points[0][1] = 7; r.points[1][1] = 7;
    document.querySelector('[data-action=room-align]').click();
    const pts = lv().rooms.find((x) => x.id === newRoom.id).points;
    report.alignedToWall = pts[0][1] === 0 && pts[1][1] === 0;
  }

  // 6d. Dragging a corner lines it up with another corner that is off the grid
  {
    const r = window.__editorState().plan.levels[0].rooms.find((x) => x.id === newRoom.id);
    r.points[1] = [1707, 0];
    window.__editorState().sel = null;
    click([1550, 150]);
    await wait(20);
    const from = lv().rooms.find((x) => x.id === newRoom.id).points[2];
    drag(from, [1711, from[1] + 33]);
    const p2 = lv().rooms.find((x) => x.id === newRoom.id).points[2];
    report.cornerAligned = p2[0] === 1707;
  }

  // 6e. A room fixed in place does not move or go away; released, it can be deleted again
  {
    document.querySelector('[data-action=toggle-lock]').click();
    const before = JSON.stringify(lv().rooms.find((x) => x.id === newRoom.id).points);
    drag([1550, 150], [1600, 200]);
    key('Delete');
    const after = lv().rooms.find((x) => x.id === newRoom.id);
    report.lockedStays = !!after && after.locked === true && JSON.stringify(after.points) === before && !document.querySelector('[data-handle^="v:"]');
    document.querySelector('[data-action=toggle-lock]').click();
    report.unlocked = !lv().rooms.find((x) => x.id === newRoom.id).locked;
  }

  // 7. Delete the selected room
  key('Delete');
  report.deleted = !lv().rooms.some((r) => r.id === newRoom.id);

  // 8. Save happened (debounced)
  await wait(900);
  report.saved = document.getElementById('save-state').textContent;

  // 8b. Stairs from the catalogue; a colour tints a model's top view in 2D
  {
    tool('furniture');
    document.querySelector('[data-action=pick-furniture][data-type=own-stairs]').click();
    click([1100, 250]);
    const st = lv().items[lv().items.length - 1];
    report.stairsPlaced = st.type === 'own-stairs' && !!svg.querySelector(`[data-kind=item][data-id="${st.id}"] polygon`);
    tool('select');
    const s = window.__editorState();
    const model = s.plan.levels[0].items.find((i) => i.kind === 'furniture' && /^(k|kk|q)-/.test(i.type));
    model.color = '#c0392b';
    key('Escape');
    report.colour2d = !!svg.querySelector('filter[id^="e-tint"]') && !!svg.querySelector(`[data-id="${model.id}"] image[style*="url(#e-tint"]`);
  }

  // 9. 2.5D preview renders solids
  document.getElementById('view-3d').click();
  for (let i = 0; i < 40 && !document.querySelector('#ed-3d .fp3-room'); i++) await wait(100);
  report.preview = !document.getElementById('ed-3d').hidden && !!document.querySelector('#ed-3d .fp3-canvas') && document.querySelectorAll('#ed-3d .fp3-room').length >= 6;

  // 9b. In 3D: tapping a device selects it with its panel, dragging moves it; the thermostat has a display
  {
    const v = window.__editorState().v3d;
    report.thermostat3d = !!v && v.displays.length >= 1;
    v.hooks.tap('item', 'i_t1');
    report.select3d = window.__editorState().sel && window.__editorState().sel.id === 'i_t1' && !!document.querySelector('#panel [data-path="sel.deviceId"]') && !!v.selBox;
    const fx = document.querySelector('#panel [data-action=pick-fixture][data-type=fx-thermostat]');
    report.thermostatModel = !!fx && fx.classList.contains('on') && !!document.querySelector('#panel [data-action=pick-fixture][data-type=none]');
    const to = v.hooks.drag('i_t1', 640, 250, true);
    v.hooks.dragEnd('i_t1', true);
    const t1 = lv().items.find((i) => i.id === 'i_t1');
    report.drag3d = !!to && t1.x === 640 && t1.y === 250;
  }

  // 10. Calendars: add one, fill it in, save
  document.getElementById('view-2d').click();
  tool('calendar');
  document.querySelector('[data-action=cal-add]').click();
  const url = document.querySelector('[data-cal="0"][data-key=url]');
  url.value = 'https://example.com/basic.ics';
  url.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-action=cal-save]').click();
  await wait(100);
  const savedCals = window.__calendars || await (await fetch('/api/calendars')).json();
  report.calendarSaved = Array.isArray(savedCals) && savedCals[0].url === 'https://example.com/basic.ics';

  // 11. Recognise a floor plan picture (set by scripts/ui-check.js), check the draft and use it
  if (window.__testPlanPng) {
    document.getElementById('view-2d').click();
    const lvl = window.__editorState().plan.levels[0];
    lvl.background = { src: window.__testPlanPng, x: -120, y: -120, w: 1540, h: 1040, ratio: 1040 / 1540, opacity: 0.5, calibrated: true };
    tool('picture');
    document.querySelector('[data-action=detect-run]').click();
    for (let i = 0; i < 150 && !window.__editorState().detection; i++) await wait(100);
    const det = window.__editorState().detection;
    report.recogniseDraft = !!det && det.rooms.length === 6 && det.openings.filter((o) => o.type === 'door').length === 6 && det.openings.filter((o) => o.type === 'window').length === 3;
    report.recogniseOverlay = document.querySelectorAll('.ed-overlay polygon[stroke-dasharray]').length >= 6;
    const zoneSelect = document.querySelector('[data-detect-zone="0"]');
    zoneSelect.value = 'z_hall';
    zoneSelect.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-action=detect-apply]').click();
    const after = lv();
    const near = (a, b) => Math.abs(a - b) <= 5;
    const box = (pts) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
    report.recogniseApplied = after.rooms.length === 6 && after.openings.length === 9
      && after.rooms.some((r) => { const b = box(r.points); return near(b[0], 0) && near(b[1], 300) && near(b[2], 300) && near(b[3], 800); })
      && after.rooms.some((r) => r.zoneId === 'z_hall' && r.name === 'hall');
  }

  // A room gets another shape: a plus on an edge makes a corner, the button an L-shape
  {
    const shaped = lv().rooms.find((r) => r.points.length === 4 && !r.locked);
    window.__editorState().sel = { kind: 'room', id: shaped.id };
    document.querySelector('[data-tool=select]').click();
    window.__editorState().sel = { kind: 'room', id: shaped.id };
    window.dispatchEvent(new Event('resize'));
    await wait(100);
    const plus = document.querySelector('[data-handle="m:0"]');
    report.cornerPlus = !!plus;
    const box = plus.getBoundingClientRect();
    const o = { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 1, button: 0 };
    plus.dispatchEvent(new PointerEvent('pointerdown', o));
    svg.dispatchEvent(new PointerEvent('pointermove', { ...o, clientY: o.clientY + 30 }));
    svg.dispatchEvent(new PointerEvent('pointerup', { ...o, clientY: o.clientY + 30 }));
    await wait(50);
    report.cornerAdded = shaped.points.length === 5 || lv().rooms.find((r) => r.id === shaped.id).points.length === 5;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(50);
    window.__editorState().sel = { kind: 'room', id: shaped.id };
    const again = lv().rooms.find((r) => r.id === shaped.id);
    if (again.points.length === 4) {
      document.querySelector('[data-tool=select]').click();
      window.__editorState().sel = { kind: 'room', id: shaped.id };
      window.dispatchEvent(new Event('resize'));
    }
    report.lShapeReady = again.points.length === 4;
  }

  // An own photo of the house: chosen as a file, a click area drawn on it, and undone
  {
    const plan = () => window.__editorState().plan;
    document.querySelector('[data-tool=house]').click();
    await wait(200);
    const c = document.createElement('canvas');
    c.width = 3200; c.height = 1600;
    c.getContext('2d').fillRect(0, 0, 3200, 1600);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const files = new DataTransfer();
    files.items.add(new File([blob], 'house.png', { type: 'image/png' }));
    const input = document.getElementById('house-photo');
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 50 && document.getElementById('ed-photo').hidden; i++) await wait(100);
    const photo = plan().house && plan().house.photo;
    report.photoLoaded = !!photo && /^data:image\/jpeg/.test(photo.src) && Math.abs(photo.ratio - 0.5) < 0.01 && !document.getElementById('ed-photo').hidden;
    document.querySelector('[data-action=photo-area][data-kind=solar]').click();
    const area = document.getElementById('ed-photo-svg');
    const at = (fx, fy) => {
      const m = area.getScreenCTM();
      const box = area.viewBox.baseVal;
      area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: m.a * fx * box.width + m.e, clientY: m.d * fy * box.height + m.f }));
    };
    at(0.2, 0.2); at(0.6, 0.2); at(0.6, 0.5); at(0.2, 0.5);
    report.photoDraft = area.querySelectorAll('circle').length === 4;
    at(0.2, 0.2); // the first corner again closes it
    await wait(100);
    const drawn = plan().house.photo.areas;
    report.photoArea = drawn.length === 1 && drawn[0].kind === 'solar' && drawn[0].pts.length === 4 && Math.abs(drawn[0].pts[1][0] - 0.6) < 0.01 && Math.abs(drawn[0].pts[2][1] - 0.5) < 0.01;
    report.photoCard = !!area.querySelector('.fp-harea[data-house="solar"]');
    // Redrawing replaces it; Esc stops without a change
    document.querySelector('[data-action=photo-area][data-kind=solar]').click();
    at(0.1, 0.1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    report.photoEscape = plan().house.photo.areas.length === 1 && !window.__editorState().photoDraft && window.__editorState().tool === 'house';
    document.querySelector('[data-action=photo-remove]').click();
    await wait(100);
    report.photoRemoved = !plan().house.photo && document.getElementById('ed-photo').hidden;
  }

  // Forum wishes: an open wall, a device in two places, a curved wall, the order of the levels
  {
    const S = window.__editorState();
    const core = window.FloorplanCore;
    const act = (a, extra) => document.querySelector(`[data-action=${a}]${extra || ''}`).click();
    S.sel = null; tool('select');
    await wait(50);
    const level = S.plan.levels.find((l) => l.id === S.levelId);
    level.rooms.push({ id: 'k1', name: 'K', points: core.geom.rect(3000, 0, 3400, 400) }, { id: 'k2', name: 'W', points: core.geom.rect(3400, -100, 3900, 600) });
    level.openings = level.openings.filter((o) => o.x < 3000);
    const before = level.openings.length;
    S.cam = [2900, -200, 1100, 900];
    tool('passage');
    await wait(50);
    report.passagePanel = /Open/.test(document.getElementById('panel').textContent);
    click([3400, 100]);
    await wait(100);
    const open = S.plan.levels.find((l) => l.id === S.levelId).openings.slice(-1)[0];
    report.passagePlaced = S.plan.levels.find((l) => l.id === S.levelId).openings.length === before + 1 && open.type === 'passage' && open.width === 200;
    act('passage-whole');
    await wait(100);
    const whole = S.plan.levels.find((l) => l.id === S.levelId).openings.slice(-1)[0];
    report.passageWhole = whole.width === 400 && Math.abs(whole.y - 200) < 0.2;
    const walls = core.levelWalls(S.plan.levels.find((l) => l.id === S.levelId)).filter((w) => w.a[0] === 3400 && w.b[0] === 3400);
    const left = walls.flatMap((w) => core.wallPieces(w, [whole], { wallHeight: 260 }, true));
    report.passageGone = left.length > 0 && left.every((p) => Math.max(p.a[1], p.b[1]) <= 0.5 || Math.min(p.a[1], p.b[1]) >= 399.5);

    // A device in a second place
    const l0 = S.plan.levels.find((l) => l.id === S.levelId);
    const dev = [...S.devices.values()][0];
    l0.items.push({ id: 'twice', kind: 'device', deviceId: dev.id, x: 3200, y: 200 });
    tool('select');
    await wait(50);
    click([3200, 200]);
    const count = () => S.plan.levels.flatMap((l) => l.items).filter((i) => i.deviceId === dev.id).length;
    const was = count();
    await wait(100);
    act('place-again');
    await wait(100);
    report.placedTwice = count() === was + 1;

    // A curved wall
    const cur = S.plan.levels.find((l) => l.id === S.levelId);
    cur.walls.push({ id: 'bendme', a: [3000, 550], b: [3400, 550] });
    tool('select');
    await wait(50);
    click([3200, 550]);
    await wait(100);
    act('wall-bend', '[data-side="1"]');
    await wait(100);
    const after = S.plan.levels.find((l) => l.id === S.levelId).walls.filter((w) => w.a[1] !== 0);
    report.curved = !after.some((w) => w.id === 'bendme') && after.filter((w) => Math.max(w.a[1], w.b[1]) > 550).length >= 8;

    // The order of the levels
    S.sel = null; tool('select');
    if (S.plan.levels.length < 2) { document.getElementById('level-add').click(); await wait(100); }
    const first = S.plan.levels[0].id;
    S.levelId = first; S.sel = null; document.querySelector('#level-tabs button').click();
    await wait(100);
    act('level-higher');
    await wait(100);
    report.levelMoved = S.plan.levels[1].id === first && document.querySelectorAll('#level-tabs button')[1].dataset.level === first;
    act('level-lower');
    await wait(100);
    report.levelBack = S.plan.levels[0].id === first;
  }

  } catch (err) {
    report.threw = String(err && err.stack || err);
  }
  report.noErrors = errors.length ? errors.slice(0, 3).join(' | ') : true;
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
}());
