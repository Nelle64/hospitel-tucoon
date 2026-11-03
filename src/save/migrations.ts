import { SCHEMA_VERSION, type GameState } from '../core/state';

/**
 * Explicit, ordered schema migrations. Each runs on a copy (never on the stored original).
 * v0 → v1: development snapshots without the persisted match flag / chapter start counters.
 */
export const MIGRATIONS: { from: number; to: number; describe: string; run: (s: Record<string, unknown>) => void }[] = [
  {
    from: 0,
    to: 1,
    describe: 'Add clock.matchDirty, progress.chapterStart, economy.lastReconstructionDay, patient.calledTo',
    run: (s) => {
      const st = s as unknown as GameState;
      if (st.clock && typeof st.clock.matchDirty !== 'boolean') st.clock.matchDirty = true;
      if (st.progress && !st.progress.chapterStart) st.progress.chapterStart = { orthoSurgIcu: st.metrics?.totals?.orthoSurgIcu ?? 0, diagnosticExams: st.metrics?.totals?.diagnosticExams ?? 0, completed: st.metrics?.totals?.completed ?? 0 };
      if (st.economy && typeof st.economy.lastReconstructionDay !== 'number') st.economy.lastReconstructionDay = -1;
      for (const p of st.patients ?? []) if (typeof p.calledTo !== 'number') p.calledTo = 0;
    },
  },
];

export function migrateState(state: GameState): GameState {
  const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown> & GameState;
  let v = typeof copy.schemaVersion === 'number' ? copy.schemaVersion : 0;
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS.find((x) => x.from === v);
    if (!m) throw new Error(`Ingen migrering från schemaversion ${v}`);
    m.run(copy);
    v = m.to;
    copy.schemaVersion = v;
  }
  return copy;
}
