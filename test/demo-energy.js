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

function demoEnergyDevices(lang, date = new Date()) {
  const N = NAMES[lang] || NAMES.en;
  const solarW = sunWatts(date);
  const houseW = 420;
  const carW = 3700;
  const heatW = 650;
  const aircoW = 0;
  const use = houseW + carW + heatW + aircoW;
  // The battery takes what the sun has left over, up to 2.4 kW, and helps out when the sun is short.
  const spare = solarW - use;
  const batteryW = Math.max(-2400, Math.min(2400, spare));
  const gridW = use + batteryW - solarW;
  return [
    dev('e_p1', N.p1, 'sensor', {
      measure_power: gridW, 'meter_power.consumed.t1': 3211.4, 'meter_power.consumed.t2': 2984.7,
      'meter_power.produced.t1': 812.2, 'meter_power.produced.t2': 1630.9, meter_gas: 512.3,
    }, { energyObj: { cumulative: true } }),
    dev('e_solar', N.solar, 'solarpanel', { measure_power: solarW, meter_power: 4210.5 }),
    dev('e_battery', N.battery, 'battery', { measure_power: batteryW, measure_battery: 64 }, { energyObj: { homeBattery: true } }),
    dev('e_charger', N.charger, 'evcharger', { measure_power: carW, evcharger_charging: true, evcharger_charging_state: 'plugged_in_charging', 'meter_power.current_session': 8.6 }),
    dev('e_car', N.car, 'car', { measure_battery: 58 }),
    dev('e_heatpump', N.heatpump, 'heatpump', { measure_power: heatW, measure_temperature: 46, onoff: true }),
    dev('e_airco', N.airco, 'airconditioning', { onoff: false, measure_power: aircoW, measure_temperature: 19.5, target_temperature: 20 }),
  ];
}

module.exports = { demoEnergyDevices, sunWatts };
