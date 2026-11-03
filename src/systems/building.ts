import { DEF } from '../data/definition';
import type { RoomTypeId } from '../data/types';
import { DIR_DELTA, KIND_CORRIDOR, KIND_EMPTY, MAP_W, idx, inBounds, isOwned, landRect } from '../core/grid';
import type { Dir, RoomLayout, RoomState } from '../core/state';
import type { World } from '../core/world';
import { corridorReach } from './navigation';
import { generateLayout } from './layout';
import { canAfford, post, roomDailyOperation } from './economy';

export const MAX_ROOM_SIDE = 12;

export interface RoomPreview {
  ok: boolean;
  errorsSv: string[];
  cost: number;
  door: { x: number; y: number; dir: Dir } | null;
  layout: RoomLayout | null;
  dailyOperation: number;
  stations: number;
  capacity: number;
  staffNeeded: string[];
}

export function roomBuildCost(type: RoomTypeId, w: number, h: number): number {
  const d = DEF.room[type];
  return d.baseCost + d.costPerTile * w * h;
}

export function isRoomUnlocked(world: World, type: RoomTypeId): boolean {
  return DEF.room[type].unlockChapter <= world.chapter;
}

/** Perimeter tiles whose outward neighbour is a corridor, as door candidates in preference order. */
export function doorCandidates(world: World, x: number, y: number, w: number, h: number, extraCorr?: Set<number>): { x: number; y: number; dir: Dir }[] {
  const out: { x: number; y: number; dir: Dir; score: number }[] = [];
  const isCorr = (i: number) => world.grid.kind[i] === KIND_CORRIDOR || (extraCorr?.has(i) ?? false);
  const consider = (cx: number, cy: number, dir: Dir, center: number, pos: number) => {
    const [dx, dy] = DIR_DELTA[dir];
    const ox = cx + dx;
    const oy = cy + dy;
    if (!inBounds(ox, oy) || !isCorr(idx(ox, oy))) return;
    out.push({ x: cx, y: cy, dir, score: Math.abs(pos - center) });
  };
  for (let i = 0; i < w; i++) {
    consider(x + i, y + h - 1, 'S', (w - 1) / 2, i);
    consider(x + i, y, 'N', (w - 1) / 2, i);
  }
  for (let j = 0; j < h; j++) {
    consider(x, y + j, 'W', (h - 1) / 2, j);
    consider(x + w - 1, y + j, 'E', (h - 1) / 2, j);
  }
  out.sort((a, b) => a.score - b.score);
  return out.map(({ x: dx, y: dy, dir }) => ({ x: dx, y: dy, dir }));
}

export function teamCapacity(type: RoomTypeId, stations: number): number {
  const d = DEF.room[type];
  if (d.stationKind === 'seat') return Math.min(stations, DEF.econ.supportUpgrades.waitingSeats[0]!);
  return stations;
}

/**
 * Full placement validation used by previews, blueprints and BUILD_ROOM.
 * `extraCorr` lets atomic blueprint builds treat planned corridors as present.
 */
