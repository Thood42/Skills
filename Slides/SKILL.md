---
name: slides
description: Build polished, self-contained HTML presentation decks — a single .html file with varied, structured layouts, a cohesive theme, keyboard navigation, and one subtle ambient animation per slide. The deck is data-driven: all content lives in an editable JSON block that can be exported, edited, and re-imported, and any slide can override the global theme. Use this skill whenever the user wants slides, a deck, a presentation, a slideshow, a talk, or a "pitch" as a web page / HTML (as opposed to a PowerPoint .pptx file), or asks to turn notes, an outline, a topic, or a document into presentation slides they can open in a browser, present full-screen, or export to PDF. Prefer this over ad-hoc HTML whenever the deliverable is a presentation. For native PowerPoint .pptx files, use the pptx skill instead.
---

# Slides — self-contained, data-driven HTML decks

Produce a **single `.html` file** the user can open in any browser, present full-screen,
or print to PDF. The deck is dark/neon by default but fully themeable, uses **varied
structured layouts instead of bullet walls**, and carries **one subtle ambient animation
per slide**.

The important shift from older versions: **a deck is data, not hand-typed markup.** All
content lives in one JSON block (`<script id="deck-data">`). A small in-deck engine renders
each slide by looking its `layout` up in a registry of templates, and **derives the pager and
progress bar from position** — so adding, removing, or reordering slides never means
renumbering anything by hand. That same JSON can be **exported, edited, and re-imported**, and
**any slide can override the global theme**.

This skill ships a commented reference deck that is both the **template** and a **worked
example of every layout**. Do not start from a blank file — copy the reference and edit its JSON.

```
slides/
├── SKILL.md                      ← you are here
├── reference-deck.html           ← template + visual of all 24 layouts. Copy & edit its JSON.
├── reference-deck.json           ← the canonical content the reference renders from
├── render.sh                     ← render slides to PNG (deterministic) + contact sheet; also `--pdf`
├── animation-chart-gallery.html  ← rendered showcase of every animation & chart
├── examples/theme-gallery.html   ← one slide per theme — preview all 10 at a glance
├── slidegen.py                   ← generates animations + interactive charts as paste-ready HTML
├── assets/                       ← USER-POPULATED icons / images / brand css (see Assets)
│   ├── icons/  images/  styles/  manifest.json
├── scripts/
│   ├── deckdata.py               ← extract / inject the deck JSON <-> the .html
│   ├── assets.py                 ← inline icons/images/styles into a deck (single-file, offline)
│   ├── libfetch.py  bundle.py    ← vendored-library fetch + export (advanced visuals)
└── references/
    ├── layouts.md                ← FULL per-layout content schema (read when authoring slides)
    ├── audiences.md  themes.md   ← 8 content strategies + 10 themes (ALWAYS let the user pick)
    ├── libraries.md  charts.md  diagrams-math.md  three-motion.md  code-media.md
```

---

## Workflow (follow in order)

1. **Set up — ask the user two things first (required):** the **audience strategy** (how to
   construct the content) and the **theme** (how it looks). Present both as pick-lists and
   never silently default — they reshape the whole deck. See *Choosing an audience strategy*
   and *Choosing a theme*.
2. **Plan the narrative** using the chosen strategy's arc in `references/audiences.md`. Turn the
   topic/notes into an ordered slide list, one idea per slide, choosing a layout for each.
   Aim for variety; don't repeat a layout back-to-back. Skim `references/layouts.md` for the
   palette of 24 layouts and the fields each needs.
3. **Copy the template:** `cp reference-deck.html <deck>.html`. You'll edit its JSON, not its markup.
4. **Apply the chosen theme up front** (once): swap the font `<link>` and the `:root` block for
   the theme's, from `references/themes.md`.
5. **Write the content as JSON.** Replace the `<script id="deck-data">` block with your deck:
   set `meta.title`, and build the `slides` array — one object per slide, `{ "layout", "content" }`.
   Read `references/layouts.md` for each layout's `content` fields. This is the whole deck; there
   is no per-slide HTML to renumber.
6. **Add charts/animations as needed** (optional): the `chart` layout's `content.body` takes raw
   inline SVG or a `slidegen.py` fragment; other slides can use the slidegen animation classes.
   See *The generator* and *Advanced visuals*.
7. **Add icons/images** (optional): drop files in `assets/` and reference them by name; then inline
   them with `python3 scripts/assets.py inject <deck>.html <deck>.json` so the file stays
   self-contained. See *Assets*.
