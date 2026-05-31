---
name: slides
description: Build polished, self-contained HTML presentation decks — a single .html file with varied slide layouts, a cohesive theme, keyboard navigation, and one subtle ambient animation per slide. Use this skill whenever the user wants slides, a deck, a presentation, a slideshow, a talk, or a "pitch" as a web page / HTML (as opposed to a PowerPoint .pptx file), or asks to turn notes, an outline, a topic, or a document into presentation slides they can open in a browser or present full-screen. Prefer this over ad-hoc HTML whenever the deliverable is a presentation. For native PowerPoint .pptx files, use the pptx skill instead.
---

# Slides — self-contained HTML decks

Produce a **single `.html` file** the user can open in any browser and present full-screen.
The deck is dark/neon by default but fully themeable, uses **varied structured layouts
instead of bullet walls**, and carries **one subtle ambient animation per slide**.

This skill ships a complete, commented reference deck that is both the **template** and a
**worked example**. Do not start from a blank file — copy the reference and adapt it.

```
slides/
├── SKILL.md                      ← you are here
├── reference-deck.html           ← the template + example (12 layouts). Copy & adapt this.
├── render.sh                     ← render each slide to PNG (deterministic) + contact sheet; GOLDEN repro check
├── animation-chart-gallery.html  ← rendered showcase of every animation & chart (open to preview)
├── slidegen.py                   ← generates animations + interactive charts as paste-ready HTML
├── vendor/                       ← locally-vendored libraries (Chart.js, Mermaid, KaTeX, Three.js, GSAP, hljs)
│   └── manifest.json             ← pinned versions + SRI hashes + licenses; populate with libfetch.py
├── scripts/
│   ├── build_deck.py             ← outline (JSON) → full deck with theme + auto-numbered pagers
│   ├── lint_deck.py              ← static QA: numbering, lib refs, WCAG contrast (run before render)
│   ├── export_deck.py            ← rendered PNGs → shareable PDF / PPTX
│   ├── brand_theme.py            ← derive a themed :root from a brand's colors
│   ├── embed_image.py            ← base64-embed an image as an offline-safe <img>
│   ├── libfetch.py               ← download+verify libs into vendor/ (run once, needs network)
│   └── bundle.py                 ← stage / folder / single-file export (only the libs a deck uses)
└── references/                   ← read on demand
    ├── audiences.md              ← 8 content strategies / audiences (ALWAYS let the user pick one)
    ├── themes.md                 ← 10 drop-in color/type themes (ALWAYS let the user pick one)
    ├── from-document.md          ← turn a report/notes/.docx/.pdf into a deck
    ├── icons.md                  ← ~30 offline, themeable inline-SVG line icons
    ├── libraries.md              ← WHEN to escalate from bespoke → a library (decision table)
    ├── charts.md  diagrams-math.md  three-motion.md  code-media.md
```

---

## Workflow (follow in order)

1. **Set up — always ask the user two things first (required):** the **audience strategy**
   (how to construct the content) and the **theme** (how it looks). Present both as pick-lists
   and never silently default — they reshape the whole deck. Do this in one quick exchange.
   See *Choosing an audience strategy* and *Choosing a theme*.
2. **Plan the narrative using the chosen strategy.** Follow that strategy's arc in
   `references/audiences.md` — it decides what you lead with, what you cut, the density, and
   the tone. Turn the topic/notes into an ordered slide list, one idea per slide, picking a
   layout for each from the catalog. Aim for variety; don't repeat a layout back-to-back.
3. **Create the deck file.** Two ways: copy the template — `cp reference-deck.html <deck>.html`
   — and hand-edit; or, for anything beyond a few slides, **scaffold it from an outline** with
   `python3 scripts/build_deck.py --outline outline.json --theme <theme> --out <deck>.html`,
   which stamps every slide with the right layout and auto-numbers the pager/progress for you
   (`build_deck.py --sample` shows the outline format). Then hand-edit the result. The assembler
   is the reliable way to avoid renumbering bugs on larger decks.
4. **Apply the chosen theme up front:** swap the font `<link>` and the `:root` block for the
   theme's, from `references/themes.md`. Do this once, before adding content.
