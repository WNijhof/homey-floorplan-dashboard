'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { advise } = require('../lib/EnergyAdvice');
const { HouseExtras } = require('../lib/HouseExtras');

const NOW = Date.parse('2026-06-10T12:00:00Z');
const fresh = (o) => ({ updated: new Date(NOW).toISOString(), ...o });
const ids = (list) => list.map((a) => a.id);

test('advice: power to spare, not from an old reading', () => {
  assert.deepStrictEqual(ids(advise({ energy: fresh({ gridW: -1200 }), now: NOW })), ['surplus']);
  assert.deepStrictEqual(advise({ energy: fresh({ gridW: -1200 }), now: NOW })[0].watts, 1200);
  assert.deepStrictEqual(ids(advise({ energy: fresh({ gridW: -100 }), now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ energy: { updated: '2026-06-10T10:00:00Z', gridW: -1200 }, now: NOW })), []);
});

test('advice: the cheapest hours now, coming, or too far away', () => {
  const at = (hours) => ({ start: new Date(NOW + hours * 3600000).toISOString(), hours: 3, avg: 0.1 });
  assert.deepStrictEqual(ids(advise({ money: { cheapest: at(-1) }, now: NOW })), ['cheapNow']);
  assert.strictEqual(advise({ money: { cheapest: at(-1) }, now: NOW })[0].until, NOW + 2 * 3600000);
  assert.deepStrictEqual(ids(advise({ money: { cheapest: at(4) }, now: NOW })), ['cheapAt']);
  assert.deepStrictEqual(ids(advise({ money: { cheapest: at(20) }, now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ money: { cheapest: at(-5) }, now: NOW })), [], 'over already');
});

test('advice: dear now, but never while in the cheapest hours', () => {
  assert.deepStrictEqual(ids(advise({ money: { price: 0.4, avg: 0.25 }, now: NOW })), ['dear']);
  assert.deepStrictEqual(ids(advise({ money: { price: 0.26, avg: 0.25 }, now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ money: { price: 0.4, avg: 0, cheapest: null }, now: NOW })), []);
});

test('advice: a waiting car and a sunny tomorrow', () => {
  const car = (o) => fresh({ ev: { charging: false, car: { soc: 40 }, ...o } });
  const sun = { today: 5, tomorrow: 22 };
  assert.deepStrictEqual(ids(advise({ energy: car(), forecast: sun, now: NOW })), ['sunTomorrow']);
  assert.deepStrictEqual(ids(advise({ energy: car({ charging: true }), forecast: sun, now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ energy: car({ car: { soc: 95 } }), forecast: sun, now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ energy: car(), forecast: { tomorrow: 4 }, now: NOW })), []);
  assert.deepStrictEqual(ids(advise({ energy: car({ car: null }), forecast: sun, now: NOW })), ['sunTomorrow']);
});

test('advice: the cheapest hours left are not cheap by themselves', () => {
  const late = { start: new Date(NOW - 3600000).toISOString(), hours: 3, avg: 0.3 };
  assert.deepStrictEqual(ids(advise({ money: { cheapest: late, avg: 0.25, price: 0.35 }, now: NOW })), ['dear'], 'dear, not cheap');
  assert.deepStrictEqual(ids(advise({ money: { cheapest: { ...late, avg: 0.15 }, avg: 0.25, price: 0.15 }, now: NOW })), ['cheapNow']);
});

test('advice: nothing known, nothing said', () => {
  assert.deepStrictEqual(advise({}), []);
  assert.deepStrictEqual(advise({ energy: null, money: null, forecast: null }), []);
  assert.deepStrictEqual(advise({ money: { cheapest: { start: 'nonsense', hours: 3 } }, now: NOW }), []);
});

function extras(api = {}, plans = []) {
  const store = new Map();
  const events = [];
  const app = {
    homey: { settings: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) } },
    hub: { api },
    hubReady: Promise.resolve(),
    plans: { list: () => plans, get: (id) => plans.find((p) => p.id === id) },
    emit: (e, d) => events.push([e, d]),
    error() {},
  };
  const x = new HouseExtras(app);
  x.events = events;
  return x;
}

test('lists: clean text, limits, and everyone hears of a change', () => {
  const x = extras();
  x.addToList('shopping', '  Melk  ');
  x.addToList('tasks', 'Container buiten');
  const lists = x.getLists();
  assert.strictEqual(lists.shopping[0].text, 'Melk');
  assert.ok(lists.shopping[0].id);
  assert.strictEqual(lists.tasks.length, 1);
  assert.deepStrictEqual(x.events.pop(), ['lists', {}]);
  assert.throws(() => x.addToList('nonsense', 'x'), /Unknown list/);
  assert.throws(() => x.addToList('shopping', '   '), /Nothing/);
  const long = x.setLists({ shopping: Array.from({ length: 300 }, (_, i) => ({ text: `x${i}` })), tasks: [{ text: 'y'.repeat(500) }, { text: '' }, null, 'rubbish'], meals: { mon: 'Pasta', evil: 'no' } });
  assert.strictEqual(long.shopping.length, 100);
  assert.strictEqual(long.tasks.length, 1);
  assert.strictEqual(long.tasks[0].text.length, 120);
  assert.strictEqual(long.meals.mon, 'Pasta');
  assert.ok(!('evil' in long.meals));
  assert.throws(() => x.setLists(null), /Invalid/);
});

