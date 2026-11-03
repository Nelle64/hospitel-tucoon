import { DEF } from '../data/definition';
import type { Command, CommandError, CommandResult } from './commands';
import { validateCommand } from './commands';
import { checkInvariants } from './invariants';
import { createNewGame } from './newGame';
import type { DomainEvent, GameState } from './state';
import { World } from './world';
import * as building from '../systems/building';
import * as staff from '../systems/staff';
import * as research from '../systems/research';
import * as economy from '../systems/economy';
import { buildBlueprintSelection } from '../systems/blueprint';
import { campaignTick, inspectionDayEnd, startFinalInspection } from '../systems/campaign';
import { planArrivals } from '../systems/demand';
import { chooseOption, eventsTick } from '../systems/events';
import { closeDay, sampleMetrics } from '../systems/metrics';
import { missionDayEnd, missionQuickCheck } from '../systems/missions';
import { updateTraffic } from '../systems/movement';
import { callForward, goWait, movePatients, refer, refreshWaitingStates, reseatStanding, routeNext, spawnPatient, updatePatientConditions } from '../systems/patients';
import { reconstruction } from '../systems/recovery';
import { activeBookingsForRoom, cancelReservation, completeDue, matchPatients, updateReservations } from '../systems/resources';
import { roomUpkeep } from '../systems/staff';
import { tutorialCheck, tutorialCommand } from '../systems/tutorial';

export interface EngineOptions {
  /** Run invariant checks every N ticks (0 = never). */
  invariantEvery?: number;
  /** Throw on invariant violation (tests). */
  strict?: boolean;
}

export class GameEngine {
  world: World;
  private accumulator = 0;
  invariantEvery: number;
  strict: boolean;
  lastTickMs = 0;

  constructor(state: GameState | World, opts: EngineOptions = {}) {
    this.world = state instanceof World ? state : new World(state);
    this.invariantEvery = opts.invariantEvery ?? 100;
    this.strict = opts.strict ?? false;
  }

  static newGame(seed: number, opts: EngineOptions & { name?: string } = {}): GameEngine {
    return new GameEngine(createNewGame(seed, opts.name), opts);
  }

  get state(): GameState {
    return this.world.state;
  }

  subscribe(fn: (e: DomainEvent) => void): () => void {
    return this.world.subscribe(fn);
  }

  // ------------------------------------------------------------ commands

  dispatch(cmd: Command): CommandResult {
    const w = this.world;
    const audit = w.state.audit;
    if (typeof cmd?.id === 'string' && audit.commandIds.includes(cmd.id)) return { ok: false, duplicate: true, errors: [{ code: 'DUPLICATE', messageSv: 'Kommandot är redan utfört' }] };
    const invalid = validateCommand(cmd);
    if (invalid.length) return { ok: false, errors: invalid };
    let res: { ok: boolean; errorsSv: string[]; data?: Record<string, unknown> };
    try {
      res = this.execute(cmd);
    } catch (err) {
      w.flushEvents();
      return { ok: false, errors: [{ code: 'INTERNAL', messageSv: `Internt fel: ${(err as Error).message}` }] };
    }
    if (res.ok) {
      audit.commandIds.push(cmd.id);
      if (audit.commandIds.length > 500) audit.commandIds.splice(0, audit.commandIds.length - 500);
    }
    w.flushEvents();
    const errors: CommandError[] = res.errorsSv.map((m) => ({ code: 'REJECTED', messageSv: m }));
    return { ok: res.ok, errors, data: res.data };
  }

