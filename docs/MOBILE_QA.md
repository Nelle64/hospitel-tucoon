# Mobile QA

## Automated (emulated) – done
Playwright runs the **production build** in Chromium with iPhone touch emulation (`isMobile`, `hasTouch`, DPR 2) at four portrait sizes: **320×568, 375×667, 390×844, 430×932** (`tests/e2e`, results in `reports/playwright.json`).

| Check | Spec | Result |
|---|---|---|
| Map uses ≥ 55 % of the viewport height | `mobile.spec.ts` REQ-UX-01 | pass on all 4 sizes |
| No horizontal page overflow | REQ-UX-01 | pass on all 4 sizes |
| Every button ≥ 40 px in both directions (44 px design target) | REQ-UX-01 | pass on all 4 sizes |
| No visible text below 11 px | REQ-UX-01 | pass on all 4 sizes |
| Safe-area insets applied (`env(safe-area-inset-*)` on HUD, nav, sheets) | REQ-UX-01 + CSS | pass (notch geometry itself cannot be emulated in Chromium) |
| Bottom sheets for Bygg/Personal/Analys/Uppdrag open, close and stay inside the screen | REQ-UX-02 | pass on all 4 sizes |
| One-finger pan, two-finger pinch zoom, tap selection | `touch.spec.ts` REQ-TOUCH-01 | pass on all 4 sizes |
| Build drag preview; two-finger gesture in build mode never draws; explicit confirm builds and charges the exact price | REQ-TOUCH-02 | pass on all 4 sizes |
| Invalid placement shows a Swedish error, confirm disabled | REQ-TOUCH-03 | pass |
| Blueprint planning free, then atomic build | REQ-TOUCH-04 | pass |
| Hiring + placing staff through the UI | REQ-TOUCH-05 | pass |
| Save, reload, “Fortsätt” resumes paused | `persistence.spec.ts` | pass (390×844) |
| Export save file, reject invalid file, import exported file | persistence | pass (390×844) |
| Offline restart after first visit (service worker cache) | persistence REQ-PWA-01 | pass (390×844) |
| Background → pause + save; foreground → no elapsed-time simulation; no audio before first tap | persistence REQ-LIFE-01 | pass (390×844) |

Emulation is not a physical iPhone test. Safari/WebKit specifics (home-screen install prompt, audio unlock behaviour, Files app import/export, real notch) still need the owner's check below.

## Physical iPhone check (owner, ~10 minutes) – pending
1. Open **https://nelle64.github.io/hospitel-tucoon/** in Safari (after the Pages deploy is live).
2. Tap **Dela** (square with arrow) → **Lägg till på hemskärmen** → **Lägg till**. Open *Pixel Hospital* from the home screen.
3. Tap **Nytt spel**. Check that the top bar (pengar, rykte, dag/tid) is not hidden behind the notch and the bottom menu is above the home indicator.
4. Wait for the first patient to walk in through the entrance at the bottom. Tap the patient → a small info card appears. Tap a room → room card.
5. Drag with one finger to move the map, pinch with two fingers to zoom.
6. Tap **Bygg → Mottagningsrum**, then tap on green grass next to a corridor. A transparent room appears with price and errors/✓. Tap **Bygg**. Money decreases.
7. Tap **Personal → Rekrytera**, hire a **Läkare** and choose the new consultation room.
8. Tap the **4× (▶▶▶)** button and watch for half a minute; tap a speed button to hear a click (sound starts only after a tap).
9. Open **Analys** and **Uppdrag** and scroll through the tabs.
10. Tap the **kugghjulet → Spara nu**, close the app completely (swipe it away) and open it again → **Fortsätt** should continue paused at the same time.
11. **Kugghjulet → Exportera sparfil** → save to *Filer*. Then **Importera sparfil** and choose that file → preview → **Importera**.
12. Turn on **Flygplansläge**, close and reopen the app → it should still start and continue.

Report anything odd (with a screenshot if possible). Until this is done, the release status stays **TEKNISKT KLART – INVÄNTAR IPHONE-TEST** at best.
