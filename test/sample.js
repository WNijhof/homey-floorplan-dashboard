'use strict';

const core = require('../lib/shared/floorplan-core');

const { rect } = core.geom;

/** A small apartment with a few fake devices, used by tests and preview renders. */
function samplePlan() {
  const level = core.newLevel('Ground floor');
  const room = (id, name, zoneId, pts) => ({ id, name, zoneId, points: pts });
  level.rooms = [
    room('r_hall', 'Hallway', 'z_hall', rect(0, 300, 300, 800)),
    room('r_living', 'Living room', 'z_living', rect(300, 0, 900, 500)),
    room('r_kitchen', 'Kitchen', 'z_kitchen', rect(900, 0, 1300, 500)),
    room('r_toilet', 'Toilet', 'z_toilet', rect(300, 500, 500, 800)),
    room('r_util', 'Utility room', 'z_util', rect(500, 500, 900, 800)),
    room('r_bed', 'Bedroom', 'z_bed', rect(900, 500, 1300, 800)),
  ];
  level.openings = [
    { id: 'o_front', type: 'door', x: 0, y: 550, angle: Math.PI / 2, width: 90, swing: -1, hinge: 1, devices: ['d_contact', 'd_lock'] },
    { id: 'o_hall_living', type: 'door', x: 300, y: 420, angle: Math.PI / 2, width: 80, swing: 1, hinge: 1, devices: [] },
    { id: 'o_living_kitchen', type: 'door', x: 900, y: 250, angle: Math.PI / 2, width: 120, swing: 1, hinge: 1, devices: [] },
    { id: 'o_toilet', type: 'door', x: 300, y: 650, angle: Math.PI / 2, width: 70, swing: 1, hinge: -1, devices: [] },
    { id: 'o_bed', type: 'door', x: 1100, y: 500, angle: 0, width: 80, swing: 1, hinge: 1, devices: ['d_bed_contact'] },
    { id: 'o_w1', type: 'window', x: 600, y: 0, angle: 0, width: 240, devices: ['d_blind'] },
    { id: 'o_w2', type: 'window', x: 1100, y: 0, angle: 0, width: 160, devices: [] },
    { id: 'o_w3', type: 'window', x: 1300, y: 650, angle: Math.PI / 2, width: 140, devices: ['d_bed_blind'] },
  ];
  const f = (type, x, y, rot, extra) => Object.assign(core.newFurniture(type, x, y, 'en'), { rot: rot || 0 }, extra || {});
  level.items = [
    // Living room
    f('k-loungeSofa', 600, 410, 180), f('k-cabinetTelevision', 600, 30, 0), f('k-televisionModern', 600, 28, 0, { z: 50 }),
    f('k-tableCoffee', 600, 290, 0), f('k-rugRectangle', 600, 290, 0, { w: 260, d: 170 }), f('k-pottedPlant', 860, 40),
    f('k-loungeChair', 400, 300, 90), f('kk-table_medium', 420, 110, 0), f('kk-chair_A_wood', 420, 50, 180), f('kk-chair_A_wood', 420, 170, 0),
    // Kitchen
    f('k-kitchenCabinet', 940, 30), f('k-kitchenStove', 1000, 30), f('k-kitchenCabinetDrawer', 1060, 30), f('k-kitchenSink', 1130, 30),
    f('k-kitchenCabinet', 1200, 30), f('k-kitchenFridge', 1260, 210, 90),
    f('k-kitchenCabinetUpper', 1040, 18), f('k-kitchenCabinetUpper', 1160, 18),
    f('k-kitchenBar', 1060, 300), f('k-stoolBar', 1030, 360), f('k-stoolBar', 1090, 360),
    // Bathroom and utility
    f('k-toilet', 400, 760, 180), f('k-bathroomSink', 470, 545, 270),
    f('k-washer', 560, 765, 180), f('k-dryer', 630, 765, 180),
    // Bedroom
    f('kk-bed_double_A', 1110, 690, 180), f('k-cabinetBedDrawerTable', 1005, 770, 180), f('k-bookcaseClosedWide', 960, 640, 90),
    // Hall
    f('k-coatRackStanding', 50, 350),
    // Lights and devices
    { id: 'i_l1', kind: 'device', deviceId: 'd_light_living', x: 600, y: 300, reach: 320, fixture: 'fx-pendant', w: 40, d: 40, h: 80 },
    { id: 'i_l2', kind: 'device', deviceId: 'd_light_kitchen', x: 1060, y: 300, reach: 260, fixture: 'fx-pendant', w: 35, d: 35, h: 90 },
    { id: 'i_l3', kind: 'device', deviceId: 'd_light_hall', x: 150, y: 550, reach: 220, fixture: 'fx-ceiling', w: 40, d: 40, h: 10 },
    { id: 'i_l4', kind: 'device', deviceId: 'd_light_bed', x: 1005, y: 770, reach: 200, fixture: 'k-lampRoundTable', w: 30, d: 30, h: 50, z: 55 },
    { id: 'i_l5', kind: 'device', deviceId: 'd_light_floor', x: 340, y: 430, reach: 230, fixture: 'k-lampRoundFloor', w: 40, d: 40, h: 170 },
    { id: 'i_t1', kind: 'device', deviceId: 'd_thermo', x: 320, y: 300 },
    { id: 'i_p1', kind: 'device', deviceId: 'd_plug', x: 700, y: 485 },
    { id: 'i_s1', kind: 'device', deviceId: 'd_smoke', x: 150, y: 380 },
    { id: 'i_m1', kind: 'device', deviceId: 'd_motion', x: 20, y: 760 },
    { id: 'i_sp', kind: 'device', deviceId: 'd_speaker', x: 820, y: 30 },
  ];
  const plan = core.newPlan('Sample home');
  plan.levels = [level];
  return plan;
}

