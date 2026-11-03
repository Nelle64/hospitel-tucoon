import { Img } from './canvas';
import { HAIR, P, PANTS, SHIRTS, SKIN, darken, hex, lighten, type RGBA } from './palette';
import type { Sprite } from './generate-tiles';

export const CHAR_W = 24;
export const CHAR_H = 32;
export const DIRS = ['down', 'left', 'right', 'up'] as const;
export const FRAMES_PER_DIR = 7; // walk0..3, work0, work1, sit
export const LIE_FRAME = DIRS.length * FRAMES_PER_DIR; // 28
export const STRIP_FRAMES = LIE_FRAME + 1;

type Dir = (typeof DIRS)[number];
type Part = 'skin' | 'outfit' | 'hair' | 'acc';

export interface Outfit {
  id: string;
  top: RGBA;
  pants: RGBA;
  shoes: RGBA;
  coat?: RGBA;
  detail?: 'stetho' | 'badge' | 'straps' | 'tie' | 'collar';
}

export const OUTFITS: Outfit[] = [
  { id: 'S01', top: hex('#e8a33d'), pants: hex('#3a3f55'), shoes: P.ink, detail: 'collar' },
  { id: 'S02', top: hex('#5fa8d3'), pants: hex('#5fa8d3'), shoes: P.white },
  { id: 'S03', top: hex('#4f7cac'), pants: hex('#33415c'), shoes: P.ink, coat: P.white, detail: 'stetho' },
  { id: 'S04', top: hex('#c9b3f0'), pants: hex('#3a3f55'), shoes: P.ink, coat: hex('#b89ae8') },
  { id: 'S05', top: hex('#5c6bc0'), pants: hex('#3f4a8c'), shoes: P.white, detail: 'badge' },
  { id: 'S06', top: hex('#e9f5f2'), pants: hex('#2d3a3a'), shoes: P.ink, coat: hex('#2a9d8f'), detail: 'tie' },
  { id: 'S07', top: hex('#3a7d44'), pants: hex('#3a7d44'), shoes: P.white },
  { id: 'S08', top: hex('#f2f2f2'), pants: hex('#90be6d'), shoes: hex('#5c4033'), detail: 'straps' },
  { id: 'S09', top: hex('#7b2cbf'), pants: hex('#2d2a32'), shoes: P.ink, coat: P.white },
  ...SHIRTS.map((c, i) => ({ id: `P${i}`, top: c, pants: PANTS[i % PANTS.length]!, shoes: i % 2 ? P.ink : hex('#7a4f2e') })),
];

export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'bald', 'pony'] as const;
export const ACCESSORIES = ['headset', 'goggles', 'glasses', 'mask', 'scrubcap', 'nursecap'] as const;

interface Pose {
  bob: number;
  legL: number; // vertical offset of left leg foot
  legR: number;
  armL: number; // arm swing offset
  armR: number;
  work: boolean;
  sit: boolean;
}

function pose(frame: number): Pose {
  switch (frame) {
    case 1: return { bob: -1, legL: -2, legR: 0, armL: 1, armR: -1, work: false, sit: false };
    case 2: return { bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, work: false, sit: false };
    case 3: return { bob: -1, legL: 0, legR: -2, armL: -1, armR: 1, work: false, sit: false };
    case 4: return { bob: 0, legL: 0, legR: 0, armL: -4, armR: -4, work: true, sit: false };
    case 5: return { bob: 0, legL: 0, legR: 0, armL: -2, armR: -5, work: true, sit: false };
    case 6: return { bob: 3, legL: 0, legR: 0, armL: 0, armR: 0, work: false, sit: true };
    default: return { bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, work: false, sit: false };
  }
}

function shadeRect(img: Img, x: number, y: number, w: number, h: number, c: RGBA): void {
  img.rect(x, y, w, h, c);
  for (let yy = y; yy < y + h; yy++) {
    img.px(x, yy, lighten(c, 0.2));
    img.px(x + w - 1, yy, darken(c, 0.22));
  }
}

