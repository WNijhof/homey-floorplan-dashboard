// Copied from Energy Dashboard (lib/historylog.js) by scripts/sync-energy.js. Do not edit here.
'use strict';

// The app's own history: Homey Insights keeps fewer details the older readings get (5 minutes for
// a day, later hours, after months only days), and reading a year of it is slow. So every day
// after midnight the hours of yesterday (energy and costs, as the dashboard calculated them from
// the meters) are kept, and every finished month as the dashboard calculated it. A period that
// has ended is then put together from the log instead of reading Insights again; a period that
// runs now takes its finished part from the log and only today or this month from Insights.
// What was calculated depends on the contract and the chosen devices: every entry has the
// fingerprint of both, and an entry with another fingerprint is not used (Insights is read again).
// The log lives in a file in /userdata (about half a MB per year), not in the settings.

const crypto = require('crypto');
const { PERIODS, makeBuckets, totalsOf, buildSankey } = require('./energy');

const VERSION = 1;
const KEEP_YEARS = 5;
// A month is kept only once it is this long over: Insights may still fill in its last readings
const SETTLED = 6 * 3600 * 1000;
const COST_FIELDS = ['costImport', 'costExport', 'costGas', 'costWater', 'costFixed', 'nettingValue', 'costExportAfter'];

const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const isNumber = v => typeof v === 'number' && Number.isFinite(v);

// What the numbers depend on: the contract and the devices that are read
function fingerprint(contract, found) {
  const ids = list => (list || []).map(d => d.id).sort();
  const devices = {
    p1: found?.p1?.id || null,
    solar: ids(found?.solar),
    batteries: ids(found?.batteries),
    heating: ids(found?.heating),
    ev: ids(found?.evChargers),
    water: found?.water?.id || null,
  };
  return crypto.createHash('sha1').update(JSON.stringify({ contract, devices })).digest('hex').slice(0, 12);
}

function emptyLog() {
  return { version: VERSION, days: {}, months: {}, meta: null };
}

function validLog(log) {
  return log && log.version === VERSION && typeof log.days === 'object' && typeof log.months === 'object' ? log : emptyLog();
}

// A history row without its label and start, rounded to keep the file small (0.1 Wh)
function stripRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (key === 'label' || key === 'start') continue;
    if (isNumber(value)) out[key] = Math.round(value * 10000) / 10000;
    else if (value === null) out[key] = null;
  }
  return out;
}

// The hours of a day as one list of names and a list of values per hour: a third of the size
function packHours(rows) {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return { keys, hours: rows.map(r => keys.map(k => (k in r ? r[k] : null))) };
}

function unpackHours(day) {
  if (!Array.isArray(day?.keys) || !Array.isArray(day.hours)) return null;
  return day.hours.map(values => Object.fromEntries(day.keys.map((k, i) => [k, values[i] ?? null])));
}

// Rows added up into one: a cost stays unknown (null) when no row knows it
function sumRows(rows) {
  const out = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (isNumber(value)) out[key] = (out[key] || 0) + value;
      else if (!(key in out)) out[key] = null;
    }
  }
  return out;
}

// Yesterday's history (hour rows) into the log
function recordDay(log, history, fp) {
  const rows = history?.rows;
  if (!Array.isArray(rows) || history.bucket !== 'hour' || !rows.length) return log;
  const date = dateKey(new Date(rows[0].start));
  return {
    ...log,
    days: { ...log.days, [date]: { fp, ...packHours(rows.map(stripRow)) } },
    meta: { hasBattery: Boolean(history.hasBattery), available: history.available || {} },
  };
}

// The finished months of a year's history (month rows) into the log, when not in it yet
function recordMonths(log, history, fp, now = new Date()) {
  const rows = history?.rows;
  if (!Array.isArray(rows) || history.bucket !== 'month') return log;
  let months = log.months;
  for (const row of rows) {
    const start = new Date(row.start);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const key = monthKey(start);
    if (end.getTime() + SETTLED > now.getTime() || months[key]?.fp === fp) continue;
    months = { ...months, [key]: { fp, row: stripRow(row) } };
  }
  return months === log.months ? log : { ...log, months, meta: log.meta || { hasBattery: Boolean(history.hasBattery), available: history.available || {} } };
}

// Days and months older than KEEP_YEARS go
function pruneLog(log, now = new Date()) {
  const cut = new Date(now.getFullYear() - KEEP_YEARS, now.getMonth(), 1);
  const days = Object.fromEntries(Object.entries(log.days).filter(([k]) => new Date(`${k}T00:00:00`) >= cut));
  const months = Object.fromEntries(Object.entries(log.months).filter(([k]) => new Date(`${k}-01T00:00:00`) >= cut));
  return { ...log, days, months };
}

function dayRow(log, date, fp) {
  const day = log.days[date];
  const hours = day?.fp === fp ? unpackHours(day) : null;
  return hours ? sumRows(hours) : null;
}

