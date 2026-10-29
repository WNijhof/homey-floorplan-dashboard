// Copied from Energy Dashboard (lib/energy.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

const { contractFrom, tariffFor, hasPrices, typicalImportPrice, NETTING_END } = require('./tariffs');
const { degreeDays, dayKey } = require('./weather');
const { peakCapabilities } = require('./peak');

const PERIODS = {
  today: { resolution: 'today', bucket: 'hour' },
  yesterday: { resolution: 'yesterday', bucket: 'hour' },
  week: { resolution: 'thisWeek', bucket: 'day' },
  month: { resolution: 'thisMonth', bucket: 'day' },
  year: { resolution: 'thisYear', bucket: 'month' },
  lastWeek: { resolution: 'lastWeek', bucket: 'day' },
  lastMonth: { resolution: 'lastMonth', bucket: 'day' },
  lastYear: { resolution: 'lastYear', bucket: 'month' },
};

// The period each period is compared with
const PREVIOUS = { today: 'yesterday', week: 'lastWeek', month: 'lastMonth', year: 'lastYear' };

const MONTH_NAMES = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

const MODE_LABELS = {
  imemory: 'i-Memory',
  green: 'Green',
  program: 'Programma',
  boost: 'Boost',
  on: 'Aan',
  off: 'Uit',
  eco: 'Eco',
  electric: 'Elektrisch',
  performance: 'Prestatie',
  high_demand: 'Hoog verbruik',
  heat_pump: 'Warmtepomp',
  gas: 'Gas',
  auto: 'Automatisch',
  heat: 'Verwarmen',
  cool: 'Koelen',
};

const EV_STATES = {
  plugged_in_charging: 'Laden',
  plugged_in_discharging: 'Ontladen',
  plugged_in_paused: 'Gepauzeerd',
  plugged_in: 'Aangesloten',
  plugged_out: 'Niet aangesloten',
};

// Devices with less than this share of the consumption are left out of the Sankey chart
const SANKEY_MIN_SHARE = 0.005;
const SANKEY_MAX_DEVICES = 15;

const has = (device, capability) => (device.capabilities || []).includes(capability);
// The value of a capability; a number that is not a real number (NaN, Infinity) counts as unknown
const value = (device, capability) => {
  const v = device?.capabilitiesObj?.[capability]?.value ?? null;
  return typeof v === 'number' && !Number.isFinite(v) ? null : v;
};
// A measured amount, or null when the app sends something that is not a number
const amount = (device, capability) => {
  const v = value(device, capability);
  return typeof v === 'number' ? v : null;
};
const isClass = (d, cls) => d.class === cls || d.virtualClass === cls;
// The electric power a device uses: measure_power, or measure_power.in for a heat pump that
// also reports its heat output as measure_power.out (Weheat Blackbird)
const powerCapability = d => (has(d, 'measure_power') ? 'measure_power' : has(d, 'measure_power.in') ? 'measure_power.in' : null);
const usePower = d => (powerCapability(d) ? amount(d, powerCapability(d)) : null);

// Apps whose devices copy the readings of other devices, such as the summaries of Power by the
// Hour (Σ): counting them would count the same use twice
// PV Forecast (be.pvforecast) shows the inverter's power next to its forecast
const COPY_APPS = ['com.gruijter.powerhour', 'be.pvforecast'];
function isCopy(d) {
  const app = String(d.driverId || d.driverUri || '').match(/^homey:app:([^:]+)/)?.[1];
  return COPY_APPS.includes(app);
}

// "Exclude from Energy" in the advanced settings of a device in Homey. The Homey app keeps only
// the energy settings of a device (energySettings), the pc version the whole settings object
function isExcluded(d) {
  return (d.energySettings || d.settings || {}).energy_exclude === true;
}

// Homey's main meter flag (energyObj.cumulative). A Shelly 3EM on one circuit carries it too, but
// then "include in the total" is off in its energy settings (energy_cumulative_include: false).
const isMainMeter = d => Boolean(d.energyObj?.cumulative)
  && (d.energySettings || d.settings || {}).energy_cumulative_include !== false;

// Devices the dashboard leaves out unless they are chosen in the settings. Under Consumers in
// the settings a device can be counted anyway, or never (`countOverride`, set by discover()).
const isLeftOut = d => (d.countOverride === 'include' ? false : d.countOverride === 'exclude' || isCopy(d) || isExcluded(d));

// Apps that make virtual devices, such as test devices for Homey Energy: they can carry the main
// meter flag without being the real meter
const VIRTUAL_APPS = ['nl.qluster-it.DeviceCapabilities', 'com.arjankranenburg.virtual'];
const appOf = d => String(d.driverId || d.driverUri || '').match(/^homey:app:([^:]+)/)?.[1];

// The device that most looks like the P1 meter. A meter without live power (such as a water
// meter with "P1" in its name) is never chosen, and a virtual device only when nothing else fits.
function likelyP1(devices) {
  const score = d => {
    if (!has(d, 'measure_power')) return 0;
    if (has(d, 'onoff') && !isMainMeter(d)) return 0;
    let s = 1;
    if (isMainMeter(d)) s += 4;
    if (hasGridCounters(d)) s += 3;
    if (has(d, 'meter_gas')) s += 2;
    if (phaseCapabilities(d).length) s += 2;
    if (/\bp1\b|dongle|slimme meter|smart meter/i.test(d.name || '')) s += 1;
    if (has(d, 'meter_water')) s -= 2;
    if (VIRTUAL_APPS.includes(appOf(d)) || String(d.driverId || '').startsWith('homey:virtualdriver')) s -= 6;
    return s;
  };
  const best = devices
    .map(d => ({ d, s: score(d) }))
    // Live power alone makes any plug a candidate; it needs at least one sign of a whole-house meter
    .filter(x => x.s >= 2)
    .sort((a, b) => b.s - a.s)[0];
  return best?.d || devices.find(isMainMeter);
}

// Finds the P1 meter, solar panels, home batteries and boiler, unless they are pinned in the config
function discover(devices, pinned = {}) {
  const count = pinned.count && typeof pinned.count === 'object' ? pinned.count : {};
  for (const d of devices) d.countOverride = count[d.id] === 'include' || count[d.id] === 'exclude' ? count[d.id] : null;
  const byId = id => id && devices.find(d => d.id === id);
  // A copy of another meter, or a device excluded from Homey Energy, is only used when it is
  // chosen in the settings
  const own = devices.filter(d => !isLeftOut(d));

  const p1 = byId(pinned.p1) || likelyP1(own);

  const solar = pinned.solar?.length
    ? pinned.solar.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'solarpanel'));

  const batteries = pinned.batteries?.length
    ? pinned.batteries.map(byId).filter(Boolean)
    : own.filter(d => d.energyObj?.homeBattery
      || (isClass(d, 'battery') && (batteryPowerCapabilities(d) || batteryMeterCapability(d, 'charge'))));

  const boiler = byId(pinned.boiler)
    || own.find(d => has(d, 'lydos_showers'))
    || own.find(d => tankSensors(d).bottom)
    || own.find(d => isClass(d, 'waterheater') && has(d, 'measure_temperature'));

  // Heat pumps and central heating boilers (hybrid or all-electric)
  const heating = pinned.heating?.length
    ? pinned.heating.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'heatpump') || isClass(d, 'boiler'));

  const thermostats = own.filter(d => isClass(d, 'thermostat') && has(d, 'measure_temperature'));
  const thermostat = byId(pinned.thermostat)
    || thermostats.find(d => /thermostaat|thermostat|nest|tado|toon|anna|honeywell|ecobee/i.test(d.name))
    || thermostats[0]
    || null;
  // The other rooms with a thermostat or radiator valve, for the Heating block
  const rooms = thermostats.filter(d => d !== thermostat).sort((a, b) => a.name.localeCompare(b.name));

  const evChargers = pinned.evChargers?.length
    ? pinned.evChargers.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'evcharger') || d.energyObj?.evCharger);

  // Every car with a battery level (a household can share one charger); a chosen car comes first
  const cars = own.filter(d => (isClass(d, 'car') || isClass(d, 'vehicle')) && has(d, 'measure_battery'));
  const pinnedCar = byId(pinned.car);
  if (pinnedCar) cars.splice(0, cars.length, pinnedCar, ...cars.filter(d => d.id !== pinnedCar.id));
  const car = cars[0] || null;

  // A device chosen as water meter only counts with a water counter (a P1 meter has none)
  const pinnedWater = byId(pinned.water);
  const water = (pinnedWater && has(pinnedWater, 'meter_water') ? pinnedWater : null)
    || own.find(d => has(d, 'meter_water') && d.id !== p1?.id)
    || (p1 && has(p1, 'meter_water') ? p1 : null)
    || null;

  return { p1, solar, batteries, boiler, heating, thermostat, rooms, evChargers, car, cars, water };
}

// ---------- Blocks ----------

// Everything the dashboard can show. `available` decides whether a block is part of the
// default layout; a layout chosen by the user shows a block even without data.
const BLOCKS = [
  { id: 'flow', title: 'Energie nu', size: 'half', available: () => true },
  { id: 'waterheater', title: 'Warm water', size: 'half', available: f => Boolean(f.boiler) },
  { id: 'heating', title: 'Verwarming', size: 'half', available: f => f.heating.length > 0 || Boolean(f.thermostat) },
  { id: 'ev', title: 'Laadpaal', size: 'half', available: f => f.evChargers.length > 0 },
  { id: 'battery', title: 'Thuisbatterij', size: 'half', available: f => f.batteries.length > 0 },
  { id: 'batteryhistory', title: 'Batterijgebruik', size: 'half', available: f => f.batteries.length > 0 },
  { id: 'tiles', title: 'Totalen', size: 'full', available: () => true },
  { id: 'prices', title: 'Stroomprijs', size: 'large', available: (f, cfg) => cfg.prices?.source !== 'off' },
  { id: 'gauges', title: 'Kengetallen', size: 'small', available: f => f.solar.length > 0 || f.batteries.length > 0 },
  { id: 'consumers', title: 'Apparaten nu', size: 'small', available: () => true },
  { id: 'electricity', title: 'Elektriciteit', size: 'large', available: () => true },
  { id: 'power', title: 'Vermogen vandaag', size: 'full', available: f => Boolean(f.p1) },
  { id: 'sankey', title: 'Energiestromen', size: 'full', available: () => true },
  { id: 'devices', title: 'Verbruik per apparaat', size: 'half', available: () => true },
  { id: 'costs', title: 'Kosten', size: 'half', available: (f, cfg) => hasPrices(contractFrom(cfg), cfg.homeyPrices) },
  { id: 'netting', title: 'Einde salderen', size: 'half', available: f => f.solar.length > 0 },
  // Opt-in like the battery size: they need an advance payment, or read a month of day reports
  { id: 'bill', title: 'Jaarafrekening', size: 'small', available: () => false },
  { id: 'heatmap', title: 'Verbruik per uur', size: 'half', available: () => false },
  // The CO2 of the grid per kWh, from Energy-Charts; only for the countries it knows
  { id: 'co2', title: 'CO2 van het net', size: 'half', available: () => false },
  { id: 'solar', title: 'Zonne-energie', size: 'half', available: f => f.solar.length > 0 },
  { id: 'gas', title: 'Gas', size: 'half', available: (f, cfg) => usesGas(f.p1, cfg) },
  { id: 'water', title: 'Water', size: 'half', available: f => Boolean(f.water) },
  { id: 'meters', title: 'Meterstanden', size: 'small', available: f => Boolean(f.p1 || f.water || f.solar.length) },
  { id: 'baseload', title: 'Sluipverbruik', size: 'small', available: f => Boolean(f.p1) },
  // Only on request: for choosing a home battery, from the use while dark over the last year
  { id: 'batterysize', title: 'Batterij kiezen', size: 'half', available: () => false },
  { id: 'alerts', title: 'Meldingen', size: 'small', available: () => true },
  { id: 'phases', title: 'Fasebelasting', size: 'small', available: f => phaseCapabilities(f.p1).length > 0 },
  { id: 'groups', title: 'Groepen', size: 'small', available: (f, cfg) => savedGroups(cfg).length > 0 },
  // The Belgian capacity tariff: shown when the meter reports its monthly peak or a tariff is set.
  // HomeWizard gives every P1 meter the capability, but a Dutch meter leaves it empty.
  { id: 'peak', title: 'Maandpiek', size: 'small', available: (f, cfg) => typeof value(f.p1, peakCapabilities(f.p1).peak) === 'number' || Number(cfg.grid?.capacityTariff) > 0 },
];

const SIZES = ['small', 'half', 'large', 'full'];

// Block heights are counted in grid rows of the dashboard (24 px each, gap included).
// A block without `rows` takes the height of its content.
const MIN_ROWS = 4;
const MAX_ROWS = 80;
const validRows = rows => Number.isInteger(rows) && rows >= MIN_ROWS && rows <= MAX_ROWS;

function layoutItem(id, size, rows) {
  return validRows(rows) ? { id, size, rows } : { id, size };
}

function defaultLayout(found, cfg = {}) {
  return BLOCKS.filter(b => b.available(found, cfg)).map(b => ({ id: b.id, size: b.size }));
}

// The saved layout, cleaned up, or the default one when nothing was saved
// Blocks that were merged into another one: an older layout shows the new block instead
const MERGED = { solarperf: 'solar' };
const current = layout => layout.map(b => (b && MERGED[b.id] ? { ...b, id: MERGED[b.id] } : b));

function resolveLayout(saved, found, cfg = {}) {
  if (!Array.isArray(saved) || !saved.length) return defaultLayout(found, cfg);
  saved = current(saved);
  const known = new Set(BLOCKS.map(b => b.id));
  const seen = new Set();
  return saved
    .filter(b => known.has(b.id) && !seen.has(b.id) && seen.add(b.id))
    .map(b => layoutItem(b.id, SIZES.includes(b.size) ? b.size : BLOCKS.find(x => x.id === b.id).size, b.rows));
}

// Today's totals per source, shown in the live energy diagram
function todayTotals(totals) {
  if (!totals) return null;
  const { solar, import: imported, export: exported, consumption, charge, discharge } = totals;
  return { solar, import: imported, export: exported, consumption, charge, discharge };
}

// Named layouts, for screens that show something else (a tablet in the kitchen, the office):
// short names of lowercase letters, digits and dashes. An empty name is the default layout.
const LAYOUT_NAME = /^[a-z0-9][a-z0-9-]{0,23}$/;
const layoutName = name => {
  const clean = String(name || '').trim().toLowerCase();
  return LAYOUT_NAME.test(clean) ? clean : '';
};
const savedLayout = (cfg, name) => (name && Array.isArray(cfg.layouts?.[name]) ? cfg.layouts[name] : cfg.layout);

// The blocks shown in any layout, so the history reads what any screen needs
function shownBlocks(cfg, found) {
  const ids = new Set(resolveLayout(cfg.layout, found, cfg).map(b => b.id));
  for (const layout of Object.values(cfg.layouts || {})) {
    resolveLayout(layout, found, cfg).forEach(b => ids.add(b.id));
  }
  return ids;
}

// Checks a layout sent by the dashboard's edit mode; null means "back to the automatic layout".
// Its errors are the sender's fault (400), not the server's.
const layoutError = message => Object.assign(new Error(message), { status: 400 });

function validateLayout(input) {
  if (input === null) return null;
  if (!Array.isArray(input) || !input.length) throw layoutError('Kies minstens één blok');
  input = current(input).filter((b, i, all) => all.findIndex(x => x?.id === b?.id) === i);
  const known = new Set(BLOCKS.map(b => b.id));
  const seen = new Set();
  const layout = [];
  for (const item of input) {
    if (!item || !known.has(item.id) || seen.has(item.id)) throw layoutError(`Onbekend blok: ${item?.id}`);
    if (!SIZES.includes(item.size)) throw layoutError(`Onbekende breedte: ${item.size}`);
    if (item.rows !== undefined && item.rows !== null && !validRows(item.rows)) throw layoutError(`Onbekende hoogte: ${item.rows}`);
    seen.add(item.id);
    layout.push(layoutItem(item.id, item.size, item.rows));
  }
  return layout;
}

// Guards the edit mode with an optional PIN, and slows down guessing
class PinGuard {

  constructor() {
    this.failures = 0;
    this.lockedUntil = 0;
  }

  check(expected, given) {
    if (!expected) return;
    if (Date.now() < this.lockedUntil) {
      const err = new Error('Te veel verkeerde pincodes. Probeer het over een minuut opnieuw.');
      err.status = 429;
      throw err;
    }
    if (String(given ?? '') !== String(expected)) {
      this.failures++;
      if (this.failures >= 5) {
        this.failures = 0;
        this.lockedUntil = Date.now() + 60 * 1000;
      }
      const err = new Error('Verkeerde pincode');
      err.status = 403;
      throw err;
    }
    this.failures = 0;
  }

}

function blockCatalog() {
  return BLOCKS.map(({ id, title, size }) => ({ id, title, size }));
}

// Cumulative kWh capabilities of the P1 meter; tariff splits (t1/t2) are summed
function meterCapabilities(device, direction) {
  if (!device) return [];
  const explicit = direction === 'import'
    ? device.energyObj?.cumulativeImportedCapability
    : device.energyObj?.cumulativeExportedCapability;
  if (explicit && has(device, explicit)) return [explicit];

  const pattern = direction === 'import'
    ? /^meter_power\.(imported|consumed|delivered|import)/
    : /^meter_power\.(exported|produced|returned|export)/;
  const matches = (device.capabilities || []).filter(c => pattern.test(c));
  const totals = matches.filter(c => !/\.t\d$/.test(c));
  if (totals.length) return totals.slice(0, 1);
  if (matches.length) return matches;

  // A meter with a single kWh counter only knows import
  return direction === 'import' && has(device, 'meter_power') ? ['meter_power'] : [];
}

// kWh counter of a solar panel or inverter: the one its app tells Homey Energy to use (Huawei
// FusionSolar uses meter_power.pv_total), else meter_power, else a lifetime total by name.
// A HomeWizard kWh meter at the panels counts meter_power down (-778 kWh) and has
// meter_power.produced.t1 next to it: then the produced counter is the one that goes up.
function solarMeterCapability(device) {
  const explicit = device.energyObj?.meterPowerExportedCapability;
  if (explicit && has(device, explicit)) return explicit;
  const named = (device.capabilities || [])
    .find(c => /^meter_power\.(pv_total|total|generated|produced|exported|export)(\.t1)?$/.test(c)) || null;
  if (has(device, 'meter_power') && !(named && value(device, 'meter_power') < 0)) return 'meter_power';
  return named;
}

// Readings of a solar kWh counter. Homey's own choice may have no Insights log (Zevercloud:
// measure_e-total, GitHub #15); then the counter found without it, which often has one.
// A lifetime counter in whole kWh hides most of a day: Zevercloud gets its total in MWh with
// two decimals, so it moves in steps of 10 kWh. A finer day counter (measure_e-total-today,
// meter_power.day) read at least hourly then tells the yield; it drops to 0 at night, which
// counts as nothing, like a meter reset.
const SOLAR_DAY_COUNTER = /^(meter_power|measure_e-total)[._-](day|today)$/;
const wholeKWh = entries => entries.every(e => Math.abs(e.v - Math.round(e.v)) < 1e-6);
async function solarMeterEntries(device, read) {
  const first = solarMeterCapability(device);
  let entries = first ? await read(device, first) : [];
  if (entries.length < 2) {
    const other = solarMeterCapability({ ...device, energyObj: null });
    if (other && other !== first) entries = await read(device, other);
  }
  const day = (device.capabilities || []).find(c => SOLAR_DAY_COUNTER.test(c));
  if (!day || (entries.length >= 2 && !wholeKWh(entries))) return entries;
  const daily = await read(device, day);
  const step = typicalStep(daily);
  return step && step <= 3600000 && !wholeKWh(daily) ? daily : entries;
}

// kWh counter of a home battery for energy going in (charge) or out (discharge)
function batteryMeterCapability(device, direction) {
  const explicit = direction === 'charge'
    ? device.energyObj?.meterPowerImportedCapability
    : device.energyObj?.meterPowerExportedCapability;
  if (explicit && has(device, explicit)) return explicit;
  // Enphase IQ Battery has its own kWh counters, iqbattery_charge and iqbattery_discharge
  const pattern = direction === 'charge'
    ? /^(meter_power\.(charged|charge|imported|import|in)|iqbattery_charge)$/
    : /^(meter_power\.(discharged|discharge|exported|export|out)|iqbattery_discharge)$/;
  return (device.capabilities || []).find(c => pattern.test(c)) || null;
}

// For a battery that only has kWh counters (Enphase IQ Battery), the power follows from how
// fast they rise: the average over the last two changes of each counter, while those are recent
const counterReadings = new Map();
const COUNTER_FRESH = 30 * 60 * 1000;

function counterPower(device, now = Date.now()) {
  const read = direction => {
    const cap = batteryMeterCapability(device, direction);
    const kWh = cap ? amount(device, cap) : null;
    if (kWh === null) return 0;
    const key = `${device.id}:${cap}`;
    const seen = counterReadings.get(key) || { last: null, before: null };
    if (!seen.last || seen.last.kWh !== kWh) {
      seen.before = seen.last;
      seen.last = { kWh, t: now };
      counterReadings.set(key, seen);
    }
    const { last, before } = seen;
    if (!before || now - last.t > COUNTER_FRESH || last.kWh < before.kWh) return 0;
    const hours = (last.t - before.t) / 3600000;
    return hours > 0 ? (last.kWh - before.kWh) * 1000 / hours : 0;
  };
  return read('charge') - read('discharge');
}

// Some apps report the battery power the other way round. With a charging state as well
// (Homey's battery_charging_state: charging, discharging or idle) the app learns which way
// each battery reports, and uses that before the "invert" setting. The power is read many times
// (every screen, widget and warning), so a battery gets at most one vote per 30 seconds, only
// with a clear power, and it takes a lead of 5 votes to decide: a charging state that follows the
// power a little late (some apps update it slowly) does not turn the battery round.
const powerDirection = new Map();
const VOTE_EVERY = 30 * 1000;
const VOTE_WATTS = 100;
const VOTE_MAX = 10;
const VOTE_LEAD = 5;

function learnDirection(device, watts, now = Date.now()) {
  const state = value(device, 'battery_charging_state');
  if (Math.abs(watts) < VOTE_WATTS || (state !== 'charging' && state !== 'discharging')) return;
  const seen = powerDirection.get(device.id) || { votes: 0, at: 0 };
  if (now - seen.at < VOTE_EVERY) return;
  const agrees = (watts > 0) === (state === 'charging');
  powerDirection.set(device.id, { votes: Math.max(-VOTE_MAX, Math.min(VOTE_MAX, seen.votes + (agrees ? -1 : 1))), at: now });
}

