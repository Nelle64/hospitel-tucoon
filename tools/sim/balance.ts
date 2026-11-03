import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { runBot, type BotResult, type Strategy } from './bot';

/** Multi-seed balance runner (worker threads). Usage: tsx tools/sim/balance.ts [seeds=30] [strategies=skilled,average,inefficient] [maxDays=140] */
if (!isMainThread) {
  const { seed, strategy, maxDays } = workerData as { seed: number; strategy: Strategy; maxDays: number };
  parentPort!.postMessage(runBot(seed, strategy, maxDays, { invariantEvery: 600 }));
} else {
  const seeds = Number(process.argv[2] ?? 30);
  const strategies = (process.argv[3] ?? 'skilled,average,inefficient').split(',') as Strategy[];
  const maxDays = Number(process.argv[4] ?? 140);
  const jobs: { seed: number; strategy: Strategy }[] = [];
  for (const strategy of strategies) for (let i = 0; i < seeds; i++) jobs.push({ seed: 1000 + i * 7919, strategy });
  const results: BotResult[] = [];
  const self = fileURLToPath(import.meta.url);
  const parallel = Math.max(1, cpus().length);
  let next = 0;
  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    let running = 0;
    const launch = () => {
      if (next >= jobs.length && running === 0) return resolve();
      while (running < parallel && next < jobs.length) {
        const job = jobs[next++]!;
        running++;
        const wk = new Worker(self, { workerData: { ...job, maxDays }, execArgv: ['--import', 'tsx'] });
        wk.on('message', (r: BotResult) => {
          results.push(r);
          process.stdout.write(`${r.strategy} seed ${r.seed}: ${r.won ? `WIN day ${r.victoryDay}` : `no win (ch ${r.chapterDays.length + 1})`} chapters ${r.chapterDays.join('/')} recon ${r.reconstructions} viol ${r.violations} ${Math.round(r.ms / 1000)}s\n`);
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
  const summary: Record<string, unknown> = {};
  for (const strategy of strategies) {
    const rs = results.filter((r) => r.strategy === strategy);
    const wins = rs.filter((r) => r.won).map((r) => r.victoryDay!).sort((a, b) => a - b);
    const median = wins.length ? wins[Math.floor(wins.length / 2)] : null;
    summary[strategy] = {
      runs: rs.length,
      wins: wins.length,
      winRate: rs.length ? Math.round((wins.length / rs.length) * 1000) / 10 : 0,
      winsBy120: wins.filter((d) => d <= 120).length,
      medianVictoryDay: median,
      noReconstruction: rs.filter((r) => r.reconstructions === 0).length,
      invariantViolations: rs.reduce((s, r) => s + r.violations, 0),
      avgChapterDays: [0, 1, 2, 3].map((i) => {
        const v = rs.map((r) => r.chapterDays[i]).filter((x): x is number => x !== undefined);
        return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
      }),
      reachedChapter: [1, 2, 3, 4, 5].map((c) => rs.filter((r) => r.chapterDays.length + 1 >= c).length),
    };
  }
  const out = { generatedAt: new Date().toISOString(), seeds, maxDays, wallSeconds: Math.round((Date.now() - t0) / 1000), summary, results };
  mkdirSync('reports', { recursive: true });
  writeFileSync(`reports/balance-${strategies.join('-')}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
