import { DEF, DISEASE_IDS, PROJECT_IDS, ROOM_IDS } from '../data/definition';
import type { DiseaseId, ProjectId, RoomTypeId, TrainingId } from '../data/types';
import type { Dir } from './state';

export type DoorSpec = { x: number; y: number; dir: Dir };

export type CommandPayload =
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'BUILD_ROOM'; roomType: RoomTypeId; x: number; y: number; w: number; h: number; door?: DoorSpec | null }
  | { type: 'BUILD_CORRIDOR'; tiles: number[] }
  | { type: 'DEMOLISH_CORRIDOR'; tiles: number[] }
  | { type: 'MOVE_DOOR'; roomId: number; door: DoorSpec }
  | { type: 'DEMOLISH_ROOM'; roomId: number; mode: 'undo' | 'whenEmpty' | 'evacuate' }
  | { type: 'UPGRADE_ROOM'; roomId: number }
  | { type: 'SET_ROOM_OPEN'; roomId: number; open: boolean }
  | { type: 'EXPAND_LAND' }
  | { type: 'ADD_BLUEPRINT'; kind: 'room' | 'corridor'; roomType?: RoomTypeId | null; x: number; y: number; w: number; h: number; door?: DoorSpec | null }
  | { type: 'MOVE_BLUEPRINT'; id: number; x: number; y: number; w: number; h: number; door?: DoorSpec | null }
  | { type: 'DELETE_BLUEPRINT'; id: number }
  | { type: 'BUILD_BLUEPRINT_SELECTION'; ids: number[] }
  | { type: 'HIRE_STAFF'; candidateId: number; shift?: 'day' | 'night'; roomId?: number | null }
  | { type: 'FIRE_STAFF'; staffId: number }
  | { type: 'ASSIGN_STAFF'; staffId: number; roomId: number }
  | { type: 'UNASSIGN_STAFF'; staffId: number }
  | { type: 'SET_STAFF_SHIFT'; staffId: number; shift: 'day' | 'night' }
  | { type: 'START_TRAINING'; staffId: number; trainingId: TrainingId }
  | { type: 'SET_QUEUE_POLICY'; policy: 1 | 2 | 3 }
  | { type: 'SET_DEPARTMENT_PRIORITY'; roomType: RoomTypeId; priority: 'low' | 'normal' | 'high' }
  | { type: 'START_RESEARCH'; projectId: ProjectId }
  | { type: 'SET_DISEASE_RESEARCH_FOCUS'; disease: DiseaseId | null }
  | { type: 'CONVERT_GRP_TO_RP'; disease: DiseaseId; grp: number }
  | { type: 'TAKE_LOAN'; kind: 'short' | 'investment' | 'crisis' }
  | { type: 'REPAY_LOAN'; loanId: number }
  | { type: 'REQUEST_RESTRUCTURING'; loanId?: number; reconstruction?: boolean }
  | { type: 'SELL_EQUIPMENT'; roomId: number }
  | { type: 'CHOOSE_EVENT_OPTION'; eventId: number; optionId: string }
  | { type: 'START_FINAL_INSPECTION' }
  | { type: 'CONTINUE_AFTER_VICTORY' }
  | { type: 'TUTORIAL'; action: 'advance' | 'skip' | 'restart' | 'complete'; step?: number }
  | { type: 'REFRESH_CANDIDATES' };

export type Command = CommandPayload & { id: string };
export type CommandType = CommandPayload['type'];

export interface CommandError {
  code: string;
  messageSv: string;
}

