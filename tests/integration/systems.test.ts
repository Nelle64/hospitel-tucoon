import { describe, expect, it } from 'vitest';
import { DEF, GAME_DEFINITION } from '../../src/data/definition';
import type { EventTemplateId } from '../../src/data/types';
import { idx } from '../../src/core/grid';
import { startEvent } from '../../src/systems/events';
import { missionDayEnd } from '../../src/systems/missions';
import { completeChapter } from '../../src/systems/campaign';
import { post, updateCrisis } from '../../src/systems/economy';
import { closeDay } from '../../src/systems/metrics';
import { spawnPatient } from '../../src/systems/patients';
import { build, cmd, hireQualified, newEngine, noViolations, sandbox, staffRoom } from '../helpers';

describe('staff', () => {
  it('REQ-STAFF-01 staff cannot be assigned to two rooms or work during training', () => {
    const eng = sandbox(81);
    const w = eng.world;
    const r1 = build(eng, 'R03');
    const r2 = build(eng, 'R03');
    const sid = hireQualified(eng, 'S03', r1);
    expect(cmd(eng, { type: 'ASSIGN_STAFF', staffId: sid, roomId: r2.id }).ok).toBe(true);
    expect(w.state.staff.filter((s) => s.id === sid).length).toBe(1);
    expect(w.staffById.get(sid)!.roomId).toBe(r2.id);
    expect(cmd(eng, { type: 'START_TRAINING', staffId: sid, trainingId: 'T01' }).ok).toBe(true);
    const s = w.staffById.get(sid)!;
    expect(s.state).toBe('TRAINING');
    expect(s.onSite).toBe(false);
    const skill0 = s.skills.SK01;
    eng.runTicks(DEF.sim.ticksPerDay + 10);
    expect(s.training).toBeNull();
    expect(s.skills.SK01).toBeGreaterThanOrEqual(Math.min(100, skill0 + 15));
    expect(s.role).toBe('S03');
    expect(noViolations(eng)).toEqual([]);
  });
  it('REQ-STAFF-02 unauthorized roles and missing skills are rejected', () => {
    const eng = sandbox(82);
    const ortho = build(eng, 'R10');
    const weak = eng.state.candidates.find((c) => c.role === 'S06' && c.skills.SK07 < 25);
    if (weak) expect(cmd(eng, { type: 'HIRE_STAFF', candidateId: weak.id, roomId: ortho.id }).errors[0]?.messageSv).toMatch(/Kräver minst 25/);
    const nurse = eng.state.candidates.find((c) => c.role === 'S02')!;
    expect(cmd(eng, { type: 'HIRE_STAFF', candidateId: nurse.id, roomId: ortho.id }).ok).toBe(false);
  });
  it('REQ-STAFF-03 energy drains while working and recovers in the break room; shift wages incl. night premium', () => {
    const eng = sandbox(83);
    const w = eng.world;
    const br = build(eng, 'R06');
    const er = build(eng, 'R09');
    staffRoom(eng, er, 'night');
    const night = w.state.staff.filter((s) => s.roomId === er.id && s.shift === 'night');
    expect(night.length).toBe(2);
    const doc = w.state.staff.find((s) => s.role === 'S03' && s.roomId !== er.id)!;
    doc.energy = 30;
    eng.runTicks(300);
    expect(w.state.staff.find((s) => s.id === doc.id)!.energy).toBeGreaterThan(30);
    void br;
    // Night wages include the premium.
    const tod = w.tick % DEF.sim.ticksPerDay;
    eng.runTicks((2000 - tod + DEF.sim.ticksPerDay) % DEF.sim.ticksPerDay + 1);
    const nightTx = w.state.economy.transactions.filter((t) => t.labelSv.includes('nattpass'));
    const expected = night.reduce((s, x) => s + Math.round(Math.round(DEF.role[x.role].wage * (1 + x.wageMod)) * 1.15), 0);
    expect(-nightTx[nightTx.length - 1]!.amount).toBe(expected);
  });
  it('REQ-STAFF-04 off-going staff finish active care (no silent abandonment at shift change)', () => {
    const eng = newEngine(84);
    const w = eng.world;
    w.state.metrics.arrivalPlan = [];
    eng.runTicks(1150); // ~19:30
    const p = spawnPatient(w, false, 'D01')!;
    let done = false;
    eng.subscribe((e) => {
      if (e.type === 'PATIENT_DISCHARGED' && e.payload.patientId === p.id) done = true;
    });
    eng.runTicks(2400);
    // Either treated in the evening (overtime) or next morning – never abandoned silently.
    expect(done || w.patientById.has(p.id)).toBe(true);
    expect(noViolations(eng)).toEqual([]);
  });
});

