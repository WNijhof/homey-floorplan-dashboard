/*
 * 3D view of a floor plan level with three.js: rooms, walls with openings, furniture models, lamps that light up,
 * room labels and device badges. Loaded as an ES module; browsers that cannot load it keep the SVG views.
 * Plan units are centimetres (x right, y down); the scene uses metres with Y up and the plan's y as Z.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as LOOK from './house-look.js';

const core = window.FloorplanCore;
const MODELS = window.FloorplanModels;
const CM = 0.01;
const LOW_WALL = 0.3;
const LAMP_FADE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.45; // seconds

const THEMES = {
  light: {
    floor: '#ece6dc', wall: '#f3f1ec', wallTop: '#ffffff', ground: '#000000', groundOpacity: 0.12,
    door: '#a07a55', glass: '#a9cfe8', blind: '#8b8780', hemiSky: '#ffffff', hemiGround: '#b8ad9c', hemi: 1.3, sun: 2.3, night: false,
  },
  dark: {
    floor: '#3a3836', wall: '#b9b7b2', wallTop: '#d9d8d4', ground: '#000000', groundOpacity: 0.35,
    door: '#6e5339', glass: '#4f7392', blind: '#77736d', hemiSky: '#9aa2b4', hemiGround: '#2e2c30', hemi: 1.0, sun: 0.35, sunColor: '#c6d0e4', night: true,
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

// A piece in the colour chosen in the editor: the material that covers most of it (the fabric of a sofa, the wood of a
// table) gets exactly that colour, without its texture; legs, metal and glass keep theirs.
// The material that covers the largest surface wins (not the one with the most points: a kitchen unit's few
// big wooden fronts outweigh the many small points of its handles and sink).
// Gives the materials of a model the colours chosen for them: colours[k] for the material with the k-th biggest surface, and the
// finish (matte, satin, gloss, metal) to the coloured ones and the biggest one. A model with one texture has one material only.
function recolor(obj, colors, finish) {
  const size = new Map();
  obj.updateMatrixWorld(true);
  const A = new THREE.Vector3(); const B = new THREE.Vector3(); const C = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry; const pos = geo.attributes.position; const idx = geo.index;
    const mats = [].concat(o.material);
    const total = idx ? idx.count : pos.count;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const g of groups) {
      const m = mats[g.materialIndex] || mats[0];
      let area = 0;
      for (let k = g.start; k + 2 < Math.min(total, g.start + g.count); k += 3) {
        const at = (j) => (idx ? idx.getX(k + j) : k + j);
        A.fromBufferAttribute(pos, at(0)).applyMatrix4(o.matrixWorld);
        B.fromBufferAttribute(pos, at(1)).applyMatrix4(o.matrixWorld);
        C.fromBufferAttribute(pos, at(2)).applyMatrix4(o.matrixWorld);
        area += B.sub(A).cross(C.sub(A)).length() / 2;
      }
      size.set(m, (size.get(m) || 0) + area);
    }
  });
  const ranked = [...size.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 6);
  const swap = new Map();
  ranked.forEach((m, k) => {
    const color = colors[k];
    if (!color && !(finish && k === 0)) return;
    const own = m.clone();
    if (color) { own.map = null; own.color.set(color); }
    if (finish && FINISH[finish]) { own.roughness = FINISH[finish][0]; own.metalness = FINISH[finish][1]; }
    own.needsUpdate = true;
    swap.set(m, own);
  });
  if (!swap.size) return;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => swap.get(m) || m) : (swap.get(o.material) || o.material);
  });
}

// A round table drawn in code, so it is really round: a top, a column and a foot.
function roundTable(item, color) {
  const g = new THREE.Group();
  const w = (item.w || 110) * CM; const d = (item.d || 110) * CM; const h = (item.h || 76) * CM;
  const wood = mat(color, { roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 64), wood);
  top.scale.set(w, 1, d); top.position.y = h - 0.02;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h - 0.06, 24), wood);
  column.position.y = (h - 0.04) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.3, 0.03, 48), wood);
  foot.position.y = 0.015;
  for (const m of [top, column, foot]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
function mat(color, opts) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(opts || {}) });
}

// A cabinet drawn in code to the size, doors, glass and colours of the real one (a steel display cabinet with glass in the
// top half of its two hinged doors, or a plain cupboard). In its own frame: width along x, depth along z (the front at +z),
// standing on y = 0. Colours: 0 frame, 1 doors, 2 glass; item.glass is the share of each door that is glass, from the top.
function buildCabinet(item) {
  const g = new THREE.Group();
  const W = Math.max(0.2, (item.w || 90) * CM); const D = Math.max(0.15, (item.d || 40) * CM); const H = Math.max(0.3, (item.h || 180) * CM);
  const finish = FINISH[core.finishOf(item) || 'satin'];
  const frameColor = core.slotColor(item, 0) || '#1b1c1f';
  const body = new THREE.MeshStandardMaterial({ color: frameColor, roughness: finish[0], metalness: finish[1] });
  const doorMat = new THREE.MeshStandardMaterial({ color: core.slotColor(item, 1) || frameColor, roughness: finish[0], metalness: finish[1] });
  const glass = new THREE.MeshPhysicalMaterial({ color: core.slotColor(item, 2) || '#bcd7e6', transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0, depthWrite: false });
  const inside = new THREE.MeshStandardMaterial({ color: new THREE.Color(frameColor).multiplyScalar(0.8), roughness: 0.9, metalness: 0 });
  const box = (w, h, d, m, x, y, z, shadow) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    if (shadow !== false) { mesh.castShadow = true; mesh.receiveShadow = true; }
    g.add(mesh);
    return mesh;
  };
  const fr = Math.min(0.03, Math.max(0.015, Math.min(W, D) * 0.045)); // thickness of the frame members
  const base = Math.min(0.08, H * 0.04); // the plinth under the cabinet
  const y0 = base + fr; const y1 = H - fr; // the opening for the doors
  const innerW = W - 2 * fr; const innerH = y1 - y0;
  // Carcass: a plinth, two sides, a bottom and a top, and a back
  box(W - 0.04, base, D - 0.04, inside, 0, 0, 0);
  box(fr, H - base, D, body, -W / 2 + fr / 2, base, 0);
  box(fr, H - base, D, body, W / 2 - fr / 2, base, 0);
  box(innerW, fr, D, body, 0, base, 0);
  box(innerW, fr, D, body, 0, H - fr, 0);
  box(innerW, innerH, 0.012, inside, 0, y0, -D / 2 + 0.006);
  // The doors, hinged on the outer edges, closed: a solid part below and a glass part above
  const doors = Math.max(1, Math.min(4, Math.round(item.doors || 2)));
  const gap = 0.003; const dt = 0.02;
  const share = Math.max(0, Math.min(1, Number.isFinite(Number(item.glass)) ? Number(item.glass) : 0));
  const glassH = share * innerH; const solidH = innerH - glassH;
  const dw = innerW / doors;
  const zf = D / 2 - dt / 2 + 0.004; // the doors sit just proud of the carcass
  const rail = Math.min(0.03, Math.max(0.018, dw * 0.05)); // the frame round the glass
  for (let k = 0; k < doors; k++) {
    const cx = -innerW / 2 + dw * (k + 0.5);
    const w = dw - gap;
    if (solidH > 0.005) box(w, solidH, dt, doorMat, cx, y0, zf);
    if (glassH > 0.005) {
      const top = y0 + solidH; // the glass part stands on the solid one
      box(w, rail, dt, doorMat, cx, top, zf); // bottom rail
      box(w, rail, dt, doorMat, cx, y1 - rail, zf); // top rail
      box(rail, glassH - 2 * rail, dt, doorMat, cx - w / 2 + rail / 2, top + rail, zf); // stiles
      box(rail, glassH - 2 * rail, dt, doorMat, cx + w / 2 - rail / 2, top + rail, zf);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * rail, glassH - 2 * rail), glass);
      pane.position.set(cx, top + glassH / 2, zf + 0.002);
      pane.renderOrder = 2;
      g.add(pane);
    }
    // the handle at the edge where the doors meet (the free edge of a single door)
    const kind = item.handle === 'knob' || item.handle === 'none' ? item.handle : 'bar';
    if (kind !== 'none') {
      const meet = doors === 1 ? 1 : k % 2 === 0 ? 1 : -1; // pairs of doors: left door on its right edge, right door on its left
      const hx = cx + meet * (w / 2 - 0.035);
      const hy = Math.min(y1 - 0.15, Math.max(y0 + 0.15, y0 + innerH * 0.5));
      if (kind === 'bar') box(0.014, Math.min(0.3, innerH * 0.18), 0.016, body, hx, hy - Math.min(0.3, innerH * 0.18) / 2, zf + dt / 2 + 0.008);
      else { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), body); knob.position.set(hx, hy, zf + dt / 2 + 0.014); g.add(knob); }
    }
  }
  // Shelves behind the glass
  const shelves = glassH > 0.05 ? Math.max(0, Math.min(8, Math.round(item.shelves != null ? item.shelves : 3))) : 0;
  for (let s = 1; s <= shelves; s++) {
    const y = y0 + solidH + (glassH * s) / (shelves + 1);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.012, D - 0.07), new THREE.MeshPhysicalMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false }));
    shelf.position.set(0, y, -0.01); shelf.renderOrder = 1;
    g.add(shelf);
  }
  return g;
}

// A car drawn in code to the size of the piece (see LOOK.drawnCar); colours: 0 body, 1 windows.
function buildCar(item) {
  return LOOK.drawnCar(Math.max(0.8, (item.w || 180) * CM), Math.max(1.5, (item.d || 450) * CM), Math.max(0.8, (item.h || 150) * CM),
    core.slotColor(item, 0), core.slotColor(item, 1), FINISH[core.finishOf(item) || 'gloss']);
}

/* ------------------------------------------------------ pictures of the plan */

