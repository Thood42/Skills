# Motion — element entrance and step-through reveal

Every title, list, figure, number and quote enters the slide the same way, everywhere, because
motion is a property of *what an element is* (its role), not of which of the 31 layouts happened to
draw it. You get one dial for the whole deck, an optional override per slide, and — separately — a
way to step through a list point by point while you talk, with a choice of how each point arrives.

This is orthogonal to `ambient` (`references/layouts.md`'s ambient section), which is the slide's
background texture only. Pick both independently: a calm background can sit under expressive
content motion and vice versa.

## The motion dial

```jsonc
{
  "defaults": { "motion": "standard" },   // calm | standard | expressive | off — deck-wide
  "slides": [
    { "layout": "cover", "motion": "expressive", "content": { … } }   // this slide only
  ]
}
```

Omit both and you get `standard` — the built-in default, chosen so a generated deck never needs this
key to look right. Set `defaults.motion` when the WHOLE deck wants a different register; set a
per-slide `motion` only for the one slide that should differ from the rest (a dense data slide inside
an otherwise expressive deck, say). Precedence is `slide.motion → defaults.motion → "standard"` —
one direction, nothing to memorize beyond "the more specific value wins."

| preset | reads as | reach for it when |
|---|---|---|
| `calm` | small movement, quick, decorative loops off | dense/serious/regulatory content, a hospital board, an incident postmortem, anywhere the room shouldn't feel "designed at" |
| `standard` | the house default — present, not showy | the default choice; most decks need nothing here at all |
| `expressive` | bigger movement, longer holds, decorative loops on | a keynote opener, a launch, a moment that wants energy |
| `off` | nothing moves, and nothing is ever hidden | screenshots, a printed handout, an accessibility request, or a presenter who has said motion is a problem |

**`off` is not the old `"ambient":"none"`.** The old value silenced motion by leaving elements
stranded at their hidden entrance state (0% opacity) — the fix this file exists to document. `off`
now resolves every element to its finished, fully visible state, exactly like PDF export already did.
If you're generating for someone who explicitly asked for "no animation" or "as plain as possible,"
set `motion: "off"` — never reach for `ambient: "none"` to mean that; ambient only ever touches the
background layer now (see `references/layouts.md`).

## Stepping through a list (`reveal`)

Ask for this when the user wants to talk through a list one point at a time — a plan, a comparison, a
timeline — rather than have it all land on screen at once.

```jsonc
{
  "defaults": { "reveal": { "style": "appear" } },      // deck-wide default
  "slides": [
    { "layout": "agenda", "reveal": { "style": "spotlight" },   // this slide only
      "content": { "items": [ … ] } }
  ]
}
```

Omit `reveal` (deck-wide and per-slide) for the ordinary case: everything visible at once, no
stepping. Where it *is* set, the slide's list (or, for a layout with no list, its top-level blocks —
kicker, title, body) becomes a sequence advanced with → / Space / click, same navigation the deck
already uses — reaching the end of a slide's steps just moves to the next slide, nothing new to
learn. Precedence matches motion: `slide.reveal → defaults.reveal → none`.

### The five styles — two families

**Withholding** (hide what's next, reveal it on click):

| style | how a point arrives |
|---|---|
| `appear` | the deck's ordinary entrance motion, reused — fades and rises in |
| `wipe` | uncovers left to right |
| `typewriter` | characters land in turn, with a blinking caret on the current line |
| `words` | whole words land in turn — the same idea at coarser, more readable granularity for long lines |

**Focusing** (hide nothing):

| style | how a point arrives |
|---|---|
| `spotlight` | the whole list is on the slide from the start, dimmed; the current point brightens as you advance, the previous one dims back |

Reach for **spotlight** specifically when the room needs to see the *shape* of the whole list while
you talk to one line of it — a 4-quarter roadmap, a short comparison — and for any of the four
withholding styles when you genuinely want the room to see only the current point, nothing ahead of
it (a reveal, a punchline, a number you don't want spoiled).

**`typewriter`/`words` cost more attention per point** than `appear`/`wipe` — they're right for a
handful of short, quotable lines (a thesis statement stepped through one clause at a time), wrong for
a dense 8-item checklist where the audience is reading ahead anyway. Default to `appear` unless the
content specifically wants the slower reveal.

### `motion: "off"` and reveal, together

If a slide (or the deck) is `motion: "off"`, every step is simply present from the start, in all five
styles — stepping is a motion decision, not a content-visibility decision, so turning motion off
never hides content that would otherwise be reachable another way.

## What generates the motion — for context, not for you to author

You never write roles, `data-role`, `--i`, or any CSS by hand. The renderer derives an element's role
from what its layout already declares — a list container (`data-arr`) becomes `list`; a bound field
named `title`/`kicker`/`body`/`quote`/etc. becomes that role; a handful of structural classes (a
chart's wrapper, a stat's number, a rail or pager) become `figure`/`number`/`chrome`. `chrome` — rails,
quote marks, pagers, progress bars, the ambient layer — never entrance-animates, by design. This is
why the guidance above is short: there is nothing to configure per element, only the two deck/slide
knobs (`motion`, `reveal`) documented here.

## Quick picks

- Nothing special asked for → omit both keys. `standard` motion, no stepping. Done.
- "Make it feel big / a launch / a keynote" → `defaults.motion: "expressive"`.
- "Tone it down" / a serious or regulated audience → `defaults.motion: "calm"`, not `ambient: "none"`.
- "No animation at all" / accessibility ask → `defaults.motion: "off"`.
- "I want to click through the plan" → `reveal: { "style": "appear" }` on that slide (or deck-wide).
- "Show the whole roadmap but talk through it one line at a time" → `reveal: { "style": "spotlight" }`.