/** Draws one frame of the requested layer at offset (ox, 0). */
function figure(img: Img, ox: number, dir: Dir | 'lie', frame: number, part: Part, opts: { skin?: RGBA; outfit?: Outfit; hair?: { style: string; color: RGBA }; acc?: string }): void {
  const p = pose(frame);
  const y0 = p.bob;
  const side = dir === 'left' || dir === 'right';
  if (dir === 'lie') {
    // Top-down lying pose: head on the pillow and shoulders; the bed blanket covers the rest.
    if (part === 'skin') img.ellipse(ox + 12, 8, 5, 5, opts.skin!, true);
    if (part === 'outfit') shadeRect(img, ox + 6, 13, 12, 6, opts.outfit!.coat ?? opts.outfit!.top);
    if (part === 'skin') {
      img.px(ox + 10, 8, P.ink);
      img.px(ox + 14, 8, P.ink);
    }
    if (part === 'hair') hairShape(img, ox, 0, 'down', opts.hair!.style, opts.hair!.color, true);
    if (part === 'acc') accessory(img, ox, 0, 'down', opts.acc!);
    return;
  }
  const o = opts.outfit;
  // Legs and shoes (outfit layer).
  if (part === 'outfit' && o) {
    if (p.sit) {
      if (side) {
        const fx = dir === 'left' ? ox + 3 : ox + 12;
        shadeRect(img, fx, 22 + y0 - 3, 9, 4, o.pants);
        img.rect(dir === 'left' ? fx - 1 : fx + 8, 22 + y0 - 3, 2, 5, o.shoes);
      } else {
        shadeRect(img, ox + 8, 23 + y0 - 3, 8, 4, o.pants);
        img.rect(ox + 8, 26 + y0 - 2, 3, 2, o.shoes);
        img.rect(ox + 13, 26 + y0 - 2, 3, 2, o.shoes);
      }
    } else if (side) {
      const back = dir === 'left' ? 1 : -1;
      shadeRect(img, ox + 10 + back, 23 + y0 + p.legR, 4, 7 - p.legR, darken(o.pants, 0.12));
      shadeRect(img, ox + 10 - back, 23 + y0 + p.legL, 4, 7 - p.legL, o.pants);
      img.rect(ox + (dir === 'left' ? 8 : 11) - back, 29 + y0, 5, 2, o.shoes);
      img.rect(ox + (dir === 'left' ? 8 : 11) + back, 29 + y0 + Math.min(0, p.legR), 5, 2, darken(o.shoes, 0.15));
    } else {
      shadeRect(img, ox + 8, 23 + y0, 4, 7 + p.legL, o.pants);
      shadeRect(img, ox + 13, 23 + y0, 4, 7 + p.legR, o.pants);
      img.rect(ox + 7, 29 + y0 + p.legL, 5, 2, o.shoes);
      img.rect(ox + 13, 29 + y0 + p.legR, 5, 2, o.shoes);
    }
  }
  // Torso.
  const tx = side ? ox + 8 : ox + 7;
  const tw = side ? 9 : 11;
  if (part === 'outfit' && o) {
    shadeRect(img, tx, 14 + y0, tw, 9, o.top);
    if (o.coat) {
      if (dir === 'down') {
        shadeRect(img, tx, 14 + y0, 3, 12, o.coat);
        shadeRect(img, tx + tw - 3, 14 + y0, 3, 12, o.coat);
        img.rect(tx, 22 + y0, tw, 3, o.coat);
        img.rect(tx + 4, 23 + y0, 3, 2, o.top);
      } else if (dir === 'up') shadeRect(img, tx, 14 + y0, tw, 12, o.coat);
      else shadeRect(img, tx, 14 + y0, tw, 11, o.coat);
    }
    if (dir === 'down') {
      if (o.detail === 'stetho') {
        img.line(tx + 3, 15 + y0, tx + 4, 19 + y0, P.grey4);
        img.line(tx + tw - 4, 15 + y0, tx + tw - 5, 19 + y0, P.grey4);
        img.px(tx + 5, 20 + y0, P.chrome);
      }
      if (o.detail === 'badge') img.rect(tx + 2, 16 + y0, 2, 2, P.yellow);
      if (o.detail === 'tie') img.rect(tx + 5, 15 + y0, 1, 5, P.red);
      if (o.detail === 'collar') img.rect(tx + 4, 14 + y0, 3, 2, P.white);
      if (o.detail === 'straps') {
        img.rect(tx + 2, 14 + y0, 2, 9, o.pants);
        img.rect(tx + tw - 4, 14 + y0, 2, 9, o.pants);
        img.rect(tx + 2, 19 + y0, tw - 4, 4, o.pants);
      }
    }
  }
  // Arms: sleeves (outfit) + hands (skin).
  const sleeve = o ? (o.coat ?? o.top) : P.white;
  const armY = 15 + y0;
  if (side) {
    const ax = dir === 'left' ? ox + 11 : ox + 11;
    const reach = p.work ? (dir === 'left' ? -5 : 5) : 0;
    if (part === 'outfit' && o) shadeRect(img, ax + (p.work ? reach / 2 : 0), armY + (p.work ? 0 : p.armL), 3, 6, sleeve);
    if (part === 'skin') img.rect(ax + reach + (p.work ? 0 : 0), armY + 6 + (p.work ? -3 : p.armL), 3, 2, opts.skin!);
  } else {
    const lift = p.work ? 1 : 0;
    if (part === 'outfit' && o) {
      shadeRect(img, ox + 5, armY + (p.work ? 0 : p.armL), 2, 6 - lift * 2, sleeve);
      shadeRect(img, ox + 18, armY + (p.work ? 0 : p.armR), 2, 6 - lift * 2, sleeve);
    }
    if (part === 'skin') {
      if (p.work && dir === 'down') {
        img.rect(ox + 8, 19 + y0 + p.armL / 2, 3, 2, opts.skin!);
        img.rect(ox + 13, 19 + y0 + p.armR / 2, 3, 2, opts.skin!);
      } else {
        img.rect(ox + 5, armY + 6 + p.armL, 2, 2, opts.skin!);
        img.rect(ox + 18, armY + 6 + p.armR, 2, 2, opts.skin!);
      }
    }
  }
  // Neck + head (skin).
  const hx = side ? (dir === 'left' ? ox + 11 : ox + 13) : ox + 12;
  if (part === 'skin') {
    img.rect(hx - 1, 12 + y0, 3, 3, darken(opts.skin!, 0.1));
    img.ellipse(hx, 8 + y0, 5, 5, opts.skin!, true);
    if (dir === 'down') {
      img.px(hx - 2, 9 + y0, P.ink);
      img.px(hx + 2, 9 + y0, P.ink);
      img.px(hx - 2, 8 + y0, lighten(P.ink, 0.6));
      img.px(hx, 11 + y0, darken(opts.skin!, 0.3));
      img.px(hx + 1, 11 + y0, darken(opts.skin!, 0.3));
    } else if (side) {
      const ex = dir === 'left' ? hx - 3 : hx + 3;
      img.px(ex, 9 + y0, P.ink);
      img.px(dir === 'left' ? hx - 5 : hx + 5, 10 + y0, darken(opts.skin!, 0.15));
    }
  }
  if (part === 'hair') hairShape(img, ox, y0, dir, opts.hair!.style, opts.hair!.color, false, hx);
  if (part === 'acc') accessory(img, ox, y0, dir, opts.acc!, hx);
}

