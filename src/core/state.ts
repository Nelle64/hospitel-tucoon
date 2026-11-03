import type {
  ChapterId, DiseaseId, EventTemplateId, MissionTemplateId, ProjectId, RoleId, RoomTypeId, SkillId, StepKind, TrainingId,
} from '../data/types';
import type { RngState } from './rng';

export const SCHEMA_VERSION = 1;

export type Dir = 'N' | 'E' | 'S' | 'W';
export type Facing = 'down' | 'up' | 'left' | 'right';

export interface FurnitureItem {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  blocks: boolean;
  /** Station index this item belongs to, or -1 for decoration. */
  station: number;
}

export interface StationState {
  id: number;
  kind: 'registration' | 'seat' | 'clinical' | 'bed' | 'rest' | 'analysis' | 'dispense' | 'cleaning' | 'research';
  /** Walkable tile where the patient stands/sits (or the tile adjacent to a bed). */
  patientTile: number;
  /** One walkable tile per staff team slot. */
  staffTiles: number[];
  pose: 'stand' | 'sit' | 'lie';
  facing: Facing;
  /** Render position (tile coordinates, may be fractional) for the patient's pose. */
  poseX: number;
  poseY: number;
}

export interface RoomLayout {
  template: string;
  furniture: FurnitureItem[];
  stations: StationState[];
  blocked: number[];
  idleTiles: number[];
}

export interface RoomState {
  id: number;
  type: RoomTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number; dir: Dir };
  layout: RoomLayout;
  level: 1 | 2 | 3;
  open: boolean;
  closing: boolean;
  builtTick: number;
  /** Room has been used (any completed treatment/registration/rest). */
  used: boolean;
  /** Recorded historical costs. */
  buildCost: number;
  upgradeCosts: number[];
  cleanliness: number;
  brokenUntil: number;
  opAccum: number;
  /** Undo window: build command id and whether undo is still allowed. */
  undoable: boolean;
}

export type PatientStateKind =
  | 'ARRIVING' | 'REGISTERING' | 'WAITING' | 'WAITING_FOR_OPENING' | 'MOVING' | 'IN_TREATMENT' | 'NEXT_STEP'
  | 'EMERGENCY_ESCALATION' | 'EXITING' | 'COMPLETED' | 'REFERRED' | 'ABANDONED' | 'FAILED';

export const PATIENT_TERMINAL: PatientStateKind[] = ['COMPLETED', 'REFERRED', 'ABANDONED', 'FAILED'];

export interface Mover {
  pos: number;
  path: number[];
  pathIdx: number;
  progress: number;
  /** Final destination tile, -1 if none. */
  dest: number;
  /** Room ids the current route is allowed to enter (besides corridors). */
  allowRooms: number[];
  lastProgressTick: number;
  facing: Facing;
  navVersion: number;
}

export interface PatientState extends Mover {
  id: number;
  caseId: number;
  name: string;
  visual: number;
  state: PatientStateKind;
  stateSince: number;
  health: number;
  patience: number;
  triage: number;
  walk: 'slow' | 'normal' | 'fast';
  patienceMult: number;
  queueStep: StepKind | null;
  enqueuedTick: number;
  reservationId: number;
  seat: { roomId: number; station: number } | null;
  standTile: number;
  arrivedTick: number;
  emergency: boolean;
  escalated: boolean;
  /** Qualifying waiting minutes (during scheduled opening hours). */
  waitMinutes: number;
  overnightMinutes: number;
  walkMinutes: number;
  retry: { roomId: number; until: number }[];
  /** Wait episode start tick for metrics. */
  waitEpisodeStart: number;
  satisfaction: number;
  /** Room the patient has been called forward to (waits outside its door), 0 = none. */
  calledTo: number;
}

export type CaseOutcome = 'SUCCESS' | 'FAILED_TREATMENT' | 'REFERRED' | 'ABANDONED' | 'CRITICAL';

