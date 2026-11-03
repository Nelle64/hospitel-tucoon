import { describe, expect, it } from 'vitest';
import { idx } from '../../src/core/grid';
import { findPath, navStats } from '../../src/systems/navigation';
import { newEngine, cmd } from '../helpers';

describe('navigation', () => {
  it('REQ-NAV-01 A* finds corridor routes from the entrance to a station', () => {
    const eng = newEngine();
    const w = eng.world;
    const consult = w.state.rooms.find((r) => r.type === 'R03')!;
    const target = consult.layout.stations[0]!.patientTile;
    const p = findPath(w, w.state.map.entrance, target, [consult.id]);
    expect(p).not.toBeNull();
    expect(p![p!.length - 1]).toBe(target);
    // Each step is 4-connected.
    let prev = w.state.map.entrance;
    for (const t of p!) {
      expect([1, 64]).toContain(Math.abs(t - prev));
      prev = t;
    }
  });
  it('REQ-NAV-02 patients never use other care rooms as shortcuts', () => {
    const eng = newEngine();
    const w = eng.world;
    const consult = w.state.rooms.find((r) => r.type === 'R03')!;
    const treat = w.state.rooms.find((r) => r.type === 'R05')!;
    const p = findPath(w, consult.layout.stations[0]!.patientTile, treat.layout.stations[0]!.patientTile, [treat.id])!;
    for (const t of p) {
      const room = w.grid.room[t];
      expect([0, consult.id, treat.id]).toContain(room);
    }
  });
  it('REQ-NAV-03 unreachable target returns null and blocked furniture is avoided', () => {
    const eng = newEngine();
    const w = eng.world;
    expect(findPath(w, w.state.map.entrance, idx(0, 0), [])).toBeNull();
    const consult = w.state.rooms.find((r) => r.type === 'R03')!;
    const p = findPath(w, w.state.map.entrance, consult.layout.stations[0]!.staffTiles[0]!, [consult.id])!;
    for (const t of p) expect(w.grid.blocked[t]).toBe(0);
  });
  it('REQ-NAV-04 path cache is invalidated by geometry changes', () => {
    const eng = newEngine();
    const w = eng.world;
    const a = findPath(w, w.state.map.entrance, idx(23, 48), []);
    findPath(w, w.state.map.entrance, idx(23, 48), []);
    expect(navStats(w).hits).toBeGreaterThan(0);
    const v = w.state.map.version;
    expect(cmd(eng, { type: 'BUILD_CORRIDOR', tiles: [idx(23, 47), idx(23, 46)] }).ok).toBe(true);
    expect(w.state.map.version).toBe(v + 1);
    const b = findPath(w, w.state.map.entrance, idx(23, 46), []);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});
