import Phaser from 'phaser';
import { DEF } from '../data/definition';
import type { RoomTypeId } from '../data/types';
import { KIND_CORRIDOR, KIND_ROOM, MAP_W, isOwned } from '../core/grid';
import type { PatientState, RoomState, StaffState } from '../core/state';
import { roomStatus } from '../systems/rules';
import { CHAR_H, CHAR_W, DIR_INDEX, FRAMES_PER_DIR, LIE_FRAME, ensureCharacterTexture, patientAppearance, staffAppearance } from './appearance';
import type { GameApp } from '../app';

const T = 32;
const WORLD = 64 * T;

interface AgentView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image | null;
  blanket: Phaser.GameObjects.Image | null;
  ghosts: Phaser.GameObjects.Sprite[];
  x: number;
  y: number;
  phase: number;
  key: string;
  seen: number;
}

/** Hospital renderer. Reads GameState every frame; owns no game state. */
export class HospitalScene extends Phaser.Scene {
  private app!: GameApp;
  private ground!: Phaser.Textures.DynamicTexture;
  private groundVersion = '';
  private furniture = new Map<number, Phaser.GameObjects.Image[]>();
  private furnitureVersion = -1;
  private agents = new Map<string, AgentView>();
  private overlay!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private previewGhosts: Phaser.GameObjects.Image[] = [];
  private previewKey = '';
  private badges = new Map<number, Phaser.GameObjects.Container>();
  private selectRing!: Phaser.GameObjects.Image;
  private overlayFrame = 0;
  private frameNo = 0;
  fpsSamples: number[] = [];

  constructor() {
    super('hospital');
  }

  init(data: { app: GameApp }): void {
    this.app = data.app;
  }

  preload(): void {
    const base = `${import.meta.env.BASE_URL}assets/`;
    for (const a of ['tiles', 'furniture', 'fx', 'chars']) this.load.atlas(a, `${base}atlas-${a}.png`, `${base}atlas-${a}.json`);
  }

