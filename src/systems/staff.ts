import { DEF, ROLE_IDS, SKILL_IDS } from '../data/definition';
import { FIRST_NAMES, LAST_NAMES, TRAITS } from '../data/staff';
import type { RoleId, SkillId, TrainingId } from '../data/types';
import { hash32 } from '../core/rng';
import type { CandidateState, RoomState, StaffState } from '../core/state';
import type { World } from '../core/world';
import { canAfford, post, staffWage } from './economy';
import { arrived, clearDestination, isMoving, setDestination, stepMover } from './movement';
import { activeBookingsForRoom, bedCoverage, cancelReservation } from './resources';
import { canFillSlot, clamp, eventMod, formTeams, meetsSkillReq, onDuty, onShiftNow, roomAccessible, staffOfRoom } from './rules';

export function generateCandidate(w: World, role: RoleId): CandidateState {
  const def = DEF.role[role];
  const skills = {} as Record<SkillId, number>;
  for (const sk of SKILL_IDS) {
    const range = def.skillRanges[sk];
    skills[sk] = range ? Math.round(w.rng.range(range[0], range[1])) : Math.round(w.rng.range(0, 12));
  }
  const traits: string[] = [];
  const t = w.rng.pick(TRAITS);
  if (t.id !== 'none') traits.push(t.id);
  if (w.rng.chance(0.2)) {
    const t2 = w.rng.pick(TRAITS);
    if (t2.id !== 'none' && !traits.includes(t2.id)) traits.push(t2.id);
  }
  // Better candidates ask for more money.
  const quality = Object.entries(def.skillRanges).reduce((s, [k, r]) => s + ((skills[k as SkillId] - r![0]) / Math.max(1, r![1] - r![0])), 0) / Math.max(1, Object.keys(def.skillRanges).length);
  const wageMod = clamp(Math.round(((quality - 0.5) * 0.24 + w.rng.range(-0.06, 0.06)) * 100) / 100, -0.15, 0.15);
  const id = w.nextId('candidate');
  return { id, role, name: `${w.rng.pick(FIRST_NAMES)} ${w.rng.pick(LAST_NAMES)}`, visual: hash32('staff', w.state.campaign.seed, id), traits, wageMod, skills };
}

export function refreshCandidates(w: World): void {
  const out: CandidateState[] = [];
  for (const role of ROLE_IDS) {
    if (DEF.role[role].unlockChapter > w.chapter) continue;
    const n = role === 'S02' || role === 'S03' ? 3 : 2;
    for (let i = 0; i < n; i++) out.push(generateCandidate(w, role));
  }
  w.state.candidates = out;
  w.state.candidatesDay = w.day;
}

export function staffDailyWage(s: StaffState): number {
  return staffWage(DEF.role[s.role].wage, s.wageMod, s.shift);
}

function newStaff(w: World, c: CandidateState, shift: 'day' | 'night'): StaffState {
  return {
    id: w.nextId('staff'), role: c.role, name: c.name, visual: c.visual, traits: c.traits.slice(), wageMod: c.wageMod, skills: { ...c.skills },
    energy: 90, stress: 5, shift, roomId: 0, state: 'UNASSIGNED', stateSince: w.tick, task: { kind: 'none' }, onSite: false, training: null,
    unavailableUntil: 0, completedTrainings: [], hiredTick: w.tick, overtime: false, breakRequested: false,
    pos: w.state.map.entrance, path: [], pathIdx: 0, progress: 0, dest: -1, allowRooms: [], lastProgressTick: w.tick, facing: 'up', navVersion: w.state.map.version,
  };
}

/** Minutes left of the shift that is currently running. */
function minutesLeftOfShift(w: World): number {
  const m = w.minuteOfDay;
  if (w.isDayShift) return DEF.sim.nightShiftStart - m;
  return m >= DEF.sim.nightShiftStart ? 1440 - m + DEF.sim.dayShiftStart : DEF.sim.dayShiftStart - m;
}

