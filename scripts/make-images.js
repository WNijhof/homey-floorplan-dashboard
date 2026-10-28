'use strict';

// Renders the store images and widget previews from the sample plan with headless Edge/Chrome.
// Usage: node scripts/make-images.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('../lib/shared/floorplan-core');
const { samplePlan, sampleDevices } = require('../test/sample');

const root = path.join(__dirname, '..');
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((b) => fs.existsSync(b));

const plan = samplePlan();
const level = plan.levels[0];
const devices = sampleDevices();

function shoot(out, w, h, { palette, view, bg, pad = 0.04 }) {
  const r = core.render({ plan, level, devices, view, palette, idPrefix: 'i' });
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}
svg{width:${w * (1 - pad * 2)}px;height:${h * (1 - pad * 2)}px;margin:${h * pad}px ${w * pad}px;display:block;font-family:system-ui,sans-serif}</style>
<svg viewBox="${r.viewBox.join(' ')}">${r.svg}</svg>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-img-'));
  const file = path.join(dir, 'p.html');
  fs.writeFileSync(file, html);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--screenshot=${out}`, `file:///${file.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('wrote', path.relative(root, out));
}

const dark = { palette: core.DARK_PALETTE, view: { mode: 'iso' }, bg: '#151515' };
const light = { palette: core.LIGHT_PALETTE, view: { mode: '2d' }, bg: '#f4f3ef' };
fs.mkdirSync(path.join(root, 'assets', 'images'), { recursive: true });
shoot(path.join(root, 'assets', 'images', 'small.png'), 250, 175, dark);
shoot(path.join(root, 'assets', 'images', 'large.png'), 500, 350, dark);
shoot(path.join(root, 'assets', 'images', 'xlarge.png'), 1000, 700, dark);
shoot(path.join(root, 'widgets', 'floorplan', 'preview-dark.png'), 1024, 768, { ...dark, view: { mode: '2d' } });
shoot(path.join(root, 'widgets', 'floorplan', 'preview-light.png'), 1024, 768, light);
