'use strict';

const crypto = require('crypto');

// Filled in once relay/ is online; empty means nothing can leave the Homey.
const ENDPOINT = '';
const SEND_AFTER = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 20;
const MAX_TEXT = 300;
const MAX_STACK = 6;
const TIMEOUT = 5000;

/**
 * Removes what could say something about a person or a home: names the app knows, addresses, links, ids and folders.
 * names: the names of devices, rooms, plans and users at this moment, longest first.
 */
function scrub(text, names = []) {
  let out = String(text == null ? '' : text);
  for (const name of names) if (name && name.length > 1) out = out.split(name).join('<name>');
  return out
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<link>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/(?:\b[0-9a-f]{1,4})?(?::{1,2}[0-9a-f]{0,4}){2,7}\b/gi, '<ip>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<id>')
    .replace(/\b-?\d{1,3}\.\d{3,}\b/g, '<number>')
    .replace(/\b(?:\+?\d[\d -]{7,}\d)\b/g, '<number>')
    // text between quotes is what someone typed or named
    .replace(/(["'“‘])[^"'”’\n]{1,120}(["'”’])/g, '<text>')
    .slice(0, MAX_TEXT);
}

// Only where in the code: file and line within the app, not the folders around it.
function frames(stack) {
  const out = [];
  for (const line of String(stack || '').split('\n').slice(1)) {
    const m = /((?:lib|web|widgets|app\.js|api\.js)[\w./\\-]*\.?\w*):(\d+)/.exec(line);
    if (m && !line.includes('node_modules')) out.push(`${m[1].replace(/\\/g, '/')}:${m[2]}`);
    if (out.length >= MAX_STACK) break;
  }
  return out;
}

/**
 * Errors of the app, sent only when the owner turned this on. Anonymous: no id of this Homey, and everything goes through
 * scrub(). Never gets in the way of the app: all of it is in try/catch, and it stops at a few reports.
 */
class ErrorReporter {

  constructor(app, { endpoint = ENDPOINT, send = null, now = Date.now } = {}) {
    this.app = app;
    this.endpoint = endpoint;
    this.send = send || ((url, body) => this.post(url, body));
    this.now = now;
    this.waiting = new Map();
    this.seen = new Set();
    this.hour = { at: 0, count: 0 };
    this.day = { at: 0, count: 0 };
    this.timer = null;
  }

  get enabled() {
    return !!this.endpoint && this.app.getConfig().reportErrors === true;
  }

  // The names to remove now; a failure here must not lose that protection, so then nothing is sent.
  names() {
    const list = [];
    for (const plan of this.app.plans.list()) {
      list.push(plan.name);
      for (const level of plan.levels || []) {
        list.push(level.name);
        for (const room of level.rooms || []) list.push(room.name);
        for (const item of level.items || []) list.push(item.label);
      }
      for (const a of plan.actions || []) list.push(a.name);
    }
    for (const name of this.deviceNames || []) list.push(name);
    return [...new Set(list.filter((n) => typeof n === 'string'))].sort((a, b) => b.length - a.length);
  }

  // Device names, refreshed when something is about to be sent.
  async loadNames() {
    const devices = await this.app.hub.getDevices();
    const zones = await this.app.hub.getZones();
    this.deviceNames = devices.map((d) => d.name).concat(zones.map((z) => z.name));
    this.kinds = {};
    for (const d of devices) this.kinds[d.cls] = (this.kinds[d.cls] || 0) + 1;
  }

  /** Remembers an error. source: 'app' or 'page'. */
  capture(error, source = 'app') {
    try {
      if (!this.enabled) return;
      const message = error && error.message ? error.message : String(error);
      const stack = frames(error && error.stack);
      const key = crypto.createHash('sha256').update(`${source}|${stack[0] || ''}|${message.replace(/\d+/g, '#').slice(0, 200)}`).digest('hex').slice(0, 16);
      const known = this.waiting.get(key);
      if (known) { known.count += 1; return; }
      if (this.seen.has(key)) return;
      this.waiting.set(key, { source, message, stack, fingerprint: key, count: 1 });
      if (!this.timer) {
        this.timer = this.app.homey.setTimeout(() => { this.timer = null; this.flush().catch(() => {}); }, SEND_AFTER);
      }
    } catch (err) { /* a report never causes a problem */ }
  }

  allowed() {
    const now = this.now();
    if (now - this.hour.at > 3600000) this.hour = { at: now, count: 0 };
    if (now - this.day.at > 86400000) this.day = { at: now, count: 0 };
    return this.hour.count < MAX_PER_HOUR && this.day.count < MAX_PER_DAY;
  }

  async flush() {
    const list = [...this.waiting.values()];
    this.waiting.clear();
    if (!this.enabled || !list.length) return;
    let names;
    try {
      await this.loadNames();
      names = this.names();
    } catch (err) {
      return; // without the names it cannot be made anonymous
    }
    const { homey } = this.app;
    for (const report of list) {
      if (!this.allowed()) return;
      this.hour.count += 1;
      this.day.count += 1;
      this.seen.add(report.fingerprint);
      await this.send(this.endpoint, {
        app: 'homedeck',
        version: homey.manifest.version,
        homey: homey.version || null,
        source: report.source,
        fingerprint: report.fingerprint,
        message: scrub(report.message, names),
        where: report.stack,
        count: report.count,
        kinds: this.kinds || {},
      }).catch(() => {});
    }
  }

  async post(url, body) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), TIMEOUT);
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: stop.signal });
    } finally {
      clearTimeout(timer);
    }
  }

}

module.exports = { ErrorReporter, scrub, frames, ENDPOINT };