export function previewRoom(world: World, type: RoomTypeId, x: number, y: number, w: number, h: number, door?: { x: number; y: number; dir: Dir } | null, extraCorr?: Set<number>, ignoreMoney = false): RoomPreview {
  const def = DEF.room[type];
  const errors: string[] = [];
  const cost = roomBuildCost(type, w, h);
  const res: RoomPreview = { ok: false, errorsSv: errors, cost, door: null, layout: null, dailyOperation: def.baseOperation + DEF.econ.roomOperationPerTile * w * h, stations: 0, capacity: 0, staffNeeded: def.team.map((r) => DEF.role[r].nameSv) };
  if (!isRoomUnlocked(world, type)) errors.push(`${def.nameSv} låses upp i kapitel ${def.unlockChapter}`);
  const fitsMin = (w >= def.minW && h >= def.minH) || (w >= def.minH && h >= def.minW);
  if (!fitsMin) errors.push(`Minsta storlek är ${def.minW}×${def.minH}`);
  if (w > MAX_ROOM_SIDE || h > MAX_ROOM_SIDE) errors.push(`Största sida är ${MAX_ROOM_SIDE} rutor`);
  let overlap = false;
  let locked = false;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      if (!inBounds(xx, yy) || !isOwned(world.state.progress.landStage, xx, yy)) {
        locked = true;
        continue;
      }
      const i = idx(xx, yy);
      if (world.grid.kind[i] !== KIND_EMPTY || extraCorr?.has(i)) overlap = true;
    }
  if (locked) errors.push('Marken är inte köpt');
  if (overlap) errors.push('Överlappar ett rum eller en korridor');
  if (errors.length) return res;
  const reach = corridorReach(world, extraCorr);
  const candidates = door ? [door] : doorCandidates(world, x, y, w, h, extraCorr);
  if (candidates.length === 0) {
    errors.push('Rummet måste ligga intill en korridor');
    return res;
  }
  let chosen: { x: number; y: number; dir: Dir } | null = null;
  let layout: RoomLayout | null = null;
  let lastReason = '';
  for (const c of candidates) {
    const onPerimeter = (c.x === x || c.x === x + w - 1 || c.y === y || c.y === y + h - 1) && c.x >= x && c.x < x + w && c.y >= y && c.y < y + h;
    const [dx, dy] = DIR_DELTA[c.dir];
    const ox = c.x + dx;
    const oy = c.y + dy;
    const outside = inBounds(ox, oy) ? idx(ox, oy) : -1;
    const facesOut = ox < x || ox >= x + w || oy < y || oy >= y + h;
    if (!onPerimeter || !facesOut || outside < 0) {
      lastReason = 'Dörren måste sitta i ytterväggen';
      continue;
    }
    if (!(world.grid.kind[outside] === KIND_CORRIDOR || extraCorr?.has(outside))) {
      lastReason = 'Dörren måste leda ut i en korridor';
      continue;
    }
    if (!reach[outside]) {
      lastReason = 'Korridoren når inte entrén';
      continue;
    }
    const lr = generateLayout({ type, x, y, w, h, door: c });
    if (!lr.ok) {
      lastReason = lr.reasonSv ?? 'Ogiltig inredning';
      continue;
    }
    chosen = c;
    layout = lr.layout!;
    break;
  }
  if (!chosen || !layout) {
    errors.push(lastReason || 'Ingen giltig dörrplacering');
    return res;
  }
  res.door = chosen;
  res.layout = layout;
  res.stations = layout.stations.length;
  res.capacity = def.stationKind === 'seat' ? Math.min(layout.stations.length, DEF.econ.supportUpgrades.waitingSeats[0]!) : def.stationKind === 'cleaning' ? DEF.econ.supportUpgrades.cleaningCoverage[0]! : layout.stations.length;
  if (!ignoreMoney && !canAfford(world, cost)) errors.push(`Kostar ${cost} kr – du har ${world.state.economy.cash} kr`);
  res.ok = errors.length === 0;
  return res;
}

export function createRoomState(world: World, type: RoomTypeId, x: number, y: number, w: number, h: number, door: { x: number; y: number; dir: Dir }, layout: RoomLayout, cost: number): RoomState {
  return {
    id: world.nextId('room'), type, x, y, w, h, door, layout, level: 1, open: true, closing: false,
    builtTick: world.tick, used: false, buildCost: cost, upgradeCosts: [], cleanliness: 100, brokenUntil: 0, opAccum: 0, undoable: true,
  };
}

function geometryChanged(world: World): void {
  world.state.map.version++;
  world.grid.rebuild(world.state);
  world.matchDirty = true;
}

export function buildRoom(world: World, type: RoomTypeId, x: number, y: number, w: number, h: number, door: { x: number; y: number; dir: Dir } | null, causation: string | null): { ok: boolean; errorsSv: string[]; roomId?: number } {
  const p = previewRoom(world, type, x, y, w, h, door);
  if (!p.ok || !p.door || !p.layout) return { ok: false, errorsSv: p.errorsSv };
  for (const r of world.state.rooms) r.undoable = false;
  const room = createRoomState(world, type, x, y, w, h, p.door, p.layout, p.cost);
  world.addRoom(room);
  geometryChanged(world);
  post(world, -p.cost, 'construction', `Bygge: ${DEF.room[type].nameSv}`, `room:${room.id}`);
  world.emit('ROOM_BUILT', { roomId: room.id, type, x, y, w, h, cost: p.cost }, `room:${room.id}`, causation);
  return { ok: true, errorsSv: [], roomId: room.id };
}

export function corridorPreview(world: World, tiles: number[], extraCorr?: Set<number>, ignoreMoney = false): { ok: boolean; errorsSv: string[]; cost: number; newTiles: number[] } {
  const errors: string[] = [];
  const uniq = [...new Set(tiles)].sort((a, b) => a - b);
  const newTiles: number[] = [];
  for (const t of uniq) {
    if (t < 0 || t >= MAP_W * MAP_W) {
      errors.push('Utanför kartan');
      break;
    }
    const x = t % MAP_W;
    const y = Math.floor(t / MAP_W);
    if (!isOwned(world.state.progress.landStage, x, y)) {
      errors.push('Marken är inte köpt');
      break;
    }
    if (world.grid.kind[t] === KIND_CORRIDOR || extraCorr?.has(t)) continue;
    if (world.grid.kind[t] !== KIND_EMPTY) {
      errors.push('Korridoren korsar ett rum');
      break;
    }
    newTiles.push(t);
  }
  const cost = newTiles.length * DEF.econ.corridorCostPerTile;
  if (!errors.length && newTiles.length === 0) errors.push('Inga nya korridorrutor');
  if (!errors.length) {
    // Connectivity: every new tile must connect to the existing network (through the new tiles themselves).
    const set = new Set([...(extraCorr ?? []), ...newTiles]);
    const reach = corridorReach(world, set);
    if (newTiles.some((t) => !reach[t])) errors.push('Korridoren måste ansluta till befintliga korridorer');
  }
  if (!errors.length && !ignoreMoney && !canAfford(world, cost)) errors.push(`Kostar ${cost} kr – du har ${world.state.economy.cash} kr`);
  return { ok: errors.length === 0, errorsSv: errors, cost, newTiles };
}

