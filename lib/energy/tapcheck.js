// Copied from Energy Dashboard (lib/tapcheck.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

// Does the gas boiler fire when hot tap water is drawn? For a water heater (a heat pump boiler)
// that preheats the water for a combi boiler: a sensor or valve should keep the combi off while
// the tank is warm enough. Every 30 s the app passes the water meter (liters), the tank
// temperature and the gas meter. A tap is water running while the tank cools down (a flush or a
// cold tap leaves the tank as it is). The tank's app polls its cloud every few minutes and the
// gas meter reports every 5 minutes, so a tap is judged only a while after the water stopped.
// Gas in that time minus what the house used before the tap (heating) says whether the boiler
// fired. A plug that measures the boiler says it sooner and per minute: burning runs the fan, so
// its power rises well above standby. The finished taps are kept in a log (settings key tapLog),
// at most KEEP.

const KEEP = 300;
// No more water for this long ends a tap; water again before it is judged belongs to the same tap
const IDLE = 3 * 60 * 1000;
// After the water stopped: room for the tank's next reading and the gas meter's next step
const SETTLE = 12 * 60 * 1000;
const MAX_TAP = 60 * 60 * 1000;
// Readings further apart than this (the check was off, Insights has a hole) do not make a tap
const MAX_GAP = 10 * 60 * 1000;
// A tap cools the tank at least this much (°C); a flush or a cold tap does not
const MIN_DROP = 1;
const MIN_LITERS = 3;
// Gas the house used before the tap, as the rate to subtract: over this long
const BASELINE = 30 * 60 * 1000;
const KEEP_GAS = 2 * 3600 * 1000;
// The gas meter counts in 0.001 m³: one step is no burning yet
const NO_GAS = 0.002;
// With the heating burning: this much gas above its rate means the boiler fired for the tap
const MIN_EXTRA = 0.02;
// The boiler's plug: standby is its low power of the last hours; burning is at least this far above
const BURN_RISE = 20;
// Within this of standby before the tap: the boiler was not burning for the heating
const IDLE_MARGIN = 10;
// A boiler on standby uses a few watts; a low power above this means it burned the whole time
const STANDBY_MAX = 30;
const BEFORE = 10 * 60 * 1000;
// The fan can start a little after the water and the plug can report late
const POWER_AFTER = 3 * 60 * 1000;

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const median = list => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

class TapTracker {

  constructor(log = {}) {
    this.events = Array.isArray(log?.events) ? log.events.slice(-KEEP) : [];
    this.prev = null;
    this.tap = null;
    // Gas meter readings [time, m³], only the changes, and since when it is watched
    this.gas = [];
    this.gasSince = null;
    // The boiler's plug [time, W], every reading
    this.power = [];
  }

  // A reading { at, liters, temp, gas, power, heating }; returns true when a tap was added to the log
  add({ at = Date.now(), liters, temp, gas, power, heating = false } = {}) {
    if (isNumber(gas)) this.addGas(at, gas);
    if (isNumber(power)) {
      this.power.push([at, power]);
      while (this.power.length && this.power[0][0] < at - KEEP_GAS) this.power.shift();
    }
    if (!isNumber(liters) || !isNumber(temp)) {
      this.prev = null;
      this.tap = null;
      return false;
    }
    const prev = this.prev && at - this.prev.at <= MAX_GAP ? this.prev : null;
    this.prev = { at, liters, temp, heating };
    const flowing = Boolean(prev) && liters > prev.liters && liters - prev.liters < 500;
    if (!this.tap) {
      if (flowing) {
        this.tap = { start: prev.at, liters: prev.liters, temp: prev.temp, gas: this.gasAt(prev.at), lastFlow: at, endLiters: liters, minTemp: temp, heating: prev.heating || heating, end: null };
      }
      return false;
    }
    const tap = this.tap;
    tap.minTemp = Math.min(tap.minTemp, temp);
    tap.heating = tap.heating || heating;
    if (flowing) {
      tap.lastFlow = at;
      tap.endLiters = liters;
      tap.end = null;
    } else if (!tap.end && at - tap.lastFlow >= IDLE) {
      tap.end = tap.lastFlow;
    }
    if (!tap.end && at - tap.start >= MAX_TAP) tap.end = at;
    if (!tap.end || at - tap.end < SETTLE) return false;
    this.tap = null;
    const event = this.judge(tap, at);
    if (!event) return false;
    this.events = [...this.events, event].slice(-KEEP);
    return true;
  }

