'use strict';

const http = require('http');
const Homey = require('homey');
const DeviceHub = require('./lib/DeviceHub');
const { EnergyHub } = require('./lib/EnergyHub');
const { EnergyDetails } = require('./lib/EnergyDetails');
const { EnergyEngine } = require('./lib/EnergyEngine');
const house = require('./lib/shared/house-core');
const { HouseExtras } = require('./lib/HouseExtras');
const { Backup } = require('./lib/Backup');
const { ErrorReporter } = require('./lib/ErrorReporter');
const PlanStore = require('./lib/PlanStore');
const Calendar = require('./lib/Calendar');
const { WebServer } = require('./lib/WebServer');
const Diagnosis = require('./lib/Diagnosis');

const DEFAULT_PORT = 8687; // Energy Dashboard uses 8686
const ENERGY_APP = 'com.drpeppers.energydashboard';
const ENERGY_CHECK = 10 * 60 * 1000;
// Sister apps with a dashboard web page of their own; the pages show a switch to each one that is installed.
const SIBLINGS = [
  // ports and manifestName: how to find an older version without /dashboard-link: its web page on one of
  // these ports, recognised by the name in its web manifest (owners do change the default 8686).
  {
    appId: ENERGY_APP, key: 'energy', icon: '⚡', name: { en: 'Energy', nl: 'Energie' },
    ports: [8686, 8080, 8000, 8081, 8888, 9000, 3000], manifestName: /^Energ(y|ie) Dashboard$/,
  },
];

class FloorplanApp extends Homey.App {

  // The last errors are kept for the diagnosis report.
  error(...args) {
    this.recentErrors = (this.recentErrors || []).concat(`${new Date().toISOString().slice(0, 16)} ${args.map((a) => (a && a.message) || String(a)).join(' ')}`).slice(-20);
    super.error(...args);
    if (this.reporter) {
      const found = args.find((a) => a instanceof Error);
      this.reporter.capture({ message: args.map((a) => (a && a.message) || String(a)).join(' '), stack: found && found.stack });
    }
  }

  // The anonymous report for "Report a problem" (dashboard and app settings).
  getDiagnosisReport(opts) {
    return Diagnosis.buildReport(this, opts);
  }

  async onInit() {
    // Apps run in UTC; "today" and the hours of the charts follow the Homey
    process.env.TZ = this.homey.clock.getTimezone();
    // Only when the owner turned it on (off by default), see lib/ErrorReporter.js
    this.reporter = new ErrorReporter(this);
    process.on('uncaughtExceptionMonitor', (err) => this.reporter.capture(err));
    const emit = (event, data) => this.emit(event, data);
    this.plans = new PlanStore(this.homey, emit);
    this.hub = new DeviceHub(this.homey, emit);
    this.energy = new EnergyHub(this.hub, () => this.energyConfig());
    this.energyDetails = new EnergyDetails(this);
    this.hubReady = this.hub.init().catch((err) => {
      this.error('Could not connect to the Homey Web API', err);
      throw err;
    });
    this.webServer = new WebServer({ app: this });
    await this.webServer.start(this.getConfig().port);
    this.homey.settings.on('set', (key) => {
      if (key === 'config') this.webServer.start(this.getConfig().port).catch((err) => this.error(err));
    });
    this.extras = new HouseExtras(this);
    this.extras.registerFlows();
    this.backup = new Backup(this);
    this.backup.keepBeforeUpdate();
    this.guardEnergyCards();
    this.startEnergy().catch((err) => this.error('Energy page', err));
    this.homey.setInterval(() => this.startEnergy().catch((err) => this.error('Energy page', err)), ENERGY_CHECK);

    const widget = this.homey.dashboards.getWidget('floorplan');
    widget.registerSettingAutocompleteListener('plan', async (query) => {
      return this.plans.list()
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .map((p) => ({ name: p.name, description: `${p.levels.length} level(s)`, id: p.id }));
    });
    widget.registerSettingAutocompleteListener('level', async (query, settings) => {
      const plan = settings.plan && this.plans.get(settings.plan.id);
      const plans = plan ? [plan] : this.plans.list();
      return plans.flatMap((p) => p.levels.map((l) => ({
        name: l.name,
        description: p.name,
        id: l.id,
        planId: p.id,
      }))).filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
    });

    this.log('HomeDeck started');
    if (Homey.env && Homey.env.FP_DIAGNOSTICS === '1') this.diagnose().catch((err) => this.error('diagnostics failed', err));
    if (Homey.env && Homey.env.FP_SEED_PLAN === '1') this.seedPlan().catch((err) => this.error('seeding failed', err));
  }