// Whether a battery's power is inverted: learned from its charging state, or the setting
function invertedPower(device, cfg = {}) {
  const votes = powerDirection.get(device.id)?.votes ?? 0;
  if (votes >= VOTE_LEAD) return true;
  if (votes <= -VOTE_LEAD) return false;
  return Boolean(cfg.invertPower);
}

// For the diagnosis: the power as reported, the charging state, the learned votes and the result
function batteryDirection(device, cfg = {}) {
  return {
    reported: amount(device, 'measure_power'),
    chargingState: value(device, 'battery_charging_state'),
    votes: powerDirection.get(device.id)?.votes ?? 0,
    inverted: invertedPower(device, cfg),
  };
}

// Where a battery reports its power: one measure_power (positive while charging), or, as some
// apps do (Indevolt), a separate power for charging and one for discharging, both positive
function batteryPowerCapabilities(device) {
  if (has(device, 'measure_power')) return { net: 'measure_power' };
  const find = pattern => (device.capabilities || []).find(c => pattern.test(c)) || null;
  const charge = find(/^measure_power\.(charge|charging|charged|in)$/);
  const discharge = find(/^measure_power\.(discharge|discharging|discharged|out)$/);
  return charge || discharge ? { charge, discharge } : null;
}

// Battery power in W, positive while charging and negative while discharging (Homey's convention)
function batteryPower(device, cfg) {
  const caps = batteryPowerCapabilities(device);
  let watts;
  if (!caps) {
    // Only kWh counters: the power follows from how fast they rise, always the right way round
    return batteryMeterCapability(device, 'charge') ? counterPower(device) : 0;
  }
  if (caps.net) {
    watts = amount(device, caps.net);
    if (watts === null) return 0;
  } else {
    const read = cap => (cap ? Math.abs(amount(device, cap) || 0) : 0);
    watts = read(caps.charge) - read(caps.discharge);
  }
  learnDirection(device, watts);
  return invertedPower(device, cfg) ? -watts : watts;
}

// The battery power (W, positive while charging) from Insights. With separate charge and
// discharge readings, each moment gets the last value of both.
async function batteryPowerEntries(device, read, cfg = {}) {
  const caps = batteryPowerCapabilities(device);
  if (!caps) return [];
  const sign = invertedPower(device, cfg) ? -1 : 1;
  if (caps.net) return (await read(device, caps.net)).map(e => ({ t: e.t, v: e.v * sign }));
  const [charge, discharge] = await Promise.all([caps.charge, caps.discharge].map(cap => (cap ? read(device, cap) : [])));
  const events = [
    ...charge.map(e => ({ t: e.t, charge: Math.abs(e.v) })),
    ...discharge.map(e => ({ t: e.t, discharge: Math.abs(e.v) })),
  ].sort((a, b) => a.t - b.t);
  let lastCharge = 0;
  let lastDischarge = 0;
  const out = [];
  for (const e of events) {
    if (e.charge !== undefined) lastCharge = e.charge;
    if (e.discharge !== undefined) lastDischarge = e.discharge;
    const point = { t: e.t, v: (lastCharge - lastDischarge) * sign };
    if (out.length && out[out.length - 1].t.getTime() === e.t.getTime()) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

// Splits the energy of one period (or the power of one moment) into flows between
// sources and destinations, the way Home Assistant does: solar is used for export first,
// then for charging the battery, and what is left goes to the house.
function allocateFlows({ solar = 0, imported = 0, exported = 0, charge = 0, discharge = 0 }) {
  const solarToGrid = Math.min(solar, exported);
  const batteryToGrid = Math.min(discharge, exported - solarToGrid);
  const solarToBattery = Math.min(solar - solarToGrid, charge);
  const gridToBattery = Math.max(0, Math.min(imported, charge - solarToBattery));
  const solarToHome = Math.max(0, solar - solarToGrid - solarToBattery);
  const gridToHome = Math.max(0, imported - gridToBattery);
  const batteryToHome = Math.max(0, discharge - batteryToGrid);
  return { solarToHome, solarToGrid, solarToBattery, gridToHome, gridToBattery, batteryToHome, batteryToGrid };
}

// Power right now in the shape of a period's totals, for the live Sankey chart
function liveTotals({ solarW, gridW, batteryW, homeW, flows }) {
  return {
    solar: solarW || 0,
    import: Math.max(0, gridW || 0),
    export: Math.max(0, -(gridW || 0)),
    charge: Math.max(0, batteryW || 0),
    discharge: Math.max(0, -(batteryW || 0)),
    consumption: homeW || 0,
    ...flows,
  };
}

// Temperature of the tap water: the chosen value, or a Dutch year curve (about 6 °C in February,
// 17 °C in early August) when it is left empty. Exactly 10 is the old default that every saved
// settings page holds, so that counts as empty too.
function coldWater(cfg, now = new Date()) {
  if (typeof cfg.coldWaterTemp === 'number' && cfg.coldWaterTemp !== 10) return cfg.coldWaterTemp;
  const dayOfYear = (now - new Date(now.getFullYear(), 0, 0)) / 86400000;
  return Math.round((11.5 + 5.5 * Math.cos(2 * Math.PI * (dayOfYear - 215) / 365)) * 10) / 10;
}

function showerMinutes(temperature, cfg, now = new Date()) {
  if (typeof temperature !== 'number') return null;
  const { liters, showerTemp, showerFlow } = cfg;
  const coldWaterTemp = coldWater(cfg, now);
  if (temperature <= showerTemp) return 0;
  const mixedLiters = liters * (temperature - coldWaterTemp) / (showerTemp - coldWaterTemp);
  return Math.round(mixedLiters / showerFlow);
}

// The temperature sensors of a tank: one (a boiler with a single sensor), or a top and a bottom
// one (Weheat: dhw_top / dhw_bottom). `cfg.topSensor` / `cfg.bottomSensor` are capability ids
// chosen in the settings ('' = automatic, bottomSensor 'none' = no bottom sensor). Automatic
// finds the layers by their words (top, upper, boven / bottom, lower, onder); a device with
// several other temperatures (air, water in/out) and no such words uses `measure_temperature`.
const TANK_TOP = /(^|[._-])(top|upper|boven\w*|hoog)([._-]|$)/i;
const TANK_BOTTOM = /(^|[._-])(bottom|lower|onder\w*|beneden|laag)([._-]|$)/i;
function tankSensors(device, cfg = {}) {
  const temps = (device.capabilities || []).filter(c => c === 'measure_temperature' || c.startsWith('measure_temperature.'));
  const chosen = id => (id && id !== 'none' && temps.includes(id) ? id : null);
  let top = chosen(cfg.topSensor);
  let bottom = cfg.bottomSensor === 'none' ? null : chosen(cfg.bottomSensor);
  if (!top) {
    const sub = c => c.split('.').slice(1).join('.');
    const auto = temps.find(c => c.includes('.') && TANK_TOP.test(sub(c)));
    const low = temps.find(c => c.includes('.') && TANK_BOTTOM.test(sub(c)));
    if (auto && (low || temps.length === 1)) { top = auto; bottom = cfg.bottomSensor === 'none' ? null : bottom || low || null; }
    else if (auto) { top = auto; }
  }
  if (!top) top = temps.includes('measure_temperature') ? 'measure_temperature' : (temps.length === 1 ? temps[0] : null);
  if (bottom === top) bottom = null;
  return { top, bottom };
}

// Tank with a top and a bottom sensor. Model after
// github.com/Akashironld/ha-shower-time (MIT), without its nightly learning: the hot layer floats
// on cold water, so tank average = bottom + w(bottom) * (top - bottom), and the hot water is used
// up when the average falls to cold + phi * (showerTemp + 2 - cold).
const TANK_W = [[20, 0.65], [30, 0.55], [45, 0.42]];
const TANK_PHI = 0.72;

function tankWeight(bottom) {
  if (bottom <= TANK_W[0][0]) return TANK_W[0][1];
  for (let i = 1; i < TANK_W.length; i++) {
    const [b0, w0] = TANK_W[i - 1];
    const [b1, w1] = TANK_W[i];
    if (bottom <= b1) return w0 + (w1 - w0) * (bottom - b0) / (b1 - b0);
  }
  return TANK_W[TANK_W.length - 1][1];
}

function tankAverage(top, bottom) {
  if (typeof bottom !== 'number') return top;
  if (top <= bottom) return (top + bottom) / 2;
  return bottom + tankWeight(bottom) * (top - bottom);
}

function layeredShowerMinutes(top, bottom, cfg, now = new Date()) {
  if (typeof top !== 'number') return null;
  const { liters, showerTemp, showerFlow } = cfg;
  if (top < showerTemp + 2) return 0;
  const cold = coldWater(cfg, now);
  const empty = cold + TANK_PHI * (showerTemp + 2 - cold);
  const perMinute = showerFlow * Math.max(showerTemp - cold, 5) / liters;
  return Math.max(0, Math.round((tankAverage(top, bottom) - empty) / perMinute));
}

function boilerStatus(temperature, cfg) {
  if (typeof temperature !== 'number') return 'unknown';
  if (temperature >= cfg.warmFrom) return 'warm';
  if (temperature > cfg.showerTemp + 2) return 'lukewarm';
  return 'cold';
}

function assumptions({ liters, showerTemp, showerFlow, warmFrom, measuredFlow, measuredShowers, calibrate }) {
  return {
    liters, showerTemp, showerFlow, warmFrom,
    measured: measuredFlow ? measuredShowers : 0,
    // How far the calibration is, for the note below the boiler (null while it is off)
    calibration: calibrate ? { count: measuredShowers || 0, needed: SHOWER_NEEDED } : null,
  };
}

// Calibration with a shower button (opt-in): a Flow marks the start and the end of a shower, and
// the drop of the tank temperature in that time gives the real flow of the shower head. The model
// loses (showerTemp - cold) * flow / liters degrees of tank average per minute, so
// flow = liters * drop / ((showerTemp - cold) * minutes), for one sensor and for two.
const SHOWER_MIN_MINUTES = 2;
const SHOWER_MAX_MINUTES = 30;
const SHOWER_MIN_DROP = 3;
const SHOWER_FLOW_RANGE = [3, 20];
const SHOWER_KEEP = 10;
const SHOWER_NEEDED = 3;

// The saved showers without the one at `at`
function withoutShower(samples, at) {
  return (samples || []).filter(s => s.at !== at);
}

// The tank average of a boiler device now, as the model sees it, whether it is heating, and the
// water meter (when there is one) in liters
function tankReading(device, cfg, water = null) {
  if (!device) return null;
  const sensors = tankSensors(device, cfg);
  const top = sensors.top ? value(device, sensors.top) : null;
  if (typeof top !== 'number') return null;
  const bottom = sensors.bottom ? value(device, sensors.bottom) : null;
  const m3 = water ? value(water, 'meter_water') : null;
  return {
    average: tankAverage(top, typeof bottom === 'number' ? bottom : null),
    heating: value(device, 'lydos_heating') === true,
    liters: typeof m3 === 'number' ? m3 * 1000 : null,
  };
}

// One shower from two readings. Returns the flow in L/min, or null when the shower cannot be
// trusted. With a water meter the liters used in that time are the flow itself (the meter must show
// a plausible amount: its steps can be coarse, and a flush or tap adds a little). Without one, or
// when that amount is implausible, the temperature drop is used: not when the drop is too small for
// the sensor, or the boiler was heating in between.
const SHOWER_WATER_RANGE = [10, 400];
function showerSample(start, end, cfg, now = new Date()) {
  if (!start || !end) return null;
  const minutes = (end.at - start.at) / 60000;
  if (minutes < SHOWER_MIN_MINUTES || minutes > SHOWER_MAX_MINUTES) return null;
  const used = end.liters - start.liters;
  if (used >= SHOWER_WATER_RANGE[0] && used <= SHOWER_WATER_RANGE[1]) {
    const flow = used / minutes;
    if (flow >= SHOWER_FLOW_RANGE[0] && flow <= SHOWER_FLOW_RANGE[1]) {
      return { at: end.at, minutes: Math.round(minutes * 10) / 10, liters: Math.round(used), flow: Math.round(flow * 10) / 10, source: 'water' };
    }
  }
  if (start.heating || end.heating) return null;
  const drop = start.average - end.average;
  if (drop < SHOWER_MIN_DROP) return null;
  const span = cfg.showerTemp - coldWater(cfg, now);
  if (span <= 0) return null;
  const flow = cfg.liters * drop / (span * minutes);
  if (flow < SHOWER_FLOW_RANGE[0] || flow > SHOWER_FLOW_RANGE[1]) return null;
  return { at: end.at, minutes: Math.round(minutes * 10) / 10, drop: Math.round(drop * 10) / 10, flow: Math.round(flow * 10) / 10, source: 'temperature' };
}

// The measured flow: the median of the latest showers, once there are enough of them
function measuredFlow(samples) {
  const flows = (samples || []).slice(-SHOWER_KEEP).map(s => s.flow).filter(f => typeof f === 'number').sort((a, b) => a - b);
  if (flows.length < SHOWER_NEEDED) return null;
  const mid = flows.length >> 1;
  return Math.round((flows.length % 2 ? flows[mid] : (flows[mid - 1] + flows[mid]) / 2) * 10) / 10;
}

// Where hot tap water comes from, as the user's Flow commands it (a three-way valve between the
// tank and the gas boiler): what the Flow asked, not a reading of the valve. The first command only
// sets the start, its time is not a switch; a repeated command changes nothing. Keeps the last 3
// switches, newest first. Idea and first version by rfleer65-afk (GitHub #21, PR #22).
const TAPWATER_SOURCES = ['boiler', 'cv'];
const TAPWATER_KEEP = 3;
function recordTapwater(log, source, reason = '', at = Date.now()) {
  if (!TAPWATER_SOURCES.includes(source)) throw new Error(`Unknown tap water source: ${source}`);
  if (log?.source === source) return log;
  const switched = TAPWATER_SOURCES.includes(log?.source);
  const entry = { source, at, reason: String(reason || '').trim().slice(0, 160) };
  const history = Array.isArray(log?.history) ? log.history : [];
  return { source, history: switched ? [entry, ...history].slice(0, TAPWATER_KEEP) : [] };
}

function buildBoiler(device, boilerCfg) {
  if (!device) return null;
  // With the calibration on and enough showers measured, the measured flow replaces the entered one
  const calibrated = Boolean(boilerCfg.calibrate && boilerCfg.measuredFlow);
  const cfg = calibrated ? { ...boilerCfg, showerFlow: boilerCfg.measuredFlow } : boilerCfg;
  const sensors = tankSensors(device, cfg);
  const top = sensors.top ? value(device, sensors.top) : null;
  const bottom = sensors.bottom ? value(device, sensors.bottom) : null;
  const layered = typeof bottom === 'number' && typeof top === 'number';
  const temperature = top;
  const mode = value(device, 'lydos_mode') ?? value(device, 'hot_water_mode') ?? value(device, 'heater_operation_mode');
  return {
    name: device.name,
    available: device.available !== false,
    temperature,
    target: value(device, 'target_temperature'),
    heating: value(device, 'lydos_heating'),
    on: value(device, 'onoff'),
    mode: MODE_LABELS[mode] || mode,
    showers: value(device, 'lydos_showers'),
    bottom: layered && typeof bottom === 'number' ? bottom : null,
    minutes: layered ? layeredShowerMinutes(top, bottom, cfg) : showerMinutes(temperature, cfg),
    status: boilerStatus(temperature, cfg),
    assumptions: assumptions({ ...cfg, measuredFlow: calibrated ? cfg.showerFlow : null }),
  };
}

// `watts` (by device id) holds the power of an earlier moment; that then replaces batteryPower(),
// which learns the direction and counter speed from the readings of now
function buildBattery(devices, cfg, watts = null) {
  if (!devices.length) return null;
  const socs = devices.map(d => amount(d, 'measure_battery')).filter(v => v !== null);
  const power = d => (watts ? watts[d.id] ?? 0 : batteryPower(d, cfg));
  return {
    names: devices.map(d => d.name),
    watts: devices.reduce((sum, d) => sum + power(d), 0),
    soc: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null,
    devices: devices.map(d => ({ name: d.name, soc: value(d, 'measure_battery'), watts: power(d) })),
  };
}

function buildHeating(found) {
  if (!found.heating.length && !found.thermostat) return null;
  const t = found.thermostat;
  const thermostatMode = t ? value(t, 'thermostat_mode') : null;
  return {
    devices: found.heating.map(d => {
      const mode = value(d, 'heater_operation_mode');
      return {
        name: d.name,
        watts: usePower(d),
        mode: MODE_LABELS[mode] || mode,
        on: value(d, 'onoff'),
        temperature: value(d, 'measure_temperature'),
      };
    }),
    thermostat: t ? {
      name: t.name,
      temperature: value(t, 'measure_temperature'),
      target: value(t, 'target_temperature'),
      mode: MODE_LABELS[thermostatMode] || thermostatMode,
    } : null,
    rooms: (found.rooms || []).map(d => ({
      name: d.name,
      temperature: value(d, 'measure_temperature'),
      target: value(d, 'target_temperature'),
    })),
  };
}

// kWh of a charging session as the app of the charger keeps it (Zaptec: meter_power.current_session
// and meter_power.last_session): the running session while it has taken something, else the last one
const SESSION_NOW = /^meter_power\.(current_session|session|current_charge)$/;
const SESSION_LAST = /^meter_power\.(last_session|last_charge)$/;

function evSession(device) {
  const reading = pattern => {
    const cap = (device.capabilities || []).find(c => pattern.test(c));
    const v = cap ? value(device, cap) : null;
    return typeof v === 'number' && v >= 0 ? v : null;
  };
  const now = reading(SESSION_NOW);
  const last = reading(SESSION_LAST);
  if (now > 0 || (now !== null && last === null)) return { kWh: now, last: false };
  return last !== null ? { kWh: last, last: true } : null;
}

function buildEv(found) {
  if (!found.evChargers.length) return null;
  const chargers = found.evChargers.map(d => {
    const state = value(d, 'evcharger_charging_state');
    const charging = value(d, 'evcharger_charging');
    return {
      name: d.name,
      watts: value(d, 'measure_power'),
      state: EV_STATES[state] || (charging === true ? 'Laden' : charging === false ? 'Niet aan het laden' : null),
      charging: state ? state === 'plugged_in_charging' : charging === true,
      soc: value(d, 'measure_battery'),
      session: evSession(d),
    };
  });
  const cars = (found.cars || (found.car ? [found.car] : [])).map(d => ({
    name: d.name,
    soc: value(d, 'measure_battery'),
    charging: value(d, 'ev_charging_state') === 'plugged_in_charging' || value(d, 'battery_charging_state') === 'charging',
  }));
  // `car` is the first one, for pages and widgets from before there could be more
  return { chargers, cars, car: cars[0] || null };
}

// Whether the house uses gas: the P1 meter has a gas counter with a reading, and the contract
// does not say "no gas" (all-electric). Some meters pass on a gas counter that stays empty or at
// 0 in a house without gas; that does not count.
function usesGas(p1, cfg = {}) {
  if (!p1 || !has(p1, 'meter_gas')) return false;
  if (cfg.contract?.gas?.type === 'none') return false;
  const reading = value(p1, 'meter_gas');
  return typeof reading === 'number' && reading > 0;
}

// Per-phase readings of the P1 meter, e.g. measure_current.l1 or measure_power.phase2
function phaseCapabilities(device) {
  if (!device) return [];
  return (device.capabilities || []).filter(c => /^measure_(current|power|voltage)\.(l|phase|L)?[123]$/.test(c));
}

function buildPhases(device, cfg) {
  const caps = phaseCapabilities(device);
  if (!caps.length) return null;
  const phases = [1, 2, 3].map(n => {
    const find = kind => caps.find(c => c.startsWith(`measure_${kind}.`) && c.endsWith(String(n)));
    const read = kind => (find(kind) ? value(device, find(kind)) : null);
    return { phase: n, amps: read('current'), watts: read('power'), volts: read('voltage') };
  }).filter(p => p.amps !== null || p.watts !== null || p.volts !== null);
  return { phases, fuseAmps: cfg.grid?.fuseAmps || 25 };
}

// Groups in the fuse box, set in the app settings:
// [{ id, name, fuseAmps, phases: [1..3], fixedWatts, devices: [ids] }]. `phases` are the phases
// the group is on (empty when unknown; a cooking group can be on two). Groups without a name are
// left out. Older settings saved `phases` as a count (1 or 3). A device can be in more groups
// (a Perilex hob on two groups): its power is then split evenly over them.
const phaseList = list => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(n => n >= 1 && n <= 3))].sort();

function savedGroups(cfg = {}) {
  return (Array.isArray(cfg.groups) ? cfg.groups : [])
    .filter(g => g && String(g.name || '').trim())
    .map(g => ({
      id: String(g.id || g.name),
      name: String(g.name).trim(),
      fuseAmps: Number(g.fuseAmps) > 0 ? Number(g.fuseAmps) : 16,
      phases: !Array.isArray(g.phases) && Number(g.phases) === 3 ? [1, 2, 3] : phaseList(g.phases),
      fixedWatts: Number(g.fixedWatts) > 0 ? Number(g.fixedWatts) : 0,
      devices: Array.isArray(g.devices) ? g.devices.map(String) : [],
    }));
}

// Devices that are not in Homey, entered in the settings with a use of their own:
// `groupsExtra: [{ id, name, watts }]`. Their ids go in the groups' `devices` like a Homey device.
function groupExtras(cfg = {}) {
  return new Map((Array.isArray(cfg.groupsExtra) ? cfg.groupsExtra : [])
    .filter(x => x && x.id && String(x.name || '').trim() && Number(x.watts) > 0)
    .map(x => [String(x.id), { name: String(x.name).trim(), watts: Number(x.watts) }]));
}

// In how many groups each device is: its power counts for that share in each
function groupShares(groups) {
  const shares = new Map();
  for (const g of groups) for (const id of new Set(g.devices)) shares.set(id, (shares.get(id) || 0) + 1);
  return shares;
}

// The phases the solar panels feed in on, for what each phase uses: all three unless set
function solarPhases(cfg = {}) {
  const list = phaseList(cfg.groupsSolarPhases);
  return list.length ? list : [1, 2, 3];
}

// The phases the home battery is connected to: all three unless set
function batteryPhases(cfg = {}) {
  const list = phaseList(cfg.groupsBatteryPhases);
  return list.length ? list : [1, 2, 3];
}

// Whether Homey estimates the use of a device without a power meter: a constant use or a use when
// on and off, set by the user on the device (energy_value_*) or by its app (energy.approximation)
function hasUsageEstimate(d) {
  if (!d || has(d, 'measure_power')) return false;
  const set = Object.entries(d.energySettings || d.settings || {})
    .some(([key, v]) => /^energy_value_/.test(key) && Number(v) > 0);
  const approx = d.energy?.approximation || d.energyObj?.approximation || {};
  return set || ['usageConstant', 'usageOn', 'usageOff'].some(key => Number(approx[key]) > 0);
}

