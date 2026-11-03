import { DEF } from '../data/definition';
import type { RoomTypeId, StepKind } from '../data/types';
import type { PatientState, Reservation, RoomState, StaffState } from '../core/state';
import type { World } from '../core/world';
import { post } from './economy';
import { findPath } from './navigation';
import { clearDestination, setDestination } from './movement';
import { addGRP, addRP, observeDisease } from './research';
import { computeTreatment, eventMod, formTeams, onDuty, roomStatus, staffOfRoom } from './rules';

/** Matching order of departments when priorities are equal (urgent care first). */
export const STEP_ORDER: StepKind[] = ['E', 'OP', 'IVA', 'V', 'X', 'L', 'P', 'O', 'U', 'B', 'A', 'EX', 'RB', 'REG'];

export function roomTypeForStep(step: StepKind): RoomTypeId {
  return DEF.step[step].roomType;
}

// ---------------------------------------------------------------- queues

export function enqueue(w: World, p: PatientState, step: StepKind): void {
  if (p.queueStep) dequeue(w, p);
  w.state.queues.push({ patientId: p.id, step, enqueuedTick: w.tick });
  p.queueStep = step;
  p.calledTo = 0;
  p.enqueuedTick = w.tick;
  p.waitEpisodeStart = w.tick;
  w.matchDirty = true;
}

export function dequeue(w: World, p: PatientState): void {
  if (!p.queueStep) return;
  const q = w.state.queues;
  const i = q.findIndex((e) => e.patientId === p.id);
  if (i >= 0) q.splice(i, 1);
  // Record the finished wait episode for metrics (qualifying minutes are accumulated per tick).
  p.queueStep = null;
}

export function queueLength(w: World, step: StepKind): number {
  let n = 0;
  for (const e of w.state.queues) if (e.step === step) n++;
  return n;
}

// ---------------------------------------------------------------- seats (waiting room occupancy)

export function seatUsable(room: RoomState): number {
  return Math.min(room.layout.stations.length, DEF.econ.supportUpgrades.waitingSeats[room.level - 1]!);
}

export function occupiedSeats(w: World): Set<string> {
  const s = new Set<string>();
  for (const p of w.state.patients) if (p.seat) s.add(`${p.seat.roomId}:${p.seat.station}`);
  return s;
}

export function releaseSeat(p: PatientState): void {
  p.seat = null;
}

// ---------------------------------------------------------------- reservation helpers

export function stationTaken(w: World, roomId: number, station: number): boolean {
  return w.state.reservations.some((r) => r.roomId === roomId && r.station === station);
}

function isBedRoom(type: RoomTypeId): boolean {
  return DEF.room[type].stationKind === 'bed';
}

/** Bed capacity limited by on-duty care teams (stations per team). */
export function bedCoverage(w: World, room: RoomState): number {
  const duty = staffOfRoom(w, room.id).filter((s) => onDuty(w, s) && s.state !== 'RESTING');
  const teams = formTeams(room.type, duty).length;
  return Math.min(room.layout.stations.length, teams * DEF.room[room.type].stationsPerTeam);
}

function staffAvailable(w: World, s: StaffState): boolean {
  if (!onDuty(w, s) || s.overtime || s.breakRequested) return false;
  if (s.energy < DEF.sim.minEnergyToStart) return false;
  if (s.task.kind === 'work' || s.task.kind === 'rest' || s.task.kind === 'clean' || s.task.kind === 'leave') return false;
  return s.state === 'IDLE' || (s.state === 'MOVING' && s.task.kind === 'toRoom');
}

function retryBlocked(p: PatientState, roomId: number, tick: number): boolean {
  return p.retry.some((r) => r.roomId === roomId && r.until > tick);
}

function estimateMinutes(step: StepKind): number {
  return DEF.step[step].baseMinutes;
}

function walkGuess(w: World, p: PatientState, step: StepKind): number {
  const type = roomTypeForStep(step);
  const room = w.state.rooms.find((r) => r.type === type);
  if (!room) return 0;
  const px = p.pos % 64;
  const py = Math.floor(p.pos / 64);
  return (Math.abs(px - room.door.x) + Math.abs(py - room.door.y)) * DEF.nav.patientMinutesPerTile[p.walk];
}

