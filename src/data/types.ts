/** Static, versioned game data contracts (GameDefinition). */

export type RoomTypeId =
  | 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09'
  | 'R10' | 'R11' | 'R12' | 'R13' | 'R14' | 'R15' | 'R16' | 'R17' | 'R18';
export type RoleId = 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09';
export type SkillId =
  | 'SK01' | 'SK02' | 'SK03' | 'SK04' | 'SK05' | 'SK06'
  | 'SK07' | 'SK08' | 'SK09' | 'SK10' | 'SK11' | 'SK12';
export type DiseaseId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09' | 'D10' | 'D11' | 'D12'
  | 'D13' | 'D14' | 'D15' | 'D16' | 'D17' | 'D18' | 'D19' | 'D20' | 'D21' | 'D22' | 'D23' | 'D24';
/** Treatment step kinds. REG = reception registration, others follow the spec abbreviations. */
export type StepKind = 'REG' | 'U' | 'P' | 'B' | 'L' | 'X' | 'E' | 'O' | 'A' | 'OP' | 'V' | 'IVA' | 'EX' | 'RB';
export type ProjectId = 'F01' | 'F02' | 'F03' | 'F04' | 'F05' | 'F06' | 'F07' | 'F08' | 'F09' | 'F10' | 'F11' | 'F12';
export type TrainingId = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08' | 'T09' | 'T10' | 'T11' | 'T12';
export type MissionTemplateId = 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'M06' | 'M07' | 'M08' | 'M09' | 'M10' | 'M11' | 'M12';
export type EventTemplateId = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07' | 'E08' | 'E09' | 'E10' | 'E11' | 'E12';
export type ChapterId = 1 | 2 | 3 | 4 | 5;
export type DiseaseCategory = 'ordinary' | 'absurd' | 'mysterious';

export type StationKind =
  | 'registration' | 'seat' | 'clinical' | 'bed' | 'rest' | 'analysis' | 'dispense' | 'cleaning' | 'research';

export type UpgradeKind = 'clinical' | 'reception' | 'waiting' | 'break' | 'cleaning' | 'research';

export interface RoomDef {
  id: RoomTypeId;
  key: string;
  nameSv: string;
  descriptionSv: string;
  minW: number;
  minH: number;
  baseCost: number;
  costPerTile: number;
  baseOperation: number;
  unlockChapter: ChapterId;
  /** Roles making up one staffing team. Empty = unstaffed room. */
  team: RoleId[];
  /** Concurrent stations (beds/patients) one team can serve. */
  stationsPerTeam: number;
  baseCapacity: number;
  stationKind: StationKind;
  /** Upper bound for generated stations regardless of room size. */
  maxStations: number;
  hours: 'day' | 'allDay';
  steps: StepKind[];
  requiredSkill: { role: RoleId; skill: SkillId; min: number }[];
  accent: string;
  upgradeKind: UpgradeKind;
}

export interface StepDef {
  kind: StepKind;
  roomType: RoomTypeId;
  nameSv: string;
  baseMinutes: number;
  /** Whether the patient physically attends (false = laboratory analysis of a sample). */
  patientPresent: boolean;
  materialWeight: number;
  speedSkills: SkillId[];
  qualitySkills: SkillId[];
  diagnostic: boolean;
  analysis: boolean;
  assessment: boolean;
  advanced: boolean;
  rp: number;
  createsSample: boolean;
  requiresSample: boolean;
}

export type VisualEffectId =
  | 'sneeze' | 'headache' | 'limp' | 'nausea' | 'cast' | 'fever' | 'pain' | 'cough'
  | 'raincloud' | 'crown' | 'keyboard' | 'coffee' | 'slides' | 'lightbulb' | 'chair' | 'sparkle'
  | 'rash' | 'confused' | 'teleport' | 'transparent' | 'float' | 'timeghost' | 'clones' | 'glitch';

export interface DiseaseDef {
  id: DiseaseId;
  nameSv: string;
  descriptionSv: string;
  category: DiseaseCategory;
  chapter: ChapterId;
  severity: number;
  revenue: number;
  material: number;
  triage: number;
  path: StepKind[];
  /** Alternative path used when an operational pharmacy exists (frozen at case creation). */
  pharmacyPath?: StepKind[];
  severeVariant?: { chance: number; path: StepKind[]; revenueMult: number; materialMult: number; triage: number };
  identifyThreshold: number;
  masteryThreshold: number;
  startIdentified: boolean;
  diseaseFactor: number;
  effect: VisualEffectId;
  walk: 'slow' | 'normal' | 'fast';
}

export interface RoleDef {
  id: RoleId;
  key: string;
  nameSv: string;
  pluralSv: string;
  wage: number;
  unlockChapter: ChapterId;
  skillRanges: Partial<Record<SkillId, [number, number]>>;
  /** Roles whose team slots this role may also fill. */
  substitutesFor: RoleId[];
  uniform: string;
}

export interface SkillDef {
  id: SkillId;
  nameSv: string;
  effectSv: string;
}

export interface TrainingDef {
  id: TrainingId;
  nameSv: string;
  cost: number;
  days: number;
  skill: SkillId;
  gain: number;
  roles: RoleId[];
  advanced: boolean;
}

export type ProjectEffect =
  | { kind: 'stepSpeed'; steps: StepKind[]; value: number }
  | { kind: 'travel'; value: number }
  | { kind: 'trainingCost'; value: number }
  | { kind: 'stepQuality'; steps: StepKind[]; value: number }
  | { kind: 'grpProduction'; value: number };

