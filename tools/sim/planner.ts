import { DEF } from '../../src/data/definition';
import type { RoomTypeId } from '../../src/data/types';
import { KIND_CORRIDOR, KIND_EMPTY, MAP_W, idx, landRect } from '../../src/core/grid';
import type { World } from '../../src/core/world';
import { previewRoom } from '../../src/systems/building';
import { corridorReach } from '../../src/systems/navigation';

/** Planned corridor grid: horizontal 2-wide corridors every 8 rows + the vertical main corridor. */
export function plannedCorridorSegments(w: World): number[][] {
  const land = landRect(w.state.progress.landStage);
  const x0 = land.x0;
  const x1 = land.x0 + land.size - 1;
  const y0 = land.y0;
  const segs: number[][] = [];
  // Main vertical corridor up through the owned land.
  const main: number[] = [];
  for (let y = y0; y <= 63; y++) for (const x of [31, 32]) main.push(idx(x, y));
  segs.push(main);
  for (const hy of [48, 40, 32, 24, 16, 8, 0]) {
    if (hy < y0) continue;
    const left: number[] = [];
    const right: number[] = [];
    for (let x = x0; x <= 30; x++) for (const y of [hy, hy + 1]) left.push(idx(x, y));
    for (let x = 33; x <= x1; x++) for (const y of [hy, hy + 1]) right.push(idx(x, y));
    segs.push(left, right);
  }
  return segs;
}

/** Tiles of the next planned corridor segment that is not fully built yet (connected to the network). */
export function nextCorridorTiles(w: World): number[] | null {
  const reach = corridorReach(w);
  for (const seg of plannedCorridorSegments(w)) {
    const missing = seg.filter((t) => w.grid.kind[t] === KIND_EMPTY && w.grid.owned[t]);
    if (missing.length === 0) continue;
    // Must connect: at least one missing tile adjacent to the reachable network or chainable.
    const set = new Set(missing);
    const touches = missing.some((t) => [t - 1, t + 1, t - MAP_W, t + MAP_W].some((n) => n >= 0 && n < 4096 && reach[n] && !set.has(n)));
    if (!touches) continue;
    // Only tiles that are free (rooms may already sit on planned corridor space in odd layouts).
    return missing;
  }
  return null;
}

export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/** Finds the best valid placement for a room of size w×h (either orientation), closest to an anchor. */
export function findRoomSpot(w: World, type: RoomTypeId, rw: number, rh: number, anchor?: { x: number; y: number }): Spot | null {
  const land = landRect(w.state.progress.landStage);
  const ax = anchor?.x ?? 31;
  const ay = anchor?.y ?? 60;
  const sizes: [number, number][] = rw === rh ? [[rw, rh]] : [[rw, rh], [rh, rw]];
  let best: Spot | null = null;
  const grid = w.grid;
  for (const [sw, sh] of sizes) {
    for (let y = land.y0; y + sh <= land.y0 + land.size; y++) {
      for (let x = land.x0; x + sw <= land.x0 + land.size; x++) {
        // Quick reject: all tiles empty.
        let ok = true;
        for (let yy = y; yy < y + sh && ok; yy++) for (let xx = x; xx < x + sw; xx++) if (grid.kind[idx(xx, yy)] !== KIND_EMPTY) {
          ok = false;
          break;
        }
        if (!ok) continue;
        // Must touch a corridor along the perimeter.
        let touches = 0;
        for (let xx = x; xx < x + sw; xx++) {
          if (y > 0 && grid.kind[idx(xx, y - 1)] === KIND_CORRIDOR) touches++;
          if (y + sh < 64 && grid.kind[idx(xx, y + sh)] === KIND_CORRIDOR) touches++;
        }
        for (let yy = y; yy < y + sh; yy++) {
          if (x > 0 && grid.kind[idx(x - 1, yy)] === KIND_CORRIDOR) touches++;
          if (x + sw < 64 && grid.kind[idx(x + sw, yy)] === KIND_CORRIDOR) touches++;
        }
        if (touches === 0) continue;
        // Avoid sitting on planned corridor rows/columns.
        let onPlan = false;
        for (let yy = y; yy < y + sh && !onPlan; yy++) if ([48, 49, 40, 41, 32, 33, 24, 25, 16, 17, 8, 9, 0, 1].includes(yy)) onPlan = true;
        for (let xx = x; xx < x + sw && !onPlan; xx++) if (xx === 31 || xx === 32) onPlan = true;
        if (onPlan) continue;
        // Packing: prefer spots adjacent to walls/other rooms/land edge.
        let neighbours = 0;
        for (let xx = x; xx < x + sw; xx++) {
          if (y === land.y0 || grid.kind[idx(xx, y - 1)] !== KIND_EMPTY) neighbours++;
          if (y + sh === land.y0 + land.size || grid.kind[idx(xx, y + sh)] !== KIND_EMPTY) neighbours++;
        }
        for (let yy = y; yy < y + sh; yy++) {
          if (x === land.x0 || grid.kind[idx(x - 1, yy)] !== KIND_EMPTY) neighbours++;
          if (x + sw === land.x0 + land.size || grid.kind[idx(x + sw, yy)] !== KIND_EMPTY) neighbours++;
        }
        const dist = Math.abs(x + sw / 2 - ax) + Math.abs(y + sh / 2 - ay);
        const score = dist - neighbours * 1.5;
        if (best && score >= best.score) continue;
        const p = previewRoom(w, type, x, y, sw, sh, null, undefined, true);
        if (!p.ok) continue;
        best = { x, y, w: sw, h: sh, score };
      }
    }
  }
  return best;
}

export function defaultSize(type: RoomTypeId): [number, number] {
  const d = DEF.room[type];
  switch (type) {
    case 'R02': return [4, 4];
    case 'R06': return [4, 4];
    case 'R14': return [6, 5];
    case 'R15': return [6, 5];
    default: return [d.minW, d.minH];
  }
}