  private execute(cmd: Command): { ok: boolean; errorsSv: string[]; data?: Record<string, unknown> } {
    const w = this.world;
    const ok = { ok: true, errorsSv: [] as string[] };
    const c = cmd.id;
    switch (cmd.type) {
      case 'SET_SPEED':
        w.state.clock.speed = cmd.speed;
        w.state.clock.paused = cmd.speed === 0;
        return ok;
      case 'PAUSE_GAME':
        w.state.clock.paused = true;
        return ok;
      case 'RESUME_GAME':
        w.state.clock.paused = false;
        if (w.state.clock.speed === 0) w.state.clock.speed = 1;
        return ok;
      case 'BUILD_ROOM': {
        const r = building.buildRoom(w, cmd.roomType, cmd.x, cmd.y, cmd.w, cmd.h, cmd.door ?? null, c);
        return { ok: r.ok, errorsSv: r.errorsSv, data: { roomId: r.roomId } };
      }
      case 'BUILD_CORRIDOR':
        return building.buildCorridor(w, cmd.tiles, c);
      case 'DEMOLISH_CORRIDOR':
        return building.demolishCorridor(w, cmd.tiles, c);
      case 'MOVE_DOOR':
        return building.moveDoor(w, cmd.roomId, cmd.door, c);
      case 'DEMOLISH_ROOM':
        return this.demolish(cmd.roomId, cmd.mode, c);
      case 'UPGRADE_ROOM':
        return building.upgradeRoom(w, cmd.roomId, c);
      case 'SELL_EQUIPMENT':
        return building.sellEquipment(w, cmd.roomId, c);
      case 'SET_ROOM_OPEN': {
        const room = w.roomById.get(cmd.roomId);
        if (!room) return { ok: false, errorsSv: ['Rummet finns inte'] };
        if (room.closing) return { ok: false, errorsSv: ['Rummet håller på att rivas'] };
        room.open = cmd.open;
        if (!cmd.open) for (const res of activeBookingsForRoom(w, room.id)) if (res.status !== 'ACTIVE') cancelReservation(w, res, 'closed', true, false);
        w.matchDirty = true;
        refreshWaitingStates(w);
        return ok;
      }
      case 'EXPAND_LAND':
        return building.expandLand(w, c);
      case 'ADD_BLUEPRINT': {
        const id = w.nextId('blueprint');
        w.state.blueprint.items.push({ id, kind: cmd.kind, roomType: cmd.kind === 'room' ? cmd.roomType! : null, x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h, door: cmd.door ?? null });
        return { ok: true, errorsSv: [], data: { blueprintId: id } };
      }
      case 'MOVE_BLUEPRINT': {
        const b = w.state.blueprint.items.find((i) => i.id === cmd.id);
        if (!b) return { ok: false, errorsSv: ['Ritningen finns inte'] };
        Object.assign(b, { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h, door: cmd.door ?? null });
        return ok;
      }
      case 'DELETE_BLUEPRINT': {
        const before = w.state.blueprint.items.length;
        w.state.blueprint.items = w.state.blueprint.items.filter((i) => i.id !== cmd.id);
        return before === w.state.blueprint.items.length ? { ok: false, errorsSv: ['Ritningen finns inte'] } : ok;
      }
      case 'BUILD_BLUEPRINT_SELECTION': {
        const r = buildBlueprintSelection(w, cmd.ids, c);
        return { ok: r.ok, errorsSv: r.errorsSv, data: { built: r.built } };
      }
      case 'HIRE_STAFF': {
        const r = staff.hireStaff(w, cmd.candidateId, cmd.shift ?? 'day', cmd.roomId ?? null, c);
        return { ok: r.ok, errorsSv: r.errorsSv, data: { staffId: r.staffId } };
      }
      case 'FIRE_STAFF':
        return staff.fireStaff(w, cmd.staffId, c);
      case 'ASSIGN_STAFF':
        return staff.assignStaff(w, cmd.staffId, cmd.roomId, c);
      case 'UNASSIGN_STAFF':
        return staff.unassignStaff(w, cmd.staffId, c);
      case 'SET_STAFF_SHIFT':
        return staff.setStaffShift(w, cmd.staffId, cmd.shift, c);
      case 'START_TRAINING':
        return staff.startTraining(w, cmd.staffId, cmd.trainingId, c);
      case 'SET_QUEUE_POLICY':
        w.state.policy.queue = cmd.policy;
        w.matchDirty = true;
        return ok;
      case 'SET_DEPARTMENT_PRIORITY':
        w.state.policy.departmentPriority[cmd.roomType] = cmd.priority;
        w.matchDirty = true;
        return ok;
      case 'START_RESEARCH':
        return research.startResearch(w, cmd.projectId, c);
      case 'SET_DISEASE_RESEARCH_FOCUS':
        return research.setResearchFocus(w, cmd.disease);
      case 'CONVERT_GRP_TO_RP':
        return research.convertGrpToRp(w, cmd.disease, cmd.grp);
      case 'TAKE_LOAN': {
        const r = economy.takeLoan(w, cmd.kind);
        return { ok: r.ok, errorsSv: r.errorSv ? [r.errorSv] : [] };
      }
      case 'REPAY_LOAN': {
        const r = economy.repayLoan(w, cmd.loanId);
        return { ok: r.ok, errorsSv: r.errorSv ? [r.errorSv] : [] };
      }
      case 'REQUEST_RESTRUCTURING': {
        if (cmd.reconstruction) return reconstruction(w, c);
        if (cmd.loanId === undefined) return { ok: false, errorsSv: ['Välj ett lån att omförhandla'] };
        const r = economy.restructureLoan(w, cmd.loanId);
        return { ok: r.ok, errorsSv: r.errorSv ? [r.errorSv] : [] };
      }
      case 'CHOOSE_EVENT_OPTION':
        return chooseOption(w, cmd.eventId, cmd.optionId, c);
      case 'START_FINAL_INSPECTION':
        return startFinalInspection(w, c);
      case 'CONTINUE_AFTER_VICTORY':
        if (!w.state.progress.victory) return { ok: false, errorsSv: ['Kampanjen är inte vunnen än'] };
        w.state.progress.continuedAfterVictory = true;
        return ok;
      case 'TUTORIAL':
        return tutorialCommand(w, cmd.action);
      case 'REFRESH_CANDIDATES': {
        const cost = 300;
        if (!economy.canAfford(w, cost)) return { ok: false, errorsSv: ['Kostar 300 kr'] };
        economy.post(w, -cost, 'hiring', 'Rekryteringsannons', 'recruit');
        staff.refreshCandidates(w);
        return ok;
      }
    }
  }

