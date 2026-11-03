import { describe, expect, it } from 'vitest';
import { DEF, GAME_DEFINITION } from '../../src/data/definition';
import type { RoomTypeId } from '../../src/data/types';
import { GameEngine } from '../../src/core/engine';
import { World } from '../../src/core/world';
import { LAYOUT_MODULES } from '../../src/systems/layout';
import { roomBuildCost, previewRoom } from '../../src/systems/building';
import { completeChapter } from '../../src/systems/campaign';
import { validateGameState } from '../../src/save/schema';
import { findRoomSpot } from '../../tools/sim/planner';
import { build, cmd, hireQualified, newEngine, sandbox } from '../helpers';
import { fullHospitalRun } from './fullHospital';

const ROOMS = GAME_DEFINITION.rooms;

function engineAtChapter(ch: number): GameEngine {
  const eng = newEngine(41);
  while (eng.world.chapter < ch) completeChapter(eng.world, eng.world.chapter as 1);
  return eng;
}

describe.each(ROOMS.map((r) => [r.id, r.nameSv] as [RoomTypeId, string]))('room %s %s', (id) => {
  const def = DEF.room[id];

  it(`REQ-ROOM-${id}-1 unlock gate`, () => {
    if (def.unlockChapter > 1) {
      const eng = engineAtChapter(def.unlockChapter - 1);
      const p = previewRoom(eng.world, id, 21, 41, Math.max(def.minW, def.minH), Math.max(def.minW, def.minH), null, undefined, true);
      expect(p.errorsSv.join(' ')).toMatch(/låses upp i kapitel/);
    }
    const eng = engineAtChapter(def.unlockChapter);
    const spot = findRoomSpot(eng.world, id, def.minW, def.minH);
    if (spot) expect(previewRoom(eng.world, id, spot.x, spot.y, spot.w, spot.h, null, undefined, true).errorsSv.join(' ')).not.toMatch(/låses upp/);
  });

  it(`REQ-ROOM-${id}-2 minimum placement`, () => {
    const eng = sandbox(42);
    const spot = findRoomSpot(eng.world, id, def.minW, def.minH)!;
    expect(spot).toBeTruthy();
    const tooSmall = previewRoom(eng.world, id, spot.x, spot.y, def.minW - 1, def.minH - 1, null, undefined, true);
    expect(tooSmall.ok).toBe(false);
    expect(tooSmall.errorsSv.join(' ')).toMatch(/Minsta storlek/);
    expect(previewRoom(eng.world, id, spot.x, spot.y, spot.w, spot.h, null, undefined, true).ok).toBe(true);
  });

  it(`REQ-ROOM-${id}-3 furnishing and door generation`, () => {
    const eng = sandbox(43);
    const room = build(eng, id);
    expect(room.layout.stations.length).toBeGreaterThan(0);
    const d = room.door;
    const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[d.dir];
    expect(eng.world.grid.kind[(d.y + out[1]!) * 64 + d.x + out[0]!]).toBe(1);
    const own = new Set(LAYOUT_MODULES[id].items.map((i) => i.sprite));
    expect(room.layout.furniture.some((f) => own.has(f.sprite))).toBe(true);
  });

  it(`REQ-ROOM-${id}-4 correct construction cost and recorded historical cost`, () => {
    const eng = sandbox(44);
    const cash = eng.state.economy.cash;
    const room = build(eng, id);
    const spent = cash - eng.state.economy.cash;
    const corridorSpent = eng.state.economy.transactions.filter((t) => t.category === 'corridor').reduce((s, t) => s - t.amount, 0);
    expect(spent - corridorSpent).toBe(roomBuildCost(id, room.w, room.h));
    expect(room.buildCost).toBe(roomBuildCost(id, room.w, room.h));
  });

  it(`REQ-ROOM-${id}-5 staff eligibility`, () => {
    const eng = sandbox(45);
    const room = build(eng, id);
    const wrongRole = GAME_DEFINITION.roles.find((r) => !def.team.includes(r.id) && !def.team.some((t) => r.substitutesFor.includes(t)))!;
    const wrong = eng.state.candidates.find((c) => c.role === wrongRole.id) ?? (cmd(eng, { type: 'REFRESH_CANDIDATES' }), eng.state.candidates.find((c) => c.role === wrongRole.id))!;
    expect(cmd(eng, { type: 'HIRE_STAFF', candidateId: wrong.id, roomId: room.id }).ok).toBe(false);
    if (def.team.length > 0) {
      for (const role of def.team) expect(hireQualified(eng, role, room)).toBeGreaterThan(0);
    }
  });

  it(`REQ-ROOM-${id}-6 functional use by the simulation`, () => {
    const run = fullHospitalRun();
    const ev = run.events;
    switch (def.stationKind) {
      case 'seat':
        expect(run.eng.world.state.metrics.days.some((d) => (d.roomBusy.R02 ?? 0) > 0)).toBe(true);
        break;
      case 'rest':
        expect(ev.some((e) => e.type === 'STAFF_RESTED' && e.payload.roomType === 'R06')).toBe(true);
        break;
      case 'cleaning':
        expect(ev.some((e) => e.type === 'ROOM_CLEANED')).toBe(true);
        break;
      case 'research':
        expect(run.eng.state.metrics.days.reduce((s, d) => s + d.grpEarned, 0)).toBeGreaterThan(0);
        break;
      default: {
        const done = ev.filter((e) => e.type === 'TREATMENT_COMPLETED' && e.payload.roomType === id);
        expect(done.length, `${id} completed steps`).toBeGreaterThan(0);
        for (const e of done) {
          const roles = e.payload.staffRoles as string[];
          if (def.stationKind !== 'bed') expect(roles.length).toBe(def.team.length);
        }
      }
    }
  });

  it(`REQ-ROOM-${id}-7 closure, upgrade and demolition`, () => {
    const eng = sandbox(46);
    const room = build(eng, id);
    expect(cmd(eng, { type: 'SET_ROOM_OPEN', roomId: room.id, open: false }).ok).toBe(true);
    expect(eng.world.roomById.get(room.id)!.open).toBe(false);
    cmd(eng, { type: 'SET_ROOM_OPEN', roomId: room.id, open: true });
    const cash = eng.state.economy.cash;
    expect(cmd(eng, { type: 'UPGRADE_ROOM', roomId: room.id }).ok).toBe(true);
    expect(cash - eng.state.economy.cash).toBe(Math.round(room.buildCost * 0.4));
    expect(room.level).toBe(2);
    const before = eng.state.economy.cash;
    expect(cmd(eng, { type: 'DEMOLISH_ROOM', roomId: room.id, mode: 'whenEmpty' }).ok).toBe(true);
    eng.runTicks(20);
    expect(eng.world.roomById.has(room.id)).toBe(false);
    const refund = eng.state.economy.cash - before;
    // Unused room: 70 % of construction + upgrade (wages/ops during the 20 ticks are separate transactions).
    const refundTx = eng.state.economy.transactions.filter((t) => t.category === 'refund' && t.ref === `room:${room.id}`);
    expect(refundTx.length).toBe(1);
    expect(refundTx[0]!.amount).toBe(Math.floor((room.buildCost + Math.round(room.buildCost * 0.4)) * 0.7));
    void refund;
  });

  it(`REQ-ROOM-${id}-8 save/load preserves room geometry and layout`, () => {
    const eng = sandbox(47);
    const room = build(eng, id);
    const json = JSON.parse(JSON.stringify(eng.state));
    expect(validateGameState(json)).toEqual([]);
    const w2 = new World(json);
    const r2 = w2.roomById.get(room.id)!;
    expect(r2.layout).toEqual(room.layout);
    expect(Array.from(w2.grid.blocked)).toEqual(Array.from(eng.world.grid.blocked));
    expect(Array.from(w2.grid.room)).toEqual(Array.from(eng.world.grid.room));
  });
});
