/* global FloorplanCore */
'use strict';

(function () {
  const core = FloorplanCore;
  const G = core.geom;
  const MODELS = window.FloorplanModels;
  const LANG = (navigator.language || 'en').slice(0, 2) === 'nl' ? 'nl' : 'en';
  const nameOf = (entry) => (entry ? entry.name[LANG] || entry.name.en : '');

  /* ----------------------------------------------------------------- i18n */

  const STRINGS = {
    en: {
      newPlan: 'New plan', saved: 'Saved', saving: 'Saving…', unsaved: 'Not saved', saveFailed: 'Save failed',
      level: 'Level', name: 'Name', wallHeight: 'Wall height (cm)', wallThickness: 'Wall thickness (cm)', zone: 'Homey zone', none: '— none —',
      roomsFromZones: 'Rooms from Homey', place: 'Place', allPlaced: 'Every zone has a room on this level.',
      plan: 'Plan', deleteLevel: 'Delete level', deletePlan: 'Delete plan', confirmAgain: 'Click again to confirm',
      startFromZones: 'Start from Homey zones', startBlank: 'Start blank', startNote: 'Zones with sub-zones become levels; their sub-zones become rooms you can drag into place.',
      room: 'Room', floorColour: 'Floor colour', themeColour: 'Theme colour', tempFrom: 'Temperature from', humFrom: 'Humidity from', climate: 'Thermostat',
      zoneAverage: 'Average of the zone', area: 'Area', delete: 'Delete',
      device: 'Device', shape: 'Shape', auto: 'Automatic', mount: 'Sits', ceiling: 'Ceiling', wall: 'Wall', floor: 'Floor',
      reach: 'Light reach (cm)', showValue: 'Show value beside it', label: 'Label',
      furniture: 'Furniture', width: 'Width', depth: 'Depth', height: 'Height', elevation: 'Above the floor', rotation: 'Rotation (°)', colour: 'Colour',
      door: 'Door', window: 'Window', type: 'Type', flipSwing: 'Flip swing', flipHinge: 'Flip hinge', shows: 'Shows (linked devices)', noLinkable: 'No contact sensors, locks or covers found.',
      freeWall: 'Wall', length: 'Length (cm)', thickness: 'Thickness (cm)',
      catalogue: 'Pieces near a wall turn to face it (Shift: place freely). R rotates 15°.',
      devices: 'Devices', search: 'Search devices', placeAll: 'Place all', unplaced: 'Not on the plan yet', elsewhere: 'Elsewhere',
      devicesNote: 'Click a device, then click on the plan. Lights go on the ceiling, plugs and sensors on walls.',
      doorNote: 'Click on a wall to place a door. Drag it along the wall later; flip swing and hinge in the panel.',
      windowNote: 'Click on a wall to place a window. Link blinds or curtains to show how far they are closed.',
      measureNote: 'Drag to measure a distance.',
      picture: 'Trace a picture', pictureNote: 'Add a scan or photo of a floor plan, then measure a line of known length to set its scale.',
      addPicture: 'Add picture', opacity: 'Opacity', setScale: 'Set scale by measuring', removePicture: 'Remove picture',
      realLength: 'Real length of the measured line (cm)', apply: 'Apply', measured: 'Measured',
      hintSelect: 'Click: select · drag: move · double-click an edge: add a corner · Alt-click a corner: remove it · Ctrl+C / Ctrl+V: copy and paste · Delete: remove · Space+drag: pan',
      hintRoom: 'Drag to draw a room. Rooms placed against each other share a wall.',
      hintWall: 'Click to place corners. Type a length and press Enter for an exact wall. Esc or double-click finishes.',
      hintPlace: 'Click on the plan to place it. Esc cancels.',
      preview: 'Preview — switch back to 2D to edit.',
      levelName: 'Level', roomName: 'Room',
      lampType: 'Kind of lamp', keepRatio: 'Keep proportions', searchFurniture: 'Search furniture', modelsBy: 'Models', drop: 'Hangs down (cm)',
      size: 'Size (cm)', standsOn: 'Stands on furniture at (cm)', preview3d: '3D: click a device or piece to change it in the panel, drag the selected one to move it. Drag elsewhere to look around, scroll to zoom.',
      resizeHint: 'Drag the corners to resize; the dot in front turns it. Shift keeps proportions.',
      groupNote: 'A group of devices (group app): it is placed as one lamp, and a tap switches the whole group.', asLamp: 'Show as a lamp', notLamp: 'No lamp, just a badge', groupWord: 'group',
      horizontal: 'Horizontal', vertical: 'Vertical', straighten: 'Straighten walls',
      lock: 'Fix in place', unlock: 'Release', lockedNote: 'Fixed in place: it cannot be moved or reshaped by accident.', lockAll: 'Fix rooms and walls in place',
      align: 'Line up with other walls', alignAll: 'Line up all walls', model: 'Shown as', badgeOnly: 'Only a badge',
      placed: 'Placed', properties: 'Properties', turnLeft: 'Turn left (90°)', turnRight: 'Turn right (90°)', dragHint: 'Drag a piece onto the plan, or click it and then click on the plan.',
      pdfLoading: 'Reading the PDF…', pdfPages: 'Pages in the PDF', pdfPick: 'Click the page for this level.', pdfAll: 'One page per level', pdfFailed: 'This PDF could not be read', page: 'Page', levelWord: 'Level',
      recognise: 'Recognise floor plan', recogniseNote: 'Finds walls, rooms, doors and windows in the picture. Works best with a clean drawing (estate agent, architect). Everything happens in this browser; the picture is not sent anywhere.',
      recogniseRun: 'Recognise', recognising: 'Recognising…', scaleFirst: 'Set the scale first (measure a line of known length), so the sizes are right.',
      found: 'Found', roomsWord: 'rooms', doorsWord: 'doors', windowsWord: 'windows', nothingFound: 'No rooms found. Try another darkness, or a clearer picture.',
      replaceExisting: 'Replace the rooms, doors and windows of this level', applyDraft: 'Use this', discard: 'Discard', darkness: 'Darkness of walls', auto: 'Automatic',
      checkDraft: 'Check the draft on the plan, choose the Homey zone per room, then use it. You can change everything afterwards.',
      calendars: 'Calendars', calendarsNote: 'Paste an iCal link (for Google Calendar: Settings → your calendar → "Secret address in iCal format"). The widget shows upcoming events in its side panel. Links stay on your Homey.',
      addCalendar: 'Add calendar', calendarUrl: 'iCal link', save: 'Save', calendarsSaved: 'Calendars saved', remove: 'Remove',
    },
    nl: {
      newPlan: 'Nieuwe plattegrond', saved: 'Opgeslagen', saving: 'Opslaan…', unsaved: 'Niet opgeslagen', saveFailed: 'Opslaan mislukt',
      level: 'Verdieping', name: 'Naam', wallHeight: 'Muurhoogte (cm)', wallThickness: 'Muurdikte (cm)', zone: 'Homey-zone', none: '— geen —',
      roomsFromZones: 'Kamers uit Homey', place: 'Plaatsen', allPlaced: 'Elke zone heeft een kamer op deze verdieping.',
      plan: 'Plattegrond', deleteLevel: 'Verdieping verwijderen', deletePlan: 'Plattegrond verwijderen', confirmAgain: 'Klik nogmaals om te bevestigen',
      startFromZones: 'Beginnen vanuit Homey-zones', startBlank: 'Leeg beginnen', startNote: 'Zones met subzones worden verdiepingen; hun subzones worden kamers die je op hun plek sleept.',
      room: 'Kamer', floorColour: 'Vloerkleur', themeColour: 'Themakleur', tempFrom: 'Temperatuur van', humFrom: 'Luchtvochtigheid van', climate: 'Thermostaat',
      zoneAverage: 'Gemiddelde van de zone', area: 'Oppervlakte', delete: 'Verwijderen',
      device: 'Apparaat', shape: 'Vorm', auto: 'Automatisch', mount: 'Zit', ceiling: 'Plafond', wall: 'Muur', floor: 'Vloer',
      reach: 'Bereik van het licht (cm)', showValue: 'Waarde ernaast tonen', label: 'Label',
      furniture: 'Meubels', width: 'Breedte', depth: 'Diepte', height: 'Hoogte', elevation: 'Boven de vloer', rotation: 'Draaiing (°)', colour: 'Kleur',
      door: 'Deur', window: 'Raam', type: 'Soort', flipSwing: 'Draairichting omkeren', flipHinge: 'Scharnier omkeren', shows: 'Toont (gekoppelde apparaten)', noLinkable: 'Geen contactsensoren, sloten of zonwering gevonden.',
      freeWall: 'Muur', length: 'Lengte (cm)', thickness: 'Dikte (cm)',
      catalogue: 'Bij een muur draait het er vanzelf naartoe (Shift: vrij plaatsen). R draait 15°.',
      devices: 'Apparaten', search: 'Apparaat zoeken', placeAll: 'Alles plaatsen', unplaced: 'Nog niet op de plattegrond', elsewhere: 'Elders',
      devicesNote: 'Klik op een apparaat en daarna op de plattegrond. Lampen komen op het plafond, stekkers en sensoren op muren.',
      doorNote: 'Klik op een muur om een deur te plaatsen. Sleep hem later langs de muur; draairichting en scharnier pas je aan in het paneel.',
      windowNote: 'Klik op een muur om een raam te plaatsen. Koppel zonwering of gordijnen om te tonen hoe ver ze dicht zijn.',
      measureNote: 'Sleep om een afstand te meten.',
      picture: 'Afbeelding overtrekken', pictureNote: 'Voeg een scan of foto van een plattegrond toe en meet daarna een lijn met bekende lengte om de schaal te zetten.',
      addPicture: 'Afbeelding toevoegen', opacity: 'Doorzichtigheid', setScale: 'Schaal zetten door te meten', removePicture: 'Afbeelding verwijderen',
      realLength: 'Echte lengte van de gemeten lijn (cm)', apply: 'Toepassen', measured: 'Gemeten',
      hintSelect: 'Klik: selecteren · slepen: verplaatsen · dubbelklik op een rand: hoek toevoegen · Alt-klik op een hoek: verwijderen · Ctrl+C / Ctrl+V: kopiëren en plakken · Delete: verwijderen · Spatie+slepen: verschuiven',
      hintRoom: 'Sleep om een kamer te tekenen. Kamers die tegen elkaar liggen delen een muur.',
      hintWall: 'Klik om hoeken te zetten. Typ een lengte en druk Enter voor een exacte muur. Esc of dubbelklik stopt.',
      hintPlace: 'Klik op de plattegrond om te plaatsen. Esc annuleert.',
      preview: 'Voorbeeld — schakel terug naar 2D om te bewerken.',
      levelName: 'Verdieping', roomName: 'Kamer',
      lampType: 'Soort lamp', keepRatio: 'Verhoudingen behouden', searchFurniture: 'Meubels zoeken', modelsBy: 'Modellen', drop: 'Hangt omlaag (cm)',
      size: 'Maat (cm)', standsOn: 'Staat op meubel op (cm)', preview3d: '3D: klik op een apparaat of meubel om het in het paneel aan te passen, sleep het geselecteerde om het te verplaatsen. Elders slepen draait de camera, scrollen zoomt.',
      resizeHint: 'Sleep aan de hoeken om de maat te wijzigen; met het bolletje ervoor draai je hem. Shift houdt de verhoudingen.',
      groupNote: 'Een groep apparaten (groeps-app): hij staat er als één lamp, en tikken schakelt de hele groep.', asLamp: 'Als lamp tonen', notLamp: 'Geen lamp, alleen een badge', groupWord: 'groep',
      horizontal: 'Horizontaal', vertical: 'Verticaal', straighten: 'Muren recht zetten',
      lock: 'Vastzetten', unlock: 'Losmaken', lockedNote: 'Vastgezet: je kunt hem niet per ongeluk verplaatsen of vervormen.', lockAll: 'Kamers en muren vastzetten',
      align: 'Uitlijnen met andere muren', alignAll: 'Alle muren uitlijnen', model: 'Weergave', badgeOnly: 'Alleen een badge',
      placed: 'Geplaatst', properties: 'Eigenschappen', turnLeft: 'Linksom draaien (90°)', turnRight: 'Rechtsom draaien (90°)', dragHint: 'Sleep een meubel op de plattegrond, of klik erop en daarna op de plattegrond.',
      pdfLoading: 'PDF wordt gelezen…', pdfPages: "Pagina's in de PDF", pdfPick: 'Klik op de pagina voor deze verdieping.', pdfAll: 'Elke pagina op een eigen verdieping', pdfFailed: 'Deze PDF kon niet worden gelezen', page: 'Pagina', levelWord: 'Verdieping',
      recognise: 'Plattegrond herkennen', recogniseNote: 'Zoekt muren, kamers, deuren en ramen in de afbeelding. Werkt het best met een strakke tekening (makelaar, architect). Alles gebeurt in deze browser; de afbeelding wordt nergens heen gestuurd.',
      recogniseRun: 'Herkennen', recognising: 'Bezig met herkennen…', scaleFirst: 'Zet eerst de schaal (meet een lijn met bekende lengte), dan kloppen de maten.',
      found: 'Gevonden', roomsWord: 'kamers', doorsWord: 'deuren', windowsWord: 'ramen', nothingFound: 'Geen kamers gevonden. Probeer een andere donkerte, of een duidelijkere afbeelding.',
      replaceExisting: 'Kamers, deuren en ramen van deze verdieping vervangen', applyDraft: 'Gebruiken', discard: 'Weggooien', darkness: 'Donkerte van de muren', auto: 'Automatisch',
      checkDraft: 'Bekijk het concept op de plattegrond, kies per kamer de Homey-zone en gebruik het. Je kunt daarna alles nog aanpassen.',
      calendars: "Agenda's", calendarsNote: 'Plak een iCal-link (Google Agenda: Instellingen → je agenda → "Geheim adres in iCal-indeling"). De widget toont de komende afspraken in het zijpaneel. Links blijven op je Homey.',
      addCalendar: 'Agenda toevoegen', calendarUrl: 'iCal-link', save: 'Opslaan', calendarsSaved: "Agenda's opgeslagen", remove: 'Verwijderen',
    },
  };
  const T = STRINGS[(navigator.language || 'en').slice(0, 2)] || STRINGS.en;

  /* ---------------------------------------------------------------- state */

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = $('canvas');

  const S = {
    Homey: null,
    plans: [],
    plan: null,
    levelId: null,
    devices: new Map(),
    zones: [],
    tool: 'select',
    sel: null, // { kind: 'room'|'item'|'opening'|'wall', id }
    cam: [-100, -100, 1400, 1000],
    snap: true,
    grid: true,
    showFurniture: true,
    preview: null, // null or 'iso'
    turn: 0,
    undo: [],
    redo: [],
    drag: null,
    hover: null, // plan point under the cursor
    guides: null, // alignment lines while drawing or dragging: [[from, to]]
    ghost: null, // door/window preview
    wallDraft: null, // { points: [[x,y]], typed: '' }
    pendingFurniture: null,
    pendingDevice: null,
    measure: null, // { a, b }
    calibrating: false,
    creating: false,
    armed: null, // id of a delete button waiting for a second click
    deviceSearch: '',
    furnitureSearch: '',
    scrolls: {}, // scroll position of the panel, per kind of panel
    panelKey: null,
    pdfPages: null, // pages of a chosen PDF: [{ src, w, h, thumb }]
    pdfStatus: '',
    detection: null, // draft from a recognised picture: { rooms, openings, wallThickness, zones, replace }
    detecting: false,
    detectDarkness: '',
    calendars: [],
    calendarsNote: '',
    spaceDown: false,
    saveTimer: null,
  };

  const level = () => (S.plan ? S.plan.levels.find((l) => l.id === S.levelId) || S.plan.levels[0] : null);

  function api(method, path, body) {
    return new Promise((resolve, reject) => {
      S.Homey.api(method, path, body === undefined ? null : body, (err, res) => (err ? reject(err) : resolve(res)));
    });
  }

  /* --------------------------------------------------------- undo / save */

  function snapshot() {
    S.undo.push(JSON.stringify(S.plan));
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
  }

  function commit(fn) {
    snapshot();
    fn();
    changed();
  }

  function changed(opts) {
    scheduleSave();
    draw();
    if (!opts || opts.panel !== false) renderPanel();
    updateButtons();
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(S.plan));
    S.plan = JSON.parse(from.pop());
    if (!S.plan.levels.some((l) => l.id === S.levelId)) S.levelId = S.plan.levels[0].id;
    S.sel = null;
    changed();
    renderLevels();
  }

  function scheduleSave() {
    setSaveState(T.unsaved);
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(save, 700);
  }

  async function save() {
    if (!S.plan) return;
    setSaveState(T.saving);
    try {
      await api('PUT', `/plans/${encodeURIComponent(S.plan.id)}`, S.plan);
      const i = S.plans.findIndex((p) => p.id === S.plan.id);
      if (i >= 0) S.plans[i] = S.plan; else S.plans.push(S.plan);
      setSaveState(T.saved);
    } catch (err) {
      setSaveState(`${T.saveFailed}: ${err.message || err}`);
    }
  }

  function setSaveState(text) { $('save-state').textContent = text; }

  /* --------------------------------------------------------------- camera */

  function scale() {
    const r = svg.getBoundingClientRect();
    return Math.max(S.cam[2] / (r.width || 1), S.cam[3] / (r.height || 1));
  }

  function toPlan(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  }

  function fit() {
    const lv = level();
    const pts = [];
    if (lv) {
      for (const r of lv.rooms) pts.push(...r.points);
      for (const w of lv.walls) pts.push(w.a, w.b);
      for (const i of lv.items) pts.push([i.x, i.y]);
      if (lv.background) pts.push([lv.background.x, lv.background.y], [lv.background.x + lv.background.w, lv.background.y + lv.background.h]);
    }
    if (!pts.length) pts.push([0, 0], [1000, 700]);
    const b = G.bbox(pts);
    const r = svg.getBoundingClientRect();
    const aspect = (r.width || 4) / (r.height || 3);
    let w = Math.max(b.w, 300) * 1.2; let h = Math.max(b.h, 300) * 1.2;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    S.cam = [b.minX + b.w / 2 - w / 2, b.minY + b.h / 2 - h / 2, w, h];
  }

  function zoomAt(p, factor) {
    const [x, y, w, h] = S.cam;
    const nw = Math.min(Math.max(w * factor, 80), 20000);
    const k = nw / w;
    S.cam = [p[0] - (p[0] - x) * k, p[1] - (p[1] - y) * k, nw, h * k];
    draw();
  }

  /* ------------------------------------------------------------- snapping */

  function snapPoint(p, ev, opts) {
    const o = opts || {};
    if (o.align) S.guides = null;
    const on = S.snap !== !!(ev && ev.shiftKey);
    if (!on) return { p: [Math.round(p[0]), Math.round(p[1])] };
    const lv = level();
    const tol = 12 * scale();
    let best = null; let bestD = tol;
    for (const r of lv.rooms) {
      r.points.forEach((q, i) => {
        if (o.skipRoom === r.id && (o.skipIndex == null || o.skipIndex === i)) return;
        const d = G.dist(p, q);
        if (d < bestD) { bestD = d; best = { p: [...q], kind: 'corner' }; }
      });
    }
    for (const w of lv.walls) {
      for (const q of [w.a, w.b]) {
        if (o.skipWall === w.id) continue;
        const d = G.dist(p, q);
        if (d < bestD) { bestD = d; best = { p: [...q], kind: 'corner' }; }
      }
    }
    if (best) return best;
    if (o.align) {
      const a = alignPoint(p, o, tol * 0.75);
      if (a) return a;
    }
    for (const w of core.levelWalls(lv)) {
      if (o.skipRoom && w.rooms.includes(o.skipRoom) && w.rooms.length === 1) continue;
      if (o.skipWall === w.id) continue;
      const pr = G.projectOnSegment(p, w.a, w.b);
      if (pr.d < tol * 0.7) return { p: [Math.round(pr.point[0]), Math.round(pr.point[1])], kind: 'wall' };
    }
    return { p: [Math.round(p[0] / 10) * 10, Math.round(p[1] / 10) * 10], kind: 'grid' };
  }

  // Corners elsewhere on the level that a drawn or dragged corner can line up with (same x or same y).
  function alignTargets(o) {
    const lv = level();
    const pts = [];
    for (const r of lv.rooms) {
      r.points.forEach((q, i) => { if (!(o.skipRoom === r.id && (o.skipIndex == null || o.skipIndex === i))) pts.push(q); });
    }
    for (const w of lv.walls) {
      if (w.id !== o.skipWall) pts.push(w.a, w.b);
      else if (o.skipEnd) pts.push(o.skipEnd === 'a' ? w.b : w.a); // the other end of the dragged wall
    }
    if (o.extra) pts.push(...o.extra);
    return pts;
  }

  // Lines a point up with other corners when it is close to their x or y; a dashed guide shows each line.
  function alignPoint(p, o, tol) {
    let bx = null; let by = null;
    for (const q of alignTargets(o)) {
      const dx = Math.abs(q[0] - p[0]); const dy = Math.abs(q[1] - p[1]);
      if (dx < tol && (!bx || dx < bx.d)) bx = { d: dx, q };
      if (dy < tol && (!by || dy < by.d)) by = { d: dy, q };
    }
    if (!bx && !by) return null;
    const out = [bx ? bx.q[0] : Math.round(p[0] / 10) * 10, by ? by.q[1] : Math.round(p[1] / 10) * 10];
    S.guides = [bx && [bx.q, out], by && [by.q, out]].filter(Boolean);
    return { p: out, kind: 'align' };
  }

  // Width, depth and height of a piece or a lamp fixture (fixtures fall back to their model's size).
  function dims(it) {
    const entry = MODELS.get(it.kind === 'device' ? it.fixture : it.type);
    return { w: it.w || (entry && entry.w) || 40, d: it.d || (entry && entry.d) || 40, h: it.h || (entry && entry.h) || 40, entry };
  }

  // Pieces that stand on furniture (table lamps, a TV, a kettle) take the height of the piece under them.
  function settleOnSurface(item) {
    const entry = MODELS.get(item.kind === 'device' ? item.fixture : item.type);
    if (!entry || entry.mount !== 'surface') return;
    let top = null;
    for (const o of level().items) {
      if (o === item || o.kind !== 'furniture') continue;
      const e = MODELS.get(o.type);
      if (e && (e.mount === 'surface' || e.mount === 'ceiling')) continue;
      const local = G.rotatePt([item.x - o.x, item.y - o.y], -(o.rot || 0));
      if (Math.abs(local[0]) <= o.w / 2 && Math.abs(local[1]) <= o.d / 2) top = Math.max(top || 0, (o.z || 0) + o.h);
    }
    if (top != null) item.z = Math.round(top);
  }

  function nearestWall(p, maxD) {
    let best = null;
    for (const w of core.levelWalls(level())) {
      const pr = G.projectOnSegment(p, w.a, w.b);
      if (pr.d <= maxD && (!best || pr.d < best.d)) best = { wall: w, ...pr };
    }
    return best;
  }

  // Doors and windows sit on a wall: keep them on its line and inside its length.
  function openingOnWall(p, width) {
    const nw = nearestWall(p, 45 * Math.max(1, scale()));
    if (!nw) return null;
    const { wall } = nw;
    const L = G.dist(wall.a, wall.b);
    const u = G.norm(G.sub(wall.b, wall.a));
    const half = Math.min(width / 2, L / 2);
    let s = G.dot(G.sub(nw.point, wall.a), u);
    s = Math.max(half, Math.min(L - half, s));
    if (S.snap) s = Math.round(s / 5) * 5;
    const at = G.add(wall.a, G.mul(u, s));
    return { x: Math.round(at[0] * 10) / 10, y: Math.round(at[1] * 10) / 10, angle: Math.atan2(u[1], u[0]), width: half * 2 };
  }

  // Furniture and wall-mounted devices dropped near a wall turn their back to it and touch it.
  function faceWall(item, ev) {
    if (ev && ev.shiftKey) return;
    const depth = item.kind === 'furniture' ? item.d : 0;
    const nw = nearestWall([item.x, item.y], depth / 2 + 35);
    if (!nw) return;
    const dir = G.norm(G.sub(nw.point, [item.x, item.y]));
    if (!Number.isFinite(dir[0]) || (dir[0] === 0 && dir[1] === 0)) return;
    if (item.kind === 'furniture') {
      item.rot = Math.round((Math.atan2(dir[0], -dir[1]) * 180) / Math.PI / 15) * 15;
      const c = G.sub(nw.point, G.mul(dir, depth / 2 + nw.wall.t / 2));
      item.x = Math.round(c[0]); item.y = Math.round(c[1]);
    } else {
      // A thermostat or wall lamp hangs against the wall, facing the room; other devices sit just in front.
      const fx = core.deviceFixture(item, S.devices.get(item.deviceId));
      const wallPiece = fx && fx.mount === 'wall';
      if (wallPiece) item.rot = Math.round((Math.atan2(dir[0], -dir[1]) * 180) / Math.PI / 15) * 15;
      const c = G.sub(nw.point, G.mul(dir, nw.wall.t / 2 + (wallPiece ? (item.d || fx.d) / 2 : 14)));
      item.x = Math.round(c[0]); item.y = Math.round(c[1]);
    }
  }

  // Rooms and free walls can be fixed in place, so they do not move by accident.
  function lockedSel() {
    const obj = selectedObject();
    return !!(obj && (S.sel.kind === 'room' || S.sel.kind === 'wall') && obj.locked);
  }

  /* -------------------------------------------------------------- drawing */

  const isDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const fmtLen = (cm) => (cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`);

  function draw() {
    const lv = level();
    svg.className.baseVal = `ed-canvas tool-${S.tool}${S.pendingFurniture || S.pendingDevice ? ' placing' : ''}${S.drag && S.drag.type === 'pan' ? ' panning' : ''}`;
    if (!lv) { svg.innerHTML = ''; return; }
    const pal = isDark() ? core.DARK_PALETTE : core.LIGHT_PALETTE;
    const box3d = $('ed-3d');
    const v3 = window.FloorplanView3D;
    if (S.preview && box3d && v3 && v3.supported) {
      box3d.hidden = false;
      svg.style.display = 'none';
      if (!S.v3d) {
        S.v3d = v3.create(box3d, {
          editing: true,
          tap: (kind, id) => select({ kind, id }),
          empty: () => select(null),
          drag: drag3d,
          dragEnd: (id, moved) => { if (moved) { const it = level().items.find((i) => i.id === id); if (it) settleOnSurface(it); changed(); } },
        });
        // Badges and room labels are HTML on top of the 3D view.
        box3d.addEventListener('click', (ev) => {
          const el = ev.target.closest('.fp3-dev, .fp3-room');
          if (el) select({ kind: el.dataset.kind, id: el.dataset.id });
        });
      }
      S.v3d.sync({ plan: S.plan, level: lv, devices: S.devices, dark: isDark(), furniture: S.showFurniture, turn: S.turn, values: true });
      S.v3d.select(S.sel ? S.sel.id : null);
      return;
    }
    if (box3d) box3d.hidden = true;
    svg.style.display = '';
    if (S.preview) {
      const out = core.render({ plan: S.plan, level: lv, devices: S.devices, view: { mode: S.preview, turn: S.turn }, palette: pal, furniture: S.showFurniture, idPrefix: 'p', modelBase: 'models/', names: 'devices' });
      svg.setAttribute('viewBox', out.viewBox.map(f1).join(' '));
      svg.innerHTML = out.svg;
      return;
    }
    const k = scale();
    const out = core.render({
      plan: S.plan, level: lv, devices: S.devices, view: { mode: '2d' }, palette: pal,
      furniture: S.showFurniture, showBackground: true, viewBox: S.cam, markerSize: 13 * k, modelBase: 'models/', names: 'devices',
      selected: new Set(S.sel ? [S.sel.id] : []), idPrefix: 'e',
    });
    svg.setAttribute('viewBox', S.cam.map(f1).join(' '));
    const grid = S.grid ? gridSvg(k, pal) : '';
    svg.innerHTML = grid + out.svg + overlaySvg(lv, k, pal);
  }

  // Dragging the selected piece or device in the 3D view: on a 5 cm grid, against walls like in 2D.
  function drag3d(id, x, y, first) {
    const it = level().items.find((i) => i.id === id);
    if (!it) return null;
    if (first) snapshot();
    const step = S.snap ? 5 : 1;
    it.x = Math.round(x / step) * step; it.y = Math.round(y / step) * step;
    const entry = MODELS.get(it.kind === 'device' ? it.fixture : it.type);
    if (it.kind === 'furniture' && !(entry && (entry.mount === 'surface' || entry.mount === 'ceiling'))) faceWall(it, null);
    if (it.kind === 'device') faceWall(it, null);
    return { x: it.x, y: it.y, rot: it.rot != null ? it.rot : null };
  }

  function gridSvg(k, pal) {
    const minor = k < 1.2 ? 10 : 50;
    const col = pal.dark ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
    return `<defs><pattern id="ed-grid-minor" width="${minor}" height="${minor}" patternUnits="userSpaceOnUse"><path d="M${minor} 0H0V${minor}" fill="none" stroke="${col}0.05)" stroke-width="${f1(k)}"/></pattern>`
      + `<pattern id="ed-grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#ed-grid-minor)"/><path d="M100 0H0V100" fill="none" stroke="${col}0.12)" stroke-width="${f1(k)}"/></pattern></defs>`
      + `<rect x="${f1(S.cam[0])}" y="${f1(S.cam[1])}" width="${f1(S.cam[2])}" height="${f1(S.cam[3])}" fill="url(#ed-grid)" pointer-events="none"/>`;
  }

  function lengthLabel(a, b, k, outward) {
    const L = G.dist(a, b);
    if (L < 20 * k) return '';
    const mid = G.mul(G.add(a, b), 0.5);
    const u = G.norm(G.sub(b, a));
    const n = outward ? [u[1], -u[0]] : [0, 0];
    const at = G.add(mid, G.mul(n, 16 * k));
    const text = fmtLen(L);
    const fs = 11 * k;
    const w = text.length * fs * 0.58 + fs;
    return `<g pointer-events="none"><rect x="${f1(at[0] - w / 2)}" y="${f1(at[1] - fs * 0.8)}" width="${f1(w)}" height="${f1(fs * 1.6)}" rx="${f1(fs * 0.4)}" fill="var(--ed-accent)"/><text x="${f1(at[0])}" y="${f1(at[1] + fs * 0.35)}" text-anchor="middle" font-size="${f1(fs)}" fill="#fff" font-weight="600">${esc(text)}</text></g>`;
  }

  function overlaySvg(lv, k, pal) {
    const parts = [];
    const accent = 'var(--ed-accent)';
    if (S.sel && S.sel.kind === 'room') {
      const room = lv.rooms.find((r) => r.id === S.sel.id);
      if (room) {
        const ccw = G.signedArea(room.points) > 0;
        parts.push(`<polygon points="${room.points.map((p) => p.map(f1).join(',')).join(' ')}" fill="none" stroke="${accent}" stroke-width="${f1(2 * k)}" pointer-events="none"/>`);
        room.points.forEach((p, i) => {
          const q = room.points[(i + 1) % room.points.length];
          parts.push(ccw ? lengthLabel(q, p, k, true) : lengthLabel(p, q, k, true));
        });
        if (!room.locked) {
          room.points.forEach((p, i) => {
            parts.push(`<circle data-handle="v:${i}" cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(6 * k)}" fill="#fff" stroke="${accent}" stroke-width="${f1(2 * k)}" style="cursor:move"/>`);
          });
        }
      }
    }
    if (S.sel && S.sel.kind === 'wall') {
      const w = lv.walls.find((x) => x.id === S.sel.id);
      if (w) {
        parts.push(lengthLabel(w.a, w.b, k, true));
        if (!w.locked) parts.push(`<circle data-handle="wa" cx="${f1(w.a[0])}" cy="${f1(w.a[1])}" r="${f1(6 * k)}" fill="#fff" stroke="${accent}" stroke-width="${f1(2 * k)}" style="cursor:move"/>`);
        if (!w.locked) parts.push(`<circle data-handle="wb" cx="${f1(w.b[0])}" cy="${f1(w.b[1])}" r="${f1(6 * k)}" fill="#fff" stroke="${accent}" stroke-width="${f1(2 * k)}" style="cursor:move"/>`);
      }
    }
    if (S.sel && S.sel.kind === 'item') {
      const it = lv.items.find((i) => i.id === S.sel.id);
      if (it && (it.kind === 'furniture' || (it.fixture && it.fixture !== 'none'))) {
        const dm = dims(it);
        const at = (lx, ly) => G.add(G.rotatePt([lx, ly], it.rot || 0), [it.x, it.y]);
        const c = G.rect(-dm.w / 2, -dm.d / 2, dm.w / 2, dm.d / 2).map((q) => at(q[0], q[1]));
        parts.push(`<polygon points="${c.map((q) => q.map(f1).join(',')).join(' ')}" fill="none" stroke="${accent}" stroke-width="${f1(2 * k)}" stroke-dasharray="${f1(6 * k)} ${f1(4 * k)}" pointer-events="none"/>`);
        if (it.kind === 'furniture') parts.push(wallDistances(lv, { ...it, w: dm.w, d: dm.d }, k));
        // Resize handles on corners and edges, and a turn handle in front.
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const q = at((sx * dm.w) / 2, (sy * dm.d) / 2);
          const corner = sx && sy;
          parts.push(`<rect data-handle="rs:${sx},${sy}" x="${f1(q[0] - (corner ? 6 : 4.5) * k)}" y="${f1(q[1] - (corner ? 6 : 4.5) * k)}" width="${f1((corner ? 12 : 9) * k)}" height="${f1((corner ? 12 : 9) * k)}" rx="${f1(2 * k)}" fill="#fff" stroke="${accent}" stroke-width="${f1(2 * k)}" style="cursor:${corner ? 'nwse-resize' : 'move'}"/>`);
        }
        const front = at(0, dm.d / 2 + 22 * k);
        const edge = at(0, dm.d / 2);
        parts.push(`<line x1="${f1(edge[0])}" y1="${f1(edge[1])}" x2="${f1(front[0])}" y2="${f1(front[1])}" stroke="${accent}" stroke-width="${f1(1.5 * k)}" pointer-events="none"/>`);
        parts.push(`<circle data-handle="rot" cx="${f1(front[0])}" cy="${f1(front[1])}" r="${f1(6 * k)}" fill="${accent}" stroke="#fff" stroke-width="${f1(2 * k)}" style="cursor:grab"/>`);
        const label = `${Math.round(dm.w)} × ${Math.round(dm.d)} × ${Math.round(dm.h)} cm`;
        const lp = at(0, -dm.d / 2 - 14 * k);
        parts.push(`<text x="${f1(lp[0])}" y="${f1(lp[1])}" text-anchor="middle" font-size="${f1(11 * k)}" font-weight="600" fill="${accent}" pointer-events="none">${label}</text>`);
      } else if (it) {
        parts.push(`<circle cx="${f1(it.x)}" cy="${f1(it.y)}" r="${f1(22 * k)}" fill="none" stroke="${accent}" stroke-width="${f1(2 * k)}" pointer-events="none"/>`);
        const dev = S.devices.get(it.deviceId);
        if (dev && core.deviceKind(dev) === 'light') {
          parts.push(`<circle cx="${f1(it.x)}" cy="${f1(it.y)}" r="${f1(it.reach || core.DEFAULTS.lightReach)}" fill="none" stroke="${accent}" stroke-width="${f1(k)}" stroke-dasharray="${f1(4 * k)} ${f1(4 * k)}" pointer-events="none"/>`);
        }
      }
    }
    if (S.sel && S.sel.kind === 'opening') {
      const o = lv.openings.find((x) => x.id === S.sel.id);
      if (o) {
        const u = [Math.cos(o.angle), Math.sin(o.angle)];
        const a = G.sub([o.x, o.y], G.mul(u, o.width / 2)); const b = G.add([o.x, o.y], G.mul(u, o.width / 2));
        parts.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${accent}" stroke-width="${f1(5 * k)}" stroke-linecap="round" opacity="0.6" pointer-events="none"/>`);
        parts.push(lengthLabel(a, b, k, true));
      }
    }
    if (S.drag && S.drag.type === 'room-rect' && S.drag.cur) {
      const [a, b] = [S.drag.start, S.drag.cur];
      const r = G.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
      parts.push(`<polygon points="${r.map((p) => p.map(f1).join(',')).join(' ')}" fill="var(--ed-accent)" fill-opacity="0.12" stroke="${accent}" stroke-width="${f1(2 * k)}" pointer-events="none"/>`);
      parts.push(lengthLabel(r[0], r[1], k, true), lengthLabel(r[1], r[2], k, true));
    }
    if (S.wallDraft) {
      const pts = S.wallDraft.points;
      const cur = wallDraftEnd();
      const all = cur ? [...pts, cur] : pts;
      parts.push(`<polyline points="${all.map((p) => p.map(f1).join(',')).join(' ')}" fill="none" stroke="${accent}" stroke-width="${f1(lv.wallThickness || 12)}" stroke-opacity="0.45" stroke-linejoin="round" pointer-events="none"/>`);
      if (cur && pts.length) parts.push(lengthLabel(pts[pts.length - 1], cur, k, true));
      if (S.wallDraft.typed) {
        const at = cur || pts[pts.length - 1];
        parts.push(`<text x="${f1(at[0] + 14 * k)}" y="${f1(at[1] - 14 * k)}" font-size="${f1(14 * k)}" font-weight="700" fill="${accent}" pointer-events="none">${esc(S.wallDraft.typed)} cm ⏎</text>`);
      }
    }
    if (S.ghost) {
      const u = [Math.cos(S.ghost.angle), Math.sin(S.ghost.angle)];
      const a = G.sub([S.ghost.x, S.ghost.y], G.mul(u, S.ghost.width / 2)); const b = G.add([S.ghost.x, S.ghost.y], G.mul(u, S.ghost.width / 2));
      parts.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${accent}" stroke-width="${f1((lv.wallThickness || 12) + 4)}" opacity="0.5" pointer-events="none"/>`);
    }
    if ((S.pendingFurniture || S.pendingDevice) && S.hover) {
      parts.push(`<circle cx="${f1(S.hover[0])}" cy="${f1(S.hover[1])}" r="${f1(10 * k)}" fill="var(--ed-accent)" opacity="0.6" pointer-events="none"/>`);
    }
    if (S.detection && S.detection.rooms) {
      S.detection.rooms.forEach((pts, i) => {
        parts.push(`<polygon points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="var(--ed-accent)" fill-opacity="0.16" stroke="${accent}" stroke-width="${f1(2 * k)}" stroke-dasharray="${f1(6 * k)} ${f1(3 * k)}" pointer-events="none"/>`);
        const lp = G.labelPoint(pts);
        parts.push(`<g pointer-events="none"><circle cx="${f1(lp[0])}" cy="${f1(lp[1])}" r="${f1(11 * k)}" fill="${accent}"/><text x="${f1(lp[0])}" y="${f1(lp[1] + 4 * k)}" text-anchor="middle" font-size="${f1(12 * k)}" font-weight="700" fill="#fff">${i + 1}</text></g>`);
      });
      for (const o of S.detection.openings) {
        const u = [Math.cos(o.angle), Math.sin(o.angle)];
        const a = G.sub([o.x, o.y], G.mul(u, o.width / 2)); const b = G.add([o.x, o.y], G.mul(u, o.width / 2));
        parts.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${o.type === 'door' ? '#ff8c00' : '#00aadc'}" stroke-width="${f1(6 * k)}" stroke-linecap="round" pointer-events="none"/>`);
      }
    }
    if (S.guides) {
      for (const [a, b] of S.guides) {
        const u = G.norm(G.sub(b, a));
        if (!Number.isFinite(u[0])) continue;
        const from = G.sub(a, G.mul(u, 30 * k)); const to = G.add(b, G.mul(u, 30 * k));
        parts.push(`<line x1="${f1(from[0])}" y1="${f1(from[1])}" x2="${f1(to[0])}" y2="${f1(to[1])}" stroke="#e0453a" stroke-width="${f1(k)}" stroke-dasharray="${f1(5 * k)} ${f1(4 * k)}" pointer-events="none"/>`);
      }
    }
    if (S.measure) {
      const { a, b } = S.measure;
      parts.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#e0453a" stroke-width="${f1(2 * k)}" pointer-events="none"/>`);
      for (const p of [a, b]) parts.push(`<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(4 * k)}" fill="#e0453a" pointer-events="none"/>`);
      parts.push(lengthLabel(a, b, k, true));
    }
    return `<g class="ed-overlay">${parts.join('')}</g>`;
  }

  // Distances from a furniture piece to the walls around it, shown while it is selected.
  function wallDistances(lv, it, k) {
    const room = lv.rooms.find((r) => G.pointInPolygon([it.x, it.y], r.points));
    if (!room) return '';
    const out = [];
    const c = [it.x, it.y];
    for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Extent of the rotated piece along this axis.
      const corners = G.rect(-it.w / 2, -it.d / 2, it.w / 2, it.d / 2).map((p) => G.rotatePt(p, it.rot || 0));
      const ext = Math.max(...corners.map((p) => G.dot(p, dir)));
      const from = G.add(c, G.mul(dir, ext));
      let best = Infinity;
      room.points.forEach((p, i) => {
        const q = room.points[(i + 1) % room.points.length];
        const e = G.sub(q, p); const den = G.cross(dir, e);
        if (Math.abs(den) < 1e-6) return;
        const t = G.cross(G.sub(p, from), e) / den;
        const s = G.cross(G.sub(p, from), dir) / den;
        if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
      });
      const inner = best - (lv.wallThickness || 12) / 2;
      if (Number.isFinite(best) && inner > 0 && inner < 2000) {
        const to = G.add(from, G.mul(dir, inner));
        out.push(`<line x1="${f1(from[0])}" y1="${f1(from[1])}" x2="${f1(to[0])}" y2="${f1(to[1])}" stroke="var(--ed-accent)" stroke-width="${f1(k)}" stroke-dasharray="${f1(3 * k)} ${f1(3 * k)}" pointer-events="none"/>`);
        out.push(lengthLabel(from, to, k, false));
      }
    }
    return out.join('');
  }

  function wallDraftEnd() {
    const d = S.wallDraft;
    if (!d || !d.points.length || !S.hover) return null;
    const last = d.points[d.points.length - 1];
    if (d.typed && Number(d.typed) > 0) {
      const u = G.norm(G.sub(S.hover, last));
      return G.add(last, G.mul(u, Number(d.typed)));
    }
    return S.hover;
  }

  /* --------------------------------------------------------------- events */

  function hitTarget(ev) {
    const handle = ev.target.closest && ev.target.closest('[data-handle]');
    if (handle) return { handle: handle.dataset.handle };
    const el = ev.target.closest && ev.target.closest('[data-kind]');
    if (!el) return null;
    let { kind, id } = el.dataset;
    if (kind === 'wall' && id.includes(':')) { kind = 'room'; id = id.split(':')[0]; }
    return { kind, id };
  }

  function select(sel) {
    S.sel = sel;
    S.armed = null;
    draw();
    renderPanel();
  }

  function onPointerDown(ev) {
    if (!S.plan) return;
    try { svg.setPointerCapture(ev.pointerId); } catch (err) { /* pointer already released */ }
    const p = toPlan(ev);
    const lv = level();
    if (ev.button === 1 || S.spaceDown || S.preview) {
      S.drag = { type: 'pan', client: [ev.clientX, ev.clientY], cam0: [...S.cam] };
      return;
    }
    if (ev.button === 2) { finishWall(); return; }

    if (S.pendingFurniture || S.pendingDevice) {
      placePending(p, ev);
      return;
    }

    switch (S.tool) {
      case 'room': {
        S.drag = { type: 'room-rect', start: snapPoint(p, ev, { align: true }).p, cur: null };
        return;
      }
      case 'wall': {
        const end = S.wallDraft ? wallDraftEnd() : null;
        const sp = end && S.wallDraft.typed ? end.map(Math.round) : snapPoint(p, ev, { align: true, extra: S.wallDraft ? S.wallDraft.points : [] }).p;
        if (!S.wallDraft) S.wallDraft = { points: [sp], typed: '' };
        else {
          const last = S.wallDraft.points[S.wallDraft.points.length - 1];
          if (G.dist(last, sp) > 1) {
            commit(() => { lv.walls.push({ id: core.uid('wall'), a: last, b: sp }); });
            S.wallDraft.points.push(sp);
          }
          S.wallDraft.typed = '';
        }
        draw();
        return;
      }
      case 'door': case 'window': {
        const g = openingOnWall(p, S.tool === 'door' ? 90 : 120);
        if (!g) return;
        commit(() => {
          const o = { id: core.uid('open'), type: S.tool, ...g, swing: 1, hinge: 1, devices: [] };
          lv.openings.push(o);
          S.sel = { kind: 'opening', id: o.id };
        });
        return;
      }
      case 'measure': case 'picture': {
        const a = snapPoint(p, ev).p;
        S.measure = { a, b: a };
        S.drag = { type: 'measure' };
        return;
      }
      default: break;
    }

    // Select tool
    const hit = hitTarget(ev);
    if (hit && hit.handle && S.sel) {
      if (S.sel.kind === 'room') {
        const index = Number(hit.handle.split(':')[1]);
        const room = lv.rooms.find((r) => r.id === S.sel.id);
        if (ev.altKey && room.points.length > 3) { commit(() => room.points.splice(index, 1)); return; }
        snapshot();
        S.drag = { type: 'vertex', room, index };
      } else if (S.sel.kind === 'wall') {
        snapshot();
        S.drag = { type: 'wall-end', wall: lv.walls.find((w) => w.id === S.sel.id), end: hit.handle === 'wa' ? 'a' : 'b' };
      } else if (S.sel.kind === 'item') {
        const it = lv.items.find((i) => i.id === S.sel.id);
        const dm = dims(it);
        snapshot();
        if (hit.handle === 'rot') S.drag = { type: 'rotate', it };
        else {
          const [sx, sy] = hit.handle.slice(3).split(',').map(Number);
          S.drag = { type: 'resize', it, sx, sy, orig: { x: it.x, y: it.y, w: dm.w, d: dm.d, h: dm.h } };
        }
      }
      return;
    }
    if (!hit) {
      select(null);
      S.drag = { type: 'pan', client: [ev.clientX, ev.clientY], cam0: [...S.cam] };
      return;
    }
    select({ kind: hit.kind, id: hit.id });
    if (lockedSel()) {
      // A room or wall fixed in place: dragging it moves the view instead.
      $('hint').textContent = T.lockedNote;
      S.drag = { type: 'pan', client: [ev.clientX, ev.clientY], cam0: [...S.cam] };
      return;
    }
    snapshot();
    S.drag = { type: 'move', kind: hit.kind, id: hit.id, start: p, moved: false, orig: captureOrig(hit) };
  }

  // Remember positions at drag start; moving a room carries its doors, windows and contents.
  function captureOrig(hit) {
    const lv = level();
    if (hit.kind === 'room') {
      const room = lv.rooms.find((r) => r.id === hit.id);
      const onEdges = lv.openings.filter((o) => room.points.some((p, i) => G.projectOnSegment([o.x, o.y], p, room.points[(i + 1) % room.points.length]).d < 2));
      const inside = lv.items.filter((i) => G.pointInPolygon([i.x, i.y], room.points));
      return {
        points: room.points.map((p) => [...p]),
        openings: onEdges.map((o) => ({ o, x: o.x, y: o.y })),
        items: inside.map((i) => ({ i, x: i.x, y: i.y })),
      };
    }
    if (hit.kind === 'item') { const it = lv.items.find((i) => i.id === hit.id); return { x: it.x, y: it.y }; }
    if (hit.kind === 'wall') { const w = lv.walls.find((x) => x.id === hit.id); return { a: [...w.a], b: [...w.b] }; }
    return {};
  }

  function onPointerMove(ev) {
    if (!S.plan) return;
    const p = toPlan(ev);
    S.hover = S.tool === 'wall' && S.wallDraft ? snapPoint(p, ev, { align: true, extra: S.wallDraft.points }).p : p;
    const lv = level();
    const d = S.drag;
    if (!d) {
      if (S.tool === 'door' || S.tool === 'window') { S.ghost = openingOnWall(p, S.tool === 'door' ? 90 : 120); draw(); }
      else if (S.wallDraft || S.pendingFurniture || S.pendingDevice) draw();
      return;
    }
    if (d.type === 'pan') {
      const k = scale();
      S.cam = [d.cam0[0] - (ev.clientX - d.client[0]) * k, d.cam0[1] - (ev.clientY - d.client[1]) * k, d.cam0[2], d.cam0[3]];
      draw();
      return;
    }
    if (d.type === 'room-rect') { d.cur = snapPoint(p, ev, { align: true }).p; draw(); return; }
    if (d.type === 'measure') { S.measure.b = snapPoint(p, ev).p; draw(); return; }
    if (d.type === 'vertex') {
      d.room.points[d.index] = snapPoint(p, ev, { skipRoom: d.room.id, skipIndex: d.index, align: true }).p;
      draw();
      return;
    }
    if (d.type === 'resize') {
      const { it, sx, sy, orig: o } = d;
      const local = G.rotatePt([p[0] - o.x, p[1] - o.y], -(it.rot || 0));
      let w = o.w; let dd = o.d; let h = o.h;
      const oppX = (-sx * o.w) / 2; const oppY = (-sy * o.d) / 2;
      if (sx) w = Math.max(5, Math.round(Math.abs(local[0] - oppX)));
      if (sy) dd = Math.max(5, Math.round(Math.abs(local[1] - oppY)));
      if (it.lockRatio || ev.shiftKey) {
        const f = sx && sy ? Math.max(w / o.w, dd / o.d) : sx ? w / o.w : dd / o.d;
        w = Math.round(o.w * f); dd = Math.round(o.d * f); h = Math.round(o.h * f);
      }
      const cx = sx ? oppX + (sx * w) / 2 : 0;
      const cy = sy ? oppY + (sy * dd) / 2 : 0;
      const c = G.add([o.x, o.y], G.rotatePt([cx, cy], it.rot || 0));
      Object.assign(it, { w, d: dd, h, x: Math.round(c[0]), y: Math.round(c[1]) });
      draw();
      return;
    }
    if (d.type === 'rotate') {
      const a = (Math.atan2(p[1] - d.it.y, p[0] - d.it.x) * 180) / Math.PI - 90;
      d.it.rot = ((ev.shiftKey ? Math.round(a) : Math.round(a / 15) * 15) + 360) % 360;
      draw();
      return;
    }
    if (d.type === 'wall-end') {
      d.wall[d.end] = snapPoint(p, ev, { skipWall: d.wall.id, skipEnd: d.end, align: true }).p;
      draw();
      return;
    }
    if (d.type === 'move') {
      let delta = G.sub(p, d.start);
      if (!d.moved && G.len(delta) < 3 * scale()) return;
      d.moved = true;
      if (d.kind === 'room') {
        const room = lv.rooms.find((r) => r.id === d.id);
        // Snap the room's first corner, then move everything by the same amount.
        const first = G.add(d.orig.points[0], delta);
        const snapped = snapPoint(first, ev, { skipRoom: room.id });
        delta = G.sub(snapped.p, d.orig.points[0]);
        // Corner snapping to other rooms: try every corner and take the closest match.
        if (S.snap !== !!ev.shiftKey) {
          let best = null;
          for (const q of d.orig.points) {
            const moved = G.add(q, G.sub(p, d.start));
            const s = snapPoint(moved, ev, { skipRoom: room.id });
            if (s.kind === 'corner' || s.kind === 'wall') {
              const dd = G.dist(moved, s.p);
              if (!best || dd < best.dd) best = { dd, delta: G.sub(s.p, q) };
            }
          }
          if (best) delta = best.delta;
          else {
            // No corner to snap to: line the room's corners up with corners of other rooms and walls.
            const raw = G.sub(p, d.start);
            const tolA = 9 * scale();
            let ax = null; let ay = null;
            const targets = alignTargets({ skipRoom: room.id });
            for (const q of d.orig.points) {
              const m = G.add(q, raw);
              for (const t of targets) {
                const dx = t[0] - m[0]; const dy = t[1] - m[1];
                if (Math.abs(dx) < tolA && (!ax || Math.abs(dx) < Math.abs(ax.d))) ax = { d: dx, t, q };
                if (Math.abs(dy) < tolA && (!ay || Math.abs(dy) < Math.abs(ay.d))) ay = { d: dy, t, q };
              }
            }
            if (ax) delta[0] = raw[0] + ax.d;
            if (ay) delta[1] = raw[1] + ay.d;
            S.guides = [ax && [ax.t, G.add(ax.q, delta)], ay && [ay.t, G.add(ay.q, delta)]].filter(Boolean);
            if (!S.guides.length) S.guides = null;
          }
        }
        room.points = d.orig.points.map((q) => G.add(q, delta));
        for (const x of d.orig.openings) { x.o.x = x.x + delta[0]; x.o.y = x.y + delta[1]; }
        for (const x of d.orig.items) { x.i.x = Math.round(x.x + delta[0]); x.i.y = Math.round(x.y + delta[1]); }
      } else if (d.kind === 'item') {
        const it = lv.items.find((i) => i.id === d.id);
        const sp = snapPoint(G.add([d.orig.x, d.orig.y], delta), ev).p;
        it.x = sp[0]; it.y = sp[1];
        const entryMove = MODELS.get(it.kind === 'device' ? it.fixture : it.type);
        if (it.kind === 'furniture' && !(entryMove && (entryMove.mount === 'surface' || entryMove.mount === 'ceiling'))) faceWall(it, ev);
        const fxMove = it.kind === 'device' ? core.deviceFixture(it, S.devices.get(it.deviceId)) : null;
        if (fxMove && fxMove.mount === 'wall') faceWall(it, ev);
        settleOnSurface(it);
      } else if (d.kind === 'opening') {
        const o = lv.openings.find((x) => x.id === d.id);
        const g = openingOnWall(p, o.width);
        if (g) Object.assign(o, { x: g.x, y: g.y, angle: g.angle });
      } else if (d.kind === 'wall') {
        const w = lv.walls.find((x) => x.id === d.id);
        const da = G.sub(snapPoint(G.add(d.orig.a, delta), ev, { skipWall: w.id, align: true }).p, d.orig.a);
        w.a = G.add(d.orig.a, da); w.b = G.add(d.orig.b, da);
      }
      draw();
    }
  }

  function onPointerUp() {
    const d = S.drag;
    S.drag = null;
    S.guides = null;
    if (!d) return;
    const lv = level();
    if (d.type === 'room-rect' && d.cur) {
      const [a, b] = [d.start, d.cur];
      if (Math.abs(a[0] - b[0]) >= 30 && Math.abs(a[1] - b[1]) >= 30) {
        commit(() => {
          const room = { id: core.uid('room'), name: `${T.roomName} ${lv.rooms.length + 1}`, zoneId: null, points: G.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])) };
          lv.rooms.push(room);
          S.sel = { kind: 'room', id: room.id };
        });
        return;
      }
    }
    if (d.type === 'measure') { renderPanel(); draw(); return; }
    if (d.type === 'move' && !d.moved) { S.undo.pop(); draw(); return; }
    if (d.type === 'move' || d.type === 'vertex' || d.type === 'wall-end' || d.type === 'resize' || d.type === 'rotate') { changed(); return; }
    draw();
  }

  function onDoubleClick(ev) {
    if (S.tool === 'wall') { finishWall(); return; }
    if (!S.sel || S.sel.kind !== 'room' || lockedSel()) return;
    const room = level().rooms.find((r) => r.id === S.sel.id);
    const p = toPlan(ev);
    let best = null;
    room.points.forEach((a, i) => {
      const pr = G.projectOnSegment(p, a, room.points[(i + 1) % room.points.length]);
      if (pr.d < 10 * scale() && pr.t > 0.02 && pr.t < 0.98 && (!best || pr.d < best.d)) best = { i, ...pr };
    });
    if (best) commit(() => room.points.splice(best.i + 1, 0, best.point.map(Math.round)));
  }

  function finishWall() {
    S.wallDraft = null;
    S.guides = null;
    draw();
  }

  function deleteSelection() {
    const lv = level();
    if (!S.sel || lockedSel()) return;
    const { kind, id } = S.sel;
    commit(() => {
      if (kind === 'room') lv.rooms = lv.rooms.filter((r) => r.id !== id);
      if (kind === 'item') lv.items = lv.items.filter((i) => i.id !== id);
      if (kind === 'opening') lv.openings = lv.openings.filter((o) => o.id !== id);
      if (kind === 'wall') lv.walls = lv.walls.filter((w) => w.id !== id);
      S.sel = null;
    });
  }

  function onKeyDown(ev) {
    const typing = ev.target.matches && ev.target.matches('input, select, textarea');
    if (typing) return;
    const lv = level();
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) restore(S.redo, S.undo); else restore(S.undo, S.redo); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); restore(S.redo, S.undo); return; }
    if ((ev.ctrlKey || ev.metaKey) && ['c', 'x'].includes(ev.key.toLowerCase()) && S.sel) {
      ev.preventDefault();
      if (copySelection() && ev.key.toLowerCase() === 'x') deleteSelection();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v' && S.clipboard) { ev.preventDefault(); paste(); return; }
    if (ev.key === ' ') { S.spaceDown = true; ev.preventDefault(); return; }
    if (S.wallDraft) {
      if (/^[0-9.]$/.test(ev.key)) { S.wallDraft.typed += ev.key; draw(); return; }
      if (ev.key === 'Backspace') { S.wallDraft.typed = S.wallDraft.typed.slice(0, -1); draw(); return; }
      if (ev.key === 'Enter' && S.wallDraft.typed) {
        const end = wallDraftEnd();
        if (end) {
          const last = S.wallDraft.points[S.wallDraft.points.length - 1];
          const b = end.map((v) => Math.round(v));
          commit(() => lv.walls.push({ id: core.uid('wall'), a: last, b }));
          S.wallDraft.points.push(b);
          S.wallDraft.typed = '';
          draw();
        }
        return;
      }
    }
    if (ev.key === 'Escape') {
      S.wallDraft = null; S.pendingFurniture = null; S.pendingDevice = null; S.measure = null; S.calibrating = false;
      if (S.tool !== 'select') setTool('select'); else select(null);
      draw(); renderPanel();
      return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.sel) { ev.preventDefault(); deleteSelection(); return; }
    if (S.sel && S.sel.kind === 'item' && ev.key.toLowerCase() === 'r') {
      const it = lv.items.find((i) => i.id === S.sel.id);
      commit(() => { it.rot = ((it.rot || 0) + (ev.shiftKey ? -15 : 15) + 360) % 360; });
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[ev.key] && S.sel && !lockedSel()) {
      ev.preventDefault();
      const step = G.mul(arrows[ev.key], ev.shiftKey ? 10 : 1);
      commit(() => moveSelection(step));
      return;
    }
    const tools = { v: 'select', q: 'room', w: 'wall', d: 'door', n: 'window', f: 'furniture', e: 'device', m: 'measure' };
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && tools[ev.key.toLowerCase()]) setTool(tools[ev.key.toLowerCase()]);
  }

  // Copy and paste of furniture, rooms, walls, doors and windows (also onto another level). Devices are not
  // copied: a device has one place in the house.
  function copySelection() {
    const obj = selectedObject();
    if (!obj || (S.sel.kind === 'item' && obj.kind === 'device')) return false;
    S.clipboard = { kind: S.sel.kind, data: JSON.parse(JSON.stringify(obj)) };
    return true;
  }

  function paste() {
    const lv = level();
    const { kind, data } = S.clipboard;
    const c = JSON.parse(JSON.stringify(data));
    c.id = core.uid(kind === 'room' ? 'room' : kind === 'wall' ? 'wall' : kind === 'opening' ? 'open' : 'itm');
    delete c.locked;
    // At the mouse when it is over the plan, else a little beside the original.
    const inView = S.hover && S.hover[0] >= S.cam[0] && S.hover[1] >= S.cam[1] && S.hover[0] <= S.cam[0] + S.cam[2] && S.hover[1] <= S.cam[1] + S.cam[3];
    const centre = kind === 'room' ? (() => { const b = G.bbox(c.points); return [b.minX + b.w / 2, b.minY + b.h / 2]; })()
      : kind === 'wall' ? G.mul(G.add(c.a, c.b), 0.5) : [c.x, c.y];
    const to = inView ? snapPoint(S.hover, null).p : G.add(centre, [40, 40]);
    const d = G.sub(to, centre);
    commit(() => {
      if (kind === 'room') {
        c.points = c.points.map((p) => G.add(p, d).map(Math.round));
        c.zoneId = null; // one zone per room; choose it for the copy
        lv.rooms.push(c);
      } else if (kind === 'wall') {
        c.a = G.add(c.a, d).map(Math.round); c.b = G.add(c.b, d).map(Math.round);
        lv.walls.push(c);
      } else if (kind === 'opening') {
        const g = openingOnWall(to, c.width);
        if (!g) return;
        Object.assign(c, g, { devices: [] });
        lv.openings.push(c);
      } else {
        c.x = Math.round(to[0]); c.y = Math.round(to[1]);
        lv.items.push(c);
        settleOnSurface(c);
      }
      S.sel = { kind, id: c.id };
    });
  }

  // Walls of a room that are less than 20° off become exactly horizontal or vertical; the doors and
  // windows on them move along onto the straightened walls.
  function straightenRoom(room) {
    const lv = level();
    const before = room.points.map((p) => p.slice());
    const onEdges = lv.openings.filter((o) => before.some((p, i) => G.projectOnSegment([o.x, o.y], p, before[(i + 1) % before.length]).d < 3));
    const tan = Math.tan((20 * Math.PI) / 180);
    const pts = room.points;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0]; const dy = b[1] - a[1];
        if (Math.abs(dy) <= Math.abs(dx) * tan) { const m = Math.round((a[1] + b[1]) / 2); a[1] = m; b[1] = m; }
        else if (Math.abs(dx) <= Math.abs(dy) * tan) { const m = Math.round((a[0] + b[0]) / 2); a[0] = m; b[0] = m; }
      }
    }
    for (const o of onEdges) {
      const g = openingOnWall([o.x, o.y], o.width);
      if (g) Object.assign(o, { x: g.x, y: g.y, angle: g.angle });
    }
  }

  // Edges of a room, or a free wall, that run almost on the line of another wall (within 20 cm) move onto
  // that line, so walls that belong in one straight line are. Lines that overlap the edge go first; the
  // same facade further along a little after. Doors and windows on the edges move along.
  function alignToWalls(target, isRoom) {
    const lv = level();
    const TOL = 20;
    const lines = { h: [], v: [] };
    const addEdge = (a, b) => {
      if (Math.abs(a[1] - b[1]) < 0.5) lines.h.push({ c: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) });
      else if (Math.abs(a[0] - b[0]) < 0.5) lines.v.push({ c: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) });
    };
    for (const r of lv.rooms) if (r !== target) r.points.forEach((p, i) => addEdge(p, r.points[(i + 1) % r.points.length]));
    for (const w of lv.walls) if (w !== target) addEdge(w.a, w.b);
    const lineFor = (list, c, lo, hi) => {
      let pick = null;
      for (const l of list) {
        const off = Math.abs(l.c - c);
        if (off > TOL) continue;
        const gap = Math.max(0, Math.max(l.lo, lo) - Math.min(l.hi, hi));
        const score = off + Math.min(gap, 200) / 20;
        if (!pick || score < pick.score) pick = { score, c: l.c };
      }
      return pick;
    };
    const edges = isRoom ? target.points.map((p, i) => [p, target.points[(i + 1) % target.points.length]]) : [[target.a, target.b]];
    const before = edges.map(([a, b]) => [a.slice(), b.slice()]);
    const onEdges = lv.openings.filter((o) => before.some(([a, b]) => G.projectOnSegment([o.x, o.y], a, b).d < 3));
    const tan = Math.tan((5 * Math.PI) / 180);
    for (const [a, b] of edges) {
      const dx = b[0] - a[0]; const dy = b[1] - a[1];
      if (Math.abs(dy) <= Math.abs(dx) * tan) {
        const pick = lineFor(lines.h, (a[1] + b[1]) / 2, Math.min(a[0], b[0]), Math.max(a[0], b[0]));
        if (pick) { a[1] = pick.c; b[1] = pick.c; }
      } else if (Math.abs(dx) <= Math.abs(dy) * tan) {
        const pick = lineFor(lines.v, (a[0] + b[0]) / 2, Math.min(a[1], b[1]), Math.max(a[1], b[1]));
        if (pick) { a[0] = pick.c; b[0] = pick.c; }
      }
    }
    for (const o of onEdges) {
      const g = openingOnWall([o.x, o.y], o.width);
      if (g) Object.assign(o, { x: g.x, y: g.y, angle: g.angle });
    }
  }

  function alignAll() {
    const lv = level();
    for (let pass = 0; pass < 2; pass++) {
      for (const r of lv.rooms) if (!r.locked) alignToWalls(r, true);
      for (const w of lv.walls) if (!w.locked) alignToWalls(w, false);
    }
  }

  function moveSelection(step) {
    const lv = level();
    const { kind, id } = S.sel;
    if (kind === 'room') {
      const room = lv.rooms.find((r) => r.id === id);
      const orig = captureOrig({ kind, id });
      room.points = room.points.map((p) => G.add(p, step));
      for (const x of orig.openings) { x.o.x += step[0]; x.o.y += step[1]; }
      for (const x of orig.items) { x.i.x += step[0]; x.i.y += step[1]; }
    }
    if (kind === 'item') { const it = lv.items.find((i) => i.id === id); it.x += step[0]; it.y += step[1]; }
    if (kind === 'wall') { const w = lv.walls.find((x) => x.id === id); w.a = G.add(w.a, step); w.b = G.add(w.b, step); }
  }

  // Puts the chosen piece or device at p (plan cm). The catalogue or device list stays where it was.
  function placePending(p, ev) {
    const lv = level();
    const sp = snapPoint(p, ev).p;
    let opts = ev;
    commit(() => {
      let item;
      if (S.pendingFurniture) {
        item = core.newFurniture(S.pendingFurniture, sp[0], sp[1], LANG);
        if (item.mount === 'surface' || item.mount === 'ceiling') opts = { shiftKey: true };
      } else {
        item = core.newDeviceItem(S.devices.get(S.pendingDevice), sp);
        const kind = core.deviceKind(S.devices.get(S.pendingDevice));
        if (kind === 'light') applyFixture(item, MODELS.DEFAULT_FIXTURE);
        if (core.defaultMount(kind) !== 'wall') opts = { shiftKey: true };
      }
      faceWall(item, opts);
      settleOnSurface(item);
      lv.items.push(item);
      S.sel = { kind: 'item', id: item.id };
    });
    S.pendingFurniture = null; S.pendingDevice = null;
    renderPanel();
    draw();
  }

  function applyFixture(item, id) {
    if (id === 'none') {
      item.fixture = 'none';
      for (const k of ['w', 'd', 'h', 'z']) delete item[k];
      return;
    }
    const m = MODELS.get(id);
    if (!m) return;
    Object.assign(item, { fixture: id, w: m.w, d: m.d, h: m.h, z: m.mount === 'ceiling' ? 0 : m.z });
    if (m.mount === 'wall') faceWall(item, null);
    settleOnSurface(item);
  }

  function setTool(tool) {
    S.tool = tool;
    S.wallDraft = null; S.ghost = null; S.pendingFurniture = null; S.pendingDevice = null;
    if (tool !== 'measure' && tool !== 'picture') { S.measure = null; S.calibrating = false; }
    for (const b of document.querySelectorAll('#tools [data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
    const hints = { select: T.hintSelect, room: T.hintRoom, wall: T.hintWall, furniture: T.hintPlace, device: T.hintPlace, door: T.doorNote, window: T.windowNote, measure: T.measureNote, picture: T.pictureNote };
    $('hint').textContent = hints[tool] || '';
    draw();
    renderPanel();
  }

  /* ---------------------------------------------------------------- panel */

  const field = (label, html) => `<label class="ed-field"><span>${esc(label)}</span>${html}</label>`;
  const input = (path, value, type) => `<input type="${type || 'text'}" data-path="${path}" value="${esc(value == null ? '' : value)}"${type === 'number' ? ' step="any"' : ''}>`;
  const options = (list, value, empty) => `${empty != null ? `<option value="">${esc(empty)}</option>` : ''}${list.map((o) => `<option value="${esc(o.id)}"${o.id === value ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}`;
  const zoneName = (id) => { const z = S.zones.find((x) => x.id === id); return z ? z.name : ''; };
  const devicesWith = (cap) => [...S.devices.values()].filter((d) => cap in d.caps).sort((a, b) => a.name.localeCompare(b.name));
  const deleteBtn = (what) => `<button type="button" class="ed-btn danger" data-action="delete-${what}">${S.armed === what ? T.confirmAgain : T.delete}</button>`;

  function renderPanel() {
    const panel = $('panel');
    const lv = level();
    if (!S.plan || S.creating) { panel.innerHTML = createPanel(); return; }
    let html = '';
    let key = 'level';
    const obj = selectedObject();
    // While placing furniture or devices the list stays; the piece just placed sits in a bar on top.
    const placing = (S.tool === 'furniture' || S.tool === 'device') && (!obj || S.sel.kind === 'item');
    if (placing) { key = S.tool; html = (obj ? selectedBar(obj) : '') + (S.tool === 'furniture' ? cataloguePanel() : devicesPanel(lv)); }
    else if (obj && S.sel.kind === 'room') html = roomPanel(obj);
    else if (obj && S.sel.kind === 'item') html = obj.kind === 'device' ? devicePanel(obj) : furniturePanel(obj);
    else if (obj && S.sel.kind === 'opening') html = openingPanel(obj);
    else if (obj && S.sel.kind === 'wall') html = wallPanel(obj);
    else if (S.tool === 'furniture') html = cataloguePanel();
    else if (S.tool === 'device') html = devicesPanel(lv);
    else if (S.tool === 'picture') html = picturePanel(lv);
    else if (S.tool === 'measure') html = measurePanel();
    else if (S.tool === 'calendar') html = calendarPanel();
    else if (S.tool === 'door' || S.tool === 'window') html = `<h2>${S.tool === 'door' ? T.door : T.window}</h2><p class="ed-note">${S.tool === 'door' ? T.doorNote : T.windowNote}</p>`;
    else html = levelPanel(lv);
    if (!placing) key = obj ? `sel:${S.sel.kind}` : S.tool;
    if (S.panelKey) S.scrolls[S.panelKey] = panel.scrollTop;
    panel.innerHTML = html;
    panel.scrollTop = S.scrolls[key] || 0;
    S.panelKey = key;
  }

  function turnButtons() {
    return `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="rot-left">⟲ ${esc(T.turnLeft)}</button><button type="button" class="ed-btn" data-action="rot-right">⟳ ${esc(T.turnRight)}</button></div>`;
  }

  function selectedBar(obj) {
    const dev = obj.kind === 'device' ? S.devices.get(obj.deviceId) : null;
    const name = obj.label || (dev && dev.name) || nameOf(MODELS.get(obj.type)) || '';
    return `<div class="ed-selbar"><span>✓ ${esc(name)}</span>
      <button type="button" class="ed-icon" data-action="rot-left" title="${esc(T.turnLeft)}">⟲</button>
      <button type="button" class="ed-icon" data-action="rot-right" title="${esc(T.turnRight)}">⟳</button>
      <button type="button" class="ed-btn small" data-action="sel-props">${T.properties}</button>
      <button type="button" class="ed-icon" data-action="delete-now" title="${esc(T.delete)}">🗑</button></div>`;
  }

  function selectedObject() {
    if (!S.sel) return null;
    const lv = level();
    const list = { room: lv.rooms, item: lv.items, opening: lv.openings, wall: lv.walls }[S.sel.kind];
    return (list || []).find((x) => x.id === S.sel.id) || null;
  }

  function createPanel() {
    return `<h2>${T.newPlan}</h2><p class="ed-note">${T.startNote}</p>
      ${field(T.name, `<input type="text" id="new-name" value="${esc(T.plan)}">`)}
      <div class="ed-row-btns"><button type="button" class="ed-btn primary" data-action="create-zones">${T.startFromZones}</button>
      <button type="button" class="ed-btn" data-action="create-blank">${T.startBlank}</button></div>`;
  }

  function levelPanel(lv) {
    const used = new Set(lv.rooms.map((r) => r.zoneId).filter(Boolean));
    const children = lv.zoneId ? S.zones.filter((z) => z.parent === lv.zoneId) : S.zones.filter((z) => z.parent && !S.zones.some((c) => c.parent === z.id));
    const free = children.filter((z) => !used.has(z.id));
    const zoneList = S.zones.map((z) => ({ id: z.id, name: z.name }));
    return `<h2>${T.level}</h2>
      ${field(T.name, input('level.name', lv.name))}
      ${field(T.zone, `<select data-path="level.zoneId" data-rerender="1">${options(zoneList, lv.zoneId, T.none)}</select>`)}
      <div class="ed-two">${field(T.wallHeight, input('level.wallHeight', lv.wallHeight, 'number'))}${field(T.wallThickness, input('level.wallThickness', lv.wallThickness, 'number'))}</div>
      <div class="ed-row-btns"><button type="button" class="ed-btn" data-action="align-all">⇹ ${T.alignAll}</button></div>
      <h3>${T.roomsFromZones}</h3>
      ${free.length ? `<div class="ed-list">${free.map((z) => `<div class="ed-list-row"><span>${esc(z.name)}</span><button type="button" class="ed-btn small" data-action="place-zone" data-zone="${esc(z.id)}">${T.place}</button></div>`).join('')}</div>` : `<p class="ed-note">${T.allPlaced}</p>`}
      <h3>${T.plan}</h3>
      ${field(T.name, input('plan.name', S.plan.name))}
      <div class="ed-row-btns">${S.plan.levels.length > 1 ? deleteBtn('level').replace(T.delete, T.deleteLevel) : ''}${deleteBtn('plan').replace(T.delete, T.deletePlan)}</div>`;
  }

  function roomPanel(room) {
    const zoneList = S.zones.map((z) => ({ id: z.id, name: z.name }));
    const temps = devicesWith('measure_temperature').map((d) => ({ id: d.id, name: `${d.name} (${zoneName(d.zone)})` }));
    const hums = devicesWith('measure_humidity').map((d) => ({ id: d.id, name: `${d.name} (${zoneName(d.zone)})` }));
    const climates = devicesWith('target_temperature').map((d) => ({ id: d.id, name: `${d.name} (${zoneName(d.zone)})` }));
    const area = Math.abs(G.signedArea(room.points)) / 10000;
    return `<h2>${T.room}</h2>
      ${field(T.name, input('sel.name', room.name))}
      ${field(T.zone, `<select data-path="sel.zoneId" data-rerender="1">${options(zoneList, room.zoneId, T.none)}</select>`)}
      <p class="ed-note">${T.area}: ${area.toFixed(1)} m²</p>
      ${lockRow(room)}
      ${room.locked ? '' : `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="room-straighten">📐 ${T.straighten}</button><button type="button" class="ed-btn" data-action="room-align">⇹ ${T.align}</button></div>`}
      ${field(T.floorColour, `<div class="ed-color"><input type="color" data-path="sel.color" value="${esc(room.color || '#ffffff')}"><button type="button" class="ed-btn small" data-action="clear-color">${T.themeColour}</button></div>`)}
      ${field(T.climate, `<select data-path="sel.climateDevice">${options(climates, room.climateDevice, T.zoneAverage)}</select>`)}
      ${field(T.tempFrom, `<select data-path="sel.tempDevice">${options(temps, room.tempDevice, T.zoneAverage)}</select>`)}
      ${field(T.humFrom, `<select data-path="sel.humDevice">${options(hums, room.humDevice, T.zoneAverage)}</select>`)}
      ${room.locked ? '' : `<div class="ed-row-btns">${deleteBtn('sel')}</div>`}`;
  }

  function lockRow(obj) {
    return `<div class="ed-row-btns"><button type="button" class="ed-btn${obj.locked ? ' on' : ''}" data-action="toggle-lock">${obj.locked ? `🔓 ${T.unlock}` : `🔒 ${T.lock}`}</button></div>
      ${obj.locked ? `<p class="ed-note">${T.lockedNote}</p>` : ''}`;
  }

  function devicePanel(item) {
    const all = [...S.devices.values()].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: `${d.name} (${zoneName(d.zone)})` }));
    const dev = S.devices.get(item.deviceId);
    const kinds = Object.keys(core.GLYPHS).map((k) => ({ id: k, name: k }));
    const mounts = [{ id: 'ceiling', name: T.ceiling }, { id: 'wall', name: T.wall }, { id: 'floor', name: T.floor }];
    const isLight = core.isLampItem(item, dev);
    const climate = !isLight && dev && core.deviceKind(dev) === 'thermostat' ? core.deviceFixture(item, dev) : undefined;
    // Anything that switches (a group of lamps, a plug with a lamp on it) can be shown as a lamp.
    const switchable = dev && ('onoff' in dev.caps || 'dim' in dev.caps);
    const lampToggle = !isLight && switchable
      ? `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="pick-fixture" data-type="${MODELS.DEFAULT_FIXTURE}">💡 ${T.asLamp}</button></div>`
      : (isLight && item.fixture && dev && core.deviceKind(dev) !== 'light' ? `<div class="ed-row-btns"><button type="button" class="ed-btn small" data-action="no-fixture">${T.notLamp}</button></div>` : '');
    const groupNote = dev && dev.group ? `<p class="ed-note">${T.groupNote}</p>` : '';
    const fixture = isLight ? MODELS.get(item.fixture || MODELS.DEFAULT_FIXTURE) : climate || null;
    const tile = (m) => `<button type="button" class="ed-tile${fixture && fixture.id === m.id ? ' on' : ''}" data-action="pick-fixture" data-type="${m.id}">${modelTile(m)}<span>${esc(nameOf(m))}</span></button>`;
    const badgeTile = `<button type="button" class="ed-tile${climate === null ? ' on' : ''}" data-action="pick-fixture" data-type="none"><svg viewBox="0 0 100 75"><circle cx="50" cy="37" r="16" fill="var(--ed-accent)"/><circle cx="50" cy="37" r="6" fill="#fff"/></svg><span>${T.badgeOnly}</span></button>`;
    const fixtures = isLight
      ? `<h3>${T.lampType}</h3><div class="ed-grid">${MODELS.lights().map(tile).join('')}</div>`
      : climate !== undefined ? `<h3>${T.model}</h3><div class="ed-grid">${MODELS.climate().map(tile).join('')}${badgeTile}</div>` : '';
    const sizes = fixture
      ? `<div class="ed-three">${field(T.width, input('sel.w', item.w || fixture.w, 'number'))}${field(T.depth, input('sel.d', item.d || fixture.d, 'number'))}${field(fixture.fixture === 'pendant' ? T.drop : T.height, input('sel.h', item.h || fixture.h, 'number'))}</div>
      ${fixture.mount !== 'ceiling' ? field(fixture.mount === 'surface' ? T.standsOn : T.elevation, input('sel.z', item.z != null ? item.z : fixture.z, 'number')) : ''}
      ${field(T.rotation, input('sel.rot', item.rot || 0, 'number'))}${turnButtons()}`
      : '';
    const other = isLight
      ? field(T.reach, `<input type="range" min="60" max="800" step="10" data-path="sel.reach" data-num="1" value="${item.reach || core.DEFAULTS.lightReach}">`)
      : `<div class="ed-two">${field(T.shape, `<select data-path="sel.shape">${options(kinds, item.shape, T.auto)}</select>`)}
      ${field(T.mount, `<select data-path="sel.mount">${options(mounts, item.mount, T.auto)}</select>`)}</div>`;
    return `<h2>${esc((dev && dev.name) || T.device)}</h2>
      ${field(T.device, `<select data-path="sel.deviceId" data-rerender="1">${options(all, item.deviceId)}</select>`)}
      ${field(T.label, input('sel.label', item.label))}
      ${groupNote}${lampToggle}
      ${fixtures}${sizes}${other}
      <label class="ed-check"><input type="checkbox" data-path="sel.showValue" data-bool="1"${item.showValue !== false ? ' checked' : ''}>${T.showValue}</label>
      <div class="ed-row-btns">${deleteBtn('sel')}</div>`;
  }

  function furniturePanel(item) {
    const entry = MODELS.get(item.type);
    return `<h2>${esc(item.label || nameOf(entry) || T.furniture)}</h2>
      ${entry ? `<div class="ed-model-head">${modelTile(entry)}<span class="ed-note">${esc(nameOf(entry))}<br>${esc(MODELS.PACKS[entry.pack].name)}</span></div>` : ''}
      ${field(T.label, input('sel.label', item.label))}
      <h3>${T.size}</h3>
      <div class="ed-three">${field(T.width, input('sel.w', item.w, 'number'))}${field(T.depth, input('sel.d', item.d, 'number'))}${field(T.height, input('sel.h', item.h, 'number'))}</div>
      <label class="ed-check"><input type="checkbox" data-path="sel.lockRatio" data-bool="1"${item.lockRatio ? ' checked' : ''}>${T.keepRatio}</label>
      <p class="ed-note">${T.resizeHint}</p>
      <div class="ed-two">${field(item.mount === 'surface' ? T.standsOn : T.elevation, input('sel.z', item.z || 0, 'number'))}${field(T.rotation, input('sel.rot', item.rot || 0, 'number'))}</div>
      ${turnButtons()}
      ${field(T.colour, `<div class="ed-color"><input type="color" data-path="sel.color" value="${esc(item.color || '#cfc8bd')}"><button type="button" class="ed-btn small" data-action="clear-color">${T.themeColour}</button></div>`)}
      <div class="ed-row-btns">${deleteBtn('sel')}</div>`;
  }

  function openingPanel(o) {
    const linkable = [...S.devices.values()].filter((d) => ['alarm_contact', 'locked', 'windowcoverings_set', 'windowcoverings_state'].some((c) => c in d.caps))
      .sort((a, b) => a.name.localeCompare(b.name));
    const list = linkable.length
      ? linkable.map((d) => `<label class="ed-check"><input type="checkbox" data-link="${esc(d.id)}"${(o.devices || []).includes(d.id) ? ' checked' : ''}>${esc(d.name)} <span class="ed-note" style="margin:0">${esc(zoneName(d.zone))}</span></label>`).join('')
      : `<p class="ed-note">${T.noLinkable}</p>`;
    return `<h2>${o.type === 'door' ? T.door : T.window}</h2>
      ${field(T.type, `<select data-path="sel.type" data-rerender="1">${options([{ id: 'door', name: T.door }, { id: 'window', name: T.window }], o.type)}</select>`)}
      ${field(T.width, input('sel.width', Math.round(o.width), 'number'))}
      ${o.type === 'door' ? `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="flip-swing">${T.flipSwing}</button><button type="button" class="ed-btn" data-action="flip-hinge">${T.flipHinge}</button></div>` : `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="flip-blind">${T.flipSwing}</button></div>`}
      <h3>${T.shows}</h3>${list}
      <div class="ed-row-btns">${deleteBtn('sel')}</div>`;
  }

  function wallPanel(w) {
    if (w.locked) {
      return `<h2>${T.freeWall}</h2><p>${T.length}: <b>${Math.round(G.dist(w.a, w.b))}</b></p>${lockRow(w)}`;
    }
    return `<h2>${T.freeWall}</h2>
      ${field(T.length, `<input type="number" data-action-input="wall-length" value="${Math.round(G.dist(w.a, w.b))}">`)}
      ${field(T.thickness, input('sel.t', w.t || level().wallThickness, 'number'))}
      <div class="ed-row-btns"><button type="button" class="ed-btn" data-action="wall-h">↔ ${T.horizontal}</button><button type="button" class="ed-btn" data-action="wall-v">↕ ${T.vertical}</button></div>
      <div class="ed-row-btns"><button type="button" class="ed-btn" data-action="wall-align">⇹ ${T.align}</button></div>
      ${lockRow(w)}
      <div class="ed-row-btns">${deleteBtn('sel')}</div>`;
  }

  // Catalogue tile: the rendered view of a model, or a drawn shape for pieces made in code.
  function modelTile(entry) {
    if (entry.file) return `<img src="models/thumbs/${esc(entry.id)}.png" alt="" loading="lazy">`;
    const pal = isDark() ? core.DARK_PALETTE : core.LIGHT_PALETTE;
    const icons = {
      ceiling: '<ellipse cx="50" cy="40" rx="34" ry="10" fill="#f4f3ef" stroke="#999"/><ellipse cx="50" cy="44" rx="28" ry="6" fill="#ffe7a8"/>',
      pendant: '<line x1="50" y1="0" x2="50" y2="30" stroke="#666" stroke-width="2"/><path d="M28 52 L50 28 L72 52 Z" fill="#2f3b45"/><circle cx="50" cy="54" r="6" fill="#ffe7a8"/>',
      spot: '<rect x="38" y="30" width="24" height="14" rx="3" fill="#f4f3ef" stroke="#999"/><ellipse cx="50" cy="45" rx="9" ry="3" fill="#ffe7a8"/>',
      wall: '<rect x="44" y="18" width="12" height="40" rx="2" fill="#ddd"/><path d="M30 30 h40 l-8 22 h-24 z" fill="#f1ece2" stroke="#bbb"/><circle cx="50" cy="44" r="5" fill="#ffe7a8"/>',
      strip: '<rect x="10" y="40" width="80" height="6" rx="3" fill="#ffe7a8" stroke="#e0b84f"/>',
      thermostat: '<rect x="34" y="14" width="32" height="44" rx="5" fill="#f4f3ef" stroke="#999"/><rect x="39" y="20" width="22" height="22" rx="2" fill="#1d2226"/><text x="50" y="35" font-size="9" font-weight="600" fill="#fff" text-anchor="middle">21°</text>',
      trv: '<rect x="12" y="28" width="36" height="18" rx="2" fill="#ddd" stroke="#bbb"/><circle cx="62" cy="37" r="14" fill="#f4f3ef" stroke="#999"/><circle cx="62" cy="37" r="7" fill="#2b2b2d"/>',
    };
    let body;
    if (entry.fixture) body = icons[entry.fixture];
    else {
      const parts = core.furnitureParts({ type: entry.parts, w: entry.w, d: entry.d, h: entry.h });
      const m = Math.max(entry.w, entry.d) * 0.6;
      const polys = parts.sort((a, b) => a.z1 - b.z1).map((p) => `<polygon points="${p.poly.map((q) => q.map(f1).join(',')).join(' ')}" fill="${pal[p.tone === 'dark' ? 'dark2' : p.tone] || pal.body}" stroke="${pal.textDim}" stroke-width="${f1(m / 40)}"/>`).join('');
      body = `<g transform="translate(50 37) scale(${(35 / m).toFixed(4)})">${polys}</g>`;
    }
    return `<svg viewBox="0 0 100 75">${body}</svg>`;
  }

  function cataloguePanel() {
    const q = S.furnitureSearch.toLowerCase();
    const list = MODELS.list().filter((m) => !q || nameOf(m).toLowerCase().includes(q) || m.name.en.toLowerCase().includes(q));
    const groups = MODELS.GROUPS.map((g) => ({ g, items: list.filter((m) => m.group === g.id) })).filter((x) => x.items.length);
    const credits = Object.values(MODELS.PACKS).filter((p) => p.license).map((p) => `${esc(p.name)} · ${esc(p.author)} · ${esc(p.license)}`).join('<br>');
    const tiles = (items) => items.map((m) => `<button type="button" draggable="true" class="ed-tile${S.pendingFurniture === m.id ? ' on' : ''}" data-action="pick-furniture" data-type="${m.id}" title="${esc(nameOf(m))} · ${m.w} × ${m.d} cm">${modelTile(m)}<span>${esc(nameOf(m))}</span></button>`).join('');
    return `<h2>${T.furniture}</h2><p class="ed-note">${T.dragHint} ${T.catalogue}</p>
      <input type="text" id="furniture-search" placeholder="${esc(T.searchFurniture)}" value="${esc(S.furnitureSearch)}">
      ${groups.map(({ g, items }) => `<h3>${esc(g.name[LANG] || g.name.en)}</h3><div class="ed-grid">${tiles(items)}</div>`).join('')}
      <h3>${T.modelsBy}</h3><p class="ed-note">${credits}</p>`;
  }

  function devicesPanel(lv) {
    const placed = new Set(S.plan.levels.flatMap((l) => l.items.filter((i) => i.kind === 'device').map((i) => i.deviceId)));
    const q = S.deviceSearch.toLowerCase();
    const unplaced = [...S.devices.values()].filter((d) => !placed.has(d.id) && (!q || d.name.toLowerCase().includes(q)));
    const roomZones = new Map(lv.rooms.filter((r) => r.zoneId).map((r) => [r.zoneId, r]));
    const groups = new Map();
    for (const d of unplaced) {
      const key = roomZones.has(d.zone) ? d.zone : '__else';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const order = [...groups.keys()].sort((a, b) => (a === '__else') - (b === '__else'));
    const rows = order.map((key) => {
      const list = groups.get(key).sort((a, b) => a.name.localeCompare(b.name));
      const room = roomZones.get(key);
      const head = room ? `<h3 style="display:flex;justify-content:space-between;align-items:center">${esc(room.name)}<button type="button" class="ed-btn small" data-action="place-all" data-room="${esc(room.id)}">${T.placeAll}</button></h3>` : `<h3>${T.elsewhere}</h3>`;
      return head + `<div class="ed-list">${list.map((d) => `<div class="ed-list-row${S.pendingDevice === d.id ? ' on' : ''}" draggable="true" data-action="pick-device" data-device="${esc(d.id)}"><span>${esc(d.name)}</span><span class="meta">${esc(room ? (d.group ? `${core.deviceKind(d)} · ${T.groupWord}` : core.deviceKind(d)) : zoneName(d.zone))}</span></div>`).join('')}</div>`;
    }).join('');
    return `<h2>${T.devices}</h2><p class="ed-note">${T.devicesNote}</p><input type="text" id="device-search" placeholder="${esc(T.search)}" value="${esc(S.deviceSearch)}">${rows || `<p class="ed-note">—</p>`}`;
  }

  function measurePanel() {
    const L = S.measure ? G.dist(S.measure.a, S.measure.b) : 0;
    return `<h2>📏</h2><p class="ed-note">${T.measureNote}</p>${L ? `<p>${T.measured}: <b>${fmtLen(L)}</b></p>` : ''}`;
  }

  function picturePanel(lv) {
    const bg = lv.background;
    const L = S.measure ? G.dist(S.measure.a, S.measure.b) : 0;
    return `<h2>${T.picture}</h2><p class="ed-note">${T.pictureNote}</p>
      <input type="file" id="bg-file" accept="image/*,application/pdf,.pdf" hidden>
      ${pdfPanel()}
      <div class="ed-row-btns"><button type="button" class="ed-btn primary" data-action="bg-pick">${T.addPicture}</button>${bg ? `<button type="button" class="ed-btn danger" data-action="bg-remove">${T.removePicture}</button>` : ''}</div>
      ${bg ? `${field(T.opacity, `<input type="range" min="0.1" max="1" step="0.05" data-path="level.background.opacity" data-num="1" value="${bg.opacity}">`)}
      <div class="ed-three">${field('x', input('level.background.x', Math.round(bg.x), 'number'))}${field('y', input('level.background.y', Math.round(bg.y), 'number'))}${field(T.width, input('level.background.w', Math.round(bg.w), 'number'))}</div>
      <h3>${T.setScale}</h3>
      ${L ? `<p>${T.measured}: <b>${fmtLen(L)}</b></p>${field(T.realLength, '<input type="number" id="real-length" step="any">')}<button type="button" class="ed-btn primary" data-action="bg-scale">${T.apply}</button>` : `<p class="ed-note">${T.measureNote}</p>`}
      ${recognisePanel(lv)}` : ''}`;
  }

  function recognisePanel(lv) {
    const bg = lv.background;
    const d = S.detection;
    const darkOptions = [{ id: '', name: T.auto }].concat([0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((v) => ({ id: String(v), name: `${Math.round(v * 100)}%` })));
    let html = `<h3>${T.recognise}</h3><p class="ed-note">${T.recogniseNote}</p>
      ${bg.calibrated ? '' : `<p class="ed-note" style="color:var(--ed-danger)">${T.scaleFirst}</p>`}
      ${field(T.darkness, `<select id="detect-darkness">${options(darkOptions, S.detectDarkness)}</select>`)}
      <div class="ed-row-btns"><button type="button" class="ed-btn primary" data-action="detect-run"${S.detecting ? ' disabled' : ''}>${S.detecting ? T.recognising : T.recogniseRun}</button></div>`;
    if (!d) return html;
    if (!d.rooms.length) return `${html}<p class="ed-note">${T.nothingFound}</p>`;
    const doors = d.openings.filter((o) => o.type === 'door').length;
    const windows = d.openings.filter((o) => o.type === 'window').length;
    const zoneList = (lv.zoneId ? S.zones.filter((z) => z.parent === lv.zoneId) : S.zones.filter((z) => z.parent)).map((z) => ({ id: z.id, name: z.name }));
    html += `<p><b>${T.found}:</b> ${d.rooms.length} ${T.roomsWord}, ${doors} ${T.doorsWord}, ${windows} ${T.windowsWord}</p>
      <p class="ed-note">${T.checkDraft}</p>
      <div class="ed-list">${d.rooms.map((pts, i) => `<div class="ed-list-row" style="cursor:default"><span><b>${i + 1}</b> · ${(Math.abs(G.signedArea(pts)) / 10000).toFixed(1)} m²</span>
        <select data-detect-zone="${i}" style="max-width:60%">${options(zoneList, d.zones[i] || '', `${T.roomName} ${i + 1}`)}</select></div>`).join('')}</div>
      <label class="ed-check"><input type="checkbox" id="detect-replace"${d.replace ? ' checked' : ''}>${T.replaceExisting}</label>
      <div class="ed-row-btns"><button type="button" class="ed-btn primary" data-action="detect-apply">${T.applyDraft}</button><button type="button" class="ed-btn" data-action="detect-discard">${T.discard}</button></div>`;
    return html;
  }

  // Runs the recognition on the level's picture (lib/shared/plan-detect.js) and keeps the result as a draft.
  function runDetection() {
    const lv = level();
    const bg = lv.background;
    if (!bg || !window.FloorplanDetect) return;
    S.detecting = true;
    renderPanel();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      // Let the panel show "recognising" before the work starts.
      setTimeout(() => {
        try {
          const cmPerPx = bg.w / c.width;
          const result = window.FloorplanDetect.detect(data, {
            pxPerCm: bg.calibrated ? 1 / cmPerPx : null,
            darkness: S.detectDarkness ? Number(S.detectDarkness) : null,
          });
          const plan = window.FloorplanDetect.toPlan(result, cmPerPx, (x, y) => [bg.x + x * cmPerPx, bg.y + y * (bg.h / c.height)]);
          // Rooms from top-left to bottom-right, numbered in reading order.
          plan.rooms.sort((a, b) => (G.bbox(a).minY - G.bbox(b).minY) || (G.bbox(a).minX - G.bbox(b).minX));
          S.detection = { ...plan, zones: plan.rooms.map(() => ''), replace: true };
        } catch (err) {
          S.detection = { rooms: [], openings: [], zones: [], error: String(err.message || err) };
        }
        S.detecting = false;
        draw(); renderPanel();
      }, 30);
    };
    img.onerror = () => { S.detecting = false; renderPanel(); };
    img.src = bg.src;
  }

  // Turns the draft into rooms, doors and windows of the level; doors and windows go onto the nearest wall.
  function applyDetection() {
    const d = S.detection;
    const lv = level();
    commit(() => {
      if (d.replace) { lv.rooms = []; lv.openings = []; lv.walls = []; }
      lv.wallThickness = d.wallThickness || lv.wallThickness;
      d.rooms.forEach((pts, i) => {
        const zone = S.zones.find((z) => z.id === d.zones[i]);
        lv.rooms.push({ id: core.uid('room'), name: zone ? zone.name : `${T.roomName} ${lv.rooms.length + 1}`, zoneId: zone ? zone.id : null, points: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]) });
      });
      const walls = core.levelWalls(lv);
      for (const o of d.openings) {
        let best = null;
        for (const w of walls) {
          const pr = G.projectOnSegment([o.x, o.y], w.a, w.b);
          if (pr.d <= Math.max(30, lv.wallThickness * 2) && (!best || pr.d < best.d)) best = { w, ...pr };
        }
        if (!best) continue;
        const u = G.norm(G.sub(best.w.b, best.w.a));
        const L = G.dist(best.w.a, best.w.b);
        const width = Math.min(o.width, L - 10);
        if (width < 30) continue;
        let s = G.dot(G.sub(best.point, best.w.a), u);
        s = Math.max(width / 2, Math.min(L - width / 2, s));
        const at = G.add(best.w.a, G.mul(u, s));
        // The wall may run the other way than the recognised opening: then swing and hinge turn around too.
        const flip = G.dot(u, [Math.cos(o.angle), Math.sin(o.angle)]) < 0 ? -1 : 1;
        lv.openings.push({ id: core.uid('open'), type: o.type, x: Math.round(at[0]), y: Math.round(at[1]), angle: Math.atan2(u[1], u[0]), width: Math.round(width), swing: (o.swing || 1) * flip, hinge: (o.hinge || 1) * flip, devices: [] });
      }
      if (lv.background) lv.background.opacity = Math.min(lv.background.opacity, 0.3);
      S.detection = null;
      S.sel = null;
    });
    fit(); draw();
  }

  function calendarPanel() {
    const rows = S.calendars.map((c, i) => `<div class="ed-list-row" style="flex-direction:column;align-items:stretch;cursor:default">
      <div class="ed-two">${field(T.name, `<input type="text" data-cal="${i}" data-key="name" value="${esc(c.name)}">`)}${field(T.colour, `<input type="color" data-cal="${i}" data-key="color" value="${esc(c.color || '#2e5bff')}">`)}</div>
      ${field(T.calendarUrl, `<input type="text" data-cal="${i}" data-key="url" value="${esc(c.url)}" placeholder="https://…/basic.ics" autocomplete="off" spellcheck="false">`)}
      <button type="button" class="ed-btn small danger" data-action="cal-remove" data-index="${i}">${T.remove}</button></div>`).join('');
    return `<h2>${T.calendars}</h2><p class="ed-note">${T.calendarsNote}</p><div class="ed-list">${rows}</div>
      <div class="ed-row-btns"><button type="button" class="ed-btn" data-action="cal-add">${T.addCalendar}</button><button type="button" class="ed-btn primary" data-action="cal-save">${T.save}</button></div>
      ${S.calendarsNote ? `<p class="ed-note">${esc(S.calendarsNote)}</p>` : ''}`;
  }

  /* -------------------------------------------------------- panel events */

  function setPath(path, value) {
    const lv = level();
    const [root, ...rest] = path.split('.');
    let obj = root === 'level' ? lv : root === 'plan' ? S.plan : selectedObject();
    for (let i = 0; i < rest.length - 1; i++) obj = obj[rest[i]];
    const key = rest[rest.length - 1];
    if (value === '' || value == null) delete obj[key]; else obj[key] = value;
  }

  function onPanelInput(ev) {
    const el = ev.target;
    if (el.id === 'furniture-search') { S.furnitureSearch = el.value; const pos = el.selectionStart; renderPanel(); const s2 = $('furniture-search'); s2.focus(); s2.setSelectionRange(pos, pos); return; }
    if (el.id === 'device-search') { S.deviceSearch = el.value; const pos = el.selectionStart; renderPanel(); const s = $('device-search'); s.focus(); s.setSelectionRange(pos, pos); return; }
    if (el.dataset.cal != null) { S.calendars[Number(el.dataset.cal)][el.dataset.key] = el.value; S.calendarsNote = ''; return; }
    if (!el.dataset.path) return;
    if (ev.type === 'input' && el.tagName === 'SELECT') return;
    let value = el.value;
    if (el.dataset.bool) value = el.checked;
    else if (el.type === 'number' || el.dataset.num) value = value === '' ? '' : Number(value);
    if (el.type === 'number' && !Number.isFinite(value) && value !== '') return;
    if (!S.typingSnap || S.typingSnap !== el) { snapshot(); S.typingSnap = el; }
    if (el.dataset.path === 'sel.w' || el.dataset.path === 'sel.d' || el.dataset.path === 'sel.h') {
      value = Math.max(1, value || 1);
      const obj = selectedObject();
      const key = el.dataset.path.slice(4);
      if (obj && obj.lockRatio) {
        const dm = dims(obj);
        const f = value / (dm[key] || value);
        for (const other of ['w', 'd', 'h']) if (other !== key) obj[other] = Math.round(dm[other] * f);
        renderPanelSoon(el);
      }
    }
    setPath(el.dataset.path, value);
    if (el.dataset.path === 'sel.type' && S.sel.kind === 'item') {
      const c = core.CATALOGUE[value];
      const it = selectedObject();
      Object.assign(it, { w: c.w, d: c.d, h: c.h, z: c.z || 0, label: c.name });
    }
    if (el.dataset.path === 'level.background.w') {
      const bg = level().background;
      bg.h = bg.w * bg.ratio;
    }
    changed({ panel: !!el.dataset.rerender });
    if (el.dataset.path.startsWith('level.name') || el.dataset.path.startsWith('plan.name')) { renderLevels(); renderPlanSelect(); }
  }

  async function onPanelClick(ev) {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const lv = level();
    const action = el.dataset.action;
    const armOrRun = (key, fn) => {
      if (S.armed === key) { S.armed = null; fn(); } else { S.armed = key; renderPanel(); }
    };
    switch (action) {
      case 'create-zones': case 'create-blank': {
        const plan = core.newPlan(($('new-name') && $('new-name').value) || T.plan);
        if (action === 'create-zones') {
          const levels = core.levelsFromZones(S.zones);
          if (levels.length) plan.levels = levels;
        }
        S.plan = plan; S.levelId = plan.levels[0].id; S.creating = false; S.undo = []; S.redo = []; S.sel = null;
        S.plans.push(plan);
        renderPlanSelect(); renderLevels(); fit(); changed();
        break;
      }
      case 'place-zone': {
        const zone = S.zones.find((z) => z.id === el.dataset.zone);
        const c = [S.cam[0] + S.cam[2] / 2, S.cam[1] + S.cam[3] / 2].map((v) => Math.round(v / 10) * 10);
        commit(() => {
          const room = { id: core.uid('room'), name: zone.name, zoneId: zone.id, points: G.rect(c[0] - 200, c[1] - 200, c[0] + 200, c[1] + 200) };
          lv.rooms.push(room);
          S.sel = { kind: 'room', id: room.id };
        });
        break;
      }
      case 'delete-sel': armOrRun('sel', deleteSelection); break;
      case 'delete-level': armOrRun('level', () => commit(() => {
        S.plan.levels = S.plan.levels.filter((l) => l.id !== lv.id);
        S.levelId = S.plan.levels[0].id;
        renderLevels();
      })); break;
      case 'delete-plan': armOrRun('plan', async () => {
        await api('DELETE', `/plans/${encodeURIComponent(S.plan.id)}`).catch(() => {});
        S.plans = S.plans.filter((p) => p.id !== S.plan.id);
        openPlan(S.plans[0] || null);
      }); break;
      case 'clear-color': commit(() => { delete selectedObject().color; }); break;
      case 'flip-swing': commit(() => { const o = selectedObject(); o.swing = -(o.swing || 1); }); break;
      case 'flip-hinge': commit(() => { const o = selectedObject(); o.hinge = -(o.hinge || 1); }); break;
      case 'flip-blind': commit(() => { const o = selectedObject(); o.blindSide = -(o.blindSide || 1); }); break;
      case 'wall-h': case 'wall-v': {
        // Turn the wall about its middle to exactly horizontal or vertical, keeping its length.
        const w = selectedObject();
        commit(() => {
          const mid = G.mul(G.add(w.a, w.b), 0.5);
          const half = G.dist(w.a, w.b) / 2;
          const u = action === 'wall-h' ? [1, 0] : [0, 1];
          w.a = G.sub(mid, G.mul(u, half)).map(Math.round);
          w.b = G.add(mid, G.mul(u, half)).map(Math.round);
        });
        break;
      }
      case 'room-straighten': commit(() => straightenRoom(selectedObject())); break;
      case 'room-align': commit(() => alignToWalls(selectedObject(), true)); break;
      case 'wall-align': commit(() => alignToWalls(selectedObject(), false)); break;
      case 'align-all': commit(alignAll); break;
      case 'toggle-lock': commit(() => { const o = selectedObject(); if (o.locked) delete o.locked; else o.locked = true; }); break;
      case 'rot-left': case 'rot-right': {
        const it = selectedObject();
        // Quarter turns, kept on whole degrees (R on the keyboard still turns 15°).
        if (it) commit(() => { it.rot = ((Math.round((it.rot || 0) / 90) * 90 + (action === 'rot-left' ? -90 : 90)) % 360 + 360) % 360; });
        break;
      }
      case 'sel-props': setTool('select'); break;
      case 'delete-now': deleteSelection(); break;
      case 'pick-fixture': commit(() => applyFixture(selectedObject(), el.dataset.type)); break;
      case 'no-fixture': commit(() => { const it = selectedObject(); for (const k of ['fixture', 'w', 'd', 'h', 'z']) delete it[k]; }); break;
      case 'pick-furniture': S.pendingFurniture = S.pendingFurniture === el.dataset.type ? null : el.dataset.type; renderPanel(); draw(); break;
      case 'pick-device': S.pendingDevice = S.pendingDevice === el.dataset.device ? null : el.dataset.device; renderPanel(); draw(); break;
      case 'place-all': {
        const room = lv.rooms.find((r) => r.id === el.dataset.room);
        const placed = new Set(S.plan.levels.flatMap((l) => l.items.filter((i) => i.kind === 'device').map((i) => i.deviceId)));
        const list = [...S.devices.values()].filter((d) => d.zone === room.zoneId && !placed.has(d.id));
        commit(() => lv.items.push(...core.autoPlace(room, list)));
        break;
      }
      case 'cal-add': S.calendars.push({ name: '', url: '', color: '#2e5bff' }); renderPanel(); break;
      case 'cal-remove': S.calendars.splice(Number(el.dataset.index), 1); renderPanel(); break;
      case 'cal-save':
        try {
          S.calendars = await api('PUT', '/calendars', S.calendars.filter((c) => c.url.trim()));
          S.calendarsNote = T.calendarsSaved;
        } catch (err) {
          S.calendarsNote = String(err.message || err);
        }
        renderPanel();
        break;
      case 'pdf-page': {
        const page = S.pdfPages[Number(el.dataset.index)];
        const like = S.plan.levels.map((l) => l.background).find((b) => b && b.calibrated);
        commit(() => setBackground(lv, page.src, page.w, page.h, like));
        S.pdfPages = null;
        renderPanel();
        break;
      }
      case 'pdf-all': {
        // Page 1 on the current level, the next pages on the levels after it (new levels where needed).
        const start = S.plan.levels.indexOf(lv);
        commit(() => {
          S.pdfPages.forEach((page, i) => {
            let target = S.plan.levels[start + i];
            if (!target) { target = core.newLevel(`${T.levelWord} ${start + i + 1}`); S.plan.levels.push(target); }
            const like = S.plan.levels.map((l) => l.background).find((b) => b && b.calibrated);
            setBackground(target, page.src, page.w, page.h, like);
          });
        });
        S.pdfPages = null;
        renderLevels(); renderPanel();
        break;
      }
      case 'detect-run': runDetection(); break;
      case 'detect-apply': applyDetection(); break;
      case 'detect-discard': S.detection = null; draw(); renderPanel(); break;
      case 'bg-pick': $('bg-file').click(); break;
      case 'bg-remove': commit(() => { lv.background = null; }); break;
      case 'bg-scale': {
        const real = Number($('real-length').value);
        const L = G.dist(S.measure.a, S.measure.b);
        if (!(real > 0) || !L) return;
        const k = real / L;
        const a = S.measure.a;
        commit(() => {
          const bg = lv.background;
          bg.x = a[0] + (bg.x - a[0]) * k; bg.y = a[1] + (bg.y - a[1]) * k;
          bg.w *= k; bg.h *= k;
          bg.calibrated = true;
          S.measure = null;
        });
        break;
      }
      default: break;
    }
  }

  // Refreshes the other size fields after a proportional change, keeping focus in the field being typed in.
  function renderPanelSoon(el) {
    const path = el.dataset.path;
    setTimeout(() => {
      const obj = selectedObject();
      if (!obj) return;
      for (const key of ['w', 'd', 'h']) {
        const f = document.querySelector(`[data-path="sel.${key}"]`);
        if (f && f.dataset.path !== path) f.value = obj[key];
      }
    }, 0);
  }

  function onPanelChange(ev) {
    const el = ev.target;
    if (el.dataset.link) {
      commit(() => {
        const o = selectedObject();
        const set = new Set(o.devices || []);
        if (el.checked) set.add(el.dataset.link); else set.delete(el.dataset.link);
        o.devices = [...set];
      });
      return;
    }
    if (el.dataset.actionInput === 'wall-length') {
      const w = selectedObject();
      const L = Number(el.value);
      if (!(L > 0)) return;
      commit(() => { const u = G.norm(G.sub(w.b, w.a)); w.b = G.add(w.a, G.mul(u, L)).map(Math.round); });
      return;
    }
    if (el.id === 'bg-file' && el.files && el.files[0]) { loadPicture(el.files[0]); return; }
    if (el.id === 'detect-darkness') { S.detectDarkness = el.value; return; }
    if (el.id === 'detect-replace' && S.detection) { S.detection.replace = el.checked; return; }
    if (el.dataset.detectZone != null && S.detection) { S.detection.zones[Number(el.dataset.detectZone)] = el.value; return; }
    if (el.tagName === 'SELECT' && el.dataset.path) onPanelInput(ev);
    S.typingSnap = null;
  }

  // Downscale traced pictures so plans stay small enough for Homey's settings store.
  function loadPicture(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) { loadPdf(file); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1800;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        commit(() => setBackground(level(), c.toDataURL('image/jpeg', 0.8), c.width, c.height));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // A picture under a level for tracing. When another level already has its picture at a known scale
  // (pages of the same PDF), the new one takes over that place and scale.
  function setBackground(lv, src, pw, ph, like) {
    const ratio = ph / pw;
    if (like && like.calibrated) {
      lv.background = { src, x: like.x, y: like.y, w: like.w, h: like.w * ratio, ratio, opacity: like.opacity, calibrated: true };
      return;
    }
    const w = 1000;
    lv.background = { src, x: S.cam[0] + S.cam[2] / 2 - w / 2, y: S.cam[1] + S.cam[3] / 2 - (w * ratio) / 2, w, h: w * ratio, ratio, opacity: 0.5 };
  }

  // PDF (estate agent drawings often come as one): every page is drawn with pdf.js, big enough to recognise.
  async function loadPdf(file) {
    S.pdfStatus = T.pdfLoading; S.pdfPages = null;
    renderPanel();
    try {
      // Through Function, so older browsers can still read this file (they only fail when a PDF is chosen).
      const pdfjs = await new Function('u', 'return import(u)')(new URL('vendor/pdfjs/pdf.min.mjs', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
        const c = document.createElement('canvas');
        c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const t = document.createElement('canvas');
        const k = 140 / Math.max(c.width, c.height);
        t.width = Math.round(c.width * k); t.height = Math.round(c.height * k);
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        pages.push({ src: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height, thumb: t.toDataURL('image/png') });
      }
      S.pdfPages = pages;
      S.pdfStatus = '';
    } catch (err) {
      S.pdfStatus = `${T.pdfFailed}: ${err.message || err}`;
    }
    renderPanel();
  }

  function pdfPanel() {
    if (S.pdfStatus) return `<p class="ed-note">${esc(S.pdfStatus)}</p>`;
    if (!S.pdfPages) return '';
    return `<h3>${T.pdfPages}</h3><p class="ed-note">${T.pdfPick}</p>
      <div class="ed-grid">${S.pdfPages.map((p, i) => `<button type="button" class="ed-tile" data-action="pdf-page" data-index="${i}"><img src="${p.thumb}" alt="" style="height:80px">${T.page} ${i + 1}</button>`).join('')}</div>
      ${S.pdfPages.length > 1 ? `<div class="ed-row-btns"><button type="button" class="ed-btn" data-action="pdf-all">${T.pdfAll}</button></div>` : ''}`;
  }

  /* ------------------------------------------------------- top bar & tabs */

  function renderPlanSelect() {
    const sel = $('plan-select');
    sel.innerHTML = S.plans.map((p) => `<option value="${esc(p.id)}"${S.plan && p.id === S.plan.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    sel.hidden = !S.plans.length;
  }

  function renderLevels() {
    const box = $('level-tabs');
    if (!S.plan) { box.innerHTML = ''; return; }
    box.innerHTML = S.plan.levels.map((l) => `<button type="button" data-level="${esc(l.id)}" class="${l.id === (level() || {}).id ? 'on' : ''}">${esc(l.name)}</button>`).join('');
  }

  function updateButtons() {
    $('undo').disabled = !S.undo.length;
    $('redo').disabled = !S.redo.length;
    $('snap').classList.toggle('on', S.snap);
    $('toggle-grid').classList.toggle('on', S.grid);
    $('toggle-furniture').classList.toggle('on', S.showFurniture);
    $('view-2d').classList.toggle('on', !S.preview);
    $('view-3d').classList.toggle('on', !!S.preview);
    $('turn').disabled = !S.preview;
    const lv = level();
    const layout = lv ? [...lv.rooms, ...lv.walls] : [];
    $('lock-layout').classList.toggle('on', layout.length > 0 && layout.every((o) => o.locked));
    if (S.preview) $('hint').textContent = window.FloorplanView3D && window.FloorplanView3D.supported ? T.preview3d : T.preview;
  }

  function openPlan(plan) {
    S.plan = plan;
    S.creating = !plan;
    S.levelId = plan ? plan.levels[0].id : null;
    S.sel = null; S.undo = []; S.redo = [];
    renderPlanSelect(); renderLevels(); fit(); draw(); renderPanel(); updateButtons();
    setSaveState(plan ? T.saved : '');
  }

  function bind() {
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('dblclick', onDoubleClick);
    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    svg.addEventListener('wheel', (ev) => { ev.preventDefault(); if (!S.preview) zoomAt(toPlan(ev), Math.exp(ev.deltaY * 0.0015)); }, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', (ev) => { if (ev.key === ' ') S.spaceDown = false; });
    window.addEventListener('resize', () => draw());

    $('tools').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tool]');
      if (b) { S.sel = null; setTool(b.dataset.tool); }
    });
    $('zoom-in').addEventListener('click', () => zoomAt([S.cam[0] + S.cam[2] / 2, S.cam[1] + S.cam[3] / 2], 0.8));
    $('zoom-out').addEventListener('click', () => zoomAt([S.cam[0] + S.cam[2] / 2, S.cam[1] + S.cam[3] / 2], 1.25));
    $('zoom-fit').addEventListener('click', () => { fit(); draw(); });
    $('undo').addEventListener('click', () => restore(S.undo, S.redo));
    $('redo').addEventListener('click', () => restore(S.redo, S.undo));
    $('snap').addEventListener('click', () => { S.snap = !S.snap; updateButtons(); });
    $('toggle-grid').addEventListener('click', () => { S.grid = !S.grid; updateButtons(); draw(); });
    $('toggle-furniture').addEventListener('click', () => { S.showFurniture = !S.showFurniture; updateButtons(); draw(); });
    $('view-2d').addEventListener('click', () => { S.preview = null; updateButtons(); setTool(S.tool); });
    $('view-3d').addEventListener('click', () => { S.preview = 'iso'; S.wallDraft = null; S.pendingFurniture = null; S.pendingDevice = null; updateButtons(); draw(); renderPanel(); });
    $('lock-layout').addEventListener('click', () => {
      const lv = level();
      if (!lv) return;
      const layout = [...lv.rooms, ...lv.walls];
      const lock = !layout.every((o) => o.locked);
      commit(() => { for (const o of layout) { if (lock) o.locked = true; else delete o.locked; } });
    });
    $('turn').addEventListener('click', () => { S.turn = (S.turn + 1) % 4; if (S.v3d && S.preview) S.v3d.resetCamera(S.turn); draw(); });
    window.addEventListener('fp3d-ready', () => { if (S.preview) draw(); });
    $('plan-select').addEventListener('change', (ev) => openPlan(S.plans.find((p) => p.id === ev.target.value)));
    $('plan-new').addEventListener('click', () => { S.creating = true; renderPanel(); });
    $('level-add').addEventListener('click', () => {
      if (!S.plan) return;
      commit(() => {
        const lv = core.newLevel(`${T.levelName} ${S.plan.levels.length + 1}`);
        // A new level starts with the outer outline of the level below, as free walls.
        const below = level();
        const walls = core.levelWalls(below).filter((w) => w.rooms.length === 1 && !w.free);
        lv.walls = walls.map((w) => ({ id: core.uid('wall'), a: [...w.a], b: [...w.b] }));
        S.plan.levels.push(lv);
        S.levelId = lv.id;
      });
      renderLevels();
    });
    $('level-tabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-level]');
      if (!b) return;
      S.levelId = b.dataset.level; S.sel = null;
      renderLevels(); fit(); draw(); renderPanel();
    });
    // Drag a catalogue tile or a device from the list onto the plan.
    const panelEl = $('panel');
    panelEl.addEventListener('dragstart', (ev) => {
      const tile = ev.target.closest('[data-action="pick-furniture"], [data-action="pick-device"]');
      if (!tile) return;
      S.pendingFurniture = tile.dataset.type || null;
      S.pendingDevice = tile.dataset.device || null;
      ev.dataTransfer.effectAllowed = 'copy';
      ev.dataTransfer.setData('text/plain', tile.dataset.type || tile.dataset.device);
    });
    const wrap = svg.parentNode;
    wrap.addEventListener('dragover', (ev) => {
      if (!S.pendingFurniture && !S.pendingDevice) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      S.hover = toPlan(ev);
      draw();
    });
    wrap.addEventListener('drop', (ev) => {
      if (!S.pendingFurniture && !S.pendingDevice) return;
      ev.preventDefault();
      placePending(toPlan(ev), ev);
    });
    const panel = $('panel');
    panel.addEventListener('input', onPanelInput);
    panel.addEventListener('change', onPanelChange);
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('focusout', () => { S.typingSnap = null; });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());
  }

  function applyCaps(changes) {
    for (const [id, caps] of Object.entries(changes || {})) {
      const d = S.devices.get(id);
      if (d) Object.assign(d.caps, caps);
    }
    if (!S.drag) draw();
  }

  // Read-only hook for the browser interaction test (test/editor-interaction.js).
  window.__editorState = () => S;

  window.onHomeyReady = async function onHomeyReady(Homey) {
    S.Homey = Homey;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T[el.dataset.i18n] || el.textContent;
    bind();
    setTool('select');
    Homey.ready();
    try {
      const [data, plans] = await Promise.all([api('GET', '/data'), api('GET', '/plans')]);
      S.devices = new Map(data.devices.map((d) => [d.id, d]));
      S.zones = data.zones;
      S.plans = Array.isArray(plans) ? plans : [];
      S.calendars = await api('GET', '/calendars').catch(() => []);
      openPlan(S.plans[0] || null);
    } catch (err) {
      $('panel').innerHTML = `<p class="ed-note">${esc(err.message || err)}</p>`;
    }
    if (Homey.on) Homey.on('caps', applyCaps);
  };
}());
