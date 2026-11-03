import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Builds docs/ACCEPTANCE_MATRIX.md and reports/acceptance.json from the machine-readable results
 * actually produced by the test runners. A requirement is only "pass" if its tests ran and passed.
 */
interface Row { req: string; test: string; module: string; method: string; status: 'pass' | 'fail' | 'not-run'; result: string; evidence: string; limitations: string }

const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();
const rows: Row[] = [];

function moduleFor(file: string): string {
  const m: Record<string, string> = {
    'catalog.test.ts': 'GameDefinition', 'rng.test.ts': 'SimulationClock/RNG', 'economy.test.ts': 'EconomySystem', 'layout.test.ts': 'RoomSystem/furnishing',
    'navigation.test.ts': 'NavigationSystem', 'commands.test.ts': 'CommandDispatcher', 'save.test.ts': 'SaveManager', 'journey.test.ts': 'Patient/Staff/Resource systems',
    'saveload.test.ts': 'SaveManager', 'rooms.test.ts': 'RoomSystem (18 rooms)', 'diseases.test.ts': 'PatientSystem (24 diseases)', 'systems.test.ts': 'Staff/Research/Event/Mission/Construction/Economy',
    'campaign.test.ts': 'CampaignSystem (headless bot)', 'smoke.spec.ts': 'Production build', 'mobile.spec.ts': 'Mobile UX', 'touch.spec.ts': 'Touch input/UI', 'persistence.spec.ts': 'Save/PWA/lifecycle',
    'visual.spec.ts': 'Visual QA', 'performance.spec.ts': 'Performance',
  };
  return m[file.split('/').pop()!] ?? file;
}

function reqId(title: string): string {
  const m = title.match(/(REQ-[A-Z0-9-]+|VIS-\d+|PERF|@smoke)/);
  return m ? m[1]! : 'REQ-MISC';
}

// Vitest JSON (unit + integration, campaign)
for (const [file, method] of [['reports/vitest.json', 'automated unit/integration test (Vitest, headless)'], ['reports/vitest-campaign.json', 'headless campaign simulation (Vitest + bot)']] as const) {
  if (!existsSync(file)) continue;
  const v = JSON.parse(readFileSync(file, 'utf8')) as { testResults: { name: string; assertionResults: { fullName: string; title: string; status: string; duration?: number }[] }[] };
  for (const suite of v.testResults) {
    for (const a of suite.assertionResults) {
      const title = a.fullName || a.title;
      rows.push({ req: reqId(title), test: title.replace(/\|/g, '/'), module: moduleFor(suite.name), method, status: a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'not-run', result: a.status, evidence: file, limitations: '' });
    }
  }
}
// Playwright JSON
if (existsSync('reports/playwright.json')) {
  const p = JSON.parse(readFileSync('reports/playwright.json', 'utf8')) as { suites: unknown[] };
  const walk = (s: { title?: string; file?: string; specs?: { title: string; file: string; tests: { projectName: string; results: { status: string }[]; status: string }[] }[]; suites?: unknown[] }, prefix: string) => {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests) {
        const status = t.results.at(-1)?.status ?? 'skipped';
        if (status === 'skipped') continue;
        const title = `${prefix}${spec.title} [${t.projectName}]`;
        rows.push({ req: reqId(spec.title), test: title.replace(/\|/g, '/'), module: moduleFor(spec.file), method: 'browser e2e on production build (Playwright, Chromium, touch emulation)', status: status === 'passed' ? 'pass' : 'fail', result: status, evidence: 'reports/playwright.json, playwright-report/', limitations: spec.file.includes('performance') ? 'Desktop headless Chromium (SwiftShader); not a physical iPhone measurement' : 'Emulated iPhone viewport in Chromium; not a physical iPhone' });
      }
    }
    for (const sub of (s.suites ?? []) as typeof s[]) walk(sub, sub.title && !sub.title.endsWith('.ts') ? `${prefix}${sub.title} › ` : prefix);
  };
  for (const s of p.suites as never[]) walk(s, '');
}
// Simulation reports
if (existsSync('reports/balance-skilled-average-inefficient.json')) {
  const b = JSON.parse(readFileSync('reports/balance-skilled-average-inefficient.json', 'utf8'));
  const sk = b.summary.skilled;
  const ok = sk.runs >= 30 && sk.winsBy120 / sk.runs >= 0.8 && sk.medianVictoryDay >= 70 && sk.medianVictoryDay <= 95 && sk.noReconstruction / sk.runs >= 0.9 && sk.invariantViolations === 0;
  rows.push({ req: 'REQ-BAL-01', test: `Skilled strategy ${sk.runs} seeds: ${sk.wins} wins, ${sk.winsBy120} by day 120, median day ${sk.medianVictoryDay}, ${sk.noReconstruction} without reconstruction`, module: 'Campaign balance', method: 'multi-seed headless bot (commands only)', status: ok ? 'pass' : 'fail', result: JSON.stringify({ wins: sk.wins, median: sk.medianVictoryDay }), evidence: 'reports/balance-skilled-average-inefficient.json', limitations: 'Bot behaviour approximates a skilled human' });
  for (const k of ['average', 'inefficient']) {
    const s = b.summary[k];
    rows.push({ req: 'REQ-BAL-02', test: `${k} strategy ${s.runs} seeds: reached chapter 5 in ${s.reachedChapter[4]}, invariant violations ${s.invariantViolations}`, module: 'Campaign balance', method: 'multi-seed headless bot (commands only)', status: s.runs >= 30 && s.invariantViolations === 0 ? 'pass' : 'fail', result: `wins ${s.wins}/${s.runs}`, evidence: 'reports/balance-skilled-average-inefficient.json', limitations: 'Non-skilled strategies do not win within 160 days (reputation 90 not reached)' });
  }
}
for (const f of ['reports/stress-all.json', 'reports/stress-long.json']) {
  if (!existsSync(f)) continue;
  const s = JSON.parse(readFileSync(f, 'utf8'));
  const long = s.results.filter((r: { kind: string }) => r.kind === 'long');
  const load = s.results.find((r: { kind: string }) => r.kind === 'load');
  if (long.length) rows.push({ req: 'REQ-STAB-01', test: `${long.length} seeds × ${long[0].days} game days with periodic save/load during care, closures and staff absence`, module: 'Long-term stability', method: 'headless stress suite', status: s.totalViolations === 0 && long.length >= 20 && long[0].days >= 1000 ? 'pass' : 'fail', result: `violations ${s.totalViolations}, max queue ${Math.max(...long.map((r: { maxQueue: number }) => r.maxQueue))}, max save ${Math.max(...long.map((r: { maxSaveKB: number }) => r.maxSaveKB))} KB`, evidence: f, limitations: '' });
  if (load) rows.push({ req: 'REQ-STAB-02', test: `Synthetic load: peak ${load.peak.patients} patients, ${load.peak.staff} staff, ${load.peak.rooms} rooms, ${load.days} days`, module: 'Long-term stability', method: 'headless stress suite', status: load.violations.length === 0 && load.peak.patients >= 150 && load.peak.staff >= 60 && load.peak.rooms >= 40 && load.days >= 10 ? 'pass' : 'fail', result: `violations ${load.violations.length}`, evidence: f, limitations: '' });
  break;
}
rows.push({ req: 'REQ-IPHONE-01', test: 'Physical iPhone acceptance (owner plays the published build)', module: 'Release', method: 'manual check on a real iPhone', status: 'not-run', result: 'pending owner', evidence: 'docs/MOBILE_QA.md', limitations: 'Cannot be performed from the cloud session' });

