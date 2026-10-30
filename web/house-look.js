/*
 * The look of the house view (house3d.js): textures drawn on a canvas (brick, roof tiles, grass, pavers, wood,
 * solar cells, a grille), a soft sky for reflections, and detailed parts: windows with frames and sills, a front
 * door, trees and hedges, a car. Nothing is downloaded; every texture is made in the browser.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* --------------------------------------------------------------- quality */

/**
 * Smooth edges: draws at twice the size of the screen, also on a plain monitor, and steps down when frames take too
 * long on this device (a wall tablet). Call frame(now) for frames of something moving.
 */
export class Sharpness {

  constructor(renderer, changed) {
    this.renderer = renderer;
    this.changed = changed;
    this.floor = Math.min(window.devicePixelRatio || 1, 1.25);
    this.ratio = 2;
    this.last = 0; this.sum = 0; this.count = 0;
    this.pause = 3000; // longer than this between frames: the page was away, not slow
    renderer.setPixelRatio(this.ratio);
  }

  set(ratio) {
    this.ratio = ratio;
    this.locked = true;
    this.renderer.setPixelRatio(ratio);
    this.changed();
  }

  frame(now) {
    const gap = now - this.last;
    this.last = now;
    if (this.locked || gap > this.pause || this.ratio <= this.floor) return;
    this.sum += gap; this.count += 1;
    if (this.count < 6 || this.sum < 1500) return;
    const average = this.sum / this.count;
    this.sum = 0; this.count = 0;
    if (average <= 62) return; // under 16 frames a second is too slow
    // very slow: at once to the plain size
    this.ratio = average > 200 ? this.floor : Math.max(this.floor, this.ratio - 0.5);
    this.renderer.setPixelRatio(this.ratio);
    this.changed();
  }

}

/* --------------------------------------------------------------- textures */

// A small seeded random, so the bricks look the same on every screen and after every rebuild.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, renderer, srgb) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  if (srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return `#${c.getHexString()}`;
};

// Dutch brick (waalformaat) in half-brick bond: 4 bricks across 0.88 m, 10 courses over 0.77 m.
export const BRICK_SIZE = [0.88, 0.77];
function brickCanvas(base, mortar, seed) {
  const W = 512; const H = 448;
  const [c, g] = canvas(W, H);
  const [b, bg] = canvas(W, H); // bump: mortar low, bricks high
  g.fillStyle = mortar; g.fillRect(0, 0, W, H);
  bg.fillStyle = '#404040'; bg.fillRect(0, 0, W, H);
  const r = rng(seed);
  const rows = 10; const cols = 4; const bh = H / rows; const bw = W / cols; const m = 5;
  for (let y = 0; y < rows; y++) {
    const off = y % 2 ? bw / 2 : 0;
    for (let x = -1; x <= cols; x++) {
      const px = x * bw + off; const py = y * bh;
      g.fillStyle = shade(base, (r() - 0.5) * 0.09);
      g.fillRect(px + m / 2, py + m / 2, bw - m, bh - m);
      // a little speckle and a darker lower edge
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
        g.fillRect(px + m / 2 + r() * (bw - m), py + m / 2 + r() * (bh - m), 3 + r() * 6, 2 + r() * 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(px + m / 2, py + bh - m / 2 - 3, bw - m, 3);
      bg.fillStyle = '#e0e0e0';
      bg.fillRect(px + m / 2, py + m / 2, bw - m, bh - m);
    }
  }
  return [c, b];
}

// Concrete roof tiles: 4 across 1.2 m, 3 rows over 0.99 m, each with the shadow of the row above.
export const TILE_SIZE = [1.2, 0.99];
function tileCanvas(base, seed) {
  const W = 512; const H = 424;
  const [c, g] = canvas(W, H);
  const [b, bg] = canvas(W, H);
  const r = rng(seed);
  const rows = 3; const cols = 4; const th = H / rows; const tw = W / cols;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * tw; const py = y * th;
      const grad = g.createLinearGradient(0, py, 0, py + th);
      const tone = shade(base, (r() - 0.5) * 0.05);
      grad.addColorStop(0, shade(tone, -0.06)); grad.addColorStop(0.75, tone); grad.addColorStop(1, shade(tone, 0.05));
      g.fillStyle = grad; g.fillRect(px, py, tw, th);
      // the rounded profile of a tile: two soft ridges
      for (const k of [0.25, 0.75]) {
        const gx = g.createLinearGradient(px + tw * (k - 0.25), 0, px + tw * (k + 0.25), 0);
        gx.addColorStop(0, 'rgba(0,0,0,0.10)'); gx.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gx.addColorStop(1, 'rgba(0,0,0,0.10)');
        g.fillStyle = gx; g.fillRect(px + tw * (k - 0.25), py, tw / 2, th);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, py, tw, 3); // shadow under the row above
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py, 2, th);
      const bgr = bg.createLinearGradient(0, py, 0, py + th);
      bgr.addColorStop(0, '#202020'); bgr.addColorStop(1, '#e0e0e0');
      bg.fillStyle = bgr; bg.fillRect(px, py, tw, th);
    }
  }
  return [c, b];
}

