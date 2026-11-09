/*
 * Furniture and light fixture catalogue: which 3D model a piece uses, its real size (cm), where it sits,
 * and the simple shape (`parts`) used where models are not available (Homey widget, 2.5D SVG view).
 * Models: Kenney Furniture Pack and KayKit Furniture Bits, both CC0. Fixtures without a file are drawn in code.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FloorplanModels = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const GROUPS = [
    ['sofas', 'Banken en fauteuils', 'Sofas and armchairs'],
    ['beds', 'Bedden', 'Beds'],
    ['tables', 'Tafels', 'Tables'],
    ['chairs', 'Stoelen en krukken', 'Chairs and stools'],
    ['storage', 'Kasten en planken', 'Cabinets and shelves'],
    ['kitchen', 'Keukenkasten', 'Kitchen units'],
    ['appliances', 'Huishoudapparaten', 'Appliances'],
    ['bath', 'Badkamer', 'Bathroom'],
    ['media', 'Audio en video', 'Audio and video'],
    ['lights', 'Verlichting', 'Lighting'],
    ['decor', 'Planten en decoratie', 'Plants and decoration'],
    ['climate', 'Klimaat', 'Climate'],
    ['structure', 'Trappen', 'Stairs'],
    ['other', 'Overig', 'Other'],
  ].map(([id, nl, en]) => ({ id, name: { nl, en } }));

  const PACKS = {
    kenney: { name: 'Kenney Furniture Pack', author: 'Kenney', url: 'https://kenney.nl', license: 'CC0 1.0' },
    kaykit: { name: 'KayKit Furniture Bits', author: 'Kay Lousberg', url: 'https://www.kaylousberg.com', license: 'CC0 1.0' },
    quaternius: { name: 'Furniture Pack', author: 'Quaternius', url: 'https://quaternius.com', license: 'CC0 1.0' },
    own: { name: 'HomeDeck', author: '', url: '', license: '' },
  };

  // Turn (degrees) so a model's front faces +Z (towards the room, the plan's +y).
  const YAW = { kenney: 180, kaykit: 0, quaternius: 270 };

  // The main colours of each model, from its top view: what the simple shapes (2.5D, Homey widget) are painted with.
  const COLORS = {"k-loungeSofa":["#ff8c5b"],"k-loungeSofaLong":["#ff8c5b"],"k-loungeSofaCorner":["#ff8c5b"],"k-loungeSofaOttoman":["#ff8c5b"],"k-loungeChair":["#ff8c5b"],"k-loungeChairRelax":["#fe8c5b"],"kk-couch":["#85c9f5","#74b6d9"],"kk-couch_pillows":["#fecb64"],"kk-armchair":["#85c9f5","#69a6c8"],"kk-armchair_pillows":["#fdca64","#76bbe7"],"k-bedDouble":["#ff8c5b","#ffffff"],"k-bedSingle":["#ff8c5b","#ffffff"],"k-bedBunk":["#ff8c5b","#fefffe"],"kk-bed_double_A":["#8bd4fa","#fcfcfc"],"kk-bed_double_B":["#8bd4fa","#fcfcfc"],"kk-bed_single_A":["#8bd4fa","#fefefe"],"kk-bed_single_B":["#8bd4fa","#fefefe"],"k-cabinetBedDrawerTable":["#edbc7c"],"k-table":["#edbc7c"],"k-tableCloth":["#ff8c5b","#edbc7c"],"k-tableGlass":["#c7ebdb","#86a8a8"],"k-tableRound":["#edbc7c"],"k-tableCross":["#edbc7c"],"k-tableCoffee":["#edbc7c"],"k-tableCoffeeGlass":["#c7ebdb","#86a8a7"],"k-tableCoffeeSquare":["#edbc7c"],"k-sideTable":["#edbc7c"],"k-sideTableDrawers":["#edbc7c"],"k-desk":["#edbc7c"],"k-deskCorner":["#edbc7c"],"kk-table_medium_long":["#ba7457"],"kk-table_medium":["#b97457"],"kk-table_low":["#c07a5f"],"kk-table_small":["#ba7457","#d4937b"],"k-chair":["#edbc7c"],"k-chairCushion":["#ff8c5b","#edbc7c"],"k-chairRounded":["#edbc7c"],"k-chairDesk":["#fe8c5b"],"k-stoolBar":["#ff8c5b"],"k-stoolBarSquare":["#ff8c5b"],"k-bench":["#edbc7c"],"k-benchCushion":["#ff8c5b","#edbc7c"],"kk-chair_A":["#77bbeb","#b97557"],"kk-chair_A_wood":["#b77359","#995b45"],"kk-chair_B":["#77bbeb","#98e6fd"],"kk-chair_B_wood":["#b77359","#975a44"],"kk-chair_C":["#75b7ea","#99e8fe"],"kk-chair_stool":["#75b9e8"],"kk-chair_stool_wood":["#b26d55","#c58875"],"k-bookcaseOpen":["#edbc7c"],"k-bookcaseOpenLow":["#edbc7c"],"k-bookcaseClosed":["#edbc7c"],"k-bookcaseClosedDoors":["#edbc7c"],"k-bookcaseClosedWide":["#edbc7c"],"k-cabinetTelevision":["#edbc7c"],"k-cabinetTelevisionDoors":["#edbc7c"],"k-cabinetBedDrawer":["#edbc7c"],"k-coatRackStanding":["#e7b778","#c49a64"],"k-coatRack":["#edbc7c"],"kk-cabinet_medium":["#ba7457"],"kk-cabinet_medium_decorated":["#ba7558","#fd8c46"],"kk-cabinet_small":["#b97457"],"kk-cabinet_small_decorated":["#b87456","#feb556"],"kk-shelf_A_big":["#c17c60"],"kk-shelf_A_small":["#bb7558","#d38b68"],"kk-shelf_B_large":["#ba7558"],"kk-shelf_B_large_decorated":["#ba7558","#fdfefe"],"kk-shelf_B_small":["#ba7558","#d99476"],"k-kitchenCabinet":["#85a7a7"],"k-kitchenCabinetDrawer":["#ffffff"],"k-kitchenSink":["#85a7a7"],"k-kitchenStove":["#85a7a7","#fdfdfd"],"k-kitchenStoveElectric":["#222a2a","#85a7a7"],"k-kitchenCabinetCornerInner":["#85a7a7"],"k-kitchenCabinetCornerRound":["#85a7a7"],"k-kitchenBar":["#85a7a7"],"k-kitchenBarEnd":["#85a7a7"],"k-kitchenCabinetUpper":["#edbc7c"],"k-kitchenCabinetUpperDouble":["#edbc7c"],"k-kitchenCabinetUpperLow":["#edbc7c"],"k-kitchenCabinetUpperCorner":["#edbc7c"],"k-kitchenFridge":["#a9b8b0"],"k-kitchenFridgeBuiltIn":["#edbc7c"],"k-kitchenFridgeSmall":["#a9b8b0"],"k-kitchenMicrowave":["#ffffff"],"k-kitchenCoffeeMachine":["#495c5c","#85a7a7"],"k-kitchenBlender":["#495d5d","#2b3737"],"k-washer":["#a9b8b0"],"k-dryer":["#a9b8b0"],"k-washerDryerStacked":["#a9b8b0"],"k-trashcan":["#1c2424","#313a3a"],"k-bathtub":["#fefefe"],"k-shower":["#feffff"],"k-toilet":["#ffffff"],"k-bathroomSink":["#fefefe"],"k-bathroomCabinet":["#edbc7c"],"k-bathroomMirror":["#c7ebdb","#ecbb7b"],"k-televisionModern":["#222a2a"],"k-televisionVintage":["#edbc7c","#222a2a"],"k-speaker":["#edbc7c"],"k-speakerSmall":["#edbc7c"],"k-radio":["#edbc7c","#4a5e5e"],"k-computerScreen":["#1d2525","#6b8786"],"k-laptop":["#222a2a","#495d5d"],"k-lampSquareCeiling":["#ffffa9","#85a7a7"],"k-ceilingFan":["#edbc7c","#a9b8b0"],"k-lampRoundFloor":["#85a7a7","#b8a768"],"k-lampSquareFloor":["#ffffa9","#85a7a7"],"kk-lamp_standing":["#a2978a","#d6c9b9"],"k-lampRoundTable":["#85a7a7","#b8a668"],"k-lampSquareTable":["#ffffa9","#85a7a7"],"kk-lamp_table":["#a3988a","#d6c9b9"],"k-pottedPlant":["#ecbc7c","#44a671"],"k-plantSmall1":["#edbc7c","#63eba4"],"k-plantSmall2":["#edbc7c"],"kk-cactus_medium_A":["#f48348","#b7745c"],"kk-cactus_small_A":["#e67b46","#c76836"],"k-rugRectangle":["#ff8c5b"],"k-rugRound":["#fe8c5b","#d3724c"],"k-rugRounded":["#ff8c5b","#d3734c"],"kk-rug_oval_A":["#ffd36a"],"kk-rug_rectangle_stripes_A":["#ffca66"],"kk-pictureframe_large_A":["#d48b68","#b87757"],"kk-pictureframe_medium":["#d48b68","#b87656"],"kk-book_set":["#ffffff","#ffd56a"],"k-cardboardBoxClosed":["#eab97a"],"q-Sofa":["#7fa2c3","#6e8ba8"],"q-SofaDouble":["#7fa2c3"],"q-SofaLong":["#7fa2c3"],"q-Bed":["#b1cff6","#fefefe"],"q-BedKing":["#b1cff6","#fefefe"],"q-BookCaseBooks":["#db9c69"],"q-BookCase":["#db9c69"],"q-BookCaseLargeBooks":["#db9c69"],"q-BookCaseLarge":["#db9c69"],"q-Closet":["#8a5739"],"q-Closet2":["#8b583a","#db9c69"],"q-Chair":["#db9c69"],"q-ChairCushioned":["#ca4f49","#d99b68"],"q-ChairHandle":["#db9c69"],"q-Stool":["#db9c69"],"q-CoffeeTable":["#db9c69"],"q-CoffeeTable2":["#db9c69"],"q-Table":["#db9c69"],"q-Lamp":["#afa38b","#56575a"],"q-Lamp2":["#afa38b","#56575a"],"q-Plant":["#6a4838","#5cab56"],"q-Vase":["#f2eddf","#9b968a"],"q-Vase2":["#f2eddf","#a8a398"]};

  // The base colours of the materials of each model, biggest surface first: the editor offers one colour field for each.
  const MATERIALS = {"k-bathroomCabinet":["#d4a76c","#a8d3d3","#ba925e"],"k-bathroomMirror":["#d4a76c","#b2d3c4","#a8d3d3"],"k-bathroomSink":["#ffffff","#d6e8de"],"k-bathtub":["#d6e8de","#f8ffff"],"k-bear":["#a5754c","#d4a76c","#2a3535"],"k-bedBunk":["#d4a76c","#e87b4d","#f8ffff"],"k-bedDouble":["#d4a76c","#f8ffff","#e87b4d","#a8d3d3"],"k-bedSingle":["#d4a76c","#e87b4d","#f8ffff","#a8d3d3"],"k-benchCushion":["#d4a76c","#e87b4d"],"k-benchCushionLow":["#d4a76c","#e87b4d","#ffffff"],"k-books":["#ba623d","#a8d3d3","#5ce09c","#f8ffff"],"k-cabinetBed":["#d4a76c","#a8d3d3"],"k-cabinetBedDrawer":["#d4a76c","#ffffff","#a8d3d3"],"k-cabinetBedDrawerTable":["#d4a76c","#ffffff","#a8d3d3"],"k-cabinetTelevisionDoors":["#d4a76c","#a8d3d3"],"k-cardboardBoxClosed":["#d4a76c","#ba925e"],"k-cardboardBoxOpen":["#d4a76c","#ba925e"],"k-ceilingFan":["#d4a76c","#d6e8de","#ffe996"],"k-chairCushion":["#d4a76c","#e87b4d"],"k-chairDesk":["#e87b4d","#5e7777"],"k-coatRack":["#d4a76c","#5e7777"],"k-computerKeyboard":["#2a3535","#5e7777"],"k-computerScreen":["#2a3535","#a8d3d3"],"k-doorway":["#d4a76c","#a8d3d3"],"k-doorwayFront":["#2a3535","#f8ffff","#b2d3c4","#a8d3d3"],"k-dryer":["#d6e8de","#5e7777","#2a3535"],"k-kitchenBar":["#d4a76c","#a8d3d3","#ba925e"],"k-kitchenBarEnd":["#d4a76c","#a8d3d3"],"k-kitchenBlender":["#b2d3c4","#5e7777","#a8d3d3"],"k-kitchenCabinet":["#d4a76c","#a8d3d3","#ba925e"],"k-kitchenCabinetCornerInner":["#d4a76c","#a8d3d3"],"k-kitchenCabinetCornerRound":["#d4a76c","#a8d3d3"],"k-kitchenCabinetDrawer":["#d4a76c","#f8ffff","#d6e8de"],"k-kitchenCabinetDrawer1":["#d4a76c","#a8d3d3","#ba925e"],"k-kitchenCabinetUpper":["#d4a76c","#ba925e"],"k-kitchenCabinetUpperDouble":["#d4a76c","#ba925e","#a8d3d3"],"k-kitchenCabinetUpperLow":["#d4a76c","#ba925e","#a8d3d3"],"k-kitchenCoffeeMachine":["#5e7777","#a8d3d3","#f8ffff"],"k-kitchenFridge":["#d6e8de","#b2d3c4","#2a3535"],"k-kitchenFridgeBuiltIn":["#d6e8de","#d4a76c","#b2d3c4","#ba925e"],"k-kitchenFridgeSmall":["#d6e8de","#b2d3c4","#2a3535"],"k-kitchenMicrowave":["#f8ffff","#5e7777","#b2d3c4","#2a3535"],"k-kitchenSink":["#d4a76c","#a8d3d3","#ba925e","#d6e8de"],"k-kitchenStove":["#2a3535","#d4a76c","#a8d3d3","#b2d3c4","#f8ffff"],"k-kitchenStoveElectric":["#2a3535","#d4a76c","#a8d3d3","#b2d3c4","#5e7777"],"k-lampRoundFloor":["#ffe996","#a8d3d3"],"k-lampRoundTable":["#ffe996","#a8d3d3"],"k-lampSquareCeiling":["#ffe996","#a8d3d3"],"k-lampSquareFloor":["#ffe996","#a8d3d3"],"k-lampSquareTable":["#ffe996","#a8d3d3"],"k-laptop":["#2a3535","#a8d3d3","#5e7777"],"k-loungeChair":["#e87b4d","#d4a76c"],"k-loungeChairRelax":["#e87b4d","#d4a76c","#a8d3d3"],"k-loungeSofa":["#e87b4d","#d4a76c"],"k-loungeSofaCorner":["#e87b4d","#d4a76c"],"k-loungeSofaLong":["#e87b4d","#d4a76c"],"k-loungeSofaOttoman":["#e87b4d","#d4a76c"],"k-plantSmall1":["#d4a76c","#5ce09c"],"k-plantSmall2":["#d4a76c","#5ce09c"],"k-plantSmall3":["#d4a76c","#5ce09c"],"k-pottedPlant":["#5ce09c","#d4a76c","#ba925e"],"k-radio":["#d4a76c","#5e7777","#a8d3d3"],"k-rugRectangle":["#e87b4d","#ba623d"],"k-rugRound":["#e87b4d","#ba623d"],"k-rugRounded":["#e87b4d","#ba623d"],"k-rugSquare":["#e87b4d","#ba623d"],"k-shower":["#f8ffff","#b2d3c4"],"k-sideTable":["#d4a76c","#ffffff"],"k-sideTableDrawers":["#d4a76c","#ffffff","#a8d3d3"],"k-speaker":["#d4a76c","#5e7777"],"k-speakerSmall":["#d4a76c","#5e7777"],"k-stoolBar":["#d4a76c","#e87b4d"],"k-stoolBarSquare":["#d4a76c","#e87b4d"],"k-tableCloth":["#d4a76c","#e87b4d"],"k-tableCoffeeGlass":["#a8d3d3","#b2d3c4"],"k-tableCoffeeGlassSquare":["#a8d3d3","#b2d3c4"],"k-tableCrossCloth":["#d4a76c","#e87b4d"],"k-tableGlass":["#a8d3d3","#b2d3c4"],"k-televisionModern":["#2a3535","#a8d3d3"],"k-televisionVintage":["#d4a76c","#2a3535","#a8d3d3","#5e7777"],"k-toilet":["#f8ffff","#ffffff","#2a3535","#d6e8de"],"k-trashcan":["#a8d3d3","#2a3535"],"k-wall":["#ffffff","#2a3535","#d4a76c"],"k-wallCorner":["#ffffff","#2a3535","#d4a76c"],"k-wallCornerRond":["#ffffff","#2a3535","#d4a76c"],"k-wallDoorway":["#ffffff","#2a3535","#d4a76c"],"k-wallDoorwayWide":["#d4a76c","#ffffff","#2a3535"],"k-wallHalf":["#ffffff","#2a3535","#d4a76c"],"k-wallWindow":["#ffffff","#2a3535","#d4a76c","#b2d3c4"],"k-wallWindowSlide":["#ffffff","#d4a76c","#2a3535","#b2d3c4"],"k-washer":["#d6e8de","#5e7777","#a8d3d3","#b2d3c4","#2a3535"],"k-washerDryerStacked":["#d6e8de","#5e7777","#a8d3d3","#b2d3c4","#2a3535"],"q-Bed":["#c48a5a","#9db9dc","#5b3a29","#f2f2ef"],"q-BedKing":["#c48a5a","#9db9dc","#f2f2ef","#5b3a29"],"q-BookCase":["#7a4a2c","#c48a5a"],"q-BookCaseBooks":["#7a4a2c","#c48a5a","#3a6bb2","#b23a3a","#3f8f4f"],"q-BookCaseLarge":["#c48a5a","#7a4a2c"],"q-BookCaseLargeBooks":["#c48a5a","#7a4a2c","#6f8fae","#3f8f4f","#3a6bb2"],"q-Chair":["#c48a5a","#7a4a2c"],"q-ChairCushioned":["#c48a5a","#7a4a2c","#b5413b"],"q-ChairHandle":["#c48a5a","#7a4a2c"],"q-Closet":["#7a4a2c","#c48a5a"],"q-Closet2":["#7a4a2c","#c48a5a"],"q-CoffeeTable":["#c48a5a","#7a4a2c"],"q-CoffeeTable2":["#7a4a2c","#c48a5a"],"q-Lamp":["#f3e6c8","#6d6f73"],"q-Lamp2":["#f3e6c8","#6d6f73"],"q-Plant":["#5b3a29","#4f9a4a"],"q-Stool":["#7a4a2c","#c48a5a"],"q-Table":["#c48a5a","#7a4a2c"]};

  const LIST = [];
  // m(id, nl, en, group, [w, d, h], options): id 'pack:file' loads web/models/<pack>/<file>.glb
  function m(id, nl, en, group, size, opts) {
    const [pack, file] = id.split(':');
    const packName = { k: 'kenney', kk: 'kaykit', q: 'quaternius' }[pack] || 'own';
    const o = opts || {};
    LIST.push({
      id: id.replace(':', '-'),
      pack: packName,
      file: packName === 'own' ? null : `${packName}/${file}.glb`,
      name: { nl, en },
      group,
      w: size[0], d: size[1], h: size[2],
      mount: o.mount || 'floor',
      z: o.z || 0,
      yaw: o.yaw != null ? o.yaw : (YAW[packName] || 0),
      colors: COLORS[id.replace(':', '-')] || null,
      parts: o.parts || 'box',
      light: o.light || null, // { at: bulb height in cm above the model's base }
      fixture: o.fixture || null,
      // Drawn in code from the settings of the piece (doors, glass, colours, finish): see buildCabinet in web/view3d.js
      build: o.build || null,
      defaults: o.defaults || null,
      slots: o.slots || null, // names of its colour fields, [nl, en] each
      // the base colours of the materials of the model, biggest first, for the colour fields in the editor
      materials: o.materials || MATERIALS[id.replace(':', '-')] || null,
    });
  }

  // Sofas and armchairs
  m('k:loungeSofa', 'Bank, 3-zits', 'Sofa, 3 seats', 'sofas', [220, 90, 80], { parts: 'sofa' });
  m('k:loungeSofaLong', 'Bank, lang', 'Long sofa', 'sofas', [260, 90, 80], { parts: 'sofa' });
  m('k:loungeSofaCorner', 'Hoekbank', 'Corner sofa', 'sofas', [240, 200, 80], { parts: 'sofa' });
  m('k:loungeSofaOttoman', 'Hocker', 'Ottoman', 'sofas', [90, 70, 42], { parts: 'box' });
  m('k:loungeChair', 'Fauteuil', 'Armchair', 'sofas', [85, 85, 80], { parts: 'armchair' });
  m('k:loungeChairRelax', 'Relaxfauteuil', 'Lounge chair', 'sofas', [85, 110, 85], { parts: 'armchair' });
  m('kk:couch', 'Bank', 'Sofa', 'sofas', [210, 110, 85], { parts: 'sofa' });
  m('kk:couch_pillows', 'Bank met kussens', 'Sofa with pillows', 'sofas', [210, 110, 85], { parts: 'sofa' });
  m('kk:armchair', 'Fauteuil, rond', 'Round armchair', 'sofas', [110, 95, 85], { parts: 'armchair' });
  m('kk:armchair_pillows', 'Fauteuil met kussens', 'Armchair with pillows', 'sofas', [110, 95, 85], { parts: 'armchair' });
  // Beds
  m('k:bedDouble', 'Tweepersoonsbed', 'Double bed', 'beds', [160, 210, 55], { parts: 'bed', yaw: 180 });
  m('k:bedSingle', 'Eenpersoonsbed', 'Single bed', 'beds', [90, 210, 55], { parts: 'bed_single', yaw: 180 });
  m('k:bedBunk', 'Stapelbed', 'Bunk bed', 'beds', [100, 210, 170], { parts: 'bed_single', yaw: 180 });
  m('kk:bed_double_A', 'Tweepersoonsbed, hout', 'Double bed, wood', 'beds', [170, 210, 60], { parts: 'bed' });
  m('kk:bed_double_B', 'Tweepersoonsbed, licht', 'Double bed, light', 'beds', [170, 210, 60], { parts: 'bed' });
  m('kk:bed_single_A', 'Eenpersoonsbed, hout', 'Single bed, wood', 'beds', [100, 210, 60], { parts: 'bed_single' });
  m('kk:bed_single_B', 'Eenpersoonsbed, licht', 'Single bed, light', 'beds', [100, 210, 60], { parts: 'bed_single' });
  m('k:cabinetBedDrawerTable', 'Nachtkastje', 'Nightstand', 'beds', [45, 40, 55], { parts: 'nightstand' });
  // Tables
  m('k:table', 'Eettafel', 'Dining table', 'tables', [180, 90, 76], { parts: 'table' });
  m('k:tableCloth', 'Eettafel met kleed', 'Table with cloth', 'tables', [180, 90, 76], { parts: 'table' });
  m('k:tableGlass', 'Glazen tafel', 'Glass table', 'tables', [160, 90, 76], { parts: 'table' });
  m('k:tableRound', 'Ronde tafel', 'Round table', 'tables', [110, 110, 76], { parts: 'table_round' });
  m('k:tableCross', 'Tafel, kruispoot', 'Cross-leg table', 'tables', [160, 90, 76], { parts: 'table' });
  m('k:tableCoffee', 'Salontafel', 'Coffee table', 'tables', [110, 60, 42], { parts: 'table' });
  m('k:tableCoffeeGlass', 'Salontafel, glas', 'Glass coffee table', 'tables', [110, 60, 42], { parts: 'table' });
  m('k:tableCoffeeSquare', 'Salontafel, vierkant', 'Square coffee table', 'tables', [80, 80, 42], { parts: 'table' });
  m('k:sideTable', 'Bijzettafel', 'Side table', 'tables', [45, 45, 55], { parts: 'table' });
  m('k:sideTableDrawers', 'Bijzettafel met lades', 'Side table with drawers', 'tables', [45, 40, 55], { parts: 'nightstand' });
  m('k:desk', 'Bureau', 'Desk', 'tables', [140, 70, 76], { parts: 'desk' });
  m('k:deskCorner', 'Hoekbureau', 'Corner desk', 'tables', [160, 160, 76], { parts: 'desk' });
  m('kk:table_medium_long', 'Eettafel, hout', 'Dining table, wood', 'tables', [180, 100, 76], { parts: 'table' });
  m('kk:table_medium', 'Vierkante tafel', 'Square table', 'tables', [100, 100, 76], { parts: 'table' });
  m('kk:table_low', 'Salontafel, hout', 'Coffee table, wood', 'tables', [120, 75, 42], { parts: 'table' });
  m('kk:table_small', 'Bijzettafeltje', 'Small side table', 'tables', [50, 50, 55], { parts: 'table' });
  // Chairs and stools
  m('k:chair', 'Stoel', 'Chair', 'chairs', [45, 50, 90], { parts: 'chair' });
  m('k:chairCushion', 'Stoel met kussen', 'Cushioned chair', 'chairs', [45, 50, 90], { parts: 'chair' });
  m('k:chairRounded', 'Kuipstoel', 'Rounded chair', 'chairs', [50, 50, 85], { parts: 'chair' });
  m('k:chairDesk', 'Bureaustoel', 'Desk chair', 'chairs', [60, 60, 100], { parts: 'chair' });
  m('k:stoolBar', 'Barkruk', 'Bar stool', 'chairs', [40, 40, 75], { parts: 'cylinder' });
  m('k:stoolBarSquare', 'Barkruk, vierkant', 'Square bar stool', 'chairs', [40, 40, 75], { parts: 'box' });
  m('k:bench', 'Bankje', 'Bench', 'chairs', [140, 40, 45], { parts: 'box' });
  m('k:benchCushion', 'Bankje met kussen', 'Cushioned bench', 'chairs', [140, 40, 45], { parts: 'box' });
  m('kk:chair_A', 'Stoel, gestoffeerd', 'Upholstered chair', 'chairs', [45, 50, 90], { parts: 'chair' });
  m('kk:chair_A_wood', 'Houten stoel', 'Wooden chair', 'chairs', [45, 50, 90], { parts: 'chair' });
  m('kk:chair_B', 'Stoel, modern', 'Modern chair', 'chairs', [45, 50, 85], { parts: 'chair' });
  m('kk:chair_B_wood', 'Houten stoel, modern', 'Modern wooden chair', 'chairs', [45, 50, 85], { parts: 'chair' });
  m('kk:chair_C', 'Armstoel', 'Armchair, wood', 'chairs', [55, 55, 85], { parts: 'chair' });
  m('kk:chair_stool', 'Kruk', 'Stool', 'chairs', [40, 40, 45], { parts: 'cylinder' });
  m('kk:chair_stool_wood', 'Houten kruk', 'Wooden stool', 'chairs', [40, 40, 45], { parts: 'cylinder' });
  // Cabinets and shelves
  m('k:bookcaseOpen', 'Boekenkast', 'Bookcase', 'storage', [80, 35, 190], { parts: 'shelf' });
  m('k:bookcaseOpenLow', 'Lage boekenkast', 'Low bookcase', 'storage', [80, 35, 90], { parts: 'shelf' });
  m('k:bookcaseClosed', 'Kast', 'Cabinet', 'storage', [80, 40, 190], { parts: 'wardrobe' });
  m('k:bookcaseClosedDoors', 'Kast met deuren', 'Cabinet with doors', 'storage', [80, 40, 190], { parts: 'wardrobe' });
  m('k:bookcaseClosedWide', 'Kledingkast', 'Wardrobe', 'storage', [150, 60, 200], { parts: 'wardrobe' });
  // Cabinets drawn in code, to give the size, the doors, the glass and the colours of the real one
  m('own:cabinet', 'Kast met deuren, eigen maat', 'Cabinet with doors, own size', 'storage', [90, 40, 180], {
    parts: 'wardrobe', build: 'cabinet',
    defaults: { doors: 2, glass: 0, shelves: 3, handle: 'bar', finish: 'satin', color: '#d8d0c2', colors: [null, '#d8d0c2', '#bcd7e6'] },
    slots: [['Frame', 'Frame'], ['Deuren', 'Doors'], ['Glas', 'Glass']],
    materials: ['#d8d0c2', '#d8d0c2', '#bcd7e6'],
  });
  m('own:vitrine', 'Vitrinekast, stalen frame met glas', 'Display cabinet, steel frame with glass', 'storage', [100, 40, 190], {
    parts: 'wardrobe', build: 'cabinet',
    defaults: { doors: 2, glass: 0.5, shelves: 3, handle: 'bar', finish: 'metal', color: '#1b1c1f', colors: [null, '#1b1c1f', '#bcd7e6'] },
    slots: [['Frame', 'Frame'], ['Deuren', 'Doors'], ['Glas', 'Glass']],
    materials: ['#1b1c1f', '#1b1c1f', '#bcd7e6'],
  });
  m('k:cabinetTelevision', 'Tv-meubel', 'TV cabinet', 'storage', [180, 40, 50], { parts: 'lowboard' });
  m('k:cabinetTelevisionDoors', 'Tv-meubel met deuren', 'TV cabinet with doors', 'storage', [180, 40, 50], { parts: 'lowboard' });
  m('k:cabinetBedDrawer', 'Ladekast', 'Chest of drawers', 'storage', [100, 45, 85], { parts: 'lowboard' });
  m('k:coatRackStanding', 'Kapstok, staand', 'Coat stand', 'storage', [50, 50, 180], { parts: 'cylinder' });
  m('k:coatRack', 'Kapstok', 'Coat rack', 'storage', [100, 30, 40], { parts: 'box', mount: 'wall', z: 150 });
  m('kk:cabinet_medium', 'Dressoir', 'Sideboard', 'storage', [120, 45, 100], { parts: 'lowboard' });
  m('kk:cabinet_medium_decorated', 'Dressoir met spullen', 'Sideboard, decorated', 'storage', [120, 45, 110], { parts: 'lowboard' });
  m('kk:cabinet_small', 'Kastje', 'Small cabinet', 'storage', [50, 45, 80], { parts: 'nightstand' });
  m('kk:cabinet_small_decorated', 'Kastje met spullen', 'Small cabinet, decorated', 'storage', [50, 45, 90], { parts: 'nightstand' });
  m('kk:shelf_A_big', 'Wandboekenkast', 'Wall bookcase', 'storage', [160, 40, 180], { parts: 'shelf' });
  m('kk:shelf_A_small', 'Kleine wandboekenkast', 'Small wall bookcase', 'storage', [80, 40, 100], { parts: 'shelf' });
  m('kk:shelf_B_large', 'Zwevende plank', 'Floating shelf', 'storage', [120, 30, 30], { parts: 'shelf', mount: 'wall', z: 140 });
  m('kk:shelf_B_large_decorated', 'Zwevende plank met spullen', 'Floating shelf, decorated', 'storage', [120, 30, 40], { parts: 'shelf', mount: 'wall', z: 140 });
  m('kk:shelf_B_small', 'Kleine zwevende plank', 'Small floating shelf', 'storage', [60, 30, 30], { parts: 'shelf', mount: 'wall', z: 140 });
  // Kitchen
  m('k:kitchenCabinet', 'Aanrechtkast', 'Base cabinet', 'kitchen', [60, 60, 90], { parts: 'kitchen' });
  m('k:kitchenCabinetDrawer', 'Ladekast keuken', 'Drawer cabinet', 'kitchen', [60, 60, 90], { parts: 'kitchen' });
  m('k:kitchenSink', 'Spoelbak', 'Sink unit', 'kitchen', [80, 60, 90], { parts: 'kitchen' });
  m('k:kitchenStove', 'Fornuis', 'Stove', 'kitchen', [60, 60, 90], { parts: 'kitchen' });
  m('k:kitchenStoveElectric', 'Elektrische kookplaat', 'Electric hob', 'kitchen', [60, 60, 90], { parts: 'kitchen' });
  m('k:kitchenCabinetCornerInner', 'Hoekkast', 'Corner cabinet', 'kitchen', [90, 90, 90], { parts: 'kitchen' });
  m('k:kitchenCabinetCornerRound', 'Ronde hoekkast', 'Round corner cabinet', 'kitchen', [60, 60, 90], { parts: 'kitchen' });
  m('k:kitchenBar', 'Kookeiland', 'Kitchen island', 'kitchen', [120, 60, 105], { parts: 'island' });
  m('k:kitchenBarEnd', 'Kookeiland, eind', 'Island end', 'kitchen', [60, 60, 105], { parts: 'island' });
  m('k:kitchenCabinetUpper', 'Hangkast', 'Wall cabinet', 'kitchen', [80, 35, 70], { parts: 'wall_cabinet', mount: 'wall', z: 145 });
  m('k:kitchenCabinetUpperDouble', 'Dubbele bovenkast', 'Double wall cabinet', 'kitchen', [100, 35, 70], { parts: 'wall_cabinet', mount: 'wall', z: 145 });
  m('k:kitchenCabinetUpperLow', 'Lage bovenkast', 'Low wall cabinet', 'kitchen', [60, 35, 40], { parts: 'wall_cabinet', mount: 'wall', z: 175 });
  m('k:kitchenCabinetUpperCorner', 'Hoekbovenkast', 'Corner wall cabinet', 'kitchen', [60, 60, 70], { parts: 'wall_cabinet', mount: 'wall', z: 145 });
  // Appliances
  m('k:kitchenFridge', 'Koelkast', 'Fridge', 'appliances', [70, 68, 185], { parts: 'fridge' });
  m('k:kitchenFridgeBuiltIn', 'Inbouwkoelkast', 'Built-in fridge', 'appliances', [60, 60, 200], { parts: 'fridge' });
  m('k:kitchenFridgeSmall', 'Onderbouwkoelkast', 'Under-counter fridge', 'appliances', [55, 55, 85], { parts: 'fridge' });
  m('k:kitchenMicrowave', 'Magnetron', 'Microwave', 'appliances', [50, 40, 30], { parts: 'box', mount: 'surface', z: 90 });
  m('k:kitchenCoffeeMachine', 'Koffiezetapparaat', 'Coffee machine', 'appliances', [25, 35, 35], { parts: 'box', mount: 'surface', z: 90 });
  m('k:kitchenBlender', 'Blender', 'Blender', 'appliances', [18, 18, 35], { parts: 'cylinder', mount: 'surface', z: 90 });
  m('k:washer', 'Wasmachine', 'Washing machine', 'appliances', [60, 60, 85], { parts: 'washer' });
  m('k:dryer', 'Droger', 'Dryer', 'appliances', [60, 60, 85], { parts: 'dryer' });
  m('k:washerDryerStacked', 'Was-droogtoren', 'Washer and dryer', 'appliances', [60, 60, 170], { parts: 'washer' });
  m('own:dishwasher', 'Vaatwasser', 'Dishwasher', 'appliances', [60, 60, 85], { parts: 'dishwasher' });
  m('k:trashcan', 'Afvalbak', 'Bin', 'appliances', [35, 35, 60], { parts: 'cylinder' });
  // Bathroom
  m('k:bathtub', 'Bad', 'Bath', 'bath', [170, 75, 58], { parts: 'bath' });
  m('k:shower', 'Douche', 'Shower', 'bath', [90, 90, 200], { parts: 'shower' });
  m('k:toilet', 'Toilet', 'Toilet', 'bath', [40, 65, 80], { parts: 'toilet' });
  m('k:bathroomSink', 'Wastafel', 'Washbasin', 'bath', [60, 45, 85], { parts: 'sink' });
  m('k:bathroomCabinet', 'Badkamerkast', 'Bathroom cabinet', 'bath', [60, 20, 70], { parts: 'wall_cabinet', mount: 'wall', z: 120 });
  m('k:bathroomMirror', 'Spiegel', 'Mirror', 'bath', [60, 5, 80], { parts: 'box', mount: 'wall', z: 110 });
  // Audio and video
  m('k:televisionModern', 'Tv', 'TV', 'media', [145, 20, 90], { parts: 'tv', mount: 'surface', z: 50 });
  // A flat TV on the wall, drawn in code; as a TV device from Homey its screen lights up when it is on.
  m('fx:tv', 'Tv aan de muur', 'Wall TV', 'media', [140, 6, 82], { parts: 'tv', mount: 'wall', z: 110, fixture: 'tv' });
  m('k:televisionVintage', 'Tv, retro', 'Retro TV', 'media', [70, 50, 60], { parts: 'box', mount: 'surface', z: 50 });
  m('k:speaker', 'Speaker, staand', 'Floor speaker', 'media', [30, 30, 100], { parts: 'box' });
  m('k:speakerSmall', 'Speaker', 'Speaker', 'media', [20, 20, 30], { parts: 'box', mount: 'surface', z: 75 });
  m('k:radio', 'Radio', 'Radio', 'media', [35, 15, 20], { parts: 'box', mount: 'surface', z: 75 });
  m('k:computerScreen', 'Beeldscherm', 'Monitor', 'media', [60, 20, 45], { parts: 'box', mount: 'surface', z: 76 });
  m('k:laptop', 'Laptop', 'Laptop', 'media', [35, 25, 22], { parts: 'box', mount: 'surface', z: 76 });
  // Lighting: model lamps and fixtures drawn in code. `light.at` is the bulb height above the base.
  m('fx:ceiling', 'Plafondlamp', 'Ceiling light', 'lights', [40, 40, 10], { parts: 'cylinder', mount: 'ceiling', fixture: 'ceiling', light: { at: 0 } });
  m('fx:pendant', 'Hanglamp', 'Pendant', 'lights', [40, 40, 80], { parts: 'cylinder', mount: 'ceiling', fixture: 'pendant', light: { at: 12 } });
  m('fx:spot', 'Spot', 'Spotlight', 'lights', [12, 12, 6], { parts: 'cylinder', mount: 'ceiling', fixture: 'spot', light: { at: 0 } });
  m('fx:wall', 'Wandlamp', 'Wall light', 'lights', [25, 14, 25], { parts: 'box', mount: 'wall', z: 170, fixture: 'wall', light: { at: 12 } });
  m('fx:strip', 'Ledstrip', 'LED strip', 'lights', [120, 3, 2], { parts: 'box', mount: 'wall', z: 225, fixture: 'strip', light: { at: 1 } });
  m('k:lampSquareCeiling', 'Plafondlamp, vierkant', 'Square ceiling light', 'lights', [45, 45, 15], { parts: 'box', mount: 'ceiling', light: { at: 2 } });
  m('k:ceilingFan', 'Plafondventilator', 'Ceiling fan', 'lights', [120, 120, 40], { parts: 'cylinder', mount: 'ceiling', light: { at: 5 } });
  m('k:lampRoundFloor', 'Staande lamp', 'Floor lamp', 'lights', [40, 40, 170], { parts: 'cylinder', light: { at: 155 } });
  m('k:lampSquareFloor', 'Staande lamp, vierkant', 'Square floor lamp', 'lights', [40, 40, 170], { parts: 'box', light: { at: 155 } });
  m('kk:lamp_standing', 'Staande lamp, boog', 'Standing lamp', 'lights', [45, 45, 170], { parts: 'cylinder', light: { at: 150 } });
  m('k:lampRoundTable', 'Tafellamp', 'Table lamp', 'lights', [30, 30, 50], { parts: 'cylinder', mount: 'surface', z: 75, light: { at: 40 } });
  m('k:lampSquareTable', 'Tafellamp, vierkant', 'Square table lamp', 'lights', [30, 30, 50], { parts: 'box', mount: 'surface', z: 75, light: { at: 40 } });
  m('kk:lamp_table', 'Tafellamp, rond', 'Round table lamp', 'lights', [35, 35, 50], { parts: 'cylinder', mount: 'surface', z: 75, light: { at: 38 } });
  // Plants and decoration
  m('k:pottedPlant', 'Plant', 'Plant', 'decor', [50, 50, 120], { parts: 'plant' });
  m('k:plantSmall1', 'Plantje', 'Small plant', 'decor', [25, 25, 35], { parts: 'plant', mount: 'surface', z: 75 });
  m('k:plantSmall2', 'Plantje, laag', 'Low plant', 'decor', [25, 25, 25], { parts: 'plant', mount: 'surface', z: 75 });
  m('kk:cactus_medium_A', 'Cactus', 'Cactus', 'decor', [45, 45, 100], { parts: 'plant' });
  m('kk:cactus_small_A', 'Cactusje', 'Small cactus', 'decor', [25, 25, 40], { parts: 'plant', mount: 'surface', z: 75 });
  m('k:rugRectangle', 'Vloerkleed', 'Rug', 'decor', [200, 140, 1], { parts: 'rug' });
  m('k:rugRound', 'Rond vloerkleed', 'Round rug', 'decor', [160, 160, 1], { parts: 'rug' });
  m('k:rugRounded', 'Vloerkleed, afgerond', 'Rounded rug', 'decor', [200, 140, 1], { parts: 'rug' });
  m('kk:rug_oval_A', 'Ovaal vloerkleed', 'Oval rug', 'decor', [240, 160, 1], { parts: 'rug' });
  m('kk:rug_rectangle_stripes_A', 'Gestreept vloerkleed', 'Striped rug', 'decor', [240, 160, 1], { parts: 'rug' });
  m('kk:pictureframe_large_A', 'Schilderij', 'Painting', 'decor', [60, 4, 80], { parts: 'box', mount: 'wall', z: 130 });
  m('kk:pictureframe_medium', 'Lijstje', 'Picture frame', 'decor', [40, 4, 50], { parts: 'box', mount: 'wall', z: 140 });
  m('kk:book_set', 'Boeken', 'Books', 'decor', [30, 20, 25], { parts: 'box', mount: 'surface', z: 75 });
  m('k:cardboardBoxClosed', 'Doos', 'Box', 'decor', [50, 40, 35], { parts: 'box' });
  // Quaternius Furniture Pack (sizes keep the models' own proportions)
  m('q:Sofa', 'Fauteuil, blok', 'Block armchair', 'sofas', [90, 80, 68], { parts: 'armchair' });
  m('q:SofaDouble', 'Bank, blok', 'Block sofa', 'sofas', [170, 92, 79], { parts: 'sofa' });
  m('q:SofaLong', 'Hoekbank, blok', 'Block corner sofa', 'sofas', [174, 173, 80], { parts: 'sofa' });
  m('q:Bed', 'Bed, breed', 'Wide single bed', 'beds', [125, 200, 69], { parts: 'bed_single' });
  m('q:BedKing', 'Kingsize bed', 'King-size bed', 'beds', [189, 200, 69], { parts: 'bed' });
  m('q:BookCaseBooks', 'Boekenkast, gevuld', 'Bookcase with books', 'storage', [94, 56, 190], { parts: 'shelf' });
  m('q:BookCase', 'Lege boekenkast', 'Empty bookcase', 'storage', [94, 56, 190], { parts: 'shelf' });
  m('q:BookCaseLargeBooks', 'Brede boekenkast', 'Wide bookcase', 'storage', [195, 56, 190], { parts: 'shelf' });
  m('q:BookCaseLarge', 'Brede lege boekenkast', 'Wide empty bookcase', 'storage', [195, 56, 190], { parts: 'shelf' });
  m('q:Closet', 'Kledingkast, hout', 'Wooden wardrobe', 'storage', [89, 47, 200], { parts: 'wardrobe' });
  m('q:Closet2', 'Ladekast, hout', 'Wooden drawers', 'storage', [62, 43, 90], { parts: 'nightstand' });
  m('q:Chair', 'Stoel, hout', 'Wooden chair', 'chairs', [40, 40, 90], { parts: 'chair' });
  m('q:ChairCushioned', 'Gestoffeerde stoel', 'Upholstered chair', 'chairs', [40, 40, 96], { parts: 'chair' });
  m('q:ChairHandle', 'Houten armstoel', 'Wooden armchair', 'chairs', [40, 40, 63], { parts: 'chair' });
  m('q:Stool', 'Kruk, hout', 'Wooden stool', 'chairs', [30, 30, 45], { parts: 'cylinder' });
  m('q:CoffeeTable', 'Salontafel, laag', 'Low coffee table', 'tables', [110, 64, 30], { parts: 'table' });
  m('q:CoffeeTable2', 'Salontafel met plank', 'Coffee table with shelf', 'tables', [110, 64, 37], { parts: 'table' });
  m('q:Table', 'Eettafel, blok', 'Block dining table', 'tables', [125, 137, 76], { parts: 'table' });
  m('q:Lamp', 'Staande lamp, kap', 'Floor lamp with shade', 'lights', [37, 38, 165], { parts: 'cylinder', light: { at: 150 } });
  m('q:Lamp2', 'Staande lamp, kap 2', 'Floor lamp with shade 2', 'lights', [37, 38, 165], { parts: 'cylinder', light: { at: 150 } });
  m('q:Plant', 'Plantenbak', 'Planter', 'decor', [70, 30, 60], { parts: 'plant' });
  m('q:Vase', 'Vaas', 'Vase', 'decor', [33, 33, 45], { parts: 'cylinder' });
  m('q:Vase2', 'Vaas, smal', 'Slim vase', 'decor', [25, 25, 45], { parts: 'cylinder' });
  // Other (drawn in code, any size)
  m('own:box', 'Blok', 'Block', 'other', [100, 60, 80], { parts: 'box' });
  m('own:cylinder', 'Cilinder', 'Cylinder', 'other', [60, 60, 80], { parts: 'cylinder' });
  m('own:radiator', 'Radiator', 'Radiator', 'climate', [60, 10, 60], { parts: 'box', mount: 'wall', z: 15 });
  // Thermostats drawn in code; a thermostat device shows one on the wall, with its temperature on the display.
  m('fx:thermostat', 'Thermostaat', 'Thermostat', 'climate', [9, 3, 9], { parts: 'box', mount: 'wall', z: 150, fixture: 'thermostat' });
  m('fx:trv', 'Radiatorknop', 'Radiator valve', 'climate', [6, 9, 6], { parts: 'cylinder', mount: 'wall', z: 45, fixture: 'trv' });
  // A fan coil unit (heats and cools, no outdoor unit): low on the wall, like a radiator with a grille on top.
  m('fx:fancoil', 'Fancoil', 'Fan coil unit', 'climate', [100, 20, 60], { parts: 'box', mount: 'wall', z: 10, fixture: 'fancoil' });
  // The indoor unit of a split air conditioner: high on the wall, with the air slot at the bottom.
  m('fx:split', 'Airco binnenunit', 'Air conditioner indoor unit', 'climate', [85, 22, 29], { parts: 'box', mount: 'wall', z: 205, fixture: 'split' });
  // Stairs: a block per step, going up from the front edge. Height is the floor-to-floor height.
  m('own:stairs', 'Trap, recht', 'Straight stairs', 'structure', [90, 300, 260], { parts: 'stairs' });
  m('own:stairsL', 'Trap, kwartslag', 'Quarter-turn stairs', 'structure', [200, 260, 260], { parts: 'stairs_l' });
  m('own:stairsSpiral', 'Wenteltrap', 'Spiral stairs', 'structure', [160, 160, 260], { parts: 'stairs_spiral' });
  m('own:car', 'Auto', 'Car', 'other', [180, 450, 150], { parts: 'car' });

  const BY_ID = new Map(LIST.map((x) => [x.id, x]));

  // Default fixture for a light device that has none chosen yet.
  const DEFAULT_FIXTURE = 'fx-ceiling';
  // And for a thermostat device.
  const DEFAULT_THERMOSTAT = 'fx-thermostat';
  // And for a TV.
  const DEFAULT_TV = 'fx-tv';
  // And for an air conditioner.
  const DEFAULT_SPLIT = 'fx-split';

  return {
    GROUPS, PACKS, DEFAULT_FIXTURE, DEFAULT_THERMOSTAT, DEFAULT_TV, DEFAULT_SPLIT,
    list: () => LIST,
    get: (id) => BY_ID.get(id) || null,
    lights: () => LIST.filter((x) => x.light),
    climate: () => LIST.filter((x) => x.fixture === 'thermostat' || x.fixture === 'trv' || x.fixture === 'fancoil' || x.fixture === 'split'),
    speakers: () => LIST.filter((x) => x.id === 'k-speaker' || x.id === 'k-speakerSmall'),
    tvs: () => LIST.filter((x) => x.fixture === 'tv'),
  };
}));