// The power of each group: its measured devices, devices without a meter by Homey's own estimate
// (the "Constant power usage" or on/off usage set on the device, from Homey Energy), devices not
// in Homey with the use entered for them, plus the fixed use entered for the group.
// `estimates` holds the estimated watts by device id; a device in n groups counts 1/n in each.
function groupWatts(group, byId, estimates = new Map(), shares = new Map(), extras = new Map()) {
  const powered = [...new Set(group.devices)]
    .map(id => {
      const share = shares.get(id) || 1;
      const extra = extras.get(id);
      if (extra) return { name: extra.name, watts: extra.watts / share, estimated: true };
      const d = byId.get(id);
      if (!d) return null;
      // The meter of the whole house measures every group at once, not its own use (forum NL #100)
      if (isGridMeter(d)) return null;
      return powerCapability(d)
        ? { name: d.name, watts: Math.max(0, usePower(d) || 0) / share }
        : { name: d.name, watts: (estimates.get(d.id) || 0) / share, estimated: true };
    })
    .filter(Boolean)
    .filter(d => d.watts > 0)
    .sort((a, b) => b.watts - a.watts);
  return { powered, watts: powered.reduce((sum, d) => sum + d.watts, 0) + group.fixedWatts };
}

// What each phase of the house uses: the meter's power on that phase (negative while exporting)
// plus the solar power fed in on it, minus what the home battery charges on it (a discharging
// battery adds, like solar). Null for a phase the meter says nothing about.
// Many meters give only whole amps per phase, without a direction: 1 A is anything from about
// 115 to 345 W. Then the meter's exact total (gridW) is spread over the phases by their current,
// and the result is marked rough.
function phaseUse(phases, solarW, cfg, batteryW = 0, gridW = null) {
  if (!phases?.phases?.length) return { watts: {}, rough: false };
  const onSolar = solarPhases(cfg);
  const onBattery = batteryPhases(cfg);
  const rough = phases.phases.every(p => typeof p.watts !== 'number') && phases.phases.some(p => typeof p.amps === 'number');
  const totalAmps = phases.phases.reduce((sum, p) => sum + (typeof p.amps === 'number' ? Math.abs(p.amps) : 0), 0);
  const fromAmps = p => {
    if (typeof gridW !== 'number') return p.amps * (p.volts || 230);
    return totalAmps > 0 ? gridW * Math.abs(p.amps) / totalAmps : gridW / phases.phases.length;
  };
  const watts = {};
  for (const p of phases.phases) {
    const net = typeof p.watts === 'number' ? p.watts
      : typeof p.amps === 'number' ? fromAmps(p) : null;
    if (net === null) continue;
    const solar = onSolar.includes(p.phase) ? (solarW || 0) / onSolar.length : 0;
    const battery = onBattery.includes(p.phase) ? (batteryW || 0) / onBattery.length : 0;
    watts[p.phase] = Math.max(0, net + solar - battery);
  }
  return { watts, rough };
}

// The load per group as a current against its fuse, with the devices that use the most, and per
// phase what the groups on it do not explain ("Overig"): the meter measures every phase, so the
// rest is what has no measurement of its own. A group on more phases counts evenly on each.
// `estimated` is the list from estimatedDevices; `batteries` the home batteries as
// [{ id, watts }] (positive while charging). A battery put in a group already counts there.
function buildGroups(devices, cfg, { phases = null, gridW = null, solarW = 0, estimated = [], batteries = [] } = {}) {
  const groups = savedGroups(cfg);
  if (!groups.length) return null;
  const byId = new Map(devices.map(d => [d.id, d]));
  const estimates = new Map(estimated.filter(d => d.id && d.watts > 0).map(d => [d.id, d.watts]));
  const inGroup = new Set(groups.flatMap(g => g.devices));
  const shares = groupShares(groups);
  const extras = groupExtras(cfg);
  const batteryW = batteries.filter(b => !inGroup.has(b.id)).reduce((sum, b) => sum + (b.watts || 0), 0);
  const list = groups.map(g => {
    const { powered, watts } = groupWatts(g, byId, estimates, shares, extras);
    return {
      id: g.id,
      name: g.name,
      watts: Math.round(watts),
      amps: watts / (230 * Math.max(1, g.phases.length)),
      fuseAmps: g.fuseAmps,
      phases: g.phases,
      fixedWatts: g.fixedWatts,
      devices: g.devices.length,
      on: powered.slice(0, 3),
    };
  });
  const { watts: use, rough } = phaseUse(phases, solarW, cfg, batteryW, gridW);
  const perPhase = [1, 2, 3]
    .filter(n => list.some(g => g.phases.includes(n)))
    .map(n => {
      const groupsW = list.filter(g => g.phases.includes(n)).reduce((sum, g) => sum + g.watts / g.phases.length, 0);
      const total = typeof use[n] === 'number' ? use[n] : null;
      return { phase: n, watts: total === null ? null : Math.round(total), rest: total === null ? null : Math.round(Math.max(0, total - groupsW)), rough };
    });
  return { groups: list, phases: perPhase };
}

// The load of each group through the day in steps of 5 minutes, as a share of its fuse, from the
// Insights of its devices. Devices without readings count as 0, the fixed use always. A device
// without a meter and without on/off has a constant use: its estimate now counts all day, like
// the use of a device not in Homey. A device in more groups is split over them, as in buildGroups.
async function groupHistory(groups, devices, entries, start, steps, estimated = [], extras = new Map()) {
  const byId = new Map(devices.map(d => [d.id, d]));
  const shares = groupShares(groups);
  const series = new Map();
  const ids = [...new Set(groups.flatMap(g => g.devices))].filter(id => byId.get(id) && powerCapability(byId.get(id)) && !isGridMeter(byId.get(id)));
  const constant = new Map(estimated
    .filter(d => byId.has(d.id) && !powerCapability(byId.get(d.id)) && !has(byId.get(d.id), 'onoff') && d.watts > 0)
    .map(d => [d.id, d.watts]));
  for (const [id, x] of extras) constant.set(id, x.watts);
  await mapLimited(ids, INSIGHTS_PARALLEL, async id => {
    const list = await entries(byId.get(id), powerCapability(byId.get(id))).catch(() => []);
    if (list.length) series.set(id, averageInSteps(list.map(e => ({ t: e.t, v: Math.max(0, e.v) })), start, steps, { idleZero: true, hold: HOLD_STEPS }));
  });
  return groups.map(g => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      const watts = [...new Set(g.devices)].reduce((sum, id) => sum + (series.get(id)?.[i] || constant.get(id) || 0) / (shares.get(id) || 1), 0) + g.fixedWatts;
      // one decimal, so a light load (1 % of 16 A is 37 W) still shows (forum NL #75)
      values.push(Math.round(watts / (230 * Math.max(1, g.phases.length)) / g.fuseAmps * 1000) / 10);
    }
    return { id: g.id, name: g.name, values };
  });
}

function buildWater(device) {
  if (!device) return null;
  return {
    name: device.name,
    flow: value(device, 'measure_water'),
    total: value(device, 'meter_water'),
  };
}

// The readings of the meters, as on the meter itself or the energy supplier's bill (forum NL #68):
// import and export per tariff when the P1 meter splits them, else the totals, then gas, water
// and the kWh counter of each solar panel or inverter.
// [{ kind: 'electricity'|'gas'|'water'|'solar', label, value, unit }], or null without meters
function buildMeters(found, cfg = {}) {
  const rows = [];
  const add = (kind, label, device, capability, unit) => {
    const reading = capability ? amount(device, capability) : null;
    if (reading !== null) rows.push({ kind, label, value: reading, unit });
  };
  const p1 = found.p1;
  if (p1) {
    for (const [direction, label, pattern] of [
      ['import', 'Afname', /^meter_power.(imported|consumed|delivered|import).t([12])$/],
      ['export', 'Teruglevering', /^meter_power.(exported|produced|returned|export).t([12])$/],
    ]) {
      const tariffs = (p1.capabilities || []).filter(c => pattern.test(c))
        .sort((a, b) => a.match(pattern)[2] - b.match(pattern)[2]);
      if (tariffs.length === 2) {
        for (const c of tariffs) add('electricity', `${label} tarief ${c.match(pattern)[2]}`, p1, c, 'kWh');
        continue;
      }
      const totals = meterCapabilities(p1, direction);
      if (totals.length === 1) add('electricity', label, p1, totals[0], 'kWh');
    }
    if (usesGas(p1, cfg)) add('gas', 'Gas', p1, 'meter_gas', 'm³');
  }
  if (found.water) add('water', 'Water', found.water, 'meter_water', 'm³');
  for (const d of found.solar) {
    const capability = solarMeterCapability(d);
    // A counter that counts down (HomeWizard kWh meter at the panels) is no reading to show
    if (capability && amount(d, capability) >= 0) {
      add('solar', found.solar.length > 1 ? d.name : 'Zonnepanelen', d, capability, 'kWh');
    }
  }
  return rows.length ? rows : null;
}

// Devices that Homey Energy counts without a power meter of their own (an estimate set on the
// device, such as lights): [{ id, name, watts, estimated: true }]. Homey keeps the estimate on the
// device as energyObj.W (GitHub #23: its live report had no `items` list there); the live report
// is still read when it has one. Meters, panels, batteries and devices that do measure are left
// out; those are read directly.
function estimatedDevices(report, devices, found) {
  const items = Array.isArray(report?.items) ? report.items : [];
  const reported = new Map(items
    .filter(item => item?.type === 'device' && typeof item.values?.W === 'number')
    .map(item => [item.id, item.values.W]));
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return devices
    .filter(d => !skip.has(d.id) && !powerCapability(d) && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d))
    .map(d => ({ id: d.id, name: d.name || '?', watts: reported.has(d.id) ? reported.get(d.id) : d.energyObj?.W, estimated: true }))
    .filter(d => typeof d.watts === 'number' && d.watts > 0);
}

function buildLive(devices, found, cfg, { estimated = [], batteryWatts = null } = {}) {
  const gridW = found.p1 ? amount(found.p1, 'measure_power') : null;
  const solarW = found.solar.reduce((sum, d) => sum + Math.abs(amount(d, 'measure_power') || 0), 0);
  const battery = buildBattery(found.batteries, cfg.battery, batteryWatts);
  const batteryW = battery ? battery.watts : 0;
  const homeW = gridW === null ? null : Math.max(0, gridW + solarW - batteryW);

  const flows = allocateFlows({
    solar: solarW,
    imported: Math.max(0, gridW || 0),
    exported: Math.max(0, -(gridW || 0)),
    charge: Math.max(0, batteryW),
    discharge: Math.max(0, -batteryW),
  });

  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  const powered = devices
    .filter(d => !skip.has(d.id) && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d) && usePower(d) > 0)
    .map(d => ({ id: d.id, name: d.name, watts: usePower(d) }))
    .concat(estimated)
    .sort((a, b) => b.watts - a.watts);
  const consumers = powered.slice(0, 20);
  // All of them, also past the 20 listed: the page shows what Huis has beyond this (GitHub #20)
  const consumersW = powered.reduce((sum, d) => sum + d.watts, 0);

  // The same Sankey as for a period, but with the power right now
  const liveDevices = new Set(consumptionDevices(devices, found, 'measure_power').map(d => d.id));
  const sankey = homeW === null ? null : buildSankey(
    liveTotals({ solarW, gridW, batteryW, homeW, flows }),
    powered.filter(d => d.estimated || liveDevices.has(d.id)).map(d => ({ id: d.id, name: d.name, value: d.watts, estimated: d.estimated })),
  );

  return {
    gridW,
    solarW: found.solar.length ? solarW : null,
    homeW,
    battery,
    flows,
    gasM3: found.p1 ? value(found.p1, 'meter_gas') : null,
    consumers,
    consumersW,
    sankey,
    devices: {
      p1: found.p1?.name || null,
      solar: found.solar.map(d => d.name),
      batteries: found.batteries.map(d => d.name),
      boiler: found.boiler?.name || null,
      heating: found.heating.map(d => d.name),
      thermostat: found.thermostat?.name || null,
      evChargers: found.evChargers.map(d => d.name),
    },
    boiler: buildBoiler(found.boiler, cfg.boiler),
    heating: buildHeating(found),
    ev: buildEv(found),
    water: buildWater(found.water),
    meters: buildMeters(found, cfg),
    phases: buildPhases(found.p1, cfg),
    groups: buildGroups(devices, cfg, {
      phases: buildPhases(found.p1, cfg),
      gridW,
      solarW,
      estimated,
      batteries: found.batteries.map(d => ({ id: d.id, watts: batteryWatts ? batteryWatts[d.id] ?? 0 : batteryPower(d, cfg.battery) })),
    }),
    layout: resolveLayout(cfg.layout, found, cfg),
    updated: new Date().toISOString(),
  };
}

function periodStart(period, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'yesterday') start.setDate(start.getDate() - 1);
  if (period === 'week' || period === 'lastWeek') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'lastWeek') start.setDate(start.getDate() - 7);
  if (period === 'month' || period === 'lastMonth') start.setDate(1);
  if (period === 'lastMonth') start.setMonth(start.getMonth() - 1);
  if (period === 'year' || period === 'lastYear') start.setMonth(0, 1);
  if (period === 'lastYear') start.setFullYear(start.getFullYear() - 1);
  return start;
}

// Where a period ends: the start of the next one
function periodEnd(period, start) {
  const end = new Date(start);
  const { bucket } = PERIODS[period];
  if (bucket === 'hour') end.setDate(end.getDate() + 1);
  else if (bucket === 'month') end.setFullYear(end.getFullYear() + 1);
  else if (period === 'week' || period === 'lastWeek') end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

function makeBuckets(period, now = new Date()) {
  const start = periodStart(period, now);
  const buckets = [];
  if (PERIODS[period].bucket === 'hour') {
    for (let h = 0; h < 24; h++) {
      const s = new Date(start);
      s.setHours(h);
      buckets.push({ start: s, label: String(h).padStart(2, '0') });
    }
  } else if (PERIODS[period].bucket === 'month') {
    for (let m = 0; m < 12; m++) {
      const s = new Date(start);
      s.setMonth(m, 1);
      buckets.push({ start: s, label: MONTH_NAMES[m] });
    }
  } else {
    const weekly = period === 'week' || period === 'lastWeek';
    const days = weekly ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let i = 0; i < days; i++) {
      const s = new Date(start);
      s.setDate(start.getDate() + i);
      buckets.push({ start: s, label: weekly ? DAY_NAMES[s.getDay()] : String(s.getDate()) });
    }
  }
  return buckets;
}

function bucketIndex(buckets, t) {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (t >= buckets[i].start) return i;
  }
  return -1;
}

// The increase of a cumulative meter from one reading to the next, 0 for a reset or a drop.
// With `maxKW` (electricity) a step more than the connection can carry in that time is a false
// reading (an Aeotec ZW095 jumping from 8,091 to 19,276 kWh and back), so it counts as 0 too.
// That time runs from `since`, when the counter last changed: a cloud counter that stays put
// for hours and then catches up in one step (Zevercloud's day counter, GitHub #15) is real.
function meterDelta(prev, next, maxKW = null, since = prev.t) {
  const delta = next.v - prev.v;
  if (!(delta > 0)) return 0;
  if (maxKW && delta > maxKW * Math.max((next.t - since) / 3600000, 1 / 60)) return 0;
  return delta;
}

// The steps of a cumulative meter that count. With `doubtful` (a battery counter) the first
// rise after a drop is left out and added to `doubtful.kWh`: a counter that fell and starts
// again (Anker, GitHub #20: 30.9, 15.4, 0, 0, then 21.3 kWh in six hours) may not have measured
// that rise as energy at all.
function* meterSteps(entries, maxKW, doubtful) {
  let afterDrop = false;
  let since = entries[0]?.t;
  for (let i = 1; i < entries.length; i++) {
    if (i > 1 && entries[i - 1].v !== entries[i - 2].v) since = entries[i - 1].t;
    const delta = meterDelta(entries[i - 1], entries[i], maxKW, since);
    if (doubtful) {
      if (entries[i].v < entries[i - 1].v) afterDrop = true;
      else if (delta > 0 && afterDrop) {
        afterDrop = false;
        doubtful.kWh += delta;
        continue;
      }
    }
    if (delta > 0) yield { prev: entries[i - 1], next: entries[i], delta };
  }
}

// Spreads the increase of a cumulative meter over the buckets
function addMeterDeltas(target, buckets, entries, maxKW = null, doubtful = null) {
  for (const { prev, delta } of meterSteps(entries, maxKW, doubtful)) {
    const idx = bucketIndex(buckets, prev.t);
    if (idx >= 0) target[idx] += delta;
  }
}

// Adds the cost of the increase of a cumulative meter, with the price of that stretch of time.
// Returns whether any price was known.
function addMeterCost(target, buckets, entries, price, sign = 1, maxKW = null) {
  let known = false;
  for (const { prev, next, delta } of meterSteps(entries, maxKW)) {
    const idx = bucketIndex(buckets, prev.t);
    if (idx < 0) continue;
    const p = price(prev.t.getTime(), next.t.getTime());
    if (typeof p !== 'number') continue;
    target[idx] += sign * delta * p;
    known = true;
  }
  return known;
}

// Stretches of time with the energy that went into (charge) or out of (discharge) a battery,
// from its kWh counter or from its power
function meterStretches(entries, kind, maxKW = null, guard = false) {
  const out = [];
  for (const { prev, next, delta } of meterSteps(entries, maxKW, guard ? { kWh: 0 } : null)) {
    out.push({ t0: prev.t.getTime(), t1: next.t.getTime(), kWh: delta, kind });
  }
  return out;
}

function powerStretches(entries, sign) {
  const out = [];
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[i - 1].t) / 3600000;
    const watts = entries[i - 1].v * sign;
    if (hours <= 0 || hours > 2 || Math.abs(watts) < 1) continue;
    out.push({ t0: entries[i - 1].t.getTime(), t1: entries[i].t.getTime(), kWh: Math.abs(watts) * hours / 1000, kind: watts > 0 ? 'charge' : 'discharge' });
  }
  return out;
}

// What the battery earned: energy it delivered is worth the price it saved (or, when it went to
// the grid, what export earned); energy it stored cost the import price, or, when it came from
// the sun, what that solar power would have earned as export. Where the energy came from or
// went to follows the flows of the bucket it falls in. Calculated with today's rules and as if
// net metering had already ended.
function batteryEarnings(stretches, buckets, rows, tariff, doubtful = 0) {
  // The four parts (with net metering) are shown apart: what charging from the grid cost, the
  // export missed by charging from the sun, the import saved and what export to the grid earned.
  // Energy still in the battery at the start or end of the period is not valued (GitHub #20).
  const result = {
    withNetting: 0, withoutNetting: 0, charged: 0, discharged: 0, known: false,
    gridCharge: 0, solarCharge: 0, savedImport: 0, gridExport: 0, unpriced: 0,
    // Charged energy that came from neither measured sun nor measured grid import, and counter
    // rises after a reset: neither is valued
    unknown: 0, doubtful,
  };
  for (const s of stretches) {
    const idx = bucketIndex(buckets, new Date(s.t0));
    if (idx < 0) continue;
    const row = rows[idx];
    const buy = tariff.importPrice(s.t0, s.t1);
    const sellNow = tariff.exportPrice(s.t0, s.t1);
    const sellLater = tariff.exportNoNetting(s.t0, s.t1);
    if (![buy, sellNow, sellLater].every(Number.isFinite)) {
      result.unpriced += s.kWh;
      continue;
    }
    result.known = true;
    if (s.kind === 'discharge') {
      const toGrid = row.discharge > 0 ? Math.min(1, (row.batteryToGrid || 0) / row.discharge) : 0;
      result.savedImport += s.kWh * (1 - toGrid) * buy;
      result.gridExport += s.kWh * toGrid * sellNow;
      result.withNetting += s.kWh * ((1 - toGrid) * buy + toGrid * sellNow);
      result.withoutNetting += s.kWh * ((1 - toGrid) * buy + toGrid * sellLater);
      result.discharged += s.kWh;
    } else {
      const fromSun = row.charge > 0 ? Math.min(1, (row.solarToBattery || 0) / row.charge) : 0;
      const fromGrid = row.charge > 0 ? Math.min(1 - fromSun, (row.gridToBattery || 0) / row.charge) : 0;
      result.gridCharge += s.kWh * fromGrid * buy;
      result.solarCharge += s.kWh * fromSun * sellNow;
      result.withNetting -= s.kWh * (fromSun * sellNow + fromGrid * buy);
      result.withoutNetting -= s.kWh * (fromSun * sellLater + fromGrid * buy);
      result.unknown += s.kWh * (1 - fromSun - fromGrid);
      result.charged += s.kWh;
    }
  }
  return result.known ? result : null;
}

// The use of the battery over a period: the average price of what it stored (the import price,
// or for solar power the export it did not get) and of what it delivered (the import it saved,
// or what export earned). For a day also the sessions in which it charged or discharged, so it
// shows what the battery did and why: stored the sun or cheap power, delivered at dear hours.
// Stretches only count their last 15 minutes: a meter that reports only when it changes starts
// a charge right after a long quiet stretch, not at the start of it.
const SESSION_GAP = 20 * 60000;
const STRETCH_MAX = 15 * 60000;

