import { DEF } from '../data/definition';
import type { RoleId, RoomTypeId, StepKind } from '../data/types';
import { DIR_DELTA, idx } from '../core/grid';
import type { CaseState, EventInstance, RoomState, StaffState } from '../core/state';
import type { World } from '../core/world';
import { corridorReach } from './navigation';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function activeEvent(w: World, template: string): EventInstance | undefined {
  return w.state.events.active.find((e) => e.template === template && !e.ended && e.choice !== null && e.startTick <= w.tick && e.endTick > w.tick);
}

/** Numeric modifiers from active special events. */
export function eventMod(w: World, key: 'regSlow' | 'robotSlow' | 'breakRecovery' | 'dirtRate' | 'demand' | 'surgicalDemand' | 'repWeight'): number {
  switch (key) {
    case 'regSlow':
      return activeEvent(w, 'E03')?.choice === 'attend' ? 0.35 : 0;
    case 'robotSlow': {
      const e = activeEvent(w, 'E12');
      if (!e) return 0;
      return e.choice === 'negotiate' ? 0.2 : 0.5;
    }
    case 'breakRecovery':
      return activeEvent(w, 'E01') ? 0.6 : 1;
    case 'dirtRate': {
      const e = activeEvent(w, 'E04');
      if (!e) return 1;
      return e.choice === 'extra' ? 1.3 : 2;
    }
    case 'demand':
      return activeEvent(w, 'E06') ? 1.25 : 1;
    case 'surgicalDemand':
      return activeEvent(w, 'E10') ? 1 : 0;
    case 'repWeight': {
      const e = activeEvent(w, 'E02');
      if (!e) return 1;
      return e.choice === 'vip' ? 3 : 2;
    }
  }
}

export function onShiftNow(w: World, s: StaffState): boolean {
  return (s.shift === 'day') === w.isDayShift;
}

/** Staff member is physically present and allowed to work (not training, absent, or off shift). */
export function onDuty(w: World, s: StaffState): boolean {
  if (!s.onSite) return false;
  if (s.state === 'TRAINING' || s.state === 'UNAVAILABLE') return false;
  if (s.unavailableUntil > w.tick) return false;
  return onShiftNow(w, s) || s.overtime;
}

export function canFillSlot(s: StaffState, slot: RoleId): boolean {
  return s.role === slot || DEF.role[s.role].substitutesFor.includes(slot);
}

export function meetsSkillReq(s: StaffState, roomType: RoomTypeId, slot: RoleId): boolean {
  for (const req of DEF.room[roomType].requiredSkill) if (req.role === slot && (s.skills[req.skill] ?? 0) < req.min) return false;
  return true;
}

/** Greedy deterministic team formation from a candidate list (sorted by id). */
export function formTeams(roomType: RoomTypeId, candidates: StaffState[], maxTeams = 99): StaffState[][] {
  const team = DEF.room[roomType].team;
  if (team.length === 0) return [];
  const pool = candidates.slice().sort((a, b) => a.id - b.id);
  const used = new Set<number>();
  const teams: StaffState[][] = [];
  while (teams.length < maxTeams) {
    const t: StaffState[] = [];
    for (const slot of team) {
      const exact = pool.find((s) => !used.has(s.id) && s.role === slot && meetsSkillReq(s, roomType, slot));
      const sub = exact ?? pool.find((s) => !used.has(s.id) && canFillSlot(s, slot) && meetsSkillReq(s, roomType, slot));
      if (!sub) break;
      t.push(sub);
      used.add(sub.id);
    }
    if (t.length < team.length) break;
    teams.push(t);
  }
  return teams;
}

export function staffOfRoom(w: World, roomId: number): StaffState[] {
  return w.state.staff.filter((s) => s.roomId === roomId);
}

export function isScheduledOpen(w: World, type: RoomTypeId): boolean {
  return DEF.room[type].hours === 'allDay' || w.isDayShift;
}

export function roomAccessible(w: World, room: RoomState): boolean {
  const cacheKey = `access:${w.state.map.version}`;
  let reach = w.caches[cacheKey] as Uint8Array | undefined;
  if (!reach) {
    for (const k of Object.keys(w.caches)) if (k.startsWith('access:')) delete w.caches[k];
    reach = corridorReach(w);
    w.caches[cacheKey] = reach;
  }
  const [dx, dy] = DIR_DELTA[room.door.dir];
  return reach[idx(room.door.x + dx, room.door.y + dy)] === 1;
}

export const MIN_CLEANLINESS = 20;

export interface RoomStatus {
  operational: boolean;
  reasonSv: string;
  teams: number;
}

/** Live operational status for the current moment (used for matching and overlays). */
export function roomStatus(w: World, room: RoomState): RoomStatus {
  const def = DEF.room[room.type];
  if (room.closing) return { operational: false, reasonSv: 'Stängs för rivning', teams: 0 };
  if (!room.open) return { operational: false, reasonSv: 'Stängt', teams: 0 };
  if (room.brokenUntil > w.tick) return { operational: false, reasonSv: 'Ur funktion', teams: 0 };
  if (room.cleanliness < MIN_CLEANLINESS) return { operational: false, reasonSv: 'Behöver städas', teams: 0 };
  if (!roomAccessible(w, room)) return { operational: false, reasonSv: 'Saknar väg till entrén', teams: 0 };
  if (!isScheduledOpen(w, room.type)) return { operational: false, reasonSv: 'Utanför öppettider', teams: 0 };
  if (def.team.length === 0) return { operational: true, reasonSv: 'I drift', teams: 0 };
  const duty = staffOfRoom(w, room.id).filter((s) => onDuty(w, s));
  const teams = formTeams(room.type, duty).length;
  if (teams === 0) return { operational: false, reasonSv: 'Saknar personal på passet', teams: 0 };
  return { operational: true, reasonSv: 'I drift', teams };
}

