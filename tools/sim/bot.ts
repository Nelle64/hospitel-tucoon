import { DEF } from '../../src/data/definition';
import { FINAL_INSPECTION } from '../../src/data/progression';
import type { DiseaseId, ProjectId, RoleId, RoomTypeId, SkillId, StepKind, TrainingId } from '../../src/data/types';
import type { CommandPayload, CommandResult } from '../../src/core/commands';
import { GameEngine } from '../../src/core/engine';
import type { RoomState, StaffState } from '../../src/core/state';
import { activeLoans, dailyFixedCosts, totalOverdue } from '../../src/systems/economy';
import { inspectionPrerequisites, chapterStatus } from '../../src/systems/campaign';
import { aggregate, lastDays, roomUtilization } from '../../src/systems/metrics';
import { projectAvailable } from '../../src/systems/research';
import { formTeams, roomInService } from '../../src/systems/rules';
import { landExpansionCost, upgradeCost, roomBuildCost } from '../../src/systems/building';
import { trainingCost } from '../../src/systems/staff';
import { defaultSize, findRoomSpot, nextCorridorTiles } from './planner';

export type Strategy = 'skilled' | 'average' | 'inefficient';

interface Profile {
  thinkEvery: number;
  upgrades: boolean;
  convertResearch: boolean;
  nightStaff: 'full' | 'er' | 'none';
  breakRooms: boolean;
  cleaning: boolean;
  qualityTraining: boolean;
  pick: 'best' | 'random';
  capacityQueue: number;
  overbuild: number;
  overhire: number;
  buffer: number;
  priorities: boolean;
}

const PROFILES: Record<Strategy, Profile> = {
  skilled: { thinkEvery: 50, upgrades: true, convertResearch: true, nightStaff: 'full', breakRooms: true, cleaning: true, qualityTraining: true, pick: 'best', capacityQueue: 1.5, overbuild: 0, overhire: 0, buffer: 6000, priorities: true },
  average: { thinkEvery: 200, upgrades: false, convertResearch: true, nightStaff: 'er', breakRooms: true, cleaning: true, qualityTraining: false, pick: 'random', capacityQueue: 3, overbuild: 0, overhire: 0, buffer: 4000, priorities: false },
  inefficient: { thinkEvery: 400, upgrades: false, convertResearch: false, nightStaff: 'none', breakRooms: false, cleaning: false, qualityTraining: false, pick: 'random', capacityQueue: 5, overbuild: 3, overhire: 2, buffer: 1000, priorities: false },
};

/** Rooms the bot wants per chapter (counts are minimums; capacity logic adds more). */
const PLAN: Record<number, [RoomTypeId, number][]> = {
  1: [['R01', 1], ['R02', 1], ['R03', 2], ['R05', 1]],
  2: [['R04', 1], ['R07', 1]],
  3: [['R08', 1], ['R09', 1], ['R10', 1], ['R12', 1]],
  4: [['R13', 1], ['R14', 1], ['R15', 1]],
  5: [['R17', 1], ['R18', 1], ['R16', 1]],
};
const INEFFICIENT_EXTRA: [RoomTypeId, number][] = [['R11', 1], ['R05', 2], ['R02', 2], ['R03', 3]];

/** Patient-flow neighbours: new rooms are placed close to these (support rooms go to the back). */
const FLOW: Partial<Record<RoomTypeId, RoomTypeId[]>> = {
  R02: ['R03', 'R05'], R03: ['R01', 'R02'], R05: ['R03'], R04: ['R03', 'R07'], R07: ['R04'], R11: ['R03'],
  R08: ['R09', 'R03'], R10: ['R08'], R13: ['R09', 'R07'], R14: ['R13'], R15: ['R13'], R17: ['R08', 'R07'], R18: ['R08', 'R07'],
};
const BACK: RoomTypeId[] = ['R06', 'R12', 'R16'];

const NIGHT_FULL: RoomTypeId[] = ['R09', 'R14', 'R15'];
const ROUTE_ORDER: ProjectId[] = ['F01', 'F02', 'F03', 'F05', 'F07', 'F04', 'F06', 'F08', 'F10', 'F09', 'F11', 'F12'];

