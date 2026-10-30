/*
 * The house view: the whole house from outside with three.js, its storeys to tap into, and what it does with
 * energy: solar panels that glow with what they make, a home battery, a car at its charger, a heat pump and an
 * air conditioner, and calm lines that show where the power goes. The house is the same for everyone apart from
 * its settings (house-core.js); sizes are metres, the front faces +z.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as LOOK from './house-look.js';

const HC = window.HouseCore;
const core = window.FloorplanCore;

const THEMES = {
  light: {
    ground: '#cfdcbc', drive: '#d9d5cd', wall: '#f1ede6', wallSide: '#e6e0d6', band: '#cfc6b8', roof: '#5b5f66', roofEdge: '#474a50',
    glass: '#8fb4cf', lit: '#ffd58a', door: '#7a5a3c', neighbour: '#d9d6d0', post: '#8a8f96', carport: '#9aa0a8',
    panel: '#1d2b44', panelFrame: '#c9ced6', tree: '#8fb27a', trunk: '#8a6a4a', car: '#3a5f8f', unit: '#eceef0',
    hemiSky: '#ffffff', hemiGround: '#b9b09f', hemi: 1.6, sun: 2.6, sky: null, night: false,
  },
  dark: {
    ground: '#2a3326', drive: '#3a3936', wall: '#b9b4ab', wallSide: '#a9a399', band: '#8c857a', roof: '#3b3e44', roofEdge: '#2c2e33',
    glass: '#223040', lit: '#ffc766', door: '#4d3a28', neighbour: '#55524d', post: '#6f747b', carport: '#5f646b',
    panel: '#16223a', panelFrame: '#8d939c', tree: '#3d5236', trunk: '#4d3b2a', car: '#2f4f78', unit: '#b5b8bc',
    hemiSky: '#8092b8', hemiGround: '#272a32', hemi: 1.55, sun: 1.0, sunColor: '#b6c8ec', sky: null, night: true,
  },
};

// Colours of the lines by where the power comes from.
const FLOW = { solar: '#ffb800', grid: '#8aa0c0', battery: '#34c759', use: '#4fb3ff' };

const ICONS = {
  solar: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  grid: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2"/><path d="M7 10v4M11 10v4"/>',
  car: '<path d="M5 16h14M5 16l1.5-5a2 2 0 0 1 1.9-1.4h7.2a2 2 0 0 1 1.9 1.4L19 16v3h-2v-1H7v1H5z"/><circle cx="8" cy="15" r="0.5"/><circle cx="16" cy="15" r="0.5"/>',
  heatpump: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="10" cy="12" r="4"/><path d="M17 9v6"/>',
  airco: '<rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18c1-1 1-2 0-3M12 19c1-1 1-3 0-4M17 18c1-1 1-2 0-3"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/>',
  gas: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3 0-6 1-9z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
};
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;

/* -------------------------------------------------------------- helpers */

const mats = new Map();
function mat(color, opts) {
  const key = color + JSON.stringify(opts || {});
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.0 }, opts || {}));
    m.userData.shared = true;
    mats.set(key, m);
  }
  return mats.get(key);
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x || 0, (y || 0) + h / 2, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// A mesh from a list of quads/triangles (each an array of [x, y, z] points, counter-clockwise from outside).
function polyMesh(faces, material) {
  const pos = [];
  for (const f of faces) {
    for (let i = 1; i + 1 < f.length; i++) pos.push(...f[0], ...f[i], ...f[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// The moving dashes of a flow line: a soft bright stripe on a clear background, repeated along the tube.
let dashTexture = null;
// A path through the points in straight lines with small round bends.
function cablePath(input) {
  const points = input.filter((p, i) => i === 0 || p.distanceTo(input[i - 1]) > 0.02);
  const path = new THREE.CurvePath();
  let from = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const r = Math.min(0.12, p.distanceTo(points[i - 1]) / 2, p.distanceTo(points[i + 1]) / 2);
    const a = p.clone().add(points[i - 1].clone().sub(p).setLength(r));
    const b = p.clone().add(points[i + 1].clone().sub(p).setLength(r));
    if (from.distanceTo(a) > 0.001) path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p, b));
    from = b;
  }
  path.add(new THREE.LineCurve3(from, points[points.length - 1]));
  return path;
}

const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function dashes() {
  if (dashTexture) return dashTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.85, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 4);
  dashTexture = new THREE.CanvasTexture(c);
  dashTexture.wrapS = THREE.RepeatWrapping;
  return dashTexture;
}

function fmtW(w, lang) {
  if (typeof w !== 'number') return '–';
  const a = Math.abs(w);
  if (a >= 1000) return `${(a / 1000).toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} kW`;
  return `${Math.round(a)} W`;
}

/* ------------------------------------------------------------------ view */

// Rooms per level: windows belong to the room behind them.
const levelRooms = (plan) => (plan.levels || []).map((l) => (l.rooms || []).map((r) => [r.id, r.points]));

class House3D {

