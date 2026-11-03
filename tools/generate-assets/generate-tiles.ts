import { Img, rng } from './canvas';
import { P, darken, hex, lighten, mix, type RGBA } from './palette';

export interface Sprite {
  name: string;
  img: Img;
  usage: string;
}

const T = 32;

function grass(seed: number, base: RGBA, flowers: boolean): Img {
  const img = new Img(T, T);
  const r = rng(seed);
  img.rect(0, 0, T, T, base);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    const c = r() < 0.5 ? lighten(base, 0.15) : darken(base, 0.15);
    img.px(x, y, c);
    if (r() < 0.4) img.px(x, y - 1, lighten(base, 0.25));
  }
  if (flowers)
    for (let i = 0; i < 3; i++) {
      const x = 3 + Math.floor(r() * 26);
      const y = 3 + Math.floor(r() * 26);
      const c = [P.yellow, P.white, P.pink][i % 3]!;
      img.px(x, y, c);
      img.px(x + 1, y, c);
      img.px(x, y + 1, c);
      img.px(x + 1, y + 1, darken(c, 0.2));
    }
  return img;
}

function corridor(seed: number): Img {
  const img = new Img(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const tile = ((x >> 4) + (y >> 4)) % 2;
      let c = tile ? P.corridor1 : mix(P.corridor1, P.corridor2, 0.5);
      if (r() < 0.06) c = darken(c, 0.04);
      img.px(x, y, c);
    }
  // grout lines and a light top-left edge per 16 px tile
  for (let i = 0; i < T; i++) {
    img.px(i, 0, darken(P.corridor2, 0.12));
    img.px(i, 16, darken(P.corridor2, 0.12));
    img.px(0, i, darken(P.corridor2, 0.12));
    img.px(16, i, darken(P.corridor2, 0.12));
    img.px(i, 1, lighten(P.corridor1, 0.3));
    img.px(i, 17, lighten(P.corridor1, 0.3));
  }
  return img;
}

type FloorStyle = 'plank' | 'carpet' | 'lino' | 'tile' | 'tech' | 'concrete' | 'sterile' | 'plate';

const FLOORS: Record<string, { style: FloorStyle; base: string; accent: string }> = {
  R01: { style: 'plank', base: '#c89b6d', accent: '#e8a33d' },
  R02: { style: 'carpet', base: '#8fbf7a', accent: '#6e9f5c' },
  R03: { style: 'lino', base: '#cfe2f3', accent: '#4f9dde' },
  R04: { style: 'tile', base: '#f6dade', accent: '#d1495b' },
  R05: { style: 'tile', base: '#d4f1ec', accent: '#2ec4b6' },
  R06: { style: 'plank', base: '#b98a5d', accent: '#c38d5e' },
  R07: { style: 'tile', base: '#e6dcf5', accent: '#9b5de5' },
  R08: { style: 'tech', base: '#8e9bd6', accent: '#5c6bc0' },
  R09: { style: 'sterile', base: '#f3d6d8', accent: '#e63946' },
  R10: { style: 'lino', base: '#f7dcc2', accent: '#f4a259' },
  R11: { style: 'tile', base: '#d4eedf', accent: '#43aa8b' },
  R12: { style: 'concrete', base: '#bfc4b8', accent: '#90be6d' },
  R13: { style: 'sterile', base: '#cdeeee', accent: '#00a6a6' },
  R14: { style: 'lino', base: '#dcecf6', accent: '#8ecae6' },
  R15: { style: 'sterile', base: '#f6d4dc', accent: '#ef476f' },
  R16: { style: 'tech', base: '#c8b3e6', accent: '#7b2cbf' },
  R17: { style: 'tech', base: '#f6cfa6', accent: '#ff7b00' },
  R18: { style: 'plate', base: '#c9cfd6', accent: '#adb5bd' },
};

