'use strict';

const { HomeyAPI } = require('homey-api');

// Capabilities the floor plan shows or controls. Everything else is ignored to keep payloads small.
const WATCHED = [
  'onoff', 'dim', 'light_hue', 'light_saturation', 'light_temperature', 'light_mode',
  'windowcoverings_set', 'windowcoverings_state', 'windowcoverings_tilt_set',
  'alarm_contact', 'locked', 'alarm_generic', 'homealarm_state',
  'alarm_smoke', 'alarm_water', 'alarm_co', 'alarm_motion', 'alarm_tamper',
  'measure_temperature', 'measure_humidity', 'target_temperature', 'thermostat_mode',
  'measure_power', 'speaker_playing', 'speaker_track', 'speaker_artist', 'volume_set',
  'alarm_heimdall', 'speaker_album', 'speaker_shuffle', 'vacuumcleaner_state', 'fan_mode',
  'alarm_co2', 'alarm_heat', 'alarm_gas', 'alarm_fire', 'alarm_battery', 'measure_battery', 'alarm_doorbell', 'doorbell', 'button',
];

const SETTABLE = new Set([
  'onoff', 'dim', 'windowcoverings_set', 'windowcoverings_state', 'locked',
  'target_temperature', 'speaker_playing', 'volume_set', 'light_hue', 'light_saturation',
  'light_temperature', 'homealarm_state', 'speaker_next', 'speaker_prev', 'thermostat_mode', 'fan_mode', 'vacuumcleaner_state',
]);

// Apps that make virtual devices (Device Capabilities, Virtual Devices)
const VIRTUAL_APPS = ['nl.qluster-it.DeviceCapabilities', 'com.arjankranenburg.virtual'];

// A switch with more channels (onoff.2, onoff.output1 ...) shows each extra channel as a device of its own,
// `<device id>::<channel>`, so a lamp can be linked to the button that switches it.
const SEP = '::';
const CHANNEL_CAPS = ['onoff', 'dim', 'measure_power'];
// Air conditioners (Daikin and others) often have only a variant of a capability, such as target_temperature.heat or
// measure_temperature.inside. The first variant then stands in for the capability itself: { base: variant }.
const ALIAS_CAPS = ['target_temperature', 'measure_temperature', 'measure_humidity'];
function aliasesOf(device) {
  const have = device.capabilities || [];
  const out = {};
  for (const base of ALIAS_CAPS) {
    if (have.includes(base)) continue;
    const variant = have.find((c) => c.startsWith(`${base}.`));
    if (variant) out[base] = variant;
  }
  return out;
}

const channelsOf = (device) => (device.capabilities || []).map((c) => /^onoff\.(.+)$/.exec(c)).filter(Boolean).map((m) => m[1]);

/**
 * Wraps the Homey Web API: keeps a compact snapshot of devices and zones,
 * and forwards capability changes to widgets and the settings page as realtime events.
 */
class DeviceHub {

  // emit(event, data) sends to widgets (Homey realtime) and to the web page (Server-Sent Events).
  constructor(homey, emit) {
    this.homey = homey;
    this.emit = emit;
    this.api = null;
    this.instances = new Map(); // deviceId -> [DeviceCapability]
    this.aliases = new Map(); // deviceId -> { capability: the variant it really has }
    this.pending = new Map(); // deviceId -> { capId: value } batched for realtime
    this.flushTimer = null;
  }

  async init() {
    this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
    await this.api.devices.connect();
    await this.api.zones.connect();

    const devices = await this.api.devices.getDevices();
    for (const device of Object.values(devices)) this._watch(device);

    this.api.devices.on('device.create', (device) => {
      this._watch(device);
      this._emit('devices', { changed: true });
    });
    this.api.devices.on('device.delete', (device) => {
      this._unwatch(device.id);
      this._emit('devices', { changed: true });
    });
    this.api.zones.on('zone.create', () => this._emit('zones', { changed: true }));
    this.api.zones.on('zone.update', () => this._emit('zones', { changed: true }));
    this.api.zones.on('zone.delete', () => this._emit('zones', { changed: true }));
  }

  _watch(device) {
    this._unwatch(device.id);
    const caps = (device.capabilities || []).filter((c) => WATCHED.includes(c));
    const list = caps.map((capId) => device.makeCapabilityInstance(capId, (value) => {
      this._queue(device.id, capId, value);
    }));
    const alias = aliasesOf(device);
    if (Object.keys(alias).length) this.aliases.set(device.id, alias); else this.aliases.delete(device.id);
    for (const [base, variant] of Object.entries(alias)) {
      list.push(device.makeCapabilityInstance(variant, (value) => this._queue(device.id, base, value)));
    }
    for (const ch of channelsOf(device)) {
      for (const base of CHANNEL_CAPS) {
        const capId = `${base}.${ch}`;
        if (!(device.capabilities || []).includes(capId)) continue;
        list.push(device.makeCapabilityInstance(capId, (value) => this._queue(`${device.id}${SEP}${ch}`, base, value)));
      }
    }
    this.instances.set(device.id, list);
  }

  _unwatch(deviceId) {
    const list = this.instances.get(deviceId);
    if (!list) return;
    for (const instance of list) instance.destroy();
    this.instances.delete(deviceId);
  }

