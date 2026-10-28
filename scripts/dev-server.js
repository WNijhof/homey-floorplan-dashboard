'use strict';

// Runs the real web server (lib/WebServer.js) with a stand-in app and the sample home, without a Homey.
// Usage: node scripts/dev-server.js [--port=8687] [--code=1234] [--pin=0000] [--sibling-port=8686] [--demo=nl|en]
// --demo uses the two-storey demo house (test/demo-house.js) instead of the sample apartment.
const PlanStore = require('../lib/PlanStore');
const Diagnosis = require('../lib/Diagnosis');
const { WebServer } = require('../lib/WebServer');
const { samplePlan, sampleDevices } = require('../test/sample');
const demo = require('../test/demo-house');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function createDevApp({ port, code = '', pin = '', siblingPort = null, demoLang = null } = {}) {
  const store = new Map();
  const homey = { settings: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }, manifest: { version: 'dev', author: { name: 'Dev', email: 'you@example.com' } }, version: 'dev', platform: 'local' };
  const devices = demoLang ? demo.demoDevices(demoLang) : sampleDevices();
  const zones = demoLang ? demo.demoZones(demoLang) : [{ id: 'root', name: 'Home', parent: null }, ...['z_hall', 'z_living', 'z_kitchen', 'z_toilet', 'z_util', 'z_bed'].map((id) => ({ id, name: id.slice(2), parent: 'root' }))];
  let calendars = [];
  const app = {
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
      return siblingPort ? [{ key: 'energy', icon: '⚡', name: { en: 'Energy', nl: 'Energie' }, port: siblingPort }] : [];
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
  app.plans = new PlanStore(homey, app.emit);
  const plan = demoLang ? demo.demoPlan(demoLang) : samplePlan();
  app.plans.save(plan.id, plan);
  app.webServer = new WebServer({ app });
  return app;
}

module.exports = { createDevApp };

if (require.main === module) {
  const port = Number(arg('port', 8687));
  const app = createDevApp({ port, code: arg('code', ''), pin: arg('pin', ''), siblingPort: arg('sibling-port', null) && Number(arg('sibling-port')), demoLang: arg('demo', null) });
  app.webServer.start(port).then(() => console.log(`Dashboard: http://localhost:${port}/   Editor: http://localhost:${port}/editor`));
}
