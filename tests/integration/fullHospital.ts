import { DEF, DISEASE_IDS } from '../../src/data/definition';
import type { DiseaseId, RoomTypeId } from '../../src/data/types';
import type { DomainEvent, RoomState } from '../../src/core/state';
import type { GameEngine } from '../../src/core/engine';
import { spawnPatient } from '../../src/systems/patients';
import { build, cmd, identify, sandbox, staffRoom } from '../helpers';

export interface FullRun {
  eng: GameEngine;
  rooms: Partial<Record<RoomTypeId, RoomState[]>>;
  events: DomainEvent[];
  spawned: { disease: DiseaseId; patientId: number; caseId: number; path: string[]; severe: boolean; triage: number }[];
  txByCase: Map<number, { category: string; amount: number }[]>;
  rpBefore: Partial<Record<DiseaseId, number>>;
}

let cached: FullRun | null = null;

/** A complete chapter-5 hospital with every room type, staffed day and night, running a scripted disease mix. */
export function fullHospitalRun(): FullRun {
  if (cached) return cached;
  const eng = sandbox(31, 5);
  const w = eng.world;
  w.state.metrics.arrivalPlan = [];
  const order: RoomTypeId[] = ['R09', 'R03', 'R03', 'R04', 'R07', 'R05', 'R11', 'R08', 'R10', 'R13', 'R14', 'R15', 'R17', 'R17', 'R17', 'R18', 'R18', 'R06', 'R12', 'R16', 'R02', 'R02'];
  const rooms: Partial<Record<RoomTypeId, RoomState[]>> = {};
  for (const r of w.state.rooms) (rooms[r.type] ??= []).push(r);
  for (const t of order) {
    const room = build(eng, t);
    (rooms[t] ??= []).push(room);
  }
  for (const r of w.state.rooms) {
    const def = DEF.room[r.type];
    if (def.team.length === 0) continue;
    if (!w.state.staff.some((s) => s.roomId === r.id && s.shift === 'day')) staffRoom(eng, r, 'day');
    if (def.hours === 'allDay' && r.type !== 'R12') staffRoom(eng, r, 'night');
  }
  for (const d of DISEASE_IDS) identify(eng, d);
  const events: DomainEvent[] = [];
  eng.subscribe((e) => events.push(e));
  const rpBefore = { ...w.state.research.rp };
  // Exercise support rooms: some rooms start dirty, some staff start tired.
  for (const r of w.state.rooms.filter((x) => x.type === 'R03' || x.type === 'R05').slice(0, 3)) r.cleanliness = 50;
  for (const s of w.state.staff.filter((x) => x.shift === 'day').slice(0, 4)) s.energy = 30;
  const spawned: FullRun['spawned'] = [];
  // Two patients per disease, spread over two day shifts.
  const plan: DiseaseId[] = [...DISEASE_IDS, ...DISEASE_IDS];
  const tpd = DEF.sim.ticksPerDay;
  const startDay = w.day + 1;
  let i = 0;
  // Run to the next morning first.
  eng.runTicks(((startDay * tpd + 820) - w.tick));
  for (const day of [0, 1, 2, 3]) {
    for (let k = 0; k < 12; k++) {
      const d = plan[i++]!;
      // The second D07/D08 patient takes the explicitly defined severe (ICU) branch.
      const p = spawnPatient(w, false, d, day >= 2 && (d === 'D07' || d === 'D08'));
      if (!p) throw new Error(`could not spawn ${d}`);
      const c = w.caseById.get(p.caseId)!;
      spawned.push({ disease: d, patientId: p.id, caseId: c.id, path: c.path.slice(), severe: c.severe, triage: p.triage });
      eng.runTicks(35);
    }
    void day;
    eng.runTicks(((startDay + day + 1) * tpd + 820) - w.tick);
  }
  // Let everyone finish (up to 3 more days).
  for (let t = 0; t < 3 * tpd && spawned.some((s) => w.patientById.has(s.patientId)); t++) eng.step();
  const txByCase = new Map<number, { category: string; amount: number }[]>();
  for (const e of events) {
    if (e.type !== 'ECONOMY_TRANSACTION') continue;
    const ref = e.aggregateId ?? '';
    if (!ref.startsWith('case:')) continue;
    const id = Number(ref.slice(5));
    (txByCase.get(id) ?? txByCase.set(id, []).get(id)!).push({ category: e.payload.category as string, amount: e.payload.amount as number });
  }
  void cmd;
  cached = { eng, rooms, events, spawned, txByCase, rpBefore };
  return cached;
}