function noiseCanvas(base, spread, size, seed, blades) {
  const [c, g] = canvas(size, size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size / 18; i++) {
    g.fillStyle = shade(base, (r() - 0.5) * spread);
    if (blades) g.fillRect(r() * size, r() * size, 1.5, 3 + r() * 4);
    else g.fillRect(r() * size, r() * size, 2 + r() * 3, 2 + r() * 3);
  }
  return c;
}

// Concrete pavers 0.2 × 0.1 m in stretcher bond: 1 m square.
function paverCanvas(base, seed) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = shade(base, -0.12); g.fillRect(0, 0, S, S);
  const r = rng(seed);
  const rows = 10; const cols = 5; const h = S / rows; const w = S / cols;
  for (let y = 0; y < rows; y++) {
    for (let x = -1; x <= cols; x++) {
      g.fillStyle = shade(base, (r() - 0.5) * 0.08);
      g.fillRect(x * w + (y % 2 ? w / 2 : 0) + 2, y * h + 2, w - 4, h - 4);
    }
  }
  return c;
}

function woodCanvas(base, seed) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = shade(base, (r() - 0.5) * 0.08); g.fillRect(x, 0, 32, 256);
    for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x + r() * 30, 0, 1, 256); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 2, 256);
  }
  return c;
}

// One solar panel: 6 × 10 cells with thin silver lines, a frame around it.
function panelCanvas() {
  const W = 192; const H = 320;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#c7ccd3'; g.fillRect(0, 0, W, H);
  const pad = 6; const cw = (W - pad * 2) / 6; const ch = (H - pad * 2) / 10;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 6; x++) {
      const grad = g.createLinearGradient(0, pad + y * ch, 0, pad + (y + 1) * ch);
      grad.addColorStop(0, '#1b2a48'); grad.addColorStop(1, '#14203a');
      g.fillStyle = grad;
      g.fillRect(pad + x * cw + 1, pad + y * ch + 1, cw - 2, ch - 2);
      g.fillStyle = 'rgba(180,190,210,0.25)';
      g.fillRect(pad + x * cw + cw / 3, pad + y * ch + 1, 1, ch - 2);
      g.fillRect(pad + x * cw + (2 * cw) / 3, pad + y * ch + 1, 1, ch - 2);
    }
  }
  return c;
}

function grilleCanvas() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#d9dcdf'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) { g.fillStyle = '#9ea3a8'; g.fillRect(0, y, 128, 3); }
  return c;
}

export const FACADES = {
  brick: { base: '#9a4f37', mortar: '#cfc6bb' },
  darkbrick: { base: '#4b3a33', mortar: '#8f8880' },
  yellowbrick: { base: '#c9a46a', mortar: '#e3dccf' },
  plaster: { plaster: '#ece8e0' },
  darkplaster: { plaster: '#3f4348' }, // the lines of the power stand out on it
};
export const ROOFS = { anthracite: '#3c3f44', red: '#9a4a32', black: '#232427' };

/** All textures for a theme; cached per facade and roof colour. */
const cache = new Map();
export function textures(renderer, facade, roofColor, dark) {
  const key = [facade, roofColor, dark].join('|');
  if (cache.has(key)) return cache.get(key);
  const f = FACADES[facade] || FACADES.brick;
  const out = {};
  if (f.plaster) {
    out.wall = texture(noiseCanvas(f.plaster, 0.04, 256, 7), renderer);
    out.wallBump = null;
    out.wallSize = [2, 2];
  } else {
    const [c, b] = brickCanvas(f.base, f.mortar, 11);
    out.wall = texture(c, renderer);
    out.wallBump = texture(b, renderer, false);
    out.wallSize = BRICK_SIZE;
  }
  const [tc, tb] = tileCanvas(ROOFS[roofColor] || ROOFS.anthracite, 5);
  out.roof = texture(tc, renderer);
  out.roofBump = texture(tb, renderer, false);
  out.grass = texture(noiseCanvas(dark ? '#33402c' : '#7f9d5e', 0.12, 256, 3, true), renderer);
  out.pavers = texture(paverCanvas(dark ? '#5a5856' : '#b9b4ab', 9), renderer);
  out.wood = texture(woodCanvas('#8b6b4a', 4), renderer);
  out.panel = texture(panelCanvas(), renderer);
  out.grille = texture(grilleCanvas(), renderer);
  // smooth walls get a smooth plinth
  out.plinth = texture(f.plaster ? noiseCanvas(shade(f.plaster, -0.1), 0.04, 256, 23) : brickCanvas(shade(f.base, -0.12), f.mortar, 23)[0], renderer);
  cache.set(key, out);
  return out;
}

