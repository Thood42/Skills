# Deck personality — the second design axis

A **theme** picks the deck's colours. A **personality** picks its character:
type scale, spacing density, corner treatment, and the decorative motif. They
are independent, so two decks on the same palette still read as two decks
rather than twins.

Set it once, at the deck level:

```json
{ "meta": {"title":"…"}, "personality": "editorial", "slides": [ … ] }
```

Omit the key for the default look. There is no per-slide personality — it is a
property of the deck, the way a magazine's art direction is a property of the
magazine.

## The two personalities

### `editorial` — a magazine feature

Serif display (Fraunces over Spectral), tight tracking, generous margins,
near-square corners, no screen texture, and a hairline rule under every title
band. The kicker becomes lowercase italic rather than spaced small caps.

Reach for it when the deck is meant to be **read and considered**: a strategy
memo, a research readout, a board narrative, anything with real prose in it.
It is the wrong choice for a slide wall of numbers — the serif and the air both
work against density.

### `blueprint` — a technical drawing

Archivo over IBM Plex Sans, square corners everywhere, tight 56/68 margins, a
visible grid texture, and corner ticks on every panel. Denser than the default
in both spacing and type.

Reach for it when the deck is **engineering-facing**: architecture reviews,
incident write-ups, roadmaps, anything where the audience expects a schematic
rather than a brochure. Avoid it for an external pitch — the grid reads as
"internal document".

### The default (no `personality` key)

The house look: Sora/IBM Plex Sans, 16px corners, a soft dot-grid texture,
70/88 margins. Neutral and safe. If nothing about the deck argues for one of
the two above, leave the key off.

## What a personality controls, and what it does not

| owned by the **personality** | owned by the **theme** |
|---|---|
| font pairing (display / body / mono) | every colour: background, ink, accents |
| type scale and letter-spacing | the accent that charts and rails inherit |
| slide padding and the gap between sections | the stage colour behind the slide |
| corner radius | |
| the dot-grid / orb texture strength | |
| decorative motif (rules, corner ticks) | |

Precedence, when all three are set: **theme → personality → brand kit.** The
theme's fonts are laid down first, a personality overrides them, and a brand
kit's fonts override both — a brand is the most specific instruction in the
room. Colour is never touched by a personality at any point.

## Fonts and the offline contract

Each personality names a Google Font pairing, added to the deck's font `<link>`
at generation time exactly the way a theme's fonts are. Switching personality
*in the editor* on a machine with no network falls back to the local stack
(DejaVu / system UI) — the same degradation themes have always had. Images,
diagrams and every other part of the deck stay fully offline.

## Picking one

Pick the personality in the same breath as the theme, from what the deck is
*for*:

- prose-heavy, external, meant to persuade → **editorial**
- schematic, internal, meant to inform → **blueprint**
- mixed, or you are unsure → **leave it off**

"Unsure" is a real answer. The default is designed to be the safe choice, and a
personality applied to a deck that does not want one is more conspicuous than
no personality at all.