5. **Replace content** slide by slide. Reuse the existing `<section class="slide …">` blocks
   as layout scaffolding; swap in real content. Add/remove slides as needed and renumber the
   `.pager` ("04 / 12") and `.progress` width (`100 * n / total %`) — or let `build_deck.py` /
   `lint_deck.py` handle/verify the numbering. To build a slide up point-by-point, give elements
   class `frag` (they reveal one click at a time; all shown in static renders).
6. **Add charts/animations as needed** (optional): use `slidegen.py` for interactive
   charts (line/bar/donut) and the extended animation library — see *The generator*.
   For capabilities the bespoke path can't do well (multi-axis/time-series charts, 3D,
   diagrams, LaTeX math, long highlighted code), escalate to the **vendored-library
   layer** — see *Advanced visuals* and `references/libraries.md`. If you used any library,
   stage it next to the deck first: `python3 scripts/bundle.py <deck>.html` (mode `stage`).
7. **Lint, then render and inspect** (required). Run `python3 scripts/lint_deck.py <deck>.html`
   to catch numbering / contrast / broken-ref bugs deterministically, then render — see
   *Self-inspection*. Fix and repeat until clean.
8. **Export if a shareable file is wanted** (optional): `python3 scripts/export_deck.py
   --slides shots --pdf <deck>.pdf` (add `--pptx <deck>.pptx`) turns the rendered slides into a
   PDF/PowerPoint. For a portable single `.html`, use `bundle.py --mode single`.
9. **Present** the final `.html` (and the PDF/contact sheet if made) with `present_files`.

Keep the deck a single file. The only external dependency is the web-font `<link>`, which
degrades gracefully to installed fallbacks (so it still works offline).

---

## Content & layout principles

- **One idea per slide.** If a slide has two ideas, split it.
- **Structured layouts beat bullet lists.** Prefer a stat grid, comparison, timeline,
  pipeline, big-number, or chart over a generic list. When you *do* list, keep items to a
  short phrase and never more than ~6.
- **Short text.** Titles ≤ 6 words; supporting lines ≤ ~14 words. The slide is a visual aid,
  not the script.
- **Lead with the takeaway**, not the buildup.

### Layout catalog

Each maps to a class on `<section class="slide …">` in the template. Mix them.

| Layout | Class | Use for |
|---|---|---|
| Cover | `cover` | Title slide; big title + glow accent word + ambient orbs |
| Agenda / index | *(none; `.agenda-grid`)* | Numbered roadmap of sections (2-col) |
| Section divider | `divider` | Giant gradient number + section title; chapter breaks |
| Stat grid | *(none; `.stat-grid`)* | 2×2 metric cards (number + label) |
| Big number | `bignum` | One hero metric/figure with a sentence of context |
| Chart | *(none; `.chart-wrap`)* | Trend / data shape — inline SVG line chart |
| Comparison | *(none; `.cmp`)* | Two options side-by-side with a center "VS" rail |
| Quote | `quote` | A single pull quote + attribution |
| Code | *(none; `.code-panel`)* | A short, hand-highlighted code snippet + caption |
| Timeline | *(none; `.timeline`)* | Milestones along a horizontal track (zigzag) |
| Pipeline / flow | *(none; `.pipe`)* | A process as connected nodes with arrows |
| Closing | `closing` | Takeaways grid + thanks/CTA |

There is nothing special about these twelve — invent new layouts in the same spirit
(structured, themed, one ambient touch). The catalog is a starting palette, not a cage.

---

## Choosing an audience strategy (always ask first)

The same facts make a different deck for a CFO than for an architecture review — the audience
decides the arc, what you lead with, what you cut, the density, and the tone. So **always have
the user pick a strategy before you plan the narrative**, and let it drive the slide order.
`references/audiences.md` holds the full playbook for each; present them as a short pick-list
(ideally via the question UI so they tap one):

> Who's this deck for / what's its job?
> 1. **Executive Briefing** — a decision for senior leaders; lead with the ask
> 2. **Business Case** — justify spend/investment; ROI and payback
> 3. **Technical Deep-Dive** — rigorous analysis for technical peers
> 4. **Training / Workshop** — teach a concept; scaffolded with exercises
> 5. **Architecture Review** — design soundness, tradeoffs, risks
> 6. **Research Findings** — what you found, how reliable, what it means
> 7. **Project Status** — on-track?, risks, asks (RAG health)
> 8. **Postmortem** — what broke, why, impact, remediation

