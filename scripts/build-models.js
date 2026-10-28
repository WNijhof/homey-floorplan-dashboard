'use strict';

/*
 * Converts the CC0 furniture packs into compact .glb files under web/models/<pack>/.
 *  - Kenney Furniture Pack: OBJ + MTL (flat colours)   https://kenney.nl  (also on opengameart.org)
 *  - KayKit Furniture Bits: glTF + bin + one texture   https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0
 * No dependencies. Usage:
 *   node scripts/build-models.js --kenney=<dir with Models/*.obj> --kaykit=<dir with *.gltf>
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };

/* ------------------------------------------------------------- GLB writer */

function pad4(buf, fill) {
  const extra = (4 - (buf.length % 4)) % 4;
  return extra ? Buffer.concat([buf, Buffer.alloc(extra, fill)]) : buf;
}

function writeGlb(file, json, bin) {
  const jsonBuf = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const binBuf = pad4(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, jh, jsonBuf, bh, binBuf]));
}

/* ------------------------------------------------------------ OBJ -> GLB */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function parseMtl(text) {
  const mats = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === 'newmtl') { cur = v.join(' '); mats[cur] = { color: [0.8, 0.8, 0.8], opacity: 1 }; }
    else if (cur && k === 'Kd') mats[cur].color = v.slice(0, 3).map(Number);
    else if (cur && (k === 'd')) mats[cur].opacity = Number(v[0]);
  }
  return mats;
}