export interface CaseState {
  id: number;
  patientId: number;
  disease: DiseaseId;
  observation: boolean;
  severe: boolean;
  path: StepKind[];
  stepIndex: number;
  materialPlan: number[];
  materialCharged: boolean[];
  rpAwarded: boolean[];
  revenueBase: number;
  diseaseFactor: number;
  sampleReady: boolean;
  assessed: boolean;
  registered: boolean;
  emergency: boolean;
  qualitySum: number;
  qualityCount: number;
  outcome: CaseOutcome | null;
  settled: boolean;
  settlementTx: number;
  createdTick: number;
  medicalCompletedTick: number;
  closedTick: number;
  referralReason: string | null;
}

export type StaffStateKind = 'UNASSIGNED' | 'IDLE' | 'MOVING' | 'WORKING' | 'RESTING' | 'TRAINING' | 'UNAVAILABLE' | 'BLOCKED';

export type StaffTask =
  | { kind: 'none' }
  | { kind: 'toRoom' }
  | { kind: 'work'; reservationId: number }
  | { kind: 'rest'; roomId: number; station: number }
  | { kind: 'clean'; roomId: number; until: number }
  | { kind: 'research'; station: number }
  | { kind: 'leave' };

export interface StaffState extends Mover {
  id: number;
  role: RoleId;
  name: string;
  visual: number;
  traits: string[];
  wageMod: number;
  skills: Record<SkillId, number>;
  energy: number;
  stress: number;
  shift: 'day' | 'night';
  roomId: number;
  state: StaffStateKind;
  stateSince: number;
  task: StaffTask;
  onSite: boolean;
  training: { id: TrainingId; until: number } | null;
  unavailableUntil: number;
  completedTrainings: TrainingId[];
  hiredTick: number;
  overtime: boolean;
  breakRequested: boolean;
}

export interface CandidateState {
  id: number;
  role: RoleId;
  name: string;
  visual: number;
  traits: string[];
  wageMod: number;
  skills: Record<SkillId, number>;
}

export interface QueueEntry {
  patientId: number;
  step: StepKind;
  enqueuedTick: number;
}

export type ReservationStatus = 'RESERVED' | 'MOVING' | 'ACTIVE';

export interface Reservation {
  id: number;
  patientId: number;
  caseId: number;
  roomId: number;
  station: number;
  staffIds: number[];
  step: StepKind;
  stepIndex: number;
  createdTick: number;
  expiryTick: number;
  status: ReservationStatus;
  startTick: number;
  endTick: number;
  quality: number;
  patientArrived: boolean;
  staffArrived: boolean[];
}

export type TxCategory =
  | 'construction' | 'corridor' | 'refund' | 'upgrade' | 'equipmentSale' | 'land'
  | 'wage' | 'overtime' | 'roomOperation' | 'material' | 'training' | 'hiring'
  | 'treatment' | 'failedCare' | 'referral'
  | 'loanIn' | 'loanRepayment' | 'grant' | 'mission' | 'event' | 'reconstruction';

export interface Transaction {
  id: number;
  tick: number;
  amount: number;
  category: TxCategory;
  labelSv: string;
  ref: string;
}

export interface LoanState {
  id: number;
  kind: 'short' | 'investment' | 'crisis' | 'reconstruction';
  principal: number;
  fee: number;
  termDays: number;
  takenDay: number;
  installments: number[];
  paid: number;
  overdue: number;
  nextIndex: number;
}

export interface EconomyState {
  cash: number;
  transactions: Transaction[];
  totals: Partial<Record<TxCategory, number>>;
  loans: LoanState[];
  crisis: 'none' | 'warning' | 'crisis' | 'recovery';
  crisisSince: number;
  grantsPaid: number[];
  wageAccum: number;
  settledCaseIds: number[];
  settlementCount: number;
  reconstructions: number;
  lastReconstructionDay: number;
}

