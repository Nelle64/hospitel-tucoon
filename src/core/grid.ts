import { DEF } from '../data/definition';
import type { Dir, GameState, RoomState } from './state';

export const MAP_W = 64;
export const MAP_H = 64;
export const MAP_N = MAP_W * MAP_H;

export const KIND_EMPTY = 0;
export const KIND_CORRIDOR = 1;
export const KIND_ROOM = 2;

export const DIR_BITS: Record<Dir, number> = { N: 1, E: 2, S: 4, W: 8 };
export const DIR_DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export const idx = (x: number, y: number): number => y * MAP_W + x;
export const tx = (i: number): number => i % MAP_W;
export const ty = (i: number): number => (i / MAP_W) | 0;
export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export function landRect(stage: number): { x0: number; y0: number; size: number } {
  const s = DEF.econ.landStages[Math.max(0, Math.min(stage, DEF.econ.landStages.length - 1))]!;
  return { x0: s.x0, y0: s.y0, size: s.size };
}

export function isOwned(stage: number, x: number, y: number): boolean {
  const r = landRect(stage);
  return x >= r.x0 && y >= r.y0 && x < r.x0 + r.size && y < r.y0 + r.size;
}

/** Derived tile grid. Rebuilt from GameState (rooms, corridors, land) – never saved. */
export class Grid {
  owned = new Uint8Array(MAP_N);
  kind = new Uint8Array(MAP_N);
  room = new Int32Array(MAP_N);
  blocked = new Uint8Array(MAP_N);
  doorMask = new Uint8Array(MAP_N);
  version = 0;

  rebuild(state: GameState): void {
    this.owned.fill(0);
    this.kind.fill(KIND_EMPTY);
    this.room.fill(0);
    this.blocked.fill(0);
    this.doorMask.fill(0);
    const land = landRect(state.progress.landStage);
    for (let y = land.y0; y < land.y0 + land.size; y++) for (let x = land.x0; x < land.x0 + land.size; x++) this.owned[idx(x, y)] = 1;
    for (const c of state.map.corridors) this.kind[c] = KIND_CORRIDOR;
    for (const r of state.rooms) this.stampRoom(r);
    this.version = state.map.version;
  }

  stampRoom(r: RoomState): void {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = idx(x, y);
        this.kind[i] = KIND_ROOM;
        this.room[i] = r.id;
      }
    for (const b of r.layout.blocked) this.blocked[b] = 1;
    const d = r.door;
    const [dx, dy] = DIR_DELTA[d.dir];
    const inside = idx(d.x, d.y);
    const ox = d.x + dx;
    const oy = d.y + dy;
    if (inBounds(ox, oy)) {
      const o = idx(ox, oy);
      this.doorMask[inside] = this.doorMask[inside]! | DIR_BITS[d.dir];
      this.doorMask[o] = this.doorMask[o]! | DIR_BITS[OPPOSITE[d.dir]];
    }
  }

  /** Whether movement between two 4-adjacent tiles is physically possible (walls, doors, furniture). */
  canStep(a: number, b: number, dir: Dir): boolean {
    if (this.blocked[b]) return false;
    const ka = this.kind[a]!;
    const kb = this.kind[b]!;
    if (kb === KIND_EMPTY || ka === KIND_EMPTY) return false;
    if (ka === KIND_CORRIDOR && kb === KIND_CORRIDOR) return true;
    if (ka === KIND_ROOM && kb === KIND_ROOM && this.room[a] === this.room[b]) return true;
    return (this.doorMask[a]! & DIR_BITS[dir]) !== 0;
  }

  isWalkable(i: number): boolean {
    return this.kind[i] !== KIND_EMPTY && !this.blocked[i];
  }
}
