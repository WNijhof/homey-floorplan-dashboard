'use strict';

// Checks the built demo site (scripts/build-demo.js) like GitHub Pages serves it: under a sub folder,
// with /editor answered by editor.html. Loads the dashboard and the editor in a headless browser.
// Usage: node scripts/demo-check.js [site-dir] [nl|en]
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const site = path.resolve(process.argv[2] || 'site');
const lang = process.argv[3] === 'en' ? 'en' : 'nl';
const BASE = '/homey-floorplan-dashboard/';
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((b) => fs.existsSync(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serve() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(BASE)) { res.writeHead(404).end(); return; }
    let file = path.join(site, url.slice(BASE.length) || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (!file.startsWith(site) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

async function cdp(debugPort) {
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try {
      const tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page');
      if (tab) wsUrl = tab.webSocketDebuggerUrl;
    } catch (err) { /* starting */ }
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method) events.push(d);
  };
  const send = (method, params) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  return { send, events, close: () => ws.close() };
}

(async () => {
  const server = serve();
  await new Promise((r) => server.listen(0, r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-demo-'));
  const debugPort = 9600 + Math.floor(Math.random() * 200);
  const proc = spawn(browser, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dir}`, '--window-size=1400,860', 'about:blank'], { stdio: 'ignore' });
  const report = {};
  try {
    const c = await cdp(debugPort);
    const locale = lang === 'nl' ? 'nl-NL' : 'en-GB';
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'language', { get: () => '${locale}' });` });
    const evalJs = async (expression) => (await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

    await c.send('Page.navigate', { url: `${origin}${BASE}` });
    await sleep(3500);
    report.dashboard = await evalJs(`({ devices: document.querySelectorAll('.fp-device').length, rooms: document.querySelectorAll('.fp-label').length, banner: !!document.querySelector('.fp-demo-banner'), live: document.getElementById('status').className })`);
    // A tap on the hall lamp opens its controls; switching it on comes back as a live change.
    report.toggle = await evalJs(`(async () => {
      const st = () => window.__widgetState();
      const el = document.querySelector('.fp-device[data-id="i_hall"] circle:nth-of-type(2)');
      const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o));
      await new Promise((res) => setTimeout(res, 500));
      const t = document.querySelector('#quick [data-act=toggle][data-cap=onoff]'); if (t) t.click();
      await new Promise((res) => setTimeout(res, 400));
      return st().devices.get('d_hall').caps.onoff === true;
    })()`);
    report.view3d = await evalJs(`(async () => { HomeyWeb.Homey.setSettings({ view: '3d' }); document.getElementById('btn-view').click(); await new Promise((r) => setTimeout(r, 3500)); return document.querySelectorAll('.fp3-dev').length; })()`);
    await evalJs(`HomeyWeb.Homey.setSettings({ view: '2d' })`);

    await c.send('Page.navigate', { url: `${origin}${BASE}editor` });
    await sleep(3500);
    report.editor = await evalJs(`({ plan: !!(window.__editorState && window.__editorState().plan), levels: document.querySelectorAll('#level-tabs [data-level]').length })`);
    // A change in the editor is saved in this browser and is still there after a reload.
    await evalJs(`(() => { const S = window.__editorState(); S.plan.name = 'Demo test'; document.querySelector('[data-path="plan.name"]'); })()`);
    await evalJs(`(async () => { document.querySelector('[data-tool=room]').click(); return true; })()`);
    report.back = await evalJs(`document.getElementById('back-dashboard').href`);

    const errors = c.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception ? e.params.exceptionDetails.exception.description : e.params.exceptionDetails.text);
    const failed = c.events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map((e) => `${e.params.response.status} ${e.params.response.url}`);
    report.errors = errors.slice(0, 5);
    report.failed = failed.slice(0, 5);
    c.close();
  } finally {
    proc.kill();
    server.close();
    await sleep(300);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* profile in use */ }
  }
  console.log(JSON.stringify(report, null, 2));
  const ok = report.dashboard.devices > 5 && report.dashboard.banner && report.toggle && report.view3d > 5 && report.editor.plan && report.editor.levels === 2 && !report.errors.length && !report.failed.length;
  console.log(ok ? 'demo ok' : 'demo FAILED');
  process.exit(ok ? 0 : 1);
})();