export interface ResearchState {
  grp: number;
  grpFrac: number;
  rp: Partial<Record<DiseaseId, number>>;
  identified: DiseaseId[];
  mastered: DiseaseId[];
  observed: DiseaseId[];
  projectsDone: ProjectId[];
  active: { id: ProjectId; startTick: number; endTick: number } | null;
  focus: DiseaseId | null;
  convertedToday: Partial<Record<DiseaseId, number>>;
  lastSeenDay: Partial<Record<DiseaseId, number>>;
}

export interface MissionInstance {
  id: number;
  template: MissionTemplateId;
  startDay: number;
  endDay: number;
  target: number;
  baseline: number;
  roomType: RoomTypeId | null;
  disease: DiseaseId | null;
  project: ProjectId | null;
  reward: { cash: number; reputation: number; grp: number };
  progress: number;
  status: 'active' | 'success' | 'failed' | 'cancelled';
  paid: boolean;
}

export interface MissionsState {
  active: MissionInstance[];
  recent: MissionInstance[];
  cooldowns: Partial<Record<MissionTemplateId, number>>;
  lastTemplate: MissionTemplateId | null;
  completedCount: number;
}

export interface EventInstance {
  id: number;
  template: EventTemplateId;
  major: boolean;
  startTick: number;
  endTick: number;
  choice: string | null;
  decideBy: number;
  params: Record<string, number>;
  ended: boolean;
}

export interface EventsState {
  active: EventInstance[];
  recent: { template: EventTemplateId; startTick: number; choice: string | null }[];
  lastMajorTick: Partial<Record<EventTemplateId, number>>;
  nextMinorTick: number;
  nextMajorTick: number;
}

export interface InspectionDay {
  day: number;
  completed: number;
  success: number;
  treatedOutcomes: number;
  waitSum: number;
  waitCount: number;
  result: number;
  overdue: boolean;
}

export interface CampaignProgress {
  chapter: ChapterId;
  chapterCompletedTick: number[];
  /** Snapshot of lifetime counters when the current chapter started (for chapter-relative requirements). */
  chapterStart: { orthoSurgIcu: number; diagnosticExams: number; completed: number };
  inspection: { active: boolean; startDay: number; days: InspectionDay[]; attempts: number; lastResult: 'none' | 'failed' | 'passed'; failReasonSv: string } | null;
  victory: { tick: number; day: number } | null;
  continuedAfterVictory: boolean;
  landStage: number;
}

export interface DayMetrics {
  day: number;
  chapter: number;
  arrivals: number;
  expectedDemand: number;
  completed: number;
  success: number;
  failedTreatment: number;
  critical: number;
  referrals: number;
  abandoned: number;
  abandonedAfterAssessment: number;
  treatedOutcomes: number;
  diagnosticExams: number;
  advancedTreatments: number;
  orthoSurgIcu: number;
  waitSum: number;
  waitCount: number;
  waitMax: number;
  walkSum: number;
  walkCount: number;
  satisfactionSum: number;
  satisfactionCount: number;
  revenue: number;
  costs: number;
  fixedCosts: number;
  variableCosts: number;
  capex: number;
  otherIncome: number;
  result: number;
  cashflow: number;
  cashEnd: number;
  reputationEnd: number;
  queueSamples: number;
  queueLenSum: number;
  queueLenMax: number;
  staffOnShiftMinutes: number;
  staffWorkMinutes: number;
  energySum: number;
  stressSum: number;
  staffSamples: number;
  roomBusy: Partial<Record<RoomTypeId, number>>;
  roomAvail: Partial<Record<RoomTypeId, number>>;
  grpEarned: number;
  rpEarned: number;
  trainingsCompleted: number;
  treatmentsByRoom: Partial<Record<RoomTypeId, number>>;
}

