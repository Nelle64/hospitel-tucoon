import { DEF } from '../data/definition';
import { MAP_W, isOwned } from '../core/grid';
import type { BlueprintItem, GameState } from '../core/state';
import { World } from '../core/world';
import { buildCorridor, buildRoom, corridorPreview, previewRoom } from './building';

export function rectTiles(x: number, y: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < 64 && yy < 64) out.push(yy * MAP_W + xx);
  return out;
}

export interface BlueprintEval {
  id: number;
  ok: boolean;
  issuesSv: string[];
  cost: number;
  dailyOperation: number;
  locked: boolean;
}

/** Evaluates one blueprint item against the real map plus all planned corridors (no side effects). */
export function evaluateBlueprintItem(w: World, item: BlueprintItem): BlueprintEval {
  const planned = new Set<number>();
  for (const b of w.state.blueprint.items) if (b.kind === 'corridor' && b.id !== item.id) for (const t of rectTiles(b.x, b.y, b.w, b.h)) if (w.grid.kind[t] === 0) planned.add(t);
  const locked = rectTiles(item.x, item.y, item.w, item.h).some((t) => !isOwned(w.state.progress.landStage, t % MAP_W, Math.floor(t / MAP_W)));
  if (item.kind === 'corridor') {
    const p = corridorPreview(w, rectTiles(item.x, item.y, item.w, item.h), planned, true);
    return { id: item.id, ok: p.ok, issuesSv: p.errorsSv, cost: p.cost, dailyOperation: 0, locked };
  }
  const p = previewRoom(w, item.roomType!, item.x, item.y, item.w, item.h, item.door, planned, true);
  // Overlap with other planned rooms is a conflict too.
  const overlaps = w.state.blueprint.items.some((b) => b.id !== item.id && b.kind === 'room' && b.x < item.x + item.w && b.x + b.w > item.x && b.y < item.y + item.h && b.y + b.h > item.y);
  const issues = [...p.errorsSv];
  if (overlaps) issues.push('Överlappar en annan ritning');
  return { id: item.id, ok: p.ok && !overlaps, issuesSv: issues, cost: p.cost, dailyOperation: p.dailyOperation, locked };
}

export function blueprintTotals(w: World): { cost: number; dailyOperation: number; conflicts: number } {
  let cost = 0;
  let ops = 0;
  let conflicts = 0;
  for (const it of w.state.blueprint.items) {
    const e = evaluateBlueprintItem(w, it);
    cost += e.cost;
    ops += e.dailyOperation;
    if (!e.ok) conflicts++;
  }
  return { cost, dailyOperation: ops, conflicts };
}

function applySelection(w: World, items: BlueprintItem[], causation: string | null): { ok: boolean; errorsSv: string[] } {
  const ordered = [...items.filter((i) => i.kind === 'corridor'), ...items.filter((i) => i.kind === 'room')];
  for (const it of ordered) {
    if (it.kind === 'corridor') {
      const tiles = rectTiles(it.x, it.y, it.w, it.h).filter((t) => w.grid.kind[t] === 0);
      if (tiles.length === 0) continue;
      const r = buildCorridor(w, tiles, causation);
      if (!r.ok) return { ok: false, errorsSv: [`Korridorritning #${it.id}: ${r.errorsSv.join(', ')}`] };
    } else {
      const r = buildRoom(w, it.roomType!, it.x, it.y, it.w, it.h, it.door, causation);
      if (!r.ok) return { ok: false, errorsSv: [`${DEF.room[it.roomType!].nameSv} (#${it.id}): ${r.errorsSv.join(', ')}`] };
    }
  }
  return { ok: true, errorsSv: [] };
}

/** Atomic: validate the whole selection on a scratch copy first; nothing is charged unless all succeed. */
export function buildBlueprintSelection(w: World, ids: number[], causation: string | null): { ok: boolean; errorsSv: string[]; built: number } {
  const items = ids.map((id) => w.state.blueprint.items.find((b) => b.id === id));
  if (items.some((i) => !i)) return { ok: false, errorsSv: ['Okänd ritning i urvalet'], built: 0 };
  const scratchState: GameState = structuredClone(w.state);
  const scratch = new World(scratchState);
  const trial = applySelection(scratch, items as BlueprintItem[], causation);
  if (!trial.ok) return { ok: false, errorsSv: trial.errorsSv, built: 0 };
  const real = applySelection(w, items as BlueprintItem[], causation);
  if (!real.ok) throw new Error('Blueprint selection diverged between trial and real application');
  w.state.blueprint.items = w.state.blueprint.items.filter((b) => !ids.includes(b.id));
  w.emit('BLUEPRINT_BUILT', { count: items.length }, null, causation);
  return { ok: true, errorsSv: [], built: items.length };
}
