'use strict';

const core = require('../lib/shared/floorplan-core');

const { rect } = core.geom;
const HALF_PI = Math.PI / 2;

// Names in both languages, for the screenshots of the forum posts.
const NAMES = {
  nl: {
    plan: 'Ons huis', ground: 'Begane grond', first: 'Eerste verdieping',
    living: 'Woonkamer', kitchen: 'Keuken', hall: 'Hal', toilet: 'Toilet', utility: 'Bijkeuken',
    bedroom: 'Slaapkamer', bedroom2: 'Logeerkamer', bathroom: 'Badkamer', landing: 'Overloop',
    floorLamp: 'Leeslamp', diningLamp: 'Eettafel', thermostat: 'Thermostaat', kitchenLamp: 'Keukeneiland', kitchenSensor: 'Keuken sensor',
    hallLamp: 'Hal', frontDoor: 'Voordeur', lock: 'Slot voordeur', smoke: 'Rookmelder', washer: 'Wasmachine', utilitySensor: 'Bijkeuken sensor',
    bedside: 'Bedlamp', bedSensor: 'Slaapkamer sensor', guestLamp: 'Plafondlamp', bathSpots: 'Spots badkamer', bathSensor: 'Badkamer sensor',
    landingLamp: 'Overloop', blind: 'Rolluik woonkamer', bedBlind: 'Rolluik slaapkamer', motion: 'Beweging hal',
  },
  en: {
    plan: 'Our home', ground: 'Ground floor', first: 'First floor',
    living: 'Living room', kitchen: 'Kitchen', hall: 'Hall', toilet: 'Toilet', utility: 'Utility room',
    bedroom: 'Bedroom', bedroom2: 'Guest room', bathroom: 'Bathroom', landing: 'Landing',
    floorLamp: 'Reading lamp', diningLamp: 'Dining table', thermostat: 'Thermostat', kitchenLamp: 'Kitchen island', kitchenSensor: 'Kitchen sensor',
    hallLamp: 'Hall', frontDoor: 'Front door', lock: 'Front door lock', smoke: 'Smoke alarm', washer: 'Washing machine', utilitySensor: 'Utility sensor',
    bedside: 'Bedside lamp', bedSensor: 'Bedroom sensor', guestLamp: 'Ceiling light', bathSpots: 'Bathroom spots', bathSensor: 'Bathroom sensor',
    landingLamp: 'Landing', blind: 'Living room blind', bedBlind: 'Bedroom blind', motion: 'Hall motion',
  },
};

