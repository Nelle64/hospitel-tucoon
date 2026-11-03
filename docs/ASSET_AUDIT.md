# Asset audit

All graphics and sounds are **original and generated deterministically** by code in `tools/generate-assets/` at build time (`npm run assets`, also run in CI). No third-party sprite packs, fonts-as-art, emoji characters or remote image/audio generation are used, and nothing is fetched at runtime from outside the app.

## Pipeline
| Step | File | Output |
|---|---|---|
| Palette / art bible | `palette.ts` | ~40 coordinated colours, 4 skin tones, 6 hair colours, department accents; light from the upper left |
| Pixel canvas | `canvas.ts` | RGBA buffer with rect/bevel/line/ellipse(shaded)/outline/drop-shadow helpers, seeded noise |
| Tiles & walls | `generate-tiles.ts` | 32×32 grass (4 + locked), fence, corridor (2), entrance, 18 department floors, wall/door pieces for all four sides, blueprint overlay |
| Furniture | `generate-furniture.ts` | 67 pieces in 3/4 top-down view (1×1 to 2×2 tiles) with outlines, front faces and shading |
| Characters | `generate-characters.ts` | 24×32 frames; 29-frame strips = 4 directions × (4 walk + 2 work + 1 sit) + lying pose; layers: 4 skins, 15 outfits (9 role uniforms + 6 patient outfits), 6 hair styles × 6 colours, 6 accessories |
| Effects & UI | `generate-effects.ts` | 24 disease effects, blanket, shadow, selection ring, 4-frame dust and sparkle, steam, 10 status symbols, 29 UI icons, 18 room icons, 9 role icons, app icon |
| Atlases | `build-atlas.ts` | deterministic shelf packer → Phaser JSON-hash atlases |
| Audio | `generate-audio.ts` | 19 synthesised 16-bit mono WAV effects (square/triangle/sine/saw/noise oscillators with envelopes) |
| Orchestration + validation | `index.ts` | writes `public/assets/*`, `public/icons/*`, `ui-icons.css`, `manifest.json`, docs previews; exits non-zero on any validation error |

## Inventory (current build)
| Atlas | Size | Frames |
|---|---|---|
| `atlas-tiles.png` | 512×80 | 36 |
| `atlas-furniture.png` | 1020×132 | 67 |
| `atlas-chars.png` | 1396×1052 | 61 layer strips (29 frames each) |
| `atlas-fx.png` | 504×120 | 106 |

Total generated assets ≈ 770 KB (`public/assets`) + 20 KB icons; whole production build ≈ 2.4 MB including the Phaser bundle.

Sounds: `ui_click, build_ok, build_fail, upgrade, treat_done, cash, research, mission, milestone, victory, econ_warn, emergency, monitor_beep, xray_hum, door, teleport, hiccup, glitch, sneeze` – each with priority and category (ui, feedback, warning, ambient, disease) in `manifest.json`.

## Automatic validation (runs on every build/CI)
- every PNG is re-decoded after encoding (corruption check) and its size compared;
- every frame lies inside its atlas and contains opaque pixels (no empty sprites);
- every furniture sprite referenced by the 18 room layouts and decorations exists **and** matches the footprint used by the layout geometry;
- a floor tile and a build-menu icon exist for every room type;
- all character strips have the identical 29-frame layout;
- the generated service worker contains no unreplaced placeholders (build fails otherwise).

## Requirement coverage
| Requirement | Evidence |
|---|---|
| 32×32 terrain tiles; ~24×32 characters; 4 directions × 4 walk frames | `generate-tiles.ts`, `generate-characters.ts`, `docs/images/characters-preview.png` |
| Medical work, resting (sitting), lying animations | work frames 4–5, sit frame 6, lying frame 28; used by `src/render/scene.ts` |
| Modular characters, deterministic from saved visual seed | `src/render/appearance.ts` (`patientAppearance`, `staffAppearance`) composes layers at runtime |
| ≥ 12 patient appearance combinations | 4 skins × 6 outfits × 36 hair variants (+ glasses) = 864 combinations |
| All 9 professions visually distinct | distinct uniform colour + details (coat, stethoscope, tie, badge, straps) + accessories (headset, nurse cap, goggles, scrub cap + mask, glasses); role icons |
| ≥ 10 absurd/mysterious diseases with distinct visible effects | all 16 absurd/mysterious diseases have their own icon; 5 mysterious diseases add body effects: transparency (D20), floating (D21), teleport flicker (D19), time-ghost (D22), clones (D23), glitch jitter (D24) |
| All 18 room types have recognisable room-specific equipment | `LAYOUT_MODULES` + `LAYOUT_DECOR` in `src/systems/layout.ts`; room acceptance test REQ-ROOM-*-3 checks each built room contains its own module sprites |
| Building, research and mission effects | dust/sparkle frames in `atlas-fx`, mission/research sounds |
| No colored rectangles as final room art; no emoji characters | rooms render generated floors, walls, doors and furniture; characters are pixel sprites |
| Asset gallery / atlas overview | `docs/images/atlas-overview.png`, `docs/images/characters-preview.png`; full sheets in the build under `assets/` |
| Screenshots from the running game (not illustrations) | `docs/images/screenshots/*.png` produced by `tests/e2e/visual.spec.ts` |

## Visual review notes (honest limitations)
- Reviewed screenshots at 390×844 (DPR 2): consistent outline weight, palette and lighting; furniture and characters read clearly at the default zoom.
- Characters are simple 24×32 figures; faces are 2–3 pixels. They are readable but less detailed than hand-drawn commercial pixel art.
- Walls are drawn as thin edge pieces with a short north face; there is no full 3/4 wall height, so rooms read as floor plans with furniture.
- Department floors are distinguishable by colour and pattern; with the high-contrast setting the UI changes, the map art does not.
- Physical-device colour/legibility has not been checked on a real iPhone yet (see `docs/MOBILE_QA.md`).
