import type Phaser from 'phaser';
import type { RoleId } from '../data/types';

/** Must match tools/generate-assets/generate-characters.ts */
export const CHAR_W = 24;
export const CHAR_H = 32;
export const FRAMES_PER_DIR = 7;
export const LIE_FRAME = 28;
export const STRIP_FRAMES = 29;
export const DIR_INDEX = { down: 0, left: 1, right: 2, up: 3 } as const;
export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'bald', 'pony'];
const ROLE_ACC: Record<string, string | null> = { S01: 'headset', S02: 'nursecap', S03: null, S04: 'goggles', S05: null, S06: null, S07: 'scrubcap', S08: null, S09: 'glasses' };

export interface Appearance {
  key: string;
  layers: string[];
}

/** Deterministic appearance from the visual seed stored on each patient/staff member. */
export function patientAppearance(visual: number): Appearance {
  const v = visual >>> 0;
  const skin = v % 4;
  const outfit = `P${(v >>> 2) % 6}`;
  const style = HAIR_STYLES[(v >>> 5) % 6]!;
  const color = (v >>> 8) % 6;
  const layers = [`skin_${skin}`, `outfit_${outfit}`, `hair_${style}_${color}`];
  if ((v >>> 11) % 5 === 0) layers.push('acc_glasses');
  return { key: `chr-${layers.join('.')}`, layers };
}

export function staffAppearance(role: RoleId, visual: number): Appearance {
  const v = visual >>> 0;
  const skin = v % 4;
  const style = role === 'S07' ? 'short' : HAIR_STYLES[(v >>> 2) % 6]!;
  const color = (v >>> 5) % 6;
  const layers = [`skin_${skin}`, `outfit_${role}`, `hair_${style}_${color}`];
  const acc = ROLE_ACC[role];
  if (acc) layers.push(`acc_${acc}`);
  if (role === 'S07') layers.push('acc_mask');
  else if (!acc && (v >>> 9) % 4 === 0) layers.push('acc_glasses');
  return { key: `chr-${layers.join('.')}`, layers };
}

/** Compose layer strips from the character atlas into one outlined sprite sheet texture (cached). */
export function ensureCharacterTexture(scene: Phaser.Scene, a: Appearance): string {
  const tm = scene.textures;
  if (tm.exists(a.key)) return a.key;
  const atlas = tm.get('chars');
  const src = atlas.getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = CHAR_W * STRIP_FRAMES;
  canvas.height = CHAR_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  for (const name of a.layers) {
    const f = atlas.get(name);
    if (!f || f.name === '__BASE') continue;
    ctx.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
  }
  // Cohesive dark outline per frame (same as the generated preview sheets).
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const W = canvas.width;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < CHAR_H && (x % CHAR_W !== CHAR_W - 1 || true) && d[(y * W + x) * 4 + 3]! > 40;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < CHAR_H; y++)
    for (let x = 0; x < W; x++) {
      if (op(x, y)) continue;
      const fx = x % CHAR_W;
      const n = (fx > 0 && op(x - 1, y)) || (fx < CHAR_W - 1 && op(x + 1, y)) || op(x, y - 1) || op(x, y + 1);
      if (n) {
        const i = (y * W + x) * 4;
        out[i] = 27;
        out[i + 1] = 29;
        out[i + 2] = 46;
        out[i + 3] = 255;
      }
    }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  const tex = tm.addCanvas(a.key, canvas)!;
  for (let i = 0; i < STRIP_FRAMES; i++) tex.add(i, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
  return a.key;
}
