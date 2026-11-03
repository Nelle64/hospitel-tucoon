import { DEF } from '../data/definition';
import { FIRST_NAMES, LAST_NAMES } from '../data/staff';
import type { DiseaseId, StepKind } from '../data/types';
import { KIND_CORRIDOR, MAP_W } from '../core/grid';
import { hash32 } from '../core/rng';
import type { CaseOutcome, CaseState, PatientState, RoomState } from '../core/state';
import type { World } from '../core/world';
import { post } from './economy';
import { arrived, clearDestination, isMoving, setDestination, stepMover } from './movement';
import { addGRP, addRP, observeDisease } from './research';
import { cancelReservation, dequeue, enqueue, occupiedSeats, releaseSeat, roomTypeForStep, seatUsable, sortQueue } from './resources';
import { chooseDisease } from './demand';
import { clamp, isScheduledOpen, qualityFactor, researchRevenueFactor, roomAccessible, roomInService, roomStatus, successProbability } from './rules';

export function splitMaterial(total: number, path: StepKind[]): number[] {
  const weights = path.map((s) => DEF.step[s].materialWeight);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return path.map((_, i) => (i === path.length - 1 ? total : 0));
  const out = weights.map((wt) => Math.floor((total * wt) / sum));
  const rem = total - out.reduce((a, b) => a + b, 0);
  // Remainder goes to the last consuming step.
  for (let i = out.length - 1; i >= 0; i--) if (weights[i]! > 0) {
    out[i]! += rem;
    break;
  }
  return out;
}

function roomTypesBuilt(w: World): Set<string> {
  return new Set(w.state.rooms.filter((r) => !r.closing).map((r) => r.type));
}

/** Freezes the treatment path for a new case (pharmacy branch, severe branch, emergency route, observation workflow). */
export function selectPath(w: World, disease: DiseaseId, emergency: boolean, forceSevere = false): { path: StepKind[]; observation: boolean; severe: boolean; revenueMult: number; materialMult: number; triage: number } {
  const d = DEF.disease[disease];
  const built = roomTypesBuilt(w);
  const erOk = built.has('R09');
  let path = d.path.slice();
  let severe = false;
  let revenueMult = 1;
  let materialMult = 1;
  let triage = d.triage;
  if (d.pharmacyPath && w.state.rooms.some((r) => r.type === 'R11' && roomInService(w, r))) path = d.pharmacyPath.slice();
  if (d.severeVariant && w.state.rooms.some((r) => r.type === 'R15' && roomInService(w, r)) && (w.rng.chance(d.severeVariant.chance) || forceSevere)) {
    path = d.severeVariant.path.slice();
    severe = true;
    revenueMult = d.severeVariant.revenueMult;
    materialMult = d.severeVariant.materialMult;
    triage = d.severeVariant.triage;
  }
  if (path[0] === 'E' && !erOk) path[0] = 'U';
  if (emergency && erOk && path[0] === 'U') path[0] = 'E';
  const identified = w.state.research.identified.includes(disease);
  if (!identified) {
    const first = path[0]!;
    const diag = path.slice(1).filter((s) => DEF.step[s].diagnostic && built.has(DEF.step[s].roomType));
    // A lab analysis needs a sample from blood sampling first.
    const obs: StepKind[] = [first];
    for (const s of diag) {
      if (DEF.step[s].requiresSample && !obs.some((o) => DEF.step[o].createsSample)) continue;
      obs.push(s);
    }
    return { path: obs, observation: true, severe: false, revenueMult: 1, materialMult: 0.5, triage: Math.min(triage, 4) };
  }
  return { path, observation: false, severe, revenueMult, materialMult, triage };
}

