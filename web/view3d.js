/*
 * 3D view of a floor plan level with three.js: rooms, walls with openings, furniture models, lamps that light up,
 * room labels and device badges. Loaded as an ES module; browsers that cannot load it keep the SVG views.
 * Plan units are centimetres (x right, y down); the scene uses metres with Y up and the plan's y as Z.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const core = window.FloorplanCore;
const MODELS = window.FloorplanModels;
const CM = 0.01;
const LOW_WALL = 0.3;

const THEMES = {
  light: {
    floor: '#ece6dc', wall: '#f3f1ec', wallTop: '#ffffff', ground: '#000000', groundOpacity: 0.12,
    door: '#a07a55', glass: '#a9cfe8', blind: '#8b8780', hemiSky: '#ffffff', hemiGround: '#b8ad9c', hemi: 1.7, sun: 2.6, night: false,
  },
  dark: {
    floor: '#2c2b2a', wall: '#a7a6a3', wallTop: '#e8e8e6', ground: '#000000', groundOpacity: 0.35,
    door: '#5e4630', glass: '#4f7392', blind: '#77736d', hemiSky: '#8fa3c0', hemiGround: '#1d1b19', hemi: 0.42, sun: 0.25, night: true,
  },
};

/* ---------------------------------------------------------------- models */

const loader = new GLTFLoader();
const modelCache = new Map();
function loadModel(file) {
  if (!modelCache.has(file)) {
    modelCache.set(file, loader.loadAsync(`models/${file}`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g.scene;
    }));
  }
  return modelCache.get(file);
}

// Places a model so it fills w x d x h (cm) with its front to +Z, base at y = 0, centred on x/z.
function fitModel(model, entry, w, d, h) {
  const inner = model.clone(true);
  inner.rotation.y = THREE.MathUtils.degToRad(entry.yaw || 0);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.scale.set((w * CM) / (size.x || 1), (h * CM) / (size.y || 1), (d * CM) / (size.z || 1));
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  return wrap;
}

/* --------------------------------------------------------------- helpers */

const tmpColor = new THREE.Color();
function mat(color, opts) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(opts || {}) });
}

function shapeGeometry(points, y) {
  const contour = points.map((p) => new THREE.Vector2(p[0] * CM, p[1] * CM));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = []; const nor = [];
  for (const t of tris) {
    // Wind each triangle so it faces up.
    const [a, b, c] = t.map((i) => contour[i]);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const order = cross > 0 ? [a, c, b] : [a, b, c];
    for (const v of order) { pos.push(v.x, y, v.y); nor.push(0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// A soft white disc; tinted per lamp and clipped to its room by the floor shape it is drawn on.
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
  return glowTexture;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------- fixtures */

// Lamps drawn in code, built around their bulb; the group's origin is the fixture's base (or top for ceiling lamps).
function fixtureMesh(kind, item, wallHeight, theme) {
  const g = new THREE.Group();
  const w = (item.w || 40) * CM; const d = (item.d || 40) * CM; const h = (item.h || 10) * CM;
  const white = mat('#f4f3ef', { roughness: 0.5 });
  const dark = mat('#2b2b2d', { roughness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: '#000000', roughness: 0.3 });
  let bulb;
  if (kind === 'ceiling') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 0.9, h, 32), white);
    body.position.y = -h / 2; g.add(body);
    bulb = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 * 0.85, w / 2 * 0.85, 0.005, 32), bulbMat);
    bulb.position.y = -h - 0.003; g.add(bulb);
  } else if (kind === 'pendant') {
    const drop = Math.max(0.2, h);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 6), dark);
    cord.position.y = -drop / 2; g.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(w / 2, 0.22, 32, 1, true), new THREE.MeshStandardMaterial({ color: theme.night ? '#3a3a3c' : '#2f3b45', side: THREE.DoubleSide, roughness: 0.5 }));
    shade.position.y = -drop - 0.06; g.add(shade);
    bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbMat);
    bulb.position.y = -drop - 0.13; g.add(bulb);
  } else if (kind === 'spot') {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 20), white);
    can.position.y = -h / 2; g.add(can);
    bulb = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 * 0.7, w / 2 * 0.7, 0.004, 20), bulbMat);
    bulb.position.y = -h - 0.002; g.add(bulb);
  } else if (kind === 'wall') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.02), white);
    plate.position.set(0, h / 2, -d / 2 + 0.01); g.add(plate);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 0.7, h, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#f1ece2', side: THREE.DoubleSide, roughness: 0.6 }));
    shade.rotation.y = Math.PI / 2; shade.position.set(0, h / 2, -d / 2 + 0.02); g.add(shade);
    bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), bulbMat);
    bulb.position.set(0, h / 2, -d / 2 + 0.06); g.add(bulb);
  } else if (kind === 'strip') {
    bulb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, 0.02), bulbMat);
    bulb.position.set(0, 0.006, -d / 2 + 0.01); g.add(bulb);
  } else if (kind === 'thermostat') {
    // A wall thermostat with a display that shows the room temperature (drawn by View3D.drawDisplay).
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    body.position.set(0, h / 2, 0); body.castShadow = true; g.add(body);
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(0, h / 2, d / 2 + 0.001); g.add(screen);
    g.userData.display = { canvas, tex };
  } else if (kind === 'trv') {
    // A radiator valve: a knob sticking out from the radiator, with a dark ring at the front.
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24), white);
    knob.rotation.x = Math.PI / 2; knob.position.set(0, h / 2, 0); g.add(knob);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 * 0.8, w / 2 * 0.8, 0.004, 24), dark);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, h / 2, d / 2 + 0.002); g.add(ring);
  }
  g.userData.bulb = bulb;
  return g;
}

