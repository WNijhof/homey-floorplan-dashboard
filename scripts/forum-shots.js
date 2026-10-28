'use strict';

// Screenshots of the demo house for forum posts and the App Store: dashboard (2D, 3D, quick controls,
// first floor), editor (catalogue, 3D editing) and picture recognition. No Homey needed.
// Usage: node scripts/forum-shots.js <out-dir> [nl|en] [width] [height]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createDevApp } = require('./dev-server');
const raster = require('../test/raster-plan');

const outDir = process.argv[2] || 'docs/shots';
const lang = process.argv[3] === 'en' ? 'en' : 'nl';
const width = Number(process.argv[4] || 1400);
const height = Number(process.argv[5] || 860);
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((b) => fs.existsSync(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
  const send = (method, params) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  return { send, close: () => ws.close() };
}

// Taps a device badge (2D marker or 3D badge) like a finger would.
const tap = (id) => `(() => { const el = document.querySelector('.fp-device[data-id="${id}"] circle:nth-of-type(2)') || document.querySelector('.fp3-dev[data-id="${id}"] .fp3-dot');
  const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); })()`;
const settings = (s) => `HomeyWeb.Homey.setSettings(${JSON.stringify(s)})`;
const base = { view: '2d', names: 'devices', sidebar: 'right', sideWeather: true, sideAgenda: true, tapAction: 'controls', level: null };

const SHOTS = [
  // [name, scheme, url, settings, script after load, script after that]
  ['1-dashboard-3d', 'dark', '/', { view: '3d' }],
  ['2-dashboard-2d', 'dark', '/', { view: '2d' }],
  ['3-dashboard-3d-light', 'light', '/', { view: '3d' }, null, tap('i_dining')],
  ['4-dashboard-first-floor', 'dark', '/', { view: '3d' }, "document.querySelectorAll('#levels [data-level]')[1].click()"],
  ['5-editor-furniture', 'light', '/editor', null, "document.querySelector('[data-tool=furniture]').click()"],
  ['6-editor-3d', 'light', '/editor', null, "document.getElementById('view-3d').click()", "(() => { const S = __editorState(); S.v3d.hooks.tap('item', 'i_thermo'); })()"],
  ['7-editor-recognise', 'light', '/editor', null, `(() => { const S = __editorState(); const lv = S.plan.levels[0]; lv.background = { src: 'data:image/png;base64,${raster.toPng(raster.rasterPlan({ scale: 0.8, names: false })).toString('base64')}', x: -120, y: -120, w: 1540, h: 1040, ratio: 1040 / 1540, opacity: 0.6, calibrated: true }; lv.rooms = []; lv.openings = []; lv.items = []; document.querySelector('[data-tool=picture]').click(); document.getElementById('zoom-fit').click(); document.querySelector('[data-action=detect-run]').click(); })()`],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const port = 9900 + Math.floor(Math.random() * 50);
  const app = createDevApp({ port, siblingPort: 8686, demoLang: lang });
  app.log = () => {};
  await app.webServer.start(port);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-forum-'));
  const debugPort = 9600 + Math.floor(Math.random() * 200);
  const proc = spawn(browser, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--lang=${lang}`, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const c = await cdp(debugPort);
    await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1.5, mobile: false });
    const locale = lang === 'nl' ? 'nl-NL' : 'en-GB';
    await c.send('Emulation.setLocaleOverride', { locale });
    // The pages pick their language from navigator.language, which follows the pc's language otherwise.
    const version = await c.send('Browser.getVersion');
    await c.send('Emulation.setUserAgentOverride', { userAgent: version.userAgent, acceptLanguage: `${locale},${lang}` });
    await c.send('Page.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'language', { get: () => '${locale}' }); Object.defineProperty(navigator, 'languages', { get: () => ['${locale}', '${lang}'] });` });
    for (const [name, scheme, url, s, js, js2] of SHOTS) {
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await c.send('Page.navigate', { url: `http://localhost:${port}${url}` });
      await sleep(1500);
      if (s) {
        await c.send('Runtime.evaluate', { expression: `${settings({ ...base, ...s })}; location.reload();` });
        await sleep(5000);
      }
      if (js) { await c.send('Runtime.evaluate', { expression: js }); await sleep(4500); }
      if (js2) { await c.send('Runtime.evaluate', { expression: js2 }); await sleep(1500); }
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(outDir, `${lang}-${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log('wrote', file);
    }
    c.close();
  } finally {
    proc.kill();
    await app.webServer.stop();
    await sleep(300);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* profile in use */ }
  }
})();