export function spawnPatient(w: World, night: boolean, forcedDisease?: DiseaseId, forceSevere = false): PatientState | null {
  const disease = forcedDisease ?? chooseDisease(w, night);
  if (!disease) return null;
  const d = DEF.disease[disease];
  const erBuilt = w.state.rooms.some((r) => r.type === 'R09' && !r.closing);
  if (night && !erBuilt) return null;
  const emergency = night || (erBuilt && (d.path[0] === 'E' || (d.triage >= 3 && w.rng.chance(DEF.sim.dayAmbulanceShare))));
  const sel = selectPath(w, disease, emergency, forceSevere);
  const pid = w.nextId('patient');
  const cid = w.nextId('case');
  const variation = w.rng.range(-0.05, 0.05);
  const material = Math.round(d.material * sel.materialMult);
  const c: CaseState = {
    id: cid, patientId: pid, disease, observation: sel.observation, severe: sel.severe, path: sel.path, stepIndex: 0,
    materialPlan: splitMaterial(material, sel.path), materialCharged: sel.path.map(() => false), rpAwarded: sel.path.map(() => false),
    revenueBase: Math.round(d.revenue * sel.revenueMult), diseaseFactor: clamp(d.diseaseFactor + variation, 0.85, 1.2),
    sampleReady: false, assessed: false, registered: false, emergency: sel.path[0] === 'E', qualitySum: 0, qualityCount: 0, outcome: null,
    settled: false, settlementTx: 0, createdTick: w.tick, medicalCompletedTick: 0, closedTick: 0, referralReason: null,
  };
  const triage = clamp(sel.triage + (w.rng.chance(0.15) ? (w.rng.chance(0.5) ? 1 : -1) : 0), 1, 5);
  const name = `${w.rng.pick(FIRST_NAMES)} ${w.rng.pick(LAST_NAMES)}`;
  const p: PatientState = {
    id: pid, caseId: cid, name, visual: hash32('patient', w.state.campaign.seed, pid, w.rng.nextU32()), state: 'ARRIVING', stateSince: w.tick,
    health: w.rng.range(55, 90), patience: w.rng.range(70, 100), triage, walk: d.walk === 'normal' ? (w.rng.chance(0.15) ? 'fast' : 'normal') : d.walk,
    patienceMult: w.rng.range(0.8, 1.3), queueStep: null, enqueuedTick: w.tick, reservationId: 0, seat: null, standTile: -1,
    arrivedTick: w.tick, emergency: c.emergency, escalated: false, calledTo: 0, waitMinutes: 0, overnightMinutes: 0, walkMinutes: 0, retry: [], waitEpisodeStart: w.tick, satisfaction: 0,
    pos: w.state.map.entrance, path: [], pathIdx: 0, progress: 0, dest: -1, allowRooms: [], lastProgressTick: w.tick, facing: 'up', navVersion: w.state.map.version,
  };
  w.addCase(c);
  w.addPatient(p);
  w.state.metrics.today.arrivals++;
  w.state.metrics.totals.arrivals++;
  w.state.research.lastSeenDay[disease] = w.day;
  w.emit('PATIENT_ARRIVED', { patientId: pid, disease, emergency: c.emergency, observation: c.observation }, `patient:${pid}`);
  routeNext(w, p);
  if (p.state === 'NEXT_STEP') p.state = 'ARRIVING';
  return p;
}

/** Corridor spot near a room's door for standing patients. */
function standSpot(w: World, nearRoom: RoomState | undefined, p: PatientState): number {
  const start = nearRoom ? doorOutside(nearRoom) : w.state.map.entrance;
  const used = new Set<number>();
  for (const o of w.state.patients) if (o.standTile >= 0 && o.id !== p.id) used.add(o.standTile);
  const seen = new Set<number>([start]);
  const q = [start];
  const cands: number[] = [];
  let head = 0;
  while (head < q.length && cands.length < 24) {
    const i = q[head++]!;
    if (w.grid.kind[i] === KIND_CORRIDOR && i !== w.state.map.entrance) cands.push(i);
    for (const n of [i - MAP_W, i + 1, i + MAP_W, i - 1]) {
      if (n < 0 || n >= MAP_W * MAP_W || seen.has(n)) continue;
      if (w.grid.kind[n] !== KIND_CORRIDOR) continue;
      seen.add(n);
      q.push(n);
    }
  }
  const free = cands.find((c) => !used.has(c));
  if (free !== undefined) return free;
  return cands.length ? cands[p.id % cands.length]! : start;
}

