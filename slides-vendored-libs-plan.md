# Slides skill — vendored-library refactor plan

**Goal:** let the `slides` skill build richer, more functional decks (advanced charts, 3D, motion, diagrams, math, code) by pulling from a **local library directory loaded on demand**, *without* losing the things that make the current skill good: a single themeable aesthetic, and decks that render & self-inspect **offline** in headless Chrome.

**Decisions locked in:** hybrid delivery (dev against a local lib cache; export as either one portable file *or* a folder bundle) · augment the existing bespoke system rather than adopt a framework · cover rich charts, 3D/motion, diagrams/math, and code/media.

---

## 1. The core tension (why this needs design, not just "add a CDN link")

The current skill is deliberately self-contained because the **render/self-inspection environment has no network**. CDN `<script>`/`<link>` tags silently vanish from the PNG renders, so the agent can't see what it built. Any vendored-library system has to satisfy one hard rule:

> **Every library a deck uses must already be on local disk before render time.**

That single constraint drives the whole design below.

---

## 2. New skill layout

```
slides/
├── SKILL.md                      ← stays lean; gains a short "When to reach for a library" section
├── reference-deck.html           ← unchanged (bespoke offline-first template)
├── slidegen.py                   ← unchanged (bespoke inline charts/animations stay the default)
├── render.sh                     ← UPDATED: add --allow-file-access-from-files for local libs
├── animation-chart-gallery.html  ← unchanged
│
├── vendor/                       ← NEW — the local library directory
│   ├── manifest.json             ← pinned registry: version, files, SRI hash, license, source URL
│   ├── NOTICES.md                ← aggregated third-party licenses (for version control / sharing)
│   ├── chartjs/chart.umd.min.js
│   ├── mermaid/mermaid.min.js
│   ├── katex/katex.min.js + katex.min.css + fonts/*.woff2
│   ├── three/three.min.js
│   ├── gsap/gsap.min.js
│   ├── highlight/highlight.min.js + theme.css
│   └── …
│
├── scripts/                      ← NEW — build tooling
│   ├── libfetch.py               ← resolve + download pinned libs into vendor/, verify SRI hash
│   └── bundle.py                 ← export: inline-to-single-file  OR  assemble-folder-bundle
│
└── references/                   ← NEW — progressive disclosure (keeps SKILL.md short)
    ├── libraries.md              ← catalog: what each lib is for, when to prefer it over bespoke
    ├── charts.md                 ← Chart.js / D3 themed integration snippets + gotchas
    ├── diagrams-math.md          ← Mermaid + KaTeX snippets (KaTeX font embedding caveat)
    ├── three-motion.md           ← Three.js + GSAP snippets, lazy-load-per-slide pattern
    └── code-media.md             ← highlight.js, embeds, video
```

`SKILL.md` stays under ~500 lines. The library detail lives in `references/` and is read only when a deck actually needs it.

---

## 3. The local library directory (`vendor/`)

