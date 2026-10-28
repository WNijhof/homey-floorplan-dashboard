'use strict';

// Screenshots of the web dashboard and editor, served by the dev server (sample home, no Homey).
// Usage: node scripts/screenshot.js <out-dir> [width] [height]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createDevApp } = require('./dev-server');

const outDir = process.argv[2] || '.';
const width = Number(process.argv[3] || 1280);
const height = Number(process.argv[4] || 760);
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

(async () => {
  const port = 9900 + Math.floor(Math.random() * 50);
  const app = createDevApp({ port, siblingPort: 8686 });
  app.log = () => {};
  await app.webServer.start(port);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-shot-'));
  const debugPort = 9600 + Math.floor(Math.random() * 200);
  const proc = spawn(browser, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const c = await cdp(debugPort);
    await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const scheme = process.argv[5] || 'dark';
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (const [name, url, js, js2] of [
      [`web-dashboard-${scheme}`, '/', ''],
      [`web-dashboard-3d-${scheme}`, '/', "HomeyWeb.Homey.setSettings({view:'3d'});location.reload();"],
      [`web-dashboard-quick-${scheme}`, '/', "const el=document.querySelector('.fp-device[data-id=\"i_l1\"] circle:nth-of-type(2)') || document.querySelector('.fp3-dev[data-id=\"i_l1\"] .fp3-dot'); const r=el.getBoundingClientRect(); const o={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1}; el.dispatchEvent(new PointerEvent('pointerdown',o)); el.dispatchEvent(new PointerEvent('pointerup',o));"],
      [`web-dashboard-3d-quick-${scheme}`, '/', "HomeyWeb.Homey.setSettings({view:'3d'});location.reload();", "const el=document.querySelector('.fp-device[data-id=\"i_l1\"] circle:nth-of-type(2)') || document.querySelector('.fp3-dev[data-id=\"i_l1\"] .fp3-dot'); const r=el.getBoundingClientRect(); const o={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1}; el.dispatchEvent(new PointerEvent('pointerdown',o)); el.dispatchEvent(new PointerEvent('pointerup',o));"],
      [`web-editor-catalogue-${scheme}`, '/editor', "document.querySelector('[data-tool=furniture]').click();"],
      [`web-editor-select-${scheme}`, '/editor', "const S=__editorState(); S.sel={kind:'item',id:S.plan.levels[0].items[0].id}; document.getElementById('zoom-in').click(); document.getElementById('zoom-in').click();"],
      [`web-editor-3d-${scheme}`, '/editor', "document.getElementById('view-3d').click();"],
      [`web-editor-recognise-${scheme}`, '/editor', `(() => { const S = __editorState(); S.plan.levels[0].background = { src: 'data:image/png;base64,${require('../test/raster-plan').toPng(require('../test/raster-plan').rasterPlan({ scale: 0.8 })).toString('base64')}', x: -120, y: -120, w: 1540, h: 1040, ratio: 1040 / 1540, opacity: 0.6, calibrated: true }; S.plan.levels[0].rooms = []; S.plan.levels[0].openings = []; S.plan.levels[0].items = []; document.querySelector('[data-tool=picture]').click(); document.querySelector('[data-action=detect-run]').click(); })()`],
    ]) {
      await c.send('Page.navigate', { url: `http://localhost:${port}${url}` });
      await sleep(1500);
      await c.send('Runtime.evaluate', { expression: "HomeyWeb.Homey.setSettings({view:'2d'})" });
      if (js) { await c.send('Runtime.evaluate', { expression: js }); await sleep(4000); }
      if (js2) { await c.send('Runtime.evaluate', { expression: js2 }); await sleep(1200); }
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(outDir, `${name}.png`);
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
