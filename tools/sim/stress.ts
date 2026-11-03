import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DEF } from '../../src/data/definition';
import { GameEngine } from '../../src/core/engine';
import { checkInvariants } from '../../src/core/invariants';
import { reconcile } from '../../src/save/reconcile';
import { spawnPatient } from '../../src/systems/patients';
import { startEvent } from '../../src/systems/events';
import { Bot } from './bot';

/**
 * Long-term stability suite.
 *  - long: 20 seeds × 1000 game days with the skilled bot (continues after victory), periodic save/load
 *    round-trips during treatment, random room closures, staff absence events.
 *  - load: synthetic case with ≥150 active patients, ≥60 staff, ≥40 rooms for ≥10 days.
 * Usage: tsx tools/sim/stress.ts [long|load|all] [seeds=20] [days=1000]
 */
interface StressResult {
  kind: string;
  seed: number;
  days: number;
  violations: string[];
  maxQueue: number;
  maxReservations: number;
  maxPatients: number;
  maxLog: number;
  maxSaveKB: number;
  finalSaveKB: number;
  roundTrips: number;
  closures: number;
  absences: number;
  won: boolean;
  ms: number;
}

function roundTrip(eng: GameEngine): GameEngine {
  const json = JSON.stringify(eng.state);
  const next = new GameEngine(JSON.parse(json), { invariantEvery: eng.invariantEvery, strict: false });
  reconcile(next.world);
  return next;
}

function longRun(seed: number, days: number): StressResult {
  const t0 = Date.now();
  let eng = GameEngine.newGame(seed, { invariantEvery: 240 });
  let bot = new Bot(eng, 'skilled');
  const r: StressResult = { kind: 'long', seed, days, violations: [], maxQueue: 0, maxReservations: 0, maxPatients: 0, maxLog: 0, maxSaveKB: 0, finalSaveKB: 0, roundTrips: 0, closures: 0, absences: 0, won: false, ms: 0 };
  const tpd = DEF.sim.ticksPerDay;
  while (eng.world.tick < days * tpd) {
    eng.step();
    if (eng.world.tick % bot.p.thinkEvery === 0) bot.think();
    const s = eng.state;
    if (s.progress.victory && !s.progress.continuedAfterVictory) {
      r.won = true;
      bot.cmd({ type: 'CONTINUE_AFTER_VICTORY' });
    }
    if (eng.world.tick % 100 === 0) {
      r.maxQueue = Math.max(r.maxQueue, s.queues.length);
      r.maxReservations = Math.max(r.maxReservations, s.reservations.length);
      r.maxPatients = Math.max(r.maxPatients, s.patients.length);
      r.maxLog = Math.max(r.maxLog, s.log.length);
    }
    // Every 7 days at 11:00 (treatments active): save/load round-trip, closure test, absence event.
    if (eng.world.tick % (tpd * 7) === 1100) {
      const kb = JSON.stringify(s).length / 1024;
      r.maxSaveKB = Math.max(r.maxSaveKB, kb);
      eng = roundTrip(eng);
      const old = bot;
      bot = new Bot(eng, 'skilled');
      Object.assign(bot, { lastRefreshDay: old.lastRefreshDay });
      r.roundTrips++;
      const rooms = eng.state.rooms.filter((x) => x.type === 'R03' || x.type === 'R05');
      if (rooms.length > 1) {
        const room = rooms[eng.world.day % rooms.length]!;
        bot.cmd({ type: 'SET_ROOM_OPEN', roomId: room.id, open: false });
        eng.runTicks(120);
        bot.cmd({ type: 'SET_ROOM_OPEN', roomId: room.id, open: true });
        r.closures++;
      }
      if (eng.world.chapter >= 3 && eng.state.staff.length >= 4) {
        startEvent(eng.world, 'E08', true);
        r.absences++;
      }
    }
    if (eng.world.tick % (tpd * 50) === 0) {
      const v = checkInvariants(eng.world);
      if (v.length) r.violations.push(...v.slice(0, 3).map((x) => `day ${eng.world.day}: ${x}`));
    }
  }
  r.violations.push(...eng.state.audit.violations);
  r.finalSaveKB = Math.round(JSON.stringify(eng.state).length / 1024);
  r.maxSaveKB = Math.round(Math.max(r.maxSaveKB, r.finalSaveKB));
  r.ms = Date.now() - t0;
  return r;
}

