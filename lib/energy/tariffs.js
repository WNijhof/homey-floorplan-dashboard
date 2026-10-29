// Copied from Energy Dashboard (lib/tariffs.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

const { priceLookup } = require('./prices');

// What energy costs the user: a fixed contract (normal and off-peak rate) or a dynamic one
// (market price per hour plus energy tax and the supplier's markup), gas and water prices,
// and the fixed costs per month minus the yearly energy tax reduction. All amounts include VAT.

// Dutch energy tax 2026, incl. VAT (first bracket); users can change it in the settings
const ENERGY_TAX = { electricity: 0.11085, gas: 0.72680 };
const TAX_REDUCTION = 628.96;
// Net metering ends in the Netherlands on 1 January 2027
const NETTING_END = new Date(2027, 0, 1).getTime();

// Starting values for the markup of dynamic suppliers (€/kWh, and €/m³ for gas where known,
// incl. VAT), checked in September 2026. \`confirmed\` says which amounts the supplier publishes
// on its own website; the others come from the comparison of keuze.nl, because the supplier
// only shows them after a postcode check or in its app. Suppliers change these now and then,
// so the settings ask the user to check them on their own contract.
const SUPPLIERS = [
  { id: 'anwb', name: 'ANWB Energie', markup: 0.0180, gasMarkup: 0.0768, confirmed: { markup: true, gasMarkup: true } },
  { id: 'budget', name: 'Budget Energie', markup: 0.0168, gasMarkup: 0.0641, confirmed: {} },
  { id: 'easyenergy', name: 'easyEnergy', markup: 0.02178, gasMarkup: 0.0790, confirmed: { markup: true, gasMarkup: true } },
  { id: 'eneco', name: 'Eneco', markup: 0.0314, gasMarkup: 0.0929, confirmed: {} },
  { id: 'energiedirect', name: 'Energiedirect', markup: 0.0169, confirmed: {} },
  { id: 'energiek', name: 'Energiek', markup: 0.0180, gasMarkup: 0.0600, confirmed: {} },
  { id: 'essent', name: 'Essent', markup: 0.0253, gasMarkup: 0.0787, confirmed: {} },
  { id: 'frank', name: 'Frank Energie', markup: 0.0182, gasMarkup: 0.0799, confirmed: { markup: true } },
  { id: 'greenchoice', name: 'Greenchoice', markup: 0.0240, confirmed: {} },
  { id: 'mega', name: 'Mega', markup: 0.0182, gasMarkup: 0.0945, confirmed: {} },
  { id: 'nextenergy', name: 'NextEnergy', markup: 0.0210, gasMarkup: 0.0790, confirmed: { markup: true, gasMarkup: true } },
  { id: 'noord', name: 'Noord Energie', markup: 0.0194, gasMarkup: 0.0666, confirmed: {} },
  { id: 'oxxio', name: 'Oxxio', markup: 0.0224, gasMarkup: 0.0129, confirmed: {} },
  { id: 'powerpeers', name: 'Powerpeers', markup: 0.0100, gasMarkup: 0.0821, confirmed: { markup: true } },
  { id: 'pure', name: 'Pure Energie', markup: 0.0180, gasMarkup: 0.0990, confirmed: {} },
  { id: 'tibber', name: 'Tibber', markup: 0.0180, gasMarkup: 0.08835, confirmed: { markup: true, gasMarkup: true } },
  { id: 'vandebron', name: 'Vandebron', markup: 0.0200, gasMarkup: 0.0598, confirmed: { markup: true } },
  { id: 'vattenfall', name: 'Vattenfall', markup: 0.0255, gasMarkup: 0.0750, confirmed: {} },
  { id: 'zonneplan', name: 'Zonneplan', markup: 0.0200, gasMarkup: 0.0800, confirmed: { markup: true, gasMarkup: true } },
  { id: 'other', name: 'Anders', markup: 0, confirmed: {} },
];

const day = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