8. **Render and inspect** (required — see *Self-inspection*). Fix any layout bugs.
9. **Deliver:** present the `.html` (the live deck; press `F` for fullscreen). Optionally export a
   PDF (`render.sh --pdf`) and/or hand over the `.json` for future edits. To show a client the
   palette options, open `examples/theme-gallery.html` (one slide per theme).

Keep the deck a single file. The only external dependency is the web-font `<link>`, which
degrades gracefully to installed fallbacks (so it still works offline).

---

## The deck data model

The deck's content is one JSON object in `<script id="deck-data">`:

```jsonc
{
  "meta":   { "title": "How Machines Learn", "seed": 7, "libs": [] },
  "theme":  "midnight-neon",          // documentation label; the real palette is the :root you pasted
  "defaults": { "ambient": "auto" },
  "slides": [
    { "layout": "cover",  "content": { "title": "How Machines", "accent": "Learn", "subtitle": "…" } },
    { "layout": "stat-grid",
      "theme": { "--cyan": "#ffd166", "--bg": "#0c0a06" },   // per-slide override (optional)
      "content": { "title": "By the numbers", "stats": [ { "count": 94, "unit": "%", "label": "…" } ] } }
  ]
}
```

- **`layout`** picks a template from the registry; **`content`** is that layout's fields (in `references/layouts.md`).
- **Numbering is derived** — never store pager text or progress widths.
- Inline emphasis in text fields: `[[glow]]`, `**bold**`, `` `mono` ``.
- **`raw` layout** is the escape hatch: `content.html` is literal HTML for a one-off, hand-tuned slide
  that still participates in numbering, navigation, and theming. Reach for it when no template fits —
  the data-driven model never blocks bespoke work.

Why data-driven: one source of truth makes the deck exportable, re-importable, diff-able, and
safe to reorder. The engine escapes text by default, so content can't accidentally break the markup.

---

## Per-slide theme overrides

All color and type live in CSS variables in `:root` (the global theme). To make **one** slide
depart from it, add a `theme` object to that slide — the engine writes those variables inline on
the slide's `<section>`, where they shadow `:root` for that slide only. Because every layout reads
from variables, the whole slide (background included) recolors:

```jsonc
{ "layout": "bignum",
  "theme": { "--cyan": "#ffd166", "--indigo": "#ff8e3c", "--bg": "#0c0a06", "--bg-2": "#1b1206" },
  "content": { "count": 1, "subtitle": "This slide runs warm while the rest stay cool." } }
```

Merge order is global `:root` → deck `defaults` → per-slide `theme` (last wins). Set
`"ambient": "none"` on a slide to silence its motion. A global object `theme` (instead of a named
string) is also honored and applied to `:root` at load.

---

## Assets: icons, images, and a brand stylesheet

Populate `assets/` with your own files; reference them by name in the JSON; then **inline** them so
the exported `.html` stays a single offline file.

- `assets/icons/*.svg` — author with `stroke="currentColor"` (or `fill="currentColor"` for solid)
  so the icon **inherits the slide's theme color**, including under a per-slide override. Reference
  by filename: `{ "icon": "rocket" }` or recolor per use: `{ "icon": "rocket", "color": "--mint" }`.
- `assets/images/*` — PNG/JPG (base64-embedded) or SVG (data URI). Reference by filename: `{ "image": "architecture" }`.
- `assets/styles/*.css` — one optional brand stylesheet, inlined after `:root` (can redefine tokens).

`scripts/assets.py` sanitizes SVG (strips scripts/handlers), embeds **only referenced** assets, and
writes them into a `<script id="deck-assets">` block the engine resolves names against.

**Worked example — a stack slide using your icons:**

1. Drop `database.svg`, `layers.svg`, `bolt.svg`, `target.svg` into `assets/icons/`.
2. In the deck JSON, reference them with `iconAsset` (the `stack` and `pipeline` layouts accept it):
   ```json
   { "layout": "stack", "content": { "kicker": "Architecture", "title": "The serving stack",
     "bands": [ { "iconAsset": "database", "title": "Storage", "desc": "feature + object store" },
                { "iconAsset": { "name": "bolt", "color": "--mint" }, "title": "Gateway", "desc": "auth, routing" } ] } }
   ```
3. Inline them and verify: `python3 scripts/assets.py inject deck.html deck.json` →
   *"injected N icons, M images …"*. The icons now render inline and recolor with the theme.

Regenerate the available-names index any time with `python3 scripts/assets.py manifest`.

---

## Export, import, and PDF

The live deck carries unobtrusive controls (hover bottom-left) and keyboard shortcuts:

- **Export JSON** (`E`) — downloads the deck's content as `deck.json`.
- **Import JSON** (`I`) — load an edited `deck.json`; the deck re-renders live (numbering re-derives).
- **Save PDF** (`P`) — print to PDF (one slide per page, 16:9, motion frozen, colors preserved).
- **Docs** (`D`) — toggle the per-slide JSON doc panels (handy in the reference deck).
- **Present** (`F`) — fullscreen presentation mode with the UI hidden.

From the command line:

```bash
python3 scripts/deckdata.py extract deck.html deck.json   # pull content out to edit as a file
python3 scripts/deckdata.py inject  deck.html deck.json    # write edited content back into the deck
./render.sh --pdf deck.html deck.pdf                       # headless print-to-PDF (matches the render)
```

Three delivery formats from one source: live `.html`, content `.json`, flat `.pdf`. The CLI keeps the
headless renderer authoritative — it always has a concrete file.

---

## Content & layout principles

- **One idea per slide.** If a slide has two ideas, split it.
- **Structured layouts beat bullet lists.** Prefer a stat grid, comparison, timeline, pipeline,
  big-number, dashboard, matrix, or chart over a generic list. When you *do* list, keep items to a
  short phrase and never more than ~6.
- **Short text.** Titles ≤ 6 words; supporting lines ≤ ~14 words. The slide is a visual aid.
- **Lead with the takeaway**, not the buildup.

### Layout catalog

24 layouts ship today; **`references/layouts.md` is the full field reference** — read it when
authoring. The palette:

> **Original:** cover · agenda · divider · stat-grid · bignum · chart · comparison · quote · code · timeline · pipeline · closing
> **New (canvas-derived):** manifesto · editorial · hero-asym · figure · metric-dash · leaderboard · diptych · matrix · stack · quote-mosaic · index-mosaic · before-after
> **Escape hatch:** raw (literal HTML)

There is nothing fixed about these — invent new layouts in the same spirit (structured, themed,
one ambient touch) by adding a function to the `SG.layouts` registry in the deck `<head>` and a
matching CSS block. The catalog is a starting palette, not a cage.

---

## Choosing an audience strategy (always ask first)

The same facts make a different deck for a CFO than for an architecture review — the audience
decides the arc, what you lead with, what you cut, the density, and the tone. **Always have the user
pick a strategy before planning the narrative**, and let it drive slide order. `references/audiences.md`
holds the playbook; present them as a short pick-list (ideally via the question UI):

> Who's this deck for / what's its job?
> 1. **Executive Briefing** — a decision for senior leaders; lead with the ask
> 2. **Business Case** — justify spend; ROI and payback
> 3. **Technical Deep-Dive** — rigorous analysis for technical peers
> 4. **Training / Workshop** — teach a concept; scaffolded with exercises
> 5. **Architecture Review** — design soundness, tradeoffs, risks
> 6. **Research Findings** — what you found, how reliable, what it means
> 7. **Project Status** — on-track?, risks, asks
> 8. **Postmortem** — what broke, why, impact, remediation

If the request already implies one, say which you'll use and offer the list to switch. Each strategy
suggests a couple of fitting themes, so you can offer a sensible theme default alongside.

## Choosing a theme (always ask first)

Theme choice changes the entire feel and is cheap to ask, so **always have the user choose before you
build**. Present the named options from `references/themes.md` as a short pick-list, each with its
one-line vibe, and mention the default (Midnight Neon). If the user expresses a vibe/brand instead
("make it premium", "our brand is green"), map it to the closest theme and confirm. After they pick,
apply that theme's `<link>` + `:root` block before adding content.

## Theming

All color and type live in `:root`. Retheme by editing variables only — never hard-code colors in
the layouts (per-slide overrides are the one exception, and they too use variables).

```css
:root{
  --bg:#05080f; --bg-2:#0a1122;        /* background gradient stops      */
  --ink:#eaf1fb; --muted:#93a2bd;      /* primary / secondary text       */
  --faint:#5a6a86;                     /* axis labels, pager             */
  --cyan:#3ce8ff; --indigo:#7c8cff; --mint:#44f3c4;  /* accents (=accent-1/2/3) */
  --panel:rgba(255,255,255,.04); --brd:rgba(255,255,255,.10); /* cards   */
  --font-display:'Sora',…; --font-body:'IBM Plex Sans',…; --font-mono:'JetBrains Mono',…;
}
```

- **Accent slots:** `--cyan/--indigo/--mint` are really accent-1/2/3 — keep the names, change the
  values. Recolor by setting the two `--bg` stops + the three accents; `--brd-2`, `--grid`, and
  `--glow-cyan` should echo accent-1.
