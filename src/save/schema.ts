import { DEF } from '../data/definition';
import { MAP_N } from '../core/grid';
import type { GameState } from '../core/state';

type Check = [boolean, string];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isArr = Array.isArray;
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown) => typeof v === 'string';

/**
 * Runtime structural validation of an untrusted GameState (imported or loaded).
 * Compile-time types are not trusted. Returns a list of problems (empty = valid).
 */
export function validateGameState(raw: unknown): string[] {
  const out: string[] = [];
  if (!isObj(raw)) return ['state is not an object'];
  const s = raw as unknown as GameState;
  const checks: Check[] = [
    [isInt(s.schemaVersion), 'schemaVersion'],
    [isStr(s.dataVersion), 'dataVersion'],
    [isObj(s.campaign) && isStr(s.campaign.id) && isInt(s.campaign.seed) && isStr(s.campaign.name) && s.campaign.name.length <= 80, 'campaign'],
    [isObj(s.ids), 'ids'],
    [isObj(s.rng) && isArr(s.rng.s) && s.rng.s.length === 4 && s.rng.s.every((x) => isInt(x) && x >= 0 && x <= 0xffffffff), 'rng'],
    [isObj(s.clock) && isInt(s.clock.tick) && s.clock.tick >= 0 && isNum(s.clock.speed) && typeof s.clock.paused === 'boolean', 'clock'],
    [isObj(s.map) && isArr(s.map.corridors) && s.map.corridors.every((t) => isInt(t) && t >= 0 && t < MAP_N) && isInt(s.map.entrance), 'map'],
    [isObj(s.map) && isArr(s.map.trafficLevel) && s.map.trafficLevel.length === MAP_N && isArr(s.map.trafficCount) && s.map.trafficCount.length === MAP_N, 'map.traffic'],
    [isObj(s.blueprint) && isArr(s.blueprint.items), 'blueprint'],
    [isArr(s.rooms) && isArr(s.patients) && isArr(s.cases) && isArr(s.staff) && isArr(s.candidates) && isArr(s.queues) && isArr(s.reservations), 'entities'],
    [isObj(s.economy) && isInt(s.economy.cash) && isArr(s.economy.transactions) && isArr(s.economy.loans) && isArr(s.economy.settledCaseIds), 'economy'],
    [isObj(s.research) && isInt(s.research.grp) && isArr(s.research.identified) && isArr(s.research.mastered) && isArr(s.research.projectsDone), 'research'],
    [isObj(s.missions) && isArr(s.missions.active), 'missions'],
    [isObj(s.events) && isArr(s.events.active), 'events'],
    [isObj(s.progress) && isInt(s.progress.chapter) && s.progress.chapter >= 1 && s.progress.chapter <= 5 && isInt(s.progress.landStage), 'progress'],
    [isObj(s.metrics) && isArr(s.metrics.days) && isObj(s.metrics.today) && isNum(s.metrics.reputation), 'metrics'],
    [isObj(s.policy) && [1, 2, 3].includes(s.policy.queue), 'policy'],
    [isObj(s.tutorial), 'tutorial'],
    [isArr(s.log) && isObj(s.audit), 'log/audit'],
  ];
  for (const [ok, label] of checks) if (!ok) out.push(`invalid ${label}`);
  if (out.length) return out;
  // Bounded growth.
  if (s.log.length > DEF.sim.eventLogSize) out.push('event log too long');
  if (s.metrics.days.length > DEF.sim.historyDays) out.push('history too long');
  if (s.patients.length > 2000 || s.staff.length > 500 || s.rooms.length > 400) out.push('too many entities');
  // Entity shape and references.
  const roomIds = new Set<number>();
  for (const r of s.rooms) {
    if (!isObj(r) || !isInt(r.id) || !(r.type in DEF.room) || !isInt(r.x) || !isInt(r.y) || !isInt(r.w) || !isInt(r.h) || !isObj(r.layout) || !isArr(r.layout.stations)) {
      out.push('invalid room');
      break;
    }
    if (r.x < 0 || r.y < 0 || r.x + r.w > 64 || r.y + r.h > 64) out.push(`room ${r.id} outside map`);
    roomIds.add(r.id);
  }
  const caseIds = new Set<number>();
  for (const c of s.cases) {
    if (!isObj(c) || !isInt(c.id) || !(c.disease in DEF.disease) || !isArr(c.path) || !c.path.every((k) => k in DEF.step)) {
      out.push('invalid case');
      break;
    }
    caseIds.add(c.id);
  }
  for (const p of s.patients) {
    if (!isObj(p) || !isInt(p.id) || !isInt(p.pos) || p.pos < 0 || p.pos >= MAP_N || !isArr(p.path) || !isNum(p.health) || !isStr(p.name)) {
      out.push('invalid patient');
      break;
    }
    if (!caseIds.has(p.caseId)) out.push(`patient ${p.id} references missing case`);
  }
  for (const st of s.staff) {
    if (!isObj(st) || !isInt(st.id) || !(st.role in DEF.role) || !isObj(st.skills) || !isNum(st.energy) || !isStr(st.name)) {
      out.push('invalid staff');
      break;
    }
    if (st.roomId && !roomIds.has(st.roomId)) out.push(`staff ${st.id} references missing room`);
  }
  for (const r of s.reservations) if (!isObj(r) || !isInt(r.id) || !roomIds.has(r.roomId)) out.push('invalid reservation');
  return out.slice(0, 20);
}