/* ------------------------------------------------------------ environment */

// A soft sky dome turned into an environment map, so glass, paint and metal reflect something.
export function environment(renderer, dark) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const top = new THREE.Color(dark ? '#1c2433' : '#9fc4ec'); const mid = new THREE.Color(dark ? '#2a2f38' : '#eef3f8'); const low = new THREE.Color(dark ? '#141414' : '#8a8f80');
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    const c = y > 0 ? mid.clone().lerp(top, Math.pow(y, 0.6)) : mid.clone().lerp(low, Math.min(1, -y * 3));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // a bright patch for the sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: dark ? '#556070' : '#fffaf0' }));
  sun.position.set(-20, 30, 20);
  scene.add(sun);
  const env = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  return env;
}

/* --------------------------------------------------------------- geometry */

/**
 * A flat polygon (points counter-clockwise seen from outside) with UVs in metres along its first edge,
 * divided by `size` (the width and height one texture covers).
 */
export function poly(pts, material, size) {
  const p = pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
  const u = p[1].clone().sub(p[0]).normalize();
  const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
  const v = n.clone().cross(u).normalize();
  const pos = []; const uv = [];
  const sz = size || [1, 1];
  const put = (q) => { pos.push(q.x, q.y, q.z); const d = q.clone().sub(p[0]); uv.push(d.dot(u) / sz[0], d.dot(v) / sz[1]); };
  for (let i = 1; i + 1 < p.length; i++) { put(p[0]); put(p[i]); put(p[i + 1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x || 0, (y || 0) + h / 2, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// A bar between two points (a gutter, a ridge cap, a beam).
export function bar(a, b, r, material, square) {
  const A = new THREE.Vector3(...a); const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const geo = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, 10);
  const m = new THREE.Mesh(geo, material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * A window in a wall: frame, glass, a sill underneath and a mullion when it is wide. The group's +z looks out
 * of the wall; place it on the wall face. Returns { group, glass }.
 */
export function windowPart(w, h, mats, opts) {
  const o = opts || {};
  const g = new THREE.Group();
  const f = 0.07; const depth = 0.08;
  // the dark reveal behind the frame makes the wall look thick
  const reveal = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, h + 0.06), mats.reveal);
  reveal.position.z = 0.002;
  g.add(reveal);
  g.add(box(w, f, depth, mats.frame, 0, h / 2 - f, 0.02), box(w, f, depth, mats.frame, 0, -h / 2, 0.02));
  g.add(box(f, h, depth, mats.frame, -w / 2 + f / 2, -h / 2, 0.02), box(f, h, depth, mats.frame, w / 2 - f / 2, -h / 2, 0.02));
  if (w > 1.0 && !o.door) g.add(box(f * 0.8, h, depth, mats.frame, 0, -h / 2, 0.02));
  if (h > 1.2 && !o.door) g.add(box(w, f * 0.7, depth, mats.frame, 0, h / 2 - h * 0.3, 0.02));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - f, h - f), mats.glass);
  glass.position.z = 0.01;
  g.add(glass);
  if (!o.door) {
    const sill = box(w + 0.16, 0.05, 0.14, mats.sill, 0, -h / 2 - 0.05, 0.05);
    g.add(sill);
  }
  return { group: g, glass };
}

/** A front door with a frame, a glass strip and a handle. */
export function doorPart(mats, color) {
  const g = new THREE.Group();
  const W = 1.0; const H = 2.25;
  g.add(box(W + 0.14, H + 0.07, 0.06, mats.frame, 0, 0, 0.01));
  const leaf = box(W - 0.06, H - 0.05, 0.06, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 }), 0, 0.02, 0.03);
  g.add(leaf);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, H * 0.7), mats.glass);
  strip.position.set(W * 0.22, H * 0.5, 0.065);
  g.add(strip);
  g.add(box(0.04, 0.3, 0.05, mats.metal, -W * 0.36, 0.95, 0.07));
  return g;
}

