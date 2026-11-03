import { DEF } from '../data/definition';
import type { LoanState } from '../core/state';
import type { World } from '../core/world';
import { loanRemaining, makeInstallments, post } from './economy';

/**
 * Controlled reconstruction: an expensive fallback when operation has collapsed.
 * Debts are consolidated (with a 20 % fee), liquidity is restored with a loan (not a gift),
 * equipment upgrades are sold, reputation drops. Chapters and research are untouched.
 */
export function reconstruction(w: World, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const e = w.state.economy;
  if (e.crisis !== 'recovery') return { ok: false, errorsSv: ['Rekonstruktion kräver att sjukhuset är i återhämtningsläge'] };
  if (e.loans.some((l) => l.kind === 'reconstruction' && loanRemaining(l) > 0)) return { ok: false, errorsSv: ['En rekonstruktion pågår redan – betala av den först'] };
  if (e.lastReconstructionDay >= 0 && w.day - e.lastReconstructionDay < 20) return { ok: false, errorsSv: ['Rekonstruktion kan bara göras var 20:e dag'] };
  if (w.tick - e.crisisSince < DEF.sim.ticksPerDay / 2 && e.cash > -5000) return { ok: false, errorsSv: ['Försök med andra åtgärder först (minst 12 timmar i återhämtningsläge)'] };
  for (const r of w.state.rooms) {
    while (r.level > 1 && r.upgradeCosts.length) {
      if (w.state.reservations.some((x) => x.roomId === r.id && x.status === 'ACTIVE')) break;
      const paid = r.upgradeCosts.pop()!;
      r.level = (r.level - 1) as 1 | 2;
      post(w, Math.floor(paid * DEF.econ.equipmentSaleRate), 'equipmentSale', `Rekonstruktion: såld utrustning`, `room:${r.id}`);
    }
  }
  let consolidated = 0;
  for (const l of e.loans) {
    const rem = loanRemaining(l);
    if (rem <= 0) continue;
    consolidated += rem;
    l.paid += rem;
    l.overdue = 0;
    l.nextIndex = l.installments.length;
  }
  const cfg = DEF.econ.reconstruction;
  const injection = Math.max(0, cfg.targetCash - e.cash);
  const principal = consolidated + injection;
  const fee = Math.round(principal * cfg.feeRate);
  const loan: LoanState = { id: w.nextId('loan'), kind: 'reconstruction', principal, fee, termDays: cfg.termDays, takenDay: w.day, installments: makeInstallments(principal + fee, cfg.termDays), paid: 0, overdue: 0, nextIndex: 0 };
  e.loans = e.loans.filter((l) => loanRemaining(l) > 0);
  e.loans.push(loan);
  if (injection > 0) post(w, injection, 'reconstruction', 'Rekonstruktionskapital (lån)', `loan:${loan.id}`);
  e.reconstructions++;
  e.lastReconstructionDay = w.day;
  w.state.metrics.reputation = Math.max(0, w.state.metrics.reputation - cfg.reputationPenalty);
  w.emit('RECONSTRUCTION', { consolidated, injection, fee, loanId: loan.id }, `loan:${loan.id}`, causation);
  return { ok: true, errorsSv: [] };
}