// A change anywhere in a level (also one that keeps the JSON as long, like a new colour) rebuilds the scene.
function levelHash(level) {
  const s = JSON.stringify({ ...level, background: null });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/* ------------------------------------------------------------------ view */

class View3D {

  constructor(container, hooks) {
    this.el = container;
    this.hooks = hooks || {};
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'fp3-canvas';
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'fp3-labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.updateCutaway(); this.request(); });

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.key = null;
    this.walls = [];
    this.lamps = [];
    this.raf = null;
    this.theme = THEMES.light;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setupPicking();
    if (this.hooks.drag) this.setupDragging();
  }

  resize() {
    const w = this.el.clientWidth || 1; const h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const orbiting = this.controls.update();
      const walls = this.walls ? this.stepWalls(0.16) : false;
      const moving = orbiting || walls;
      this.renderer.render(this.scene, this.camera);
      this.updateOcclusion();
      this.labels.render(this.scene, this.camera);
      if (moving) this.request();
    });
  }

  // Taps on the floor of a room open its card; taps on a lamp switch it (like its badge).
  setupPicking() {
    const ray = new THREE.Raycaster();
    let down = null;
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: Date.now() }; });
    canvas.addEventListener('pointerup', (ev) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6 || Date.now() - down.t > 450) { down = null; return; }
      down = null;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hits = ray.intersectObjects(this.root.children, true);
      for (const hit of hits) {
        let o = hit.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o && this.hooks.tap) { this.hooks.tap(o.userData.pick.kind, o.userData.pick.id); return; }
        if (hit.object.userData.wall) continue;
      }
    });
  }

  /* ------------------------------------------------------------ build */

  // Rebuilds the scene when the plan, the level or the theme changed; otherwise only updates live states.
  sync({ plan, level, devices, dark, furniture, turn, values, names }) {
    this.names = names || 'devices';
    const key = [plan.id, level.id, plan.updatedAt || '', dark ? 'd' : 'l', furniture !== false, levelHash(level), names || 'devices'].join('|');
    this.devices = devices;
    this.values = values !== false;
    if (key !== this.key) {
      const first = !this.key || !this.key.startsWith(`${plan.id}|${level.id}|`);
      this.key = key;
      this.build(plan, level, dark, furniture !== false);
      if (first) this.resetCamera(turn);
    }
    this.updateLive();
  }

  clear() {
    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.shared) { o.geometry.dispose(); }
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.walls = []; this.lamps = []; this.badges = []; this.roomLabels = []; this.openings = []; this.displays = [];
    this.selBox = null;
    this.firstCutaway = true; // a new scene starts with the walls already in place, without animation
  }

  build(plan, level, dark, showFurniture) {
    this.clear();
    const t = this.theme = dark ? THEMES.dark : THEMES.light;
    this.level = level;
    const H = (level.wallHeight || core.DEFAULTS.wallHeight) * CM;
    this.wallHeight = H;
    this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGround); this.hemi.intensity = t.hemi;
    this.sun.intensity = t.sun;
    this.renderer.toneMappingExposure = t.night ? 1.25 : 1.0;

    const pts = [];
    for (const r of level.rooms) pts.push(...r.points);
    for (const w of level.walls) pts.push(w.a, w.b);
    if (!pts.length) pts.push([0, 0], [500, 400]);
    const b = core.geom.bbox(pts);
    this.bounds = { cx: (b.minX + b.maxX) / 2 * CM, cz: (b.minY + b.maxY) / 2 * CM, size: Math.max(b.w, b.h, 300) * CM };
    const { cx, cz, size } = this.bounds;

    // Shadow catcher under the house, and the sun over it.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size * 4), new THREE.ShadowMaterial({ opacity: t.groundOpacity, color: t.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.002, cz); ground.receiveShadow = true;
    this.root.add(ground);
    this.sun.position.set(cx + size * 0.6, size * 1.4, cz + size * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 0.1; sc.far = size * 4;
    sc.updateProjectionMatrix();

    // Floors, one per room, tappable.
    const floorMats = new Map();
    for (const room of level.rooms) {
      const color = room.color || t.floor;
      if (!floorMats.has(color)) floorMats.set(color, mat(color, { roughness: 0.92 }));
      const floor = new THREE.Mesh(shapeGeometry(room.points, 0), floorMats.get(color));
      floor.receiveShadow = true;
      floor.userData.pick = { kind: 'room', id: room.id };
      this.root.add(floor);
    }

    // Walls in pieces around doors and windows; the top is a lighter cap.
    const wallMat = mat(t.wall, { roughness: 0.95 });
    const capMat = mat(t.wallTop, { roughness: 0.9 });
    const mats = [wallMat, wallMat, capMat, wallMat, wallMat, wallMat];
    for (const wall of core.levelWalls(level)) {
      for (const piece of core.wallPieces(wall, level.openings, level, true)) {
        const u = core.geom.norm(core.geom.sub(piece.b, piece.a));
        const ext0 = piece.capA ? wall.t / 2 : 0; const ext1 = piece.capB ? wall.t / 2 : 0;
        const a = core.geom.sub(piece.a, core.geom.mul(u, ext0));
        const bb = core.geom.add(piece.b, core.geom.mul(u, ext1));
        const len = core.geom.dist(a, bb) * CM;
        const hgt = (piece.z1 - piece.z0) * CM;
        if (len < 0.005 || hgt < 0.005) continue;
        // Own materials per piece, so each can fade on its own when the camera moves.
        const own = mats.map((m) => m.clone());
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, wall.t * CM), own);
        const mid = core.geom.mul(core.geom.add(a, bb), 0.5);
        mesh.position.set(mid[0] * CM, piece.z0 * CM + hgt / 2, mid[1] * CM);
        mesh.rotation.y = -Math.atan2(u[1], u[0]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.wall = true;
        this.root.add(mesh);
        // Which side is outside the house, for the cut-away of walls in front of the camera.
        const n = [-u[1], u[0]];
        const probe = (s) => core.geom.add(mid, core.geom.mul(n, s * (wall.t / 2 + 25)));
        const inside = (p) => level.rooms.some((r) => core.geom.pointInPolygon(p, r.points));
        const outside = !inside(probe(1)) ? 1 : !inside(probe(-1)) ? -1 : 0;
        this.walls.push({ mesh, mats: own, z0: piece.z0 * CM, h: hgt, nx: n[0] * outside, nz: n[1] * outside, exterior: outside !== 0, cur: hgt, target: hgt, alpha: 1, alphaTarget: 1 });
      }
    }

    // Doors, windows and their blinds.
    for (const o of level.openings) this.buildOpening(o, t);

    // Furniture and lamps.
    for (const item of level.items) {
      if (item.kind === 'furniture' && showFurniture) this.buildFurniture(item, t);
      if (item.kind === 'device') this.buildDevice(item, t);
    }

    // Room labels.
    for (const room of level.rooms) {
      const lp = core.geom.labelPoint(room.points);
      const el = document.createElement('div');
      el.className = 'fp3-room';
      el.dataset.kind = 'room'; el.dataset.id = room.id;
      const obj = new CSS2DObject(el);
      obj.position.set(lp[0] * CM, 0.05, lp[1] * CM);
      this.root.add(obj);
      this.roomLabels.push({ el, room });
    }
    this.updateCutaway();
    this.scene.updateMatrixWorld(true);
  }

  buildOpening(o, t) {
    const u = [Math.cos(o.angle || 0), Math.sin(o.angle || 0)];
    const w = (o.width || 90) * CM;
    const thick = (this.level.wallThickness || 12) * CM;
    const group = new THREE.Group();
    group.position.set(o.x * CM, 0, o.y * CM);
    group.rotation.y = -Math.atan2(u[1], u[0]);
    group.userData.pick = { kind: 'opening', id: o.id };
    this.root.add(group);
    const entry = { o, group };
    if (o.type === 'window') {
      const sill = (o.sill != null ? o.sill : core.DEFAULTS.windowSill) * CM;
      const top = (o.top || core.DEFAULTS.windowTop) * CM;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, top - sill, 0.01), new THREE.MeshStandardMaterial({ color: t.glass, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 }));
      glass.position.y = sill + (top - sill) / 2;
      group.add(glass);
      const frameMat = mat(t.wallTop);
      for (const y of [sill, top]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, thick * 0.6), frameMat);
        bar.position.y = y; group.add(bar);
      }
      const blind = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 1, 0.015), mat(o.blindColor || t.blind, { roughness: 0.8 }));
      blind.position.z = (o.blindSide || 1) * (thick / 2 + 0.03);
      blind.castShadow = true;
      group.add(blind);
      Object.assign(entry, { blind, sill, top });
    } else {
      const dh = (o.height || core.DEFAULTS.doorHeight) * CM;
      const hingeX = (o.hinge || 1) > 0 ? -w / 2 : w / 2;
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0, 0);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, dh - 0.01, 0.04), mat(o.color || t.door, { roughness: 0.7 }));
      leaf.position.set(((o.hinge || 1) > 0 ? 1 : -1) * (w / 2), dh / 2, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
      group.add(pivot);
      Object.assign(entry, { pivot });
    }
    this.openings.push(entry);
  }

  placeItem(obj, item) {
    obj.position.set(item.x * CM, (item.z || 0) * CM, item.y * CM);
    obj.rotation.y = -THREE.MathUtils.degToRad(item.rot || 0);
  }

  buildFurniture(item, t) {
    const entry = MODELS.get(item.type);
    const holder = new THREE.Group();
    this.placeItem(holder, item);
    if (this.hooks.editing) holder.userData.pick = { kind: 'item', id: item.id };
    this.root.add(holder);
    if (this.names === 'all') {
      const el = document.createElement('div');
      el.className = 'fp3-tag';
      el.textContent = item.label || (entry ? entry.name.nl : '');
      const tag = new CSS2DObject(el);
      tag.position.set(item.x * CM, ((item.z || 0) + (item.h || 50)) * CM + 0.05, item.y * CM);
      this.root.add(tag);
    }
    if (entry && entry.file) {
      loadModel(entry.file).then((model) => {
        const fitted = fitModel(model, entry, item.w, item.d, item.h);
        if (item.color) fitted.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.lerp(tmpColor.set(item.color), 0.6); } });
        holder.add(fitted);
        this.request();
      }).catch(() => holder.add(this.partsMesh(item, t)));
    } else if (entry && entry.fixture && entry.mount === 'wall') {
      holder.add(fixtureMesh(entry.fixture, item, this.wallHeight, t));
    } else {
      holder.add(this.partsMesh(item, t));
    }
  }

  // Simple extruded shapes, for pieces without a model (and older plans).
  partsMesh(item, t) {
    const g = new THREE.Group();
    const parts = core.furnitureParts({ ...item, type: (MODELS.get(item.type) || {}).parts || item.type });
    const pal = this.theme.night ? core.DARK_PALETTE : core.LIGHT_PALETTE;
    for (const p of parts) {
      const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x * CM, -y * CM)));
      const depth = Math.max(0.005, (p.z1 - p.z0) * CM);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, p.z0 * CM, 0);
      const color = p.tone === 'body' && item.color ? item.color : (pal[p.tone === 'dark' ? 'dark2' : p.tone] || pal.body);
      const mesh = new THREE.Mesh(geo, mat(color));
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }

  buildDevice(item, t) {
    const dev = this.devices.get(item.deviceId);
    const kind = item.shape || core.deviceKind(dev);
    const entry = core.deviceFixture(item, dev) || (kind === 'light' && item.fixture !== 'none' ? MODELS.get(MODELS.DEFAULT_FIXTURE) : null);
    const isLight = kind === 'light' || !!(entry && entry.light);
    const H = this.wallHeight;
    const holder = new THREE.Group();
    holder.userData.pick = { kind: 'item', id: item.id };
    this.root.add(holder);
    let bulbLocal = new THREE.Vector3(0, 0, 0);
    let markerY;
    const w = item.w || (entry && entry.w) || 40; const d = item.d || (entry && entry.d) || 40; const h = item.h || (entry && entry.h) || 10;
    const sized = { ...item, w, d, h };
    let at = item;
    if (entry) {
      const mount = entry.mount;
      const z = mount === 'ceiling' ? H / CM : (item.z != null && item.z !== 0 ? item.z : (entry.z || 0));
      // A wall piece placed without a turn of its own goes against the nearest wall, facing the room.
      if (mount === 'wall' && item.rot == null) at = { ...item, ...this.againstWall(item, d) };
      this.placeItem(holder, { ...at, z });
      if (entry.fixture) {
        const fx = fixtureMesh(entry.fixture, sized, H, t);
        holder.add(fx);
        if (entry.light) {
          bulbLocal = fx.userData.bulb ? fx.userData.bulb.position.clone() : bulbLocal;
          this.registerLamp(item, holder, fx.userData.bulb, bulbLocal, entry);
        } else bulbLocal = new THREE.Vector3(0, h * CM, 0);
        if (fx.userData.display) this.displays.push({ item, ...fx.userData.display, key: null });
      } else if (entry.file) {
        const at = entry.light ? entry.light.at * (h / entry.h) * CM : h * CM;
        bulbLocal = new THREE.Vector3(0, mount === 'ceiling' ? -h * CM + at : at, 0);
        const lamp = this.registerLamp(item, holder, null, bulbLocal, entry);
        loadModel(entry.file).then((model) => {
          const fitted = fitModel(model, entry, w, d, h);
          if (mount === 'ceiling') fitted.position.y = -h * CM;
          // The lamp's own light parts glow: the lightest material in the model.
          const glowMats = [];
          fitted.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            const c = o.material.color; const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
            if (lum > 0.55 || /lamp|light|glass/i.test(o.material.name || '')) glowMats.push(o.material);
          });
          lamp.glowMats = glowMats;
          holder.add(fitted);
          this.updateLamp(lamp);
          this.request();
        }).catch(() => {});
      }
      markerY = (z * CM) + (mount === 'ceiling' ? -h * CM - 0.15 : bulbLocal.y + 0.12);
    } else {
      const mount = item.mount || core.defaultMount(kind);
      markerY = mount === 'ceiling' ? H - 0.25 : mount === 'wall' ? (item.z || 120) * CM : Math.max(0.15, (item.z || 0) * CM);
      this.placeItem(holder, { ...item, z: 0 });
    }

    // Badge: icon disc with the live value, tappable like the 2D markers.
    const el = document.createElement('div');
    el.className = `fp3-dev${isLight ? ' is-light' : ''}`;
    el.dataset.kind = 'item'; el.dataset.id = item.id;
    const badge = new CSS2DObject(el);
    badge.position.set(at.x * CM, markerY, at.y * CM);
    this.root.add(badge);
    this.badges.push({ el, item, kind: isLight ? 'light' : kind, obj: badge, behind: false });
  }

  // Where a wall piece without its own turn goes: against the nearest wall (within 60 cm), facing the room.
  againstWall(item, depth) {
    let best = null;
    for (const w of core.levelWalls(this.level)) {
      const pr = core.geom.projectOnSegment([item.x, item.y], w.a, w.b);
      if (pr.d <= 60 && (!best || pr.d < best.d)) best = { ...pr, t: w.t || this.level.wallThickness || 12 };
    }
    if (!best || best.d < 0.5) return {};
    const dir = core.geom.norm(core.geom.sub(best.point, [item.x, item.y]));
    const p = core.geom.sub(best.point, core.geom.mul(dir, best.t / 2 + depth / 2));
    return { x: p[0], y: p[1], rot: (Math.atan2(dir[0], -dir[1]) * 180) / Math.PI };
  }

  // The display of a thermostat: room temperature, and the set temperature below it.
  drawDisplay(disp) {
    const dev = this.devices.get(disp.item.deviceId);
    const c = (dev && dev.caps) || {};
    const temp = typeof c.measure_temperature === 'number' ? `${c.measure_temperature.toFixed(1)}°` : '--';
    const target = typeof c.target_temperature === 'number' ? `→ ${c.target_temperature}°` : '';
    if (disp.key === temp + target) return;
    disp.key = temp + target;
    const g = disp.canvas.getContext('2d');
    g.fillStyle = '#1d2226'; g.fillRect(0, 0, 128, 128);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = '600 40px system-ui, sans-serif'; g.fillText(temp, 64, target ? 64 : 78);
    if (target) { g.fillStyle = '#ffb35c'; g.font = '600 26px system-ui, sans-serif'; g.fillText(target, 64, 102); }
    disp.tex.needsUpdate = true;
  }

  /* ---------------------------------------------------------- editing */

  holderOf(id) {
    return this.root.children.find((o) => o.userData.pick && o.userData.pick.kind === 'item' && o.userData.pick.id === id) || null;
  }

  // Editor: an outline around the selected piece, device or room.
  select(id) {
    if (this.selBox) { this.root.remove(this.selBox); this.selBox.geometry.dispose(); this.selBox = null; }
    this.selectedId = id || null;
    for (const b of this.badges || []) b.el.classList.toggle('sel', b.item.id === this.selectedId);
    const level = this.level;
    if (!id || !level) { this.request(); return; }
    const lineMat = new THREE.LineBasicMaterial({ color: '#2e5bff', depthTest: false, transparent: true });
    const item = level.items.find((i) => i.id === id);
    const room = level.rooms.find((r) => r.id === id);
    let obj = null;
    if (item) {
      const holder = this.holderOf(id);
      const entry = item.kind === 'furniture' ? MODELS.get(item.type) : core.deviceFixture(item, this.devices.get(item.deviceId));
      if (holder && (item.kind === 'furniture' || entry)) {
        const w = (item.w || (entry && entry.w) || 30) * CM; const d = (item.d || (entry && entry.d) || 30) * CM; const h = (item.h || (entry && entry.h) || 30) * CM;
        const ceiling = item.kind === 'device' && entry && entry.mount === 'ceiling';
        obj = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04)), lineMat);
        obj.position.copy(holder.position);
        obj.position.y += ceiling ? -h / 2 : h / 2;
        obj.rotation.y = holder.rotation.y;
      }
    } else if (room) {
      const pts = room.points.map(([x, y]) => new THREE.Vector3(x * CM, 0.02, y * CM));
      obj = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    }
    if (obj) {
      obj.renderOrder = 10;
      obj.raycast = () => {};
      this.selBox = obj;
      this.root.add(obj);
    }
    this.request();
  }

  // Editor: drag the selected piece or device over the floor. hooks.drag(id, x, y, first) gets the plan
  // position (cm) and returns where it went ({ x, y, rot }); hooks.dragEnd(id, moved) when the pointer lets go.
  setupDragging() {
    const canvas = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    let drag = null;
    const aim = (ev) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camera);
    };
    const onPlane = (ev, y) => {
      aim(ev);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
    };
    // Capture on the container, so the camera controls do not start turning when a piece is grabbed.
    this.el.addEventListener('pointerdown', (ev) => {
      if (!this.selectedId || ev.button !== 0) return;
      let holder = null;
      const badge = ev.target.closest && ev.target.closest('.fp3-dev');
      if (badge) {
        if (badge.dataset.id === this.selectedId) holder = this.holderOf(this.selectedId);
      } else {
        aim(ev);
        for (const hit of ray.intersectObjects(this.root.children, true)) {
          let o = hit.object;
          while (o && !o.userData.pick) o = o.parent;
          if (!o) continue;
          if (o.userData.pick.kind === 'item' && o.userData.pick.id === this.selectedId) holder = o;
          break;
        }
      }
      if (!holder) return;
      const start = onPlane(ev, holder.position.y);
      if (!start) return;
      drag = { holder, id: this.selectedId, offset: new THREE.Vector3().subVectors(holder.position, start), moved: false, x: ev.clientX, y: ev.clientY };
      this.controls.enabled = false;
    }, true);
    window.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 4) return;
      const p = onPlane(ev, drag.holder.position.y);
      if (!p) return;
      p.add(drag.offset);
      const to = this.hooks.drag(drag.id, p.x / CM, p.z / CM, !drag.moved) || { x: p.x / CM, y: p.z / CM };
      drag.moved = true;
      const dx = to.x * CM - drag.holder.position.x; const dz = to.y * CM - drag.holder.position.z;
      const follow = [drag.holder, this.selBox, ...this.badges.filter((b) => b.item.id === drag.id).map((b) => b.obj)];
      for (const o of follow) if (o) { o.position.x += dx; o.position.z += dz; }
      if (to.rot != null) for (const o of [drag.holder, this.selBox]) if (o) o.rotation.y = -THREE.MathUtils.degToRad(to.rot);
      this.request();
    });
    window.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      this.controls.enabled = true;
      if (this.hooks.dragEnd) this.hooks.dragEnd(d.id, d.moved);
    });
  }

  registerLamp(item, holder, bulbMesh, bulbLocal, entry) {
    const lamp = { item, holder, bulbMesh, bulbLocal, entry, light: null, glow: null, glowMats: [] };
    this.lamps.push(lamp);
    return lamp;
  }

  /* -------------------------------------------------------- live states */

  updateLive() {
    for (const lamp of this.lamps) this.updateLamp(lamp);
    for (const disp of this.displays) this.drawDisplay(disp);
    for (const o of this.openings) this.updateOpening(o);
    const pal = this.theme.night ? core.DARK_PALETTE : core.LIGHT_PALETTE;
    // Values the room labels show are not repeated beside their devices.
    const shownByRoom = new Map();
    const labels = new Map();
    for (const l of this.roomLabels) {
      const label = core.roomLabel(l.room, this.devices);
      labels.set(l, label);
      for (const [id, caps] of label.hidden) shownByRoom.set(id, (shownByRoom.get(id) || []).concat(caps));
    }
    for (const b of this.badges) {
      const dev = this.devices.get(b.item.deviceId);
      const on = core.isOn(dev);
      const alarm = dev && ['alarm_smoke', 'alarm_water', 'alarm_co', 'alarm_generic', 'alarm_tamper'].some((c) => dev.caps[c] === true);
      const motion = dev && dev.caps.alarm_motion === true;
      const value = this.values && b.item.showValue !== false ? core.deviceValueText(dev, dev && shownByRoom.get(dev.id)) : null;
      const glyph = core.GLYPHS[b.kind] || core.GLYPHS.other;
      const color = b.kind === 'light' && on ? core.lightColor(dev) : null;
      b.el.className = `fp3-dev${b.kind === 'light' ? ' is-light' : ''}${on ? ' on' : ''}${alarm ? ' alarm' : ''}${motion ? ' motion' : ''}${dev && !dev.available ? ' off' : ''}${b.behind ? ' behind' : ''}${b.item.id === this.selectedId ? ' sel' : ''}`;
      b.el.style.setProperty('--dev', color || '');
      const name = this.names === 'devices' || this.names === 'all' ? (b.item.label || (dev && dev.name) || '') : '';
      b.el.innerHTML = `<span class="fp3-dot"><svg viewBox="0 0 24 24"><path d="${glyph}"/></svg></span>${value ? `<span class="fp3-val">${esc(value)}</span>` : ''}${name ? `<span class="fp3-name">${esc(name)}</span>` : ''}`;
    }
    for (const l of this.roomLabels) {
      const vals = labels.get(l).values;
      l.el.innerHTML = `<b>${esc(l.room.name)}</b>${vals.length ? `<span>${esc(vals.join(' '))}</span>` : ''}`;
    }
    void pal;
    this.request();
  }

  updateLamp(lamp) {
    const dev = this.devices.get(lamp.item.deviceId);
    const intensity = core.lightIntensity ? core.lightIntensity(dev) : (core.isOn(dev) ? 1 : 0);
    const on = intensity > 0;
    const color = on ? core.lightColor(dev) : '#fff7e8';
    if (lamp.bulbMesh) {
      lamp.bulbMesh.material.emissive.set(on ? color : '#000000');
      lamp.bulbMesh.material.emissiveIntensity = on ? 2.5 * intensity + 0.5 : 0;
    }
    for (const m of lamp.glowMats) {
      m.emissive = m.emissive || new THREE.Color();
      m.emissive.set(on ? color : '#000000');
      m.emissiveIntensity = on ? 0.9 * intensity : 0;
    }
    const reach = (lamp.item.reach || core.DEFAULTS.lightReach) * CM;
    if (on && !lamp.light) {
      lamp.light = new THREE.PointLight(color, 1, reach * 1.4, 1.6);
      lamp.light.position.copy(lamp.bulbLocal);
      lamp.holder.add(lamp.light);
      lamp.glow = this.makeGlow(lamp);
    }
    if (lamp.light) {
      lamp.light.visible = on;
      lamp.light.color.set(color);
      lamp.light.intensity = (this.theme.night ? 2.2 : 1.2) * intensity * (reach * reach);
    }
    if (lamp.glow) {
      lamp.glow.visible = on;
      lamp.glow.material.color.set(color);
      lamp.glow.material.opacity = (this.theme.night ? 0.55 : 0.22) * intensity;
    }
  }

  // The pool of light on the floor of the lamp's room (walls stop it).
  makeGlow(lamp) {
    const { item } = lamp;
    const room = this.level.rooms.find((r) => core.geom.pointInPolygon([item.x, item.y], r.points));
    if (!room) return null;
    const R = (item.reach || core.DEFAULTS.lightReach);
    const geo = shapeGeometry(room.points, 0.004);
    const pos = geo.getAttribute('position');
    const uv = [];
    for (let i = 0; i < pos.count; i++) {
      uv.push((pos.getX(i) / CM - item.x) / (2 * R) + 0.5, (pos.getZ(i) / CM - item.y) / (2 * R) + 0.5);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }));
    glow.renderOrder = 1;
    this.root.add(glow);
    return glow;
  }

  updateOpening(entry) {
    const linked = (entry.o.devices || []).map((id) => this.devices.get(id)).filter(Boolean);
    if (entry.blind) {
      const cover = linked.find((d) => core.coverClosed(d) != null);
      const closed = cover ? core.coverClosed(cover) : 0;
      const span = entry.top - entry.sill;
      entry.blind.visible = closed > 0.02;
      entry.blind.scale.y = Math.max(0.001, span * closed);
      entry.blind.position.y = entry.top - (span * closed) / 2;
    }
    if (entry.pivot) {
      const contact = linked.find((d) => 'alarm_contact' in d.caps);
      const open = contact ? contact.caps.alarm_contact === true : false;
      entry.pivot.rotation.y = open ? ((entry.o.swing || 1) * ((entry.o.hinge || 1) > 0 ? -1 : 1)) * Math.PI / 2 * 0.95 : 0;
    }
  }

  /* ------------------------------------------------------------ camera */

  resetCamera(turn) {
    const { cx, cz, size } = this.bounds;
    const az = THREE.MathUtils.degToRad(45 + 90 * (Number(turn) || 0));
    const el = THREE.MathUtils.degToRad(42);
    const dist = size * 1.55;
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx + Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, cz + Math.cos(az) * Math.cos(el) * dist);
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = size * 4;
    this.controls.update();
    this.updateCutaway();
    this.request();
  }

  // Device badges are HTML on top of the canvas; hide the ones a visible wall stands in front of,
  // like the device itself would be hidden. A ray from the camera to each badge is checked against walls.
  updateOcclusion() {
    if (!this.badges || !this.badges.length) return;
    if (!this.occluder) this.occluder = new THREE.Raycaster();
    const walls = this.walls.filter((w) => w.mesh.visible).map((w) => w.mesh);
    const from = this.camera.position;
    const to = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (const b of this.badges) {
      b.obj.getWorldPosition(to);
      dir.subVectors(to, from);
      const dist = dir.length();
      this.occluder.set(from, dir.normalize());
      this.occluder.far = Math.max(0, dist - 0.1);
      const behind = walls.length > 0 && this.occluder.intersectObjects(walls, false).length > 0;
      if (behind !== b.behind) { b.behind = behind; b.el.classList.toggle('behind', behind); }
    }
  }

  // Exterior walls between the camera and the house drop to a low rim so the rooms stay visible.
  updateCutaway() {
    if (!this.walls) return;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const steep = this.camera.position.y - this.controls.target.y;
    for (const w of this.walls) {
      const facing = w.exterior && (w.nx * dir.x + w.nz * dir.z) > 0.25;
      const low = facing && steep > 0.5;
      // Pieces above the low rim (lintels over doors and windows) fade out; the rest sinks to the rim.
      w.alphaTarget = low && w.z0 >= LOW_WALL ? 0 : 1;
      w.target = low && w.z0 < LOW_WALL ? Math.min(w.h, LOW_WALL - w.z0) : w.h;
    }
    if (this.firstCutaway !== false) { this.firstCutaway = false; this.stepWalls(1); } else this.request();
  }

  // Moves every wall a step towards its target height and opacity; true while something still moves.
  stepWalls(f) {
    let moving = false;
    for (const w of this.walls) {
      if (Math.abs(w.cur - w.target) > 0.002) { w.cur += (w.target - w.cur) * f; moving = true; } else w.cur = w.target;
      if (Math.abs(w.alpha - w.alphaTarget) > 0.01) { w.alpha += (w.alphaTarget - w.alpha) * f; moving = true; } else w.alpha = w.alphaTarget;
      w.mesh.scale.y = Math.max(0.001, w.cur / w.h);
      w.mesh.position.y = w.z0 + w.cur / 2;
      w.mesh.visible = w.alpha > 0.01;
      const fading = w.alpha < 0.99;
      for (const m of w.mats) {
        if (m.transparent !== fading) { m.transparent = fading; m.needsUpdate = true; }
        m.opacity = w.alpha;
        m.depthWrite = !fading;
      }
    }
    return moving;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.clear();
    this.renderer.dispose();
    this.el.innerHTML = '';
  }

}

// Registers for widget.js, which drives the view like its SVG renderer.
window.FloorplanView3D = {
  supported: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })(),
  create: (el, hooks) => new View3D(el, hooks),
};
window.dispatchEvent(new Event('fp3d-ready'));
