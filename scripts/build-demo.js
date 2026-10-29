'use strict';

// Builds the demo site (GitHub Pages): the dashboard and editor pages as the app serves them, with the
// demo house answered in the browser by web/demo.js instead of a Homey.
// Usage: node scripts/build-demo.js [out-dir]   (default: site)
const fs = require('fs');
const path = require('path');
const { FILES, STATIC_DIRS } = require('../lib/WebServer');
const { demoPlan, demoDevices, demoZones } = require('../test/demo-house');
const { demoEnergyDevices } = require('../test/demo-energy');
const { summarize } = require('../lib/EnergyHub');

const ROOT = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'site'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The pages under their published names: '/' is index.html, '/editor' is editor.html (Pages serves it
// for /editor too).
for (const [route, file] of Object.entries(FILES)) {
  const name = route === '/' ? 'index.html' : route === '/editor' ? 'editor.html' : route.slice(1);
  let text = fs.readFileSync(path.join(ROOT, file));
  if (name.endsWith('.html')) {
    text = String(text).replace('<script src="homey-web.js"></script>', '<script src="demo-data.js"></script>\n  <script src="demo.js"></script>\n  <script src="homey-web.js"></script>');
    if (!text.includes('demo.js')) throw new Error(`${name}: no homey-web.js script to put the demo before`);
  }
  fs.writeFileSync(path.join(out, name), text);
}
for (const dir of STATIC_DIRS) fs.cpSync(path.join(ROOT, 'web', dir), path.join(out, dir), { recursive: true });

fs.copyFileSync(path.join(ROOT, 'web', 'demo.js'), path.join(out, 'demo.js'));
const data = {};
// The energy of the house per hour of the day, made with Energy Dashboard's calculation (it does not run in a browser)
const energyAt = (lang, h) => { const d = new Date(2026, 9, 1, h, 0, 0); return summarize(demoEnergyDevices(lang, d)); };
for (const lang of ['nl', 'en']) data[lang] = { plan: demoPlan(lang), devices: demoDevices(lang), zones: demoZones(lang), energy: Array.from({ length: 24 }, (_, h) => energyAt(lang, h)) };
fs.writeFileSync(path.join(out, 'demo-data.js'), `window.FP_DEMO_DATA = ${JSON.stringify(data)};\n`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`demo site in ${out}`);
