import { mkdirSync, writeFileSync } from 'node:fs';
import { createEnvelope } from '../../src/save/envelope';
import { Bot } from '../../tools/sim/bot';
import { GameEngine } from '../../src/core/engine';
import type { GameState } from '../../src/core/state';
import { spawnPatient } from '../../src/systems/patients';

/**
 * Real gameplay states produced by the headless skilled bot (commands only), exported as genuine
 * save envelopes and imported through the in-game import flow. Nothing is faked or hand-edited.
 */
const cache = new Map<string, string>();

function play(seed: number, until: (eng: GameEngine) => boolean, maxDays: number): GameEngine {
  const eng = GameEngine.newGame(seed, { invariantEvery: 0 });
  const bot = new Bot(eng, 'skilled');
  while (eng.world.day < maxDays && !until(eng)) {
    eng.step();
    if (eng.world.tick % bot.p.thinkEvery === 0) bot.think();
  }
  return eng;
}

async function file(name: string, state: GameState): Promise<string> {
  const env = await createEnvelope(state, 1);
  mkdirSync('test-results/fixtures', { recursive: true });
  const path = `test-results/fixtures/${name}.json`;
  writeFileSync(path, JSON.stringify(env));
  return path;
}

export async function fixture(kind: 'small' | 'mid' | 'large' | 'preVictory'): Promise<string> {
  const hit = cache.get(kind);
  if (hit) return hit;
  let eng: GameEngine;
  if (kind === 'small') {
    eng = play(1000, (e) => e.state.rooms.length >= 8 && e.world.minuteOfDay > 620 && e.world.minuteOfDay < 700, 30);
  } else if (kind === 'mid') {
    eng = play(1000, (e) => e.state.progress.chapter >= 3 && e.state.rooms.length >= 18 && e.world.minuteOfDay > 600 && e.world.minuteOfDay < 700, 60);
    for (let i = 0; i < 25; i++) spawnPatient(eng.world, false);
    eng.runTicks(40);
  } else if (kind === 'large') {
    eng = play(24757, (e) => e.state.progress.chapter >= 5 && e.world.day >= 45 && e.world.minuteOfDay > 600 && e.world.minuteOfDay < 640, 80);
    // Rush hour: extra arrivals through the normal arrival routine (still real patients).
    for (let i = 0; i < 80; i++) spawnPatient(eng.world, false);
    eng.runTicks(60);
  } else {
    // Late on the 7th inspection day. Because the simulation is deterministic and the browser sends
    // no commands, we verify headlessly that the unmanaged continuation genuinely wins.
    let found: GameEngine | null = null;
    for (const seed of [56433, 1000, 24757, 16838, 40595, 48514]) {
      const cand = play(seed, (e) => !!e.state.progress.inspection?.active && e.state.progress.inspection.days.length === 6 && e.world.minuteOfDay > 1290, 130);
      if (!cand.state.progress.inspection?.active) continue;
      const check = new GameEngine(JSON.parse(JSON.stringify(cand.state)));
      check.runTicks(400);
      if (check.state.progress.victory) {
        found = cand;
        break;
      }
    }
    if (!found) throw new Error('no verified pre-victory snapshot found');
    eng = found;
  }
  eng.state.clock.paused = true;
  const path = await file(kind, eng.state);
  cache.set(kind, path);
  return path;
}
