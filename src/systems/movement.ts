import { DEF } from '../data/definition';
import { KIND_CORRIDOR, MAP_W } from '../core/grid';
import type { Dir, Facing, Mover } from '../core/state';
import type { World } from '../core/world';
import { findPath } from './navigation';

/** Sets a new destination; returns false when no route exists. */
export function setDestination(w: World, m: Mover, dest: number, allowRooms: number[]): boolean {
  if (dest < 0) return false;
  m.dest = dest;
  m.allowRooms = allowRooms;
  m.progress = 0;
  m.lastProgressTick = w.tick;
  m.navVersion = w.state.map.version;
  if (m.pos === dest) {
    m.path = [];
    m.pathIdx = 0;
    return true;
  }
  const p = findPath(w, m.pos, dest, allowRooms);
  if (!p) {
    m.path = [];
    m.pathIdx = 0;
    return false;
  }
  m.path = p;
  m.pathIdx = 0;
  return true;
}

export function clearDestination(m: Mover): void {
  m.dest = -1;
  m.path = [];
  m.pathIdx = 0;
  m.progress = 0;
}

export function arrived(m: Mover): boolean {
  return m.dest >= 0 && m.pos === m.dest && m.pathIdx >= m.path.length;
}

export function isMoving(m: Mover): boolean {
  return m.dest >= 0 && m.pathIdx < m.path.length;
}

function dirBetween(a: number, b: number): Dir {
  const d = b - a;
  if (d === 1) return 'E';
  if (d === -1) return 'W';
  if (d === MAP_W) return 'S';
  return 'N';
}

const FACING: Record<Dir, Facing> = { N: 'up', S: 'down', E: 'right', W: 'left' };

/**
 * Advance a mover by one tick. Returns 'arrived' on reaching the destination, 'blocked' when the
 * remaining route became invalid and could not be recomputed, otherwise 'moving'/'idle'.
 */
export function stepMover(w: World, m: Mover, minutesPerTile: number): 'idle' | 'moving' | 'arrived' | 'blocked' {
  if (m.dest < 0 || m.pathIdx >= m.path.length) return m.dest >= 0 && m.pos === m.dest ? 'arrived' : 'idle';
  if (m.navVersion !== w.state.map.version) {
    // Geometry changed: revalidate the remaining route, recompute if needed.
    m.navVersion = w.state.map.version;
    let valid = true;
    let prev = m.pos;
    for (let i = m.pathIdx; i < m.path.length; i++) {
      const n = m.path[i]!;
      if (!w.grid.canStep(prev, n, dirBetween(prev, n))) {
        valid = false;
        break;
      }
      prev = n;
    }
    if (!valid) {
      const p = findPath(w, m.pos, m.dest, m.allowRooms);
      if (!p) return 'blocked';
      m.path = p;
      m.pathIdx = 0;
    }
  }
  const travelBonus = w.state.research.projectsDone.includes('F03') ? 0.08 : 0;
  const next = m.path[m.pathIdx]!;
  const traffic = w.grid.kind[next] === KIND_CORRIDOR ? (w.state.map.trafficLevel[next] ?? 0) / 100 : 0;
  const slow = 1 - DEF.nav.maxTrafficSlowdown * traffic;
  const effMin = (minutesPerTile * (1 - travelBonus)) / slow;
  m.progress += DEF.sim.minutesPerTick / effMin;
  while (m.progress >= 1 && m.pathIdx < m.path.length) {
    const n = m.path[m.pathIdx]!;
    const d = dirBetween(m.pos, n);
    if (!w.grid.canStep(m.pos, n, d)) {
      const p = findPath(w, m.pos, m.dest, m.allowRooms);
      if (!p) return 'blocked';
      m.path = p;
      m.pathIdx = 0;
      continue;
    }
    m.facing = FACING[d];
    m.pos = n;
    m.pathIdx++;
    m.progress -= 1;
    m.lastProgressTick = w.tick;
    if (w.grid.kind[n] === KIND_CORRIDOR) w.state.map.trafficCount[n] = (w.state.map.trafficCount[n] ?? 0) + 1;
  }
  if (m.pathIdx >= m.path.length) {
    m.progress = 0;
    m.path = [];
    m.pathIdx = 0;
    return 'arrived';
  }
  return 'moving';
}

/** Rolling traffic window: counts over the last window become the traffic level. */
export function updateTraffic(w: World): void {
  const windowTicks = w.minutesToTicks(DEF.nav.trafficWindowMinutes);
  if (w.tick % windowTicks !== 0) return;
  const map = w.state.map;
  let changed = false;
  for (let i = 0; i < map.trafficCount.length; i++) {
    const lvl = Math.min(100, (map.trafficCount[i] ?? 0) * 6);
    if (lvl !== map.trafficLevel[i]) {
      map.trafficLevel[i] = lvl;
      changed = true;
    }
    map.trafficCount[i] = 0;
  }
  if (changed) map.trafficVersion++;
}
