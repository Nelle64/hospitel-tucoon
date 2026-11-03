# Performance report

**Important:** all numbers below were measured in **headless Chromium on a cloud VM** (Intel Xeon @ 2.10 GHz, 4 vCPU, software WebGL via SwiftShader/ANGLE, iPhone-13 viewport 390×844 at DPR 2). They are *not* physical iPhone measurements. Frame pacing in this environment is vsync-capped at 60 Hz.

## Rendering (Playwright `tests/e2e/performance.spec.ts`, production build, 2× game speed, 3 s warm-up, 8 s measured)
States are genuine gameplay saves produced by the skilled bot and imported through the in-game import flow (`tests/e2e/fixtures.ts`).

| Scenario (target) | Rooms | Agents on map (patients + staff on site) | Sprites inside the camera view | Median FPS | p95 frame time | Target met |
|---|---|---|---|---|---|---|
| Small (8 rooms / 15 agents → ≥ 50 FPS) | 9 | 12 (5 + 7) | 10 | 59.9 | 16.7 ms | yes |
| Medium (20 rooms / 60 agents → ≥ 45 FPS) | 20 | 58 (38 + 20) | 42 | 59.9 | 16.8 ms | yes |
| Large (40 rooms / 120 agents → ≥ 30 FPS, 95 % < 50 ms) | 39 | 148 (107 + 41) | 89 | 59.9 | 16.8 ms | yes |

Raw data: `reports/e2e/performance-{small,mid,large}.json`. In the large scenario 148 agents were simulated and rendered (sprites outside the camera are culled by Phaser); 89 were inside the camera rectangle at zoom 0.6.

## Simulation cost (headless Node 22, same VM)
| Measurement | Result | Source |
|---|---|---|
| Engine time per tick in the browser, large scenario | ~0.2 ms (≈ 8 ms per real second at 4× = 40 ticks/s) | `simMsPerTick` in performance JSON |
| Full skilled campaign (≈ 70 game days, invariants every 600 ticks) | 5–15 s | `reports/balance-*.json` (`ms`) |
| 1,000 game days incl. 143 save/load round-trips | 98–126 s per seed | `reports/stress-all.json` |
| Synthetic load: 165 patients, 62 staff, 57 rooms, 10 days, invariants every 50 ticks | 8 s | `reports/stress-all.json` |
| Save snapshot size (full hospital, 365-day history) | ~1.6–1.75 MB JSON, bounded | stress suite |

## Graphics settings
`Hög` / `Normal` run at 60 FPS target; `Låg` sets Phaser's target to 30 FPS. Settings never change simulation rules (the simulation is driven by the fixed-tick accumulator only); `Reducerade animationer` disables bobbing/ghost/glitch effects.

## Expected behaviour on iPhone (not yet measured)
The renderer draws one static ground texture plus ~400 furniture images and up to ~200 character sprites in a few batched draw calls, and the simulation costs well under 1 ms per frame at 4×. We expect 60 FPS on recent iPhones and ≥ 30 FPS on older ones, but **this must be confirmed on a physical device** (see `docs/MOBILE_QA.md`; the in-game *Diagnostik* tab shows median FPS and simulation time per tick for that purpose).
