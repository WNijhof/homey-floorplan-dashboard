/*
 * The house view: the whole house from outside with three.js, its storeys to tap into, and what it does with
 * energy: solar panels that glow with what they make, a home battery, a car at its charger, a heat pump and an
 * air conditioner, and calm lines that show where the power goes. The house is the same for everyone apart from
 * its settings (house-core.js); sizes are metres, the front faces +z.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
    hemiSky: '#9fb2d0', hemiGround: '#2a2724', hemi: 1.05, sun: 0.55, sky: null, night: true,
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

class House3D {

  constructor(container, hooks) {
    this.el = container;
    this.hooks = hooks || {};
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'fp3-canvas';
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'fp3-labels';
    container.appendChild(this.labels.domElement);

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
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
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
        this.renderer.render(this.scene, this.camera);
        this.labels.render(this.scene, this.camera);
        this.frames = (this.frames || 0) + 1;
        if (this.frames % 6 === 1) this.declutter();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  animate(dt, time) {
    const fresh = this.fresh !== false;
    for (const f of this.flows) {
      f.mesh.visible = fresh && f.speed !== 0;
      if (f.mesh.visible) f.tex.offset.x -= f.speed * dt;
    }
    for (const fan of this.fans) if (fresh && fan.on) fan.mesh.rotation.z += dt * 9;
    if (this.glow) {
      const r = fresh ? this.glowLevel || 0 : 0;
      this.glow.visible = r > 0.02;
      this.glow.material.opacity = r * (0.3 + 0.08 * Math.sin(time * 1.6));
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
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6 || Date.now() - down.t > 450) { down = null; return; }
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
    this.labels.domElement.addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-house]');
      if (c && this.hooks.tap) { this.touched = Date.now(); this.hooks.tap(c.dataset.house, c.dataset.id || null); }
    });
  }

  paintFloors() {
    for (const f of this.floorMeshes) {
      const on = f.levelId === this.hoverLevel;
      for (const m of f.walls) m.material = on ? this.wallHover : m.userData.base;
    }
  }

  /* ----------------------------------------------------------- build */

  sync({ plan, energy, devices, dark, lang, texts }) {
    this.lang = lang || 'en';
    this.T = texts || {};
    const set = HC.settings(plan);
    const shape = HC.shape(plan);
    const present = (energy && energy.present) || {};
    const shows = {};
    for (const k of HC.OBJECTS) shows[k] = HC.shows(set, k, present);
    const key = JSON.stringify([plan.id, set, shape, shows, !!dark, this.lang]);
    if (key !== this.key) {
      const first = !this.key;
      this.key = key;
      this.build(set, shape, shows, dark);
      if (first) this.resetCamera();
    }
    this.updateLive(plan, energy, devices);
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
    this.flows = []; this.fans = []; this.cards = {}; this.floorMeshes = []; this.windows = []; this.tags = [];
    this.glow = null; this.cable = null; this.soc = null;
  }

  build(set, shape, shows, dark) {
    this.clear();
    const t = dark ? THEMES.dark : THEMES.light;
    this.theme = t;
    this.set = set;
    this.shape = shape;
    this.shows = shows;
    this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGround); this.hemi.intensity = t.hemi;
    this.sun.intensity = t.sun;
    this.wallHover = new THREE.MeshStandardMaterial({ color: t.wall, emissive: '#2e5bff', emissiveIntensity: 0.25, roughness: 0.85 });

    const W = shape.width; const D = shape.depth;
    // The carport goes on the free side of a semi-detached house.
    let carport = set.carport;
    if (set.type === 'semi' && carport === set.neighbour) carport = carport === 'left' ? 'right' : 'left';
    if (set.type === 'terraced') carport = 'none';
    this.carportSide = carport;
    const cs = carport === 'left' ? -1 : 1; // the x direction of the carport

    // Sunlight from the south, wherever the front of the house looks.
    const dir = (compass) => { const a = THREE.MathUtils.degToRad(compass - set.facing); return new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); };
    const south = dir(180);
    this.sun.position.copy(south.clone().multiplyScalar(26)).add(new THREE.Vector3(-8, 30, 0));
    this.sun.target.position.set(0, 0, 0);

    this.buildGround(t, W, D, carport, cs);
    const anchors = this.buildHouse(t, set, shape, W, D);
    this.buildNeighbours(t, set, shape, W, D);
    if (carport !== 'none') this.buildCarport(t, W, D, cs);

    // Where the power of the house comes in: the meter cupboard at the front corner, on the side away from the carport.
    const mx = carport === 'left' ? W / 2 - 0.9 : -W / 2 + 0.9;
    const meter = new THREE.Vector3(mx, 0.9, D / 2 + 0.04);
    this.meterPoint = meter;
    const meterBox = box(0.42, 0.55, 0.06, mat('#d7dbe0'), mx, 0.62, D / 2 + 0.02);
    this.root.add(meterBox);

    if (shows.solar) this.buildSolar(t, set, shape, W, D, anchors, meter);
    if (shows.grid) this.buildGrid(t, W, D, meter, carport);
    if (shows.battery) this.buildBattery(t, set, W, D, cs, carport, meter);
    if (shows.car) this.buildCar(t, W, D, cs, carport, meter);
    if (shows.heatpump) this.buildHeatpump(t, W, D, cs, meter);
    if (shows.airco) this.buildAirco(t, W, D, cs, shape, meter);
    this.cards.home = this.card('home', null, new THREE.Vector3(0, anchors.top + 1.2, 0));
  }

  buildGround(t, W, D, carport, cs) {
    // A lawn that fades into the page at its edge
    const fade = document.createElement('canvas');
    fade.width = 256; fade.height = 256;
    const fg = fade.getContext('2d');
    const grad = fg.createRadialGradient(128, 128, 40, 128, 128, 128);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.35, '#fff'); grad.addColorStop(1, '#000');
    fg.fillStyle = grad; fg.fillRect(0, 0, 256, 256);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, D) * 2 + 14, 64),
      new THREE.MeshStandardMaterial({ color: t.ground, roughness: 1, transparent: true, alphaMap: new THREE.CanvasTexture(fade), depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.root.add(ground);
    const flat = (w, d, x, z, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); m.receiveShadow = true;
      this.root.add(m);
    };
    // A path to the front door and the driveway to the carport
    flat(1.4, 5, 0, D / 2 + 2.5, t.drive);
    if (carport !== 'none') flat(3.6, D * 0.6 + 6, cs * (W / 2 + 2.1), D / 2 + 3 - (D * 0.6 + 6) / 2 + 3, t.drive);
    // Trees at the back
    const tree = (x, z, s) => {
      const g = new THREE.Group();
      g.add(box(0.25 * s, 1.6 * s, 0.25 * s, mat(t.trunk), 0, 0, 0));
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 0), mat(t.tree, { flatShading: true }));
      crown.position.y = 2.3 * s; crown.castShadow = true;
      g.add(crown);
      g.position.set(x, 0, z);
      this.root.add(g);
    };
    tree(-W / 2 - 3.5, -D / 2 - 3, 1.1);
    tree(W / 2 + 4.5, -D / 2 - 4, 0.9);
    tree(-W / 2 - 5, D / 2 + 2, 0.8);
  }

  // The storeys as stacked blocks with windows, a door and the roof. Returns the roof anchors.
  buildHouse(t, set, shape, W, D) {
    const g = new THREE.Group();
    this.root.add(g);
    const lamps = [];
    shape.floors.forEach((f, i) => {
      const fg = new THREE.Group();
      fg.userData.pick = { kind: 'level', id: f.levelId };
      const wallMat = mat(t.wall);
      const walls = box(W, f.height - 0.12, D, wallMat, 0, f.base, 0);
      walls.userData.base = wallMat;
      const band = box(W + 0.06, 0.12, D + 0.06, mat(t.band), 0, f.base + f.height - 0.12, 0);
      fg.add(walls, band);
      // Windows on all four sides; the front of the ground floor has the door in the middle
      const glass = new THREE.MeshStandardMaterial({ color: t.glass, roughness: 0.25, metalness: 0.1, emissive: t.lit, emissiveIntensity: 0 });
      const winY = f.base + (i === 0 ? 0.9 : 0.85);
      const winH = 1.35;
      const addWin = (w, x, z, ry) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, winH), glass);
        m.position.set(x, winY + winH / 2, z); m.rotation.y = ry;
        fg.add(m);
      };
      const cols = Math.max(2, Math.round(W / 2.6));
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + (W / cols) * (c + 0.5);
        if (!(i === 0 && Math.abs(x) < W / cols / 2)) addWin(1.2, x, D / 2 + 0.011, 0);
        addWin(1.2, x, -D / 2 - 0.011, Math.PI);
      }
      const sideCols = Math.max(1, Math.round(D / 3.2));
      for (let c = 0; c < sideCols; c++) {
        const z = -D / 2 + (D / sideCols) * (c + 0.5);
        addWin(0.9, -W / 2 - 0.011, z, -Math.PI / 2);
        addWin(0.9, W / 2 + 0.011, z, Math.PI / 2);
      }
      if (i === 0) {
        const door = box(1.0, 2.15, 0.05, mat(t.door), 0, 0, D / 2 + 0.01);
        fg.add(door);
      }
      // A name tag beside the storey, also to tap
      const tag = document.createElement('div');
      tag.className = 'h3-floor';
      tag.dataset.house = 'level';
      tag.dataset.id = f.levelId || '';
      tag.textContent = f.name || '';
      const label = new CSS2DObject(tag);
      this.tags.push(tag);
      label.position.set(-W / 2 - 0.2, f.base + f.height / 2, D / 2);
      label.center.set(1, 0.5);
      fg.add(label);
      g.add(fg);
      this.floorMeshes.push({ levelId: f.levelId, walls: [walls] });
      lamps.push({ levelId: f.levelId, glass });
    });
    this.windows = lamps;
    const eaves = shape.eaves;
    if (set.extension !== 'none') {
      const ext = set.extension === 'back'
        ? box(W * 0.6, 3.0, 3.2, mat(t.wallSide), -W * 0.15, 0, -D / 2 - 1.6)
        : box(3.2, 3.0, D * 0.7, mat(t.wallSide), (this.carportSide === 'left' ? 1 : -1) * (W / 2 + 1.6), 0, -D * 0.1);
      ext.userData.pick = { kind: 'level', id: shape.floors[0].levelId };
      g.add(ext);
      const slab = box(ext.geometry.parameters.width + 0.2, 0.15, ext.geometry.parameters.depth + 0.2, mat(t.roofEdge), ext.position.x, 3.0, ext.position.z);
      g.add(slab);
    }
    return this.buildRoof(t, set, shape, W, D, g, eaves);
  }

  // The roof in its own frame: length L along x, span S along z; turned when the ridge runs front to back.
  buildRoof(t, set, shape, W, D, parent, eaves) {
    const turned = set.ridge === 'depth' && set.roof !== 'flat';
    const L = turned ? D : W; const S = turned ? W : D;
    const ov = 0.35;
    const rg = new THREE.Group();
    rg.position.y = eaves;
    if (turned) rg.rotation.y = Math.PI / 2;
    parent.add(rg);
    const roofMat = mat(t.roof, { roughness: 0.7, side: THREE.DoubleSide });
    const gableMat = mat(t.wallSide, { side: THREE.DoubleSide });
    const pitch = THREE.MathUtils.degToRad(set.pitch);
    const rise = (S / 2) * Math.tan(pitch);
    const x0 = -L / 2 - ov; const x1 = L / 2 + ov; const z0 = -S / 2 - ov; const z1 = S / 2 + ov;
    const drop = ov * Math.tan(pitch);
    const pick = { kind: 'level', id: shape.attic ? shape.attic.levelId : shape.floors[shape.floors.length - 1].levelId };
    let top = eaves;
    if (set.roof === 'flat') {
      rg.add(box(W + 0.3, 0.3, D + 0.3, mat(t.roofEdge), 0, 0, 0));
      this.roofFrame = { kind: 'flat', y: eaves + 0.3, L: W, S: D };
      top = eaves + 0.3;
    } else if (set.roof === 'gable') {
      const roof = polyMesh([
        [[x0, -drop, z1], [x1, -drop, z1], [x1, rise, 0], [x0, rise, 0]],
        [[x1, -drop, z0], [x0, -drop, z0], [x0, rise, 0], [x1, rise, 0]],
      ], roofMat);
      roof.userData.pick = pick;
      const gables = polyMesh([
        [[-L / 2, 0, S / 2], [-L / 2, rise, 0], [-L / 2, 0, -S / 2]],
        [[L / 2, 0, -S / 2], [L / 2, rise, 0], [L / 2, 0, S / 2]],
      ], gableMat);
      gables.userData.pick = pick;
      rg.add(roof, gables);
      top = eaves + rise;
    } else {
      // Hip roof: the ridge is shorter by the span; a square house gets a pyramid.
      const r = Math.max(0, L / 2 - S / 2);
      const roof = polyMesh([
        [[x0, -drop, z1], [x1, -drop, z1], [r, rise, 0], [-r, rise, 0]],
        [[x1, -drop, z0], [x0, -drop, z0], [-r, rise, 0], [r, rise, 0]],
        [[x1, -drop, z1], [x1, -drop, z0], [r, rise, 0]],
        [[x0, -drop, z0], [x0, -drop, z1], [-r, rise, 0]],
      ], roofMat);
      roof.userData.pick = pick;
      rg.add(roof);
      top = eaves + rise;
    }
    // A dormer on the back slope of a gable roof along the front, set back a little from the eaves
    if (set.dormer && set.roof === 'gable' && !turned) {
      const tan = Math.tan(pitch);
      const dw = Math.min(3, L * 0.35);
      const zf = -S / 2 + 0.6;
      const yf = 0.6 * tan;
      const dh = Math.min(1.5, (rise - yf) * 0.7);
      const zr = (yf + dh - rise) / tan;
      if (zr > zf + 0.3) {
        const dormer = box(dw, yf + dh, zr - zf, mat(t.wallSide), 0, 0, (zf + zr) / 2);
        dormer.userData.pick = pick;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(dw * 0.6, dh * 0.6), mat(t.glass, { roughness: 0.25 }));
        win.position.set(0, yf + dh * 0.45, zf - 0.011); win.rotation.y = Math.PI;
        rg.add(dormer, win, box(dw + 0.2, 0.12, zr - zf + 0.2, mat(t.roofEdge), 0, yf + dh, (zf + zr) / 2));
      }
    }
    this.roofGroup = rg;
    this.roofInfo = { L, S, rise, pitch, turned, ov };
    return { top, rise };
  }

  buildNeighbours(t, set, shape, W, D) {
    const sides = set.type === 'semi' ? [set.neighbour] : set.type === 'terraced' ? ['left', 'right'] : [];
    const material = mat(t.neighbour, { transparent: true, opacity: 0.55 });
    for (const side of sides) {
      const s = side === 'left' ? -1 : 1;
      const g = new THREE.Group();
      g.add(box(W, shape.eaves, D, material, 0, 0, 0));
      if (set.roof !== 'flat') {
        const turned = set.ridge === 'depth';
        const L = turned ? D : W; const S = turned ? W : D;
        const rise = (S / 2) * Math.tan(THREE.MathUtils.degToRad(set.pitch));
        const roof = polyMesh([
          [[-L / 2, 0, S / 2], [L / 2, 0, S / 2], [L / 2, rise, 0], [-L / 2, rise, 0]],
          [[L / 2, 0, -S / 2], [-L / 2, 0, -S / 2], [-L / 2, rise, 0], [L / 2, rise, 0]],
          [[-L / 2, 0, S / 2], [-L / 2, rise, 0], [-L / 2, 0, -S / 2]],
          [[L / 2, 0, -S / 2], [L / 2, rise, 0], [L / 2, 0, S / 2]],
        ], material);
        roof.position.y = shape.eaves;
        if (turned) roof.rotation.y = Math.PI / 2;
        g.add(roof);
      }
      g.position.x = s * W;
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.root.add(g);
    }
  }

  buildCarport(t, W, D, cs) {
    const g = new THREE.Group();
    const x = cs * (W / 2 + 2.0); const z = D / 2 - 3.4; const len = 6.2; const w = 3.6;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (dx === -cs) continue; // the house side rests on the wall
      g.add(box(0.14, 2.45, 0.14, mat(t.post), x + dx * (w / 2 - 0.1), 0, z + dz * (len / 2 - 0.1)));
    }
    g.add(box(w + 0.2, 0.14, len + 0.2, mat(t.carport), x, 2.45, z));
    this.root.add(g);
    this.carportCenter = new THREE.Vector3(x, 0, z);
    this.carportLen = len;
  }

  buildSolar(t, set, shape, W, D, anchors, meter) {
    const side = HC.sunnySide(set);
    const info = this.roofInfo;
    const group = new THREE.Group();
    const panelW = 1.05; const panelH = 1.72; const gap = 0.04;
    const panelMat = new THREE.MeshStandardMaterial({ color: t.panel, roughness: 0.35, metalness: 0.2 });
    this.panelMat = panelMat;
    const frame = mat(t.panelFrame);
    let cols; let rows; let along; let up;
    let target = set.objects.solar.panels;
    if (side === 'top') {
      along = Math.max(1, Math.floor((shape.width - 1) / (panelW + gap)));
      up = Math.max(1, Math.floor((shape.depth - 1.5) / (panelH * Math.cos(0.26) + 0.6)));
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
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && n < target; c++, n++) {
        const x = (c - (cols - 1) / 2) * (panelW + gap);
        const s = 0.5 + r * (panelH + gap) + panelH / 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.04, panelH), panelMat);
        p.position.set(x, 0.06, -s);
        p.castShadow = true;
        const edge = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.02, 0.03, panelH + 0.02), frame);
        edge.position.set(x, 0.04, -s);
        panels.add(edge, p);
      }
    }
    // The glow underneath: stronger the more the panels make
    const gw = cols * (panelW + gap) + 0.6; const gh = rows * (panelH + gap) + 0.6;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshBasicMaterial({ color: '#ffc23d', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.02, -(0.5 + gh / 2 - 0.3));
    panels.add(glow);
    this.glow = glow;
    panels.userData.pick = { kind: 'solar' };

    if (side === 'top') {
      panels.rotation.x = 0.26;
      panels.position.set(0, 0.35, (rows * (panelH + gap)) / 2);
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
      slope.position.set(0, 0, (sideways ? info.L : info.S) / 2);
      if (sideways && this.set.roof === 'gable') return; // a gable end has no roof to carry panels
      slope.rotation.x = info.pitch;
      slope.add(panels);
      holder.add(slope);
      this.roofGroup.add(holder);
    }
    const anchor = new THREE.Vector3();
    panels.updateWorldMatrix(true, true);
    panels.localToWorld(anchor.set(0, 0.3, -(0.5 + (rows * (panelH + gap)) / 2)));
    this.cards.solar = this.card('solar', null, anchor.clone().add(new THREE.Vector3(0, 1.2, 0)));
    // The line runs from the panels down the front wall to the meter cupboard
    const eave = new THREE.Vector3(meter.x, shape.eaves - 0.1, this.shape.depth / 2 + 0.25);
    this.addFlow('solar', [anchor, new THREE.Vector3(meter.x, anchor.y, eave.z), eave, new THREE.Vector3(meter.x, meter.y + 0.3, meter.z + 0.2), meter]);
  }

  buildGrid(t, W, D, meter, carport) {
    const x = carport === 'left' ? W / 2 + 3 : -W / 2 - 3;
    const cabinet = box(0.7, 1.15, 0.4, mat('#5f7d5a'), x, 0, D / 2 + 4.2);
    cabinet.userData.pick = { kind: 'grid' };
    this.root.add(cabinet);
    this.cards.grid = this.card('grid', null, new THREE.Vector3(x, 2.0, D / 2 + 4.2));
    const p = (px, pz) => new THREE.Vector3(px, 0.06, pz);
    this.addFlow('grid', [new THREE.Vector3(x, 0.6, D / 2 + 4.0), p(x, D / 2 + 3.6), p(meter.x, D / 2 + 1.2), p(meter.x, meter.z + 0.15), meter]);
  }

  buildBattery(t, set, W, D, cs, carport, meter) {
    const underCarport = set.objects.battery.place === 'carport' && carport !== 'none';
    const x = underCarport ? cs * (W / 2 + 0.22) : (carport === 'left' ? W / 2 + 0.22 : -W / 2 - 0.22);
    const z = underCarport ? D / 2 - 5.6 : -D / 4;
    const g = new THREE.Group();
    const body = box(0.32, 1.1, 0.75, mat('#f4f5f7', { roughness: 0.5 }), 0, 0, 0);
    g.add(body);
    // Charge level as a light bar on the side that faces away from the wall
    const out = underCarport ? cs : (carport === 'left' ? 1 : -1);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.8), new THREE.MeshBasicMaterial({ color: '#34c759' }));
    bar.position.set(out * 0.162, 0.15, 0.2);
    bar.rotation.y = out * Math.PI / 2;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.84), new THREE.MeshBasicMaterial({ color: '#c9ccd1' }));
    track.position.set(out * 0.161, 0.55, 0.2);
    track.rotation.y = out * Math.PI / 2;
    g.add(track, bar);
    g.position.set(x, 0, z);
    g.userData.pick = { kind: 'battery' };
    this.root.add(g);
    this.soc = { bar, base: 0.15 };
    this.cards.battery = this.card('battery', null, new THREE.Vector3(x + out * 0.4, 1.9, z));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    const wallX = Math.sign(x) * (W / 2 + 0.05);
    this.addFlow('battery', [p(x, 0.9, z), p(wallX, 0.25, z), p(wallX, 0.25, D / 2 + 0.15), p(meter.x, 0.25, D / 2 + 0.15), meter]);
  }

  buildCar(t, W, D, cs, carport, meter) {
    const c = this.carportCenter || new THREE.Vector3((carport === 'left' ? -1 : 1) * (W / 2 + 2.0), 0, D / 2 + 2);
    const g = new THREE.Group();
    const body = mat(t.car, { roughness: 0.35, metalness: 0.3 });
    g.add(box(1.8, 0.62, 4.3, body, 0, 0.3, 0));
    const cabin = polyMesh([
      // a sloped cabin: windscreen to the front (+z), rear window to the back
      [[-0.8, 0, 1.0], [0.8, 0, 1.0], [0.7, 0.55, 0.3], [-0.7, 0.55, 0.3]],
      [[0.8, 0, -1.3], [-0.8, 0, -1.3], [-0.7, 0.55, -1.0], [0.7, 0.55, -1.0]],
      [[-0.7, 0.55, 0.3], [0.7, 0.55, 0.3], [0.7, 0.55, -1.0], [-0.7, 0.55, -1.0]],
      [[0.8, 0, 1.0], [0.8, 0, -1.3], [0.7, 0.55, -1.0], [0.7, 0.55, 0.3]],
      [[-0.8, 0, -1.3], [-0.8, 0, 1.0], [-0.7, 0.55, 0.3], [-0.7, 0.55, -1.0]],
    ], mat('#1e2733', { roughness: 0.2, metalness: 0.5 }));
    cabin.position.y = 0.92;
    g.add(cabin);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
    for (const [wx, wz] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35]]) {
      const w = new THREE.Mesh(wheel, mat('#1b1b1d'));
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.34, wz); w.castShadow = true;
      g.add(w);
    }
    g.position.set(c.x + cs * 0.25, 0, c.z + 0.4);
    g.userData.pick = { kind: 'car' };
    this.root.add(g);
    // The charger on the house wall beside the car, and its cable to the car's charging port (front, house side)
    const wallX = cs * (W / 2 + 0.06);
    const charger = box(0.1, 0.42, 0.28, mat('#30343a', { roughness: 0.4 }), wallX, 1.0, c.z + 1.6);
    charger.userData.pick = { kind: 'car' };
    this.root.add(charger);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: '#34c759' }));
    led.position.set(wallX + cs * 0.051, 1.32, c.z + 1.6);
    led.rotation.y = cs * Math.PI / 2;
    this.root.add(led);
    this.chargerLed = led;
    const port = new THREE.Vector3(g.position.x - cs * 0.9, 0.75, g.position.z + 1.2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(wallX + cs * 0.06, 1.0, c.z + 1.6),
      new THREE.Vector3(wallX + cs * 0.25, 0.35, c.z + 1.5),
      new THREE.Vector3((wallX + port.x) / 2, 0.08, (c.z + 1.6 + port.z) / 2),
      new THREE.Vector3(port.x - cs * 0.05, 0.5, port.z),
      port,
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6, false), mat('#151515', { roughness: 0.6 }));
    cable.castShadow = true;
    this.root.add(cable);
    this.cable = cable;
    this.cards.car = this.card('car', null, new THREE.Vector3(g.position.x, 2.0, g.position.z - 0.5));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    this.addFlow('use', [meter, p(meter.x, 0.25, D / 2 + 0.15), p(wallX + cs * 0.05, 0.25, D / 2 + 0.15), p(wallX + cs * 0.05, 0.25, c.z + 1.6), p(wallX + cs * 0.06, 0.95, c.z + 1.6)], 'car');
  }

  // The heat pump stands against the side wall on the carport side, towards the back: in view from the front corner.
  buildHeatpump(t, W, D, cs, meter) {
    const x = cs * (W / 2 + 0.23); const z = -D / 2 + 1.0;
    const g = new THREE.Group();
    g.add(box(1.05, 0.85, 0.42, mat(t.unit, { roughness: 0.5 }), 0, 0, 0));
    const fan = this.fan(0.28, -0.2, 0.43, 0.22);
    g.add(fan.ring, fan.mesh);
    g.rotation.y = cs * Math.PI / 2; // the fan looks away from the wall
    g.position.set(x, 0, z);
    g.userData.pick = { kind: 'heatpump' };
    this.root.add(g);
    this.fans.push(fan);
    this.heatFan = fan;
    this.cards.heatpump = this.card('heatpump', null, new THREE.Vector3(x + cs * 0.3, 1.3, z));
    const p = (px, py, pz) => new THREE.Vector3(px, py, pz);
    const side = cs * (W / 2 + 0.05);
    this.addFlow('use', [meter, p(meter.x, 0.25, D / 2 + 0.15), p(side, 0.25, D / 2 + 0.15), p(side, 0.25, z + 0.7), p(side, 0.4, z + 0.5)], 'heatpump');
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
    this.addFlow('use', [meter, p(x + 0.3, meter.y + 0.4, D / 2 + 0.06), p(x + 0.3, y - 0.1, D / 2 + 0.06), p(x + 0.2, y + 0.1, z)], 'airco');
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

  // A line along the points with dashes that move towards the end (speed > 0) or the start (speed < 0).
  addFlow(kind, points, target) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
    const length = curve.getLength();
    const tex = dashes().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, length / 0.9), 1);
    const material = new THREE.MeshBasicMaterial({ color: FLOW[kind] || FLOW.use, map: tex, transparent: true, depthWrite: false, opacity: 0.95 });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(length * 8)), 0.05, 6, false), material);
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
    el.innerHTML = `<i>${svg(ICONS[kind] || ICONS.home)}</i><span><b></b><em></em></span>`;
    // The label moves the outer box; declutter() moves the card inside it
    const anchor = document.createElement('div');
    anchor.className = 'h3-anchor';
    anchor.appendChild(el);
    const label = new CSS2DObject(anchor);
    label.position.copy(pos);
    label.center.set(0.5, 1);
    this.root.add(label);
    return { el, label };
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

    // Windows light up on storeys where a lamp is on
    const byId = devices instanceof Map ? devices : new Map();
    for (const w of this.windows || []) {
      const level = (plan.levels || []).find((l) => l.id === w.levelId);
      const lit = !!level && (level.items || []).some((it) => it.kind === 'device' && core && core.isLampItem(it, byId.get(it.deviceId)) && core.isOn(byId.get(it.deviceId)));
      w.glass.emissiveIntensity = lit ? (this.theme.night ? 1.1 : 0.45) : 0;
    }
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
    const dist = (r / Math.sin(fov / 2)) * (aspect < 1.3 ? 1.3 / aspect : 1) * 0.82;
    this.controls.target.set(center.x, size.y * 0.42, center.z);
    const az = THREE.MathUtils.degToRad(this.carportSide === 'left' ? -32 : 32); const el = THREE.MathUtils.degToRad(27);
    this.camera.position.set(center.x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), center.z + dist * Math.cos(el) * Math.cos(az));
    this.controls.minDistance = dist * 0.45;
    this.controls.maxDistance = dist * 1.6;
    this.controls.update();
  }

  // Cards that would cover each other move up until they are free, every few frames.
  declutter() {
    const list = Object.values(this.cards).filter((c) => c.el.isConnected && c.label.element.style.display !== 'none');
    const boxes = list.map((c) => {
      const r = c.el.getBoundingClientRect();
      const shift = c.shift || 0;
      return { c, x0: r.left, x1: r.right, y0: r.top - shift, y1: r.bottom - shift };
    }).sort((a, b) => b.y1 - a.y1);
    // The storey names stay where they are; cards make room for them
    const placed = (this.tags || []).map((el) => el.getBoundingClientRect()).map((r) => ({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }));
    for (const b of boxes) {
      let shift = 0;
      for (let pass = 0; pass < 8; pass++) {
        const hit = placed.find((p) => b.x0 < p.x1 + 4 && b.x1 > p.x0 - 4 && b.y0 + shift < p.y1 + 4 && b.y1 + shift > p.y0 - 4);
        if (!hit) break;
        shift = hit.y0 - 4 - b.y1;
      }
      placed.push({ x0: b.x0, x1: b.x1, y0: b.y0 + shift, y1: b.y1 + shift });
      if (Math.abs(shift - (b.c.shift || 0)) > 0.5) {
        b.c.shift = shift;
        b.c.el.style.transform = shift ? `translateY(${Math.round(shift)}px)` : '';
      }
    }
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