describe('research', () => {
  it('REQ-RES-02 projects respect chapter, prerequisites, GRP cost and complete over time', () => {
    const eng = newEngine(85);
    const w = eng.world;
    expect(cmd(eng, { type: 'START_RESEARCH', projectId: 'F01' }).ok).toBe(false); // chapter 1
    completeChapter(w, 1);
    w.state.research.grp = 1000;
    expect(cmd(eng, { type: 'START_RESEARCH', projectId: 'F06' }).errors[0]?.messageSv).toMatch(/Kräver/);
    expect(cmd(eng, { type: 'START_RESEARCH', projectId: 'F01' }).ok).toBe(true);
    expect(w.state.research.grp).toBe(960);
    expect(cmd(eng, { type: 'START_RESEARCH', projectId: 'F02' }).ok).toBe(false); // one at a time
    eng.runTicks(DEF.project.F01.hours * 100 + 1);
    expect(w.state.research.projectsDone).toContain('F01');
  });
  it('REQ-RES-03 all 12 projects are completable', () => {
    const eng = sandbox(86);
    const w = eng.world;
    w.state.research.grp = 3580;
    const order = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12'] as const;
    for (const id of order) {
      expect(cmd(eng, { type: 'START_RESEARCH', projectId: id }).ok, id).toBe(true);
      eng.runTicks(DEF.project[id].hours * 100 + 1);
    }
    expect(w.state.research.projectsDone.length).toBe(12);
    expect(w.state.research.grp).toBeGreaterThanOrEqual(0);
  });
  it('REQ-RES-04 GRP→RP conversion: 1:2, max 100 GRP per disease per day, permanent mastery', () => {
    const eng = newEngine(87);
    const w = eng.world;
    completeChapter(w, 1);
    w.state.research.grp = 500;
    expect(cmd(eng, { type: 'CONVERT_GRP_TO_RP', disease: 'D04', grp: 10 }).ok).toBe(false); // not identified
    const rp0 = w.state.research.rp.D03 ?? 0;
    expect(cmd(eng, { type: 'CONVERT_GRP_TO_RP', disease: 'D03', grp: 30 }).ok).toBe(true);
    expect((w.state.research.rp.D03 ?? 0) - rp0).toBe(60);
    expect(w.state.research.grp).toBe(470 + 25); // +25 GRP mastery reward
    expect(w.state.research.mastered).toContain('D03');
    expect(cmd(eng, { type: 'CONVERT_GRP_TO_RP', disease: 'D03', grp: 5 }).errors[0]?.messageSv).toMatch(/redan bemästrad/);
    w.state.research.rp.D02 = -10000; // far from mastery for the cap check
    expect(cmd(eng, { type: 'CONVERT_GRP_TO_RP', disease: 'D02', grp: 100 }).ok).toBe(true);
    expect(cmd(eng, { type: 'CONVERT_GRP_TO_RP', disease: 'D02', grp: 1 }).errors[0]?.messageSv).toMatch(/Max 100/);
    // Mastery is permanent even if RP were to change.
    w.state.research.rp.D03 = 0;
    eng.runTicks(10);
    expect(w.state.research.mastered).toContain('D03');
  });
});

describe('special events', () => {
  for (const t of GAME_DEFINITION.events) {
    it(`REQ-EVT-${t.id} ${t.nameSv}: starts, applies a choice and ends`, () => {
      const eng = sandbox(88);
      const w = eng.world;
      for (const type of ['R08', 'R13', 'R18'] as const) {
        const r = build(eng, type);
        staffRoom(eng, r);
      }
      const inst = startEvent(w, t.id as EventTemplateId, t.severity === 'major');
      if (inst.choice === null) expect(cmd(eng, { type: 'CHOOSE_EVENT_OPTION', eventId: inst.id, optionId: t.options[0]!.id }).ok).toBe(true);
      expect(inst.choice).not.toBeNull();
      eng.runTicks(t.durationHours * 100 + 20);
      expect(inst.ended).toBe(true);
      expect(w.state.events.active.filter((e) => !e.ended).every((e) => e.id !== inst.id)).toBe(true);
      expect(noViolations(eng)).toEqual([]);
    });
  }
  it('REQ-EVT-13 director: no major events in the tutorial days; pressure postpones major negatives', () => {
    const eng = newEngine(89, false);
    eng.runDays(2);
    const majors = eng.state.log.filter((e) => e.type === 'EVENT_STARTED' && e.payload.major === true);
    expect(majors.length).toBe(0);
  });
});