function batteryHistory(stretches, buckets, rows, tariff, withSessions) {
  const totals = { charge: { kWh: 0, priced: 0, value: 0 }, discharge: { kWh: 0, priced: 0, value: 0 } };
  const sessions = [];
  const sorted = stretches.map(s => ({ ...s, t0: Math.max(s.t0, s.t1 - STRETCH_MAX) })).sort((a, b) => a.t0 - b.t0);
  for (const s of sorted) {
    const idx = bucketIndex(buckets, new Date(s.t0));
    if (idx < 0) continue;
    const row = rows[idx];
    const buy = tariff.importPrice(s.t0, s.t1);
    const sell = tariff.exportPrice(s.t0, s.t1);
    // Charging: the share that came from the sun; discharging: the share that went to the grid
    const share = s.kind === 'charge'
      ? (row.charge > 0 ? Math.min(1, (row.solarToBattery || 0) / row.charge) : 0)
      : (row.discharge > 0 ? Math.min(1, (row.batteryToGrid || 0) / row.discharge) : 0);
    // Charging: the part that came from neither sun nor grid import has no price
    const known = s.kind === 'charge' && row.charge > 0
      ? Math.min(1, share + (row.gridToBattery || 0) / row.charge)
      : 1;
    const fromGrid = known - share;
    const price = typeof buy === 'number' && typeof sell === 'number' && known > 0
      ? (share * sell + fromGrid * buy) / known : null;
    const total = totals[s.kind];
    total.kWh += s.kWh;
    if (price !== null) { total.priced += s.kWh * known; total.value += s.kWh * known * price; }
    if (!withSessions) continue;
    let session = sessions[sessions.length - 1];
    if (!session || session.kind !== s.kind || s.t0 - session.end > SESSION_GAP) {
      session = { kind: s.kind, start: s.t0, end: s.t1, kWh: 0, shared: 0, priced: 0, value: 0 };
      sessions.push(session);
    }
    session.end = Math.max(session.end, s.t1);
    session.kWh += s.kWh;
    session.shared += s.kWh * share;
    if (price !== null) { session.priced += s.kWh * known; session.value += s.kWh * known * price; }
  }
  const average = t => (t.priced > 0 ? t.value / t.priced : null);
  return {
    chargePrice: average(totals.charge),
    dischargePrice: average(totals.discharge),
    sessions: withSessions ? sessions.filter(s => s.kWh >= 0.05).map(s => ({
      kind: s.kind,
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      kWh: s.kWh,
      // From the sun (charging) or to the grid (discharging), as a fraction
      share: s.kWh > 0 ? s.shared / s.kWh : 0,
      price: s.priced > 0 ? s.value / s.priced : null,
    })) : null,
  };
}

// Converts a power (W) series to kWh per bucket, for devices without an energy meter.
// sign picks which part is counted: 1 for positive values, -1 for negative, 0 for both as absolute.
function addPowerIntegral(target, buckets, entries, sign = 0) {
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[i - 1].t) / 3600000;
    if (hours <= 0 || hours > 2) continue;
    const watts = entries[i - 1].v;
    const counted = sign === 0 ? Math.abs(watts) : Math.max(0, watts * sign);
    const idx = bucketIndex(buckets, entries[i - 1].t);
    if (idx >= 0) target[idx] += counted * hours / 1000;
  }
}

const FLOW_KEYS = ['solarToHome', 'solarToGrid', 'solarToBattery', 'gridToHome', 'gridToBattery', 'batteryToHome', 'batteryToGrid'];

// Share of each bucket that has passed, for the fixed costs per day
function elapsedDays(period, bucket, now) {
  const start = bucket.start.getTime();
  const end = new Date(bucket.start);
  const kind = PERIODS[period].bucket;
  if (kind === 'hour') end.setHours(end.getHours() + 1);
  else if (kind === 'day') end.setDate(end.getDate() + 1);
  else end.setMonth(end.getMonth() + 1);
  const passed = Math.min(end.getTime(), now.getTime()) - start;
  return passed > 0 ? passed / 86400000 : 0;
}

function summarize(period, buckets, series, costs = null, extra = {}, now = new Date()) {
  const rows = buckets.map((b, i) => {
    const row = {
      label: b.label,
      start: b.start.toISOString(),
      import: series.import[i],
      export: series.export[i],
      solar: series.solar[i],
      charge: series.charge[i],
      discharge: series.discharge[i],
      gas: series.gas[i],
      heating: series.heating[i],
      ev: series.ev[i],
      water: series.water[i] * 1000, // liters
      degreeDays: series.degreeDays ? series.degreeDays[i] : 0,
    };
    Object.assign(row, allocateFlows({
      solar: row.solar, imported: row.import, exported: row.export, charge: row.charge, discharge: row.discharge,
    }));
    row.solarUsed = row.solarToHome + row.solarToBattery;
    row.consumption = row.solarToHome + row.gridToHome + row.batteryToHome;
    if (costs) {
      row.costImport = costs.known.import ? costs.import[i] : null;
      row.costExport = costs.known.export ? costs.export[i] : null;
      row.costGas = costs.known.gas ? costs.gas[i] : null;
      row.costWater = typeof costs.water === 'number' ? series.water[i] * costs.water : null;
      row.costFixed = typeof costs.fixedPerDay === 'number' ? costs.fixedPerDay * elapsedDays(period, b, now) : null;
      row.nettingValue = costs.known.netting ? costs.netting[i] : null;
      row.costExportAfter = costs.known.exportAfter ? costs.exportAfter[i] : null;
    }
    return row;
  });

  const totals = totalsOf(rows);
  const { deviceEnergy = [], hasBattery = false, available = {}, ...rest } = extra;
  return {
    period,
    bucket: PERIODS[period].bucket,
    hasBattery,
    available: { battery: hasBattery, ...available },
    rows,
    totals,
    ...rest,
    devices: deviceEnergy.filter(d => d.kWh > 0.0005).sort((a, b) => b.kWh - a.kWh).slice(0, 25)
      .map(({ id, name, kWh, estimated }) => (estimated ? { id, name, kWh, estimated } : { id, name, kWh })),
    sankey: buildSankey(totals, deviceEnergy.map(d => ({ id: d.id, name: d.name, value: d.kWh, estimated: d.estimated }))),
  };
}

const TOTAL_KEYS = ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev', 'solarUsed', 'consumption', 'degreeDays', ...FLOW_KEYS];
const COST_KEYS = { import: 'costImport', export: 'costExport', gas: 'costGas', water: 'costWater', fixed: 'costFixed' };

function totalsOf(rows) {
  const totals = {};
  for (const key of TOTAL_KEYS) totals[key] = rows.reduce((sum, r) => sum + (r[key] || 0), 0);
  totals.selfSufficiency = totals.consumption > 0 ? (totals.solarToHome + totals.batteryToHome) / totals.consumption : null;
  totals.selfConsumption = totals.solar > 0 ? totals.solarUsed / totals.solar : null;
  // Positive: net energy taken from the grid; negative: net energy returned
  totals.netGrid = totals.import - totals.export;

  // A cost is known when at least one row has it; export is a credit (negative)
  const costs = {};
  for (const [key, field] of Object.entries(COST_KEYS)) {
    const known = rows.filter(r => typeof r[field] === 'number');
    costs[key] = known.length ? known.reduce((sum, r) => sum + r[field], 0) : null;
  }
  const netted = rows.filter(r => typeof r.nettingValue === 'number');
  totals.nettingValue = netted.length ? netted.reduce((sum, r) => sum + r.nettingValue, 0) : null;
  const after = rows.filter(r => typeof r.costExportAfter === 'number');
  totals.costExportAfter = after.length ? after.reduce((sum, r) => sum + r.costExportAfter, 0) : null;
  const priced = Object.values(costs).some(c => c !== null);
  totals.costs = priced ? costs : null;
  totals.cost = priced ? Object.values(costs).reduce((sum, c) => sum + (c || 0), 0) : null;
  return totals;
}

// Totals of the previous period up to the same point in time, so a day in progress
// is compared with the same hours of yesterday
function comparableTotals(previous, current, now = new Date()) {
  if (!previous || !current) return null;
  const elapsed = current.rows.filter(r => new Date(r.start) <= now).length;
  return totalsOf(previous.rows.slice(0, elapsed));
}

// Nodes and links for the Sankey chart: sources → house → individual consumers.
// Works on kWh for a period and on watts for the live view: `devices` holds { id, name, value }.
// Node values follow from the links; the client lays them out.
function buildSankey(totals, devices) {
  const nodes = [];
  const links = [];
  const node = (id, label, kind, column) => nodes.push({ id, label, kind, column });
  const link = (source, target, amount, kind) => {
    if (amount > 0.0005) links.push({ source, target, value: amount, kind });
  };

  if (totals.solar > 0) node('solar', 'Zon', 'solar', 0);
  if (totals.import > 0) node('grid', 'Net', 'grid', 0);
  if (totals.discharge > 0) node('battery-out', 'Batterij', 'battery', 0);

  node('home', 'Huis', 'home', 1);
  if (totals.export > 0) node('export', 'Teruggeleverd', 'export', 1);
  if (totals.charge > 0) node('battery-in', 'Batterij laden', 'battery', 1);

  link('solar', 'home', totals.solarToHome, 'solar');
  link('solar', 'export', totals.solarToGrid, 'solar');
  link('solar', 'battery-in', totals.solarToBattery, 'solar');
  link('grid', 'home', totals.gridToHome, 'grid');
  link('grid', 'battery-in', totals.gridToBattery, 'grid');
  link('battery-out', 'home', totals.batteryToHome, 'battery');
  link('battery-out', 'export', totals.batteryToGrid, 'battery');

  // Individual consumers, largest first; small ones are counted as not measured
  const consumption = totals.consumption;
  const shown = devices
    .filter(d => d.value > 0 && d.value >= consumption * SANKEY_MIN_SHARE)
    .sort((a, b) => b.value - a.value)
    .slice(0, SANKEY_MAX_DEVICES);
  for (const d of shown) {
    // An estimate by Homey (no meter of its own) gets a ≈ before its name
    node(`device-${d.id}`, d.estimated ? `≈ ${d.name}` : d.name, 'device', 2);
    link('home', `device-${d.id}`, d.value, 'device');
  }

  const measured = shown.reduce((s, d) => s + d.value, 0);
  if (consumption - measured > consumption * SANKEY_MIN_SHARE) {
    node('untracked', shown.length ? 'Niet gemeten' : 'Verbruik', 'untracked', 2);
    link('home', 'untracked', consumption - measured, 'untracked');
  }

  const used = new Set(links.flatMap(l => [l.source, l.target]));
  return { nodes: nodes.filter(n => used.has(n.id)), links };
}

// The live flow for the widget: sources → rooms (and export, battery) → the largest devices
// per room. The house's power from each source is shared over the rooms by their use, so the
// colors show where each room's power comes from. Kept small: few nodes, short names.
const ZONE_FLOW_MAX_ZONES = 8;

function buildZoneFlow({ solarW, gridW, batteryW, homeW, flows }, devices, zoneNames, { perZone = 3 } = {}) {
  const nodes = [];
  const links = [];
  const node = (id, label, kind, column) => nodes.push({ id, label, kind, column });
  // Not rounded: the widget adds up the links of a node, and rounding each one first made the
  // grid there a watt off from the Energy now widget
  const link = (source, target, value) => {
    if (value >= 1) links.push({ source, target, value: Math.round(value * 1000) / 1000 });
  };
  const home = homeW || 0;

  if (solarW > 0) node('solar', 'solar', 'solar', 0);
  if (gridW > 0) node('grid', 'grid', 'grid', 0);
  if (batteryW < 0) node('battery-out', 'battery', 'battery', 0);
  if (gridW < 0) node('export', 'export', 'export', 1);
  if (batteryW > 0) node('battery-in', 'charge', 'battery', 1);

  // Rooms by measured use, largest first; the rest of the house is "other"
  const byZone = new Map();
  for (const d of devices) {
    if (!(d.value > 0)) continue;
    const zone = byZone.get(d.zone) || { id: d.zone, value: 0, devices: [] };
    zone.value += d.value;
    zone.devices.push(d);
    byZone.set(d.zone, zone);
  }
  const zones = [...byZone.values()].sort((a, b) => b.value - a.value);
  const shown = zones.slice(0, ZONE_FLOW_MAX_ZONES);
  const measured = shown.reduce((sum, z) => sum + z.value, 0);
  // A house use below what the devices report (timing between readings) is raised to it
  const total = Math.max(home, measured);
  const rest = total - measured;

  const zoneParts = shown.map(z => ({ id: `zone-${z.id}`, label: zoneNames[z.id] || '?', value: z.value, devices: z.devices }));
  if (rest >= Math.max(1, total * 0.02)) zoneParts.push({ id: 'zone-other', label: 'other', value: rest, devices: [] });

  const fromSources = [
    ['solar', flows.solarToHome],
    ['grid', flows.gridToHome],
    ['battery-out', flows.batteryToHome],
  ];
  for (const z of zoneParts) {
    node(z.id, z.label, z.id === 'zone-other' ? 'other' : 'zone', 1);
    // Scale the source shares to the rooms' total, so both sides of the room match
    const sourceSum = fromSources.reduce((sum, [, v]) => sum + (v || 0), 0) || 1;
    for (const [id, value] of fromSources) link(id, z.id, (value || 0) / sourceSum * z.value);
    const top = z.devices.sort((a, b) => b.value - a.value).slice(0, perZone);
    for (const d of top) {
      node(`device-${d.id}`, d.name, 'device', 2);
      link(z.id, `device-${d.id}`, d.value);
    }
    const others = z.devices.slice(perZone).reduce((sum, d) => sum + d.value, 0);
    if (perZone > 0 && others >= 1) {
      node(`${z.id}-more`, 'more', 'more', 2);
      link(z.id, `${z.id}-more`, others);
    }
  }

  link('solar', 'export', flows.solarToGrid);
  link('battery-out', 'export', flows.batteryToGrid);
  link('solar', 'battery-in', flows.solarToBattery);
  link('grid', 'battery-in', flows.gridToBattery);

  const used = new Set(links.flatMap(l => [l.source, l.target]));
  return { nodes: nodes.filter(n => used.has(n.id)), links, homeW: Math.round(total) };
}

// A meter for the whole house, such as a second P1 meter next to the chosen one: it measures
// everything, so it is no consumer of its own. Recognised by Homey's "main meter" flag, by gas
// and power in one device, by the separate import/export or tariff meters of a P1 meter, or by name.
// A device that can be switched off is never one: smart plugs such as HomeWizard's Energy Socket
// also have tariff meters (meter_power.consumed.t1).
const GRID_METER_CAPABILITIES = [
  'meter_power.imported', 'meter_power.exported', 'meter_power.import', 'meter_power.export',
  'meter_power.t2', 'meter_power.consumed.t2', 'meter_power.produced.t2',
];
// A single "returned" or "delivered" counter next to the plain meter_power is a consumer that can
// also feed back (a Shelly PM Mini), not a P1 meter, which has no plain meter_power. The same goes
// for tariff 1 counters without a tariff 2: a HomeWizard kWh meter on one group (or the panels)
// has meter_power.consumed.t1 and .produced.t1 next to meter_power.
const RETURN_ONLY_CAPABILITIES = [
  'meter_power.delivered', 'meter_power.returned',
  'meter_power.t1', 'meter_power.consumed.t1', 'meter_power.produced.t1',
];
const hasGridCounters = d => GRID_METER_CAPABILITIES.some(c => has(d, c))
  || (!has(d, 'meter_power') && RETURN_ONLY_CAPABILITIES.some(c => has(d, c)));
function isGridMeter(d) {
  return d.countOverride !== 'include' && looksLikeGridMeter(d);
}
function looksLikeGridMeter(d) {
  if (isMainMeter(d)) return true;
  if (has(d, 'onoff')) return false;
  return (has(d, 'meter_gas') && has(d, 'measure_power'))
    || hasGridCounters(d)
    || /\bp1\b|dongle|slimme meter|smart meter/i.test(d.name || '');
}

// Whether the dashboard counts a device as a consumer by itself, for the settings: 'counted',
// or why it is left out ('excluded' from Homey Energy, a 'copy' of another meter, looks like a
// 'meter' for the whole house). Null for what is no consumer at all (meters chosen as P1,
// panels, batteries, devices without power or kWh).
function consumerStatus(d, found) {
  const roles = new Set([found.p1?.id, ...found.solar.map(x => x.id), ...found.batteries.map(x => x.id)]);
  if (roles.has(d.id) || isSourceOrStore(d) || !(has(d, 'measure_power') || has(d, 'meter_power'))) return null;
  if (isCopy(d)) return 'copy';
  if (isExcluded(d)) return 'excluded';
  if (looksLikeGridMeter(d)) return 'meter';
  return 'counted';
}

// Solar panels and batteries are never a consumer, also when they are not the ones chosen in the
// settings: a second app for the same inverter (one to control it, one for its readings) would
// otherwise show its solar power as use
function isSourceOrStore(d) {
  return isClass(d, 'solarpanel') || isClass(d, 'battery') || Boolean(d.energyObj?.homeBattery);
}

// Devices whose energy use is shown in the Sankey chart: everything with a kWh meter
// (or a power meter for the live view) that is not a meter, panel or battery itself
function consumptionDevices(devices, found, capability = 'meter_power') {
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return devices.filter(d => !skip.has(d.id) && has(d, capability) && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d));
}

// Runs `fn` over the items with at most `limit` running at a time: a house with hundreds of
// metered devices would otherwise send hundreds of Insights requests to Homey at once
async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const INSIGHTS_PARALLEL = 8;

// A counter that jumps (a virtual device set by a Flow, a meter after a reset) is held to what
// the connection can carry, like the P1 meter: JohanP's "Boiler PV" once gave 3,096 kWh in a day
async function buildDeviceEnergy(client, devices, found, resolution, maxKW = null) {
  const candidates = consumptionDevices(devices, found);
  return mapLimited(candidates, INSIGHTS_PARALLEL, async d => {
    const entries = await client.getEntries(d.id, 'meter_power', resolution).catch(() => []);
    let kWh = 0;
    for (const { delta } of meterSteps(entries, maxKW)) kWh += delta;
    return { id: d.id, name: d.name, kWh };
  });
}

// Devices from a Homey Energy report that the kWh meters above do not cover: devices that only
// measure power (Homey adds that up itself) and devices with an estimate set in Homey.
// The report lists them under electricity.devices.consumed as { id: { name, period (kWh) } }.
function reportDevices(report, devices, found, known) {
  const consumed = report?.electricity?.devices?.consumed;
  if (!consumed || typeof consumed !== 'object') return [];
  const byId = new Map(devices.map(d => [d.id, d]));
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return Object.entries(consumed)
    .map(([id, entry]) => ({ id, entry, device: byId.get(id) }))
    .filter(({ id, entry, device }) => device && !known.has(id) && !skip.has(id) && typeof entry?.period === 'number' && entry.period > 0
      && !isGridMeter(device) && !isSourceOrStore(device) && !isLeftOut(device))
    .map(({ id, entry, device }) => ({ id, name: device.name || entry.name || '?', kWh: entry.period, estimated: !has(device, 'measure_power') }));
}

