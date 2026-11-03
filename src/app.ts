import { DEF } from './data/definition';
import type { RoomTypeId } from './data/types';
import { cmdId, type CommandPayload, type CommandResult } from './core/commands';
import type { GameEngine } from './core/engine';
import type { DomainEvent } from './core/state';
import type { Dir } from './core/state';
import { previewRoom, corridorPreview, type RoomPreview } from './systems/building';
import { evaluateBlueprintItem, rectTiles, type BlueprintEval } from './systems/blueprint';
import { roomStatus } from './systems/rules';
import type { HospitalScene } from './render/scene';
import { Sfx } from './audio/sfx';
import type { SaveManager } from './save/saveManager';

export interface Draft {
  kind: 'room' | 'corridor' | 'demolishCorridor';
  roomType: RoomTypeId | null;
  blueprint: boolean;
  blueprintId?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number; dir: Dir } | null;
}

export interface DraftPreview {
  ok: boolean;
  errorsSv: string[];
  cost: number;
  dailyOperation: number;
  stations: number;
  capacity: number;
  staffNeeded: string[];
  layout?: RoomPreview['layout'];
  door?: RoomPreview['door'];
  tiles?: number;
}

export type Overlay = 'none' | 'traffic' | 'utilization' | 'status' | 'queue';

export interface Settings {
  volume: number;
  muted: boolean;
  ambient: boolean;
  graphics: 'high' | 'normal' | 'low';
  reducedMotion: boolean;
  highContrast: boolean;
  pauseInPanels: boolean;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.7, muted: false, ambient: true, graphics: 'normal', reducedMotion: false, highContrast: false, pauseInPanels: true };

export interface UIHooks {
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'warn'): void;
  onEvent(e: DomainEvent): void;
  refresh(force?: boolean): void;
  openSelection(): void;
  onDraftChanged(): void;
  showDetail(): void;
}

const SAVE_TRIGGERS = new Set(['ROOM_BUILT', 'ROOM_DEMOLISHED', 'ROOM_UPGRADED', 'LAND_EXPANDED', 'LOAN_TAKEN', 'CAMPAIGN_CHAPTER_COMPLETED', 'CAMPAIGN_VICTORY', 'RESEARCH_COMPLETED', 'STAFF_HIRED', 'BLUEPRINT_BUILT', 'RECONSTRUCTION', 'INSPECTION_STARTED', 'INSPECTION_FAILED']);

/** Glue between the deterministic engine, renderer, UI, saving and audio. Owns UI state only. */
export class GameApp {
  scene: HospitalScene | null = null;
  ui: UIHooks | null = null;
  sfx: Sfx;
  selection: { kind: 'patient' | 'staff' | 'room'; id: number } | null = null;
  overlay: Overlay = 'none';
  buildMode: { kind: Draft['kind']; roomType: RoomTypeId | null; blueprint: boolean } | null = null;
  draft: Draft | null = null;
  draftPreview: DraftPreview | null = null;
  lastSaveAt: string | null = null;
  lastSaveOk = true;
  recentErrors: string[] = [];
  private activeMs = 0;
  private saveRequested = 0;
  private bpCache = new Map<number, BlueprintEval>();
  private bpVersion = '';
  private pausedByPanel = false;
  private lastEmergencySound = 0;
  private sceneReadyCbs: (() => void)[] = [];

  constructor(public engine: GameEngine, public saves: SaveManager | null, public settings: Settings) {
    this.sfx = new Sfx(settings, import.meta.env.BASE_URL);
    this.bindEngine();
  }

  bindEngine(): void {
    this.engine.subscribe((e) => this.onDomainEvent(e));
  }

  replaceEngine(engine: GameEngine): void {
    this.engine = engine;
    this.bindEngine();
    this.selection = null;
    this.draft = null;
    this.draftPreview = null;
    this.buildMode = null;
    this.bpCache.clear();
    this.ui?.refresh(true);
  }

  onSceneReady(scene: HospitalScene): void {
    this.scene = scene;
    const r = this.engine.state.rooms.find((x) => x.type === 'R01');
    scene.centerOn(r ? r.x + 4 : 31, r ? r.y - 3 : 56, this.defaultZoom());
    for (const cb of this.sceneReadyCbs) cb();
  }

  whenSceneReady(cb: () => void): void {
    if (this.scene) cb();
    else this.sceneReadyCbs.push(cb);
  }

  defaultZoom(): number {
    const w = this.scene?.scale.width ?? 390;
    return Math.max(0.8, Math.min(2, w / (12 * 32)));
  }

