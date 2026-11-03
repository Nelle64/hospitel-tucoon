import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../src/core/engine';
import { World } from '../../src/core/world';
import { canonicalJSON } from '../../src/save/canonical';
import { SaveManager } from '../../src/save/saveManager';
import { reconcile } from '../../src/save/reconcile';
import type { SaveEnvelope } from '../../src/save/envelope';
import { completeChapter } from '../../src/systems/campaign';
import { startEvent } from '../../src/systems/events';
import { cmd, firstDiff, logical, newEngine, noViolations, runUntil } from '../helpers';

async function freshManager(): Promise<SaveManager> {
  return SaveManager.open(`test-${Math.random()}`, new IDBFactory());
}

function reload(state: GameEngine['state']): GameEngine {
  const eng = new GameEngine(JSON.parse(JSON.stringify(state)), { invariantEvery: 1, strict: true });
  reconcile(eng.world);
  return eng;
}

describe('save system', () => {
  it('REQ-SAVE-01 normal autosave and REQ-SAVE-02 manual save store verified generations', async () => {
    const sm = await freshManager();
    const eng = newEngine(21);
    eng.runTicks(300);
    expect((await sm.save(eng.state, 'auto')).ok).toBe(true);
    eng.runTicks(300);
    const r = await sm.save(eng.state, 'manual');
    expect(r.generation).toBe(2);
    const loaded = await sm.load(eng.state.campaign.id);
    expect(loaded.state.clock.tick).toBe(eng.state.clock.tick);
    expect(loaded.recoveredFromPrevious).toBe(false);
  });

  it('REQ-SAVE-03 interrupted write keeps the previous committed generation active', async () => {
    const sm = await freshManager();
    const eng = newEngine(22);
    await sm.save(eng.state);
    const tick1 = eng.state.clock.tick;
    eng.runTicks(200);
    sm.faults.failAfterSnapshotWrite = true;
    const r = await sm.save(eng.state);
    expect(r.ok).toBe(false);
    sm.faults = {};
    const loaded = await sm.load(eng.state.campaign.id);
    expect(loaded.state.clock.tick).toBe(tick1);
  });

  it('REQ-SAVE-04 corrupt primary snapshot falls back to the previous valid generation', async () => {
    const sm = await freshManager();
    const eng = newEngine(23);
    await sm.save(eng.state);
    const t1 = eng.state.clock.tick;
    eng.runTicks(100);
    await sm.save(eng.state);
    const id = eng.state.campaign.id;
    const env = await sm.db.get<SaveEnvelope>('snapshots', `${id}:2`);
    env!.state.economy.cash = 123456789; // corrupt without fixing checksum
    await sm.db.put('snapshots', env);
    const loaded = await sm.load(id);
    expect(loaded.recoveredFromPrevious).toBe(true);
    expect(loaded.state.clock.tick).toBe(t1);
    expect(loaded.errors.join(' ')).toMatch(/Kontrollsumman/);
  });

  it('never silently replaces a broken save with a new game', async () => {
    const sm = await freshManager();
    const eng = newEngine(24);
    await sm.save(eng.state);
    const id = eng.state.campaign.id;
    const env = await sm.db.get<SaveEnvelope>('snapshots', `${id}:1`);
    env!.checksum = '0'.repeat(64);
    await sm.db.put('snapshots', env);
    await expect(sm.load(id)).rejects.toThrow(/Ingen giltig sparning/);
  });

  it('an older save request never overwrites a newer committed generation', async () => {
    const sm = await freshManager();
    const eng = newEngine(25);
    eng.runTicks(500);
    await sm.save(eng.state);
    const old = JSON.parse(JSON.stringify(eng.state));
    old.clock.tick -= 100;
    const r = await sm.save(old);
    expect(r.skipped).toBe(true);
    expect((await sm.load(eng.state.campaign.id)).state.clock.tick).toBe(eng.state.clock.tick);
  });

  it('REQ-SAVE-05 save during active medical care, REQ-SAVE-06 during training, REQ-SAVE-07 with an active event, REQ-SAVE-08 with loans', async () => {
    const sm = await freshManager();
    const eng = newEngine(26);
    const w = eng.world;
    expect(runUntil(eng, () => w.state.reservations.some((r) => r.status === 'ACTIVE' && r.step !== 'REG'), 3000)).toBe(true);
    const nurse = w.state.staff.find((s) => s.role === 'S02')!;
    cmd(eng, { type: 'TAKE_LOAN', kind: 'investment' });
    const t = startEvent(w, 'E01', false);
    cmd(eng, { type: 'CHOOSE_EVENT_OPTION', eventId: t.id, optionId: 'endure' });
    // Train the receptionist (the nurse may be busy).
    const rec = w.state.staff.find((s) => s.role === 'S01')!;
    const tr = cmd(eng, { type: 'START_TRAINING', staffId: rec.id, trainingId: 'T12' });
    expect(tr.ok).toBe(true);
    await sm.save(eng.state);
    const loaded = await sm.load(eng.state.campaign.id);
    expect(loaded.state.reservations.some((r) => r.status === 'ACTIVE')).toBe(true);
    expect(loaded.state.staff.find((s) => s.id === rec.id)!.training).not.toBeNull();
    expect(loaded.state.events.active.some((e) => e.template === 'E01')).toBe(true);
    expect(loaded.state.economy.loans.length).toBe(1);
    void nurse;
    // Continue both and compare: identical logical results.
    const resumed = reload(loaded.state);
    eng.runTicks(1500);
    resumed.runTicks(1500);
    expect(firstDiff(logical(resumed.state), logical(eng.state))).toBeNull();
    expect(noViolations(resumed)).toEqual([]);
  }, 60000);

  it('REQ-SAVE-09 save around a chapter transition keeps one-time grants paid once', async () => {
    const sm = await freshManager();
    const eng = newEngine(27);
    completeChapter(eng.world, 1);
    const grants = eng.state.economy.transactions.filter((t) => t.category === 'grant').length;
    await sm.save(eng.state);
    const loaded = await sm.load(eng.state.campaign.id);
    const w2 = new World(loaded.state);
    completeChapter(w2, 1); // re-entering the completion routine must not pay again
    expect(w2.state.economy.transactions.filter((t) => t.category === 'grant').length).toBe(grants);
    expect(w2.state.economy.grantsPaid).toEqual([1]);
    expect(w2.state.progress.chapter).toBe(2);
  });

  it('REQ-SAVE-10 export/import equivalence', async () => {
    const sm = await freshManager();
    const eng = newEngine(28);
    eng.runTicks(1000);
    await sm.save(eng.state);
    const json = await sm.exportJSON(eng.state);
    const sm2 = await freshManager();
    const preview = await sm2.previewImport(json);
    expect(preview.state.campaign.id).toBe(eng.state.campaign.id);
    expect((await sm2.commitImport(preview)).ok).toBe(true);
    const loaded = await sm2.load(eng.state.campaign.id);
    expect(firstDiff(loaded.state, eng.state)).toBeNull();
  });

  it('REQ-SAVE-13 100 repeated save/load round-trips are lossless and deterministic', async () => {
    const sm = await freshManager();
    let eng = newEngine(29);
    const ref = newEngine(29);
    for (let i = 0; i < 100; i++) {
      eng.runTicks(37);
      ref.runTicks(37);
      await sm.save(eng.state);
      const loaded = await sm.load(eng.state.campaign.id);
      eng = reload(loaded.state);
    }
    expect(firstDiff(logical(eng.state), logical(ref.state))).toBeNull();
    expect(noViolations(eng)).toEqual([]);
  }, 120000);

  it('REQ-DET-03 identical seed and commands produce identical results', () => {
    const a = newEngine(99, false);
    const b = newEngine(99, false);
    for (const e of [a, b]) {
      e.runTicks(800);
      cmd(e, { type: 'SET_QUEUE_POLICY', policy: 3 });
      e.runTicks(4000);
    }
    expect(firstDiff(logical(a.state), logical(b.state))).toBeNull();
  });
});
