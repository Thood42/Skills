# CLAUDE.md

Workspace for **self-contained HTML presentation Skills**. Each deliverable is a single `.html`
file that opens in any browser offline, with no install/server/build step.

## Layout

```
Slides/                 base "slides" skill — data-driven HTML deck generator (present only)
slide-forge/            advanced variant — same engine + an in-deck EDITOR (present + edit)  ← active project
slides-editor-plan.md   architecture & decision record — READ §1.2, §3.2, §8, §10, §11 before editor work
slide-forge-design-critique.md  2026-07-06 design review that led to the v3 engine (§10 ADR)
slide-forge-media-plan.md  images/diagrams/links/sandboxed embeds — READ before touching media (§11 ADR)
slide-forge-editor-ux-plan.md  2026-07-31 design handoff behind the v4 editor UX — READ before editor-UI work
README.md               short index (both skills + plan doc); this file is the source of truth
*.skill                 gitignored build artifacts (zips); rebuilt separately, not tracked
```

`slide-forge/` is the focus. Its headline file is **`slide-forge/editor-template.html`** (~5000 lines,
fully self-contained), BUILT from `slide-forge/src/` by `scripts/build.py` — **edit src/, never the
template** (`build.py --check` verifies sync). `references/` (`layouts.md`, `themes.md`, `editor.md`,
`audiences.md`) is the field reference; `scripts/assets.py` inlines icons/images/diagrams,
`deckdata.py` handles deck JSON, `scripts/validate.py` schema-checks a deck (incl. asset-reference
and href-allow-list checks when validating a `.html` with its registry). `src/media.js` is the
browser-side asset store (import/sanitize/dedupe/gc). `tests/` holds a jsdom harness (parity vs the
frozen v2 build + editor data-layer assertions incl. the media-plan additions) — needs Node, so run
it outside this sandbox; `tests/README.md` notes what jsdom can't cover (raster import, live iframes)
and was instead verified in a real browser.

## How the deck + editor work (`editor-template.html`)

A deck is **JSON** (`<script id="deck-data">`) rendered through a layout registry. In file order:

1. **`SG` globals** — seeded RNG, static-capture flag, lazy lib loader.
2. **slidegen animation library** — `sg-*` CSS classes (entrance + continuous effects).
3. **deck-engine v3** — `SG.data` (parsed JSON) → `L[layout](content)` → **node tree** (built with
   `SG.N`) → `SG.render`. 29 layouts incl. the media set (`image`/`media-split`/`gallery`/`diagram`/
   `embed`, plan §11); pager/progress are derived, never stored. Layouts author identity: `data-el`
   (stable content-path key like `stats.2`), `data-bind` (the content field a text leaf renders),
   `data-arr` (the array a container renders). Per-slide `theme` + per-object theme are scoped CSS
   variables. Re-entrant: mutate data, call render — or `SG.renderSlide(deck,i)` for a single section
   (used by live sidebar typing). `SG.assets` (registry v2: embedded/linked images, svg diagrams) and
   `SG.unavailable()`/`SG.mountEmbed()`/`SG.followLink()` (media plan §11) also live here.
4. **Forge editor** (`#forge-css` + `#forge-editor`) — **additive; present mode is untouched**. A
   deck with no `overrides`/`freeObjects` renders byte-for-byte like a plain deck.

Editor model (load-bearing facts):
- **Source of truth = `SG.data`.** Edits route through `F.do()`/`F.pushUndo` → **snapshot undo/redo**
  + autosave to `localStorage` (debounced). **Save .html** downloads a fresh self-contained file.
- **Identity is AUTHORED (v3):** layout functions emit `data-el`/`data-bind`/`data-arr` themselves;
  `decorate()` only applies overrides/free objects. Exception: `raw` slides still get positional
  `b0`/`b0.0` tags. v1/v2 decks' positional override keys are migrated to authored keys once, at
  first render (`meta.schemaVersion` → 3).
- **Two per-slide edit channels** (absent in generated decks, created by the user in the editor):
  `overrides{}` (geometry incl. `w`/`h` reflow-resize, style, anim, fallback `html`; keyed by
  `data-el`) and `freeObjects[]`. Item add/dup/remove/reorder REMAP sibling override keys; a GC
  pass in `F.commit` drops orphaned overrides (logged, undoable).
- **Inspector (right panel), v4:** home view is **"On this slide"** — one plain-language row per
  element (`stats.2` → "Stat 3 — 12×"), hover-syncs with the canvas, eye toggles
  `overrides[key].hide`. Selecting shows a **contextual** "Selected" panel: identity card, that
  element's own content fields (shared `fieldFor`/`contentForm` renderer), `fs` text-size stepper,
  theme-token swatches + whole-element B/✦/mono, list verbs; geometry/link/animation fold away.
  A **breadcrumb** over the stage walks up the key path; **clicking again** inside the selection
  walks down one level (Alt-click still jumps to the deepest).
