import { Img, rng, scaleNN } from './canvas';
import { HAIR, P, SKIN, darken, hex, lighten, type RGBA } from './palette';
import type { Sprite } from './generate-tiles';

function ic(w: number, h: number, draw: (i: Img) => void, outline = true): Img {
  const img = new Img(w, h);
  draw(img);
  if (outline) img.outline(P.outline);
  return img;
}

const E: Record<string, (i: Img) => void> = {
  sneeze: (i) => { for (const [x, y] of [[3, 8], [6, 5], [9, 9], [12, 6], [5, 12]] as const) i.ellipse(x, y, 1.5, 1.5, hex('#bfe7ff'), true); },
  headache: (i) => { i.line(2, 2, 6, 7, P.yellow); i.line(6, 7, 4, 9, P.yellow); i.line(4, 9, 9, 14, P.yellow); i.line(10, 2, 13, 6, P.orange); },
  limp: (i) => { i.ellipse(8, 8, 6, 6, P.white, true); i.rect(4, 7, 8, 2, P.red); i.rect(7, 4, 2, 8, P.red); },
  nausea: (i) => { for (let a = 0; a < 12; a++) i.px(8 + Math.cos(a) * (a / 2), 8 + Math.sin(a) * (a / 2), hex('#7fd36b')); i.ellipse(8, 8, 2, 2, hex('#a7e08f')); },
  cast: (i) => { i.box(4, 2, 8, 12, P.white, 1); i.line(5, 6, 10, 6, P.grey2); i.line(5, 9, 10, 9, P.grey2); },
  fever: (i) => { i.rect(7, 2, 3, 10, P.white); i.ellipse(8, 12, 3, 3, P.red, true); i.rect(8, 6, 1, 6, P.red); },
  pain: (i) => { i.line(3, 3, 13, 13, P.red); i.line(13, 3, 3, 13, P.red); i.line(8, 1, 8, 15, P.orange); },
  cough: (i) => { i.ellipse(6, 9, 4, 3, P.grey1, true); i.ellipse(10, 7, 4, 3, P.grey1, true); i.ellipse(12, 10, 3, 2, P.grey1, true); },
  raincloud: (i) => { i.ellipse(8, 6, 7, 4, P.grey3, true); for (const x of [4, 8, 12]) i.line(x, 11, x - 1, 14, hex('#6fb3ff')); },
  crown: (i) => { i.rect(2, 8, 12, 5, P.yellow); for (const x of [2, 7, 12]) i.rect(x, 4, 2, 4, P.yellow); i.px(8, 10, P.red); i.px(4, 10, P.blue); i.px(12, 10, P.green); },
  keyboard: (i) => { i.box(1, 5, 14, 8, P.grey2, 1); for (let x = 3; x < 13; x += 2) for (let y = 7; y < 12; y += 2) i.px(x, y, P.grey4); },
  coffee: (i) => { i.box(3, 6, 8, 8, P.white, 1); i.rect(4, 7, 6, 2, hex('#6b3e1f')); i.frame(11, 8, 3, 4, P.white); i.line(6, 1, 5, 4, hex('#e0e0e0', 180)); i.line(9, 1, 8, 4, hex('#e0e0e0', 180)); },
  slides: (i) => { i.box(1, 2, 14, 10, P.white, 1); i.rect(3, 4, 6, 1, P.blue); i.rect(3, 6, 9, 1, P.grey3); i.rect(3, 8, 7, 1, P.grey3); i.rect(7, 12, 2, 3, P.grey3); },
  lightbulb: (i) => { i.ellipse(8, 6, 5, 5, P.yellow, true); i.rect(6, 11, 5, 3, P.grey2); i.px(6, 4, P.white); },
  chair: (i) => { i.box(3, 2, 10, 6, hex('#3d5a80'), 1); i.rect(3, 8, 10, 3, hex('#3d5a80')); i.rect(7, 11, 2, 3, P.grey3); i.rect(4, 14, 8, 1, P.grey3); },
  sparkle: (i) => { for (const [x, y, r] of [[8, 8, 4], [3, 3, 2], [13, 4, 2], [12, 13, 2]] as const) { i.line(x - r, y, x + r, y, P.yellow); i.line(x, y - r, x, y + r, P.yellow); } i.px(8, 8, P.white); },
  rash: (i) => { const r = rng(5); for (let k = 0; k < 10; k++) i.ellipse(2 + r() * 12, 2 + r() * 12, 1.2, 1.2, P.red); },
  confused: (i) => { for (let a = 0; a < 14; a += 0.5) i.px(8 + Math.cos(a) * a * 0.45, 8 + Math.sin(a) * a * 0.45, P.purple); },
  teleport: (i) => { for (let y = 1; y < 15; y += 2) i.rect(4 + (y % 4), y, 8 - (y % 4), 1, hex('#7fe0ff', 220)); i.px(8, 8, P.white); },
  transparent: (i) => { i.ellipse(8, 8, 6, 4, hex('#ffffff', 120), true); i.ellipse(8, 8, 2, 2, hex('#7fe0ff', 200)); i.line(2, 13, 14, 3, P.grey3); },
  float: (i) => { for (const x of [4, 11]) { i.line(x, 13, x, 5, P.teal); i.line(x, 5, x - 2, 7, P.teal); i.line(x, 5, x + 2, 7, P.teal); } },
  timeghost: (i) => { i.ellipse(8, 8, 6, 6, P.white, true); i.line(8, 8, 8, 4, P.ink); i.line(8, 8, 11, 9, P.ink); i.frame(1, 1, 3, 3, P.purple); },
  clones: (i) => { i.ellipse(5, 7, 3, 3, SKIN[0]!, true); i.ellipse(11, 7, 3, 3, SKIN[1]!, true); i.ellipse(8, 11, 3, 3, SKIN[2]!, true); },
  glitch: (i) => { const r = rng(9); for (let k = 0; k < 18; k++) i.rect(Math.floor(r() * 14), Math.floor(r() * 14), 2, 1, [hex('#ff3cac'), hex('#2bd2ff'), hex('#2bff88')][k % 3]!); },
};

