import { describe, expect, it } from 'vitest';
import { GAME_DEFINITION } from '../../src/data/definition';
import type { Dir } from '../../src/core/state';
import { generateLayout } from '../../src/systems/layout';

function doors(x: number, y: number, w: number, h: number) {
  const out: { x: number; y: number; dir: Dir }[] = [];
  for (let i = 0; i < w; i++) out.push({ x: x + i, y, dir: 'N' }, { x: x + i, y: y + h - 1, dir: 'S' });
  for (let j = 0; j < h; j++) out.push({ x, y: y + j, dir: 'W' }, { x: x + w - 1, y: y + j, dir: 'E' });
  return out;
}

describe('automatic furnishing', () => {
  for (const r of GAME_DEFINITION.rooms) {
    it(`REQ-ROOM-LAYOUT ${r.id} ${r.nameSv}: every door position at minimum size yields a reachable layout`, () => {
      for (const [w, h] of [[r.minW, r.minH], [r.minH, r.minW], [r.minW + 2, r.minH + 1]] as [number, number][]) {
        for (const d of doors(10, 10, w, h)) {
          const res = generateLayout({ type: r.id, x: 10, y: 10, w, h, door: d });
          expect(res.ok, `${r.id} ${w}x${h} door ${d.x},${d.y},${d.dir}`).toBe(true);
          const lay = res.layout!;
          expect(lay.stations.length).toBeGreaterThan(0);
          const blocked = new Set(lay.blocked);
          const doorTile = d.y * 64 + d.x;
          expect(blocked.has(doorTile)).toBe(false);
          // BFS from the door over walkable room tiles reaches every interaction point.
          const inRoom = (t: number) => t % 64 >= 10 && t % 64 < 10 + w && Math.floor(t / 64) >= 10 && Math.floor(t / 64) < 10 + h;
          const seen = new Set([doorTile]);
          const q = [doorTile];
          while (q.length) {
            const t = q.pop()!;
            for (const n of [t - 1, t + 1, t - 64, t + 64]) {
              if (!inRoom(n) || blocked.has(n) || seen.has(n)) continue;
              if ((n === t - 1 || n === t + 1) && Math.floor(n / 64) !== Math.floor(t / 64)) continue;
              seen.add(n);
              q.push(n);
            }
          }
          for (const st of lay.stations) {
            if (st.patientTile >= 0) expect(seen.has(st.patientTile)).toBe(true);
            for (const s of st.staffTiles) expect(seen.has(s)).toBe(true);
          }
          for (const f of lay.furniture) expect(f.sprite.length).toBeGreaterThan(0);
        }
      }
    });
  }
  it('is deterministic', () => {
    const a = generateLayout({ type: 'R14', x: 5, y: 5, w: 7, h: 6, door: { x: 5, y: 7, dir: 'W' } });
    const b = generateLayout({ type: 'R14', x: 5, y: 5, w: 7, h: 6, door: { x: 5, y: 7, dir: 'W' } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