  addGas(at, m3) {
    if (this.gasSince === null) this.gasSince = at;
    const last = this.gas[this.gas.length - 1];
    if (!last || last[1] !== m3) this.gas.push([at, m3]);
    // Keep the last reading before the window too: it is the meter's value at the window's start
    while (this.gas.length > 1 && this.gas[1][0] < at - KEEP_GAS) this.gas.shift();
    if (this.gasSince < at - KEEP_GAS) this.gasSince = at - KEEP_GAS;
  }

  // The gas meter at a time: its last reading before it
  gasAt(at) {
    if (this.gasSince === null || at < this.gasSince) return null;
    let found = null;
    for (const [t, m3] of this.gas) {
      if (t > at) break;
      found = m3;
    }
    return found;
  }

  // A finished tap: kept only when the tank cooled down. Gas from its start to now, and what the
  // house would have used anyway at its rate of the half hour before.
  judge(tap, now) {
    const liters = tap.endLiters - tap.liters;
    const drop = tap.temp - tap.minTemp;
    if (liters < MIN_LITERS || drop < MIN_DROP) return null;
    const gasNow = this.gasAt(now);
    const used = isNumber(tap.gas) && isNumber(gasNow) ? Math.max(0, gasNow - tap.gas) : null;
    const before = this.gasAt(tap.start - BASELINE);
    const expected = isNumber(before) && isNumber(tap.gas)
      ? Math.max(0, tap.gas - before) * (now - tap.start) / BASELINE
      : null;
    let verdict = 'unclear';
    if (used === null) verdict = 'unknown';
    else if (used <= NO_GAS) verdict = 'off';
    else if (expected !== null && expected <= NO_GAS) verdict = 'on';
    else if (expected !== null && used - expected >= MIN_EXTRA) verdict = 'on';
    // The plug decides when the boiler stood still before the tap: burning or not shows at once
    const power = this.judgePower(tap);
    if (power?.idleBefore) verdict = power.peak >= power.idle + BURN_RISE ? 'on' : 'off';
    return {
      at: tap.start,
      minutes: round((tap.end - tap.start) / 60000, 1),
      liters: Math.round(liters),
      from: round(tap.temp, 1),
      to: round(tap.minTemp, 1),
      gas: used === null ? null : round(used, 3),
      expected: expected === null ? null : round(expected, 3),
      verdict,
      heating: tap.heating,
      power: power ? { idle: power.idle, before: power.before, peak: power.peak } : null,
    };
  }

  // Standby of the boiler (its low power of the last hours), its power just before the tap and its
  // highest during it; null without enough readings
  judgePower(tap) {
    const within = (from, to) => this.power.filter(([t]) => t >= from && t <= to).map(([, w]) => w);
    const history = within(-Infinity, tap.start);
    const before = within(tap.start - BEFORE, tap.start);
    const during = within(tap.start, tap.end + POWER_AFTER);
    if (history.length < 5 || !before.length || !during.length) return null;
    const sorted = [...history].sort((a, b) => a - b);
    const idle = Math.round(sorted[Math.floor(sorted.length * 0.1)]);
    const beforeW = Math.round(median(before));
    return { idle, before: beforeW, peak: Math.round(Math.max(...during)), idleBefore: idle <= STANDBY_MAX && beforeW <= idle + IDLE_MARGIN };
  }
}

// Taps from readings of the past (Insights, in 5-minute steps), for the time before the check was
// turned on: per series [{ t, v }] of the water meter (m³), the tank (°C), the gas meter (m³) and
// the boiler's plug (W). Every moment one of them changed is one reading.
function replayTaps({ water = [], temp = [], gas = [], power = [] } = {}) {
  const series = { water, temp, gas, power };
  const times = [...new Set(Object.values(series).flat().map(e => e.t))].sort((a, b) => a - b);
  const tracker = new TapTracker();
  const index = { water: -1, temp: -1, gas: -1, power: -1 };
  const at = (key, t) => {
    const list = series[key];
    while (index[key] + 1 < list.length && list[index[key] + 1].t <= t) index[key]++;
    return index[key] >= 0 ? list[index[key]].v : null;
  };
  for (const t of times) {
    const m3 = at('water', t);
    tracker.add({ at: t, liters: isNumber(m3) ? m3 * 1000 : null, temp: at('temp', t), gas: at('gas', t), power: at('power', t) });
  }
  // Let the last tap settle
  const last = times[times.length - 1];
  if (isNumber(last)) {
    for (let t = last + 60000; t <= last + IDLE + SETTLE + 60000; t += 60000) {
      const m3 = at('water', last);
      tracker.add({ at: t, liters: isNumber(m3) ? m3 * 1000 : null, temp: at('temp', last), gas: at('gas', last), power: at('power', last) });
    }
  }
  return tracker.events;
}