export function doorOutside(r: RoomState): number {
  const d = r.door;
  const dx = d.dir === 'E' ? 1 : d.dir === 'W' ? -1 : 0;
  const dy = d.dir === 'S' ? 1 : d.dir === 'N' ? -1 : 0;
  return (d.y + dy) * MAP_W + d.x + dx;
}

/** Send a queued patient to a free waiting-room seat close to the target department, or to a corridor spot. */
export function goWait(w: World, p: PatientState, step: StepKind): void {
  const type = roomTypeForStep(step);
  const target = w.state.rooms.find((r) => r.type === type && !r.closing);
  if (p.seat) {
    const sr = w.roomById.get(p.seat.roomId);
    if (sr && !sr.closing) return;
    releaseSeat(p);
  }
  if (step === 'REG' && target) {
    // Registration: queue in line right outside the reception desk.
    p.standTile = standSpot(w, target, p);
    if (!setDestination(w, p, p.standTile, [])) {
      p.standTile = p.pos;
      clearDestination(p);
    }
    return;
  }
  const occ = occupiedSeats(w);
  const tx = target ? target.x : w.state.map.entrance % MAP_W;
  const ty = target ? target.y : Math.floor(w.state.map.entrance / MAP_W);
  const waits = w.state.rooms
    .filter((r) => r.type === 'R02' && r.open && !r.closing && roomAccessible(w, r))
    .sort((a, b) => Math.abs(a.x - tx) + Math.abs(a.y - ty) - (Math.abs(b.x - tx) + Math.abs(b.y - ty)) || a.id - b.id);
  for (const wr of waits) {
    const usable = seatUsable(wr);
    for (let s = 0; s < usable; s++) {
      if (occ.has(`${wr.id}:${s}`)) continue;
      const tile = wr.layout.stations[s]!.patientTile;
      if (setDestination(w, p, tile, [wr.id])) {
        p.seat = { roomId: wr.id, station: s };
        p.standTile = -1;
        return;
      }
    }
  }
  p.standTile = standSpot(w, target, p);
  if (!setDestination(w, p, p.standTile, [])) {
    p.standTile = p.pos;
    clearDestination(p);
  }
}

/** NEXT_STEP: decide what happens after a completed step (or on arrival). */
export function routeNext(w: World, p: PatientState): void {
  const c = w.caseById.get(p.caseId);
  if (!c) return;
  if (c.outcome) return startExit(w, p);
  if (!c.registered && !c.emergency) {
    const hasReception = w.state.rooms.some((r) => r.type === 'R01' && !r.closing);
    if (hasReception) {
      enqueue(w, p, 'REG');
      setWaitingState(w, p, 'REG');
      goWait(w, p, 'REG');
      return;
    }
    c.registered = true;
  }
  if (c.stepIndex >= c.path.length) return medicalCompletion(w, p, c);
  const step = c.path[c.stepIndex]!;
  const type = roomTypeForStep(step);
  const rooms = w.state.rooms.filter((r) => r.type === type && !r.closing);
  if (rooms.length === 0) {
    return refer(w, p, c, `Saknar ${DEF.room[type].nameSv.toLowerCase()}`);
  }
  enqueue(w, p, step);
  setWaitingState(w, p, step);
  if (DEF.step[step].patientPresent || !p.seat) goWait(w, p, step);
}

function setWaitingState(w: World, p: PatientState, step: StepKind): void {
  const type = roomTypeForStep(step);
  const anyOperational = w.state.rooms.some((r) => r.type === type && roomStatus(w, r).operational);
  const next = anyOperational ? 'WAITING' : 'WAITING_FOR_OPENING';
  if (p.state !== 'ARRIVING' || next === 'WAITING_FOR_OPENING') {
    p.state = p.state === 'ARRIVING' && next === 'WAITING' ? 'ARRIVING' : next;
    p.stateSince = w.tick;
  }
}

