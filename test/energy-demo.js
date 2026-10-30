'use strict';

// Energy Dashboard's page with its demo data, for the dev server and the demo site: the answers its pc version gives
// without a Homey (server.js there), behind the same routes (lib/EnergyServer.js).
const demo = require('./energy-demo-data');
const { EnergyServer } = require('../lib/EnergyServer');
const {
  blockCatalog, savedLayout, layoutName, validateLayout, todayTotals, expectedSolar, nettingSummary, billForecast, PREVIOUS, comparableTotals,
} = require('../lib/energy/energy');
const { contractFrom, describeTariff, SUPPLIERS } = require('../lib/energy/tariffs');

const TEXT = {
  nl: { washer: 'Wasmachine staat al 5 uur aan (12 W)', baseload: 'Sluipverbruik is 246 W, normaal 186 W', roof: 'Omvormer dak zuid (demo)', garage: 'Omvormer garage (demo)' },
  en: { washer: 'Washing machine has been on for 5 hours (12 W)', baseload: 'Standby use is 246 W, normally 186 W', roof: 'Inverter south roof (demo)', garage: 'Inverter garage (demo)' },
};

function demoConfig() {
  return {
    devices: {},
    boiler: { liters: 80, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
    battery: {},
    grid: { fuseAmps: 25, capacityMin: 2.5 },
    prices: { source: 'auto', currency: '' },
    tariffs: {},
    layout: null,
    layouts: {},
    contract: {
      electricity: { type: 'dynamic', supplier: 'anwb', markup: 0.02 },
      gas: { type: 'fixed', price: 1.35 },
      water: 1.1,
      monthly: 95,
      advance: 290,
      billStart: `${new Date().getFullYear() - 1}-03-01`,
      end: new Date(Date.now() + 70 * 864e5).toISOString().slice(0, 10),
    },
  };
}

function createEnergyDemo({ port = 0, pin = '', lang = 'nl', moment = null } = {}) {
  const cfg = demoConfig();
  const T = TEXT[lang];
  const engine = {
    homey: { manifest: { version: 'demo' }, i18n: { getLanguage: () => lang } },
    getConfig: () => ({ ...cfg, port, editPin: pin, accessCode: '' }),

    async getHistory(period, { light = false } = {}) {
      const data = demo.history(period, cfg);
      if (period === 'today' && !light) data.forecast = demo.forecast();
      if (!light) {
        data.expectedSolar = expectedSolar(period, data.rows.map((r) => ({ start: new Date(r.start) })), demo.forecastLog());
        data.kwp = 4.2;
        data.solarDevices = [{ name: T.roof, kWh: data.totals.solar * 0.62 }, { name: T.garage, kWh: data.totals.solar * 0.38 }];
        if (PREVIOUS[period]) data.previous = comparableTotals(await engine.getHistory(PREVIOUS[period], { light: true }), data);
      }
      return data;
    },

    async getLive(name = '', at = null) {
      const view = { ...cfg, layout: savedLayout(cfg, layoutName(name)) };
      const when = at !== null ? Number(at) : moment;
      const live = when === null ? demo.live(view) : { ...demo.live(view, when), at: at !== null ? new Date(when).toISOString() : undefined };
      const has = (id) => live.layout.some((b) => b.id === id);
      const today = await engine.getHistory('today');
      if (has('netting')) live.netting = nettingSummary(await engine.getHistory('lastYear', { light: true }), 'lastYear');
      if (has('bill')) {
        const [last, year] = await Promise.all([engine.getHistory('lastYear', { light: true }), engine.getHistory('year', { light: true })]);
        live.bill = billForecast([...last.rows, ...year.rows], contractFrom(cfg), new Date(), null);
      }
      if (has('heatmap') && at === null) live.heatmap = demo.heatmap();
      if (has('alerts') && at === null) live.alerts = [{ id: 'on-demo', level: 'info', text: T.washer }, { id: 'baseload', level: 'warning', text: T.baseload }];
      if (has('co2')) live.co2 = demo.co2(today.rows);
      live.version = 'demo';
      live.tariff = describeTariff(contractFrom(cfg), null);
      live.place = { lat: 52.1, lon: 5.1 };
      if (at === null) live.today = todayTotals(today.totals);
      return live;
    },

    async getLayoutInfo(name = '') {
      const layout = layoutName(name);
      return {
        blocks: blockCatalog(),
        name: layout,
        names: Object.keys(cfg.layouts),
        customLayout: Boolean(savedLayout(cfg, layout)),
        layout: demo.live({ ...cfg, layout: savedLayout(cfg, layout) }).layout,
        defaultLayout: demo.live({ ...cfg, layout: null }).layout,
        pinRequired: Boolean(pin),
      };
    },

    async saveLayout({ layout, name, remove }) {
      const target = layoutName(name);
      if (!target) cfg.layout = validateLayout(layout);
      else if (remove) delete cfg.layouts[target];
      else cfg.layouts[target] = validateLayout(layout);
      return engine.getLayoutInfo(remove ? '' : target);
    },

    async getSiblings() {
      return [{ key: 'home', icon: '🏠', name: { en: 'Home', nl: 'Huis' }, path: '../' }];
    },

    // The settings page: everything found, nothing kept
    unlockSettings: () => ({ token: 'demo' }),
    checkSettingsToken() {},
    webSettingValue: (key) => (key === 'config' ? { ...cfg } : null),
    async setWebSetting(key, value) { Object.assign(cfg, value); return { saved: true }; },
    async webSettingsCall({ method, path }) {
      if (method === 'GET' && path === '/settings-info') return engine.getSettingsInfo();
      return {};
    },
    async getSettingsInfo() {
      const { layout } = demo.live(cfg);
      return {
        dashboardUrl: `http://localhost:${port}/energy/`,
        server: { running: true, port, message: null },
        blocks: blockCatalog(),
        layout,
        defaultLayout: demo.live({ ...cfg, layout: null }).layout,
        customLayout: Boolean(cfg.layout),
        contract: contractFrom(cfg),
        suppliers: SUPPLIERS,
        prices: { source: 'auto' },
        found: { p1: 'demo-p1', solar: ['demo-pv'], batteries: ['demo-battery'], boiler: 'demo-boiler', heating: ['demo-hp'], thermostat: 'demo-thermostat', evChargers: ['demo-ev'], water: 'demo-water' },
        devices: [
          { id: 'demo-boiler', name: 'Boiler', class: 'waterheater' },
          { id: 'demo-pv', name: 'Inverter', class: 'solarpanel' },
          { id: 'demo-p1', name: 'P1', class: 'sensor' },
          { id: 'demo-battery', name: 'Battery', class: 'battery' },
          { id: 'demo-hp', name: 'Heat pump', class: 'heatpump', power: true, consumer: 'excluded' },
          { id: 'demo-thermostat', name: 'Thermostat', class: 'thermostat' },
          { id: 'demo-ev', name: 'Charger', class: 'evcharger', power: true, consumer: 'counted' },
          { id: 'demo-water', name: 'Water meter', class: 'sensor', waterMeter: true },
        ],
      };
    },
    getDiagnosis: async () => ({ demo: true }),
    getDiagnosisReport: async () => ({ email: 'you@example.com', report: { demo: true } }),
  };
  const webServer = new EnergyServer({ app: engine, log: () => {}, error: (m) => console.error('[energy demo]', m) });
  return { engine, webServer };
}

module.exports = { createEnergyDemo };
