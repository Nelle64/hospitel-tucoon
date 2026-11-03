import { Img } from './canvas';
import type { Sprite } from './generate-tiles';

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Atlas {
  name: string;
  img: Img;
  frames: Record<string, AtlasFrame>;
}

/** Deterministic shelf packer (sorted by height, then name). 1 px transparent gutter. */
export function packAtlas(name: string, sprites: Sprite[], maxWidth = 1024): Atlas {
  const sorted = sprites.slice().sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w || a.name.localeCompare(b.name));
  const pad = 2;
  const frames: Record<string, AtlasFrame> = {};
  let x = 0;
  let y = 0;
  let shelf = 0;
  let width = 0;
  for (const s of sorted) {
    if (frames[s.name]) throw new Error(`duplicate sprite ${s.name}`);
    if (x + s.img.w > maxWidth) {
      x = 0;
      y += shelf + pad;
      shelf = 0;
    }
    frames[s.name] = { x, y, w: s.img.w, h: s.img.h };
    x += s.img.w + pad;
    shelf = Math.max(shelf, s.img.h);
    width = Math.max(width, x);
  }
  const h = y + shelf;
  const round4 = (v: number) => Math.ceil(Math.max(1, v) / 4) * 4;
  const img = new Img(round4(width), round4(h));
  for (const s of sorted) {
    const f = frames[s.name]!;
    img.draw(s.img, f.x, f.y);
  }
  return { name, img, frames };
}

export function phaserJSON(atlas: Atlas, imageFile: string): unknown {
  const frames: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(atlas.frames)) frames[k] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h } };
  return { frames, meta: { app: 'pixel-hospital-asset-generator', image: imageFile, format: 'RGBA8888', size: { w: atlas.img.w, h: atlas.img.h }, scale: '1' } };
}