function avgQuality(c: CaseState): number {
  return c.qualityCount > 0 ? c.qualitySum / c.qualityCount : 50;
}

/** All steps done: roll the outcome, settle revenue once, then the patient walks out. */
function medicalCompletion(w: World, p: PatientState, c: CaseState): void {
  if (c.observation) {
    addRP(w, c.disease, 8, 'observationReferral');
    return refer(w, p, c, 'Observation klar – remitteras vidare');
  }
  const q = avgQuality(c);
  const success = w.rng.chance(successProbability(q));
  closeCase(w, p, c, success ? 'SUCCESS' : 'FAILED_TREATMENT');
}

export function refer(w: World, p: PatientState, c: CaseState, reasonSv: string): void {
  c.referralReason = reasonSv;
  closeCase(w, p, c, 'REFERRED');
}

function satisfactionFor(w: World, p: PatientState, c: CaseState, outcome: CaseOutcome): number {
  const q = avgQuality(c);
  let base: number;
  switch (outcome) {
    case 'SUCCESS': base = 85 + (q - 60) * 0.5; break;
    case 'FAILED_TREATMENT': base = 45; break;
    case 'REFERRED': base = c.observation ? 62 : 45; break;
    case 'ABANDONED': base = 8; break;
    case 'CRITICAL': base = 0; break;
  }
  const waitPenalty = Math.min(30, Math.max(0, p.waitMinutes - 25) / 6);
  const nightPenalty = Math.min(15, p.overnightMinutes / 60);
  return clamp(base - waitPenalty - nightPenalty, 0, 100);
}

/** Records exactly one terminal medical outcome and settles revenue exactly once. */
export function closeCase(w: World, p: PatientState, c: CaseState, outcome: CaseOutcome): void {
  if (c.outcome) return;
  c.outcome = outcome;
  c.medicalCompletedTick = w.tick;
  dequeue(w, p);
  if (p.reservationId) {
    const res = w.resById.get(p.reservationId);
    if (res) cancelReservation(w, res, 'closed', false, false);
  }
  const m = w.state.metrics.today;
  const t = w.state.metrics.totals;
  const d = DEF.disease[c.disease];
  let amount = 0;
  let category: 'treatment' | 'failedCare' | 'referral' = 'treatment';
  let label = '';
  switch (outcome) {
    case 'SUCCESS':
      amount = Math.round(c.revenueBase * qualityFactor(avgQuality(c)) * researchRevenueFactor(w, c.disease));
      label = `Behandling: ${d.nameSv}`;
      m.completed++; m.success++; m.treatedOutcomes++; t.completed++; t.success++;
      if (c.path.some((s) => DEF.step[s].advanced)) {
        m.advancedTreatments++;
        t.advancedTreatments++;
      }
      if (c.path.some((s) => s === 'O' || s === 'OP' || s === 'IVA')) {
        m.orthoSurgIcu++;
        t.orthoSurgIcu++;
      }
      addRP(w, c.disease, 12, 'success');
      addGRP(w, c.path.some((s) => DEF.step[s].advanced) ? 3 : 1, 'success');
      break;
    case 'FAILED_TREATMENT':
      amount = Math.round(c.revenueBase * DEF.econ.failedCareRevenueRate);
      category = 'failedCare';
      label = `Misslyckad vård: ${d.nameSv}`;
      m.completed++; m.failedTreatment++; m.treatedOutcomes++; t.completed++; t.failedTreatment++;
      addRP(w, c.disease, 4, 'failed');
      break;
    case 'REFERRED':
      category = 'referral';
      amount = c.assessed ? Math.max(DEF.econ.referralMinRevenue, Math.round(c.revenueBase * DEF.econ.referralRevenueRate)) : 0;
      label = `Remiss: ${d.nameSv}`;
      m.referrals++; t.referrals++;
      break;
    case 'ABANDONED':
      m.abandoned++; t.abandoned++;
      if (c.assessed) {
        m.abandonedAfterAssessment++;
        m.treatedOutcomes++;
      }
      break;
    case 'CRITICAL':
      m.critical++; t.critical++;
      if (c.assessed) m.treatedOutcomes++;
      break;
  }
  if (!c.settled) {
    c.settled = true;
    const econ = w.state.economy;
    if (econ.settledCaseIds.includes(c.id)) throw new Error(`Duplicate settlement for case ${c.id}`);
    econ.settledCaseIds.push(c.id);
    econ.settlementCount++;
    if (amount > 0) {
      const tx = post(w, amount, category, label, `case:${c.id}`);
      c.settlementTx = tx ? tx.id : 0;
    }
  }
  const sat = satisfactionFor(w, p, c, outcome);
  p.satisfaction = sat;
  m.satisfactionSum += sat;
  m.satisfactionCount++;
  t.satisfactionSum += sat;
  t.satisfactionCount++;
  m.waitSum += p.waitMinutes;
  m.waitCount++;
  m.waitMax = Math.max(m.waitMax, p.waitMinutes);
  m.walkSum += p.walkMinutes;
  m.walkCount++;
  updateReputation(w, sat);
  if (outcome === 'REFERRED') w.emit('PATIENT_REFERRED', { patientId: p.id, caseId: c.id, reason: c.referralReason, amount }, `patient:${p.id}`);
  else if (outcome === 'ABANDONED' || outcome === 'CRITICAL') w.emit('PATIENT_LEFT', { patientId: p.id, caseId: c.id, outcome }, `patient:${p.id}`);
  else w.emit('PATIENT_DISCHARGED', { patientId: p.id, caseId: c.id, outcome, amount, disease: c.disease }, `patient:${p.id}`);
  startExit(w, p);
}