export interface MetricsState {
  today: DayMetrics;
  days: DayMetrics[];
  totals: {
    arrivals: number;
    completed: number;
    success: number;
    failedTreatment: number;
    critical: number;
    referrals: number;
    abandoned: number;
    diagnosticExams: number;
    advancedTreatments: number;
    orthoSurgIcu: number;
    trainingsCompleted: number;
    satisfactionSum: number;
    satisfactionCount: number;
    revenue: number;
    result: number;
  };
  reputation: number;
  demand: { expected: number; previous: number };
  arrivalPlan: { tick: number; night: boolean }[];
  /** Hourly samples of the queue length per step for the current day (for overlays). */
  queueNow: Partial<Record<StepKind, number>>;
}

export interface TutorialState {
  step: number;
  done: boolean;
  skipped: boolean;
  rewardsClaimed: string[];
}

export interface DomainEvent {
  id: number;
  type: DomainEventType;
  tick: number;
  seq: number;
  aggregateId: string | null;
  causationId: string | null;
  payload: Record<string, unknown>;
}

export type DomainEventType =
  | 'ROOM_BUILT' | 'ROOM_UPGRADED' | 'ROOM_DEMOLISHED' | 'STAFF_HIRED' | 'STAFF_ASSIGNED' | 'STAFF_TRAINED'
  | 'PATIENT_ARRIVED' | 'RESERVATION_CREATED' | 'TREATMENT_COMPLETED' | 'PATIENT_DISCHARGED' | 'PATIENT_REFERRED'
  | 'ECONOMY_TRANSACTION' | 'DISEASE_IDENTIFIED' | 'DISEASE_MASTERED' | 'RESEARCH_COMPLETED' | 'MISSION_COMPLETED'
  | 'EVENT_STARTED' | 'EVENT_ENDED' | 'CAMPAIGN_CHAPTER_COMPLETED' | 'CAMPAIGN_VICTORY' | 'CRISIS_STARTED' | 'CRISIS_ENDED'
  // Additional events used by UI/audio feedback.
  | 'ROOM_BUILD_FAILED' | 'STAFF_FIRED' | 'PATIENT_LEFT' | 'MISSION_STARTED' | 'MISSION_FAILED' | 'LOAN_TAKEN'
  | 'RESEARCH_STARTED' | 'EMERGENCY_ESCALATED' | 'ECONOMY_WARNING' | 'INSPECTION_STARTED' | 'INSPECTION_DAY' | 'INSPECTION_FAILED'
  | 'LAND_EXPANDED' | 'CORRIDOR_BUILT' | 'DOOR_MOVED' | 'TRAINING_STARTED' | 'ROOM_CLEANED' | 'STAFF_RESTED' | 'BLUEPRINT_BUILT' | 'RECONSTRUCTION' | 'SHIFT_CHANGE' | 'DAY_ENDED';

export interface BlueprintItem {
  id: number;
  kind: 'room' | 'corridor';
  roomType: RoomTypeId | null;
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number; dir: Dir } | null;
}

export interface GameState {
  schemaVersion: number;
  dataVersion: string;
  campaign: { id: string; seed: number; name: string };
  ids: Record<string, number>;
  rng: RngState;
  clock: { tick: number; speed: number; paused: boolean; matchDirty: boolean };
  map: { corridors: number[]; entrance: number; version: number; trafficLevel: number[]; trafficCount: number[]; trafficVersion: number };
  blueprint: { items: BlueprintItem[] };
  rooms: RoomState[];
  patients: PatientState[];
  cases: CaseState[];
  staff: StaffState[];
  candidates: CandidateState[];
  candidatesDay: number;
  queues: QueueEntry[];
  reservations: Reservation[];
  economy: EconomyState;
  research: ResearchState;
  missions: MissionsState;
  events: EventsState;
  progress: CampaignProgress;
  metrics: MetricsState;
  policy: { queue: 1 | 2 | 3; departmentPriority: Partial<Record<RoomTypeId, 'low' | 'normal' | 'high'>> };
  tutorial: TutorialState;
  log: DomainEvent[];
  audit: { eventSeq: number; commandIds: string[]; violations: string[]; lastInvariantTick: number };
}

export type { ChapterId, DiseaseId, ProjectId, RoleId, RoomTypeId, SkillId, StepKind, TrainingId };