function hairShape(img: Img, ox: number, y0: number, dir: Dir | 'down', style: string, c: RGBA, top: boolean, hxIn?: number): void {
  const hx = hxIn ?? ox + 12;
  const hi = lighten(c, 0.25);
  const back = dir === 'up' || top;
  if (style === 'bald') {
    if (!back) {
      img.rect(hx - 5, 6 + y0, 1, 4, c);
      img.rect(hx + 5, 6 + y0, 1, 4, c);
    } else img.rect(hx - 4, 9 + y0, 9, 2, c);
    return;
  }
  // Cap of hair over the top of the head.
  for (let y = 2; y <= 6; y++) {
    const half = y === 2 ? 3 : y === 3 ? 4 : 5;
    for (let x = -half; x <= half; x++) img.px(hx + x, y + y0, y === 3 && x < 0 ? hi : c);
  }
  if (back) img.rect(hx - 5, 6 + y0, 11, 5, c);
  else if (dir === 'left') img.rect(hx, 5 + y0, 6, 6, c);
  else if (dir === 'right') img.rect(hx - 5, 5 + y0, 6, 6, c);
  else {
    img.rect(hx - 5, 6 + y0, 2, 3, c);
    img.rect(hx + 4, 6 + y0, 2, 3, c);
  }
  switch (style) {
    case 'long':
      if (dir === 'down') {
        img.rect(hx - 6, 7 + y0, 2, 8, c);
        img.rect(hx + 5, 7 + y0, 2, 8, c);
      } else img.rect(hx - 5, 9 + y0, 11, 6, c);
      break;
    case 'bun':
      img.ellipse(hx + (dir === 'left' ? 4 : dir === 'right' ? -4 : 0), 1 + y0, 3, 2, c, true);
      break;
    case 'curly':
      for (let k = -5; k <= 5; k += 2) img.ellipse(hx + k, 3 + y0, 2, 2, c, true);
      break;
    case 'pony':
      if (dir === 'left') img.rect(hx + 5, 8 + y0, 3, 7, c);
      else if (dir === 'right') img.rect(hx - 7, 8 + y0, 3, 7, c);
      else if (dir === 'up') img.rect(hx - 1, 9 + y0, 3, 8, c);
      break;
    default:
      if (dir === 'down') img.rect(hx - 3, 5 + y0, 5, 1, hi);
  }
}

