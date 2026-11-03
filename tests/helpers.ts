import { DEF } from '../src/data/definition';
import type { ChapterId, DiseaseId, RoleId, RoomTypeId } from '../src/data/types';
import { GameEngine } from '../src/core/engine';
import type { CommandPayload, CommandResult } from '../src/core/commands';
import type { RoomState } from '../src/core/state';
import { completeChapter } from '../src/systems/campaign';
import { post } from '../src/systems/economy';
import { checkInvariants } from '../src/core/invariants';
import { findRoomSpot, nextCorridorTiles, defaultSize } from '../tools/sim/planner';

let n = 0;
export function cmd(eng: GameEngine, c: CommandPayload): CommandResult {
  return eng.dispatch({ ...c, id: `t-${++n}` } as never);
}

export function newEngine(seed = 7, strict = true): GameEngine {
  return GameEngine.newGame(seed, { invariantEvery: 1, strict });
}

/**
 * Test fixture: unlock chapters through the normal completion routine and give a construction budget.
 * (Fixture only – campaign/balance tests never use this.)
 */
export function sandbox(seed = 11, chapter: ChapterId = 5, cash = 2_000_000): GameEngine {
  const eng = newEngine(seed);
  const w = eng.world;
  while (w.state.progress.chapter < chapter) completeChapter(w, w.state.progress.chapter);
  post(w, cash, 'grant', 'Test budget', 'test');
  while (w.state.progress.landStage < 3 && DEF.econ.landStages[w.state.progress.landStage + 1]!.chapter <= w.chapter) cmd(eng, { type: 'EXPAND_LAND' });
  w.flushEvents();
  return eng;
}

export function build(eng: GameEngine, type: RoomTypeId, size?: [number, number]): RoomState {
  const w = eng.world;
  const [rw, rh] = size ?? defaultSize(type);
  for (let i = 0; i < 12; i++) {
    const spot = findRoomSpot(w, type, rw, rh, { x: 31, y: 56 });
    if (spot) {
      const r = cmd(eng, { type: 'BUILD_ROOM', roomType: type, x: spot.x, y: spot.y, w: spot.w, h: spot.h });
      if (!r.ok) throw new Error(`build ${type} failed: ${r.errors.map((e) => e.messageSv).join(', ')}`);
      return w.roomById.get(r.data!.roomId as number)!;
    }
    const tiles = nextCorridorTiles(w);
    if (!tiles) break;
    const r = cmd(eng, { type: 'BUILD_CORRIDOR', tiles });
    if (!r.ok) throw new Error(`corridor failed: ${r.errors.map((e) => e.messageSv).join(', ')}`);
  }
  throw new Error(`no spot for ${type}`);
}

/** Hire qualified staff for every team slot of a room on the given shift. */
export function staffRoom(eng: GameEngine, room: RoomState, shift: 'day' | 'night' = 'day', teams = 1): void {
  const w = eng.world;
  const def = DEF.room[room.type];
  for (let t = 0; t < teams; t++) {
    for (const role of def.team) hireQualified(eng, role, room, shift);
  }
  void w;
}

export function hireQualified(eng: GameEngine, role: RoleId, room: RoomState, shift: 'day' | 'night' = 'day'): number {
  const w = eng.world;
  for (let attempt = 0; attempt < 30; attempt++) {
    const reqs = DEF.room[room.type].requiredSkill.filter((r) => r.role === role);
    const cand = w.state.candidates.find((c) => c.role === role && reqs.every((q) => c.skills[q.skill] >= q.min));
    if (cand) {
      const r = cmd(eng, { type: 'HIRE_STAFF', candidateId: cand.id, shift, roomId: room.id });
      if (r.ok) return r.data!.staffId as number;
      throw new Error(`hire ${role} failed: ${r.errors.map((e) => e.messageSv).join(', ')}`);
    }
    cmd(eng, { type: 'REFRESH_CANDIDATES' });
  }
  throw new Error(`no qualified ${role} candidate`);
}

export function identify(eng: GameEngine, d: DiseaseId): void {
  const r = eng.world.state.research;
  if (!r.observed.includes(d)) r.observed.push(d);
  if (!r.identified.includes(d)) r.identified.push(d);
}

export function runUntil(eng: GameEngine, pred: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return true;
    eng.step();
  }
  return pred();
}

/** Advance to the next 08:15 so day departments are open. */
export function toMorning(eng: GameEngine): void {
  const tpd = DEF.sim.ticksPerDay;
  const target = 825;
  const tod = eng.world.tick % tpd;
  const n2 = tod <= target ? target - tod : tpd - tod + target;
  eng.runTicks(n2);
}

export function noViolations(eng: GameEngine): string[] {
  return checkInvariants(eng.world);
}

/** Logical game state for determinism comparisons (command ids and campaign identity excluded). */
export function logical(state: GameEngine['state']): unknown {
  const s = JSON.parse(JSON.stringify(state));
  s.audit.commandIds = [];
  s.campaign.id = '';
  return s;
}

/** First differing JSON path between two values, or null when equal (keeps assertion output small). */
export function firstDiff(a: unknown, b: unknown, path = '$'): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)?.slice(0, 80)} !== ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array mismatch`;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (Array.isArray(a) && ka.length !== kb.length) return `${path}: length ${ka.length} !== ${kb.length}`;
  for (const k of new Set([...ka, ...kb])) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}