// The Homey Energy report of a period, as its API asks for it: a day, an ISO week, a month or a year
function reportRequest(period, now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const day = new Date(now);
  if (period === 'yesterday') day.setDate(day.getDate() - 1);
  if (period === 'today' || period === 'yesterday') return { kind: 'day', date: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` };
  if (period === 'week') {
    // ISO week: the week with the Thursday of this week in it
    const thursday = new Date(now);
    thursday.setHours(0, 0, 0, 0);
    thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return { kind: 'week', isoWeek: `${thursday.getFullYear()}-W${pad(week)}` };
  }
  if (period === 'month') return { kind: 'month', yearMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
  if (period === 'year') return { kind: 'year', year: String(now.getFullYear()) };
  return null;
}

// ---------- Power through the day ----------

const POWER_STEP = 5 * 60 * 1000;

// The average of a power series (W) in each step; a step without readings keeps the last value
// for a while, so a meter that only reports changes still gives a line. After that the step is
// unknown (null). With `idleZero`, a device that was (nearly) idle stays at 0 while it is quiet,
// also before its first reading, as panels at night or a resting battery often log nothing.
// `hold` is the number of steps a value is kept.
function averageInSteps(entries, start, steps, { idleZero = false, hold = 6 } = {}) {
  const sums = new Array(steps).fill(0);
  const counts = new Array(steps).fill(0);
  for (const e of entries) {
    const i = Math.floor((e.t - start) / POWER_STEP);
    if (i >= 0 && i < steps) { sums[i] += e.v; counts[i]++; }
  }
  const out = [];
  let last = idleZero ? 0 : null;
  let lastAt = idleZero ? 0 : -Infinity;
  for (let i = 0; i < steps; i++) {
    if (counts[i]) {
      last = sums[i] / counts[i];
      lastAt = i;
    }
    const idle = idleZero && Math.abs(last) < 10;
    out.push(idle ? 0 : i - lastAt <= hold ? last : null);
  }
  return out;
}

// Turns a cumulative kWh meter into power readings (W), for panels that log no power. Many apps
// update the counter only every 15 minutes or so while Insights logs it every 5, so a rise is
// spread over the readings since the counter last moved, rather than a peak with zeros between.
// Readings after the last rise are not known yet; a counter that stands still for 2 hours is 0 W.
function powerFromMeter(entries) {
  const out = [];
  const spread = (from, to, v) => { for (let j = from; j < to; j++) out.push({ t: entries[j].t, v }); };
  let from = 0;
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[from].t) / 3600000;
    const delta = entries[i].v - entries[from].v;
    if (delta === 0 && hours <= 2) continue;
    if (delta === 0) spread(from, i, 0);
    else if (delta > 0 && hours > 0 && hours <= 2) spread(from, i, delta * 1000 / hours);
    from = i;
  }
  return out;
}

// Grid, solar and battery power (W, battery positive while charging) per step of the day,
// split into the same flows as the energy totals. A step where one of them is unknown is left
// empty (null), rather than guessing that device was at 0 W.
function buildPowerCurve(start, end, until, { grid, solar, battery }) {
  const steps = Math.max(0, Math.ceil((Math.min(until, end) - start) / POWER_STEP));
  const points = [];
  for (let i = 0; i < steps; i++) {
    const values = [grid, ...solar, ...battery].map(list => list[i]);
    if (!values.every(v => typeof v === 'number')) { points.push(null); continue; }
    const g = grid[i];
    const sun = Math.max(0, solar.reduce((sum, list) => sum + list[i], 0));
    const bat = battery.reduce((sum, list) => sum + list[i], 0);
    const flows = allocateFlows({
      solar: sun,
      imported: Math.max(0, g),
      exported: Math.max(0, -g),
      charge: Math.max(0, bat),
      discharge: Math.max(0, -bat),
    });
    const point = { solar: sun };
    for (const key of FLOW_KEYS) point[key] = flows[key];
    point.home = flows.solarToHome + flows.gridToHome + flows.batteryToHome;
    for (const key of Object.keys(point)) point[key] = Math.round(point[key]);
    points.push(point);
  }
  return { start: start.toISOString(), end: end.toISOString(), step: POWER_STEP / 1000, points };
}

// No home connection, solar system or battery reaches this; a device that reports more (after a
// power cut, say) glitched, and one such reading would stretch the chart so far that the rest of
// the day looks flat
const MAX_POWER_W = 100000;
const plausiblePower = (entries, maxW = MAX_POWER_W) => entries.filter(e => Math.abs(e.v) <= maxW);

// Grid power (W, positive when taking from the grid) of the P1 meter: its power readings, or,
// when those are not in Insights, the increase of its import minus export counters. With `cfg`,
// readings above what the connection can carry are dropped too (80 kW on 3x25 A, Tweakers)
async function gridPower(p1, read, cfg = null) {
  const maxW = cfg ? connectionMaxW(cfg, p1) : MAX_POWER_W;
  const measured = plausiblePower(await read(p1, 'measure_power'), maxW);
  if (measured.length) return measured;
  const byTime = new Map();
  const add = (list, sign) => {
    for (const e of powerFromMeter(list)) byTime.set(e.t.getTime(), (byTime.get(e.t.getTime()) || 0) + sign * e.v);
  };
  for (const cap of meterCapabilities(p1, 'import')) add(await read(p1, cap), 1);
  for (const cap of meterCapabilities(p1, 'export')) add(await read(p1, cap), -1);
  return plausiblePower([...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t: new Date(t), v })), maxW);
}

async function buildPowerHistory(client, found, period, cfg) {
  if (!found.p1) return null;
  const { resolution } = PERIODS[period];
  const start = periodStart(period);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const until = new Date(Math.min(Date.now(), end.getTime()));
  const steps = Math.ceil((until - start) / POWER_STEP);
  const read = (device, capability) => client.getEntries(device.id, capability, resolution).catch(() => []);

  const [grid, solar, battery] = await Promise.all([
    gridPower(found.p1, read, cfg),
    Promise.all(found.solar.map(async panel => {
      let entries = has(panel, 'measure_power') ? await read(panel, 'measure_power') : [];
      if (!entries.length) entries = powerFromMeter(await solarMeterEntries(panel, read));
      return plausiblePower(entries.map(e => ({ t: e.t, v: Math.abs(e.v) })));
    })),
    Promise.all(found.batteries.map(async b => plausiblePower(await batteryPowerHistory(b, read, cfg.battery)))),
  ]);
  if (!grid.length) return null;
  return buildPowerCurve(start, end, until, {
    grid: averageInSteps(grid, start, steps),
    solar: solar.map(list => averageInSteps(list, start, steps, { idleZero: true })),
    battery: battery.map(list => averageInSteps(list, start, steps, { idleZero: true })),
  });
}

// ---------- Looking back ----------

// The dashboard can show an earlier moment of today or yesterday: every device as it was then,
// from Insights in the same steps of 5 minutes as the power chart. A power is the average over
// the step; other readings (temperature, charge level, counters, on/off) the last value before
// the end of the step. Many apps only log a change, so a power is kept for up to 6 hours and
// other readings for the rest of the day. Texts such as a mode are not kept in Insights; they
// are unknown then. Devices with only an estimate from Homey Energy have no history.
const TIMELINE_DAYS = ['today', 'yesterday'];
const HOLD_STEPS = 6 * 12;
const AVERAGED = /^measure_(power|current|water)\b/;

// The day of a moment that can be looked back at, or null
function timelineDay(at, now = new Date()) {
  const t = new Date(at);
  if (!Number.isFinite(t.getTime()) || t > now) return null;
  return TIMELINE_DAYS.find(day => t >= periodStart(day, now)) || null;
}

// The last reading before the end of each step, also on/off (true or false)
function lastInSteps(entries, start, steps) {
  const out = new Array(steps).fill(null);
  let j = 0;
  let last = null;
  for (let i = 0; i < steps; i++) {
    const end = start.getTime() + (i + 1) * POWER_STEP;
    while (j < entries.length && entries[j].t < end) last = entries[j++].v;
    out[i] = last;
  }
  return out;
}

// Battery power (W, positive while charging) from Insights, also for a battery with only kWh
// counters or whose power is not logged in Insights (Sigenergy), from how fast the counters rise
async function batteryPowerHistory(device, read, cfg) {
  const entries = await batteryPowerEntries(device, read, cfg);
  if (entries.length || !batteryMeterCapability(device, 'charge')) return entries;
  const byTime = new Map();
  for (const [direction, sign] of [['charge', 1], ['discharge', -1]]) {
    const cap = batteryMeterCapability(device, direction);
    for (const e of cap ? powerFromMeter(await read(device, cap)) : []) {
      byTime.set(e.t.getTime(), (byTime.get(e.t.getTime()) || 0) + sign * e.v);
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t: new Date(t), v }));
}

// Reads a day of Insights for every device the live dashboard reads: what the meter, panels,
// batteries, boiler, heating, charger and water meter logged, and the power of all other devices.
// `readInsights(device, capability)` gives the entries of the day ([] without a log).
async function recordTimeline(readInsights, devices, found, cfg, day, now = new Date()) {
  // Readings with a broken time or value are left out, and the rest put in order of time:
  // an app that logs something odd should not cost the whole day
  const usable = e => e && Number.isFinite(e.t?.getTime?.()) && (typeof e.v === 'boolean' || Number.isFinite(e.v));
  const read = async (device, capability) => (await readInsights(device, capability)).filter(usable).sort((a, b) => a.t - b.t);
  const start = periodStart(day, now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const steps = Math.max(1, Math.ceil((Math.min(now.getTime(), end.getTime()) - start) / POWER_STEP));
  const values = {};
  const put = (device, capability, list) => { (values[device.id] ||= {})[capability] = list; };
  const record = (device, capability) => async () => {
    const entries = await read(device, capability);
    if (entries.length) put(device, capability, AVERAGED.test(capability) ? averageInSteps(entries, start, steps, { hold: HOLD_STEPS }) : lastInSteps(entries, start, steps));
  };

  const batteryWatts = {};
  const tasks = [];
  // The meter's power as in the power chart, also when it only logs its kWh counters
  if (found.p1) {
    tasks.push(async () => {
      const grid = await gridPower(found.p1, read, cfg);
      if (grid.length) put(found.p1, 'measure_power', averageInSteps(grid, start, steps));
    });
    tasks.push(...[...phaseCapabilities(found.p1), 'meter_gas'].filter(c => has(found.p1, c)).map(c => record(found.p1, c)));
  }
  for (const panel of found.solar) {
    tasks.push(async () => {
      let entries = has(panel, 'measure_power') ? await read(panel, 'measure_power') : [];
      if (!entries.length) entries = powerFromMeter(await solarMeterEntries(panel, read));
      if (entries.length) put(panel, 'measure_power', averageInSteps(entries.map(e => ({ t: e.t, v: Math.abs(e.v) })), start, steps, { idleZero: true, hold: HOLD_STEPS }));
    });
  }
  for (const battery of found.batteries) {
    tasks.push(record(battery, 'measure_battery'));
    tasks.push(async () => {
      batteryWatts[battery.id] = averageInSteps(await batteryPowerHistory(battery, read, cfg.battery), start, steps, { idleZero: true, hold: HOLD_STEPS });
    });
  }
  // Boiler, heating, charger, car and water meter: every reading, except texts such as a mode
  // (Insights keeps numbers and on/off only)
  const others = [found.boiler, ...found.heating, found.thermostat, ...found.evChargers, ...(found.cars || [found.car]), found.water].filter(Boolean);
  for (const d of new Map(others.map(x => [x.id, x])).values()) {
    tasks.push(...(d.capabilities || []).filter(c => typeof value(d, c) !== 'string').map(c => record(d, c)));
  }
  // The power of all other devices, for Devices now and the Sankey
  const done = new Set([found.p1, ...found.solar, ...found.batteries, ...others].filter(Boolean).map(d => d.id));
  tasks.push(...devices.filter(d => !done.has(d.id) && has(d, 'measure_power') && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d)).map(d => record(d, 'measure_power')));

  // A device whose Insights fail is left out; the others still show
  await mapLimited(tasks, INSIGHTS_PARALLEL, task => task().catch(() => {}));
  return { day, start: start.toISOString(), steps, values, batteryWatts };
}

// The devices as they were in one step of a recording: copies with the values of then, and null
// for what was not recorded. On/off logged as 1 and 0 becomes true and false again.
function devicesAt(recording, devices, step) {
  return devices.map(d => {
    const recorded = recording.values[d.id] || {};
    const capabilitiesObj = {};
    for (const [capability, cap] of Object.entries(d.capabilitiesObj || {})) {
      let v = recorded[capability]?.[step] ?? null;
      if (typeof cap?.value === 'boolean' && typeof v === 'number') v = v > 0;
      capabilitiesObj[capability] = { ...cap, value: v };
    }
    return { ...d, capabilitiesObj };
  });
}

// The same devices found, but as the copies of devicesAt()
function foundAmong(found, copies) {
  const byId = new Map(copies.map(d => [d.id, d]));
  const swap = d => (d ? byId.get(d.id) || d : d);
  return Object.fromEntries(Object.entries(found).map(([key, v]) => [key, Array.isArray(v) ? v.map(swap) : swap(v)]));
}

// Energy (kWh) of the day up to and including a step, from the power chart, in the shape of todayTotals()
function totalsUntil(power, step) {
  const sum = { solar: 0, import: 0, export: 0, consumption: 0, charge: 0, discharge: 0 };
  const hours = (power?.step || POWER_STEP / 1000) / 3600;
  for (const p of (power?.points || []).slice(0, step + 1)) {
    if (!p) continue;
    sum.solar += p.solar * hours / 1000;
    sum.import += (p.gridToHome + p.gridToBattery) * hours / 1000;
    sum.export += (p.solarToGrid + p.batteryToGrid) * hours / 1000;
    sum.consumption += p.home * hours / 1000;
    sum.charge += (p.solarToBattery + p.gridToBattery) * hours / 1000;
    sum.discharge += (p.batteryToHome + p.batteryToGrid) * hours / 1000;
  }
  return sum;
}

// The live dashboard at moment `at`, from a recording of its day; null when that step is not in it.
// `power` is the day's power chart, for the kWh of the day up to then.
function buildLiveAt(recording, devices, found, cfg, at, power = null) {
  const step = Math.floor((new Date(at) - Date.parse(recording.start)) / POWER_STEP);
  if (!(step >= 0 && step < recording.steps)) return null;
  const copies = devicesAt(recording, devices, step);
  const batteryWatts = Object.fromEntries(Object.entries(recording.batteryWatts).map(([id, list]) => [id, list[step] ?? 0]));
  const live = buildLive(copies, foundAmong(found, copies), cfg, { batteryWatts });
  live.at = new Date(Date.parse(recording.start) + step * POWER_STEP).toISOString();
  live.updated = live.at;
  live.today = power?.points?.length ? totalsUntil(power, step) : null;
  return live;
}

// `light` is for the comparison with the previous period: totals and costs only.
// `prices` is the PriceService, for the costs of a dynamic contract.
// Degree days per bucket from the mean temperature per day; today only for the part that has
// passed, like its gas use
function degreeDayBuckets(period, buckets, temps, now = new Date()) {
  const out = buckets.map(() => 0);
  const hourly = PERIODS[period].bucket === 'hour';
  for (const [key, temp] of Object.entries(temps)) {
    const day = new Date(`${key}T00:00:00`);
    const dd = degreeDays(temp, day);
    if (!dd) continue;
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const passed = Math.max(0, Math.min(1, (Math.min(now, next) - day) / (next - day)));
    if (hourly) {
      buckets.forEach((b, i) => {
        if (b.start >= day && b.start < next && b.start < now) out[i] += dd / 24;
      });
    } else {
      const idx = bucketIndex(buckets, day);
      if (idx >= 0) out[idx] += dd * passed;
    }
  }
  return out;
}

async function buildHistory(client, devices, found, period, cfg, { light = false, prices = null, weather = null, location = null, estimated = [] } = {}) {
  const { resolution } = PERIODS[period];
  const buckets = makeBuckets(period);
  const series = {};
  for (const key of ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev']) {
    series[key] = buckets.map(() => 0);
  }
  const entries = (device, capability) => client.getEntries(device.id, capability, resolution);
  // Details are only read for the blocks on the dashboard, to spare Homey
  const shown = shownBlocks(cfg, found);

  const start = periodStart(period);
  const contract = contractFrom(cfg);
  const tariff = await tariffFor(contract, prices, start.getTime(), periodEnd(period, start).getTime());
  // Degree days, to compare gas use between periods regardless of the weather
  const gas = usesGas(found.p1, cfg);
  if (weather && location && gas) {
    const temps = await weather.temperatures(location, start, periodEnd(period, start)).catch(() => ({}));
    series.degreeDays = degreeDayBuckets(period, buckets, temps);
  }
  const costs = {
    import: buckets.map(() => 0),
    export: buckets.map(() => 0),
    gas: buckets.map(() => 0),
    netting: buckets.map(() => 0),
    exportAfter: buckets.map(() => 0),
    known: { import: false, export: false, gas: false, netting: false, exportAfter: false },
    water: tariff.water,
    fixedPerDay: tariff.fixedPerDay,
  };

  // Electricity counters: steps above what the connection can carry are false readings
  const maxKW = connectionMaxW(cfg, found.p1) / 1000;
  const jobs = [];
  for (const cap of meterCapabilities(found.p1, 'import')) {
    jobs.push(entries(found.p1, cap).then(e => {
      addMeterDeltas(series.import, buckets, e, maxKW);
      if (addMeterCost(costs.import, buckets, e, tariff.importPrice, 1, maxKW)) costs.known.import = true;
    }));
  }
  for (const cap of meterCapabilities(found.p1, 'export')) {
    jobs.push(entries(found.p1, cap).then(e => {
      addMeterDeltas(series.export, buckets, e, maxKW);
      if (addMeterCost(costs.export, buckets, e, tariff.exportPrice, -1, maxKW)) costs.known.export = true;
      // What net metering is worth: the price you avoid minus what export earns without it
      const nettingValue = (t0, t1) => {
        const withNetting = tariff.nettedPrice(t0, t1);
        const without = tariff.exportNoNetting(t0, t1);
        return typeof withNetting === 'number' && typeof without === 'number' ? withNetting - without : null;
      };
      if (addMeterCost(costs.netting, buckets, e, nettingValue, 1, maxKW)) costs.known.netting = true;
      // What export earns without net metering (a credit, negative), for after 2027
      if (addMeterCost(costs.exportAfter, buckets, e, tariff.exportNoNetting, -1, maxKW)) costs.known.exportAfter = true;
    }));
  }
  if (gas) {
    jobs.push(entries(found.p1, 'meter_gas').then(e => {
      addMeterDeltas(series.gas, buckets, e);
      if (addMeterCost(costs.gas, buckets, e, tariff.gasPrice)) costs.known.gas = true;
    }));
  }
  // Solar per panel or inverter, summed; the kWh of each is kept for the solar performance block
  const solarDevices = [];
  for (const panel of found.solar) {
    const own = buckets.map(() => 0);
    const add = () => {
      own.forEach((v, i) => { series.solar[i] += v; });
      solarDevices.push({ name: panel.name, kWh: own.reduce((a, b) => a + b, 0) });
    };
    if (solarMeterCapability(panel)) {
      // A meter without history (Insights off for it) falls back to the power
      jobs.push(solarMeterEntries(panel, entries).then(async e => {
        if (e.length < 2 && has(panel, 'measure_power')) addPowerIntegral(own, buckets, await entries(panel, 'measure_power'));
        else addMeterDeltas(own, buckets, e, maxKW);
        add();
      }));
    } else if (has(panel, 'measure_power')) {
      jobs.push(entries(panel, 'measure_power').then(e => { addPowerIntegral(own, buckets, e); add(); }));
    }
  }
  // Battery energy per stretch of time is kept for its earnings, when that block is shown
  const batteryStretches = !light && (shown.has('battery') || shown.has('batteryhistory')) ? [] : null;
  const doubtful = { kWh: 0 };
  for (const battery of found.batteries) {
    const chargeCap = batteryMeterCapability(battery, 'charge');
    const dischargeCap = batteryMeterCapability(battery, 'discharge');
    if (chargeCap && dischargeCap) {
      jobs.push(entries(battery, chargeCap).then(e => {
        addMeterDeltas(series.charge, buckets, e, maxKW, doubtful);
        batteryStretches?.push(...meterStretches(e, 'charge', maxKW, true));
      }));
      jobs.push(entries(battery, dischargeCap).then(e => {
        addMeterDeltas(series.discharge, buckets, e, maxKW, doubtful);
        batteryStretches?.push(...meterStretches(e, 'discharge', maxKW, true));
      }));
    } else if (batteryPowerCapabilities(battery)) {
      jobs.push(batteryPowerEntries(battery, entries, cfg.battery).then(e => {
        addPowerIntegral(series.charge, buckets, e, 1);
        addPowerIntegral(series.discharge, buckets, e, -1);
        batteryStretches?.push(...powerStretches(e, 1));
      }));
    }
  }

  // Electricity used by heating and EV charging: from their kWh meter, or from their power
  const addConsumer = (device, target) => {
    if (has(device, 'meter_power')) {
      jobs.push(entries(device, 'meter_power').then(e => addMeterDeltas(target, buckets, e, maxKW)));
    } else if (has(device, 'measure_power')) {
      jobs.push(entries(device, 'measure_power').then(e => addPowerIntegral(target, buckets, e, 1)));
    }
  };
  found.heating.forEach(d => addConsumer(d, series.heating));
  found.evChargers.forEach(d => addConsumer(d, series.ev));
  if (found.water && has(found.water, 'meter_water')) {
    jobs.push(entries(found.water, 'meter_water').then(e => addMeterDeltas(series.water, buckets, e)));
  }

  let boilerTemperature = [];
  if (found.boiler && !light && shown.has('waterheater') && PERIODS[period].bucket === 'hour') {
    jobs.push(entries(found.boiler, tankSensors(found.boiler, cfg.boiler).top || 'measure_temperature')
      .then(e => { boilerTemperature = e.map(({ t, v }) => ({ t: t.toISOString(), v })); }));
  }

  // Charge level of the home batteries through the day, in steps of 5 minutes (their average)
  let batterySoc = null;
  const withSoc = found.batteries.filter(b => has(b, 'measure_battery'));
  if (withSoc.length && !light && shown.has('battery') && PERIODS[period].bucket === 'hour') {
    const until = Math.min(Date.now(), periodEnd(period, start).getTime());
    const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
    jobs.push(Promise.all(withSoc.map(b => entries(b, 'measure_battery').catch(() => []))).then(lists => {
      const series = lists.filter(l => l.length).map(l => averageInSteps(l, start, steps));
      if (!series.length) return;
      const values = [];
      for (let i = 0; i < steps; i++) {
        const known = series.map(s => s[i]).filter(v => typeof v === 'number');
        values.push(known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length * 10) / 10 : null);
      }
      batterySoc = { start: start.toISOString(), step: POWER_STEP / 1000, values };
    }));
  }

  // Current (or else power) per phase through the day, in steps of 5 minutes
  let phaseHistory = null;
  const phaseCaps = phaseCapabilities(found.p1);
  if (phaseCaps.length && !light && shown.has('phases') && PERIODS[period].bucket === 'hour') {
    const kind = phaseCaps.some(c => c.startsWith('measure_current.')) ? 'current' : phaseCaps.some(c => c.startsWith('measure_power.')) ? 'power' : null;
    if (kind) {
      const until = Math.min(Date.now(), periodEnd(period, start).getTime());
      const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
      jobs.push(Promise.all([1, 2, 3].map(async n => {
        const cap = phaseCaps.find(c => c.startsWith(`measure_${kind}.`) && c.endsWith(String(n)));
        if (!cap) return null;
        const list = await entries(found.p1, cap).catch(() => []);
        if (!list.length) return null;
        const values = averageInSteps(list, start, steps).map(v => (typeof v === 'number' ? Math.round(v * 10) / 10 : null));
        return { phase: n, values };
      })).then(phases => {
        const known = phases.filter(Boolean);
        if (known.length) phaseHistory = { start: start.toISOString(), step: POWER_STEP / 1000, unit: kind === 'current' ? 'A' : 'W', phases: known };
      }));
    }
  }

  // The load of each group in the fuse box through the day
  let groupLoad = null;
  const groups = savedGroups(cfg);
  if (groups.length && !light && shown.has('groups') && PERIODS[period].bucket === 'hour') {
    const until = Math.min(Date.now(), periodEnd(period, start).getTime());
    const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
    jobs.push(groupHistory(groups, devices, entries, start, steps, estimated, groupExtras(cfg)).then(list => {
      groupLoad = { start: start.toISOString(), step: POWER_STEP / 1000, groups: list };
    }).catch(() => {}));
  }

  let power = null;
  if (!light && shown.has('power') && PERIODS[period].bucket === 'hour') {
    jobs.push(buildPowerHistory(client, found, period, cfg).then(curve => { power = curve; }).catch(() => {}));
  }

  let deviceEnergy = [];
  if (!light && (shown.has('devices') || shown.has('sankey'))) {
    const request = client.energyReport ? reportRequest(period) : null;
    jobs.push(Promise.all([
      buildDeviceEnergy(client, devices, found, resolution, maxKW),
      request ? client.energyReport(request).catch(() => null) : null,
    ]).then(([list, report]) => {
      const known = new Set(list.filter(d => d.kWh > 0).map(d => d.id));
      deviceEnergy = [...list.filter(d => d.kWh > 0), ...reportDevices(report, devices, found, known)];
    }));
  }

  await Promise.all(jobs);
  const summary = summarize(period, buckets, series, costs, {
    boilerTemperature,
    batterySoc,
    phaseHistory,
    groupLoad,
    power,
    deviceEnergy,
    hasBattery: found.batteries.length > 0,
    available: {
      solar: found.solar.length > 0,
      gas,
      heating: found.heating.length > 0,
      ev: found.evChargers.length > 0,
      water: Boolean(found.water),
    },
  });
  if (batteryStretches?.length) {
    summary.batteryEarnings = batteryEarnings(batteryStretches, buckets, summary.rows, tariff, doubtful.kWh);
    if (shown.has('batteryhistory')) summary.batteryHistory = batteryHistory(batteryStretches, buckets, summary.rows, tariff, PERIODS[period].bucket === 'hour');
  }
  if (!light && shown.has('solar')) summary.solarDevices = solarDevices.sort((a, b) => b.kWh - a.kWh);
  return summary;
}

// Expected solar kWh per bucket from the forecast log, for the days of a period that are in it
function expectedSolar(period, buckets, log) {
  if (!log || !Object.keys(log).length) return null;
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const kind = PERIODS[period].bucket;
  const values = buckets.map(b => {
    if (kind === 'hour') return null;
    const end = new Date(b.start);
    if (kind === 'day') end.setDate(end.getDate() + 1);
    else end.setMonth(end.getMonth() + 1);
    let sum = 0;
    let known = false;
    for (let d = new Date(b.start); d < end && d <= new Date(); d.setDate(d.getDate() + 1)) {
      if (typeof log[key(d)] === 'number') { sum += log[key(d)]; known = true; }
    }
    return known ? sum : null;
  });
  const today = log[key(new Date(buckets[0].start))];
  return { perBucket: values, day: kind === 'hour' ? (today ?? null) : null };
}

// A period as CSV, for a spreadsheet: Dutch uses ; and a decimal comma, English , and a point
const CSV_COLUMNS = [
  ['start', 'Begin', 'Start'],
  ['consumption', 'Verbruik (kWh)', 'Consumption (kWh)'],
  ['import', 'Van het net (kWh)', 'From grid (kWh)'],
  ['export', 'Teruggeleverd (kWh)', 'Exported (kWh)'],
  ['solar', 'Zon opgewekt (kWh)', 'Solar produced (kWh)'],
  ['solarToHome', 'Zelfverbruik zon (kWh)', 'Solar self-consumption (kWh)'],
  ['charge', 'Batterij geladen (kWh)', 'Battery charged (kWh)'],
  ['discharge', 'Batterij ontladen (kWh)', 'Battery discharged (kWh)'],
  ['gas', 'Gas (m³)', 'Gas (m³)'],
  ['water', 'Water (L)', 'Water (L)'],
  ['degreeDays', 'Graaddagen', 'Degree days'],
  ['costImport', 'Kosten afname (€)', 'Import cost (€)'],
  ['costExport', 'Teruglevering (€)', 'Export (€)'],
  ['costGas', 'Kosten gas (€)', 'Gas cost (€)'],
  ['costWater', 'Kosten water (€)', 'Water cost (€)'],
  ['costFixed', 'Vaste kosten (€)', 'Fixed costs (€)'],
];

// `symbol` replaces € in the column names, for a currency other than euro
function historyCsv(history, lang = 'nl', symbol = '€') {
  const dutch = lang === 'nl';
  const sep = dutch ? ';' : ',';
  const number = v => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    const text = String(Math.round(v * 10000) / 10000);
    return dutch ? text.replace('.', ',') : text;
  };
  const date = iso => {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const header = CSV_COLUMNS.map(c => (dutch ? c[1] : c[2]).replace('€', () => symbol)).join(sep);
  const lines = history.rows.map(row => CSV_COLUMNS.map(([key]) => (key === 'start' ? date(row.start) : number(row[key]))).join(sep));
  // A byte order mark, so Excel reads € and ³ correctly
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

// What the end of net metering (1 January 2027) costs, from a year of history: the value of
// net metering over the exported energy, for the part that is netted against import (export
// beyond the year's import was never netted). `basis` says which year the numbers come from.
// `perMonth`: the electricity bill per month (import minus export, without fixed costs) now with
// net metering, from 2027 without it, and from 2027 without the home battery: what it charged
// would have been exported and what it gave the house imported.
function nettingSummary(history, basis, now = new Date()) {
  const t = history?.totals;
  if (!t || !(t.export > 0)) return { basis, export: t?.export || 0, extra: null };
  const nettedShare = Math.min(1, (t.import || 0) / t.export);
  const measured = history.rows.filter(r => (r.import || 0) + (r.export || 0) > 0);
  const days = measured.reduce((sum, r) => {
    const from = new Date(r.start);
    return sum + Math.max(0, Math.min(addMonths(from, 1).getTime(), now.getTime()) - from.getTime()) / DAY_MS;
  }, 0);
  const c = t.costs || {};
  let perMonth = null;
  if (days >= 7 && typeof c.import === 'number' && typeof c.export === 'number' && typeof t.costExportAfter === 'number') {
    const month = 365.25 / 12 / days;
    // Export beyond the year's import was never netted: it earned the compensation already
    const withNetting = c.import + c.export * nettedShare + t.costExportAfter * (1 - nettedShare);
    const without = c.import + t.costExportAfter;
    const importPrice = t.import > 0 ? c.import / t.import : null;
    const exportPrice = t.costExportAfter / t.export;
    const battery = (t.charge || 0) + (t.discharge || 0) > 0 && importPrice !== null
      ? without + (t.discharge || 0) * importPrice + (t.charge || 0) * exportPrice : null;
    perMonth = {
      now: withNetting * month,
      after: without * month,
      withoutBattery: battery === null ? null : battery * month,
    };
  }
  return {
    basis,
    months: measured.length,
    days: Math.round(days),
    import: t.import,
    export: t.export,
    netted: t.export * nettedShare,
    extra: typeof t.nettingValue === 'number' ? t.nettingValue * nettedShare : null,
    // What each exported kWh used by the house itself instead saves once netting has ended
    perKWh: typeof t.nettingValue === 'number' ? t.nettingValue / t.export : null,
    // Its two parts: the average export compensation without netting (negative with a feed-in
    // fee), so perKWh = the import price avoided - this
    compensation: typeof t.costExportAfter === 'number' ? -t.costExportAfter / t.export : null,
    perMonth,
  };
}

// Standby use: the lowest power of the house last night (1:00 to 5:00), when nothing
// but always-on devices runs. Battery power is taken into account, solar is zero at night.
// `marketAverage` is today's average market price, for the yearly cost with a dynamic contract;
// `homey` the prices of Homey Energy, for a contract left open in the app
async function buildBaseload(client, found, cfg, marketAverage = null, homey = null) {
  if (!found.p1) return null;
  const read = (device, capability) => client.getEntries(device.id, capability, 'yesterday').catch(() => []);
  const grid = await gridPower(found.p1, read, cfg);
  const batteries = await Promise.all(found.batteries.map(b => batteryPowerHistory(b, read, cfg.battery)));
  const batteryAt = t => batteries.reduce((sum, list) => {
    let last = null;
    for (const e of list) {
      if (e.t > t) break;
      last = e;
    }
    return sum + (last ? last.v : 0);
  }, 0);

  const night = grid
    .filter(e => e.t.getHours() >= 1 && e.t.getHours() < 5)
    .map(e => e.v - batteryAt(e.t))
    .filter(v => v >= 0)
    .sort((a, b) => a - b);
  if (!night.length) return null;

  // A low percentile rather than the minimum, so one odd reading does not count
  const watts = night[Math.floor(night.length * 0.1)];
  const yearKWh = watts * 24 * 365 / 1000;
  const tariff = typicalImportPrice(contractFrom(cfg), marketAverage, homey);
  return {
    watts,
    yearKWh,
    yearCost: typeof tariff === 'number' ? yearKWh * tariff : null,
  };
}

// ---------- Battery size ----------

// What a home battery would have to deliver: per night the use of the house while the sun gives
// less than DARK_SOLAR_W. A night runs from noon to noon, so an evening and the next morning are
// one night, the stretch a battery charged by that day's sun has to cover. The log keeps one
// record per night (keyed by the date of the evening), for a year. A night with missing or
// impossible readings is kept as { skipped: reason }, so it is not read again and can be counted.
const DARK_SOLAR_W = 200;
const NIGHT_BIN_W = 250;
const NIGHT_BINS = 24; // the last one holds everything from 5750 W up
const NIGHT_DAYS = 365;
// Insights resolutions from fine to coarse with the days each covers. A resolution counts only
// with steps of at most an hour: coarser steps mix day and night.
const NIGHT_RESOLUTIONS = [['last7Days', 7], ['last14Days', 14], ['last31Days', 31], ['last3Months', 92], ['last6Months', 183], ['last2Years', 730]];
const NIGHT_MAX_STEP = 65 * 60 * 1000;
const NIGHT_COVERAGE = 0.9;
const DAY_MS = 24 * 3600 * 1000;
// Checks for readings that cannot be right
const STUCK_MS = 6 * 3600 * 1000; // the meter gives exactly the same power for 6 hours
const MIN_DARK_W = 25; // a house uses more than this on average (fridge, router, standby)
const EXPORT_WITHOUT_SUN_W = 100; // exporting this much while the panels say they give nothing
const EXPORT_WITHOUT_SUN_MS = 3600 * 1000;
const LOW_NIGHT_SHARE = 0.2; // a night far below the usual one: the meter stopped counting

const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

// Height of the sun in degrees (the same approximation as the screen settings use)
function sunHeight(lat, lon, date) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - 946728000000) / 86400000;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const hourAngle = (18.697374558 + 24.06570982441908 * d) * 15 * rad + lon * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hourAngle)) / rad;
}

// How high the sun gets during a step (degrees), or null without a location
function stepSunHeight(t, step, place) {
  if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number') return null;
  return Math.max(sunHeight(place.lat, place.lon, t), sunHeight(place.lat, place.lon, new Date(t.getTime() + step)));
}

// Whether panels that log nothing during a step give 0 W. Many inverters stop logging at dusk,
// so that counts while the sun is lower than 10° (it gives little then). While it is higher a
// missing reading is unknown: the app may be down. Without a location the hours stand in.
function quietPanel(t, step, place) {
  const height = stepSunHeight(t, step, place);
  if (height !== null) return height < 10;
  const h = t.getHours();
  return h >= 21 || h < 6;
}

// The usual time between two readings (the median), or null with too few readings
function typicalStep(entries) {
  if (entries.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < entries.length; i++) gaps.push(entries[i].t - entries[i - 1].t);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || null;
}

// The average of `entries` per step from `start`, and whether the step had readings of its own.
// Homey logs a power that does not change less often, so a step without readings keeps the last
// value for up to an hour; after that it is unknown (null).
function stepAverages(entries, start, step, count) {
  const sums = new Array(count).fill(0);
  const counts = new Array(count).fill(0);
  for (const e of entries) {
    const i = Math.floor((e.t - start) / step);
    if (i >= 0 && i < count && typeof e.v === 'number' && Number.isFinite(e.v)) { sums[i] += e.v; counts[i]++; }
  }
  const hold = Math.max(1, Math.round(3600000 / step));
  const values = [];
  let last = null;
  let lastAt = -Infinity;
  for (let i = 0; i < count; i++) {
    if (counts[i]) { last = sums[i] / counts[i]; lastAt = i; }
    values.push(i - lastAt <= hold ? last : null);
  }
  return { values, fresh: counts.map(c => c > 0) };
}

// Night records from power readings: `grid` (W, negative while exporting), `solar`, `batteries`
// (W, positive while charging) and `chargers` (EV chargers, W) as lists of readings per device,
// all with steps of `step` ms. `place` ({ lat, lon }) tells when the sun is down; `maxW` is the
// most the connection can carry, so a higher value is a jump of a counter, not power.
// Returns per night either the record or { skipped: reason }: 'gaps' (too few readings),
// 'stuck' (the meter repeats one value), 'solar' (export while the panels give nothing) or
// 'zero' (hardly any use while dark). Nights at the edges, without enough readings, are left out.
function nightRecords({ grid, solar = [], batteries = [], chargers = [], step, place = null, maxW = 25000 }) {
  if (!grid.length || !step) return {};
  const start = grid[0].t.getTime();
  const count = Math.ceil((grid[grid.length - 1].t.getTime() + step - start) / step);
  const g = stepAverages(grid, start, step, count);
  const panels = solar.map(list => stepAverages(list, start, step, count));
  const stores = batteries.filter(list => list.length).map(list => stepAverages(list, start, step, count).values);
  const cars = chargers.filter(list => list.length).map(list => stepAverages(list, start, step, count).values);
  const hours = step / 3600000;
  const perDay = Math.round(DAY_MS / step);
  const nights = {};
  const days = {};
  const nightOf = t => {
    const key = localDate(new Date(t.getTime() - DAY_MS / 2));
    return nights[key] || (nights[key] = {
      steps: 0, known: 0, dark: 0, hours: 0, peak: 0, bins: new Array(NIGHT_BINS).fill(0),
      noSun: 0, run: 0, longestRun: 0, last: null, missingDark: 0,
    });
  };
  for (let i = 0; i < count; i++) {
    const t = new Date(start + i * step);
    const night = nightOf(t);
    night.steps++;
    const gw = g.values[i];
    if (gw === null || Math.abs(gw) > maxW) {
      night.run = 0;
      night.last = null;
      // A short gap while it was dark is filled in below with the average power of that night
      if (panels.every(p => p.values[i] === null ? quietPanel(t, step, place) : Math.abs(p.values[i]) < DARK_SOLAR_W)) night.missingDark += hours;
      continue;
    }

    // The same power to the watt in step after step, with readings of its own: a meter that hangs
    if (g.fresh[i] && night.last !== null && Math.abs(gw - night.last) < 0.5) night.run++;
    else night.run = 0;
    night.longestRun = Math.max(night.longestRun, night.run);
    if (g.fresh[i]) night.last = gw;

    // Panels without a reading give nothing when the sun is down or low (see quietPanel)
    let sun = 0;
    let known = true;
    for (const p of panels) {
      if (p.values[i] !== null) sun += Math.abs(p.values[i]);
      else if (!quietPanel(t, step, place)) known = false;
    }
    const charge = stores.reduce((sum, b) => sum + (b[i] || 0), 0);
    const day = days[localDate(t)] || (days[localDate(t)] = { steps: 0, surplus: 0 });
    day.steps++;
    day.surplus += Math.max(0, -gw) * hours / 1000;
    if (!known) continue;
    night.known++;
    if (sun >= DARK_SOLAR_W) continue;
    // Exporting while the panels give (almost) nothing and no battery discharges: the solar
    // readings are missing or wrong, so this was not really dark
    if (gw < -EXPORT_WITHOUT_SUN_W && charge > -EXPORT_WITHOUT_SUN_W) { night.noSun += step; continue; }
    const car = cars.reduce((sum, c) => sum + Math.max(0, c[i] || 0), 0);
    const home = Math.max(0, gw + sun - charge - car);
    const kWh = home * hours / 1000;
    night.dark += kWh;
    night.hours += hours;
    night.peak = Math.max(night.peak, home);
    night.bins[Math.min(NIGHT_BINS - 1, Math.floor(home / NIGHT_BIN_W))] += kWh;
  }
  const out = {};
  const minutes = Math.round(step / 60000);
  for (const [date, n] of Object.entries(nights)) {
    // A night cut off by the start or end of the readings is not judged at all
    if (n.steps < perDay * NIGHT_COVERAGE) continue;
    let skipped = null;
    if (n.known < perDay * NIGHT_COVERAGE) skipped = 'gaps';
    else if ((n.longestRun + 1) * step >= STUCK_MS) skipped = 'stuck';
    else if (n.noSun >= EXPORT_WITHOUT_SUN_MS) skipped = 'solar';
    else if (n.hours > 0 && n.dark * 1000 / n.hours < MIN_DARK_W) skipped = 'zero';
    if (skipped) { out[date] = { skipped, step: minutes }; continue; }
    if (n.missingDark && n.hours) {
      n.dark += n.dark / n.hours * n.missingDark;
      n.hours += n.missingDark;
    }
    const day = days[date];
    const bins = n.bins.map(v => round(v, 3));
    while (bins.length && !bins[bins.length - 1]) bins.pop();
    out[date] = {
      dark: round(n.dark, 3),
      hours: round(n.hours, 2),
      peak: Math.round(n.peak),
      bins,
      surplus: day && day.steps >= perDay * NIGHT_COVERAGE ? round(day.surplus, 3) : null,
      step: minutes,
    };
  }
  return out;
}

// The devices the log was made with: another P1 meter or other panels make a new log
function nightSource(found) {
  return [found.p1?.id, ...found.solar.map(d => d.id).sort(), ...found.batteries.map(d => d.id).sort()].join(',');
}

// The last night that has ended (at noon) at `now`
const lastNight = (now = new Date()) => localDate(new Date(now.getTime() - 1.5 * DAY_MS));

// The number of phases of the connection: one when the P1 meter reports only L1, else three
// (also when it reports no phases at all)
function connectionPhases(p1) {
  const phases = new Set(phaseCapabilities(p1).map(c => c.slice(-1)));
  return phases.size === 1 ? 1 : 3;
}

// The most power the connection can carry (W), with room to spare: above it a reading is a jump
// of a counter after an outage, not power. A single-phase connection (1x25 A) carries a third.
function connectionMaxW(cfg = {}, p1 = null) {
  const amps = Number(cfg.grid?.fuseAmps) > 0 ? Number(cfg.grid.fuseAmps) : 25;
  const phases = connectionPhases(p1);
  return Math.max(phases === 1 ? 8000 : 15000, amps * 230 * phases * 1.5);
}

// Grid and solar power per 5 minutes from a Homey Energy day report (cumulativeMeasurePower and
// generatedMeasurePower), checked against the kWh totals of the same report: a curve that does
// not add up to them is left out, so the day counts as missing ('mismatch'). Null without a report.
// With `place`, solar power while the sun is down is 0: Homey Energy can hold an inverter's last
// value all night when it goes offline (120 W from sunset to sunrise on the owner's Homey).
function reportSeries(report, found, place = null) {
  const el = report?.electricity;
  if (!el || typeof el !== 'object') return null;
  const list = points => (Array.isArray(points) ? points : [])
    .filter(p => p && typeof p.v === 'number' && Number.isFinite(p.v) && p.t)
    .map(p => ({ t: new Date(p.t), v: p.v }))
    .filter(p => !Number.isNaN(p.t.getTime()))
    .sort((a, b) => a.t - b.t);
  const kWh = (entries, sign) => {
    const step = typicalStep(entries) || 5 * 60 * 1000;
    return entries.reduce((sum, e) => sum + Math.max(0, sign * e.v), 0) * step / 3.6e9;
  };
  // Within a quarter, or half a kWh on a quiet day; a total Homey does not give is not checked
  const near = (a, b) => typeof b !== 'number' || Math.abs(a - b) <= 0.5 + 0.25 * Math.abs(b);
  let grid = list(el.cumulativeMeasurePower);
  const solar = list(el.generatedMeasurePower);
  let mismatch = false;
  if (grid.length) {
    const imported = kWh(grid, 1);
    const exported = kWh(grid, -1);
    // Positive should be import; the closer of the two ways round wins, and must be near
    const off = (a, b) => (typeof b === 'number' ? Math.abs(a - b) : 0);
    const flipped = off(exported, el.importedPeriod) + off(imported, el.exportedPeriod)
      < off(imported, el.importedPeriod) + off(exported, el.exportedPeriod);
    if (flipped) grid = grid.map(e => ({ t: e.t, v: -e.v }));
    const [inn, out] = flipped ? [exported, imported] : [imported, exported];
    if (!near(inn, el.importedPeriod) || !near(out, el.exportedPeriod)) mismatch = true;
  }
  if (found.solar.length) {
    if (!solar.length || !near(kWh(solar, 1), el.generatedPeriod)) mismatch = mismatch || solar.length > 0;
    if (!solar.length) return { grid: [], solar: [], mismatch };
  }
  if (mismatch) return { grid: [], solar: [], mismatch };
  const step = typicalStep(solar) || 5 * 60 * 1000;
  const dark = e => e.v !== 0 && stepSunHeight(e.t, step, place) < SOLAR_SUN_HEIGHT;
  return { grid, solar: solar.map(e => (dark(e) ? { t: e.t, v: 0 } : e)), mismatch: false };
}

// Below this height of the sun (degrees) panels give nothing
const SOLAR_SUN_HEIGHT = -3;

const NIGHT_REPORT_CHUNK = 14; // nights per batch, so a year of reports is never in memory at once
const NIGHT_REPORT_MISSES = 7; // days in a row without a report: Homey Energy's history starts there

// Nights from Homey Energy day reports, newest first, as far back as there are reports. A night
// needs the report of its evening and of the next morning. Nights before the first report are
// returned as { missing: true }, so they are not asked for again.
async function nightsFromReports(dayReport, found, dates, { place, maxW, progress }) {
  const out = {};
  const cache = new Map();
  let misses = 0;
  let ended = false;
  const fetchDay = async date => {
    if (!cache.has(date)) {
      const series = ended ? null : reportSeries(await dayReport(date).catch(() => null), found, place);
      if (series === null) misses++;
      else misses = 0;
      if (misses >= NIGHT_REPORT_MISSES) ended = true;
      cache.set(date, series);
    }
    return cache.get(date);
  };
  const nextDay = date => localDate(new Date(new Date(`${date}T12:00:00`).getTime() + DAY_MS));
  for (let i = 0; i < dates.length; i += NIGHT_REPORT_CHUNK) {
    const chunk = dates.slice(i, i + NIGHT_REPORT_CHUNK);
    if (ended) {
      for (const date of chunk) out[date] = { missing: true };
      continue;
    }
    const days = [...new Set(chunk.flatMap(date => [date, nextDay(date)]))].sort().reverse();
    const series = new Map();
    for (const day of days) series.set(day, await fetchDay(day));
    const ascending = [...days].reverse();
    const grid = ascending.flatMap(day => series.get(day)?.grid || []);
    const solar = ascending.flatMap(day => series.get(day)?.solar || []);
    const nights = grid.length ? nightRecords({ grid, solar: found.solar.length ? [solar] : [], step: typicalStep(grid), place, maxW }) : {};
    for (const date of chunk) {
      const bad = series.get(date)?.mismatch || series.get(nextDay(date))?.mismatch;
      const night = nights[date];
      if (night && !(night.skipped && bad)) out[date] = night;
      else if (bad) out[date] = { skipped: 'mismatch', step: 5 };
      else out[date] = { missing: true };
    }
    // Only the oldest day of this batch is needed again (as the morning of the next batch)
    const keep = days[days.length - 1];
    for (const day of [...cache.keys()]) if (day !== keep) cache.delete(day);
    if (progress) await progress(out);
  }
  return out;
}

// Reads the nights that `known` does not hold yet: first from Homey Energy's day reports (power
// per 5 minutes, as far back as they go), then from Insights, fine to coarse, for what is still
// missing. A night a source had to skip can still come from another. `read(device, capability,
// resolution)` returns readings ([] when none); `dayReport(date)` a Homey Energy day report.
// The reports have no battery power, so with a home battery only Insights is used.
async function collectNights(read, found, cfg = {}, known = {}, now = new Date(), { place = null, dayReport = null, progress = null } = {}) {
  if (!found.p1) return {};
  const out = {};
  const until = lastNight(now);
  const record = date => out[date] || known[date];
  const done = date => Boolean(record(date) && !record(date).skipped && !record(date).missing);
  const tried = date => Boolean(record(date) && !record(date).missing);
  const put = nights => {
    for (const [date, night] of Object.entries(nights)) {
      if (date > until || done(date)) continue;
      const current = out[date];
      if (!current || current.missing || (current.skipped && !night.missing)) out[date] = night;
    }
  };
  const recent = span => {
    const dates = [];
    for (let d = 1; d <= Math.min(span, NIGHT_DAYS); d++) {
      const date = localDate(new Date(now.getTime() - (d + 0.5) * DAY_MS));
      if (date <= until) dates.push(date);
    }
    return dates;
  };
  const maxW = connectionMaxW(cfg, found.p1);

  if (dayReport && !found.batteries.length) {
    // Nights never asked for; a night known as missing is not asked again
    const dates = recent(NIGHT_DAYS).filter(date => !record(date));
    if (dates.length) {
      put(await nightsFromReports(dayReport, found, dates, {
        place,
        maxW,
        progress: progress ? async part => { put(part); await progress(out); } : null,
      }));
    }
  }

  for (const [resolution, span] of NIGHT_RESOLUTIONS) {
    if (recent(span).every(tried)) continue;
    const r = (device, capability) => read(device, capability, resolution);
    const grid = await gridPower(found.p1, r, cfg);
    const step = typicalStep(grid);
    if (!step || step > NIGHT_MAX_STEP) continue;
    const solar = await Promise.all(found.solar.map(async panel => {
      let entries = has(panel, 'measure_power') ? await r(panel, 'measure_power') : [];
      if (!entries.length) entries = powerFromMeter(await solarMeterEntries(panel, r));
      return entries;
    }));
    // Panels without any readings at this resolution would make every day look dark
    if (found.solar.length && solar.every(list => !list.length)) continue;
    const batteries = await Promise.all(found.batteries.map(b => batteryPowerHistory(b, r, cfg.battery)));
    // Charging the car is not something a home battery is meant for
    const chargers = await Promise.all((found.evChargers || []).filter(d => has(d, 'measure_power')).map(d => r(d, 'measure_power')));
    put(nightRecords({ grid, solar, batteries, chargers, step, place, maxW }));
  }
  return out;
}

// The log without nights older than a year
function pruneNights(log, now = new Date()) {
  const from = localDate(new Date(now.getTime() - (NIGHT_DAYS + 1.5) * DAY_MS));
  return Object.fromEntries(Object.entries(log || {}).filter(([date]) => date >= from));
}

const BATTERY_SIZES = [2.5, 5, 7.5, 10, 15];
const BATTERY_POWERS = [800, 1200, 2400, 3600, 5000];

// What the nights of the last year say about a battery: the use while dark per night and per
// month, the sun's surplus to charge it with, how much of the dark use each size and each power
// could cover, and a size and power that cover most nights. Skipped nights are counted per
// reason; a night far below the usual one ('low') is left out as well.
function batteryAdvice(log, now = new Date()) {
  const all = Object.entries(pruneNights(log, now)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, n]) => ({ date, ...n }));
  const measured = all.filter(n => !n.skipped && typeof n.dark === 'number');
  const usual = measured.map(n => n.dark).sort((a, b) => a - b)[Math.floor(measured.length / 2)] || 0;
  const nights = measured.filter(n => measured.length < 7 || n.dark >= usual * LOW_NIGHT_SHARE);
  const skipped = {};
  for (const n of all) if (n.skipped) skipped[n.skipped] = (skipped[n.skipped] || 0) + 1;
  if (measured.length > nights.length) skipped.low = measured.length - nights.length;
  const skippedCount = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (!nights.length) return all.length ? { nights: 0, skipped, skippedCount } : null;
  const sum = (list, f) => list.reduce((s, n) => s + f(n), 0);
  const avgDark = sum(nights, n => n.dark) / nights.length;

  // A battery charged by the sun gives back at most what the sun left over that day
  const solarNights = nights.filter(n => typeof n.surplus === 'number');
  const solarDark = sum(solarNights, n => n.dark);
  const fromSun = n => Math.min(n.dark, n.surplus);
  const sizes = BATTERY_SIZES.map(kWh => {
    const covered = sum(solarNights, n => Math.min(kWh, fromSun(n)));
    return { kWh, share: solarDark ? covered / solarDark : null, perYear: solarNights.length ? covered / solarNights.length * 365 : null };
  });
  const unlimited = solarDark ? sum(solarNights, fromSun) / solarDark : null;

  // Power: the dark use per band of 250 W; a battery of P watts covers all of a band below P
  // and P/band of a band above it
  const bins = new Array(NIGHT_BINS).fill(0);
  for (const n of nights) (n.bins || []).forEach((v, i) => { bins[i] += v; });
  const binTotal = bins.reduce((a, b) => a + b, 0);
  const powerShare = watts => (binTotal ? bins.reduce((s, e, i) => s + e * Math.min(1, watts / ((i + 1) * NIGHT_BIN_W)), 0) / binTotal : null);
  const powers = BATTERY_POWERS.map(watts => ({ watts, share: powerShare(watts) }));
  let adviceW = null;
  for (let w = 100; binTotal && w <= NIGHT_BINS * NIGHT_BIN_W; w += 100) {
    if (powerShare(w) >= 0.9) { adviceW = w; break; }
  }

  // Size: enough for four in five nights, of what the sun can fill
  const filled = solarNights.map(fromSun).sort((a, b) => a - b);
  const adviceKWh = filled.length ? Math.ceil(filled[Math.min(filled.length - 1, Math.floor(filled.length * 0.8))] * 2) / 2 : null;

  // Per month: the average night and the average surplus of a day
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const first = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = localDate(first).slice(0, 7);
    const list = nights.filter(n => n.date.startsWith(key));
    const sunny = list.filter(n => typeof n.surplus === 'number');
    months.push({
      start: first.toISOString(),
      label: key,
      nights: list.length,
      dark: list.length ? sum(list, n => n.dark) / list.length : 0,
      surplus: sunny.length ? sum(sunny, n => n.surplus) / sunny.length : 0,
      // Share of the nights that is modelled, for a lighter bar
      modelled: list.length ? list.filter(n => n.modelled).length / list.length : 0,
    });
  }

  return {
    nights: nights.length,
    // Nights from an imported meter export, with the dark hours from the height of the sun
    estimated: nights.filter(n => n.estimated).length,
    // Nights of months without readings, from Homey Energy's month totals (modelNights)
    modelled: nights.filter(n => n.modelled).length,
    skipped,
    skippedCount,
    from: nights[0].date,
    to: nights[nights.length - 1].date,
    step: Math.max(...nights.map(n => n.step || 0)),
    threshold: DARK_SOLAR_W,
    avgDark,
    avgHours: sum(nights, n => n.hours) / nights.length,
    yearDark: avgDark * 365,
    peak: Math.max(...nights.map(n => n.peak || 0)) || null,
    advice: { kWh: adviceKWh, watts: adviceW },
    unlimited,
    sizes,
    powers,
    months,
  };
}

