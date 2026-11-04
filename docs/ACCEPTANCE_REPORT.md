# Acceptance report

_Status date: 2026-11-04 · `main` @ `1342471` · CI on main: GitHub Actions run 41711703007 (green) · Deploy: run 41793253738 (build, deploy and live verification green)._

## Release status: **TEKNISKT KLART – INVÄNTAR IPHONE-TEST**
All mandatory automated verification passes and the production build is deployed and verified live at https://nelle64.github.io/hospitel-tucoon/ (deploy run 41793253738, 2026-11-04). The `verify` job of that run, executed on a GitHub-hosted runner after `deploy-pages`, fetched the live URL (HTTP 200, page contains “Pixel Hospital”), `manifest.webmanifest` (`start_url` `./`), `sw.js` (precache list present) and every file listed in `precache-manifest.json`; all succeeded. The 8 `@smoke` browser tests ran on the identical build output in the same run before it was uploaded. The cloud session itself cannot reach `github.io` (its network proxy denies the host), so the live check relies on that runner job. The status is not *FÄRDIGT OCH VERIFIERAT* because the physical iPhone check (`docs/MOBILE_QA.md`) has not been done.

## Evidence summary (all from actual runs; nothing hand-marked)
| Area | Result | Evidence |
|---|---|---|
| Static catalogs (18/24/9/12/12/12/12/12/5, references, totals 3,580 GRP & 3,300 RP route) | pass | `npm run validate:data`, `tests/unit/catalog.test.ts` |
| Unit + integration tests | **437 / 437 pass** | `reports/vitest.json` |
| Room acceptance (18 rooms × 8 checks) | **144 / 144 pass** | `tests/integration/rooms.test.ts` |
| Disease acceptance (24 diseases × 8 checks incl. a real arrival-to-outcome journey each) | **192 / 192 pass** (+3 extra) | `tests/integration/diseases.test.ts` |
| Mandatory save cases 1–12 + 100 save/load round-trips + determinism after reload | pass | `tests/integration/saveload.test.ts`, `tests/unit/save.test.ts` |
| Campaign from a fresh save using commands only (all 5 chapter transitions, victory) | pass (2 seeds in CI) | `reports/vitest-campaign.json` |
| Balance: 30 seeds × 3 strategies | skilled 30/30 wins, 30/30 by day 120, median day 70, 0 reconstructions; average/inefficient reach chapter 5 with recoverable setbacks | `reports/balance-skilled-average-inefficient.json`, `docs/BALANCE_REPORT.md` |
| Long-term stability: 20 seeds × 1,000 days with save/load during care, closures, staff absence | **0 invariant violations**, bounded queues (≤ 31), reservations (≤ 29), save size (≤ 1.76 MB) | `reports/stress-all.json` |
| Synthetic load: ≥ 150 patients, ≥ 60 staff, ≥ 40 rooms, ≥ 10 days | 165 / 62 / 57, 10 days, 0 violations | `reports/stress-all.json` |
| Browser e2e on the production build, 4 portrait viewports with touch | **51 / 51 pass** (45 single-viewport tests skipped on the other sizes by design) | `reports/playwright.json` |
| Offline restart, export/import, background pause, audio unlock | pass | `tests/e2e/persistence.spec.ts` |
| Visual QA screenshots from the running game (8 required) | produced | `docs/images/screenshots/` |
| Performance scenarios | targets met in headless Chromium (not an iPhone) | `docs/PERFORMANCE_REPORT.md` |
| Asset generation + validation | pass, 270 sprites, 19 sounds | `docs/ASSET_AUDIT.md` |
| Generated acceptance matrix | **496 pass · 0 fail · 1 not run** | `docs/ACCEPTANCE_MATRIX.md`, `reports/acceptance.json` |

## Specification coverage
| Spec section | Status |
|---|---|
| §1 Identity, locked scope | Implemented in full (counts verified by tests) |
| §2 Stack & architecture | TS strict, Phaser 4, Vite, DOM UI, IndexedDB, SW, Vitest, Playwright, GitHub Actions/Pages; headless simulation |
| §3 Time & determinism | 0.6-min ticks, accumulator, seeded RNG saved, ordered pipeline; determinism tests incl. reload |
| §4 Map & construction | 64×64, land stages, drag/handles/door move preview, validations, blueprints (atomic), demolition/undo |
| §5 Room catalog | all 18, costs/ops/upgrades/support upgrades as specified |
| §6 Personnel | 9 roles, 12 skills, 12 trainings, energy/rest, constraints enforced |
| §7 Diseases | all 24 with paths, thresholds, material split, timing/quality model |
| §8 Arrivals & triage | demand formula, blocks, category mix, rarity compensation, triage decay, escalation |
| §9 State machines | all patient/staff states; one terminal outcome per case |
| §10 ResourceManager | central bookings, invariants, timeouts, three queue policies |
| §11 Navigation | A*, traffic, recovery, cache invalidation |
| §12 Economy | integer transactions, loans, crisis/recovery, grants once |
| §13 Research | RP/GRP separation, projects/dependencies, conversion/focus |
| §14 Campaign | 5 chapters + final inspection + victory + continue/new campaign |
| §15–16 Missions/events | 12 + 12 templates, director, pressure score |
| §17 Dashboard | 4 tabs, 7/30/90 days, 365-day history, overlays |
| §18 Tutorial | 6 steps, skip/restart, reward once |
| §19 Mobile UX | portrait layout, gestures, sheets, safe areas, 44 px targets, pause behaviour |
| §20–21 Art & audio | original generated assets; synthesized sounds, max 8 voices |
| §22–23 Data contracts & saves | runtime-validated commands/saves, envelope, generations, recovery, export/import, migrations, retention |
| §24 PWA & GitHub | manifest, SW precache, offline, update flow, CI/CD workflows — deployed to GitHub Pages and verified live (deploy run 41793253738) |
| §27 Tests | all listed suites implemented and passing |
| §28 Reporting | all required documents present |

## Known limitations (honest list)
1. **Live verification is HTTP-level.** The deployed site was checked with HTTP requests from a GitHub runner (HTML, manifest, service worker, all precached files). Browser tests ran on the same build locally in CI, not against the live URL.
2. **No physical iPhone test yet.** All mobile tests use Chromium with iPhone emulation; Safari/WebKit specifics (audio unlock, Files picker, home-screen install, real notch) are unverified.
3. **Performance numbers are from headless desktop Chromium** with software rendering, vsync-capped; no iPhone FPS data yet.
4. **Balance deviations** from the specification's baseline: walking speed 2× faster, satisfaction/success curves, reputation weight, projected-cash crisis, reserve staff, chapter-4 advanced treatments counted per chapter, etc. — each documented with evidence in `docs/BALANCE_REPORT.md`.
5. Average and inefficient bot strategies reach chapter 5 but do not win within 160 days (they never upgrade equipment or train for quality, so reputation 90 is not reached). The skilled strategy meets all targets.
6. Performance “small” scenario had 12 agents (target ~15) and the “large” camera view contained 89 of 148 rendered agents; all three passed their FPS targets in this environment.
7. Art is intentionally simple (24×32 characters with tiny faces; thin edge walls). See `docs/ASSET_AUDIT.md`.
8. Dashboard charts offer tap-for-value tooltips and KPI tiles but no separate tabular export of the history.
9. Additional commands beyond the minimum list were added: `DEMOLISH_CORRIDOR`, `EXPAND_LAND`, `TUTORIAL`, `REFRESH_CANDIDATES`.
10. `npm audit` reports 11 moderate advisories in development-only tooling (ESLint dependency chain); nothing is shipped to players.