export interface BotResult {
  seed: number;
  strategy: Strategy;
  won: boolean;
  victoryDay: number | null;
  chapterDays: number[];
  days: number;
  minCash: number;
  reconstructions: number;
  crisisDays: number;
  violations: number;
  inspectionAttempts: number;
  completed: number;
  mastered: number;
  projects: number;
  reputation: number;
  rejectedCommands: number;
  ms: number;
}

export class Bot {
  private n = 0;
  readonly p: Profile;
  // Profiles are copied so adaptive strategies can change their own behaviour.
  rejected = 0;
  lastRefreshDay = -1;
  minCash = Infinity;
  crisisTicks = 0;
  private extraBuilt = 0;
  needSpace = false;
  lastSale = -1e9;

  constructor(public eng: GameEngine, public strategy: Strategy) {
    this.p = { ...PROFILES[strategy] };
  }

  get w() {
    return this.eng.world;
  }
  get s() {
    return this.eng.world.state;
  }

  cmd(c: CommandPayload): CommandResult {
    const r = this.eng.dispatch({ ...c, id: `bot-${this.strategy}-${++this.n}` } as never);
    if (!r.ok) this.rejected++;
    return r;
  }

  cash(): number {
    return this.s.economy.cash;
  }

  // ------------------------------------------------------------------ main loop
  think(): void {
    const s = this.s;
    this.minCash = Math.min(this.minCash, s.economy.cash);
    if (s.economy.crisis === 'crisis' || s.economy.crisis === 'recovery') this.crisisTicks += this.p.thinkEvery;
    if (!s.tutorial.done) this.cmd({ type: 'TUTORIAL', action: 'skip' });
    this.handleEvents();
    if (this.strategy === 'inefficient') this.adaptToLosses();
    if (this.handleCrisis()) return;
    if (this.p.priorities) this.setPriorities();
    this.expandLand();
    this.buildPlan();
    this.staffAll();
    this.capacity();
    this.research();
    this.training();
    if (this.p.upgrades) this.upgrades();
    this.finance();
    if (this.p.overbuild > 0) this.overbuild();
    this.inspection();
  }

  private handleEvents(): void {
    for (const e of this.s.events.active) {
      if (e.ended || e.choice !== null) continue;
      const opts = DEF.event[e.template].options;
      const rich = this.cash() > 25000 && this.strategy === 'skilled';
      const opt = rich ? opts[0]! : opts[opts.length - 1]!;
      this.cmd({ type: 'CHOOSE_EVENT_OPTION', eventId: e.id, optionId: opt.id });
    }
  }

  private setPriorities(): void {
    const pr = this.s.policy.departmentPriority;
    if (this.w.chapter >= 3 && pr.R09 !== 'high') this.cmd({ type: 'SET_DEPARTMENT_PRIORITY', roomType: 'R09', priority: 'high' });
    if (this.w.chapter >= 4 && pr.R13 !== 'high') this.cmd({ type: 'SET_DEPARTMENT_PRIORITY', roomType: 'R13', priority: 'high' });
  }

  /** Even inefficient players eventually react to a week of losses: drop surplus staff and extra rooms. */
  private adaptToLosses(): void {
    const days = lastDays(this.w, 5);
    if (days.length < 5 || days.some((d) => d.result >= 0)) return;
    if (this.w.tick - this.lastAdapt < DEF.sim.ticksPerDay * 5) return;
    this.lastAdapt = this.w.tick;
    this.p.overhire = 0;
    this.p.overbuild = 0;
    for (const room of this.s.rooms) {
      for (const shift of ['day', 'night'] as const) {
        const staff = this.s.staff.filter((s) => s.roomId === room.id && s.shift === shift);
        const need = this.shiftNeed(room, shift);
        const teams = formTeams(room.type, staff);
        if (teams.length > need) {
          const keep = new Set(teams.slice(0, need).flat().map((x) => x.id));
          for (const x of staff) if (!keep.has(x.id) && x.task.kind !== 'work') this.cmd({ type: 'FIRE_STAFF', staffId: x.id });
        }
      }
    }
    // Remove redundant rooms beyond what the chapter plan needs (refund + lower running costs).
    const planned = new Map<RoomTypeId, number>();
    for (let ch = 1; ch <= this.w.chapter; ch++) for (const [t, n] of PLAN[ch]!) planned.set(t, Math.max(planned.get(t) ?? 0, n));
    const groups = new Map<RoomTypeId, RoomState[]>();
    for (const r of this.s.rooms) if (!r.closing) groups.set(r.type, [...(groups.get(r.type) ?? []), r]);
    for (const [t, rooms] of groups) {
      const keep = Math.max(planned.get(t) ?? 0, t === 'R02' || t === 'R06' ? 1 : 0);
      const extra = rooms.sort((a, b) => b.id - a.id).slice(0, Math.max(0, rooms.length - Math.max(keep, 1)));
      for (const r of extra) {
        for (const st of this.s.staff.filter((x) => x.roomId === r.id)) this.cmd({ type: 'FIRE_STAFF', staffId: st.id });
        this.cmd({ type: 'DEMOLISH_ROOM', roomId: r.id, mode: 'whenEmpty' });
      }
    }
    for (const s of this.s.staff.slice()) if (!s.roomId && !s.training) this.cmd({ type: 'FIRE_STAFF', staffId: s.id });
  }
  private lastAdapt = -1e9;