  // Many sensors report at once; batch changes into one realtime message every 250 ms.
  _queue(deviceId, capId, value) {
    const entry = this.pending.get(deviceId) || {};
    entry[capId] = value;
    this.pending.set(deviceId, entry);
    if (this.flushTimer) return;
    this.flushTimer = this.homey.setTimeout(() => {
      this.flushTimer = null;
      const changes = Object.fromEntries(this.pending);
      this.pending.clear();
      this._emit('caps', changes);
    }, 250);
  }

  _emit(event, data) {
    this.emit(event, data);
  }

  static compactDevice(device) {
    const caps = {};
    for (const capId of device.capabilities || []) {
      if (!WATCHED.includes(capId)) continue;
      const obj = device.capabilitiesObj && device.capabilitiesObj[capId];
      caps[capId] = obj ? obj.value : null;
    }
    const alias = aliasesOf(device);
    for (const [base, variant] of Object.entries(alias)) {
      const obj = device.capabilitiesObj && device.capabilitiesObj[variant];
      caps[base] = obj ? obj.value : null;
    }
    const units = {};
    const target = device.capabilitiesObj && device.capabilitiesObj[alias.target_temperature || 'target_temperature'];
    if (target) units.target_temperature = { min: target.min, max: target.max, step: target.step, decimals: target.decimals };
    // The choices of modes, to show them with their own names
    for (const capId of ['thermostat_mode', 'fan_mode']) {
      const obj = device.capabilitiesObj && device.capabilitiesObj[capId];
      if (obj && Array.isArray(obj.values)) units[capId] = { values: obj.values.map((v) => ({ id: v.id, title: typeof v.title === 'object' ? v.title : { en: v.title } })) };
    }
    const driver = device.driverId || device.driverUri || '';
    return {
      id: device.id,
      name: device.name,
      zone: device.zone,
      cls: device.virtualClass || device.class,
      // A plug whose connected device was set in Homey (a TV, a fan on a plug): still a plug, unless it is a lamp
      plug: (device.class === 'socket' && !!device.virtualClass && device.virtualClass !== 'socket') || undefined,
      // Devices made by a group app (several lamps as one device) can be placed as one lamp.
      group: /group/i.test(driver),
      // A virtual device (a flag set by a Flow) can carry any class; it is never taken for a robot vacuum and the like.
      virtual: DeviceHub.isVirtualDriver(driver) || undefined,
      // It counts its energy (meter_power is not watched): a metering plug, not a lamp, even with a dim value
      metered: (device.capabilities || []).includes('meter_power') || undefined,
      available: device.available !== false,
      caps,
      units,
      // The picture of a camera or doorbell, on Homey's own address
      camera: (device.images && device.images[0] && device.images[0].imageObj && device.images[0].imageObj.url) || undefined,
    };
  }

  /** True for the driver of an app that makes virtual devices, Homey's own virtual devices, or a driver called virtual. */
  static isVirtualDriver(driver) {
    const app = (/^homey:app:([^:]+)/.exec(String(driver)) || [])[1];
    return VIRTUAL_APPS.includes(app) || /virtual/i.test(String(driver));
  }

  /** The device and each extra channel of a switch with more buttons, as devices of their own. */
  static compactAll(device) {
    const main = DeviceHub.compactDevice(device);
    const obj = device.capabilitiesObj || {};
    const mainTitle = obj.onoff && obj.onoff.title;
    return [main, ...channelsOf(device).map((ch) => {
      const caps = {};
      for (const base of CHANNEL_CAPS) {
        const c = obj[`${base}.${ch}`];
        if (c) caps[base] = c.value !== undefined ? c.value : null;
      }
      const title = obj[`onoff.${ch}`] && typeof obj[`onoff.${ch}`].title === 'string' ? obj[`onoff.${ch}`].title : '';
      return {
        id: `${device.id}${SEP}${ch}`,
        name: `${device.name} (${title && title !== mainTitle ? title : ch})`,
        zone: main.zone,
        cls: main.cls,
        group: false,
        virtual: main.virtual,
        metered: (device.capabilities || []).includes(`meter_power.${ch}`) || undefined,
        available: main.available,
        caps,
        units: {},
        channelOf: device.id,
      };
    })];
  }

  async getDevices() {
    const devices = await this.api.devices.getDevices();
    return Object.values(devices).flatMap(DeviceHub.compactAll);
  }

  async getZones() {
    const zones = await this.api.zones.getZones();
    return Object.values(zones).map((z) => ({
      id: z.id, name: z.name, parent: z.parent || null, icon: z.icon,
    }));
  }

  async setCapability({ deviceId, capabilityId, value }) {
    if (!SETTABLE.has(capabilityId)) throw new Error(`Capability ${capabilityId} cannot be set from the floor plan`);
    const at = String(deviceId).indexOf(SEP);
    if (at > 0) {
      // A channel of a switch with more buttons
      if (!CHANNEL_CAPS.includes(capabilityId)) throw new Error(`Capability ${capabilityId} cannot be set on a channel`);
      await this.api.devices.setCapabilityValue({ deviceId: deviceId.slice(0, at), capabilityId: `${capabilityId}.${deviceId.slice(at + SEP.length)}`, value });
      return true;
    }
    const alias = this.aliases.get(deviceId);
    await this.api.devices.setCapabilityValue({ deviceId, capabilityId: (alias && alias[capabilityId]) || capabilityId, value });
    return true;
  }

  async destroy() {
    for (const id of [...this.instances.keys()]) this._unwatch(id);
    if (this.flushTimer) this.homey.clearTimeout(this.flushTimer);
  }

}

DeviceHub.SEP = SEP;
DeviceHub.aliasesOf = aliasesOf;

module.exports = DeviceHub;
