# Implementation status

_Last updated: 2026-11-03 (session 1). Branch `claude/pixel-hospital`._

## Current phase
Phase 7 (final acceptance). All phases 0–6 are implemented and their acceptance gates pass in automated tests. Remaining: merge to `main`, enable GitHub Pages, verify the live URL, physical iPhone check by the owner.

## Done (verified by automated tests)
- **Phase 0** – scaffold, strict TS, Vite 8, Phaser 4.2, Vitest 5, Playwright 1.63, ESLint, custom PWA plugin, CI (`.github/workflows/ci.yml`, green on GitHub: run 41698999763), Pages deploy workflow, long-run workflow.
- **Phase 1** – complete GameDefinition (validator passes), GameState, seeded RNG, clock, commands with runtime validation and dedupe, domain events, transactions, invariants.
- **Phase 2** – map/land/corridors/doors/rooms, deterministic furnishing (all room types, every door position), blueprints (atomic), A* with cache and traffic, movement, camera + touch input.
- **Phase 3** – demand, registration, triage, shifts, energy/rest, queues/reservations, treatment, outcomes, economy, metrics; starting clinic runs 30 days without invalid state; genuine patient journey test.
- **Phase 4** – all 24 diseases and 18 rooms functional (144 room + 192 disease checks), research, training, missions, events, pressure director, campaign, crisis/reconstruction, final inspection, victory; skilled bot wins 30/30 seeds (median day 70).
- **Phase 5** – original asset generator (270 sprites, 19 sounds), renderer, full Swedish UI, dashboard, tutorial, settings, accessibility options, audio.
- **Phase 6** – IndexedDB generations, verification, crash recovery, migrations, export/import, service worker (offline restart tested), update flow, diagnostics.
- **Phase 7** – 437 unit/integration tests, campaign tests, 51 e2e tests on 4 viewports, 30-seed × 3-strategy balance, 20 × 1,000-day stress + load case, visual QA screenshots, performance scenarios, reports in `docs/`.

## Pending
1. Merge the pull request into `main` (owner action on iPhone, see PR description).
2. Enable GitHub Pages with source “GitHub Actions” (owner action, see PR description); deploy workflow then publishes; verify the live URL.
3. Physical iPhone acceptance (`docs/MOBILE_QA.md`).

## Blockers
- Pages enablement and merging require the repository owner's approval (cannot be done from the session without explicit permission).

## Next executable steps (for any future session)
1. `git checkout claude/pixel-hospital && npm ci && npm run assets && npm test` to verify the workspace.
2. After merge + Pages enablement: check `https://nelle64.github.io/hospitel-tucoon/` returns 200 and `sw.js` is served; run `BASE_URL=... npx playwright test --grep @smoke` against it if desired.
3. Regenerate reports after any change: `npx vitest run --project unit --project integration --reporter=json --outputFile=reports/vitest.json`, `npx playwright test`, `npx tsx tools/report/acceptance.ts`.