If the request already implies one ("make an exec readout…", "incident review for…"), say which
you'll use and offer the list to switch, rather than asking cold. If the user describes a goal or
audience instead of a number, map it to the closest strategy and confirm. For mixed requests, pick
the **primary** audience/decision as the spine and borrow a few slides from the secondary (see the
note at the end of `audiences.md`). Then read that strategy's section and plan the arc from it.

Each strategy also suggests a couple of fitting themes, so you can offer a sensible theme default
alongside the strategy pick.

## Choosing a theme (always ask first)

Theme choice changes the entire feel of a deck, and it's cheap to ask, so **always have the
user choose a theme before you build** — don't pick one silently. Present the named options
from `references/themes.md` as a short pick-list (ideally via the question UI so they tap one),
each with its one-line vibe, and mention the default. For example:

> Which theme should I use?
> 1. **Midnight Neon** — dark, techy, cyan/indigo (default)
> 2. **Solar Flare** — dark, warm amber/orange, energetic
> 3. **Evergreen** — dark, emerald/teal, serif, organic
> 4. **Monolith** — dark monochrome + one electric accent, minimal
> 5. **Royal Velvet** — dark violet + gold, elegant
> 6. **Coral Sunset** — dark coral/peach, friendly
> 7. **Deep Ocean** — dark azure/teal, corporate
> 8. **Editorial Paper** — light cream + crimson, serif, print
> 9. **Arctic** — light, azure/teal, crisp
> 10. **Sandstone** — light warm beige, terracotta, earthy

