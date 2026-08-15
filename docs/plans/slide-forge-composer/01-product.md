# Product: slide-forge quality & composition upgrade

## Problem

"Every deck slide-forge makes looks like it came off the same rack. I pick from 29 fixed
layouts, and each slide is exactly that layout — if my idea doesn't match one of the 29 shapes,
I either force it into the wrong shape or drop to hand-written HTML. When I add a component to
an existing slide in the editor, it lands as a floating box on top of the slide instead of
joining it, so it never looks designed-in — it looks pasted on. And two decks made with the
same theme are near-identical twins; making a deck that feels *custom* takes more fighting than
the tool should require."

## Success metric

**The rack test:** take 10 slides from real-world presentations (conference talks, board decks,
product launches — slides slide-forge did not make). Rebuild each with slide-forge. Today,
roughly half force a compromise or a hand-written escape-hatch slide. Success = **at least 8 of
10 rebuild faithfully with no escape hatch and no compromise the presenter would notice** —
measured by actually doing the exercise before and after.

Secondary: adding a component to an existing slide produces something you'd keep (integrated,
sized, themed) rather than something you have to rescue — checked the same way, with 10 add-a-
component tasks on existing decks.

## Announcement — the blog post before the feature

Slide decks from slide-forge no longer come off a rack. Every slide is now *composed* — a
title band here, two columns there, a stat row under a chart, a quote beside an image — in any
arrangement, and the 29 classic layouts are still there as one-click starting points rather
than fixed molds. When you add a component to a slide, it joins the slide: it takes its place
in the arrangement, matches the theme, and rewraps its neighbors, instead of floating on top.
Change your mind about a slide's arrangement and your content follows — switch a comparison
into a before/after and nothing retypes. And each deck now carries its own design personality —
type scale, spacing, alignment, decorative accents — layered over the color theme, so two decks
with the same palette still feel like they were designed, not generated. Same single file, same
no-install editor, noticeably more yours.

## Capabilities (proposed scope — confirm which are in)

1. **Compose-a-slide.** A slide is an arrangement of sections (title band, columns, stat row,
   media, quote, list, chart…) rather than one monolithic layout. Any mix is first-class — at
   generation time and in the editor. The existing 29 layouts become presets of this system, so
   nothing already made breaks and nobody loses the one-click path.
2. **Integrated insert.** Adding a component to an existing slide slots it *into the slide's
   arrangement* — placed, spaced, sized, and themed like it was born there. Neighbors make room.
   Floating placement remains available as a deliberate choice, not the only outcome.
3. **Rearrange & switch with content carry-over.** Reorder sections on a slide by dragging;
   switch a slide's arrangement (or apply a different preset) and the content re-maps instead
   of retyping. "This should be two columns, not stacked" is one action.
4. **Deck personality ("design DNA").** At generation, a deck gets a visual personality —
   type scale and pairing behavior, spacing density, alignment posture, decorative motif
   (rules/orbs/frames/none), corner and edge treatments — independent of the color theme.
   Pickable and switchable like themes are today. Two decks, same theme, different character.
5. **Slide preset gallery.** The editor's insert gallery grows from elements to whole slide
   designs: browse full slide arrangements (including composed ones beyond the classic 29),
   preview with your own theme/personality, insert and fill in.
**Scope confirmed 2026-08-15:** capabilities 1–5 are IN (composition core, deck personality,
slide preset gallery). The standalone "friendliness pass" (guided empty states, naming sweep)
is deferred — except where it falls out of the above naturally (e.g. the compose/insert
actions must be discoverable to be usable at all).

Explicitly out of scope this round: collaboration, PPTX round-trip, AI image generation,
anything requiring a server. The single-file, no-install guarantee stays.

## Screens

Mockups to produce in `./mockups/` once scope is confirmed (one plain HTML file per screen):

- `composed-slide.html` — a slide no current layout can make (e.g. title band + chart with a
  stat row beneath + a side quote), to prove the composition vocabulary.
- `insert-flow.html` — before/after of adding a stat row to an existing media slide: it joins
  the arrangement instead of floating.
- `personality.html` — the same slide content under two personalities, same color theme.
- `preset-gallery.html` — the grown insert gallery showing whole-slide presets.