- **Text editing = DOUBLE-CLICK** a leaf text element (right-click → **✎ Edit text** also works) →
  `contenteditable`; the floating toolbar (B / ✦ / `<>`) toggles bold/glow/mono on the selection.
  Enter commits, **Esc cancels**. Commit writes to the `data-bind` content path when present;
  unbound leaves (raw slides, derived text) store `overrides[key].html`. (Markers `**bold**` /
  `[[glow]]` / `` `mono` `` still render if typed in content — `rich()` is the renderer.)
- **Stage viewport (v4):** while editing, `fit()` calls the optional `SG.viewTransform()` hook so the
  deck is fitted BETWEEN the panels, times `F.zoom`, panned to centre the selection when ⌖ Focus is
  on. Present mode is untouched (the hook returns null). `scale()` reads the combined transform back
  off `getBoundingClientRect`, so all drag/resize math stays correct at any zoom — don't "fix" it.
- All editor chrome carries `.forge-chrome` (stripped on download, hidden in print/static capture).

## Conventions & environment

- Vanilla JS, **zero dependencies**; keep the single-file/offline guarantee.
- **No Node** in this environment; **Python 3.13** is available. JS can't be lint-checked via `node` —
  verify in a browser instead.
- **Verify the editor:** serve the **repo root** over HTTP (`python -m http.server`) and open
  `slide-forge/editor-template.html?edit` (the `?edit` query auto-opens edit mode). The preview
  tooling's static root is the repo root, so worktree files load via their `.claude/worktrees/...` path.
- Commits use **Conventional Commits** (`feat(slide-forge): …`).

## Git / remote state (as of 2026-07-06)

- Working branch: **`master`**.
- Remote `origin` = `github.com/Thood42/Skills`. Local `master` is **several commits AHEAD of
  `origin/master`** — the entire slide-forge skill + editor are **unpushed**. Don't assume GitHub
  reflects local.
- **`gh` CLI is not installed and there's no GitHub token** → PRs can't be opened/merged
  programmatically here. Integrate via local merge, or push + open the PR in the browser.

## Recent work (2026-08-02) — corner drag resizes BOTH axes

Reported bug: the in-window resize handle only scaled horizontally. Three causes, all fixed in
`src/editor.js` (present mode + the data model untouched; `overrides[].h` already existed):

- `startDrag`'s `size` branch only wrote `h` for `TWO_AXIS_FREE` free objects. Now every element
  takes a height from the Y delta, with a 5px Y **deadzone** (`HDRAG`) so a horizontal-only drag
  still leaves auto-height text free to reflow. `Shift` = aspect lock (image/svg stay locked by
  default, `Shift` frees them); `Alt` = proportional scale, unchanged. `TWO_AXIS_FREE` is gone.
- Most layout blocks are **flex items**, so an explicit height was silently shrunk back by the
  container — `applyOverride` now sets `flex-shrink:0` whenever `w`/`h` is authored. This was the
  real "nothing happens vertically" symptom; watch for it if sizing ever looks lossy again.
- `ovFor` handed each caller its OWN detached stub for an unedited element, so the Inspector and a
  drag wrote to different objects and the last writer wiped the other's keys. Now one-slot cached.
- Also: Inspector shows **Height** for every element (0/blank = natural), `syncGeomFields` keeps
  W/H live during a drag, free text (`type:"txt"`) honours `h`, 4 new assertions in
  `tests/scale-gestures.html` (**19/19 pass in a real browser** — this file needs no Node).

## Recent work (2026-07-31) — v4 editor UX overhaul (design handoff)

Full design + the three deliberate deltas: `slide-forge-editor-ux-plan.md`. What shipped is in
`slide-forge/references/editor.md` ("v4"). Additive as always — present mode, engine, layouts and the
data model are untouched; new data keys are all optional (`overrides[].hide`, `overrides[].fs`,
`freeObjects[].hide`, `freeObjects[].name`) and `meta.schemaVersion` stays **3**.

- Items panel replaces the Elements tree (`elementsTree` is gone; `keyedTree` stayed). Rows = blocks,
  list containers, list items — deliberately NOT the leaves inside an item, and decorative keyed
  nodes (orbs/rails/dots) are filtered out. Names come from `FIELD_LABEL`/`ITEM_LABEL`/`ARRAY_LABEL`.
