import type { Dir } from '../core/state';
import type { GameApp } from '../app';

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  t0: number;
}

/**
 * Touch-first input: one finger pans in normal mode, two fingers pan/pinch-zoom in every mode,
 * build mode drags a rectangle (never builds without explicit confirmation), corner handles resize,
 * tapping the room outline moves the proposed door.
 */
export class InputController {
  private ptrs = new Map<number, Ptr>();
  private panning = false;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private dragStart: { tx: number; ty: number } | null = null;
  private resizeAnchor: { ax: number; ay: number } | null = null;
  private preDraft: string | null = null;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private moved = false;

  constructor(private el: HTMLElement, private app: GameApp) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.app.scene?.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now() });
    this.app.userGesture();
    if (this.ptrs.size === 2) {
      // Second finger: cancel any rectangle drag and switch to pan/zoom.
      this.clearLong();
      if (this.preDraft !== null) this.app.setDraft(this.preDraft ? JSON.parse(this.preDraft) : null);
      this.dragStart = null;
      this.resizeAnchor = null;
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2 };
      return;
    }
    if (this.ptrs.size > 2) return;
    this.moved = false;
    this.panning = false;
    const scene = this.app.scene;
    if (!scene) return;
    if (this.app.buildMode) {
      this.preDraft = this.app.draft ? JSON.stringify(this.app.draft) : '';
      const d = this.app.draft;
      const t = scene.screenToTile(p.x, p.y);
      if (d && d.kind === 'room') {
        const zoom = scene.cameras.main.zoom;
        const corners: [number, number, number, number][] = [[d.x, d.y, d.x + d.w, d.y + d.h], [d.x + d.w, d.y, d.x, d.y + d.h], [d.x, d.y + d.h, d.x + d.w, d.y], [d.x + d.w, d.y + d.h, d.x, d.y]];
        for (const [cx, cy, ax, ay] of corners) {
          if (Math.hypot(t.wx - cx * 32, t.wy - cy * 32) < 26 / zoom + 8) {
            this.resizeAnchor = { ax, ay };
            return;
          }
        }
      }
      this.dragStart = { tx: t.tx, ty: t.ty };
    } else {
      this.longTimer = setTimeout(() => {
        if (!this.moved && this.ptrs.size === 1) this.app.longPress(p.x, p.y);
      }, 520);
    }
  }

  private move(e: PointerEvent): void {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    const p = this.local(e);
    const dx = p.x - ptr.x;
    const dy = p.y - ptr.y;
    ptr.x = p.x;
    ptr.y = p.y;
    const scene = this.app.scene;
    if (!scene) return;
    if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 8) {
      this.moved = true;
      this.clearLong();
    }
    if (this.ptrs.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      scene.panBy(mx - this.pinch.mx, my - this.pinch.my);
      if (this.pinch.d > 10) scene.zoomAt(d / this.pinch.d, mx, my);
      this.pinch = { d, mx, my };
      return;
    }
    if (this.app.buildMode) {
      const t = scene.screenToTile(p.x, p.y);
      if (this.resizeAnchor) {
        const d = this.app.draft!;
        const cx = Math.round(t.wx / 32);
        const cy = Math.round(t.wy / 32);
        const x0 = Math.min(cx, this.resizeAnchor.ax);
        const y0 = Math.min(cy, this.resizeAnchor.ay);
        const w = Math.max(1, Math.abs(cx - this.resizeAnchor.ax));
        const h = Math.max(1, Math.abs(cy - this.resizeAnchor.ay));
        if (x0 !== d.x || y0 !== d.y || w !== d.w || h !== d.h) this.app.setDraft({ ...d, x: x0, y: y0, w, h, door: null });
        return;
      }
      if (this.dragStart && this.moved) {
        const x0 = Math.min(this.dragStart.tx, t.tx);
        const y0 = Math.min(this.dragStart.ty, t.ty);
        this.app.setDraft({ ...this.app.newDraftBase(), x: x0, y: y0, w: Math.abs(t.tx - this.dragStart.tx) + 1, h: Math.abs(t.ty - this.dragStart.ty) + 1, door: null });
      }
      return;
    }
    if (this.moved) {
      this.panning = true;
      scene.panBy(dx, dy);
    }
  }

  private up(e: PointerEvent): void {
    const ptr = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    this.clearLong();
    if (this.ptrs.size < 2) this.pinch = null;
    if (!ptr || this.ptrs.size > 0) return;
    const scene = this.app.scene;
    const p = this.local(e);
    const quick = performance.now() - ptr.t0 < 450;
    if (scene && !this.moved && quick) {
      if (this.app.buildMode) this.buildTap(p.x, p.y);
      else {
        const now = performance.now();
        if (now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
          scene.zoomAt(1.6, p.x, p.y);
          this.lastTap.t = 0;
        } else {
          this.lastTap = { t: now, x: p.x, y: p.y };
          this.app.tap(p.x, p.y);
        }
      }
    }
    this.dragStart = null;
    this.resizeAnchor = null;
    this.preDraft = null;
    this.panning = false;
  }

  private cancel(e: PointerEvent): void {
    this.ptrs.delete(e.pointerId);
    this.clearLong();
    this.pinch = null;
    this.dragStart = null;
    this.resizeAnchor = null;
  }

  private clearLong(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    this.longTimer = null;
  }

  private buildTap(x: number, y: number): void {
    const scene = this.app.scene!;
    const t = scene.screenToTile(x, y);
    const d = this.app.draft;
    if (d && d.kind === 'room') {
      const inside = t.tx >= d.x && t.tx < d.x + d.w && t.ty >= d.y && t.ty < d.y + d.h;
      const onEdge = inside && (t.tx === d.x || t.tx === d.x + d.w - 1 || t.ty === d.y || t.ty === d.y + d.h - 1);
      if (onEdge) {
        const dirs: Dir[] = [];
        if (t.ty === d.y) dirs.push('N');
        if (t.ty === d.y + d.h - 1) dirs.push('S');
        if (t.tx === d.x) dirs.push('W');
        if (t.tx === d.x + d.w - 1) dirs.push('E');
        // Prefer the side facing a corridor.
        const g = this.app.engine.world.grid;
        const off: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
        const dir = dirs.find((dd) => g.kind[(t.ty + off[dd][1]) * 64 + t.tx + off[dd][0]] === 1) ?? dirs[0]!;
        this.app.setDraft({ ...d, door: { x: t.tx, y: t.ty, dir } });
        return;
      }
      if (inside) return;
    }
    // Tap places a minimum-size preview at the tapped tile.
    this.app.setDraft({ ...this.app.newDraftBase(), x: t.tx, y: t.ty, door: null }, true);
  }
}