test('screens: names are checked, also for object keys', () => {
  const x = extras();
  x.setScreen('keuken', { view: '3d' });
  assert.deepStrictEqual(x.getScreen('keuken'), { view: '3d' });
  assert.strictEqual(x.getScreen('hal'), null);
  assert.strictEqual(x.getScreen('constructor'), null, 'no property of an object');
  assert.throws(() => x.getScreen('../x'), /Invalid/);
  assert.throws(() => x.setScreen('a'.repeat(50), {}), /Invalid/);
  assert.throws(() => x.setScreen('ok', 'text'), /Invalid/);
  assert.throws(() => x.setScreen('ok', { a: 'x'.repeat(9000) }), /Too much/);
  for (let i = 0; i < 29; i++) x.setScreen(`s${i}`, {});
  assert.throws(() => x.setScreen('oneTooMany', {}), /Too many/);
  assert.doesNotThrow(() => x.setScreen('keuken', { view: '2d' }), 'an existing one can still change');
});

test('who is home: only what the page needs', async () => {
  const x = extras({ users: { getUsers: async () => ({ a: { name: ' anna', present: true, asleep: false, email: 'x@y' }, b: { name: 'Bob', present: false, enabled: false }, c: { name: 'Gast', role: 'guest' }, d: { name: 'Cas', present: false, asleep: true } }) } });
  const people = await x.getPeople();
  assert.deepStrictEqual(people.map((p) => p.initial), ['A', 'C']);
  assert.strictEqual(people[0].home, true);
  assert.ok(!JSON.stringify(people).includes('x@y'));
});

test('variables: only those on a plan, and only to read', async () => {
  const all = { v1: { id: 'v1', name: 'Vakantie', type: 'boolean', value: false }, v2: { id: 'v2', name: 'Doel', type: 'number', value: 3 }, v3: { id: 'v3', name: 'Geheim', type: 'string', value: 's' } };
  const x = extras({ logic: { getVariables: async () => all, updateVariable: async () => assert.fail('written') } }, [{ id: 'p', variables: [{ id: 'v1' }, { id: 'v2' }, { id: 'gone' }] }]);
  assert.deepStrictEqual((await x.getVariables('p')).map((v) => v.name), ['Vakantie', 'Doel']);
  assert.strictEqual(x.setVariable, undefined);
});

test('Flow triggers fire when an advice starts, once', async () => {
  const x = extras();
  const fired = [];
  x.surplusCard = { trigger: async (t) => fired.push(['surplus', t.watts]) };
  x.cheapCard = { trigger: async () => fired.push(['cheap']) };
  let items = [{ id: 'cheapNow', until: 1 }];
  x.getAdvice = async () => ({ items });
  await x.tick();
  assert.deepStrictEqual(fired, [], 'what is going on at a restart is no new start');
  items = [{ id: 'surplus', watts: 900 }];
  await x.tick();
  await x.tick();
  assert.deepStrictEqual(fired, [['surplus', 900]]);
  items = [];
  await x.tick();
  items = [{ id: 'surplus', watts: 700 }, { id: 'cheapNow', until: 1 }];
  await x.tick();
  assert.deepStrictEqual(fired, [['surplus', 900], ['surplus', 700], ['cheap']]);
});

test('Flow card: a command to the screens is limited', () => {
  const x = extras();
  x.showOnScreen({ what: 'message', detail: 'x'.repeat(300), seconds: 99999, screen: ' hal ' });
  const [event, data] = x.events.pop();
  assert.strictEqual(event, 'screen');
  assert.strictEqual(data.detail.length, 120);
  assert.strictEqual(data.seconds, 3600);
  assert.strictEqual(data.screen, 'hal');
  x.showOnScreen({ what: 'camera' });
  assert.strictEqual(x.events.pop()[1].seconds, 30);
});

test('release files are valid: changelog, app, Flow cards and both languages', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const version = read('.homeycompose/app.json').version;
  const log = read('.homeychangelog.json');
  assert.ok(log[version] && log[version].en && log[version].nl, 'the changelog has this version');
  assert.strictEqual(read('app.json').version, version);
  const flow = path.join(root, '.homeycompose', 'flow');
  for (const kind of fs.readdirSync(flow)) {
    for (const file of fs.readdirSync(path.join(flow, kind))) {
      const card = read(path.join('.homeycompose', 'flow', kind, file));
      assert.ok(card.title.en && card.title.nl, file);
      for (const arg of card.args || []) assert.ok(arg.name && arg.type, file);
    }
  }
  assert.ok(read('app.json').flow.actions.some((c) => c.id === 'show-on-screen'), 'the cards are in app.json');
  assert.ok(read('app.json').flow.triggers.some((c) => c.id === 'energy-surplus'));
});

test('every script of the pages can be read by a browser', () => {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const web = path.join(__dirname, '..', 'web');
  for (const name of ['editor.js', 'dashboard.js', 'dashboard-extras.js', 'dashboard-panels.js', 'theme.js', 'homey-web.js', 'demo.js', 'energy-demo.js', 'energy/site.js']) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(web, name)], { stdio: 'pipe' }), name);
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'widgets', 'floorplan', 'public', 'widget.js')], { stdio: 'pipe' }));
  assert.ok(fs.existsSync(path.join(web, 'house3d.js')));
});

test('gas today: what the meter rose today, nothing without readings', async () => {
  const { EnergyDetails } = require('../lib/EnergyDetails');
  const devices = { p1: { id: 'p1', name: 'P1', class: 'sensor', capabilities: ['meter_gas', 'measure_power'], capabilitiesObj: { meter_gas: { value: 512.3 }, measure_power: { value: 300 } } } };
  const details = new EnergyDetails({ log() {}, hub: { api: { devices: { getDevices: async () => devices } } }, energyConfig: () => ({}) });
  details.today = async () => [{ t: 1, v: 509.1 }, { t: 2, v: 510 }, { t: 3, v: 512.3 }];
  assert.strictEqual(await details.gasToday(), 3.2);
  details.gas = null;
  details.today = async () => [];
  assert.strictEqual(await details.gasToday(), null);
});
