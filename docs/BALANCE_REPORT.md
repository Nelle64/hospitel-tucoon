# Balance report (Normal difficulty)

All numbers below come from headless simulations with strategy bots that play **only through the public command interface** (`tools/sim/bot.ts`). No bot mutates `GameState` or sets unlock flags. Raw data: `reports/balance-skilled-average-inefficient.json` (30 seeds × 3 strategies, max 160 days, generated 2026-11-03, 255 s wall time on 4 cores), long-run stability `reports/stress-*.json`.

## Result against the targets (specification §14.1, §27.4–27.5)

| Target | Result | Status |
|---|---|---|
| Median successful skilled campaign ≈ day 70–95 | **Day 70** (min 57, p25 63, p75 73, max 83) | Met (lower edge of the band) |
| ≥ 80 % of skilled seeds complete by day 120 | **30 / 30 (100 %)** | Met |
| ≥ 90 % of skilled runs avoid reconstruction | **30 / 30 (100 %)** | Met |
| Research does not create prolonged passive waiting | Mastery never blocks a chapter; chapter 5 is paced by reputation 90 + the 7-day inspection | Met |
| Average/inefficient strategies get meaningful, recoverable setbacks | Average: 30/30 reach chapter 5, short crises (avg 1.0 day), plateau at reputation ~81 without upgrades/training. Inefficient: 27/30 reach chapter 5 after deep crises (median minimum cash −12,318 kr, avg 10.3 crisis days, 2 reconstructions) and recover by closing surplus rooms/staff | Met (setbacks are recoverable; neither non-skilled strategy reaches the reputation-90 victory within 160 days) |
| Zero invariant violations | 0 in all 90 balance runs; 0 in 20 × 1,000-day stress runs | Met |
| All 24 diseases masterable / all 12 projects completable | Skilled runs end with 24/24 mastered and 12/12 projects (see victory screenshot, `docs/images/screenshots/8-campaign-victory.png`); integration tests REQ-RES-03 and REQ-DIS-*-8 | Met |

Average chapter completion days (30 seeds): skilled 7.5 / 13.6 / 30.3 / 35.1, average 6.6 / 13.6 / 44.0 / 73.4, inefficient 8.1 / 13.8 / 32.1 / 98.9.

### Interpretation
The skilled bot re-plans every 30 game minutes and never misses an opportunity, so a strong human player will likely land later in (or slightly above) the band than the bot's median of 70. The non-skilled bots are deliberately static (no equipment upgrades, no quality training, minimal night staffing) and therefore stall below reputation 90; a human who notices the “Rykte” goal and upgrades/trains can finish. This is documented rather than tuned away, because it is the intended difficulty curve of the final chapter.

## Strategy definitions
| Strategy | Behaviour |
|---|---|
| Skilled | Lean chapter plan, flow-aware room placement, queue-driven capacity, upgrades when financially healthy, quality training with cover staff, night shifts for ER/ward/ICU, research projects + GRP→RP conversion, starts the inspection only when 3-day metrics are healthy |
| Average | Same plan, slower reactions (4 h), random candidate choice, no upgrades, no quality training, night ER only from chapter 4 |
| Inefficient | Overbuilds (pharmacy, extra treatment/waiting/consultation rooms in chapter 2, random extra rooms), over-hires, no break/cleaning rooms, no research conversion; after 5 straight loss days it reacts like a player would (fires surplus staff, demolishes surplus rooms) |

## Balance revisions (parameter, original → new, reason, evidence, effect)
Demand per chapter (10/16/26/38/50), wages, room prices/operating costs, disease revenues/materials, loan terms, grants, research thresholds and project costs are **unchanged** from the specification.