// ---------- Nights from a meter export ----------

// The HomeWizard Energy app (Energy+) exports the P1 meter per 15 minutes for up to a year as
// CSV: a time column ("YYYY-MM-DD HH:MM", local time) and cumulative meter readings in kWh for
// import and export, per tariff (T1, T2), and maybe the highest power per phase per interval (W).
// The columns are found by their names, so other exports with the same kind of columns work too.
// Returns { rows: [{ t, imported, exported, maxW }], columns } or throws with a readable reason.
function parseMeterCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 3) throw new Error('Het bestand heeft te weinig regels');
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = line => line.split(sep).map(cell => cell.trim().replace(/^"|"$/g, '').trim());
  const header = split(lines[0]).map(h => h.toLowerCase());
  const isMax = h => /max|piek|peak/.test(h) || (/\bl[123]\b/.test(h) && !/kwh/.test(h));
  const isExport = h => /export|teruglever|terug|produc|return|injec|geleverd aan/.test(h);
  const isImport = h => /import|afname|consum|verbruik|deliver|levering|usage/.test(h);
  const timeCol = header.findIndex(h => /^(time|tijd|datum|date|timestamp|datetime)/.test(h));
  const importCols = header.map((h, i) => (isImport(h) && !isExport(h) && !isMax(h) && !/gas|water|m3|m³/.test(h) ? i : -1)).filter(i => i >= 0);
  const exportCols = header.map((h, i) => (isExport(h) && !isMax(h) && !/gas|water|m3|m³/.test(h) ? i : -1)).filter(i => i >= 0);
  const maxCols = header.map((h, i) => (isMax(h) && !/gas|water/.test(h) ? i : -1)).filter(i => i >= 0);
  if (timeCol < 0) throw new Error('Geen kolom met de tijd gevonden');
  if (!importCols.length) throw new Error('Geen kolom met de afname (import) gevonden');
  const number = cell => {
    if (cell === undefined || cell === '') return null;
    const clean = sep === ';' ? cell.replace(/\./g, '').replace(',', '.') : cell;
    const v = Number(sep === ';' && !cell.includes(',') ? cell : clean);
    return Number.isFinite(v) ? v : null;
  };
  const time = cell => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(cell);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
    const parsed = Date.parse(cell);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  };
  const sumOf = (cells, cols) => {
    let total = 0;
    for (const i of cols) {
      const v = number(cells[i]);
      if (v === null) return null;
      total += v;
    }
    return total;
  };
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const t = time(cells[timeCol] || '');
    const imported = sumOf(cells, importCols);
    if (!t || imported === null) continue;
    const exported = exportCols.length ? sumOf(cells, exportCols) : 0;
    // Highest power per phase: the phases that have a value (one phase leaves L2 and L3 empty)
    const phaseMax = maxCols.map(i => number(cells[i])).filter(v => v !== null);
    const maxW = phaseMax.length ? phaseMax.reduce((a, b) => a + b, 0) : null;
    rows.push({ t, imported, exported: exported === null ? null : exported, maxW });
  }
  rows.sort((a, b) => a.t - b.t);
  if (rows.length < 96) throw new Error('Te weinig metingen gevonden (minder dan een dag)');
  const name = cols => cols.map(i => header[i]);
  return { rows, columns: { time: header[timeCol], imported: name(importCols), exported: name(exportCols), max: name(maxCols) } };
}