/** A two-storey family house with furniture and two or three devices per room, for demos and screenshots. */
function demoPlan(lang) {
  const N = NAMES[lang] || NAMES.en;
  const f = (type, x, y, rot, extra) => Object.assign(core.newFurniture(type, x, y, lang), { rot: rot || 0 }, extra || {});
  const room = (id, name, zoneId, pts) => ({ id, name, zoneId, points: pts });
  const dev = (id, deviceId, x, y, extra) => Object.assign({ id, kind: 'device', deviceId, x, y }, extra || {});
  const lamp = (fixture, w, d, h, z) => ({ fixture, w, d, h, z: z || 0, reach: 260 });

  const ground = core.newLevel(N.ground);
  ground.rooms = [
    room('r_living', N.living, 'z_living', rect(0, 0, 600, 800)),
    room('r_kitchen', N.kitchen, 'z_kitchen', rect(600, 0, 1000, 350)),
    room('r_hall', N.hall, 'z_hall', rect(600, 350, 820, 800)),
    room('r_toilet', N.toilet, 'z_toilet', rect(820, 350, 1000, 520)),
    room('r_utility', N.utility, 'z_utility', rect(820, 520, 1000, 800)),
  ];
  ground.openings = [
    { id: 'o_front', type: 'door', x: 680, y: 800, angle: 0, width: 90, swing: -1, hinge: 1, devices: ['d_front', 'd_lock'] },
    { id: 'o_living_hall', type: 'door', x: 600, y: 640, angle: HALF_PI, width: 80, swing: -1, hinge: 1, devices: [] },
    { id: 'o_living_kitchen', type: 'door', x: 600, y: 175, angle: HALF_PI, width: 140, swing: 1, hinge: 1, devices: [] },
    { id: 'o_kitchen_hall', type: 'door', x: 680, y: 350, angle: 0, width: 80, swing: 1, hinge: -1, devices: [] },
    { id: 'o_toilet', type: 'door', x: 820, y: 440, angle: HALF_PI, width: 70, swing: 1, hinge: 1, devices: [] },
    { id: 'o_utility', type: 'door', x: 820, y: 600, angle: HALF_PI, width: 80, swing: 1, hinge: -1, devices: [] },
    { id: 'o_w_living', type: 'window', x: 200, y: 0, angle: 0, width: 220, devices: ['d_blind'] },
    { id: 'o_w_garden', type: 'window', x: 300, y: 800, angle: 0, width: 280, devices: [] },
    { id: 'o_w_kitchen', type: 'window', x: 820, y: 0, angle: 0, width: 140, devices: [] },
    { id: 'o_w_utility', type: 'window', x: 1000, y: 680, angle: HALF_PI, width: 100, devices: [] },
  ];
  ground.items = [
    // Living room: sitting area facing the TV, dining table by the garden window
    f('kk-rug_rectangle_stripes_A', 190, 250, 90, { w: 240, d: 170 }),
    f('k-cabinetTelevision', 22, 250, 270), f('k-televisionModern', 20, 250, 270, { z: 50 }),
    f('kk-couch_pillows', 335, 250, 90), f('q-CoffeeTable', 180, 250, 90), f('kk-armchair_pillows', 160, 55, 0),
    f('k-pottedPlant', 560, 40), f('q-BookCaseLargeBooks', 560, 430, 90, { w: 160 }),
    f('k-table', 300, 640, 0), f('kk-chair_B_wood', 255, 578, 0), f('kk-chair_B_wood', 345, 578, 0),
    f('kk-chair_B_wood', 255, 702, 180), f('kk-chair_B_wood', 345, 702, 180),
    // Kitchen: units along the front, an island with stools
    f('k-kitchenCabinet', 640, 30), f('k-kitchenStove', 700, 30), f('k-kitchenCabinetDrawer', 760, 30), f('k-kitchenSink', 830, 30),
    f('k-kitchenCabinet', 900, 30), f('k-kitchenFridge', 962, 34),
    f('k-kitchenBar', 790, 210), f('k-stoolBar', 760, 272, 180), f('k-stoolBar', 820, 272, 180),
    // Hall with the stairs; toilet; utility room
    f('own-stairs', 775, 600, 0, { w: 90, d: 300, h: 270 }), f('k-coatRack', 615, 500, 270),
    f('k-toilet', 910, 385), f('k-bathroomSink', 975, 450, 90, { w: 40, d: 30 }),
    f('k-washer', 860, 768, 180), f('k-dryer', 925, 768, 180),
    // Devices
    dev('i_floor', 'd_floor', 395, 110, lamp('k-lampRoundFloor', 40, 40, 170)),
    dev('i_dining', 'd_dining', 300, 640, lamp('fx-pendant', 40, 40, 80)),
    dev('i_thermo', 'd_thermo', 588, 560),
    dev('i_kitchen', 'd_kitchen', 790, 210, lamp('fx-pendant', 35, 35, 90)),
    dev('i_ksensor', 'd_ksensor', 988, 220),
    dev('i_hall', 'd_hall', 690, 470, lamp('fx-ceiling', 40, 40, 10)),
    dev('i_smoke', 'd_smoke', 690, 400),
    dev('i_washer', 'd_washer', 892, 715),
  ];

  const first = core.newLevel(N.first);
  first.rooms = [
    room('r_bed', N.bedroom, 'z_bed', rect(0, 0, 550, 450)),
    room('r_guest', N.bedroom2, 'z_guest', rect(550, 0, 1000, 450)),
    room('r_bath', N.bathroom, 'z_bath', rect(0, 450, 400, 800)),
    room('r_landing', N.landing, 'z_landing', rect(400, 450, 1000, 800)),
  ];
  first.openings = [
    { id: 'o_bed', type: 'door', x: 480, y: 450, angle: 0, width: 80, swing: -1, hinge: 1, devices: [] },
    { id: 'o_guest', type: 'door', x: 640, y: 450, angle: 0, width: 80, swing: -1, hinge: -1, devices: [] },
    { id: 'o_bath', type: 'door', x: 400, y: 530, angle: HALF_PI, width: 70, swing: -1, hinge: 1, devices: [] },
    { id: 'o_w_bed', type: 'window', x: 260, y: 0, angle: 0, width: 180, devices: ['d_bedblind'] },
    { id: 'o_w_guest', type: 'window', x: 780, y: 0, angle: 0, width: 140, devices: [] },
    { id: 'o_w_bath', type: 'window', x: 0, y: 620, angle: HALF_PI, width: 90, devices: [] },
  ];
  first.items = [
    // Bedroom
    f('kk-bed_double_B', 260, 110, 0), f('k-cabinetBedDrawerTable', 150, 25), f('k-cabinetBedDrawerTable', 370, 25),
    f('q-Closet', 90, 420, 180), f('q-Closet', 180, 420, 180), f('k-rugRounded', 260, 290, 0, { w: 180, d: 110 }),
    // Guest room
    f('kk-bed_single_A', 610, 115, 0), f('k-desk', 900, 40, 0), f('k-chairDesk', 900, 100, 180), f('k-bookcaseOpen', 980, 300, 90),
    f('k-rugRound', 760, 290, 0, { w: 140, d: 140 }),
    // Bathroom
    f('k-bathtub', 40, 620, 270), f('k-shower', 350, 750, 180), f('k-bathroomSink', 220, 778, 180), f('k-toilet', 330, 485),
    // Landing: a cabinet (the stairs stand on the ground floor)
    f('kk-cabinet_medium', 520, 775, 180), f('k-pottedPlant', 960, 760),
    // Devices
    dev('i_bedside', 'd_bedside', 150, 25, lamp('k-lampRoundTable', 30, 30, 50, 55)),
    dev('i_bsensor', 'd_bsensor', 535, 300),
    dev('i_guest', 'd_guest', 760, 225, lamp('fx-ceiling', 40, 40, 10)),
    dev('i_spots', 'd_spots', 210, 620, lamp('fx-spot', 12, 12, 6)),
    dev('i_bathsensor', 'd_bathsensor', 385, 690),
    dev('i_landing', 'd_landing', 600, 640, lamp('fx-ceiling', 40, 40, 10)),
    dev('i_motion', 'd_motion', 985, 785),
  ];

  const plan = core.newPlan(N.plan);
  plan.id = 'plan_demo';
  plan.levels = [ground, first];
  return plan;
}