If the user expresses a vibe/brand instead of a number ("make it feel premium", "our brand is
green"), map that to the closest theme (premium → Royal Velvet; green → Evergreen) and confirm.
Only skip the question if the user already named a theme or palette in their request. After they
pick, apply that theme's `<link>` + `:root` block from `references/themes.md` before adding content.

## Theming

All color and type live in `:root`. Retheme by editing variables only — never hard-code
colors in the slides.

```css
:root{
  --bg:#05080f; --bg-2:#0a1122;        /* background gradient stops      */
  --ink:#eaf1fb; --muted:#93a2bd;      /* primary / secondary text       */
  --faint:#5a6a86;                     /* axis labels, pager             */
  --cyan:#3ce8ff; --indigo:#7c8cff; --mint:#44f3c4;  /* accents          */
  --panel:rgba(255,255,255,.04); --brd:rgba(255,255,255,.10); /* cards    */
  --font-display:'Sora',…; --font-body:'IBM Plex Sans',…; --font-mono:'JetBrains Mono',…;
}
```

**Prefer a ready-made theme.** `references/themes.md` has 10 turnkey palettes (dark and
light, with distinctive font pairings) — the user picks one (see *Choosing a theme*) and you
paste its `<link>` + `:root` block. Build a custom palette only if the user asks for one.

- **Accent slots:** the template references `--cyan`, `--indigo`, `--mint` throughout, so those
  three names are really accent-1/2/3 — keep the names, change the values (e.g. a violet theme
  puts purple in `--cyan`). Recolor by setting the two `--bg` stops + the three accents;
  `--brd-2`, `--grid`, and `--glow-cyan` should echo accent-1.
- **`--stage` / `--dot`:** `--stage` is the backdrop behind the slide; `--dot` tints the dot-grid
  texture. **Light themes must set both light** (the themes.md light palettes already do).
- **Light theme:** also set `--ink/--muted` dark, `--panel/--brd` as dark-on-light translucencies,
  and lower the glow-shadow alpha (additive glow reads as haze on light backgrounds).
- **Fonts:** keep a **distinctive** display face — avoid generic/overused fonts (Arial, Inter,
  Roboto, Space Grotesk). Always include `DejaVu` fallbacks so the deck renders offline / if the
  CDN font fails, and update the Google Fonts `<link>` to match the families you use.

---

## Animation: one subtle ambient per slide

Every slide carries exactly one **looping, low-key** background motion (drifting orbs,
breathing glow, a traveling packet, a line-draw, a caret blink…). Rules:

- **Subtle and slow** — 4–18s loops, low opacity. Motion supports the content; it never
  competes with it. No bouncing, spinning, or attention-grabbing entrances.
- **CSS-only**, defined in the template's keyframes block.
- **Motion-safe:** keep all ambient keyframes inside
  `@media (prefers-reduced-motion: no-preference){ … }` so they're disabled for users who
  ask for reduced motion. The template already does this — preserve it.
- **Do not animate slide *entry* opacity.** Navigation is an instant cut on purpose
  (see Pitfall 1).

---

## The generator: `slidegen.py`

For richer motion and **data charts with interactivity**, the deck ships a small Python
generator that prints paste-ready, self-contained HTML fragments. Everything it emits
inherits the deck's CSS variables, so it re-themes automatically with no edits. Use it when
a slide needs an interactive chart, a count-up statistic, or an animation beyond the per-slide
ambient loop. Run `python3 slidegen.py help` for the full reference.

### What it provides

**23 animations & effects** — each has a proper resting state (so reduced-motion users and
static renders look finished) with motion confined to `@media (prefers-reduced-motion: no-preference)`:

| Name | Effect | Trigger |
|---|---|---|
| `fade-rise` | staggered upward fade-in for lists/cards | on slide enter (`.sg-onenter`) |
| `shimmer` | holographic light sweep across text | continuous |
| `aurora` | slow animated gradient backdrop (container) | continuous |
| `neon-flicker` | mostly-steady neon sign flicker | continuous |
| `float` | gentle vertical bob for icons/accents | continuous |
| `reveal-wipe` | clip-path wipe-in | on slide enter (`.sg-onenter`) |
| `typewriter` | single line types in with a caret | on slide enter (`.sg-onenter`) |
| `count-up` | number counts up to a target (plain or compact like `175B`) | on slide enter |
| `ring` | KPI ring fills to a percentage with count-up center | on slide enter |
| `gradient-text` | animated gradient fill flowing through text | continuous |
| `gradient-border` | animated gradient ring around a box | continuous |
| `glow-pulse` | soft pulsing glow (text + `.sg-glow-pulse-box` variant) | continuous |
| `kinetic` | per-letter staggered headline entrance | on slide enter (`.sg-onenter`) |
| `spinner` | pure-CSS loading spinner | continuous |
| `progress` | indeterminate progress bar | continuous |
| `skeleton` | loading-placeholder blocks with a shimmer sweep | continuous |
| `glass` | glassmorphic card (translucent blur + border; styling effect) | — |
| `draw-path` | self-drawing SVG stroke (underlines, dividers, icon outlines, wordmarks) | on slide enter (auto) |
| `dots` | three bouncing dots loader | continuous |
| `bars` | equalizer-style vertical bars (decorative / loading accent) | continuous |
| `wiggle` | subtle periodic attention nudge for a CTA/callout | continuous |
| `check` | self-drawing success checkmark (circle + tick) | on slide enter (`.sg-onenter`) |
| `word-spin` | vertical rotating word cycler ("we build X / Y / Z") | continuous |

Three effects take helpers/extra markup:
- **`kinetic`** needs each character wrapped in an indexed `<span style="--i:N">`. Generate the
  markup with `python3 slidegen.py anim kinetic --text "Your headline"`.
- **`word-spin`** is generated (its keyframe adapts to the word count and is scoped to a unique
  class), so it emits its own `<style>` + markup:
  `python3 slidegen.py anim word-spin --text "build,design,ship"`. Paste both parts;
  wrap it in your surrounding text, e.g. `We <span style="color:var(--cyan)">…</span>`.
- **`draw-path`** wraps any SVG in `class="sg-draw"`; the runtime measures each shape with
  `getTotalLength()`, sets `--len`, and triggers the draw on slide enter — no length math by hand.
  Give the SVG `fill="none"` and a visible `stroke`. (`check` works the same way with fixed
  dash lengths, so it needs no measurement.)

**6 interactive charts**, each themeable and self-contained (inline SVG + a small inline script):

- **`line`** — multi-series line/area on a linear or log y-axis. Hovering a point shows a
  value **tooltip** with a guide line; supports permanent **annotation** callouts (e.g. a
  `175B` label on a specific point). Line draws in on slide enter.
- **`bar`** — column chart with optional always-on value labels and **count-up**; hovering a
  bar **highlights** it (glow) and dims the others.
- **`donut`** — proportional ring with a legend; hovering a segment (or its legend row)
  **emphasizes** it, dims the rest, and updates the center label to that segment.
- **`pie`** — full-wedge pie (set `"inner"` > 0 for a donut-style hole); hovering a wedge
  **explodes** it outward and dims the rest. Fan-in entrance. Legend shows percentages.
- **`radial`** — concentric value rings (one per metric) against a `"max"`, each filling to
  its fraction; hovering a ring highlights it and updates the center readout. Best for a small
  set of 0–100 scores. Sweep-in entrance.
- **`gauge`** — semicircular single-metric gauge with a gradient arc, **count-up** value, a
  caption, and min/max end labels. Arc sweeps to the value on slide enter.

### CLI

```bash
python3 slidegen.py list                 # list animation + chart names
python3 slidegen.py anims                # the FULL animation stylesheet + runtime
                                                 #   → paste once into the deck <head>
python3 slidegen.py anim <name>          # markup snippet for one animation
python3 slidegen.py anim kinetic --text "Your headline"   # per-letter kinetic markup
python3 slidegen.py anim word-spin --text "build,design,ship"  # rotating word cycler
python3 slidegen.py chart line           # a chart fragment (demo data)
python3 slidegen.py chart bar  --data my.json --title "Accuracy"
python3 slidegen.py chart donut --data - # read JSON spec from stdin
python3 slidegen.py chart pie    --data slices.json     # exploding pie
python3 slidegen.py chart radial --data scores.json     # concentric value rings
python3 slidegen.py chart gauge  --data util.json       # semicircular single metric
python3 slidegen.py gallery -o gallery.html   # standalone page showing everything
```

### How to use it in a deck

1. **Animations:** run `slidegen.py anims` **once** and paste the emitted
   `<style>…</style><script>…</script>` into the deck `<head>`. Then add the animation class
   to any element (and `sg-onenter` for entrance ones). Markup examples come from
   `slidegen.py anim <name>`. Entrance animations and count-ups fire when their slide becomes
   `.active` (the runtime watches for it), so they replay correctly as you navigate.
2. **Charts:** run `slidegen.py chart <type> --data spec.json`, which prints a `<style>` block
   plus a `<div>` fragment. Paste the `<style>` into the `<head>` (or leave it inline — it's
   scoped to a random class so multiple charts never collide) and drop the `<div>` into a
   slide's content area. Give each chart its own slide or a generous container; charts fill
   their parent's height.

### Chart JSON formats

```jsonc
// line
{ "title": "Model size over time", "y_log": true,
  "x": ["2012","2014","2017","2020","2023"],
  "series": [{ "name": "Parameters", "values": [6e7,1.4e8,2e8,1.75e11,1.2e12] }],
  "annotations": [{ "i": 3, "text": "175B" }] }          // i = index into x

// bar
{ "title": "Top-1 accuracy", "unit": "%", "value_labels": true,
  "x": ["2012","2015","2018","2021","2024"],
  "series": [{ "name": "acc", "values": [63,78,85,90,94] }] }

// donut
{ "title": "Where training time goes", "unit": "%",
  "segments": [{ "label": "Data prep", "value": 35 }, { "label": "Training", "value": 45 },
               { "label": "Evaluation", "value": 12 }, { "label": "Tuning", "value": 8 }] }

// pie  (add "inner": 90 for a donut-style hole; values need not sum to 100)
{ "title": "Compute budget by stage", "unit": "%",
  "segments": [{ "label": "Pretraining", "value": 58 }, { "label": "Fine-tuning", "value": 22 },
               { "label": "Evaluation", "value": 12 }, { "label": "Serving", "value": 8 }] }

// radial  (each ring fills value/max; keep to ~2–5 metrics)
{ "title": "Benchmark scores", "unit": "%", "max": 100,
  "segments": [{ "label": "Reasoning", "value": 88 }, { "label": "Coding", "value": 74 },
               { "label": "Math", "value": 63 }, { "label": "Vision", "value": 52 }] }

// gauge  (single metric)
{ "title": "Model utilization", "value": 72, "max": 100, "unit": "%", "caption": "GPU load" }
```

Large numbers are auto-abbreviated (`175000000000` → `175B`) in labels and count-ups.
`--id NAME` sets the chart's scope class (otherwise random); `--title` overrides the spec title.

### Verifying generated output

Open `animation-chart-gallery.html` to see every animation and chart at once, or regenerate it
with `slidegen.py gallery`. To inspect via headless render, capture with
`--force-prefers-reduced-motion`: this resolves entrance animations, count-ups, and rings to
their **final** state deterministically (under normal motion the headless virtual-time clock
freezes mid-animation and gives misleading frames — see Pitfall 7).

---

The deck is self-contained except for the font `<link>`. Defaults chosen for robustness:

- **Charts → inline SVG** (default; no dependency, renders offline, themeable, inspectable).
  Build simple line/area charts by hand as in the `.chart-wrap` slide, or use
  `slidegen.py chart <line|bar|donut|pie|radial|gauge>` for richer **interactive** charts (hover
  tooltips, bar/segment highlighting, count-up value labels, annotations). See *The generator*
  above.
  *Alternative (CDN):* for very rich/interactive charting you can load Chart.js from a CDN
  into a `<canvas>`. Note CDN content won't appear in offline PNG renders.
- **Code highlighting → hand-styled spans** (`.k`, `.fn`, `.s`, `.c`, `.n`). No highlight.js
  needed. Wrap keywords/functions/strings/comments yourself; it's a few spans for a short
  snippet and gives full control.
- **Fonts → CDN `<link>` + installed fallback.** Best balance of looks and robustness.
- **Truly offline build?** Replace the font `<link>` with locally-embedded `@font-face`
  (base64) or rely on the fallback fonts.

---

## Power tools & extras

Small helpers that remove repeated work or add reach. Reach for them when relevant; none are
required for a basic deck.

- **Assemble from an outline — `scripts/build_deck.py`.** Outline (JSON) + theme → a full deck
  with every layout stamped and pager/progress auto-numbered. The fastest, least error-prone
  way to start anything past a few slides. `--sample` prints the outline format; `--list-layouts`
  / `--list-themes` enumerate options.
- **Lint — `scripts/lint_deck.py`.** Deterministic pre-flight: sequential pager/progress and
  correct totals, `deck-libs` vs `lib/` usage, missing staged libs, broken local refs, and WCAG
  contrast of the active theme (most useful on the light themes). Run it before every render.
- **Export — `scripts/export_deck.py`.** Turns the slide PNGs from `render.sh` into a shareable
  **PDF** (one slide per page) and/or **PPTX** (slides as full-bleed images). "Send me the deck"
  usually means a PDF.
- **Brand theme — `scripts/brand_theme.py`.** Derive a complete, contrast-checked `:root` + font
  link from a company's 1–3 brand colors (`--mode dark|light`, `--fonts modern|elegant|editorial|warm`)
  when none of the 10 stock themes fit. Paste the output into the deck or add it to `themes.md`.
- **Images & icons.** `scripts/embed_image.py` base64-embeds a photo/logo as an offline-safe
  `<img>` (with `--max-width` downscale). For iconography use `references/icons.md` — ~30 inline-SVG
  line icons that theme via `currentColor` and stay inside the single-file deck.
- **From a document.** To turn a report / notes / `.docx` / `.pdf` into a deck, follow
  `references/from-document.md` — read the source with the `pdf`/`docx` skill, pick a strategy,
  distill to one idea per slide, then `build_deck.py`. Distill, don't transcribe.

### Presenting & pacing
- **Navigation extras (built into the template):** press **O** for a clickable slide index to
  jump anywhere; elements with class **`frag`** reveal one click at a time (all shown in static
  renders, so they never blank out a screenshot).
- **Pacing rule of thumb:** budget roughly **1–2 minutes per slide**. So a 20-minute talk is
  ~12–16 slides, a 5-minute update ~4–6. If a deck runs long for its slot, cut slides (or move
  detail to an appendix) rather than talking faster.

## Advanced visuals: the vendored-library layer

The bespoke, offline-first path (inline SVG + `slidegen.py`) is the **default** and handles
most decks. When a slide genuinely needs more — a second y-axis, a sequence diagram, real
3D, LaTeX, or long multi-language code — escalate to a **locally-vendored library** rather
than a CDN link (CDN content is invisible to the offline renderer). `references/libraries.md`
has the full decision table; the short version:

| Need | Library | Reference |
|---|---|---|
| multi-axis / mixed / time-series charts | Chart.js | `references/charts.md` |
| flow / sequence / state / gantt / ER diagrams | Mermaid | `references/diagrams-math.md` |
| LaTeX math | KaTeX | `references/diagrams-math.md` |
| true 3D / geometry | Three.js (lazy) | `references/three-motion.md` |
| choreographed multi-element motion | GSAP | `references/three-motion.md` |
| long, multi-language highlighted code | highlight.js | `references/code-media.md` |

Don't over-reach: a 4-bar chart is a `slidegen.py` job, not a reason to load Chart.js.

### One-time setup (needs network)
`python3 scripts/libfetch.py --all` downloads the core libraries into `vendor/`, verifying
each against a pinned SRI hash (and recording the hash on first fetch). This is the only
networked step; everything after is offline. Heavy/rare libs are lazy: `libfetch.py d3 echarts`.

### Using a library in a deck (3 steps)
1. Declare it: `<meta name="deck-libs" content="chartjs,katex">`, and for UMD libs add the
   `<script src="lib/chartjs/chart.umd.min.js">` (and any CSS `<link>`). Three.js is ESM —
   load it with `SG.loadLib('three')` instead of a tag.
2. Stage + integrate from a known-good, themed snippet in the matching `references/*.md`.
3. Render and inspect (below), then export.

### Reproducibility model (why library visuals stay deterministic)
Chart.js, Three.js and GSAP animate via `requestAnimationFrame`, which the headless renderer
freezes at an arbitrary mid-frame — so naive captures of the same deck differ. The template's
`SG` runtime (in `<head>`) fixes this:

- **`SG.static`** — the renderer sets it during capture; every integration then renders its
  *finished* frame (`animation:false`, `tl.progress(1)`, one fixed 3D frame). The live deck
  still animates for the audience.
- **`SG.rng`** — a seeded PRNG. Anything generative must use it instead of `Math.random()`,
  so the same deck renders the same pixels (seed via `<html data-seed="N">`).
- **Golden-frame check** — `GOLDEN=1 ./render.sh <deck>.html <n> shots` renders each slide
  twice and fails if the two PNGs aren't pixel-identical, catching any leftover nondeterminism.

### Export (hybrid delivery)
`scripts/bundle.py` pulls in **only the libraries a deck references** (union of the
`deck-libs` meta and any `lib/…` paths):

```bash
python3 scripts/bundle.py deck.html                       # stage ./lib next to deck (for render/preview)
python3 scripts/bundle.py deck.html --mode folder --out dist/    # clean folder: deck + lib/
python3 scripts/bundle.py deck.html --mode single --out dist/deck.html  # ONE portable .html
```
`single` inlines each local script/CSS and base64-embeds KaTeX fonts; ES-module libs
(Three.js) are kept as a sibling `lib/` file since modules can't be inlined. Prefer `single`
as the primary deliverable; keep a `folder` build for further editing.

---

## Navigation & deep links (built in — preserve this)

- **Keys:** → / ↓ / Space / PageDown advance; ← / ↑ / PageUp go back; Home / End jump.
  Click also advances.
- **Responsive fit:** a 1280×720 stage scales to fit any window via a JS `transform: scale`.
- **Per-slide deep links:** `deck.html#7` opens slide 7. The render script relies on this,
  and it's handy for linking to a specific slide. Keep the hash logic intact.

---

## Self-inspection (REQUIRED before presenting)

You cannot eyeball an HTML file you can't see. Render it and look.

```bash
./render.sh <deck>.html <num_slides> shots
# → shots/slide-01.png … and shots/_contact.png (a 3-wide contact sheet)

# Reproducibility gate — required for decks with charts / 3D / motion:
GOLDEN=1 ./render.sh <deck>.html <num_slides> shots
# renders each slide twice and fails if any pair isn't pixel-identical.
```

Capture is **deterministic by default**: render.sh forces reduced-motion and sets `SG.static`,
so ambient loops settle to their resting state and library/count-up visuals jump to their final
frame (what the audience ends on) instead of a frozen mid-animation. It also passes
`--allow-file-access-from-files` so locally-staged `lib/…` scripts load over `file://`.

Then **`view shots/_contact.png`** to scan all slides at once, and `view` any full-res
`shots/slide-NN.png` that looks off. Fix, re-render, repeat until clean.

Cheap programmatic checks (catch bugs without eyeballing every pixel):

```bash
# Per-slide max brightness — should be high (~50000+ in Q16) and CONSISTENT.
# A dim/inconsistent slide means content didn't render (see Pitfall 1).
for f in shots/slide-*.png; do echo -n "$f "; convert "$f" -colorspace Gray -format "%[max]\n" info:-; done

# Is the slide box full-height? Sample background near the bottom; it should be the
# slide gradient, not near-black (see Pitfall 2).
convert shots/slide-08.png -format "%[pixel:p{640,600}]\n" info:-
```

The renderer uses headless Chrome at `/opt/google/chrome/chrome` with a virtual-time budget;
harmless `dbus` errors on stderr can be ignored. The render environment has **no network**,
so CDN fonts fall back to installed fonts in the PNGs — that's expected; the layout is still
faithful. (This is exactly why the chart is inline SVG: so it's actually visible to inspect.)

---

## Pitfalls (these are real bugs that happened — avoid them)

**1. Never gate a slide's visible opacity on a CSS entry transition.**
A `transition: opacity` on `.slide` that fades from 0→1 on activation gets captured
*mid-fade* by the headless renderer, so slides come out at random, inconsistent brightness
(one at 94%, the next at 3%). Keep the active slide instantly opaque
(`.slide.active{opacity:1}` with **no** opacity transition). Use the ambient loops for
motion, not an entry fade.

**2. Don't override `.slide { position:absolute }` on a layout class.**
Layout classes have the same specificity as `.slide`, so a stray `position:relative` on,
e.g., `.quote` *wins* (later rule) and silently breaks `inset:0` — the slide collapses to
its content height and the background/progress bar stop halfway down. Slides must stay
absolutely positioned and full-bleed. The slide is already a positioning context, so
absolutely-positioned children (quote mark, orbs, pager) don't need it re-declared.

**3. Keep decorative layers behind content.** Texture/orbs/rails use low/zero `z-index`;
content is above them; pager/progress are on top. The template's stacking is already set —
don't reintroduce a positioned decoration that paints over the text.

**4. Watch text overflow with the real fonts.** Design with margin. Big mono numbers and
long titles are the usual offenders; the fallback font in the PNG is *wider* than the CDN
font, so if it fits in the render it will fit for the user.

**5. Renumber after adding/removing slides.** Update every `.pager` and each
`.progress` width, and the deep-link count is automatic (JS counts `.slide` nodes).

**6. Give every animation a resting base state OUTSIDE the motion query.** A tempting mistake
is to define an animation's whole appearance inside
`@media (prefers-reduced-motion: no-preference)`. Then reduced-motion users (and static
renders) see *nothing* — e.g. a "neon" text with no color, or an aurora panel with no
gradient. Put the finished look in a base rule and only the `animation:`/keyframes in the
motion query. `slidegen.py` already does this; preserve the pattern in any new animation.

**7. Headless capture mis-measures animated/JS state — don't trust it, force the final state.**
Under headless Chrome's `--virtual-time-budget`, `requestAnimationFrame`-driven animations and
even `getComputedStyle` can report frozen, mid-flight, or stale values, while `setTimeout`
fast-forwards. Two consequences: (a) to inspect a chart/animation's *finished* look, render
with `--force-prefers-reduced-motion` (count-ups/rings/entrances jump to their end state via
JS); (b) to make an *interactive* state (a hover highlight, a tooltip) visible in a static
screenshot, **bake the state into the markup** (add the `.hot`/active classes server-side)
rather than relying on dispatched events or timers firing during capture. The live page is
fine; only the headless snapshot is unreliable.

**8. A child's layout must not depend on an ancestor's flex direction.** A chart or component
placed inside a slide/card can be flipped if the container sets `flex-direction:column`. The
donut chart broke this way (ring + legend stacked instead of sitting side-by-side). Wrap a
component's internal row/column in its own element with an explicit `display:flex;
flex-direction:…` so it's immune to the parent's flow.

---

## Quick reference: adding a slide

```html
<section class="slide bignum" data-i="5">
  <div class="eyebrow-row"><span class="kicker">Section label</span></div>
  <div class="hero-num">42%</div>
  <p class="subtitle">One sentence of context for the number.</p>
  <div class="pager">05 / 12</div>
  <div class="progress" style="width:41.6%"></div>
</section>
```

Copy the closest existing layout, swap the content, fix the pager/progress, re-render, look.
                                                                                                                                                                   