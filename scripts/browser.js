'use strict';

// The browser for the checks: Brave on the real graphics card when this pc has it, as a tablet draws 3D; else Edge or
// Chrome with software 3D, which works everywhere but is many times slower. Always with a profile of its own.
// HOMEDECK_SOFTWARE=1 forces the software way.
const fs = require('fs');

const BRAVE = [
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/usr/bin/brave-browser',
];
const OTHERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function pickBrowser() {
  const brave = process.env.HOMEDECK_SOFTWARE ? null : BRAVE.find((b) => fs.existsSync(b));
  if (brave) return { path: brave, gpu: true, args: ['--headless=new', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'] };
  return { path: OTHERS.find((b) => fs.existsSync(b)), gpu: false, args: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] };
}

module.exports = { pickBrowser };
