# Studio visual language: archive terminal

> Status: proposed, on `feat/ui-archive-terminal`. Nothing in `src/` is affected; this is the studio only.

## What the reference does

The reference is an interactive archive terminal: a pale, physical filing wall receding in perspective,
with interface cards floating in front of it. Its "life" does not come from ornament. It comes from four
things, in order of how much they matter:

1. **A material, not a colour.** Nearly everything is one warm off-white; depth is carried by long, soft
   shadows and by hairlines, not by borders and fills.
2. **Ambient motion.** The field is never still — a slow drift, a breathing light. Nothing snaps.
3. **Editorial typography.** Oversized tabular numerals, tiny uppercase meta rails with wide tracking,
   generous asymmetric margins. The layout reads like a printed catalogue rather than an app.
4. **Floating plates.** Panels are thin cards with a hairline edge, a soft shadow and empty space inside;
   the primary control is a small solid black square.

## What is measured from it

Sampled from `preview.jpg` (96×54, quantised):

| Role       | Measured              | Note                                    |
| ---------- | --------------------- | --------------------------------------- |
| Page       | `#e8e5e1`             | Also the reference's `theme-color` meta |
| Plate      | `#f0ece7` – `#f3efea` | Lighter than the page, not white        |
| Plate edge | `#d0c9c0`             | A hairline, not a border                |
| Recess     | `#ddd7cf`             | Fields and wells                        |
| Ink        | `#171614`             | Near-black, warm                        |
| Ink muted  | `#5c5750`             | Meta rails, captions                    |

Chroma is almost zero (R ≥ G ≥ B by a few points); the warmth is the whole point. No accent colour is
used for structure in the reference — the only saturated thing is the artwork.

## The same four things, in Sigilgen

The studio already has the right skeleton for this: a stage, a rail of concepts, a control panel and an
inspector. The rework is a _reskin plus spacing grammar_, not a re-architecture.

| Reference            | Studio                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| Filing wall          | The stage: the sheet sits on a warm field with a long shadow, and the field drifts |
| Floating card        | Panels: hairline edge, soft shadow, more internal space                            |
| `05 / 08`            | The concept index, oversized and tabular, bottom-left of the stage                 |
| `PERSONAL WORKSPACE` | Section headings: 10–11px, uppercase, tracking `.08em`                             |
| `25:00`              | Zoom readout and any numeral that carries state                                    |
| Solid black button   | Primary actions (reroll, export)                                                   |

## Motion

Ambient motion is the part that has to be designed rather than copied, because a tool and a wallpaper
have different jobs: a wallpaper may be the only thing on screen, a tool must never compete with the
artwork.

- **Ambient:** a 12–20 s drift on the stage field (a few units of parallax, no loop seam), and a 6 s
  breathing on the sheet's shadow. Both are `transform`/`opacity` only, both pause when the tab is hidden.
- **State transitions:** unchanged — the tokens already in `tokens.css` (140/240/420 ms, `--ease-apple`).
- **Reduced motion:** the ambient stops entirely; fades stay. The existing rule — a fade may stay, a move
  may not — already covers it, and `tests/motion.test.ts` guards that every animated component asks.

## Slices, in the order they pay off

1. **Tokens and shell.** Replace the cool grey scale with the measured bone scale, change radii to hairlines
   and plates, add the meta-rail type style. This is the slice that touches `tests/tokens.test.ts`: every
   ink/ground pair has to be re-derived against the new grounds, and the light/dark themes both need it.
2. **Stage.** The field, the long shadow, the oversized concept index, the meta row, the ambient drift.
3. **Panels.** Section rails, hairlines, space; the disclosure and segmented controls keep their behaviour.
4. **Strip and inspector.** Thumbnails as plates; the inspector's rows become a spec sheet.

Slices 1 and 2 are the ones that change how the app _feels_; 3 and 4 are consequence. Nothing here changes
the library, the brain, or the determinism contract.
