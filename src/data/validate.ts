import type { GameDefinition, ProjectId } from './types';

export interface ValidationIssue {
  path: string;
  message: string;
}

const EXPECTED_COUNTS = { rooms: 18, diseases: 24, roles: 9, skills: 12, trainings: 12, projects: 12, missions: 12, events: 12, chapters: 5 } as const;

/** Validates counts, unique IDs and every cross reference in the static game definition. */
export function validateDefinition(def: GameDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  for (const [key, count] of Object.entries(EXPECTED_COUNTS)) {
    const arr = (def as unknown as Record<string, unknown[]>)[key]!;
    if (arr.length !== count) add(key, `expected ${count} entries, found ${arr.length}`);
    const ids = arr.map((x) => String((x as { id: unknown }).id));
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) add(key, `duplicate ids: ${dup.join(', ')}`);
  }

  const roomIds = new Set(def.rooms.map((r) => r.id));
  const roleIds = new Set(def.roles.map((r) => r.id));
  const skillIds = new Set(def.skills.map((s) => s.id));
  const stepKinds = new Set(def.steps.map((s) => s.kind));
  const projectIds = new Set(def.projects.map((p) => p.id));
  const roomById = new Map(def.rooms.map((r) => [r.id, r]));
  const stepByKind = new Map(def.steps.map((s) => [s.kind, s]));
  const roleById = new Map(def.roles.map((r) => [r.id, r]));

  for (const r of def.rooms) {
    if (r.minW < 3 || r.minH < 3) add(`rooms.${r.id}`, 'minimum size below 3');
    for (const role of r.team) if (!roleIds.has(role)) add(`rooms.${r.id}.team`, `unknown role ${role}`);
    for (const s of r.steps) {
      if (!stepKinds.has(s)) add(`rooms.${r.id}.steps`, `unknown step ${s}`);
      else if (stepByKind.get(s)!.roomType !== r.id) add(`rooms.${r.id}.steps`, `step ${s} belongs to another room`);
    }
    for (const req of r.requiredSkill) {
      if (!r.team.includes(req.role)) add(`rooms.${r.id}.requiredSkill`, `role ${req.role} not in team`);
      if (!skillIds.has(req.skill)) add(`rooms.${r.id}.requiredSkill`, `unknown skill ${req.skill}`);
    }
    for (const role of r.team) {
      const rd = roleById.get(role);
      if (rd && rd.unlockChapter > r.unlockChapter) add(`rooms.${r.id}`, `role ${role} unlocks after the room`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(r.accent)) add(`rooms.${r.id}.accent`, 'invalid colour');
  }
  for (const s of def.steps) {
    if (!roomIds.has(s.roomType)) add(`steps.${s.kind}`, `unknown room ${s.roomType}`);
    for (const sk of [...s.speedSkills, ...s.qualitySkills]) if (!skillIds.has(sk)) add(`steps.${s.kind}`, `unknown skill ${sk}`);
    if (s.baseMinutes <= 0) add(`steps.${s.kind}`, 'non-positive duration');
  }
  const checkPath = (where: string, path: string[], chapter: number, strictChapter: boolean) => {
    if (path.length === 0) add(where, 'empty path');
    path.forEach((k, i) => {
      const step = stepByKind.get(k as never);
      if (!step) return add(where, `unknown step ${k}`);
      if (k === 'REG') add(where, 'REG must not be part of a disease path');
      const room = roomById.get(step.roomType)!;
      if (strictChapter && room.unlockChapter > chapter) add(where, `step ${k} needs room ${room.id} unlocked in chapter ${room.unlockChapter} > disease chapter ${chapter}`);
      if (step.requiresSample && !path.slice(0, i).some((p) => stepByKind.get(p as never)?.createsSample)) add(where, `step ${k} requires an earlier sample step`);
    });
    if (!path.some((k) => stepByKind.get(k as never)?.assessment)) add(where, 'path lacks an assessment step (U or E)');
  };
  for (const d of def.diseases) {
    checkPath(`diseases.${d.id}.path`, d.path, d.chapter, true);
    if (d.pharmacyPath) checkPath(`diseases.${d.id}.pharmacyPath`, d.pharmacyPath, 5, false);
    if (d.severeVariant) checkPath(`diseases.${d.id}.severeVariant`, d.severeVariant.path, 5, false);
    if (d.diseaseFactor < 0.85 || d.diseaseFactor > 1.2) add(`diseases.${d.id}`, 'disease factor outside 0.85–1.20');
    if (d.triage < 1 || d.triage > 5) add(`diseases.${d.id}`, 'triage outside 1–5');
    if (d.masteryThreshold <= d.identifyThreshold) add(`diseases.${d.id}`, 'mastery threshold must exceed identification threshold');
    if (d.material >= d.revenue) add(`diseases.${d.id}`, 'material cost exceeds revenue');
  }
  for (const r of def.roles) for (const sk of Object.keys(r.skillRanges)) if (!skillIds.has(sk as never)) add(`roles.${r.id}`, `unknown skill ${sk}`);
  for (const t of def.trainings) {
    if (!skillIds.has(t.skill)) add(`trainings.${t.id}`, `unknown skill ${t.skill}`);
    for (const role of t.roles) if (!roleIds.has(role)) add(`trainings.${t.id}`, `unknown role ${role}`);
  }
  const trainedSkills = new Set(def.trainings.map((t) => t.skill));
  for (const s of def.skills) if (!trainedSkills.has(s.id)) add(`skills.${s.id}`, 'no training course raises this skill');

  // Research dependency graph: references, chapter ordering, acyclicity.
  const projById = new Map(def.projects.map((p) => [p.id, p]));
  for (const p of def.projects) {
    for (const req of p.requires) {
      if (!projectIds.has(req)) add(`projects.${p.id}`, `unknown prerequisite ${req}`);
      else if (projById.get(req)!.chapter > p.chapter) add(`projects.${p.id}`, `prerequisite ${req} unlocks later`);
    }
    if (p.effect.kind === 'stepSpeed' || p.effect.kind === 'stepQuality') for (const s of p.effect.steps) if (!stepKinds.has(s)) add(`projects.${p.id}`, `unknown step ${s}`);
  }
  const visiting = new Set<ProjectId>();
  const done = new Set<ProjectId>();
  const visit = (id: ProjectId): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      add(`projects.${id}`, 'dependency cycle');
      return;
    }
    visiting.add(id);
    for (const r of projById.get(id)?.requires ?? []) visit(r);
    visiting.delete(id);
    done.add(id);
  };
  def.projects.forEach((p) => visit(p.id));
  const totalGrp = def.projects.reduce((s, p) => s + p.grp, 0);
  if (totalGrp !== 3580) add('projects', `total GRP ${totalGrp} != 3580`);

  // Campaign mastery route: 15 pre-chapter-5 diseases + 3 chapter-5 absurd diseases = 3,300 RP.
  const route = def.diseases.filter((d) => d.chapter < 5 || (d.chapter === 5 && d.category === 'absurd'));
  if (route.length !== 18) add('diseases', `mastery route has ${route.length} diseases, expected 18`);
  const routeRp = route.reduce((s, d) => s + d.masteryThreshold, 0);
  if (routeRp !== 3300) add('diseases', `mastery route RP ${routeRp} != 3300`);

  for (const c of def.chapters) for (const req of c.requirements) if (req.roomType && !roomIds.has(req.roomType)) add(`chapters.${c.id}`, `unknown room ${req.roomType}`);
  for (const e of def.events) if (e.options.length === 0) add(`events.${e.id}`, 'event has no options');
  for (const m of def.missions) if (m.rewardRange[0] < 1000 || m.rewardRange[1] > 8000) add(`missions.${m.id}`, 'reward outside 1,000–8,000 kr');

  const stages = def.economy.landStages;
  for (let i = 1; i < stages.length; i++) {
    const a = stages[i - 1]!;
    const b = stages[i]!;
    if (b.x0 > a.x0 || b.y0 > a.y0 || b.x0 + b.size < a.x0 + a.size || b.y0 + b.size < a.y0 + a.size) add('economy.landStages', `stage ${b.stage} does not contain stage ${a.stage}`);
    if (b.x0 < 0 || b.y0 < 0 || b.x0 + b.size > 64 || b.y0 + b.size > 64) add('economy.landStages', `stage ${b.stage} outside 64×64 map`);
  }
  if (def.simulation.ticksPerDay * def.simulation.minutesPerTick !== 1440) add('simulation', 'tick length does not produce 1440 minutes per day');
  const blockShare = def.simulation.arrivalBlocks.reduce((s, b) => s + b.share, 0);
  if (Math.abs(blockShare - 1) > 1e-9) add('simulation.arrivalBlocks', 'shares do not sum to 1');
  for (const [ch, mix] of Object.entries(def.simulation.categoryMix)) {
    const sum = mix.ordinary + mix.absurd + mix.mysterious;
    if (Math.abs(sum - 1) > 1e-9) add(`simulation.categoryMix.${ch}`, 'shares do not sum to 1');
  }
  return issues;
}
