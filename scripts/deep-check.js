'use strict';

// The deep test: the real app.js on a stand-in Homey (test/fake-homey.js), driven by a real browser with separate
// tablets. Every step also looks for script errors, failed requests and words like "undefined" on the screen.
// Usage: node scripts/deep-check.js [name of a part ...] [--soak=seconds] [--full]
// On Windows, to keep a laptop free: cmd /c start /b /low /affinity 3 /wait node scripts/deep-check.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { startApp, EVIL } = require('../test/fake-homey');

const { pickBrowser } = require('./browser');

const browser = pickBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const soakArg = process.argv.find((a) => a.startsWith('--soak='));
const SOAK = soakArg ? Number(soakArg.slice(7)) : 120;
const FULL = process.argv.includes('--full'); // without the limits that keep a laptop usable

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${ok || detail === undefined ? '' : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
}

class Browser {

  async start() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-deep-'));
    this.debugPort = 9300 + Math.floor(Math.random() * 400);
    this.proc = spawn(browser.path, [...browser.args, `--remote-debugging-port=${this.debugPort}`, `--user-data-dir=${this.dir}`, '--window-size=1280,800', '--force-prefers-no-reduced-motion', '--num-raster-threads=1', '--renderer-process-limit=3', 'about:blank'], { stdio: 'ignore' });
    // The laptop stays usable: everything of the test comes after what the owner does
    if (!FULL) { try { os.setPriority(0, os.constants.priority.PRIORITY_LOW); os.setPriority(this.proc.pid, os.constants.priority.PRIORITY_LOW); } catch (err) { /* not allowed here */ } }
    // Edge's own child processes do not keep the limit of their parent, so it is set on them again and again
    if (process.platform === 'win32' && !FULL) {
      const name = path.basename(this.dir);
      const limit = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='brave.exe'" | Where-Object { $_.CommandLine -match '${name}' } | ForEach-Object { try { $q = Get-Process -Id $_.ProcessId -ErrorAction Stop; $q.PriorityClass = 'Idle'; $q.ProcessorAffinity = [IntPtr]3 } catch {} }`;
      const apply = () => spawn('powershell', ['-NoProfile', '-Command', limit], { stdio: 'ignore' });
      apply();
      this.limiter = setInterval(apply, 4000);
      this.limiter.unref();
    }
    let url = null;
    for (let i = 0; i < 60 && !url; i++) {
      await sleep(200);
      try { url = (await (await fetch(`http://127.0.0.1:${this.debugPort}/json/version`)).json()).webSocketDebuggerUrl; } catch (err) { /* starting */ }
    }
    this.ws = new WebSocket(url);
    await new Promise((r) => { this.ws.onopen = r; });
    this.id = 0; this.pending = new Map(); this.sessions = new Map();
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); return; }
      const s = d.sessionId && this.sessions.get(d.sessionId);
      if (s) s.event(d);
    };
  }

  send(method, params, sessionId) {
    return new Promise((resolve) => {
      this.id += 1;
      this.pending.set(this.id, resolve);
      this.ws.send(JSON.stringify({ id: this.id, method, params, sessionId }));
    });
  }

  // A tablet of its own: its own storage, as a separate device in the house.
  async tablet({ width = 1280, height = 800, scheme = 'dark', lang = 'nl' } = {}) {
    const { result: { browserContextId } } = await this.send('Target.createBrowserContext', {});
    const { result: { targetId } } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { result: { sessionId } } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Tablet(this, sessionId, targetId, browserContextId);
    this.sessions.set(sessionId, page);
    await page.cmd('Page.enable'); await page.cmd('Runtime.enable'); await page.cmd('Network.enable');
    await page.size(width, height, scheme);
    const locale = lang === 'nl' ? 'nl-NL' : 'en-GB';
    await page.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'language', { get: () => '${locale}' });` });
    return page;
  }

  async stop() {
    clearInterval(this.limiter);
    this.proc.kill();
    await sleep(300);
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch (err) { /* in use */ }
  }

}

class Tablet {

  constructor(browser, sessionId, targetId, contextId) {
    Object.assign(this, { browser, sessionId, targetId, contextId, problems: [] });
  }

  event(d) {
    if (d.method === 'Runtime.exceptionThrown') this.problems.push(`script: ${(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description) || d.params.exceptionDetails.text}`.slice(0, 300));
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 500) this.problems.push(`http ${d.params.response.status} ${d.params.response.url}`);
  }

  cmd(method, params) { return this.browser.send(method, params, this.sessionId); }

  size(width, height, scheme = 'dark') {
    return Promise.all([
      this.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      this.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] }),
    ]);
  }

  async open(url, wait = 2500) {
    await this.cmd('Page.navigate', { url });
    await sleep(wait);
  }

  // The value of an expression in the page.
  async js(expression) {
    const r = await this.cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${(r.result.exceptionDetails.exception || {}).description}`);
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  // Waits until the expression is true.
  async until(expression, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.js(`!!(${expression})`)) return true;
      await sleep(100);
    }
    return false;
  }

  click(selector) { return this.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ${selector.replace(/'/g, '')}'); el.click(); return true; })()`); }

  // What should never be on a screen.
  async clean(name) {
    const text = await this.js('document.body.innerText');
    const bad = /(undefined|\bNaN\b|\[object Object\]|null kWh)/.exec(text || '');
    check(`${name}: nothing odd on the screen`, !bad, bad && text.slice(Math.max(0, bad.index - 40), bad.index + 40));
    check(`${name}: no script injected`, !(await this.js('window.__xss')));
    check(`${name}: no script errors`, !this.problems.length, this.problems.slice(0, 3));
    this.problems = [];
  }

  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId });
    await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId });
  }

}

const PORT = 18900;
let portNo = PORT;
async function withApp(opts, fn) {
  portNo += 1;
  const s = await startApp({ port: portNo, ...opts });
  try { await fn(s, `http://localhost:${portNo}`); } finally { await s.stop(); }
}
const ready = 'window.__widgetState && __widgetState().plan && document.querySelector("#strip:not([hidden]) .fp-chip")';
const device = async (s, id) => (await s.api.devices.getDevices())[id];
const value = async (s, id, cap) => (await device(s, id)).capabilitiesObj[cap].value;
// Waits until something on the Homey side is true: a slow machine takes longer.
async function soon(test, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return true;
    await sleep(100);
  }
  return false;
}