function loadCase(seed: number, days: number): StressResult & { peak: { patients: number; staff: number; rooms: number } } {
  const t0 = Date.now();
  const eng = GameEngine.newGame(seed, { invariantEvery: 50 });
  const bot = new Bot(eng, 'skilled');
  // Grow a large hospital through normal play first.
  while (eng.state.progress.chapter < 5 && eng.world.day < 70) {
    eng.step();
    if (eng.world.tick % bot.p.thinkEvery === 0) bot.think();
  }
  const peak = { patients: 0, staff: 0, rooms: 0 };
  const r = { kind: 'load', seed, days, violations: [] as string[], maxQueue: 0, maxReservations: 0, maxPatients: 0, maxLog: 0, maxSaveKB: 0, finalSaveKB: 0, roundTrips: 0, closures: 0, absences: 0, won: false, ms: 0, peak };
  const end = eng.world.tick + days * DEF.sim.ticksPerDay;
  while (eng.world.tick < end) {
    // Synthetic pressure: keep ≥150 patients in the building.
    if (eng.state.patients.length < 155 && eng.world.isDayShift) for (let i = 0; i < 3; i++) spawnPatient(eng.world, false);
    eng.step();
    if (eng.world.tick % bot.p.thinkEvery === 0) {
      bot.think();
      // Keep the population of staff/rooms high (≥60/≥40) by hiring reserves and adding rooms.
      if (eng.state.staff.length < 62) for (const room of eng.state.rooms) if (eng.state.staff.length < 62 && DEF.room[room.type].team.length === 1 && room.type !== 'R12') bot.cmd({ type: 'HIRE_STAFF', candidateId: eng.state.candidates.find((c) => c.role === DEF.room[room.type].team[0])?.id ?? -1, shift: 'day', roomId: room.id });
      if (eng.state.rooms.length < 41) bot.tryBuild('R02');
    }
    peak.patients = Math.max(peak.patients, eng.state.patients.length);
    peak.staff = Math.max(peak.staff, eng.state.staff.length);
    peak.rooms = Math.max(peak.rooms, eng.state.rooms.length);
    r.maxQueue = Math.max(r.maxQueue, eng.state.queues.length);
    r.maxReservations = Math.max(r.maxReservations, eng.state.reservations.length);
  }
  r.violations.push(...eng.state.audit.violations);
  r.finalSaveKB = Math.round(JSON.stringify(eng.state).length / 1024);
  r.ms = Date.now() - t0;
  return r;
}

if (!isMainThread) {
  const { kind, seed, days } = workerData as { kind: string; seed: number; days: number };
  parentPort!.postMessage(kind === 'load' ? loadCase(seed, days) : longRun(seed, days));
} else {
  const mode = process.argv[2] ?? 'all';
  const seeds = Number(process.argv[3] ?? 20);
  const days = Number(process.argv[4] ?? 1000);
  const jobs: { kind: string; seed: number; days: number }[] = [];
  if (mode === 'load' || mode === 'all') jobs.push({ kind: 'load', seed: 4242, days: 10 });
  if (mode === 'long' || mode === 'all') for (let i = 0; i < seeds; i++) jobs.push({ kind: 'long', seed: 5000 + i * 104729, days });
  const self = fileURLToPath(import.meta.url);
  const results: unknown[] = [];
  let next = 0;
  let running = 0;
  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    const launch = () => {
      if (next >= jobs.length && running === 0) return resolve();
      while (running < Math.max(1, cpus().length) && next < jobs.length) {
        const job = jobs[next++]!;
        running++;
        const wk = new Worker(self, { workerData: job, execArgv: ['--import', 'tsx'] });
        wk.on('message', (m: StressResult) => {
          results.push(m);
          console.log(`${m.kind} seed ${m.seed}: ${m.days} days, violations ${m.violations.length}, maxQueue ${m.maxQueue}, maxRes ${m.maxReservations}, maxPatients ${m.maxPatients}, save ${m.finalSaveKB} KB (max ${m.maxSaveKB}), roundTrips ${m.roundTrips}, ${Math.round(m.ms / 1000)}s ${'peak' in m ? JSON.stringify((m as { peak: unknown }).peak) : ''}`);
        });
        wk.on('error', reject);
        wk.on('exit', () => {
          running--;
          launch();
        });
      }
    };
    launch();
  });
  const totalViolations = (results as StressResult[]).reduce((s, r) => s + r.violations.length, 0);
  mkdirSync('reports', { recursive: true });
  writeFileSync(`reports/stress-${mode}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), mode, seeds, days, wallSeconds: Math.round((Date.now() - t0) / 1000), totalViolations, results }, null, 2));
  console.log(`total invariant violations: ${totalViolations}`);
  if (totalViolations > 0) process.exit(1);
}
