'use strict';

// The widget is served from its own static folder, so it gets a copy of the shared files.
// (The web pages get them straight from lib/shared through lib/WebServer.js.)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targetDirs = [path.join(root, 'widgets', 'floorplan', 'public')];

for (const name of ['floorplan-core.js', 'models.js', 'house-core.js']) {
  const code = `/* Generated from lib/shared/${name} by scripts/sync-shared.js. Do not edit. */\n${fs.readFileSync(path.join(root, 'lib', 'shared', name), 'utf8')}`;
  for (const dir of targetDirs) fs.writeFileSync(path.join(dir, name), code);
}
console.log(`synced floorplan-core.js, models.js and house-core.js to ${targetDirs.length} place(s)`);
