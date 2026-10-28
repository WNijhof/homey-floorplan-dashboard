'use strict';

// Renders the sample plan in several views to an HTML file (open it, or screenshot it headless).
// Usage: node scripts/preview.js <out.html>
const fs = require('fs');
const core = require('../lib/shared/floorplan-core');
const { samplePlan, sampleDevices } = require('../test/sample');

const out = process.argv[2] || 'preview.html';
const plan = samplePlan();
const devices = sampleDevices();
const level = plan.levels[0];

const cells = [
  { title: '2D light, tint temperature', palette: core.LIGHT_PALETTE, view: { mode: '2d' }, tint: 'temperature' },
  { title: '2D dark', palette: core.DARK_PALETTE, view: { mode: '2d' } },
  { title: '2.5D iso dark', palette: core.DARK_PALETTE, view: { mode: 'iso' } },
  { title: '2.5D steep light, turn 1', palette: core.LIGHT_PALETTE, view: { mode: 'steep', turn: 1 } },
].map((c, i) => {
  const r = core.render({ plan, level, devices, view: c.view, palette: c.palette, tint: c.tint, idPrefix: `p${i}` });
  return `<figure style="background:${c.palette.bg};color:${c.palette.text}"><figcaption>${c.title}</figcaption>
<svg viewBox="${r.viewBox.join(' ')}" font-family="system-ui, sans-serif">${r.svg}</svg></figure>`;
});

fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#888;font-family:system-ui}
figure{margin:0;padding:8px;border-radius:12px}svg{width:100%;height:460px;display:block}figcaption{font-size:13px}
</style>${cells.join('')}`);
console.log('wrote', out);