  constructor(container, hooks) {
    this.el = container;
    this.hooks = hooks || {};
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.sharp = new LOOK.Sharpness(this.renderer, () => this.resize());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.domElement.className = 'fp3-canvas';
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'fp3-labels';
    container.appendChild(this.labels.domElement);
    this.callouts = document.createElement('div');
    this.callouts.className = 'h3-callouts';
    this.callouts.innerHTML = '<svg class="h3-lines"></svg>';
    container.appendChild(this.callouts);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(25);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    this.controls.addEventListener('start', () => { this.touched = Date.now(); });

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 5;
    this.sun.shadow.blurSamples = 14;
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.far = 120;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.key = null;
    this.flows = [];
    this.fans = [];
    this.cards = {};
    this.floorMeshes = [];
    this.touched = Date.now();
    this.last = 0;
    this.running = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setupPicking();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.start(); });
  }

  resize() {
    const w = this.el.clientWidth || 1; const h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fit) this.resetCamera();
    this.start();
  }

  /* ------------------------------------------------------- animation */

  // Runs while the page is visible: about 30 frames a second, 10 after two minutes without a touch,
  // and nothing moves when there is no fresh reading.
  start() {
    if (this.running) return;
    this.running = true;
    const step = (t) => {
      if (document.hidden || !this.el.isConnected || this.el.offsetParent === null) { this.running = false; return; }
      const idle = Date.now() - this.touched > 120000;
      const gap = idle ? 100 : 33;
      if (t - this.last >= gap) {
        const dt = Math.min(0.2, (t - (this.last || t)) / 1000);
        this.last = t;
        this.animate(dt, t / 1000);
        this.controls.update();
        if (!idle) this.sharp.frame(t);
        this.renderer.render(this.scene, this.camera);
        this.labels.render(this.scene, this.camera);
        this.frames = (this.frames || 0) + 1;
        this.layoutCallouts();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // A lamp or window goes to its new brightness in a moment; the first time after a build at once.
  fadeTo(obj, prop, value) {
    if (!this.fadesReady || REDUCED) { this.fades.delete(obj); obj[prop] = value; return; }
    const f = this.fades.get(obj);
    if (f ? f.to === value : obj[prop] === value) return;
    this.fades.set(obj, { prop, from: obj[prop], to: value, at: 0 });
  }

  stepFades(dt) {
    for (const [obj, f] of this.fades || []) {
      f.at = Math.min(1, f.at + dt / 0.45);
      obj[f.prop] = f.from + (f.to - f.from) * f.at * (2 - f.at);
      if (f.at === 1) this.fades.delete(obj);
    }
  }

  animate(dt, time) {
    this.stepFades(dt);
    if (this.flying) this.stepFly(dt);
    if (this.falling) this.stepFalling(dt);
    const fresh = this.fresh !== false;
    for (const f of this.flows) {
      f.mesh.visible = fresh && f.speed !== 0;
      if (f.mesh.visible) f.tex.offset.x -= f.speed * dt * 0.35;
    }
    for (const fan of this.fans) if (fresh && fan.on) fan.mesh.rotation.z += dt * 9;
    for (const glow of this.glows || []) {
      const r = fresh ? this.glowLevel || 0 : 0;
      glow.visible = r > 0.02;
      // subtle in daylight, where it would look like stains on the roof
      glow.material.opacity = r * (0.22 + 0.06 * Math.sin(time * 1.6)) * (this.theme.night ? 1 : 0.3);
    }
  }

  /* --------------------------------------------------------- picking */

  setupPicking() {
    const ray = new THREE.Raycaster();
    let down = null;
    const canvas = this.renderer.domElement;
    const hit = (ev) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camera);
      for (const h of ray.intersectObjects(this.root.children, true)) {
        let o = h.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) return o.userData.pick;
      }
      return null;
    };
    canvas.addEventListener('pointerdown', (ev) => { this.touched = Date.now(); down = { x: ev.clientX, y: ev.clientY, t: Date.now() }; });
    canvas.addEventListener('pointerup', (ev) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 12 || Date.now() - down.t > 800) { down = null; return; }
      down = null;
      const p = hit(ev);
      if (p && this.hooks.tap) this.hooks.tap(p.kind, p.id);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      const p = hit(ev);
      const id = p && p.kind === 'level' ? p.id : null;
      canvas.style.cursor = p ? 'pointer' : '';
      if (id !== this.hoverLevel) { this.hoverLevel = id; this.paintFloors(); }
    });
    const tapped = (ev) => {
      const c = ev.target.closest('[data-house]');
      if (c && this.hooks.tap) { this.touched = Date.now(); this.hooks.tap(c.dataset.house, c.dataset.id || null); }
    };
    this.labels.domElement.addEventListener('click', tapped);
    this.callouts.addEventListener('click', tapped);
  }

  paintFloors() {
    for (const f of this.floorMeshes) {
      const on = f.levelId === this.hoverLevel;
      for (const m of f.walls) m.material = on ? this.wallHover : m.userData.base;
    }
  }

  /* ----------------------------------------------------------- build */

  // The scene follows the real day (energy.night, from where the Homey is); the theme of the page is the fallback.
  sync({ plan, energy, devices, dark: pageDark, lang, texts, weather }) {
    const dark = energy && typeof energy.night === 'boolean' ? energy.night : pageDark;
    this.plan = plan;
    this.lang = lang || 'en';
    this.T = texts || {};
    const set = HC.settings(plan);
    const shape = HC.shape(plan);
    const present = (energy && energy.present) || {};
    const shows = {};
    for (const k of HC.OBJECTS) shows[k] = HC.shows(set, k, present);
    shows.water = !!present.water; shows.gas = !!present.gas;
    const outdoor = HC.outdoorLamps(plan, devices instanceof Map ? devices : null);
    const key = JSON.stringify([plan.id, set, shape, shows, !!dark, this.lang, outdoor, levelRooms(plan)]);
    if (key !== this.key) {
      const first = !this.key;
      this.key = key;
      this.outdoor = outdoor;
      this.build(set, shape, shows, dark);
      if (first) this.resetCamera();
    }
    this.updateLive(plan, energy, devices);
    this.setSky(energy, weather);
    this.start();
  }

  clear() {
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (!o.material.userData.shared) o.material.dispose(); }
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    for (const c of Object.values(this.cards || {})) c.el.remove();
    this.flows = []; this.fans = []; this.cards = {}; this.floorMeshes = []; this.windows = []; this.tags = [];
    this.fades = new Map(); this.fadesReady = false;
    this.glows = []; this.panelMat = null; this.cable = null; this.soc = null;
  }

  build(set, shape, shows, dark) {
    this.skyKey = null;
    this.cableRows = 0;
    this.cableMat = null;
    this.clear();
    const t = dark ? THEMES.dark : THEMES.light;
    this.theme = t;
    this.M = this.makeMaterials(set, dark);
    // Reflections of a soft sky, made once per theme
    this.envs = this.envs || {};
    if (!this.envs[dark ? 'd' : 'l']) this.envs[dark ? 'd' : 'l'] = LOOK.environment(this.renderer, dark);
    this.scene.environment = this.envs[dark ? 'd' : 'l'];
    this.scene.environmentIntensity = dark ? 0.32 : 0.7;
    // The sky behind the house is the page's (view3d.css), so nothing is drawn for it
    this.el.classList.toggle('h3-day', !dark);
    this.el.classList.toggle('h3-night', !!dark);
    this.el.classList.toggle('h3-studio', set.scene === 'studio');
    this.renderer.toneMappingExposure = dark ? 1.15 : 1;
    this.set = set;
    this.shape = shape;
    this.shows = shows;
    this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGround); this.hemi.intensity = t.hemi;
    this.sun.intensity = t.sun;
    this.sun.color.set(t.sunColor || '#fff4e0');
    this.wallHover = this.M.wall.clone();
    this.wallHover.emissive = new THREE.Color('#2e5bff');
    this.wallHover.emissiveIntensity = 0.22;

    const W = shape.width; const D = shape.depth;
    // The carport goes on the free side of a semi-detached house.
    let carport = set.carport;
    if (set.type === 'semi' && carport === set.neighbour) carport = carport === 'left' ? 'right' : 'left';
    if (set.type === 'terraced') carport = 'none';
    // the free side of the house: the carport, or else the driveway, and the side the camera looks at
    const cs = carport === 'left' || (carport === 'none' && set.type === 'semi' && set.neighbour === 'right') ? -1 : 1;
    this.carportSide = cs < 0 ? 'left' : 'right';
    this.carportCenter = null;

    // Sunlight from the south, wherever the front of the house looks.
    const dir = (compass) => { const a = THREE.MathUtils.degToRad(compass - set.facing); return new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); };
    const south = dir(180);
    this.sun.position.copy(south.clone().multiplyScalar(26)).add(new THREE.Vector3(-8, 30, 0));
    this.sun.target.position.set(0, 0, 0);

    this.buildGround(t, W, D, carport, cs);
    if (set.scene === 'garden') this.buildGardenLights(t, W, D, carport, cs);
    else this.lights = this.outdoor.door.length ? { door: { door: true } } : {};
    const anchors = this.buildHouse(t, set, shape, W, D);
    this.buildNeighbours(t, set, shape, W, D);
    if (carport !== 'none') this.buildCarport(t, W, D, cs);

    // Where the power of the house comes in: the meter cupboard at the front corner, on the side away from the carport.
    const mx = -cs * (W / 2 - 0.9);
    const meter = new THREE.Vector3(mx, 0.9, D / 2 + 0.04);
    this.meterPoint = meter;
    const meterBox = box(0.42, 0.55, 0.06, mat('#d7dbe0'), mx, 0.62, D / 2 + 0.02);
    this.root.add(meterBox);

    if (shows.solar) this.buildSolar(t, set, shape, W, D, anchors, meter);
    if (shows.grid) this.buildGrid(t, W, D, meter, cs);
    if (shows.battery) this.buildBattery(t, set, W, D, cs, carport, meter);
    if (shows.car) this.buildCar(t, W, D, cs, carport, meter);
    if (shows.heatpump) this.buildHeatpump(t, W, D, cs, meter);
    if (shows.airco) this.buildAirco(t, W, D, cs, shape, meter);
    this.cards.home = this.card('home', null, new THREE.Vector3(0, anchors.top + 1.2, 0));
    if (shows.gas) this.cards.gas = this.card('gas', null, new THREE.Vector3(mx, 1.5, D / 2 + 0.04));
    if (shows.water) this.cards.water = this.card('water', null, new THREE.Vector3(mx, 1.3, D / 2 + 0.04));
    // Everything stands still: its soft shadows are drawn once, not with every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Materials of this house and theme, made once per build.
  makeMaterials(set, dark) {
    const tx = LOOK.textures(this.renderer, set.facade, set.roofColor, dark);
    const tint = dark ? '#8f8f8f' : '#ffffff';
    const frameColor = set.frames === 'white' ? '#f2f2ef' : '#3a3d42';
    const m = {
      tx,
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, bumpMap: tx.wallBump, bumpScale: 1.2, roughness: 0.92, color: tint }),
      plinth: new THREE.MeshStandardMaterial({ map: tx.plinth, roughness: 0.95, color: tint }),
      roof: new THREE.MeshStandardMaterial({ map: tx.roof, bumpMap: tx.roofBump, bumpScale: 2, roughness: 0.75, color: tint, side: THREE.DoubleSide }),
      grass: new THREE.MeshStandardMaterial({ map: tx.grass, roughness: 1, transparent: true, depthWrite: false }),
      pavers: new THREE.MeshStandardMaterial({ map: tx.pavers, roughness: 0.95, color: tint }),
      wood: new THREE.MeshStandardMaterial({ map: tx.wood, roughness: 0.8, color: dark ? '#9a8f84' : '#ffffff' }),
      frame: new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.45, metalness: 0.1 }),
      trim: new THREE.MeshStandardMaterial({ color: dark ? '#b9b9b6' : '#f4f3ef', roughness: 0.6 }),
      sill: new THREE.MeshStandardMaterial({ color: dark ? '#77777a' : '#c9c7c2', roughness: 0.7 }),
      reveal: new THREE.MeshStandardMaterial({ color: '#2b2a29', roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: '#b7bcc2', roughness: 0.35, metalness: 0.8 }),
      zinc: new THREE.MeshStandardMaterial({ color: dark ? '#7d8289' : '#aeb4bb', roughness: 0.4, metalness: 0.7 }),
      trunk: new THREE.MeshStandardMaterial({ color: dark ? '#3e3126' : '#6e5440', roughness: 1 }),
      leaves: new THREE.MeshStandardMaterial({ color: dark ? '#3c5236' : '#6f9452', roughness: 0.9 }),
      leaves2: new THREE.MeshStandardMaterial({ color: dark ? '#334830' : '#5c8445', roughness: 0.9 }),
      hedge: new THREE.MeshStandardMaterial({ color: dark ? '#2e4228' : '#4f7a3c', roughness: 1 }),
      neighbour: new THREE.MeshStandardMaterial({ color: dark ? '#4c4a46' : '#dcd8d1', roughness: 1, transparent: true, opacity: 0.6 }),
      unit: new THREE.MeshStandardMaterial({ color: dark ? '#a9adb1' : '#eceef0', roughness: 0.45, metalness: 0.1 }),
      grille: new THREE.MeshStandardMaterial({ map: tx.grille, roughness: 0.6, color: tint }),
    };
    // Glass reflects the sky; at night it glows where a lamp is on (one material per storey)
    m.glass = () => new THREE.MeshPhysicalMaterial({ color: dark ? '#101820' : '#2a3a4a', roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6, emissive: '#ffcf7a', emissiveIntensity: 0 });
    return m;
  }

  buildGround(t, W, D, carport, cs) {
    const M = this.M;
    if (this.set.scene === 'studio') {
      // Only a soft shadow: the house stands on the page, nothing around it
      const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.ShadowMaterial({ opacity: t.night ? 0.3 : 0.16 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      floor.userData.ground = true;
      this.root.add(floor);
      return;
    }
    // A lawn that fades into the page at its edge
    const fade = document.createElement('canvas');
    fade.width = 256; fade.height = 256;
    const fg = fade.getContext('2d');
    const grad = fg.createRadialGradient(128, 128, 40, 128, 128, 128);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, '#000');
    fg.fillStyle = grad; fg.fillRect(0, 0, 256, 256);
    const R = Math.max(W, D) * 4 + 30;
    const grass = M.grass.clone();
    grass.map = M.tx.grass.clone(); grass.map.needsUpdate = true; grass.map.repeat.set(R / 2, R / 2);
    grass.alphaMap = new THREE.CanvasTexture(fade);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 96), grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.root.add(ground);
    const paved = (x0, z0, x1, z1) => {
      const m = LOOK.poly([[x0, 0.015, z1], [x1, 0.015, z1], [x1, 0.015, z0], [x0, 0.015, z0]], M.pavers, [1, 1]);
      m.castShadow = false;
      this.root.add(m);
    };
    // A path to the front door, a strip of pavers around the house, the driveway to the carport
    paved(-0.8, D / 2, 0.8, D / 2 + 5);
    paved(-W / 2 - 0.6, D / 2, W / 2 + 0.6, D / 2 + 0.6);
    paved(-W / 2 - 0.6, -D / 2 - 0.6, -W / 2, D / 2);
    paved(W / 2, -D / 2 - 0.6, W / 2 + 0.6, D / 2);
    paved(-W / 2 - 0.6, -D / 2 - 3.2, W / 2 + 0.6, -D / 2); // terrace at the back
    if (this.set.type === 'terraced') {
      // no side to drive along: the car stands in front of the house
      if (this.shows.car) paved(cs > 0 ? W / 2 - 3.2 : -W / 2 + 0.2, D / 2 + 0.6, cs > 0 ? W / 2 - 0.2 : -W / 2 + 3.2, D / 2 + 6);
    } else if (carport !== 'none' || this.shows.car) {
      const a = W / 2 + 0.2; const b = W / 2 + 4.0;
      paved(cs > 0 ? a : -b, D / 2 - 6.6, cs > 0 ? b : -a, D / 2 + 5);
    }
    // Hedges along the plot and a few trees and shrubs
    // Beside a neighbour the plot ends at the party wall: a hedge between the back gardens only
    const back = -D / 2 - 7; const side = W / 2 + 6.5;
    const built = (s) => this.set.type === 'terraced' || (this.set.type === 'semi' && this.set.neighbour === (s < 0 ? 'left' : 'right'));
    const left = built(-1) ? -W / 2 : -side; const right = built(1) ? W / 2 : side;
    this.root.add(LOOK.hedge([left, back], [right, back], 1.3, M));
    this.root.add(LOOK.hedge([left, back], [left, built(-1) ? -D / 2 : D / 2 + 3], 1.2, M));
    if (built(1)) this.root.add(LOOK.hedge([right, back], [right, -D / 2], 1.2, M));
    else if (carport === 'none' || cs < 0) this.root.add(LOOK.hedge([right, back], [right, D / 2 + 3], 1.2, M));
    else this.root.add(LOOK.hedge([right, back], [right, D / 2 - 7], 1.2, M));
    for (const [x, z, s, seed] of [[-W / 2 - 4, -D / 2 - 4.5, 1.15, 1], [W / 2 + 4.5, -D / 2 - 5, 0.95, 2], [-W / 2 - 4.5, D / 2 + 1.5, 0.8, 3]]) {
      const tr = LOOK.tree(s, M, seed);
      tr.position.set(x, 0, z);
      this.root.add(tr);
    }
    for (const x of [-W / 2 + 0.9, -W / 2 + 2.2, W / 2 - 2.2, W / 2 - 0.9]) {
      if (Math.abs(x) < 1.3) continue;
      if (this.shows.heatpump && Math.sign(x) === -cs && Math.abs(x) < W / 2 - 1.2) continue; // the heat pump stands here
      const bush = new THREE.Mesh(LOOK.blob(0.42, x), M.leaves);
      bush.position.set(x, 0.32, D / 2 + 0.95); bush.scale.y = 0.75; bush.castShadow = true;
      this.root.add(bush);
    }
  }

  // Low lights along the path and the driveway and spots in the garden, for the outdoor lamps Homey has. They burn
  // when the real lamp is on (updateLive); a tap on one switches it.
  buildGardenLights(t, W, D, carport, cs) {
    const M = this.M;
    this.lights = {};
    const group = (place, pick) => {
      const g = { head: new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#ffd9a0', emissiveIntensity: 0 }), pool: LOOK.lightMaterial('#ffc27a', 0), shines: [], pick };
      this.lights[place] = g;
      return g;
    };
    const bollard = (g, x, z) => {
      const parts = new THREE.Group();
      parts.userData.pick = g.pick;
      parts.add(LOOK.box(0.07, 0.42, 0.07, M.frame, x, 0, z));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), g.head);
      top.position.set(x, 0.45, z);
      parts.add(top);
      this.root.add(parts);
      this.root.add(LOOK.lightPool(x, z, 2.6, 2.6, g.pool));
      const shine = LOOK.lightGlow(0.5, '#ffd9a0', 0);
      shine.position.set(x, 0.47, z);
      g.shines.push(shine);
      this.root.add(shine);
    };
    const zs = [D / 2 + 1.6, D / 2 + 3.3, D / 2 + 5];
    if (this.outdoor.path.length) {
      const g = group('path', { kind: 'lamp', id: 'path' });
      for (const z of zs) { bollard(g, -1.0, z); bollard(g, 1.0, z); }
    }
    if (this.outdoor.drive.length && (carport !== 'none' || this.shows.car)) {
      const g = group('drive', { kind: 'lamp', id: 'drive' });
      const x = cs * (W / 2 + 2.1);
      this.root.add(LOOK.lightPool(x, D / 2 - 3.4, 6, 8, g.pool));
      for (const z of zs) bollard(g, x + cs * 2.05, z);
    }
    if (this.outdoor.garden.length) {
      const g = group('garden', { kind: 'lamp', id: 'garden' });
      for (const [x, z] of [[-W / 2 - 3.4, -D / 2 - 4], [W / 2 + 3.6, -D / 2 - 4.4], [-W / 2 - 3.6, D / 2 + 1.2], [-W / 2 - 0.3, -D / 2 - 3.4], [W / 2 + 0.3, -D / 2 - 3.4]]) bollard(g, x, z);
    }
    if (this.outdoor.door.length) this.lights.door = { door: true, pick: { kind: 'lamp', id: 'door' } };
  }

  // The storeys: brick walls with a darker plinth, windows with frames and sills, the front door, the roof.
  buildHouse(t, set, shape, W, D) {
    const M = this.M;
    const g = new THREE.Group();
    this.root.add(g);
    const lamps = [];
    this.floorGroups = [];
    this.liftWith = [];
    const size = M.tx.wallSize;
    shape.floors.forEach((f, i) => {
      const fg = new THREE.Group();
      fg.userData.pick = { kind: 'level', id: f.levelId };
      const y0 = f.base; const y1 = f.base + f.height;
      const walls = [
        LOOK.poly([[-W / 2, y0, D / 2], [W / 2, y0, D / 2], [W / 2, y1, D / 2], [-W / 2, y1, D / 2]], M.wall, size),
        LOOK.poly([[W / 2, y0, -D / 2], [-W / 2, y0, -D / 2], [-W / 2, y1, -D / 2], [W / 2, y1, -D / 2]], M.wall, size),
        LOOK.poly([[W / 2, y0, D / 2], [W / 2, y0, -D / 2], [W / 2, y1, -D / 2], [W / 2, y1, D / 2]], M.wall, size),
        LOOK.poly([[-W / 2, y0, -D / 2], [-W / 2, y0, D / 2], [-W / 2, y1, D / 2], [-W / 2, y1, -D / 2]], M.wall, size),
      ];
      for (const w of walls) { w.userData.base = M.wall; fg.add(w); }
      if (i === 0) fg.add(LOOK.box(W + 0.04, 0.35, D + 0.04, M.plinth, 0, 0, 0));
      // floor slab line between storeys
      if (i > 0) fg.add(LOOK.box(W + 0.03, 0.06, D + 0.03, M.sill, 0, y0 - 0.03, 0));
      const level = (this.plan.levels || []).find((l) => l.id === f.levelId);
      // Each window belongs to the room behind it, and at night its light falls out: a glow on the wall, a pool below
      const windowOf = (x, z) => {
        const w = { levelId: f.levelId, room: HC.roomBehind(level, set, Math.min(0.97, Math.max(0.03, x / W + 0.5)), Math.min(0.94, Math.max(0.06, z / D + 0.5))), glass: M.glass(), haloMat: LOOK.lightMaterial('#ffb765', 0), poolMat: LOOK.lightMaterial('#ffb765', 0) };
        lamps.push(w);
        return w;
      };
      const winH = i === 0 ? 1.55 : 1.4;
      const winY = y0 + (i === 0 ? 0.75 : 0.9) + winH / 2;
      const add = (w, x, z, ry) => {
        const own = windowOf(x, z);
        const { glass, haloMat, poolMat } = own;
        const win = LOOK.windowPart(w, winH, { frame: M.frame, glass, sill: M.sill, reveal: M.reveal });
        win.group.position.set(x, winY, z);
        win.group.rotation.y = ry;
        fg.add(win.group);
        if (!t.night) return;
        const nx = Math.sin(ry); const nz = Math.cos(ry);
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.6, winH * 2.3), haloMat);
        halo.position.set(x + nx * 0.03, winY, z + nz * 0.03);
        halo.rotation.y = ry;
        halo.renderOrder = 2;
        halo.userData.light = true;
        fg.add(halo);
        if (i === 0) {
          const pool = LOOK.lightPool(x + nx * 1.5, z + nz * 1.5, 3.6 + (nz ? w : 0), 3.6 + (nx ? w : 0), poolMat);
          this.root.add(pool);
        }
      };
      const cols = Math.max(2, Math.round(W / 2.6));
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + (W / cols) * (c + 0.5);
        if (!(i === 0 && Math.abs(x) < 1.0)) add(1.25, x, D / 2 + 0.005, 0);
        add(1.25, x, -D / 2 - 0.005, Math.PI);
      }
      const sideCols = Math.max(1, Math.round(D / 3.4));
      for (let c = 0; c < sideCols; c++) {
        const z = -D / 2 + (D / sideCols) * (c + 0.5);
        add(0.9, -W / 2 - 0.005, z, -Math.PI / 2);
        add(0.9, W / 2 + 0.005, z, Math.PI / 2);
      }
      if (i === 0) {
        const door = LOOK.doorPart({ frame: M.frame, glass: windowOf(0, D / 2).glass, metal: M.metal }, set.door || '#2f4a3a');
        door.position.set(0, 0.02, D / 2 + 0.005);
        fg.add(door);
        // a lamp above the door, on at night
        const lampMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', emissive: '#ffd690', emissiveIntensity: 0 });
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.1), lampMat);
        lamp.position.set(0, 2.5, D / 2 + 0.06); // above the door: windows stand beside it
        lamp.userData.pick = { kind: 'lamp', id: 'door' };
        fg.add(lamp);
        this.doorLamp = { mat: lampMat };
        if (this.theme.night) {
          const light = new THREE.PointLight('#ffcf80', 5, 7, 2);
          light.position.set(0, 2.45, D / 2 + 0.4);
          light.visible = false;
          fg.add(light);
          const shine = LOOK.lightGlow(1.1, '#ffc477', 0.55);
          shine.position.set(0, 2.5, D / 2 + 0.14);
          shine.visible = false;
          fg.add(shine);
          this.doorLamp.light = light; this.doorLamp.shine = shine;
        }
      }
      // A name tag beside the storey, also to tap
      const tag = document.createElement('div');
      tag.className = 'h3-floor';
      tag.dataset.house = 'level';
      tag.dataset.id = f.levelId || '';
      tag.textContent = `${f.name || ''} ›`;
      const label = new CSS2DObject(tag);
      this.tags.push(tag);
      label.position.set(-W / 2 - 0.2, f.base + f.height / 2, D / 2);
      label.center.set(1, 0.5);
      fg.add(label);
      g.add(fg);
      this.floorMeshes.push({ levelId: f.levelId, walls });
      this.floorGroups.push({ levelId: f.levelId, group: fg });
    });
    this.windows = lamps;
    const eaves = shape.eaves;
    if (set.extension !== 'none') {
      const back = set.extension === 'back';
      const ew = back ? W * 0.6 : 3.2; const ed = back ? 3.2 : D * 0.7;
      const ex = back ? -W * 0.15 : (this.carportSide === 'left' ? 1 : -1) * (W / 2 + 1.6);
      const ez = back ? -D / 2 - 1.6 : -D * 0.1;
      const ext = new THREE.Group();
      ext.userData.pick = { kind: 'level', id: shape.floors[0].levelId };
      const x0 = ex - ew / 2; const x1 = ex + ew / 2; const z0 = ez - ed / 2; const z1 = ez + ed / 2;
      ext.add(LOOK.poly([[x0, 0, z1], [x1, 0, z1], [x1, 2.9, z1], [x0, 2.9, z1]], M.wall, size));
      ext.add(LOOK.poly([[x1, 0, z0], [x0, 0, z0], [x0, 2.9, z0], [x1, 2.9, z0]], M.wall, size));
      ext.add(LOOK.poly([[x1, 0, z1], [x1, 0, z0], [x1, 2.9, z0], [x1, 2.9, z1]], M.wall, size));
      ext.add(LOOK.poly([[x0, 0, z0], [x0, 0, z1], [x0, 2.9, z1], [x0, 2.9, z0]], M.wall, size));
      ext.add(LOOK.box(ew + 0.25, 0.25, ed + 0.25, M.trim, ex, 2.9, ez));
      // a wide glass door into the garden
      const glass = M.glass();
      const win = LOOK.windowPart(Math.min(2.4, ew * 0.6), 2.1, { frame: M.frame, glass, sill: M.sill, reveal: M.reveal }, { door: true });
      if (back) { win.group.position.set(ex, 1.1, z0 - 0.005); win.group.rotation.y = Math.PI; } else { win.group.position.set(x0 + (ex > 0 ? ew : 0), 1.1, ez); win.group.rotation.y = ex > 0 ? Math.PI / 2 : -Math.PI / 2; }
      ext.add(win.group);
      g.add(ext);
    }
    return this.buildRoof(t, set, shape, W, D, g, eaves);
  }

  // The roof in its own frame: length L along x, span S along z; turned when the ridge runs front to back.
  buildRoof(t, set, shape, W, D, parent, eaves) {
    const M = this.M;
    const turned = set.ridge === 'depth' && set.roof !== 'flat';
    const L = turned ? D : W; const S = turned ? W : D;
    const ov = 0.35;
    const rg = new THREE.Group();
    this.roofGroup = rg;
    rg.position.y = eaves;
    if (turned) rg.rotation.y = Math.PI / 2;
    parent.add(rg);
    const pitch = THREE.MathUtils.degToRad(set.pitch);
    const rise = (S / 2) * Math.tan(pitch);
    const x0 = -L / 2 - ov; const x1 = L / 2 + ov; const z0 = -S / 2 - ov; const z1 = S / 2 + ov;
    const drop = ov * Math.tan(pitch);
    const pick = { kind: 'level', id: shape.attic ? shape.attic.levelId : shape.floors[shape.floors.length - 1].levelId };
    const T = LOOK.TILE_SIZE;
    const lift = 0.12; // roof thickness above the walls
    let top = eaves;
    const add = (m) => { m.userData.pick = pick; rg.add(m); return m; };
    if (set.roof === 'flat') {
      // Parapet with an aluminium coping, a gravel roof inside
      const h = 0.45;
      add(LOOK.box(W + 0.1, h, 0.25, M.trim, 0, 0, D / 2 - 0.075));
      add(LOOK.box(W + 0.1, h, 0.25, M.trim, 0, 0, -D / 2 + 0.075));
      add(LOOK.box(0.25, h, D - 0.3, M.trim, W / 2 - 0.075, 0, 0));
      add(LOOK.box(0.25, h, D - 0.3, M.trim, -W / 2 + 0.075, 0, 0));
      add(LOOK.box(W - 0.4, 0.06, D - 0.4, new THREE.MeshStandardMaterial({ map: M.tx.pavers, color: '#8d8a85', roughness: 1 }), 0, 0, 0));
      this.roofFrame = { kind: 'flat', y: eaves + 0.1, L: W, S: D };
      top = eaves + h;
    } else {
      const r = set.roof === 'hip' ? Math.max(0, L / 2 - S / 2) : L / 2 + ov;
      const ridge0 = set.roof === 'hip' ? -r : x0; const ridge1 = set.roof === 'hip' ? r : x1;
      // Tiled slopes; the first edge of each runs along the eaves so the tiles lie in rows
      add(LOOK.poly([[x0, -drop + lift, z1], [x1, -drop + lift, z1], [ridge1, rise + lift, 0], [ridge0, rise + lift, 0]], M.roof, T));
      add(LOOK.poly([[x1, -drop + lift, z0], [x0, -drop + lift, z0], [ridge0, rise + lift, 0], [ridge1, rise + lift, 0]], M.roof, T));
      if (set.roof === 'hip') {
        add(LOOK.poly([[x1, -drop + lift, z1], [x1, -drop + lift, z0], [r, rise + lift, 0]], M.roof, T));
        add(LOOK.poly([[x0, -drop + lift, z0], [x0, -drop + lift, z1], [-r, rise + lift, 0]], M.roof, T));
        for (const [ax, az] of [[x1, z1], [x1, z0], [x0, z1], [x0, z0]]) rg.add(LOOK.bar([ax, -drop + lift + 0.04, az], [Math.sign(ax) * r, rise + lift + 0.05, 0], 0.06, M.roof));
      } else {
        // the gable ends in brick, with white verge boards along the slopes
        add(LOOK.poly([[-L / 2, 0, -S / 2], [-L / 2, 0, S / 2], [-L / 2, rise, 0]], M.wall, M.tx.wallSize));
        add(LOOK.poly([[L / 2, 0, S / 2], [L / 2, 0, -S / 2], [L / 2, rise, 0]], M.wall, M.tx.wallSize));
        for (const x of [x0, x1]) {
          rg.add(LOOK.bar([x, -drop + lift - 0.05, z1], [x, rise + lift - 0.05, 0], 0.05, M.trim, true));
          rg.add(LOOK.bar([x, -drop + lift - 0.05, z0], [x, rise + lift - 0.05, 0], 0.05, M.trim, true));
        }
      }
      // Ridge tiles, fascia boards and zinc gutters along the eaves
      if (ridge1 > ridge0) rg.add(LOOK.bar([ridge0, rise + lift + 0.05, 0], [ridge1, rise + lift + 0.05, 0], 0.09, M.roof));
      for (const z of [z1, z0]) {
        const s = Math.sign(z);
        rg.add(LOOK.box(x1 - x0, 0.22, 0.03, M.trim, 0, -drop + lift - 0.2, z + s * 0.01));
        rg.add(LOOK.bar([x0, -drop + lift - 0.12, z + s * 0.09], [x1, -drop + lift - 0.12, z + s * 0.09], 0.07, M.zinc));
      }
      // A chimney on the back slope
      const cz = set.objects.solar.layout === 'both' ? 0 : -S / 4; const cx = L / 4; // both halves full of panels: on the ridge
      const ch = LOOK.box(0.6, rise * 0.5 + 0.9, 0.6, M.wall, cx, rise * 0.5 + lift - 0.2, cz);
      add(ch);
      rg.add(LOOK.box(0.72, 0.08, 0.72, M.sill, cx, rise + lift + 0.7, cz));
      top = eaves + rise + lift;
    }
    // A dormer on the back slope of a gable roof along the front, set back a little from the eaves
    if (set.dormer && set.roof === 'gable' && !turned) {
      const tan = Math.tan(pitch);
      const dw = Math.min(3, L * 0.35);
      const zf = -S / 2 + 0.6;
      const yf = 0.6 * tan + lift;
      const dh = Math.min(1.5, (rise - yf) * 0.7);
      const zr = (yf + dh - rise - lift) / tan;
      if (zr > zf + 0.3) {
        const dx = -L / 4;
        const dormer = LOOK.box(dw, yf + dh, zr - zf, M.trim, dx, 0, (zf + zr) / 2);
        add(dormer);
        const glass = M.glass();
        const win = LOOK.windowPart(dw * 0.7, dh * 0.75, { frame: M.frame, glass, sill: M.sill, reveal: M.reveal });
        win.group.position.set(dx, yf + dh * 0.5, zf - 0.005); win.group.rotation.y = Math.PI;
        rg.add(win.group, LOOK.box(dw + 0.25, 0.14, zr - zf + 0.25, new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.6 }), dx, yf + dh, (zf + zr) / 2));
      }
    }
    this.roofGroup = rg;
    this.roofInfo = { L, S, rise, pitch, turned, ov, lift };
    return { top, rise };
  }

  buildNeighbours(t, set, shape, W, D) {
    const sides = set.type === 'semi' ? [set.neighbour] : set.type === 'terraced' ? ['left', 'right'] : [];
    const wall = this.M.wall.clone();
    wall.map = this.M.tx.wall.clone(); wall.map.needsUpdate = true;
    wall.map.repeat.set(W / this.M.tx.wallSize[0], shape.eaves / this.M.tx.wallSize[1]);
    wall.color.set(this.theme.night ? '#6a6a6a' : '#b8b8b8');
    const material = this.M.roof.clone();
    material.color.set(this.theme.night ? '#6a6a6a' : '#b8b8b8');
    const gable = this.M.wall.clone();
    gable.color.copy(wall.color);
    for (const side of sides) {
      const s = side === 'left' ? -1 : 1;
      const g = new THREE.Group();
      g.add(LOOK.box(W, shape.eaves, D, wall, 0, 0, 0));
      if (set.roof !== 'flat') {
        const turned = set.ridge === 'depth';
        const L = turned ? D : W; const S = turned ? W : D;
        const rise = (S / 2) * Math.tan(THREE.MathUtils.degToRad(set.pitch));
        // The same kind of roof as the house: with a hip roof the ridge is shorter
        const r = set.roof === 'hip' ? Math.max(0, L / 2 - S / 2) : L / 2;
        const roof = new THREE.Group();
        const faces = [
          [[[-L / 2, 0, S / 2], [L / 2, 0, S / 2], [r, rise, 0], [-r, rise, 0]], material],
          [[[L / 2, 0, -S / 2], [-L / 2, 0, -S / 2], [-r, rise, 0], [r, rise, 0]], material],
          // the ends: tiles on a hip roof, brick on a gable
          [[[-L / 2, 0, -S / 2], [-L / 2, 0, S / 2], [-r, rise, 0]], set.roof === 'hip' ? material : gable],
          [[[L / 2, 0, S / 2], [L / 2, 0, -S / 2], [r, rise, 0]], set.roof === 'hip' ? material : gable],
        ];
        for (const [pts, m] of faces) roof.add(LOOK.poly(pts, m, m === gable ? this.M.tx.wallSize : LOOK.TILE_SIZE));
        roof.position.y = shape.eaves;
        if (turned) roof.rotation.y = Math.PI / 2;
        g.add(roof);
      }
      g.position.x = s * W;
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.root.add(g);
    }
  }

  // A wooden carport with a flat roof against the side wall.
  buildCarport(t, W, D, cs) {
    const M = this.M;
    const g = new THREE.Group();
    const x = cs * (W / 2 + 2.0); const z = D / 2 - 3.4; const len = 6.2; const w = 3.6;
    const outer = x + cs * (w / 2 - 0.1);
    for (const dz of [-1, 0, 1]) g.add(LOOK.box(0.16, 2.45, 0.16, M.wood, outer, 0, z + dz * (len / 2 - 0.1)));
    // beams and a roof edge in wood, the roof itself dark
    g.add(LOOK.box(0.12, 0.28, len + 0.3, M.wood, outer, 2.35, z));
    g.add(LOOK.box(0.12, 0.28, len + 0.3, M.wood, cs * (W / 2 + 0.06), 2.35, z));
    for (let i = 0; i <= 5; i++) g.add(LOOK.box(w, 0.16, 0.08, M.wood, x, 2.45, z - len / 2 + (len / 5) * i));
    g.add(LOOK.box(w + 0.3, 0.1, len + 0.3, new THREE.MeshStandardMaterial({ color: this.theme.night ? '#2c2e31' : '#4a4d52', roughness: 0.7 }), x, 2.61, z));
    g.add(LOOK.box(w + 0.32, 0.18, 0.04, M.trim, x, 2.6, z + len / 2 + 0.16));
    this.root.add(g);
    this.carportCenter = new THREE.Vector3(x, 0, z);
    this.carportLen = len;
  }

  buildSolar(t, set, shape, W, D, anchors, meter) {
    const sides = HC.solarSides(set);
    const total = set.objects.solar.panels;
    const placed = sides.map((side, i) => {
      const share = i === 0 ? Math.ceil(total / sides.length) : Math.floor(total / sides.length);
      return total > 0 && !share ? null : this.panelsOn(side, share, t, shape);
    }).filter(Boolean);
    if (!placed.length) return;
    // The card and the cable go with the first face
    const { panels, middle } = placed[0];
    const anchor = new THREE.Vector3();
    panels.updateWorldMatrix(true, true);
    panels.localToWorld(anchor.set(0, 0.3, middle));
    this.cards.solar = this.card('solar', null, anchor.clone().add(new THREE.Vector3(0, 1.2, 0)));
    // The cable leaves the panels at their lowest edge, runs down the roof and along the gutter, down the corner of the
    // house and along the wall to the meter cupboard
    const onRoof = panels.localToWorld(new THREE.Vector3(0, 0.09, -0.42));
    const atGutter = panels.localToWorld(new THREE.Vector3(0, 0.09, 0.02));
    const wall = this.onWall(atGutter);
    const front = Math.abs(wall.z) >= D / 2;
    const corner = new THREE.Vector3(front ? Math.sign(meter.x) * (W / 2 - 0.3) : wall.x, shape.eaves - 0.12, front ? wall.z : Math.sign(meter.z) * (D / 2 - 0.3));
    this.addFlow('solar', [onRoof, atGutter, new THREE.Vector3(corner.x, atGutter.y, front ? atGutter.z : corner.z), corner, ...this.cableRoute(corner, meter)]);
  }

  // Panels on one face of the roof: as many as asked and as fit (0: as many as fit nicely).
  panelsOn(side, wanted, t, shape) {
    const info = this.roofInfo;
    const group = new THREE.Group();
    const panelW = 1.05; const panelH = 1.72; const gap = 0.04;
    if (!this.panelMat) this.panelMat = new THREE.MeshPhysicalMaterial({ map: this.M.tx.panel, roughness: 0.18, metalness: 0.3, envMapIntensity: 1.3, clearcoat: 0.6 });
    const panelMat = this.panelMat;
    const frame = mat(t.panelFrame);
    let cols; let rows; let along; let up;
    let target = wanted;
    // On a flat roof with both directions: rows that lean in turn to the east and the west
    const tent = side === 'top' && this.set.objects.solar.layout === 'both';
    if (side === 'top') {
      const across = tent ? Math.min(shape.width, shape.depth) : shape.width;
      const deep = tent ? across : shape.depth;
      along = Math.max(1, Math.floor((across - 1) / (panelW + gap)));
      up = Math.max(1, Math.floor((deep - 1.5) / (panelH * Math.cos(0.26) + (tent ? 0.1 : 0.6))));
    } else {
      const slope = info.S / 2 / Math.cos(info.pitch);
      const hipCut = this.set.roof === 'hip' ? 1 : 0;
      const sideways = (side === 'left' || side === 'right') !== info.turned;
      const length = sideways ? info.S : info.L;
      along = Math.max(1, Math.floor((length - 1 - hipCut * slope) / (panelW + gap)));
      up = Math.max(1, Math.floor((slope - 0.8) / (panelH + gap)));
      if (sideways && this.set.roof === 'hip') { along = Math.max(1, Math.floor(along * 0.5)); up = Math.min(up, 2); }
    }
    up = Math.min(up, 3);
    if (target > 0) { cols = Math.min(along, Math.ceil(target / up)); rows = Math.min(up, Math.ceil(target / cols)); } else { cols = along; rows = Math.min(up, 2); target = cols * rows; }
    const panels = new THREE.Group();
    this.liftWith.push(panels);
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && n < target; c++, n++) {
        const x = (c - (cols - 1) / 2) * (panelW + gap);
        const s = 0.5 + r * (panelH + gap) + panelH / 2 - (tent ? 0.5 + (rows * (panelH + gap)) / 2 : 0);
        const p = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.04, panelH), panelMat);
        p.position.set(x, 0.06, -s);
        p.castShadow = true;
        const edge = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.02, 0.03, panelH + 0.02), frame);
        edge.position.set(x, 0.04, -s);
        if (tent) { p.rotation.x = r % 2 ? 0.17 : -0.17; edge.rotation.x = p.rotation.x; }
        panels.add(edge, p);
      }
    }
    // The glow underneath: stronger the more the panels make
    // a soft spill of warm light around the panels, fading out (not a hard frame)
    const gw = cols * (panelW + gap) + 1.6; const gh = rows * (panelH + gap) + 1.6;
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g2 = c.getContext('2d');
      const gr = g2.createRadialGradient(64, 64, 10, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshBasicMaterial({ color: '#ffc23d', alphaMap: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    const middle = tent ? 0 : -(0.5 + (rows * (panelH + gap)) / 2);
    glow.position.set(0, 0.03, middle);
    panels.add(glow);
    this.glows.push(glow);
    panels.userData.pick = { kind: 'solar' };

    if (side === 'top') {
      if (tent) {
        // the rows lean to the east and the west, whichever way the house faces
        panels.rotation.y = Math.abs(Math.sin(THREE.MathUtils.degToRad(this.set.facing))) > 0.7 ? 0 : Math.PI / 2;
        panels.position.set(0, 0.35, 0);
      } else {
        panels.rotation.x = 0.26;
        panels.position.set(0, 0.35, (rows * (panelH + gap)) / 2);
      }
      group.add(panels);
      group.position.y = this.roofFrame.y;
      this.root.add(group);
    } else {
      // Slope frame: origin on the eave edge, local -z up the slope, local y out of the roof
      const sides = info.turned ? { left: 0, right: Math.PI, front: -Math.PI / 2, back: Math.PI / 2 } : { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
      const holder = new THREE.Group();
      holder.rotation.y = sides[side];
      const slope = new THREE.Group();
      const sideways = (side === 'left' || side === 'right') !== info.turned;
      slope.position.set(0, info.lift || 0, (sideways ? info.L : info.S) / 2);
      if (sideways && this.set.roof === 'gable') return null; // a gable end has no roof to carry panels
      slope.rotation.x = info.pitch;
      slope.add(panels);
      holder.add(slope);
      this.roofGroup.add(holder);
    }
    return { panels, middle };
  }

  buildGrid(t, W, D, meter, cs) {
    const x = -cs * (W / 2 + 3);
    const cabinet = box(0.7, 1.15, 0.4, mat('#5f7d5a'), x, 0, D / 2 + 4.2);
    cabinet.userData.pick = { kind: 'grid' };
    this.root.add(cabinet);
    this.cards.grid = this.card('grid', null, new THREE.Vector3(x, 2.0, D / 2 + 4.2));
    // from the cabinet over the ground to the wall, and up to the meter cupboard
    const p = (px, pz) => new THREE.Vector3(px, 0.05, pz);
    this.addFlow('grid', [new THREE.Vector3(x, 0.5, D / 2 + 3.98), p(x, D / 2 + 3.9), p(x, D / 2 + 0.06), p(meter.x, D / 2 + 0.06), new THREE.Vector3(meter.x, meter.y - 0.25, D / 2 + 0.06), meter]);
  }

  buildBattery(t, set, W, D, cs, carport, meter) {
    const underCarport = set.objects.battery.place === 'carport' && carport !== 'none';
    // in view: without a carport on the free side, which the camera looks at
    const side = underCarport || carport === 'none' ? cs : -cs;
    // In a row of houses the sides are party walls: on the back wall, at its corner
    const terraced = set.type === 'terraced';
    const x = terraced ? side * (W / 2 - 0.5) : side * (W / 2 + 0.22);
    // on a free piece of wall between two windows, also for its cable
    const sideCols = Math.max(1, Math.round(D / 3.4));
    const z = terraced ? -D / 2 - 0.22 : underCarport ? D / 2 - 5.6 : sideCols > 1 ? -D / 2 + D / sideCols : -D / 2 + 0.6;
    const g = new THREE.Group();
    const body = box(0.32, 1.1, 0.75, mat('#f4f5f7', { roughness: 0.5 }), 0, 0, 0);
    g.add(body);
    // Charge level as a light bar on the side that faces away from the wall
    const out = side;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.8), new THREE.MeshBasicMaterial({ color: '#34c759' }));
    bar.position.set(out * 0.162, 0.15, 0.2);
    bar.rotation.y = out * Math.PI / 2;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.84), new THREE.MeshBasicMaterial({ color: '#c9ccd1' }));
    track.position.set(out * 0.161, 0.55, 0.2);
    track.rotation.y = out * Math.PI / 2;
    g.add(track, bar);
    g.position.set(x, 0, z);
    if (terraced) g.rotation.y = side * Math.PI / 2;
    g.userData.pick = { kind: 'battery' };
    this.root.add(g);
    this.soc = { bar, base: 0.15 };
    this.cards.battery = this.card('battery', null, new THREE.Vector3(x + out * 0.4, 1.9, z));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    if (underCarport) {
      // under the roof of the carport along the wall, and only up at the front corner of the house
      const wallX = cs * (W / 2 + 0.05); const corner = p(wallX, 2.1, D / 2 + 0.05);
      this.addFlow('battery', [p(x, 1.05, z), p(wallX, 1.05, z), p(wallX, 2.1, z), corner, ...this.cableRoute(corner, meter)]);
    } else {
      this.addFlow('battery', this.cableRoute(p(x, 1.05, z), meter));
    }
  }

  buildCar(t, W, D, cs, carport, meter) {
    const terraced = this.set.type === 'terraced';
    const c = terraced ? new THREE.Vector3(cs * (W / 2 - 1.95), 0, D / 2 + 3.2)
      : this.carportCenter || new THREE.Vector3(cs * (W / 2 + 2.0), 0, D / 2 - 1.2); // forward on the drive: the battery stays in view
    // The wall between the last window and the front corner: the charger never hangs over a window
    const winEdge = D / 2 - D / Math.max(1, Math.round(D / 3.4)) / 2 + 0.45;
    const cz = (winEdge + D / 2) / 2;
    const g = LOOK.car(t.car);
    g.position.set(c.x + cs * 0.25, 0, c.z + 0.4);
    g.userData.pick = { kind: 'car' };
    this.root.add(g);
    // The charger on the house wall beside the car, and its cable to the car's charging port (front, house side)
    // In a row of houses that is the corner of the front wall
    const wallX = terraced ? cs * (W / 2 - 0.25) : cs * (W / 2 + 0.06);
    const wallZ = terraced ? D / 2 + 0.06 : cz;
    const charger = terraced ? box(0.28, 0.42, 0.1, mat('#30343a', { roughness: 0.4 }), wallX, 1.0, wallZ) : box(0.1, 0.42, 0.28, mat('#30343a', { roughness: 0.4 }), wallX, 1.0, wallZ);
    charger.userData.pick = { kind: 'car' };
    this.root.add(charger);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: '#34c759' }));
    led.position.set(terraced ? wallX : wallX + cs * 0.051, 1.32, terraced ? wallZ + 0.051 : wallZ);
    led.rotation.y = terraced ? 0 : cs * Math.PI / 2;
    this.root.add(led);
    this.chargerLed = led;
    const port = new THREE.Vector3(g.position.x - cs * 0.9, 0.75, g.position.z + 1.2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(wallX + (terraced ? 0 : cs * 0.06), 1.0, wallZ + (terraced ? 0.06 : 0)),
      new THREE.Vector3(wallX + (terraced ? 0 : cs * 0.25), 0.35, wallZ + (terraced ? 0.25 : -0.1)),
      new THREE.Vector3((wallX + port.x) / 2, 0.08, (wallZ + port.z) / 2),
      new THREE.Vector3(port.x - cs * 0.05, 0.5, port.z),
      port,
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6, false), mat('#151515', { roughness: 0.6 }));
    cable.castShadow = true;
    this.root.add(cable);
    this.cable = cable;
    this.cards.car = this.card('car', null, new THREE.Vector3(g.position.x, 2.0, g.position.z - 0.5));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    // along the ground in front of the house, its own way, and up the wall to the charger
    const start = meter.x + cs * 0.14; const front = D / 2 + 0.66; const side = cs * (W / 2 + 0.14);
    if (terraced) this.addFlow('use', [p(start, meter.y, D / 2 + 0.06), p(start, 0.04, D / 2 + 0.06), p(start, 0.04, front), p(wallX, 0.04, front), p(wallX, 0.8, wallZ + 0.06)], 'car');
    else this.addFlow('use', [p(start, meter.y, D / 2 + 0.06), p(start, 0.04, D / 2 + 0.06), p(start, 0.04, front), p(side, 0.04, front), p(side, 0.04, cz), p(wallX + cs * 0.06, 0.8, cz)], 'car');
  }

  // The heat pump stands against the side wall on the carport side, towards the back: in view from the front corner.
  buildHeatpump(t, W, D, cs, meter) {
    // At the front, by the meter cupboard: far from the battery and the charger, with a cable of its own
    const x = -cs * (W / 2 - 2.3); const z = D / 2 + 0.27;
    const g = new THREE.Group();
    g.add(box(1.05, 0.85, 0.42, mat(t.unit, { roughness: 0.5 }), 0, 0, 0));
    const fan = this.fan(0.28, -0.2, 0.43, 0.22);
    g.add(fan.ring, fan.mesh);
    g.position.set(x, 0, z); // the fan looks away from the wall
    g.userData.pick = { kind: 'heatpump' };
    this.root.add(g);
    this.fans.push(fan);
    this.heatFan = fan;
    this.cards.heatpump = this.card('heatpump', null, new THREE.Vector3(x, 1.3, z));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    // low along the wall, the short way
    const wz = D / 2 + 0.06;
    this.addFlow('use', [meter, p(meter.x, 0.55, wz), p(x, 0.55, wz), p(x, 0.6, z - 0.2)], 'heatpump');
  }

  // The outdoor unit of the air conditioner hangs on the front wall of the upper storey, above the meter cupboard.
  buildAirco(t, W, D, cs, shape, meter) {
    const top = shape.floors.length > 1 ? shape.floors[1] : shape.floors[0];
    const x = meter.x; const y = top.base + 0.25; const z = D / 2 + 0.2;
    const g = new THREE.Group();
    g.add(box(0.8, 0.6, 0.36, mat(t.unit, { roughness: 0.5 }), 0, 0, 0));
    const f2 = this.fan(0.2, -0.12, 0.3, 0.19);
    g.add(f2.ring, f2.mesh);
    g.add(box(0.9, 0.04, 0.4, mat(t.post), 0, -0.04, 0));
    g.position.set(x, y, z);
    g.userData.pick = { kind: 'airco' };
    this.root.add(g);
    this.fans.push(f2);
    this.aircoFan = f2;
    this.cards.airco = this.card('airco', null, new THREE.Vector3(x, y + 1.25, z + 0.2));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    this.addFlow('use', this.cableRoute(meter, p(x, y + 0.05, z)), 'airco');
  }

  // A fan behind a grille around (x, y, z), turning while the unit runs (faces +z in its group).
  fan(r, x, y, z) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r * 1.1, 24), mat('#9a9ea4', { side: THREE.DoubleSide }));
    ring.position.set(x, y, z);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.35, r * 0.9), mat('#55595f', { side: THREE.DoubleSide }));
      b.position.y = r * 0.45;
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI * 2) / 3;
      arm.add(b);
      blades.add(arm);
    }
    blades.position.set(x, y, z - 0.01);
    return { ring, mesh: blades, on: false };
  }

  // The nearest spot on the outside of the walls, seen from above.
  onWall(p) {
    const hx = this.shape.width / 2 + 0.05; const hz = this.shape.depth / 2 + 0.05;
    const x = THREE.MathUtils.clamp(p.x, -hx, hx); const z = THREE.MathUtils.clamp(p.z, -hz, hz);
    const toX = hx - Math.abs(x); const toZ = hz - Math.abs(z);
    return toX < toZ ? new THREE.Vector3(Math.sign(x || 1) * hx, p.y, z) : new THREE.Vector3(x, p.y, Math.sign(z || 1) * hz);
  }

  // A cable from a to b: up the wall to just under the first floor, above the windows and the door of the ground floor,
  // around the corners of the house the short way, and down again. Every cable gets a row of its own, like a tray.
  cableRoute(a, b) {
    const hx = this.shape.width / 2 + 0.05; const hz = this.shape.depth / 2 + 0.05;
    this.cableRows = (this.cableRows || 0) + 1;
    const y = Math.min(this.shape.floors[0].height, this.shape.eaves) - 0.5 + this.cableRows * 0.11;
    const from = this.onWall(a); const to = this.onWall(b);
    // the distance along the outside of the walls, starting at the front left corner
    const along = (p) => {
      if (p.z === hz) return p.x + hx;
      if (p.x === hx) return 2 * hx + (hz - p.z);
      if (p.z === -hz) return 2 * hx + 2 * hz + (hx - p.x);
      return 4 * hx + 2 * hz + (p.z + hz);
    };
    const corners = [[-hx, hz, 0], [hx, hz, 2 * hx], [hx, -hz, 2 * hx + 2 * hz], [-hx, -hz, 4 * hx + 2 * hz]];
    const whole = 4 * hx + 4 * hz;
    const s0 = along(from); const s1 = along(to);
    const ahead = (s1 - s0 + whole) % whole;
    const ways = ahead <= whole / 2 ? ahead : ahead - whole;
    const passed = corners.map(([x, z, s]) => ({ x, z, d: ways >= 0 ? (s - s0 + whole) % whole : (s0 - s + whole) % whole }))
      .filter((c) => c.d > 0.001 && c.d < Math.abs(ways)).sort((p, q) => p.d - q.d);
    const at = (p) => new THREE.Vector3(p.x, y, p.z);
    return [a, at(from), ...passed.map(at), at(to), b];
  }

  // A real cable on the wall: a thin dark line with clips, always there, and over it the current as moving light towards
  // the end (speed > 0) or the start (speed < 0). Straight, with small round bends.
  addFlow(kind, points, target) {
    const path = cablePath(points);
    const length = path.getLength();
    const segments = Math.max(30, Math.round(length * 10));
    if (!this.cableMat) this.cableMat = new THREE.MeshStandardMaterial({ color: this.theme.night ? '#4a4e56' : '#5b5f66', roughness: 0.6 });
    const cable = new THREE.Mesh(new THREE.TubeGeometry(path, segments, 0.022, 8, false), this.cableMat);
    cable.userData.flow = true;
    this.root.add(cable);
    const tex = dashes().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, length / 3.5), 1);
    const material = new THREE.MeshBasicMaterial({ color: FLOW[kind] || FLOW.use, map: tex, transparent: true, depthWrite: false, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, 0.036, 8, false), material);
    mesh.renderOrder = 2;
    mesh.userData.flow = true;
    this.root.add(mesh);
    this.flows.push({ kind, target: target || kind, mesh, tex, speed: 0 });
  }

  card(kind, id, pos) {
    const el = document.createElement('div');
    el.className = `h3-card h3-${kind}`;
    el.dataset.house = kind;
    if (id) el.dataset.id = id;
    el.innerHTML = '<em></em><b></b>';
    this.callouts.appendChild(el);
    this.calloutKey = null;
    // the line ends at the part itself, a little under where a card would float
    return { el, kind, point: pos.clone().setY(Math.max(0.3, pos.y - 0.9)) };
  }

  // The labels in a row above and a row below the house, as close above their part as they fit, each with a thin line to it.
  // Only when the camera or the size changed.
  layoutCallouts() {
    const w = this.el.clientWidth; const h = this.el.clientHeight;
    const list = Object.values(this.cards || {});
    const m = this.camera.matrixWorld.elements;
    const key = `${w}|${h}|${list.length}|${m[0].toFixed(3)}|${m[8].toFixed(3)}|${m[12].toFixed(2)}|${m[13].toFixed(2)}|${m[14].toFixed(2)}|${list.map((c) => c.el.textContent.length).join()}`;
    if (key === this.calloutKey || !w) return;
    this.calloutKey = key;
    const v = new THREE.Vector3();
    const items = list.map((c) => {
      v.copy(c.point).project(this.camera);
      return { c, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, w: c.el.offsetWidth, h: c.el.offsetHeight };
    });
    const place = (group, top) => {
      group.sort((a, b) => a.x - b.x);
      // the row above stays clear of the S, L and N buttons
      const left = top ? 124 : 12; const gap = 14; const right = w - 12;
      const perRow = Math.max(2, Math.floor((right - left) / 108));
      const rows = [];
      for (let i = 0; i < group.length; i += perRow) rows.push(group.slice(i, i + perRow));
      rows.forEach((row, r) => {
        let at = left;
        for (const it of row) { it.left = Math.max(at, it.x - it.w / 2); at = it.left + it.w + gap; }
        let end = right;
        for (const it of row.slice().reverse()) { it.left = Math.min(it.left, end - it.w); end = it.left - gap; }
        const y = top ? 12 + r * 50 : h - 12 - (rows.length - r) * 50;
        for (const it of row) {
          it.top = y;
          it.c.el.style.transform = `translate(${Math.round(it.left)}px,${Math.round(y)}px)`;
        }
      });
    };
    const above = items.filter((i) => ['home', 'solar', 'airco'].includes(i.c.kind));
    place(above, true);
    place(items.filter((i) => !above.includes(i)), false);
    const lines = this.callouts.firstElementChild;
    lines.setAttribute('viewBox', `0 0 ${w} ${h}`);
    lines.innerHTML = items.map((i) => {
      const fromX = Math.min(i.left + i.w - 4, Math.max(i.left + 4, i.x));
      const fromY = above.includes(i) ? i.top + i.h + 2 : i.top - 2;
      return `<line x1="${fromX.toFixed(1)}" y1="${fromY.toFixed(1)}" x2="${i.x.toFixed(1)}" y2="${i.y.toFixed(1)}"/><circle cx="${i.x.toFixed(1)}" cy="${i.y.toFixed(1)}" r="2.5"/>`;
    }).join('');
  }

  setCard(kind, title, value, extra) {
    const c = this.cards[kind];
    if (!c) return;
    c.el.querySelector('b').textContent = title;
    c.el.querySelector('em').textContent = value;
    c.el.classList.toggle('idle', !!(extra && extra.idle));
  }

  /* ------------------------------------------------------------ live */

  updateLive(plan, energy, devices) {
    const T = this.T; const lang = this.lang;
    const e = energy || {};
    // A reading older than ten minutes stops the movement
    this.fresh = !!(e.updated && Date.now() - Date.parse(e.updated) < 10 * 60000);
    const speed = (w) => (typeof w === 'number' && Math.abs(w) >= 20 ? Math.sign(w) * Math.min(2.2, 0.35 + Math.sqrt(Math.abs(w)) / 40) : 0);
    const batteryW = e.battery ? e.battery.watts : 0;
    const per = {
      solar: e.solarW,
      grid: e.gridW,
      // charging runs from the house to the battery: against the line, which starts at the battery
      battery: -batteryW,
      car: e.ev ? e.ev.watts : 0,
      heatpump: e.heating ? e.heating.watts : 0,
      airco: e.airco ? e.airco.reduce((s, a) => s + (a.on ? a.watts || 0 : 0), 0) : 0,
    };
    for (const f of this.flows) {
      f.speed = speed(per[f.target]);
      // Power going back to the grid is solar power: the grid line turns yellow
      if (f.target === 'grid') f.mesh.material.color.set(e.gridW < 0 ? FLOW.solar : FLOW.grid);
      if (f.target === 'battery') f.mesh.material.color.set(batteryW > 0 ? FLOW.solar : FLOW.battery);
    }
    // The panels glow with their power, against the most they make (or 4 kW)
    const peak = Math.max(4000, this.peakSolar || 0);
    if (typeof e.solarW === 'number') this.peakSolar = Math.max(this.peakSolar || 0, e.solarW);
    this.glowLevel = typeof e.solarW === 'number' ? Math.min(1, e.solarW / peak) : 0;

    this.setCard('solar', T.solar, fmtW(e.solarW, lang), { idle: !(e.solarW > 20) });
    if (typeof e.gridW === 'number') this.setCard('grid', e.gridW < 0 ? T.gridOut : T.gridIn, fmtW(e.gridW, lang));
    else this.setCard('grid', T.grid, '–');
    if (e.battery) {
      const soc = typeof e.battery.soc === 'number' ? `${Math.round(e.battery.soc)}%` : '';
      const state = Math.abs(batteryW) < 20 ? T.idle : batteryW > 0 ? T.charging : T.discharging;
      this.setCard('battery', `${T.battery} ${soc}`, `${state}${Math.abs(batteryW) >= 20 ? ` ${fmtW(batteryW, lang)}` : ''}`, { idle: Math.abs(batteryW) < 20 });
      if (this.soc) {
        const r = Math.max(0.02, Math.min(1, (e.battery.soc || 0) / 100));
        this.soc.bar.scale.y = r;
        this.soc.bar.position.y = 0.15 + 0.8 * r / 2;
        this.soc.bar.material.color.set(r < 0.2 ? '#ff9f0a' : '#34c759');
      }
    } else this.setCard('battery', T.battery, '–', { idle: true });
    const ev = e.ev;
    const plugged = !!(ev && (ev.charging || /plugged|aangesloten|laden/i.test(ev.state || '')));
    if (this.cable) this.cable.visible = plugged || !ev;
    if (this.chargerLed) this.chargerLed.material.color.set(ev && ev.charging ? '#34c759' : plugged ? '#ffcc00' : '#7a7f86');
    if (ev) {
      const soc = ev.car && typeof ev.car.soc === 'number' ? ` ${Math.round(ev.car.soc)}%` : '';
      this.setCard('car', `${T.car}${soc}`, ev.charging ? `${T.charging} ${fmtW(ev.watts, lang)}` : (ev.state || T.idle), { idle: !ev.charging });
    } else this.setCard('car', T.car, '–', { idle: true });
    if (e.heating) {
      const h = e.heating.devices[0] || {};
      if (this.heatFan) this.heatFan.on = (e.heating.watts || 0) > 30;
      this.setCard('heatpump', T.heatpump, (e.heating.watts || 0) > 30 ? fmtW(e.heating.watts, lang) : (typeof h.temperature === 'number' ? `${h.temperature.toLocaleString(lang)}°` : T.idle), { idle: !((e.heating.watts || 0) > 30) });
    } else this.setCard('heatpump', T.heatpump, '–', { idle: true });
    if (e.airco) {
      const a = e.airco[0];
      if (this.aircoFan) this.aircoFan.on = a.on === true;
      this.setCard('airco', T.airco, a.on ? (a.watts ? fmtW(a.watts, lang) : T.on) : (typeof a.temperature === 'number' ? `${a.temperature.toLocaleString(lang)}°` : T.off), { idle: !a.on });
    } else this.setCard('airco', T.airco, '–', { idle: true });
    this.setCard('home', T.home, fmtW(e.homeW, lang));
    // What was used today; the meter itself only while that is not known
    const gasToday = typeof e.gasToday === 'number';
    const gasShown = gasToday ? e.gasToday : e.gasM3;
    if (this.cards.gas) this.setCard('gas', gasToday ? T.gasToday || 'Gas today' : T.gas || 'Gas', typeof gasShown === 'number' ? `${gasShown.toLocaleString(lang, { maximumFractionDigits: gasToday ? 2 : 1 })} m³` : '–', { idle: !(gasToday && e.gasToday > 0) });
    if (this.cards.water) {
      const flow = e.water && e.water.perMinute;
      this.setCard('water', T.water || 'Water', typeof flow === 'number' ? `${flow.toLocaleString(lang)} L/min` : '–', { idle: !(flow > 0) });
    }

    // Windows light up on storeys where a lamp is on
    const byId = devices instanceof Map ? devices : new Map();
    for (const w of this.windows || []) {
      const level = (plan.levels || []).find((l) => l.id === w.levelId);
      const room = level && w.room ? level.rooms.find((r) => r.id === w.room) : null;
      const lit = !!level && (level.items || []).some((it) => it.kind === 'device' && core && core.isLampItem(it, byId.get(it.deviceId)) && core.isOn(byId.get(it.deviceId))
        && (!room || core.geom.pointInPolygon([it.x, it.y], room.points)));
      this.fadeTo(w.glass, 'emissiveIntensity', lit ? (this.theme.night ? 1.25 : 0.45) : 0);
      this.fadeTo(w.haloMat, 'opacity', lit ? 0.3 : 0);
      this.fadeTo(w.poolMat, 'opacity', lit ? 0.38 : 0);
    }
    // The outdoor lamps as they really are: at night with their pool of light
    const on = (ids) => ids.some((id) => { const d = byId.get(id); return !!d && !!core && core.isOn(d); });
    const night = this.theme.night;
    for (const place of Object.keys(this.lights || {})) {
      const g = this.lights[place];
      const burning = on(this.outdoor[place]);
      if (g.door) {
        this.fadeTo(this.doorLamp.mat, 'emissiveIntensity', burning ? (night ? 1.6 : 0.5) : 0);
        if (this.doorLamp.light) { this.doorLamp.light.visible = burning; this.doorLamp.shine.visible = burning; }
        continue;
      }
      this.fadeTo(g.head, 'emissiveIntensity', burning ? (night ? 2.2 : 0.6) : 0);
      this.fadeTo(g.pool, 'opacity', burning && night ? 0.34 : 0);
      for (const s of g.shines) this.fadeTo(s.material, 'opacity', burning && night ? 0.5 : 0);
    }
    this.fadesReady = true;
  }

  /* -------------------------------------------------------- sun, weather */

  // The sun where it really stands, its light by the weather, and rain or snow. Moonlight stays where it is.
  setSky(energy, weather) {
    const kind = HC.weatherKind(weather && weather.now && weather.now.iconId);
    const sun = energy && energy.sun;
    const t = this.theme;
    const key = `${kind}|${sun ? Math.round(sun.azimuth / 3) : ''}|${sun ? Math.round(sun.height / 3) : ''}|${t.night}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const dim = { clear: 1, partly: 0.72, cloudy: 0.32, rain: 0.22, snow: 0.3 }[kind];
    if (sun && !t.night) {
      const height = THREE.MathUtils.degToRad(Math.max(sun.height, 7));
      const a = THREE.MathUtils.degToRad(sun.azimuth - this.set.facing);
      const flat = Math.cos(height) * 44;
      this.sun.position.set(-Math.sin(a) * flat, Math.sin(height) * 44, Math.cos(a) * flat);
      // low in the sky the light is warm and weaker
      const low = THREE.MathUtils.clamp(1 - sun.height / 20, 0, 1);
      this.sun.color.set('#fff4e0').lerp(new THREE.Color('#ffb36b'), low);
      this.sun.intensity = t.sun * dim * (1 - low * 0.35);
      this.hemi.intensity = t.hemi * (1.25 - dim * 0.25);
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (t.night) this.sun.intensity = t.sun * (kind === 'clear' ? 1 : 0.7);
    for (const name of ['clear', 'partly', 'cloudy', 'rain', 'snow']) this.el.classList.toggle(`h3-${name}`, name === kind);
    this.setFalling(kind);
  }

  // Rain or snow, a few hundred thin lines or dots around the house.
  setFalling(kind) {
    if (this.fallingMesh) { this.scene.remove(this.fallingMesh); this.fallingMesh.geometry.dispose(); this.fallingMesh = null; this.falling = null; }
    if (kind !== 'rain' && kind !== 'snow') return;
    const rain = kind === 'rain';
    const count = rain ? 500 : 350;
    const pos = new Float32Array(count * (rain ? 6 : 3));
    const span = 40;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * span; const y = Math.random() * 26; const z = (Math.random() - 0.5) * span;
      if (rain) pos.set([x, y, z, x + 0.03, y + 0.55, z], i * 6); else pos.set([x, y, z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = this.theme.night ? '#8fa3c4' : '#ffffff';
    this.fallingMesh = rain
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    this.fallingMesh.frustumCulled = false;
    this.scene.add(this.fallingMesh);
    this.falling = { rain, height: 26, speed: rain ? 16 : 1.5 };
  }

  stepFalling(dt) {
    const { speed, height, rain } = this.falling;
    const pos = this.fallingMesh.geometry.attributes.position;
    const step = rain ? 2 : 1;
    for (let i = 0; i < pos.count; i += step) {
      let y = pos.getY(i) - speed * dt;
      if (y < 0) y += height;
      pos.setY(i, y);
      if (rain) pos.setY(i + 1, y + 0.55);
    }
    pos.needsUpdate = true;
  }

  /* ------------------------------------------------------- into a storey */

  // Tapping a storey: the roof and what is above it lift off and the camera goes down to it, then done() opens the level.
  fly(levelId, done) {
    const index = this.shape ? this.shape.floors.findIndex((f) => f.levelId === levelId) : -1;
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.flying) return;
    if (index < 0 || calm) { done(); return; }
    const floor = this.shape.floors[index];
    const lift = this.floorGroups.slice(index + 1).map((f) => f.group).concat(this.roofGroup ? [this.roofGroup] : [], this.liftWith || []);
    const from = this.camera.position.clone();
    this.flying = {
      t: 0, done, lift, heights: lift.map((g) => g.position.y), from, target0: this.controls.target.clone(),
      to: new THREE.Vector3(from.x * 0.42, floor.base + Math.max(this.shape.width, this.shape.depth) * 1.5, from.z * 0.42),
      target1: new THREE.Vector3(0, floor.base + floor.height / 2, 0),
    };
    this.controls.enabled = false;
    this.el.classList.add('h3-flying');
    this.touched = Date.now();
    // also when no frames come (the page went to the background)
    this.flyGuard = setTimeout(() => this.endFly(), 2500);
  }

  stepFly(dt) {
    const f = this.flying;
    f.t = Math.min(1, f.t + dt / 0.9);
    const e = f.t * f.t * (3 - 2 * f.t);
    f.lift.forEach((g, i) => { g.position.y = f.heights[i] + e * e * 22; });
    this.camera.position.lerpVectors(f.from, f.to, e);
    this.controls.target.lerpVectors(f.target0, f.target1, e);
    if (f.t >= 1) this.endFly();
  }

  endFly() {
    const f = this.flying;
    if (!f) return;
    clearTimeout(this.flyGuard);
    this.flying = null;
    f.done();
    // back in place for the next visit
    f.lift.forEach((g, i) => { g.position.y = f.heights[i]; });
    this.controls.enabled = true;
    this.el.classList.remove('h3-flying');
    this.resetCamera();
  }

  /* ---------------------------------------------------------- camera */

  // From the front corner on the carport side, a little above, with the house and everything around it in view.
  resetCamera() {
    if (!this.shape) { this.fit = true; return; }
    this.fit = true;
    const bounds = new THREE.Box3();
    for (const o of this.root.children) if (!o.userData.ground && !o.isCSS2DObject && !o.userData.flow) bounds.expandByObject(o);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    // Room above the roof for the cards
    const r = Math.hypot(size.x, size.z, size.y + 2) * 0.5;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect || 1;
    // A phone shows the house itself; the garden may fall off the edge
    const closer = this.set.scene === 'studio' ? (this.el.clientWidth < 560 ? 0.8 : 0.78) : (this.el.clientWidth < 560 ? 0.72 : 0.64);
    const dist = (r / Math.sin(fov / 2)) * (aspect < 1.3 ? 1.3 / aspect : 1) * closer;
    this.controls.target.set(center.x, size.y * 0.42, center.z);
    const az = THREE.MathUtils.degToRad(this.carportSide === 'left' ? -32 : 32); const el = THREE.MathUtils.degToRad(27);
    this.camera.position.set(center.x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), center.z + dist * Math.cos(el) * Math.cos(az));
    this.controls.minDistance = dist * 0.45;
    this.controls.maxDistance = dist * 1.6;
    this.controls.update();
  }

  dispose() {
    this.clear();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.el.innerHTML = '';
  }

}

window.FloorplanHouse3D = {
  supported: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })(),
  create: (el, hooks) => new House3D(el, hooks),
};
window.dispatchEvent(new Event('fp3d-ready'));
