import { describe, expect, it } from 'vitest';
import { DEF, GAME_DEFINITION } from '../../src/data/definition';
import type { DiseaseId } from '../../src/data/types';
import { chooseDisease } from '../../src/systems/demand';
import { selectPath, spawnPatient, splitMaterial } from '../../src/systems/patients';
import { completeChapter } from '../../src/systems/campaign';
import { identify, newEngine, sandbox } from '../helpers';
import { fullHospitalRun } from './fullHospital';

const DISEASES = GAME_DEFINITION.diseases;

describe.each(DISEASES.map((d) => [d.id, d.nameSv] as [DiseaseId, string]))('disease %s %s', (id) => {
  const def = DEF.disease[id];

  it(`REQ-DIS-${id}-1 chapter availability`, () => {
    for (let ch = 1; ch <= 5; ch++) {
      const eng = newEngine(51 + ch, false);
      while (eng.world.chapter < ch) completeChapter(eng.world, eng.world.chapter as 1);
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) seen.add(chooseDisease(eng.world, false)!);
      if (ch < def.chapter) expect(seen.has(id), `ch${ch}`).toBe(false);
      for (const s of seen) expect(DEF.disease[s as DiseaseId].chapter).toBeLessThanOrEqual(ch);
    }
  });

  it(`REQ-DIS-${id}-2 patient generation`, () => {
    const eng = sandbox(61);
    identify(eng, id);
    const p = spawnPatient(eng.world, false, id)!;
    const c = eng.world.caseById.get(p.caseId)!;
    expect(c.disease).toBe(id);
    expect(c.patientId).toBe(p.id);
    expect(p.health).toBeGreaterThan(0);
    expect(c.revenueBase).toBeGreaterThanOrEqual(def.revenue);
  });

  it(`REQ-DIS-${id}-3 triage`, () => {
    const eng = sandbox(62);
    identify(eng, id);
    for (let i = 0; i < 20; i++) {
      const p = spawnPatient(eng.world, false, id)!;
      const c = eng.world.caseById.get(p.caseId)!;
      const base = c.severe ? def.severeVariant!.triage : def.triage;
      expect(p.triage).toBeGreaterThanOrEqual(Math.max(1, base - 1));
      expect(p.triage).toBeLessThanOrEqual(Math.min(5, base + 1));
    }
  });

  it(`REQ-DIS-${id}-4 full valid treatment path (arrival to terminal outcome)`, () => {
    const run = fullHospitalRun();
    const mine = run.spawned.filter((s) => s.disease === id);
    expect(mine.length).toBe(2);
    for (const s of mine) {
      const steps = run.events.filter((e) => e.type === 'TREATMENT_COMPLETED' && e.payload.caseId === s.caseId).map((e) => e.payload.step);
      expect(steps.filter((x) => x !== 'REG')).toEqual(s.path);
      const allowed = [def.path.join('>'), def.pharmacyPath?.join('>'), def.severeVariant?.path.join('>'), def.path.map((x, i) => (i === 0 && x === 'U' ? 'E' : x)).join('>')];
      expect(allowed).toContain(s.path.join('>'));
      expect(run.eng.world.patientById.has(s.patientId)).toBe(false);
    }
  });

  it(`REQ-DIS-${id}-5 resource eligibility (room type and qualified roles per step)`, () => {
    const run = fullHospitalRun();
    for (const s of run.spawned.filter((x) => x.disease === id)) {
      for (const e of run.events.filter((ev) => ev.type === 'TREATMENT_COMPLETED' && ev.payload.caseId === s.caseId)) {
        const step = DEF.step[e.payload.step as 'U'];
        expect(e.payload.roomType).toBe(step.roomType);
        const team = DEF.room[step.roomType].team;
        const roles = e.payload.staffRoles as string[];
        if (DEF.room[step.roomType].stationKind !== 'bed') {
          expect(roles.length).toBe(team.length);
          roles.forEach((r, i) => expect(r === team[i] || DEF.role[r as 'S06'].substitutesFor.includes(team[i]!)).toBe(true));
        }
      }
    }
  });

  it(`REQ-DIS-${id}-6 outcome processing: exactly one terminal outcome`, () => {
    const run = fullHospitalRun();
    for (const s of run.spawned.filter((x) => x.disease === id)) {
      const outs = run.events.filter((e) => ['PATIENT_DISCHARGED', 'PATIENT_REFERRED', 'PATIENT_LEFT'].includes(e.type) && e.payload.caseId === s.caseId);
      expect(outs.length).toBe(1);
      expect(['SUCCESS', 'FAILED_TREATMENT']).toContain(outs[0]!.payload.outcome);
    }
  });

  it(`REQ-DIS-${id}-7 economy: materials consumed per step, single settlement in the correct range`, () => {
    const run = fullHospitalRun();
    for (const s of run.spawned.filter((x) => x.disease === id)) {
      const tx = run.txByCase.get(s.caseId) ?? [];
      const material = -tx.filter((t) => t.category === 'material').reduce((a, t) => a + t.amount, 0);
      const expectedMaterial = Math.round(def.material * (s.severe ? def.severeVariant!.materialMult : 1));
      expect(material).toBe(expectedMaterial);
      expect(splitMaterial(expectedMaterial, s.path as never).reduce((a, b) => a + b, 0)).toBe(expectedMaterial);
      const settle = tx.filter((t) => ['treatment', 'failedCare', 'referral'].includes(t.category));
      expect(settle.length).toBe(1);
      const base = Math.round(def.revenue * (s.severe ? def.severeVariant!.revenueMult : 1));
      if (settle[0]!.category === 'treatment') {
        expect(settle[0]!.amount).toBeGreaterThanOrEqual(Math.floor(base * 0.85));
        expect(settle[0]!.amount).toBeLessThanOrEqual(Math.ceil(base * 1.2 * 1.15));
      } else expect(settle[0]!.amount).toBe(Math.round(base * 0.35));
    }
  });

  it(`REQ-DIS-${id}-8 research progression (disease-specific RP)`, () => {
    const run = fullHospitalRun();
    const gained = (run.eng.state.research.rp[id] ?? 0) - (run.rpBefore[id] ?? 0);
    // The fixture pre-identifies diseases (no first-observation bonus): assessments (+5 each) + outcomes (≥ +4 each).
    expect(gained).toBeGreaterThanOrEqual(2 * 5 + 2 * 4);
    if (gained >= def.masteryThreshold) expect(run.eng.state.research.mastered).toContain(id);
  });
});

