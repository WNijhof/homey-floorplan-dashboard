'use strict';

const { advise } = require('./EnergyAdvice');

const ADVICE_TICK = 60 * 1000;
const LISTS_KEY = 'lists';
const SCREENS_KEY = 'screens';
const MAX_ITEMS = 100;
const MAX_TEXT = 120;
const MAX_SCREENS = 30;
const LIST_NAMES = ['shopping', 'tasks'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SCREEN_NAME = /^[\p{L}\p{N} _-]{1,40}$/u;

// Afval Herinnering 2.0 (Trashcan Reminder): its card only looks up the collection days, for Rova and many other collectors
const WASTE_APP = 'homey:app:com.trashchecker';
const WASTE_CARD = `${WASTE_APP}:days_to_collect`;
const WASTE_TTL = 30 * 60 * 1000;

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (v) => String(v == null ? '' : v).trim().slice(0, MAX_TEXT);

/** Shared lists, screen profiles, who is home, Logic variables, energy advice and the Flow cards of the dashboard. */
class HouseExtras {

  constructor(app) {
    this.app = app;
    this.lastAdvice = new Set();
  }

  get homey() { return this.app.homey; }

  get api() { return this.app.hub.api; }

  /* ---------------------------------------------------------- Flow cards */

  registerFlows() {
    const { flow } = this.homey;
    flow.getActionCard('show-on-screen').registerRunListener(async (args) => this.showOnScreen(args));
    flow.getActionCard('add-to-list').registerRunListener(async (args) => { this.addToList(args.list, args.text); return true; });
    this.surplusCard = flow.getTriggerCard('energy-surplus');
    this.cheapCard = flow.getTriggerCard('cheap-power');
    this.homey.setInterval(() => this.tick().catch((err) => this.app.error('Advice', err)), ADVICE_TICK);
  }

  // A Flow makes the screens show something: all of them, or the one with this name.
  showOnScreen({ what, detail, seconds, screen }) {
    const sec = Number(seconds);
    this.app.emit('screen', { what, detail: text(detail), seconds: Number.isFinite(sec) ? Math.min(3600, Math.max(0, sec)) : 30, screen: text(screen) });
    return true;
  }

  // Fires the triggers when an advice starts, not every minute it lasts.
  async tick() {
    const { items } = await this.getAdvice();
    const now = new Set(items.map((i) => i.id));
    // After a restart: what is going on already is no new start
    if (!this.primed) { this.primed = true; this.lastAdvice = now; }
    for (const item of items) {
      if (this.lastAdvice.has(item.id)) continue;
      if (item.id === 'surplus') await this.surplusCard.trigger({ watts: item.watts });
      if (item.id === 'cheapNow') await this.cheapCard.trigger();
    }
    this.lastAdvice = now;
    this.app.emit('advice', { items });
  }

  async getAdvice(planId) {
    const app = this.app;
    const energy = await app.getEnergy();
    const money = await app.energyDetails.pricesNow().catch(() => null);
    const plan = (planId && app.plans.get(planId)) || app.plans.list()[0] || null;
    const forecast = plan ? await app.energyDetails.dayForecast(plan).catch(() => null) : null;
    return { items: advise({ energy, money, forecast }) };
  }

  /* ---------------------------------------------------------------- lists */

  getLists() {
    const saved = this.homey.settings.get(LISTS_KEY) || {};
    const out = { meals: {} };
    for (const name of LIST_NAMES) out[name] = Array.isArray(saved[name]) ? saved[name] : [];
    for (const day of DAYS) out.meals[day] = text(saved.meals && saved.meals[day]);
    return out;
  }

  setLists(body) {
    if (!body || typeof body !== 'object') throw bad('Invalid lists');
    const clean = { meals: {} };
    for (const name of LIST_NAMES) {
      const list = Array.isArray(body[name]) ? body[name] : [];
      clean[name] = list.slice(0, MAX_ITEMS).map((i) => ({ id: text(i && i.id) || `i${Date.now()}${Math.floor(Math.random() * 1e6)}`, text: text(i && i.text), done: !!(i && i.done) })).filter((i) => i.text);
    }
    for (const day of DAYS) clean.meals[day] = text(body.meals && body.meals[day]);
    this.homey.settings.set(LISTS_KEY, clean);
    this.app.emit('lists', {});
    return clean;
  }

  addToList(list, value) {
    if (!LIST_NAMES.includes(list)) throw bad('Unknown list');
    if (!text(value)) throw bad('Nothing to add');
    const lists = this.getLists();
    if (lists[list].length >= MAX_ITEMS) throw bad('The list is full');
    lists[list].push({ text: value, done: false });
    return this.setLists(lists);
  }

  /* -------------------------------------------------------------- screens */

  getScreen(name) {
    if (!SCREEN_NAME.test(name)) throw bad('Invalid name');
    const all = this.homey.settings.get(SCREENS_KEY) || {};
    return Object.prototype.hasOwnProperty.call(all, name) ? all[name] : null;
  }

  checkScreen(name, settings) {
    if (!SCREEN_NAME.test(name)) throw bad('Invalid name');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw bad('Invalid settings');
    if (JSON.stringify(settings).length > 8000) throw bad('Too much');
  }

  setScreen(name, settings) {
    this.checkScreen(name, settings);
    const all = { ...(this.homey.settings.get(SCREENS_KEY) || {}) };
    if (!Object.prototype.hasOwnProperty.call(all, name) && Object.keys(all).length >= MAX_SCREENS) throw bad('Too many screens');
    all[name] = settings;
    this.homey.settings.set(SCREENS_KEY, all);
    return settings;
  }

  /* ---------------------------------------------------------------- waste */

  // What is collected today and tomorrow according to the waste app; null without that app.
  async getWaste() {
    const day = new Date().toDateString();
    if (this.waste && this.waste.day === day && Date.now() - this.waste.at < WASTE_TTL) return this.waste.data;
    await this.app.hubReady;
    let data = null;
    try {
      const [today, tomorrow] = await Promise.all(['today', 'tomorrow'].map((when) => this.wasteOn(when)));
      data = { today, tomorrow };
    } catch (err) {
      data = null; // no such app, or it is starting
    }
    this.waste = { day, at: Date.now(), data };
    return data;
  }

  async wasteOn(when) {
    const res = await this.api.flow.runFlowCardAction({ uri: WASTE_APP, id: WASTE_CARD, args: { when } });
    const out = (res && res.returnTokens) || {};
    return out.isCollected ? out.trashTypeLocalized || out.trashType || null : null;
  }

  /* --------------------------------------------------------- who is home */

  async getPeople() {
    await this.app.hubReady;
    const users = Object.values(await this.api.users.getUsers());
    return users.filter((u) => u.enabled !== false && u.role !== 'guest' && u.name).map((u) => ({ initial: u.name.trim().charAt(0).toUpperCase(), name: u.name, home: u.present === true, asleep: u.asleep === true }));
  }

  /* ------------------------------------------------------ Logic variables */

  async getVariableChoices() {
    await this.app.hubReady;
    const all = Object.values(await this.api.logic.getVariables());
    return all.map((v) => ({ id: v.id, name: v.name, type: v.type })).sort((a, b) => a.name.localeCompare(b.name));
  }

  chosenVariables(planId) {
    const plans = this.app.plans.list().filter((p) => !planId || p.id === planId);
    return plans.flatMap((p) => p.variables || []);
  }

  async getVariables(planId) {
    const chosen = this.chosenVariables(planId);
    if (!chosen.length) return [];
    await this.app.hubReady;
    const all = await this.api.logic.getVariables();
    return chosen.filter((c) => all[c.id]).map((c) => ({ id: c.id, name: all[c.id].name, type: all[c.id].type, value: all[c.id].value }));
  }

}

module.exports = { HouseExtras, DAYS };