export function updateReputation(w: World, satisfaction: number): void {
  const m = w.state.metrics;
  const weight = 0.015 * (w.state.events.active.some((e) => e.template === 'E02' && !e.ended && e.choice) ? 2.5 : 1);
  m.reputation = clamp(m.reputation + (satisfaction - m.reputation) * weight, 0, 100);
}

function startExit(w: World, p: PatientState): void {
  dequeue(w, p);
  releaseSeat(p);
  p.standTile = -1;
  p.state = 'EXITING';
  p.stateSince = w.tick;
  if (!setDestination(w, p, w.state.map.entrance, [])) clearDestination(p);
}

const TERMINAL: Record<CaseOutcome, PatientState['state']> = {
  SUCCESS: 'COMPLETED',
  FAILED_TREATMENT: 'FAILED',
  REFERRED: 'REFERRED',
  ABANDONED: 'ABANDONED',
  CRITICAL: 'FAILED',
};

function finishExit(w: World, p: PatientState): void {
  const c = w.caseById.get(p.caseId);
  p.state = c?.outcome ? TERMINAL[c.outcome] : 'ABANDONED';
  if (c) {
    c.closedTick = w.tick;
    w.removeCase(c.id);
  }
  w.removePatient(p.id);
}

const QUEUED = new Set(['WAITING', 'WAITING_FOR_OPENING', 'ARRIVING']);