function sampleDevices() {
  const d = (id, name, zone, cls, caps) => ({ id, name, zone, cls, available: true, caps, units: {} });
  return [
    d('d_light_living', 'Living lamp', 'z_living', 'light', { onoff: true, dim: 0.8, light_temperature: 0.8, light_mode: 'temperature' }),
    d('d_light_kitchen', 'Kitchen spots', 'z_kitchen', 'light', { onoff: true, dim: 1, light_hue: 0.6, light_saturation: 0.7, light_mode: 'color' }),
    d('d_light_hall', 'Hall light', 'z_hall', 'light', { onoff: false, dim: 0.5 }),
    d('d_light_bed', 'Bedside', 'z_bed', 'light', { onoff: true, dim: 0.3 }),
    d('d_light_floor', 'Reading lamp', 'z_living', 'light', { onoff: true, dim: 0.6, light_temperature: 0.9, light_mode: 'temperature' }),
    d('d_thermo', 'Thermostat', 'z_living', 'thermostat', { measure_temperature: 20.9, target_temperature: 21 }),
    d('d_temp_kitchen', 'Kitchen sensor', 'z_kitchen', 'sensor', { measure_temperature: 21.6, measure_humidity: 55 }),
    d('d_temp_hall', 'Hall sensor', 'z_hall', 'sensor', { measure_temperature: 19.9, measure_humidity: 48 }),
    d('d_temp_util', 'Utility sensor', 'z_util', 'sensor', { measure_temperature: 20.8, measure_humidity: 71 }),
    d('d_temp_bed', 'Bedroom sensor', 'z_bed', 'sensor', { measure_temperature: 17.2, measure_humidity: 44 }),
    d('d_plug', 'TV plug', 'z_living', 'socket', { onoff: true, measure_power: 85 }),
    d('d_smoke', 'Smoke detector', 'z_hall', 'sensor', { alarm_smoke: false }),
    d('d_motion', 'Hall motion', 'z_hall', 'sensor', { alarm_motion: true }),
    d('d_contact', 'Front door', 'z_hall', 'sensor', { alarm_contact: false }),
    d('d_bed_contact', 'Bedroom door', 'z_bed', 'sensor', { alarm_contact: true }),
    d('d_lock', 'Front lock', 'z_hall', 'lock', { locked: true }),
    d('d_blind', 'Living blind', 'z_living', 'windowcoverings', { windowcoverings_set: 0.6 }),
    d('d_bed_blind', 'Bedroom blind', 'z_bed', 'windowcoverings', { windowcoverings_set: 0 }),
    d('d_speaker', 'Sonos', 'z_living', 'speaker', { speaker_playing: false }),
  ];
}

module.exports = { samplePlan, sampleDevices };
