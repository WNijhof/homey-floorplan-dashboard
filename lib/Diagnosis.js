'use strict';

const core = require('./shared/floorplan-core');
const DeviceHub = require('./DeviceHub');

const PLACEHOLDER_MAIL = /@example\.(com|org)$/i;

// Error texts can hold calendar links or addresses; those are cut out of the report.
function scrub(text) {
  return String(text).replace(/https?:\/\/\S+/g, '<url>').replace(/webcal:\/\/\S+/g, '<url>').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>');
}

function count(list, key) {
  const out = {};
  for (const x of list) {
    const k = key(x);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * The report a user can share when something does not look right: which kinds of devices the app finds,
 * how the plans are built and how the web page runs. Without names, zones, links or addresses.
 * With `plan`, also the plan itself with every name replaced (Room 1, Level 1, a device by its kind),
 * so the maker can open the same plan and see what the user sees.
 */
async function buildReport(app, { plan: withPlan = false } = {}) {
  const { homey } = app;
  await app.hubReady;
  const raw = Object.values(await app.hub.api.devices.getDevices());
  const number = new Map(raw.map((d, i) => [d.id, i + 1]));
  const compact = new Map(raw.map((d) => [d.id, DeviceHub.compactDevice(d)]));

  const devices = raw.map((d) => {
    const c = compact.get(d.id);
    return {
      n: number.get(d.id),
      driver: d.driverId || null,
      cls: c.cls,
      kind: core.deviceKind(c),
      caps: (d.capabilities || []).slice().sort(),
      group: c.group || undefined,
      available: c.available ? undefined : false,
    };
  });

  const plans = app.plans.list();
  const placed = new Set();
  const planReport = plans.map((p) => ({
    bytes: JSON.stringify(p).length,
    levels: p.levels.map((l) => {
      const items = l.items || [];
      const devs = items.filter((i) => i.kind === 'device');
      for (const i of devs) placed.add(i.deviceId);
      return {
        rooms: l.rooms.length,
        roomsWithZone: l.rooms.filter((r) => r.zoneId).length,
        lockedRooms: l.rooms.filter((r) => r.locked).length || undefined,
        walls: (l.walls || []).length,
        doors: (l.openings || []).filter((o) => o.type === 'door').length,
        windows: (l.openings || []).filter((o) => o.type === 'window').length,
        furniture: count(items.filter((i) => i.kind === 'furniture'), (i) => i.type),
        devices: devs.length,
        missingDevices: devs.filter((i) => !compact.has(i.deviceId)).length || undefined,
        fixtures: count(devs, (i) => i.fixture),
        background: l.background ? Math.round(JSON.stringify(l.background).length / 1024) + ' kB' : undefined,
        wallHeight: l.wallHeight,
        wallThickness: l.wallThickness,
      };
    }),
  }));

  const config = app.getConfig();
  const status = app.webServer ? app.webServer.status : {};
  const report = {
    made: new Date().toISOString().slice(0, 10),
    app: homey.manifest.version,
    homey: { version: homey.version, platform: homey.platform, platformVersion: homey.platformVersion },
    web: { port: config.port, running: !!status.running, reason: status.reason || undefined, accessCode: !!config.accessCode, editPin: !!config.editPin },
    siblings: (await app.getSiblings().catch(() => [])).map((s) => s.key),
    siblingStatus: app.siblingStatus || undefined,
    calendars: (app.getCalendars() || []).length,
    devices: { total: devices.length, placed: placed.size, kinds: count(devices, (d) => d.kind) },
    plans: planReport,
    errors: (app.recentErrors || []).map(scrub),
    deviceList: devices,
  };
  if (withPlan && plans.length) report.snapshot = anonymousPlan(plans[0], compact, number);
  const email = homey.manifest.author && homey.manifest.author.email;
  return { email: email && !PLACEHOLDER_MAIL.test(email) ? email : null, report };
}

// A copy of the plan without names, labels, pictures or Homey ids, with the devices it shows.
function anonymousPlan(plan, compact, number) {
  const p = JSON.parse(JSON.stringify(plan));
  const used = new Set();
  const zones = new Map();
  const zone = (id) => {
    if (!id) return null;
    if (!zones.has(id)) zones.set(id, `zone-${zones.size + 1}`);
    return zones.get(id);
  };
  const dev = (id) => {
    if (!id) return id;
    used.add(id);
    return `dev-${number.get(id) || 0}`;
  };
  p.id = 'plan'; p.name = 'Plan';
  p.levels.forEach((l, li) => {
    l.name = `Level ${li + 1}`;
    l.zoneId = zone(l.zoneId);
    l.background = null;
    l.rooms.forEach((r, ri) => {
      r.name = `Room ${ri + 1}`;
      r.zoneId = zone(r.zoneId);
      for (const k of ['climateDevice', 'tempDevice', 'humDevice']) if (r[k]) r[k] = dev(r[k]);
    });
    for (const o of l.openings || []) o.devices = (o.devices || []).map(dev);
    for (const i of l.items || []) {
      delete i.label;
      if (i.deviceId) i.deviceId = dev(i.deviceId);
    }
  });
  const devices = [...used].filter((id) => compact.has(id)).map((id) => {
    const c = compact.get(id);
    return { ...c, id: `dev-${number.get(id)}`, name: `${core.deviceKind(c)} ${number.get(id)}`, zone: zone(c.zone) };
  });
  return { plan: p, devices };
}

module.exports = { buildReport, scrub };
