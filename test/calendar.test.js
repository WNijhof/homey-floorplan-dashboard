'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cal = require('../lib/Calendar');

const TZ = 'Europe/Amsterdam';
const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const iso = (ms) => new Date(ms).toISOString();

test('time zone conversion handles summer and winter time', () => {
  assert.strictEqual(iso(cal.zonedToUtc(2026, 6, 1, 9, 0, 0, TZ)), '2026-07-01T07:00:00.000Z');
  assert.strictEqual(iso(cal.zonedToUtc(2026, 11, 1, 9, 0, 0, TZ)), '2026-12-01T08:00:00.000Z');
});

test('single events: UTC, TZID, all-day, folded summary', () => {
  const events = cal.parseICS(ics([
    'BEGIN:VEVENT', 'UID:a', 'DTSTART:20261029T080000Z', 'DTEND:20261029T090000Z', 'SUMMARY:Tandarts\\, controle', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART;TZID=Europe/Amsterdam:20261030T090000', 'DURATION:PT30M', 'SUMMARY:Lang', ' e titel', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART;VALUE=DATE:20261031', 'DTEND;VALUE=DATE:20261101', 'SUMMARY:Vrije dag', 'END:VEVENT',
  ].join('\r\n')), TZ);
  const list = cal.upcoming(events, Date.UTC(2026, 9, 28), Date.UTC(2026, 10, 5), 10);
  assert.deepStrictEqual(list.map((e) => e.title), ['Tandarts, controle', 'Lange titel', 'Vrije dag']);
  assert.strictEqual(iso(list[1].start), '2026-10-30T08:00:00.000Z');
  assert.strictEqual(list[1].end - list[1].start, 30 * 60000);
  assert.strictEqual(list[2].allDay, true);
  assert.strictEqual(iso(list[2].start), '2026-10-30T23:00:00.000Z');
});

test('weekly recurrence with BYDAY, EXDATE and an override; keeps wall-clock time across DST', () => {
  const events = cal.parseICS(ics([
    'BEGIN:VEVENT', 'UID:r', 'DTSTART;TZID=Europe/Amsterdam:20261019T190000', 'DTEND;TZID=Europe/Amsterdam:20261019T200000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6', 'EXDATE;TZID=Europe/Amsterdam:20261022T190000', 'SUMMARY:Sport', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:r', 'RECURRENCE-ID;TZID=Europe/Amsterdam:20261026T190000', 'DTSTART;TZID=Europe/Amsterdam:20261026T200000',
    'DTEND;TZID=Europe/Amsterdam:20261026T210000', 'SUMMARY:Sport (later)', 'END:VEVENT',
  ].join('\r\n')), TZ);
  const list = cal.upcoming(events, Date.UTC(2026, 9, 1), Date.UTC(2026, 11, 1), 20);
  assert.deepStrictEqual(list.map((e) => `${e.title} ${iso(e.start)}`), [
    'Sport 2026-10-19T17:00:00.000Z', // summer time: 19:00 = 17:00Z
    'Sport (later) 2026-10-26T19:00:00.000Z',
    'Sport 2026-10-29T18:00:00.000Z', // winter time: 19:00 = 18:00Z
    'Sport 2026-11-02T18:00:00.000Z',
    'Sport 2026-11-05T18:00:00.000Z', // COUNT=6 includes the excluded and the overridden occurrence
  ]);
});

test('daily with UNTIL, monthly skips short months, cancelled events are hidden', () => {
  const events = cal.parseICS(ics([
    'BEGIN:VEVENT', 'UID:d', 'DTSTART:20261028T060000Z', 'RRULE:FREQ=DAILY;UNTIL=20261030T060000Z', 'SUMMARY:Pil', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:m', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Huur', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x', 'DTSTART:20261029T100000Z', 'STATUS:CANCELLED', 'SUMMARY:Weg', 'END:VEVENT',
  ].join('\r\n')), TZ);
  const pills = cal.upcoming(events.filter((e) => e.uid === 'd'), Date.UTC(2026, 9, 1), Date.UTC(2026, 11, 1), 20);
  assert.strictEqual(pills.length, 3);
  const rent = cal.upcoming(events.filter((e) => e.uid === 'm'), Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1), 20);
  assert.deepStrictEqual(rent.map((e) => new Date(e.start + 3600000 * 2).getUTCMonth()), [0, 2, 4]); // Jan, Mar, May
  assert.strictEqual(cal.upcoming(events.filter((e) => e.uid === 'x'), 0, Infinity, 5).length, 0);
});