  private handleCrisis(): boolean {
    const e = this.s.economy;
    if (e.crisis !== 'recovery' && e.crisis !== 'crisis') return false;
    // Recovery actions: crisis loan, restructuring, sell equipment, close idle rooms, reconstruction.
    if (!activeLoans(this.w).some((l) => l.kind === 'crisis')) this.cmd({ type: 'TAKE_LOAN', kind: 'crisis' });
    for (const l of activeLoans(this.w)) if (l.overdue > 0) this.cmd({ type: 'REQUEST_RESTRUCTURING', loanId: l.id });
    if (e.crisis === 'recovery' && e.cash < 0) {
      for (const r of this.s.rooms) if (r.level > 1 && this.cmd({ type: 'SELL_EQUIPMENT', roomId: r.id }).ok) this.lastSale = this.w.tick;
      if (this.w.tick - e.crisisSince > DEF.sim.ticksPerDay && e.cash < 0) this.cmd({ type: 'REQUEST_RESTRUCTURING', reconstruction: true });
    }
    this.staffAll();
    return e.cash < 0;
  }

  // ------------------------------------------------------------------ building
  roomsOf(type: RoomTypeId): RoomState[] {
    return this.s.rooms.filter((r) => r.type === type && !r.closing);
  }

  tryBuild(type: RoomTypeId, size?: [number, number]): boolean {
    if (DEF.room[type].unlockChapter > this.w.chapter) return false;
    const [rw, rh] = size ?? defaultSize(type);
    const cost = roomBuildCost(type, rw, rh);
    if (this.cash() < cost + this.p.buffer) return false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const spot = findRoomSpot(this.w, type, rw, rh, this.anchorFor(type));
      if (spot) {
        const r = this.cmd({ type: 'BUILD_ROOM', roomType: type, x: spot.x, y: spot.y, w: spot.w, h: spot.h });
        return r.ok;
      }
      const tiles = nextCorridorTiles(this.w);
      if (!tiles) {
        this.needSpace = true;
        return false;
      }
      if (this.cash() < tiles.length * 40 + cost) return false;
      const r = this.cmd({ type: 'BUILD_CORRIDOR', tiles });
      if (!r.ok) return false;
    }
    return false;
  }

  anchorFor(type: RoomTypeId): { x: number; y: number } {
    if (type === 'R09') return { x: 31, y: 62 };
    if (BACK.includes(type)) return { x: 31, y: 0 };
    const near = FLOW[type] ?? [];
    const rooms = this.s.rooms.filter((r) => near.includes(r.type));
    if (rooms.length === 0) return { x: 31, y: 60 };
    const x = rooms.reduce((s, r) => s + r.x + r.w / 2, 0) / rooms.length;
    const y = rooms.reduce((s, r) => s + r.y + r.h / 2, 0) / rooms.length;
    return { x, y };
  }

  private buildPlan(): void {
    for (let ch = 1; ch <= this.w.chapter; ch++) {
      const list = this.strategy === 'inefficient' && ch === 2 ? [...PLAN[ch]!, ...INEFFICIENT_EXTRA] : PLAN[ch]!;
      for (const [type, count] of list) {
        if ((type === 'R06' && !this.p.breakRooms) || (type === 'R12' && !this.p.cleaning)) continue;
        if (this.roomsOf(type).length < count) {
          if (!this.tryBuild(type)) return; // keep order; wait for money
        }
      }
    }
    // Break rooms: one per ~9 staff; cleaning centres: coverage 8 rooms each.
    if (this.p.breakRooms && this.s.staff.length >= 7 && this.roomsOf('R06').length * 10 < this.s.staff.length) this.tryBuild('R06');
    if (this.p.cleaning && this.w.chapter >= 3) {
      const cover = this.roomsOf('R12').reduce((s, r) => s + DEF.econ.supportUpgrades.cleaningCoverage[r.level - 1]!, 0);
      if (cover < this.s.rooms.length - this.roomsOf('R12').length) {
        const small = this.roomsOf('R12').find((r) => r.level < 3);
        if (small && this.cash() > (upgradeCost(small) ?? 1e9) + this.p.buffer) this.cmd({ type: 'UPGRADE_ROOM', roomId: small.id });
        else this.tryBuild('R12');
      }
    }
  }

  private expandLand(): void {
    const stage = this.s.progress.landStage;
    const next = DEF.econ.landStages[stage + 1];
    if (!next || next.chapter > this.w.chapter) return;
    const cost = landExpansionCost(stage)!;
    if (!this.needSpace && this.strategy !== 'inefficient') return;
    if (this.cash() > cost + 12000) {
      if (this.cmd({ type: 'EXPAND_LAND' }).ok) this.needSpace = false;
    }
  }

  /** Exponential moving average of queue length per step (sampled every think). */
  private qAvg = new Map<StepKind, number>();

  private sampleQueues(): void {
    const counts = new Map<StepKind, number>();
    for (const e of this.s.queues) counts.set(e.step, (counts.get(e.step) ?? 0) + 1);
    const alpha = this.w.isDayShift ? 0.08 : 0;
    for (const sd of Object.values(DEF.step)) {
      const prev = this.qAvg.get(sd.kind) ?? 0;
      this.qAvg.set(sd.kind, prev + ((counts.get(sd.kind) ?? 0) - prev) * alpha);
    }
  }

  /** Reactive capacity: add rooms where queues persist during opening hours. */
  private capacity(): void {
    this.sampleQueues();
    if (!this.w.isDayShift) return;
    const candidates: { type: RoomTypeId; score: number }[] = [];
    for (const sd of Object.values(DEF.step)) {
      const type = sd.roomType;
      if (DEF.room[type].unlockChapter > this.w.chapter) continue;
      const rooms = this.roomsOf(type);
      if (rooms.length === 0) continue;
      const stations = rooms.reduce((s, r) => s + r.layout.stations.length, 0);
      const perStation = (this.qAvg.get(sd.kind) ?? 0) / stations;
      const threshold = this.strategy === 'skilled' && this.w.chapter >= 4 ? this.p.capacityQueue * 0.6 : this.p.capacityQueue;
      if (perStation > threshold) candidates.push({ type, score: perStation });
    }
    // Waiting seats
    const seats = this.roomsOf('R02').reduce((s, r) => s + Math.min(r.layout.stations.length, DEF.econ.supportUpgrades.waitingSeats[r.level - 1]!), 0);
    const waiting = this.s.patients.filter((p) => p.queueStep && !p.reservationId && p.queueStep !== 'REG').length;
    if (waiting > seats) {
      const up = this.roomsOf('R02').find((r) => r.level < 3 && r.layout.stations.length > DEF.econ.supportUpgrades.waitingSeats[r.level - 1]!);
      if (up && this.cash() > (upgradeCost(up) ?? 1e9) + this.p.buffer) this.cmd({ type: 'UPGRADE_ROOM', roomId: up.id });
      else candidates.push({ type: 'R02', score: 1 });
    }
    candidates.sort((a, b) => b.score - a.score);
    const c = candidates[0];
    const maxRooms = this.strategy === 'skilled' ? 8 : 6;
    const gap = this.strategy === 'skilled' && this.w.chapter >= 4 ? 300 : 600;
    if (c && this.roomsOf(c.type).length < maxRooms && this.w.tick - this.lastCapacityBuild > gap) {
      if (this.tryBuild(c.type)) {
        this.lastCapacityBuild = this.w.tick;
        this.qAvg.set(Object.values(DEF.step).find((x) => x.roomType === c.type)?.kind ?? 'U', 0);
      }
    }
  }
  private lastCapacityBuild = -10000;

  private overbuild(): void {
    if (this.extraBuilt >= this.p.overbuild * this.w.chapter) return;
    if (this.w.tick % 1200 !== 0) return;
    const types = Object.values(DEF.room).filter((r) => r.unlockChapter <= this.w.chapter).map((r) => r.id);
    const t = types[this.w.rng.state.s[0] % types.length]!;
    if (this.tryBuild(t)) this.extraBuilt++;
  }

  // ------------------------------------------------------------------ staffing
  private candidateScore(role: RoleId, skills: Record<SkillId, number>, wageMod: number, room?: RoomState): number {
    const ranges = DEF.role[role].skillRanges;
    let s = 0;
    for (const k of Object.keys(ranges) as SkillId[]) s += (k === 'SK11' ? 0.5 : 1) * skills[k];
    if (room) for (const req of DEF.room[room.type].requiredSkill) if (req.role === role && skills[req.skill] < req.min) s -= 1000;
    return s - wageMod * 60;
  }

  private hireFor(room: RoomState, role: RoleId, shift: 'day' | 'night'): boolean {
    const pool = this.s.candidates.filter((c) => c.role === role || DEF.role[c.role].substitutesFor.includes(role));
    const exact = pool.filter((c) => c.role === role);
    const list = exact.length ? exact : pool;
    if (list.length === 0) {
      if (this.lastRefreshDay !== this.w.day && this.cash() > 3000) {
        this.lastRefreshDay = this.w.day;
        this.cmd({ type: 'REFRESH_CANDIDATES' });
      }
      return false;
    }
    let pick = list[0]!;
    if (this.p.pick === 'best') {
      pick = list.slice().sort((a, b) => this.candidateScore(role, b.skills, b.wageMod, room) - this.candidateScore(role, a.skills, a.wageMod, room))[0]!;
    } else pick = list[this.w.rng.state.s[1] % list.length]!;
    const meets = DEF.room[room.type].requiredSkill.every((q) => q.role !== role || pick.skills[q.skill] >= q.min);
    const r = meets ? this.cmd({ type: 'HIRE_STAFF', candidateId: pick.id, shift, roomId: room.id }) : { ok: false, errors: [] };
    if (!r.ok) {
      if (meets) return false;
      // Skill requirement not met: hire anyway unassigned and train.
      const r2 = this.cmd({ type: 'HIRE_STAFF', candidateId: pick.id, shift });
      if (r2.ok && r2.data?.staffId) {
        const req = DEF.room[room.type].requiredSkill.find((q) => q.role === role);
        const t = req ? (Object.values(DEF.training).find((tt) => tt.skill === req.skill && tt.roles.includes(pick.role))?.id as TrainingId | undefined) : undefined;
        if (t) this.cmd({ type: 'START_TRAINING', staffId: r2.data.staffId as number, trainingId: t });
      }
      return r2.ok;
    }
    return true;
  }

  private wantsNight(room: RoomState): boolean {
    if (DEF.room[room.type].hours !== 'allDay' || DEF.room[room.type].team.length === 0) return false;
    if (this.p.nightStaff === 'none') return false;
    if (this.p.nightStaff === 'er') return room.type === 'R09' && this.w.chapter >= 4;
    if (room.type === 'R12') return false;
    if (!NIGHT_FULL.includes(room.type)) return false;
    if (room.type === 'R09') return this.w.chapter >= 3;
    if (room.type === 'R15') return this.w.chapter >= 5;
    return this.w.chapter >= 4;
  }

  private teamsNeeded(room: RoomState): number {
    const d = DEF.room[room.type];
    if (d.stationKind === 'bed') {
      // One care team, a second one only when beds stay full and patients queue.
      const step = d.steps[0]!;
      const q = this.qAvg.get(step) ?? 0;
      return Math.min(Math.ceil(room.layout.stations.length / d.stationsPerTeam), q > 1.5 ? 2 : 1);
    }
    if (d.stationKind === 'cleaning' || d.stationKind === 'research') return Math.min(room.layout.stations.length, 1 + (this.w.chapter >= 4 ? 1 : 0));
    return room.layout.stations.length;
  }

  private shiftNeed(room: RoomState, shift: 'day' | 'night'): number {
    const d = DEF.room[room.type];
    if (d.team.length === 0) return 0;
    if (shift === 'night' && !this.wantsNight(room)) return 0;
    let need = this.teamsNeeded(room);
    if (this.strategy === 'inefficient' && this.p.overhire > 0 && (room.type === 'R03' || room.type === 'R05')) need += 1;
    return need;
  }

  staffAll(): void {
    for (const room of this.s.rooms) {
      if (room.closing) continue;
      const d = DEF.room[room.type];
      if (d.team.length === 0) continue;
      for (const shift of ['day', 'night'] as const) {
        const need = this.shiftNeed(room, shift);
        if (need === 0) continue;
        let guard = 0;
        for (;;) {
          if (guard++ > 4) break;
          const staff = this.s.staff.filter((s) => s.roomId === room.id && s.shift === shift);
          const teams = formTeams(room.type, staff).length;
          if (teams >= need) break;
          const have = new Map<RoleId, number>();
          for (const s of formTeams(room.type, staff).flat()) have.set(s.role, (have.get(s.role) ?? 0) + 1);
          const counts = new Map<RoleId, number>();
          for (const s of staff) counts.set(s.role, (counts.get(s.role) ?? 0) + 1);
          const needed = d.team.find((role) => (counts.get(role) ?? 0) < (teams + 1) * d.team.filter((r) => r === role).length);
          if (!needed) break;
          const spare = this.s.staff.find((s) => !s.roomId && !s.training && s.shift === shift && s.role === needed && DEF.room[room.type].requiredSkill.every((q) => q.role !== needed || s.skills[q.skill] >= q.min));
          if (spare) {
            if (!this.cmd({ type: 'ASSIGN_STAFF', staffId: spare.id, roomId: room.id }).ok) break;
            continue;
          }
          const pendingTrainee = this.s.staff.some((s) => !s.roomId && s.training && s.role === needed && s.shift === shift);
          if (pendingTrainee) break;
          if (this.cash() < DEF.role[needed].wage * 3 + 1000) break;
          if (!this.hireFor(room, needed, shift)) break;
        }
      }
    }
    // Unassigned staff without a purpose are let go (skilled/average); trainees keep their place.
    if (this.strategy !== 'inefficient') {
      for (const s of this.s.staff.slice()) {
        if (s.roomId || s.training) continue;
        const useful = this.s.rooms.some((r) => !r.closing && DEF.room[r.type].team.includes(s.role) && formTeams(r.type, this.s.staff.filter((o) => o.roomId === r.id && o.shift === s.shift)).length < this.shiftNeed(r, s.shift));
        if (!useful) this.cmd({ type: 'FIRE_STAFF', staffId: s.id });
      }
      // Reserves hired as training cover are released once nobody in the room is training.
      for (const room of this.s.rooms) {
        for (const shift of ['day', 'night'] as const) {
          const staff = this.s.staff.filter((s) => s.roomId === room.id && s.shift === shift);
          if (staff.some((s) => s.training)) continue;
          const need = this.shiftNeed(room, shift);
          const teams = formTeams(room.type, staff);
          if (teams.length > need && need >= 0) {
            const used = new Set(teams.slice(0, need).flat().map((x) => x.id));
            const extra = staff.filter((x) => !used.has(x.id) && x.task.kind !== 'work');
            for (const x of extra) this.cmd({ type: 'FIRE_STAFF', staffId: x.id });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ research & training
  private research(): void {
    if (this.w.chapter < 2) return;
    const r = this.s.research;
    if (!r.active) {
      const next = ROUTE_ORDER.find((id) => projectAvailable(this.w, id).ok);
      if (next) this.cmd({ type: 'START_RESEARCH', projectId: next });
    }
    if (!this.p.convertResearch) return;
    // Reserve for the next project, convert the surplus towards mastery (smallest gap first).
    const pending = ROUTE_ORDER.find((id) => !r.projectsDone.includes(id) && r.active?.id !== id && DEF.project[id].chapter <= this.w.chapter && DEF.project[id].requires.every((q) => r.projectsDone.includes(q)));
    const reserve = this.w.chapter >= 5 ? 0 : pending ? Math.min(DEF.project[pending].grp, 200) : 0;
    let spare = r.grp - reserve;
    if (spare <= 0) return;
    const targets = r.identified.filter((d) => !r.mastered.includes(d)).sort((a, b) => (DEF.disease[a].masteryThreshold - (r.rp[a] ?? 0)) - (DEF.disease[b].masteryThreshold - (r.rp[b] ?? 0)));
    for (const d of targets) {
      if (spare <= 0) break;
      const used = r.convertedToday[d as DiseaseId] ?? 0;
      const gap = Math.ceil((DEF.disease[d].masteryThreshold - (r.rp[d] ?? 0)) / 2);
      const amt = Math.min(spare, 100 - used, gap);
      if (amt <= 0) continue;
      if (this.cmd({ type: 'CONVERT_GRP_TO_RP', disease: d, grp: amt }).ok) spare -= amt;
    }
  }

  private training(): void {
    const ch3 = chapterStatus(this.w).find((x) => x.def.kind === 'trainedSpecialists');
    if (this.w.chapter === 3 && ch3 && !ch3.met) {
      const inTraining = this.s.staff.filter((s) => s.training && ['T04', 'T06', 'T07'].includes(s.training.id)).length;
      if (ch3.current + inTraining < 4) {
        if (inTraining > 0 && this.strategy === 'skilled') return; // one at a time keeps departments open
        const options: [RoleId, TrainingId, SkillId][] = [['S03', 'T04', 'SK04'], ['S02', 'T04', 'SK04'], ['S05', 'T06', 'SK06'], ['S06', 'T07', 'SK07'], ['S06', 'T04', 'SK04']];
        const qualified = (s: StaffState) => ['T04', 'T06', 'T07'].some((t) => s.completedTrainings.includes(t as TrainingId) && s.skills[DEF.training[t as TrainingId].skill] >= 50);
        for (const [role, tid, sk] of options) {
          const cands = this.s.staff
            .filter((s) => s.role === role && !s.training && s.task.kind !== 'work' && !qualified(s) && s.roomId && DEF.training[tid].roles.includes(s.role))
            .filter((s) => tid !== 'T04' || this.w.roomById.get(s.roomId)?.type === 'R09')
            .sort((a, b) => (a.shift === 'night' ? -1 : 0) - (b.shift === 'night' ? -1 : 0) || b.skills[sk] - a.skills[sk]);
          const cand = cands[0];
          if (!cand || this.cash() < trainingCost(this.w, tid) + this.p.buffer) continue;
          if (!this.canSpare(cand) && this.strategy === 'skilled') {
            // Hire a reserve first so the department stays open during training.
            const room = this.w.roomById.get(cand.roomId)!;
            this.hireFor(room, cand.role, cand.shift);
            if (!this.canSpare(cand)) continue;
          }
          if (this.cmd({ type: 'START_TRAINING', staffId: cand.id, trainingId: tid }).ok) return;
        }
      }
    }
    if (!this.p.qualityTraining || this.cash() < 30000) return;
    // Quality: train the weakest primary skill of clinical staff, one at a time.
    if (this.s.staff.some((s) => s.training)) return;
    const pairs: [RoleId, TrainingId, SkillId][] = [['S03', 'T01', 'SK01'], ['S02', 'T03', 'SK03'], ['S06', 'T07', 'SK07'], ['S07', 'T08', 'SK08'], ['S04', 'T05', 'SK05'], ['S05', 'T06', 'SK06'], ['S09', 'T10', 'SK10'], ['S01', 'T12', 'SK12']];
    for (const [role, tid, sk] of pairs) {
      const cand = this.s.staff.filter((s) => s.role === role && s.skills[sk] < 70 && s.task.kind !== 'work').sort((a, b) => a.skills[sk] - b.skills[sk])[0];
      if (cand && this.canSpare(cand) && this.cmd({ type: 'START_TRAINING', staffId: cand.id, trainingId: tid }).ok) return;
    }
    const stressed = this.s.staff.find((s) => s.stress > 45 && !s.completedTrainings.includes('T11'));
    if (stressed && this.canSpare(stressed)) this.cmd({ type: 'START_TRAINING', staffId: stressed.id, trainingId: 'T11' });
  }

  private canSpare(s: StaffState): boolean {
    if (!s.roomId) return true;
    const room = this.w.roomById.get(s.roomId)!;
    const others = this.s.staff.filter((o) => o.roomId === room.id && o.id !== s.id && o.shift === s.shift && !o.training);
    return formTeams(room.type, others).length >= 1;
  }

  private upgrades(): void {
    const reserve = this.w.chapter >= 4 ? 25000 : 35000;
    if (this.cash() < reserve + 5000 || this.s.economy.crisis !== 'none' || activeLoans(this.w).length > 0) return;
    if (this.w.tick - this.lastSale < DEF.sim.ticksPerDay * 10) return;
    const days = lastDays(this.w, 2);
    const q = (t: RoomTypeId) => this.qAvg.get(Object.values(DEF.step).find((x) => x.roomType === t)?.kind ?? 'U') ?? 0;
    const rooms = this.s.rooms
      .filter((r) => (DEF.room[r.type].upgradeKind === 'clinical' || DEF.room[r.type].upgradeKind === 'reception') && r.level < 3)
      .sort((a, b) => q(b.type) - q(a.type) || roomUtilization(days, b.type) - roomUtilization(days, a.type) || a.id - b.id);
    for (const r of rooms.slice(0, 3)) {
      if (this.cash() > (upgradeCost(r) ?? 1e9) + reserve) this.cmd({ type: 'UPGRADE_ROOM', roomId: r.id });
    }
  }

  private finance(): void {
    const e = this.s.economy;
    const fixed = dailyFixedCosts(this.w);
    const loans = activeLoans(this.w);
    if (e.cash < Math.max(6000, fixed * 0.6) && e.crisis !== 'none' && totalOverdue(this.w) === 0 && loans.filter((l) => l.kind !== 'crisis').length < 2) {
      this.cmd({ type: 'TAKE_LOAN', kind: this.w.chapter >= 2 ? 'investment' : 'short' });
    }
    if (e.cash > Math.max(60000, fixed * 3)) for (const l of loans) this.cmd({ type: 'REPAY_LOAN', loanId: l.id });
  }

  private inspection(): void {
    if (this.w.chapter !== 5) return;
    const p = this.s.progress;
    if (p.victory || p.inspection?.active) return;
    if (inspectionPrerequisites(this.w).every((x) => x.met) && this.healthyForInspection()) this.cmd({ type: 'START_FINAL_INSPECTION' });
  }

  private healthyForInspection(): boolean {
    const a = aggregate(lastDays(this.w, 3));
    if (this.strategy !== 'skilled') return true;
    return a.successRate >= 86 && a.avgWait < 30 && a.result > 0 && FINAL_INSPECTION.requiredRooms.every((t) => this.s.rooms.some((r) => r.type === t && roomInService(this.w, r)));
  }
}

export function runBot(seed: number, strategy: Strategy, maxDays = 140, opts: { invariantEvery?: number; strict?: boolean; onDay?: (b: Bot) => void } = {}): BotResult {
  const t0 = Date.now();
  const eng = GameEngine.newGame(seed, { invariantEvery: opts.invariantEvery ?? 200, strict: opts.strict ?? false });
  const bot = new Bot(eng, strategy);
  const chapterDays: number[] = [];
  let lastChapter = 1;
  const maxTicks = maxDays * DEF.sim.ticksPerDay;
  while (eng.world.tick < maxTicks) {
    eng.step();
    if (eng.world.tick % bot.p.thinkEvery === 0) bot.think();
    if (eng.state.progress.chapter !== lastChapter) {
      lastChapter = eng.state.progress.chapter;
      chapterDays.push(eng.world.day);
    }
    if (eng.world.tick % DEF.sim.ticksPerDay === 0) opts.onDay?.(bot);
    if (eng.state.progress.victory) break;
  }
  const s = eng.state;
  return {
    seed, strategy, won: !!s.progress.victory, victoryDay: s.progress.victory?.day ?? null, chapterDays, days: eng.world.day,
    minCash: bot.minCash, reconstructions: s.economy.reconstructions, crisisDays: Math.round(bot.crisisTicks / DEF.sim.ticksPerDay * 10) / 10,
    violations: s.audit.violations.length, inspectionAttempts: s.progress.inspection?.attempts ?? 0, completed: s.metrics.totals.completed,
    mastered: s.research.mastered.length, projects: s.research.projectsDone.length, reputation: Math.round(s.metrics.reputation), rejectedCommands: bot.rejected, ms: Date.now() - t0,
  };
}
