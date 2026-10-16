# SD wrestler assets (v2)

The SD roster reuses the same characters as the user's reference games, [SLAY](https://rockyhong-a11y.github.io/slay/) and [SLAY Beach Volley](https://rockyhong-a11y.github.io/slay-beach-volley/). No unrelated generated wrestler art replaces those characters.

## Provenance and license

- Original SD character sheets: `rockyhong-a11y/slay`, commit `7a1bfbe261862f7c6a44981faf6ae9fb63eddb8c`, `public/assets/sd2d/{character}.png`.
- Optimized sprite sheets and face portraits: `rockyhong-a11y/slay-beach-volley`, commit `5ffed009aa658bf8ac86e25157b5637c0a42f346`, `assets/sprites/{character}.webp` and `assets/portraits/{character}.webp`.
- License: MIT, Copyright (c) 2026 Rocky Hong. The full notice is included at `public/assets/sd-LICENSE.txt`.
- Each copied source WEBP SHA-256 was verified against the upstream `src/sprites.json`. The source sheets and upstream crop metadata remain at `public/assets/sd-source/`.
- The image generation skill was consulted. No new image-generation prompt or paid image-generation call was needed: the references contain the exact suitable SD characters. Processing only crops the existing neutral sprite frame, preserves its alpha/colors, resizes it, and packs it for the game engine.

## Runtime files

| File | Dimensions | Use |
| --- | --- | --- |
| `public/assets/sd-roster.png` | 1536 × 1024 RGBA | Six full-body neutral poses, 3 columns × 2 rows |
| `public/assets/sd-roster.json` | JSON | Frame order, source rectangles, body bounds, fallback head crops, provenance |
| `public/assets/sd-nova.png` | 213 × 312 RGBA | Standalone neutral NOVA for the lobby/UI |
| `public/assets/sd-face-{name}.webp` | 144 × 144 RGBA | Exact existing face portraits for ordinary wrestler blocks |

Available face names: `nova`, `raven`, `valkyrie`, `viper`, `ember`, `atlas`, `onyx`.

The sprite atlas uses 512 × 512 cells. In row-major order: frame 0 NOVA (player), 1 RAVEN, 2 VALKYRIE, 3 VIPER, 4 ATLAS (miniboss), 5 ONYX (champion). Every neutral body is centered horizontally, 448 pixels tall, and placed at frame-local y = 32. The 32-pixel top/bottom margins prevent neighboring frames from bleeding into one another. The game should render normal blocks from the dedicated face files and elites/bosses from the full-body atlas.

## Technical packaging

The optimized upstream sprite sheets are all 888 × 444 pixels and contain neutral, attack, and hurt poses. Upstream metadata uses original 1774 × 887 pixel coordinates. Neutral pose coordinates were mapped using `888 / 1774`, rounding crop starts down and ends up. No painted facial features, outfits, colors, anatomy, or expressions were changed.

The full-body neutral pose is resized to height 448 with Lanczos resampling and alpha-composited at `cellX + (512 - width) / 2, cellY + 32` on a transparent 1536 × 1024 sheet. Standalone NOVA is saved at its original optimized neutral-pose crop resolution. Portrait WEBPs are copied byte-for-byte from the reference game.

The atlas and seven source sheets were visually inspected. Alpha, dimensions, cell separation, neutral poses, and source file hashes were checked. Runtime sizing and mobile rendering are validated separately with the complete game.