  // ------------------------------------------------------------------ loop
  frame(delta: number): void {
    const clock = this.engine.state.clock;
    const before = clock.tick;
    this.engine.advance(delta);
    if (!clock.paused && clock.speed > 0) this.activeMs += Math.min(delta, 250);
    if (this.activeMs >= 30000) {
      this.activeMs = 0;
      void this.save('auto');
    }
    if (this.saveRequested && performance.now() > this.saveRequested) {
      this.saveRequested = 0;
      void this.save('event');
    }
    if (clock.tick !== before) this.ui?.refresh();
  }

  requestSave(): void {
    this.saveRequested = performance.now() + 1500;
  }

  async save(reason: string): Promise<boolean> {
    if (!this.saves) return false;
    const r = await this.saves.save(this.engine.state, reason);
    this.lastSaveOk = r.ok;
    if (r.ok && !r.skipped) this.lastSaveAt = new Date().toLocaleTimeString('sv-SE');
    if (!r.ok) {
      this.noteError(`Sparning misslyckades: ${r.error}`);
      this.ui?.toast('Sparningen misslyckades – försöker igen snart', 'bad');
    }
    return r.ok;
  }

  noteError(msg: string): void {
    this.recentErrors.push(`${new Date().toISOString()} ${msg}`);
    if (this.recentErrors.length > 20) this.recentErrors.shift();
  }

  // ------------------------------------------------------------------ commands
  dispatch(c: CommandPayload, quiet = false): CommandResult {
    const r = this.engine.dispatch({ ...c, id: cmdId('ui') } as never);
    if (!r.ok && !quiet) {
      const msg = r.errors.map((e) => e.messageSv).join(' · ') || 'Det gick inte';
      this.ui?.toast(msg, 'bad');
      this.sfx.play('build_fail');
    } else if (r.ok && !quiet) this.sfx.play('ui_click');
    this.bpVersion = '';
    this.ui?.refresh(true);
    return r;
  }

  setPaused(p: boolean): void {
    this.dispatch({ type: p ? 'PAUSE_GAME' : 'RESUME_GAME' }, true);
  }

  /** Complex panels pause the game (when enabled) and resume it when closed. */
  panelOpened(complex: boolean): void {
    if (!complex || !this.settings.pauseInPanels) return;
    if (!this.engine.state.clock.paused) {
      this.pausedByPanel = true;
      this.setPaused(true);
    }
  }

  panelClosed(): void {
    if (this.pausedByPanel) {
      this.pausedByPanel = false;
      this.setPaused(false);
    }
  }

  userGesture(): void {
    if (!this.sfx.unlocked) void this.sfx.unlock();
  }

  // ------------------------------------------------------------------ selection & input
  tap(x: number, y: number): void {
    const scene = this.scene;
    if (!scene) return;
    const t = scene.screenToTile(x, y);
    const agent = scene.pickAgent(t.wx, t.wy);
    if (agent) this.selection = agent;
    else {
      const roomId = t.tx >= 0 && t.ty >= 0 && t.tx < 64 && t.ty < 64 ? this.engine.world.grid.room[t.ty * 64 + t.tx] : 0;
      this.selection = roomId ? { kind: 'room', id: roomId } : null;
    }
    this.ui?.openSelection();
  }

  longPress(x: number, y: number): void {
    this.tap(x, y);
    if (this.selection) this.ui?.showDetail();
  }

  // ------------------------------------------------------------------ build drafts
  startBuild(kind: Draft['kind'], roomType: RoomTypeId | null, blueprint: boolean): void {
    this.buildMode = { kind, roomType, blueprint };
    this.draft = null;
    this.draftPreview = null;
    this.selection = null;
    this.ui?.onDraftChanged();
  }

  stopBuild(): void {
    this.buildMode = null;
    this.draft = null;
    this.draftPreview = null;
    this.ui?.onDraftChanged();
  }

  newDraftBase(): Draft {
    const m = this.buildMode!;
    const def = m.roomType ? DEF.room[m.roomType] : null;
    return { kind: m.kind, roomType: m.roomType, blueprint: m.blueprint, x: 0, y: 0, w: def ? def.minW : 1, h: def ? def.minH : 1, door: null };
  }

  setDraft(d: Draft | null, fromTap = false): void {
    if (d && fromTap && d.kind !== 'room') d = { ...d, w: 1, h: 1 };
    this.draft = d;
    this.draftPreview = d ? this.computePreview(d) : null;
    this.ui?.onDraftChanged();
  }