// The contract from the settings; older settings with only `tariffs` still work
function contractFrom(cfg = {}) {
  const c = cfg.contract || {};
  const old = cfg.tariffs || {};
  const e = c.electricity || {};
  const g = c.gas || {};
  return {
    electricity: {
      type: e.type === 'dynamic' ? 'dynamic' : 'fixed',
      normal: num(e.normal) ?? num(old.electricityImport),
      low: num(e.low),
      export: num(e.export) ?? num(old.electricityExport),
      // Export compensation once net metering has ended (fixed contracts); empty = the legal
      // minimum until 2030: half of the supply price without energy tax and VAT
      exportAfter: num(e.exportAfter),
      supplier: e.supplier || 'other',
      markup: num(e.markup) ?? 0,
      energyTax: num(e.energyTax) ?? ENERGY_TAX.electricity,
      exportFee: num(e.exportFee) ?? 0,
      // Net metering as the contract does it up to NETTING_END; after that date never
      netting: e.netting ?? true,
      // How a supplier nets a fixed contract with two rates: 'normal' (most suppliers: export is
      // set off against normal-rate import first) or 'counter' (each rate against its own counter)
      nettingOrder: e.nettingOrder === 'counter' ? 'counter' : 'normal',
      lowFrom: num(e.lowFrom) ?? 23,
      lowTo: num(e.lowTo) ?? 7,
      lowWeekend: e.lowWeekend ?? true,
      lowHolidays: e.lowHolidays ?? true,
    },
    gas: {
      // "none": a house without gas (all-electric)
      type: g.type === 'dynamic' || g.type === 'none' ? g.type : 'fixed',
      price: g.type === 'none' ? null : num(g.price) ?? num(old.gas),
      markup: num(g.markup) ?? 0,
      energyTax: num(g.energyTax) ?? ENERGY_TAX.gas,
    },
    water: num(c.water) ?? num(old.water),
    monthly: num(c.monthly),
    taxReduction: num(c.taxReduction) ?? (num(c.monthly) !== null ? TAX_REDUCTION : null),
    // For the yearly bill: the advance paid per month, the date the settlement year starts (the
    // date on the last yearly bill) and the date the contract ends
    advance: num(c.advance),
    // A welcome bonus of the supplier, paid out with the yearly bill
    bonus: num(c.bonus),
    billStart: day(c.billStart),
    end: day(c.end),
    // The use on the previous yearly bill (kWh import and export, m³ gas), for the months the
    // dashboard has not measured yet
    previous: { import: num(c.previous?.import), export: num(c.previous?.export), gas: num(c.previous?.gas) },
    // The meter readings at the start of the settlement year (as on the last yearly bill: normal and
    // off-peak together), so the months before the dashboard measured are known as a whole
    startReadings: { import: num(c.startReadings?.import), export: num(c.startReadings?.export), gas: num(c.startReadings?.gas) },
  };
}

// Easter Sunday of a year (Gregorian calendar, anonymous algorithm), as [month 0-11, day]
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((8 * b + 13) / 25)) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month - 1, ((h + l - 7 * m + 114) % 31) + 1];
}

// The national holidays most Dutch suppliers count as off-peak all day: New Year's Day, Easter
// and Whit Sunday and Monday, King's Day (the 26th when the 27th is a Sunday), Ascension Day and
// Christmas. As 'M-D' keys, kept per year.
const holidayCache = new Map();
function holidays(year) {
  if (!holidayCache.has(year)) {
    const [month, day] = easter(year);
    const after = days => { const d = new Date(year, month, day + days); return `${d.getMonth()}-${d.getDate()}`; };
    const kingsDay = new Date(year, 3, 27).getDay() === 0 ? '3-26' : '3-27';
    holidayCache.set(year, new Set(['0-1', after(0), after(1), kingsDay, after(39), after(49), after(50), '11-25', '11-26']));
  }
  return holidayCache.get(year);
}
const isHoliday = date => holidays(date.getFullYear()).has(`${date.getMonth()}-${date.getDate()}`);

// Off-peak (dal): at night and, by default, the whole weekend and the national holidays
function isLow(time, e) {
  const d = new Date(time);
  const day = d.getDay();
  if (e.lowWeekend && (day === 0 || day === 6)) return true;
  if (e.lowHolidays && isHoliday(d)) return true;
  const h = d.getHours();
  return e.lowFrom > e.lowTo ? h >= e.lowFrom || h < e.lowTo : h >= e.lowFrom && h < e.lowTo;
}

// What a market price (incl. VAT) costs all in
const allInElectricity = (contract, market) => market + contract.electricity.markup + contract.electricity.energyTax;
const allInGas = (contract, market) => market + contract.gas.markup + contract.gas.energyTax;

