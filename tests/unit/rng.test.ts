import { describe, expect, it } from 'vitest';
import { Rng, createRngState } from '../../src/core/rng';

describe('seeded RNG', () => {
  it('REQ-DET-01 identical seeds give identical sequences', () => {
    const a = new Rng(createRngState(123));
    const b = new Rng(createRngState(123));
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
  it('REQ-DET-02 continues from a saved state', () => {
    const a = new Rng(createRngState(9));
    for (let i = 0; i < 50; i++) a.next();
    const saved = JSON.parse(JSON.stringify(a.state));
    const b = new Rng(saved);
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });
  it('produces values in range and a sane distribution', () => {
    const r = new Rng(createRngState(5));
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[r.int(0, 2)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(900);
  });
});
