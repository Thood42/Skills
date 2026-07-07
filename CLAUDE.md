# CLAUDE.md

Workspace for **self-contained HTML presentation Skills**. Each deliverable is a single `.html`
file that opens in any browser offline, with no install/server/build step.

## Layout

```
Slides/                 base "slides" skill — data-driven HTML deck generator (present only)
slide-forge/            advanced variant — same engine + an in-deck EDITOR (present + edit)  ← active project
slides-editor-plan.md   architecture & decision record — READ §1.2, §3.2, §8, §10 before editor work
slide-forge-design-critique.md  2026-07-06 design review that led to the v3 engine (§10 ADR)
README.md               short index (both skills + plan doc); this file is the source of truth
*.skill                 gitignored build artifacts (zips); rebuilt separately, not tracked
```

`slide-forge/` is the focus. Its headline file is **`slide-forge/editor-template.html`** (~3700 lines,
fully self-contained), BUILT from `slide-forge/src/` by `scripts/build.py` — **edit src/, never the
template** (`build.py --check` verifies sync). `references/` (`layouts.md`, `themes.md`, `editor.md`,
`audiences.md`) is the field reference; `scripts/assets.py` inlines icons/images, `deckdata.py`
handles deck JSON, `scripts/validate.py` schema-checks a deck. `tests/` holds a jsdom harness
(parity vs the frozen v2 build + 29 editor data-layer assertions) — needs Node, so run it outside
this sandbox.

## How the deck + editor work (`editor-template.html`)

A deck is **JSON** (`<script id="deck-data">`) rendered through a layout registry. In file order:

1. **`SG` globals** — seeded RNG, static-capture flag, lazy lib loader.
2. **slidegen animation library** — `sg-*` CSS classes (entrance + continuous effects).
3. **deck-engine v3** — `SG.data` (parsed JSON) → `L[layout](content)` → **node tree** (built with
   `SG.N`) → `SG.render`. ~25 layouts; pager/progress are derived, never stored. Layouts author
   identity: `data-el` (stable content-path key like `stats.2`), `data-bind` (the content field a
   text leaf renders), `data-arr` (the array a container renders). Per-slide `theme` + per-object
   theme are scoped CSS variables. Re-entrant: mutate data, call render — or `SG.renderSlide(deck,i)`
   for a single section (used by live sidebar typing).
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
- **Inspector (right panel):** Object section = geometry/scale/rotate, color/accent/font/surface,
  animation+delay; Content section = `content` fields + nested arrays (add/remove/reorder).
- **Text editing = DOUBLE-CLICK** a leaf text element (right-click → **✎ Edit text** also works) →
  `contenteditable`; the floating toolbar (B / ✦ / `<>`) toggles bold/glow/mono on the selection.
  Enter commits, **Esc cancels**. Commit writes to the `data-bind` content path when present;
  unbound leaves (raw slides, derived text) store `overrides[key].html`. (Markers `**bold**` /
  `[[glow]]` / `` `mono` `` still render if typed in content — `rich()` is the renderer.)
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
