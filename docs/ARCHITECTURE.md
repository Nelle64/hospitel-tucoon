# Architecture

A modular monolith in strict TypeScript. The simulation is deterministic and renderer-independent; Phaser and the DOM only read state and send commands.

```
src/data      GameDefinition: versioned static catalogs + validate.ts (counts, ids, references, totals)
src/core      state.ts (GameState contract), rng.ts (xoshiro128**, state saved), grid.ts (derived tile grid),
              world.ts (GameState + derived indices + domain-event bus), commands.ts (command union + runtime
              validation), engine.ts (GameEngine: dispatcher + ordered tick pipeline + accumulator),
              invariants.ts, newGame.ts
src/systems   building, layout (furnishing), navigation (A*), movement, patients, staff, resources
              (ResourceManager), economy, research, demand, missions, events, pressure, campaign, metrics,
              tutorial, blueprint, recovery, rules (shared formulas)
src/save      canonical JSON + SHA-256, envelope, schema validation, migrations, IndexedDB wrapper,
              SaveManager (generations), reconcile
src/render    Phaser scene (renderer), character appearance composition, touch input controller
src/ui        DOM HUD/sheets/panels/charts/modals (textContent only – no innerHTML)
src/audio     WebAudio sound effects
tools         generate-assets (pixel art, audio, atlases, manifest, validation), pwa (build plugin + SW
              template), sim (bots, planner, balance runner, stress suite), validate-data
tests         unit, integration (incl. room/disease acceptance), campaign (headless bot), e2e (Playwright)
```

## Authoritative state and commands
- `GameState` is plain JSON (arrays sorted by monotonically increasing ids, so iteration order survives save/load). Nothing outside it is needed to reproduce a run: RNG state, the matching dirty flag, traffic counters and command-id dedupe list are all inside.
- `World` adds derived data rebuilt on load: id→entity maps, the tile `Grid` (kind, room, furniture blocking, door edges) and caches (A* path cache keyed by geometry and traffic versions, per-tick caches).
- `GameEngine.dispatch(command)` validates the payload at runtime, ignores duplicate command ids, executes atomically (systems check every precondition before mutating; blueprint selections are trial-applied to a cloned world first) and returns structured Swedish errors. Successful commands emit domain events with causation ids.

## Tick pipeline (`GameEngine.step`, 0.6 game minutes)
0. Day boundary (installments, research focus, close day metrics, inspection day, missions, transaction pruning, new candidates, arrival plan) and shift starts (wages, waiting-state refresh).
1–2. Scheduled completions: research projects, finished reservations (resources released, case advanced, RP/GRP, events), then routing of those patients (`NEXT_STEP`).
3. Clock-dependent conditions: patient health/patience/escalation/abandonment, waiting-state refresh.
4. Arrivals from the day's seeded plan; special-event director.
5–6. Call-forward (next patients wait at the soonest-free door) and matching (`matchPatients`, triage first, queue policy within class).
7. Movement (patients, staff), staff behaviour (shifts, energy/stress, breaks, cleaning, research, training), reservation activation/timeouts, traffic window.
8. Economy accruals (room operation, overtime, overdue payments), room upkeep.
9. Metrics sampling, mission quick checks, campaign, tutorial, crisis state (hourly), demolition finalisation.
10. Invariant checks (configurable frequency; strict mode throws in tests) and event flush to listeners.

The real-time driver (`advance`) converts frame time to ticks with an accumulator (10 × speed ticks per second, capped per frame), so frame rate never changes outcomes.

## ResourceManager (src/systems/resources.ts)
Single owner of queues and reservations. A reservation binds patient, case, room, station and staff ids with states RESERVED → MOVING → ACTIVE; completion or cancellation releases everything and removes it. Invariants (checked by `invariants.ts`): one reservation per patient, per station and per staff member; queue membership exclusive with reservations; no stale references; bed rooms never over capacity; one settlement per case. Reservations expire after 90 game minutes; unreachable stations get a 60-minute retry block. Seats in waiting rooms are occupancy (not bookings) stored on the patient.

## Navigation
4-connected A* with Manhattan heuristic and deterministic tie-breaking; allowed tiles are corridors plus the agent's current room and the destination room. Traffic: steps per corridor tile over a 30-minute window → level 0–100 → up to 25 % slower walking and higher route cost. Geometry changes bump `map.version`, invalidate caches and make movers revalidate their remaining path. No hard collisions, so no permanent deadlocks; blocked agents recover (recompute, cancel booking, fall back to waiting).

## Saving
Snapshots only (no event sourcing). `SaveManager.save` deep-copies the state at a tick boundary, writes generation N+1, reads it back and verifies the checksum, then switches the campaign's active pointer and prunes to three generations. Writes are serialised; older requests never overwrite newer generations. Loading tries active → previous → older and never silently starts a new game. Import: size limit, JSON parse, envelope + schema + checksum validation, migration on a copy, preview + confirmation, current campaign kept as backup. Settings are stored separately.

## Rendering
Phaser 4 (WebGL, pixel-art mode). Static ground + walls are stamped into one `DynamicTexture` redrawn on geometry change. Furniture images and characters are y-sorted. Characters are composed at runtime from generated layer strips (skin, outfit, hair, accessory) and cached per appearance key derived from the saved visual seed. Disease effects (icons, transparency, floating, glitch, time ghosts, clones) are purely visual. The DOM UI re-renders at most every 250 ms (panels every second, skipped while touched).

## PWA
A dependency-free Vite plugin writes `sw.js` with a precache list of every built file and a content-hash cache version. The service worker caches only static files (never IndexedDB). Updates wait for the player: banner → pause → save → `SKIP_WAITING` → reload → load latest save paused.