// The height of the sun under which it counts as dark when only the grid is known: the one that
// best matches the dark hours of the nights Homey measured (sun < 200 W). 3° without them.
const DEFAULT_DARK_HEIGHT = 3;
function darkSunHeight(log, place) {
  if (!place) return DEFAULT_DARK_HEIGHT;
  const measured = Object.entries(log || {}).filter(([, n]) => n && !n.skipped && !n.missing && typeof n.hours === 'number' && n.step && n.step <= 15);
  if (measured.length < 3) return DEFAULT_DARK_HEIGHT;
  const step = 5 * 60 * 1000;
  const heights = measured.map(([date, n]) => {
    const start = new Date(`${date}T12:00:00`).getTime();
    const list = [];
    for (let t = start; t < start + DAY_MS; t += step) list.push(sunHeight(place.lat, place.lon, new Date(t + step / 2)));
    return { list, hours: n.hours };
  });
  let best = DEFAULT_DARK_HEIGHT;
  let bestError = Infinity;
  for (let h = -6; h <= 20; h += 0.5) {
    const error = heights.reduce((sum, n) => sum + Math.abs(n.list.filter(v => v < h).length * step / 3600000 - n.hours), 0);
    if (error < bestError) { bestError = error; best = h; }
  }
  return best;
}

// Night records from cumulative meter readings (parseMeterCsv): the power per interval from the
// increase of the meters, dark while the sun is lower than `darkHeight` and nothing is exported.
// The same checks as for measured nights apply; a jump or reset of a meter is a gap. The records
// are marked `estimated` and keep the highest power of the export (maxW) as their peak.
function nightsFromMeterRows(rows, { place = null, darkHeight = DEFAULT_DARK_HEIGHT, maxW = 25000 } = {}) {
  const step = typicalStep(rows);
  if (!step || step > NIGHT_MAX_STEP) return {};
  const grid = [];
  const sun = [];
  const peaks = new Map();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const ms = b.t - a.t;
    if (ms !== step || a.exported === null || b.exported === null) continue;
    const inn = b.imported - a.imported;
    const out = b.exported - a.exported;
    if (inn < 0 || out < 0) continue;
    const net = (inn - out) * 3.6e9 / ms;
    const exportW = out * 3.6e9 / ms;
    if (Math.abs(net) > maxW) continue;
    const middle = new Date(a.t.getTime() + ms / 2);
    const height = place ? sunHeight(place.lat, place.lon, middle) : (middle.getHours() >= 21 || middle.getHours() < 6 ? -10 : 30);
    const dark = height < darkHeight && exportW < 20;
    grid.push({ t: a.t, v: net });
    // Not the solar power, only whether it is dark: 0 W, or enough to count as light
    sun.push({ t: a.t, v: dark ? 0 : DARK_SOLAR_W * 5 });
    if (dark && typeof b.maxW === 'number') {
      const key = localDate(new Date(a.t.getTime() - DAY_MS / 2));
      peaks.set(key, Math.max(peaks.get(key) || 0, b.maxW));
    }
  }
  const nights = nightRecords({ grid, solar: [sun], step, place, maxW });
  for (const [date, night] of Object.entries(nights)) {
    night.estimated = true;
    if (!night.skipped && peaks.has(date)) night.peak = Math.max(night.peak, Math.round(peaks.get(date)));
  }
  return nights;
}

// A whole meter export turned into the record kept as `nightImport`: the nights (dark by the
// height of the sun, matched to the measured nights in `log`), their range and what was used.
function importMeterExport(csv, { log = {}, place = null, maxW = 25000, now = new Date() } = {}) {
  const { rows, columns } = parseMeterCsv(csv);
  const darkHeight = darkSunHeight(log, place);
  const nights = pruneNights(nightsFromMeterRows(rows, { place, darkHeight, maxW }), now);
  const dates = Object.keys(nights).sort();
  if (!dates.length) throw new Error('Geen hele nachten gevonden: zijn het metingen per kwartier of per uur?');
  const skipped = Object.values(nights).filter(n => n.skipped).length;
  return {
    record: { made: now.toISOString(), from: dates[0], to: dates[dates.length - 1], darkHeight, columns, nights },
    summary: { done: true, nights: dates.length - skipped, skipped, from: dates[0], to: dates[dates.length - 1], darkHeight, columns },
  };
}

// The parts of an uploaded file, sent one by one: `add` returns the whole text once every part
// is in, else null. A new upload (another id) starts over.
class UploadParts {
  add({ id, part, parts, text }) {
    const count = Number(parts);
    const index = Number(part);
    if (!id || !(count >= 1 && count <= 200) || !(index >= 0 && index < count) || typeof text !== 'string') throw new Error('Ongeldig deel van het bestand');
    if (!this.current || this.current.id !== id) this.current = { id, parts: new Array(count).fill(null) };
    this.current.parts[index] = text;
    if (this.current.parts.some(p => p === null)) return null;
    const whole = this.current.parts.join('');
    this.current = null;
    return whole;
  }
}

// Measured nights first; imported (estimated) nights fill in the rest. With at least a week of
// nights in both, the estimates are corrected by how far they were off on those nights.
function mergeNights(log, imported) {
  const valid = n => n && !n.skipped && !n.missing && typeof n.dark === 'number';
  const overlap = Object.keys(imported || {}).filter(date => valid(log?.[date]) && valid(imported[date]));
  const measuredSum = overlap.reduce((s, d) => s + log[d].dark, 0);
  const importedSum = overlap.reduce((s, d) => s + imported[d].dark, 0);
  const factor = overlap.length >= 7 && importedSum > 0 ? measuredSum / importedSum : 1;
  const merged = { ...(log || {}) };
  for (const [date, night] of Object.entries(imported || {})) {
    if (valid(merged[date]) || (merged[date]?.skipped && !merged[date].estimated)) continue;
    merged[date] = valid(night) && factor !== 1
      ? { ...night, dark: night.dark * factor, bins: (night.bins || []).map(v => v * factor) }
      : night;
  }
  return { nights: merged, check: overlap.length ? { nights: overlap.length, measured: measuredSum, estimated: importedSum, factor } : null };
}

// ---------- Modelled nights for months without readings ----------

// The totals of a Homey Energy month report that the model needs (kWh for the whole month), or
// null without them (before there was a P1 meter). The house used imported + generated -
// exported: Homey's consumedPeriod is only what its metered devices used, which grows with every
// meter added (5.9 kWh in a month on the owner's Homey), so it is not used.
function monthTotals(report) {
  const el = report?.electricity;
  if (!el) return null;
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const imported = num(el.importedPeriod);
  const exported = num(el.exportedPeriod);
  const generated = num(el.generatedPeriod);
  if (imported === null || exported === null) return null;
  return { imported, exported, generated, consumed: imported + (generated || 0) - exported };
}

// The months (YYYY-MM) of the last year that have no night yet on most of their days: the ones
// to model. The month running now is never modelled.
function monthsToModel(nights, now = new Date()) {
  const out = [];
  for (let k = 12; k >= 1; k--) {
    const first = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = localDate(first).slice(0, 7);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const have = Object.entries(nights).filter(([date, n]) => date.startsWith(key) && n && !n.skipped && !n.missing && typeof n.dark === 'number').length;
    if (have < days / 2) out.push(key);
  }
  return out;
}

// Hours of a night (noon to noon) that the panels give less than DARK_SOLAR_W, when they make
// `generated` kWh a day on average: their power follows the height of the sun, and the clouds
// differ per day, so the hours are averaged over dull to bright days around that average.
// Without solar the whole night counts.
const CLEARNESS = [0.25, 0.6, 1, 1.4, 1.75];
function modelDarkHours(date, place, generated) {
  const step = 10 * 60 * 1000;
  const hours = step / 3600000;
  const start = new Date(`${date}T12:00:00`).getTime();
  const sines = [];
  for (let t = start; t < start + DAY_MS; t += step) {
    sines.push(Math.max(0, Math.sin(sunHeight(place.lat, place.lon, new Date(t + step / 2)) * Math.PI / 180)));
  }
  const area = sines.reduce((a, b) => a + b, 0) * hours;
  if (!(generated > 0) || !area) return 24;
  const scale = generated * 1000 / area;
  const dark = CLEARNESS.map(q => sines.filter(v => scale * q * v < DARK_SOLAR_W).length * hours);
  return dark.reduce((a, b) => a + b, 0) / dark.length;
}

const MODEL_MIN_NIGHTS = 15; // nights a month needs to fit the model on
const MODEL_MAX_ERROR = 0.5; // a model further off than this on the known months is not used

