# Implementation status

_Last updated: session 1 (2026-11-03)._

## Current phase
Phase 3 → 4 (core simulation implemented headless; tests, bots, art and UI pending).

## Done
- Scaffold (TS 6 strict, Vite 8, Phaser 4.2, Vitest 5, Playwright 1.63, ESLint), custom PWA build plugin (service worker + precache manifest).
- GameDefinition: 18 rooms, 14 step kinds, 24 diseases, 9 roles, 12 skills, 12 trainings, 12 research projects, 12 missions, 12 events, 5 chapters; validator (`npm run validate:data`) passes.
- Core: GameState, seeded xoshiro128** RNG (state saved), World (indices), Grid (edge walls + doors), command union + runtime validation + duplicate-id protection, domain events (300-entry log), invariants checker.
- Systems: building/corridors/doors/upgrades/demolition/land, deterministic room furnishing (all 18 types, every door position at min size verified), A* navigation with cache + traffic, movement, patients (arrival → registration → steps → outcome → settlement → exit), staff (shifts, wages, energy/stress, breaks, cleaning, research, training, overtime/handover), ResourceManager (queues, 3 queue policies, reservations, timeouts, bed coverage), economy (transactions, accruals, loans, crisis states), research (RP/GRP, identification/mastery, projects, conversion/focus), missions (12 templates), events (12 templates + pressure director), campaign (5 chapters + 7-day final inspection + victory), metrics (daily aggregates, 365 days), tutorial, blueprint (atomic selection), reconstruction.
- First headless run: 5 days, 0 invariant violations with checks every tick.

## Pending
- Automated unit/integration tests, traceability matrix.
- Strategy bots + campaign tests + balance calibration.
- Save system (IndexedDB generations, checksum, migrations, export/import).
- Asset generator (pixel art, sfx), Phaser renderer, DOM UI, tutorial UI, settings, diagnostics.
- CI workflows, e2e tests, reports, deployment.

## Blockers
- GitHub Pages must be enabled once by the repository owner (Settings → Pages → Source: GitHub Actions). Instructions will be given when the deploy workflow exists.

## Next executable steps
1. Write unit/integration tests for catalogs, RNG, economy, building, navigation, patient journey.
2. Implement strategy bots and run the campaign headless.
