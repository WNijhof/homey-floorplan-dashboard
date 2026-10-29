'use strict';

// Runs test/<target>-interaction.js in headless Edge or Chrome and prints the report.
//  - widget:    the Homey widget with a fake Homey object (scripts/harness.js)
//  - editor:    the web editor, served by the real web server with a stand-in app (scripts/dev-server.js)
//  - dashboard: the web dashboard, same server
// The browser is driven over the DevTools protocol; the test runs once the page has its data.
// Usage: node scripts/ui-check.js [widget|editor|dashboard]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { createDevApp } = require('./dev-server');

const root = path.join(__dirname, '..');
const target = ['widget', 'editor', 'dashboard'].includes(process.argv[2]) ? process.argv[2] : 'editor';
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((b) => fs.existsSync(b));
if (!browser) { console.error('No Chrome or Edge found'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-ui-'));
  let testCode = fs.readFileSync(path.join(root, 'test', `${target}-interaction.js`), 'utf8');
  if (target === 'editor') {
    // A drawn floor plan picture for the recognition step (0.8 px/cm, 120 cm margin: 1540 x 1040 cm).
    const { rasterPlan, toPng } = require('../test/raster-plan');
    testCode = `window.__testPlanPng = 'data:image/png;base64,${toPng(rasterPlan({ scale: 0.8 })).toString('base64')}';
${testCode}`;
  }
  execFileSync(process.execPath, [path.join(root, 'scripts', 'sync-shared.js')]);

  let url; let app = null;
  if (target === 'widget') {
    const page = path.join(dir, 'widget.html');
    execFileSync(process.execPath, [path.join(root, 'scripts', 'harness.js'), 'widget', page, '{"sidebar":"right"}']);
    url = `file:///${page.replace(/\\/g, '/')}`;
  } else {
    const port = 9800 + Math.floor(Math.random() * 100);
    app = createDevApp({ port, siblingPort: 8686 });
    app.log = () => {};
    await app.webServer.start(port);
    url = `http://localhost:${port}${target === 'editor' ? '/editor' : '/'}`;
  }

  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(browser, [
    '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(dir, 'profile')}`, '--window-size=1300,750', url,
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 50 && !wsUrl; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        const tab = list.find((t) => t.type === 'page');
        if (tab) wsUrl = tab.webSocketDebuggerUrl;
      } catch (err) { /* not up yet */ }
    }
    if (!wsUrl) throw new Error('Browser did not start');

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
    };
    const evaluate = (expression) => new Promise((resolve) => {
      id += 1;
      pending.set(id, (d) => resolve(d.result && d.result.result ? d.result.result.value : null));
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

    // Wait until the page has loaded its plan, then start the test.
    const ready = target === 'editor'
      ? '!!(window.__editorState && window.__editorState().plan)'
      // The web page starts on the house view; the widget on the plan
      : target === 'dashboard'
        ? '!!(window.__widgetState && window.__widgetState().plan && document.querySelector(".h3-card"))'
        : '!!(window.__widgetState && window.__widgetState().plan && document.querySelector(".fp-device"))';
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) { await sleep(200); ok = await evaluate(ready); }
    if (!ok) throw new Error('Page did not load its plan');
    await sleep(300);
    await evaluate(testCode);

    let text = null;
    for (let i = 0; i < 100 && !text; i++) {
      await sleep(200);
      text = await evaluate("(document.getElementById('result') || {}).textContent || null");
    }
    if (!text) {
      const state = await evaluate('JSON.stringify({ report: window.__report })');
      ws.close();
      throw new Error(`No result; the test hung. Partial: ${state}`);
    }
    ws.close();
    return JSON.parse(text);
  } finally {
    proc.kill();
    if (app) await app.webServer.stop();
    await sleep(300);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* browser may still hold the profile */ }
  }
}

main().then((report) => {
  let failed = 0;
  for (const [k, v] of Object.entries(report)) {
    const ok = v === true || (typeof v === 'string' && v.length > 0 && k !== 'threw' && !/fail|mislukt/i.test(v));
    if (!ok) failed++;
    console.log(`${ok ? '✔' : '✖'} ${k}: ${JSON.stringify(v)}`);
  }
  process.exit(failed ? 1 : 0);
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
