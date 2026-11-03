import { describe, expect, it } from 'vitest';
import { DEF } from '../../src/data/definition';
import { makeInstallments, post, roomDailyOperation, staffWage, takeLoan, loanRemaining, collectInstallments, updateCrisis, projectedCash } from '../../src/systems/economy';
import { roomBuildCost, upgradeCost, demolitionRefund } from '../../src/systems/building';
import { cmd, newEngine } from '../helpers';

describe('economy', () => {
  it('REQ-ECO-01 money only changes through auditable integer transactions', () => {
    const eng = newEngine();
    const w = eng.world;
    const before = w.state.economy.cash;
    const n = w.state.economy.transactions.length;
    post(w, -123, 'material', 'test', 'x');
    expect(w.state.economy.cash).toBe(before - 123);
    expect(w.state.economy.transactions.length).toBe(n + 1);
    expect(() => post(w, 1.5, 'material', 'bad')).toThrow();
  });
  it('REQ-ECO-02 build cost = base + area × per tile; daily op = base + 2 kr × area', () => {
    expect(roomBuildCost('R03', 4, 4)).toBe(3000 + 16 * 200);
    expect(roomBuildCost('R13', 6, 6)).toBe(18000 + 36 * 550);
    const eng = newEngine();
    const consult = eng.world.state.rooms.find((r) => r.type === 'R03')!;
    expect(roomDailyOperation(eng.world, consult.id)).toBe(120 + 2 * 16);
    consult.open = false;
    expect(roomDailyOperation(eng.world, consult.id)).toBe(Math.round((120 + 32) * 0.4));
  });
  it('REQ-ECO-03 wages per shift with 15 % night premium', () => {
    expect(staffWage(1200, 0, 'day')).toBe(1200);
    expect(staffWage(1200, 0, 'night')).toBe(1380);
    expect(staffWage(650, 0.1, 'night')).toBe(Math.round(715 * 1.15));
  });
  it('REQ-ECO-04 loan installments sum exactly to principal + fixed fee', () => {
    for (const l of DEF.econ.loans) {
      const total = l.principal + Math.round(l.principal * l.feeRate);
      const inst = makeInstallments(total, l.termDays);
      expect(inst.length).toBe(l.termDays);
      expect(inst.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('REQ-ECO-05 at most two ordinary loans; overdue blocks new loans; crisis loan only in crisis', () => {
    const eng = newEngine();
    const w = eng.world;
    expect(takeLoan(w, 'short').ok).toBe(true);
    expect(takeLoan(w, 'investment').ok).toBe(true);
    expect(takeLoan(w, 'short').ok).toBe(false);
    expect(takeLoan(w, 'crisis').ok).toBe(false);
    // Make the next installments overdue.
    post(w, -w.state.economy.cash, 'event', 'drain');
    collectInstallments(w);
    expect(w.state.economy.loans.some((l) => l.overdue > 0)).toBe(true);
    updateCrisis(w);
    expect(w.state.economy.crisis).toBe('recovery');
    expect(takeLoan(w, 'crisis').ok).toBe(true);
  });
  it('REQ-ECO-06 repaying a loan costs exactly the remaining amount', () => {
    const eng = newEngine();
    const w = eng.world;
    takeLoan(w, 'investment');
    const l = w.state.economy.loans[0]!;
    const rem = loanRemaining(l);
    const cash = w.state.economy.cash;
    expect(cmd(eng, { type: 'REPAY_LOAN', loanId: l.id }).ok).toBe(true);
    expect(w.state.economy.cash).toBe(cash - rem);
    expect(loanRemaining(l)).toBe(0);
  });
  it('REQ-ECO-07 upgrade costs use the recorded historical build cost', () => {
    const eng = newEngine();
    const room = eng.world.state.rooms.find((r) => r.type === 'R03')!;
    const historical = room.buildCost;
    expect(upgradeCost(room)).toBe(Math.round(historical * 0.4));
    room.level = 2;
    expect(upgradeCost(room)).toBe(Math.round(historical * 0.65));
    room.level = 3;
    expect(upgradeCost(room)).toBeNull();
  });
  it('REQ-ECO-08 demolition refunds 70 % unused / 40 % used / 100 % immediate undo', () => {
    const eng = newEngine();
    const room = { ...eng.world.state.rooms[0]!, buildCost: 10000, upgradeCosts: [1000], used: false, undoable: false };
    expect(demolitionRefund(room)).toBe(Math.floor(11000 * 0.7));
    expect(demolitionRefund({ ...room, used: true })).toBe(Math.floor(11000 * 0.4));
    expect(demolitionRefund({ ...room, undoable: true })).toBe(11000);
  });
  it('REQ-ECO-09 projected-cash crisis states', () => {
    const eng = newEngine();
    const w = eng.world;
    updateCrisis(w);
    expect(w.state.economy.crisis).toBe('none');
    post(w, -(w.state.economy.cash - 100), 'event', 'drain');
    updateCrisis(w);
    expect(['warning', 'crisis']).toContain(w.state.economy.crisis);
    expect(projectedCash(w, 3)).toBeLessThan(0);
  });
});