// The electricity contract to calculate with. The app's own contract comes first; Homey's prices
// fill in where it is left open. With Homey's prices the costs entered in Homey (its formula)
// make the all-in price, also for a dynamic contract in the app. `homey` is what
// PriceService.homeyTariff() returns, or null.
// Homey gives the market price without VAT, EnergyZero with it, and the markup and energy tax in
// the app are Dutch amounts with VAT. Without a formula in Homey (which adds its own VAT), the app
// adds the Dutch VAT to Homey's market price before the contract is applied to it.
const MARKET_VAT = 0.21;

function electricityFor(contract, homey) {
  const e = contract.electricity;
  const vat = homey?.exVat ? MARKET_VAT : 0;
  // The market price as the contract uses it: with VAT
  const market = price => price * (1 + vat);
  const own = price => allInElectricity(contract, market(price));
  if (e.type === 'dynamic') return { ...e, type: 'dynamic', allIn: homey?.allIn || own, market, marketVat: homey?.allIn ? 0 : vat };
  if (e.normal === null && homey?.allIn) return { ...e, type: 'dynamic', allIn: homey.allIn, market: price => price, marketVat: 0 };
  if (e.normal === null && homey?.fixed) return { ...e, normal: homey.fixed, allIn: null, market, marketVat: 0 };
  return { ...e, allIn: null, market, marketVat: 0 };
}

// The function that turns a market price into the all-in price, or null for a fixed contract
const allInFunction = (contract, homey) => electricityFor(contract, homey).allIn;

// Prices per stretch of time for a period; market prices are fetched when the contract needs them.
// Every function returns null when the price is not known, so that cost is left out.
async function tariffFor(contract, priceService, from, till) {
  const homey = priceService?.homeyTariff ? await priceService.homeyTariff().catch(() => null) : null;
  const e = electricityFor(contract, homey);
  const g = contract.gas;
  let power = null;
  let gas = null;
  // Power by the Hour also gives its own export price, with the costs entered there
  let exported = null;
  if (e.type === 'dynamic' && priceService) {
    const list = await priceService.range('electricity', from, till).catch(() => []);
    power = priceLookup(list);
    if (homey?.source === 'powerhour' && e.allIn === homey.allIn) {
      exported = priceLookup(list.filter(p => typeof p.exportPrice === 'number').map(p => ({ t: p.t, end: p.end, price: p.exportPrice })));
    }
  }
  if (g.type === 'dynamic' && priceService) {
    gas = priceLookup(await priceService.range('gas', from, till).catch(() => []));
  }

  const importPrice = (t0, t1) => {
    if (e.type === 'dynamic') {
      const market = power?.between(t0, t1);
      return typeof market === 'number' ? e.allIn(market) : null;
    }
    if (e.normal === null) return null;
    if (e.low === null) return e.normal;
    // A long stretch (a meter that reports rarely) gets the share of off-peak hours in it
    if (t1 - t0 <= 3600000) return isLow(t0, e) ? e.low : e.normal;
    let low = 0;
    let all = 0;
    for (let t = t0; t < t1; t += 3600000) { all++; if (isLow(t, e)) low++; }
    return (e.low * low + e.normal * (all - low)) / all;
  };

  // What export earns without net metering: the market price (dynamic) or the export
  // compensation of the contract, minus the export fee
  const exportNoNetting = (t0, t1) => {
    if (e.type === 'dynamic') {
      if (exported) {
        const own = exported.between(t0, t1);
        if (typeof own === 'number') return own;
      }
      const market = power?.between(t0, t1);
      return typeof market === 'number' ? e.market(market) - e.exportFee : null;
    }
    if (e.exportAfter !== null) return e.exportAfter - e.exportFee;
    if (e.normal === null) return null;
    return Math.max(0, (e.normal - e.energyTax) / 1.21 / 2) - e.exportFee;
  };

  // What a netted kWh is worth: the import price of that moment, or the normal rate when the
  // supplier sets export off against normal-rate import first
  const nettedPrice = (t0, t1) => (e.type === 'fixed' && e.normal !== null && e.low !== null && e.nettingOrder === 'normal'
    ? e.normal : importPrice(t0, t1));

  // Whether export at t0 is netted: until 1 January 2027 when the contract nets
  const nettingAt = t0 => Boolean(e.netting) && t0 < NETTING_END;

  // What export earns: with net metering the netted price (unless a fixed contract states its own
  // compensation), without it the compensation above
  const exportPrice = (t0, t1) => {
    if (!nettingAt(t0)) return exportNoNetting(t0, t1);
    if (e.type === 'fixed' && e.export !== null) return e.export;
    return nettedPrice(t0, t1);
  };

  const gasPrice = (t0, t1) => {
    if (g.type === 'none') return null;
    if (g.type === 'dynamic') {
      const market = gas?.between(t0, t1);
      return typeof market === 'number' ? allInGas(contract, market) : null;
    }
    return g.price;
  };

  const fixedPerDay = contract.monthly === null && contract.taxReduction === null
    ? null
    : ((contract.monthly || 0) * 12 - (contract.taxReduction || 0)) / 365;

  return { importPrice, exportPrice, exportNoNetting, nettedPrice, nettingAt, gasPrice, water: contract.water, fixedPerDay };
}