function floor(id: string): Img {
  const f = FLOORS[id]!;
  const base = hex(f.base);
  const acc = hex(f.accent);
  const img = new Img(T, T);
  const r = rng(id.charCodeAt(1) * 977 + id.charCodeAt(2));
  img.rect(0, 0, T, T, base);
  switch (f.style) {
    case 'plank':
      for (let row = 0; row < 4; row++) {
        const y = row * 8;
        const off = (row % 2) * 12;
        for (let x = 0; x < T; x++) img.px(x, y, darken(base, 0.25));
        for (let x = 0; x < T; x++) img.px(x, y + 1, lighten(base, 0.12));
        for (const sx of [off, off + 16]) for (let yy = y; yy < y + 8; yy++) img.px(sx % T, yy, darken(base, 0.2));
        for (let k = 0; k < 6; k++) img.px(Math.floor(r() * T), y + 2 + Math.floor(r() * 5), darken(base, 0.1));
      }
      break;
    case 'carpet':
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y * 3) % 7 === 0 || r() < 0.08) img.px(x, y, (x + y) % 2 ? darken(base, 0.08) : lighten(base, 0.06));
      for (let i = 0; i < T; i += 8) for (let j = 0; j < T; j += 8) img.px(i + 4, j + 4, acc);
      break;
    case 'lino':
      for (let i = 0; i < 90; i++) img.px(Math.floor(r() * T), Math.floor(r() * T), r() < 0.5 ? darken(base, 0.08) : lighten(base, 0.1));
      for (let x = 0; x < T; x++) {
        img.px(x, 0, darken(base, 0.12));
        img.px(x, 31, darken(base, 0.06));
      }
      break;
    case 'tile':
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (((x >> 3) + (y >> 3)) % 2) img.px(x, y, lighten(base, 0.18));
      for (let i = 0; i < T; i += 8)
        for (let j = 0; j < T; j++) {
          img.px(i, j, darken(base, 0.15));
          img.px(j, i, darken(base, 0.15));
        }
      img.px(4, 4, acc);
      img.px(20, 20, acc);
      break;
    case 'tech':
      for (let i = 0; i < T; i += 16)
        for (let j = 0; j < T; j++) {
          img.px(i, j, darken(base, 0.25));
          img.px(j, i, darken(base, 0.25));
          img.px(i + 1, j, lighten(base, 0.2));
          img.px(j, i + 1, lighten(base, 0.2));
        }
      for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28], [19, 19], [12, 12]] as const) img.px(x, y, darken(base, 0.35));
      for (let x = 6; x < 11; x++) img.px(x, 8, acc);
      break;
    case 'concrete':
      for (let i = 0; i < 150; i++) img.px(Math.floor(r() * T), Math.floor(r() * T), r() < 0.5 ? darken(base, 0.1) : lighten(base, 0.08));
      img.line(2, 30, 9, 26, darken(base, 0.2));
      break;
    case 'sterile':
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < 0.04) img.px(x, y, lighten(base, 0.2));
      for (let i = 0; i < T; i += 16)
        for (let j = 0; j < T; j++) {
          img.px(i, j, darken(base, 0.1));
          img.px(j, i, darken(base, 0.1));
        }
      for (let x = 0; x < T; x++) img.px(x, 30, mix(base, acc, 0.4));
      break;
    case 'plate':
      img.rect(1, 1, 30, 30, lighten(base, 0.05));
      img.frame(0, 0, 32, 32, darken(base, 0.3));
      for (let y = 4; y < T; y += 6) for (let x = (y / 6) % 2 ? 4 : 7; x < T; x += 6) {
        img.px(x, y, lighten(base, 0.35));
        img.px(x + 1, y + 1, darken(base, 0.25));
      }
      for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29]] as const) img.px(x, y, P.grey3);
      break;
  }
  return img;
}

function entranceMat(): Img {
  const img = corridor(99);
  img.box(3, 6, 26, 20, hex('#3d5a80'), 1);
  for (let y = 9; y < 24; y += 3) for (let x = 6; x < 26; x++) img.px(x, y, hex('#5b7fa8'));
  // red cross motif
  img.rect(14, 11, 4, 10, P.red);
  img.rect(11, 14, 10, 4, P.red);
  return img;
}