/**
 * "Staffed for service": open, reachable, not broken and has a complete team assigned to a shift
 * that matches its opening hours. Used for campaign and inspection requirements.
 */
export function roomInService(w: World, room: RoomState): boolean {
  if (room.closing || !room.open || !roomAccessible(w, room)) return false;
  const def = DEF.room[room.type];
  if (def.team.length === 0) return true;
  const staff = staffOfRoom(w, room.id).filter((s) => s.state !== 'TRAINING' && (def.hours === 'allDay' || s.shift === 'day'));
  return formTeams(room.type, staff, 1).length > 0;
}

export function avgSkill(team: StaffState[], skills: string[]): number {
  if (team.length === 0 || skills.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const s of team) for (const k of skills) {
    sum += s.skills[k as keyof typeof s.skills] ?? 0;
    n++;
  }
  return n ? sum / n : 0;
}

export function skillSpeedBonus(score: number): number {
  return clamp((DEF.sim.maxSkillSpeedBonus * score) / 100, 0, DEF.sim.maxSkillSpeedBonus);
}

export function researchStepSpeed(w: World, step: StepKind, disease: CaseState['disease'] | null): number {
  let b = 0;
  for (const pid of w.state.research.projectsDone) {
    const e = DEF.project[pid].effect;
    if (e.kind === 'stepSpeed' && e.steps.includes(step)) b += e.value;
  }
  if (disease && w.state.research.mastered.includes(disease)) b += 0.05;
  return clamp(b, 0, DEF.sim.maxResearchSpeedBonus);
}

export function researchQuality(w: World, step: StepKind, disease: CaseState['disease'] | null): number {
  let q = 0;
  if (disease) {
    const d = DEF.disease[disease];
    const rp = w.state.research.rp[disease] ?? 0;
    q += 7 * clamp(rp / d.masteryThreshold, 0, 1);
  }
  for (const pid of w.state.research.projectsDone) {
    const e = DEF.project[pid].effect;
    if (e.kind === 'stepQuality' && e.steps.includes(step)) q += e.value;
  }
  return q;
}

export function cleanlinessQuality(room: RoomState): number {
  return clamp((room.cleanliness - 70) / 10, -5, 3);
}

/** Treatment duration (ticks) and quality score for a step performed by a team. */
export function computeTreatment(w: World, room: RoomState, step: StepKind, team: StaffState[], c: CaseState | null, patientHealth: number): { ticks: number; quality: number } {
  const sd = DEF.step[step];
  const diseaseFactor = c ? c.diseaseFactor : 1;
  const energy = team.length ? team.reduce((s, t) => s + t.energy, 0) / team.length : 80;
  const energyFactor = 1 + 0.25 * clamp((60 - energy) / 50, 0, 1);
  const skill = skillSpeedBonus(avgSkill(team, sd.speedSkills));
  let equip: number;
  if (DEF.room[room.type].upgradeKind === 'reception') equip = DEF.econ.supportUpgrades.receptionSpeed[room.level - 1]!;
  else equip = DEF.econ.upgradeLevels[room.level - 1]!.speed;
  equip = Math.min(equip, DEF.sim.maxEquipmentSpeedBonus);
  const research = researchStepSpeed(w, step, c ? c.disease : null);
  let traitFactor = 1;
  for (const s of team) {
    if (s.traits.includes('perfectionist')) traitFactor += 0.05 / team.length;
    if (s.traits.includes('chatty')) traitFactor += 0.05 / team.length;
  }
  let eventSlow = 0;
  if (step === 'REG') eventSlow = eventMod(w, 'regSlow');
  if (step === 'RB') eventSlow = eventMod(w, 'robotSlow');
  let minutes = (sd.baseMinutes * diseaseFactor * energyFactor * traitFactor) / (1 + skill + equip + research);
  minutes = Math.max(minutes, sd.baseMinutes * DEF.sim.minDurationFactor);
  if (eventSlow > 0) minutes /= 1 - eventSlow;
  const ticks = w.minutesToTicks(minutes);

  const qSkill = (15 * avgSkill(team, sd.qualitySkills)) / 100;
  const qEquip = DEF.room[room.type].upgradeKind === 'clinical' ? DEF.econ.upgradeLevels[room.level - 1]!.quality : 0;
  const qResearch = researchQuality(w, step, c ? c.disease : null);
  const stress = team.length ? team.reduce((s, t) => s + t.stress, 0) / team.length : 0;
  const qStress = (15 * stress) / 100;
  const severity = c ? DEF.disease[c.disease].severity : 1;
  const qDifficulty = clamp(severity * 2 + clamp((60 - patientHealth) / 12, 0, 5), 0, 15);
  let traitQ = 0;
  for (const s of team) if (s.traits.includes('perfectionist')) traitQ += 3 / team.length;
  const quality = clamp(65 + qSkill + qEquip + Math.min(7, qResearch) + Math.max(0, qResearch - 7) - qStress - qDifficulty + cleanlinessQuality(room) + traitQ, 5, 98);
  return { ticks, quality };
}

export function successProbability(avgQ: number): number {
  return clamp((avgQ - 15) / 75, 0.05, 0.985);
}

export function qualityFactor(avgQ: number): number {
  const [lo, hi] = DEF.econ.qualityFactorRange;
  return lo + ((clamp(avgQ, 5, 98) - 5) / 93) * (hi - lo);
}

export function researchRevenueFactor(w: World, disease: CaseState['disease']): number {
  const d = DEF.disease[disease];
  const rp = w.state.research.rp[disease] ?? 0;
  return 1 + DEF.econ.researchRevenueMax * clamp(rp / d.masteryThreshold, 0, 1);
}