  private demolish(roomId: number, mode: 'undo' | 'whenEmpty' | 'evacuate', c: string): { ok: boolean; errorsSv: string[] } {
    const w = this.world;
    const room = w.roomById.get(roomId);
    if (!room) return { ok: false, errorsSv: ['Rummet finns inte'] };
    if (w.state.rooms.filter((r) => r.type === 'R01').length === 1 && room.type === 'R01' && w.state.rooms.length > 1 && mode !== 'undo') {
      // Allowed, but warn through the UI; the hospital then skips registration.
    }
    if (mode === 'undo') {
      if (!room.undoable || room.used || building.roomOccupied(w, roomId)) return { ok: false, errorsSv: ['Ångra går bara direkt efter bygget, innan rummet använts'] };
      building.finalizeDemolition(w, roomId, c);
      return { ok: true, errorsSv: [] };
    }
    room.closing = true;
    room.undoable = false;
    for (const res of activeBookingsForRoom(w, roomId)) {
      if (res.status !== 'ACTIVE') cancelReservation(w, res, 'demolish', true, false);
      else if (mode === 'evacuate') {
        const p = w.patientById.get(res.patientId);
        const cs = p ? w.caseById.get(p.caseId) : undefined;
        if (p && cs) refer(w, p, cs, 'Evakuerad vid rivning');
        else cancelReservation(w, res, 'evacuate', false, false);
      }
    }
    for (const p of w.state.patients) if (p.seat?.roomId === roomId) {
      p.seat = null;
      if (p.queueStep) goWait(w, p, p.queueStep);
    }
    for (const s of w.state.staff) if (s.task.kind === 'rest' && s.task.roomId === roomId) s.task = { kind: 'none' };
    w.matchDirty = true;
    this.finalizeDemolitions();
    return { ok: true, errorsSv: [] };
  }

  private finalizeDemolitions(): void {
    const w = this.world;
    for (const r of w.state.rooms.slice()) {
      if (!r.closing) continue;
      // Staff leave the room first.
      for (const s of w.state.staff) if (s.roomId === r.id && s.task.kind !== 'work') {
        s.roomId = 0;
        s.state = s.onSite ? 'UNASSIGNED' : s.state;
        s.task = { kind: 'none' };
      }
      if (!building.roomOccupied(w, r.id)) building.finalizeDemolition(w, r.id, null);
    }
  }

