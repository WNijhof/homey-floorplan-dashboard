'use strict';

const { discover, buildLive } = require('./energy/energy');

// Energy Dashboard's settings as far as its live calculation reads them, before anything is chosen on the Energy page.
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
  for (const [id, cap] of Object.entries(d.capabilitiesObj || {})) {
    capabilitiesObj[id] = { value: cap && cap.value !== undefined ? cap.value : null };
    if (cap && cap.lastUpdated && id === 'measure_power') capabilitiesObj[id].lastUpdated = cap.lastUpdated;
  }
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
// A solar reading that has not changed for this long while it says the panels deliver is stuck (a cloud link such as
// Enlighten that stopped): it counts as 0 W, so the house does not show sun at night.
const SOLAR_STALE_MS = 45 * 60000;

// The energy meters on the supply of an air conditioner: devices named airco (a HomeWizard kWh meter) that are no air
// conditioner themselves and measure power.
function aircoMeters(devices) {
  return devices.filter((d) => classOf(d) !== 'airconditioning' && /airco|air.?con|klima/i.test(d.name || '') && num(val(d, 'measure_power')) !== null);
}

/** The devices whose power is that of the air conditioners: their own, or else the meters on their supply (as summarize does). */
function aircoPower(devices) {
  const own = devices.filter((d) => classOf(d) === 'airconditioning');
  if (own.some((d) => num(val(d, 'measure_power')))) return own.filter((d) => num(val(d, 'measure_power')) !== null);
  const metered = aircoMeters(devices);
  return metered.length ? metered : own;
}

function summarize(devices, cfg = {}, now = Date.now()) {
  const config = { ...ENERGY_DEFAULTS, ...cfg, devices: { ...ENERGY_DEFAULTS.devices, ...(cfg.devices || {}) } };
  let found = discover(devices, config.devices);
  const stuck = new Set(found.solar.filter((d) => {
    const c = d.capabilitiesObj && d.capabilitiesObj.measure_power;
    const at = c && c.lastUpdated ? Date.parse(c.lastUpdated) : NaN;
    return c && typeof c.value === 'number' && c.value > 0 && Number.isFinite(at) && now - at > SOLAR_STALE_MS;
  }).map((d) => d.id));
  if (stuck.size) {
    devices = devices.map((d) => (stuck.has(d.id) ? { ...d, capabilitiesObj: { ...d.capabilitiesObj, measure_power: { ...d.capabilitiesObj.measure_power, value: 0 } } } : d));
    found = discover(devices, config.devices);
  }
  const live = buildLive(devices, found, config);
  // An entry without an on/off switch (a meter on the supply that was given the class air conditioner) is running while it
  // draws power
  const airco = devices.filter((d) => classOf(d) === 'airconditioning').map((d) => {
    const watts = num(val(d, 'measure_power'));
    const onoff = val(d, 'onoff');
    return {
      id: d.id,
      name: d.name,
      on: typeof onoff === 'boolean' ? onoff : watts !== null ? watts > 30 : null,
      watts,
      temperature: num(val(d, 'measure_temperature')),
      target: num(val(d, 'target_temperature')),
    };
  });
  // An air conditioner that reports no power of its own (none, or a fixed 0 W that never moves), with an energy meter on
  // its supply (a HomeWizard kWh meter named Airco): what that meter measures is the air conditioner running
  if (airco.length && airco.every((a) => !a.watts)) {
    const metered = aircoMeters(devices);
    if (metered.length) {
      const w = metered.reduce((s, d) => s + val(d, 'measure_power'), 0);
      airco[0].watts = Math.round(w);
      if (w > 30) airco[0].on = true;
    }
  }
  const ev = live.ev;
  const evW = ev ? ev.chargers.reduce((sum, c) => sum + (num(c.watts) || 0), 0) : null;
  const heatW = live.heating ? live.heating.devices.reduce((sum, h) => sum + (num(h.watts) || 0), 0) : null;
  return {
    updated: live.updated,
    gridW: num(live.gridW),
    solarW: num(live.solarW),
    solarStuck: stuck.size ? true : undefined,
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
    water: live.water ? { perMinute: num(live.water.flow), total: num(live.water.total) } : null,
    present: {
      grid: !!found.p1,
      solar: found.solar.length > 0,
      battery: found.batteries.length > 0,
      ev: found.evChargers.length > 0,
      car: !!found.car || found.evChargers.length > 0,
      heatpump: found.heating.some((d) => classOf(d) === 'heatpump'),
      boiler: !!found.boiler,
      airco: airco.length > 0,
      water: !!found.water,
      gas: num(live.gasM3) !== null,
    },
  };
}

/** Reads every device from the Homey Web API (the floor plan's DeviceHub keeps only what it shows). */
class EnergyHub {

  // config: the energy settings of the moment (the devices chosen on the Energy page)
  constructor(hub, config = () => ({})) {
    this.hub = hub;
    this.config = config;
    this.cache = null;
    this.pending = null;
  }

  async getLive() {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL) return this.cache.data;
    if (!this.pending) {
      this.pending = (async () => {
        const devices = Object.values(await this.hub.api.devices.getDevices()).map(slimDevice);
        const data = summarize(devices, this.config());
        this.cache = { at: Date.now(), data };
        return data;
      })().finally(() => { this.pending = null; });
    }
    return this.pending;
  }

}

module.exports = { EnergyHub, summarize, slimDevice, aircoPower };