function fx(): Sprite[] {
  const out: Sprite[] = [];
  for (const [k, d] of Object.entries(E)) out.push({ name: `fx_${k}`, img: ic(16, 16, d), usage: `disease visual effect ${k}` });
  out.push({ name: 'blanket', img: ic(24, 20, (i) => { i.box(1, 1, 22, 18, P.blanket, 1); for (let x = 3; x < 21; x += 4) i.px(x, 3, lighten(P.blanket, 0.4)); }), usage: 'blanket covering a lying patient' });
  out.push({ name: 'shadow', img: ic(20, 6, (i) => i.ellipse(10, 3, 9, 2.5, hex('#10101a', 90)), false), usage: 'character ground shadow' });
  out.push({ name: 'select', img: ic(28, 12, (i) => { i.ellipse(14, 6, 13, 5, P.yellow); i.ellipse(14, 6, 11, 3.5, [0, 0, 0, 0]); }, false), usage: 'selection ring' });
  for (let f = 0; f < 4; f++) {
    out.push({ name: `dust_${f}`, img: ic(16, 16, (i) => { const r = rng(40 + f); for (let k = 0; k < 6 + f * 2; k++) i.ellipse(8 + (r() - 0.5) * (4 + f * 4), 10 - f * 2 + (r() - 0.5) * 4, 1.5 + (3 - f) * 0.4, 1.5, hex('#d8cbb0', 230 - f * 50)); }, false), usage: 'construction dust animation' });
    out.push({ name: `sparkle_${f}`, img: ic(16, 16, (i) => { const r = 2 + f; i.line(8 - r, 8, 8 + r, 8, P.yellow); i.line(8, 8 - r, 8, 8 + r, P.yellow); if (f > 1) { i.px(3, 3, P.white); i.px(13, 12, P.white); } }, false), usage: 'research/mission sparkle animation' });
  }
  for (let f = 0; f < 3; f++) out.push({ name: `steam_${f}`, img: ic(12, 12, (i) => { i.ellipse(6, 9 - f * 3, 2 + f, 2 + f * 0.5, hex('#ffffff', 170 - f * 40)); }, false), usage: 'steam puff' });
  const sym: Record<string, (i: Img) => void> = {
    coin: (i) => { i.ellipse(8, 8, 6, 6, P.yellow, true); i.rect(7, 4, 2, 8, darken(P.yellow, 0.3)); },
    heart: (i) => { i.ellipse(5, 6, 3.5, 3.5, P.red, true); i.ellipse(11, 6, 3.5, 3.5, P.red, true); for (let y = 7; y < 14; y++) i.rect(2 + (y - 7), y, 12 - 2 * (y - 7), 1, P.red); },
    alert: (i) => { i.ellipse(8, 8, 7, 7, P.red, true); i.rect(7, 3, 2, 7, P.white); i.rect(7, 11, 2, 2, P.white); },
    question: (i) => { i.ellipse(8, 8, 7, 7, P.blue, true); i.rect(6, 4, 5, 2, P.white); i.rect(9, 5, 2, 3, P.white); i.rect(7, 8, 2, 2, P.white); i.rect(7, 11, 2, 2, P.white); },
    zzz: (i) => { for (const [x, y, s] of [[2, 10, 4], [7, 5, 3], [11, 1, 3]] as const) { i.rect(x, y, s, 1, P.white); i.line(x + s - 1, y, x, y + s, P.white); i.rect(x, y + s, s, 1, P.white); } },
    star: (i) => { for (let a = 0; a < 5; a++) { const ang = (a * 2 * Math.PI) / 5 - Math.PI / 2; i.line(8, 8, 8 + Math.cos(ang) * 7, 8 + Math.sin(ang) * 7, P.yellow); } i.ellipse(8, 8, 3, 3, P.yellow); },
    check: (i) => { i.line(3, 8, 6, 12, P.green); i.line(6, 12, 13, 4, P.green); i.line(3, 9, 6, 13, P.green); i.line(6, 13, 13, 5, P.green); },
    cross: (i) => { i.line(3, 3, 13, 13, P.red); i.line(13, 3, 3, 13, P.red); i.line(4, 3, 13, 12, P.red); i.line(12, 3, 3, 12, P.red); },
    bulb: (i) => E.lightbulb!(i),
    wrench: (i) => { i.line(4, 12, 11, 5, P.grey2); i.line(5, 12, 12, 5, P.grey2); i.ellipse(12, 4, 3, 3, P.grey2); i.px(13, 3, [0, 0, 0, 0]); },
  };
  for (const [k, d] of Object.entries(sym)) out.push({ name: `sym_${k}`, img: ic(16, 16, d), usage: `status symbol ${k}` });
  return out;
}