// A month from its days when every day is in the log (summed from hours), else as it was kept
function monthRow(log, start, fp) {
  const days = [];
  for (const d = new Date(start); d.getMonth() === start.getMonth(); d.setDate(d.getDate() + 1)) days.push(dayRow(log, dateKey(d), fp));
  if (days.every(Boolean)) return sumRows(days);
  const kept = log.months[monthKey(start)];
  return kept?.fp === fp ? { ...kept.row } : null;
}

// A row of nothing, for buckets still to come
function zeroRow(sample) {
  return Object.fromEntries(Object.keys(sample).map(k => [k, COST_FIELDS.includes(k) ? null : 0]));
}

// A light history of a period from the log: ended buckets from the log, the bucket running now
// from `current` (the light history of today for day buckets, of this month for month buckets),
// buckets to come empty. Null when an ended bucket is not in the log: then Insights is read.
function composeHistory(log, period, fp, current = null, now = new Date()) {
  const kind = PERIODS[period]?.bucket;
  if (kind !== 'day' && kind !== 'month') return null;
  const buckets = makeBuckets(period, now);
  const rows = [];
  for (const b of buckets) {
    const end = new Date(b.start);
    if (kind === 'day') end.setDate(end.getDate() + 1);
    else end.setMonth(end.getMonth() + 1);
    let row;
    if (end <= now) row = kind === 'day' ? dayRow(log, dateKey(b.start), fp) : monthRow(log, b.start, fp);
    else if (b.start <= now) row = current?.rows ? sumRows(current.rows.map(stripRow)) : null;
    else row = 'later';
    if (row === null) return null;
    rows.push({ b, row });
  }
  const sample = rows.find(r => r.row !== 'later')?.row;
  if (!sample) return null;
  const meta = current || log.meta || {};
  const full = rows.map(({ b, row }) => ({ label: b.label, start: b.start.toISOString(), ...(row === 'later' ? zeroRow(sample) : row) }));
  const totals = totalsOf(full);
  return {
    period,
    bucket: kind,
    hasBattery: Boolean(meta.hasBattery),
    available: { battery: Boolean(meta.hasBattery), ...(meta.available || {}) },
    rows: full,
    totals,
    devices: [],
    sankey: buildSankey(totals, []),
    fromLog: true,
  };
}

// The log as CSV, one line per hour, for a spreadsheet: Dutch uses ; and a decimal comma
const LOG_COLUMNS = [
  ['import', 'Van het net (kWh)', 'From grid (kWh)'],
  ['export', 'Teruggeleverd (kWh)', 'Exported (kWh)'],
  ['solar', 'Zon opgewekt (kWh)', 'Solar produced (kWh)'],
  ['consumption', 'Verbruik (kWh)', 'Consumption (kWh)'],
  ['charge', 'Batterij geladen (kWh)', 'Battery charged (kWh)'],
  ['discharge', 'Batterij ontladen (kWh)', 'Battery discharged (kWh)'],
  ['heating', 'Verwarming (kWh)', 'Heating (kWh)'],
  ['ev', 'Laadpaal (kWh)', 'EV charger (kWh)'],
  ['gas', 'Gas (m³)', 'Gas (m³)'],
  ['water', 'Water (L)', 'Water (L)'],
  ['costImport', 'Kosten afname (€)', 'Import cost (€)'],
  ['costExport', 'Teruglevering (€)', 'Export (€)'],
  ['costGas', 'Kosten gas (€)', 'Gas cost (€)'],
  ['costWater', 'Kosten water (€)', 'Water cost (€)'],
  ['costFixed', 'Vaste kosten (€)', 'Fixed costs (€)'],
];
function logCsv(log, lang = 'nl', symbol = '€') {
  const dutch = lang === 'nl';
  const sep = dutch ? ';' : ',';
  const number = v => {
    if (!isNumber(v)) return '';
    const text = String(Math.round(v * 10000) / 10000);
    return dutch ? text.replace('.', ',') : text;
  };
  const header = [dutch ? 'Begin' : 'Start', ...LOG_COLUMNS.map(c => (dutch ? c[1] : c[2]).replace('€', () => symbol))].join(sep);
  const lines = [];
  for (const date of Object.keys(log.days).sort()) {
    (unpackHours(log.days[date]) || []).forEach((row, h) => {
      lines.push([`${date} ${pad(h)}:00`, ...LOG_COLUMNS.map(([key]) => number(row[key]))].join(sep));
    });
  }
  // A byte order mark, so Excel reads € and ³ correctly
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}

// The days that should be in the log but are not: the last `back` days before today
function missingDays(log, fp, back = 1, now = new Date()) {
  const out = [];
  for (let k = back; k >= 1; k--) {
    const date = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - k));
    if (log.days[date]?.fp !== fp) out.push(date);
  }
  return out;
}

module.exports = {
  fingerprint, emptyLog, validLog, recordDay, recordMonths, pruneLog, composeHistory, logCsv, missingDays, sumRows,
};
