'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PinGuard, sameText, hash } = require('./guard');

const ROOT = path.join(__dirname, '..');
const ACCESS_COOKIE = 'floorplan_dashboard_access';
const MAX_BODY = 6 * 1024 * 1024; // a plan with a traced picture
const MAX_BACKUP = 48 * 1024 * 1024; // several plans with pictures

// Published path -> file in the app. The dashboard page reuses the widget's script and style.
const FILES = {
  '/': 'web/index.html',
  '/editor': 'web/editor.html',
  '/homey-web.js': 'web/homey-web.js',
  '/dashboard.js': 'web/dashboard.js',
  '/dashboard-extras.js': 'web/dashboard-extras.js',
  '/dashboard-panels.js': 'web/dashboard-panels.js',
  '/theme.js': 'web/theme.js',
  '/dashboard.css': 'web/dashboard.css',
  '/editor.js': 'web/editor.js',
  '/editor.css': 'web/editor.css',
  '/widget.js': 'widgets/floorplan/public/widget.js',
  '/widget.css': 'widgets/floorplan/public/widget.css',
  '/floorplan-core.js': 'lib/shared/floorplan-core.js',
  '/models.js': 'lib/shared/models.js',
  '/plan-detect.js': 'lib/shared/plan-detect.js',
  '/view3d.js': 'web/view3d.js',
  '/house3d.js': 'web/house3d.js',
  '/house-look.js': 'web/house-look.js',
  '/house-core.js': 'lib/shared/house-core.js',
  '/view3d.css': 'web/view3d.css',
  '/manifest.webmanifest': 'web/manifest.webmanifest',
  '/icon.svg': 'web/icon.svg',
  '/icon-192.png': 'web/icon-192.png',
  '/icon-512.png': 'web/icon-512.png',
};
// Folders served as they are: three.js and the furniture models (with their rendered views).
const STATIC_DIRS = ['/vendor/', '/models/'];
const PUBLIC = new Set(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
};