export function sortQueue(w: World, entries: { p: PatientState; enq: number }[], step: StepKind): void {
  const policy = w.state.policy.queue;
  const now = w.tick;
  entries.sort((a, b) => {
    if (a.p.triage !== b.p.triage) return b.p.triage - a.p.triage;
    if (policy === 1) return a.enq - b.enq || a.p.id - b.p.id;
    if (policy === 2) {
      // Total time in hospital, with extra weight for long current waits.
      const ka = a.p.arrivedTick - (now - a.enq) * 0.5;
      const kb = b.p.arrivedTick - (now - b.enq) * 0.5;
      return ka - kb || a.p.id - b.p.id;
    }
    // Shortest eligible treatment (incl. walking distance) first, aged by waiting time (starvation protection).
    const ea = estimateMinutes(step) * (a.p.walk === 'slow' ? 1.1 : 1) + walkGuess(w, a.p, step) - ((now - a.enq) * DEF.sim.minutesPerTick) * 0.5;
    const eb = estimateMinutes(step) * (b.p.walk === 'slow' ? 1.1 : 1) + walkGuess(w, b.p, step) - ((now - b.enq) * DEF.sim.minutesPerTick) * 0.5;
    return ea - eb || a.enq - b.enq || a.p.id - b.p.id;
  });
}

function priorityRank(w: World, step: StepKind): number {
  const pr = w.state.policy.departmentPriority[roomTypeForStep(step)] ?? 'normal';
  return pr === 'high' ? 0 : pr === 'normal' ? 1 : 2;
}

// ---------------------------------------------------------------- matching

/** Match queued patients with free stations and available staff teams. All bookings go through here. */
export function matchPatients(w: World): number {
  if (!w.matchDirty && w.tick % 10 !== 0) return 0;
  w.matchDirty = false;
  let created = 0;
  const byStep = new Map<StepKind, { p: PatientState; enq: number }[]>();
  for (const e of w.state.queues) {
    const p = w.patientById.get(e.patientId);
    if (!p || p.reservationId) continue;
    if (p.state !== 'WAITING' && p.state !== 'WAITING_FOR_OPENING' && p.state !== 'ARRIVING') continue;
    let arr = byStep.get(e.step);
    if (!arr) byStep.set(e.step, (arr = []));
    arr.push({ p, enq: e.enqueuedTick });
  }
  if (byStep.size === 0) return 0;
  const steps = [...byStep.keys()].sort((a, b) => priorityRank(w, a) - priorityRank(w, b) || STEP_ORDER.indexOf(a) - STEP_ORDER.indexOf(b));
  for (const step of steps) {
    const entries = byStep.get(step)!;
    const sd = DEF.step[step];
    const type = sd.roomType;
    const eligible = entries.filter(({ p }) => {
      if (!sd.requiresSample) return true;
      return w.caseById.get(p.caseId)?.sampleReady === true;
    });
    if (eligible.length === 0) continue;
    sortQueue(w, eligible, step);
    const rooms = w.state.rooms.filter((r) => r.type === type);
    for (const room of rooms) {
      if (eligible.length === 0) break;
      const st = roomStatus(w, room);
      if (!st.operational) continue;
      if (isBedRoom(type)) {
        let free = bedCoverage(w, room) - w.state.reservations.filter((r) => r.roomId === room.id).length;
        for (const station of room.layout.stations) {
          if (free <= 0 || eligible.length === 0) break;
          if (stationTaken(w, room.id, station.id)) continue;
          const pi = pickPatient(w, eligible, room, station.patientTile);
          if (pi < 0) break;
          const { p } = eligible.splice(pi, 1)[0]!;
          createReservation(w, p, room, station.id, [], step);
          free--;
          created++;
        }
        continue;
      }
      const avail = staffOfRoom(w, room.id).filter((s) => staffAvailable(w, s));
      if (avail.length === 0) continue;
      const teams = formTeams(type, avail);
      let ti = 0;
      for (const station of room.layout.stations) {
        if (ti >= teams.length || eligible.length === 0) break;
        if (stationTaken(w, room.id, station.id)) continue;
        const team = teams[ti]!;
        // Staff must be able to reach their working positions.
        const staffOk = team.every((s, k) => {
          const tile = station.staffTiles[k] ?? station.staffTiles[0]!;
          return s.pos === tile || findPath(w, s.pos, tile, [room.id]) !== null;
        });
        if (!staffOk) {
          ti++;
          continue;
        }
        const target = sd.patientPresent ? station.patientTile : -1;
        const pi = pickPatient(w, eligible, room, target);
        if (pi < 0) break;
        const { p } = eligible.splice(pi, 1)[0]!;
        createReservation(w, p, room, station.id, team, step);
        ti++;
        created++;
      }
    }
  }
  return created;
}