export function hireStaff(w: World, candidateId: number, shift: 'day' | 'night', roomId: number | null, causation: string | null): { ok: boolean; errorsSv: string[]; staffId?: number } {
  const ci = w.state.candidates.findIndex((c) => c.id === candidateId);
  if (ci < 0) return { ok: false, errorsSv: ['Kandidaten finns inte längre'] };
  const c = w.state.candidates[ci]!;
  if (DEF.role[c.role].unlockChapter > w.chapter) return { ok: false, errorsSv: ['Yrkesrollen är inte upplåst än'] };
  const s = newStaff(w, c, shift);
  const wage = staffDailyWage(s);
  const onNow = onShiftNow(w, s);
  const prorata = onNow ? Math.round((wage * minutesLeftOfShift(w)) / 720) : 0;
  if (!canAfford(w, prorata)) return { ok: false, errorsSv: [`Behöver ${prorata} kr för påbörjat pass`] };
  if (roomId) {
    const err = assignmentError(w, s, roomId);
    if (err) return { ok: false, errorsSv: [err] };
  }
  w.state.candidates.splice(ci, 1);
  w.addStaff(s);
  if (prorata > 0) post(w, -prorata, 'wage', `Lön (påbörjat pass): ${s.name}`, `staff:${s.id}`);
  if (roomId) {
    s.roomId = roomId;
    s.state = 'IDLE';
  }
  w.emit('STAFF_HIRED', { staffId: s.id, role: s.role, name: s.name }, `staff:${s.id}`, causation);
  w.matchDirty = true;
  return { ok: true, errorsSv: [], staffId: s.id };
}

function maxPerShift(room: RoomState): number {
  const def = DEF.room[room.type];
  if (def.team.length === 0) return 0;
  const st = room.layout.stations.length;
  if (def.stationKind === 'bed') return def.team.length * Math.ceil(st / def.stationsPerTeam);
  return def.team.length * st;
}

export function assignmentError(w: World, s: StaffState, roomId: number): string | null {
  const room = w.roomById.get(roomId);
  if (!room) return 'Rummet finns inte';
  if (room.closing) return 'Rummet håller på att rivas';
  const def = DEF.room[room.type];
  const slots = def.team.filter((slot) => canFillSlot(s, slot));
  if (slots.length === 0) return `${DEF.role[s.role].nameSv} kan inte arbeta i ${def.nameSv.toLowerCase()}`;
  if (!slots.some((slot) => meetsSkillReq(s, room.type, slot))) {
    const req = def.requiredSkill.find((r) => slots.includes(r.role));
    return req ? `Kräver minst ${req.min} i ${DEF.skill[req.skill].nameSv.toLowerCase()} – utbilda först` : 'Saknar behörighet';
  }
  if (s.shift === 'night' && def.hours === 'day') return `${def.nameSv} är bara öppet dagtid`;
  const same = staffOfRoom(w, roomId).filter((o) => o.id !== s.id && o.shift === s.shift);
  if (same.length >= maxPerShift(room)) return 'Rummet har redan full bemanning på det passet';
  return null;
}

/** Bed rooms must never be left with occupied beds and no care team. */
function wouldUncoverBeds(w: World, s: StaffState): boolean {
  if (!s.roomId || !onDuty(w, s)) return false;
  const room = w.roomById.get(s.roomId);
  if (!room || DEF.room[room.type].stationKind !== 'bed') return false;
  const occupied = activeBookingsForRoom(w, room.id).length;
  if (occupied === 0) return false;
  const others = staffOfRoom(w, room.id).filter((o) => o.id !== s.id && onDuty(w, o) && o.state !== 'RESTING');
  return formTeams(room.type, others).length * DEF.room[room.type].stationsPerTeam < occupied;
}

function releaseWork(w: World, s: StaffState): string | null {
  if (s.task.kind === 'work') {
    const res = w.resById.get(s.task.reservationId);
    if (res && res.status === 'ACTIVE') return 'Personen behandlar en patient just nu';
    if (res) cancelReservation(w, res, 'staffChange', true, false);
  }
  if (wouldUncoverBeds(w, s)) return 'Patienter ligger inne och behöver personalen';
  return null;
}

export function assignStaff(w: World, staffId: number, roomId: number, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const s = w.staffById.get(staffId);
  if (!s) return { ok: false, errorsSv: ['Personen finns inte'] };
  if (s.roomId === roomId) return { ok: false, errorsSv: ['Redan placerad i rummet'] };
  const err = assignmentError(w, s, roomId);
  if (err) return { ok: false, errorsSv: [err] };
  const busy = releaseWork(w, s);
  if (busy) return { ok: false, errorsSv: [busy] };
  s.roomId = roomId;
  s.task = { kind: 'none' };
  if (s.state === 'UNASSIGNED') s.state = 'IDLE';
  clearDestination(s);
  w.matchDirty = true;
  w.emit('STAFF_ASSIGNED', { staffId, roomId }, `staff:${staffId}`, causation);
  return { ok: true, errorsSv: [] };
}

