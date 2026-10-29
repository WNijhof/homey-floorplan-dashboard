'use strict';

const { discover, buildLive } = require('./energy/energy');

// Energy Dashboard's settings as far as its live calculation reads them; HomeDeck has no energy settings yet.
const ENERGY_DEFAULTS = {
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '', count: {} },
  boiler: { liters: 80, coldWaterTemp: null, showerTemp: 40, showerFlow: 8, warmFrom: 50, topSensor: '', bottomSensor: '', calibrate: false, valve: false, tapCheck: false, tapCheckSince: '', tapCheckPower: '' },
  battery: { invertPower: false },
  grid: { fuseAmps: 25, capacityTariff: null, capacityMin: 2.5 },
  prices: { source: 'off', currency: '' },
  tariffs: {},
  contract: null,
  forecast: { enabled: false, planes: [] },
  layout: null,
  groups: [],
  groupsSolarPhases: [],
  groupsBatteryPhases: [],
  groupsExtra: [],
};

const CACHE_TTL = 5000;

// The device as Energy Dashboard's code expects it (its slimDevice), from a Homey Web API device.
function slimDevice(d) {
  const capabilitiesObj = {};
  for (const [id, cap] of Object.entries(d.capabilitiesObj || {})) capabilitiesObj[id] = { value: cap && cap.value !== undefined ? cap.value : null };
  return {
    id: d.id,
    name: d.name,
    class: d.class,
    virtualClass: d.virtualClass,
    driverId: d.driverId || d.driverUri || null,
    zone: d.zone,
    available: d.available,
    capabilities: d.capabilities || [],
    capabilitiesObj,
    energyObj: d.energyObj || null,
    energy: d.energy || null,
    energySettings: {},
    flags: d.flags || [],
  };
}

const classOf = (d) => d.virtualClass || d.class;
const val = (d, cap) => (d.capabilitiesObj && d.capabilitiesObj[cap] ? d.capabilitiesObj[cap].value : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * What the house view shows: power of the sun, grid, battery, car and house, and which of them exist.
 * devices: slim devices (see slimDevice). Pure, so the demo build and the tests use it too.
 */
function summarize(devices, cfg = {}) {
  const config = { ...ENERGY_DEFAULTS, ...cfg, devices: { ...ENERGY_DEFAULTS.devices, ...(cfg.devices || {}) } };
  const found = discover(devices, config.devices);
  const live = buildLive(devices, found, config);
  const airco = devices.filter((d) => classOf(d) === 'airconditioning').map((d) => ({
    id: d.id,
    name: d.name,
    on: val(d, 'onoff'),
    watts: num(val(d, 'measure_power')),
    temperature: num(val(d, 'measure_temperature')),
    target: num(val(d, 'target_temperature')),
  }));
  const ev = live.ev;
  const evW = ev ? ev.chargers.reduce((sum, c) => sum + (num(c.watts) || 0), 0) : null;
  const heatW = live.heating ? live.heating.devices.reduce((sum, h) => sum + (num(h.watts) || 0), 0) : null;
  return {
    updated: live.updated,
    gridW: num(live.gridW),
    solarW: num(live.solarW),
    homeW: num(live.homeW),
    battery: live.battery ? { soc: num(live.battery.soc), watts: num(live.battery.watts) || 0, count: live.battery.devices.length } : null,
    flows: live.flows,
    ev: ev ? {
      watts: evW,
      charging: ev.chargers.some((c) => c.charging),
      state: (ev.chargers[0] && ev.chargers[0].state) || null,
      session: (ev.chargers[0] && ev.chargers[0].session) || null,
      car: ev.car,
    } : null,
    boiler: live.boiler,
    heating: live.heating ? { watts: heatW, devices: live.heating.devices, thermostat: live.heating.thermostat } : null,
    airco: airco.length ? airco : null,
    gasM3: num(live.gasM3),
    present: {
      grid: !!found.p1,
      solar: found.solar.length > 0,
      battery: found.batteries.length > 0,
      ev: found.evChargers.length > 0,
      car: !!found.car || found.evChargers.length > 0,
      heatpump: found.heating.some((d) => classOf(d) === 'heatpump'),
      boiler: !!found.boiler,
      airco: airco.length > 0,
    },
  };
}

/** Reads every device from the Homey Web API (the floor plan's DeviceHub keeps only what it shows). */
class EnergyHub {

  constructor(hub) {
    this.hub = hub;
    this.cache = null;
    this.pending = null;
  }

  async getLive() {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL) return this.cache.data;
    if (!this.pending) {
      this.pending = (async () => {
        const devices = Object.values(await this.hub.api.devices.getDevices()).map(slimDevice);
        const data = summarize(devices);
        this.cache = { at: Date.now(), data };
        return data;
      })().finally(() => { this.pending = null; });
    }
    return this.pending;
  }

}

module.exports = { EnergyHub, summarize, slimDevice };
