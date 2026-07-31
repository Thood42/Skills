# Slides Skill → Standalone HTML Slide Editor — Evaluation & Plan

> Status: planning doc, written 2026-06-18. Decisions locked so far: **hybrid editing model**
> (templates as the base, free-object overrides on top) and **pure single standalone HTML**
> distribution. This file is meant to be re-read at the start of future sessions before any
> implementation work begins.

---

## 0. TL;DR

The slides skill already ships a **data-driven rendering engine** (`SG.data` JSON → layout
registry → `SG.render` → DOM, plus export/import/print). That engine is ~70% of the read-only
half of an editor. What's missing is the **authoring half**: a UI to mutate `SG.data`, direct
manipulation (drag/resize), per-object theming, slide management, persistence, and undo.

The plan is to build the editor as a **second mode of the same engine** ("present mode" vs
"edit mode"), keep everything in one self-contained `.html`, and adopt a **hybrid model**: every
slide is still a template from the registry, but the engine grows an optional `overrides` channel
that lets any element be repositioned/restyled and lets free-floating elements be added on top.
The structured layout stays the fast path; the free canvas is the escape hatch — which is exactly
the philosophy the skill already states for the `raw` layout, generalized.

---

## 1. Evaluation of the current skill

### 1.1 What's actually there (verified by reading the files)

```
slides/
├── SKILL.md                      (32K)  workflow, data model, theming, pitfalls
├── reference-deck.html           (52K)  HAND-AUTHORED deck + small SG runtime — NOT data-driven
├── reference-deck.json           (28K)  canonical content
├── examples/theme-gallery.html   (92K)  ← the REAL data-driven engine lives here
├── examples/theme-gallery.json   (12K)
├── animation-chart-gallery.html  (56K)  showcase
├── slidegen.py                   (60K)  23 animations + 6 interactive charts → paste-ready HTML
├── render.sh                            headless PNG/PDF capture (deterministic)
├── scripts/  deckdata.py assets.py libfetch.py bundle.py
└── references/  layouts.md audiences.md themes.md libraries.md charts.md diagrams-math.md
                three-motion.md code-media.md
```

### 1.2 The engine (the part that matters for an editor)

Found in `examples/theme-gallery.html`, `<script id="deck-engine">`:

- **Single source of truth in memory:** `SG.data` is the parsed deck JSON.
- **Layout registry:** `var L = SG.layouts = {}` maps `layout name -> function(content) -> innerHTML`.
  ~24 layouts. Pager/progress are derived by the renderer, never stored.
- **Re-entrant render:** `SG.render(deckEl, data)` rebuilds the whole DOM from data. Importing
  new JSON just calls render again — no reload. This is the key editor primitive: *mutate data,
  call render.*
- **Theming via CSS variables:** global `:root`, deck `defaults`, and per-slide `theme` patches
  written as inline scoped variables on the `<section>`. Per-object theming does not exist yet but
  the mechanism (scoped CSS vars) extends cleanly to it.
- **Safe content:** `esc()` escapes text; `rich()` allows `[[glow]]`, `**bold**`, `` `mono` ``.
- **Assets:** icons/images/styles resolved from an inlined `<script id="deck-assets">` registry;
  `assets.py` inlines only referenced assets → stays offline/single-file.
- **Controls already present:** keyboard nav, `E` export JSON, `I` import JSON, `P` print/PDF,
  `D` toggle docs, `F` present (fullscreen). Responsive `transform: scale` fit to a 1280×720 stage.
- **Deterministic capture:** `SG.static`, seeded PRNG (`SG.rng`), `finalizeAnimations()` for print.

### 1.3 Problems / debt to fix along the way

1. **Engine/template mismatch.** `SKILL.md` says "copy `reference-deck.html` and edit its JSON,"
   but `reference-deck.html` is the *old hand-authored* deck with no `deck-data`/registry. The
   data-driven engine is in `examples/theme-gallery.html`. **Pick one canonical engine file** and
   make SKILL.md point at it. The editor must be built on the data-driven engine, not the
   hand-authored deck.
