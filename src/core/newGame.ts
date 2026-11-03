import { DEF, GAME_DATA_VERSION } from '../data/definition';
import type { RoleId, RoomTypeId } from '../data/types';
import { idx, MAP_N } from './grid';
import { createRngState } from './rng';
import { SCHEMA_VERSION, type Dir, type GameState } from './state';
import { World } from './world';
import { newDayMetrics } from '../systems/metrics';
import { createRoomState, roomBuildCost } from '../systems/building';
import { generateLayout } from '../systems/layout';
import { generateCandidate, refreshCandidates, startShift } from '../systems/staff';
import { planArrivals } from '../systems/demand';
import { scheduleInitialEvents } from '../systems/events';

export const START_TICK = 800; // day 0, 08:00

export function emptyState(seed: number, name = 'Pixel Hospital'): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: GAME_DATA_VERSION,
    campaign: { id: `c-${seed.toString(16)}-${Date.now().toString(36)}`, seed, name },
    ids: {},
    rng: createRngState(seed),
    clock: { tick: START_TICK, speed: 1, paused: false },
    map: { corridors: [], entrance: idx(31, 63), version: 1, trafficLevel: new Array(MAP_N).fill(0), trafficCount: new Array(MAP_N).fill(0), trafficVersion: 0 },
    blueprint: { items: [] },
    rooms: [], patients: [], cases: [], staff: [], candidates: [], candidatesDay: 0, queues: [], reservations: [],
    economy: { cash: DEF.econ.startingCash, transactions: [], totals: {}, loans: [], crisis: 'none', crisisSince: 0, grantsPaid: [], wageAccum: 0, settledCaseIds: [], settlementCount: 0, reconstructions: 0 },
    research: { grp: 0, grpFrac: 0, rp: {}, identified: [], mastered: [], observed: [], projectsDone: [], active: null, focus: null, convertedToday: {}, lastSeenDay: {} },
    missions: { active: [], recent: [], cooldowns: {}, lastTemplate: null, completedCount: 0 },
    events: { active: [], recent: [], lastMajorTick: {}, nextMinorTick: 0, nextMajorTick: 0 },
    progress: { chapter: 1, chapterCompletedTick: [], inspection: null, victory: null, continuedAfterVictory: false, landStage: 0 },
    metrics: {
      today: newDayMetrics(0, 1), days: [],
      totals: { arrivals: 0, completed: 0, success: 0, failedTreatment: 0, critical: 0, referrals: 0, abandoned: 0, diagnosticExams: 0, advancedTreatments: 0, orthoSurgIcu: 0, trainingsCompleted: 0, satisfactionSum: 0, satisfactionCount: 0, revenue: 0, result: 0 },
      reputation: DEF.sim.startingReputation, demand: { expected: 0, previous: 0 }, arrivalPlan: [], queueNow: {},
    },
    policy: { queue: 1, departmentPriority: {} },
    tutorial: { step: 0, done: false, skipped: false, rewardsClaimed: [] },
    log: [],
    audit: { eventSeq: 0, commandIds: [], violations: [], lastInvariantTick: 0 },
  };
}

const START_ROOMS: { type: RoomTypeId; x: number; y: number; w: number; h: number; door: { x: number; y: number; dir: Dir } }[] = [
  { type: 'R01', x: 27, y: 59, w: 4, h: 3, door: { x: 30, y: 60, dir: 'E' } },
  { type: 'R02', x: 33, y: 58, w: 5, h: 4, door: { x: 33, y: 59, dir: 'W' } },
  { type: 'R03', x: 27, y: 54, w: 4, h: 4, door: { x: 30, y: 55, dir: 'E' } },
  { type: 'R05', x: 33, y: 53, w: 4, h: 4, door: { x: 33, y: 54, dir: 'W' } },
];

export function startingCorridors(): number[] {
  const set = new Set<number>();
  for (let y = 48; y <= 63; y++) for (const x of [31, 32]) set.add(idx(x, y));
  for (let x = 23; x <= 40; x++) for (const y of [48, 49]) set.add(idx(x, y));
  return [...set].sort((a, b) => a - b);
}

/** Creates a fresh campaign: a small functioning clinic with three employees and 75,000 kr. */
export function createNewGame(seed: number, name?: string): World {
  const state = emptyState(seed, name);
  state.map.corridors = startingCorridors();
  const w = new World(state);
  for (const r of START_ROOMS) {
    const lay = generateLayout({ type: r.type, x: r.x, y: r.y, w: r.w, h: r.h, door: r.door });
    if (!lay.ok) throw new Error(`Starting room ${r.type} layout failed: ${lay.reasonSv}`);
    // Original construction cost is recorded even though nothing is charged at the start.
    const room = createRoomState(w, r.type, r.x, r.y, r.w, r.h, r.door, lay.layout!, roomBuildCost(r.type, r.w, r.h));
    room.undoable = false;
    room.builtTick = 0;
    w.addRoom(room);
  }
  w.state.map.version++;
  w.grid.rebuild(w.state);
  const assignments: [RoleId, RoomTypeId][] = [['S01', 'R01'], ['S03', 'R03'], ['S02', 'R05']];
  for (const [role, roomType] of assignments) {
    const c = generateCandidate(w, role);
    // Starting staff are solid but not exceptional.
    for (const k of Object.keys(c.skills) as (keyof typeof c.skills)[]) {
      const range = DEF.role[role].skillRanges[k];
      if (range) c.skills[k] = Math.max(c.skills[k], Math.round((range[0] + range[1]) / 2));
    }
    c.wageMod = 0;
    const room = w.state.rooms.find((r) => r.type === roomType)!;
    const tile = room.layout.idleTiles[0] ?? room.layout.stations[0]!.staffTiles[0]!;
    w.addStaff({
      id: w.nextId('staff'), role, name: c.name, visual: c.visual, traits: c.traits, wageMod: 0, skills: c.skills, energy: 95, stress: 5,
      shift: 'day', roomId: room.id, state: 'IDLE', stateSince: state.clock.tick, task: { kind: 'none' }, onSite: true, training: null, unavailableUntil: 0,
      completedTrainings: [], hiredTick: 0, overtime: false, breakRequested: false,
      pos: tile, path: [], pathIdx: 0, progress: 0, dest: -1, allowRooms: [], lastProgressTick: state.clock.tick, facing: 'down', navVersion: w.state.map.version,
    });
  }
  for (const d of Object.values(DEF.disease)) {
    if (d.startIdentified) state.research.identified.push(d.id);
    if (d.chapter <= 1) state.research.lastSeenDay[d.id] = 0;
  }
  refreshCandidates(w);
  startShift(w, 'day');
  planArrivals(w, 0, state.clock.tick);
  scheduleInitialEvents(w);
  w.flushEvents();
  return w;
}