const UI: Record<string, (i: Img) => void> = {
  nav_build: (i) => { i.line(4, 19, 14, 9, P.woodLight); i.line(5, 20, 15, 10, P.woodLight); i.box(12, 3, 9, 6, P.grey2, 1); },
  nav_staff: (i) => { i.ellipse(12, 8, 5, 5, SKIN[1]!, true); i.box(5, 13, 14, 9, P.white, 1); i.rect(11, 14, 2, 6, P.red); i.rect(9, 16, 6, 2, P.red); },
  nav_analytics: (i) => { i.rect(3, 20, 18, 1, P.grey2); i.box(4, 13, 4, 7, P.blue, 1); i.box(10, 8, 4, 12, P.green, 1); i.box(16, 4, 4, 16, P.yellow, 1); },
  nav_missions: (i) => { i.box(5, 3, 14, 18, P.paper, 1); i.rect(8, 7, 8, 1, P.grey3); i.rect(8, 11, 8, 1, P.grey3); i.rect(8, 15, 5, 1, P.grey3); i.line(15, 14, 17, 17, P.green); i.line(17, 17, 21, 10, P.green); },
  ic_research: (i) => { i.rect(10, 3, 4, 7, P.glass); i.ellipse(12, 15, 7, 6, hex('#7fe0c8'), true); i.rect(9, 3, 6, 1, P.grey2); i.px(10, 14, P.white); },
  ic_money: (i) => { i.ellipse(12, 12, 9, 9, P.yellow, true); i.rect(11, 6, 2, 12, darken(P.yellow, 0.35)); i.rect(8, 8, 8, 2, darken(P.yellow, 0.35)); i.rect(8, 14, 8, 2, darken(P.yellow, 0.35)); },
  ic_rep: (i) => sym24(i, 'star'),
  ic_clock: (i) => { i.ellipse(12, 12, 9, 9, P.white, true); i.line(12, 12, 12, 6, P.ink); i.line(12, 12, 16, 14, P.ink); },
  ic_pause: (i) => { i.box(6, 5, 4, 14, P.white, 1); i.box(14, 5, 4, 14, P.white, 1); },
  ic_play: (i) => { for (let x = 0; x < 12; x++) i.rect(7 + x, 6 + x / 2, 1, 12 - x, P.white); },
  ic_fast: (i) => { for (let x = 0; x < 8; x++) { i.rect(3 + x, 7 + x / 2, 1, 10 - x, P.white); i.rect(12 + x, 7 + x / 2, 1, 10 - x, P.white); } },
  ic_faster: (i) => { for (let x = 0; x < 6; x++) for (const o of [1, 8, 15]) i.rect(o + x, 8 + x / 2, 1, 8 - x, P.white); },
  ic_settings: (i) => { i.ellipse(12, 12, 8, 8, P.grey2, true); for (let a = 0; a < 8; a++) i.ellipse(12 + Math.cos((a * Math.PI) / 4) * 8, 12 + Math.sin((a * Math.PI) / 4) * 8, 2, 2, P.grey2); i.ellipse(12, 12, 3, 3, P.ink); },
  ic_save: (i) => { i.box(4, 4, 16, 16, P.blue, 1); i.rect(7, 4, 10, 6, P.white); i.rect(8, 14, 8, 6, P.grey1); },
  ic_warning: (i) => { for (let y = 0; y < 16; y++) i.rect(12 - y / 2, 4 + y, y + 1, 1, P.yellow); i.rect(11, 9, 2, 6, P.ink); i.rect(11, 17, 2, 2, P.ink); },
  ic_check: (i) => scaleInto(i, 'check'),
  ic_close: (i) => scaleInto(i, 'cross'),
  ic_trash: (i) => { i.box(6, 7, 12, 14, P.grey2, 1); i.rect(5, 5, 14, 2, P.grey3); i.rect(10, 3, 4, 2, P.grey3); for (const x of [9, 12, 15]) i.rect(x, 9, 1, 10, P.grey3); },
  ic_upgrade: (i) => { for (let y = 0; y < 8; y++) i.rect(12 - y, 4 + y, y * 2 + 1, 1, P.green); i.box(9, 12, 6, 9, P.green, 1); },
  ic_door: (i) => { i.box(6, 3, 12, 18, P.door, 1); i.px(15, 12, P.yellow); i.rect(4, 21, 16, 1, P.grey3); },
  ic_corridor: (i) => { i.rect(2, 8, 20, 8, P.corridor1); for (let x = 2; x < 22; x += 4) i.rect(x, 8, 1, 8, P.corridor2); },
  ic_blueprint: (i) => { i.box(3, 4, 18, 16, hex('#3a78c2'), 1); for (let x = 5; x < 20; x += 3) i.rect(x, 6, 1, 12, hex('#9cc8ff')); i.rect(6, 10, 10, 1, P.white); i.rect(6, 10, 1, 6, P.white); },
  ic_land: (i) => { i.rect(2, 12, 20, 9, P.grass1); i.rect(4, 6, 2, 8, P.woodDark); i.rect(18, 6, 2, 8, P.woodDark); i.rect(4, 8, 16, 2, P.wood); },
  ic_loan: (i) => { i.box(3, 6, 18, 12, P.green, 1); i.ellipse(12, 12, 3, 3, P.yellow, true); },
  ic_event: (i) => sym24(i, 'alert'),
  ic_patient: (i) => { i.ellipse(12, 8, 5, 5, SKIN[0]!, true); i.box(6, 13, 12, 9, hex('#e07a5f'), 1); },
  ic_queue: (i) => { for (const x of [3, 10, 17]) { i.ellipse(x + 2, 8, 3, 3, SKIN[1]!, true); i.box(x, 12, 5, 8, P.blue, 1); } },
  ic_overlay: (i) => { i.box(3, 3, 18, 18, P.grass1, 1); i.rect(6, 6, 6, 6, hex('#ff5555', 200)); i.rect(12, 12, 6, 6, hex('#ffd055', 200)); },
  ic_info: (i) => { i.ellipse(12, 12, 9, 9, P.blue, true); i.rect(11, 10, 2, 8, P.white); i.rect(11, 6, 2, 2, P.white); },
  ic_inspect: (i) => { i.ellipse(10, 10, 7, 7, P.glass, true); i.frame(4, 4, 13, 13, P.grey3); i.line(15, 15, 21, 21, P.woodDark); i.line(16, 15, 22, 21, P.woodDark); },
  ic_stetho: (i) => { i.ellipse(12, 12, 9, 9, P.yellow, true); i.line(8, 6, 8, 12, P.ink); i.line(16, 6, 16, 12, P.ink); i.line(8, 12, 12, 16, P.ink); i.line(16, 12, 12, 16, P.ink); i.ellipse(12, 18, 2, 2, P.chrome); },
};