const counts = { pass: rows.filter((r) => r.status === 'pass').length, fail: rows.filter((r) => r.status === 'fail').length, notRun: rows.filter((r) => r.status === 'not-run').length };
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const g = r.req.replace(/-(R\d\d|D\d\d|E\d\d)-\d+$/, '-$1').replace(/-\d+$/, '');
  groups.set(r.module, [...(groups.get(r.module) ?? []), r]);
  void g;
}
let md = `# Acceptance matrix\n\n_Generated by \`tools/report/acceptance.ts\` from the machine-readable results of the runs listed below – statuses are never edited by hand._\n\nCommit: \`${commit}\` · Generated: ${new Date().toISOString()}\n\n**Totals: ${counts.pass} pass · ${counts.fail} fail · ${counts.notRun} not run** (${rows.length} entries)\n\n`;
md += '## Summary by module\n\n| Module | Entries | Pass | Fail | Not run |\n|---|---|---|---|---|\n';
for (const [m, rs] of groups) md += `| ${m} | ${rs.length} | ${rs.filter((r) => r.status === 'pass').length} | ${rs.filter((r) => r.status === 'fail').length} | ${rs.filter((r) => r.status === 'not-run').length} |\n`;
md += '\n## Entries\n\n| Requirement | Test | Module | Method | Status | Evidence | Known limitations |\n|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.req} | ${r.test} | ${r.module} | ${r.method} | ${r.status === 'pass' ? '✅ pass' : r.status === 'fail' ? '❌ fail' : '⏳ not run'} | ${r.evidence} | ${r.limitations} |\n`;
writeFileSync('docs/ACCEPTANCE_MATRIX.md', md);
writeFileSync('reports/acceptance.json', JSON.stringify({ commit, generatedAt: new Date().toISOString(), counts, rows }, null, 1));
console.log(`acceptance: ${counts.pass} pass, ${counts.fail} fail, ${counts.notRun} not run (${rows.length})`);