function demoDevices(lang) {
  const N = NAMES[lang] || NAMES.en;
  const d = (id, name, zone, cls, caps) => ({ id, name, zone, cls, available: true, caps, units: {} });
  return [
    d('d_floor', N.floorLamp, 'z_living', 'light', { onoff: true, dim: 0.6, light_temperature: 0.85, light_mode: 'temperature' }),
    d('d_alarm', lang === 'nl' ? 'Huisalarm' : 'House alarm', 'z_hall', 'homealarm', { homealarm_state: 'disarmed', alarm_generic: false }),
    d('d_speaker', lang === 'nl' ? 'Speaker woonkamer' : 'Living room speaker', 'z_living', 'speaker', { speaker_playing: false, speaker_track: 'Blue in Green', speaker_artist: 'Miles Davis', volume_set: 0.3 }),
    d('d_vacuum', lang === 'nl' ? 'Robotstofzuiger' : 'Robot vacuum', 'z_living', 'vacuumcleaner', { vacuumcleaner_state: 'docked', measure_battery: 87 }),
    d('d_out_door', lang === 'nl' ? 'Lamp voordeur' : 'Front door light', 'z_hall', 'light', { onoff: true }),
    d('d_out_path', lang === 'nl' ? 'Lampjes tuinpad' : 'Path lights', 'z_hall', 'light', { onoff: true }),
    d('d_out_drive', lang === 'nl' ? 'Lampen oprit' : 'Driveway lights', 'z_hall', 'light', { onoff: true }),
    d('d_out_garden', lang === 'nl' ? 'Tuinverlichting' : 'Garden lights', 'z_hall', 'light', { onoff: true }),
    d('d_dining', N.diningLamp, 'z_living', 'light', { onoff: true, dim: 0.9, light_temperature: 0.7, light_mode: 'temperature' }),
    d('d_thermo', N.thermostat, 'z_living', 'thermostat', { measure_temperature: 20.6, target_temperature: 21, measure_humidity: 52 }),
    d('d_blind', N.blind, 'z_living', 'windowcoverings', { windowcoverings_set: 0.7 }),
    d('d_kitchen', N.kitchenLamp, 'z_kitchen', 'light', { onoff: true, dim: 1, light_temperature: 0.6, light_mode: 'temperature' }),
    d('d_ksensor', N.kitchenSensor, 'z_kitchen', 'sensor', { measure_temperature: 21.4, measure_humidity: 58 }),
    d('d_hall', N.hallLamp, 'z_hall', 'light', { onoff: false, dim: 0.5 }),
    d('d_smoke', N.smoke, 'z_hall', 'sensor', { alarm_smoke: false }),
    d('d_front', N.frontDoor, 'z_hall', 'sensor', { alarm_contact: false }),
    d('d_lock', N.lock, 'z_hall', 'lock', { locked: true }),
    d('d_washer', N.washer, 'z_utility', 'socket', { onoff: true, measure_power: 1840 }),
    d('d_bedside', N.bedside, 'z_bed', 'light', { onoff: true, dim: 0.35, light_hue: 0.08, light_saturation: 0.6, light_mode: 'color' }),
    d('d_bsensor', N.bedSensor, 'z_bed', 'sensor', { measure_temperature: 17.8, measure_humidity: 47 }),
    d('d_bedblind', N.bedBlind, 'z_bed', 'windowcoverings', { windowcoverings_set: 0.1 }),
    d('d_guest', N.guestLamp, 'z_guest', 'light', { onoff: false, dim: 0.8 }),
    d('d_spots', N.bathSpots, 'z_bath', 'light', { onoff: true, dim: 0.8 }),
    d('d_bathsensor', N.bathSensor, 'z_bath', 'sensor', { measure_temperature: 22.3, measure_humidity: 68 }),
    d('d_landing', N.landingLamp, 'z_landing', 'light', { onoff: false, dim: 0.6 }),
    d('d_motion', N.motion, 'z_landing', 'sensor', { alarm_motion: false }),
  ];
}

function demoZones(lang) {
  const N = NAMES[lang] || NAMES.en;
  const z = (id, name, parent) => ({ id, name, parent });
  return [
    z('root', N.plan, null), z('z_ground', N.ground, 'root'), z('z_first', N.first, 'root'),
    z('z_living', N.living, 'z_ground'), z('z_kitchen', N.kitchen, 'z_ground'), z('z_hall', N.hall, 'z_ground'), z('z_toilet', N.toilet, 'z_ground'), z('z_utility', N.utility, 'z_ground'),
    z('z_bed', N.bedroom, 'z_first'), z('z_guest', N.bedroom2, 'z_first'), z('z_bath', N.bathroom, 'z_first'), z('z_landing', N.landing, 'z_first'),
  ];
}

module.exports = { demoPlan, demoDevices, demoZones };