2. **No persistence.** Edits live only in `SG.data` until you press `E`. An editor needs autosave.
3. **No mutation API.** Everything that changes data today comes from a full JSON import. The
   editor needs granular, undoable operations.
4. **Layouts emit `innerHTML` strings.** Fast to render, but there are no stable element identities,
   so direct manipulation has nothing to "grab." This is the single biggest architectural change
   the editor forces (see §3.2).
5. **Size budget.** theme-gallery.html is already 92K with content. Adding a full editor inline
   will push a working deck toward several hundred KB. Fine for `file://`, but it means we must be
   deliberate about what ships in "edit build" vs "present build" (see §5.3).

### 1.4 What the current skill is GOOD at (preserve these)

Offline-first single file; deterministic headless render/verify loop; structured-layout
philosophy that prevents ugly decks; clean theming; export/import already proving the
data-round-trips. The editor should be **additive** — never regress present-mode or the render gate.

---

## 2. Target product

A single `.html` file that is simultaneously:

- a **presentation** (today's behavior, unchanged when you're not editing), and
- an **editor** for itself — open it, press `Edit`, and you get direct manipulation, a slide
  panel, a theme panel, an object inspector, add/remove/reorder, undo/redo, and autosave —
  with **no install, no server, no build step**, working from `file://`.

"The file edits itself" is the product thesis. Everything below serves keeping that true while
adding power.

---

## 3. Architecture for the hybrid editor

### 3.1 Two modes, one engine

Add `SG.mode ∈ {present, edit}`. Present mode is exactly today. Edit mode mounts the editor UI as
an overlay (`.deck-editor` chrome that is excluded from print and from `data-static` capture, like
`.deck-ui` already is). Toggle with a key (`Cmd/Ctrl+E`) and a button. The deck stage itself is
shared; edit mode just adds interaction handlers, selection outlines, and panels around it.

### 3.2 The core change: stable element identity + an overrides channel

Today a layout function returns an HTML string with no IDs. To manipulate objects we need each
meaningful element to be addressable and individually styleable. Plan:

- **Element refs.** Layout functions tag their primary elements with a stable `data-el` key
  (e.g. `title`, `subtitle`, `stat[2]`, `body`). These keys are deterministic from the content
  shape, so they survive re-render. (Implementation: a tiny helper that wraps emitted nodes and
  assigns `data-el` from a path.)
- **Overrides object per slide.** Extend the slide model with an optional `overrides` map keyed by
  `data-el`:

  ```jsonc
  { "layout": "stat-grid",
    "content": { ... },
    "overrides": {
      "title":   { "x": 120, "y": 60, "rot": -2, "theme": { "--ink": "#ffd166" } },
      "stat[2]": { "x": 800, "y": 420, "scale": 1.2, "hidden": false }
    },
    "freeObjects": [
      { "id":"f1", "type":"text", "x":900,"y":120,"w":300,"text":"Draft","theme":{"--ink":"#f66"} },
      { "id":"f2", "type":"image", "asset":"logo", "x":40,"y":40,"w":160 }
    ]
  }
  ```

  - `overrides[key]` = positional + style deltas applied to a template element **after** the
    layout renders (absolute transform layered over the template's normal flow position).
  - `freeObjects` = elements that don't come from the template at all (the PowerPoint-style escape
    hatch): text boxes, images, shapes, icons placed anywhere.
  - **Per-object theme** = a `theme` patch on an override or free object, written as scoped CSS
    variables on that element — the exact same mechanism as per-slide theme, one level deeper.
    This directly satisfies "toggle themes on specific objects."

- **Why this preserves the philosophy.** A deck with no `overrides`/`freeObjects` renders and
  exports byte-for-byte like today. Structured layouts remain the default and the fast path; the
  free canvas is opt-in per element. This is the hybrid the user picked.

### 3.3 Mutation API + command pattern (enables undo/redo)

All edits go through a small command layer instead of touching `SG.data` directly:

```
SG.edit.apply(cmd)   // cmd = {type, ...payload}; mutates SG.data, pushes inverse to undo stack
SG.edit.undo() / redo()
```

