import { DEF } from '../data/definition';
import type { DayMetrics } from '../core/state';
import type { World } from '../core/world';
import { activeBookingsForRoom, bedCoverage } from './resources';
import { onDuty, roomStatus } from './rules';

export function newDayMetrics(day: number, chapter: number): DayMetrics {
  return {
    day, chapter, arrivals: 0, expectedDemand: 0, completed: 0, success: 0, failedTreatment: 0, critical: 0, referrals: 0, abandoned: 0,
    abandonedAfterAssessment: 0, treatedOutcomes: 0, diagnosticExams: 0, advancedTreatments: 0, orthoSurgIcu: 0, waitSum: 0, waitCount: 0, waitMax: 0,
    walkSum: 0, walkCount: 0, satisfactionSum: 0, satisfactionCount: 0, revenue: 0, costs: 0, fixedCosts: 0, variableCosts: 0, capex: 0,
    otherIncome: 0, result: 0, cashflow: 0, cashEnd: 0, reputationEnd: 0, queueSamples: 0, queueLenSum: 0, queueLenMax: 0,
    staffOnShiftMinutes: 0, staffWorkMinutes: 0, energySum: 0, stressSum: 0, staffSamples: 0, roomBusy: {}, roomAvail: {}, grpEarned: 0,
    rpEarned: 0, trainingsCompleted: 0, treatmentsByRoom: {},
  };
}

/** Sampled every 10 ticks (6 game minutes): queue lengths, staff workload, room utilisation. */
export function sampleMetrics(w: World): void {
  if (w.tick % 10 !== 0) return;
  const m = w.state.metrics.today;
  const q = w.state.queues.length;
  m.queueSamples++;
  m.queueLenSum += q;
  m.queueLenMax = Math.max(m.queueLenMax, q);
  const qn: Record<string, number> = {};
  for (const e of w.state.queues) qn[e.step] = (qn[e.step] ?? 0) + 1;
  w.state.metrics.queueNow = qn;
  const minutes = 10 * DEF.sim.minutesPerTick;
  for (const s of w.state.staff) {
    if (!onDuty(w, s)) continue;
    m.staffOnShiftMinutes += minutes;
    if (s.state === 'WORKING') m.staffWorkMinutes += minutes;
    m.energySum += s.energy;
    m.stressSum += s.stress;
    m.staffSamples++;
  }
  for (const r of w.state.rooms) {
    const def = DEF.room[r.type];
    if (def.team.length === 0 && def.stationKind !== 'seat') continue;
    const st = roomStatus(w, r);
    if (!st.operational) continue;
    let cap: number;
    let busy: number;
    if (def.stationKind === 'seat') {
      cap = r.layout.stations.length;
      busy = w.state.patients.filter((p) => p.seat?.roomId === r.id).length;
    } else if (def.stationKind === 'bed') {
      cap = Math.max(1, bedCoverage(w, r));
      busy = activeBookingsForRoom(w, r.id).length;
    } else if (def.stationKind === 'cleaning' || def.stationKind === 'research') {
      continue;
    } else {
      cap = Math.min(r.layout.stations.length, st.teams);
      busy = activeBookingsForRoom(w, r.id).filter((b) => b.status === 'ACTIVE').length;
    }
    m.roomAvail[r.type] = (m.roomAvail[r.type] ?? 0) + cap * minutes;
    m.roomBusy[r.type] = (m.roomBusy[r.type] ?? 0) + Math.min(cap, busy) * minutes;
  }
}

/** Close the current day and start a new aggregate (keeps at most 365 days). */
export function closeDay(w: World): DayMetrics {
  const ms = w.state.metrics;
  const m = ms.today;
  m.result = m.revenue - m.costs;
  m.cashEnd = w.state.economy.cash;
  m.reputationEnd = Math.round(ms.reputation * 10) / 10;
  ms.totals.revenue += m.revenue;
  ms.totals.result += m.result;
  ms.days.push(m);
  if (ms.days.length > DEF.sim.historyDays) ms.days.splice(0, ms.days.length - DEF.sim.historyDays);
  ms.today = newDayMetrics(w.day, w.chapter);
  w.emit('DAY_ENDED', { day: m.day, result: m.result, completed: m.completed, cash: m.cashEnd });
  return m;
}

export function lastDays(w: World, n: number): DayMetrics[] {
  const d = w.state.metrics.days;
  return d.slice(Math.max(0, d.length - n));
}

/** Volume-weighted aggregates (never averages of daily percentages). */
export function aggregate(days: DayMetrics[]) {
  const sum = (k: keyof DayMetrics) => days.reduce((s, d) => s + (d[k] as number), 0);
  const treated = sum('treatedOutcomes');
  const waitCount = sum('waitCount');
  const satCount = sum('satisfactionCount');
  const walkCount = sum('walkCount');
  return {
    days: days.length,
    arrivals: sum('arrivals'),
    completed: sum('completed'),
    success: sum('success'),
    treated,
    successRate: treated > 0 ? (sum('success') / treated) * 100 : 0,
    referrals: sum('referrals'),
    abandoned: sum('abandoned'),
    avgWait: waitCount > 0 ? sum('waitSum') / waitCount : 0,
    waitCount,
    avgSatisfaction: satCount > 0 ? sum('satisfactionSum') / satCount : 0,
    avgWalk: walkCount > 0 ? sum('walkSum') / walkCount : 0,
    walkCount,
    revenue: sum('revenue'),
    costs: sum('costs'),
    result: sum('result'),
    cashflow: sum('cashflow'),
    staffUtil: sum('staffOnShiftMinutes') > 0 ? (sum('staffWorkMinutes') / sum('staffOnShiftMinutes')) * 100 : 0,
    avgEnergy: sum('staffSamples') > 0 ? sum('energySum') / sum('staffSamples') : 0,
    avgStress: sum('staffSamples') > 0 ? sum('stressSum') / sum('staffSamples') : 0,
    grp: sum('grpEarned'),
    rp: sum('rpEarned'),
    trainings: sum('trainingsCompleted'),
  };
}

export function roomUtilization(days: DayMetrics[], type: string): number {
  let busy = 0;
  let avail = 0;
  for (const d of days) {
    busy += (d.roomBusy as Record<string, number>)[type] ?? 0;
    avail += (d.roomAvail as Record<string, number>)[type] ?? 0;
  }
  return avail > 0 ? (busy / avail) * 100 : 0;
}
