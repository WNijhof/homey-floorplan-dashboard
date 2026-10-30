'use strict';

const KEY = 'plans';
const MAX_PLANS = 20;
// Homey settings are stored as JSON; keep traced pictures from blowing up the store.
const MAX_PLAN_BYTES = 4 * 1024 * 1024;

/** Persists floor plans in the app's settings store. */
class PlanStore {

  constructor(homey, emit) {
    this.homey = homey;
    this.emit = emit;
  }

  _all() {
    return this.homey.settings.get(KEY) || {};
  }

  list() {
    return Object.values(this._all()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  get(id) {
    return this._all()[id] || null;
  }

  save(id, plan) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.levels)) {
      throw new Error('Invalid plan');
    }
    const all = this._all();
    if (!all[id] && Object.keys(all).length >= MAX_PLANS) {
      throw new Error(`At most ${MAX_PLANS} plans are supported`);
    }
    const size = Buffer.byteLength(JSON.stringify(plan));
    if (size > MAX_PLAN_BYTES) {
      throw new Error('Plan is too large; use a smaller tracing picture');
    }
    all[id] = { ...plan, id, updatedAt: Date.now() };
    this.homey.settings.set(KEY, all);
    this.emit('plan', { id });
    return all[id];
  }

  remove(id) {
    const all = this._all();
    delete all[id];
    this.homey.settings.set(KEY, all);
    this.emit('plan', { id, deleted: true });
    return true;
  }

}

module.exports = PlanStore;
