import { ECONOMY, NAVIGATION, SIMULATION } from './config';
import { DISEASES } from './diseases';
import { CHAPTERS, EVENTS, MISSIONS, PROJECTS } from './progression';
import { ROOMS, STEPS } from './rooms';
import { ROLES, SKILLS, TRAININGS } from './staff';
import type {
  DiseaseDef, DiseaseId, GameDefinition, ProjectDef, ProjectId, RoleDef, RoleId, RoomDef, RoomTypeId, SkillId, StepDef, StepKind, TrainingDef, TrainingId,
} from './types';

export const GAME_DATA_VERSION = '1.0.0';

export const GAME_DEFINITION: GameDefinition = {
  version: GAME_DATA_VERSION,
  rooms: ROOMS,
  steps: STEPS,
  diseases: DISEASES,
  roles: ROLES,
  skills: SKILLS,
  trainings: TRAININGS,
  projects: PROJECTS,
  missions: MISSIONS,
  events: EVENTS,
  chapters: CHAPTERS,
  economy: ECONOMY,
  simulation: SIMULATION,
  navigation: NAVIGATION,
};

function indexBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T> {
  const out = {} as Record<K, T>;
  for (const it of items) out[key(it)] = it;
  return out;
}

/** Fast lookup tables derived from the definition. */
export const DEF = {
  room: indexBy<RoomDef, RoomTypeId>(ROOMS, (r) => r.id),
  step: indexBy<StepDef, StepKind>(STEPS, (s) => s.kind),
  disease: indexBy<DiseaseDef, DiseaseId>(DISEASES, (d) => d.id),
  role: indexBy<RoleDef, RoleId>(ROLES, (r) => r.id),
  skill: indexBy(SKILLS, (s) => s.id as SkillId),
  training: indexBy<TrainingDef, TrainingId>(TRAININGS, (t) => t.id),
  project: indexBy<ProjectDef, ProjectId>(PROJECTS, (p) => p.id),
  mission: indexBy(MISSIONS, (m) => m.id),
  event: indexBy(EVENTS, (e) => e.id),
  chapter: indexBy(CHAPTERS, (c) => String(c.id) as '1' | '2' | '3' | '4' | '5'),
  econ: ECONOMY,
  sim: SIMULATION,
  nav: NAVIGATION,
};

export const ROOM_IDS = ROOMS.map((r) => r.id);
export const DISEASE_IDS = DISEASES.map((d) => d.id);
export const ROLE_IDS = ROLES.map((r) => r.id);
export const SKILL_IDS = SKILLS.map((s) => s.id);
export const PROJECT_IDS = PROJECTS.map((p) => p.id);
