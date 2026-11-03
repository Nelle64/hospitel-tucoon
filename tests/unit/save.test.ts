import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { canonicalJSON, sha256Hex } from '../../src/save/canonical';
import { createEnvelope, parseImport, verifyEnvelope } from '../../src/save/envelope';
import { migrateState } from '../../src/save/migrations';
import { validateGameState } from '../../src/save/schema';
import { newEngine } from '../helpers';

describe('save envelope', () => {
  it('canonical JSON sorts keys and is stable', () => {
    expect(canonicalJSON({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it('REQ-SAVE-ENV-01 envelope round-trip verifies checksum and schema', async () => {
    const eng = newEngine();
    eng.runTicks(500);
    const env = await createEnvelope(eng.state, 1);
    expect(env.checksum).toBe(await sha256Hex(canonicalJSON(eng.state)));
    const v = await verifyEnvelope(JSON.parse(JSON.stringify(env)));
    expect(v.state.clock.tick).toBe(eng.state.clock.tick);
  });
  it('REQ-SAVE-12 invalid imports are rejected (garbage, tampered, wrong format, huge, newer schema)', async () => {
    const eng = newEngine();
    const env = await createEnvelope(eng.state, 1);
    await expect(parseImport('not json')).rejects.toThrow(/JSON/);
    await expect(parseImport(JSON.stringify({ format: 'other' }))).rejects.toThrow(/filformat/);
    const tampered = JSON.parse(JSON.stringify(env));
    tampered.state.economy.cash = 99999999;
    await expect(parseImport(JSON.stringify(tampered))).rejects.toThrow(/Kontrollsumman/);
    const newer = { ...env, schemaVersion: 999 };
    await expect(parseImport(JSON.stringify(newer))).rejects.toThrow(/nyare version/);
    await expect(parseImport('x'.repeat(9 * 1024 * 1024))).rejects.toThrow(/för stor/);
    const html = JSON.parse(JSON.stringify(env));
    html.state.campaign.name = '<img src=x onerror=alert(1)>';
    html.checksum = await sha256Hex(canonicalJSON(html.state));
    // Accepted as plain text data (the UI renders names with textContent, never innerHTML).
    const v = await parseImport(JSON.stringify(html));
    expect(v.state.campaign.name).toContain('<img');
  });
  it('REQ-SAVE-11 schema migration v0 → v1 runs on a copy', () => {
    const eng = newEngine();
    const old = JSON.parse(JSON.stringify(eng.state));
    old.schemaVersion = 0;
    delete old.clock.matchDirty;
    delete old.progress.chapterStart;
    delete old.economy.lastReconstructionDay;
    const snapshot = JSON.stringify(old);
    const migrated = migrateState(old);
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.clock.matchDirty).toBe(true);
    expect(migrated.progress.chapterStart).toBeDefined();
    expect(validateGameState(migrated)).toEqual([]);
  });
  it('schema validation rejects broken structures', () => {
    const eng = newEngine();
    const bad = JSON.parse(JSON.stringify(eng.state));
    bad.rooms[0].type = 'R77';
    expect(validateGameState(bad).length).toBeGreaterThan(0);
    const bad2 = JSON.parse(JSON.stringify(eng.state));
    bad2.rng.s = [1, 2];
    expect(validateGameState(bad2)).toContain('invalid rng');
  });
});