  create(): void {
    this.ground = this.textures.addDynamicTexture('ground', WORLD, WORLD)!;
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);
    this.overlay = this.add.graphics().setDepth(5);
    this.preview = this.add.graphics().setDepth(200000);
    this.selectRing = this.add.image(0, 0, 'fx', 'select').setDepth(9).setVisible(false);
    const cam = this.cameras.main;
    cam.setBounds(-T * 2, -T * 2, WORLD + T * 4, WORLD + T * 3);
    cam.setBackgroundColor('#2c4a2b');
    cam.roundPixels = true;
    this.app.onSceneReady(this);
  }

  // ------------------------------------------------------------------ camera helpers
  centerOn(tileX: number, tileY: number, zoom?: number): void {
    const cam = this.cameras.main;
    if (zoom) cam.setZoom(zoom);
    cam.centerOn(tileX * T + 16, tileY * T + 16);
  }

  screenToTile(x: number, y: number): { tx: number; ty: number; wx: number; wy: number } {
    const p = this.cameras.main.getWorldPoint(x, y);
    return { tx: Math.floor(p.x / T), ty: Math.floor(p.y / T), wx: p.x, wy: p.y };
  }

  panBy(dx: number, dy: number): void {
    const cam = this.cameras.main;
    cam.scrollX -= dx / cam.zoom;
    cam.scrollY -= dy / cam.zoom;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    const z = Phaser.Math.Clamp(cam.zoom * factor, 0.35, 3.5);
    cam.setZoom(z);
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  /** Nearest agent to a world point (for tap selection). */
  pickAgent(wx: number, wy: number): { kind: 'patient' | 'staff'; id: number } | null {
    let best: { kind: 'patient' | 'staff'; id: number } | null = null;
    let bd = 22 * 22;
    for (const [k, v] of this.agents) {
      if (!v.sprite.visible) continue;
      const dx = v.x - wx;
      const dy = v.y - 14 - wy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = { kind: k[0] === 'p' ? 'patient' : 'staff', id: Number(k.slice(1)) };
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ frame
  override update(_time: number, delta: number): void {
    this.frameNo++;
    if (this.fpsSamples.length < 600) this.fpsSamples.push(delta);
    else this.fpsSamples[this.frameNo % 600] = delta;
    this.app.frame(delta);
    const w = this.app.engine.world;
    const s = w.state;
    const gv = `${s.map.version}:${s.progress.landStage}`;
    if (gv !== this.groundVersion) {
      this.drawGround();
      this.groundVersion = gv;
    }
    if (s.map.version !== this.furnitureVersion) {
      this.syncFurniture();
      this.furnitureVersion = s.map.version;
    }
    this.syncAgents(delta);
    if (++this.overlayFrame % 6 === 0) {
      this.drawOverlay();
      this.syncBadges();
    }
    this.drawPreview();
  }

  // ------------------------------------------------------------------ static layer
  private drawGround(): void {
    const w = this.app.engine.world;
    const s = w.state;
    const g = w.grid;
    const dt = this.ground;
    dt.clear();
    const stamp = (frame: string, x: number, y: number, atlas = 'tiles') => dt.stamp(atlas, frame, x, y, { originX: 0, originY: 0 });
    const room = new Map(s.rooms.map((r) => [r.id, r]));
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const i = y * MAP_W + x;
        const owned = isOwned(s.progress.landStage, x, y);
        if (g.kind[i] === KIND_ROOM) stamp(`floor_${room.get(g.room[i]!)!.type}`, x * T, y * T);
        else if (g.kind[i] === KIND_CORRIDOR) stamp(i === s.map.entrance ? 'entrance' : `corridor_${(x + y) % 2}`, x * T, y * T);
        else if (owned) stamp(`grass_${(x * 7 + y * 13) % 4}`, x * T, y * T);
        else stamp('grass_locked', x * T, y * T);
      }
    // Land border fence.
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const owned = isOwned(s.progress.landStage, x, y);
        if (owned && y > 0 && !isOwned(s.progress.landStage, x, y - 1)) stamp('fence', x * T, y * T - 14);
      }
    for (const r of s.rooms) this.drawWalls(r, stamp);
    dt.render();
  }

  private drawWalls(r: RoomState, stamp: (f: string, x: number, y: number) => void): void {
    const d = r.door;
    for (let x = r.x; x < r.x + r.w; x++) {
      stamp(d.dir === 'N' && d.x === x ? 'door_n' : 'wall_n', x * T, r.y * T);
      stamp(d.dir === 'S' && d.x === x ? 'door_s' : 'wall_s', x * T, (r.y + r.h) * T - 4);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      stamp(d.dir === 'W' && d.y === y ? 'door_w' : 'wall_w', r.x * T, y * T);
      stamp(d.dir === 'E' && d.y === y ? 'door_e' : 'wall_e', (r.x + r.w) * T - 4, y * T);
    }
  }

  private syncFurniture(): void {
    const rooms = this.app.engine.world.state.rooms;
    const ids = new Set(rooms.map((r) => r.id));
    for (const [id, imgs] of this.furniture) if (!ids.has(id)) {
      imgs.forEach((i) => i.destroy());
      this.furniture.delete(id);
    }
    for (const r of rooms) {
      const old = this.furniture.get(r.id);
      if (old) old.forEach((i) => i.destroy());
      const imgs = r.layout.furniture.map((f) => this.add.image(f.x * T, f.y * T, 'furniture', f.sprite).setOrigin(0, 0).setDepth(100 + (f.y + f.h) * T - 2));
      this.furniture.set(r.id, imgs);
    }
  }

  // ------------------------------------------------------------------ agents
  private agentView(key: string, texture: string): AgentView {
    let v = this.agents.get(key);
    if (v && v.key !== texture) {
      v.sprite.setTexture(texture, 0);
      v.key = texture;
    }
    if (!v) {
      const sprite = this.add.sprite(0, 0, texture, 0).setOrigin(0.5, 1);
      const shadow = this.add.image(0, 0, 'fx', 'shadow').setDepth(6);
      v = { sprite, shadow, icon: null, blanket: null, ghosts: [], x: NaN, y: NaN, phase: 0, key: texture, seen: 0 };
      this.agents.set(key, v);
    }
    return v;
  }

  private moverTarget(m: { pos: number; path: number[]; pathIdx: number; progress: number }): [number, number] {
    const cx = (m.pos % MAP_W) * T + 16;
    const cy = Math.floor(m.pos / MAP_W) * T + 26;
    if (m.pathIdx < m.path.length) {
      const n = m.path[m.pathIdx]!;
      const nx = (n % MAP_W) * T + 16;
      const ny = Math.floor(n / MAP_W) * T + 26;
      const p = Math.min(1, m.progress);
      return [cx + (nx - cx) * p, cy + (ny - cy) * p];
    }
    return [cx, cy];
  }

  private syncAgents(delta: number): void {
    const app = this.app;
    const w = app.engine.world;
    const s = w.state;
    const stamp = this.frameNo;
    const reduced = app.settings.reducedMotion;
    const lerp = Math.min(1, (delta / 1000) * 14);
    const time = this.time.now / 1000;
    const sel = app.selection;
    let selX = 0;
    let selY = 0;
    let selVisible = false;
    const resByPatient = new Map(s.reservations.map((r) => [r.patientId, r]));
    for (const p of s.patients) {
      const ap = patientAppearance(p.visual);
      const v = this.agentView(`p${p.id}`, ensureCharacterTexture(this, ap));
      v.seen = stamp;
      this.placePatient(v, p, resByPatient.get(p.id), lerp, delta, time, reduced);
      if (sel?.kind === 'patient' && sel.id === p.id) {
        selX = v.x;
        selY = v.y;
        selVisible = true;
      }
    }
    for (const st of s.staff) {
      if (!st.onSite) continue;
      const v = this.agentView(`s${st.id}`, ensureCharacterTexture(this, staffAppearance(st.role, st.visual)));
      v.seen = stamp;
      this.placeStaff(v, st, lerp, delta, time);
      if (sel?.kind === 'staff' && sel.id === st.id) {
        selX = v.x;
        selY = v.y;
        selVisible = true;
      }
    }
    for (const [k, v] of this.agents)
      if (v.seen !== stamp) {
        v.sprite.destroy();
        v.shadow.destroy();
        v.icon?.destroy();
        v.blanket?.destroy();
        v.ghosts.forEach((g) => g.destroy());
        this.agents.delete(k);
      }
    this.selectRing.setVisible(selVisible).setPosition(selX, selY - 1);
  }

  private walkFrame(v: AgentView, dir: keyof typeof DIR_INDEX, moving: boolean, delta: number): number {
    if (moving) v.phase += delta / 110;
    const f = moving ? Math.floor(v.phase) % 4 : 0;
    return DIR_INDEX[dir] * FRAMES_PER_DIR + f;
  }

  private placePatient(v: AgentView, p: PatientState, res: import('../core/state').Reservation | undefined, lerp: number, delta: number, time: number, reduced: boolean): void {
    const w = this.app.engine.world;
    let [tx, ty] = this.moverTarget(p);
    let frame: number;
    let lying = false;
    const moving = p.pathIdx < p.path.length;
    const station = res && res.status === 'ACTIVE' ? w.roomById.get(res.roomId)?.layout.stations[res.station] : undefined;
    if (station && (p.state === 'IN_TREATMENT' || p.state === 'REGISTERING')) {
      if (station.pose === 'lie') {
        lying = true;
        tx = station.poseX * T;
        ty = station.poseY * T + 14;
        frame = LIE_FRAME;
      } else if (station.pose === 'sit') frame = DIR_INDEX[station.facing] * FRAMES_PER_DIR + 6;
      else frame = DIR_INDEX[station.facing] * FRAMES_PER_DIR;
    } else if (p.seat && !moving && p.pos === w.roomById.get(p.seat.roomId)?.layout.stations[p.seat.station]?.patientTile) {
      const st = w.roomById.get(p.seat.roomId)!.layout.stations[p.seat.station]!;
      frame = DIR_INDEX[st.facing] * FRAMES_PER_DIR + 6;
    } else frame = this.walkFrame(v, p.facing, moving, delta);
    if (Number.isNaN(v.x) || lying) {
      v.x = tx;
      v.y = ty;
    } else {
      v.x += (tx - v.x) * lerp;
      v.y += (ty - v.y) * lerp;
    }
    const effect = DEF.disease[w.caseById.get(p.caseId)?.disease ?? 'D01'].effect;
    let ox = 0;
    let oy = 0;
    let alpha = 1;
    if (!reduced) {
      if (effect === 'float' && !lying) oy = -6 - Math.sin(time * 3 + p.id) * 2;
      if (effect === 'glitch' && Math.sin(time * 9 + p.id * 3) > 0.92) ox = Math.round(Math.sin(time * 50) * 3);
      if (effect === 'teleport' && Math.sin(time * 1.7 + p.id) > 0.97) ox = 6;
    }
    if (effect === 'transparent') alpha = 0.45;
    v.sprite.setFrame(frame).setPosition(Math.round(v.x + ox), Math.round(v.y + oy)).setDepth(100 + v.y + (lying ? 4 : 0)).setAlpha(alpha).setVisible(true);
    v.shadow.setPosition(v.x, v.y - 1).setVisible(!lying);
    // Disease icon above the head.
    if (!v.icon) v.icon = this.add.image(0, 0, 'fx', `fx_${effect}`);
    const bob = reduced ? 0 : Math.sin(time * 4 + p.id) * 1.5;
    const showIcon = p.state !== 'EXITING';
    v.icon.setVisible(showIcon).setPosition(Math.round(v.x + 9), Math.round(v.y - CHAR_H - 2 + bob + oy)).setDepth(100 + v.y + 6).setAlpha(effect === 'transparent' ? 0.7 : 1);
    if (p.escalated && showIcon) v.icon.setFrame('sym_alert');
    if (lying) {
      if (!v.blanket) v.blanket = this.add.image(0, 0, 'fx', 'blanket');
      v.blanket.setVisible(true).setPosition(Math.round(v.x), Math.round(v.y + 3)).setDepth(100 + v.y + 5);
    } else v.blanket?.setVisible(false);
    // Time ghosts and clone copies for mysterious diseases.
    const ghostCount = reduced ? 0 : effect === 'clones' ? 2 : effect === 'timeghost' ? 1 : 0;
    while (v.ghosts.length < ghostCount) v.ghosts.push(this.add.sprite(0, 0, v.key, 0).setOrigin(0.5, 1).setAlpha(0.35));
    v.ghosts.forEach((g, i) => {
      if (i >= ghostCount) return g.setVisible(false);
      const off = effect === 'clones' ? (i === 0 ? -9 : 9) : -Math.sin(time * 2) * 8;
      g.setTexture(v.key, frame).setVisible(true).setScale(effect === 'clones' ? 0.8 : 1).setPosition(Math.round(v.x + off), Math.round(v.y + (effect === 'clones' ? -2 : 0))).setDepth(100 + v.y - 1);
    });
  }

  private placeStaff(v: AgentView, st: StaffState, lerp: number, delta: number, time: number): void {
    const [tx, ty] = this.moverTarget(st);
    const moving = st.pathIdx < st.path.length;
    let frame: number;
    if (st.state === 'WORKING' && !moving) frame = DIR_INDEX[st.facing === 'up' ? 'up' : st.facing] * FRAMES_PER_DIR + 4 + (Math.floor(time * 3 + st.id) % 2);
    else if (st.state === 'RESTING' && !moving && st.task.kind === 'rest' && st.task.station >= 0) frame = DIR_INDEX.down * FRAMES_PER_DIR + 6;
    else frame = this.walkFrame(v, st.facing, moving, delta);
    if (Number.isNaN(v.x)) {
      v.x = tx;
      v.y = ty;
    } else {
      v.x += (tx - v.x) * lerp;
      v.y += (ty - v.y) * lerp;
    }
    v.sprite.setFrame(frame).setPosition(Math.round(v.x), Math.round(v.y)).setDepth(100 + v.y).setVisible(true).setAlpha(1);
    v.shadow.setPosition(v.x, v.y - 1).setVisible(true);
    const icon = st.state === 'RESTING' ? 'sym_zzz' : st.energy < 20 ? 'sym_alert' : st.state === 'BLOCKED' ? 'sym_question' : null;
    if (icon) {
      if (!v.icon) v.icon = this.add.image(0, 0, 'fx', icon);
      v.icon.setFrame(icon).setVisible(true).setPosition(Math.round(v.x + 9), Math.round(v.y - CHAR_H - 2)).setDepth(100 + v.y + 6);
    } else v.icon?.setVisible(false);
  }

  // ------------------------------------------------------------------ overlays and badges
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const app = this.app;
    const w = app.engine.world;
    const s = w.state;
    const mode = app.overlay;
    // Blueprint items are always visible as transparent plans.
    for (const b of s.blueprint.items) {
      const ev = app.blueprintEval(b.id);
      const color = ev?.ok ? 0x4aa3ff : 0xff5a5a;
      g.fillStyle(color, 0.22).fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
      g.lineStyle(2, color, 0.9).strokeRect(b.x * T + 1, b.y * T + 1, b.w * T - 2, b.h * T - 2);
      if (b.door) g.fillStyle(0xffffff, 0.9).fillRect(b.door.x * T + 10, b.door.y * T + 10, 12, 12);
    }
    if (mode === 'none') return;
    if (mode === 'traffic') {
      const lvl = s.map.trafficLevel;
      for (let i = 0; i < lvl.length; i++) {
        const v = lvl[i]!;
        if (v <= 0) continue;
        const c = v > 66 ? 0xe63946 : v > 33 ? 0xf2c14e : 0x43aa8b;
        g.fillStyle(c, 0.25 + (v / 100) * 0.4).fillRect((i % 64) * T, Math.floor(i / 64) * T, T, T);
      }
      return;
    }
    for (const r of s.rooms) {
      let color = 0x43aa8b;
      let a = 0.28;
      const st = roomStatus(w, r);
      if (mode === 'status') {
        color = st.operational ? 0x43aa8b : st.reasonSv === 'Utanför öppettider' || st.reasonSv === 'Stängt' ? 0x77788a : 0xe63946;
      } else if (mode === 'utilization') {
        const busy = s.reservations.filter((x) => x.roomId === r.id && x.status === 'ACTIVE').length;
        const cap = Math.max(1, r.layout.stations.length);
        const u = DEF.room[r.type].team.length === 0 ? s.patients.filter((p) => p.seat?.roomId === r.id).length / cap : busy / cap;
        color = u > 0.8 ? 0xe63946 : u > 0.4 ? 0xf2c14e : u > 0 ? 0x43aa8b : 0x4a4c5e;
        a = 0.35;
      } else if (mode === 'queue') {
        const step = DEF.room[r.type].steps[0];
        const q = step ? (s.metrics.queueNow[step] ?? 0) : 0;
        const per = q / Math.max(1, s.rooms.filter((x) => x.type === r.type).length);
        color = per > 4 ? 0xe63946 : per > 1.5 ? 0xf2c14e : 0x43aa8b;
        a = step ? 0.35 : 0.08;
      }
      g.fillStyle(color, a).fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
    }
  }

  private syncBadges(): void {
    const w = this.app.engine.world;
    const s = w.state;
    const counts = new Map<RoomTypeId, number>();
    for (const e of s.queues) {
      const t = DEF.step[e.step].roomType;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const seen = new Set<number>();
    const firstOfType = new Set<RoomTypeId>();
    for (const r of s.rooms) {
      const n = counts.get(r.type) ?? 0;
      if (n === 0 || firstOfType.has(r.type)) continue;
      firstOfType.add(r.type);
      seen.add(r.id);
      let b = this.badges.get(r.id);
      if (!b) {
        const bg = this.add.graphics();
        const txt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0.5);
        b = this.add.container(0, 0, [bg, txt]).setDepth(150000);
        this.badges.set(r.id, b);
      }
      const bg = b.list[0] as Phaser.GameObjects.Graphics;
      const txt = b.list[1] as Phaser.GameObjects.Text;
      const per = n / Math.max(1, s.rooms.filter((x) => x.type === r.type).length);
      const col = per > 4 ? 0xe63946 : per > 1.5 ? 0xf08a4b : 0x2b5f8f;
      bg.clear().fillStyle(0x1b1d2e, 1).fillRoundedRect(-14, -10, 28, 20, 6).fillStyle(col, 1).fillRoundedRect(-12, -8, 24, 16, 5);
      txt.setText(String(n));
      b.setPosition((r.x + r.w / 2) * T, r.y * T - 2).setVisible(true);
    }
    for (const [id, b] of this.badges) if (!seen.has(id)) b.setVisible(false);
  }

  // ------------------------------------------------------------------ build preview
  private drawPreview(): void {
    const g = this.preview;
    const d = this.app.draft;
    const key = d ? JSON.stringify(d) + (this.app.draftPreview?.ok ?? '') : '';
    if (key === this.previewKey) return;
    this.previewKey = key;
    g.clear();
    this.previewGhosts.forEach((i) => i.destroy());
    this.previewGhosts = [];
    if (!d) return;
    const pv = this.app.draftPreview;
    const ok = pv?.ok ?? false;
    const col = d.kind === 'demolishCorridor' ? 0xf08a4b : ok ? 0x43dd8b : 0xff5a5a;
    g.fillStyle(col, 0.25).fillRect(d.x * T, d.y * T, d.w * T, d.h * T);
    g.lineStyle(3, col, 1).strokeRect(d.x * T, d.y * T, d.w * T, d.h * T);
    if (d.kind === 'room') {
      const lay = pv?.layout;
      if (lay) for (const f of lay.furniture) this.previewGhosts.push(this.add.image(f.x * T, f.y * T, 'furniture', f.sprite).setOrigin(0, 0).setAlpha(0.55).setDepth(199999));
      const door = pv?.door;
      if (door) {
        const ddx = door.dir === 'E' ? 1 : door.dir === 'W' ? -1 : 0;
        const ddy = door.dir === 'S' ? 1 : door.dir === 'N' ? -1 : 0;
        const cx = door.x * T + 16 + ddx * 14;
        const cy = door.y * T + 16 + ddy * 14;
        g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 8).fillStyle(0x8a6a4a, 1).fillCircle(cx, cy, 5);
      }
      // Resize handles.
      g.fillStyle(0xffffff, 1);
      for (const [hx, hy] of [[d.x, d.y], [d.x + d.w, d.y], [d.x, d.y + d.h], [d.x + d.w, d.y + d.h]] as const) g.fillRect(hx * T - 7, hy * T - 7, 14, 14);
      g.fillStyle(col, 1);
      for (const [hx, hy] of [[d.x, d.y], [d.x + d.w, d.y], [d.x, d.y + d.h], [d.x + d.w, d.y + d.h]] as const) g.fillRect(hx * T - 5, hy * T - 5, 10, 10);
    }
  }

  averageFps(): number {
    if (this.fpsSamples.length === 0) return 0;
    const sorted = this.fpsSamples.slice().sort((a, b) => a - b);
    return 1000 / sorted[Math.floor(sorted.length / 2)]!;
  }
}

export { CHAR_W };
