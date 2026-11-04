# Implementation status

_Last updated: 2026-11-04 (session 1). `main` @ `1342471`, deployed._

## Current phase
Phase 7 (final acceptance). All phases are implemented, merged to `main` (PR #1) and deployed to GitHub Pages. Release status: **TEKNISKT KLART – INVÄNTAR IPHONE-TEST**. Remaining: physical iPhone check by the owner.

## Done (verified by automated tests)
- **Phase 0** – scaffold, strict TS, Vite 8, Phaser 4.2, Vitest 5, Playwright 1.63, ESLint, custom PWA plugin, CI (`.github/workflows/ci.yml`, green on GitHub: run 41698999763), Pages deploy workflow, long-run workflow.
- **Phase 1** – complete GameDefinition (validator passes), GameState, seeded RNG, clock, commands with runtime validation and dedupe, domain events, transactions, invariants.
- **Phase 2** – map/land/corridors/doors/rooms, deterministic furnishing (all room types, every door position), blueprints (atomic), A* with cache and traffic, movement, camera + touch input.
- **Phase 3** – demand, registration, triage, shifts, energy/rest, queues/reservations, treatment, outcomes, economy, metrics; starting clinic runs 30 days without invalid state; genuine patient journey test.
- **Phase 4** – all 24 diseases and 18 rooms functional (144 room + 192 disease checks), research, training, missions, events, pressure director, campaign, crisis/reconstruction, final inspection, victory; skilled bot wins 30/30 seeds (median day 70).
- **Phase 5** – original asset generator (270 sprites, 19 sounds), renderer, full Swedish UI, dashboard, tutorial, settings, accessibility options, audio.
- **Phase 6** – IndexedDB generations, verification, crash recovery, migrations, export/import, service worker (offline restart tested), update flow, diagnostics.
- **Phase 7** – 437 unit/integration tests, campaign tests, 51 e2e tests on 4 viewports, 30-seed × 3-strategy balance, 20 × 1,000-day stress + load case, visual QA screenshots, performance scenarios, reports in `docs/`.

- **Deployment** – PR #1 merged; repository made public and Pages source set to “GitHub Actions” by the owner (Pages is unavailable for private repositories on the free plan, which caused deploy runs 41711703121 and 41712886269 to fail at `configure-pages` with “Not Found”). Deploy run 41793253738: build, smoke tests, deploy and live verification of https://nelle64.github.io/hospitel-tucoon/ all green.

## Pending
1. Physical iPhone acceptance (`docs/MOBILE_QA.md`).

## Blockers
- None for automated work. The physical iPhone check can only be done by the owner.

## Next executable steps (for any future session)
1. `npm ci && npm run assets && npm test` on `main` to verify the workspace.
2. Every push to `main` redeploys; the `verify` job of `.github/workflows/deploy.yml` checks the live URL (the cloud session's proxy blocks `github.io`, so use that job's log as evidence).
3. Regenerate reports after any change: `npx vitest run --project unit --project integration --reporter=json --outputFile=reports/vitest.json`, `npx playwright test`, `npx tsx tools/report/acceptance.ts`.
