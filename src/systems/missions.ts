import { DEF, PROJECT_IDS } from '../data/definition';
import type { MissionTemplateId, RoomTypeId } from '../data/types';
import type { DayMetrics, MissionInstance } from '../core/state';
import type { World } from '../core/world';
import { post } from './economy';
import { aggregate, lastDays, roomUtilization } from './metrics';
import { addGRP, projectAvailable } from './research';
import { clamp } from './rules';

function reward(w: World, id: MissionTemplateId): MissionInstance['reward'] {
  const t = DEF.mission[id];
  const [lo, hi] = t.rewardRange;
  const cash = Math.round((lo + ((hi - lo) * (w.chapter - 1)) / 4) / 100) * 100;
  return { cash, reputation: t.reputationReward, grp: t.grpReward };
}

function missionDays(w: World, m: MissionInstance): DayMetrics[] {
  return w.state.metrics.days.filter((d) => d.day >= m.startDay && d.day <= m.endDay);
}

interface Candidate {
  template: MissionTemplateId;
  target: number;
  baseline: number;
  roomType?: RoomTypeId;
  disease?: MissionInstance['disease'];
  project?: MissionInstance['project'];
}

/** Triggers come from real metrics of the latest complete day(s). Every target is checked for attainability. */
function candidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const y = lastDays(w, 1);
  if (y.length === 0) return out;
  const a = aggregate(y);
  const a3 = aggregate(lastDays(w, 3));
  if (a.waitCount >= 5 && a.avgWait > 30) out.push({ template: 'M01', target: Math.max(15, Math.round(a.avgWait * 0.75)), baseline: a.avgWait });
  if (a.treated >= 5 && a.successRate < 80) out.push({ template: 'M02', target: Math.min(92, Math.round(a.successRate + 8)), baseline: a.successRate });
  // Busiest clinical department.
  let bestType: RoomTypeId | null = null;
  let bestUtil = 0;
  for (const r of w.state.rooms) {
    if (DEF.room[r.type].steps.length === 0 || r.type === 'R01') continue;
    const u = roomUtilization(y, r.type);
    if (u > bestUtil) {
      bestUtil = u;
      bestType = r.type;
    }
  }
  if (bestType && bestUtil > 70) {
    const daily = (y[0]!.treatmentsByRoom[bestType] ?? 0);
    if (daily >= 3) out.push({ template: 'M03', target: Math.ceil(daily * 1.1), baseline: daily, roomType: bestType });
  }
  if (a.result < 0) out.push({ template: 'M04', target: 1500, baseline: a.result });
  const lowSkill = w.state.staff.filter((s) => {
    const ranges = DEF.role[s.role].skillRanges;
    return Object.keys(ranges).some((k) => k !== 'SK11' && (s.skills[k as keyof typeof s.skills] ?? 0) < 35);
  }).length;
  if (lowSkill >= 2 && w.state.economy.cash > 8000) out.push({ template: 'M05', target: w.chapter >= 3 ? 2 : 1, baseline: lowSkill });
  if (a.avgSatisfaction > 0 && a.avgSatisfaction < 65 && y[0]!.satisfactionCount >= 5) out.push({ template: 'M06', target: Math.min(85, Math.round(a.avgSatisfaction + 7)), baseline: a.avgSatisfaction });
  if (w.chapter >= 2) {
    const r = w.state.research;
    const obs = Object.values(DEF.disease).find((d) => d.chapter <= w.chapter && r.observed.includes(d.id) && !r.identified.includes(d.id) && d.identifyThreshold - (r.rp[d.id] ?? 0) <= 60);
    if (obs) out.push({ template: 'M07', target: obs.identifyThreshold, baseline: r.rp[obs.id] ?? 0, disease: obs.id });
    const ident = Object.values(DEF.disease).find((d) => r.identified.includes(d.id) && !r.mastered.includes(d.id) && d.masteryThreshold - (r.rp[d.id] ?? 0) <= 80 + Math.min(r.grp, 100) * 2);
    if (ident) out.push({ template: 'M08', target: ident.masteryThreshold, baseline: r.rp[ident.id] ?? 0, disease: ident.id });
    const dailyGrp = Math.max(1, a3.grp / Math.max(1, a3.days));
    const proj = PROJECT_IDS.find((pid) => {
      const p = DEF.project[pid];
      if (r.projectsDone.includes(pid) || r.active) return false;
      const reqOk = p.requires.every((q) => r.projectsDone.includes(q)) && p.chapter <= w.chapter;
      return reqOk && p.grp <= r.grp + dailyGrp * 3 && projectAvailable(w, pid).reasonSv !== 'Redan klart';
    });
    if (proj) out.push({ template: 'M12', target: 1, baseline: 0, project: proj });
    if (a.walkCount >= 5 && a.avgWalk > 30) out.push({ template: 'M10', target: Math.round(a.avgWalk * 0.88), baseline: a.avgWalk });
    const prevDemand = a3.days > 0 ? a3.arrivals / a3.days : 0;
    if (prevDemand > 0 && w.state.metrics.demand.expected >= prevDemand * 1.12) out.push({ template: 'M11', target: Math.round(w.state.metrics.demand.expected * 0.75), baseline: prevDemand });
  }
  if (a.avgStress > 40 || (a.avgEnergy > 0 && a.avgEnergy < 40)) out.push({ template: 'M09', target: Math.max(15, Math.round(a.avgStress - 12)), baseline: a.avgStress });
  return out;
}

