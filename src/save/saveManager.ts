import type { GameState } from '../core/state';
import { createEnvelope, envelopeMeta, parseImport, verifyEnvelope, type SaveEnvelope, type SaveMeta, type VerifiedSave } from './envelope';
import { KeyValueDB } from './idb';

export interface CampaignRecord {
  campaignId: string;
  name: string;
  active: number;
  previous: number | null;
  generations: number[];
  updatedAt: string;
  meta: SaveMeta;
  lastTick: number;
}

export interface LoadResult {
  state: GameState;
  generation: number;
  recoveredFromPrevious: boolean;
  migratedFrom: number | null;
  errors: string[];
}

export interface SaveResult {
  ok: boolean;
  skipped?: boolean;
  generation?: number;
  error?: string;
}

/** Test hook to simulate a crash between writing a snapshot and switching the active pointer. */
export interface SaveFaults {
  failAfterSnapshotWrite?: boolean;
  failSnapshotWrite?: boolean;
}

const KEEP_GENERATIONS = 3;

/**
 * Generational snapshot saves in IndexedDB.
 * Protocol: write new generation → read back & verify → switch active pointer → prune old generations.
 * Writes are serialised; an older request never overwrites a newer committed generation.
 */
export class SaveManager {
  private queue: Promise<unknown> = Promise.resolve();
  lastSaveAt: string | null = null;
  lastError: string | null = null;
  faults: SaveFaults = {};

  private constructor(readonly db: KeyValueDB) {}

  static async open(name?: string, factory?: IDBFactory): Promise<SaveManager> {
    return new SaveManager(await KeyValueDB.open(name, factory));
  }

  save(state: GameState, reason = 'auto'): Promise<SaveResult> {
    // Snapshot synchronously at the call (complete tick boundary), then serialise the async write.
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    const run = this.queue.then(() => this.doSave(snapshot, reason));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doSave(state: GameState, reason: string): Promise<SaveResult> {
    void reason;
    try {
      const id = state.campaign.id;
      const rec = await this.db.get<CampaignRecord>('campaigns', id);
      if (rec && state.clock.tick < rec.lastTick) return { ok: true, skipped: true };
      const generation = (rec?.active ?? 0) + 1;
      const env = await createEnvelope(state, generation);
      if (this.faults.failSnapshotWrite) throw new Error('simulated write failure');
      await this.db.put('snapshots', env);
      const back = await this.db.get<SaveEnvelope>('snapshots', env.saveId);
      if (!back || back.checksum !== env.checksum || back.tick !== env.tick) throw new Error('Sparningen kunde inte verifieras');
      if (this.faults.failAfterSnapshotWrite) throw new Error('simulated crash before pointer switch');
      const gens = [...(rec?.generations ?? []), generation].sort((a, b) => a - b);
      const keep = gens.slice(-KEEP_GENERATIONS);
      const next: CampaignRecord = { campaignId: id, name: state.campaign.name, active: generation, previous: rec?.active ?? null, generations: keep, updatedAt: env.savedAt, meta: envelopeMeta(env), lastTick: state.clock.tick };
      await this.db.put('campaigns', next);
      await this.db.put('kv', { key: 'currentCampaign', value: id });
      for (const g of gens) if (!keep.includes(g)) await this.db.delete('snapshots', `${id}:${g}`);
      this.lastSaveAt = env.savedAt;
      this.lastError = null;
      return { ok: true, generation };
    } catch (err) {
      this.lastError = (err as Error).message;
      return { ok: false, error: this.lastError };
    }
  }

  async currentCampaignId(): Promise<string | null> {
    const v = await this.db.get<{ key: string; value: string }>('kv', 'currentCampaign');
    return v?.value ?? null;
  }

  async setCurrentCampaign(id: string): Promise<void> {
    await this.db.put('kv', { key: 'currentCampaign', value: id });
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    return (await this.db.getAll<CampaignRecord>('campaigns')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Loads the newest fully valid generation; falls back to older verified generations. Never silently starts a new game. */
  async load(campaignId: string): Promise<LoadResult> {
    const rec = await this.db.get<CampaignRecord>('campaigns', campaignId);
    if (!rec) throw new Error('Kampanjen hittades inte');
    const order = [rec.active, ...(rec.previous !== null ? [rec.previous] : []), ...rec.generations.filter((g) => g !== rec.active && g !== rec.previous).sort((a, b) => b - a)];
    // Uncommitted newer generations (written but pointer not switched) are ignored on purpose.
    const errors: string[] = [];
    for (const g of [...new Set(order)]) {
      const env = await this.db.get<SaveEnvelope>('snapshots', `${campaignId}:${g}`);
      if (!env) {
        errors.push(`Generation ${g} saknas`);
        continue;
      }
      try {
        const v = await verifyEnvelope(env);
        return { state: v.state, generation: g, recoveredFromPrevious: g !== rec.active, migratedFrom: v.migratedFrom, errors };
      } catch (err) {
        errors.push(`Generation ${g}: ${(err as Error).message}`);
      }
    }
    throw new Error(`Ingen giltig sparning kunde läsas (${errors.join('; ')})`);
  }

  async loadCurrent(): Promise<LoadResult | null> {
    const id = await this.currentCampaignId();
    if (!id) return null;
    return this.load(id);
  }

  async deleteCampaign(id: string): Promise<void> {
    const rec = await this.db.get<CampaignRecord>('campaigns', id);
    if (rec) for (const g of rec.generations) await this.db.delete('snapshots', `${id}:${g}`);
    await this.db.delete('campaigns', id);
  }

  /** Portable JSON export of the latest committed snapshot (does not modify the running save). */
  async exportJSON(state: GameState): Promise<string> {
    const rec = await this.db.get<CampaignRecord>('campaigns', state.campaign.id);
    const env = await createEnvelope(state, rec?.active ?? 0);
    return JSON.stringify(env);
  }

  async previewImport(text: string): Promise<VerifiedSave> {
    return parseImport(text);
  }

  /** Activate a verified import as its own campaign slot; the previous campaign stays stored as backup. */
  async commitImport(v: VerifiedSave): Promise<SaveResult> {
    const existing = await this.db.get<CampaignRecord>('campaigns', v.state.campaign.id);
    if (existing && existing.lastTick > v.state.clock.tick) {
      // Importing an older copy of an existing campaign: keep it separate so nothing newer is overwritten.
      v.state.campaign.id = `${v.state.campaign.id}-import-${Date.now().toString(36)}`;
      v.state.campaign.name = `${v.state.campaign.name} (importerad)`;
    }
    const res = await this.save(v.state, 'import');
    if (res.ok) await this.setCurrentCampaign(v.state.campaign.id);
    return res;
  }

  async getSettings<T>(fallback: T): Promise<T> {
    const v = await this.db.get<{ key: string; value: T }>('settings', 'settings');
    return v ? { ...fallback, ...v.value } : fallback;
  }

  async putSettings<T>(value: T): Promise<void> {
    await this.db.put('settings', { key: 'settings', value });
  }

  async putKV(key: string, value: unknown): Promise<void> {
    await this.db.put('kv', { key, value });
  }

  async getKV<T>(key: string): Promise<T | undefined> {
    return (await this.db.get<{ key: string; value: T }>('kv', key))?.value;
  }

  flush(): Promise<unknown> {
    return this.queue;
  }
}
