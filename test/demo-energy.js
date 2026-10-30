'use strict';

// The energy devices of the demo house, as Homey's Web API gives them (slim): a smart meter, solar panels,
// a home battery, a charger with a car, a heat pump and an air conditioner. The time of day moves the sun.
const dev = (id, name, cls, caps, extra) => Object.assign({
  id,
  name,
  class: cls,
  zone: 'z_outside',
  available: true,
  capabilities: Object.keys(caps),
  capabilitiesObj: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v }])),
  energyObj: null,
  flags: [],
}, extra || {});

const NAMES = {
  nl: { p1: 'Slimme meter', solar: 'Zonnepanelen', battery: 'Thuisaccu', charger: 'Laadpaal', car: 'Auto', heatpump: 'Warmtepomp', airco: 'Airco slaapkamer' },
  en: { p1: 'Smart meter', solar: 'Solar panels', battery: 'Home battery', charger: 'EV charger', car: 'Car', heatpump: 'Heat pump', airco: 'Bedroom air conditioner' },
};

// Sun power of a sunny autumn day for a 4.4 kWp roof, by the hour of the day.
function sunWatts(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  const s = Math.sin(((h - 7.5) / 10) * Math.PI);
  return s > 0 ? Math.round(3600 * s * s) : 0;
}

// The house through the day: the car charges around midday, the heat pump works mornings and evenings.
function demoState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  const solarW = sunWatts(date);
  const houseW = h < 7 ? 260 : h < 9 || (h >= 17 && h < 22) ? 640 : 380;
  const carW = h >= 11 && h < 15 ? 3700 : 0;
  const heatW = (h >= 6 && h < 9) || (h >= 17 && h < 23) ? 650 : 220;
  const use = houseW + carW + heatW;
  // The battery takes what the sun has left over, up to 2.4 kW, and helps the house (not the car) when the sun is short
  let batteryW = Math.max(-2400, Math.min(2400, solarW - use + (solarW < use ? carW : 0)));
  const soc = socBefore(date);
  if ((batteryW < 0 && soc <= 10) || (batteryW > 0 && soc >= 100)) batteryW = 0;
  return { solarW, carW, heatW, batteryW, gridW: use + batteryW - solarW, soc };
}

// The charge of a 10 kWh battery that starts the day at 55%, from its power since midnight
const socCache = new Map();
function socBefore(date) {
  const from = new Date(date); from.setHours(0, 0, 0, 0);
  const steps = Math.floor((date - from) / 900000);
  const key = `${from.getTime()}|${steps}`;
  if (socCache.has(key)) return socCache.get(key);
  const soc = steps <= 0 ? 55 : (() => {
    const prev = new Date(from.getTime() + (steps - 1) * 900000);
    const st = demoState(prev);
    return Math.max(10, Math.min(100, st.soc + (st.batteryW / 4000 / 10) * 100));
  })();
  socCache.set(key, soc);
  return soc;
}

function demoEnergyDevices(lang, date = new Date()) {
  const N = NAMES[lang] || NAMES.en;
  const { solarW, carW, heatW, batteryW, gridW, soc } = demoState(date);
  const charging = carW > 0;
  return [
    dev('e_p1', N.p1, 'sensor', {
      measure_power: gridW, 'meter_power.consumed.t1': 3211.4, 'meter_power.consumed.t2': 2984.7,
      'meter_power.produced.t1': 812.2, 'meter_power.produced.t2': 1630.9, meter_gas: 512.3,
    }, { energyObj: { cumulative: true } }),
    dev('e_solar', N.solar, 'solarpanel', { measure_power: solarW, meter_power: 4210.5 }),
    dev('e_battery', N.battery, 'battery', { measure_power: batteryW, measure_battery: Math.round(soc) }, { energyObj: { homeBattery: true } }),
    dev('e_charger', N.charger, 'evcharger', { measure_power: carW, evcharger_charging: charging, evcharger_charging_state: charging ? 'plugged_in_charging' : 'plugged_in', 'meter_power.current_session': 8.6 }),
    dev('e_car', N.car, 'car', { measure_battery: 58 }),
    dev('e_heatpump', N.heatpump, 'heatpump', { measure_power: heatW, measure_temperature: 46, onoff: true }),
    dev('e_airco', N.airco, 'airconditioning', { onoff: false, measure_power: 0, measure_temperature: 19.5, target_temperature: 20 }),
  ];
}

const dayKey = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

/**
 * What GET /api/energy/<kind> answers for the demo house: today's power every 15 minutes up to `now`,
 * the battery's charge level, and for the sun a forecast of today and tomorrow.
 */
function demoDetail(kind, now = new Date()) {
  const STEP = 15 * 60000;
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const pick = { solar: 'solarW', battery: 'batteryW', grid: 'gridW', car: 'carW', heatpump: 'heatW' }[kind];
  const out = { kind, from: from.getTime(), now: now.getTime(), curve: [] };
  let pos = 0; let neg = 0;
  if (kind === 'battery') out.soc = [];
  if (kind === 'grid') Object.assign(out, { cost: 2.84, price: 0.27, currency: 'EUR', cheapest: { start: new Date(from.getTime() + 13 * 3600000).toISOString(), hours: 3, avg: 0.19 } });
  for (let t = from.getTime(); t <= now.getTime(); t += STEP) {
    const st = demoState(new Date(t));
    const w = pick ? st[pick] : 0;
    out.curve.push({ t, w: Math.round(w) });
    if (w > 0) pos += w / 4000; else neg -= w / 4000;
    if (kind === 'battery') out.soc.push({ t, w: Math.round(st.soc) });
  }
  const r = (v) => Math.round(v * 100) / 100;
  if (kind === 'battery') { out.charged = r(pos); out.discharged = r(neg); } else if (kind === 'grid') { out.imported = r(pos); out.exported = r(neg); } else out.kWh = r(pos);
  if (kind === 'solar') {
    const watts = []; const days = {};
    for (let d = 0; d < 2; d++) {
      const day = new Date(from); day.setDate(day.getDate() + d);
      let kWh = 0;
      for (let t = day.getTime(); t < day.getTime() + 86400000; t += STEP) {
        // a little more than the panels make today, a cloudier day tomorrow
        const w = Math.round(sunWatts(new Date(t)) * (d ? 0.62 : 1.06));
        watts.push({ t, w });
        kWh += w / 4000;
      }
      days[dayKey(day)] = r(kWh);
    }
    out.forecast = { source: 'forecast.solar', days, watts };
  }
  return out;
}

module.exports = { demoEnergyDevices, demoDetail, sunWatts };
