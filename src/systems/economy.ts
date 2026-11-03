import { DEF } from '../data/definition';
import type { LoanState, Transaction, TxCategory } from '../core/state';
import type { World } from '../core/world';

const OP_REVENUE: TxCategory[] = ['treatment', 'failedCare', 'referral'];
const FIXED_COST: TxCategory[] = ['wage', 'roomOperation'];
const VARIABLE_COST: TxCategory[] = ['material', 'overtime', 'training', 'hiring'];
const CAPEX: TxCategory[] = ['construction', 'corridor', 'upgrade', 'land', 'refund', 'equipmentSale'];

/**
 * The only place where money changes. Every change produces an auditable transaction with a stable id.
 * Amounts are integer kronor; callers pass already-rounded integers.
 */
export function post(w: World, amount: number, category: TxCategory, labelSv: string, ref = ''): Transaction | null {
  if (!Number.isInteger(amount)) throw new Error(`Non-integer amount ${amount} for ${category}`);
  if (amount === 0) return null;
  const e = w.state.economy;
  const tx: Transaction = { id: w.nextId('tx'), tick: w.tick, amount, category, labelSv, ref };
  e.cash += amount;
  e.transactions.push(tx);
  e.totals[category] = (e.totals[category] ?? 0) + amount;
  const m = w.state.metrics.today;
  m.cashflow += amount;
  if (OP_REVENUE.includes(category)) m.revenue += amount;
  else if (FIXED_COST.includes(category)) {
    m.costs -= amount;
    m.fixedCosts -= amount;
  } else if (VARIABLE_COST.includes(category)) {
    m.costs -= amount;
    m.variableCosts -= amount;
  } else if (category === 'event') {
    if (amount < 0) {
      m.costs -= amount;
      m.variableCosts -= amount;
    } else m.otherIncome += amount;
  } else if (CAPEX.includes(category)) m.capex -= amount;
  else if (category === 'grant' || category === 'mission') m.otherIncome += amount;
  w.emit('ECONOMY_TRANSACTION', { txId: tx.id, amount, category, labelSv, cash: e.cash }, ref || null);
  return tx;
}

export function canAfford(w: World, amount: number): boolean {
  return w.state.economy.cash >= amount;
}

/** Remove transaction detail older than the retention window (aggregates in totals are permanent). */
export function pruneTransactions(w: World): void {
  const keepFrom = w.tick - DEF.sim.transactionRetentionDays * DEF.sim.ticksPerDay;
  const tx = w.state.economy.transactions;
  let i = 0;
  while (i < tx.length && tx[i]!.tick < keepFrom) i++;
  if (i > 0) tx.splice(0, i);
  const ids = w.state.economy.settledCaseIds;
  if (ids.length > 3000) ids.splice(0, ids.length - 3000);
}

export function roomDailyOperation(w: World, roomId: number): number {
  const r = w.roomById.get(roomId)!;
  const def = DEF.room[r.type];
  const lvl = DEF.econ.upgradeLevels[r.level - 1]!;
  const base = (def.baseOperation + DEF.econ.roomOperationPerTile * r.w * r.h) * lvl.operationMult;
  return Math.round(r.open ? base : base * DEF.econ.closedRoomOperationFactor);
}

export function staffWage(roleWage: number, wageMod: number, shift: 'day' | 'night'): number {
  const base = Math.round(roleWage * (1 + wageMod));
  return shift === 'night' ? Math.round(base * (1 + DEF.econ.nightPremium)) : base;
}

/** Per-tick accrual of room operating costs, posted hourly with exact remainders. */
export function accrueOperations(w: World): void {
  for (const r of w.state.rooms) r.opAccum += roomDailyOperation(w, r.id);
  if (w.tick % 100 === 0) {
    let total = 0;
    for (const r of w.state.rooms) {
      const due = Math.floor(r.opAccum / DEF.sim.ticksPerDay);
      if (due > 0) {
        r.opAccum -= due * DEF.sim.ticksPerDay;
        total += due;
      }
    }
    if (total > 0) post(w, -total, 'roomOperation', 'Driftkostnader rum', 'ops');
    const e = w.state.economy;
    const ot = Math.floor(e.wageAccum / 1200);
    if (ot > 0) {
      e.wageAccum -= ot * 1200;
      post(w, -ot, 'overtime', 'Övertid', 'overtime');
    }
    payOverdue(w);
  }
}