// The all-in price of dynamic gas now and of the next gas day (from 6:00) once it is known, or
// null without a dynamic gas contract. EnergyZero gives one price per gas day.
async function dynamicGas(contract, priceService, now = new Date()) {
  if (contract.gas.type !== 'dynamic' || !priceService) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const till = new Date(start);
  till.setDate(till.getDate() + 2);
  const list = await priceService.range('gas', start.getTime(), till.getTime(), now.getTime());
  const current = list.filter(p => p.t <= now.getTime()).pop();
  if (!current) return null;
  const nextDay = new Date(now);
  nextDay.setHours(6, 0, 0, 0);
  if (nextDay <= now) nextDay.setDate(nextDay.getDate() + 1);
  const later = list.find(p => p.t >= nextDay.getTime());
  return {
    now: allInGas(contract, current.price),
    next: later ? allInGas(contract, later.price) : null,
    nextFrom: nextDay.toISOString(),
  };
}

// The contract as the dashboard explains it in the info of the cost blocks: how the price of
// import, export, gas and the fixed costs are made up. Plain numbers only, no functions.
function describeTariff(contract, homey = null) {
  const e = electricityFor(contract, homey);
  const fromHomey = Boolean(e.type === 'dynamic' && homey?.allIn && e.allIn === homey.allIn);
  const fromPowerhour = fromHomey && homey.source === 'powerhour';
  return {
    electricity: {
      type: e.type,
      // "homey": the formula entered in Homey makes the all-in price; "powerhour": Power by the
      // Hour gives it, with the markups entered there
      source: fromPowerhour ? 'powerhour' : fromHomey ? 'homey' : 'contract',
      formula: fromHomey ? homey.formula || null : null,
      // VAT the app adds to Homey's market price (without a formula in Homey), as a fraction
      marketVat: e.marketVat || 0,
      markup: e.markup,
      energyTax: e.energyTax,
      normal: e.normal,
      low: e.low,
      lowFrom: e.lowFrom,
      lowTo: e.lowTo,
      lowWeekend: e.lowWeekend,
      lowHolidays: e.lowHolidays,
      export: e.export,
      exportAfter: e.exportAfter,
      exportFee: e.exportFee,
      // Whether export is netted now
      netting: Boolean(e.netting) && Date.now() < NETTING_END,
      nettingOrder: e.nettingOrder,
    },
    gas: { ...contract.gas },
    water: contract.water,
    monthly: contract.monthly,
    taxReduction: contract.taxReduction,
    advance: contract.advance,
    bonus: contract.bonus,
  };
}

// Whether the contract has anything to calculate costs with; `homeyPrices` says Homey has prices
// that fill in an empty electricity contract
function hasPrices(contract, homeyPrices = false) {
  return homeyPrices || contract.electricity.type === 'dynamic' || contract.electricity.normal !== null
    || contract.gas.type === 'dynamic' || contract.gas.price !== null
    || contract.water !== null || contract.monthly !== null;
}

// A typical price per kWh, for yearly estimates such as the standby use
function typicalImportPrice(contract, marketAverage, homey = null) {
  const e = electricityFor(contract, homey);
  if (e.type === 'dynamic') return typeof marketAverage === 'number' ? e.allIn(marketAverage) : null;
  if (e.normal === null) return null;
  return e.low === null ? e.normal : (e.normal + e.low) / 2;
}

module.exports = {
  ENERGY_TAX, TAX_REDUCTION, NETTING_END, SUPPLIERS, contractFrom, isLow, isHoliday, tariffFor, hasPrices,
  allInElectricity, allInGas, allInFunction, electricityFor, typicalImportPrice, describeTariff, dynamicGas,
};
