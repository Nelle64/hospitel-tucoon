import { DEF, DISEASE_IDS } from '../data/definition';
import type { DiseaseId, ProjectId } from '../data/types';
import type { World } from '../core/world';
import { clamp, onDuty, staffOfRoom } from './rules';

export function addGRP(w: World, amount: number, reason: string): void {
  if (amount <= 0 || w.chapter < 2) return;
  const r = w.state.research;
  const mult = r.projectsDone.includes('F10') ? 1.15 : 1;
  const total = amount * mult + r.grpFrac;
  const whole = Math.floor(total + 1e-9);
  r.grpFrac = total - whole;
  r.grp += whole;
  w.state.metrics.today.grpEarned += whole;
  void reason;
}

/** Disease-specific research points; handles identification and permanent mastery. */
export function addRP(w: World, disease: DiseaseId, amount: number, reason: string): void {
  if (amount <= 0) return;
  const r = w.state.research;
  const d = DEF.disease[disease];
  const before = r.rp[disease] ?? 0;
  const after = before + amount;
  r.rp[disease] = after;
  w.state.metrics.today.rpEarned += amount;
  if (!r.identified.includes(disease) && after >= d.identifyThreshold && r.observed.includes(disease)) {
    r.identified.push(disease);
    addGRP(w, 15, 'identified');
    w.emit('DISEASE_IDENTIFIED', { disease, reason }, `disease:${disease}`);
  }
  if (!r.mastered.includes(disease) && r.identified.includes(disease) && after >= d.masteryThreshold) {
    r.mastered.push(disease);
    addGRP(w, 25, 'mastered');
    w.emit('DISEASE_MASTERED', { disease, reason }, `disease:${disease}`);
  }
}

/** First observation of a disease in this campaign: +20 RP once. */
export function observeDisease(w: World, disease: DiseaseId): void {
  const r = w.state.research;
  if (r.observed.includes(disease)) return;
  r.observed.push(disease);
  addRP(w, disease, 20, 'firstObservation');
  // Threshold-0 diseases become identified on first observation even if RP already sufficed.
  const d = DEF.disease[disease];
  if (!r.identified.includes(disease) && (r.rp[disease] ?? 0) >= d.identifyThreshold) {
    r.identified.push(disease);
    addGRP(w, 15, 'identified');
    w.emit('DISEASE_IDENTIFIED', { disease, reason: 'observation' }, `disease:${disease}`);
  }
}

export function researchUnlocked(w: World): boolean {
  return w.chapter >= 2;
}

export function projectAvailable(w: World, id: ProjectId): { ok: boolean; reasonSv?: string } {
  const p = DEF.project[id];
  const r = w.state.research;
  if (!researchUnlocked(w)) return { ok: false, reasonSv: 'Forskning låses upp i kapitel 2' };
  if (r.projectsDone.includes(id)) return { ok: false, reasonSv: 'Redan klart' };
  if (r.active) return { ok: false, reasonSv: 'Ett projekt pågår redan' };
  if (w.chapter < p.chapter) return { ok: false, reasonSv: `Kräver kapitel ${p.chapter}` };
  const missing = p.requires.filter((q) => !r.projectsDone.includes(q));
  if (missing.length) return { ok: false, reasonSv: `Kräver ${missing.map((m) => DEF.project[m].nameSv).join(', ')}` };
  if (r.grp < p.grp) return { ok: false, reasonSv: `Kräver ${p.grp} FP (du har ${r.grp})` };
  return { ok: true };
}

export function startResearch(w: World, id: ProjectId, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const a = projectAvailable(w, id);
  if (!a.ok) return { ok: false, errorsSv: [a.reasonSv!] };
  const p = DEF.project[id];
  const r = w.state.research;
  r.grp -= p.grp;
  r.active = { id, startTick: w.tick, endTick: w.tick + w.minutesToTicks(p.hours * 60) };
  w.emit('RESEARCH_STARTED', { project: id }, `project:${id}`, causation);
  return { ok: true, errorsSv: [] };
}

export function convertGrpToRp(w: World, disease: DiseaseId, grp: number): { ok: boolean; errorsSv: string[] } {
  const r = w.state.research;
  if (!researchUnlocked(w)) return { ok: false, errorsSv: ['Forskning låses upp i kapitel 2'] };
  if (!r.identified.includes(disease)) return { ok: false, errorsSv: ['Sjukdomen måste vara identifierad'] };
  if (r.mastered.includes(disease)) return { ok: false, errorsSv: ['Sjukdomen är redan bemästrad'] };
  if (!Number.isInteger(grp) || grp <= 0) return { ok: false, errorsSv: ['Ogiltigt antal'] };
  const used = r.convertedToday[disease] ?? 0;
  if (used + grp > 100) return { ok: false, errorsSv: [`Max 100 FP per sjukdom och dag (kvar idag: ${100 - used})`] };
  if (r.grp < grp) return { ok: false, errorsSv: ['Inte tillräckligt med forskningspoäng'] };
  r.grp -= grp;
  r.convertedToday[disease] = used + grp;
  addRP(w, disease, grp * 2, 'conversion');
  return { ok: true, errorsSv: [] };
}

export function setResearchFocus(w: World, disease: DiseaseId | null): { ok: boolean; errorsSv: string[] } {
  if (disease !== null && !w.state.research.identified.includes(disease)) return { ok: false, errorsSv: ['Sjukdomen måste vara identifierad'] };
  w.state.research.focus = disease;
  return { ok: true, errorsSv: [] };
}

/** Called every tick: completes projects, produces GRP in staffed research labs (hourly). */
export function researchTick(w: World): void {
  const r = w.state.research;
  if (r.active && w.tick >= r.active.endTick) {
    const id = r.active.id;
    r.active = null;
    r.projectsDone.push(id);
    w.matchDirty = true;
    w.emit('RESEARCH_COMPLETED', { project: id }, `project:${id}`);
  }
  if (w.tick % 100 === 0) {
    for (const room of w.state.rooms) {
      if (room.type !== 'R16' || !room.open || room.closing) continue;
      const researchers = staffOfRoom(w, room.id).filter((s) => onDuty(w, s) && s.task.kind === 'research' && s.state === 'WORKING');
      const stations = room.layout.stations.length;
      for (const s of researchers.slice(0, stations)) {
        const mult = clamp(1 + (s.skills.SK10 ?? 0) / 100, 1, 2);
        addGRP(w, 2 * mult, 'researchLab');
      }
    }
  }
}

/** Daily focus conversion: half of today's earned GRP (max 100) goes to the focus disease. */
export function researchDayEnd(w: World): void {
  const r = w.state.research;
  if (r.focus && !r.mastered.includes(r.focus) && r.identified.includes(r.focus)) {
    const used = r.convertedToday[r.focus] ?? 0;
    const amount = Math.min(Math.floor(w.state.metrics.today.grpEarned / 2), 100 - used, r.grp);
    if (amount > 0) convertGrpToRp(w, r.focus, amount);
  }
  r.convertedToday = {};
}

export function identifiedCount(w: World): number {
  return w.state.research.identified.length;
}

export function allDiseaseIds(): DiseaseId[] {
  return DISEASE_IDS;
}