function objToGlb(objFile, outFile, colorFor) {
  const text = fs.readFileSync(objFile, 'utf8');
  const mtlName = (/^mtllib\s+(.+)$/m.exec(text) || [])[1];
  const mats = mtlName && fs.existsSync(path.join(path.dirname(objFile), mtlName.trim()))
    ? parseMtl(fs.readFileSync(path.join(path.dirname(objFile), mtlName.trim()), 'utf8')) : {};
  const v = []; const vn = [];
  const groups = new Map(); // material -> { pos: [], nor: [] }
  let mat = 'default';
  const group = () => { if (!groups.has(mat)) groups.set(mat, { pos: [], nor: [] }); return groups.get(mat); };
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const k = parts[0];
    if (k === 'v') v.push(parts.slice(1, 4).map(Number));
    else if (k === 'vn') vn.push(parts.slice(1, 4).map(Number));
    else if (k === 'usemtl') mat = parts.slice(1).join(' ');
    else if (k === 'f') {
      const idx = parts.slice(1).map((p) => p.split('/').map((n) => (n ? Number(n) : null)));
      for (let i = 1; i + 1 < idx.length; i++) {
        const tri = [idx[0], idx[i], idx[i + 1]];
        const P = tri.map((t) => v[(t[0] > 0 ? t[0] - 1 : v.length + t[0])]);
        let N = tri.map((t) => (t[2] ? vn[(t[2] > 0 ? t[2] - 1 : vn.length + t[2])] : null));
        if (N.some((n) => !n)) {
          const a = P[1].map((c, j) => c - P[0][j]); const b = P[2].map((c, j) => c - P[0][j]);
          const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const l = Math.hypot(...n) || 1;
          N = [0, 1, 2].map(() => n.map((c) => c / l));
        }
        const g = group();
        for (let j = 0; j < 3; j++) { g.pos.push(...P[j]); g.nor.push(...N[j]); }
      }
    }
  }
  const json = { asset: { version: '2.0', generator: 'floorplan build-models' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [] }], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = []; let offset = 0;
  const addView = (floats, target) => {
    const buf = Buffer.from(new Float32Array(floats).buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf); offset += buf.length;
    return json.bufferViews.length - 1;
  };
  for (const [name, g] of groups) {
    if (!g.pos.length) continue;
    const m = { ...(mats[name] || { color: [0.8, 0.8, 0.8], opacity: 1 }) };
    if (colorFor) { const c = colorFor(name); if (c) m.color = c; }
    json.materials.push({
      name,
      pbrMetallicRoughness: { baseColorFactor: [...m.color.map(srgbToLinear), m.opacity], metallicFactor: /metal/i.test(name) ? 0.6 : 0, roughnessFactor: /glass|metal/i.test(name) ? 0.3 : 0.85 },
      ...(m.opacity < 1 || /glass/i.test(name) ? { alphaMode: 'BLEND' } : {}),
    });
    const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.pos.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], g.pos[i + j]); max[j] = Math.max(max[j], g.pos[i + j]); }
    const pv = addView(g.pos, 34962); const nv = addView(g.nor, 34962);
    json.accessors.push({ bufferView: pv, componentType: 5126, count: g.pos.length / 3, type: 'VEC3', min, max });
    json.accessors.push({ bufferView: nv, componentType: 5126, count: g.nor.length / 3, type: 'VEC3' });
    json.meshes[0].primitives.push({ attributes: { POSITION: json.accessors.length - 2, NORMAL: json.accessors.length - 1 }, material: json.materials.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  writeGlb(outFile, json, bin);
}

/* ------------------------------------------------- glTF (+bin, png) -> GLB */

function gltfToGlb(gltfFile, outFile) {
  const dir = path.dirname(gltfFile);
  const json = JSON.parse(fs.readFileSync(gltfFile, 'utf8'));
  const parts = []; let offset = 0;
  const views = [];
  // Existing buffers become one; their views shift by the buffer's start.
  const bufferStarts = json.buffers.map((b) => {
    const data = fs.readFileSync(path.join(dir, decodeURIComponent(b.uri)));
    const start = offset;
    const padded = pad4(data, 0);
    parts.push(padded); offset += padded.length;
    return start;
  });
  for (const bv of json.bufferViews) views.push({ ...bv, buffer: 0, byteOffset: (bv.byteOffset || 0) + bufferStarts[bv.buffer] });
  for (const img of json.images || []) {
    if (!img.uri) continue;
    const data = fs.readFileSync(path.join(dir, decodeURIComponent(img.uri)));
    views.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    const padded = pad4(data, 0);
    parts.push(padded); offset += padded.length;
    img.bufferView = views.length - 1;
    img.mimeType = /\.jpe?g$/i.test(img.uri) ? 'image/jpeg' : 'image/png';
    delete img.uri;
  }
  json.bufferViews = views;
  const bin = Buffer.concat(parts);
  json.buffers = [{ byteLength: bin.length }];
  writeGlb(outFile, json, bin);
}

/* ------------------------------------------------------------------- run */

let count = 0;
const kenney = arg('kenney');
if (kenney) {
  const src = path.join(kenney, 'Models');
  const out = path.join(root, 'web', 'models', 'kenney');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.obj'))) {
    objToGlb(path.join(src, f), path.join(out, f.replace(/\s+/g, '').replace(/\.obj$/, '.glb')));
    count++;
  }
  fs.copyFileSync(path.join(kenney, 'License.txt'), path.join(out, 'LICENSE.txt'));
}
// Quaternius Furniture Pack (CC0, opengameart.org/content/furniture-low-poly): its OBJ export has no colours,
// so they come from the material names.
const QUATERNIUS_COLORS = {
  DarkBrown: '#5b3a29', Sheets: '#9db9dc', White: '#f2f2ef', Wood: '#c48a5a', DarkWood: '#7a4a2c', Cover2: '#b23a3a',
  Cover3: '#3a6bb2', Cover4: '#3f8f4f', Pages: '#f1ead8', Sofa: '#6f8fae', Red: '#b5413b', Metal: '#6d6f73', Top: '#f3e6c8',
  Green: '#4f9a4a', Vase: '#d9d4c7',
};
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const quaternius = arg('quaternius');
if (quaternius) {
  const out = path.join(root, 'web', 'models', 'quaternius');
  fs.mkdirSync(out, { recursive: true });
  const colorFor = (name) => { const hex = QUATERNIUS_COLORS[name.replace(/\.\d+$/, '')]; return hex ? hexToRgb(hex) : null; };
  for (const f of fs.readdirSync(quaternius).filter((x) => x.endsWith('.obj'))) {
    objToGlb(path.join(quaternius, f), path.join(out, f.replace(/\.obj$/, '.glb')), colorFor);
    count++;
  }
  fs.writeFileSync(path.join(out, 'LICENSE.txt'), 'Furniture Pack by Quaternius (quaternius.com), CC0 1.0 Public Domain.\nSource: https://opengameart.org/content/furniture-low-poly\n');
}
const kaykit = arg('kaykit');
if (kaykit) {
  const out = path.join(root, 'web', 'models', 'kaykit');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(kaykit).filter((x) => x.endsWith('.gltf'))) {
    gltfToGlb(path.join(kaykit, f), path.join(out, f.replace(/\.gltf$/, '.glb')));
    count++;
  }
  const lic = path.join(kaykit, '..', 'LICENSE.txt');
  if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(out, 'LICENSE.txt'));
}
console.log(`converted ${count} models`);
