# Layout catalog — content schemas

Every slide in a deck is an object: `{ "layout": <name>, "content": {…}, "theme"?: {…}, "ambient"?: "auto"|"none", "class"?: "…" }`.
The renderer derives the pager and progress bar from position, so you never number slides by hand. This file is the field reference; `reference-deck.html` is the live visual of each one.

Conventions used below:
- Strings in `subtitle`, `label`, `caption`, `lead`, `body` accept light inline emphasis: `[[glow]]` (accent color), `**bold**`, `` `mono` ``.
- `count` (a number) makes a value count up on slide-enter; add `"fmt":"compact"` to abbreviate big numbers (`175000000000` → `175B`).
- `icon` / `iconAsset` resolve a file from `assets/icons/` by name; add `"color":"--mint"` (a theme token) or a literal color to recolor it.
- `image` resolves a file from `assets/images/` by name; `svg` (on the `diagram` layout) resolves a file from `assets/diagrams/` by name. Both are inlined by `scripts/assets.py`.
- `fit` (`cover`|`contain`|`fill`, default `cover`) and `focal` (`[x,y]`, each 0–1, default `[0.5,0.5]`) control how an image fills its frame — same vocabulary as CSS `object-fit`/`object-position`. `frame` (`none`|`panel`|`glow`|`shadow`) adds a presentation treatment.
- Alt text lives on the **asset**, not per-slide content — set it once in the editor's Asset library (🖼 Assets) or via `assets.py`'s registry, and every slide that uses that image inherits it.
- A missing or unreachable image/diagram never renders blank: it falls back to a small "Content unavailable" card naming what's missing (media plan §5.1/§7.1).