export interface CommandResult {
  ok: boolean;
  duplicate?: boolean;
  errors: CommandError[];
  data?: Record<string, unknown>;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isTile = (v: unknown): v is number => isInt(v) && v >= 0 && v < 4096;
const isCoord = (v: unknown): v is number => isInt(v) && v >= 0 && v < 64;
const isDir = (v: unknown): v is Dir => v === 'N' || v === 'E' || v === 'S' || v === 'W';
const isDoor = (v: unknown): v is DoorSpec => !!v && typeof v === 'object' && isCoord((v as DoorSpec).x) && isCoord((v as DoorSpec).y) && isDir((v as DoorSpec).dir);
const isRoomType = (v: unknown): v is RoomTypeId => typeof v === 'string' && (ROOM_IDS as string[]).includes(v);
const isDisease = (v: unknown): v is DiseaseId => typeof v === 'string' && (DISEASE_IDS as string[]).includes(v);

/** Runtime validation of untrusted command payloads (UI, tests, bots). */
export function validateCommand(c: unknown): CommandError[] {
  const errs: CommandError[] = [];
  const bad = (msg: string) => errs.push({ code: 'INVALID_PAYLOAD', messageSv: msg });
  if (!c || typeof c !== 'object') return [{ code: 'INVALID_PAYLOAD', messageSv: 'Ogiltigt kommando' }];
  const cmd = c as Record<string, unknown>;
  if (typeof cmd.id !== 'string' || cmd.id.length === 0 || cmd.id.length > 80) bad('Kommandot saknar id');
  switch (cmd.type) {
    case 'SET_SPEED':
      if (!DEF.sim.speeds.includes(cmd.speed as number)) bad('Ogiltig hastighet');
      break;
    case 'PAUSE_GAME': case 'RESUME_GAME': case 'EXPAND_LAND': case 'START_FINAL_INSPECTION': case 'CONTINUE_AFTER_VICTORY': case 'REFRESH_CANDIDATES':
      break;
    case 'BUILD_ROOM':
      if (!isRoomType(cmd.roomType)) bad('Okänd rumstyp');
      if (!isCoord(cmd.x) || !isCoord(cmd.y) || !isInt(cmd.w) || !isInt(cmd.h) || (cmd.w as number) < 1 || (cmd.h as number) < 1) bad('Ogiltig rektangel');
      if (cmd.door != null && !isDoor(cmd.door)) bad('Ogiltig dörr');
      break;
    case 'BUILD_CORRIDOR': case 'DEMOLISH_CORRIDOR':
      if (!Array.isArray(cmd.tiles) || cmd.tiles.length === 0 || cmd.tiles.length > 4096 || !cmd.tiles.every(isTile)) bad('Ogiltiga rutor');
      break;
    case 'MOVE_DOOR':
      if (!isInt(cmd.roomId) || !isDoor(cmd.door)) bad('Ogiltig dörr');
      break;
    case 'DEMOLISH_ROOM':
      if (!isInt(cmd.roomId) || !['undo', 'whenEmpty', 'evacuate'].includes(cmd.mode as string)) bad('Ogiltig rivning');
      break;
    case 'UPGRADE_ROOM': case 'SELL_EQUIPMENT':
      if (!isInt(cmd.roomId)) bad('Ogiltigt rum');
      break;
    case 'SET_ROOM_OPEN':
      if (!isInt(cmd.roomId) || typeof cmd.open !== 'boolean') bad('Ogiltigt rum');
      break;
    case 'ADD_BLUEPRINT':
      if (cmd.kind !== 'room' && cmd.kind !== 'corridor') bad('Ogiltig ritning');
      if (cmd.kind === 'room' && !isRoomType(cmd.roomType)) bad('Okänd rumstyp');
      if (!isCoord(cmd.x) || !isCoord(cmd.y) || !isInt(cmd.w) || !isInt(cmd.h) || (cmd.w as number) < 1 || (cmd.h as number) < 1 || (cmd.w as number) > 64 || (cmd.h as number) > 64) bad('Ogiltig rektangel');
      if (cmd.door != null && !isDoor(cmd.door)) bad('Ogiltig dörr');
      break;
    case 'MOVE_BLUEPRINT':
      if (!isInt(cmd.id) || !isCoord(cmd.x) || !isCoord(cmd.y) || !isInt(cmd.w) || !isInt(cmd.h) || (cmd.w as number) < 1 || (cmd.h as number) < 1) bad('Ogiltig ritning');
      if (cmd.door != null && !isDoor(cmd.door)) bad('Ogiltig dörr');
      break;
    case 'DELETE_BLUEPRINT':
      if (!isInt(cmd.id)) bad('Ogiltig ritning');
      break;
    case 'BUILD_BLUEPRINT_SELECTION':
      if (!Array.isArray(cmd.ids) || cmd.ids.length === 0 || !cmd.ids.every(isInt)) bad('Inga ritningar valda');
      break;
    case 'HIRE_STAFF':
      if (!isInt(cmd.candidateId)) bad('Ogiltig kandidat');
      if (cmd.shift !== undefined && cmd.shift !== 'day' && cmd.shift !== 'night') bad('Ogiltigt pass');
      if (cmd.roomId != null && !isInt(cmd.roomId)) bad('Ogiltigt rum');
      break;
    case 'FIRE_STAFF': case 'UNASSIGN_STAFF':
      if (!isInt(cmd.staffId)) bad('Ogiltig person');
      break;
    case 'ASSIGN_STAFF':
      if (!isInt(cmd.staffId) || !isInt(cmd.roomId)) bad('Ogiltig placering');
      break;
    case 'SET_STAFF_SHIFT':
      if (!isInt(cmd.staffId) || (cmd.shift !== 'day' && cmd.shift !== 'night')) bad('Ogiltigt pass');
      break;
    case 'START_TRAINING':
      if (!isInt(cmd.staffId) || typeof cmd.trainingId !== 'string' || !(cmd.trainingId in DEF.training)) bad('Ogiltig utbildning');
      break;
    case 'SET_QUEUE_POLICY':
      if (![1, 2, 3].includes(cmd.policy as number)) bad('Ogiltig köprincip');
      break;
    case 'SET_DEPARTMENT_PRIORITY':
      if (!isRoomType(cmd.roomType) || !['low', 'normal', 'high'].includes(cmd.priority as string)) bad('Ogiltig prioritet');
      break;
    case 'START_RESEARCH':
      if (typeof cmd.projectId !== 'string' || !(PROJECT_IDS as string[]).includes(cmd.projectId)) bad('Okänt projekt');
      break;
    case 'SET_DISEASE_RESEARCH_FOCUS':
      if (cmd.disease !== null && !isDisease(cmd.disease)) bad('Okänd sjukdom');
      break;
    case 'CONVERT_GRP_TO_RP':
      if (!isDisease(cmd.disease) || !isInt(cmd.grp) || (cmd.grp as number) <= 0) bad('Ogiltig omvandling');
      break;
    case 'TAKE_LOAN':
      if (!['short', 'investment', 'crisis'].includes(cmd.kind as string)) bad('Okänd lånetyp');
      break;
    case 'REPAY_LOAN':
      if (!isInt(cmd.loanId)) bad('Ogiltigt lån');
      break;
    case 'REQUEST_RESTRUCTURING':
      if (cmd.loanId !== undefined && !isInt(cmd.loanId)) bad('Ogiltigt lån');
      if (cmd.reconstruction !== undefined && typeof cmd.reconstruction !== 'boolean') bad('Ogiltig begäran');
      break;
    case 'CHOOSE_EVENT_OPTION':
      if (!isInt(cmd.eventId) || typeof cmd.optionId !== 'string') bad('Ogiltigt val');
      break;
    case 'TUTORIAL':
      if (!['advance', 'skip', 'restart', 'complete'].includes(cmd.action as string)) bad('Ogiltig handledningsåtgärd');
      break;
    default:
      bad('Okänt kommando');
  }
  return errs;
}

let counter = 0;
/** Convenience id generator for UI/bots (ids only need to be unique per campaign). */
export function cmdId(prefix = 'c'): string {
  counter = (counter + 1) % 1e9;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