export function loanTotal(l: LoanState): number {
  return l.principal + l.fee;
}
export function loanRemaining(l: LoanState): number {
  return loanTotal(l) - l.paid;
}

export function makeInstallments(total: number, term: number): number[] {
  const base = Math.floor(total / term);
  const out = new Array<number>(term).fill(base);
  out[term - 1] = total - base * (term - 1);
  return out;
}

export function activeLoans(w: World): LoanState[] {
  return w.state.economy.loans.filter((l) => loanRemaining(l) > 0);
}

export function takeLoan(w: World, kind: 'short' | 'investment' | 'crisis'): { ok: boolean; errorSv?: string } {
  const def = DEF.econ.loans.find((l) => l.id === kind)!;
  const e = w.state.economy;
  const active = activeLoans(w);
  const overdue = active.reduce((s, l) => s + l.overdue, 0);
  if (def.ordinary) {
    if (overdue > 0) return { ok: false, errorSv: 'Förfallna skulder blockerar nya lån' };
    if (active.filter((l) => l.kind === 'short' || l.kind === 'investment').length >= DEF.econ.maxOrdinaryLoans) return { ok: false, errorSv: 'Max två vanliga lån samtidigt' };
  } else {
    if (e.crisis !== 'crisis' && e.crisis !== 'recovery') return { ok: false, errorSv: 'Krislån beviljas bara vid ekonomisk kris' };
    if (active.some((l) => l.kind === 'crisis')) return { ok: false, errorSv: 'Ett krislån är redan aktivt' };
  }
  const fee = Math.round(def.principal * def.feeRate);
  const loan: LoanState = { id: w.nextId('loan'), kind, principal: def.principal, fee, termDays: def.termDays, takenDay: w.day, installments: makeInstallments(def.principal + fee, def.termDays), paid: 0, overdue: 0, nextIndex: 0 };
  e.loans.push(loan);
  post(w, def.principal, 'loanIn', def.nameSv, `loan:${loan.id}`);
  w.emit('LOAN_TAKEN', { loanId: loan.id, kind, principal: def.principal, fee }, `loan:${loan.id}`);
  return { ok: true };
}

/** Daily installment collection (called at midnight). Unpaid installments become overdue. */
export function collectInstallments(w: World): void {
  for (const l of w.state.economy.loans) {
    if (l.nextIndex >= l.installments.length) continue;
    const due = l.installments[l.nextIndex]!;
    l.nextIndex++;
    if (w.state.economy.cash >= due) {
      l.paid += due;
      post(w, -due, 'loanRepayment', 'Amortering lån', `loan:${l.id}`);
    } else l.overdue += due;
  }
  w.state.economy.loans = w.state.economy.loans.filter((l) => loanRemaining(l) > 0 || l.takenDay > w.day - 30);
}

export function payOverdue(w: World): void {
  for (const l of w.state.economy.loans) {
    if (l.overdue > 0 && w.state.economy.cash >= l.overdue) {
      const amt = l.overdue;
      l.overdue = 0;
      l.paid += amt;
      post(w, -amt, 'loanRepayment', 'Förfallen skuld betald', `loan:${l.id}`);
    }
  }
}

export function totalOverdue(w: World): number {
  return w.state.economy.loans.reduce((s, l) => s + l.overdue, 0);
}

export function repayLoan(w: World, loanId: number): { ok: boolean; errorSv?: string } {
  const l = w.state.economy.loans.find((x) => x.id === loanId);
  if (!l || loanRemaining(l) <= 0) return { ok: false, errorSv: 'Lånet finns inte' };
  const rem = loanRemaining(l);
  if (w.state.economy.cash < rem) return { ok: false, errorSv: 'Inte tillräckligt med pengar för att lösa lånet' };
  l.paid += rem;
  l.overdue = 0;
  l.nextIndex = l.installments.length;
  post(w, -rem, 'loanRepayment', 'Lån löst i förtid', `loan:${l.id}`);
  return { ok: true };
}