/** Clock-dependent patient conditions: health, patience, escalation, abandonment (pipeline step 3). */
export function updatePatientConditions(w: World): void {
  const dt = DEF.sim.minutesPerTick;
  for (const p of w.state.patients.slice()) {
    const c = w.caseById.get(p.caseId);
    if (!c || c.outcome) continue;
    const queued = QUEUED.has(p.state) && p.queueStep !== null;
    const waitingLab = p.state === 'WAITING' && p.reservationId !== 0;
    if (queued || waitingLab) {
      const decay = DEF.sim.triageDecay[p.triage]!;
      const step = p.queueStep ?? 'L';
      const scheduled = isScheduledOpen(w, roomTypeForStep(step));
      let patienceRate = decay.patience * p.patienceMult;
      if (p.standTile >= 0 && !p.seat) patienceRate *= DEF.sim.standingPatienceFactor;
      if (!scheduled) patienceRate *= DEF.sim.overnightPatienceFactor;
      if (waitingLab) patienceRate *= 0.5;
      p.patience -= patienceRate * dt;
      const healthRate = decay.health * (scheduled ? 1 : 0.5);
      p.health = Math.max(0, p.health - healthRate * dt);
      if (queued) {
        if (scheduled) p.waitMinutes += dt;
        else p.overnightMinutes += dt;
      }
      if (p.health <= 0) {
        closeCase(w, p, c, 'CRITICAL');
        continue;
      }
      if (!p.escalated && p.health <= DEF.sim.escalationHealth) {
        p.escalated = true;
        const prev = p.state;
        p.state = 'EMERGENCY_ESCALATION';
        p.triage = Math.min(5, p.triage + 2);
        w.emit('EMERGENCY_ESCALATED', { patientId: p.id, triage: p.triage }, `patient:${p.id}`);
        p.state = prev;
        w.matchDirty = true;
      }
      if (p.patience <= 0 && queued) {
        closeCase(w, p, c, 'ABANDONED');
        continue;
      }
      // Waiting for a department that has no assigned staff at all: controlled referral after an hour.
      if (p.state === 'WAITING_FOR_OPENING' && queued && w.tick - p.stateSince > w.minutesToTicks(60) && p.queueStep) {
        const type = roomTypeForStep(p.queueStep);
        const any = w.state.rooms.some((r) => r.type === type && !r.closing && (DEF.room[type].team.length === 0 || w.state.staff.some((s) => s.roomId === r.id)));
        if (!any) {
          refer(w, p, c, `${DEF.room[type].nameSv} saknar personal`);
          continue;
        }
      }
    } else if (p.state === 'MOVING') {
      p.health = Math.max(1, p.health - DEF.sim.triageDecay[p.triage]!.health * dt * 0.5);
    } else if (p.state === 'IN_TREATMENT') {
      p.health = Math.min(100, p.health + 0.02 * dt);
    }
    if (isMoving(p)) p.walkMinutes += dt;
  }
}

/** Movement + arrival handling for patients (pipeline step 7). */
export function movePatients(w: World): void {
  for (const p of w.state.patients.slice()) {
    const mpt = DEF.nav.patientMinutesPerTile[p.walk];
    const r = stepMover(w, p, mpt);
    if (r === 'blocked') return handleBlocked(w, p);
    if (p.state === 'EXITING') {
      if (p.pos === w.state.map.entrance && (r === 'arrived' || p.pathIdx >= p.path.length)) finishExit(w, p);
      else if (p.dest < 0 || (p.pathIdx >= p.path.length && p.pos !== w.state.map.entrance)) {
        if (!setDestination(w, p, w.state.map.entrance, [])) finishExit(w, p);
      } else if (w.tick - p.lastProgressTick > w.minutesToTicks(DEF.sim.noProgressMinutes)) finishExit(w, p);
      continue;
    }
    if (r === 'arrived' && arrived(p)) {
      if (p.state === 'ARRIVING' && p.queueStep) {
        p.state = w.state.rooms.some((rm) => rm.type === roomTypeForStep(p.queueStep!) && roomStatus(w, rm).operational) ? 'WAITING' : 'WAITING_FOR_OPENING';
        p.stateSince = w.tick;
      }
    }
    if (p.dest >= 0 && !arrived(p) && w.tick - p.lastProgressTick > w.minutesToTicks(DEF.sim.noProgressMinutes)) handleBlocked(w, p);
  }
}

/** Navigation recovery: validate destination, recompute, fall back to waiting state. */
function handleBlocked(w: World, p: PatientState): void {
  if (p.dest >= 0 && setDestination(w, p, p.dest, p.allowRooms)) return;
  if (p.reservationId) {
    const res = w.resById.get(p.reservationId);
    if (res) cancelReservation(w, res, 'unreachable', true, true);
  }
  if (p.state === 'EXITING') return finishExit(w, p);
  releaseSeat(p);
  p.standTile = p.pos;
  clearDestination(p);
}