// The decoded picture behind a data URI, shared by everything that shows it
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }));
  }
  return imageCache.get(src);
}

// A texture of its own (with its own repeat and offset) on the shared picture; `ready` runs when the picture has arrived
function pictureTexture(src, ready) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.userData.picture = true;
  loadImage(src).then((img) => { tex.image = img; tex.needsUpdate = true; if (ready) ready(); }).catch(() => {});
  return tex;
}

// What a surface finish does to a material: [roughness, metalness]
const FINISH = { matte: [0.95, 0], satin: [0.55, 0], gloss: [0.18, 0.05], metal: [0.32, 0.85] };

function shapeGeometry(points, y, uvOf) {
  const contour = points.map((p) => new THREE.Vector2(p[0] * CM, p[1] * CM));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = []; const nor = []; const uv = [];
  for (const t of tris) {
    // Wind each triangle so it faces up.
    const [a, b, c] = t.map((i) => contour[i]);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const order = cross > 0 ? [a, c, b] : [a, b, c];
    for (const v of order) {
      pos.push(v.x, y, v.y); nor.push(0, 1, 0);
      if (uvOf) uv.push(...uvOf(v.x, v.y)); else uv.push(v.x, -v.y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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

/* ----------------------------------------------------------- room light */

// A lamp lights its own room and not the one behind the wall. Shadows for every lamp would be too heavy for a
// tablet, so the rooms are drawn once into a small top-view map; each surface looks up its room there and skips
// the lamps of other rooms. A lamp carries its room in the tens of its decay, which needs no extra uniform.
const ROOM_FRAGMENT_HEAD = `
uniform sampler2D roomMask;
uniform vec4 roomBox;
varying vec3 vRoomAt;
float roomAt( vec2 p ) { return floor( texture2D( roomMask, ( p - roomBox.xy ) / roomBox.zw ).r * 255.0 + 0.5 ); }
`;
const ROOM_LIGHTS = `
vec3 roomNormal = inverseTransformDirection( normal, viewMatrix );
float surfaceRoom = roomAt( vRoomAt.xz + roomNormal.xz * 0.07 ); // just off a wall, into the room that wall faces
float lampRoom; // (one for all lamps: three.js writes out its loop without braces)
${THREE.ShaderChunk.lights_fragment_begin.replace('getPointLightInfo( pointLight, geometryPosition, directLight );', `
lampRoom = floor( pointLight.decay / 10.0 );
pointLight.decay -= lampRoom * 10.0;
getPointLightInfo( pointLight, geometryPosition, directLight );
if ( lampRoom > 0.5 && abs( lampRoom - surfaceRoom ) > 0.5 ) directLight.color = vec3( 0.0 );
`)}`;
const roomLitMaterials = new WeakSet();

function makeRoomLit(material, uniforms) {
  if (roomLitMaterials.has(material)) return;
  roomLitMaterials.add(material);
  if (!material.isMeshStandardMaterial && !material.isMeshLambertMaterial && !material.isMeshPhongMaterial) return;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vRoomAt;\n${shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 roomPoint = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        roomPoint = instanceMatrix * roomPoint;
      #endif
      vRoomAt = ( modelMatrix * roomPoint ).xyz;`)}`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${ROOM_FRAGMENT_HEAD}`)
      .replace('#include <lights_fragment_begin>', ROOM_LIGHTS);
  };
  material.customProgramCacheKey = function () { return `${key.call(this)}|room`; };
  material.needsUpdate = true;
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
  } else if (kind === 'tv') {
    // A flat TV on the wall: a thin dark frame with a screen that lights up when the TV is on (View3D.drawDisplay).
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dark);
    frame.position.set(0, h / 2, 0); frame.castShadow = true; g.add(frame);
    const glass = new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: '#000000', roughness: 0.25, metalness: 0.2 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), glass);
    screen.position.set(0, h / 2, d / 2 + 0.001); g.add(screen);
    g.userData.display = { tv: glass };
  } else if (kind === 'trv') {
    // A radiator valve: a knob sticking out from the radiator, with a dark ring at the front.
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24), white);
    knob.rotation.x = Math.PI / 2; knob.position.set(0, h / 2, 0); g.add(knob);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 * 0.8, w / 2 * 0.8, 0.004, 24), dark);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, h / 2, d / 2 + 0.002); g.add(ring);
  } else if (kind === 'split') {
    // The indoor unit of a split air conditioner: a white body with a dark air slot at the bottom and a small light
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    body.position.set(0, h / 2, 0); body.castShadow = true; g.add(body);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.14, 0.004), dark);
    slot.position.set(0, h * 0.16, d / 2 + 0.002); g.add(slot);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: '#7fd3ff' }));
    led.position.set(w * 0.36, h * 0.42, d / 2 + 0.002); g.add(led);
  } else if (kind === 'fancoil') {
    // A fan coil unit: a white cabinet low on the wall with a dark grille on top and a strip at the front.
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    body.position.set(0, h / 2, 0); body.castShadow = true; g.add(body);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.006, d * 0.7), dark);
    grille.position.set(0, h + 0.003, 0); g.add(grille);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.12, 0.004), dark);
    strip.position.set(0, h * 0.2, d / 2 + 0.002); g.add(strip);
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
    this.sharp = new LOOK.Sharpness(this.renderer, () => this.resize());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
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
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 5;
    this.sun.shadow.blurSamples = 14;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.key = null;
    this.walls = [];
    this.lamps = [];
    this.raf = null;
    this.theme = THEMES.light;
    const noRooms = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    noRooms.needsUpdate = true;
    this.roomUniforms = { roomMask: { value: noRooms }, roomBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
    this.roomOf = new Map();

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
    this.setShift(this.shift || 0);
    this.request();
  }

  // The picture slides to the left by half of this, to stay beside a card that covers the right part.
  setShift(px) {
    this.shift = px;
    const w = this.el.clientWidth || 1; const h = this.el.clientHeight || 1;
    if (px) this.camera.setViewOffset(w, h, px / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const orbiting = this.controls.update();
      const walls = this.walls ? this.stepWalls(0.16) : false;
      const lamps = this.stepLamps();
      const flying = this.stepFlight();
      const moving = orbiting || walls || lamps || flying;
      if (moving) this.sharp.frame(performance.now());
      if (this.gizmo) this.gizmo.scale.setScalar(this.camera.position.distanceTo(this.gizmo.position) * 0.09);
      this.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) makeRoomLit(m, this.roomUniforms); });
      this.renderer.render(this.scene, this.camera);
      this.updateOcclusion();
      this.labels.render(this.scene, this.camera);
      if (moving) this.request();
      else this.declutterNames();
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
  // night: the real time of day, from where the Homey is; else the theme of the page decides.
  sync({ plan, level, devices, dark: pageDark, night, furniture, turn, values, names }) {
    const dark = typeof night === 'boolean' ? night : pageDark;
    this.names = names || 'devices';
    const key = [plan.id, level.id, plan.updatedAt || '', dark ? 'd' : 'l', furniture !== false, levelHash(level), names || 'devices', JSON.stringify((plan.house && [plan.house.facade, plan.house.roofColor]) || '')].join('|');
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
      // the pictures of the plan are textures of their own: free them with the scene
      if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.map && m.map.userData && m.map.userData.picture) m.map.dispose();
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.walls = []; this.lamps = []; this.badges = []; this.roomLabels = []; this.openings = []; this.displays = [];
    this.selBox = null;
    this.firstCutaway = true; // a new scene starts with the walls already in place, without animation
  }

  // The map of rooms for the lamps: one number per room, 0 outside. Rooms joined by an open wall share their light.
  drawRoomMap(level) {
    const rooms = (level.rooms || []).slice(0, 255);
    const inside = (p) => rooms.findIndex((r) => core.geom.pointInPolygon(p, r.points));
    const joined = rooms.map((r, i) => i);
    const top = (i) => { while (joined[i] !== i) i = joined[i]; return i; };
    for (const o of level.openings || []) {
      if (o.type !== 'passage') continue;
      const n = [-Math.sin(o.angle || 0) * 30, Math.cos(o.angle || 0) * 30];
      const a = inside([o.x + n[0], o.y + n[1]]); const b = inside([o.x - n[0], o.y - n[1]]);
      if (a >= 0 && b >= 0) joined[top(a)] = top(b);
    }
    this.roomOf = new Map(rooms.map((r, i) => [r.id, top(i) + 1]));
    const pts = rooms.flatMap((r) => r.points);
    if (!pts.length) return;
    const pad = 40;
    const x0 = Math.min(...pts.map((p) => p[0])) - pad; const y0 = Math.min(...pts.map((p) => p[1])) - pad;
    const W = Math.max(...pts.map((p) => p[0])) + pad - x0; const H = Math.max(...pts.map((p) => p[1])) + pad - y0;
    const cell = Math.max(5, Math.max(W, H) / 1024);
    const cols = Math.ceil(W / cell); const rows = Math.ceil(H / cell);
    const data = new Uint8Array(cols * rows);
    rooms.forEach((r) => {
      const xs = r.points.map((p) => p[0]); const ys = r.points.map((p) => p[1]);
      const c0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / cell)); const c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) - x0) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / cell)); const r1 = Math.min(rows - 1, Math.ceil((Math.max(...ys) - y0) / cell));
      const id = this.roomOf.get(r.id);
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          if (!data[row * cols + col] && core.geom.pointInPolygon([x0 + (col + 0.5) * cell, y0 + (row + 0.5) * cell], r.points)) data[row * cols + col] = id;
        }
      }
    });
    const map = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
    map.minFilter = THREE.NearestFilter; map.magFilter = THREE.NearestFilter;
    map.needsUpdate = true;
    this.roomUniforms.roomMask.value.dispose();
    this.roomUniforms.roomMask.value = map;
    this.roomUniforms.roomBox.value.set(x0 * CM, y0 * CM, cols * cell * CM, rows * cell * CM);
  }

  // The room number of a lamp, also for a wall lamp that sits just outside its room's edge. 0: lights everything.
  lampRoom(item) {
    const spots = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]];
    for (const s of spots) {
      const room = (this.level.rooms || []).find((r) => core.geom.pointInPolygon([item.x + s[0], item.y + s[1]], r.points));
      if (room) return this.roomOf.get(room.id) || 0;
    }
    return 0;
  }

  build(plan, level, dark, showFurniture) {
    this.clear();
    const t = this.theme = dark ? THEMES.dark : THEMES.light;
    this.level = level;
    this.drawRoomMap(level);
    const H = (level.wallHeight || core.DEFAULTS.wallHeight) * CM;
    this.wallHeight = H;
    this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGround); this.hemi.intensity = t.hemi;
    this.sun.intensity = t.sun;
    this.sun.color.set(t.sunColor || '#fff4e0');
    this.el.classList.toggle('fp3-day', !t.night);
    this.el.classList.toggle('fp3-night', t.night);
    this.renderer.toneMappingExposure = t.night ? 1.2 : 1.0;
    // Reflections of a soft sky (glass, metal, varnished floors)
    this.envs = this.envs || {};
    const envKey = t.night ? 'd' : 'l';
    if (!this.envs[envKey]) this.envs[envKey] = LOOK.environment(this.renderer, t.night);
    this.scene.environment = this.envs[envKey];
    this.scene.environmentIntensity = t.night ? 0.2 : 0.45;

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
    // The ground floor stands in the garden, like on the house view
    if (plan.levels[0] && plan.levels[0].id === level.id) {
      const fade = document.createElement('canvas');
      fade.width = 256; fade.height = 256;
      const fg = fade.getContext('2d');
      const grad = fg.createRadialGradient(128, 128, 30, 128, 128, 128);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, '#000');
      fg.fillStyle = grad; fg.fillRect(0, 0, 256, 256);
      const tx = LOOK.textures(this.renderer, 'brick', 'anthracite', t.night);
      const grassMap = tx.grass.clone();
      grassMap.needsUpdate = true;
      grassMap.repeat.set(size * 1.2, size * 1.2);
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(size * 1.2, 64), new THREE.MeshStandardMaterial({ map: grassMap, alphaMap: new THREE.CanvasTexture(fade), transparent: true, depthWrite: false, roughness: 1 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(cx, -0.004, cz); lawn.receiveShadow = true;
      lawn.renderOrder = -1;
      this.root.add(lawn);
    }
    this.sun.position.set(cx + size * 0.6, size * 1.4, cz + size * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 0.1; sc.far = size * 4;
    sc.updateProjectionMatrix();

    // Floors, one per room, tappable.
    // Wood in living rooms and bedrooms, tiles in wet rooms and the hall (from the room name), tinted by its colour
    const floorMats = new Map();
    for (const room of level.rooms) {
      const color = room.color || t.floor;
      const kind = core.floorKind(room.name);
      const key = `${color}|${kind}`;
      if (!floorMats.has(key)) {
        const tex = LOOK.floorTexture(kind, this.renderer);
        const m = mat(color, { roughness: kind === 'wood' ? 0.55 : kind === 'tiles' ? 0.35 : 0.92 });
        if (tex) {
          m.map = tex.clone();
          m.map.needsUpdate = true;
          m.map.repeat.set(1 / tex.userData.size, 1 / tex.userData.size);
          // the texture is light grey: lift the colour so the floor keeps its chosen tone
          m.color.offsetHSL(0, 0, 0.08);
        }
        floorMats.set(key, m);
      }
      // A picture of the floor repeats at its real size, turned and shifted as chosen
      const fimg = core.floorImageOf(room);
      let floorMat = floorMats.get(key);
      let uvOf = null;
      if (fimg) {
        const rad = (fimg.rot * Math.PI) / 180; const cs = Math.cos(rad); const sn = Math.sin(rad);
        uvOf = (xm, ym) => {
          const x = xm / CM; const y = ym / CM;
          return [(x * cs + y * sn - fimg.ox) / fimg.w, 1 - (-x * sn + y * cs - fimg.oy) / fimg.h];
        };
        floorMat = mat(t.night ? '#a6a6a6' : '#ffffff', { roughness: 0.7, map: pictureTexture(fimg.src, () => this.request()) });
      }
      const floor = new THREE.Mesh(shapeGeometry(room.points, 0, uvOf), floorMat);
      floor.receiveShadow = true;
      floor.userData.pick = { kind: 'room', id: room.id };
      this.root.add(floor);
    }

    // Walls in pieces around doors and windows; the top is a lighter cap.
    const wallMat = mat(t.wall, { roughness: 0.95, map: LOOK.plasterTexture(this.renderer) });
    const skirtMat = mat(t.night ? '#cfcfcc' : '#ffffff', { roughness: 0.6 });
    const capMat = mat(t.wallTop, { roughness: 0.9 });
    const mats = [wallMat, wallMat, capMat, wallMat, wallMat, wallMat];
    // A free wall can be a fence or a glass balustrade
    const styled = {
      fence: mat(t.night ? '#6e5a48' : '#9a7350', { roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: '#cfe3ee', roughness: 0.08, metalness: 0.1 }),
    };
    // The outside of outer walls in the facade of the house view (brick or plaster)
    const hs = window.HouseCore ? window.HouseCore.settings(plan) : { facade: 'brick', roofColor: 'anthracite' };
    const facade = LOOK.textures(this.renderer, hs.facade, hs.roofColor, t.night);
    const levelWalls = core.levelWalls(level);
    // Under a sloping roof the tops of the walls follow the ceiling; a wall then goes in parts, each with a straight top.
    const sloped = !!core.slopeOf(level);
    const roofBox = sloped ? core.slopeBox(level) : null;
    // A window or door in a low knee wall fits under the roof: lower, or (no room left) not there at all
    // Only doors and windows that stand in a wall (one a little off moves onto the nearest wall)
    const fitted = core.fitOpenings(level);
    const openings = !sloped ? fitted : fitted.map((o) => {
      if (o.type !== 'window' && o.type !== 'door') return o;
      const u = [Math.cos(o.angle || 0), Math.sin(o.angle || 0)]; const half = (o.width || 90) / 2;
      const room = core.wallTop(level, core.geom.sub([o.x, o.y], core.geom.mul(u, half)), core.geom.add([o.x, o.y], core.geom.mul(u, half)), level.wallThickness || 12, roofBox)
        .reduce((m, p) => Math.min(m, p[1]), Infinity) - 10;
      if (o.type === 'door') {
        const h = o.height || core.DEFAULTS.doorHeight;
        return h <= room ? o : room >= 150 ? Object.assign({}, o, { height: room }) : null;
      }
      const top = o.top || core.DEFAULTS.windowTop;
      if (top <= room) return o;
      const sill = Math.min(o.sill != null ? o.sill : core.DEFAULTS.windowSill, room - 40);
      return room - sill >= 30 && sill >= 0 ? Object.assign({}, o, { top: room, sill }) : null;
    }).filter(Boolean);
    for (const wall of levelWalls) {
      for (const piece of core.wallPieces(wall, openings, level, true)) {
        const u = core.geom.norm(core.geom.sub(piece.b, piece.a));
        const ext0 = piece.capA ? wall.t / 2 : 0; const ext1 = piece.capB ? wall.t / 2 : 0;
        const pa = core.geom.sub(piece.a, core.geom.mul(u, ext0));
        const pb = core.geom.add(piece.b, core.geom.mul(u, ext1));
        const n = [-u[1], u[0]];
        // Which side is outside the house, for the facade and the cut-away of walls in front of the camera.
        const outside = core.wallOutside(piece.a, piece.b, wall.t, level, levelWalls);
        const parts = [];
        if (!sloped) parts.push({ a: pa, b: pb, t0: piece.z1, t1: piece.z1 });
        else {
          const top = core.wallTop(level, pa, pb, wall.t, roofBox);
          for (let i = 0; i + 1 < top.length; i++) {
            let [s0, h0] = top[i]; let [s1, h1] = top[i + 1];
            h0 = Math.min(piece.z1, h0); h1 = Math.min(piece.z1, h1);
            const low = piece.z0 + 1;
            if (h0 < low && h1 < low) continue; // above the roof
            // cut off where the roof comes below the bottom of the piece (a lintel by the eaves)
            if (h0 < low) { s0 += ((low - h0) / (h1 - h0)) * (s1 - s0); h0 = low; }
            if (h1 < low) { s1 = s0 + ((low - h0) / (h1 - h0)) * (s1 - s0); h1 = low; }
            parts.push({ a: core.geom.add(pa, core.geom.mul(u, s0)), b: core.geom.add(pa, core.geom.mul(u, s1)), t0: h0, t1: h1 });
          }
        }
        for (const part of parts) {
          const a = part.a; const bb = part.b;
          const len = core.geom.dist(a, bb) * CM;
          const hgt = (Math.max(part.t0, part.t1) - piece.z0) * CM;
          if (len < 0.005 || hgt < 0.005) continue;
          // Own materials per piece, so each can fade on its own when the camera moves.
          const own = styled[wall.style] ? mats.map(() => styled[wall.style].clone()) : mats.map((m) => m.clone());
          const mid = core.geom.mul(core.geom.add(a, bb), 0.5);
          if (outside && !styled[wall.style]) {
            const brick = new THREE.MeshStandardMaterial({ map: facade.wall.clone(), roughness: 0.92, color: t.night ? '#8f8f8f' : '#ffffff' });
            brick.map.needsUpdate = true;
            brick.map.repeat.set(len / facade.wallSize[0], hgt / facade.wallSize[1]);
            brick.map.offset.set(((a[0] + a[1]) * CM) / facade.wallSize[0] % 1, (piece.z0 * CM) / facade.wallSize[1] % 1);
            own[outside > 0 ? 4 : 5] = brick;
          }
          // The paint of the room on each inside face: a colour or a picture at its real size, and bands over it
          const painted = [];
          for (const side of [1, -1]) {
            if (side === outside || styled[wall.style]) continue;
            const probe = core.geom.add(mid, core.geom.mul(n, side * (wall.t / 2 + 25)));
            const room = (level.rooms || []).find((r) => r.paint && core.geom.pointInPolygon(probe, r.points));
            const paint = room ? core.paintOf(room, core.roomEdgeNear(room, mid, wall.t / 2 + 6)) : null;
            if (!paint) continue;
            // the left end of the face, as seen from this side of the wall, measured along the wall
            const along = core.geom.dot(core.geom.sub(side > 0 ? a : bb, wall.a), u);
            const face = side > 0 ? 4 : 5;
            const dim = t.night ? 0.8 : 1;
            if (paint.color || paint.image) {
              const m = own[face];
              if (paint.image) {
                m.map = this.wallPicture(paint.image, len, hgt, along, piece.z0);
                m.color.set('#ffffff').multiplyScalar(dim);
              } else m.color.set(paint.color).multiplyScalar(dim);
              m.needsUpdate = true;
            }
            if (paint.bands.length) painted.push({ side, bands: paint.bands, along });
          }
          const geo = new THREE.BoxGeometry(len, hgt, wall.t * CM);
          if (part.t0 !== part.t1) {
            // a sloping top: the top corners at each end go down to the ceiling there
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              if (pos.getY(i) <= 0) continue;
              pos.setY(i, ((pos.getX(i) < 0 ? part.t0 : part.t1) - piece.z0) * CM - hgt / 2);
            }
            geo.computeVertexNormals();
          }
          const mesh = new THREE.Mesh(geo, own);
          mesh.position.set(mid[0] * CM, piece.z0 * CM + hgt / 2, mid[1] * CM);
          mesh.rotation.y = -Math.atan2(u[1], u[0]);
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.wall = true;
          const bandMats = [];
          for (const p of painted) bandMats.push(...this.paintBands(mesh, p, { len, hgt, thick: wall.t * CM, z0: piece.z0, top: Math.min(part.t0, part.t1), night: t.night }));
          // a soft dark edge on the floor beside the wall, and skirting boards on both sides at floor level;
          // they stay when the wall is lowered for the view
          if (piece.z0 <= 1 && len > 0.2) {
            for (const side of [1, -1]) {
              if (side === outside) continue;
              const edge = LOOK.floorEdge(len, 0.34, t.night ? 0.3 : 0.16);
              edge.position.set((mid[0] + n[0] * side * (wall.t / 2 + 17)) * CM, 0.006, (mid[1] + n[1] * side * (wall.t / 2 + 17)) * CM);
              edge.rotation.z = Math.atan2(u[1], u[0]) + (side > 0 ? Math.PI : 0);
              this.root.add(edge);
            }
            const skirt = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.07, wall.t * CM + 0.024), skirtMat);
            skirt.position.set(mid[0] * CM, 0.035, mid[1] * CM);
            skirt.rotation.y = mesh.rotation.y;
            skirt.receiveShadow = true;
            this.root.add(skirt);
          }
          this.root.add(mesh);
          this.walls.push({ mesh, mats: own.concat(bandMats), a, b: bb, u, len, decals: [], z0: piece.z0 * CM, h: hgt, nx: n[0] * outside, nz: n[1] * outside, exterior: outside !== 0, cur: hgt, target: hgt, alpha: 1, alphaTarget: 1, see: wall.style === 'glass' ? 0.35 : 1 });
        }
      }
    }

    // Doors, windows and their blinds.
    for (const o of openings) this.buildOpening(o, t);

    // Furniture and lamps.
    for (const item of level.items) {
      if (item.kind === 'furniture' && showFurniture) this.buildFurniture(item, t);
      if (item.kind === 'device') this.buildDevice(item, t);
      if (item.kind === 'decal') this.buildDecal(item, t);
    }

    // Room labels.
    for (const room of level.rooms) {
      if (!core.showsLabel(room)) continue;
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

  // A picture on a wall face at its real size: the face is len x hgt metres, starts `along` cm from the start of the wall
  // and z0 cm above the floor; the pattern shifts by the image's own ox and oy.
  wallPicture(image, len, hgt, along, z0) {
    const tex = pictureTexture(image.src, () => this.request());
    tex.repeat.set(len / (image.w * CM), hgt / (image.h * CM));
    tex.offset.set((along - image.ox) / image.w, (z0 - image.oy) / image.h);
    return tex;
  }

  // The bands of paint over a wall face (a painted wainscot, a frieze): flat panels just in front of it, as children of the
  // wall piece so they sink and fade with it. Returns their materials.
  paintBands(mesh, p, d) {
    const mats = [];
    for (const b of p.bands) {
      const lo = Math.max(b.from, d.z0); const hi = Math.min(b.to, d.top);
      if (hi - lo < 0.5) continue;
      const hM = (hi - lo) * CM;
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      if (b.image) {
        m.map = this.wallPicture(b.image, d.len, hM, p.along, lo);
        if (d.night) m.color.multiplyScalar(0.8);
      } else {
        m.color.set(b.color);
        if (d.night) m.color.multiplyScalar(0.8);
      }
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(d.len, hM), m);
      plane.position.set(0, ((lo + hi) / 2 - d.z0) * CM - d.hgt / 2, p.side * (d.thick / 2 + 0.0008));
      if (p.side < 0) plane.rotation.y = Math.PI;
      plane.receiveShadow = true;
      mesh.add(plane);
      mats.push(m);
    }
    return mats;
  }

  // A decal: a picture or coloured area of a real size, flat on the floor or hanging against a wall.
  buildDecal(item, t) {
    const dec = core.decalOf(item);
    if (!dec) return;
    const w = Math.max(1, item.w || 100) * CM;
    const h = Math.max(1, (dec.wall ? item.h : item.d) || 100) * CM;
    const m = new THREE.MeshStandardMaterial({
      color: dec.src ? (t.night ? '#b8b8b8' : '#ffffff') : new THREE.Color(dec.color).multiplyScalar(t.night ? 0.8 : 1),
      roughness: 0.85, transparent: true, opacity: dec.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    if (dec.src) m.map = pictureTexture(dec.src, () => this.request());
    const mesh = dec.round ? new THREE.Mesh(new THREE.CircleGeometry(1, 64), m) : new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    if (dec.round) mesh.scale.set(w / 2, h / 2, 1);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    const holder = new THREE.Group();
    this.placeItem(holder, { x: item.x, y: item.y, z: 0, rot: item.rot });
    if (dec.wall) {
      // the picture hangs on the wall, its back against the face; the item's depth is the gap to the wall's middle
      mesh.position.set(0, ((item.z || 0) * CM) + h / 2, -((item.d || 2) * CM) / 2 + 0.0008);
    } else {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.004 + (item.z || 0) * CM;
    }
    holder.add(mesh);
    if (this.hooks.editing) holder.userData.pick = { kind: 'item', id: item.id };
    this.root.add(holder);
    if (dec.wall) {
      // it goes with the wall it hangs on when that is lowered for the view
      let best = null;
      for (const e of this.walls) {
        const pr = core.geom.projectOnSegment([item.x, item.y], e.a, e.b);
        if (pr.d < 40 && (!best || pr.d < best.d)) best = { e, d: pr.d };
      }
      if (best) best.e.decals.push(holder);
    }
  }

  buildOpening(o, t) {
    if (o.type === 'passage') return; // nothing stands there
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
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, top - sill - 0.08, 0.01), new THREE.MeshPhysicalMaterial({ color: t.glass, transparent: true, opacity: 0.3, roughness: 0.03, metalness: 0, envMapIntensity: 1.5 }));
      glass.position.y = sill + (top - sill) / 2;
      group.add(glass);
      const frameMat = mat(t.night ? '#c9c9c6' : '#f7f7f5', { roughness: 0.5 });
      for (const y of [sill + 0.03, top - 0.03]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, thick * 0.5), frameMat);
        bar.position.y = y; group.add(bar);
      }
      for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, top - sill, thick * 0.5), frameMat);
        post.position.set(x, sill + (top - sill) / 2, 0); group.add(post);
      }
      if (w > 1.2) {
        const mid = new THREE.Mesh(new THREE.BoxGeometry(0.05, top - sill, thick * 0.4), frameMat);
        mid.position.y = sill + (top - sill) / 2; group.add(mid);
      }
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.025, thick + 0.06), mat(t.night ? '#9a9a98' : '#e9e7e3', { roughness: 0.6 }));
      ledge.position.y = sill - 0.012; ledge.castShadow = true; group.add(ledge);
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
      const side = (o.hinge || 1) > 0 ? 1 : -1;
      const leafMat = mat(o.color || t.door, { roughness: 0.55 });
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, dh - 0.02, 0.04), leafMat);
      leaf.position.set(side * (w / 2), dh / 2, 0);
      leaf.castShadow = true;
      // two raised panels on each face, and a handle on both sides
      const panelMat = leafMat.clone();
      panelMat.color.offsetHSL(0, 0, 0.04);
      for (const f of [1, -1]) {
        for (const [py, ph] of [[dh * 0.72, dh * 0.36], [dh * 0.27, dh * 0.4]]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, ph, 0.012), panelMat);
          panel.position.set(side * (w / 2), py, f * 0.024);
          pivot.add(panel);
        }
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), mat('#9ea3a9', { roughness: 0.3, metalness: 0.8 }));
        handle.position.set(side * (w - 0.1), 1.02, f * 0.04);
        pivot.add(handle);
      }
      pivot.add(leaf);
      group.add(pivot);
      // the frame around the opening
      const frameMat = mat(t.night ? '#c9c9c6' : '#f7f7f5', { roughness: 0.5 });
      for (const x of [-w / 2 - 0.02, w / 2 + 0.02]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, dh, thick + 0.03), frameMat);
        post.position.set(x, dh / 2, 0); group.add(post);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, 0.05, thick + 0.03), frameMat);
      lintel.position.y = dh + 0.025; group.add(lintel);
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
    if (entry && entry.parts === 'table_round') {
      holder.add(roundTable(item, item.color || (entry.colors && entry.colors[0]) || '#edbc7c'));
    } else if (entry && entry.build === 'cabinet') {
      holder.add(buildCabinet(item));
    } else if (entry && entry.build === 'car') {
      holder.add(buildCar(item));
    } else if (entry && entry.file) {
      loadModel(entry.file).then((model) => {
        const fitted = fitModel(model, entry, item.w, item.d, item.h);
        const slots = [0, 1, 2, 3, 4, 5].map((k) => core.slotColor(item, k));
        if (slots.some(Boolean) || core.finishOf(item)) recolor(fitted, slots, core.finishOf(item));
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
        const lamp = entry.light ? this.registerLamp(item, holder, null, bulbLocal, entry) : null;
        loadModel(entry.file).then((model) => {
          const fitted = fitModel(model, entry, w, d, h);
          if (mount === 'ceiling') fitted.position.y = -h * CM;
          // The lamp's own light parts glow: the lightest material in the model.
          const glowMats = [];
          if (lamp) fitted.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            const c = o.material.color; const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
            if (lum > 0.55 || /lamp|light|glass/i.test(o.material.name || '')) glowMats.push(o.material);
          });
          holder.add(fitted);
          if (lamp) { lamp.glowMats = glowMats; this.updateLamp(lamp); }
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
    if (disp.tv) {
      const on = core.isOn(dev);
      if (disp.key === on) return;
      disp.key = on;
      disp.tv.emissive.set(on ? '#7fa6dc' : '#000000');
      disp.tv.emissiveIntensity = on ? 0.85 : 0;
      return;
    }
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
    this.removeGizmo();
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
      // Height only for furniture standing on something; devices and ceiling pieces keep theirs.
      const lift = item.kind === 'furniture' && !(entry && entry.mount === 'ceiling');
      if (holder && this.hooks.drag) this.addGizmo(holder, obj ? obj.position.y - holder.position.y : 0.15, lift);
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

  // Editor: three arrows on the selected piece. Dragging an arrow moves the piece along that axis only:
  // red left-right, blue front-back, green up-down. Drawn on top and kept the same size on screen.
  addGizmo(holder, up, lift) {
    const g = new THREE.Group();
    g.position.copy(holder.position);
    g.position.y += up;
    const axes = [['x', '#e5484d', [0, 0, -Math.PI / 2]], ['z', '#2e5bff', [Math.PI / 2, 0, 0]]];
    if (lift) axes.push(['y', '#30a46c', [0, 0, 0]]);
    for (const [axis, color, rot] of axes) {
      const arrow = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), mat);
      shaft.position.y = 0.4;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 16), mat);
      head.position.y = 0.9;
      // A thicker, invisible grip so the arrow is easy to catch.
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.05, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      grip.position.y = 0.5;
      for (const m of [shaft, head, grip]) { m.renderOrder = 30; m.userData.axis = axis; arrow.add(m); }
      arrow.rotation.set(rot[0], rot[1], rot[2]);
      g.add(arrow);
    }
    this.gizmo = g;
    this.scene.add(g);
  }

  removeGizmo() {
    if (!this.gizmo) return;
    this.scene.remove(this.gizmo);
    this.gizmo.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.gizmo = null;
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
    // Where along the line origin + t * dir the pointer ray passes closest (null when they run parallel).
    const alongAxis = (origin, dir) => {
      const w0 = new THREE.Vector3().subVectors(origin, ray.ray.origin);
      const b = dir.dot(ray.ray.direction); const d = dir.dot(w0); const e = ray.ray.direction.dot(w0);
      const denom = 1 - b * b;
      return Math.abs(denom) < 1e-4 ? null : (b * e - d) / denom;
    };
    // Capture on the container, so the camera controls do not start turning when a piece is grabbed.
    this.el.addEventListener('pointerdown', (ev) => {
      if (!this.selectedId || ev.button !== 0) return;
      if (this.gizmo && !(ev.target.closest && ev.target.closest('.fp3-dev, .fp3-room'))) {
        aim(ev);
        const hit = ray.intersectObjects(this.gizmo.children, true)[0];
        const grabbed = hit && this.holderOf(this.selectedId);
        if (grabbed) {
          const axis = hit.object.userData.axis;
          const dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
          const origin = grabbed.position.clone();
          const t0 = alongAxis(origin, dir);
          if (t0 == null) return;
          drag = { holder: grabbed, id: this.selectedId, axis, dir, origin, t0, moved: false, x: ev.clientX, y: ev.clientY };
          this.controls.enabled = false;
          ev.stopPropagation();
          return;
        }
      }
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
      let to;
      if (drag.axis) {
        aim(ev);
        const t = alongAxis(drag.origin, drag.dir);
        if (t == null) return;
        const p = drag.origin.clone().addScaledVector(drag.dir, t - drag.t0);
        to = drag.axis === 'y'
          ? this.hooks.drag(drag.id, drag.origin.x / CM, drag.origin.z / CM, !drag.moved, Math.max(0, p.y / CM))
          : this.hooks.drag(drag.id, p.x / CM, p.z / CM, !drag.moved);
        to = to || { x: p.x / CM, y: p.z / CM };
      } else {
        const p = onPlane(ev, drag.holder.position.y);
        if (!p) return;
        p.add(drag.offset);
        to = this.hooks.drag(drag.id, p.x / CM, p.z / CM, !drag.moved) || { x: p.x / CM, y: p.z / CM };
      }
      drag.moved = true;
      const dx = to.x * CM - drag.holder.position.x; const dz = to.y * CM - drag.holder.position.z;
      const dy = to.z != null ? to.z * CM - drag.holder.position.y : 0;
      const follow = [drag.holder, this.selBox, this.gizmo, ...this.badges.filter((b) => b.item.id === drag.id).map((b) => b.obj)];
      for (const o of follow) if (o) { o.position.x += dx; o.position.y += dy; o.position.z += dz; }
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
    this.setAmbient();
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
      const alarm = dev && core.ALARM_CAPS.some((c) => dev.caps[c] === true);
      const motion = dev && dev.caps.alarm_motion === true;
      const value = this.values && b.item.showValue !== false ? core.deviceValueText(dev, dev && shownByRoom.get(dev.id)) : null;
      const glyph = core.GLYPHS[b.kind] || core.GLYPHS.other;
      const color = b.kind === 'light' && on ? core.lightColor(dev) : null;
      b.el.className = `fp3-dev${b.kind === 'light' ? ' is-light' : ''}${on ? ' on' : ''}${alarm ? ' alarm' : ''}${motion ? ' motion' : ''}${dev && !dev.available ? ' off' : ''}${b.behind ? ' behind' : ''}${b.item.id === this.selectedId ? ' sel' : ''}`;
      b.el.style.setProperty('--dev', color || '');
      const name = this.names === 'devices' || this.names === 'all' ? (b.item.label || (dev && dev.name) || '') : '';
      // Only what changed is drawn again. What the tidy-up hid stays hidden until the next one, or a live update
      // of any device would flash every hidden value and name.
      const html = `<span class="fp3-dot"><svg viewBox="0 0 24 24"><path d="${glyph}"/></svg></span>${value ? `<span class="fp3-val">${esc(value)}</span>` : ''}${name ? `<span class="fp3-name">${esc(name)}</span>` : ''}`;
      if (b.html === html) continue;
      b.html = html;
      b.el.innerHTML = html;
      const tag = this.shownNames && b.el.querySelector('.fp3-name');
      if (tag && !this.shownNames.has(b.item.id)) tag.style.visibility = 'hidden';
      const val = this.shownVals && b.el.querySelector('.fp3-val');
      if (val && !this.shownVals.has(b.item.id)) val.style.visibility = 'hidden';
    }
    for (const l of this.roomLabels) {
      const vals = labels.get(l).values;
      const html = `<b>${esc(l.room.name)}</b>${vals.length ? `<span>${esc(vals.join(' '))}</span>` : ''}`;
      if (l.html !== html) { l.html = html; l.el.innerHTML = html; }
    }
    void pal;
    this.request();
  }

  updateLamp(lamp) {
    const dev = this.devices.get(lamp.item.deviceId);
    lamp.target = core.lightIntensity ? core.lightIntensity(dev) : (core.isOn(dev) ? 1 : 0);
    if (lamp.target > 0) lamp.color = core.lightColor(dev); // going off it keeps its colour
    if (lamp.shown == null || !LAMP_FADE) lamp.shown = lamp.target;
    this.drawLamp(lamp);
  }

  // A step of every lamp towards what it should be; true while one is still changing.
  stepLamps() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lampTime || now)) / 1000);
    this.lampTime = now;
    let busy = false;
    for (const lamp of this.lamps) {
      if (lamp.shown === lamp.target) continue;
      const step = dt / LAMP_FADE;
      lamp.shown = lamp.shown < lamp.target ? Math.min(lamp.target, lamp.shown + step) : Math.max(lamp.target, lamp.shown - step);
      this.drawLamp(lamp);
      busy = true;
    }
    if (!busy) this.lampTime = 0;
    return busy;
  }

  drawLamp(lamp) {
    const intensity = lamp.shown;
    const on = intensity > 0;
    const color = on ? lamp.color : '#fff7e8';
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
      lamp.light = new THREE.PointLight(color, 1, reach * 1.4, 1.6 + 10 * this.lampRoom(lamp.item));
      lamp.light.position.copy(lamp.bulbLocal);
      lamp.holder.add(lamp.light);
      lamp.glow = this.makeGlow(lamp);
    }
    if (lamp.light) {
      lamp.light.visible = on;
      lamp.light.color.set(color);
      lamp.light.intensity = (this.theme.night ? 2.6 : 1.2) * intensity * (reach * reach);
    }
    if (on && !lamp.shine) {
      lamp.shine = LOOK.lightGlow(0.9, color, 0.5);
      lamp.shine.position.copy(lamp.bulbLocal);
      lamp.holder.add(lamp.shine);
    }
    if (lamp.shine) {
      lamp.shine.visible = on;
      lamp.shine.material.color.set(color);
      lamp.shine.material.opacity = (this.theme.night ? 0.5 : 0.12) * intensity;
    }
    if (lamp.glow) {
      lamp.glow.visible = on;
      lamp.glow.material.color.set(color);
      lamp.glow.material.opacity = (this.theme.night ? 0.55 : 0.22) * intensity;
    }
  }

  // At night with no lamp on in this storey the moon alone would leave it black: enough soft light to see the rooms by.
  setAmbient() {
    const t = this.theme;
    const dark = t.night && !this.lamps.some((l) => l.light && l.light.visible);
    this.hemi.intensity = t.hemi * (dark ? 2.1 : 1);
    this.sun.intensity = t.sun * (dark ? 2.4 : 1);
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
      const open = core.openState(linked) === true;
      entry.pivot.rotation.y = open ? ((entry.o.swing || 1) * ((entry.o.hinge || 1) > 0 ? -1 : 1)) * Math.PI / 2 * 0.95 : 0;
    }
  }

  /* ------------------------------------------------------------ camera */

  // Flies in on a room and keeps it beside a card that covers the given pixels on the right. leaveRoom flies back.
  focusRoom(room, shift) {
    const xs = room.points.map((p) => p[0] * CM); const zs = room.points.map((p) => p[1] * CM);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const z0 = Math.min(...zs); const z1 = Math.max(...zs);
    const target = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const around = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).setY(0);
    if (around.lengthSq() < 1e-6) around.set(1, 0, 1);
    around.normalize();
    const w = this.el.clientWidth || 1; const h = this.el.clientHeight || 1;
    const aspect = Math.max(0.5, (w - (shift || 0)) / h);
    const size = Math.max(Math.max(x1 - x0, z1 - z0) * 1.25, 2.5);
    const dist = (size / (2 * Math.tan(THREE.MathUtils.degToRad(16)))) * Math.max(1, 1.1 / aspect);
    const el = THREE.MathUtils.degToRad(60);
    const position = target.clone().addScaledVector(around, Math.cos(el) * dist).setY(Math.sin(el) * dist);
    if (!this.home) this.home = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this.flyTo(position, target, shift || 0);
  }

  leaveRoom() {
    if (!this.home) return;
    this.flyTo(this.home.position, this.home.target, 0);
    this.home = null;
  }

  flyTo(position, target, shift) {
    this.flight = { start: performance.now(), from: { position: this.camera.position.clone(), target: this.controls.target.clone(), shift: this.shift || 0 }, to: { position, target, shift } };
    if (!LAMP_FADE) this.flight.start = -1e9;
    this.request();
  }

  // A step of the flight; true while it goes on.
  stepFlight() {
    const f = this.flight;
    if (!f) return false;
    const t = Math.min(1, (performance.now() - f.start) / 700);
    const e = t * t * (3 - 2 * t);
    this.camera.position.lerpVectors(f.from.position, f.to.position, e);
    this.controls.target.lerpVectors(f.from.target, f.to.target, e);
    this.setShift(f.from.shift + (f.to.shift - f.from.shift) * e);
    this.controls.update();
    this.updateCutaway();
    if (t >= 1) this.flight = null;
    return t < 1;
  }

  resetCamera(turn) {
    this.flight = null; this.home = null;
    this.setShift(0);
    const { cx, cz, size } = this.bounds;
    const az = THREE.MathUtils.degToRad(45 + 90 * (Number(turn) || 0));
    const el = THREE.MathUtils.degToRad(42);
    const aspect = this.camera.aspect || 1.4;
    const dist = size * 1.8 * Math.max(1, 1.45 / aspect);
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
      if (behind !== b.behind) {
        b.behind = behind;
        b.el.classList.toggle('behind', behind);
        // Out from behind a wall: its name waits for the next tidy-up instead of showing at once.
        const tag = !behind && b.el.querySelector('.fp3-name');
        if (tag && this.shownNames) { tag.style.visibility = 'hidden'; this.shownNames.delete(b.item.id); }
      }
    }
  }

  // With many devices close together their name tags pile up. Once the view stands still, a name that
  // would cover another name, a device or a room label is hidden; lit lamps and devices nearer the
  // front keep theirs first. Markers and values always stay.
  declutterNames() {
    if (!this.badges || !this.badges.length) return;
    const tags = [];
    for (const b of this.badges) {
      const name = b.el.querySelector('.fp3-name');
      if (!name) continue;
      name.style.visibility = '';
      if (!b.behind) tags.push({ b, name });
    }
    const hit = (a, r) => a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom;
    // What a name must keep clear of, with its owner: a name never collides with its own badge.
    const taken = [];
    const dots = [];
    for (const b of this.badges) {
      if (b.behind) continue;
      for (const el of b.el.querySelectorAll('.fp3-dot')) dots.push({ r: el.getBoundingClientRect(), id: b.item.id });
    }
    taken.push(...dots);
    // Room labels step aside for the lamps and sensors, which must stay tappable
    for (const l of this.roomLabels) {
      const box = l.el.getBoundingClientRect();
      const was = l.shift || [0, 0];
      const base = { left: box.left - was[0], right: box.right - was[0], top: box.top - was[1], bottom: box.bottom - was[1] };
      const w = box.width + 6; const h = box.height + 6;
      const spots = [was, [0, 0], [0, -h], [0, h], [-w, 0], [w, 0], [-w, -h], [w, -h], [-w, h], [w, h]];
      const at = (s) => ({ left: base.left + s[0], right: base.right + s[0], top: base.top + s[1], bottom: base.bottom + s[1] });
      const free = (s) => !dots.some((o) => hit(at(s), o.r)) && !taken.some((o) => o.id === null && hit(at(s), o.r));
      const spot = spots.find(free) || [0, 0];
      l.shift = spot;
      l.el.style.translate = spot[0] || spot[1] ? `${Math.round(spot[0])}px ${Math.round(spot[1])}px` : '';
      taken.push({ r: at(spot), id: null });
    }
    // A value beside a badge gives way as well: it comes back when you zoom in
    const shownVals = this.shownVals || new Set();
    const vals = [];
    for (const b of this.badges) {
      const val = b.el.querySelector('.fp3-val');
      if (!val) continue;
      val.style.visibility = '';
      if (!b.behind) vals.push({ b, val, r: val.getBoundingClientRect() });
    }
    vals.sort((x, y) => (shownVals.has(y.b.item.id) ? 1 : 0) - (shownVals.has(x.b.item.id) ? 1 : 0));
    const nextVals = new Set();
    for (const v of vals) {
      const m = shownVals.has(v.b.item.id) ? 3 : -3;
      const r = { left: v.r.left + m, right: v.r.right - m, top: v.r.top + m, bottom: v.r.bottom - m };
      if (taken.some((o) => o.id !== v.b.item.id && hit(r, o.r))) { v.val.style.visibility = 'hidden'; continue; }
      taken.push({ r: v.r, id: v.b.item.id });
      nextVals.add(v.b.item.id);
    }
    this.shownVals = nextVals;
    for (const t of tags) t.r = t.name.getBoundingClientRect();
    // Names that were showing go first and get a few pixels of slack, hidden ones need clear room:
    // a small turn of the camera or a value that changes width does not make names blink.
    const shown = this.shownNames || new Set();
    const was = (t) => (shown.has(t.b.item.id) ? 1 : 0);
    const lit = (t) => (t.b.el.classList.contains('on') ? 1 : 0);
    tags.sort((x, y) => was(y) - was(x) || lit(y) - lit(x) || y.r.bottom - x.r.bottom);
    const next = new Set();
    for (const t of tags) {
      const m = was(t) ? 4 : -4;
      const r = { left: t.r.left + m, right: t.r.right - m, top: t.r.top + m, bottom: t.r.bottom - m };
      if (taken.some((o) => o.id !== t.b.item.id && hit(r, o.r))) { t.name.style.visibility = 'hidden'; continue; }
      taken.push({ r: t.r, id: null });
      next.add(t.b.item.id);
    }
    this.shownNames = next;
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
      for (const dc of w.decals || []) dc.visible = w.mesh.visible && w.cur > w.h * 0.98;
      const fading = w.alpha * (w.see || 1) < 0.99;
      for (const m of w.mats) {
        if (m.transparent !== fading) { m.transparent = fading; m.needsUpdate = true; }
        m.opacity = w.alpha * (w.see || 1);
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