A **manifest-driven, pinned, hash-verified** set of libraries committed into the skill (since this repo is version-controlled, committing makes the skill reproducible and truly offline — that's the whole point of "a local directory").

`vendor/manifest.json` — one entry per library:

```jsonc
{
  "chartjs": {
    "version": "4.4.1",
    "files": ["chart.umd.min.js"],
    "integrity": "sha384-…",
    "license": "MIT",
    "source": "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
    "use_when": "multi-axis / mixed / time-series charts beyond slidegen's inline SVG",
    "offline_notes": "single JS file, no extra assets — inlines cleanly"
  },
  "katex": {
    "version": "0.16.9",
    "files": ["katex.min.js", "katex.min.css", "fonts/*.woff2"],
    "integrity": "sha384-…",
    "license": "MIT",
    "use_when": "LaTeX math typesetting",
    "offline_notes": "CSS references woff2 fonts — bundler must base64-embed them for single-file export"
  }
}
```

**Curated core set** (committed, kept lean):

| Family | Library | Why it earns its place |
|---|---|---|
| Charts | **Chart.js** (+ optional D3) | rich/interactive charts past slidegen's hand-built SVG |
| Diagrams | **Mermaid** | flowcharts, sequence, gantt from text |
| Math | **KaTeX** | LaTeX equations |
| 3D | **Three.js** | 3D scenes / product/geometry visuals |
| Motion | **GSAP** | choreographed timelines beyond CSS keyframes |
| Code | **highlight.js** | real syntax highlighting (vs hand-spanned `.k/.fn/.s`) |

Heavy/rare libs (e.g. ECharts, full D3 plugins) stay **lazy** — listed in the manifest with a source URL but fetched on demand by `libfetch.py` rather than committed, to keep the repo lean.

---

## 4. "Load on demand" — two layers

**Build-time (the main mechanism).** A deck only pulls the libraries it actually uses. The agent declares them once in the deck head:

```html
<meta name="deck-libs" content="chartjs,katex">
```

`bundle.py` reads that and resolves *only* those entries. No deck ever carries libs it doesn't use.

**Runtime lazy-load (optional, for heavy libs).** For something like Three.js you don't want it parsed until the one slide that needs it is reached. A tiny helper in the template:

```js
loadLib('three').then(() => initScene());   // injects the local <script>, resolves when ready
```

`loadLib` injects from the local `vendor/`/`lib/` path (works offline), so heavy 3D doesn't tax the rest of the deck.

---

## 5. Hybrid export (`scripts/bundle.py`)

The agent develops the deck referencing local `vendor/` files, then runs one command to produce the deliverable:

- `bundle.py deck.html --mode single` → reads each referenced local `<script src>`/`<link>`, **inlines** it (base64 for fonts/wasm), emits **one portable `.html`**. Primary deliverable — opens anywhere.
- `bundle.py deck.html --mode folder` → copies `deck.html` + only the referenced libs into `out/` with a clean relative `lib/`. The editable/shareable bundle.

Default: build `single` for the user (portability), keep `folder` available for editing. The bundler also strips `vendor/` libs the deck didn't reference.

---

## 6. Keeping offline render & self-inspection working

`render.sh` gains **`--allow-file-access-from-files`** so headless Chrome can load the sibling `vendor/`/`lib/` scripts over `file://` (without it, local subresource loads are blocked and you'd get blank charts — same failure mode as the CDN problem today). Everything else in the render/inspect loop (per-slide PNGs, contact sheet, brightness checks) is unchanged. Because the libs are local, **what the agent inspects is what the user gets** — the whole reason for vendoring rather than CDN-linking.

`Pitfall 7` (headless mis-measures JS/animation state) extends naturally to library-driven canvases: render with `--force-prefers-reduced-motion` and/or bake the finished state, since Chart.js/Three.js animate via `requestAnimationFrame`.

---

## 7. Decision guidance baked into the skill (so it doesn't over-reach)

The skill keeps **offline-first bespoke as the default** and treats libraries as an escalation, documented in `references/libraries.md`:

- Simple line/bar/donut/pie/gauge → **slidegen.py** (inline SVG, zero deps). *Don't* load Chart.js for these.
- Multi-axis, mixed chart types, dense/time-series, live interactivity → **Chart.js**.
- A flowchart/sequence/gantt → **Mermaid** (don't hand-draw it).
- Equations → **KaTeX**.
- True 3D / parametric geometry → **Three.js** (lazy-loaded).
- Complex choreography across many elements → **GSAP**; otherwise CSS keyframes.

Each reference file shows the **themed** integration (every library wired to the `:root` variables so it recolors with the deck) plus the offline gotcha for that lib.

---

## 8. Licensing / version-control hygiene

Because this lands in a version-controlled, shareable skill: `manifest.json` records SPDX license + source per lib, `libfetch.py` verifies an SRI hash on download (supply-chain safety), and `vendor/NOTICES.md` aggregates the license texts. All committed libs are MIT/BSD/Apache-class — no copyleft surprises in a redistributed deck.

---

## 8b. Reproducibility & quality for animations / charts / graphs (the priority)

Pinning bytes only gets you *input* reproducibility. The thing that actually bites with charts and animation is **render** reproducibility — Chart.js, Three.js and GSAP all drive motion through `requestAnimationFrame`, which headless Chrome's virtual-time clock freezes at an arbitrary mid-frame, so two renders of the "same" deck can differ. The design treats this as a first-class concern:

1. **A single deterministic render mode.** The template exposes one global flag (e.g. `<html data-static>` set by the renderer) that every library integration reads and responds to by **jumping to its finished state** instead of animating: Chart.js `options.animation = false`; GSAP timelines `.progress(1)`; Three.js renders one fixed frame at a pinned camera; CSS entrances fall back to their resting base state (the existing `prefers-reduced-motion` discipline). The live deck still animates for the audience — only the *capture* is frozen at the end state. This makes "what the agent inspects" deterministic and identical to the audience's final frame.

2. **Seeded randomness.** Anything generative (particle fields, jittered layouts, randomized chart demo data) must draw from a **seeded RNG** the template provides, never bare `Math.random()`. Same seed → same picture, every render. The reference snippets all use it.

3. **Golden-frame self-check.** Add a reproducibility gate to the inspect loop: render each slide **twice** and assert the PNGs are pixel-identical (`compare -metric AE`). Any non-zero diff means residual nondeterminism (an unseeded random, an un-frozen animation) and is flagged before the deck is presented. This is cheap and catches exactly the class of bug you're worried about.

4. **Quality bar baked into the reference snippets.** Each `references/*.md` integration is a *known-good, themed, deterministic* example — correct axis labels/units, legible contrast against the dark theme, the `data-static` handling already wired, and a note on the lib's specific gotcha. The agent adapts a proven snippet rather than improvising chart config from scratch, which is where quality usually slips.

The net: pinned+hashed libs give reproducible inputs, `data-static` + seeded RNG give reproducible renders, and the golden-frame check proves it automatically.

## 9. Build order (proposed)

1. Scaffold `vendor/manifest.json` + `scripts/libfetch.py`; fetch & hash-verify the core six.
2. Update `render.sh` (`--allow-file-access-from-files`) and add the `loadLib` helper + `<meta deck-libs>` convention to the template.
3. Write `scripts/bundle.py` (single + folder modes, incl. KaTeX font base64).
4. Write `references/libraries.md` + per-family snippet files (themed integrations).
5. Add the lean "When to reach for a library" section to `SKILL.md`.
6. Build one **demo deck per family** (a Chart.js slide, a Mermaid slide, a KaTeX slide, a Three.js slide) and run them through `render.sh` to prove the offline loop end-to-end.
7. **Eval loop:** test prompts that each *should* trigger a library (e.g. "add a 3D rotating model of our product", "put the sequence diagram of the auth flow on a slide") plus near-misses that should stay bespoke (e.g. "a simple bar chart of Q4 revenue" → slidegen, no Chart.js). Review outputs, iterate, then optimize the description.

---

## Resolved decisions

- **Commit the vendored libs.** Size isn't a concern; the whole core set is committed (pinned + SRI-hashed) so a fresh clone is fully offline and reproducible with no fetch step.
- **Priority is quality + reproducibility of animations/charts/graphs**, addressed by §8b (deterministic `data-static` render mode, seeded RNG, golden-frame pixel-diff self-check, and known-good themed reference snippets).
