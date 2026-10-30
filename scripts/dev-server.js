'use strict';

// Runs the real web server (lib/WebServer.js) with a stand-in app and the sample home, without a Homey.
// Usage: node scripts/dev-server.js [--port=8687] [--code=1234] [--pin=0000] [--sibling-port=8686] [--demo=nl|en]
// --demo uses the two-storey demo house (test/demo-house.js) instead of the sample apartment.
const PlanStore = require('../lib/PlanStore');
const Diagnosis = require('../lib/Diagnosis');
const { WebServer } = require('../lib/WebServer');
const { samplePlan, sampleDevices } = require('../test/sample');
const demo = require('../test/demo-house');
const { demoEnergyDevices, demoDetail } = require('../test/demo-energy');
const { summarize } = require('../lib/EnergyHub');
const { createEnergyDemo } = require('../test/energy-demo');
const { HouseExtras } = require('../lib/HouseExtras');
const { Backup } = require('../lib/Backup');
const { ErrorReporter } = require('../lib/ErrorReporter');
const house = require('../lib/shared/house-core');

// The sun over the demo house, in the middle of the Netherlands.
const demoSun = (at) => house.sunPosition(52.1, 5.1, at);

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function createDevApp({ port, code = '', pin = '', siblingPort = null, demoLang = null, demoHour = null } = {}) {
  const store = new Map();
  const homey = { settings: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }, manifest: { version: 'dev', author: { name: 'Dev', email: 'you@example.com' } }, version: 'dev', platform: 'local' };
  const devices = demoLang ? demo.demoDevices(demoLang) : sampleDevices();
  const zones = demoLang ? demo.demoZones(demoLang) : [{ id: 'root', name: 'Home', parent: null }, ...['z_hall', 'z_living', 'z_kitchen', 'z_toilet', 'z_util', 'z_bed'].map((id) => ({ id, name: id.slice(2), parent: 'root' }))];
  let calendars = [];
  const app = {
    demoHour,
    homey,
    log: (...a) => console.log('[app]', ...a),
    error: (...a) => console.error('[app]', ...a),
    emit: (event, data) => { if (app.webServer) app.webServer.broadcast(event, data); },
    getConfig: () => ({ port, accessCode: code, editPin: pin }),
    async getData() {
      return { devices, zones };
    },
    async getPlanWithDevices(id) {
      const plan = (id && app.plans.get(id)) || app.plans.list()[0] || null;
      return { plan, devices, links: { dashboard: `http://localhost:${port}/`, editor: `http://localhost:${port}/editor`, port } };
    },
    async getEnergy() {
      // --hour=13 shows the energy of that hour of the day
      const at = new Date();
      if (app.demoHour !== null) at.setHours(app.demoHour, 0, 0, 0);
      const sun = demoSun(at);
      return { ...summarize(demoEnergyDevices(demoLang || 'nl', at)), gasToday: 3.4, sun, night: sun.height < -4 };
    },
    async getEnergyDetail(kind) {
      const at = new Date();
      if (app.demoHour !== null) at.setHours(app.demoHour, 0, 0, 0);
      return demoDetail(kind, at);
    },
    async getWeather() {
      const t = Math.round(Date.now() / 1000);
      return {
        now: { temperature: 11.4, state: demoLang === 'nl' ? 'Half bewolkt' : 'Partly cloudy', iconId: 'partly_cloudy_day' },
        hourly: [0, 1, 2, 3, 4].map((i) => ({ time: t + i * 3600, temperature: 11 + i * 0.4, iconId: i < 2 ? 'partly_cloudy_day' : 'rain' })),
        daily: [0, 1, 2, 3, 4, 5].map((i) => ({ time: t + i * 86400, temperatureMin: 6 + i, temperatureMax: 13 + i, iconId: i % 2 ? 'clear_day' : 'cloudy' })),
      };
    },
    async getAgenda() {
      const at = (d, h, m) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.getTime(); };
      const titles = demoLang === 'nl' ? ['Tandarts', 'Voetbaltraining', 'Groene container aan de straat']
        : demoLang ? ['Dentist', 'Football practice', 'Bins out'] : ['Standup', 'Tandarts', 'Vuilnis aan de straat'];
      return {
        events: [
          { title: titles[0], start: at(0, 9, 30), end: at(0, 10, 0), color: '#2e5bff' },
          { title: titles[1], start: at(0, 18, 30), end: at(0, 19, 45), color: '#e0453a' },
          { title: titles[2], start: at(1, 0, 0), end: at(2, 0, 0), allDay: true, color: '#3aa36b' },
        ],
        errors: [],
      };
    },
    async getSiblings() {
      return [{ key: 'energy', icon: '⚡', name: { en: 'Energy', nl: 'Energie' }, ...(siblingPort ? { port: siblingPort } : { path: 'energy/' }) }];
    },
    // Energy Dashboard's page with its demo data; with --sibling-port the sister app takes its place.
    async getEnergyPage() {
      if (siblingPort) return { port: siblingPort };
      if (!app.energyDemo) app.energyDemo = createEnergyDemo({ port, pin, lang: demoLang || 'nl' });
      return { server: app.energyDemo.webServer };
    },
    async getActionChoices() {
      return [{ kind: 'mood', id: 'm1', name: demoLang === 'en' ? 'Movie night' : 'Filmavond' }, { kind: 'flow', id: 'f1', name: demoLang === 'en' ? 'Good night' : 'Welterusten' }];
    },
    async runAction({ kind, id }) {
      app.ranAction = { kind, id };
      return true;
    },
    async setCapability({ deviceId, capabilityId, value }) {
      const d = devices.find((x) => x.id === deviceId);
      if (!d) throw Object.assign(new Error('Unknown device'), { status: 404 });
      d.caps[capabilityId] = value;
      setTimeout(() => app.emit('caps', { [deviceId]: { [capabilityId]: value } }), 30);
      return true;
    },
    // The Web API's device list, as the diagnosis reads it.
    hub: {
      api: {
        devices: {
          getDevices: async () => Object.fromEntries(devices.map((d) => [d.id, {
            id: d.id, name: d.name, zone: d.zone, class: d.cls, driverId: `homey:app:com.example:${d.cls}`, available: d.available !== false,
            capabilities: Object.keys(d.caps), capabilitiesObj: Object.fromEntries(Object.entries(d.caps).map(([k, v]) => [k, { value: v }])),
          }])),
        },
      },
    },
    hubReady: Promise.resolve(),
    getDiagnosisReport: (opts) => Diagnosis.buildReport(app, opts),
    getCalendars: () => calendars,
    setCalendars: (list) => { calendars = list; return calendars; },
  };
  // The real logic of lists, screens, variables and advice, on stand-ins for Homey's managers
  app.energyDetails = {
    pricesNow: async () => ({ price: 0.27, avg: 0.24, cheapest: { start: new Date(Date.now() + 3 * 3600000).toISOString(), hours: 3, avg: 0.19 } }),
    dayForecast: async () => ({ today: 12, tomorrow: 21 }),
  };
  const logic = { v_holiday: { id: 'v_holiday', name: demoLang === 'en' ? 'Holiday' : 'Vakantie', type: 'boolean', value: false }, v_guests: { id: 'v_guests', name: demoLang === 'en' ? 'Guests' : 'Gasten', type: 'number', value: 2 } };
  Object.assign(app.hub.api, {
    users: { getUsers: async () => ({ a: { name: 'Sam', present: true }, b: { name: 'Lou', present: false }, c: { name: 'Noor', present: true, asleep: true } }) },
    logic: { getVariables: async () => logic, updateVariable: async ({ id, variable }) => { logic[id].value = variable.value; } },
  });
  app.extras = new HouseExtras(app);
  app.backup = new Backup(app, require('os').tmpdir());
  app.reporter = new ErrorReporter(app);
  app.plans = new PlanStore(homey, app.emit);
  const plan = demoLang ? demo.demoPlan(demoLang) : samplePlan();
  app.plans.save(plan.id, plan);
  app.webServer = new WebServer({ app });
  return app;
}

module.exports = { createDevApp };

if (require.main === module) {
  const port = Number(arg('port', 8687));
  const app = createDevApp({ port, code: arg('code', ''), pin: arg('pin', ''), siblingPort: arg('sibling-port', null) && Number(arg('sibling-port')), demoLang: arg('demo', null), demoHour: arg('hour', null) === null ? null : Number(arg('hour')) });
  app.webServer.start(port).then(() => console.log(`Dashboard: http://localhost:${port}/   Editor: http://localhost:${port}/editor`));
}