/** Extend an active loan (including overdue amounts) over more days for an extra fee. */
export function restructureLoan(w: World, loanId: number): { ok: boolean; errorSv?: string } {
  const l = w.state.economy.loans.find((x) => x.id === loanId);
  if (!l || loanRemaining(l) <= 0) return { ok: false, errorSv: 'Lånet finns inte' };
  if (w.state.economy.crisis === 'none') return { ok: false, errorSv: 'Omförhandling beviljas bara vid ekonomiska problem' };
  if (l.termDays > 60) return { ok: false, errorSv: 'Lånet har redan omförhandlats maximalt' };
  const remaining = loanRemaining(l);
  const extraFee = Math.round(remaining * DEF.econ.restructuring.feeRate);
  const remainingDays = Math.max(1, l.installments.length - l.nextIndex) + DEF.econ.restructuring.extraDays;
  l.fee += extraFee;
  const newRemaining = remaining + extraFee;
  l.installments = [...l.installments.slice(0, l.nextIndex), ...makeInstallments(newRemaining, remainingDays)];
  // paid stays; the remaining installments now cover what is left including overdue.
  l.overdue = 0;
  l.termDays += DEF.econ.restructuring.extraDays;
  w.emit('LOAN_TAKEN', { loanId: l.id, restructured: true, extraFee }, `loan:${l.id}`);
  return { ok: true };
}

export function dailyFixedCosts(w: World): number {
  let wages = 0;
  for (const s of w.state.staff) wages += staffWage(DEF.role[s.role].wage, s.wageMod, s.shift);
  let ops = 0;
  for (const r of w.state.rooms) ops += roomDailyOperation(w, r.id);
  let loans = 0;
  for (const l of w.state.economy.loans) if (l.nextIndex < l.installments.length) loans += l.installments[l.nextIndex]!;
  return wages + ops + loans;
}

/** Average daily operating income before fixed costs (revenue − variable costs) over the last 3 complete days. */
export function recentDailyContribution(w: World): number {
  const days = w.state.metrics.days.slice(-3);
  if (days.length === 0) return 0;
  return days.reduce((s, d) => s + d.revenue - d.variableCosts, 0) / days.length;
}

/** Cash projected `days` ahead: current cash + expected contribution − fixed costs (wages, rooms, installments). */
export function projectedCash(w: World, days: number): number {
  return w.state.economy.cash + days * (recentDailyContribution(w) - dailyFixedCosts(w));
}

/**
 * Warning / crisis / recovery state machine with hysteresis (evaluated hourly).
 * Warning: projected cash cannot cover ~5 days of fixed costs. Crisis: cannot cover 3 days.
 * Recovery: cash below zero or overdue debt (obligations cannot be met).
 */
export function updateCrisis(w: World): void {
  const e = w.state.economy;
  const fixed = Math.max(1, dailyFixedCosts(w));
  const overdue = totalOverdue(w);
  const prev = e.crisis;
  const p3 = projectedCash(w, DEF.econ.crisisDays);
  const p5 = projectedCash(w, DEF.econ.warningDays);
  const margin = fixed * 0.25;
  let next: typeof prev;
  if (e.cash < 0 || overdue > 0) next = 'recovery';
  else if (p3 < 0) next = 'crisis';
  else if (p5 < 0) next = prev === 'crisis' && p3 < margin ? 'crisis' : 'warning';
  else next = prev !== 'none' && p5 < margin ? (prev === 'recovery' ? 'crisis' : prev) : 'none';
  if (prev === 'recovery' && next !== 'recovery' && p3 < margin) next = 'crisis';
  if (next === prev) return;
  e.crisis = next;
  e.crisisSince = w.tick;
  const rank = { none: 0, warning: 1, crisis: 2, recovery: 3 };
  if (next === 'warning' && prev === 'none') w.emit('ECONOMY_WARNING', { cash: e.cash, fixed });
  if (rank[next] >= 2 && rank[prev] < 2) w.emit('CRISIS_STARTED', { level: next, cash: e.cash, fixed });
  if (rank[next] < 2 && rank[prev] >= 2) w.emit('CRISIS_ENDED', { level: next, cash: e.cash });
}