export function unassignStaff(w: World, staffId: number, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const s = w.staffById.get(staffId);
  if (!s) return { ok: false, errorsSv: ['Personen finns inte'] };
  if (!s.roomId) return { ok: false, errorsSv: ['Personen är inte placerad'] };
  const busy = releaseWork(w, s);
  if (busy) return { ok: false, errorsSv: [busy] };
  s.roomId = 0;
  s.task = { kind: 'none' };
  if (s.state !== 'TRAINING' && s.state !== 'UNAVAILABLE') s.state = 'UNASSIGNED';
  clearDestination(s);
  w.matchDirty = true;
  w.emit('STAFF_ASSIGNED', { staffId, roomId: 0 }, `staff:${staffId}`, causation);
  return { ok: true, errorsSv: [] };
}

export function fireStaff(w: World, staffId: number, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const s = w.staffById.get(staffId);
  if (!s) return { ok: false, errorsSv: ['Personen finns inte'] };
  if (s.state === 'TRAINING') return { ok: false, errorsSv: ['Personen är på utbildning'] };
  const busy = releaseWork(w, s);
  if (busy) return { ok: false, errorsSv: [busy] };
  w.removeStaff(staffId);
  w.matchDirty = true;
  w.emit('STAFF_FIRED', { staffId, name: s.name, role: s.role }, `staff:${staffId}`, causation);
  return { ok: true, errorsSv: [] };
}

export function setStaffShift(w: World, staffId: number, shift: 'day' | 'night', causation: string | null): { ok: boolean; errorsSv: string[] } {
  const s = w.staffById.get(staffId);
  if (!s) return { ok: false, errorsSv: ['Personen finns inte'] };
  if (s.shift === shift) return { ok: false, errorsSv: ['Personen har redan det passet'] };
  if (s.onSite && onShiftNow(w, s)) return { ok: false, errorsSv: ['Byt pass när personen inte arbetar (passet pågår)'] };
  if (s.roomId) {
    const room = w.roomById.get(s.roomId);
    if (room && shift === 'night' && DEF.room[room.type].hours === 'day') return { ok: false, errorsSv: [`${DEF.room[room.type].nameSv} är bara öppet dagtid`] };
    const same = staffOfRoom(w, s.roomId).filter((o) => o.id !== s.id && o.shift === shift);
    if (room && same.length >= maxPerShift(room)) return { ok: false, errorsSv: ['Det passet är redan fullbemannat'] };
  }
  s.shift = shift;
  w.matchDirty = true;
  w.emit('STAFF_ASSIGNED', { staffId, shift }, `staff:${staffId}`, causation);
  return { ok: true, errorsSv: [] };
}

export function trainingCost(w: World, id: TrainingId): number {
  const base = DEF.training[id].cost;
  return w.state.research.projectsDone.includes('F07') ? Math.round(base * 0.85) : base;
}

export function startTraining(w: World, staffId: number, trainingId: TrainingId, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const s = w.staffById.get(staffId);
  const t = DEF.training[trainingId];
  if (!s || !t) return { ok: false, errorsSv: ['Ogiltig utbildning'] };
  if (!t.roles.includes(s.role)) return { ok: false, errorsSv: [`${t.nameSv} passar inte ${DEF.role[s.role].nameSv.toLowerCase()}`] };
  if (s.training) return { ok: false, errorsSv: ['Personen utbildar sig redan'] };
  if (s.unavailableUntil > w.tick) return { ok: false, errorsSv: ['Personen är frånvarande'] };
  if ((s.skills[t.skill] ?? 0) >= 100) return { ok: false, errorsSv: ['Färdigheten är redan max'] };
  const cost = trainingCost(w, trainingId);
  if (!canAfford(w, cost)) return { ok: false, errorsSv: [`Kostar ${cost} kr`] };
  const busy = releaseWork(w, s);
  if (busy) return { ok: false, errorsSv: [busy] };
  post(w, -cost, 'training', `Utbildning: ${t.nameSv}`, `staff:${s.id}`);
  s.training = { id: trainingId, until: w.tick + t.days * DEF.sim.ticksPerDay };
  s.state = 'TRAINING';
  s.stateSince = w.tick;
  s.task = { kind: 'none' };
  s.onSite = false;
  s.overtime = false;
  clearDestination(s);
  w.matchDirty = true;
  w.emit('TRAINING_STARTED', { staffId, training: trainingId, until: s.training.until }, `staff:${staffId}`, causation);
  return { ok: true, errorsSv: [] };
}

