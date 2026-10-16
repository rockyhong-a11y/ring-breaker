# Image assets

Created on 2026-10-16 with the built-in `image_gen.imagegen` tool, using the installed imagegen skill in default built-in tool mode. These are original game illustrations; no real wrestler, logo, or licensed game artwork was used as reference. Generated PNGs were copied into this workspace and resized with macOS `sips` for web use. The alpha channel on the wrestler is preserved.

| File | Dimensions | Role |
| --- | --- | --- |
| `public/assets/wrestler.png` | 512 × 768 | Original masked luchador cutout with warm translucent rim glow; RGBA with transparent corners |
| `public/assets/arena-poster.png` | 1200 × 800 | Opaque 2D pixel-art arena backdrop |

Both assets were visually inspected. The wrestler includes the full body and both boots, with no visible text or brand marks. The arena includes the complete ring, mint ropes, orange turnbuckles, crowd and spotlights, with no visible text. No image-generation API key or fallback CLI was used.

## Wrestler final prompt

```text
Use case: stylized-concept
Asset type: transparent full-body 2D arcade game character cutout for RING BREAKER, a portrait mobile Arkanoid roguelite with a pro-wrestling theme.
Primary request: an original powerful muscular masked luchador wrestler, warm orange and red mask with small angular gold accents, black wrestling trunks and black boots with gold trim, red and orange wrist wraps, no cape.
Subject: one adult male luchador, heroic broad shoulders and athletic build, clenched fists, confident strong fighting stance, facing slightly left in a three-quarter view.
Style/medium: polished hand-drawn 2D arcade sprite with crisp dark outlines, subtle chunky pixel-art shading, expressive comic-book anatomy and limited color bands, high readability at small game UI sizes.
Composition/framing: entire body including both boots completely visible, character centered, clean silhouette, generous transparent margin around the character.
Lighting/mood: warm golden rim lighting, confident energetic arcade hero.
Color palette: orange, vermilion red, warm gold and near-black, bright contrast for a navy interface.
Constraints: actual transparent background with alpha; no background scene, no floor, no rectangle, no text, no logos, no brand, no real wrestler or celebrity likeness, no watermark. A single character only, not a sprite sheet.
```

Built-in options: `transparent_background: true`. No image references.

## Arena final prompt

```text
Use case: stylized-concept
Asset type: production background artwork for RING BREAKER, a portrait mobile pro-wrestling Arkanoid roguelite.
Primary request: an exciting underground pro-wrestling arena rendered in beautiful crisp 2D pixel art.
Scene/backdrop: a wrestling ring centered in the lower middle, viewed from a slightly elevated dramatic ringside angle; dark navy crowd silhouettes around the ring, three mint-blue ring ropes, four sturdy dark ring posts with warm orange turnbuckle pads, steel truss rigs and bright crossing spotlights above.
Style/medium: polished 16-bit arcade pixel art, deliberate clean pixel clusters, atmospheric but readable, sophisticated limited palette.
Composition/framing: wide landscape artwork with the entire wrestling ring visible, symmetric cinematic composition, ring taking roughly half of frame width, crowd and light beams filling the background; no characters in the ring.
Lighting/mood: moody deep navy arena illuminated by icy mint and electric blue spotlights, tiny warm amber highlights and cheering audience silhouettes, energetic wrestling night atmosphere.
Color palette: very dark navy and indigo base, neon mint and blue, restrained orange accents.
Constraints: no text, no letters, no numbers, no logos, no signs, no brands, no watermark, no UI frame. Original environment. This is a single finished arena illustration, not a sprite sheet.
```

Built-in options: `transparent_background: false`. No image references.