| # | Parameter | Original | New | Reason | Evidence | Effect on campaign |
|---|---|---|---|---|---|---|
| B-01 | Patient satisfaction (not specified) | success 72 + 0.7·(Q−60), failed 30, wait penalty (w−15)/4 ≤ 40 | success **85 + 0.5·(Q−60)**, failed 45, referred 45 (observation 62), abandoned 8, critical 0, wait penalty **(w−25)/6 ≤ 30**, overnight ≤ 15 | With the first curve a well-run hospital (Q ≈ 78, waits ≈ 25 min) saturated at reputation ~84, making the specified reputation-90 goals unreachable | 8-seed runs: 0/8 wins (rep 80–88) → 8/8 wins after change | Reputation 85/90 reachable only with high quality, short waits and ≥ 95 % success |
| B-02 | Success probability from quality (spec: “use seeded randomness”) | (Q−15)/75 | **(Q−10)/72**, clamp 5–98.5 % | Measured average quality of a trained, upgraded hospital ≈ 78 gave 84 % success, below the 85 % inspection floor even for good play | Quality distribution per step at chapter 4 (U 87, B 85, others 73–79, OP 68) | Final inspection's 85 % requires Q ≥ ~71 average |
| B-03 | Walking speed (spec: “approximate”) | patient 3/2/1.5, staff 1.8/1.5 game-min per tile | **1.5/1.0/0.75** and **0.9/0.75** (2× faster, ratios kept) | At the spec speed patients walked ~350 game-minutes per visit in a full hospital and stations sat reserved-but-idle >2× the treatment time, making every chapter after 2 economically impossible | Per-step lead times before/after: consultation patient walk 39 → 26 min; skilled bot 0/8 → 1/8 → later 8/8 wins | Logistics still matter (mission M10, research F03), visual pace ~6 tiles/s at 1× |
| B-04 | Reputation EMA weight per finished case | 0.02 | **0.015** | Smoother reputation (less noise for the inspection) and a skilled median inside the 70–95 band | 16 skilled seeds: median 64 → 70, all ≤ 83 | Reputation goals take a few more days |
| B-05 | Warning/crisis evaluation | cash < 5 / 3 days of fixed costs | **projected** cash (cash + days × (3-day contribution − fixed costs)) < 0 over 5 / 3 days | The spec says “projected cash”; a profitable hospital with 58 k kr and +12 k/day was flagged as crisis | Bot logs at chapter 3 | Crisis now means a real liquidity problem |
| B-06 | Reconstruction | (no limit specified) | one active reconstruction loan; 20-day cooldown | A bot repeated reconstruction 17× as a liquidity pump (an exploit) | First 40-day run | Reconstruction stays an expensive last resort |
| B-07 | Staff per shift | one team per station | **one team per station + 1 reserve team** | Breaks and training otherwise close single-station departments; needed to train the 4 specialists in chapter 3 without closing ER/X-ray | Chapter-3 collapse in an early run (both doctors in training) | More flexible staffing, costs wages |
| B-08 | Chapter 4 “30 advanced treatments” | cumulative | **counted during chapter 4** | Orthopedic cases from chapter 3 completed chapter 4 instantly | chapter 3/4 completing on the same day in 6/8 runs | Chapter 4 now takes several days |
| B-09 | GRP generation start | always | **from chapter 2** (basic research unlock) | Research is a chapter-2 reward | — | No research stockpile in chapter 1 |
| B-10 | Qualifying waiting time | all queued minutes | queued minutes **during scheduled service hours** (night-capable departments only count at night when night-staffed) | Unstaffed night departments otherwise counted 12 h waits and destroyed the metric; player closures still count (no gaming) | Wait averages of 300+ min in early runs | Waiting goals reflect service quality, not opening hours |
| B-11 | Patient flow (design) | — | registration queue stands in line at the desk; next patients are called forward to the soonest-free department door | Desk utilisation was 18 % with 9 people queued because each 8-minute registration needed ~20 minutes of walking | Diagnostics in session log | Throughput without changing treatment times |

Each revision was verified with multi-seed runs before being kept; superseded intermediate values are not listed.

## Economy snapshot (skilled, typical)
Chapter 1 is tight by design (second consultation room + doctor costs ≈ revenue until reputation rises — the tutorial explains this). Chapters 2–3 run at a thin positive margin when the hospital is lean; chapter 4–5 are clearly profitable (≈ +10–45 k kr/day), giving room for upgrades and capacity that the reputation-90 goal requires.

## How to reproduce
```
npm run balance -- 30 skilled,average,inefficient 160   # → reports/balance-*.json
npm run test:stress -- all 20 1000                       # → reports/stress-all.json
```