export function buildCorridor(world: World, tiles: number[], causation: string | null): { ok: boolean; errorsSv: string[] } {
  const p = corridorPreview(world, tiles);
  if (!p.ok) return { ok: false, errorsSv: p.errorsSv };
  const set = new Set(world.state.map.corridors);
  for (const t of p.newTiles) set.add(t);
  world.state.map.corridors = [...set].sort((a, b) => a - b);
  geometryChanged(world);
  post(world, -p.cost, 'corridor', `Korridor (${p.newTiles.length} rutor)`, 'corridor');
  world.emit('CORRIDOR_BUILT', { tiles: p.newTiles.length, cost: p.cost }, null, causation);
  return { ok: true, errorsSv: [] };
}

/** Removing corridor tiles must not strand any room or agent. */
export function demolishCorridor(world: World, tiles: number[], causation: string | null): { ok: boolean; errorsSv: string[] } {
  const remove = new Set(tiles.filter((t) => world.grid.kind[t] === KIND_CORRIDOR));
  if (remove.size === 0) return { ok: false, errorsSv: ['Inga korridorrutor valda'] };
  if (remove.has(world.state.map.entrance)) return { ok: false, errorsSv: ['Entrén kan inte rivas'] };
  const movers = [...world.state.patients, ...world.state.staff.filter((st) => st.onSite)];
  for (const a of movers) {
    if (remove.has(a.pos) || a.path.slice(a.pathIdx).some((t) => remove.has(t))) return { ok: false, errorsSv: ['Någon går i korridoren just nu'] };
  }
  const before = world.state.map.corridors;
  world.state.map.corridors = before.filter((t) => !remove.has(t));
  world.grid.rebuild(world.state);
  const reach = corridorReach(world);
  const stranded = world.state.rooms.some((r) => {
    const [dx, dy] = DIR_DELTA[r.door.dir];
    return !reach[idx(r.door.x + dx, r.door.y + dy)];
  });
  if (stranded) {
    world.state.map.corridors = before;
    world.grid.rebuild(world.state);
    return { ok: false, errorsSv: ['Rivningen skulle stänga av rum från entrén'] };
  }
  geometryChanged(world);
  const refund = Math.floor(remove.size * DEF.econ.corridorCostPerTile * DEF.econ.corridorRefundRate);
  post(world, refund, 'refund', 'Korridor riven', 'corridor');
  world.emit('CORRIDOR_BUILT', { removed: remove.size, refund }, null, causation);
  return { ok: true, errorsSv: [] };
}

export function demolitionRefund(room: RoomState): number {
  const eligible = room.buildCost + room.upgradeCosts.reduce((s, c) => s + c, 0);
  if (room.undoable && !room.used) return eligible;
  return Math.floor(eligible * (room.used ? DEF.econ.refundUsed : DEF.econ.refundUnused));
}

export function roomOccupied(world: World, roomId: number): boolean {
  if (world.state.reservations.some((r) => r.roomId === roomId)) return true;
  if (world.state.patients.some((p) => p.seat?.roomId === roomId || world.grid.room[p.pos] === roomId)) return true;
  if (world.state.staff.some((s) => s.onSite && (world.grid.room[s.pos] === roomId || (s.task.kind === 'rest' && s.task.roomId === roomId) || (s.task.kind === 'clean' && s.task.roomId === roomId)))) return true;
  return false;
}

/** Final removal once the room is empty. */
export function finalizeDemolition(world: World, roomId: number, causation: string | null): number {
  const room = world.roomById.get(roomId)!;
  const refund = demolitionRefund(room);
  for (const s of world.state.staff) if (s.roomId === roomId) {
    s.roomId = 0;
    s.state = 'UNASSIGNED';
  }
  world.removeRoom(roomId);
  geometryChanged(world);
  post(world, refund, 'refund', `Rivning: ${DEF.room[room.type].nameSv}`, `room:${roomId}`);
  world.emit('ROOM_DEMOLISHED', { roomId, type: room.type, refund }, `room:${roomId}`, causation);
  return refund;
}

