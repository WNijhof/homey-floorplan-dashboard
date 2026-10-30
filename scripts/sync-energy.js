'use strict';

// Copies Energy Dashboard into HomeDeck, so both apps share one source:
//  - lib/energy/: its calculation (device discovery, live flows, prices, solar forecast, history), its app logic
//    (app.js) and the routes of its web page (webserver.js)
//  - web/energy/: its page and settings page, served at /energy/ on HomeDeck's own port (see lib/EnergyEngine.js)
//  - test/energy-demo-data.js: its demo data, for the dev server and the demo site
// The copies are committed: the demo build and the App Store build do not need the Energy repo. Edit the originals
// in the Energy repo, then run this again. A small list of changes below makes them work in another app; when one of
// them no longer matches, this script stops instead of leaving a page that half works.
// Usage: node scripts/sync-energy.js [path to the Energy Dashboard repo]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repo = path.resolve(process.argv[2] || path.join(root, '..', 'energy dashb'));
const homeyApp = path.join(repo, 'homey-app');
const target = path.join(root, 'lib', 'energy');
const webTarget = path.join(root, 'web', 'energy');
const FILES = ['energy.js', 'tariffs.js', 'prices.js', 'weather.js', 'peak.js', 'forecast.js', 'alerts.js', 'co2.js', 'tapcheck.js', 'historylog.js'];
const WEB_FILES = ['dashboard.js', 'dashboard.css', 'i18n.js', 'screen.js', 'index.html', 'settings-web.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'kofi.png'];
const SETTINGS_FILES = ['index.html', 'settings.css', 'settings.js', 'kofi.png'];
const FLOW_CARDS = ['shower-start.json', 'shower-stop.json', 'tapwater-source.json']; // HomeDeck has cards of its own beside these

if (!fs.existsSync(path.join(repo, 'lib', 'energy.js')) || !fs.existsSync(path.join(homeyApp, 'app.js'))) {
  console.error(`Energy Dashboard not found at ${repo}; give its repo folder as the first argument.`);
  process.exit(1);
}

// [text or pattern, replacement]; every one must match
function edit(name, code, changes) {
  let out = code;
  for (const [from, to] of changes) {
    const next = out.replace(from, to);
    if (next === out) throw new Error(`${name}: nothing to change for ${from}`);
    out = next;
  }
  return out;
}

const banner = (from) => `// Copied from Energy Dashboard (${from}) by scripts/sync-energy.js. Do not edit here.\n`;

fs.mkdirSync(target, { recursive: true });
for (const name of FILES) {
  // HomeDeck reads the power of a device the way this code does
  const extra = name === 'energy.js' ? '\nObject.assign(module.exports, { powerCapability, batteryPowerCapabilities, invertedPower });\n' : '';
  fs.writeFileSync(path.join(target, name), banner(`lib/${name}`) + fs.readFileSync(path.join(repo, 'lib', name), 'utf8') + extra);
}

// The app: a plain class that lib/EnergyEngine.js extends and starts inside HomeDeck
const appCode = edit('app.js', fs.readFileSync(path.join(homeyApp, 'app.js'), 'utf8'), [
  ["const Homey = require('homey');\n", ''],
  ["const { HomeyAPI } = require('homey-api');\n", ''],
  ["const { WebServer } = require('./lib/webserver');", "const { EnergyServer: WebServer } = require('../EnergyServer');"],
  [/require\('\.\/lib\//g, "require('./"],
  ['class EnergyDashboardApp extends Homey.App {', 'class EnergyDashboardApp {'],
  ['HomeyAPI.createAppAPI({ homey: this.homey })', 'this.createApi()'],
]);
fs.writeFileSync(path.join(target, 'app.js'), banner('homey-app/app.js') + appCode);

// The routes of its web page, with its files in web/energy
const serverCode = edit('webserver.js', fs.readFileSync(path.join(homeyApp, 'lib', 'webserver.js'), 'utf8'), [
  ["path.join(__dirname, '..', 'web')", "path.join(__dirname, '..', '..', 'web', 'energy')"],
  ["path.join(__dirname, '..', 'settings')", "path.join(__dirname, '..', '..', 'web', 'energy', 'settings')"],
  ["path.join(__dirname, '..', 'locales')", "path.join(__dirname, '..', '..', 'web', 'energy', 'locales')"],
  ["Location: '/instellingen/'", "Location: 'instellingen/'"],
  ['src="/settings-web.js?v=${version}"', 'src="../settings-web.js?v=${version}"'],
]);
fs.writeFileSync(path.join(target, 'webserver.js'), banner('homey-app/lib/webserver.js') + serverCode);

// The page and its settings. web/energy/site.js is HomeDeck's own start-up and stays.
fs.mkdirSync(path.join(webTarget, 'settings'), { recursive: true });
fs.mkdirSync(path.join(webTarget, 'locales'), { recursive: true });
const WEB_EDITS = {
  // The switch back to the house is on the same port; a path instead of a port of its own
  'dashboard.js': [['link.href = "".concat(location.protocol, "//").concat(location.hostname, ":").concat(s.port, "/");', 'link.href = s.path || "".concat(location.protocol, "//").concat(location.hostname, ":").concat(s.port, "/");']],
  // Under /energy/instellingen/; without an edit PIN the settings simply open, like HomeDeck's editor
  'settings-web.js': [
    [/"\/api\/settings\//g, '"../api/settings/'],
    ['href="/"', 'href="../"'],
    ['    askPin();\n  });\n})();', '    try {\n      token = (await request("POST", "../api/settings/unlock", { pin: "" })).token;\n      start();\n      const open = document.createElement("p");\n      open.className = "muted";\n      open.id = "no-pin-note";\n      open.textContent = document.documentElement.lang === "nl" ? "Er is geen bewerk-pincode ingesteld: iedereen in je thuisnetwerk kan deze instellingen wijzigen. Je stelt hem in bij de instellingen van HomeDeck in de Homey-app." : "No edit PIN is set: anyone on your home network can change these settings. You can set one in the settings of HomeDeck in the Homey app.";\n      back.after(open);\n      return;\n    } catch {\n    }\n    askPin();\n  });\n})();'],
  ],
  'manifest.webmanifest': [['"name": "Energie Dashboard"', '"name": "HomeDeck Energie"']],
};
for (const name of WEB_FILES) {
  const from = path.join(homeyApp, 'web', name);
  if (WEB_EDITS[name]) fs.writeFileSync(path.join(webTarget, name), edit(name, fs.readFileSync(from, 'utf8'), WEB_EDITS[name]));
  else fs.copyFileSync(from, path.join(webTarget, name));
}
for (const name of SETTINGS_FILES) fs.copyFileSync(path.join(homeyApp, 'settings', name), path.join(webTarget, 'settings', name));
for (const name of ['en.json', 'nl.json']) fs.copyFileSync(path.join(homeyApp, 'locales', name), path.join(webTarget, 'locales', name));

// The Flow cards its logic listens to
const flowTarget = path.join(root, '.homeycompose', 'flow', 'actions');
fs.mkdirSync(flowTarget, { recursive: true });
for (const name of FLOW_CARDS) fs.copyFileSync(path.join(homeyApp, '.homeycompose', 'flow', 'actions', name), path.join(flowTarget, name));

// Its demo data, for the dev server and the demo site
const demoCode = fs.readFileSync(path.join(repo, 'lib', 'demo.js'), 'utf8').replace(/require\('\.\/(\w+)'\)/g, "require('../lib/energy/$1')");
fs.writeFileSync(path.join(root, 'test', 'energy-demo-data.js'), banner('lib/demo.js') + demoCode);

console.log(`synced Energy Dashboard from ${repo}`);
