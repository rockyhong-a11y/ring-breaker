# Higgsfield arena art generation

Status: blocked by the connected Higgsfield account's generation entitlement on 2026-10-16.

## Requested assets

- `public/assets/hf-arena-floor.webp` — 9:16 orthographic wrestling arena floor, designed to leave the center clear for gameplay.
- `public/assets/hf-block-frame.webp` — 1:1 ornate enemy block frame with a clean center for the existing wrestler face art.

These files were **not created**. No generated image has been substituted, and the renderer must retain its existing art fallback until these files exist.

## Generation result

The connected Higgsfield image service rejected both requested images before job submission with **Requires basic plan or higher.** No image jobs or outputs were created. The application uses its original SD character images and locally drawn ring/material/frame details. Higgsfield art can be integrated when a generation-enabled account is available.

## Prepared prompts

### Arena floor

```text
Create a premium original 2D mobile action game arena background, portrait 9:16. A perfectly orthographic TOP DOWN professional wrestling combat arena floor. The visible rectangular ring covers nearly the entire image edge to edge. Huge central 70 percent is calm clear nearly uniform midnight navy with subtle blue-teal low contrast brushed rubber and woven canvas stitching texture: deliberately EMPTY negative space so bright balls and chibi characters are readable. Very restrained diagonal warm gold spotlight pools. Put intricate theatrical arena detail only in the narrow outer 12 percent border: steel corner turnbuckles with dark gold hardware, stacked taut scarlet and teal wrestling ropes, soft indistinct spectator silhouettes in shadow outside the ropes, recessed LEFT and RIGHT side enemy entrance gates with teal lit metal thresholds. Orange-crimson hazard markings along perimeter and a few small scuffs. Stylized polished hand painted game art with crisp material edge highlights, matching SD chibi wrestling sprites, physically rich but clearly graphic 2D. Full flat floor, no horizon, no perspective angle, no isometric, no UI panel. NO TEXT, NO LETTERS, NO NUMERALS, NO LOGOS, NO CHARACTERS, NO PEOPLE ON FLOOR, NO BALLS, NO ENEMIES, NO HUD. Keep playfield very dark and low contrast.
```

### Block frame

```text
An original SINGLE square enemy block tile FRAME for a premium 2D chibi pro wrestling mobile action game. Top down front facing flat square, image entire canvas is one tile, edge to edge no outside margin. Forged dark gunmetal beveled outer rim, premium hand painted thick polished edge highlights, four compact engraved gold corner brackets with small teal rivets, subtle steel wear and sharp decorative ring-rope grooves. Center 70 percent is an entirely EMPTY clean flat matte midnight blue square reserved for overlaying a separate wrestler face sprite. Border no more than 12 percent thickness on each edge. Bold simple silhouette and chunky corners, legible when reduced to 52 pixels. Brightest highlights at upper left rim, soft black depth shadow inside rim. Palette midnight navy, gunmetal, muted antique gold, tiny turquoise accent. No face, no character, no icon, no text, no letters, no number, no logo, no multiple tiles, no mockup, no 3D perspective. Square tile opaque background.
```

