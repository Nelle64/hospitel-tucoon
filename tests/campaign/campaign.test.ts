import { describe, expect, it } from 'vitest';
import { runBot } from '../../tools/sim/bot';

describe('full campaign (headless, commands only)', () => {
  for (const seed of [1000, 24757]) {
    it(`REQ-CAMP-01 skilled strategy wins from a fresh save (seed ${seed}) with all five chapter transitions`, () => {
      const r = runBot(seed, 'skilled', 130, { invariantEvery: 100, strict: true });
      expect(r.violations).toBe(0);
      expect(r.chapterDays.length).toBe(4);
      for (let i = 1; i < r.chapterDays.length; i++) expect(r.chapterDays[i]!).toBeGreaterThanOrEqual(r.chapterDays[i - 1]!);
      expect(r.won).toBe(true);
      expect(r.victoryDay!).toBeLessThanOrEqual(120);
      expect(r.completed).toBeGreaterThanOrEqual(1200);
      expect(r.mastered).toBeGreaterThanOrEqual(18);
    });
  }
  it('REQ-CAMP-02 average strategy reaches chapter 5 with recoverable setbacks', () => {
    const r = runBot(8919, 'average', 120, { invariantEvery: 200, strict: true });
    expect(r.violations).toBe(0);
    expect(r.chapterDays.length).toBeGreaterThanOrEqual(3);
  });
});
