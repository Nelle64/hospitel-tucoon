import { DEF } from '../data/definition';
import { KIND_ROOM, MAP_N, MAP_W } from '../core/grid';
import type { Dir } from '../core/state';
import type { World } from '../core/world';

const DIRS: { dir: Dir; d: number; dx: number }[] = [
  { dir: 'N', d: -MAP_W, dx: 0 },
  { dir: 'E', d: 1, dx: 1 },
  { dir: 'S', d: MAP_W, dx: 0 },
  { dir: 'W', d: -1, dx: -1 },
];

/** Binary min-heap keyed by (f, h, seq) for deterministic ordering. */
class Heap {
  private items: number[] = [];
  constructor(private f: Float64Array, private h: Float64Array, private seq: Uint32Array) {}
  get size(): number {
    return this.items.length;
  }
  private less(a: number, b: number): boolean {
    const fa = this.f[a]!;
    const fb = this.f[b]!;
    if (fa !== fb) return fa < fb;
    const ha = this.h[a]!;
    const hb = this.h[b]!;
    if (ha !== hb) return ha < hb;
    return this.seq[a]! < this.seq[b]!;
  }
  push(n: number): void {
    const it = this.items;
    it.push(n);
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(it[i]!, it[p]!)) break;
      [it[i], it[p]] = [it[p]!, it[i]!];
      i = p;
    }
  }
  pop(): number {
    const it = this.items;
    const top = it[0]!;
    const last = it.pop()!;
    if (it.length > 0) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && this.less(it[l]!, it[m]!)) m = l;
        if (r < it.length && this.less(it[r]!, it[m]!)) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m]!, it[i]!];
        i = m;
      }
    }
    return top;
  }
}

interface NavCache {
  geom: number;
  traffic: number;
  paths: Map<string, number[] | null>;
  stats: { hits: number; misses: number; searches: number };
}

const g = new Float64Array(MAP_N);
const f = new Float64Array(MAP_N);
const hh = new Float64Array(MAP_N);
const seq = new Uint32Array(MAP_N);
const came = new Int32Array(MAP_N);
const stamp = new Uint32Array(MAP_N);
const closed = new Uint32Array(MAP_N);
let stampGen = 1;

function cache(w: World): NavCache {
  let c = w.caches.nav as NavCache | undefined;
  if (!c || c.geom !== w.state.map.version || c.traffic !== w.state.map.trafficVersion) {
    const stats = c?.stats ?? { hits: 0, misses: 0, searches: 0 };
    c = { geom: w.state.map.version, traffic: w.state.map.trafficVersion, paths: new Map(), stats };
    w.caches.nav = c;
  }
  return c;
}

export function navStats(w: World): { hits: number; misses: number; searches: number; size: number } {
  const c = cache(w);
  return { ...c.stats, size: c.paths.size };
}

/**
 * A* with a Manhattan heuristic over 4-connected tiles.
 * Agents may traverse corridors plus the explicitly allowed rooms (their origin and destination);
 * other care rooms are never used as shortcuts.
 */
export function findPath(w: World, from: number, to: number, allowRooms: readonly number[]): number[] | null {
  if (from === to) return [];
  const grid = w.grid;
  if (!grid.isWalkable(to)) return null;
  const c = cache(w);
  const startRoom = grid.kind[from] === KIND_ROOM ? grid.room[from]! : 0;
  const allow = allowRooms.slice().sort((a, b) => a - b);
  const key = `${from}|${to}|${startRoom}|${allow.join(',')}`;
  const hit = c.paths.get(key);
  if (hit !== undefined) {
    c.stats.hits++;
    c.paths.delete(key);
    c.paths.set(key, hit);
    return hit ? hit.slice() : null;
  }
  c.stats.misses++;
  c.stats.searches++;
  const path = astar(w, from, to, startRoom, allow);
  c.paths.set(key, path);
  if (c.paths.size > DEF.nav.pathCacheSize) {
    const first = c.paths.keys().next().value as string;
    c.paths.delete(first);
  }
  return path ? path.slice() : null;
}

function astar(w: World, from: number, to: number, startRoom: number, allow: number[]): number[] | null {
  const grid = w.grid;
  const traffic = w.state.map.trafficLevel;
  const tw = DEF.nav.trafficRouteWeight / 100;
  stampGen++;
  if (stampGen >= 0xfffffff0) {
    stamp.fill(0);
    closed.fill(0);
    stampGen = 1;
  }
  const gen = stampGen;
  let counter = 0;
  const tx = to % MAP_W;
  const ty = (to / MAP_W) | 0;
  const heur = (i: number) => Math.abs((i % MAP_W) - tx) + Math.abs(((i / MAP_W) | 0) - ty);
  const heap = new Heap(f, hh, seq);
  stamp[from] = gen;
  g[from] = 0;
  hh[from] = heur(from);
  f[from] = hh[from]!;
  seq[from] = counter++;
  came[from] = -1;
  heap.push(from);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === to) {
      const out: number[] = [];
      let n = cur;
      while (n !== from) {
        out.push(n);
        n = came[n]!;
      }
      out.reverse();
      return out;
    }
    const cx = cur % MAP_W;
    for (const dd of DIRS) {
      if (dd.dx === 1 && cx === MAP_W - 1) continue;
      if (dd.dx === -1 && cx === 0) continue;
      const nb = cur + dd.d;
      if (nb < 0 || nb >= MAP_N) continue;
      if (closed[nb] === gen) continue;
      if (!grid.canStep(cur, nb, dd.dir)) continue;
      if (grid.kind[nb] === KIND_ROOM) {
        const r = grid.room[nb]!;
        if (r !== startRoom && !allow.includes(r)) continue;
      }
      const cost = 1 + (traffic[nb] ?? 0) * tw;
      const ng = g[cur]! + cost;
      if (stamp[nb] === gen && ng >= g[nb]!) continue;
      stamp[nb] = gen;
      g[nb] = ng;
      hh[nb] = heur(nb);
      f[nb] = ng + hh[nb]!;
      seq[nb] = counter++;
      came[nb] = cur;
      heap.push(nb);
    }
  }
  return null;
}

/** Corridor-only reachability from the entrance (used for construction validation). */
export function corridorReach(w: World, extraCorridors?: Set<number>): Uint8Array {
  const grid = w.grid;
  const seen = new Uint8Array(MAP_N);
  const start = w.state.map.entrance;
  const isCorr = (i: number) => grid.kind[i] === 1 || (extraCorridors?.has(i) ?? false);
  if (!isCorr(start)) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % MAP_W;
    for (const dd of DIRS) {
      if (dd.dx === 1 && x === MAP_W - 1) continue;
      if (dd.dx === -1 && x === 0) continue;
      const n = i + dd.d;
      if (n < 0 || n >= MAP_N || seen[n]) continue;
      if (!isCorr(n)) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}