// The log with older taps added, in time order; a tap already in it (the same start) is kept once
function mergeTaps(events, older) {
  const seen = new Set(events.map(e => e.at));
  return [...older.filter(e => !seen.has(e.at)), ...events].sort((a, b) => a.at - b.at).slice(-KEEP);
}

// What the Heating block shows: the latest taps, newest first, and per period how often the boiler
// fired while the tank was warm enough (from warmFrom °C). With a moment (YYYY-MM-DD or
// YYYY-MM-DDTHH:MM, local time, a change such as a new sensor) the taps before and from it are counted apart.
const SHOW_TAPS = 3;
function changeTime(since) {
  const found = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(since || '');
  return found ? new Date(`${found[1]}T${found[2] || '00:00'}:00`).getTime() : null;
}
function tapSummary(events, { warmFrom = 50, since = '' } = {}) {
  const list = Array.isArray(events) ? events : [];
  const split = changeTime(since);
  const count = taps => {
    const warm = taps.filter(e => e.from >= warmFrom);
    return {
      taps: warm.length,
      on: warm.filter(e => e.verdict === 'on').length,
      off: warm.filter(e => e.verdict === 'off').length,
      unclear: warm.filter(e => e.verdict !== 'on' && e.verdict !== 'off').length,
    };
  };
  return {
    count: list.length,
    warmFrom,
    since: split ? since : null,
    before: split ? count(list.filter(e => e.at < split)) : null,
    after: count(split ? list.filter(e => e.at >= split) : list),
    latest: list.slice(-SHOW_TAPS).reverse(),
  };
}

// The tap log as CSV, for a spreadsheet: Dutch uses ; and a decimal comma, English
const TAP_COLUMNS = [
  ['at', 'Begin', 'Start'],
  ['minutes', 'Minuten', 'Minutes'],
  ['liters', 'Liters', 'Liters'],
  ['from', 'Boiler voor (°C)', 'Water heater before (°C)'],
  ['to', 'Boiler na (°C)', 'Water heater after (°C)'],
  ['gas', 'Gas (m³)', 'Gas (m³)'],
  ['expected', 'Gas verwarming (m³)', 'Gas heating (m³)'],
  ['idle', 'Cv stand-by (W)', 'Boiler standby (W)'],
  ['before', 'Cv voor (W)', 'Boiler before (W)'],
  ['peak', 'Cv hoogste (W)', 'Boiler highest (W)'],
  ['verdict', 'Cv', 'Boiler'],
];
const TAP_VERDICTS = { on: ['aan', 'on'], off: ['uit', 'off'], unclear: ['onduidelijk', 'unclear'], unknown: ['onbekend', 'unknown'] };
function tapCsv(events, lang = 'nl') {
  const dutch = lang === 'nl';
  const sep = dutch ? ';' : ',';
  const number = v => (isNumber(v) ? (dutch ? String(v).replace('.', ',') : String(v)) : '');
  const pad = n => String(n).padStart(2, '0');
  const date = at => {
    const d = new Date(at);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const cell = (e, key) => {
    if (key === 'at') return date(e.at);
    if (key === 'verdict') return (TAP_VERDICTS[e.verdict] || ['', ''])[dutch ? 0 : 1];
    if (key === 'idle' || key === 'before' || key === 'peak') return number(e.power?.[key]);
    return number(e[key]);
  };
  const header = TAP_COLUMNS.map(c => (dutch ? c[1] : c[2])).join(sep);
  const lines = (events || []).map(e => TAP_COLUMNS.map(([key]) => cell(e, key)).join(sep));
  // A byte order mark, so Excel reads ° and ³ correctly
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

module.exports = { TapTracker, tapSummary, replayTaps, mergeTaps, changeTime, tapCsv };