function sym24(i: Img, name: string): void {
  const tmp = fx().find((s) => s.name === `sym_${name}`)!.img;
  i.draw(scaleNN(tmp, 1.25), 2, 2);
}
function scaleInto(i: Img, name: string): void {
  sym24(i, name);
}

function roomIcons(): Sprite[] {
  const accents: Record<string, string> = { R01: '#e8a33d', R02: '#7fb069', R03: '#4f9dde', R04: '#d1495b', R05: '#2ec4b6', R06: '#c38d5e', R07: '#9b5de5', R08: '#5c6bc0', R09: '#e63946', R10: '#f4a259', R11: '#43aa8b', R12: '#90be6d', R13: '#00a6a6', R14: '#8ecae6', R15: '#ef476f', R16: '#7b2cbf', R17: '#ff7b00', R18: '#adb5bd' };
  const glyph: Record<string, (i: Img) => void> = {
    R01: (i) => { i.box(4, 11, 16, 7, P.woodLight, 1); i.box(13, 6, 6, 5, P.ink, 1); },
    R02: (i) => { for (const x of [4, 10, 16]) i.box(x, 10, 5, 7, P.green, 1); },
    R03: (i) => { i.box(4, 11, 16, 6, P.steel, 1); i.ellipse(12, 7, 3, 3, SKIN[0]!, true); },
    R04: (i) => { i.rect(10, 4, 4, 14, P.white); i.rect(10, 10, 4, 8, P.red); },
    R05: (i) => { i.box(5, 4, 14, 16, P.bed, 1); i.box(6, 11, 12, 8, hex('#9ee6dd'), 1); },
    R06: (i) => { i.box(4, 10, 16, 8, hex('#c38d5e'), 1); i.box(9, 4, 6, 6, P.white, 1); },
    R07: (i) => { i.rect(10, 3, 4, 8, P.grey4); i.box(6, 12, 12, 6, hex('#e6dcf5'), 1); },
    R08: (i) => { i.ellipse(12, 12, 7, 8, P.white, true); i.rect(11, 6, 2, 12, P.grey2); },
    R09: (i) => { i.rect(10, 4, 4, 16, P.red); i.rect(4, 10, 16, 4, P.red); },
    R10: (i) => { i.box(8, 4, 8, 16, P.white, 1); i.line(9, 9, 15, 9, P.grey2); i.line(9, 13, 15, 13, P.grey2); },
    R11: (i) => { i.ellipse(9, 12, 4, 6, P.red, true); i.ellipse(15, 12, 4, 6, P.white, true); },
    R12: (i) => { i.rect(14, 3, 2, 14, P.woodLight); i.box(8, 15, 10, 5, P.yellow, 1); },
    R13: (i) => { i.ellipse(12, 7, 7, 3, hex('#fff6c8'), true); i.box(6, 12, 12, 6, P.chrome, 1); },
    R14: (i) => { i.box(3, 6, 8, 13, P.bed, 1); i.box(13, 6, 8, 13, P.bed, 1); },
    R15: (i) => { i.box(4, 5, 16, 11, P.ink, 1); i.line(6, 10, 9, 10, P.screen); i.line(9, 10, 11, 6, P.screen); i.line(11, 6, 13, 14, P.screen); i.line(13, 14, 18, 10, P.screen); },
    R16: (i) => { i.ellipse(12, 14, 6, 5, hex('#bba7ff'), true); i.rect(10, 4, 4, 6, P.glass); },
    R17: (i) => { i.ellipse(12, 12, 8, 6, hex('#bff6ff'), true); i.line(6, 4, 9, 8, P.yellow); i.line(18, 4, 15, 8, P.yellow); },
    R18: (i) => { i.box(5, 13, 14, 6, P.grey3, 1); i.line(12, 13, 8, 6, P.steel); i.line(13, 13, 9, 6, P.steel); i.ellipse(8, 5, 3, 2, P.orange, true); },
  };
  return Object.keys(accents).map((id) => ({
    name: `room_${id}`,
    img: ic(24, 24, (i) => {
      i.box(1, 1, 22, 22, lighten(hex(accents[id]!), 0.35), 1);
      i.frame(1, 1, 22, 22, darken(hex(accents[id]!), 0.3));
      glyph[id]!(i);
    }),
    usage: `build menu icon for ${id}`,
  }));
}