function pickPatient(w: World, eligible: { p: PatientState }[], room: RoomState, target: number): number {
  // Among the next-in-line patients of the same (highest) triage class, prefer the one already called to this door.
  const head = eligible[0]?.p.triage;
  const window = Math.min(eligible.length, 1 + w.state.rooms.filter((r) => r.type === room.type).reduce((s, r) => s + r.layout.stations.length, 0));
  for (let i = 0; i < window; i++) {
    const p = eligible[i]!.p;
    if (p.triage !== head) break;
    if (p.calledTo === room.id && !retryBlocked(p, room.id, w.tick) && (target < 0 || p.pos === target || findPath(w, p.pos, target, [room.id]) !== null)) return i;
  }
  for (let i = 0; i < eligible.length; i++) {
    const p = eligible[i]!.p;
    if (retryBlocked(p, room.id, w.tick)) continue;
    if (target >= 0 && p.pos !== target && findPath(w, p.pos, target, [room.id]) === null) {
      p.retry.push({ roomId: room.id, until: w.tick + w.minutesToTicks(DEF.sim.roomRetryMinutes) });
      continue;
    }
    return i;
  }
  return -1;
}

export function createReservation(w: World, p: PatientState, room: RoomState, station: number, team: StaffState[], step: StepKind): Reservation {
  const st = room.layout.stations[station]!;
  const sd = DEF.step[step];
  const c = w.caseById.get(p.caseId)!;
  const res: Reservation = {
    id: w.nextId('res'),
    patientId: p.id,
    caseId: c.id,
    roomId: room.id,
    station,
    staffIds: team.map((s) => s.id),
    step,
    stepIndex: step === 'REG' ? -1 : c.stepIndex,
    createdTick: w.tick,
    expiryTick: w.tick + w.minutesToTicks(DEF.sim.reservationTimeoutMinutes),
    status: 'RESERVED',
    startTick: 0,
    endTick: 0,
    quality: 0,
    patientArrived: !sd.patientPresent,
    staffArrived: team.map(() => false),
  };
  w.addReservation(res);
  dequeue(w, p);
  p.reservationId = res.id;
  room.undoable = false;
  if (sd.patientPresent) {
    releaseSeat(p);
    p.standTile = -1;
    p.state = 'MOVING';
    p.stateSince = w.tick;
    setDestination(w, p, st.patientTile, [room.id]);
    if (p.pos === st.patientTile) res.patientArrived = true;
  }
  team.forEach((s, k) => {
    s.task = { kind: 'work', reservationId: res.id };
    s.state = 'MOVING';
    s.stateSince = w.tick;
    const tile = st.staffTiles[k] ?? st.staffTiles[0]!;
    setDestination(w, s, tile, [room.id]);
    if (s.pos === tile) res.staffArrived[k] = true;
  });
  res.status = 'MOVING';
  w.emit('RESERVATION_CREATED', { reservationId: res.id, patientId: p.id, roomId: room.id, step }, `patient:${p.id}`);
  return res;
}

/** Releases every resource held by a reservation and removes it from active storage. */
export function releaseReservation(w: World, res: Reservation): void {
  const p = w.patientById.get(res.patientId);
  if (p && p.reservationId === res.id) p.reservationId = 0;
  for (const sid of res.staffIds) {
    const s = w.staffById.get(sid);
    if (s && s.task.kind === 'work' && s.task.reservationId === res.id) {
      s.task = { kind: 'none' };
      s.state = s.roomId ? 'IDLE' : 'UNASSIGNED';
      s.stateSince = w.tick;
      clearDestination(s);
    }
  }
  w.removeReservation(res.id);
  w.matchDirty = true;
}

/**
 * Cancels a booking. Patients are returned to the queue with retry protection for that room,
 * unless `refer` is set (evacuation), in which case the caller handles referral.
 */
export function cancelReservation(w: World, res: Reservation, reason: string, requeue: boolean, retry: boolean): void {
  const p = w.patientById.get(res.patientId);
  releaseReservation(w, res);
  if (!p) return;
  if (retry) p.retry.push({ roomId: res.roomId, until: w.tick + w.minutesToTicks(DEF.sim.roomRetryMinutes) });
  if (requeue) {
    enqueue(w, p, res.step);
    p.state = 'WAITING';
    p.stateSince = w.tick;
    clearDestination(p);
  }
  void reason;
}

// ---------------------------------------------------------------- per tick progress

/** Activates bookings whose participants have all arrived; expires unreachable bookings. */
export function updateReservations(w: World): void {
  for (const res of w.state.reservations.slice()) {
    if (res.status === 'ACTIVE') continue;
    const p = w.patientById.get(res.patientId);
    const room = w.roomById.get(res.roomId);
    if (!p || !room) {
      releaseReservation(w, res);
      continue;
    }
    const st = room.layout.stations[res.station]!;
    if (!res.patientArrived && p.pos === st.patientTile && p.pathIdx >= p.path.length) res.patientArrived = true;
    res.staffIds.forEach((sid, k) => {
      const s = w.staffById.get(sid);
      const tile = st.staffTiles[k] ?? st.staffTiles[0]!;
      if (s && s.pos === tile && s.pathIdx >= s.path.length) res.staffArrived[k] = true;
    });
    if (res.patientArrived && res.staffArrived.every(Boolean)) {
      activate(w, res, room, p);
      continue;
    }
    if (w.tick >= res.expiryTick) cancelReservation(w, res, 'timeout', true, true);
  }
}