// ------------------------------------------------------------------ per tick behaviour

function breakThreshold(w: World, s: StaffState): number {
  const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
  const pr = room ? (w.state.policy.departmentPriority[room.type] ?? 'normal') : 'normal';
  return pr === 'high' ? 20 : pr === 'low' ? 45 : DEF.sim.breakBelow;
}

function idleTileFor(w: World, s: StaffState): { tile: number; allow: number[] } {
  const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
  if (room && roomAccessible(w, room)) {
    const tiles = room.layout.idleTiles.length ? room.layout.idleTiles : room.layout.stations.flatMap((st) => st.staffTiles);
    const tile = tiles[(s.id * 7) % tiles.length]!;
    return { tile, allow: [room.id] };
  }
  // Unassigned: wait in a break room if any, otherwise near the entrance.
  const br = w.state.rooms.find((r) => r.type === 'R06' && r.open && !r.closing);
  if (br && br.layout.idleTiles.length) return { tile: br.layout.idleTiles[s.id % br.layout.idleTiles.length]!, allow: [br.id] };
  const e = w.state.map.entrance;
  return { tile: e - 64 * (1 + (s.id % 3)), allow: [] };
}

function freeRestStation(w: World): { room: RoomState; station: number } | null {
  const taken = new Set<string>();
  for (const o of w.state.staff) if (o.task.kind === 'rest' && o.task.station >= 0) taken.add(`${o.task.roomId}:${o.task.station}`);
  for (const r of w.state.rooms) {
    if (r.type !== 'R06' || !r.open || r.closing || !roomAccessible(w, r)) continue;
    for (const st of r.layout.stations) if (!taken.has(`${r.id}:${st.id}`)) return { room: r, station: st.id };
  }
  return null;
}

function cleaningCoverage(w: World): Set<number> {
  const key = `clean:${w.state.map.version}:${Math.floor(w.tick / 100)}`;
  const cached = w.caches.cleanKey === key ? (w.caches.clean as Set<number>) : null;
  if (cached) return cached;
  let capacity = 0;
  for (const r of w.state.rooms) {
    if (r.type !== 'R12' || !r.open || r.closing) continue;
    const cleaners = staffOfRoom(w, r.id).filter((s) => s.role === 'S08').length;
    if (cleaners > 0) capacity += DEF.econ.supportUpgrades.cleaningCoverage[r.level - 1]! * Math.min(cleaners, r.layout.stations.length);
  }
  const rank = (t: RoomState) => {
    const pr = w.state.policy.departmentPriority[t.type] ?? 'normal';
    return pr === 'high' ? 0 : pr === 'normal' ? 1 : 2;
  };
  const rooms = w.state.rooms.filter((r) => r.type !== 'R12').sort((a, b) => rank(a) - rank(b) || a.cleanliness - b.cleanliness || a.id - b.id);
  const set = new Set(rooms.slice(0, capacity).map((r) => r.id));
  w.caches.clean = set;
  w.caches.cleanKey = key;
  return set;
}

function pickCleaningJob(w: World, s: StaffState): RoomState | null {
  const covered = cleaningCoverage(w);
  const targeted = new Set<number>();
  for (const o of w.state.staff) if (o.id !== s.id && o.task.kind === 'clean') targeted.add(o.task.roomId);
  let best: RoomState | null = null;
  for (const r of w.state.rooms) {
    if (!covered.has(r.id) || targeted.has(r.id) || r.cleanliness >= 85 || !roomAccessible(w, r)) continue;
    if (!best || r.cleanliness < best.cleanliness) best = r;
  }
  return best;
}

function doorInside(r: RoomState): number {
  return r.door.y * 64 + r.door.x;
}