function roleIcons(): Sprite[] {
  const uniform: Record<string, string> = { S01: '#e8a33d', S02: '#5fa8d3', S03: '#f7f4ea', S04: '#b89ae8', S05: '#5c6bc0', S06: '#2a9d8f', S07: '#3a7d44', S08: '#90be6d', S09: '#f7f4ea' };
  return Object.entries(uniform).map(([id, c], k) => ({
    name: `role_${id}`,
    img: ic(24, 24, (i) => {
      i.box(4, 14, 16, 9, hex(c), 1);
      i.ellipse(12, 9, 6, 6, SKIN[k % 4]!, true);
      i.rect(6, 3, 12, 3, HAIR[k % 6]!);
      i.px(10, 9, P.ink);
      i.px(14, 9, P.ink);
      if (id === 'S03' || id === 'S06') { i.line(9, 15, 10, 19, P.grey4); i.line(15, 15, 14, 19, P.grey4); }
      if (id === 'S07') i.rect(7, 10, 10, 4, hex('#9fd8cf'));
      if (id === 'S04') i.rect(7, 8, 10, 2, hex('#bfe7ff'));
      if (id === 'S09') { i.frame(8, 8, 3, 3, P.ink); i.frame(13, 8, 3, 3, P.ink); }
      if (id === 'S08') i.rect(16, 4, 2, 18, P.woodLight);
      if (id === 'S02') { i.rect(9, 2, 6, 2, P.white); i.px(12, 2, P.red); }
      if (id === 'S01') i.rect(5, 7, 2, 5, P.ink);
      if (id === 'S05') i.rect(7, 16, 3, 3, P.yellow);
    }),
    usage: `role icon ${id}`,
  }));
}