function accessory(img: Img, ox: number, y0: number, dir: Dir | 'down', acc: string, hxIn?: number): void {
  const hx = hxIn ?? ox + 12;
  switch (acc) {
    case 'headset':
      img.rect(hx - 6, 7 + y0, 2, 4, P.ink);
      if (dir !== 'up') img.line(hx - 5, 11 + y0, hx - 2, 12 + y0, P.ink);
      img.rect(hx - 5, 2 + y0, 11, 1, P.ink);
      break;
    case 'goggles':
      if (dir === 'down') {
        img.rect(hx - 4, 8 + y0, 3, 2, hex('#bfe7ff', 220));
        img.rect(hx + 1, 8 + y0, 3, 2, hex('#bfe7ff', 220));
        img.rect(hx - 1, 8 + y0, 2, 1, P.grey4);
      } else if (dir !== 'up') img.rect(dir === 'left' ? hx - 5 : hx + 2, 8 + y0, 3, 2, hex('#bfe7ff', 220));
      break;
    case 'glasses':
      if (dir === 'down') {
        img.frame(hx - 4, 8 + y0, 3, 3, P.ink);
        img.frame(hx + 1, 8 + y0, 3, 3, P.ink);
      } else if (dir !== 'up') img.frame(dir === 'left' ? hx - 5 : hx + 2, 8 + y0, 3, 3, P.ink);
      break;
    case 'mask':
      if (dir === 'down') img.rect(hx - 3, 10 + y0, 7, 3, hex('#9fd8cf'));
      else if (dir !== 'up') img.rect(dir === 'left' ? hx - 5 : hx, 10 + y0, 6, 3, hex('#9fd8cf'));
      break;
    case 'scrubcap':
      for (let y = 2; y <= 5; y++) {
        const half = y === 2 ? 3 : y === 3 ? 4 : 5;
        for (let x = -half; x <= half; x++) img.px(hx + x, y + y0, hex('#4c9a5a'));
      }
      break;
    case 'nursecap':
      img.rect(hx - 3, 1 + y0, 7, 2, P.white);
      img.px(hx, 1 + y0, P.red);
      break;
  }
}

function strip(part: Part, opts: Parameters<typeof figure>[5]): Img {
  const img = new Img(CHAR_W * STRIP_FRAMES, CHAR_H);
  DIRS.forEach((dir, di) => {
    for (let f = 0; f < FRAMES_PER_DIR; f++) {
      const ox = (di * FRAMES_PER_DIR + f) * CHAR_W;
      if (dir === 'right') {
        const tmp = new Img(CHAR_W, CHAR_H);
        figure(tmp, 0, 'left', f, part, opts);
        img.draw(tmp.flipX(), ox, 0);
      } else figure(img, ox, dir, f, part, opts);
    }
  });
  figure(img, LIE_FRAME * CHAR_W, 'lie', 0, part, opts);
  return img;
}

/** Outline each frame of a fully composed strip (used for preview sheets / gallery only). */
export function composePreview(layers: Img[]): Img {
  const out = new Img(CHAR_W * STRIP_FRAMES, CHAR_H);
  for (const l of layers) out.draw(l, 0, 0);
  const frames = new Img(out.w, out.h);
  for (let f = 0; f < STRIP_FRAMES; f++) {
    const fr = new Img(CHAR_W, CHAR_H);
    for (let y = 0; y < CHAR_H; y++) for (let x = 0; x < CHAR_W; x++) fr.px(x, y, out.get(f * CHAR_W + x, y));
    fr.outline(P.outline);
    frames.draw(fr, f * CHAR_W, 0);
  }
  return frames;
}

export function generateCharacters(): Sprite[] {
  const out: Sprite[] = [];
  SKIN.forEach((s, i) => out.push({ name: `skin_${i}`, img: strip('skin', { skin: s }), usage: 'character skin layer (head, hands)' }));
  for (const o of OUTFITS) out.push({ name: `outfit_${o.id}`, img: strip('outfit', { outfit: o }), usage: o.id.startsWith('S') ? `uniform for role ${o.id}` : 'patient clothes' });
  HAIR_STYLES.forEach((st) => HAIR.forEach((c, ci) => out.push({ name: `hair_${st}_${ci}`, img: strip('hair', { hair: { style: st, color: c } }), usage: 'hair layer' })));
  for (const a of ACCESSORIES) out.push({ name: `acc_${a}`, img: strip('acc', { acc: a }), usage: 'accessory layer' });
  return out;
}

export const ROLE_ACCESSORY: Record<string, string | null> = { S01: 'headset', S02: 'nursecap', S03: null, S04: 'goggles', S05: null, S06: null, S07: 'scrubcap', S08: null, S09: 'glasses' };
