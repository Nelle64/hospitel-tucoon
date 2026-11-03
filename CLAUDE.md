# Pixel Hospital – project conventions for Claude Code sessions

The user works **only from an iPhone** (Claude app). Never ask them to run commands, edit files or use a computer.
All technical work happens in the cloud session. GitHub repo: `Nelle64/hospitel-tucoon`.
Live game (GitHub Pages): https://nelle64.github.io/hospitel-tucoon/

## Commands
| Purpose | Command |
|---|---|
| Install | `npm ci` |
| Generate pixel art + sfx | `npm run assets` |
| Validate game data | `npm run validate:data` |
| Typecheck / lint | `npm run typecheck` / `npm run lint` |
| Unit + integration tests | `npm test` |
| Campaign (headless bot) tests | `npm run test:campaign` |
| Balance runs (multi-seed) | `npm run balance` |
| Long stress suite | `npm run test:stress` |
| Production build | `npm run build` (base `/hospitel-tucoon/`; `BASE_PATH=/` for local) |
| Browser e2e (Playwright) | `npm run e2e` |

## Architecture rules (non-negotiable)
- `GameState` (src/core/state.ts) is the single authoritative, serialisable truth. Derived data (grid, indices, path cache) lives in `World` and is rebuilt on load.
- All player actions go through `GameEngine.dispatch(command)` with runtime validation (src/core/commands.ts). Duplicate command ids are ignored.
- Only `src/systems/economy.ts#post` mutates money. Integer kronor, every change is a transaction.
- All patient/staff/station bookings go through `src/systems/resources.ts` (ResourceManager).
- Simulation uses only the seeded RNG in `GameState.rng` (`Math.random` is lint-banned in sim code).
- Phaser/DOM never own game state; rendering reads state. Simulation must run headless.
- Fixed tick = 0.6 game minutes, 2,400 ticks/day, 10 ticks/s at 1×. Frame rate never changes outcomes.
- Player-facing text is Swedish; code/docs English.
- Never mark tests passed that did not run; never weaken assertions to get green CI; never fake reports.
- Balance changes must be logged in docs/BALANCE_REPORT.md (parameter, old, new, reason, evidence).

## Layout
- `src/data` static GameDefinition catalogs + validation
- `src/core` state, RNG, grid, world, commands, engine, invariants, new game
- `src/systems` simulation systems (building, layout, navigation, movement, patients, staff, resources, economy, research, missions, events, campaign, metrics, pressure, tutorial, blueprint, recovery)
- `src/save` IndexedDB save manager, checksum, migrations
- `src/render` Phaser scene, `src/ui` DOM HUD/panels, `src/audio` sfx
- `tools/generate-assets` deterministic pixel art + audio generators, `tools/sim` bots/balance/stress
- `tests/unit`, `tests/integration`, `tests/campaign`, `tests/e2e`

## Progress tracking
Keep `docs/IMPLEMENTATION_STATUS.md` current (phase, done, pending, blockers, next steps) and commit regularly.