/** A soft round shape with a little unevenness, smooth to the eye (a bush, the crown of a tree). */
export function blob(radius, seed) {
  const base = new THREE.IcosahedronGeometry(radius, 4);
  base.deleteAttribute('uv'); base.deleteAttribute('normal');
  const geo = mergeVertices(base, 1e-4);
  const pos = geo.attributes.position;
  const a = seed * 1.7; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const bump = Math.sin(v.x * 4.1 + a) * Math.cos(v.y * 3.7 - a) + 0.5 * Math.sin(v.z * 7.3 + a * 2) * Math.sin(v.x * 6.1) + 0.3 * Math.cos(v.y * 11 + a);
    v.multiplyScalar(radius * (1 + 0.1 * bump));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// A soft round spot of light, white in the middle; tinted by the material.
let spot = null;
function spotTexture() {
  if (spot) return spot;
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.65, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  spot = new THREE.CanvasTexture(c);
  spot.colorSpace = THREE.SRGBColorSpace;
  return spot;
}

/** Light without a cost per lamp: added on top of what is behind it, for pools on the ground and a glow around a lamp. */
export function lightMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ map: spotTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
}

/** A pool of light on the ground around x, z. */
export function lightPool(x, z, w, d, material, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y === undefined ? 0.03 : y, z);
  m.renderOrder = 2;
  m.userData.light = true;
  return m;
}

/** A glow that always faces the camera. */
export function lightGlow(size, color, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spotTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.scale.set(size, size, 1);
  sprite.userData.light = true;
  return sprite;
}

/** A soft dark edge on the floor along a wall, where a room looks closed. */
let edgeTexture = null;
export function floorEdge(len, width, opacity) {
  if (!edgeTexture) {
    const [c, g] = canvas(4, 64);
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 64);
    edgeTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), new THREE.MeshBasicMaterial({ map: edgeTexture, color: '#000000', transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** A tree: a trunk and a crown of a few soft blobs. */
export function tree(scale, mats, seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.add(bar([0, 0, 0], [0, 2.2 * scale, 0], 0.12 * scale, mats.trunk));
  const n = 5;
  for (let i = 0; i < n; i++) {
    const s = (0.9 + r() * 0.6) * scale;
    const b = new THREE.Mesh(blob(s, seed + i * 2.3), i % 2 ? mats.leaves : mats.leaves2);
    b.position.set((r() - 0.5) * 1.6 * scale, (2.6 + r() * 1.3) * scale, (r() - 0.5) * 1.6 * scale);
    b.rotation.set(r() * 3, r() * 3, 0);
    b.castShadow = true; b.receiveShadow = true;
    g.add(b);
  }
  return g;
}

/** A trimmed hedge from a to b on the ground. */
export function hedge(a, b, h, mats) {
  const A = new THREE.Vector3(a[0], 0, a[1]); const B = new THREE.Vector3(b[0], 0, b[1]);
  const len = A.distanceTo(B);
  const base = new THREE.BoxGeometry(len, h, 0.7, Math.ceil(len * 3), 6, 4);
  base.deleteAttribute('uv'); base.deleteAttribute('normal');
  const geo = mergeVertices(base, 1e-4);
  const m = new THREE.Mesh(geo, mats.hedge);
  // rounded on top and a little uneven, so it does not look like a block
  const pos = geo.attributes.position;
  const s = Math.round(len * 13) % 17;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const f = (pos.getY(i) + h / 2) / h; // f: 0 at the ground, 1 on top
    const wave = Math.sin(x * 2.1 + s) * 0.5 + Math.sin(x * 5.3 + s * 2) * 0.3;
    pos.setXYZ(i, x, pos.getY(i) + (f > 0.5 ? wave * 0.05 : 0), pos.getZ(i) * (1 - 0.55 * f ** 5 + wave * 0.05));
  }
  geo.computeVertexNormals();
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.position.y = h / 2;
  m.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A hatchback car along z (front at +z), 4.3 m long, with glass, lights and wheels with rims. */
export function car(color, env) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0d1218', roughness: 0.05, metalness: 0.2, envMapIntensity: 1.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.8 });
  // side profile, extruded over the width with rounded edges
  const s = new THREE.Shape();
  s.moveTo(-2.15, 0.32); s.lineTo(-2.15, 0.78); s.quadraticCurveTo(-2.1, 0.98, -1.85, 1.02);
  s.lineTo(-1.55, 1.45); s.quadraticCurveTo(-1.4, 1.52, -1.1, 1.52); s.lineTo(0.45, 1.5);
  s.quadraticCurveTo(0.7, 1.48, 0.9, 1.3); s.lineTo(1.45, 0.98); s.quadraticCurveTo(2.1, 0.9, 2.15, 0.7);
  s.lineTo(2.15, 0.32); s.lineTo(-2.15, 0.32);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, steps: 1, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.81);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.rotation.y = -Math.PI / 2; // profile x becomes the car's length along z
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // windows: the greenhouse a little inset
  const w = new THREE.Shape();
  w.moveTo(-1.72, 1.06); w.lineTo(-1.5, 1.4); w.lineTo(0.42, 1.4); w.lineTo(0.82, 1.07); w.lineTo(-1.72, 1.06);
  const winGeo = new THREE.ExtrudeGeometry(w, { depth: 1.72, bevelEnabled: false });
  winGeo.translate(0, 0, -0.86);
  const win = new THREE.Mesh(winGeo, glass);
  win.rotation.y = -Math.PI / 2;
  g.add(win);
  // lights
  const head = new THREE.MeshStandardMaterial({ color: '#f4f6f8', emissive: '#fff6dd', emissiveIntensity: 0.2, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#8a1010', emissive: '#ff2020', emissiveIntensity: 0.25, roughness: 0.3 });
  for (const x of [-0.6, 0.6]) {
    g.add(box(0.42, 0.1, 0.04, head, x, 0.78, 2.2));
    g.add(box(0.36, 0.1, 0.04, tail, x, 0.86, -2.21));
  }
  g.add(box(1.7, 0.16, 0.06, dark, 0, 0.3, 2.19), box(1.7, 0.16, 0.06, dark, 0, 0.3, -2.2)); // bumpers
  // wheels
  const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24);
  const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.25, 16);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.8, roughness: 0.3 });
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
    const t = new THREE.Mesh(tire, dark); t.rotation.z = Math.PI / 2; t.position.set(x, 0.34, z); t.castShadow = true;
    const r = new THREE.Mesh(rim, rimMat); r.rotation.z = Math.PI / 2; r.position.set(x, 0.34, z);
    g.add(t, r);
  }
  return g;
}

