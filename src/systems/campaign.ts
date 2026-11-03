import { DEF } from '../data/definition';
import { FINAL_INSPECTION } from '../data/progression';
import type { ChapterId, RequirementDef } from '../data/types';
import type { World } from '../core/world';
import { post, totalOverdue } from './economy';
import { aggregate, lastDays } from './metrics';
import { roomInService } from './rules';
import { refreshCandidates } from './staff';

export interface RequirementStatus {
  def: RequirementDef;
  met: boolean;
  current: number;
  target: number;
  labelSv: string;
}

function inService(w: World, type: string): number {
  return w.state.rooms.filter((r) => r.type === type && roomInService(w, r)).length;
}

export function evaluateRequirement(w: World, req: RequirementDef): RequirementStatus {
  const t = w.state.metrics.totals;
  let current = 0;
  let met = false;
  switch (req.kind) {
    case 'completedPatients':
      current = t.completed;
      met = current >= req.target;
      break;
    case 'operationalRooms':
      current = inService(w, req.roomType!);
      met = current >= req.target;
      break;
    case 'reputation':
      current = Math.round(w.state.metrics.reputation * 10) / 10;
      met = w.state.metrics.reputation >= req.target;
      break;
    case 'positiveResultDays': {
      const days = lastDays(w, req.window ?? 3);
      current = aggregate(days).result;
      met = days.length >= (req.window ?? 3) && current > 0;
      break;
    }
    case 'diagnosticExams':
      current = t.diagnosticExams;
      met = current >= req.target;
      break;
    case 'identifiedDiseases':
      current = w.state.research.identified.length;
      met = current >= req.target;
      break;
    case 'successRate7d': {
      const a = aggregate(lastDays(w, req.window ?? 7));
      current = Math.round(a.successRate * 10) / 10;
      met = a.treated >= (req.minSample ?? 0) && a.successRate >= req.target;
      break;
    }
    case 'avgWait5d': {
      const days = lastDays(w, req.window ?? 5);
      const a = aggregate(days);
      current = Math.round(a.avgWait * 10) / 10;
      met = days.length >= (req.window ?? 5) && a.waitCount >= (req.minSample ?? 0) && a.avgWait < req.target;
      break;
    }
    case 'trainedSpecialists': {
      const adv = ['T04', 'T06', 'T07'] as const;
      current = w.state.staff.filter((s) => adv.some((tid) => s.completedTrainings.includes(tid) && (s.skills[DEF.training[tid].skill] ?? 0) >= 50)).length;
      met = current >= req.target;
      break;
    }
    case 'advancedTreatments':
      current = t.orthoSurgIcu;
      met = current >= req.target;
      break;
    case 'specialistDepartments':
      current = (['R08', 'R10', 'R13', 'R15'] as const).filter((ty) => inService(w, ty) > 0).length;
      met = current >= req.target;
      break;
    case 'positiveCashflowDays': {
      const days = lastDays(w, req.window ?? 7);
      current = days.filter((d) => d.result > 0).length;
      met = days.length >= (req.window ?? 7) && current >= req.target;
      break;
    }
    case 'masteredDiseases':
      current = w.state.research.mastered.length;
      met = current >= req.target;
      break;
    case 'finalDepartments':
      current = FINAL_INSPECTION.requiredRooms.filter((ty) => inService(w, ty) > 0).length;
      met = current >= FINAL_INSPECTION.requiredRooms.length;
      return { def: req, met, current, target: FINAL_INSPECTION.requiredRooms.length, labelSv: req.labelSv };
    case 'noOverdueDebt':
      current = totalOverdue(w);
      met = current === 0;
      return { def: req, met, current, target: 0, labelSv: req.labelSv };
  }
  return { def: req, met, current, target: req.target, labelSv: req.labelSv };
}

export function chapterStatus(w: World): RequirementStatus[] {
  const ch = DEF.chapter[String(w.chapter) as '1'];
  return ch.requirements.map((r) => evaluateRequirement(w, r));
}

/** Checked hourly: completes chapters 1–4, pays one-time grants with permanent markers. */
export function campaignTick(w: World): void {
  if (w.tick % 100 !== 0) return;
  const p = w.state.progress;
  if (p.chapter >= 5) return;
  const status = chapterStatus(w);
  if (!status.every((s) => s.met)) return;
  completeChapter(w, p.chapter);
}