  computePreview(d: Draft): DraftPreview {
    const w = this.engine.world;
    if (d.kind === 'room' && d.roomType) {
      const p = previewRoom(w, d.roomType, d.x, d.y, d.w, d.h, d.door, undefined, d.blueprint);
      return { ok: p.ok, errorsSv: p.errorsSv, cost: p.cost, dailyOperation: p.dailyOperation, stations: p.stations, capacity: p.capacity, staffNeeded: p.staffNeeded, layout: p.layout, door: p.door };
    }
    const tiles = rectTiles(d.x, d.y, d.w, d.h);
    if (d.kind === 'demolishCorridor') {
      const n = tiles.filter((t) => w.grid.kind[t] === 1).length;
      return { ok: n > 0, errorsSv: n > 0 ? [] : ['Inga korridorrutor valda'], cost: -Math.floor(n * DEF.econ.corridorCostPerTile * DEF.econ.corridorRefundRate), dailyOperation: 0, stations: 0, capacity: 0, staffNeeded: [], tiles: n };
    }
    const p = corridorPreview(w, tiles, undefined, d.blueprint);
    return { ok: p.ok, errorsSv: p.errorsSv, cost: p.cost, dailyOperation: 0, stations: 0, capacity: 0, staffNeeded: [], tiles: p.newTiles.length };
  }

  confirmDraft(): CommandResult | null {
    const d = this.draft;
    if (!d) return null;
    let r: CommandResult;
    if (d.blueprint) {
      r = this.dispatch({ type: 'ADD_BLUEPRINT', kind: d.kind === 'room' ? 'room' : 'corridor', roomType: d.roomType, x: d.x, y: d.y, w: d.w, h: d.h, door: d.door ?? this.draftPreview?.door ?? null });
    } else if (d.kind === 'room') r = this.dispatch({ type: 'BUILD_ROOM', roomType: d.roomType!, x: d.x, y: d.y, w: d.w, h: d.h, door: d.door });
    else if (d.kind === 'corridor') r = this.dispatch({ type: 'BUILD_CORRIDOR', tiles: rectTiles(d.x, d.y, d.w, d.h) });
    else r = this.dispatch({ type: 'DEMOLISH_CORRIDOR', tiles: rectTiles(d.x, d.y, d.w, d.h) });
    if (r.ok) {
      if (d.kind === 'room' && !d.blueprint && r.data?.roomId) this.selection = { kind: 'room', id: r.data.roomId as number };
      this.draft = null;
      this.draftPreview = null;
      if (d.kind === 'room' && !d.blueprint) this.stopBuild();
      else this.ui?.onDraftChanged();
    }
    return r;
  }

  blueprintEval(id: number): BlueprintEval | undefined {
    const s = this.engine.state;
    const v = `${s.map.version}:${s.blueprint.items.length}:${s.economy.cash > 0}:${s.progress.landStage}:${s.blueprint.items.map((b) => `${b.id},${b.x},${b.y},${b.w},${b.h}`).join(';')}`;
    if (v !== this.bpVersion) {
      this.bpVersion = v;
      this.bpCache.clear();
      for (const b of s.blueprint.items) this.bpCache.set(b.id, evaluateBlueprintItem(this.engine.world, b));
    }
    return this.bpCache.get(id);
  }

  // ------------------------------------------------------------------ domain events → feedback
  private onDomainEvent(e: DomainEvent): void {
    const sfx = this.sfx;
    switch (e.type) {
      case 'ROOM_BUILT': sfx.play('build_ok'); break;
      case 'ROOM_UPGRADED': sfx.play('upgrade'); break;
      case 'PATIENT_DISCHARGED': if (e.payload.outcome === 'SUCCESS') sfx.play('treat_done'); break;
      case 'DISEASE_IDENTIFIED': case 'DISEASE_MASTERED': case 'RESEARCH_COMPLETED': sfx.play('research'); break;
      case 'MISSION_COMPLETED': sfx.play('mission'); break;
      case 'CAMPAIGN_CHAPTER_COMPLETED': sfx.play('milestone'); break;
      case 'CAMPAIGN_VICTORY': sfx.play('victory'); break;
      case 'ECONOMY_WARNING': case 'CRISIS_STARTED': sfx.play('econ_warn'); break;
      case 'EMERGENCY_ESCALATED':
        if (performance.now() - this.lastEmergencySound > 8000) {
          this.lastEmergencySound = performance.now();
          sfx.play('emergency');
        }
        break;
      case 'TREATMENT_COMPLETED':
        if (e.payload.roomType === 'R08' && this.settings.ambient) sfx.play('xray_hum');
        if ((e.payload.roomType === 'R15' || e.payload.roomType === 'R09') && this.settings.ambient) sfx.play('monitor_beep');
        if (e.payload.disease === 'D19') sfx.play('teleport');
        if (e.payload.disease === 'D24') sfx.play('glitch');
        if (e.payload.disease === 'D01' && e.payload.step === 'U') sfx.play('sneeze');
        break;
      case 'LOAN_TAKEN': case 'EVENT_ENDED': break;
    }
    if (SAVE_TRIGGERS.has(e.type)) this.requestSave();
    this.ui?.onEvent(e);
  }

  roomStatusText(roomId: number): string {
    const r = this.engine.world.roomById.get(roomId);
    return r ? roomStatus(this.engine.world, r).reasonSv : '';
  }
}
