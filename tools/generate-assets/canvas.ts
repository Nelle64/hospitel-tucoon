import { PNG } from 'pngjs';
import { darken, lighten, type RGBA } from './palette';

/** Seeded PRNG for deterministic art (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minimal RGBA pixel canvas with pixel-art helpers. */
export class Img {
  data: Uint8ClampedArray;
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  /** Alpha-composited pixel write. */
  px(x: number, y: number, c: RGBA): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c[3] === 0) return;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = 255;
      return;
    }
    const da = this.data[i + 3]! / 255;
    const oa = a + da * (1 - a);
    this.data[i] = (c[0] * a + this.data[i]! * da * (1 - a)) / oa;
    this.data[i + 1] = (c[1] * a + this.data[i + 1]! * da * (1 - a)) / oa;
    this.data[i + 2] = (c[2] * a + this.data[i + 2]! * da * (1 - a)) / oa;
    this.data[i + 3] = oa * 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }

  /** Filled rectangle with top-left light and bottom-right shade (bevel). */
  box(x: number, y: number, w: number, h: number, c: RGBA, bevel = 1): void {
    this.rect(x, y, w, h, c);
    const hi = lighten(c, 0.35);
    const lo = darken(c, 0.3);
    for (let b = 0; b < bevel; b++) {
      for (let xx = x + b; xx < x + w - b; xx++) {
        this.px(xx, y + b, hi);
        this.px(xx, y + h - 1 - b, lo);
      }
      for (let yy = y + b; yy < y + h - b; yy++) {
        this.px(x + b, yy, hi);
        this.px(x + w - 1 - b, yy, lo);
      }
    }
  }

  frame(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let xx = x; xx < x + w; xx++) {
      this.px(xx, y, c);
      this.px(xx, y + h - 1, c);
    }
    for (let yy = y; yy < y + h; yy++) {
      this.px(x, yy, c);
      this.px(x + w - 1, yy, c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA, shade = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        let col = c;
        if (shade) {
          const l = -nx * 0.6 - ny * 0.8;
          col = l > 0.35 ? lighten(c, 0.3) : l < -0.45 ? darken(c, 0.28) : c;
        }
        this.px(x, y, col);
      }
  }

  /** Dark outline around all opaque pixels (cohesive outline style). */
  outline(c: RGBA, only4 = true): void {
    const src = this.data.slice();
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3]! > 40;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (opaque(x, y)) continue;
        const n = opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1) || (!only4 && (opaque(x - 1, y - 1) || opaque(x + 1, y + 1) || opaque(x - 1, y + 1) || opaque(x + 1, y - 1)));
        if (n) this.px(x, y, c);
      }
  }

  /** Soft drop shadow under the sprite (lower right). */
  dropShadow(dx = 1, dy = 2, alpha = 70): void {
    const src = this.data.slice();
    for (let y = this.h - 1; y >= 0; y--)
      for (let x = this.w - 1; x >= 0; x--) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx < 0 || sy < 0) continue;
        if (src[(sy * this.w + sx) * 4 + 3]! > 40 && src[(y * this.w + x) * 4 + 3]! < 10) this.px(x, y, [16, 16, 26, alpha]);
      }
  }

  draw(src: Img, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) this.px(ox + x, oy + y, src.get(x, y));
  }

  /** Recolour every pixel equal to `from` (used for palette swaps). */
  replace(from: RGBA, to: RGBA): void {
    for (let i = 0; i < this.data.length; i += 4)
      if (this.data[i] === from[0] && this.data[i + 1] === from[1] && this.data[i + 2] === from[2] && this.data[i + 3]! > 0) {
        this.data[i] = to[0];
        this.data[i + 1] = to[1];
        this.data[i + 2] = to[2];
      }
  }

  flipX(): Img {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.px(this.w - 1 - x, y, this.get(x, y));
    return o;
  }

  opaqueCount(): number {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i]! > 0) n++;
    return n;
  }

  toPNG(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    return PNG.sync.write(png);
  }

  static fromPNG(buf: Buffer): Img {
    const png = PNG.sync.read(buf);
    const img = new Img(png.width, png.height);
    img.data.set(png.data);
    return img;
  }
}

/** Scale nearest-neighbour (for icons). */
export function scaleNN(src: Img, f: number): Img {
  const o = new Img(Math.round(src.w * f), Math.round(src.h * f));
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
}
