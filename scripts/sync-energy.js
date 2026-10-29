'use strict';

// Copies Energy Dashboard's energy logic (device discovery, live flows, prices, solar forecast, history)
// into lib/energy/, so both apps share one source. The copies are committed: the demo build and the App
// Store build do not need the Energy repo. Edit the originals in the Energy repo, then run this again.
// Usage: node scripts/sync-energy.js [path to the Energy Dashboard repo]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(root, '..', 'energy dashb'), 'lib');
const target = path.join(root, 'lib', 'energy');
const FILES = ['energy.js', 'tariffs.js', 'prices.js', 'weather.js', 'peak.js', 'forecast.js', 'alerts.js', 'co2.js', 'tapcheck.js', 'historylog.js'];

if (!fs.existsSync(path.join(source, 'energy.js'))) {
  console.error(`Energy Dashboard not found at ${source}; give its repo folder as the first argument.`);
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });
for (const name of FILES) {
  const code = fs.readFileSync(path.join(source, name), 'utf8');
  fs.writeFileSync(path.join(target, name), `// Copied from Energy Dashboard (lib/${name}) by scripts/sync-energy.js. Do not edit here.\n${code}`);
}
console.log(`synced ${FILES.length} file(s) from ${source}`);