  // Development helper: when there is no plan yet, create one from the Homey zones with devices placed per room.
  async seedPlan() {
    if (this.plans.list().length) return;
    const core = require('./lib/shared/floorplan-core');
    const { devices, zones } = await this.getData();
    const plan = core.newPlan('Ons huis');
    const levels = core.levelsFromZones(zones);
    if (levels.length) plan.levels = levels;
    let placed = 0;
    for (const level of plan.levels) {
      for (const room of level.rooms) {
        const items = core.autoPlace(room, devices.filter((d) => d.zone === room.zoneId));
        level.items.push(...items);
        placed += items.length;
      }
    }
    this.plans.save(plan.id, plan);
    this.log(`[seed] created a plan with ${plan.levels.length} level(s) and ${placed} placed device(s)`);
  }

  // Read-only self check for development: logs counts and data shapes, never names or locations.
  async diagnose() {
    const core = require('./lib/shared/floorplan-core');
    const started = Date.now();
    const { devices, zones } = await this.getData();
    const kinds = {};
    for (const d of devices) {
      const k = core.deviceKind(d);
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const levels = core.levelsFromZones(zones);
    this.log(`[diag] getData ${Date.now() - started} ms, ${devices.length} devices, ${zones.length} zones, payload ${JSON.stringify({ devices, zones }).length} bytes`);
    this.log(`[diag] device kinds ${JSON.stringify(kinds)}`);
    this.log(`[diag] zones -> ${levels.length} level(s) with ${levels.map((l) => l.rooms.length).join('/')} room(s)`);
    this.log(`[diag] devices with values beside them: ${devices.filter((d) => core.deviceValueText(d)).length}`);
    const groups = devices.filter((d) => d.group);
    const groupKinds = {};
    for (const d of groups) { const k = `${core.deviceKind(d)}/${d.cls}`; groupKinds[k] = (groupKinds[k] || 0) + 1; }
    this.log(`[diag] group devices: ${groups.length} ${JSON.stringify(groupKinds)}`);
    const shape = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : typeof v])) : typeof o);
    try {
      const w = await this.getWeather();
      this.log(`[diag] weather.now keys ${JSON.stringify(shape(w.now))}`);
      this.log(`[diag] weather.hourly ${w.hourly.length} item(s), first ${JSON.stringify(w.hourly[0] || null)}`);
      this.log(`[diag] weather.daily ${w.daily.length} item(s), first ${JSON.stringify(w.daily[0] || null)}`);
    } catch (err) {
      this.log(`[diag] weather failed: ${err.message}`);
    }
    // Wait for a few realtime batches to prove the capability subscription works.
    let batches = 0; let changes = 0;
    const orig = this.hub._emit.bind(this.hub);
    this.hub._emit = (event, data) => {
      if (event === 'caps') { batches++; changes += Object.keys(data).length; }
      orig(event, data);
    };
    this.homey.setTimeout(() => {
      this.hub._emit = orig;
      this.log(`[diag] realtime: ${batches} batch(es), ${changes} device update(s) in 60 s`);
    }, 60000);
  }

  // Realtime events go to widgets on Homey dashboards and to open web pages.
  emit(event, data) {
    try {
      this.homey.api.realtime(event, data);
    } catch (err) {
      this.error('realtime failed', err);
    }
    if (this.webServer) this.webServer.broadcast(event, data);
  }

  /* --------------------------------------------------------- settings */

  getConfig() {
    const saved = this.homey.settings.get('config') || {};
    const port = Number(saved.port);
    return {
      port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT,
      accessCode: typeof saved.accessCode === 'string' ? saved.accessCode : '',
      editPin: typeof saved.editPin === 'string' ? saved.editPin : '',
      reportErrors: saved.reportErrors === true,
    };
  }

  setConfig(body) {
    const cur = this.getConfig();
    const next = { ...cur };
    if (body && body.port !== undefined) {
      const port = Number(body.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535');
      next.port = port;
    }
    if (body && typeof body.accessCode === 'string') next.accessCode = body.accessCode.trim().slice(0, 64);
    if (body && typeof body.editPin === 'string') next.editPin = body.editPin.trim().slice(0, 32);
    if (body && typeof body.reportErrors === 'boolean') next.reportErrors = body.reportErrors;
    this.homey.settings.set('config', next);
    return this.getSettingsInfo();
  }

  // Links to the web pages, using Homey's address on the local network.
  async getLinks() {
    const { port } = this.getConfig();
    let host = null;
    try {
      const local = await this.homey.cloud.getLocalAddress(); // "192.168.1.x:80"
      host = String(local).split(':')[0];
    } catch (err) {
      this.error('local address unknown', err.message);
    }
    if (!host) return { dashboard: null, editor: null, port };
    return { dashboard: `http://${host}:${port}/`, editor: `http://${host}:${port}/editor`, port };
  }

  async getSettingsInfo() {
    const cfg = this.getConfig();
    return {
      config: cfg,
      canReport: !!this.reporter.endpoint,
      status: this.webServer ? this.webServer.status : null,
      links: await this.getLinks(),
      siblings: await this.getSiblings(),
      plans: this.plans.list().map((p) => ({ id: p.id, name: p.name, levels: p.levels.length })),
    };
  }

  // For sister apps: where this dashboard runs.
  getDashboardLink() {
    const status = this.webServer ? this.webServer.status : {};
    return { port: this.getConfig().port, running: !!status.running, name: { en: 'Home', nl: 'Huis' }, icon: '🏠' };
  }

  // Sister dashboards that are installed and running, asked through app-to-app API calls; cached for a minute.
  async getSiblings() {
    if (this.siblingCache && Date.now() - this.siblingCache.at < 60000) return this.siblingCache.list;
    const list = [];
    // Why a sister app has no switch, for the diagnosis report.
    this.siblingStatus = {};
    const note = (key, text) => { this.siblingStatus[key] = text; this.log(`[siblings] ${key}: ${text}`); };
    await Promise.all(SIBLINGS.map(async (s) => {
      try {
        const api = this.homey.api.getApiApp(s.appId);
        if (!(await api.getInstalled())) {
          // Installed but not running answers false too; the Web API knows which it is.
          const info = await this.hub.api.apps.getApp({ id: s.appId }).catch(() => null);
          note(s.key, info ? `installed, state ${info.state}, version ${info.version}` : 'not installed');
          return;
        }
        let link = null;
        try {
          link = await api.get('/dashboard-link');
        } catch (err) {
          link = null;
        }
        // Too old to answer: its page may still run on its default port.
        if (!(link && link.port) && s.ports) {
          const port = await this.findDashboard(s.ports, s.manifestName);
          if (port) link = { running: true, port };
        }
        if (!link) note(s.key, 'installed, no dashboard found');
        else note(s.key, `port ${link.port}${link.running ? '' : ', not running'}`);
        if (link && link.running && link.port) list.push({ key: s.key, icon: s.icon, name: s.name, port: link.port });
      } catch (err) {
        // Not installed or not allowed: no switch for it.
        note(s.key, `error: ${err.message || err}`);
      }
    }));
    if (this.energyEngine && !list.length) list.push({ key: 'energy', icon: '⚡', name: SIBLINGS[0].name, path: 'energy/' });
    this.siblingCache = { at: Date.now(), list };
    return list;
  }

  // The first of these ports where a web page with this manifest name answers, on the Homey itself or on
  // its LAN address (apps can run in containers of their own). All ports are asked at once, 1.5 s each.
  async findDashboard(ports, manifestName) {
    const hosts = ['127.0.0.1'];
    try { hosts.push(String(await this.homey.cloud.getLocalAddress()).split(':')[0]); } catch (err) { /* local only */ }
    const manifest = (host, port) => new Promise((resolve) => {
      const req = http.get({ host, port, path: '/manifest.webmanifest', timeout: 1500 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { if (body.length < 20000) body += d; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (err) { resolve(null); } });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
    for (const host of hosts) {
      const found = await Promise.all(ports.map(async (port) => {
        const m = await manifest(host, port);
        return m && manifestName.test(String(m.name || '')) ? port : null;
      }));
      const port = found.find(Boolean);
      if (port) return port;
    }
    return null;
  }

  async getPlanWithDevices(id) {
    const plans = this.plans.list();
    const plan = (id && this.plans.get(id)) || plans[0] || null;
    const { devices } = await this.getData();
    return { plan, devices, links: await this.getLinks() };
  }

  async getData() {
    await this.hubReady;
    const [devices, zones] = await Promise.all([this.hub.getDevices(), this.hub.getZones()]);
    return { devices, zones };
  }

  // Homey's own weather for its location; cached because several widgets may ask at once.
  async getWeather() {
    await this.hubReady;
    if (this.weatherCache && Date.now() - this.weatherCache.at < 10 * 60 * 1000) return this.weatherCache.data;
    const now = await this.hub.api.weather.getWeather();
    // Keep only primitive fields: the location (city, country) and screensaver data are not needed on a dashboard.
    const pick = (o) => Object.fromEntries(Object.entries(o || {})
      .filter(([k, v]) => !['city', 'country', 'screensaver', 'screensaverId', 'videoId', 'id'].includes(k) && v !== null && typeof v !== 'object'));
    const data = {
      now: pick(now),
      hourly: (now.forecastHourly || []).map(pick),
      daily: (now.forecast || []).map(pick),
    };
    this.weatherCache = { at: Date.now(), data };
    return data;
  }

  // The Energy page: Energy Dashboard's own logic runs here, unless that app is installed. Then it stays the place
  // for energy, with its settings and history, and nothing is done twice.
  async startEnergy() {
    await this.hubReady;
    const installed = await this.energyAppInstalled();
    if (this.energyEngine) {
      if (!installed) return;
      const engine = this.energyEngine;
      this.energyEngine = null;
      this.siblingCache = null;
      await engine.stop();
      this.guardEnergyCards();
      return;
    }
    if (installed) return;
    const engine = new EnergyEngine(this);
    try {
      await engine.onInit();
    } catch (err) {
      await engine.stop().catch(() => {});
      throw err;
    }
    this.energyEngine = engine;
    this.siblingCache = null;
  }

  // What can be a button on the dashboard: moods, and Flows that can be started by hand.
  async getActionChoices() {
    await this.hubReady;
    const { flow, moods } = this.hub.api;
    const read = (promise) => promise.then((o) => Object.values(o || {})).catch(() => []);
    const [plain, advanced, all] = await Promise.all([read(flow.getFlows()), read(flow.getAdvancedFlows()), read(moods.getMoods())]);
    const names = (list, kind) => list.map((x) => ({ kind, id: x.id, name: x.name }));
    return [...names(all, 'mood'), ...names(plain.filter((f) => f.triggerable && f.enabled !== false), 'flow'), ...names(advanced.filter((f) => f.triggerable && f.enabled !== false), 'advanced')]
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Only what is on the plan can be started from the web page.
  async runAction({ plan, kind, id } = {}) {
    const buttons = (p) => (p.actions || []).concat(p.levels.flatMap((l) => (l.rooms || []).map((r) => r.vacuum).filter(Boolean)));
    const known = this.plans.list().some((p) => (!plan || p.id === plan) && buttons(p).some((a) => a.kind === kind && a.id === id));
    if (!known) throw Object.assign(new Error('Not a button of this plan'), { status: 403 });
    await this.hubReady;
    const { flow, moods } = this.hub.api;
    if (kind === 'mood') await moods.setMood({ id });
    else if (kind === 'advanced') await flow.triggerAdvancedFlow({ id });
    else await flow.triggerFlow({ id });
    return true;
  }

  // The Flow cards of the Energy page work while it runs here (it then takes these cards over).
  guardEnergyCards() {
    const message = this.homey.i18n.getLanguage() === 'nl'
      ? 'Energie Dashboard is geïnstalleerd: gebruik de kaart van die app.'
      : 'Energy Dashboard is installed: use the card of that app.';
    for (const id of ['shower-start', 'shower-stop', 'tapwater-source']) {
      this.homey.flow.getActionCard(id).registerRunListener(async () => { throw new Error(message); });
    }
  }

  async energyAppInstalled() {
    if (await this.homey.api.getApiApp(ENERGY_APP).getInstalled().catch(() => false)) return true;
    const info = await this.hub.api.apps.getApp({ id: ENERGY_APP }).catch(() => null);
    return !!info;
  }

  // Which energy devices were chosen; the sister app keeps its own choice.
  energyConfig() {
    return this.energyEngine ? this.energyEngine.getConfig() : {};
  }

  // What /energy/ shows: the server of the page here, or the port of the sister app.
  async getEnergyPage() {
    if (this.energyEngine) return { server: this.energyEngine.webServer };
    const sister = (await this.getSiblings()).find((s) => s.key === 'energy' && s.port);
    return sister ? { port: sister.port } : {};
  }

  // Power of the sun, grid, battery, car and house for the house view, with Energy Dashboard's own calculation.
  async getEnergy() {
    await this.hubReady;
    const live = await this.energy.getLive();
    if (typeof live.gasM3 === 'number') live.gasToday = await this.energyDetails.gasToday().catch(() => null);
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    if (typeof lat !== 'number' || typeof lon !== 'number') return live;
    const sun = house.sunPosition(lat, lon, new Date());
    return { ...live, sun, night: sun.height < -4 };
  }

  // Today's power of one part of the house (solar, battery, grid, car, heatpump, airco), with the solar forecast.
  async getEnergyDetail(kind, planId) {
    await this.hubReady;
    const plan = (planId && this.plans.get(planId)) || this.plans.list()[0] || null;
    return this.energyDetails.get(kind, plan);
  }

  getCalendars() {
    return this.homey.settings.get('calendars') || [];
  }

  setCalendars(list) {
    if (!Array.isArray(list)) throw new Error('Invalid calendars');
    const clean = list.slice(0, 10)
      .filter((c) => c && typeof c.url === 'string' && /^(https?|webcal):\/\//i.test(c.url.trim()))
      .map((c) => ({ url: c.url.trim(), name: String(c.name || '').slice(0, 60), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#2e5bff' }));
    this.homey.settings.set('calendars', clean);
    this.agendaCache = null;
    return clean;
  }

  // Upcoming events from the configured iCal links. The links themselves never leave the app.
  async getAgenda() {
    if (this.agendaCache && Date.now() - this.agendaCache.at < 10 * 60 * 1000) return this.agendaCache.data;
    const tz = this.homey.clock.getTimezone();
    const calendars = this.getCalendars();
    const all = []; const errors = [];
    await Promise.all(calendars.map(async (c, i) => {
      try {
        const events = Calendar.parseICS(await Calendar.fetchText(c.url), tz);
        for (const ev of events) { ev.calendar = c.name || `#${i + 1}`; ev.color = c.color; }
        all.push(...events);
      } catch (err) {
        this.error(`calendar ${i + 1} failed: ${err.message}`);
        errors.push(c.name || `#${i + 1}`);
      }
    }));
    const now = Date.now();
    const data = { timezone: tz, events: Calendar.upcoming(all, now, now + 14 * 86400000, 15), errors };
    this.agendaCache = { at: now, data };
    return data;
  }

  async setCapability(body) {
    await this.hubReady;
    return this.hub.setCapability(body);
  }

  async onUninit() {
    if (this.webServer) await this.webServer.stop();
    if (this.hub) await this.hub.destroy();
  }

}

module.exports = FloorplanApp;