/** Re-evaluate WAITING vs WAITING_FOR_OPENING for queued patients (hourly / on shift change). */
export function refreshWaitingStates(w: World): void {
  const status = new Map<string, boolean>();
  for (const p of w.state.patients) {
    if (!p.queueStep || (p.state !== 'WAITING' && p.state !== 'WAITING_FOR_OPENING')) continue;
    const type = roomTypeForStep(p.queueStep);
    let op = status.get(type);
    if (op === undefined) {
      op = w.state.rooms.some((r) => r.type === type && roomStatus(w, r).operational);
      status.set(type, op);
    }
    const next = op ? 'WAITING' : 'WAITING_FOR_OPENING';
    if (p.state !== next) {
      p.state = next;
      p.stateSince = w.tick;
    }
    // Seat lost (waiting room demolished/closed) -> find a new spot.
    if (p.seat && !w.roomById.get(p.seat.roomId)) {
      releaseSeat(p);
      goWait(w, p, p.queueStep);
    }
  }
}

/**
 * Call forward: the first patients in each department queue wait right outside the department door,
 * so that a freed station is not left idle while a patient walks across the hospital.
 * This only changes where a patient waits – it is not a reservation.
 */
export function callForward(w: World): void {
  if (w.tick % 10 !== 5) return;
  const byStep = new Map<StepKind, { p: PatientState; enq: number }[]>();
  for (const e of w.state.queues) {
    const p = w.patientById.get(e.patientId);
    if (!p || p.reservationId || (p.state !== 'WAITING' && p.state !== 'ARRIVING' && p.state !== 'WAITING_FOR_OPENING')) continue;
    if (e.step === 'REG' || !DEF.step[e.step].patientPresent) continue;
    let arr = byStep.get(e.step);
    if (!arr) byStep.set(e.step, (arr = []));
    arr.push({ p, enq: e.enqueuedTick });
  }
  for (const [step, entries] of byStep) {
    const type = roomTypeForStep(step);
    const rooms = w.state.rooms.filter((r) => r.type === type && !r.closing && r.open && w.state.staff.some((s) => s.roomId === r.id));
    if (rooms.length === 0) continue;
    sortQueue(w, entries, step);
    // Expected time until each station frees (0 = free now); patients line up at the soonest-free rooms.
    const slots: { room: RoomState; at: number }[] = [];
    for (const r of rooms) {
      for (const st of r.layout.stations) {
        const res = w.state.reservations.find((x) => x.roomId === r.id && x.station === st.id);
        const at = !res ? 0 : res.status === 'ACTIVE' ? res.endTick - w.tick : w.minutesToTicks(DEF.step[step].baseMinutes + 15);
        slots.push({ room: r, at });
      }
    }
    slots.sort((a, b) => a.at - b.at || a.room.id - b.room.id);
    const n = Math.min(entries.length, slots.length);
    for (let i = 0; i < n; i++) {
      const p = entries[i]!.p;
      const room = slots[i]!.room;
      if (p.calledTo === room.id) continue;
      const door = doorOutside(room);
      const dist = Math.abs((p.pos % MAP_W) - (door % MAP_W)) + Math.abs(Math.floor(p.pos / MAP_W) - Math.floor(door / MAP_W));
      p.calledTo = room.id;
      if (dist <= 4) continue;
      const spot = standSpot(w, room, p);
      if (setDestination(w, p, spot, [])) {
        releaseSeat(p);
        p.standTile = spot;
      }
    }
  }
}

/** Patients standing in corridors move to a seat when one frees up (hourly sweep). */
export function reseatStanding(w: World): void {
  for (const p of w.state.patients) {
    if (p.seat || !p.queueStep || p.reservationId || p.calledTo) continue;
    if (p.state !== 'WAITING' && p.state !== 'WAITING_FOR_OPENING') continue;
    if (isMoving(p)) continue;
    goWait(w, p, p.queueStep);
  }
}

export function forcePatientExit(w: World, p: PatientState, reasonSv: string): void {
  const c = w.caseById.get(p.caseId);
  if (c && !c.outcome) refer(w, p, c, reasonSv);
}

export { observeDisease };