/* ------------------------------------------------- floors and walls inside */

// Light grey patterns; the room's floor colour tints them (material colour × texture).
function planksCanvas(seed) {
  const W = 512; const H = 512;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const rows = 11; const h = H / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 300;
    while (x < W) {
      const len = 260 + r() * 300;
      const tone = 214 + Math.round((r() - 0.5) * 18);
      g.fillStyle = `rgb(${tone},${tone - 4},${tone - 10})`;
      g.fillRect(x, y * h, len, h);
      // grain
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(90,70,50,${0.03 + r() * 0.04})`;
        g.fillRect(x, y * h + r() * h, len, 1);
      }
      g.fillStyle = 'rgba(60,45,30,0.25)';
      g.fillRect(x, y * h, 2, h);
      x += len;
    }
    g.fillStyle = 'rgba(60,45,30,0.22)';
    g.fillRect(0, y * h, W, 1.5);
  }
  return c;
}

function tilesCanvas(seed, n) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#a9a9a9'; g.fillRect(0, 0, S, S);
  const r = rng(seed);
  const t = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const tone = 225 + Math.round((r() - 0.5) * 16);
      g.fillStyle = `rgb(${tone},${tone},${tone})`;
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
  return c;
}

const floorCache = new Map();
/** A floor texture for a room: 'wood' (planks, 1.6 m square), 'tiles' (60 cm), 'pavers' or 'plain'. */
export function floorTexture(kind, renderer) {
  if (floorCache.has(kind)) return floorCache.get(kind);
  let tex = null;
  if (kind === 'wood') tex = texture(planksCanvas(31), renderer);
  else if (kind === 'tiles') tex = texture(tilesCanvas(17, 4), renderer);
  else if (kind === 'pavers') tex = texture(paverCanvas('#d0d0d0', 21), renderer);
  if (tex) tex.userData.size = kind === 'wood' ? 2.2 : kind === 'tiles' ? 2.4 : 1;
  floorCache.set(kind, tex);
  return tex;
}

let plaster = null;
/** A faint plaster texture for inside walls (works at any size). */
export function plasterTexture(renderer) {
  if (!plaster) plaster = texture(noiseCanvas('#f2f2f2', 0.03, 256, 41), renderer);
  return plaster;
}