export function generateEffects(): Sprite[] {
  const out = fx();
  for (const [k, d] of Object.entries(UI)) out.push({ name: k, img: ic(24, 24, d), usage: `UI icon ${k}` });
  out.push(...roomIcons(), ...roleIcons());
  return out;
}

/** Pixel-art app icon (64×64 base) for the PWA manifest and home screen. */
export function appIcon(maskable: boolean): Img {
  const s = 64;
  const img = new Img(s, s);
  for (let y = 0; y < s; y++) img.rect(0, y, s, 1, [Math.round(60 + y * 1.2), Math.round(130 + y * 0.8), 220, 255] as RGBA);
  const pad = maskable ? 10 : 4;
  const w = s - pad * 2;
  img.rect(0, s - pad - 8, s, pad + 8, P.grass1);
  const bx = pad + 4;
  const by = pad + 12;
  const bw = w - 8;
  const bh = w - 20;
  img.box(bx, by, bw, bh, P.white, 1);
  img.rect(bx, by, bw, 4, P.red);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) img.box(bx + 4 + c * Math.floor((bw - 8) / 4), by + 10 + r * 9, 5, 5, hex('#9fd8ff'), 1);
  img.box(bx + bw / 2 - 4, by + bh - 9, 8, 9, P.door, 1);
  const cx = s / 2;
  const cy = pad + 8;
  img.ellipse(cx, cy, 9, 9, P.white, true);
  img.rect(cx - 2, cy - 6, 4, 12, P.red);
  img.rect(cx - 6, cy - 2, 12, 4, P.red);
  return img;
}