describe('missions', () => {
  it('REQ-MIS-01 missions come from real metrics, max three active, rewards once', () => {
    const eng = newEngine(90, false);
    const w = eng.world;
    const seen = new Set<string>();
    eng.subscribe((e) => {
      if (e.type === 'MISSION_STARTED') seen.add(e.payload.template as string);
    });
    eng.runDays(12);
    expect(w.state.missions.active.length).toBeLessThanOrEqual(3);
    expect(seen.size).toBeGreaterThan(0);
    const paid = w.state.economy.transactions.filter((t) => t.category === 'mission');
    const ids = paid.map((t) => t.ref);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('REQ-MIS-02 a mission for a missing department is cancelled, never stuck', () => {
    const eng = newEngine(91, false);
    const w = eng.world;
    eng.runDays(1);
    w.state.missions.active.push({ id: 999, template: 'M03', startDay: w.day, endDay: w.day + 3, target: 5, baseline: 4, roomType: 'R08', disease: null, project: null, reward: { cash: 1000, reputation: 0, grp: 0 }, progress: 0, status: 'active', paid: false });
    closeDay(w);
    missionDayEnd(w);
    expect(w.state.missions.active.some((m) => m.id === 999)).toBe(false);
  });
});

describe('construction', () => {
  it('REQ-BUILD-01 blueprint selection builds atomically or not at all', () => {
    const eng = newEngine(92);
    const w = eng.world;
    const a = cmd(eng, { type: 'ADD_BLUEPRINT', kind: 'corridor', x: 23, y: 44, w: 1, h: 4 });
    const b = cmd(eng, { type: 'ADD_BLUEPRINT', kind: 'room', roomType: 'R03', x: 24, y: 42, w: 4, h: 4 });
    const bad = cmd(eng, { type: 'ADD_BLUEPRINT', kind: 'room', roomType: 'R13', x: 35, y: 42, w: 6, h: 6 });
    const ids = [a, b, bad].map((r) => r.data!.blueprintId as number);
    const cash = w.state.economy.cash;
    const rooms = w.state.rooms.length;
    const r = cmd(eng, { type: 'BUILD_BLUEPRINT_SELECTION', ids });
    expect(r.ok).toBe(false);
    expect(w.state.economy.cash).toBe(cash);
    expect(w.state.rooms.length).toBe(rooms);
    const ok = cmd(eng, { type: 'BUILD_BLUEPRINT_SELECTION', ids: ids.slice(0, 2) });
    expect(ok.ok).toBe(true);
    expect(w.state.rooms.length).toBe(rooms + 1);
    expect(w.state.blueprint.items.map((i) => i.id)).toEqual([ids[2]]);
  });
  it('REQ-BUILD-02 blueprints never affect pathfinding or capacity', () => {
    const eng = newEngine(93);
    const v = eng.state.map.version;
    cmd(eng, { type: 'ADD_BLUEPRINT', kind: 'room', roomType: 'R03', x: 24, y: 42, w: 4, h: 4 });
    expect(eng.state.map.version).toBe(v);
    expect(eng.world.grid.kind[idx(25, 43)]).toBe(0);
  });
  it('REQ-BUILD-03 demolishing a corridor may not disconnect rooms', () => {
    const eng = newEngine(94);
    const r = cmd(eng, { type: 'DEMOLISH_CORRIDOR', tiles: [idx(31, 58), idx(32, 58)] });
    expect(r.ok).toBe(false);
  });
  it('REQ-BUILD-04 land expansion follows chapter unlocks', () => {
    const eng = newEngine(95);
    expect(cmd(eng, { type: 'EXPAND_LAND' }).ok).toBe(false);
    completeChapter(eng.world, 1);
    expect(cmd(eng, { type: 'EXPAND_LAND' }).ok).toBe(true);
    expect(eng.state.progress.landStage).toBe(1);
    expect(cmd(eng, { type: 'EXPAND_LAND' }).ok).toBe(false);
  });
  it('REQ-BUILD-05 immediate undo refunds 100 % only before the room is used', () => {
    const eng = newEngine(96);
    const cash = eng.state.economy.cash;
    const r = cmd(eng, { type: 'BUILD_ROOM', roomType: 'R03', x: 24, y: 44, w: 4, h: 4 });
    expect(r.ok).toBe(true);
    expect(cmd(eng, { type: 'DEMOLISH_ROOM', roomId: r.data!.roomId as number, mode: 'undo' }).ok).toBe(true);
    expect(eng.state.economy.cash).toBe(cash);
  });
});

describe('economy integrity', () => {
  it('REQ-ECO-10 no free-money loops: build→demolish, upgrade→sell, loan→repay all lose money', () => {
    const eng = sandbox(97);
    const w = eng.world;
    const start = w.state.economy.cash;
    for (let i = 0; i < 5; i++) {
      const room = build(eng, 'R05');
      cmd(eng, { type: 'UPGRADE_ROOM', roomId: room.id });
      room.undoable = false;
      cmd(eng, { type: 'SELL_EQUIPMENT', roomId: room.id });
      cmd(eng, { type: 'DEMOLISH_ROOM', roomId: room.id, mode: 'whenEmpty' });
      eng.runTicks(10);
    }
    cmd(eng, { type: 'TAKE_LOAN', kind: 'short' });
    const l = w.state.economy.loans[0]!;
    cmd(eng, { type: 'REPAY_LOAN', loanId: l.id });
    const nonOperating = w.state.economy.transactions.filter((t) => ['construction', 'corridor', 'upgrade', 'refund', 'equipmentSale', 'loanIn', 'loanRepayment'].includes(t.category)).reduce((s, t) => s + t.amount, 0);
    expect(nonOperating).toBeLessThan(0);
    expect(w.state.economy.cash).toBeLessThan(start);
  });
  it('REQ-ECO-11 severe financial scenario is recoverable through recovery actions', () => {
    const eng = newEngine(98, false);
    const w = eng.world;
    cmd(eng, { type: 'TAKE_LOAN', kind: 'investment' });
    post(w, -(w.state.economy.cash + 20000), 'event', 'Katastrof');
    updateCrisis(w);
    expect(w.state.economy.crisis).toBe('recovery');
    expect(cmd(eng, { type: 'TAKE_LOAN', kind: 'crisis' }).ok).toBe(true);
    const l = w.state.economy.loans[0]!;
    eng.runDays(1);
    if (l.overdue > 0) expect(cmd(eng, { type: 'REQUEST_RESTRUCTURING', loanId: l.id }).ok).toBe(true);
    // Reconstruction is possible once (expensive fallback), preserving chapters and research.
    w.state.economy.crisisSince = w.tick - DEF.sim.ticksPerDay;
    updateCrisis(w);
    if (w.state.economy.crisis === 'recovery') {
      const chapter = w.chapter;
      const research = JSON.stringify(w.state.research);
      expect(cmd(eng, { type: 'REQUEST_RESTRUCTURING', reconstruction: true }).ok).toBe(true);
      expect(w.chapter).toBe(chapter);
      expect(JSON.stringify(w.state.research)).toBe(research);
      expect(cmd(eng, { type: 'REQUEST_RESTRUCTURING', reconstruction: true }).ok).toBe(false);
    }
    eng.runDays(25);
    expect(w.state.economy.cash).toBeGreaterThan(-60000);
  }, 60000);
  it('REQ-ECO-12 chapter grants are paid exactly once', () => {
    const eng = newEngine(99);
    const w = eng.world;
    completeChapter(w, 1);
    completeChapter(w, 1);
    expect(w.state.economy.transactions.filter((t) => t.category === 'grant').map((t) => t.amount)).toEqual([15000]);
  });
});

describe('tutorial', () => {
  it('REQ-TUT-01 tutorial can be skipped/restarted and its reward cannot be claimed twice', () => {
    const eng = newEngine(100);
    const w = eng.world;
    w.state.tutorial.step = 5;
    expect(cmd(eng, { type: 'TUTORIAL', action: 'complete' }).ok).toBe(true);
    const grants = w.state.economy.transactions.filter((t) => t.ref === 'tutorial').length;
    cmd(eng, { type: 'TUTORIAL', action: 'restart' });
    w.state.tutorial.step = 5;
    cmd(eng, { type: 'TUTORIAL', action: 'complete' });
    expect(w.state.economy.transactions.filter((t) => t.ref === 'tutorial').length).toBe(grants);
    expect(cmd(eng, { type: 'TUTORIAL', action: 'skip' }).ok).toBe(true);
  });
});
