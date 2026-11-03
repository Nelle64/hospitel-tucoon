import { Img } from './canvas';
import { P, darken, hex, lighten, type RGBA } from './palette';
import type { Sprite } from './generate-tiles';

const T = 32;

/** 3/4 view block: lit top surface plus a darker front face. */
function block(img: Img, x: number, y: number, w: number, h: number, top: RGBA, faceH: number, face?: RGBA): void {
  const f = face ?? darken(top, 0.28);
  img.rect(x, y, w, h - faceH, top);
  img.rect(x, y + h - faceH, w, faceH, f);
  for (let xx = x; xx < x + w; xx++) {
    img.px(xx, y, lighten(top, 0.3));
    img.px(xx, y + h - faceH, darken(top, 0.12));
    img.px(xx, y + h - 1, darken(f, 0.25));
  }
  for (let yy = y; yy < y + h - faceH; yy++) {
    img.px(x, yy, lighten(top, 0.18));
    img.px(x + w - 1, yy, darken(top, 0.15));
  }
}

function screen(img: Img, x: number, y: number, w: number, h: number, glow: RGBA = P.screen): void {
  img.rect(x, y, w, h, P.ink);
  img.rect(x + 1, y + 1, w - 2, h - 2, glow);
  for (let i = 0; i < w - 3; i += 2) img.px(x + 1 + i, y + 2 + ((i * 3) % Math.max(1, h - 3)), lighten(glow, 0.5));
}

function bed(img: Img, x: number, y: number, frame: RGBA, blanket: RGBA, extra?: (i: Img) => void): void {
  // Vertical bed 1×2 tiles (head at the top).
  block(img, x + 4, y + 2, 24, 58, P.bed, 6, darken(frame, 0.1));
  img.rect(x + 3, y + 1, 26, 4, frame);
  img.rect(x + 3, y + 57, 26, 4, frame);
  img.box(x + 8, y + 6, 16, 9, P.pillow, 1);
  img.box(x + 6, y + 30, 20, 22, blanket, 1);
  for (let i = 0; i < 18; i += 4) img.px(x + 8 + i, y + 32, lighten(blanket, 0.4));
  extra?.(img);
}

function make(w: number, h: number, draw: (i: Img) => void): Img {
  const img = new Img(w * T, h * T);
  draw(img);
  img.outline(P.outline);
  img.dropShadow(1, 2, 60);
  return img;
}