function spawnOnSite(w: World, s: StaffState): void {
  s.onSite = true;
  s.pos = w.state.map.entrance;
  s.path = [];
  s.pathIdx = 0;
  s.progress = 0;
  s.task = { kind: 'toRoom' };
  s.state = 'MOVING';
  s.stateSince = w.tick;
  const t = idleTileFor(w, s);
  if (!setDestination(w, s, t.tile, t.allow)) {
    s.state = 'BLOCKED';
    clearDestination(s);
  }
}

function leave(w: World, s: StaffState): void {
  s.task = { kind: 'leave' };
  s.state = 'MOVING';
  s.breakRequested = false;
  s.overtime = false;
  if (!setDestination(w, s, w.state.map.entrance, [])) {
    s.onSite = false;
    s.state = 'UNAVAILABLE';
    s.task = { kind: 'none' };
    clearDestination(s);
  }
}

/** Shift start: charge wages for everyone on the incoming shift (one auditable transaction). */
export function startShift(w: World, shift: 'day' | 'night'): void {
  let total = 0;
  let n = 0;
  for (const s of w.state.staff) if (s.shift === shift) {
    total += staffDailyWage(s);
    n++;
  }
  if (total > 0) post(w, -total, 'wage', `Löner ${shift === 'day' ? 'dagpass' : 'nattpass'} (${n} pers.)`, `shift:${w.day}:${shift}`);
  w.emit('SHIFT_CHANGE', { shift, staff: n, wages: total });
  w.matchDirty = true;
}

export function completeTraining(w: World, s: StaffState): void {
  const t = DEF.training[s.training!.id];
  s.skills[t.skill] = Math.min(100, (s.skills[t.skill] ?? 0) + t.gain);
  s.completedTrainings.push(t.id);
  s.training = null;
  s.state = s.roomId ? 'IDLE' : 'UNASSIGNED';
  s.stress = Math.max(0, s.stress - 10);
  w.state.metrics.today.trainingsCompleted++;
  w.state.metrics.totals.trainingsCompleted++;
  w.emit('STAFF_TRAINED', { staffId: s.id, training: t.id, skill: t.skill, value: Math.round(s.skills[t.skill]) }, `staff:${s.id}`);
  w.matchDirty = true;
}

export function updateStaff(w: World): void {
  const dt = DEF.sim.minutesPerTick;
  const en = DEF.sim.energy;
  for (const s of w.state.staff) {
    if (s.training) {
      if (w.tick >= s.training.until) completeTraining(w, s);
      else {
        s.energy = clamp(s.energy + en.offShift * dt, 0, 100);
        continue;
      }
    }
    if (s.unavailableUntil > w.tick) {
      if (s.onSite) {
        if (s.task.kind === 'work') {
          const res = w.resById.get(s.task.reservationId);
          if (res && res.status !== 'ACTIVE') cancelReservation(w, res, 'absent', true, false);
        }
        if (s.task.kind !== 'work') {
          s.onSite = false;
          s.task = { kind: 'none' };
          clearDestination(s);
        }
      }
      if (!s.onSite) {
        s.state = 'UNAVAILABLE';
        continue;
      }
    }
    const shiftNow = onShiftNow(w, s);
    if (!s.onSite) {
      s.energy = clamp(s.energy + en.offShift * dt, 0, 100);
      s.stress = clamp(s.stress - 0.04 * dt, 0, 100);
      if (shiftNow && s.unavailableUntil <= w.tick) spawnOnSite(w, s);
      else if (s.state !== 'UNAVAILABLE') s.state = 'UNAVAILABLE';
      continue;
    }
    // Off-going staff: finish active work (overtime), cover occupied beds, otherwise go home.
    if (!shiftNow) {
      if (s.task.kind === 'leave') {
        /* walking out */
      } else if (s.task.kind === 'work') {
        const res = w.resById.get(s.task.reservationId);
        if (res && res.status !== 'ACTIVE') {
          cancelReservation(w, res, 'shiftEnd', true, false);
          leave(w, s);
        } else s.overtime = true;
      } else if (wouldUncoverBedsOffShift(w, s)) {
        s.overtime = true;
      } else {
        s.overtime = false;
        leave(w, s);
      }
    } else if (s.overtime) s.overtime = false;

    // Energy and stress.
    const sk11 = s.skills.SK11 ?? 0;
    const stressMult = (1 - (0.5 * sk11) / 100) * (s.traits.includes('calm') ? 0.75 : 1);
    const drain = s.traits.includes('tireless') ? 0.85 : 1;
    switch (s.state) {
      case 'WORKING':
        s.energy += en.work * drain * dt;
        s.stress += 0.03 * (s.energy < 40 ? 1.8 : 1) * stressMult * dt;
        break;
      case 'MOVING':
        s.energy += en.walk * drain * dt;
        break;
      case 'RESTING': {
        const inBreakRoom = s.task.kind === 'rest' && s.task.station >= 0;
        if (inBreakRoom && arrived(s)) {
          const br = w.roomById.get((s.task as { roomId: number }).roomId);
          const bonus = br ? DEF.econ.supportUpgrades.breakRecovery[br.level - 1]! : 0;
          s.energy += en.breakRoom * (1 + bonus) * eventMod(w, 'breakRecovery') * (s.traits.includes('coffee') ? 1.2 : 1) * dt;
        } else s.energy += en.restNoRoom * dt;
        s.stress -= 0.15 * dt;
        break;
      }
      default:
        s.energy += en.idle * dt;
        s.stress -= 0.02 * dt;
    }
    s.energy = clamp(s.energy, 0, 100);
    s.stress = clamp(s.stress, 0, 100);

    // Movement.
    const mpt = s.traits.includes('fast') ? DEF.nav.staffMinutesPerTile.fast : DEF.nav.staffMinutesPerTile.normal;
    const mv = stepMover(w, s, mpt);
    if (mv === 'blocked') {
      s.state = 'BLOCKED';
      if (s.task.kind === 'work') {
        const res = w.resById.get(s.task.reservationId);
        if (res) cancelReservation(w, res, 'staffBlocked', true, true);
      }
      s.task = { kind: 'none' };
      clearDestination(s);
      continue;
    }
    decide(w, s, mv === 'arrived');
  }
}