- **`--stage` / `--dot`:** `--stage` is the backdrop behind the slide; `--dot` tints the dot-grid.
  **Light themes must set both light** (themes.md light palettes already do).
- **Fonts:** keep a **distinctive** display face (avoid Arial/Inter/Roboto). Always include `DejaVu`
  fallbacks so it renders offline, and update the Google Fonts `<link>` to match.

---

## Animation: one subtle ambient per slide

Every slide carries exactly one **looping, low-key** background motion. **Choose it from the JSON**
with `"ambient": "<name>"` on the slide (or `defaults.ambient` deck-wide). `"auto"` keeps the layout's
built-in motion; `"none"` silences it. The renderer injects the ambient as a themed background layer, so
**any layout can take any ambient**. Catalog (full table in `references/layouts.md`):

> `orbs` · `aurora` · `grid` · `rays` · `grain` · `contours` · `scan` · `waves` · `glow` · `constellation`
> — the last five are canvas-design-inspired textures (radiant rays, film grain, charted contours/waves,
> a faint constellation). All read theme variables and recolor with the theme.

```json
{ "layout": "manifesto", "ambient": "rays", "content": { "statement": "We compose [[arguments]]." } }
```

Most layouts also bake a built-in ambient (used under `"auto"`); you can add `slidegen` element classes too. Rules:

- **Subtle and slow** — 4–18s loops, low opacity. Motion supports content; never competes.
- **CSS-only**, defined in the template's keyframes block.
- **Motion-safe:** keep ambient keyframes inside `@media (prefers-reduced-motion: no-preference){…}`.
- **Do not animate slide *entry* opacity.** Navigation is an instant cut on purpose (Pitfall 1).

---

## The generator: `slidegen.py`

For richer motion and **data charts with interactivity**, the deck ships a generator that prints
paste-ready, self-contained HTML fragments. Everything it emits inherits the deck's CSS variables, so
it re-themes automatically. Use it for an interactive chart, a count-up, or an animation beyond the
per-slide ambient. Run `python3 slidegen.py help` for the full reference.

It provides **23 animations** (each with a resting state for reduced-motion/static renders) and **6
interactive charts** (`line`, `bar`, `donut`, `pie`, `radial`, `gauge`) — themeable, self-contained
inline SVG + a small inline script.

```bash
python3 slidegen.py list                 # names
python3 slidegen.py anims                # the FULL animation stylesheet + runtime → paste once into <head>
python3 slidegen.py anim <name>          # markup for one animation
python3 slidegen.py anim kinetic --text "Your headline"
python3 slidegen.py chart line --data spec.json     # a chart fragment
python3 slidegen.py gallery -o gallery.html         # standalone page showing everything
```

To use a chart in a deck: generate the fragment and put it in a `chart` slide's `content.body` (raw),
or drop it into a `raw` slide. Give each chart a generous container. Chart JSON formats are documented
in `slidegen.py help` and `references/charts.md`. Large numbers auto-abbreviate (`175000000000` → `175B`).

Inspect with `animation-chart-gallery.html`, or regenerate it with `slidegen.py gallery`. For headless
capture, the render path forces the **final** state deterministically (see *Self-inspection*).

---

## Advanced visuals: the vendored-library layer

The bespoke, offline-first path (inline SVG + `slidegen.py`) is the **default**. When a slide genuinely
needs more — a second y-axis, a sequence diagram, real 3D, LaTeX, or long multi-language code — escalate
to a **locally-vendored library** rather than a CDN link (CDN content is invisible to the offline
renderer). `references/libraries.md` has the decision table; the short version:

| Need | Library | Reference |
|---|---|---|
| multi-axis / time-series charts | Chart.js | `references/charts.md` |
| flow / sequence / state / gantt / ER diagrams | Mermaid | `references/diagrams-math.md` |
| LaTeX math | KaTeX | `references/diagrams-math.md` |
| true 3D / geometry | Three.js (lazy) | `references/three-motion.md` |
| choreographed multi-element motion | GSAP | `references/three-motion.md` |
| long, multi-language highlighted code | highlight.js | `references/code-media.md` |

`python3 scripts/libfetch.py --all` downloads core libraries into `vendor/` (the only networked step).
Declare a lib with `<meta name="deck-libs" content="chartjs,katex">`, integrate from a themed snippet in
the matching reference, then render and export. `scripts/bundle.py` pulls in **only** the libraries a
deck references:

```bash
python3 scripts/bundle.py deck.html                       # stage ./lib next to deck (for render)
python3 scripts/bundle.py deck.html --mode single --out dist/deck.html  # ONE portable .html
```

The `SG` runtime keeps library visuals deterministic under headless capture (`SG.static` jumps each to
its finished frame; `SG.rng` is a seeded PRNG). Prefer `single` as the primary deliverable.

---

## Navigation & deep links (built in — preserve this)

- **Keys:** → / ↓ / Space / PageDown advance; ← / ↑ / PageUp go back; Home / End jump. Click advances.
- **Deck controls (keys + hover buttons, bottom-left):** `E` export JSON · `I` import JSON · `P` save PDF · `D` toggle the in-deck JSON doc panels · `F` presentation mode (fullscreen, UI hidden).
- **Responsive fit:** a 1280×720 stage scales to fit any window via a JS `transform: scale`.
- **Per-slide deep links:** `deck.html#7` opens slide 7 (the render script relies on this). Keep the
  hash logic intact.

The engine builds slides at load and is **re-entrant**: importing new JSON re-renders and re-wires
navigation without reloading.

---

## Self-inspection (REQUIRED before presenting)

You cannot eyeball an HTML file you can't see. Render it and look.

```bash
./render.sh <deck>.html <num_slides> shots
# → shots/slide-01.png … and shots/_contact.png (a 3-wide contact sheet)

GOLDEN=1 ./render.sh <deck>.html <num_slides> shots   # reproducibility gate for charts/3D/motion
./render.sh --pdf <deck>.html deck.pdf                 # also exercises the print/PDF path
```

Capture is **deterministic by default**: render.sh forces reduced-motion and sets `SG.static`, so
ambient loops settle to their resting state and count-up/library visuals jump to their final frame.
It passes `--allow-file-access-from-files` so staged `lib/…` scripts load over `file://`.

Then **`view shots/_contact.png`** to scan all slides, and `view` any full-res slide that looks off.
The render environment has **no network**, so CDN fonts fall back to installed fonts — expected; the
layout is still faithful. Cheap programmatic checks:

```bash
# Per-slide max brightness — should be high (~50000+ in Q16) and CONSISTENT (dim = content didn't render).
for f in shots/slide-*.png; do echo -n "$f "; convert "$f" -colorspace Gray -format "%[max]\n" info:-; done
```

---

## Pitfalls (these are real bugs that happened — avoid them)

**1. Never gate a slide's visible opacity on a CSS entry transition.** A 0→1 opacity transition on
`.slide` gets captured mid-fade by the headless renderer, so slides come out at random brightness.
Keep the active slide instantly opaque; use ambient loops for motion, not an entry fade.

**2. Don't override `.slide { position:absolute }` on a layout class.** A stray `position:relative`
wins (later rule) and breaks `inset:0` — the slide collapses. Slides stay absolutely positioned and
full-bleed.

**3. Keep decorative layers behind content.** Texture/orbs/rails use low/zero `z-index`; content is
above; pager/progress on top. The template's stacking is already set.

**4. Watch text overflow with the real fonts.** Design with margin. The fallback font in the PNG is
*wider* than the CDN font, so if it fits in the render it fits for the user.

**5. Don't hand-number slides.** The engine derives the pager and progress from position — set them
nowhere. (This whole class of bug is now designed out; don't reintroduce it in `raw` slides.)

**6. Give every animation a resting base state OUTSIDE the motion query.** Otherwise reduced-motion
users and static renders see nothing. Put the finished look in a base rule and only `animation:`/
keyframes in the motion query. `slidegen.py` already does this.

**7. Headless capture mis-measures animated/JS state — force the final state.** Render with
`--force-prefers-reduced-motion` (count-ups/rings/entrances jump to their end), and **bake interactive
states into the markup** (add `.hot`/active classes) rather than relying on dispatched events.

**8. A child's layout must not depend on an ancestor's flex direction.** Wrap a component's internal
row/column in its own element with an explicit `display:flex; flex-direction:…`.

**9. The deck-data JSON is the source of truth.** If a slide renders wrong, fix the JSON (or the
layout function), not the generated DOM — the next render overwrites the DOM. Keep `deck-data` valid
JSON; the engine shows an error slide if it can't parse.

---

## Quick reference: adding a slide

Add an object to the `slides` array — no markup, no renumbering:

```json
{ "layout": "bignum",
  "content": { "kicker": "Section label", "count": 42, "fmt": "compact",
               "subtitle": "One sentence of context for the number." } }
```

Pick the layout from `references/layouts.md`, fill its `content`, re-render, look.