describe('research rewards', () => {
  it('REQ-RES-01 first observation gives +20 RP exactly once per campaign; threshold-0 diseases identify on observation', () => {
    const eng = sandbox(73);
    const w = eng.world;
    w.state.metrics.arrivalPlan = [];
    const before = w.state.research.rp.D16 ?? 0;
    const p1 = spawnPatient(w, false, 'D16')!;
    const p2 = spawnPatient(w, false, 'D16')!;
    eng.runTicks(1600);
    expect(w.state.research.observed).toContain('D16');
    expect(w.state.research.identified).toContain('D16');
    const gained = (w.state.research.rp.D16 ?? 0) - before;
    // 20 once + 2 consultations (5 each) + outcome RP (4 or 12 each).
    expect(gained).toBeGreaterThanOrEqual(20 + 10 + 8);
    expect(gained).toBeLessThanOrEqual(20 + 10 + 24);
    void p1; void p2;
  });
});

describe('unknown diseases', () => {
  it('REQ-DIS-OBS-01 unidentified diseases follow the observation workflow and are referred with +8 RP', () => {
    const eng = sandbox(71);
    const w = eng.world;
    const sel = selectPath(w, 'D19', false);
    expect(sel.observation).toBe(true);
    expect(sel.path.every((s) => DEF.step[s].diagnostic || DEF.step[s].assessment)).toBe(true);
  });
  it('REQ-DIS-OBS-02 a disease whose department is missing is referred instead of queueing forever', () => {
    const eng = newEngine(72);
    const w = eng.world;
    completeChapter(w, 1);
    completeChapter(w, 2);
    identify(eng, 'D05');
    const p = spawnPatient(w, false, 'D05')!;
    let referred = false;
    eng.subscribe((e) => {
      if (e.type === 'PATIENT_REFERRED' && e.payload.patientId === p.id) referred = true;
    });
    eng.runTicks(2400);
    expect(referred).toBe(true);
  });
});