export interface ProjectDef {
  id: ProjectId;
  nameSv: string;
  descriptionSv: string;
  grp: number;
  chapter: ChapterId;
  requires: ProjectId[];
  effect: ProjectEffect;
  hours: number;
}

export interface MissionTemplateDef {
  id: MissionTemplateId;
  nameSv: string;
  descriptionSv: string;
  triggerSv: string;
  minChapter: ChapterId;
  durationDays: [number, number];
  rewardRange: [number, number];
  cooldownDays: number;
  reputationReward: number;
  grpReward: number;
}

export interface EventOptionDef {
  id: string;
  labelSv: string;
  consequenceSv: string;
}

export interface EventTemplateDef {
  id: EventTemplateId;
  nameSv: string;
  textSv: string;
  chapter: ChapterId;
  severity: 'minor' | 'major';
  polarity: 'negative' | 'positive' | 'neutral';
  durationHours: number;
  options: EventOptionDef[];
  /** Pressure contribution while active (0–100). */
  pressure: number;
}

export type RequirementKind =
  | 'completedPatients'
  | 'operationalRooms'
  | 'reputation'
  | 'positiveResultDays'
  | 'diagnosticExams'
  | 'identifiedDiseases'
  | 'successRate7d'
  | 'avgWait5d'
  | 'trainedSpecialists'
  | 'advancedTreatments'
  | 'specialistDepartments'
  | 'positiveCashflowDays'
  | 'masteredDiseases'
  | 'finalDepartments'
  | 'noOverdueDebt';

export interface RequirementDef {
  id: string;
  kind: RequirementKind;
  target: number;
  roomType?: RoomTypeId;
  window?: number;
  minSample?: number;
  labelSv: string;
}

export interface ChapterDef {
  id: ChapterId;
  titleSv: string;
  introSv: string;
  requirements: RequirementDef[];
  grant: number;
  unlockSummarySv: string;
}

export interface LoanDef {
  id: 'short' | 'investment' | 'crisis';
  nameSv: string;
  principal: number;
  feeRate: number;
  termDays: number;
  ordinary: boolean;
}

export interface LandStageDef {
  stage: number;
  size: number;
  cost: number;
  chapter: ChapterId;
  x0: number;
  y0: number;
}

export interface EconomyConfig {
  startingCash: number;
  corridorCostPerTile: number;
  corridorRefundRate: number;
  roomOperationPerTile: number;
  closedRoomOperationFactor: number;
  nightPremium: number;
  refundUnused: number;
  refundUsed: number;
  equipmentSaleRate: number;
  upgradeLevels: { level: number; speed: number; quality: number; costRate: number; operationMult: number }[];
  supportUpgrades: {
    receptionSpeed: number[];
    waitingSeats: number[];
    breakRecovery: number[];
    cleaningCoverage: number[];
  };
  loans: LoanDef[];
  maxOrdinaryLoans: number;
  warningDays: number;
  crisisDays: number;
  chapterGrants: Record<number, number>;
  failedCareRevenueRate: number;
  referralMinRevenue: number;
  referralRevenueRate: number;
  qualityFactorRange: [number, number];
  researchRevenueMax: number;
  reconstruction: { targetCash: number; feeRate: number; termDays: number; reputationPenalty: number };
  restructuring: { extraDays: number; feeRate: number };
  landStages: LandStageDef[];
}

export interface SimulationConfig {
  minutesPerTick: number;
  ticksPerDay: number;
  realSecondsPerDayAt1x: number;
  speeds: number[];
  dayShiftStart: number;
  nightShiftStart: number;
  demandPerChapter: Record<number, number>;
  tutorialDemandFactor: number;
  tutorialDays: number;
  maxDailyDemandChange: number;
  arrivalBlocks: { from: number; to: number; share: number }[];
  categoryMix: Record<number, Record<DiseaseCategory, number>>;
  nightEmergencyShare: Record<number, number>;
  dayAmbulanceShare: number;
  rarityDays: number;
  observationShareMax: number;
  triageDecay: Record<number, { health: number; patience: number }>;
  overnightPatienceFactor: number;
  standingPatienceFactor: number;
  escalationHealth: number;
  energy: { work: number; walk: number; idle: number; breakRoom: number; restNoRoom: number; offShift: number };
  breakBelow: number;
  breakUntil: number;
  minEnergyToStart: number;
  reservationTimeoutMinutes: number;
  noProgressMinutes: number;
  roomRetryMinutes: number;
  startingReputation: number;
  maxSkillSpeedBonus: number;
  maxEquipmentSpeedBonus: number;
  maxResearchSpeedBonus: number;
  minDurationFactor: number;
  eventLogSize: number;
  historyDays: number;
  transactionRetentionDays: number;
}

export interface NavigationConfig {
  patientMinutesPerTile: Record<'slow' | 'normal' | 'fast', number>;
  staffMinutesPerTile: Record<'normal' | 'fast', number>;
  trafficWindowMinutes: number;
  maxTrafficSlowdown: number;
  trafficRouteWeight: number;
  pathCacheSize: number;
}

export interface GameDefinition {
  version: string;
  rooms: RoomDef[];
  steps: StepDef[];
  diseases: DiseaseDef[];
  roles: RoleDef[];
  skills: SkillDef[];
  trainings: TrainingDef[];
  projects: ProjectDef[];
  missions: MissionTemplateDef[];
  events: EventTemplateDef[];
  chapters: ChapterDef[];
  economy: EconomyConfig;
  simulation: SimulationConfig;
  navigation: NavigationConfig;
}
