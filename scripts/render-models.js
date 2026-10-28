'use strict';

// Renders catalogue tiles (web/models/thumbs) and top views for the 2D plan (web/models/top) of every model
// in lib/shared/models.js, with three.js in headless Edge/Chrome.
// Usage: node scripts/render-models.js [--only=id1,id2] [--out=dir] [--yaw=deg]
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const MODELS = require('../lib/shared/models');

const root = path.join(__dirname, '..');
const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const only = arg('only') ? arg('only').split(',') : null;
const outDir = arg('out');
const yawOverride = arg('yaw') != null ? Number(arg('yaw')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((b) => fs.existsSync(b));

function serve() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = p.startsWith('/tools/') ? path.join(root, 'scripts', p) : path.join(root, 'web', p);
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-models-'));
  const debugPort = 9700 + Math.floor(Math.random() * 200);
  const proc = spawn(browser, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dir}`, `http://localhost:${port}/tools/model-render.html`], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 50 && !tab; i++) { await sleep(200); try { tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* starting */ } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const ev = (expression) => new Promise((r) => { id++; pending.set(id, r); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
  for (let i = 0; i < 50; i++) { const r = await ev('!!window.ready'); if (r.result && r.result.result.value) break; await sleep(200); }

  const thumbs = outDir || path.join(root, 'web', 'models', 'thumbs');
  const tops = outDir || path.join(root, 'web', 'models', 'top');
  fs.mkdirSync(thumbs, { recursive: true }); fs.mkdirSync(tops, { recursive: true });
  let done = 0;
  for (const m of MODELS.list()) {
    if (!m.file || (only && !only.includes(m.id))) continue;
    const url = `/models/${m.file}`;
    const yaw = yawOverride != null ? yawOverride : (m.yaw || 0);
    const size = [m.w, m.d, m.h];
    for (const [mode, px, dest] of [['iso', 200, thumbs], ['top', 256, tops]]) {
      const r = await ev(`renderModel(${JSON.stringify(url)}, ${JSON.stringify(mode)}, ${yaw}, ${JSON.stringify(size)}, ${px})`);
      const data = r.result && r.result.result && r.result.result.value;
      if (!data) { console.error('failed', m.id, mode, JSON.stringify(r.result && r.result.exceptionDetails && r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); continue; }
      fs.writeFileSync(path.join(dest, `${m.id}${outDir ? `-${mode}` : ''}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    done++;
  }
  ws.close(); proc.kill(); server.close();
  await sleep(300);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* in use */ }
  console.log(`rendered ${done} models`);
})();
