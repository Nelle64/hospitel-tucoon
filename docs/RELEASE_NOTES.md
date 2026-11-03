# Release notes

## 1.0.0 – first complete release candidate
**Gameplay**
- Five-chapter campaign from a small clinic to a regional hospital, ending with a 7-day final inspection and *Det gyllene stetoskopet*; free play continues after victory.
- 18 buildable room types with automatic furnishing, doors, corridors, land expansion (24→64 tiles), upgrades (3 levels), closure, demolition with refunds and an immediate undo, plus a free blueprint mode with atomic construction.
- 24 diseases (ordinary, absurd, mysterious) with frozen treatment paths, pharmacy and severe ICU branches, emergency arrivals, observation workflow for unknown diseases and controlled referrals.
- 9 staff roles, 12 skills, 12 training courses, day/night shifts with wages and night premium, energy, stress, breaks, overtime handover, cleaning and research work.
- Central ResourceManager with triage-first queues, three queue policies, call-forward and reservation timeouts.
- Economy with transactions, loans, projected-cash warnings, crisis and recovery tools (restructuring, crisis loan, equipment sale, reconstruction).
- Research: disease identification/mastery, 12 technology projects, GRP→RP conversion and focus.
- 12 dynamic mission templates and 12 special events with a pressure director.
- Dashboard (Översikt, Patienter, Personal, Ekonomi; 7/30/90 days) and four map overlays.
- Tutorial (skippable, restartable, reward once).

**Presentation**
- Original deterministic pixel art (270 sprites) and 19 synthesised sound effects; modular characters with disease effects.
- Portrait, touch-first UI in Swedish; reduced motion, high contrast, graphics levels, volume/mute/ambient settings.

**Platform**
- Offline-capable PWA on GitHub Pages; IndexedDB saves with generations, checksum, crash recovery, migrations, export/import; safe update flow; in-game diagnostics.

**Quality**
- 437 unit/integration tests, campaign tests, 51 browser e2e tests (4 viewports), 30-seed balance study per strategy, 20 × 1,000-day stability suite.

**Known limitations** – see `docs/ACCEPTANCE_REPORT.md`.