export function completeChapter(w: World, chapter: ChapterId): void {
  const p = w.state.progress;
  if (p.chapter !== chapter) return;
  const grant = DEF.econ.chapterGrants[chapter] ?? 0;
  if (!w.state.economy.grantsPaid.includes(chapter)) {
    w.state.economy.grantsPaid.push(chapter);
    if (grant > 0) post(w, grant, 'grant', `Kapitelbidrag kapitel ${chapter}`, `chapter:${chapter}`);
  }
  p.chapterCompletedTick.push(w.tick);
  p.chapter = (chapter + 1) as ChapterId;
  // Newly eligible diseases start their rarity clock now.
  for (const d of Object.values(DEF.disease)) if (d.chapter <= p.chapter && w.state.research.lastSeenDay[d.id] === undefined) w.state.research.lastSeenDay[d.id] = w.day;
  refreshCandidates(w);
  w.matchDirty = true;
  w.emit('CAMPAIGN_CHAPTER_COMPLETED', { chapter, next: p.chapter, grant }, `chapter:${chapter}`);
}

export function inspectionPrerequisites(w: World): RequirementStatus[] {
  return DEF.chapter['5'].requirements.map((r) => evaluateRequirement(w, r));
}

export function startFinalInspection(w: World, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const p = w.state.progress;
  if (p.chapter !== 5) return { ok: false, errorsSv: ['Slutinspektionen kräver kapitel 5'] };
  if (p.inspection?.active) return { ok: false, errorsSv: ['Inspektionen pågår redan'] };
  if (p.victory && !p.continuedAfterVictory) return { ok: false, errorsSv: ['Du har redan vunnit'] };
  const unmet = inspectionPrerequisites(w).filter((s) => !s.met);
  if (unmet.length) return { ok: false, errorsSv: unmet.map((u) => `Ej uppfyllt: ${u.labelSv}`) };
  const attempts = (p.inspection?.attempts ?? 0) + 1;
  p.inspection = { active: true, startDay: w.day + 1, days: [], attempts, lastResult: 'none', failReasonSv: '' };
  w.emit('INSPECTION_STARTED', { startDay: w.day + 1, attempt: attempts }, 'inspection', causation);
  return { ok: true, errorsSv: [] };
}

/** Called right after a day has been closed. */
export function inspectionDayEnd(w: World): void {
  const insp = w.state.progress.inspection;
  if (!insp || !insp.active) return;
  const d = w.state.metrics.days[w.state.metrics.days.length - 1];
  if (!d || d.day < insp.startDay) return;
  const overdue = totalOverdue(w) > 0;
  insp.days.push({ day: d.day, completed: d.completed, success: d.success, treatedOutcomes: d.treatedOutcomes, waitSum: d.waitSum, waitCount: d.waitCount, result: d.result, overdue });
  w.emit('INSPECTION_DAY', { day: insp.days.length, completed: d.completed }, 'inspection');
  const fail = (reason: string) => {
    insp.active = false;
    insp.lastResult = 'failed';
    insp.failReasonSv = reason;
    w.emit('INSPECTION_FAILED', { reason, day: insp.days.length }, 'inspection');
  };
  if (d.completed < FINAL_INSPECTION.minCompletedPerDay) return fail(`Dag ${insp.days.length}: bara ${d.completed} slutförda vårdfall (minst ${FINAL_INSPECTION.minCompletedPerDay})`);
  if (overdue) return fail(`Dag ${insp.days.length}: förfallna skulder`);
  if (insp.days.length < FINAL_INSPECTION.days) return;
  const treated = insp.days.reduce((s, x) => s + x.treatedOutcomes, 0);
  const success = insp.days.reduce((s, x) => s + x.success, 0);
  const waitCount = insp.days.reduce((s, x) => s + x.waitCount, 0);
  const avgWait = waitCount ? insp.days.reduce((s, x) => s + x.waitSum, 0) / waitCount : 999;
  const result = insp.days.reduce((s, x) => s + x.result, 0);
  const rate = treated ? (success / treated) * 100 : 0;
  if (rate < FINAL_INSPECTION.minSuccessRate) return fail(`Lyckade behandlingar ${rate.toFixed(1)} % (krav ${FINAL_INSPECTION.minSuccessRate} %)`);
  if (avgWait >= FINAL_INSPECTION.maxAvgWait) return fail(`Snittväntetid ${avgWait.toFixed(1)} min (krav under ${FINAL_INSPECTION.maxAvgWait})`);
  if (result <= 0) return fail('Rörelseresultatet under inspektionen var inte positivt');
  if (w.state.metrics.reputation < FINAL_INSPECTION.minReputationEnd) return fail(`Ryktet ${w.state.metrics.reputation.toFixed(1)} (krav ${FINAL_INSPECTION.minReputationEnd})`);
  insp.active = false;
  insp.lastResult = 'passed';
  w.state.progress.victory = { tick: w.tick, day: w.day };
  w.emit('CAMPAIGN_VICTORY', { day: w.day, successRate: rate, avgWait, result }, 'campaign');
}
