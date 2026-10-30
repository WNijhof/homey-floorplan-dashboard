'use strict';

const fs = require('fs');
const path = require('path');

const KIND = 'homedeck-backup';
const KEEP = 5; // copies made before an update
const VERSION_KEY = 'lastVersion';
const DIR = '/userdata';
const FILE = /^before-([\w.-]+)\.json$/;

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const MAX_PLANS = 20;
const MAX_PLAN = 4 * 1024 * 1024;
const list = (v) => Array.isArray(v);
// Everything the app counts on in a plan.
const sound = (p) => !!p && typeof p.id === 'string' && /^[\w-]+$/.test(p.id) && typeof p.name === 'string' && list(p.levels)
  && p.levels.every((l) => l && typeof l.id === 'string' && list(l.rooms) && l.rooms.every((r) => r && list(r.points)) && (l.items === undefined || list(l.items)));

/**
 * Everything someone made, in one file: plans, calendars, lists and named screens. Not the access code and edit PIN of
 * the app. Before an update starts, a copy goes to the app's own folder, which an update leaves alone.
 */
class Backup {

  constructor(app, dir = process.env.HOMEDECK_USERDATA || DIR) {
    this.app = app;
    this.dir = dir;
  }

  make() {
    const { homey, plans } = this.app;
    return {
      kind: KIND,
      version: homey.manifest.version,
      made: new Date().toISOString(),
      plans: plans.list(),
      calendars: homey.settings.get('calendars') || [],
      lists: homey.settings.get('lists') || null,
      screens: homey.settings.get('screens') || null,
    };
  }

  // Plans with the same id are replaced, others stay. Everything is checked first, so a bad file changes nothing.
  restore(backup) {
    if (!backup || backup.kind !== KIND || !Array.isArray(backup.plans)) throw bad('This is not a HomeDeck backup');
    const { plans, extras } = this.app;
    const known = new Set(plans.list().map((p) => p.id));
    for (const p of backup.plans) {
      if (!sound(p)) throw bad('A plan in this backup is damaged');
      if (Buffer.byteLength(JSON.stringify(p)) > MAX_PLAN) throw bad('A plan in this backup is too large');
      known.add(p.id);
    }
    if (known.size > MAX_PLANS) throw bad('Too many plans');
    const screens = backup.screens && typeof backup.screens === 'object' ? Object.entries(backup.screens) : [];
    for (const [name, settings] of screens) extras.checkScreen(name, settings);
    if (backup.calendars !== undefined && !Array.isArray(backup.calendars)) throw bad('The calendars in this backup are damaged');
    for (const p of backup.plans) plans.save(p.id, p);
    if (backup.calendars && backup.calendars.length) this.app.setCalendars(backup.calendars);
    if (backup.lists && typeof backup.lists === 'object') extras.setLists(backup.lists);
    for (const [name, settings] of screens) extras.setScreen(name, settings);
    return { plans: backup.plans.length, version: backup.version || null };
  }

  /* -------------------------------------------- the copy before an update */

  // At the first start of another version: what was made so far, as it was. Never stops the app from starting.
  keepBeforeUpdate() {
    const { homey } = this.app;
    const now = homey.manifest.version;
    const last = homey.settings.get(VERSION_KEY);
    if (last === now) return null;
    homey.settings.set(VERSION_KEY, now);
    try {
      if (!this.app.plans.list().length) return null;
      const name = `before-${now}.json`;
      fs.writeFileSync(path.join(this.dir, name), JSON.stringify({ ...this.make(), version: last || 'older' }));
      for (const old of this.copies().slice(KEEP)) fs.unlinkSync(path.join(this.dir, old.file));
      return name;
    } catch (err) {
      this.app.error('Copy before the update', err);
      return null;
    }
  }

  copies() {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => FILE.test(f)); } catch (err) { return []; }
    return files.map((file) => {
      const stat = fs.statSync(path.join(this.dir, file));
      return { file, made: stat.mtime.toISOString(), bytes: stat.size };
    }).sort((a, b) => b.made.localeCompare(a.made));
  }

  restoreCopy(file) {
    if (!FILE.test(String(file))) throw bad('Unknown copy');
    const full = path.join(this.dir, file);
    if (!fs.existsSync(full)) throw bad('Unknown copy', 404);
    return this.restore(JSON.parse(fs.readFileSync(full, 'utf8')));
  }

}

module.exports = { Backup, KIND };
