import { GAME_DATA_VERSION } from '../data/definition';
import { SCHEMA_VERSION, type GameState } from '../core/state';
import { canonicalJSON, sha256Hex } from './canonical';
import { migrateState } from './migrations';
import { validateGameState } from './schema';

export const SAVE_FORMAT = 'pixel-hospital-save';
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  gameDataVersion: string;
  appVersion: string;
  saveId: string;
  campaignId: string;
  campaignName: string;
  generation: number;
  savedAt: string;
  tick: number;
  chapter: number;
  checksumAlgorithm: 'SHA-256';
  checksum: string;
  state: GameState;
}

export interface SaveMeta {
  campaignId: string;
  campaignName: string;
  tick: number;
  chapter: number;
  savedAt: string;
  generation: number;
  cash: number;
  victory: boolean;
}

export async function createEnvelope(state: GameState, generation: number): Promise<SaveEnvelope> {
  // Deep copy through JSON: the envelope is detached from the running game.
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  const checksum = await sha256Hex(canonicalJSON(copy));
  return {
    format: SAVE_FORMAT,
    schemaVersion: copy.schemaVersion,
    gameDataVersion: copy.dataVersion,
    appVersion: APP_VERSION,
    saveId: `${copy.campaign.id}:${generation}`,
    campaignId: copy.campaign.id,
    campaignName: copy.campaign.name,
    generation,
    savedAt: new Date().toISOString(),
    tick: copy.clock.tick,
    chapter: copy.progress.chapter,
    checksumAlgorithm: 'SHA-256',
    checksum,
    state: copy,
  };
}

export function envelopeMeta(e: SaveEnvelope): SaveMeta {
  return { campaignId: e.campaignId, campaignName: e.campaignName, tick: e.tick, chapter: e.chapter, savedAt: e.savedAt, generation: e.generation, cash: e.state.economy.cash, victory: !!e.state.progress.victory };
}

export interface VerifiedSave {
  envelope: SaveEnvelope;
  state: GameState;
  migratedFrom: number | null;
}

/** Full verification: envelope shape, versions, checksum, schema, migration (on a copy). Throws with a Swedish message. */
export async function verifyEnvelope(raw: unknown): Promise<VerifiedSave> {
  if (!raw || typeof raw !== 'object') throw new Error('Filen är inte en sparfil');
  const e = raw as Partial<SaveEnvelope>;
  if (e.format !== SAVE_FORMAT) throw new Error('Okänt filformat');
  if (typeof e.schemaVersion !== 'number' || !Number.isInteger(e.schemaVersion)) throw new Error('Saknar schemaversion');
  if (e.schemaVersion > SCHEMA_VERSION) throw new Error('Sparfilen kommer från en nyare version av spelet');
  if (e.checksumAlgorithm !== 'SHA-256' || typeof e.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(e.checksum)) throw new Error('Ogiltig kontrollsumma');
  if (!e.state || typeof e.state !== 'object') throw new Error('Sparfilen saknar speldata');
  const actual = await sha256Hex(canonicalJSON(e.state));
  if (actual !== e.checksum) throw new Error('Kontrollsumman stämmer inte – filen är skadad eller ändrad');
  const copy = JSON.parse(JSON.stringify(e.state)) as GameState;
  let migratedFrom: number | null = null;
  let state = copy;
  if (copy.schemaVersion < SCHEMA_VERSION) {
    migratedFrom = copy.schemaVersion;
    state = migrateState(copy);
  }
  const problems = validateGameState(state);
  if (problems.length) throw new Error(`Sparfilen är ogiltig: ${problems.slice(0, 3).join('; ')}`);
  if (state.dataVersion !== GAME_DATA_VERSION) state.dataVersion = GAME_DATA_VERSION;
  return { envelope: e as SaveEnvelope, state, migratedFrom };
}

export async function parseImport(text: string): Promise<VerifiedSave> {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('Filen är för stor');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Filen är inte giltig JSON');
  }
  return verifyEnvelope(raw);
}
