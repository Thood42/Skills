# Library layer — when (and when not) to leave the bespoke path

The deck's default toolkit is **bespoke and offline-first**: inline SVG charts and
CSS/JS animations from `slidegen.py`, with zero dependencies. That stays the default
because it renders offline, themes automatically, and inspects cleanly. The vendored
libraries in `vendor/` are an **escalation** for things the bespoke path can't do well —
not a replacement. Reach for a library only when the capability genuinely needs it.

## Decision table

| You need… | Use | Not |
|---|---|---|
| line / bar / donut / pie / radial / gauge, ≤ a few series | `slidegen.py chart …` (inline SVG) | a charting library |
| multi-axis, mixed bar+line, time-series, dense/zoom/legend interactivity | **Chart.js** (`references/charts.md`) | slidegen |
| force graph, geo/map, fully custom data viz | **D3** (lazy; `references/charts.md`) | Chart.js |
| flowchart / sequence / state / gantt / ER diagram | **Mermaid** (`references/diagrams-math.md`) | hand-drawing boxes |
| LaTeX equations | **KaTeX** (`references/diagrams-math.md`) | images of math |
| real 3D / parametric geometry / spatial scene | **Three.js** (`references/three-motion.md`) | faking it in SVG |
| choreographed multi-element motion timeline | **GSAP** (`references/three-motion.md`) | hand-tuned CSS chains |
| long multi-language code with accurate highlighting | **highlight.js** (`references/code-media.md`) | hand-spanned `.k/.fn` for long blocks |
| a short snippet, one language | the template's hand-spanned `.code-panel` | a highlighter |

If a request is satisfied by the bespoke path, prefer it — fewer bytes, guaranteed
offline, already themed. Pulling in a 600 KB library to draw a 4-bar chart is the
classic over-reach.

## How to add a library to a deck (3 steps)

1. **Declare it.** Add the name to the head meta so the bundler knows:
   `<meta name="deck-libs" content="chartjs,katex">`. For UMD libs, also add the tag(s):
   `<script src="lib/chartjs/chart.umd.min.js"></script>` (and any CSS `<link>`).
   Heavy/ESM libs (Three.js) skip the tag and use `SG.loadLib('three')` instead.
2. **Stage + build.** `python3 scripts/libfetch.py --all` once (network needed) to fill
   `vendor/`, then `python3 scripts/bundle.py deck.html` (mode `stage`) to copy the used
   libs into `./lib/` next to the deck so it renders.
3. **Integrate from a known-good snippet** in the matching `references/*.md`. Each snippet
   is already themed to `:root` and handles `SG.static` — adapt it; don't improvise config.

## The two rules every integration must follow

These are what make library visuals reproducible (the whole reason we vendor instead of
CDN-link). Both are spelled out per-library in the reference files:

- **Freeze under `SG.static`.** During capture the renderer sets `SG.static = true`. Your
  integration must then render its *finished* frame, not an in-progress animation:
  Chart.js `options.animation = false`; GSAP `tl.progress(1)`; Three.js render one frame at
  a fixed camera; ECharts `animation:false`. The live deck still animates for the audience.
- **No bare `Math.random()`.** Anything generative (scatter jitter, particle fields, demo
  data, 3D placement) must draw from `SG.rng` (seeded). Same seed → same pixels every render,
  so the golden-frame check (`GOLDEN=1 ./render.sh …`) passes.

## Theming

Libraries don't know your `:root` palette — read it once and feed the values in. Common helper:

```js
var css = getComputedStyle(document.documentElement);
var INK   = css.getPropertyValue('--ink').trim();
var MUTE  = css.getPropertyValue('--muted').trim();
var CYAN  = css.getPropertyValue('--cyan').trim();
var INDIGO= css.getPropertyValue('--indigo').trim();
var MINT  = css.getPropertyValue('--mint').trim();
var GRID  = css.getPropertyValue('--grid').trim();
```

Pass these as colors/strokes so the library visual recolors with the deck theme.

## Offline & async settling

Vendored libs load over `file://` (render.sh passes `--allow-file-access-from-files`).
If a library renders **asynchronously** (Mermaid builds SVG; `SG.loadLib` resolves a
promise), register the work with `SG.ready(promise)` so `window.__SG_READY` only flips once
the visual exists — see `diagrams-math.md` and `three-motion.md`.