function wouldUncoverBedsOffShift(w: World, s: StaffState): boolean {
  if (!s.roomId) return false;
  const room = w.roomById.get(s.roomId);
  if (!room || DEF.room[room.type].stationKind !== 'bed') return false;
  const occupied = activeBookingsForRoom(w, room.id).length;
  if (occupied === 0) return false;
  const incoming = staffOfRoom(w, room.id).filter((o) => o.id !== s.id && o.onSite && onShiftNow(w, o) && (o.state === 'IDLE' || o.state === 'WORKING'));
  return formTeams(room.type, incoming).length * DEF.room[room.type].stationsPerTeam < occupied;
}

function decide(w: World, s: StaffState, justArrived: boolean): void {
  const task = s.task;
  switch (task.kind) {
    case 'leave':
      if (s.pos === w.state.map.entrance && !isMoving(s)) {
        s.onSite = false;
        s.state = 'UNAVAILABLE';
        s.task = { kind: 'none' };
        clearDestination(s);
      }
      return;
    case 'work':
      if (!w.resById.has(task.reservationId)) {
        s.task = { kind: 'none' };
        s.state = s.roomId ? 'IDLE' : 'UNASSIGNED';
      }
      return;
    case 'rest':
      if (justArrived || (!isMoving(s) && s.state === 'MOVING')) s.state = 'RESTING';
      if (s.energy >= DEF.sim.breakUntil) {
        s.task = { kind: 'none' };
        s.breakRequested = false;
        s.state = 'IDLE';
        clearDestination(s);
      }
      return;
    case 'clean': {
      const room = w.roomById.get(task.roomId);
      if (!room) {
        s.task = { kind: 'none' };
        return;
      }
      if (justArrived && task.until === 0) {
        task.until = w.tick + w.minutesToTicks(12);
        s.state = 'WORKING';
      }
      if (task.until > 0 && w.tick >= task.until) {
        room.cleanliness = 100;
        s.task = { kind: 'none' };
        s.state = 'IDLE';
        clearDestination(s);
        w.matchDirty = true;
      }
      return;
    }
    case 'research':
      if (justArrived) s.state = 'WORKING';
      if (s.energy < breakThreshold(w, s)) {
        s.task = { kind: 'none' };
        s.breakRequested = true;
      }
      return;
    case 'toRoom':
      if (justArrived || !isMoving(s)) {
        s.task = { kind: 'none' };
        s.state = s.roomId ? 'IDLE' : 'UNASSIGNED';
      }
      return;
    case 'none':
      break;
  }
  if (s.overtime) {
    // Overtime staff only cover beds; they do not pick new tasks.
    s.state = bedRoomBusy(w, s) ? 'WORKING' : 'IDLE';
    return;
  }
  // Break?
  if (s.energy < breakThreshold(w, s) || s.breakRequested) {
    if (!wouldUncoverBeds(w, s)) {
      s.breakRequested = true;
      const spot = freeRestStation(w);
      if (spot) {
        const st = spot.room.layout.stations[spot.station]!;
        if (setDestination(w, s, st.staffTiles[0]!, [spot.room.id])) {
          s.task = { kind: 'rest', roomId: spot.room.id, station: spot.station };
          s.state = 'MOVING';
          s.stateSince = w.tick;
          return;
        }
      }
      s.task = { kind: 'rest', roomId: s.roomId, station: -1 };
      s.state = 'RESTING';
      s.stateSince = w.tick;
      return;
    }
  }
  const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
  if (room && room.type === 'R12' && s.role === 'S08' && room.open) {
    const job = pickCleaningJob(w, s);
    if (job && setDestination(w, s, doorInside(job), [job.id])) {
      s.task = { kind: 'clean', roomId: job.id, until: 0 };
      s.state = 'MOVING';
      return;
    }
  }
  if (room && room.type === 'R16' && room.open && !room.closing) {
    const idxInRoom = staffOfRoom(w, room.id).filter((o) => onDuty(w, o)).findIndex((o) => o.id === s.id);
    const st = room.layout.stations[idxInRoom];
    if (st && setDestination(w, s, st.staffTiles[0]!, [room.id])) {
      s.task = { kind: 'research', station: st.id };
      s.state = s.pos === st.staffTiles[0] ? 'WORKING' : 'MOVING';
      return;
    }
  }
  if (room && DEF.room[room.type].stationKind === 'bed') {
    const busy = bedRoomBusy(w, s);
    s.state = busy ? 'WORKING' : 'IDLE';
    // Rounds: visit occupied beds now and then.
    if (busy && !isMoving(s) && (w.tick + s.id * 13) % 50 === 0) {
      const beds = activeBookingsForRoom(w, room.id);
      const b = beds[(Math.floor(w.tick / 50) + s.id) % beds.length]!;
      const tile = room.layout.stations[b.station]!.staffTiles[0]!;
      setDestination(w, s, tile, [room.id]);
    }
    if (!busy && !isMoving(s)) goIdle(w, s);
    return;
  }
  if (!isMoving(s)) goIdle(w, s);
}

