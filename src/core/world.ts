import { DEF } from '../data/definition';
import { Grid } from './grid';
import { Rng } from './rng';
import type {
  CaseState, DomainEvent, DomainEventType, GameState, PatientState, Reservation, RoomState, StaffState,
} from './state';

export type EventListener = (e: DomainEvent) => void;

/**
 * World = authoritative GameState + derived indices/caches that are rebuilt on load.
 * All systems operate on a World. Nothing outside GameState is required to reproduce a run.
 */
export class World {
  readonly grid = new Grid();
  rng: Rng;
  patientById = new Map<number, PatientState>();
  caseById = new Map<number, CaseState>();
  staffById = new Map<number, StaffState>();
  roomById = new Map<number, RoomState>();
  resById = new Map<number, Reservation>();
  /** Events emitted during the current tick/command, flushed to listeners afterwards. */
  private outbox: DomainEvent[] = [];
  private listeners = new Set<EventListener>();
  /** Dirty flag for the matching phase. */
  matchDirty = true;
  /** Free-form derived caches owned by systems (e.g. navigation). */
  caches: Record<string, unknown> = {};

  constructor(public state: GameState) {
    this.rng = new Rng(state.rng);
    this.reindex();
  }

  reindex(): void {
    this.rng = new Rng(this.state.rng);
    this.patientById = new Map(this.state.patients.map((p) => [p.id, p]));
    this.caseById = new Map(this.state.cases.map((c) => [c.id, c]));
    this.staffById = new Map(this.state.staff.map((s) => [s.id, s]));
    this.roomById = new Map(this.state.rooms.map((r) => [r.id, r]));
    this.resById = new Map(this.state.reservations.map((r) => [r.id, r]));
    this.grid.rebuild(this.state);
    this.caches = {};
    this.matchDirty = true;
  }

  get tick(): number {
    return this.state.clock.tick;
  }
  get day(): number {
    return Math.floor(this.state.clock.tick / DEF.sim.ticksPerDay);
  }
  /** Minute of the current day, 0..1439.4 */
  get minuteOfDay(): number {
    return (this.state.clock.tick % DEF.sim.ticksPerDay) * DEF.sim.minutesPerTick;
  }
  get isDayShift(): boolean {
    const m = this.minuteOfDay;
    return m >= DEF.sim.dayShiftStart && m < DEF.sim.nightShiftStart;
  }
  get chapter(): number {
    return this.state.progress.chapter;
  }

  minutesToTicks(min: number): number {
    return Math.max(1, Math.round(min / DEF.sim.minutesPerTick));
  }

  nextId(kind: string): number {
    const n = (this.state.ids[kind] ?? 0) + 1;
    this.state.ids[kind] = n;
    return n;
  }

  emit(type: DomainEventType, payload: Record<string, unknown> = {}, aggregateId: string | null = null, causationId: string | null = null): DomainEvent {
    const seq = ++this.state.audit.eventSeq;
    const e: DomainEvent = { id: seq, type, tick: this.state.clock.tick, seq, aggregateId, causationId, payload };
    const log = this.state.log;
    log.push(e);
    if (log.length > DEF.sim.eventLogSize) log.splice(0, log.length - DEF.sim.eventLogSize);
    this.outbox.push(e);
    return e;
  }

  subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  flushEvents(): DomainEvent[] {
    if (this.outbox.length === 0) return [];
    const out = this.outbox;
    this.outbox = [];
    for (const e of out) for (const l of this.listeners) l(e);
    return out;
  }

  // ---- entity helpers (keep arrays and indices in sync) ----
  addPatient(p: PatientState): void {
    this.state.patients.push(p);
    this.patientById.set(p.id, p);
  }
  removePatient(id: number): void {
    const i = this.state.patients.findIndex((p) => p.id === id);
    if (i >= 0) this.state.patients.splice(i, 1);
    this.patientById.delete(id);
  }
  addCase(c: CaseState): void {
    this.state.cases.push(c);
    this.caseById.set(c.id, c);
  }
  removeCase(id: number): void {
    const i = this.state.cases.findIndex((c) => c.id === id);
    if (i >= 0) this.state.cases.splice(i, 1);
    this.caseById.delete(id);
  }
  addStaff(s: StaffState): void {
    this.state.staff.push(s);
    this.staffById.set(s.id, s);
  }
  removeStaff(id: number): void {
    const i = this.state.staff.findIndex((s) => s.id === id);
    if (i >= 0) this.state.staff.splice(i, 1);
    this.staffById.delete(id);
  }
  addRoom(r: RoomState): void {
    this.state.rooms.push(r);
    this.roomById.set(r.id, r);
  }
  removeRoom(id: number): void {
    const i = this.state.rooms.findIndex((r) => r.id === id);
    if (i >= 0) this.state.rooms.splice(i, 1);
    this.roomById.delete(id);
  }
  addReservation(r: Reservation): void {
    this.state.reservations.push(r);
    this.resById.set(r.id, r);
  }
  removeReservation(id: number): void {
    const i = this.state.reservations.findIndex((r) => r.id === id);
    if (i >= 0) this.state.reservations.splice(i, 1);
    this.resById.delete(id);
  }
}