const F: Record<string, [number, number, (i: Img) => void, string]> = {
  // Reception
  desk_reception: [2, 1, (i) => {
    block(i, 2, 8, 60, 22, hex('#d9a066'), 9, hex('#a86b3a'));
    i.rect(2, 21, 60, 2, hex('#e8a33d'));
    screen(i, 34, 3, 14, 9);
    i.rect(39, 12, 4, 2, P.grey3);
    i.box(10, 10, 10, 6, P.paper, 1);
    i.px(13, 12, P.ink); i.px(15, 12, P.ink); i.px(17, 12, P.ink);
    i.ellipse(54, 12, 3, 3, P.red, true);
  }, 'reception desk with computer and bell'],
  sign_reception: [1, 1, (i) => {
    i.rect(14, 12, 4, 18, P.grey3);
    i.box(4, 3, 24, 13, hex('#e8a33d'), 1);
    i.rect(8, 7, 16, 2, P.white); i.rect(8, 11, 10, 2, P.white);
  }, 'reception sign'],
  // Waiting
  chair_waiting: [1, 1, (i) => {
    i.box(6, 6, 20, 8, hex('#7fb069'), 1);
    block(i, 6, 14, 20, 12, lighten(hex('#7fb069'), 0.1), 4);
    i.rect(7, 26, 2, 4, P.grey4); i.rect(23, 26, 2, 4, P.grey4);
  }, 'waiting room chair'],
  magazine_table: [1, 1, (i) => {
    block(i, 4, 10, 24, 14, P.woodLight, 4);
    i.box(7, 11, 8, 6, P.blue, 1); i.box(16, 12, 8, 6, P.red, 1);
    i.rect(6, 24, 2, 5, P.woodDark); i.rect(24, 24, 2, 5, P.woodDark);
  }, 'table with old magazines'],
  water_cooler: [1, 1, (i) => {
    block(i, 9, 14, 14, 16, P.white, 8);
    i.ellipse(16, 9, 6, 7, hex('#7cc4f2', 220), true);
    i.rect(13, 22, 2, 2, P.blue); i.rect(17, 22, 2, 2, P.red);
  }, 'water cooler'],
  plant: [1, 1, (i) => {
    block(i, 10, 20, 12, 10, hex('#c06c3e'), 4);
    for (const [x, y, r] of [[16, 11, 7], [11, 14, 5], [21, 14, 5], [16, 6, 4]] as const) i.ellipse(x, y, r, r, P.green, true);
    i.px(14, 9, lighten(P.green, 0.5)); i.px(19, 12, lighten(P.green, 0.5));
  }, 'potted plant'],
  bin: [1, 1, (i) => {
    block(i, 11, 14, 10, 14, P.grey2, 6);
    i.rect(11, 14, 10, 2, P.grey3);
  }, 'waste bin'],
  // Consultation
  desk_doctor: [2, 1, (i) => {
    block(i, 2, 6, 60, 22, hex('#9fb3c8'), 8, hex('#6f86a0'));
    screen(i, 6, 2, 14, 10, hex('#9fd8ff'));
    i.rect(11, 12, 4, 2, P.grey4);
    i.box(28, 9, 12, 8, P.white, 1);
    i.line(30, 11, 37, 11, P.grey3); i.line(30, 13, 35, 13, P.grey3);
    i.ellipse(50, 12, 4, 3, hex('#4f9dde'), true);
    i.rect(56, 8, 3, 7, P.red);
  }, 'doctor desk with monitor and notes'],
  chair_patient: [1, 1, (i) => {
    i.box(8, 18, 16, 6, hex('#4f9dde'), 1);
    i.rect(9, 24, 2, 4, P.grey4); i.rect(21, 24, 2, 4, P.grey4);
  }, 'patient chair'],
  exam_couch: [1, 1, (i) => {
    block(i, 3, 6, 26, 22, hex('#d8e7f2'), 6, P.steelDark);
    i.box(4, 7, 8, 8, P.white, 1);
    i.rect(3, 13, 26, 1, P.paper);
  }, 'examination couch'],
  cabinet: [1, 1, (i) => {
    block(i, 5, 4, 22, 24, P.grey1, 16);
    i.rect(15, 14, 2, 10, P.grey3);
    i.rect(10, 18, 3, 1, P.steelDark); i.rect(19, 18, 3, 1, P.steelDark);
  }, 'storage cabinet'],
  skeleton_chart: [1, 1, (i) => {
    i.box(6, 2, 20, 26, P.white, 1);
    i.ellipse(16, 7, 3, 3, P.grey2);
    i.rect(15, 10, 2, 9, P.grey2); i.rect(11, 12, 10, 1, P.grey2); i.rect(12, 19, 1, 6, P.grey2); i.rect(19, 19, 1, 6, P.grey2);
  }, 'anatomy chart'],
  // Blood sampling
  cart_samples: [1, 1, (i) => {
    block(i, 5, 8, 22, 18, P.white, 6);
    for (let k = 0; k < 5; k++) i.rect(8 + k * 4, 6, 2, 6, [P.red, P.purple, P.blue, P.red, P.yellow][k]!);
    i.rect(7, 26, 2, 3, P.grey4); i.rect(23, 26, 2, 3, P.grey4);
  }, 'sample tube cart'],
  blood_chair: [1, 1, (i) => {
    i.box(7, 6, 18, 9, hex('#d1495b'), 1);
    block(i, 6, 15, 20, 11, lighten(hex('#d1495b'), 0.15), 4);
    i.rect(24, 12, 7, 3, P.grey2);
    i.rect(8, 26, 2, 4, P.steelDark); i.rect(22, 26, 2, 4, P.steelDark);
  }, 'blood sampling chair with arm rest'],
  fridge_samples: [1, 1, (i) => {
    block(i, 6, 2, 20, 27, P.white, 19);
    i.rect(9, 13, 14, 12, P.glass);
    for (let k = 0; k < 3; k++) i.rect(11 + k * 4, 16, 2, 5, P.red);
  }, 'sample fridge'],
  sink: [1, 1, (i) => {
    block(i, 4, 8, 24, 18, P.grey1, 6);
    i.ellipse(16, 14, 8, 4, P.steel, true);
    i.rect(15, 6, 2, 6, P.chrome);
  }, 'sink'],
  // Treatment
  treat_bed: [1, 2, (i) => bed(i, 0, 0, P.teal, hex('#9ee6dd')), 'treatment bed'],
  cart_meds: [1, 1, (i) => {
    block(i, 5, 8, 22, 18, hex('#cfe2f3'), 7);
    i.ellipse(10, 9, 3, 2, P.white); i.rect(16, 6, 3, 5, P.green); i.rect(21, 7, 3, 4, P.orange);
    i.rect(7, 26, 2, 3, P.grey4); i.rect(23, 26, 2, 3, P.grey4);
  }, 'medicine cart'],
  // Break room
  armchair: [1, 1, (i) => {
    i.box(4, 4, 24, 10, hex('#c38d5e'), 1);
    block(i, 4, 12, 24, 16, lighten(hex('#c38d5e'), 0.1), 5);
    i.box(2, 10, 5, 16, darken(hex('#c38d5e'), 0.1), 1); i.box(25, 10, 5, 16, darken(hex('#c38d5e'), 0.1), 1);
  }, 'comfy armchair'],
  coffee_machine: [1, 1, (i) => {
    block(i, 5, 10, 22, 18, P.grey4, 6);
    block(i, 8, 2, 16, 14, hex('#3a3a46'), 8);
    i.rect(11, 5, 4, 2, P.red); i.rect(17, 5, 4, 2, P.green);
    i.box(13, 17, 6, 5, P.white, 1);
    i.px(15, 15, hex('#e0e0e0', 150)); i.px(16, 14, hex('#e0e0e0', 120));
  }, 'coffee machine (beloved and unreliable)'],
  fridge: [1, 1, (i) => {
    block(i, 6, 1, 20, 28, P.white, 20);
    i.rect(6, 13, 20, 1, P.grey2); i.rect(22, 15, 2, 6, P.grey3);
    i.box(9, 4, 4, 4, P.yellow, 1);
  }, 'staff fridge with notes'],
  round_table: [1, 1, (i) => {
    i.ellipse(16, 15, 12, 8, P.woodLight, true);
    i.ellipse(16, 15, 12, 8, P.woodLight, false);
    i.ellipse(16, 13, 11, 6, lighten(P.woodLight, 0.15));
    i.rect(15, 21, 2, 7, P.woodDark);
    i.box(10, 10, 5, 4, P.white, 1);
  }, 'round coffee table'],
  vending: [1, 1, (i) => {
    block(i, 5, 1, 22, 28, hex('#d1495b'), 20);
    i.rect(8, 4, 12, 18, P.glass);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) i.rect(9 + c * 4, 6 + r * 5, 3, 3, [P.yellow, P.blue, P.green][(r + c) % 3]!);
    i.rect(21, 8, 3, 6, P.grey2);
  }, 'snack vending machine'],
  // Laboratory
  lab_bench: [2, 1, (i) => {
    block(i, 2, 6, 60, 22, hex('#e6dcf5'), 8, hex('#9b7cc6'));
    i.rect(8, 4, 3, 10, P.grey4); i.ellipse(9, 4, 4, 2, P.grey3); i.rect(6, 12, 8, 3, P.grey3);
    for (let k = 0; k < 4; k++) i.rect(22 + k * 4, 6, 2, 7, [P.purple, P.teal, P.yellow, P.red][k]!);
    screen(i, 44, 4, 14, 9);
  }, 'lab bench with microscope and tubes'],
  centrifuge: [1, 1, (i) => {
    block(i, 5, 8, 22, 20, P.grey1, 8);
    i.ellipse(16, 14, 8, 5, P.steel, true);
    i.ellipse(16, 14, 3, 2, P.purple);
    i.rect(8, 23, 4, 2, P.green);
  }, 'centrifuge'],
  fridge_lab: [1, 1, (i) => {
    block(i, 6, 1, 20, 28, hex('#dcd6ee'), 20);
    i.rect(9, 4, 14, 18, P.glass);
    i.rect(10, 8, 12, 1, P.grey2); i.rect(10, 14, 12, 1, P.grey2);
    i.rect(11, 5, 2, 3, P.red); i.rect(16, 10, 2, 4, P.blue);
  }, 'reagent fridge'],
  microscope_desk: [1, 1, (i) => {
    block(i, 3, 12, 26, 16, hex('#e6dcf5'), 6);
    i.rect(14, 4, 4, 12, P.grey4); i.ellipse(16, 4, 4, 2, P.grey3); i.rect(11, 14, 10, 3, P.grey3);
  }, 'microscope'],
  // X-ray
  xray_machine: [2, 2, (i) => {
    block(i, 6, 20, 52, 40, P.white, 10, P.grey2);
    i.rect(10, 28, 44, 20, hex('#cfd8e6'));
    i.rect(26, 2, 12, 20, P.grey3);
    block(i, 18, 10, 28, 16, P.steel, 6);
    i.ellipse(32, 18, 8, 4, darken(P.steel, 0.25));
    i.ellipse(32, 18, 4, 2, P.yellow);
    i.rect(4, 56, 56, 2, hex('#5c6bc0'));
  }, 'X-ray scanner with table'],
  xray_console: [1, 1, (i) => {
    block(i, 3, 10, 26, 18, P.grey3, 7);
    screen(i, 6, 3, 20, 12, hex('#cfe7ff'));
    i.ellipse(12, 9, 3, 4, hex('#ffffff'));
    i.rect(8, 21, 3, 2, P.red); i.rect(14, 21, 3, 2, P.green);
  }, 'X-ray console showing a skeleton'],
  lead_screen: [1, 1, (i) => {
    block(i, 4, 4, 24, 24, hex('#5c6bc0'), 18);
    i.rect(8, 8, 16, 6, P.glass);
    i.rect(10, 18, 12, 2, P.yellow);
  }, 'lead protection screen'],
  lightbox: [1, 1, (i) => {
    i.box(4, 3, 24, 18, hex('#e9f4ff'), 1);
    i.ellipse(12, 12, 4, 6, P.grey2); i.ellipse(21, 12, 4, 6, P.grey2);
    i.rect(14, 21, 4, 8, P.grey3);
  }, 'X-ray lightbox'],
  // Emergency
  er_bed: [1, 2, (i) => bed(i, 0, 0, P.red, hex('#f2a2a8'), (img) => {
    img.rect(26, 8, 4, 10, P.grey3); img.box(24, 4, 8, 6, P.ink, 1); img.px(27, 6, P.screen); img.px(29, 6, P.screen);
  }), 'emergency trolley with monitor'],
  defibrillator: [1, 1, (i) => {
    block(i, 6, 10, 20, 18, P.yellow, 7);
    screen(i, 9, 12, 8, 5);
    i.box(19, 12, 5, 4, P.red, 1);
    i.line(9, 22, 22, 22, P.ink);
  }, 'defibrillator'],
  crash_cart: [1, 1, (i) => {
    block(i, 5, 6, 22, 22, P.red, 14);
    i.rect(5, 16, 22, 1, P.redDark); i.rect(5, 21, 22, 1, P.redDark);
    i.rect(14, 18, 4, 1, P.chrome); i.rect(14, 23, 4, 1, P.chrome);
  }, 'crash cart'],
  monitor_stand: [1, 1, (i) => {
    i.rect(15, 10, 2, 18, P.grey3); i.rect(10, 27, 12, 2, P.grey4);
    i.box(7, 2, 18, 12, P.ink, 1);
    i.line(9, 9, 12, 9, P.screen); i.line(12, 9, 14, 4, P.screen); i.line(14, 4, 16, 11, P.screen); i.line(16, 11, 22, 8, P.screen);
  }, 'patient monitor'],
  // Orthopedics
  ortho_table: [1, 2, (i) => bed(i, 0, 0, P.orange, hex('#ffd7a8'), (img) => {
    img.rect(6, 44, 20, 3, P.white); img.rect(6, 49, 20, 3, P.white);
  }), 'orthopedic treatment table'],
  cast_station: [1, 1, (i) => {
    block(i, 4, 10, 24, 18, P.white, 7);
    for (let k = 0; k < 3; k++) i.ellipse(9 + k * 7, 13, 3, 3, P.paper, true);
    i.box(9, 18, 14, 4, hex('#f4a259'), 1);
  }, 'plaster cast station'],
  skeleton: [1, 1, (i) => {
    i.rect(15, 24, 2, 5, P.grey3); i.rect(10, 28, 12, 2, P.grey4);
    i.ellipse(16, 5, 4, 4, P.white, true);
    i.rect(15, 9, 2, 10, P.white); i.rect(10, 11, 12, 2, P.white);
    for (let y = 13; y < 18; y += 2) i.rect(12, y, 8, 1, P.white);
    i.rect(12, 19, 2, 6, P.white); i.rect(18, 19, 2, 6, P.white);
    i.px(14, 5, P.ink); i.px(17, 5, P.ink);
  }, 'friendly skeleton model'],
  crutch_rack: [1, 1, (i) => {
    i.rect(5, 6, 22, 2, P.wood); i.rect(5, 24, 22, 2, P.wood);
    for (let k = 0; k < 4; k++) { i.rect(8 + k * 5, 4, 2, 24, P.steel); i.rect(7 + k * 5, 4, 4, 2, P.grey2); }
  }, 'crutch rack'],
  // Pharmacy
  shelf_meds: [1, 1, (i) => {
    block(i, 3, 2, 26, 26, P.woodLight, 4);
    for (let r = 0; r < 3; r++) {
      i.rect(4, 8 + r * 6, 24, 1, P.woodDark);
      for (let c = 0; c < 6; c++) i.rect(5 + c * 4, 4 + r * 6, 3, 4, [P.red, P.blue, P.green, P.yellow, P.purple, P.white][(r * 2 + c) % 6]!);
    }
  }, 'medicine shelf'],
  pharmacy_counter: [2, 1, (i) => {
    block(i, 2, 8, 60, 20, hex('#43aa8b'), 9, hex('#2a6e59'));
    i.rect(2, 18, 60, 2, P.white);
    i.rect(30, 9, 4, 8, P.white); i.rect(28, 11, 8, 4, P.white);
    i.box(8, 10, 8, 5, P.paper, 1); i.ellipse(48, 12, 4, 3, P.orange, true);
  }, 'pharmacy counter'],
  fridge_meds: [1, 1, (i) => {
    block(i, 6, 1, 20, 28, P.white, 20);
    i.rect(9, 4, 14, 18, P.glass);
    i.rect(14, 8, 4, 10, P.green); i.rect(12, 11, 8, 4, P.green);
  }, 'medicine fridge'],
  // Cleaning
  shelf_supplies: [2, 1, (i) => {
    block(i, 2, 2, 60, 26, P.grey1, 5);
    for (let c = 0; c < 9; c++) i.rect(5 + c * 6, 5, 4, 8, [P.blue, P.yellow, P.green, P.pink][c % 4]!);
    for (let c = 0; c < 7; c++) i.ellipse(8 + c * 8, 18, 3, 3, P.white, true);
  }, 'cleaning supply shelf'],
  cleaning_cart: [1, 1, (i) => {
    block(i, 6, 10, 18, 16, P.yellow, 6);
    i.rect(22, 4, 2, 22, P.grey3);
    i.box(9, 6, 8, 6, P.blue, 1);
    i.ellipse(10, 27, 2, 2, P.ink); i.ellipse(20, 27, 2, 2, P.ink);
  }, 'cleaning cart with mop'],
  washer: [1, 1, (i) => {
    block(i, 4, 3, 24, 25, P.white, 18);
    i.ellipse(16, 17, 7, 7, P.grey3);
    i.ellipse(16, 17, 5, 5, hex('#9fd8ff'));
    i.rect(7, 6, 5, 2, P.green);
  }, 'washing machine'],
  bucket: [1, 1, (i) => {
    block(i, 10, 14, 12, 12, P.blue, 5);
    i.ellipse(16, 15, 6, 2, hex('#cfe9ff'));
    i.rect(18, 4, 2, 12, P.woodLight);
  }, 'mop bucket'],
  // Surgery
  anesthesia: [1, 1, (i) => {
    block(i, 5, 8, 22, 20, P.steel, 10);
    screen(i, 8, 2, 16, 9, P.screen);
    for (let k = 0; k < 3; k++) i.ellipse(10 + k * 6, 20, 2, 2, [P.blue, P.green, P.yellow][k]!);
  }, 'anesthesia machine'],
  op_table: [1, 2, (i) => {
    block(i, 6, 6, 20, 52, P.chrome, 6, P.steelDark);
    i.rect(13, 58, 6, 4, P.grey3);
    i.box(9, 8, 14, 8, hex('#7fd6d6'), 1);
    i.ellipse(16, 32, 14, 12, hex('#fff6c8', 90));
  }, 'operating table under surgical light'],
  instrument_tray: [1, 1, (i) => {
    i.rect(15, 14, 2, 14, P.grey3);
    block(i, 4, 6, 24, 12, P.chrome, 3);
    i.line(7, 9, 12, 9, P.grey4); i.line(14, 8, 14, 13, P.grey4); i.line(17, 10, 24, 10, P.grey4);
  }, 'surgical instrument tray'],
  // Ward / ICU
  ward_bed: [1, 2, (i) => bed(i, 0, 0, P.blue, P.blanket), 'ward bed'],
  bedside_table: [1, 1, (i) => {
    block(i, 7, 8, 18, 20, P.woodLight, 10);
    i.rect(10, 4, 5, 6, P.glass); i.ellipse(20, 7, 3, 3, P.pink, true);
  }, 'bedside table with flowers'],
  curtain: [1, 1, (i) => {
    i.rect(2, 2, 28, 2, P.grey3);
    for (let x = 3; x < 29; x += 4) i.rect(x, 4, 3, 24, x % 8 ? hex('#a9d6e5') : hex('#8ecae6'));
  }, 'privacy curtain'],
  icu_monitor: [1, 1, (i) => {
    block(i, 4, 12, 24, 16, P.grey2, 6);
    screen(i, 5, 2, 22, 14, hex('#0f3b3a'));
    i.line(7, 9, 11, 9, P.screen); i.line(11, 9, 13, 4, P.screen); i.line(13, 4, 15, 13, P.screen); i.line(15, 13, 17, 9, P.screen); i.line(17, 9, 25, 9, P.screen);
    i.px(22, 5, P.red); i.px(23, 5, P.yellow);
  }, 'ICU vital signs monitor'],
  icu_bed: [1, 2, (i) => bed(i, 0, 0, P.red, hex('#f7c5d1'), (img) => {
    img.rect(2, 20, 3, 20, P.steel); img.rect(27, 20, 3, 20, P.steel);
  }), 'ICU bed with rails'],
  ventilator: [1, 1, (i) => {
    block(i, 6, 6, 20, 22, P.white, 10);
    screen(i, 9, 8, 14, 7, hex('#9fd8ff'));
    i.line(12, 28, 18, 20, P.blue); i.line(13, 28, 19, 20, P.blue);
  }, 'ventilator'],
  // Research
  research_bench: [2, 1, (i) => {
    block(i, 2, 6, 60, 22, hex('#c8b3e6'), 8, hex('#7b2cbf'));
    for (let k = 0; k < 3; k++) i.ellipse(10 + k * 9, 10, 4, 5, [hex('#7fe0c8', 220), hex('#f4a5c0', 220), hex('#f2c14e', 220)][k]!, true);
    screen(i, 40, 2, 18, 11, hex('#bba7ff'));
  }, 'research bench with flasks'],
  computer_research: [1, 1, (i) => {
    block(i, 3, 12, 26, 16, P.grey2, 6);
    screen(i, 6, 2, 20, 13, hex('#bba7ff'));
    for (let y = 4; y < 13; y += 2) i.rect(8, y, (y * 5) % 14 + 2, 1, P.white);
  }, 'research computer'],
  chem_rack: [1, 1, (i) => {
    i.rect(4, 14, 24, 2, P.woodDark); i.rect(4, 24, 24, 2, P.woodDark);
    for (let k = 0; k < 5; k++) { i.ellipse(7 + k * 5, 10, 2, 4, [P.purple, P.teal, P.yellow, P.red, P.green][k]!, true); i.ellipse(7 + k * 5, 20, 2, 3, [P.green, P.red, P.teal, P.yellow, P.purple][k]!, true); }
  }, 'chemical rack'],
  whiteboard: [1, 1, (i) => {
    i.box(2, 2, 28, 20, P.white, 1);
    i.line(5, 15, 10, 8, P.blue); i.line(10, 8, 15, 12, P.blue); i.line(15, 12, 25, 5, P.red);
    i.rect(6, 18, 10, 1, P.grey3);
    i.rect(6, 22, 2, 7, P.grey3); i.rect(24, 22, 2, 7, P.grey3);
  }, 'whiteboard with formulas'],
  // Experimental care
  exp_pod: [2, 2, (i) => {
    block(i, 6, 10, 52, 48, hex('#ffd2a6'), 12, hex('#ff7b00'));
    i.ellipse(32, 30, 22, 14, hex('#bff6ff', 170));
    i.ellipse(32, 30, 22, 14, hex('#bff6ff', 60), true);
    for (let k = 0; k < 6; k++) i.px(14 + k * 7, 52, [P.green, P.yellow, P.red][k % 3]!);
    i.rect(28, 2, 8, 10, P.grey3); i.ellipse(32, 4, 5, 3, P.yellow, true);
  }, 'experimental treatment pod'],
  tesla_coil: [1, 1, (i) => {
    block(i, 9, 20, 14, 9, P.grey4, 4);
    i.rect(14, 6, 4, 15, hex('#c98f3c'));
    for (let y = 7; y < 20; y += 2) i.rect(13, y, 6, 1, darken(hex('#c98f3c'), 0.3));
    i.ellipse(16, 5, 6, 4, P.chrome, true);
    i.line(9, 2, 6, 0, hex('#bfe7ff')); i.line(23, 3, 27, 1, hex('#bfe7ff'));
  }, 'tesla coil (probably safe)'],
  exp_console: [1, 1, (i) => {
    block(i, 3, 10, 26, 18, P.grey4, 7);
    screen(i, 5, 2, 22, 11, hex('#ffb366'));
    for (let k = 0; k < 4; k++) i.rect(6 + k * 6, 21, 3, 2, [P.red, P.green, P.yellow, P.blue][k]!);
  }, 'experimental control console'],
  // Robot clinic
  robot_table: [1, 2, (i) => {
    block(i, 5, 4, 22, 54, P.chrome, 7, P.steelDark);
    i.rect(5, 26, 22, 2, hex('#7fe0c8'));
    i.box(9, 6, 14, 8, P.white, 1);
    i.rect(13, 58, 6, 4, P.grey3);
  }, 'robot clinic treatment table'],
  robot_arm: [1, 2, (i) => {
    block(i, 6, 44, 20, 16, P.grey3, 6);
    i.rect(13, 22, 6, 24, P.steel);
    i.ellipse(16, 22, 5, 5, P.steelDark, true);
    i.line(16, 22, 6, 10, P.steel); i.line(17, 22, 7, 10, P.steel); i.line(18, 22, 8, 10, P.steel);
    i.ellipse(7, 9, 4, 3, P.orange, true);
    i.ellipse(16, 46, 3, 2, P.screen);
  }, 'articulated surgical robot arm'],
  robot_console: [1, 1, (i) => {
    block(i, 3, 10, 26, 18, P.steelDark, 7);
    screen(i, 5, 2, 22, 11, P.screen);
    i.ellipse(10, 7, 3, 3, P.white); i.rect(16, 5, 8, 1, P.white); i.rect(16, 8, 6, 1, P.white);
  }, 'robot control console'],
  server_rack: [1, 1, (i) => {
    block(i, 6, 1, 20, 28, P.ink, 22);
    for (let y = 9; y < 27; y += 3) { i.rect(8, y, 16, 1, P.grey4); i.px(21, y + 1, P.green); i.px(19, y + 1, (y % 2) ? P.yellow : P.green); }
  }, 'server rack'],
  robot_dock: [1, 1, (i) => {
    i.ellipse(16, 22, 12, 5, P.grey3, true);
    i.box(10, 6, 12, 12, P.white, 1);
    i.rect(12, 9, 3, 3, P.screen); i.rect(17, 9, 3, 3, P.screen);
    i.rect(15, 2, 2, 4, P.grey3); i.px(16, 1, P.red);
  }, 'charging dock with a resting robot'],
};

export function generateFurniture(): Sprite[] {
  return Object.entries(F).map(([name, [w, h, draw, usage]]) => ({ name, img: make(w, h, draw), usage }));
}

export const FURNITURE_SIZES: Record<string, [number, number]> = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, [v[0], v[1]]]));
