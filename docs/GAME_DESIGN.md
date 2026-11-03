# Pixel Hospital – game design

Hospital tycoon for iPhone (portrait PWA). The player is the hospital director: builds rooms and corridors, hires, places and trains staff, sets priorities, researches, takes loans and handles special events. Patients and staff act autonomously; the player never drags patients around. All player-facing text is Swedish.

## Core loop
1. Patients arrive (daytime arrival blocks; night emergencies from chapter 3 when an emergency room exists).
2. They register at the reception desk (queue in line at the desk), wait in waiting rooms, are called forward to the department door and treated step by step along a frozen treatment path.
3. Every booking (patient + station + qualified on-shift staff team) goes through the ResourceManager. Triage 5 is always served first.
4. On completing the path the outcome is rolled from the case's average quality; revenue is settled exactly once; the patient walks out.
5. Money, reputation, research points and metrics feed chapter goals, missions and the final inspection.

## Time
1 game day = 1,440 min = 2,400 ticks of 0.6 min. 240 real seconds per day at 1× (10 ticks/s), 2× and 4× available, pause. Day shift 08–20, night shift 20–08. The game opens at 08:00 on day 1. Loaded games always resume paused; backgrounding pauses and saves; no catch-up simulation.

## Content (locked scope – all implemented)
| Content | Count | Source |
|---|---|---|
| Room types | 18 | `src/data/rooms.ts` (costs/staffing/capacity per spec) |
| Diseases | 24 (8 ordinary, 10 absurd, 6 mysterious) | `src/data/diseases.ts` |
| Staff roles / skills / trainings | 9 / 12 / 12 | `src/data/staff.ts` |
| Research projects | 12 (3,580 GRP) | `src/data/progression.ts` |
| Mission / event templates | 12 / 12 | `src/data/progression.ts` |
| Campaign chapters | 5 + 7-day final inspection | `src/data/progression.ts` |

## Rules worth knowing (design decisions within the specification)
- **Map**: 64×64 tiles of 32 px, one floor. Start land 24×24, expansions 32/48/64 (12k/30k/65k kr, chapters 2/3/5). Walls are edges between tiles; rooms connect only via one door to a corridor; patients never cut through other rooms.
- **Furnishing**: every room is furnished automatically from deterministic station modules (wall opposite the door filled first, fallbacks for awkward doors). Bigger rooms get more stations (clinical rooms up to 2, wards up to 9 beds, ICU up to 6).
- **Staffing**: one team per station (beds: one team per 3 ward beds / 2 ICU beds) plus one reserve team per shift for breaks and training. Specialists may fill doctor slots. Orthopedics (SK07 ≥ 25), surgery (SK08 ≥ 25) and ICU (SK09 ≥ 20) have skill requirements.
- **Night service**: night-capable departments (blood sampling, lab, X-ray, ER, pharmacy, surgery, ward, ICU, cleaning, waiting/break rooms) count as open at night only if the hospital staffs a night shift there. Day-only departments (reception, consultation, treatment, orthopedics, research, experimental care, robot clinic) close at 20:00; waiting patients stay overnight (patience decays at 20 %). Off-going staff finish active treatments (overtime, paid 1.5× pro rata); ward/ICU staff stay until the beds are covered.
- **Waiting time metric** (“qualifying waiting time”): minutes spent queued while the target department is within its scheduled service hours. Overnight waiting for day-only departments is excluded from the metric but lowers satisfaction. Closing rooms does not change the schedule, so closing the hospital cannot improve the metric.
- **Outcomes**: success probability `clamp((Q − 10)/72, 5 %, 98.5 %)` from the average quality of the clinical steps. Revenue on success = base × quality factor (0.85–1.20) × research factor (1.00–1.15); failed care 35 %; referral after assessment max(100 kr, 10 %); abandonment 0. Material is charged when each step starts (split deterministically by step weight; sums exactly to the disease's material cost).
- **Reputation**: moves 1.5 % per finished case towards that patient's satisfaction (success 85 + (Q−60)/2, failed 45, referred 45/62, abandoned 8, critical 0, minus waiting and overnight penalties). Missions and events can add or remove reputation.
- **Unknown diseases** follow an observation workflow (assessment + available diagnostics, then referral with +8 RP) until identified. Patients whose department does not exist are referred, never queued forever.
- **Research**: disease RP (first observation +20 once, assessment +5, lab/X-ray +10, success +12, failed +4, observation referral +8) and generic GRP (from chapter 2: success +1/+3, analysis +2, identified +15, mastered +25, research lab 2/h × skill). 1 GRP → 2 RP, max 100 GRP per disease per day; optional focus converts half of the day's GRP automatically. Projects take 6–24 game hours.
- **Economy**: integer kronor, every change is a transaction. Room operation accrues per tick and posts hourly; wages are charged per shift at shift start (pro rata when hired mid-shift); loans have fixed fees with exact installment sums; warning/crisis use *projected* cash (cash + 3- or 5-day expected contribution − fixed costs), recovery means cash < 0 or overdue debt. Recovery actions: closing rooms, firing, selling equipment (50 % of the last upgrade), loan restructuring (+10 days, +3 %), crisis loan, and – once per 20 days – reconstruction (debts consolidated + liquidity loan to 20,000 kr, 20 % fee, −15 reputation; chapters and research kept).
- **Campaign**: chapter goals as specified; “30 advanced treatments” in chapter 4 counts treatments during chapter 4. The final inspection needs all chapter-5 prerequisites, then seven complete consecutive days (≥ 20 completed cases daily, ≥ 85 % success, average wait < 35 min, positive result, no overdue debt, reputation ≥ 90 at the end). Failing keeps all progress. Victory awards *Det gyllene stetoskopet* and play can continue.
- **Missions**: at most three, generated daily from real metrics with frozen targets, cooldowns, no duplicates per metric/department, cancelled when impossible. **Events**: ~1 minor per day and a major every 3–5 days, none in the two tutorial days, the pressure director (P = 0.35 queue + 0.30 economy + 0.20 staff + 0.15 events) postpones negative majors at P ≥ 70 and allows only positive/neutral at P ≥ 85.

## Controls (portrait, touch)
Top HUD (cash, reputation, day/time, chapter progress, today's result, crisis badge) · map (≥ 55 % of the screen) · time bar (pause/1×/2×/4×, map overlay, settings) · bottom navigation **Bygg / Personal / Analys / Uppdrag**. One finger pans (normal mode) or draws a rectangle (build mode); two fingers always pan/zoom; tap selects; long-press opens details; double-tap zooms. Building is only ever executed by the explicit **Bygg** button; corner handles resize; tapping the outline moves the door.

## Balance
See `docs/BALANCE_REPORT.md` for every deviation from the specification's baseline values, with simulation evidence.