export function missionDayEnd(w: World): void {
  const ms = w.state.missions;
  const today = w.day; // new day already started
  for (const m of ms.active) {
    if (m.status !== 'active') continue;
    const days = missionDays(w, m);
    const a = aggregate(days);
    let success = false;
    let impossible = false;
    switch (m.template) {
      case 'M01': m.progress = a.avgWait; success = a.waitCount >= 5 && a.avgWait < m.target && days.length >= 1; break;
      case 'M02': m.progress = a.successRate; success = a.treated >= 5 && a.successRate >= m.target; break;
      case 'M03': {
        const n = days.reduce((s, d) => s + (d.treatmentsByRoom[m.roomType!] ?? 0), 0);
        m.progress = n;
        // Target is per day; success when the daily average over the mission reaches it.
        success = days.length > 0 && n / days.length >= m.target;
        if (!w.state.rooms.some((r) => r.type === m.roomType)) impossible = true;
        break;
      }
      case 'M04': m.progress = a.result; success = a.result >= m.target; break;
      case 'M05': m.progress = a.trainings; success = a.trainings >= m.target; break;
      case 'M06': m.progress = a.avgSatisfaction; success = a.avgSatisfaction >= m.target && days.some((d) => d.satisfactionCount > 0); break;
      case 'M07': m.progress = w.state.research.rp[m.disease!] ?? 0; success = w.state.research.identified.includes(m.disease!); break;
      case 'M08': m.progress = w.state.research.rp[m.disease!] ?? 0; success = w.state.research.mastered.includes(m.disease!); break;
      case 'M09': m.progress = a.avgStress; success = a.avgStress > 0 && a.avgStress < m.target; break;
      case 'M10': m.progress = a.avgWalk; success = a.walkCount >= 5 && a.avgWalk < m.target; break;
      case 'M11': m.progress = a.completed; success = a.completed >= m.target; break;
      case 'M12': m.progress = w.state.research.projectsDone.includes(m.project!) ? 1 : 0; success = m.progress === 1; break;
    }
    if (success) completeMission(w, m);
    else if (impossible) {
      m.status = 'cancelled';
      w.emit('MISSION_FAILED', { missionId: m.id, template: m.template, cancelled: true }, `mission:${m.id}`);
    } else if (today > m.endDay) {
      m.status = 'failed';
      w.emit('MISSION_FAILED', { missionId: m.id, template: m.template }, `mission:${m.id}`);
    }
    if (m.status !== 'active') ms.cooldowns[m.template] = today + DEF.mission[m.template].cooldownDays;
  }
  const done = ms.active.filter((m) => m.status !== 'active');
  ms.recent.push(...done);
  if (ms.recent.length > 40) ms.recent.splice(0, ms.recent.length - 40);
  ms.active = ms.active.filter((m) => m.status === 'active');
  // Generate new missions (max three active).
  if (ms.active.length >= 3) return;
  const cands = candidates(w).filter((c) => {
    if (ms.active.some((m) => m.template === c.template)) return false;
    if ((ms.cooldowns[c.template] ?? -1) > today) return false;
    if (ms.lastTemplate === c.template) return false;
    if (DEF.mission[c.template].minChapter > w.chapter) return false;
    // No duplicates on the same metric/department.
    if (c.roomType && ms.active.some((m) => m.roomType === c.roomType)) return false;
    if (c.disease && ms.active.some((m) => m.disease === c.disease)) return false;
    return true;
  });
  const picks = Math.min(3 - ms.active.length, w.day >= 1 ? 1 : 0);
  for (let i = 0; i < picks && cands.length; i++) {
    const c = cands.splice(w.rng.int(0, cands.length - 1), 1)[0]!;
    const t = DEF.mission[c.template];
    const dur = w.rng.int(t.durationDays[0], t.durationDays[1]);
    const m: MissionInstance = {
      id: w.nextId('mission'), template: c.template, startDay: today, endDay: today + dur - 1, target: Math.round(c.target * 10) / 10,
      baseline: Math.round(c.baseline * 10) / 10, roomType: c.roomType ?? null, disease: c.disease ?? null, project: c.project ?? null,
      reward: reward(w, c.template), progress: 0, status: 'active', paid: false,
    };
    ms.active.push(m);
    ms.lastTemplate = c.template;
    w.emit('MISSION_STARTED', { missionId: m.id, template: m.template, target: m.target }, `mission:${m.id}`);
  }
}

/** Disease/research missions can complete mid-day. */
export function missionQuickCheck(w: World): void {
  if (w.tick % 100 !== 0) return;
  for (const m of w.state.missions.active) {
    if (m.status !== 'active') continue;
    const r = w.state.research;
    if ((m.template === 'M07' && r.identified.includes(m.disease!)) || (m.template === 'M08' && r.mastered.includes(m.disease!)) || (m.template === 'M12' && r.projectsDone.includes(m.project!))) completeMission(w, m);
  }
}

function completeMission(w: World, m: MissionInstance): void {
  if (m.paid) return;
  m.status = 'success';
  m.paid = true;
  w.state.missions.completedCount++;
  post(w, m.reward.cash, 'mission', `Uppdrag: ${DEF.mission[m.template].nameSv}`, `mission:${m.id}`);
  if (m.reward.reputation) w.state.metrics.reputation = clamp(w.state.metrics.reputation + m.reward.reputation, 0, 100);
  if (m.reward.grp) addGRP(w, m.reward.grp, 'mission');
  w.emit('MISSION_COMPLETED', { missionId: m.id, template: m.template, reward: m.reward }, `mission:${m.id}`);
}

export function missionText(m: MissionInstance): string {
  const t = DEF.mission[m.template];
  return t.descriptionSv
    .replace('{target}', String(Math.round(m.target)))
    .replace('{room}', m.roomType ? DEF.room[m.roomType].nameSv.toLowerCase() : '')
    .replace('{disease}', m.disease ? DEF.disease[m.disease].nameSv : '')
    .replace('{project}', m.project ? DEF.project[m.project].nameSv : '');
}