// Nights for the months of the last year without readings, from Homey Energy's month totals:
// the surplus of a day is that month's export per day (measured), the use while dark is the
// use per day × the share of it that falls in the dark, which follows the dark hours (from the
// sun and that month's solar yield) along a line fitted on the months that do have nights. Every modelled night carries `modelled: true` and no peak.
// `monthReports` maps YYYY-MM to monthTotals(). Returns { nights, fit } (fit null without
// enough months to fit on).
function modelNights(nights, monthReports, { place, now = new Date() } = {}) {
  if (!place) return { nights: {}, fit: null };
  const valid = Object.entries(nights || {}).filter(([, n]) => n && !n.skipped && !n.missing && typeof n.dark === 'number' && !n.modelled);
  // The factor per month with enough nights: average dark use / (use per day × dark share)
  const fits = [];
  const byMonth = new Map();
  for (const [date, n] of valid) {
    const key = date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(n);
  }
  for (const [key, list] of byMonth) {
    const totals = monthReports[key];
    if (!totals || list.length < MODEL_MIN_NIGHTS) continue;
    const days = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
    const perDay = totals.consumed / days;
    const dark = list.reduce((s, n) => s + n.dark, 0) / list.length;
    // The dark hours by the same model as for the months to fill, so the factor matches it
    const hours = modelDarkHours(`${key}-15`, place, (totals.generated || 0) / days);
    if (perDay > 0 && hours > 0) fits.push({ month: key, share: dark / perDay, dark, perDay, hours });
  }
  if (!fits.length) return { nights: {}, fit: null };
  // The share of a day's use that falls in the dark, against the dark hours: a straight line,
  // because the longer nights of winter take in the evening peak (a ratio when the months are
  // too alike to draw a line through)
  const line = list => {
    const n = list.length;
    const mx = list.reduce((s, f) => s + f.hours, 0) / n;
    const my = list.reduce((s, f) => s + f.share, 0) / n;
    const sxx = list.reduce((s, f) => s + (f.hours - mx) ** 2, 0);
    const sxy = list.reduce((s, f) => s + (f.hours - mx) * (f.share - my), 0);
    if (n < 3 || sxx < 4) {
      const ratio = list.reduce((s, f) => s + f.share / f.hours, 0) / n;
      return hours => ratio * hours;
    }
    const slope = sxy / sxx;
    return hours => Math.min(1, Math.max(0, my + slope * (hours - mx)));
  };
  const shareAt = line(fits);
  // How far off the model is on the months it was fitted on, each left out in turn
  const errors = fits.length > 1 ? fits.map(f => Math.abs(line(fits.filter(g => g !== f))(f.hours) * f.perDay - f.dark) / f.dark) : [];
  const error = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
  const points = fits.map(f => ({ month: f.month, perDay: round(f.perDay, 2), dark: round(f.dark, 2), hours: round(f.hours, 1) }));
  // Months to model whose totals Homey Energy does not have (before the meter was there)
  const wanted = monthsToModel(nights, now);
  const missingTotals = wanted.filter(key => !monthReports[key]);
  if (error !== null && error > MODEL_MAX_ERROR) {
    return { nights: {}, fit: { months: fits.map(f => f.month), error, modelled: [], rejected: true, missingTotals, points } };
  }

  // The shape of the use over the power bands, from the real nights, for the power advice
  const shape = new Array(NIGHT_BINS).fill(0);
  for (const [, n] of valid) (n.bins || []).forEach((v, i) => { shape[i] += v; });
  const shapeTotal = shape.reduce((a, b) => a + b, 0);

  const out = {};
  const modelled = [];
  for (const key of wanted) {
    const totals = monthReports[key];
    if (!totals) continue;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const days = new Date(year, month, 0).getDate();
    const perDay = totals.consumed / days;
    const surplus = Math.max(0, totals.exported / days);
    for (let d = 1; d <= days; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`;
      const known = nights[date];
      if (known && !known.missing && !known.skipped) continue;
      const hours = modelDarkHours(date, place, (totals.generated || 0) / days);
      const dark = shareAt(hours) * perDay;
      out[date] = {
        dark: round(dark, 3),
        hours: round(hours, 2),
        peak: null,
        bins: shapeTotal ? shape.map(v => round(v / shapeTotal * dark, 3)) : [],
        surplus: round(surplus, 3),
        step: null,
        modelled: true,
      };
    }
    modelled.push(key);
  }
  return { nights: out, fit: { months: fits.map(f => f.month), error, modelled, missingTotals, points } };
}

// The battery size block in three views, so the screen can leave estimates out: `measured`
// (nights Homey measured), `export` (plus nights from an imported meter export, dark by the
// sun) and `model` (plus modelled nights for months without readings, from Homey Energy's
// month totals). A view that adds nothing to the one before it is null.
function batteryViews(log, imported, monthReports, { place = null, now = new Date() } = {}) {
  const measured = batteryAdvice(log, now);
  const merged = mergeNights(log, imported || {});
  const withExport = imported && Object.keys(imported).length ? batteryAdvice(merged.nights, now) : null;
  const base = pruneNights(merged.nights, now);
  const { nights: modelled, fit } = modelNights(base, monthReports || {}, { place, now });
  const withModel = Object.keys(modelled).length ? batteryAdvice({ ...base, ...modelled }, now) : null;
  return { views: { measured, export: withExport, model: withModel }, check: merged.check, fit };
}

// The months (YYYY-MM) of the last year whose Homey Energy totals the model may need: the
// completed ones; a month's totals do not change once it is over
function lastYearMonths(now = new Date()) {
  const out = [];
  for (let k = 12; k >= 1; k--) out.push(localDate(new Date(now.getFullYear(), now.getMonth() - k, 1)).slice(0, 7));
  return out;
}

// ---------- Yearly bill ----------

const COST_FIELDS = ['costImport', 'costExport', 'costGas', 'costWater', 'costFixed'];
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

// The start of the settlement year that runs at `now`: the day and month of `startDate`
// (YYYY-MM-DD, the date on the last yearly bill), or 1 January without one
function billYearStart(startDate, now = new Date()) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(startDate || '');
  const month = m ? Number(m[1]) - 1 : 0;
  const day = m ? Number(m[2]) : 1;
  const start = new Date(now.getFullYear(), month, day);
  return start > now ? new Date(now.getFullYear() - 1, month, day) : start;
}

// What the settlement year will cost against the advance payments. Months that were measured
// count as measured (a month is spread evenly over its days where the year starts or ends in it);
// the rest of the year is estimated from the same month a year earlier, or else from the measured
// months (gas per degree day, with the weather of that month or of it a year earlier).
// `rows` are month rows with costs and degree days (the year and last year, light).
// A month counts as measured when its meters moved: before a P1 meter was there, a month only
// has the fixed costs. The amounts follow the contract in the settings, also for last year.
// `current`: the meter readings now ({ import, export, gas }), for the readings at the start.
// Net metering: estimates from months that were netted lose it from 1 January 2027 (their export
// then earns the compensation), and export beyond the import up to that date was never netted.
function billForecast(rows, contract, now = new Date(), current = null) {
  const bonus = typeof contract.bonus === 'number' ? contract.bonus : 0;
  const out = { advance: contract.advance, contractEnd: contract.end, daysLeft: null, bonus: bonus || null };
  if (contract.end) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    out.daysLeft = Math.round((new Date(`${contract.end}T00:00:00`) - today) / DAY_MS);
  }
  const months = new Map();
  // Degree days per day of each month that has passed, from the weather: also for months before
  // the meter was there, so gas can be estimated for a cold month that was never measured
  const weather = new Map();
  for (const row of rows || []) {
    const from = new Date(row.start);
    const key = localDate(from).slice(0, 7);
    const monthDays = (addMonths(from, 1) - from) / DAY_MS;
    if (addMonths(from, 1) <= now && row.degreeDays > 0) weather.set(key, row.degreeDays / monthDays);
    const costs = COST_FIELDS.map(f => row[f]).filter(v => typeof v === 'number');
    const measured = (row.import || 0) + (row.export || 0) + (row.gas || 0) > 0;
    const to = Math.min(addMonths(from, 1).getTime(), now.getTime());
    if (!costs.length || !measured || to <= from.getTime()) continue;
    const cost = costs.reduce((a, b) => a + b, 0);
    months.set(key, {
      cost,
      days: (to - from) / DAY_MS,
      full: to === addMonths(from, 1).getTime(),
      gas: row.gas || 0,
      gasCost: row.costGas || 0,
      degreeDays: row.degreeDays || 0,
      // Electricity and water: what is left without gas and the fixed costs
      other: cost - (row.costGas || 0) - (row.costFixed || 0),
      import: row.import || 0,
      export: row.export || 0,
      importCost: row.costImport || 0,
      exportCost: row.costExport || 0,
      waterCost: row.costWater || 0,
      nettingValue: row.nettingValue || 0,
      month: from.getMonth(),
      start: from.getTime(),
    });
  }
  const full = [...months.values()].filter(m => m.full);
  const usable = full.length ? full : [...months.values()];
  if (!usable.length) return { ...out, total: null };
  const sumOf = (list, key) => list.reduce((sum, m) => sum + m[key], 0);
  const usableDays = sumOf(usable, 'days');

  // A month without the same month a year earlier: electricity and water at the average day,
  // the fixed costs of the contract, and gas from the measured months as a base per day (hot water,
  // cooking) plus an amount per degree day (heating), fitted on the measured months
  const fixedPerDay = contract.monthly === null && contract.taxReduction === null
    ? 0 : ((contract.monthly || 0) * 12 - (contract.taxReduction || 0)) / 365;
  const otherPerDay = sumOf(usable, 'other') / usableDays;
  const gasMonths = usable.filter(m => m.gas > 0 && m.degreeDays > 0);
  const gasPrice = sumOf(usable, 'gas') > 0 ? sumOf(usable, 'gasCost') / sumOf(usable, 'gas') : null;
  let gasModel = null;
  if (gasMonths.length >= 2 && gasPrice !== null) {
    const xs = gasMonths.map(m => m.degreeDays / m.days);
    const ys = gasMonths.map(m => m.gas / m.days);
    const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
    const [mx, my] = [mean(xs), mean(ys)];
    const spread = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    let perDegreeDay = spread > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / spread : 0;
    let base = my - perDegreeDay * mx;
    // Too few or too similar months for a line: the lowest month is the base, the rest heating
    if (!(perDegreeDay > 0) || base < 0) {
      base = Math.min(...ys);
      perDegreeDay = Math.max(0, (sumOf(gasMonths, 'gas') - base * sumOf(gasMonths, 'days')) / sumOf(gasMonths, 'degreeDays'));
    }
    gasModel = { base, perDegreeDay, price: gasPrice };
  }
  const gasPerDay = sumOf(usable, 'gasCost') / usableDays;
  const degreeDaysOf = key => weather.get(key) ?? weather.get(localDate(addMonths(new Date(`${key}-01T12:00:00`), -12)).slice(0, 7));

  // With the use of the previous yearly bill: what the months that were not measured used
  // together is that use minus the same calendar months measured in the last year. Electricity
  // is spread over those months by days, gas by the base per day plus degree days.
  const previous = contract.previous || {};
  const known = new Map();
  for (const m of full) if (now - m.start < 366 * DAY_MS && !(known.get(m.month)?.start > m.start)) known.set(m.month, m);
  const unknown = [...Array(12).keys()].filter(c => !known.has(c));
  const daysOf = c => new Date(now.getFullYear(), c + 1, 0).getDate();
  const unknownDays = unknown.reduce((s, c) => s + daysOf(c), 0);
  const knownList = [...known.values()];
  let fromPrevious = null;
  if (unknownDays > 0 && ['import', 'export', 'gas'].some(k => typeof previous[k] === 'number')) {
    const rest = key => (typeof previous[key] === 'number' ? Math.max(0, previous[key] - sumOf(knownList, key)) : null);
    const price = (cost, amount) => (sumOf(usable, amount) > 0 ? sumOf(usable, cost) / sumOf(usable, amount) : null);
    // Degree days per day of a calendar month: the last time it was passed
    const calendarDegreeDays = c => {
      for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
        const value = weather.get(`${y}-${String(c + 1).padStart(2, '0')}`);
        if (typeof value === 'number') return value;
      }
      return null;
    };
    const gasRest = rest('gas');
    let gasShape = null;
    if (gasRest !== null && unknown.every(c => calendarDegreeDays(c) !== null)) {
      const base = Math.min(gasModel?.base ?? 0, gasRest / unknownDays);
      const degreeDays = unknown.reduce((s, c) => s + calendarDegreeDays(c) * daysOf(c), 0);
      gasShape = { base, perDegreeDay: degreeDays > 0 ? (gasRest - base * unknownDays) / degreeDays : 0 };
    } else if (gasRest !== null) {
      gasShape = { base: gasRest / unknownDays, perDegreeDay: 0 };
    }
    fromPrevious = {
      importPerDay: rest('import') === null ? null : rest('import') / unknownDays,
      exportPerDay: rest('export') === null ? null : rest('export') / unknownDays,
      importPrice: price('importCost', 'import'),
      exportPrice: price('exportCost', 'export'),
      gasShape,
      calendarDegreeDays,
    };
  }

  // kWh per day in a modelled month, and the share of it that was priced with net metering
  const modelKWh = {
    import: fromPrevious?.importPerDay ?? sumOf(usable, 'import') / usableDays,
    export: fromPrevious?.exportPerDay ?? sumOf(usable, 'export') / usableDays,
    netted: sumOf(usable, 'export') > 0
      ? sumOf(usable.filter(m => m.start < NETTING_END), 'export') / sumOf(usable, 'export') : 0,
  };

  const modelRate = key => {
    const degreeDays = degreeDaysOf(key);
    const p = fromPrevious;
    const electricity = p && p.importPerDay !== null && p.exportPerDay !== null && p.importPrice !== null && p.exportPrice !== null
      ? p.importPerDay * p.importPrice + p.exportPerDay * p.exportPrice + sumOf(usable, 'waterCost') / usableDays
      : otherPerDay;
    let gas = gasPerDay;
    if (p?.gasShape && gasPrice !== null) {
      const dd = p.calendarDegreeDays(Number(key.slice(5)) - 1) ?? degreeDays ?? 0;
      gas = (p.gasShape.base + p.gasShape.perDegreeDay * dd) * gasPrice;
    } else if (gasModel && typeof degreeDays === 'number') {
      gas = (gasModel.base + gasModel.perDegreeDay * degreeDays) * gasModel.price;
    }
    return electricity + fixedPerDay + gas;
  };

  const start = billYearStart(contract.billStart, now);
  const end = addMonths(start, 12);
  const list = [];
  let modelled = false;
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m < end; m = addMonths(m, 1)) {
    const next = addMonths(m, 1);
    const from = Math.max(m.getTime(), start.getTime());
    const to = Math.min(next.getTime(), end.getTime());
    const key = localDate(m).slice(0, 7);
    const own = months.get(key);
    // The part of the month that has passed, as measured
    const passedTo = Math.min(to, now.getTime());
    let actual = null;
    if (own && passedTo > from) actual = own.cost * (passedTo - from) / DAY_MS / own.days;
    // The rest at the rate of the same month a year earlier, or estimated as above
    const restFrom = actual === null ? from : Math.max(from, now.getTime());
    const restDays = Math.max(0, to - restFrom) / DAY_MS;
    let estimate = null;
    let rate = 0;
    // Days of the rest that have passed already: not measured month by month
    const pastDays = Math.max(0, Math.min(to, now.getTime()) - restFrom) / DAY_MS;
    const share = own && actual !== null ? (passedTo - from) / DAY_MS / own.days : 0;
    // kWh of the month, measured and estimated, and of the estimate the export that was netted
    const kWh = { import: own ? own.import * share : 0, export: own ? own.export * share : 0, nettedExport: 0 };
    if (restDays > 0) {
      const before = months.get(localDate(addMonths(m, -12)).slice(0, 7));
      rate = before?.full ? before.cost / before.days : modelRate(key);
      if (!before?.full) modelled = true;
      estimate = rate * restDays;
      const perDay = before?.full
        ? { import: before.import / before.days, export: before.export / before.days, netted: before.start < NETTING_END ? 1 : 0 }
        : modelKWh;
      kWh.import += perDay.import * restDays;
      kWh.export += perDay.export * restDays;
      kWh.nettedExport = perDay.export * perDay.netted * restDays;
    }
    list.push({ month: key, actual, estimate, pastDays, rate, share, own, kWh, from });
  }

  // With the meter readings at the start of the settlement year, the days that passed without
  // readings per month are known as a whole: the meters now minus the start, minus what the
  // measured months used. That use counts as measured, priced at the average of the measured
  // months; gas is spread over those days by degree days like above.
  const startReadings = contract.startReadings || {};
  const pastTotal = list.reduce((s, m) => s + m.pastDays, 0);
  let fromReadings = false;
  if (current && pastTotal > 0 && ['import', 'export', 'gas'].some(k => typeof startReadings[k] === 'number' && typeof current[k] === 'number')) {
    const since = key => (typeof startReadings[key] === 'number' && typeof current[key] === 'number' && current[key] >= startReadings[key]
      ? Math.max(0, current[key] - startReadings[key] - list.reduce((s, m) => s + (m.own ? m.own[key] * m.share : 0), 0))
      : null);
    const price = (cost, amount) => (sumOf(usable, amount) > 0 ? sumOf(usable, cost) / sumOf(usable, amount) : 0);
    const imported = since('import');
    const exported = since('export');
    const gas = since('gas');
    if (imported !== null && exported !== null) {
      const perDay = (imported * price('importCost', 'import') + exported * price('exportCost', 'export')) / pastTotal
        + sumOf(usable, 'waterCost') / usableDays + fixedPerDay;
      const gasDays = list.filter(m => m.pastDays > 0).map(m => ({ m, dd: degreeDaysOf(m.month) ?? 0 }));
      const weight = gasDays.reduce((s, x) => s + (0.5 + x.dd) * x.m.pastDays, 0);
      for (const { m, dd } of gasDays) {
        // Without a gas reading, the model of above; a base of half a degree day keeps summer days in
        const gasCost = gas !== null && gasPrice !== null && weight > 0
          ? gas * (0.5 + dd) * m.pastDays / weight * gasPrice
          : (m.rate - otherPerDay - fixedPerDay) * m.pastDays;
        const known = perDay * m.pastDays + gasCost;
        m.actual = (m.actual || 0) + known;
        m.estimate = m.estimate === null ? null : Math.max(0, m.estimate - m.rate * m.pastDays) || null;
      }
      fromReadings = true;
    }
  }
  // Net metering. What it was worth per exported kWh in the measured months: the netted price
  // minus the compensation without it.
  let nettingAfter = 0;
  let nettingSurplus = 0;
  const usableExport = sumOf(usable, 'export');
  const nettingPerKWh = usableExport > 0 ? sumOf(usable, 'nettingValue') / usableExport : 0;
  if (contract.electricity?.netting !== false && nettingPerKWh > 0) {
    for (const m of list) {
      // An estimate for a month from 2027 that came from a netted month: its export earns the compensation
      if (m.from >= NETTING_END && m.kWh.nettedExport > 0) {
        const extra = m.kWh.nettedExport * nettingPerKWh;
        m.estimate = (m.estimate || 0) + extra;
        nettingAfter += extra;
      }
    }
    // Export beyond the import of the netted part of the year was never netted
    const before = list.filter(m => m.from < NETTING_END);
    const surplus = before.reduce((s, m) => s + m.kWh.export - m.kWh.import, 0);
    if (surplus > 0) nettingSurplus = surplus * nettingPerKWh;
  }

  // The days that passed but are still an estimate, for "so far"
  const pastEstimate = fromReadings ? 0 : list.reduce((s, m) => s + m.rate * m.pastDays, 0);
  for (const m of list) { delete m.pastDays; delete m.rate; delete m.share; delete m.own; delete m.kWh; delete m.from; }
  const sum = key => list.reduce((s, m) => s + (m[key] || 0), 0);
  const total = sum('actual') + sum('estimate') + nettingSurplus;
  let payments = 0;
  while (payments < 12 && addMonths(start, payments) <= now) payments++;
  return {
    ...out,
    start: localDate(start),
    end: localDate(new Date(end.getTime() - DAY_MS)),
    months: list,
    spent: sum('actual'),
    // Up to now including the days that passed without readings (estimated unless the meter
    // readings at the start are known)
    sofar: sum('actual') + pastEstimate,
    sofarEstimated: pastEstimate > 0,
    fromReadings,
    total,
    // 'model': a month without the same month a year earlier was estimated as above
    // 'previous': with the use of the previous yearly bill
    basis: !modelled ? 'lastYear' : fromPrevious ? 'previous' : 'model',
    // What the end of net metering adds to the estimate, and export beyond import never netted
    nettingAfter: nettingAfter || null,
    nettingSurplus: nettingSurplus || null,
    gasModel,
    measuredMonths: months.size,
    paid: typeof contract.advance === 'number' ? contract.advance * payments : null,
    payments,
    advanceTotal: typeof contract.advance === 'number' ? contract.advance * 12 : null,
    // Positive: to pay at the yearly bill; negative: to get back (a welcome bonus is paid out with it)
    difference: typeof contract.advance === 'number' ? total - bonus - contract.advance * 12 : null,
  };
}

// ---------- Heat map ----------

const HEAT_DAYS = 28;
const HEAT_RETRY = 6 * 3600 * 1000;
// A new version reads the day reports again (2: no solar while the sun is down)
const HEAT_VERSION = 2;

// Import, export and solar in kWh for each hour of a day, from a Homey Energy day report; null
// without a usable report (no report, or curves that do not add up to its totals)
function hoursFromReport(report, found, date, place = null) {
  const series = reportSeries(report, found, place);
  if (!series || series.mismatch || !series.grid.length) return null;
  const hours = () => new Array(24).fill(0);
  const out = { imp: hours(), exp: hours(), sol: hours() };
  const add = (entries, put) => {
    const step = typicalStep(entries) || 5 * 60 * 1000;
    for (const e of entries) if (localDate(e.t) === date) put(e.t.getHours(), e.v * step / 3.6e9);
  };
  add(series.grid, (h, kWh) => { if (kWh > 0) out.imp[h] += kWh; else out.exp[h] -= kWh; });
  add(series.solar, (h, kWh) => { out.sol[h] += Math.max(0, kWh); });
  for (const key of ['imp', 'exp', 'sol']) out[key] = out[key].map(v => round(v, 3));
  return out;
}

// The dates of the heat map: the last 28 days up to today, oldest first
function heatDates(now = new Date()) {
  const dates = [];
  for (let i = HEAT_DAYS - 1; i >= 0; i--) dates.push(localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  return dates;
}

// The completed days of the heat map the log does not hold yet. A day without a report is asked
// again after a while only in the first days after it (Homey Energy can add it late).
function heatDue(log = {}, now = new Date()) {
  const recent = localDate(new Date(now.getTime() - 3 * DAY_MS));
  return heatDates(now).slice(0, -1).filter(date => {
    const day = log[date];
    if (!day) return true;
    return Boolean(day.missing && date >= recent && now.getTime() - (day.at || 0) > HEAT_RETRY);
  });
}

// The import, export (kWh) and gas (m³) counters of the P1 meter now, as on the yearly bill
function meterTotals(p1) {
  if (!p1) return null;
  const total = caps => (caps.length && caps.every(c => typeof amount(p1, c) === 'number')
    ? caps.reduce((s, c) => s + amount(p1, c), 0) : null);
  return { import: total(meterCapabilities(p1, 'import')), export: total(meterCapabilities(p1, 'export')), gas: amount(p1, 'meter_gas') };
}

// Reads the due days from Homey Energy's day reports, one at a time. A day without a usable
// report comes from `meterDay(date)` when that gives its hours (yesterday's history per hour, from
// the meter readings), so yesterday is not lost to a report Homey Energy got wrong (forum NL #115).
// A missing day keeps why: 'none' (no report), 'mismatch' (curves not adding up to its totals)
// or 'nosolar' (no solar curve while there are panels).
async function collectHeat(dayReport, found, dates, now = new Date(), { place = null, meterDay = null } = {}) {
  const out = {};
  for (const date of dates) {
    const report = await dayReport(date).catch(() => null);
    const hours = hoursFromReport(report, found, date, place);
    const meters = hours ? null : hoursFromRows(meterDay ? await meterDay(date).catch(() => null) : null);
    const series = hours || meters ? null : reportSeries(report, found);
    const why = !series ? 'none' : series.mismatch ? 'mismatch' : 'nosolar';
    out[date] = hours || meters || { missing: true, at: now.getTime(), why };
  }
  return out;
}

// Import, export and solar per hour from the 24 history rows of a day, or null
function hoursFromRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 24) return null;
  const pick = key => rows.map(r => round(Math.max(0, r[key] || 0), 3));
  return { imp: pick('import'), exp: pick('export'), sol: pick('solar'), meters: true };
}

// The log without days that have left the heat map
function pruneHeat(log = {}, now = new Date()) {
  const from = heatDates(now)[0];
  return Object.fromEntries(Object.entries(log).filter(([date]) => date >= from));
}

// The days for the heat map block: the log, and today from today's history (per hour)
function heatmapDays(log = {}, today = null, now = new Date()) {
  const dates = heatDates(now);
  const days = dates.map(date => {
    const day = log[date];
    return day && day.imp ? { date, imp: day.imp, exp: day.exp, sol: day.sol } : { date, missing: true };
  });
  const rows = today?.bucket === 'hour' ? today.rows : null;
  if (rows && rows.length === 24) {
    const hour = now.getHours();
    const pick = key => rows.map((r, h) => (h <= hour ? round(r[key] || 0, 3) : null));
    days[days.length - 1] = { date: dates[dates.length - 1], imp: pick('import'), exp: pick('export'), sol: pick('solar'), today: true };
  }
  return days;
}

module.exports = {
  billYearStart,
  billForecast,
  meterTotals,
  connectionPhases,
  hoursFromReport,
  heatDates,
  heatDue,
  collectHeat,
  HEAT_VERSION,
  pruneHeat,
  heatmapDays,
  localDate,
  batteryViews,
  lastYearMonths,
  monthTotals,
  monthsToModel,
  modelNights,
  importMeterExport,
  UploadParts,
  connectionMaxW,
  parseMeterCsv,
  darkSunHeight,
  nightsFromMeterRows,
  mergeNights,
  meterCapabilities,
  reportSeries,
  nightRecords,
  collectNights,
  pruneNights,
  batteryAdvice,
  nightSource,
  lastNight,
  isCopy,
  isExcluded,
  isLeftOut,
  consumerStatus,
  degreeDayBuckets,
  PERIODS,
  PREVIOUS,
  comparableTotals,
  buildBaseload,
  buildMeters,
  BLOCKS,
  SIZES,
  discover,
  defaultLayout,
  resolveLayout,
  blockCatalog,
  savedGroups,
  buildGroups,
  groupExtras,
  hasUsageEstimate,
  buildPhases,
  todayTotals,
  validateLayout,
  layoutName,
  savedLayout,
  shownBlocks,
  PinGuard,
  allocateFlows,
  addMeterDeltas,
  meterStretches,
  batteryEarnings,
  liveTotals,
  buildSankey,
  buildZoneFlow,
  consumptionDevices,
  isGridMeter,
  estimatedDevices,
  reportRequest,
  batteryPowerEntries,
  batteryPower,
  batteryDirection,
  gridPower,
  buildLive,
  timelineDay,
  recordTimeline,
  buildLiveAt,
  totalsUntil,
  POWER_STEP,
  buildHistory,
  nettingSummary,
  expectedSolar,
  historyCsv,
  buildPowerCurve,
  makeBuckets,
  periodStart,
  periodEnd,
  summarize,
  totalsOf,
  showerMinutes,
  layeredShowerMinutes,
  tankReading,
  showerSample,
  measuredFlow,
  recordTapwater,
  withoutShower,
  tankSensors,
  buildBoiler,
  boilerStatus,
  assumptions,
};