## Contents
**Compose your own:** [composed](#composed) — build a slide out of sections instead of picking a fixed shape.
Original: [cover](#cover) · [agenda](#agenda) · [divider](#divider) · [stat-grid](#stat-grid) · [bignum](#bignum) · [chart](#chart) · [comparison](#comparison) · [quote](#quote) · [code](#code) · [timeline](#timeline) · [pipeline](#pipeline) · [closing](#closing)
New: [manifesto](#manifesto) · [editorial](#editorial) · [hero-asym](#hero-asym) · [figure](#figure) · [metric-dash](#metric-dash) · [leaderboard](#leaderboard) · [diptych](#diptych) · [matrix](#matrix) · [stack](#stack) · [quote-mosaic](#quote-mosaic) · [index-mosaic](#index-mosaic) · [before-after](#before-after)
Media (2026-07-31): [image](#image) · [media-split](#media-split) · [gallery](#gallery) · [diagram](#diagram) · [embed](#embed)
Escape hatch: [raw](#raw)

---

## composed

**Reach for this when no single layout is the right shape.** A composed slide is
an arrangement of *sections* — a title band here, a stat row under a chart, a
quote beside an image — in any order you like. It is not a fallback: it is the
normal way to build a slide whose idea doesn't happen to match one of the fixed
shapes. Before dropping to `raw`, compose.

```json
{ "layout":"composed", "content":{ "sections":[
  {"type":"titleband", "content":{"kicker":"Where we are","title":"The year in three numbers"}},
  {"type":"row", "size":1, "items":[
    {"type":"stats", "size":2, "content":{"stats":[
      {"count":84,"unit":"%","label":"of tickets auto-resolved"},
      {"value":"3.1x","label":"faster first response"}]}},
    {"type":"quote", "size":1, "content":{"quote":"It stopped feeling like a queue.","by":"Support lead"}}
  ]}
]}}
```

**The shape.** `content.sections` is an array. Each entry is either

- a **section** — `{"type":<name>, "size"?:<number>, "content":{…}}` — or
- a **row** — `{"type":"row", "size"?:<number>, "items":[<section>, …]}`

Rows are the only nesting: **a row cannot contain a row.** That ceiling is
deliberate. If you want a third level, you almost always want a second slide.

**`size` is a weight, not a height.** Down the slide it distributes the
*leftover* room, so a section without a `size` is exactly as tall as its own
content and one with `size:2` takes twice the surplus of one with `size:1`.
Across a row it reads as a literal proportion: `size:2` beside `size:1` really
is two-thirds of the row. Rule of thumb: **give the stretchy thing a size and
leave the rigid things alone** — put `size` on the chart, the table, the
timeline or the picture, and let a stat row or a title band take its natural
height. A slide that asks for more than fits will compress the elastic sections
first and never squeeze a stat card off the bottom.

### Section types

Each keeps the field names of the layout it came from, so anything you already
know transfers. A section only ever owns *its* fields — a `stats` section has no
`title`, because a `titleband` above it owns that.

| type | fields | it is |
|---|---|---|
| `titleband` | `kicker`, `title` | the kicker + title every headed layout opens with |
| `stats` | `stats:[{value\|count, unit, label, fmt}]` | the stat-grid card row |
| `bignum` | `value` \| `count` (+`fmt`), `subtitle` | one hero figure (no kicker — put a titleband above it) |
| `chart` | `kicker`, `title`, `note`, `type`, `data`, `options` | a chart **with its own head** — don't add a titleband |
| `table` | `columns`, `rows`, `options`, `note` | the table block |
| `comparison` | `left`, `right`, `badge` | two columns + the VS rail |
| `quote` | `quote`, `by`, `subtitle` | a pull quote |
| `agenda` | `items:[{title, desc}]` | the numbered two-column roadmap |
| `timeline` | `items:[{year, title, desc, now}]` | the horizontal track |
| `prose` | `lead`, `columns:[{head, body}]` | editorial lead + rule-lined columns |
| `media` | `image`, `fit`, `focal` | a picture (the media-split image half) |
| `bullets` | `kicker`, `title`, `body`, `items:[…]` | prose + bullets (the media-split text half) |

Two of these come with their own heading and should **not** get a `titleband`
above them: `chart` (its `note` sits on the title's baseline) and `bullets`.

**One line of body text** — a caption, a closing thought under a comparison — is
a `bullets` section with only `body` and no `items`. Don't reach for `prose`:
its lead is 46px display type sized to carry a whole editorial slide, and it
will dominate whatever it sits under.

### Which layout, which composition

Ten classic layouts are literally compositions of these sections — the classic
name is just the shorter way to write a common arrangement. Use the classic when
it fits exactly; compose when it doesn't.

| classic | is |
|---|---|
| `stat-grid` | `titleband` + `stats` |
| `table` | `titleband` + `table` |
| `comparison` | `titleband` + `comparison` |
| `timeline` | `titleband` + `timeline` |
| `agenda` | `titleband` + `agenda` (plus the decorative rail) |
| `bignum` | kicker + `bignum` |
| `editorial` | kicker + `prose` |
| `chart` | `chart` |
| `quote` | `quote` |
| `media-split` | a row of `media` + `bullets` |

The other layouts (`cover`, `divider`, `closing`, `figure`, `image`, `diptych`,
`hero-asym`, `manifesto`, `embed`, `gallery`, `pipeline`, `code`, `metric-dash`,
`leaderboard`, `matrix`, `stack`, the mosaics, `before-after`) are genuinely
bespoke shapes and stay whole. Use them as they are.

### In the editor

A composed slide's sections can be reordered, removed and re-weighted (select
anything inside one; the inspector shows "Section N of M"). A **decomposable
classic** can be converted — right-click → **Convert to composed** — which keeps
every style you had applied and is one undo away from being reversed. That
conversion is also what lets ⊞ Insert drop a new piece *into* the slide's
arrangement rather than floating it on top.

---

## cover
Title slide. `kicker`, `title`, `accent` (highlighted word shown beneath), `subtitle`, `meta` (array of strings or `{text, strong}`).
```json
{ "layout":"cover", "content":{ "kicker":"A Visual Primer", "title":"How Machines", "accent":"Learn",
  "subtitle":"From data to working intelligence.", "meta":[{"text":"Foundations","strong":true},"Module 01","2026"] } }
```

## agenda
Numbered roadmap (2-col). `kicker`, `title`, `items:[{title, desc}]` — numbers added automatically.

## divider
Chapter break. `index` (e.g. "01"), `title` (animates letter-by-letter), `subtitle`.

## stat-grid
2×2 metric cards. `kicker`, `title`, `stats:[{value | count, unit, label, fmt?}]`.
```json
{ "layout":"stat-grid", "content":{ "title":"The shape of a model",
  "stats":[ {"count":60,"unit":"+ yrs","label":"since the first perceptron"},
            {"value":"10","unit":"¹¹","label":"tunable parameters"} ] } }
```

## bignum
One hero figure. `kicker`, `value` **or** `count` (+`fmt`), `subtitle`.

## chart
Inline chart. `kicker`, `title`, `note`, `body` = **raw SVG or a `slidegen.py` chart fragment** (the data-charting escape hatch). Build the SVG by hand or with `python3 slidegen.py chart line --data spec.json`.

## comparison
Two options + center VS rail. `kicker`, `title`, `badge` (default "VS"), `left`/`right` = `{tag, title, items:[…]}`.

## quote
Pull quote. `quote`, `by`, `subtitle`.

## code
Highlighted snippet. `kicker`, `title`, `filename`, `code` (raw HTML using `.k .fn .s .c .n` spans), `caption`.

## timeline
Milestones on a track. `kicker`, `title`, `items:[{year, title, desc, now?}]` (`now:true` pulses the current node).

## pipeline
Process nodes + arrows. `kicker`, `title`, `loop`, `nodes:[{icon | iconAsset, title, desc}]`.

## closing
Takeaways + thanks. `kicker`, `title`, `accent`, `takeaways:[{title, desc}]` (numbered), `note`.

---

## manifesto
One oversized statement. `statement` (wrap a phrase in `[[ ]]` to accent it), `lead`.

## editorial
Lead line + ruled columns. `kicker`, `lead`, `columns:[{head, body}]` (up to 3).

## hero-asym
Big title left, metadata rail right. `title` (`[[ ]]` accents), `sub`, `rows:[{k, v, unit}]`.

## figure
Full-bleed image + overlaid caption. `kicker`, `image` (asset name), `title`, `caption`. Falls back to a gradient if the image is missing.
```json
{ "layout":"figure", "content":{ "image":"architecture", "title":"Let an image carry the idea.", "caption":"…" } }
```

## metric-dash
KPI ring + tile grid. `kicker`, `title`, `ring:{value, label, suffix}`, `tiles:[{value, unit, label}]`.

## leaderboard
Ranked rows with proportional bars. `kicker`, `title`, `rows:[{name, value, pct}]` — bars scale to the largest `pct`.

## diptych
Two contrasting color fields. `left`/`right` = `{tag, title, body}`.

## matrix
2×2 quadrant with axis labels. `kicker`, `title`, `xlabel`, `ylabel`, `cells:[ 4 × {title, desc, hot?} ]`.

## stack
Layered horizontal bands. `kicker`, `title`, `bands:[{icon | iconAsset, title, desc}]`.

## quote-mosaic
Several short quotes in a grid. `kicker`, `title`, `quotes:[{quote, by}]`.

## index-mosaic
Large numbered section index. `kicker`, `title`, `items:[{title, desc}]` (big numbers added automatically).

## before-after
Two-state comparison with an arrow. `kicker`, `title`, `before`/`after` = `{tag, title, items:[…]}`.

---

## image
Full-bleed or framed single image with an optional caption band — the direct replacement for a hand-rolled `raw` image slide. `kicker`, `title`, `caption`, `image` (asset name, **required**), `fit`, `focal`, `frame`.
```json
{ "layout":"image", "content":{ "image":"architecture", "title":"The system, end to end.",
  "fit":"cover", "frame":"none" } }
```

## media-split
Picture one side, prose/bullets the other — the workhorse for "here's a screenshot, here's what it means" slides. `kicker`, `title`, `body`, `items` (bullet list, alternative to `body`), `image` (**required**), `side` (`left`|`right`, default `left`), `fit`, `focal`.
```json
{ "layout":"media-split", "content":{ "title":"What changed", "side":"right",
  "items":["Faster cold start","Smaller bundle","No config"], "image":"dashboard-before-after" } }
```

## gallery
2–6 image grid, auto-fit tiles, each with its own caption. `kicker`, `title`, `items:[{image, caption?}]` (**each item's `image` is required**).
```json
{ "layout":"gallery", "content":{ "title":"From the field",
  "items":[ {"image":"booth-1","caption":"Day one"}, {"image":"booth-2"} ] } }
```

## diagram
Inlines a sanitized SVG diagram, theme-color aware (author the SVG with `stroke="currentColor"`/`fill="currentColor"` so it follows the deck's accent). `kicker`, `title`, `svg` (asset name from `assets/diagrams/`, **required**), `caption`.
```json
{ "layout":"diagram", "content":{ "title":"Request lifecycle", "svg":"request-flow" } }
```

## embed
A sandboxed, click-to-interact iframe — the one layout that needs the network (media plan §6/§7.1).
`kicker`, `title`, `url` (**required**, `http://`/`https://` only), `mode` (`click` default, `live` skips
the "click to interact" shield for a background visualization, `poster` never loads it at all), `poster`
(image asset shown behind the caption while loading / if it can't load / always in print), `note`.
Only use this when the user specifically wants a live external page on a slide — for anything that can
be a static image, prefer `image`/`figure`/`diagram` instead, since those stay fully offline. Many major
sites refuse to be framed at all (no reliable way to know in advance); a blocked or unreachable embed
falls back to a poster card with an "Open in browser" link rather than a blank rectangle, and **every**
embed renders as that same poster card when printed to PDF, regardless of how it looked on screen.
```json
{ "layout":"embed", "content":{ "title":"Live dashboard", "url":"https://example.com/dashboard",
  "mode":"click", "note":"Click to interact, or open it directly if it doesn't load." } }
```

---

## raw
Escape hatch for a bespoke, hand-tuned slide. `html` = literal HTML. Still numbered, navigable, and themeable.
```json
{ "layout":"raw", "content":{ "html":"<h1 class=\"title\">Anything you want</h1>" } }
```

---

## Per-slide theme override
Add a `theme` object to **any** slide to patch CSS variables for that slide only — it shadows the global `:root`. Because every layout reads from variables, the whole slide (background included) recolors.
```json
{ "layout":"bignum", "theme":{ "--cyan":"#ffd166", "--bg":"#0c0a06", "--bg-2":"#1b1206" },
  "content":{ "count":1, "subtitle":"This slide runs warm while the rest stay cool." } }
```
Set `"ambient":"none"` on a slide to silence its motion.

---

## Ambient animation (configurable per slide)
Every slide carries one subtle background motion. Choose it in the JSON with `"ambient": "<name>"` on the slide (or set a deck-wide default in `defaults.ambient`). `"auto"` (or omitting it) keeps the layout's built-in motion; `"none"` silences it. The renderer injects the ambient as a themed background layer, so **any layout can take any ambient**.

| name | motion | name | motion |
|---|---|---|---|
| `orbs` | drifting color fields | `contours` | topographic rings *(canvas)* |
| `aurora` | diagonal gradient wash | `scan` | sweeping light bar |
| `grid` | drifting dot lattice | `waves` | diagonal striations *(canvas)* |
| `rays` | rotating light *(canvas)* | `glow` | breathing vignette |
| `grain` | film-grain texture *(canvas)* | `constellation` | twinkling points *(canvas)* |

```json
{ "layout": "hero-asym", "ambient": "rays", "content": { "title": "Asymmetric by [[design]].", "rows": [ … ] } }
```
All ambients are CSS-only, subtle (slow loops, low opacity), motion-safe (disabled under reduced-motion, with a finished resting state for the PDF), and read theme variables so they recolor with the theme. The five marked *(canvas)* were added from `canvas-design` philosophies — systematic, observational textures (radiant rays, paper grain, charted contours/waves, a faint constellation).