function wallPieces(): Sprite[] {
  const out: Sprite[] = [];
  // North wall: visible face (3/4 view) inside the room's top row.
  const n = new Img(T, 12);
  n.rect(0, 0, T, 4, P.wallTop);
  n.rect(0, 4, T, 7, P.wallFace);
  n.rect(0, 11, T, 1, P.wallDark);
  for (let x = 0; x < T; x++) {
    n.px(x, 0, lighten(P.wallTop, 0.3));
    n.px(x, 4, darken(P.wallFace, 0.1));
  }
  for (let x = 4; x < T; x += 16) n.rect(x, 6, 1, 4, darken(P.wallFace, 0.15));
  out.push({ name: 'wall_n', img: n, usage: 'room north wall face' });
  const s = new Img(T, 4);
  s.rect(0, 0, T, 4, P.wallTop);
  for (let x = 0; x < T; x++) {
    s.px(x, 0, lighten(P.wallTop, 0.25));
    s.px(x, 3, P.wallDark);
  }
  out.push({ name: 'wall_s', img: s, usage: 'room south wall' });
  const wv = new Img(4, T);
  wv.rect(0, 0, 4, T, P.wallTop);
  for (let y = 0; y < T; y++) {
    wv.px(0, y, lighten(P.wallTop, 0.25));
    wv.px(3, y, P.wallDark);
  }
  out.push({ name: 'wall_w', img: wv, usage: 'room west wall' });
  out.push({ name: 'wall_e', img: wv.flipX(), usage: 'room east wall' });
  // Doors: frame + door leaf (opened).
  const dn = new Img(T, 12);
  dn.rect(0, 0, 6, 12, P.wallFace);
  dn.rect(26, 0, 6, 12, P.wallFace);
  dn.rect(0, 0, 6, 4, P.wallTop);
  dn.rect(26, 0, 6, 4, P.wallTop);
  dn.rect(5, 0, 2, 12, P.door);
  dn.rect(25, 0, 2, 12, P.door);
  dn.rect(7, 10, 18, 2, hex('#cfc7b6'));
  out.push({ name: 'door_n', img: dn, usage: 'door in north wall' });
  const ds = new Img(T, 4);
  ds.rect(0, 0, 6, 4, P.wallTop);
  ds.rect(26, 0, 6, 4, P.wallTop);
  ds.rect(5, 0, 2, 4, P.door);
  ds.rect(25, 0, 2, 4, P.door);
  out.push({ name: 'door_s', img: ds, usage: 'door in south wall' });
  const dw = new Img(4, T);
  dw.rect(0, 0, 4, 6, P.wallTop);
  dw.rect(0, 26, 4, 6, P.wallTop);
  dw.rect(0, 5, 4, 2, P.door);
  dw.rect(0, 25, 4, 2, P.door);
  out.push({ name: 'door_w', img: dw, usage: 'door in west wall' });
  out.push({ name: 'door_e', img: dw.flipX(), usage: 'door in east wall' });
  return out;
}

export function generateTiles(): Sprite[] {
  const out: Sprite[] = [];
  for (let i = 0; i < 4; i++) out.push({ name: `grass_${i}`, img: grass(100 + i, [P.grass1, P.grass2, P.grass1, P.grass3][i]!, i === 2), usage: 'owned empty land' });
  const locked = grass(200, P.lockedGrass, false);
  for (let i = -32; i < 32; i += 8) locked.line(i, 31, i + 31, 0, darken(P.lockedGrass, 0.2));
  out.push({ name: 'grass_locked', img: locked, usage: 'land not yet purchased' });
  const fence = new Img(T, T);
  fence.rect(0, 13, T, 2, P.woodDark);
  for (let x = 2; x < T; x += 8) fence.box(x, 8, 3, 14, P.wood, 1);
  out.push({ name: 'fence', img: fence, usage: 'land border fence overlay' });
  for (let i = 0; i < 2; i++) out.push({ name: `corridor_${i}`, img: corridor(300 + i), usage: 'corridor floor' });
  out.push({ name: 'entrance', img: entranceMat(), usage: 'hospital entrance' });
  for (const id of Object.keys(FLOORS)) out.push({ name: `floor_${id}`, img: floor(id), usage: `floor for room ${id}` });
  out.push(...wallPieces());
  // Blueprint and selection overlays.
  const bp = new Img(T, T);
  bp.rect(0, 0, T, T, hex('#4aa3ff', 70));
  for (let i = 0; i < T; i += 4) {
    bp.px(i, 0, hex('#bfe0ff', 200));
    bp.px(0, i, hex('#bfe0ff', 200));
  }
  out.push({ name: 'blueprint', img: bp, usage: 'blueprint planning overlay' });
  return out;
}
