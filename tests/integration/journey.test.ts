import { describe, expect, it } from 'vitest';
import { DEF } from '../../src/data/definition';
import { spawnPatient } from '../../src/systems/patients';
import { newEngine, runUntil, noViolations } from '../helpers';

describe('operational hospital', () => {
  it('REQ-SIM-01 a genuine patient arrives, registers, is treated, pays exactly once and leaves', () => {
    const eng = newEngine(3);
    const w = eng.world;
    w.state.metrics.arrivalPlan = [];
    const states = new Set<string>();
    const p = spawnPatient(w, false, 'D01')!;
    const caseId = p.caseId;
    const steps: string[] = [];
    eng.subscribe((e) => {
      if (e.type === 'TREATMENT_COMPLETED' && e.payload.patientId === p.id) steps.push(e.payload.step as string);
    });
    const cash0 = w.state.economy.cash;
    const done = runUntil(eng, () => {
      const pp = w.patientById.get(p.id);
      if (pp) states.add(pp.state);
      return !pp;
    }, 2400);
    expect(done).toBe(true);
    expect(steps).toEqual(['REG', 'U', 'B']);
    expect([...states]).toEqual(expect.arrayContaining(['ARRIVING', 'REGISTERING', 'MOVING', 'IN_TREATMENT', 'EXITING']));
    const tx = w.state.economy.transactions.filter((t) => t.ref === `case:${caseId}`);
    const settlements = tx.filter((t) => ['treatment', 'failedCare', 'referral'].includes(t.category));
    expect(settlements.length).toBe(1);
    const materials = tx.filter((t) => t.category === 'material').reduce((s, t) => s + t.amount, 0);
    expect(materials).toBe(-DEF.disease.D01.material);
    expect(w.state.economy.settledCaseIds).toContain(caseId);
    expect(w.state.metrics.today.completed + w.state.metrics.days.reduce((s, d) => s + d.completed, 0)).toBe(1);
    expect(w.state.economy.cash).not.toBe(cash0);
    expect(noViolations(eng)).toEqual([]);
  });

  it('REQ-SIM-02 the starting clinic operates for 30 simulated days without invalid states', () => {
    const eng = newEngine(17, true);
    eng.invariantEvery = 25;
    eng.runDays(30);
    expect(eng.state.audit.violations).toEqual([]);
    const total = eng.state.metrics.totals;
    expect(total.arrivals).toBeGreaterThan(200);
    expect(total.completed + total.referrals + total.abandoned + total.critical).toBeGreaterThan(200);
    // Every case has exactly one terminal outcome: active + finished = arrivals.
    const finished = total.completed + total.referrals + total.abandoned + total.critical;
    const active = eng.state.cases.filter((c) => !c.outcome).length + eng.state.cases.filter((c) => c.outcome).length;
    expect(finished + eng.state.cases.filter((c) => !c.outcome).length).toBe(total.arrivals);
    expect(active).toBe(eng.state.cases.length);
    expect(eng.state.metrics.days.length).toBe(30);
  }, 120000);

  it('REQ-TIME-02 day = 2,400 ticks; shifts start at 08:00 and 20:00 and charge wages', () => {
    const eng = newEngine(4);
    const w = eng.world;
    const wages0 = w.state.economy.transactions.filter((t) => t.category === 'wage').length;
    eng.runTicks(1200); // to 20:00
    expect(w.minuteOfDay).toBe(1200);
    eng.runTicks(1200); // to 08:00 next day
    expect(w.day).toBe(1);
    expect(w.minuteOfDay).toBe(480);
    const wages = w.state.economy.transactions.filter((t) => t.category === 'wage');
    expect(wages.length).toBe(wages0 + 1); // next day shift (no night staff)
    expect(wages[wages.length - 1]!.amount).toBe(-(450 + 1200 + 650));
  });

  it('REQ-SIM-03 triage: critical patients are served before lower triage competing for the same resource', () => {
    const eng = newEngine(5);
    const w = eng.world;
    w.state.metrics.arrivalPlan = [];
    const low = spawnPatient(w, false, 'D01')!;
    const high = spawnPatient(w, false, 'D01')!;
    low.triage = 1;
    high.triage = 5;
    const order: number[] = [];
    eng.subscribe((e) => {
      if (e.type === 'RESERVATION_CREATED' && e.payload.step === 'REG') order.push(e.payload.patientId as number);
    });
    eng.runTicks(300);
    expect(order[0]).toBe(high.id);
  });
});