function activate(w: World, res: Reservation, room: RoomState, p: PatientState): void {
  const c = w.caseById.get(res.caseId)!;
  const team = res.staffIds.map((id) => w.staffById.get(id)!).filter(Boolean);
  let calcTeam = team;
  if (calcTeam.length === 0 && isBedRoom(room.type)) calcTeam = staffOfRoom(w, room.id).filter((s) => onDuty(w, s));
  const { ticks, quality } = computeTreatment(w, room, res.step, calcTeam, res.step === 'REG' ? null : c, p.health);
  res.status = 'ACTIVE';
  res.startTick = w.tick;
  res.endTick = w.tick + ticks;
  res.quality = quality;
  if (DEF.step[res.step].patientPresent) {
    p.state = res.step === 'REG' ? 'REGISTERING' : 'IN_TREATMENT';
    p.stateSince = w.tick;
    const st = room.layout.stations[res.station]!;
    p.facing = st.facing;
  }
  for (const s of team) {
    s.state = 'WORKING';
    s.stateSince = w.tick;
  }
  // Materials are consumed (charged) when the step starts.
  if (res.stepIndex >= 0 && !c.materialCharged[res.stepIndex]) {
    c.materialCharged[res.stepIndex] = true;
    const amt = c.materialPlan[res.stepIndex] ?? 0;
    if (amt > 0) post(w, -amt, 'material', `Material: ${DEF.step[res.step].nameSv}`, `case:${c.id}`);
  }
}

/** Process scheduled completions (pipeline step 1). Returns patients needing routing. */
export function completeDue(w: World): PatientState[] {
  const out: PatientState[] = [];
  for (const res of w.state.reservations.slice()) {
    if (res.status !== 'ACTIVE' || w.tick < res.endTick) continue;
    const p = w.patientById.get(res.patientId);
    const room = w.roomById.get(res.roomId);
    const c = w.caseById.get(res.caseId);
    const sd = DEF.step[res.step];
    const team = res.staffIds.map((id) => w.staffById.get(id)).filter((s): s is StaffState => !!s);
    if (room) {
      room.used = true;
      room.undoable = false;
      const wear = (c && DEF.disease[c.disease].effect === 'nausea' ? 3 : 1.2) * eventMod(w, 'dirtRate');
      room.cleanliness = Math.max(0, room.cleanliness - wear);
      const m = w.state.metrics.today;
      m.treatmentsByRoom[room.type] = (m.treatmentsByRoom[room.type] ?? 0) + 1;
    }
    if (c && res.step === 'REG') {
      c.registered = true;
    } else if (c) {
      c.qualitySum += res.quality;
      c.qualityCount++;
      if (sd.createsSample) c.sampleReady = true;
      if (sd.assessment) c.assessed = true;
      if (sd.diagnostic) {
        w.state.metrics.today.diagnosticExams++;
        w.state.metrics.totals.diagnosticExams++;
      }
      const idx = res.stepIndex;
      if (sd.assessment) observeDisease(w, c.disease);
      if (idx >= 0 && !c.rpAwarded[idx]) {
        c.rpAwarded[idx] = true;
        if (sd.rp > 0) addRP(w, c.disease, sd.rp, `step:${res.step}`);
        if (sd.analysis) addGRP(w, 2, 'analysis');
      }
      if (idx === c.stepIndex) c.stepIndex++;
    }
    for (const s of team) {
      for (const k of sd.qualitySkills) s.skills[k] = Math.min(100, (s.skills[k] ?? 0) + 0.06);
    }
    w.emit('TREATMENT_COMPLETED', { reservationId: res.id, patientId: res.patientId, caseId: res.caseId, roomId: res.roomId, roomType: room?.type ?? null, step: res.step, quality: Math.round(res.quality), staffRoles: team.map((t) => t.role), disease: c?.disease ?? null }, `patient:${res.patientId}`);
    releaseReservation(w, res);
    if (p) {
      p.state = 'NEXT_STEP';
      p.stateSince = w.tick;
      out.push(p);
    }
  }
  return out;
}

export function activeBookingsForRoom(w: World, roomId: number): Reservation[] {
  return w.state.reservations.filter((r) => r.roomId === roomId);
}