- Contextual inspector, selection breadcrumb (`F.crumbPath`), click-again-to-drill, `fs` text size,
  theme-token colour swatches (they write `var(--cyan)`, never hex — pitfall #2), whole-element
  marker formatting; manage-items modal (Items | Advanced JSON tabs) over the shared content
  renderer; stage zoom + ⌖ Focus; ⊞ Insert gallery with live scaled miniatures; fuller top bar.
- Gallery miniatures render into an off-screen `.forge-ghost` **slide-sized** section inside `#deck`
  — it must keep `width/height/right/bottom` overridden (`.slide` sets `inset:0`, which stretched it
  to ~100k px and squashed every measurement), and it must never survive into a render or `.slide`
  indices shift.
- ~45 new assertions in `tests/editor-ops.mjs`. **Not run here (no Node)** — every one was mirrored
  and passed in a real browser, which also covered focus centring, gesture math at 200% zoom, live
  previews and the chrome-free downloaded copy.

## Recent work (2026-07-31) — UI import: images, diagrams, links, sandboxed embeds (plan §11)

Full design: `slide-forge-media-plan.md`. Implemented in dependency order (asset registry → objects
→ layouts → links → embeds), each phase committed and verified separately.

- **Asset registry v2** (`SG.assets.images[name]`): legacy string, or `{store:"embedded",...}` /
  `{store:"linked",path,...}` objects; new `svg{}` bucket for diagrams. Additive — an asset-free deck
  is unaffected. `src/media.js` (new) is the browser-side store: import with downscale/WebP re-encode,
  a DOMParser SVG sanitizer (mirrors `scripts/assets.py`'s), content-hash dedupe, reference-scan GC,
  rename-with-remap, undo-backed delete, link↔embed conversion. Own quota-safe localStorage key,
  separate from deck-JSON autosave.
- **`SG.unavailable()`** — one shared card for every "needs the network, can't reach it" case (missing
  linked image, blocked/unreachable embed, offline link); same look in editor/present/thumbnails/
  speaker/print.
- **Image/svg free objects** + 🖼 Assets library panel; drop-on-canvas import; corner-resize is
  aspect-locked by default for media (Shift frees it — inverse of the text-reflow convention).
  Clipboard paste deliberately NOT implemented (media plan §7.2) — import via drop/toolbar/panel only.
- **New layouts**: `image`, `media-split`, `gallery`, `diagram`, `embed`. `figure` upgraded to a real
  `<img>` (was CSS `background-image`) specifically so a missing linked asset's `error` event can
  drive the unavailable fallback.
- **Links**: `href` on any override/free object, allow-listed to `#N`/`https:`/`http:`/`mailto:`
  (`F.sanitizeHref` + `scripts/validate.py`'s `HREF_RE`) — rejects `javascript:`/`data:` outright.
- **Embeds**: `type:"embed"` free object + `embed` layout — sandboxed iframe (`allow-scripts
  allow-popups` default; `allow-same-origin` is a separate opt-in), shield gates input (always-on
  while editing, click-to-interact by default in present mode, Esc restores it), 6s heartbeat to the
  unavailable card. **Verified empirically that this heartbeat is a mitigation, not a detector** —
  `X-Frame-Options` refusals often still fire `load`. Print/`SG.static` force the poster card via CSS
  `!important` alone, unconditionally; `F.posterize()` strips live iframes wherever a slide is cloned
  (sorter thumbnails, speaker view, deep-copy).
- **Deliberate trade-off**: the offline guarantee is dropped for links/embeds only (images/diagrams
  stay fully offline); generation-time assets always embed with no size ceiling (`scripts/build.py`'s
  450 KB budget covers the template only, not a delivered deck — clarified, not changed).
- Verified end-to-end in a real browser (jsdom can't do canvas/Image decoding or live iframe loads);
  `tests/editor-ops.mjs` gained data-layer coverage for everything jsdom *can* exercise, but — like
  the v3 engine work below — **was not run in this sandbox (no Node)**; run it before trusting it.

## Recent work (2026-07-06) — v3 engine: node-tree layouts, authored identity (plan §10)

- Design critique (`slide-forge-design-critique.md`) → Option B implemented: layouts emit node
  trees via `SG.N` with authored `data-el`/`data-bind`/`data-arr`; positional `decorate()` keying
  removed (kept only for `raw` slides + one-time v2→v3 key migration).
- Item ops remap override keys (styles follow items); orphan-override GC in commit; deterministic
  bind write-back replaced the value-matching `findContentField` heuristic.
- Corner-drag = **w/h resize with text reflow** (Alt = old scale); Inspector gained Width/Height.
- Targeted `SG.renderSlide` for sidebar typing; undo coalescing for continuous inputs
  (`F.pushUndoCoalesced`).
- Verified: jsdom parity across all 26 layouts vs the frozen v2 build (only 3 documented cosmetic
  deltas) + 29 data-layer assertions in `slide-forge/tests/`.
- Earlier discrepancies resolved: double-click IS the primary text-edit path (right-click menu kept);
  the Esc-commits bug is fixed (Esc cancels, Enter commits).
- **NOTE for future sessions:** this session's file writes through the Windows mount truncated
  several files to their previous byte length (engine.js, editor.js, anim.js, the plan doc). All
  were detected and repaired, but VERIFY file tails (`node --check`, `tail`) after any large write
  in this workspace. A phantom `.git/index.lock` (stat says exists, unlink says ENOENT) also blocked
  git; worked around via `GIT_INDEX_FILE=/tmp/... + commit-tree + update-ref`. If git locks up in a
  future session, delete `.git\index.lock` from the Windows side.
