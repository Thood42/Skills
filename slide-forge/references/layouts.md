# Layout catalog — content schemas

Every slide in a deck is an object: `{ "layout": <name>, "content": {…}, "theme"?: {…}, "ambient"?: "auto"|"none", "class"?: "…" }`.
The renderer derives the pager and progress bar from position, so you never number slides by hand. This file is the field reference; `reference-deck.html` is the live visual of each one.

Conventions used below:
- Strings in `subtitle`, `label`, `caption`, `lead`, `body` accept light inline emphasis: `[[glow]]` (accent color), `**bold**`, `` `mono` ``.
- `count` (a number) makes a value count up on slide-enter; add `"fmt":"compact"` to abbreviate big numbers (`175000000000` → `175B`).
- `icon` / `iconAsset` resolve a file from `assets/icons/` by name; add `"color":"--mint"` (a theme token) or a literal color to recolor it.
- `image` resolves a file from `assets/images/` by name.

## Contents
Original: [cover](#cover) · [agenda](#agenda) · [divider](#divider) · [stat-grid](#stat-grid) · [bignum](#bignum) · [chart](#chart) · [comparison](#comparison) · [quote](#quote) · [code](#code) · [timeline](#timeline) · [pipeline](#pipeline) · [closing](#closing)
New: [manifesto](#manifesto) · [editorial](#editorial) · [hero-asym](#hero-asym) · [figure](#figure) · [metric-dash](#metric-dash) · [leaderboard](#leaderboard) · [diptych](#diptych) · [matrix](#matrix) · [stack](#stack) · [quote-mosaic](#quote-mosaic) · [index-mosaic](#index-mosaic) · [before-after](#before-after)
Escape hatch: [raw](#raw)

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
