'use strict';

/*
 * Reads the .glb furniture models and writes, per model, the base colours of its materials, biggest surface first, into
 * lib/shared/models.js (the MATERIALS table). The editor shows one colour field per material, so a sofa can have
 * a grey frame and a green cushion. Models with one texture (KayKit) have no separate materials and are left out.
 * Usage: node scripts/model-materials.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modelsFile = path.join(root, 'lib', 'shared', 'models.js');
const dir = path.join(root, 'web', 'models');

const COMPONENTS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.slice(binStart) };
}

function accessor(json, bin, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const size = COMPONENTS[a.componentType] * COUNTS[a.type];
  const stride = view.byteStride || size;
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const read = (i, c) => {
    const at = base + i * stride + c * COMPONENTS[a.componentType];
    switch (a.componentType) {
      case 5126: return bin.readFloatLE(at);
      case 5125: return bin.readUInt32LE(at);
      case 5123: return bin.readUInt16LE(at);
      case 5121: return bin.readUInt8(at);
      default: return 0;
    }
  };
  return { count: a.count, n: COUNTS[a.type], read };
}

const toHex = (lin) => {
  const srgb = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  return `#${lin.slice(0, 3).map((c) => srgb(Math.min(1, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
};

function materialsOf(file) {
  const { json, bin } = readGlb(file);
  const area = new Map();
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives) {
      if (prim.material == null || prim.attributes.POSITION == null) continue;
      const pos = accessor(json, bin, prim.attributes.POSITION);
      const idx = prim.indices != null ? accessor(json, bin, prim.indices) : null;
      const total = idx ? idx.count : pos.count;
      const at = (k) => (idx ? idx.read(k, 0) : k);
      let sum = 0;
      for (let k = 0; k + 2 < total; k += 3) {
        const v = [0, 1, 2].map((j) => [0, 1, 2].map((c) => pos.read(at(k + j), c)));
        const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
        const w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        sum += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
      }
      area.set(prim.material, (area.get(prim.material) || 0) + sum);
    }
  }
  const all = [...area.values()].reduce((s, v) => s + v, 0) || 1;
  return [...area.entries()]
    .filter(([m]) => !(json.materials[m].pbrMetallicRoughness || {}).baseColorTexture)
    .sort((x, y) => y[1] - x[1])
    .filter(([, v]) => v / all >= 0.003)
    .slice(0, 5)
    .map(([m]) => toHex((json.materials[m].pbrMetallicRoughness || {}).baseColorFactor || [0.8, 0.8, 0.8, 1]));
}

const table = {};
for (const pack of fs.readdirSync(dir)) {
  const sub = path.join(dir, pack);
  if (!fs.statSync(sub).isDirectory()) continue;
  const prefix = { kenney: 'k', kaykit: 'kk', quaternius: 'q' }[pack];
  if (!prefix) continue;
  for (const f of fs.readdirSync(sub).filter((x) => x.endsWith('.glb'))) {
    const list = materialsOf(path.join(sub, f));
    if (list.length >= 2) table[`${prefix}-${f.replace(/\.glb$/, '')}`] = list;
  }
}

let src = fs.readFileSync(modelsFile, 'utf8');
const line = `  const MATERIALS = ${JSON.stringify(table)};\n`;
if (/^ {2}const MATERIALS = .*\n/m.test(src)) src = src.replace(/^ {2}const MATERIALS = .*\n/m, () => line);
else src = src.replace(/^( {2}const COLORS = .*\n)/m, (m) => `${m}\n  // The base colours of the materials of each model, biggest surface first: the editor offers one colour field for each.\n${line}`);
fs.writeFileSync(modelsFile, src);
console.log(`${Object.keys(table).length} models with more than one material`);
