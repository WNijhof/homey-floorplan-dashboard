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
];

const SETTABLE = new Set([
  'onoff', 'dim', 'windowcoverings_set', 'windowcoverings_state', 'locked',
  'target_temperature', 'speaker_playing', 'volume_set', 'light_hue', 'light_saturation',
  'light_temperature',
]);

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
    const units = {};
    const target = device.capabilitiesObj && device.capabilitiesObj.target_temperature;
    if (target) units.target_temperature = { min: target.min, max: target.max, step: target.step };
    const driver = device.driverId || '';
    return {
      id: device.id,
      name: device.name,
      zone: device.zone,
      cls: device.virtualClass || device.class,
      // Devices made by a group app (several lamps as one device) can be placed as one lamp.
      group: /group/i.test(driver),
      available: device.available !== false,
      caps,
      units,
    };
  }

  async getDevices() {
    const devices = await this.api.devices.getDevices();
    return Object.values(devices).map(DeviceHub.compactDevice);
  }

  async getZones() {
    const zones = await this.api.zones.getZones();
    return Object.values(zones).map((z) => ({
      id: z.id, name: z.name, parent: z.parent || null, icon: z.icon,
    }));
  }

  async setCapability({ deviceId, capabilityId, value }) {
    if (!SETTABLE.has(capabilityId)) throw new Error(`Capability ${capabilityId} cannot be set from the floor plan`);
    await this.api.devices.setCapabilityValue({ deviceId, capabilityId, value });
    return true;
  }

  async destroy() {
    for (const id of [...this.instances.keys()]) this._unwatch(id);
    if (this.flushTimer) this.homey.clearTimeout(this.flushTimer);
  }

}

module.exports = DeviceHub;