// Any thermostat may be the first in the list.
async function devicesWithTarget(s, wanted) {
  return Object.values(await s.api.devices.getDevices()).some((d) => d.capabilitiesObj.target_temperature && d.capabilitiesObj.target_temperature.value === wanted);
}

const PARTS = {

  async boot(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet();
      await t.open(url);
      check('dashboard starts', await t.until(ready));
      check('starts on the house', await t.js('__widgetState().levelId') === 'house');
      check('house cards', await t.until('document.querySelectorAll(".h3-card").length >= 6'));
      check('who is home', await t.until('document.querySelectorAll("#people i").length === 3'));
      check('evil name stays text', !(await t.js('document.querySelector("#people img")')));
      check('buttons in the strip', await t.js('/Klimaat/.test(document.getElementById("actions").textContent) && /Alarm/.test(document.getElementById("actions").textContent)'));
      await t.clean('boot');
      await t.close();
    });
  },

  async lists(b) {
    await withApp({}, async (s, url) => {
      const a = await b.tablet();
      const c = await b.tablet();
      await a.open(url); await c.open(url);
      await a.until(ready); await c.until(ready);
      await a.click('[data-sheet=lists]');
      check('lists open', await a.until('document.querySelector(".fp-add input")'));
      await a.js(`(() => { const f = document.querySelector('.fp-add'); f.querySelector('input').value = ${JSON.stringify(`Melk ${EVIL}`)}; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); })()`);
      check('item added', await a.until('document.querySelector(".fp-item")'));
      check('item is on Homey', s.app.extras.getLists().shopping.length === 1);
      check('item stays text', !(await a.js('document.querySelector(".fp-item img")')));
      await c.click('[data-sheet=lists]');
      check('other tablet has it', await c.until('document.querySelectorAll(".fp-item").length === 1'));
      await s.homey.cards.action['add-to-list']({ list: 'shopping', text: 'Eieren' });
      check('a Flow reaches both tablets without reloading', await a.until('document.querySelectorAll(".fp-item").length === 2') && await c.until('document.querySelectorAll(".fp-item").length === 2'));
      await a.click('.fp-item input[type=checkbox]');
      check('ticked', await a.until('document.querySelector(".fp-item.done")'));
      await a.until('document.querySelector("[data-p=clear-done]")');
      await a.click('[data-p=clear-done]');
      check('cleared', await a.until('document.querySelectorAll(".fp-item").length === 1'));
      await a.click('[data-p=list-tab][data-value=meals]');
      await a.until('document.querySelector("[data-day=mon]")');
      const day = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][(new Date().getDay() + 6) % 7];
      await a.js(`(() => { const i = document.querySelector('[data-day=${day}]'); i.value = 'Pasta'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      check('meal of today in the side panel', await a.until('document.getElementById("meal-card") && !document.getElementById("meal-card").hidden && /Pasta/.test(document.getElementById("meal-card").textContent)'));
      check('meal is on Homey', await soon(() => s.app.extras.getLists().meals[day] === 'Pasta'), s.app.extras.getLists().meals);
      await a.open(url);
      await a.until(ready);
      check('after a restart of the page everything is still there', await a.until('/Pasta/.test((document.getElementById("meal-card")||{}).textContent||"")', 15000), await a.js('[(document.getElementById("meal-card")||{}).outerHTML, !!window.FpPanels.state.lists, __widgetState().settings.sidebar, document.getElementById("side").hidden]'));
      await a.clean('lists'); await c.clean('lists 2');
      await a.close(); await c.close();
    });
  },

  async alarm(b) {
    await withApp({ config: { editPin: '4321' } }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await t.click('[data-sheet=alarm]');
      await t.until('document.querySelector("[data-p=alarm][data-value=armed]")');
      await t.click('[data-p=alarm][data-value=armed]');
      check('armed from the screen', await soon(async () => await value(s, 'd_alarm', 'homealarm_state') === 'armed'));
      check('sign in the strip', await t.until('/Alarm aan/.test(document.getElementById("attention").textContent)'));
      await t.js('document.getElementById("sheet-close").click()');
      (await device(s, 'd_alarm')).report('alarm_generic', true);
      check('the alarm takes over the screen', await t.until('!document.getElementById("siren").hidden'));
      await t.click('#siren-off');
      check('turning it off asks for the PIN', await t.until('document.querySelector(".hw-pin input")'));
      check('still on without the PIN', await value(s, 'd_alarm', 'homealarm_state') === 'armed');
      await t.js(`(() => { document.querySelector('.hw-pin input').value = '4321'; document.querySelector('.hw-pin form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); })()`);
      await sleep(600);
      check('off with the PIN', await value(s, 'd_alarm', 'homealarm_state') === 'disarmed');
      (await device(s, 'd_alarm')).report('alarm_generic', false);
      check('the screen comes back', await t.until('document.getElementById("siren").hidden'));
      (await device(s, 'd_smoke')).report('alarm_smoke', true);
      check('smoke goes over everything', await t.until('!document.getElementById("siren").hidden'));
      check('smoke has no off button', await t.js('document.getElementById("siren-off").hidden'));
      (await device(s, 'd_smoke')).report('alarm_smoke', false);
      await t.until('document.getElementById("siren").hidden');
      await t.js('window.__extras.setSaver(true)');
      (await device(s, 'd_smoke')).report('alarm_smoke', true);
      check('and wakes the night clock', await t.until('document.getElementById("saver").hidden'));
      (await device(s, 'd_smoke')).report('alarm_smoke', false);
      await t.clean('alarm');
      await t.close();
    });
  },

  async controls(b) {
    await withApp({}, async (s, url) => {
      const plan = s.app.plans.list()[0];
      plan.variables = [{ id: 'v_holiday' }, { id: 'v_guests' }, { id: 'v_note' }];
      plan.actions = [{ kind: 'mood', id: 'm1', name: 'Filmavond' }];
      s.app.plans.save(plan.id, plan);
      const therm = await device(s, 'd_thermo');
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await t.click('[data-sheet=climate]');
      check('climate lists the rooms', await t.until('document.querySelectorAll("#sheet-body .fp-row").length >= 3'));
      const was = therm.capabilitiesObj.target_temperature.value;
      await t.click('[data-act=step][data-step="0.5"]');
      check('target goes up 0.5', await soon(() => devicesWithTarget(s, was + 0.5)), was);
      await t.js('document.getElementById("sheet-close").click()');

      (await device(s, 'd_speaker')).report('speaker_playing', true);
      check('music bar appears', await t.until('!document.getElementById("media").hidden && /Miles Davis/.test(document.getElementById("media").textContent)'));
      await t.click('[data-p=media][data-cap=speaker_playing]');
      await sleep(400);
      check('pause reaches the speaker', await value(s, 'd_speaker', 'speaker_playing') === false);
      check('music bar goes', await t.until('document.getElementById("media").hidden'));

      await t.click('[data-sheet=vacuum]');
      await t.until('document.querySelector("[data-p=vacuum][data-value=cleaning]")');
      await t.click('[data-p=vacuum][data-value=cleaning]');
      check('vacuum starts', await soon(async () => await value(s, 'd_vacuum', 'vacuumcleaner_state') === 'cleaning'));
      check('vacuum sign', await t.until('/Stofzuiger is bezig/.test(document.getElementById("attention").textContent)'));
      await t.js('document.getElementById("sheet-close").click()');

      // The waste app goes before the agenda
      s.app.extras.wasteOn = async (when) => (when === 'tomorrow' ? 'De plastic container' : null);
      s.app.extras.waste = null;
      await t.open(url); await t.until(ready);
      check('waste from the app at the top', await t.until('/Morgen: De plastic container/.test(document.getElementById("attention").textContent)', 12000));
      check('variables shown', await t.until('document.querySelectorAll("#var-card .fp-row").length === 3'));
      check('evil variable stays text', !(await t.js('document.querySelector("#var-card img")')));
      check('variables are only to read', await t.js('!document.querySelector("#var-card button, #var-card input")'));
      check('yes or no in words', await t.js('/Ja|Nee/.test(document.getElementById("var-card").textContent)'));

      check('mood button', await t.until('/Filmavond/.test(document.getElementById("actions").textContent)'));
      await t.click('[data-x=run]');
      await sleep(400);
      check('mood runs', s.api.ran.some(([k, id]) => k === 'mood' && id === 'm1'));

      await t.click('[data-x=leave]');
      check('leave check opens', await t.until('!document.getElementById("sheet").hidden && document.querySelector("[data-x=lights-off]")'));
      await t.click('[data-x=lights-off]');
      await t.click('[data-x=lights-off]');
      await sleep(800);
      check('all lamps off', await value(s, 'd_kitchen', 'onoff') === false && await value(s, 'd_floor', 'onoff') === false);
      await t.clean('controls');
      await t.close();
    });
  },

  async flows(b) {
    await withApp({}, async (s, url) => {
      const named = await b.tablet();
      const other = await b.tablet();
      await named.open(`${url}/?screen=hal`); await other.open(url);
      await named.until(ready); await other.until(ready);
      const run = (args) => s.homey.cards.action['show-on-screen']({ seconds: 1, detail: '', screen: '', ...args });
      await run({ what: 'message', detail: `Eten! ${EVIL}`, seconds: 2 });
      check('message on every screen', await named.until('!document.getElementById("ring").hidden') && await other.until('!document.getElementById("ring").hidden'));
      check('message stays text', !(await named.js('document.querySelector("#ring-text img")')));
      check('message goes by itself', await named.until('document.getElementById("ring").hidden', 4000));
      await run({ what: 'camera', seconds: 2 });
      check('camera over the screen', await named.until('!document.getElementById("camview").hidden'));
      check('camera goes by itself', await named.until('document.getElementById("camview").hidden', 4000));
      await run({ what: 'message', detail: 'Alleen hal', screen: 'hal', seconds: 2 });
      check('only the named screen', await named.until('!document.getElementById("ring").hidden'));
      check('not the other', await other.js('document.getElementById("ring").hidden'));
      await sleep(2200);
      const first = s.app.plans.list()[0].levels[1];
      await run({ what: 'level', detail: first.name.toUpperCase(), seconds: 3 });
      check('to a storey, whatever the capitals', await named.until(`__widgetState().levelId === ${JSON.stringify(first.id)}`));
      check('and back', await named.until('__widgetState().levelId === "house"', 9000), await named.js('[__widgetState().levelId, [...document.querySelectorAll("#levels [data-level]")].map((b) => b.dataset.level), document.getElementById("levels").hidden]'));
      await run({ what: 'energy', seconds: 3 });
      check('Energy page over the screen', await named.until('!document.getElementById("energy-view").hidden'));
      check('and away', await named.until('document.getElementById("energy-view").hidden', 6000));
      await run({ what: 'level', detail: 'Bestaat niet', seconds: 1 });
      await sleep(400);
      await run({ what: 'nonsense' });
      await named.clean('flows'); await other.clean('flows 2');
      await named.close(); await other.close();
    });
  },

  async themes(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet({ scheme: 'light' });
      await t.open(url); await t.until(ready);
      const bg = 'getComputedStyle(document.body).backgroundColor';
      check('follows the device', await t.js(bg) === 'rgb(242, 242, 247)');
      await t.click('[data-tb=theme]');
      check('one tap to dark', await t.js(bg) === 'rgb(0, 0, 0)');
      await t.open(url); await t.until(ready);
      check('still dark after a reload', await t.js(bg) === 'rgb(0, 0, 0)');
      await t.open(`${url}/editor`, 4000);
      check('editor is dark too', await t.until('window.__editorState && document.documentElement.dataset.theme === "dark"'), await t.js('[location.pathname, document.documentElement.dataset.theme, localStorage.getItem("energy-dashboard-screen")]'));
      await t.open(`${url}/energy/`, 4000);
      check('Energy page is dark too', await t.until('document.querySelector("[data-block]") && document.documentElement.dataset.theme === "dark"'), await t.js('[location.pathname, document.documentElement.dataset.theme, localStorage.getItem("energy-dashboard-screen")]'));
      check('Energy page really is dark', await t.js(bg) === 'rgb(0, 0, 0)', await t.js(bg));
      await t.clean('themes');
      await t.close();
    });
  },

  async guest(b) {
    await withApp({ config: { editPin: '4321' } }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await t.js('HomeyWeb.Homey.setSettings({ guest: true })');
      await t.open(url); await t.until(ready);
      check('no pencil', await t.js('getComputedStyle(document.querySelector("a[href=editor]")).display') === 'none');
      await t.click('[data-tb=settings]');
      check('settings ask for the PIN', await t.until('document.querySelector(".hw-pin input")'), await t.js('fetch("/api/edit").then((r) => r.text())'));
      check('and do not open', await t.js('document.getElementById("sheet").hidden'));
      await t.js('document.querySelector(".hw-cancel").click()');
      await t.click('[data-sheet=alarm]');
      check('no off button for the alarm', await t.until('document.querySelector("[data-p=alarm]") && !document.querySelector("[data-p=alarm][data-value=disarmed]")'));
      await t.clean('guest');
      await t.close();
    });
  },

  async screens(b) {
    await withApp({}, async (s, url) => {
      const a = await b.tablet();
      await a.open(url); await a.until(ready);
      await a.click('[data-tb=settings]');
      check('settings open', await a.until('document.querySelector("[data-set=screenName]")'));
      await a.js(`(() => { document.querySelector('[data-set=screenName]').value = 'Keuken 1'; document.querySelector('[data-set=saver]').value = 'always'; document.querySelector('[data-set=theme]').value = 'light'; document.querySelector('[data-tb=apply]').click(); })()`);
      await sleep(1200);
      check('kept on Homey', (s.app.extras.getScreen('Keuken 1') || {}).saver === 'always');
      const c = await b.tablet();
      await c.open(`${url}/?screen=${encodeURIComponent('Keuken 1')}`);
      await c.until(ready);
      check('a new tablet takes it over', await c.js('HomeyWeb.Homey.getSettings().saver') === 'always');
      check('and keeps its name', await c.js('HomeyWeb.screenName()') === 'Keuken 1');
      await c.click('[data-tb=settings]');
      await c.until('document.querySelector("[data-set=side]")');
      await c.js(`(() => { document.querySelector('[data-set=side]').value = 'energy'; document.querySelector('[data-tb=apply]').click(); })()`);
      await sleep(2500);
      check('split screen: Energy beside the house', await c.until('document.getElementById("split-energy")'));
      check('side panel makes way', await c.js('document.getElementById("side").hidden'));
      check('Energy has its blocks there', await c.until('(() => { const d = document.getElementById("split-energy").contentDocument; return d && d.querySelectorAll("[data-block]").length > 5; })()'));
      await a.clean('screens'); await c.clean('screens 2');
      await a.close(); await c.close();
    });
  },

  async rest(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await t.js('window.__extras.setSaver(true)');
      check('clock at night', await t.js('!document.getElementById("saver").hidden && /\\d/.test(document.getElementById("saver-time").textContent)'));
      await t.js('window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
      check('a touch brings the page back', await t.js('document.getElementById("saver").hidden'));
      (await device(s, 'd_bell')).report('alarm_generic', true);
      check('doorbell', await t.until('!document.getElementById("ring").hidden && /Deurbel/.test(document.getElementById("ring-name").textContent)'));
      await t.click('#ring');
      (await device(s, 'd_bell')).report('alarm_generic', false);
      const level = s.app.plans.list()[0].levels[0];
      await t.js(`document.querySelector('#levels [data-level="${level.id}"]').click()`);
      await t.until(`__widgetState().levelId === ${JSON.stringify(level.id)}`);
      await t.js('__widgetState().view = "2d"; document.querySelector(\'#levels [data-level="' + level.id + '"]\').click()');
      await sleep(800);
      await t.js('HomeyWeb.Homey.setSettings({ landing: "2" })');
      await t.js('(() => { const n = Date.now; Date.now = () => n() + 3 * 60000; window.__extras.goHome(); Date.now = n; })()');
      check('back to the start after a while', await t.until('__widgetState().levelId === "house"'));
      await t.js('HomeyWeb.Homey.setSettings({ landing: "0" })');
      // the outdoor lamps
      const lamp = await value(s, 'd_out_path', 'onoff');
      await t.js('__widgetState().house.hooks.tap("lamp", "path")');
      await sleep(500);
      check('tapping a lamp on the house switches it', await value(s, 'd_out_path', 'onoff') === !lamp);
      await t.clean('rest');
      await t.close();
    });
  },

  async editor(b) {
    await withApp({ plan: null }, async (s, url) => {
      const t = await b.tablet();
      await t.open(`${url}/editor`, 2500);
      check('quick start offered', await t.until('document.querySelector("[data-action=create-zones]")'));
      await t.click('[data-action=create-zones]');
      check('and goes on to the house', await t.until('__editorState().tool === "house"'));
      const items = await t.js('__editorState().plan.levels.flatMap((l) => l.items).length');
      check('devices in their rooms', items > 10, items);
      check('choices of buttons', await t.until('document.querySelector("[data-pick-action]")'));
      check('choices of variables', await t.until('document.querySelector("[data-pick-variable]")'));
      await t.js(`(() => { const el = document.querySelector('[data-pick-action="mood|m1"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await t.js(`(() => { const el = document.querySelector('[data-pick-variable="v_guests"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      check('saved on Homey', await (async () => { for (let i = 0; i < 40; i++) { const p = s.app.plans.list()[0]; if (p && (p.actions || []).length && (p.variables || []).length) return true; await sleep(150); } return false; })());
      await t.clean('editor');
      await t.close();
    });
  },

  async sizes(b) {
    await withApp({}, async (s, url) => {
      for (const [w, h] of [[320, 568], [360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [2560, 1440]]) {
        for (const scheme of ['dark', 'light']) {
          const t = await b.tablet({ width: w, height: h, scheme });
          await t.open(url, 1800);
          await t.until(ready);
          const wide = () => t.js('document.documentElement.scrollWidth - innerWidth');
          check(`${w}x${h} ${scheme}: fits the width`, await wide() <= 16, await wide());
          for (const sheet of ['lists', 'climate', 'alarm', 'vacuum']) {
            await t.click(`[data-sheet=${sheet}]`);
            await sleep(120);
            const fits = await t.js('(() => { const c = document.querySelector(".fp-sheet-card"); const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })()');
            check(`${w}x${h} ${scheme}: ${sheet} fits`, fits);
            await t.js('document.getElementById("sheet-close").click()');
          }
          check(`${w}x${h}: strip does not cover the plan`, await t.js('document.querySelector(".plan-card").getBoundingClientRect().height > 150'));
          await t.clean(`${w}x${h} ${scheme}`);
          await t.close();
        }
      }
    });
  },

  async english(b) {
    await withApp({ lang: 'en' }, async (s, url) => {
      const t = await b.tablet({ lang: 'en' });
      await t.open(url); await t.until(ready);
      const text = await t.js('document.body.innerText');
      check('English page', /Climate/.test(text) && /I'm leaving/.test(text), text.slice(0, 200));
      const dutch = /\b(Klimaat|Lijstjes|Ik ga weg|Boodschappen|Energie\b)/.exec(text);
      check('no Dutch left', !dutch, dutch && dutch[0]);
      await t.click('[data-sheet=lists]');
      check('English lists', await t.until('/Shopping/.test(document.getElementById("sheet-body").textContent)'));
      await t.clean('english');
      await t.close();
    });
  },

  async access(b) {
    await withApp({ config: { accessCode: 'geheim' } }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url, 1200);
      check('asks for the code', await t.js('!!document.querySelector("input[type=password]")'));
      await t.open(`${url}/?code=geheim`);
      check('in with the code', await t.until(ready));
      await t.open(`${url}/energy/`, 2000);
      check('Energy page too', await t.until('document.querySelectorAll("[data-block]").length > 0'));
      await t.close();
      const other = await b.tablet();
      await other.open(`${url}/energy/`, 1200);
      check('Energy page is closed without it', await other.js('!document.querySelectorAll("[data-block]").length'));
      await other.close();
    });
  },

  async failures(b) {
    await withApp({ failing: { users: true, logic: true, flow: true, moods: true, weather: true, setCapability: true } }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url);
      check('starts with half of Homey down', await t.until(ready));
      await t.click('[data-sheet=climate]');
      await t.until('document.querySelector("[data-act=step]")');
      await t.click('[data-act=step]');
      await sleep(400);
      check('a refused switch does not stop the page', await t.js('!!document.getElementById("sheet-body")'));
      t.problems = t.problems.filter((p) => !/^http 500/.test(p));
      await t.clean('failures');
      await t.close();
    });
    // The app restarts: the page reconnects by itself
    await withApp({}, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await s.app.webServer.stop();
      check('page says the connection is gone', await t.until('/Verbinden|Geen verbinding/.test(document.getElementById("status").textContent)', 12000));
      await s.app.webServer.start(s.port);
      check('and comes back by itself', await t.until('/Live/.test(document.getElementById("status").textContent)', 15000));
      t.problems = [];
      await t.close();
    });
  },

  async upgrade(b) {
    const oldPlan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'plan-0.1.7.json'), 'utf8'));
    await withApp({ plan: null, settings: { plans: { [oldPlan.id]: oldPlan }, calendars: [{ name: 'Gezin', url: 'https://example.com/a.ics', color: '#2e5bff' }] } }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url);
      check('a plan of 0.1.7 opens', await t.until(ready));
      await t.js(`document.querySelector('#levels [data-level="${oldPlan.levels[0].id}"]').click()`);
      check('its devices are there', await t.until('document.querySelector(".fp-device, .fp3-dev")'));
      await t.open(`${url}/editor`, 3000);
      check('it opens in the editor', await t.until('window.__editorState && __editorState().plan && __editorState().plan.levels.length === 2'));
      check('its rooms stayed', await t.js('__editorState().plan.levels[0].rooms.length') === oldPlan.levels[0].rooms.length);
      await t.clean('upgrade');
      await t.close();
    });
  },

  // With a real mouse: the tests above click through code, which skips what really lies on top of what.
  // The light of a lamp fades in 2D and 2.5D, also when the next update replaces the drawing halfway.
  async lamps(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      await t.js('(() => { const st = __widgetState(); st.view = "2d"; document.querySelector("#levels [data-level]:nth-of-type(2)").click(); })()');
      await t.until('document.querySelectorAll("[data-lamp]").length > 0');
      await sleep(600);
      check('a quiet update starts no fade', await t.js('document.querySelectorAll(".fp-lamp-in, .fp-lamp-out").length === 0'));
      const seen = await t.js(`(async () => {
        const st = __widgetState();
        const id = document.querySelector('[data-lamp]').dataset.lamp;
        const item = st.plan.levels.flatMap((l) => l.items).find((i) => i.id === id);
        await fetch('api/capability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: item.deviceId, capabilityId: 'onoff', value: false }) });
        const out = { during: 0 };
        for (let i = 0; i < 30 && !out.during; i++) { out.during = document.querySelectorAll('.fp-lamp-out').length; await new Promise((r) => setTimeout(r, 20)); }
        await new Promise((r) => setTimeout(r, 1500));
        out.gone = !document.querySelector('[data-lamp="' + id + '"]');
        return out;
      })()`);
      check('a lamp that goes off fades out', seen && seen.during > 0, seen);
      check('and then it is off', seen && seen.gone, seen);
      // In 3D no room label lies on a lamp, also on a small screen
      await t.js('(() => { __widgetState().view = "3d"; document.querySelectorAll("#levels [data-level]")[2].click(); document.querySelectorAll("#levels [data-level]")[1].click(); })()');
      await t.until('document.querySelector(".fp3-dev")');
      await sleep(2500);
      const covered = await t.js(`(() => {
        const hit = (a, r) => a.left + 2 < r.right && r.left + 2 < a.right && a.top + 2 < r.bottom && r.top + 2 < a.bottom;
        const labels = [...document.querySelectorAll('.fp3-room')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
        return [...document.querySelectorAll('.fp3-dev .fp3-dot')].filter((e) => e.offsetParent).filter((e) => labels.some((l) => hit(l, e.getBoundingClientRect()))).length;
      })()`);
      check('no room label on a lamp in 3D', covered === 0, covered);
      await t.clean('lamps');
      await t.close();
    });
  },

  async mouse(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet({ width: 1400, height: 900 });
      await t.open(url); await t.until(ready);
      await t.until('document.querySelectorAll(".h3-card").length >= 6');
      await sleep(2500);
      const spot = (y) => t.js(`(() => {
        const h = __widgetState().house; const D = h.shape.depth; const W = h.shape.width;
        const box = h.renderer.domElement.getBoundingClientRect();
        for (const x of [0, -1, 1, -2, 2, -3, 3, 1.6, -1.6, 2.4, -2.4]) {
          const p = h.camera.position.clone().set(x, ${y}, D / 2 + 0.02).project(h.camera);
          const cx = box.left + (p.x + 1) / 2 * box.width; const cy = box.top + (1 - p.y) / 2 * box.height;
          if (document.elementFromPoint(cx, cy) === h.renderer.domElement) return [cx, cy];
        }
        return null;
      })()`);
      const press = async (x, y) => {
        await t.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await t.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await t.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      };
      const levels = s.app.plans.list()[0].levels;
      for (const [i, y] of [[0, 1.6], [1, 4.4]]) {
        await t.js('document.querySelector("#levels [data-level=house]").click()');
        await t.until('__widgetState().levelId === "house" && !__widgetState().house.flying && !document.getElementById("house3d").hidden');
        await sleep(1500);
        const at = await spot(y);
        check(`storey ${i + 1}: a free spot on the wall`, !!at);
        await press(at[0], at[1]);
        check(`storey ${i + 1} opens with a mouse click on the wall`, await t.until(`__widgetState().levelId === ${JSON.stringify(levels[i].id)}`, 6000), await t.js('__widgetState().levelId'));
      }
        await t.js('document.querySelector("#levels [data-level=house]").click()');
      await t.until('__widgetState().levelId === "house" && !document.getElementById("house3d").hidden');
      await sleep(1500);
      const tag = await t.js('(() => { const r = document.querySelector(".h3-floor").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).className]; })()');
      await press(tag[0], tag[1]);
      check('a storey opens with a mouse click on its name', await t.until(`__widgetState().levelId !== "house"`, 6000), tag);
      await t.clean('mouse');
      await t.open(`${url}/editor`, 3000);
      await t.js('document.querySelector("[data-tool=house]").click()');
      await t.until('window.__editorState && __editorState().house && document.querySelector("#ed-house .h3-floor")');
      await sleep(2000);
      const second = await t.js(`(() => { const el = [...document.querySelectorAll('#ed-house .h3-floor')].find((x) => x.dataset.id === ${JSON.stringify(levels[1].id)}); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await press(second[0], second[1]);
      check('in the editor a storey opens from the house', await t.until(`__editorState().tool === 'select' && __editorState().levelId === ${JSON.stringify(levels[1].id)}`), await t.js('[__editorState().tool, __editorState().levelId]'));
      await t.clean('mouse editor');
      await t.close();
    });
  },

  async nothing(b) {
    await withApp({ plan: null, devices: [] }, async (s, url) => {
      const t = await b.tablet();
      await t.open(url, 2500);
      check('a Homey without a plan shows its message', await t.until('/Teken er een|plattegrond/i.test(document.body.innerText)'));
      await t.clean('nothing');
      await t.close();
    });
  },

  async soak(b) {
    await withApp({}, async (s, url) => {
      const t = await b.tablet();
      await t.open(url); await t.until(ready);
      const heap = async () => {
        await t.cmd('HeapProfiler.collectGarbage');
        const { result } = await t.cmd('Runtime.getHeapUsage');
        return result.usedSize;
      };
      const nodes = () => t.js('document.getElementsByTagName("*").length');
      await sleep(5000);
      const heap0 = await heap(); const nodes0 = await nodes();
      const end = Date.now() + SOAK * 1000;
      let n = 0;
      while (Date.now() < end) {
        n += 1;
        (await device(s, 'd_kitchen')).report('onoff', n % 2 === 0);
        (await device(s, 'd_speaker')).report('speaker_playing', n % 4 === 0);
        await s.homey.cards.action['show-on-screen']({ what: 'message', detail: `Bericht ${n}`, seconds: 1, screen: '' });
        await t.js('document.getElementById("ring").click()');
        await t.js(`document.querySelector('[data-sheet=climate]').click(); document.getElementById('sheet-close').click();`);
        await sleep(1000);
      }
      const heap1 = await heap(); const nodes1 = await nodes();
      const grew = (heap1 - heap0) / 1048576;
      console.log(`  soak: ${n} rounds, heap ${(heap0 / 1048576).toFixed(1)} -> ${(heap1 / 1048576).toFixed(1)} MB, elements ${nodes0} -> ${nodes1}`);
      check('page does not grow in memory', grew < 8, grew);
      check('page does not pile up elements', nodes1 - nodes0 < 60, nodes1 - nodes0);
      await t.clean('soak');
      await t.close();
    });
  },

};

(async () => {
  const b = new Browser();
  await b.start();
  try {
    for (const [name, part] of Object.entries(PARTS)) {
      if (only.length && !only.includes(name)) continue;
      console.log(`--- ${name}`);
      try {
        await part(b);
      } catch (err) {
        check(`${name} ran to the end`, false, String(err.stack || err));
      }
    }
  } finally {
    await b.stop();
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed`);
  bad.forEach((r) => console.log(`✖ ${r.name}`));
  process.exit(bad.length ? 1 : 0);
})();