Command types (initial set): `setContent(slide, path, value)`, `setOverride(slide, key, patch)`,
`addFreeObject`, `removeObject`, `moveObject`, `resizeObject`, `setObjectTheme`, `setSlideTheme`,
`setGlobalTheme`, `addSlide(layout, atIndex)`, `removeSlide`, `reorderSlide`, `duplicateSlide`,
`changeLayout(slide, newLayout)`. Each is invertible → undo/redo is free. After apply, do a
**targeted re-render** of the affected slide (not the whole deck) for snappiness; full re-render
on structural changes.

### 3.4 Direct manipulation layer

On the selected element: draw a selection box with resize handles + a rotate handle. Drag updates
`overrides[key].x/y` (or the free object's x/y) live via `moveObject`/`resizeObject` commands.
Snapping: to a grid, to slide center lines, and to other objects' edges (cheap alignment guides).
Inline text editing: double-click makes the element `contenteditable`; on blur, commit text back
to `content` via `setContent` (strip back to the `[[ ]]`/`**`/`` ` `` mini-syntax on the way in).

### 3.5 Persistence

- **Autosave to `localStorage`** keyed by a deck id in `meta`. On boot, if a newer autosave exists
  than the inlined `deck-data`, offer "Restore / Discard."
- **"Save" = re-inline.** Because the goal is a single portable file, provide an explicit
  **"Download edited .html"** action: serialize current `SG.data` (+ assets) back into the
  `<script id="deck-data">` block of a clone of the current document and trigger a download. This
  is the standalone analog of "save file." (Browsers can't overwrite the opened `file://` in place;
  download-as is the portable workaround. Document this clearly to the user.)
- Keep JSON export/import as the interchange/backup path.

### 3.6 Editor UI surfaces

- **Left: slide navigator** — thumbnails (render each slide into a scaled, non-interactive clone),
  drag to reorder, +/duplicate/delete, layout badge.
- **Right: inspector** — context-sensitive: when an element is selected, show its content fields,
  position/size, and a per-object theme toggle; when nothing is selected, show slide-level settings
  (layout picker, slide theme, ambient).
- **Top: global toolbar** — undo/redo, add slide, add free object (text/image/shape/icon),
  global theme switcher, present, download .html, export JSON.
- **Theme panel** — pick a named theme (re-themes globally by swapping `:root` vars), or tweak
  individual tokens with color inputs; live preview. This covers "changeable themes globally" and,
  via the inspector's per-object theme, "toggle themes on specific objects."

---

## 4. Feature roadmap (phased)

Each phase is independently shippable and keeps present-mode intact.

**Phase 0 — Consolidate & de-risk (prerequisite).**
Pick the canonical data-driven engine file, fix the SKILL.md mismatch, add `data-el` identity to
all layout functions, and add a no-op `overrides`/`freeObjects` pass to the renderer (renders
identically when empty). Add the render-gate test so we can prove no regressions. *No UI yet.*

**Phase 1 — Edit mode shell + selection + inline text.**
`SG.mode` toggle, editor chrome, click-to-select with selection box, double-click inline text edit,
the command layer + undo/redo, autosave to localStorage, and "Download edited .html." Smallest
useful editor: you can fix typos and restyle text without touching JSON.

**Phase 2 — Direct manipulation.**
Drag/resize/rotate writing to `overrides`; snapping + alignment guides; free text objects. Now
it's a real canvas on top of templates.

**Phase 3 — Slide management.**
Slide navigator with thumbnails, add/duplicate/delete/reorder, layout picker (`changeLayout`),
ambient picker. New-slide creation from a template gallery.

**Phase 4 — Theming UI.**
Global theme switcher + token editor; per-slide theme; per-object theme toggle. Live preview.

**Phase 5 — Rich objects & assets.**
Free image/icon/shape objects, in-editor asset import (drag a PNG in → base64-inline it), and
hooking `slidegen.py` chart/animation fragments in as insertable objects.

**Phase 6 — Polish.**
Keyboard shortcuts, multi-select, copy/paste objects across slides, alignment/distribute tools,
z-order controls, "reset element to template" (drop an override), accessibility pass on the editor
chrome, and the headless verification of edited decks.

---

## 5. Distribution: standalone HTML vs. packaged software (the core trade-off)

The user chose **pure single standalone HTML**. Here's the honest trade-off analysis so the choice
stays informed, plus how to make the standalone path work well.

### 5.1 Pure single standalone HTML (chosen)

**Pros:** zero install; works offline from `file://`; trivial to share (email the file); nothing to
trust beyond the file itself; the "file edits itself" thesis is literally true; no version skew
between app and document; survives indefinitely (no server to rot).

**Cons / constraints:**
- **No runtime npm / no bundler** — everything ships inlined. Third-party libs must be vendored
  inline (the skill already does this via `bundle.py`/`libfetch.py`), which inflates file size.
- **No real filesystem** — can't overwrite the opened file in place; "save" becomes "download a new
  .html." Manageable but must be communicated.
- **Size** — a full editor + deck + any libs in one file can reach hundreds of KB to a few MB.
  Acceptable for local use; clarify it's not a web-served asset.
- **No cross-file project** — one deck = one file. Fine for this product.
- **Browser storage caveats** — `localStorage` is per-origin and `file://` origins are quirky
  across browsers; treat autosave as best-effort and make explicit download the source of truth.
- **DX ceiling** — authoring a large app as inline `<script>` is harder to maintain than a modular
  codebase. Mitigate with a build step that *concatenates* source modules into the single file at
  skill-dev time (see §5.3) — the *output* is still one file, the *source* isn't.

### 5.2 Traditional packaged delivery (rejected for now — for the record)

Options were: (a) a static web app (Vite/React) hosted or shipped as a folder; (b) an Electron/Tauri
desktop app; (c) a PWA. **Pros:** best DX, full npm ecosystem, real file save dialogs (Tauri/Electron),
code-splitting, easier testing. **Cons:** install/hosting friction, trust surface, update/version
management, and it breaks the "the deck *is* the app" simplicity. Heavier than the user's need.
**Keep as a future option** only if the editor outgrows a single file (e.g. wants plugins, a
component marketplace, or multi-deck projects).

### 5.3 Recommended middle path for the *standalone* build

Author the editor as **separate source modules** in the skill repo (`editor/` with `core.js`,
`dragdrop.js`, `inspector.js`, `theme.js`, etc.) and add a **build script**
(`scripts/build_editor.py` or extend `bundle.py`) that **inlines them into one `.html`**. This gives
maintainable source + a single-file deliverable — the best of both without changing what the user
receives. Ship two build profiles:

- **`present` build** — engine + deck only (today's output; smallest).
- **`edit` build** — engine + deck + editor (the new output).

So a finished deck can be delivered lean, and the editable version is a superset. The `<script>`
blocks for the editor are gated behind `SG.mode`/a flag so even the edit build presents cleanly.

### 5.4 Portability checklist (keep the file truly self-contained)

Inline all assets (icons/images/styles via `assets.py`); vendor any libs inline (no CDN); fonts via
`<link>` with DejaVu fallbacks (already the pattern) — or inline a woff2 if full offline fidelity is
required; no network calls at runtime; autosave degrades gracefully if `localStorage` is blocked;
"download edited .html" is the canonical save.

---

## 6. Risks & mitigations

- **Identity stability across edits.** If `data-el` keys shift when content changes, overrides
  detach. *Mitigation:* derive keys from stable paths (array index + field), and on destructive
  content edits, garbage-collect orphaned overrides with a warning rather than silently dropping.
- **Free canvas vs. responsive scale.** Objects are positioned in the 1280×720 stage coordinate
  space, which already scales as a unit — so absolute coords stay correct under the `transform:
  scale` fit. *Keep all editor math in stage coordinates, convert pointer events through the
  current scale.*
- **Print/PDF fidelity of overrides + free objects.** The print path must honor transforms and
  per-object themes. *Extend `finalizeAnimations`/print CSS and add overrides to the render gate.*
- **Scope creep toward a full design tool.** Resist. The structured templates are the value;
  free-canvas is the escape hatch, not the headline. Phase gates enforce this.
- **File size.** Monitor; lazy-vendor heavy libs only when a deck uses them (already supported);
  keep the editor JS lean and dependency-free (vanilla, no framework) to protect the single-file
  goal.
- **Regression of present-mode / render gate.** Every phase ends by running
  `./render.sh` + the brightness check on a deck with and without overrides.

---

## 7. Concrete next actions (for the next working session)

1. **Decide canonical engine file** and reconcile `SKILL.md` (Phase 0). Likely promote the
   theme-gallery engine into the reference deck so "copy & edit JSON" is true again.
2. **Spike `data-el` identity + empty overrides pass** in a throwaway copy; prove byte-identical
   render when no overrides exist (run the render gate).
3. **Build the command layer + undo/redo** against `SG.data` with no UI; unit-exercise via console.
4. **Stand up edit-mode shell** (toggle, chrome, selection box) — Phase 1.
5. **Set up the module→single-file build** (`scripts/build_editor.py`) with `present`/`edit`
   profiles so source stays modular while output stays standalone.
6. Then proceed Phase 2→6 per §4.

> When resuming: re-read §1.2 (engine), §3.2 (identity + overrides — the load-bearing decision),
> and §5.3 (build profiles). Those three are what the whole editor hangs on.

---

## 8. Addendum (2026-06-18) — refactors for the `slide-forge` skill

A first build of the editor now exists, packaged as the **`slide-forge`** skill
(`Skills/slide-forge/`). Building it as a *skill invocation* (Claude generates a deck, the file
ships an editor) rather than a hand-run dev project forced a few deviations from §1–§7. Recording
them so the plan and the skill stay in sync.

### 8.1 What shipped vs. the phased plan

The skill bundles `editor-template.html` = a **copy of the data-driven engine
(`examples/theme-gallery.html`) with the editor layered on additively** — exactly the "additive,
present-mode untouched" rule from §1.4. Verified: with the editor blocks stripped, the file is
**byte-identical** to the original engine, and a 15-assertion fake-DOM harness passes for the data
layer (add/dup/delete/move slides, undo/redo, theme apply, free objects, overrides, and
download-serialization round-trip). So Phases 0–5 are substantially present in one pass; Phase 6
polish (multi-select, copy/paste across slides, distribute tools, drag-reorder thumbnails,
alignment guides, accessibility pass) is deferred.

### 8.2 Necessary refactors (deltas from §3–§5)

1. **Identity is render-time, not authored.** §3.2 imagined layout functions emitting `data-el`.
   To stay additive and avoid editing 24 layout functions, `data-el` is instead assigned by a
   **post-render `decorate()` pass** to each top-level content block (`b0`, `b1`, …). Cheaper and
   keeps the engine untouched, at the cost of block-level (not deep) granularity in v1. *Update §3.2:
   prefer the post-render tagging approach; deep/nested identity is a Phase-6 refinement.*
2. **Inline text edits live in `overrides[key].html`, not back in `content`.** Mapping arbitrary
   contenteditable output back into typed `content` fields is unreliable across 24 layouts. Storing
   the edited block HTML as an override is layout-agnostic, undoable, and reversible ("Reset to
   template"). *Update §3.4: inline edits commit to an override `html`, with `content` remaining the
   generator's output.*
3. **Single-file now, build-step deferred.** §5.3 recommended authoring modular source + a build
   script that inlines to one file. For the skill, the editor is small enough (~32 KB JS, dependency-
   free) that it ships **inlined directly** with no build step — simpler for a skill that just copies
   a template. The modular-source/`build_editor.py` path stays the recommendation **if** the editor
   grows past Phase 6. *Update §5.3: build profiles become optional/future; the skill delivers the
   inlined `edit` build as the single template.*
4. **Undo is snapshot-based, not per-command inverses.** §3.3 proposed invertible commands. Shipped
   with whole-deck JSON snapshots instead — trivially correct, cheap for decks, and simpler to keep
   bug-free. *Update §3.3: snapshot stack is the chosen implementation; invertible commands only if
   memory ever becomes a concern.*
5. **Generation contract (new, skill-specific).** The skill's job is to produce the *first* deck:
   ask audience + theme, plan the narrative, copy the template, replace `deck-data`, theme via
   `:root`+font swap, inline **only user-provided** assets (no fetching/generating imagery), and
   verify the JSON parses. The editor channels (`overrides`/`freeObjects`) are left **absent** at
   generation time — they're the user's to create. This keeps generated output clean and identical
   to a static deck until the user edits.

### 8.3 Carried-forward risks (unchanged, now concrete)

- **Positional `data-el` keys** can detach an override if `content` shape changes later — accepted,
  recoverable via Undo / Reset.
- **Real-browser verification still owed.** The data layer is unit-verified, but drag/resize/rotate,
  handles, the fit math, and print/PDF of overrides need a browser pass (no headless Chrome in the
  build sandbox). First real-use QA item.
- **File size** grows with the editor (~128 KB template before content) — fine for `file://`, still
  worth watching if libs get vendored in.

### 8.4 Next actions for slide-forge specifically

Run the skill-creator eval loop (generate sample decks with/without the skill, review), then a
real-browser QA of the edit interactions, then optional Phase-6 polish. Description-trigger
optimization after the content is settled.

---

## 9. Addendum (2026-06-20) — inspector/interaction refactor

A focused refactor to make edits feel clearly tied to the selected element and to give text editing
one obvious entry point. Implemented on branch `editor-refactor` in `editor-template.html`; docs in
§8 / `references/editor.md` / `SKILL.md` updated to match.

1. **One formatting surface.** The sidebar's inline-emphasis chips (and the dead `wrapState()` /
   `emphasisRow()` helpers + their `.forge-emph` CSS) were removed. Bold / glow / mono is now applied
   **only** on-canvas via the floating toolbar over a text selection. Typed markers
   (`**`/`[[ ]]`/`` ` ``) still render — `rich()` is untouched — so authored content is unaffected.
2. **Right-click to edit, not double-click.** The `dblclick` → `startEdit` path was replaced by a
   `contextmenu` handler + a small `#forge-ctx` menu (**✎ Edit text** on leaf text, **Select**,
   **Reset/Delete**). `pointerdown` now ignores non-left buttons so right-click never starts a
   drag/select. Editing still commits to `overrides[key].html` exactly as before (§8.2.2 unchanged).
3. **Live feedback.** Inspector field changes now flash the selected node (`.forge-live` box-shadow
   pulse, fired from `reflow()`), so it's visually obvious which element the sidebar drives. Uses
   box-shadow, not outline, to avoid fighting `.forge-sel`'s `!important` selection outline.
4. **Autosave coalesced.** `reflow()` / `renderLive()` now call a debounced `F.saveDebounced()`
   (~150ms) instead of writing `localStorage` on every slider/color/nudge event; structural edits
   still save immediately through `F.commit`.

Closes part of the §8.3 "real-browser verification owed" item: these interactions were QA'd in a
browser (right-click menu, on-canvas edit, inspector pulse, no console errors).

---

## 10. ADR (2026-07-06) — v3 engine: node-tree layouts with authored identity

**Status: accepted, implemented this session.** Follows the design critique in
`../slide-forge-design-critique.md` (Option B).

### Decision

Replace `layout(content) -> innerHTML string` with `layout(content) -> DOM node tree` built by a
tiny zero-dependency builder `N(sel, attrs, kids)` (~30 lines). Layout functions now author three
attributes directly:

- **`data-el`** (attrs.key) — a stable, authored identity key derived from content paths
  (`title`, `stats.2`, `left.items.0`), replacing the positional post-render `b0`/`b0.1` tagging.
- **`data-bind`** (attrs.bind) — the `content` path a text leaf renders; on-canvas edits write
  back to that path deterministically. The value-matching `findContentField` heuristic and most
  `overrides[key].html` shadowing are gone (the html override remains only as fallback for
  unbound composites, `raw` slides, and free html objects).
- **`data-arr`** (attrs.arr) — the content path of the array a container renders, replacing the
  length-matching `arrayForContainer` inference. Item ops (add/duplicate/remove) parse the item
  index from the element key, so interleaved DOM (e.g. pipeline connectors) no longer defeats them.

### What this bought (implemented with it)

1. **Override survival.** Item add/duplicate/remove/reorder ops remap sibling override keys
   (index shift) instead of silently detaching them; a GC pass in `F.commit` drops overrides whose
   key no longer exists in the rendered slide (logged, undoable).
2. **Targeted re-render.** `SG.renderSlide(deck, i)` rebuilds one `<section>`; `F.renderLiveSlide()`
   uses it for content typing. Full render only on structural/global changes.
3. **True w/h resize with reflow.** Overrides gain `w`/`h`; corner-drag resizes width (text
   rewraps; free boxes/copied groups also height). Alt+corner keeps the old scale behavior.
4. **Undo coalescing.** Continuous inputs (color pickers, token grid, nudges) push one snapshot
   per gesture (`F.pushUndoCoalesced`), ending the picker-drag undo-stack flood.

### Migration (v2 -> v3 decks)

`meta.schemaVersion` bumps to 3. Positional override keys (`/^b\d/`) are remapped once, lazily,
at first decorate: the old block/keyable-children walk is replayed against the freshly rendered
DOM to map `b2.1` -> the element's new authored key; unmappable keys are dropped with a console
note. `raw` slides keep positional keying (their children are author HTML with no schema), so
old raw-slide overrides survive unchanged.

### Explicitly rejected (again)

Splitting into an app + emitter (critique Option C): editing power did not require leaving the
single file, and version skew between studio and emitted decks remains the trap §5.2 identified.
Revisit only for out-of-file needs (asset libraries, PPTX round-trip, collaboration).

### Known limits of v3 (accepted)

- Composite elements (cover/closing title+accent, stat `.num` count+unit, code `<pre>`) are not
  `data-bind`-able; on-canvas edits there still fall back to an html override. Their parts are
  individually keyed where feasible instead.
- Authored keys for array items are still index-based (`stats.2`), so identity follows the slot,
  not the datum; the remap-on-op + GC machinery is what makes that safe.
- The parity harness (`/tmp` jsdom scripts, see commit message) normalizes attribute order and
  ignores the new `data-*` attributes; small documented markup deltas exist where leaves gained
  wrapper spans to become bindable (timeline desc, hero-asym value/unit).

---

## 11. ADR (2026-07-31) — UI import: images, diagrams, links, sandboxed embeds

**Status: accepted, implemented this session.** Full design in `slide-forge-media-plan.md`; this
entry is the short version + the decisions actually made, matching the format of §10.

### Decision

Four additive capabilities, landed in strict dependency order (asset registry → objects → layouts →
links → embeds), each verified in a real browser rather than assumed from code review alone (the
jsdom harness can't exercise canvas/Image decoding or live iframe loads — see `tests/README.md`):

1. **Asset registry v2** (`SG.assets.images[name]`): legacy plain string, or
   `{store:"embedded",src,w,h,bytes,type,alt}` / `{store:"linked",path,w,h,bytes,type,alt}`. New
   `svg{}` bucket for diagrams. `SG.imageMeta`/`imageURL`/`svgMarkup` normalize all shapes — a deck
   with no imported assets is byte-for-byte unaffected (same additive guarantee as §10's v3 engine).
2. **`SG.unavailable()`** — one component for every "this needs the network and can't reach it"
   case: missing linked image, blocked/unreachable embed, offline link. Same markup/wording in
   editor, present, thumbnails, speaker view, and print.
3. **Image/svg free objects** + four new v3-identity layouts (`image`, `media-split`, `gallery`,
   `diagram`) + an asset library panel (import/rename/replace/delete/link-conversion) in `src/media.js`
   + `src/editor.js`.
4. **Links** (`href` on any override/free-object) and **embeds** (`type:"embed"` free object + the
   `embed` layout) — a sandboxed iframe behind an edit-mode-always-on "shield," click-to-interact by
   default in present mode, with a 6s heartbeat and CSS-only (unconditional, `!important`) print/
   static posterization.

### Decisions taken over the default/safe option (media plan §7)

- **Offline guarantee dropped for network-backed elements**, deliberately, in exchange for one
  consistent failure mode everywhere (`SG.unavailable()`) rather than per-case blank states. Images
  and diagrams remain fully offline; only links and embeds trade that away, and only when the author
  chooses to use them.
- **Clipboard image paste deferred.** Import lands via drop-on-canvas, the toolbar, and the library
  panel; existing internal copy/paste is untouched rather than re-plumbing the Ctrl+V handler
  (`wireKeys`) that currently `preventDefault`s it for the editor's own clipboard.
- **Generation-time assets always embed, no size ceiling** — `scripts/build.py`'s 450 KB budget was
  clarified (not changed) to cover the template/code only, built with an empty asset registry; it
  says nothing about a delivered deck's size. An opt-in `store:"linked"` + `assets/` folder exists
  for people who'd rather ship deck.html + images side by side.

### What this bought (implemented with it)

1. **One failure mode, not four.** A missing linked image, a blocked embed, and an offline link all
   render the same small card — recognizable, and never a blank rectangle or a silently-broken frame.
2. **Print never lies about what's live.** `html[data-static]`/`@media print` force every embed's
   poster card visible and the iframe hidden via CSS `!important` alone — no JS state to get wrong,
   and it's correct regardless of what the embed was doing on screen a moment earlier.
3. **Clones can't multiply live loads.** `F.posterize()` is the one function every clone site (sorter
   thumbnails, speaker view, deep-copy) calls before displaying a cloned section, stripping iframes
   and forcing posters visible.
4. **Aspect-safe media manipulation.** Corner-drag on an image/svg free object locks aspect ratio by
   default (Shift frees it) — the deliberate inverse of the text-reflow convention elsewhere in the
   editor, because for media the *shape* is usually what must be preserved.

### Explicitly rejected

- **Mermaid/live diagram rendering** — vendoring a render library is ~1 MB against the 450 KB
  *template* budget (which the deck-size relaxation above does not touch). Diagrams come in as
  sanitized static SVG, which already themes correctly via `currentColor`.
- **A real crop-rectangle tool** — v1 crop is a focal point (`focal:[x,y]`) used with `fit:"cover"`,
  not a second geometry channel with re-encode-on-export. Revisit only if users ask for precise crops.
- **Per-URL reachability checking for external links.** A cross-origin probe can't distinguish 200
  from 404/blocked (opaque response), and polling every URL on every render isn't acceptable anyway.
  Only `navigator.onLine` (device-wide, cheap, honest) drives the link "unavailable" marker.

### Known limits (accepted, verified empirically — not merely predicted)

- **The embed heartbeat is a mitigation, not a detector.** Confirmed in-browser: a site sending
  `X-Frame-Options` frequently still fires the iframe's `load` event (the browser considers the
  navigation complete even though it refused to render), which is indistinguishable from success by
  the 6s-timeout heuristic. CSP `frame-ancestors` refusals more often never fire `load` at all, which
  the timeout does catch. No further engineering in this codebase closes that gap — it would need
  cooperation from the embedded page (e.g. `postMessage`), which is out of scope.
- **Esc-to-restore-the-shield can't reach a cross-origin iframe that already has focus.** Once a user
  clicks past the shield into the embedded page's own content, keystrokes there don't bubble to the
  parent document — an inherent iframe/SOP limitation, not a bug.
- Raster image import's downscale/re-encode path (`F.assets.importFile`, canvas + `Image`) and live
  embed load/timeout behavior are **not** covered by the jsdom test harness (no canvas/Image decoding,
  no subresource fetches there) — both were verified end-to-end in a real browser during
  implementation instead. A future session with a real-browser test runner (Playwright/Puppeteer)
  could promote that into automated coverage; `tests/README.md` flags exactly what's missing.
