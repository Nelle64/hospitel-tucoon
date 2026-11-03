import { DEF } from '../data/definition';
import type { RoomTypeId } from '../data/types';
import { idx } from '../core/grid';
import type { Dir, Facing, FurnitureItem, RoomLayout, StationState } from '../core/state';

/**
 * Station module in canonical orientation.
 * Grid legend: '#' blocked furniture, '.' free walkable, 'P' patient point, 'S'/'T' staff slot 0/1, '?' unconstrained.
 */
interface ModuleDef {
  grid: string[];
  items: { sprite: string; x: number; y: number; w: number; h: number; blocks: boolean }[];
  pose: 'stand' | 'sit' | 'lie';
  patientFacing: Facing;
  /** Pose position for the patient in local module coordinates (tile units, centre of tile = +0.5). */
  poseAt?: [number, number];
  /** Station has no patient point (analysis/research/cleaning/rest). */
  noPatient?: boolean;
}

const M: Record<RoomTypeId, ModuleDef> = {
  R01: { grid: ['S?', '##', 'P?'], items: [{ sprite: 'desk_reception', x: 0, y: 1, w: 2, h: 1, blocks: true }], pose: 'stand', patientFacing: 'up' },
  R02: { grid: ['P'], items: [{ sprite: 'chair_waiting', x: 0, y: 0, w: 1, h: 1, blocks: false }], pose: 'sit', patientFacing: 'down' },
  R03: { grid: ['S?', '##', 'P?'], items: [{ sprite: 'desk_doctor', x: 0, y: 1, w: 2, h: 1, blocks: true }, { sprite: 'chair_patient', x: 0, y: 2, w: 1, h: 1, blocks: false }], pose: 'sit', patientFacing: 'up' },
  R04: { grid: ['#S', '.P'], items: [{ sprite: 'cart_samples', x: 0, y: 0, w: 1, h: 1, blocks: true }, { sprite: 'blood_chair', x: 1, y: 1, w: 1, h: 1, blocks: false }], pose: 'sit', patientFacing: 'left' },
  R05: { grid: ['#S', '#P'], items: [{ sprite: 'treat_bed', x: 0, y: 0, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [0.5, 0.9] },
  R06: { grid: ['#', 'S'], items: [{ sprite: 'armchair', x: 0, y: 0, w: 1, h: 1, blocks: true }], pose: 'sit', patientFacing: 'down', poseAt: [0.5, 0.6], noPatient: true },
  R07: { grid: ['##', 'S?'], items: [{ sprite: 'lab_bench', x: 0, y: 0, w: 2, h: 1, blocks: true }], pose: 'stand', patientFacing: 'up', noPatient: true },
  R08: { grid: ['##c', '##S', 'P..'], items: [{ sprite: 'xray_machine', x: 0, y: 0, w: 2, h: 2, blocks: true }, { sprite: 'xray_console', x: 2, y: 0, w: 1, h: 1, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.0, 1.0] },
  R09: { grid: ['S#T', '.#P'], items: [{ sprite: 'er_bed', x: 1, y: 0, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.5, 0.9] },
  R10: { grid: ['S#.', 'P#c'], items: [{ sprite: 'ortho_table', x: 1, y: 0, w: 1, h: 2, blocks: true }, { sprite: 'cast_station', x: 2, y: 1, w: 1, h: 1, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.5, 0.9] },
  R11: { grid: ['S#', '##', 'P?'], items: [{ sprite: 'shelf_meds', x: 1, y: 0, w: 1, h: 1, blocks: true }, { sprite: 'pharmacy_counter', x: 0, y: 1, w: 2, h: 1, blocks: true }], pose: 'stand', patientFacing: 'up' },
  R12: { grid: ['##', 'S?'], items: [{ sprite: 'shelf_supplies', x: 0, y: 0, w: 2, h: 1, blocks: true }], pose: 'stand', patientFacing: 'up', noPatient: true },
  R13: { grid: ['?a?', 'S#T', '.#P'], items: [{ sprite: 'anesthesia', x: 1, y: 0, w: 1, h: 1, blocks: true }, { sprite: 'op_table', x: 1, y: 1, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.5, 1.9] },
  R14: { grid: ['#P', '#S'], items: [{ sprite: 'ward_bed', x: 0, y: 0, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [0.5, 0.9] },
  R15: { grid: ['m#P', '?#S'], items: [{ sprite: 'icu_monitor', x: 0, y: 0, w: 1, h: 1, blocks: true }, { sprite: 'icu_bed', x: 1, y: 0, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.5, 0.9] },
  R16: { grid: ['##', 'S?'], items: [{ sprite: 'research_bench', x: 0, y: 0, w: 2, h: 1, blocks: true }], pose: 'stand', patientFacing: 'up', noPatient: true },
  R17: { grid: ['S##', 'T##', '.P.'], items: [{ sprite: 'exp_pod', x: 1, y: 0, w: 2, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [2.0, 1.0] },
  R18: { grid: ['S#r', 'T#r', '.P.'], items: [{ sprite: 'robot_table', x: 1, y: 0, w: 1, h: 2, blocks: true }, { sprite: 'robot_arm', x: 2, y: 0, w: 1, h: 2, blocks: true }], pose: 'lie', patientFacing: 'down', poseAt: [1.5, 0.9] },
};

const DECOR: Record<RoomTypeId, string[]> = {
  R01: ['plant', 'sign_reception', 'bin'],
  R02: ['plant', 'water_cooler', 'magazine_table', 'plant', 'bin'],
  R03: ['cabinet', 'exam_couch', 'plant', 'skeleton_chart'],
  R04: ['fridge_samples', 'cabinet', 'sink'],
  R05: ['cart_meds', 'cabinet', 'sink', 'plant'],
  R06: ['coffee_machine', 'fridge', 'round_table', 'plant', 'vending'],
  R07: ['centrifuge', 'fridge_lab', 'microscope_desk', 'sink'],
  R08: ['lead_screen', 'cabinet', 'lightbox'],
  R09: ['defibrillator', 'crash_cart', 'monitor_stand', 'cabinet'],
  R10: ['skeleton', 'crutch_rack', 'cabinet', 'lightbox'],
  R11: ['shelf_meds', 'shelf_meds', 'fridge_meds', 'plant'],
  R12: ['cleaning_cart', 'washer', 'bucket'],
  R13: ['instrument_tray', 'monitor_stand', 'sink', 'cabinet'],
  R14: ['bedside_table', 'curtain', 'plant', 'cabinet'],
  R15: ['ventilator', 'monitor_stand', 'cabinet'],
  R16: ['chem_rack', 'computer_research', 'fridge_lab', 'whiteboard'],
  R17: ['tesla_coil', 'exp_console', 'chem_rack', 'whiteboard'],
  R18: ['robot_console', 'server_rack', 'robot_dock'],
};

interface PlacedModule {
  ax: number;
  ay: number;
  mirror: boolean;
  def: ModuleDef;
}

function cellAt(def: ModuleDef, mx: number, my: number, mirror: boolean): string {
  const row = def.grid[my]!;
  return row[mirror ? row.length - 1 - mx : mx] ?? '?';
}

export interface LayoutRequest {
  type: RoomTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number; dir: Dir };
}

export interface LayoutResult {
  ok: boolean;
  layout?: RoomLayout;
  reasonSv?: string;
}

/** Number of stations a room type should generate at most (before physical fit). */
function stationCap(type: RoomTypeId, w: number, h: number): number {
  const def = DEF.room[type];
  const area = w * h;
  switch (def.stationKind) {
    case 'seat':
      return Math.min(def.maxStations, 10);
    case 'rest':
      return Math.min(def.maxStations, 4 + Math.max(0, Math.floor((area - 16) / 6)));
    case 'bed':
      return def.maxStations;
    case 'registration':
      return Math.min(def.maxStations, 1 + Math.floor(Math.max(0, w * h - 12) / 12));
    default: {
      const minArea = def.minW * def.minH;
      return Math.min(def.maxStations, area >= minArea * 2 ? 2 : 1);
    }
  }
}

/**
 * Deterministic furnishing. Templates differ by scan origin (the wall opposite the door is filled first),
 * with fallbacks for awkward door positions. Returns blocked tiles, interaction points and sprite placement.
 */
export function generateLayout(req: LayoutRequest): LayoutResult {
  const { type, w, h } = req;
  const def = M[type];
  const doorLx = req.door.x - req.x;
  const doorLy = req.door.y - req.y;
  if (doorLx < 0 || doorLy < 0 || doorLx >= w || doorLy >= h) return { ok: false, reasonSv: 'Dörren ligger utanför rummet' };
  const cap = stationCap(type, w, h);
  const opposite: Record<Dir, string> = { N: 'fromS', S: 'fromN', E: 'fromW', W: 'fromE' };
  const templates = [opposite[req.door.dir], 'fromN', 'fromS', 'fromW', 'fromE'];
  const tried = new Set<string>();
  let best: { layout: RoomLayout; stations: number } | null = null;
  for (const t of templates) {
    if (tried.has(t)) continue;
    tried.add(t);
    const res = tryTemplate(req, def, cap, t, doorLx, doorLy);
    if (res && (!best || res.stations > best.stations)) best = res;
    if (best && best.stations >= cap) break;
  }
  if (!best || best.stations === 0) return { ok: false, reasonSv: 'Inredningen får inte plats – prova en annan storlek eller dörrplacering' };
  return { ok: true, layout: best.layout };
}

function tryTemplate(req: LayoutRequest, def: ModuleDef, cap: number, template: string, doorLx: number, doorLy: number): { layout: RoomLayout; stations: number } | null {
  const { w, h } = req;
  // occ: 0 free, 1 blocked, 2 reserved walkable (point or aisle), 3 door clearance
  const occ = new Uint8Array(w * h);
  occ[doorLy * w + doorLx] = 3;
  // Also keep the tile next to the door (inwards) clear so the doorway never gets congested by furniture.
  const inward: Record<Dir, [number, number]> = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] };
  const [ix, iy] = inward[req.door.dir];
  const nx = doorLx + ix;
  const ny = doorLy + iy;
  if (nx >= 0 && ny >= 0 && nx < w && ny < h && w * h > 12) occ[ny * w + nx] = 3;
  const mh = def.grid.length;
  const mw = def.grid[0]!.length;
  const anchors: [number, number][] = [];
  for (let ay = 0; ay + mh <= h; ay++) for (let ax = 0; ax + mw <= w; ax++) anchors.push([ax, ay]);
  const key = (a: [number, number]) => {
    switch (template) {
      case 'fromS': return [-(a[1] + mh), a[0]] as const;
      case 'fromW': return [a[0], a[1]] as const;
      case 'fromE': return [-(a[0] + mw), a[1]] as const;
      default: return [a[1], a[0]] as const;
    }
  };
  const vertical = template === 'fromW' || template === 'fromE';
  anchors.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (vertical) return ka[0] - kb[0] || ka[1] - kb[1];
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
  const placed: PlacedModule[] = [];
  for (const [ax, ay] of anchors) {
    if (placed.length >= cap) break;
    for (const mirror of [false, true]) {
      if (!fits(def, ax, ay, mirror, occ, w)) continue;
      const snapshot = occ.slice();
      stamp(def, ax, ay, mirror, occ, w);
      const pm: PlacedModule = { ax, ay, mirror, def };
      if (reachableAll([...placed, pm], occ, w, h, doorLx, doorLy)) {
        placed.push(pm);
        break;
      }
      occ.set(snapshot);
    }
  }
  if (placed.length === 0) return null;

  const furniture: FurnitureItem[] = [];
  const stations: StationState[] = [];
  const roomDef = DEF.room[req.type];
  placed.forEach((pm, si) => {
    let pTile = -1;
    const staffTiles: number[] = [];
    let sTile = -1;
    let tTile = -1;
    for (let my = 0; my < mh; my++)
      for (let mx = 0; mx < mw; mx++) {
        const c = cellAt(pm.def, mx, my, pm.mirror);
        const gx = req.x + pm.ax + mx;
        const gy = req.y + pm.ay + my;
        if (c === 'P') pTile = idx(gx, gy);
        if (c === 'S') sTile = idx(gx, gy);
        if (c === 'T') tTile = idx(gx, gy);
      }
    if (sTile >= 0) staffTiles.push(sTile);
    if (tTile >= 0) staffTiles.push(tTile);
    for (const it of pm.def.items) {
      const lx = pm.mirror ? mw - it.x - it.w : it.x;
      furniture.push({ sprite: it.sprite, x: req.x + pm.ax + lx, y: req.y + pm.ay + it.y, w: it.w, h: it.h, blocks: it.blocks, station: si });
    }
    let poseX: number;
    let poseY: number;
    if (pm.def.poseAt) {
      const px = pm.mirror ? mw - pm.def.poseAt[0] : pm.def.poseAt[0];
      poseX = req.x + pm.ax + px;
      poseY = req.y + pm.ay + pm.def.poseAt[1];
    } else {
      const t = pm.def.noPatient ? staffTiles[0]! : pTile;
      poseX = (t % 64) + 0.5;
      poseY = Math.floor(t / 64) + 0.5;
    }
    let facing: Facing = pm.def.patientFacing;
    if (pm.mirror && facing === 'left') facing = 'right';
    if (roomDef.stationKind === 'seat') facing = pm.ay + req.y < req.y + h / 2 ? 'down' : 'up';
    stations.push({
      id: si,
      kind: roomDef.stationKind,
      patientTile: pm.def.noPatient ? -1 : pTile,
      staffTiles,
      pose: pm.def.pose,
      facing,
      poseX,
      poseY,
    });
  });

  // Decorations along walls, never breaking reachability of any interaction point.
  const decor = DECOR[req.type];
  const maxDecor = Math.min(decor.length, Math.floor((w * h) / 7));
  let di = 0;
  const wallTiles: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wallTiles.push([x, y]);
  // Prefer the top wall (visible wall face), then corners.
  wallTiles.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of wallTiles) {
    if (di >= maxDecor) break;
    const i = y * w + x;
    if (occ[i] !== 0) continue;
    occ[i] = 1;
    if (reachableAll(placed, occ, w, h, doorLx, doorLy) && freeCount(occ) >= 2) {
      furniture.push({ sprite: decor[di]!, x: req.x + x, y: req.y + y, w: 1, h: 1, blocks: true, station: -1 });
      di++;
    } else occ[i] = 0;
  }

  const blocked: number[] = [];
  const idle: number[] = [];
  const points = new Set<number>();
  for (const s of stations) {
    if (s.patientTile >= 0) points.add(s.patientTile);
    s.staffTiles.forEach((t) => points.add(t));
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gi = idx(req.x + x, req.y + y);
      if (occ[y * w + x] === 1) blocked.push(gi);
      else if (!points.has(gi) && !(x === doorLx && y === doorLy)) idle.push(gi);
    }
  // Ensure idle tiles are reachable too (filter unreachable pockets).
  const reach = bfs(occ, w, h, doorLx, doorLy);
  const idleTiles = idle.filter((gi) => reach[((Math.floor(gi / 64) - req.y) * w) + ((gi % 64) - req.x)] === 1);
  return {
    layout: { template, furniture, stations, blocked, idleTiles },
    stations: stations.length,
  };
}

function freeCount(occ: Uint8Array): number {
  let n = 0;
  for (const v of occ) if (v === 0) n++;
  return n;
}

function fits(def: ModuleDef, ax: number, ay: number, mirror: boolean, occ: Uint8Array, w: number): boolean {
  for (let my = 0; my < def.grid.length; my++)
    for (let mx = 0; mx < def.grid[0]!.length; mx++) {
      const c = cellAt(def, mx, my, mirror);
      if (c === '?') continue;
      const v = occ[(ay + my) * w + (ax + mx)]!;
      if (v === 3) {
        // Door clearance may only host '.' aisles.
        if (c !== '.') return false;
        continue;
      }
      if (v === 1) return false;
      if (v === 2 && c !== '.') return false;
      if (v === 2 && c === '.') continue;
    }
  return true;
}

function stamp(def: ModuleDef, ax: number, ay: number, mirror: boolean, occ: Uint8Array, w: number): void {
  for (let my = 0; my < def.grid.length; my++)
    for (let mx = 0; mx < def.grid[0]!.length; mx++) {
      const c = cellAt(def, mx, my, mirror);
      const i = (ay + my) * w + (ax + mx);
      if (c === '?') continue;
      if (occ[i] === 3) continue;
      if (c === '.' || c === 'P' || c === 'S' || c === 'T') occ[i] = 2;
      else occ[i] = 1;
    }
}

function bfs(occ: Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const q: number[] = [sy * w + sx];
  seen[sy * w + sx] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const n of nb) {
      if (n < 0 || seen[n] || occ[n] === 1) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

function reachableAll(placed: PlacedModule[], occ: Uint8Array, w: number, h: number, dx: number, dy: number): boolean {
  const seen = bfs(occ, w, h, dx, dy);
  for (const pm of placed) {
    const mh = pm.def.grid.length;
    const mw = pm.def.grid[0]!.length;
    for (let my = 0; my < mh; my++)
      for (let mx = 0; mx < mw; mx++) {
        const c = cellAt(pm.def, mx, my, pm.mirror);
        if (c === 'P' || c === 'S' || c === 'T') if (!seen[(pm.ay + my) * w + (pm.ax + mx)]) return false;
      }
  }
  return true;
}

export const LAYOUT_MODULES = M;
export const LAYOUT_DECOR = DECOR;
