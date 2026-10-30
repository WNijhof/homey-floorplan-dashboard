'use strict';

const SURPLUS_W = 400; // sent back to the grid: enough to run something
const DEAR = 1.25; // the price of now against the average of today
const CHEAP = 0.9; // the cheapest hours left count as cheap only below the average
const SUNNY_DAY_KWH = 15;

/**
 * What to do with energy right now, from what is known: the power of the house, the prices and the solar forecast.
 * Returns the advice that applies, most useful first, as { id, ...values }; the page words it. Pure, for the tests.
 * energy: the live summary (gridW, ev, battery). money: { price, avg, cheapest: { start, hours, avg } }.
 * forecast: { today, tomorrow } in kWh.
 */
function advise({ energy, money, forecast, now = Date.now() }) {
  const out = [];
  const e = energy || {};
  const m = money || {};
  const fresh = !!e.updated && now - Date.parse(e.updated) < 10 * 60000;
  if (fresh && typeof e.gridW === 'number' && e.gridW <= -SURPLUS_W) out.push({ id: 'surplus', watts: Math.round(-e.gridW) });
  const start = m.cheapest ? Date.parse(m.cheapest.start) : NaN;
  const end = Number.isFinite(start) ? start + m.cheapest.hours * 3600000 : NaN;
  // Late in the day the cheapest hours left can still be dear ones
  const cheap = !!m.cheapest && !(typeof m.avg === 'number' && m.avg > 0 && m.cheapest.avg > m.avg * CHEAP);
  const inCheap = cheap && now >= start && now < end;
  if (inCheap) out.push({ id: 'cheapNow', until: end });
  else if (cheap && start > now && start - now < 12 * 3600000) out.push({ id: 'cheapAt', at: start });
  if (!inCheap && typeof m.price === 'number' && typeof m.avg === 'number' && m.avg > 0 && m.price >= m.avg * DEAR) out.push({ id: 'dear', price: m.price });
  // A car at the charger that waits: tomorrow's sun is free
  const waiting = fresh && e.ev && !e.ev.charging && (!e.ev.car || typeof e.ev.car.soc !== 'number' || e.ev.car.soc < 90);
  if (waiting && forecast && typeof forecast.tomorrow === 'number' && forecast.tomorrow >= SUNNY_DAY_KWH) out.push({ id: 'sunTomorrow', kWh: Math.round(forecast.tomorrow) });
  return out;
}

module.exports = { advise };
