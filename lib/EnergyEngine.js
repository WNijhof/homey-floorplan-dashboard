'use strict';

const fs = require('fs');
const path = require('path');
const EnergyDashboardApp = require('./energy/app');

const PREFIX = 'energy.'; // HomeDeck has a 'config' of its own
const ENERGY_APP = 'com.drpeppers.energydashboard';
const MAX_READS = 3;
const LOCALES = path.join(__dirname, '..', 'web', 'energy', 'locales');
const HOME = { key: 'home', icon: '🏠', name: { en: 'Home', nl: 'Huis' }, path: '../' };

// Energy's settings under keys of their own.
function ownSettings(settings, stopped) {
  return {
    get: (key) => settings.get(PREFIX + key),
    set: (key, value) => settings.set(PREFIX + key, value),
    unset: (key) => settings.unset(PREFIX + key),
    getKeys: () => settings.getKeys().filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length)),
    on: (event, fn) => settings.on(event, (key) => { if (String(key).startsWith(PREFIX) && !stopped()) fn(key.slice(PREFIX.length)); }),
  };
}

// Energy's own texts (the names of its Flow tags): its locales came along with its settings page.
function ownTexts(homey) {
  let texts = null;
  return (key, tokens = {}) => {
    if (!texts) texts = JSON.parse(fs.readFileSync(path.join(LOCALES, `${homey.i18n.getLanguage() === 'nl' ? 'nl' : 'en'}.json`), 'utf8'));
    const text = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts);
    return typeof text === 'string' ? text.replace(/__(\w+)__/g, (m, k) => (k in tokens ? tokens[k] : m)) : key;
  };
}

/**
 * Energy Dashboard's app logic (lib/energy/app.js) inside HomeDeck: its blocks, settings, history and Flow tags,
 * with the Homey of this app, HomeDeck's Web API connection, and no web server of its own (lib/EnergyServer.js).
 */
class EnergyEngine extends EnergyDashboardApp {

  constructor(host) {
    super();
    const { homey } = host;
    this.host = host;
    this.error = this.error.bind(this); // handed on as it is by the app logic
    this.timers = [];
    this.reading = 0;
    this.waiting = [];
    const later = (make) => (...args) => { const t = make(...args); this.timers.push(t); return t; };
    this.homey = {
      // As Energy Dashboard, so a backup of that app can be read here
      manifest: { ...homey.manifest, id: ENERGY_APP },
      clock: homey.clock,
      cloud: homey.cloud,
      geolocation: homey.geolocation,
      notifications: homey.notifications,
      flow: homey.flow,
      api: homey.api,
      i18n: homey.i18n,
      settings: ownSettings(homey.settings, () => this.stopped),
      setTimeout: later((...args) => homey.setTimeout(...args)),
      setInterval: later((...args) => homey.setInterval(...args)),
      __: ownTexts(homey),
    };
  }

  log(...args) { this.host.log('[energy]', ...args); }

  error(...args) { this.host.error('[energy]', ...args); }

  // The app Energy Dashboard appeared: nothing runs twice from now on, and its Flow tags are the only ones.
  async stop() {
    this.stopped = true;
    const { homey } = this.host;
    for (const t of this.timers) { homey.clearTimeout(t); homey.clearInterval(t); }
    this.timers = [];
    for (const tokens of [this.groupTokens, this.houseTokens]) await this.syncTokens(tokens, new Map()).catch(() => {});
    await this.webServer.stop();
  }

  // A year of Insights for many devices at once would be the highest peak in memory: a few reads at a time.
  async readLog(id, resolution) {
    if (this.reading >= MAX_READS) await new Promise((go) => this.waiting.push(go));
    else this.reading += 1;
    try {
      return await super.readLog(id, resolution);
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.reading -= 1;
    }
  }

  async createApi() {
    await this.host.hubReady;
    return this.host.hub.api;
  }

  keepOldPort() {}

  // The port, access code and edit PIN are HomeDeck's.
  getConfig() {
    const { port, editPin } = this.host.getConfig();
    return { ...super.getConfig(), port, editPin, accessCode: '' };
  }

  // The settings on the web page need the edit PIN only when there is one, like HomeDeck's editor. The page asks with
  // an empty PIN first; that does not count as a wrong one.
  unlockSettings(pin) {
    if (!this.getConfig().editPin) return { token: 'open' };
    if (!pin) throw Object.assign(new Error('PIN needed'), { status: 401 });
    return super.unlockSettings(pin);
  }

  checkSettingsToken(token) {
    if (this.getConfig().editPin) super.checkSettingsToken(token);
    else if (token !== 'open') throw Object.assign(new Error('Open the settings from the page'), { status: 401 });
  }

  async getDashboardUrl() {
    return `${await super.getDashboardUrl()}/energy/`;
  }

  async getSiblings() {
    return [HOME];
  }

}

module.exports = { EnergyEngine };