export function upgradeCost(room: RoomState): number | null {
  if (room.level >= 3) return null;
  const next = DEF.econ.upgradeLevels[room.level]!;
  return Math.round(room.buildCost * next.costRate);
}

export function upgradeRoom(world: World, roomId: number, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const room = world.roomById.get(roomId);
  if (!room) return { ok: false, errorsSv: ['Rummet finns inte'] };
  const cost = upgradeCost(room);
  if (cost === null) return { ok: false, errorsSv: ['Rummet har redan högsta utrustningsnivå'] };
  if (!canAfford(world, cost)) return { ok: false, errorsSv: [`Kostar ${cost} kr – du har ${world.state.economy.cash} kr`] };
  room.level = (room.level + 1) as 2 | 3;
  room.upgradeCosts.push(cost);
  room.undoable = false;
  world.matchDirty = true;
  post(world, -cost, 'upgrade', `Uppgradering: ${DEF.room[room.type].nameSv} nivå ${room.level}`, `room:${roomId}`);
  world.emit('ROOM_UPGRADED', { roomId, level: room.level, cost }, `room:${roomId}`, causation);
  return { ok: true, errorsSv: [] };
}

/** Sell the top equipment level back (recovery action). */
export function sellEquipment(world: World, roomId: number, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const room = world.roomById.get(roomId);
  if (!room) return { ok: false, errorsSv: ['Rummet finns inte'] };
  if (room.level <= 1 || room.upgradeCosts.length === 0) return { ok: false, errorsSv: ['Det finns ingen extra utrustning att sälja'] };
  if (world.state.reservations.some((r) => r.roomId === roomId && r.status === 'ACTIVE')) return { ok: false, errorsSv: ['Rummet används just nu'] };
  const paid = room.upgradeCosts.pop()!;
  const value = Math.floor(paid * DEF.econ.equipmentSaleRate);
  room.level = (room.level - 1) as 1 | 2;
  world.matchDirty = true;
  post(world, value, 'equipmentSale', `Såld utrustning: ${DEF.room[room.type].nameSv}`, `room:${roomId}`);
  world.emit('ROOM_UPGRADED', { roomId, level: room.level, sold: value }, `room:${roomId}`, causation);
  return { ok: true, errorsSv: [] };
}

export const DOOR_MOVE_COST = 300;

export function moveDoor(world: World, roomId: number, door: { x: number; y: number; dir: Dir }, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const room = world.roomById.get(roomId);
  if (!room) return { ok: false, errorsSv: ['Rummet finns inte'] };
  if (roomOccupied(world, roomId)) return { ok: false, errorsSv: ['Rummet måste vara tomt för att flytta dörren'] };
  const cost = room.used ? DOOR_MOVE_COST : 0;
  if (!canAfford(world, cost)) return { ok: false, errorsSv: [`Kostar ${cost} kr`] };
  // Temporarily remove the room from the grid to validate the new configuration.
  world.removeRoom(roomId);
  world.grid.rebuild(world.state);
  const p = previewRoom(world, room.type, room.x, room.y, room.w, room.h, door, undefined, true);
  world.addRoom(room);
  // keep array order stable by id
  world.state.rooms.sort((a, b) => a.id - b.id);
  if (!p.ok || !p.layout || !p.door) {
    world.grid.rebuild(world.state);
    return { ok: false, errorsSv: p.errorsSv };
  }
  room.door = p.door;
  room.layout = p.layout;
  geometryChanged(world);
  if (cost > 0) post(world, -cost, 'construction', `Ny dörr: ${DEF.room[room.type].nameSv}`, `room:${roomId}`);
  world.emit('DOOR_MOVED', { roomId, door: p.door, cost }, `room:${roomId}`, causation);
  return { ok: true, errorsSv: [] };
}

export function landExpansionCost(stage: number): number | null {
  const next = DEF.econ.landStages[stage + 1];
  return next ? next.cost : null;
}

export function expandLand(world: World, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const stage = world.state.progress.landStage;
  const next = DEF.econ.landStages[stage + 1];
  if (!next) return { ok: false, errorsSv: ['All mark är redan köpt'] };
  if (world.chapter < next.chapter) return { ok: false, errorsSv: [`Nästa markutbyggnad blir tillgänglig i kapitel ${next.chapter}`] };
  if (!canAfford(world, next.cost)) return { ok: false, errorsSv: [`Kostar ${next.cost} kr – du har ${world.state.economy.cash} kr`] };
  world.state.progress.landStage = stage + 1;
  geometryChanged(world);
  post(world, -next.cost, 'land', `Markköp ${next.size}×${next.size}`, 'land');
  world.emit('LAND_EXPANDED', { stage: stage + 1, size: next.size }, null, causation);
  return { ok: true, errorsSv: [] };
}

export function ownedRect(world: World): { x0: number; y0: number; size: number } {
  return landRect(world.state.progress.landStage);
}

export { roomDailyOperation };