function bedRoomBusy(w: World, s: StaffState): boolean {
  const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
  if (!room || DEF.room[room.type].stationKind !== 'bed') return false;
  return activeBookingsForRoom(w, room.id).some((r) => r.status === 'ACTIVE');
}

function goIdle(w: World, s: StaffState): void {
  const t = idleTileFor(w, s);
  if (s.pos === t.tile) {
    s.state = s.roomId ? 'IDLE' : 'UNASSIGNED';
    return;
  }
  // Only walk when not already in the right room (avoid jitter).
  const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
  if (room && w.grid.room[s.pos] === room.id) {
    s.state = 'IDLE';
    return;
  }
  if (setDestination(w, s, t.tile, t.allow)) {
    s.task = { kind: 'toRoom' };
    s.state = 'MOVING';
  } else s.state = s.roomId ? 'BLOCKED' : 'UNASSIGNED';
}

/** Hourly room upkeep: passive cleaning up to 60, waiting room wear. */
export function roomUpkeep(w: World): void {
  if (w.tick % 100 !== 0) return;
  for (const r of w.state.rooms) {
    if (r.cleanliness < 60) r.cleanliness = Math.min(60, r.cleanliness + 2);
    if (r.type === 'R02') {
      const seated = w.state.patients.filter((p) => p.seat?.roomId === r.id).length;
      r.cleanliness = Math.max(0, r.cleanliness - seated * 0.3 * eventMod(w, 'dirtRate'));
    }
  }
  bedCoverageGuard(w);
}

/** Bed coverage sanity: if coverage collapsed (e.g. emergency absence), keep beds but log. */
function bedCoverageGuard(w: World): void {
  for (const r of w.state.rooms) {
    if (DEF.room[r.type].stationKind !== 'bed') continue;
    void bedCoverage(w, r);
  }
}