  // ------------------------------------------------------------ simulation

  /** Advance one deterministic tick (0.6 game minutes) through the ordered pipeline. */
  step(): void {
    const w = this.world;
    const s = w.state;
    s.clock.tick++;
    const tpd = DEF.sim.ticksPerDay;
    const tod = s.clock.tick % tpd;
    if (tod === 0) this.dayBoundary();
    if (tod === 800) staff.startShift(w, 'day');
    if (tod === 2000) staff.startShift(w, 'night');
    if (tod === 800 || tod === 2000) refreshWaitingStates(w);
    // 1–2. Scheduled completions and release of resources.
    research.researchTick(w);
    const routed = completeDue(w);
    for (const p of routed) routeNext(w, p);
    // 3. Clock-dependent conditions.
    updatePatientConditions(w);
    if (s.clock.tick % 100 === 0) {
      refreshWaitingStates(w);
      reseatStanding(w);
    }
    // 4. Arrivals and special events.
    const plan = s.metrics.arrivalPlan;
    while (plan.length && plan[0]!.tick <= s.clock.tick) {
      const a = plan.shift()!;
      spawnPatient(w, a.night);
    }
    eventsTick(w);
    // 5–6. Queue priorities (call-forward positions) and matching of patients with resources.
    callForward(w);
    matchPatients(w);
    // 7. Movement, staff behaviour and treatment activation.
    movePatients(w);
    staff.updateStaff(w);
    updateReservations(w);
    updateTraffic(w);
    // 8. Economy and research accrual.
    economy.accrueOperations(w);
    roomUpkeep(w);
    // 9. Metrics, missions, campaign.
    sampleMetrics(w);
    missionQuickCheck(w);
    campaignTick(w);
    tutorialCheck(w);
    if (s.clock.tick % 100 === 0) economy.updateCrisis(w);
    if (s.clock.tick % 10 === 0) this.finalizeDemolitions();
    // 10. Invariants.
    if (this.invariantEvery > 0 && s.clock.tick % this.invariantEvery === 0) this.verify();
    w.flushEvents();
  }

  private dayBoundary(): void {
    const w = this.world;
    economy.collectInstallments(w);
    research.researchDayEnd(w);
    closeDay(w);
    inspectionDayEnd(w);
    missionDayEnd(w);
    economy.pruneTransactions(w);
    staff.refreshCandidates(w);
    planArrivals(w, w.state.clock.tick, w.state.clock.tick);
  }

  verify(): string[] {
    const v = checkInvariants(this.world);
    if (v.length) {
      const a = this.world.state.audit;
      a.violations.push(...v.map((x) => `t${this.world.tick}: ${x}`));
      if (a.violations.length > 50) a.violations.splice(0, a.violations.length - 50);
      if (this.strict) throw new Error(`Invariant violation at tick ${this.world.tick}: ${v.slice(0, 5).join('; ')}`);
    }
    this.world.state.audit.lastInvariantTick = this.world.tick;
    return v;
  }

  runTicks(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  runDays(days: number): void {
    this.runTicks(Math.round(days * DEF.sim.ticksPerDay));
  }

  /** Real-time driver: fixed ticks from an accumulator; frame rate never changes outcomes. */
  advance(realMs: number): number {
    const clock = this.world.state.clock;
    if (clock.paused || clock.speed === 0) {
      this.accumulator = 0;
      return 0;
    }
    const dt = Math.min(realMs, 250);
    const ticksPerMs = (DEF.sim.ticksPerDay / DEF.sim.realSecondsPerDayAt1x / 1000) * clock.speed;
    this.accumulator += dt * ticksPerMs;
    let n = Math.floor(this.accumulator);
    this.accumulator -= n;
    n = Math.min(n, 12 * clock.speed);
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (let i = 0; i < n; i++) this.step();
    if (typeof performance !== 'undefined') this.lastTickMs = n ? (performance.now() - t0) / n : this.lastTickMs;
    return n;
  }

  /** Accumulator fraction for render interpolation (0..1). */
  get alpha(): number {
    return this.accumulator;
  }
}
