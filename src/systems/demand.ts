import { DEF } from '../data/definition';
import type { DiseaseCategory, DiseaseDef, DiseaseId } from '../data/types';
import type { World } from '../core/world';
import { clamp, eventMod } from './rules';

export function reputationFactor(rep: number): number {
  return clamp(1 + 0.005 * (rep - 60), 0.75, 1.2);
}

/** Expected arrivals for a day: chapter baseline × reputation × event × daily variation, smoothed. */
export function expectedDemand(w: World, variation: number): number {
  const ch = w.chapter;
  const base = DEF.sim.demandPerChapter[ch]!;
  const tutorial = w.day < DEF.sim.tutorialDays ? DEF.sim.tutorialDemandFactor : 1;
  const raw = base * reputationFactor(w.state.metrics.reputation) * eventMod(w, 'demand') * variation * tutorial;
  const prev = w.state.metrics.demand.previous;
  if (prev <= 0) return raw;
  // Smooth day-to-day changes (chapter transitions use the larger allowance).
  const chapterJump = w.state.progress.chapterCompletedTick.some((t) => t > w.tick - DEF.sim.ticksPerDay * 2);
  const maxChange = chapterJump ? 0.6 : DEF.sim.maxDailyDemandChange;
  return clamp(raw, prev * (1 - maxChange), prev * (1 + maxChange));
}

/** Builds the reproducible arrival schedule for the day starting at `dayStartTick`. */
export function planArrivals(w: World, dayStartTick: number, fromTick: number): void {
  const variation = w.rng.range(0.9, 1.1);
  const expected = expectedDemand(w, variation);
  const m = w.state.metrics;
  m.demand.previous = m.demand.expected > 0 ? m.demand.expected : expected;
  m.demand.expected = expected;
  m.today.expectedDemand = expected;
  const nightShare = DEF.sim.nightEmergencyShare[w.chapter] ?? 0;
  const erExists = w.state.rooms.some((r) => r.type === 'R09');
  const nightCount = erExists ? Math.round(expected * nightShare) : 0;
  const dayCount = Math.max(0, Math.round(expected) - nightCount);
  const plan: { tick: number; night: boolean }[] = [];
  // Largest-remainder split of day arrivals across blocks.
  const blocks = DEF.sim.arrivalBlocks;
  const raw = blocks.map((b) => b.share * dayCount);
  const counts = raw.map(Math.floor);
  let rem = dayCount - counts.reduce((s, c) => s + c, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) {
    if (rem <= 0) break;
    counts[o.i]!++;
    rem--;
  }
  const tpm = 1 / DEF.sim.minutesPerTick;
  blocks.forEach((b, i) => {
    for (let k = 0; k < counts[i]!; k++) {
      const minute = w.rng.range(b.from, b.to);
      plan.push({ tick: dayStartTick + Math.floor(minute * tpm), night: false });
    }
  });
  for (let k = 0; k < nightCount; k++) {
    // Night: 20:00–24:00 or 00:00–08:00 of this calendar day.
    const minute = w.rng.chance(0.4) ? w.rng.range(20 * 60, 24 * 60 - 1) : w.rng.range(0, 8 * 60 - 1);
    plan.push({ tick: dayStartTick + Math.floor(minute * tpm), night: true });
  }
  plan.sort((a, b) => a.tick - b.tick);
  m.arrivalPlan = plan.filter((a) => a.tick >= fromTick);
}

export type DiseaseStatus = 'treatable' | 'missingRooms' | 'observation';

export function diseaseStatus(w: World, d: DiseaseDef): DiseaseStatus {
  if (!w.state.research.identified.includes(d.id)) return 'observation';
  const types = new Set(w.state.rooms.filter((r) => !r.closing).map((r) => r.type));
  const ok = d.path.every((s) => {
    const t = DEF.step[s].roomType;
    if (s === 'E' && !types.has('R09')) return types.has('R03');
    return types.has(t);
  });
  return ok ? 'treatable' : 'missingRooms';
}

/** Deterministic disease selection honouring chapter gates, category mix, observation cap and rarity compensation. */
export function chooseDisease(w: World, night: boolean): DiseaseId | null {
  const ch = w.chapter;
  const eligible = DEF.disease ? Object.values(DEF.disease).filter((d) => d.chapter <= ch && (!night || d.triage >= 3)) : [];
  if (eligible.length === 0) return null;
  const mix = DEF.sim.categoryMix[ch]!;
  const cats: DiseaseCategory[] = ['ordinary', 'absurd', 'mysterious'];
  const available = cats.filter((c) => mix[c] > 0 && eligible.some((d) => d.category === c));
  const cat = w.rng.weighted(available, (c) => mix[c]);
  if (!cat) return null;
  const pool = eligible.filter((d) => d.category === cat);
  const today = w.state.metrics.today;
  const obsToday = w.state.cases.filter((c) => c.observation && c.createdTick >= w.day * DEF.sim.ticksPerDay).length;
  const obsShare = today.arrivals > 0 ? obsToday / today.arrivals : 0;
  const lastSeen = w.state.research.lastSeenDay;
  const pick = w.rng.weighted(pool, (d) => {
    const st = diseaseStatus(w, d);
    let wt = st === 'treatable' ? 1 : st === 'missingRooms' ? 0.35 : obsShare >= DEF.sim.observationShareMax ? 0.05 : 0.6;
    const seen = lastSeen[d.id];
    const since = seen === undefined ? 0 : w.day - seen;
    if (since > DEF.sim.rarityDays) wt *= 1 + 0.5 * (since - DEF.sim.rarityDays);
    if (eventMod(w, 'surgicalDemand') > 0 && d.path.includes('OP')) wt *= 4;
    return wt;
  });
  return pick ? pick.id : null;
}
