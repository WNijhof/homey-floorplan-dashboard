'use strict';

// Builds a standalone page that loads the Homey widget with a fake `Homey` object and the sample plan,
// so it can be tried in a normal browser without a Homey. (The web editor and dashboard: scripts/dev-server.js.)
// Usage: node scripts/harness.js widget <out.html> [settingsJSON] [js to run after load]
const fs = require('fs');
const path = require('path');
const { samplePlan, sampleDevices } = require('../test/sample');

const [target = 'widget', out = 'harness.html', settingsJson = '{}', after = ''] = process.argv.slice(2);
const root = path.join(__dirname, '..');
const dir = path.join(root, 'widgets', 'floorplan', 'public');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const plan = samplePlan();
const settings = { plan: { id: plan.id }, ...JSON.parse(settingsJson) };

const fake = `<script>
(function(){
  const plans = { [${JSON.stringify(plan.id)}]: ${JSON.stringify(plan)} };
  const devices = ${JSON.stringify(sampleDevices())};
  const zones = [{id:'root',name:'Home',parent:null},{id:'z_floor',name:'Ground floor',parent:'root'},
    ...['z_hall','z_living','z_kitchen','z_toilet','z_util','z_bed'].map((id)=>({id,name:id.slice(2),parent:'z_floor'}))];
  const listeners = {};
  function route(method, path, body) {
    if (path.startsWith('/plan?') || path === '/plan') return { plan: Object.values(plans)[0], devices };
    if (path === '/weather') return { now: { temperature: 11.4, state: 'Partly cloudy', iconId: 'partly_cloudy_day' }, hourly: [0,1,2,3,4].map((i)=>({ time: Math.round(Date.now()/1000)+i*3600, temperature: 11+i*0.4, iconId: i<2?'partly_cloudy_day':'rain' })), daily: [0,1,2,3,4,5].map((i)=>({ time: Math.round(Date.now()/1000)+i*86400, temperature: 12, temperatureMin: 6+i, temperatureMax: 13+i, iconId: i%2?'clear_day':'cloudy' })) };
    if (path === '/capability') { const d = devices.find((x)=>x.id===body.deviceId); d.caps[body.capabilityId]=body.value; setTimeout(()=>(listeners.caps||[]).forEach((f)=>f({[d.id]:{[body.capabilityId]:body.value}})),50); return true; }
    if (path === '/agenda') { const h = (d, hh, mm) => { const x = new Date(); x.setDate(x.getDate()+d); x.setHours(hh, mm, 0, 0); return x.getTime(); };
      return { events: [
        { title: 'Standup', start: h(0,9,30), end: h(0,9,45), color: '#2e5bff' },
        { title: 'Tandarts', location: 'Centrum', start: h(0,14,0), end: h(0,14,30), color: '#e0453a' },
        { title: 'Vuilnis aan de straat', start: h(1,0,0), end: h(2,0,0), allDay: true, color: '#3aa36b' },
        { title: 'Sport', start: h(1,19,0), end: h(1,20,0), color: '#f0a23c' },
        { title: 'Verjaardag', start: h(3,0,0), end: h(4,0,0), allDay: true, color: '#9b59b6' } ], errors: [] }; }
    if (path === '/calendars') { if (method === 'PUT') { window.__calendars = body; return body; } return window.__calendars || []; }
    if (path === '/data') return { devices, zones };
    if (path === '/plans') return Object.values(plans);
    if (path.startsWith('/plans/')) { const id = path.split('/')[2]; if (method==='DELETE') { delete plans[id]; return true; } plans[id] = body; return body; }
    throw new Error('no route ' + path);
  }
  window.__fakeHomey = {
    ready(){}, getSettings(){ return ${JSON.stringify(settings)}; }, getWidgetInstanceId(){ return 'x'; },
    hapticFeedback(){}, setHeight(){ return Promise.resolve(); }, __: (k)=>k,
    on(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, data){ (listeners[ev] || []).forEach((fn) => fn(data)); },
    get(key, cb){ cb(null, null); }, set(key, v, cb){ cb && cb(null); }, alert(m){ console.log(m); }, confirm(m, i, cb){ cb(null, true); },
    api(method, path, body, cb) {
      let res, err = null;
      try { res = route(method, path, body); } catch (e) { err = e; }
      if (typeof cb === 'function') { setTimeout(()=>cb(err, res), 10); return; }
      return err ? Promise.reject(err) : new Promise((r)=>setTimeout(()=>r(JSON.parse(JSON.stringify(res))), 10));
    },
  };
  window.addEventListener('load', ()=>{ window.onHomeyReady(window.__fakeHomey); setTimeout(()=>{ ${after} }, 400); });
})();
</script>`;

const base = `<base href="file:///${dir.replace(/\\/g, '/')}/">`;
fs.writeFileSync(out, html.replace('<head>', `<head>${base}`).replace('</body>', `${fake}</body>`));
console.log('wrote', out);
