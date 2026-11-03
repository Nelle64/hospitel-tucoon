# Implementation plan

Phases follow the master specification (§26). Each phase ends with an acceptance gate that is verified by automated tests.

| Phase | Scope | Gate |
|---|---|---|
| 0 | Scaffold: TS strict, Vite, Phaser, PWA plugin, CI, Pages workflow, test framework, docs | Production build succeeds; basic page testable |
| 1 | GameDefinition catalogs + validation, GameState, RNG, clock, commands, domain events, transactions, snapshots | All catalogs validate, no missing references |
| 2 | Tile map, land, rooms, corridors, doors, furnishing, stations, costs, blueprints, A*, movement, camera/touch | Rooms built, connected, traversed, upgraded, saved consistently |
| 3 | Demand, registration, triage, shifts, energy/rest, queues, reservations, treatment, outcomes, economy, metrics | Starting clinic runs 30 days without invalid state; real patient journey |
| 4 | All diseases/rooms behaviour, research, training, missions, events, campaign, crisis/reconstruction, inspection, victory | A bot completes the campaign through commands only |
| 5 | Pixel-art generator, sprites, animation, effects, HUD, panels, dashboard, research UI, tutorial, audio, settings | Visually cohesive; core functions operable in portrait touch tests |
| 6 | Save generations, crash recovery, migrations, export/import, service worker, offline restart, update flow, diagnostics | Save/recovery/import/export/offline tests pass |
| 7 | Campaign/balance/stress/perf/visual/audio/mobile QA, deployment checks, reports | All mandatory automated criteria pass |

Working order inside phases is vertical: a feature is done only when buildable, staffable, used by patients, booked through the ResourceManager, reflected in economy/research/metrics and preserved by save/load.