// A web page elsewhere can make a browser in the home send a POST here. Browsers say where it came from.
function fromElsewhere(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return true;
  const { origin } = req.headers;
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers['x-forwarded-host'] || req.headers.host);
  } catch (err) {
    return true;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data === undefined ? null : data));
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(Object.assign(new Error('Too much data'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const text = await readBody(req, limit);
  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    throw Object.assign(new Error('Invalid data'), { status: 400 });
  }
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

const LOGIN_TEXT = {
  nl: {
    title: 'HomeDeck', prompt: 'Vul de toegangscode in. Je vindt of wijzigt hem in de Homey-app bij de instellingen van HomeDeck.',
    label: 'Toegangscode', button: 'Openen', wrong: 'Verkeerde code.', locked: 'Te veel verkeerde codes. Probeer het straks opnieuw.',
  },
  en: {
    title: 'HomeDeck', prompt: 'Enter the access code. You can find or change it in the Homey app, in the settings of HomeDeck.',
    label: 'Access code', button: 'Open', wrong: 'Wrong code.', locked: 'Too many wrong codes. Try again later.',
  },
};

function loginPage(req, error) {
  const lang = /^nl\b/i.test(String(req.headers['accept-language'] || '')) ? 'nl' : 'en';
  const t = LOGIN_TEXT[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title><link rel="icon" href="icon.svg" type="image/svg+xml">
<style>
:root { --bg: #f2f2f7; --card: #fff; --text: #1c1c1e; --muted: #8a8a8e; --line: rgba(60,60,67,.2); --accent: #0a84ff; --error: #ff4d4f; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #000; --card: #1c1c1e; --text: #f5f5f7; --muted: #98989f; --line: rgba(235,235,245,.2); } }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
form { background: var(--card); border-radius: 22px; padding: 24px; width: 100%; max-width: 360px; box-sizing: border-box; }
h1 { margin: 0 0 8px; font-size: 28px; } p { color: var(--muted); margin: 0 0 16px; }
label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
input { width: 100%; box-sizing: border-box; font: inherit; font-size: 17px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--text); }
button { margin-top: 14px; width: 100%; font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }
.error { color: var(--error); margin: 12px 0 0; }
</style></head><body>
<form method="post" action="/login"><h1>${t.title}</h1><p>${t.prompt}</p>
<label for="code">${t.label}</label><input id="code" name="code" type="password" autocomplete="current-password" autofocus required>
<button type="submit">${t.button}</button>${error ? `<p class="error">${t[error]}</p>` : ''}</form></body></html>`;
}

/**
 * The dashboard and editor as web pages on the local network, with the same data and controls as the widget.
 * Reading and switching devices needs the access code (when set); changing plans and calendars also the edit PIN.
 */
class WebServer {

  constructor({ app }) {
    this.app = app;
    this.server = null;
    this.port = null;
    this.status = { running: false, port: null, message: null };
    this.accessGuard = new PinGuard();
    this.editGuard = new PinGuard();
    this.clients = new Set();
    this.keepAlive = null;
  }

  log(...args) { this.app.log(...args); }

  /* ---------------------------------------------------------- access */

  accessToken() {
    const code = this.app.getConfig().accessCode;
    return code ? hash('floorplan-dashboard', code) : null;
  }

  editToken() {
    const pin = this.app.getConfig().editPin;
    return pin ? hash('floorplan-edit', pin) : null;
  }

  // True when the request may go on; otherwise it has been answered (login page or 401).
  async checkAccess(req, res, url) {
    const token = this.accessToken();
    if (!token) return true;
    if (sameText(cookieValue(req, ACCESS_COOKIE) || '', token)) {
      if (url.pathname !== '/login') return true;
      res.writeHead(303, { Location: '/' }).end();
      return false;
    }
    if (PUBLIC.has(url.pathname)) return true;
    let given = null;
    if (url.pathname === '/login' && req.method === 'POST') given = new URLSearchParams(await readBody(req, 4096)).get('code') || '';
    else if (req.method === 'GET' && url.searchParams.has('code')) given = url.searchParams.get('code');
    if (given !== null) {
      try {
        this.accessGuard.check(this.app.getConfig().accessCode, given);
        const back = url.pathname === '/login' ? '/' : url.pathname;
        res.writeHead(303, {
          Location: back,
          'Set-Cookie': `${ACCESS_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
          'Cache-Control': 'no-store',
        }).end();
      } catch (err) {
        this.sendLogin(req, res, err.status === 429 ? 'locked' : 'wrong', 403);
      }
      return false;
    }
    if (url.pathname.startsWith('/api/')) sendJson(res, 401, { error: 'Access code needed' });
    else this.sendLogin(req, res, null, 401);
    return false;
  }

  sendLogin(req, res, error, status) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(loginPage(req, error));
  }

  requireEdit(req) {
    const token = this.editToken();
    if (!token) return;
    if (!sameText(req.headers['x-edit-token'] || '', token)) throw Object.assign(new Error('Edit PIN needed'), { status: 403, pin: true });
  }

  /* --------------------------------------------------------- routing */

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method !== 'GET' && fromElsewhere(req)) return sendJson(res, 403, { error: 'Not from this page' });
      if (!(await this.checkAccess(req, res, url))) return undefined;
      if (url.pathname === '/energy' || url.pathname.startsWith('/energy/')) return await this.handleEnergy(req, res, url);
      if (url.pathname.startsWith('/api/')) return await this.handleApi(req, res, url);
      if (req.method !== 'GET') return res.writeHead(405).end();
      return this.serveFile(res, url.pathname);
    } catch (err) {
      if (!err.status) this.app.error(`${url.pathname}: ${err.message}`);
      return sendJson(res, err.status || 500, { error: err.message, pin: err.pin || undefined });
    }
  }

  // Energy Dashboard's page and settings; with that app installed its own page.
  async handleEnergy(req, res, url) {
    const page = await this.app.getEnergyPage();
    if (page.port) return res.writeHead(302, { Location: `http://${url.hostname === 'localhost' ? (req.headers.host || '').split(':')[0] : url.hostname}:${page.port}/` }).end();
    if (!page.server) return sendJson(res, 503, { error: 'Energy page is starting' });
    if (url.pathname === '/energy') return res.writeHead(301, { Location: 'energy/' }).end();
    return page.server.route(req, res);
  }

  async handleApi(req, res, url) {
    const route = url.pathname.slice(4); // keep the leading slash
    const m = req.method;
    const app = this.app;
    if (route === '/events' && m === 'GET') return this.openEvents(req, res);
    if (route === '/plan' && m === 'GET') return sendJson(res, 200, await app.getPlanWithDevices(url.searchParams.get('id')));
    if (route === '/plans' && m === 'GET') return sendJson(res, 200, app.plans.list());
    if (route === '/data' && m === 'GET') return sendJson(res, 200, await app.getData());
    if (route === '/energy' && m === 'GET') return sendJson(res, 200, await app.getEnergy());
    if (route === '/energy-detail' && m === 'GET') {
      const kind = url.searchParams.get('kind');
      if (!/^(solar|battery|grid|car|heatpump|airco)$/.test(kind || '')) return sendJson(res, 400, { error: 'Unknown part' });
      return sendJson(res, 200, await app.getEnergyDetail(kind, url.searchParams.get('plan')));
    }
    if (route === '/weather' && m === 'GET') return sendJson(res, 200, await app.getWeather());
    if (route === '/agenda' && m === 'GET') return sendJson(res, 200, await app.getAgenda());
    if (route === '/siblings' && m === 'GET') return sendJson(res, 200, await app.getSiblings());
    if (route === '/diagnosis-report' && m === 'GET') return sendJson(res, 200, await app.getDiagnosisReport({ plan: url.searchParams.get('plan') === '1' }));
    if (route === '/capability' && m === 'POST') {
      const body = await readJson(req);
      // Turning an alarm down needs the edit PIN, wherever it is asked from
      if (body && body.capabilityId === 'homealarm_state' && body.value !== 'armed') this.requireEdit(req);
      return sendJson(res, 200, await app.setCapability(body));
    }
    if (route === '/backup') {
      this.requireEdit(req);
      if (m === 'GET') return sendJson(res, 200, app.backup.make());
      if (m === 'POST') return sendJson(res, 200, app.backup.restore(await readJson(req, MAX_BACKUP)));
    }
    if (route === '/backups' && m === 'GET') {
      this.requireEdit(req);
      return sendJson(res, 200, app.backup.copies());
    }
    if (route === '/backups/restore' && m === 'POST') {
      this.requireEdit(req);
      const { file } = (await readJson(req)) || {};
      return sendJson(res, 200, app.backup.restoreCopy(file));
    }
    // A script error of a page. Only the place in the code goes on, and only when reporting is on.
    if (route === '/client-error' && m === 'POST') {
      const body = (await readJson(req, 8192)) || {};
      const stack = `x\n${String(body.stack || '').split('\n').map((l) => { const hit = /\/([\w-]+\.js)(?:\?[^:\s]*)?:(\d+)/.exec(l); return hit ? `at web/${hit[1]}:${hit[2]}` : ''; }).filter(Boolean).join('\n')}`;
      app.reporter.capture({ message: String(body.message || 'Error').slice(0, 300), stack }, 'page');
      return sendJson(res, 200, true);
    }
    if (route === '/advice' && m === 'GET') return sendJson(res, 200, await app.extras.getAdvice(url.searchParams.get('plan')));
    if (route === '/waste' && m === 'GET') return sendJson(res, 200, await app.extras.getWaste());
    if (route === '/people' && m === 'GET') return sendJson(res, 200, await app.extras.getPeople());
    if (route === '/lists' && m === 'GET') return sendJson(res, 200, app.extras.getLists());
    if (route === '/lists' && m === 'PUT') return sendJson(res, 200, app.extras.setLists(await readJson(req)));
    if (route === '/variables' && m === 'GET') return sendJson(res, 200, await app.extras.getVariables(url.searchParams.get('plan')));
    if (route === '/variables/choices' && m === 'GET') {
      this.requireEdit(req);
      return sendJson(res, 200, await app.extras.getVariableChoices());
    }
    const screen = /^\/screens\/([^/]+)$/.exec(route);
    if (screen) {
      const name = decodeURIComponent(screen[1]);
      if (m === 'GET') return sendJson(res, 200, app.extras.getScreen(name));
      if (m === 'PUT') return sendJson(res, 200, app.extras.setScreen(name, await readJson(req)));
    }
    if (route === '/edit' && m === 'GET') {
      const token = this.editToken();
      return sendJson(res, 200, { pinRequired: !!token, unlocked: !token || sameText(req.headers['x-edit-token'] || '', token) });
    }
    if (route === '/unlock' && m === 'POST') {
      const { pin } = (await readJson(req)) || {};
      this.editGuard.check(app.getConfig().editPin, String(pin || ''));
      return sendJson(res, 200, { token: this.editToken() });
    }
    if (route === '/actions/run' && m === 'POST') return sendJson(res, 200, await app.runAction(await readJson(req)));
    if (route === '/actions/choices' && m === 'GET') {
      this.requireEdit(req);
      return sendJson(res, 200, await app.getActionChoices());
    }
    if (route === '/calendars') {
      this.requireEdit(req);
      if (m === 'GET') return sendJson(res, 200, app.getCalendars());
      if (m === 'PUT') return sendJson(res, 200, app.setCalendars(await readJson(req)));
    }
    const plan = /^\/plans\/([\w-]+)$/.exec(route);
    if (plan && (m === 'PUT' || m === 'DELETE')) {
      this.requireEdit(req);
      if (m === 'PUT') return sendJson(res, 200, app.plans.save(plan[1], await readJson(req)));
      return sendJson(res, 200, app.plans.remove(plan[1]));
    }
    return sendJson(res, 404, { error: 'Unknown' });
  }

  serveFile(res, pathname) {
    if (STATIC_DIRS.some((d) => pathname.startsWith(d))) {
      const base = path.join(ROOT, 'web');
      let file;
      try { file = path.normalize(path.join(base, decodeURIComponent(pathname))); } catch (err) { return res.writeHead(400).end(); }
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
      // Models and libraries change only with the app version (the page asks with ?v=), so they may be kept.
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
      return fs.createReadStream(file).pipe(res);
    }
    const rel = FILES[pathname];
    if (!rel) return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (path.extname(file) === '.html') {
      // The app version on scripts and styles, so a browser never runs old code with new data.
      const version = encodeURIComponent((this.app.homey && this.app.homey.manifest && this.app.homey.manifest.version) || '0');
      return res.end(fs.readFileSync(file, 'utf8').replace(/(src|href)="([\w-]+\.(?:js|css))"/g, (s, attr, name) => `${attr}="${name}?v=${version}"`));
    }
    return fs.createReadStream(file).pipe(res);
  }

  /* --------------------------------------------------------- realtime */

  // Server-Sent Events: the same events the widget gets through Homey's realtime.
  openEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
    return undefined;
  }

  broadcast(event, data) {
    if (!this.clients.size) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(msg);
  }

  /* ------------------------------------------------------- lifecycle */

  async start(port) {
    if (this.server && this.port === port && this.status.running) return;
    await this.stop();
    this.port = port;
    this.server = http.createServer((req, res) => { this.handle(req, res); });
    await new Promise((resolve) => {
      this.server.once('error', (err) => {
        this.status = {
          running: false, port, reason: err.code === 'EADDRINUSE' ? 'portInUse' : null, message: err.message,
        };
        this.app.error(`Web server on port ${port} failed: ${err.message}`);
        resolve();
      });
      this.server.listen(port, () => {
        this.status = { running: true, port, message: null };
        this.log(`Dashboard available on port ${port}`);
        resolve();
      });
    });
    // Proxies and tablets drop quiet connections; a comment every 25 s keeps them open.
    if (!this.keepAlive) this.keepAlive = setInterval(() => { for (const res of this.clients) res.write(': ping\n\n'); }, 25000);
  }

  async stop() {
    if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null; }
    for (const res of this.clients) res.end();
    this.clients.clear();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(() => resolve()));
    this.status = { running: false, port: null, message: null };
  }

}

module.exports = { WebServer, ACCESS_COOKIE, FILES, STATIC_DIRS };
