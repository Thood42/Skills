# CLAUDE.md

Workspace for **self-contained HTML presentation Skills**. Each deliverable is a single `.html`
file that opens in any browser offline, with no install/server/build step.

## Layout

```
Slides/                 base "slides" skill — data-driven HTML deck generator (present only)
slide-forge/            advanced variant — same engine + an in-deck EDITOR (present + edit)  ← active project
slides-editor-plan.md   architecture & decision record — READ §1.2, §3.2, §8, §9 before editor work
README.md               minimal/stale (mentions only Slides); this file is the source of truth
*.skill                 gitignored build artifacts (zips); rebuilt separately, not tracked
```

`slide-forge/` is the focus. Its headline file is **`slide-forge/editor-template.html`** (~2400 lines,
fully self-contained). `references/` (`layouts.md`, `themes.md`, `editor.md`, `audiences.md`) is the
field reference; `scripts/assets.py` inlines icons/images, `deckdata.py` handles deck JSON.

## How the deck + editor work (`editor-template.html`)

A deck is **JSON** (`<script id="deck-data">`) rendered through a layout registry. In file order:

1. **`SG` globals** — seeded RNG, static-capture flag, lazy lib loader.
2. **slidegen animation library** — `sg-*` CSS classes (entrance + continuous effects).
3. **deck-engine** — `SG.data` (parsed JSON) → `L[layout](content)` → `innerHTML` → `SG.render`.
   ~25 layouts; pager/progress are derived, never stored. Per-slide `theme` + per-object theme are
   scoped CSS variables. Re-entrant: mutate data, call render.
4. **Forge editor** (`#forge-css` + `#forge-editor`) — **additive; present mode is untouched**. A
   deck with no `overrides`/`freeObjects` renders byte-for-byte like a plain deck.

Editor model (load-bearing facts):
- **Source of truth = `SG.data`.** Edits route through `F.do()`/`F.pushUndo` → **snapshot undo/redo**
  + autosave to `localStorage` (debounced). **Save .html** downloads a fresh self-contained file.
- **Identity is render-time:** a post-render `decorate()` pass tags blocks `data-el="b0"`, nested
  `b0.0` — layout functions are NOT edited.
- **Two per-slide edit channels** (absent in generated decks, created by the user in the editor):
  `overrides{}` (geometry/style/anim/`html`, keyed by `data-el`) and `freeObjects[]`.
- **Inspector (right panel):** Object section = geometry/scale/rotate, color/accent/font/surface,
  animation+delay; Content section = `content` fields + nested arrays (add/remove/reorder).
- **Text editing = RIGHT-CLICK** a leaf text element → context menu → **✎ Edit text** →
  `contenteditable`; the floating toolbar (B / ✦ / `<>`) toggles bold/glow/mono on the selection;
  commit stores to `overrides[key].html`. (Markers `**bold**` / `[[glow]]` / `` `mono` `` still render
  if typed in content — `rich()` is the renderer.)
- All editor chrome carries `.forge-chrome` (stripped on download, hidden in print/static capture).

## Conventions & environment

- Vanilla JS, **zero dependencies**; keep the single-file/offline guarantee.
- **No Node** in this environment; **Python 3.13** is available. JS can't be lint-checked via `node` —
  verify in a browser instead.
- **Verify the editor:** serve the **repo root** over HTTP (`python -m http.server`) and open
  `slide-forge/editor-template.html?edit` (the `?edit` query auto-opens edit mode). The preview
  tooling's static root is the repo root, so worktree files load via their `.claude/worktrees/...` path.
- Commits use **Conventional Commits** (`feat(slide-forge): …`).

## Git / remote state (as of 2026-06-20)

- Working branch: **`master`** (HEAD `221d1ac`).
- Remote `origin` = `github.com/Thood42/Skills`. **Local `master` is ~4 commits AHEAD of
  `origin/master`** — the entire slide-forge skill + editor are **unpushed**. Don't assume GitHub
  reflects local.
- **`gh` CLI is not installed and there's no GitHub token** → PRs can't be opened/merged
  programmatically here. Integrate via local merge, or push + open the PR in the browser.

## Recent work (2026-06-20) — editor interaction refactor (`221d1ac`, recorded in `slides-editor-plan.md` §9)

- Removed the sidebar inline-emphasis chips; formatting is **on-canvas only**.
- Double-click → **right-click context menu** for entering text editing.
- `.forge-live` pulse flashes the selected element on every inspector change; autosave debounced.
- **Known pre-existing bug:** `references/editor.md` says **Esc cancels** an on-canvas edit, but the
  code commits on Esc (same as Enter). Behaviour or doc still needs reconciling.
