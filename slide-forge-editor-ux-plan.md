# Slide-Forge editor UX overhaul — design record (v4)

Source: the `design_handoff_editor_ux_overhaul` handoff (design spec + prototype + phased work
order) supplied by Trevor on 2026-07-31. Kept here for the same reason as
`slide-forge-media-plan.md`: it is the decision record the implementation answers to, and future
sessions need it to know *why* the editor looks the way it does.

The interactive prototype (`Editor Item Management Prototype.dc.html`) needs its design-tool runtime
and is NOT vendored — the spec below carries every value that mattered.

**Status: implemented.** See `slide-forge/references/editor.md` (v4 section) for what shipped, and
the "Deltas from the spec" section at the end of this file for the three places the implementation
deliberately diverged.

---

## Overview
UX overhaul of the in-file editor that ships inside every slide-forge deck (`src/editor.js` + `src/editor.css`, built into `editor-template.html` by `scripts/build.py`). Goal: make item management usable by non-programmers (no HTML/JSON literacy required) and add zoom/focus, contextual styling, and an insert-element gallery. The slide engine, layouts, and deck data model are NOT in scope — only the additive editor layer.

## About the Design Files
`Editor Item Management Prototype.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. The task is to **recreate these behaviors inside the existing slide-forge editor layer** (vanilla JS, no framework, all chrome carries `.forge-chrome`), following its established patterns: edits route through `Forge.do()`/`pushUndo`, overrides key on authored `data-el` paths, structural ops use the `data-arr` machinery. `implementation-plan.md` (included) maps every feature to its exact hook in `src/editor.js` and defines the phase/build/test cycle — treat it as the work order; this README is the design spec.

The prototype requires the design-tool runtime (`support.js`) to run; if it won't open standalone, read it as annotated source — all styling is inline and all interaction logic is in the single `Component` class at the bottom.

## Fidelity
**High-fidelity.** Chrome colors, spacing, radii, and type were lifted from the real `src/editor.css`; recreate pixel-perfectly using the existing forge chrome classes/values. The `showAnnotations` tweak toggles the pink NEW badges — those badges and the helper captions are prototype annotations, NOT part of the design.

## Screens / Views
One screen: the editor in Edit mode (Midnight Neon deck, stat-grid slide). Regions:

### 1. Top bar (existing `#forge-bar`, extended)
Order: file title (muted, `#7e8aa0`, 12px, flex-grow) · ＋ Slide · T Text · ▭ Box · ▣ Image · ⊞ Insert · | · ▦ Sorter · ◐ Theme · ⚙ Deck · | · ⟲ · ⟳ · | · ？ · ▶ Present · **Save .html** (primary blue `#2a6df4`). All buttons use the existing `.forge-btn` style (bg `#161b25`, border `rgba(255,255,255,.10)`, radius 8px, 12.5px/600, hover `#1d2330`); separators `.forge-sep`. Every button has a tooltip (`title`).

### 2. "On this slide" items panel (replaces the Elements tree in `#forge-inspect`)
- Sticky uppercase header ("ON THIS SLIDE", 11px, `.16em` tracking, `#7e8aa0`).
- One row per authored element, flat list with indent for array items (padding-left 8px top-level, 26px nested). Row: 22×22 icon tile (bg `#1a212d`, radius 6px, 11px glyph — K kicker, T title, ▦ container, № item) · name (12.5px/600 `#dbe3ef`) over excerpt (10.5px `#6f7c92`, ellipsized) · eye button (👁 muted `#5a6a86`; hidden state ◌ `#ff9671`, name dims to `#6f7c92`).
- Names are plain-language: field name prettified + content excerpt ("Stat 3 — 12×"). Dotted keys never appear as primary labels.
- Row states: default bg `#141923`; hover `#1a212d`; selected bg `#16233d` + 1px border `#2a6df4`, radius 8px.
- Hover row ⇄ hover outline on the canvas element; click ⇄ selection. Both directions stay in sync.
- Below the list: two buttons in a row — "＋ Add stat" (green chip style: bg `#173a2a`, border `#1f6d4a`, text `#9af0c4`) and "⤢ Manage items…" (standard btn). In the real editor "Add" derives from the container's `data-arr` (label per array).
- Eye toggle writes `overrides[key].hide`; hidden elements render at 12% opacity while editing (fully hidden when presenting).

### 3. Selection breadcrumb (new, floats top-center over the stage)
Pill (bg `#0d1017`, border `rgba(255,255,255,.16)`, radius 9px, shadow `0 10px 30px rgba(0,0,0,.5)`) of clickable chips: `Slide ▸ Stat cards ▸ Stat 3`. Current segment: bg `#2a6df4`, white, radius 6px; ancestors transparent, `#9aa6ba`, hover `#26303f`; separators ▸ `#5a6a86` 10px. Each chip selects that prefix key; "Slide" clears selection. Hidden when nothing is selected.

### 4. Contextual inspector ("SELECTED", below the items panel)
Only sections that apply to the current selection kind:
- Identity card: icon + friendly name + small mono key chip (bg `#16233d`, border `#2a6df4`, radius 8px).
- Content fields of the selected item (label 11px/600 `#9aa6ba`; input bg `#10151e`, border `rgba(255,255,255,.12)`, radius 6px, focus border `#2a6df4`). Edits write to `content` and re-render the slide live.
- Text size stepper (− value ＋; monospace value) for text leaves → new override prop `fs` in px (min 28 / max 96 in prototype).
- **Style & formatting** (collapsible, ▸/▾ header): "Text color" — five 22px circle swatches (theme tokens: ink `#eaf1fb`, cyan `#3ce8ff`, indigo `#7c8cff`, mint `#44f3c4`, gold `#ffd166`; active swatch gets 2px white ring) + Reset chip. **Write `var(--token)` references, not hex**, so retheming keeps working. "Formatting" — B / ✦ / `<>` chips (pressed: bg+border `#2a6df4`) applying whole-element bold/glow/mono by wrapping the bound content field in `**`/`[[…]]`/`` ` `` markers. Hint text below explains: these apply to the whole element; highlight a range on the slide for partial formatting.
- Array items additionally get: ↑ ↓ (reorder), ⧉ Duplicate, ✕ Remove (red: bg `#3a1717`, border `#6d1f1f`, text `#f0a0a0`). All land in `content` via existing item ops; overrides remap; selection follows a moved item.

### 5. Stage: zoom + ⌖ Focus (new, bottom-right cluster)
- "⌖ Focus" toggle button (active: solid `#2a6df4`) + pill with − / percentage (mono 11px) / ＋ / Fit.
- Zoom steps ×1.25, clamp 0.5–3×. Fit resets zoom to 100% and turns Focus off. Ctrl/Cmd+scroll should also zoom (not in prototype).
- Focus mode: view animates (transform transition ~450ms `cubic-bezier(.22,1,.3,1)`) to center the selected element at ~1.6–1.7× and **follows the selection** while on. Selection cleared → back to fit.
- One combined `translate(...) scale(...)` on the stage wrapper. **All drag/resize math divides screen deltas by the combined scale** so gestures stay correct at any zoom.

### 6. Canvas manipulation (existing behavior, must survive the overhaul)
- Hover: 1.5px dashed outline `rgba(120,170,255,.55)`, offset 3–4px. Selected: 2px solid `#2a6df4`.
- Drag anywhere on an element moves it (override dx/dy). After a drag, the click that lands on the stage must NOT clear the selection (guard flag).
- Selected element shows a 14px blue corner handle (bg `#2a6df4`, 2px white border, radius 3px, `nwse-resize` cursor) at bottom-right; dragging it changes **width, text rewraps** (v3 semantics; Alt = proportional scale). Min width 140px.
- Range formatting: with a text element selected it becomes editable in place; highlighting a range raises the floating B / ✦ / `<>` toolbar centered above the selection rect (same pill styling as breadcrumb; offset ~44px above). Formats apply to the range only and serialize back to marker text (`**bold**`, `[[glow]]`, `` `mono` ``). Commit on blur/Enter, cancel on Esc. (Already shipped in the real editor — verify it coexists with zoom/focus and drag guards.)

### 7. "Manage items" modal (repurposes `#forge-struct`)
- Card `min(880px, 94vw)`, max-height 86vh, bg `#0d1017`, border `rgba(255,255,255,.16)`, radius 14px, padding 20/24, shadow `0 24px 80px rgba(0,0,0,.6)`. Title: `Manage items — "<slide title>"`.
- Tab switcher top-right (pill group, active tab solid `#2a6df4`): **Items** (default) | **Advanced (JSON)**.
- Items tab: scalar fields first in a 2-col grid with plain-language labels ("Kicker (small line above the title)"); then a section header per content array ("STAT CARDS · 4" with blue tick + "＋ Add stat" green chip); then one card per item in a 2-col grid (bg `#10151e`, radius 10px; selected item's card border `#2a6df4`). Each card: name + tools row (↑ ↓ ⧉ ✕, 22px chips) + its fields (number+unit on one row, label full-width; placeholders like "What this number means"). All edits apply to the slide instantly.
- Advanced tab: the existing JSON textarea (mono 12px), Copy/Apply round-trip unchanged.
- Footer right: **Done** (primary blue).

### 8. "Insert an element" gallery (new, opened by ⊞ Insert)
- Card `min(680px, 94vw)`, same modal chrome. Header: title + search input (280px, right-aligned, placeholder "Search elements… (e.g. quote, timeline, stat)"). Search filters live on name + source layout.
- 4-column grid of element cards (bg `#10151e`, radius 10px, padding 8px; hover border `#2a6df4`): preview area 58px (bg `#070b12`, radius 6px) + name (11.5px/700) + "from <layout>" (10px `#6f7c92`).
- Catalog: one entry per insertable element type across the 26 layouts — stat card, agenda item, timeline event, pipeline step, quote, big number, comparison column, metric ring, leaderboard row, matrix cell, stack band, takeaway card, code block, free text, box, image. In production, derive the catalog from the `DEFAULTS` map in `editor.js` and render previews as live scaled miniatures (the sorter's `forge-thumb-frame` technique) instead of the prototype's hand-composed shapes.
- Clicking inserts the element with its layout's default content as a themed `freeObjects` `{type:"html"}` entry (faithful-duplicate path), centered on the slide, selected.

## Interactions & Behavior
- Selection model: one source of truth; canvas, items panel, breadcrumb, inspector, and modal all reflect it.
- Reorder/duplicate/remove: land in `content`; override keys remap to follow items (existing GC pass logs dropped overrides); selection follows moves and duplicates (new copy selected).
- Undo: every gesture = one snapshot (drags, stepper runs, color drags coalesce — existing pattern).
- Animations: only the stage transform transition (450ms, `cubic-bezier(.22,1,.3,1)`) and existing pulse/hover affordances. No other new motion.
- Empty-canvas click clears selection (unless it terminates a drag).

## State Management
Additions to the existing `Forge` state: `zoom` (float), `focus` (bool), per-key `overrides[key].hide` (bool) and `.fs` (px). Everything else reuses existing channels (`content`, `overrides`, `freeObjects`). Autosave/localStorage and Save .html serialization unchanged. Stamp/read `meta.schemaVersion` as today — all additions are optional keys, no migration needed.

## Design Tokens (editor chrome — from `src/editor.css`)
- Panel bg `#0d1017`; field/card bg `#10151e`; button bg `#161b25` hover `#1d2330`; chip bg `#1a212d` hover `#26303f`/`#222b3a`
- Accent `#2a6df4`; selected-row bg `#16233d`; success text `#2ee6a6`
- Text `#dbe3ef`; bright `#eaf1fb`; muted `#9aa6ba`; faint `#7e8aa0`/`#6f7c92`; borders `rgba(255,255,255,.08–.16)`
- Green chip `#173a2a`/`#1f6d4a`/`#9af0c4`; red chip `#3a1717`/`#6d1f1f`/`#f0a0a0`; guide pink `#ff4fa3` (prototype badges only)
- Radii: buttons/rows 8px, chips/inputs 6px, cards 10px, modals 14px, pills 9–10px
- Type: `var(--font-body)` for chrome; `var(--font-mono)` for keys/values; sizes 10–13px as specified above
- Slide-side colors are theme tokens (`--ink --muted --cyan --indigo --mint` etc.) — never hard-code

## Assets
None. All glyphs are text characters (⌖ ⊞ ▦ ◐ ⚙ ⟲ ⟳ ⧉ ✕ ↑ ↓ ▸ ▾ ✦ 👁 ◌); production may swap in the icon set of choice but none is required.

## Files
- `README.md` — this spec
- `implementation-plan.md` — phased work order mapped to `src/editor.js` hooks, with build/test/doc cycle per phase (start here)
- `session-handoff.md` — session context: source map, decisions, backlog, feedback rounds
- `Editor Item Management Prototype.dc.html` — the interactive prototype (annotations toggleable via `showAnnotations`)
- Target codebase: the user's local `slide-forge/` folder — `src/editor.js`, `src/editor.css`, `scripts/build.py`, `tests/` (parity + editor-ops must stay green), `references/editor.md` (add a v4 section)


---

# Implementation plan — editor UX overhaul (from prototype → slide-forge)

Everything ships in `src/` and is rebuilt into `editor-template.html` with `python3 scripts/build.py`. Never edit the built template directly. After each phase: rebuild, run `node tests/parity.mjs` + `node tests/editor-ops.mjs`, and update `references/editor.md` (+ the "What to tell the user" section of `SKILL.md`).

Prototype reference: `Editor Item Management Prototype.dc.html` in this project (toggle `showAnnotations` off to see it clean). Pixel values, copy, and interaction details there are the spec.

## What already exists (no work)
- Free move / corner-resize with rewrap / rotate / multi-select / groups — v3 already does this; the prototype only proves it must coexist with zoom.
- Range formatting via floating B/✦/`<>` toolbar over a text selection — already shipped (v2). Keep; the new Style panel copy just points at it.
- Item add/duplicate/remove landing in `content` with override remap (`data-arr` machinery) — the new modal and items panel are skins over these existing ops.

## Phase 1 — Items panel + breadcrumb + contextual inspector (all sidebar, low risk)
1. **"On this slide" items panel** — replace the Elements tree renderer (`forge-tree` build in `src/editor.js`, v2.1 section). Rows = same walk over authored `data-el` keys, but:
   - Plain-language labels: layout-schema field name → `pretty()`, plus a content excerpt ("Stat 3 — 12×"). Keep the dotted key as a small mono chip only.
   - Icons per kind (text/array-container/array-item/free object); indent = key depth.
   - Hover row → add the hover outline class to the canvas element (reuse `.forge-block:hover` styling); click → existing select.
   - Eye toggle writes `overrides[key].hide` (already supported by detach-to-freeform; expose it directly).
2. **Breadcrumb** — new `.forge-chrome` fixed div, top-center of the stage. Derive from the selected key: split on `.`, map each prefix through the same label fn; each chip selects that prefix key. Hidden when nothing is selected.
3. **Contextual inspector** — gate the Object panel's sections by selection kind (text leaf / container / array item / free object) instead of always rendering all fields. Add:
   - **Text size** stepper → new override prop `fs` (px), applied in `applyStyle` like `color`/`font`. Additive, no migration.
   - Array-item verbs (↑ ↓ ⧉ ✕) inline — call the existing tree/item ops.
   - **Style & formatting** collapsible: theme-token swatches (write `var(--cyan)` etc., NOT hex, so retheming keeps working — SKILL pitfall #2) + whole-element B/✦/mono (wrap the bound content field in markers).

## Phase 2 — Manage-items modal + zoom/focus
4. **Manage items modal** — repurpose `#forge-struct` (v2.2): default tab "Items" renders the slide's `content` with the SAME field/array-card widgets the sidebar content panel already has (extract that renderer into a shared fn), in a wide 2-col grid; JSON editor becomes the "Advanced" tab, unchanged. All edits route through `Forge.do()` as today.
5. **Zoom + ⌖ Focus** — the deck already computes a fit scale; multiply by a `Forge.zoom` factor and add a pan, applied to the stage wrapper (one transform, transitioned ~.45s). Focus mode: on selection change, read the element's slide-space bbox (helpers exist for align/distribute) and solve translate/scale to center it at ~1.7×. Controls bottom-right (−/％/＋/Fit/⌖ Focus); Fit resets and disables focus. Ctrl+scroll → zoom. **All existing drag math already divides by the render scale — verify it reads the combined scale, add a test.**

## Phase 3 — Insert gallery + top bar
6. **⊞ Insert element gallery** — modal with search. Catalog = derived from the `DEFAULTS` map already in `editor.js` (one entry per insertable element type, with its default content). Previews: render the element with default content into a `forge-thumb-frame`-style scaled live miniature (reuse the sorter's technique — no hand-drawn thumbs needed in the real thing). Insert = build the node via the layout's `SG.N` renderer and land it as a `freeObjects` `{type:'html'}` entry (the faithful-duplicate path), centered on the slide.
7. **Top bar** — add Insert / Image / Sorter / Theme / Deck buttons (Sorter/Theme/Deck currently live in panels; surface them). Image = file input → `SG.assets.images` (reuse brand-logo inject code) → new `freeObjects` `{type:'img'}` type + renderer + assets.py awareness.

## Tests & docs per phase
- Extend `tests/editor-ops.mjs`: items-panel label derivation, hide override, breadcrumb path fn, modal edits land in `content`, zoom-aware drag math, gallery insert produces valid freeObject + passes `scripts/validate.py`.
- `tests/parity.mjs` must stay green (editor layer is additive; present mode untouched).
- Update `references/editor.md` (new v4 section) and SKILL.md's user-facing bullet list.

## Suggested order & sizing
P1 ≈ the biggest UX win per line of code (sidebar-only). P2's modal reuses P1's shared renderers — do them in order. P3 is independent and can be parallelized. Keep each phase a separate build + test + doc cycle.


---

# Slide-Forge editor UX — handoff

Session goal: enhance the **editing UI** of the slide-forge in-file editor (not slide content/layouts). Focus: intuitiveness for non-programmers who can't read HTML/JSON, plus new editing features.

## Source of truth
Local folder `slide-forge/` (mount it again next session):
- `src/editor.js` (1448 lines, v3) + `src/editor.css` — the editor layer
- `references/editor.md` — full editor behavior spec (v1→v3 changelog)
- `SKILL.md` — authoring workflow; `editor-template.html` — built artifact (build via `scripts/build.py` from `src/`)
- Key v3 concepts: `data-el` (stable content-path key for overrides), `data-bind` (exact write-back path), `data-arr` (container→array mapping powering add/dup/remove + override remap). All edits route through `Forge.do()` → undo/autosave.

## Prototype in this project
`Editor Item Management Prototype.dc.html` — interactive mockup in the real forge chrome (colors/metrics lifted from `src/editor.css`, slide styling from `src/deck.css`, Midnight Neon). Toggle the pink NEW badges off via the `showAnnotations` tweak. Demonstrates:

1. **"On this slide" items panel** (right sidebar, replaces the Elements tree for lay users) — plain-language rows ("Stat 3 — 12×"), icons, nesting by indent, hover ↔ canvas highlight sync, click ↔ selection sync, per-item show/hide eye. No dotted keys shown.
2. **Selection breadcrumb** (floating top-center) — `Slide ▸ Stat cards ▸ Stat 3`, clickable segments to walk up the hierarchy; replaces Alt-click drilling as the discoverable path.
3. **Contextual inspector** — shows only what applies to the selection: friendly name + key chip, the item's own content fields, text-size stepper (direct font size, not scale), ↑↓/duplicate/remove for array items, plain-language tips.
4. **"Manage items…" popout** — card-based modal replacing the JSON structure editor for normal users: kicker/title fields + one card per stat (number/unit/label inputs, ↑↓ ⧉ ✕), Add stat, live-applies to the slide. "Advanced (JSON)" tab keeps the power-user path (read-only in the mockup).

All interactions are functional in the mockup: select/hover sync, hide, reorder (selection follows the moved item, mirroring v3 override remap), duplicate, delete, live text/size edits, modal round-trip.

Round 2 (teammate feedback from Trevor, addressed in the same DC):
5. **Canvas zoom + Focus-on-selection** — stage controls bottom-right: −/％/＋/Fit plus a toggleable **⌖ Focus** button that zooms/pans to whatever is selected and follows the selection while on; Fit turns it off. Smoothly animated transform.
6. **Style & formatting section** in the contextual inspector — expandable (▾), theme-token color swatches + Reset, B/✦/`<>` format chips, all live-applied to the selected element. Kept in the panel AND on-canvas: panel = discoverable home, floating toolbar = fast path (decision noted in the hint copy).
7. **Top bar completeness** — all core non-contextual verbs now represented: ＋Slide / Text / Box / **Image (new, backlog)** / Sorter / Theme / Deck settings / Undo / Redo / ? shortcuts / Present / Save.

Round 3 (Trevor):
8. **⊞ Insert element gallery** — top-bar button opens a searchable popup of every element type across the 26 layouts (stat card, agenda item, timeline event, pipeline step, quote, big number, comparison column, metric ring, leaderboard row, matrix cell, stack band, takeaway card, code block, free text, box, image), each with a small shape-composed preview and its source layout. Search filters live; “Stat card” inserts for real in the mockup. Implementation note: inserted cross-layout elements land as themed free objects (`freeObjects[{type:'html'}]`), reusing the faithful-duplicate machinery.
9. **Free move & reshape preserved** — drag any element to move (deltas divided by canvas scale = slide-space math, mirrors the real editor); blue corner handle on the selection resizes width with text rewrap (v3 “resize means resize”). Works together with zoom/Focus.
10. **Range formatting** — the selected title is contentEditable; highlighting a text range raises the floating B / ✦ / `<>` toolbar over the selection and formats just that range (execCommand in the mockup; serializes to `**bold**`/`[[glow]]`/`` `mono` `` markers in the real editor). Panel copy now distinguishes whole-element vs range formatting.

## Design decisions to carry into implementation
- Never show dotted keys (`stats.2.label`) as the primary label; keep them as small mono chips for debuggability.
- Reorder/duplicate/remove must land in `content` (existing `data-arr` machinery) so edits survive layout switches; the modal is just a friendlier skin over the same ops.
- The JSON editor stays, demoted to an "Advanced" tab.
- Selection follows an item when it's moved/duplicated.

## Backlog agreed earlier (not yet prototyped)
Intuitiveness: hover labels before click; lock toggle on decorative blocks; canvas zoom/pan (Cmd+scroll, space-drag); layout switcher with live thumbnails.
Features: insert image as free object (drag-drop → `deck-assets`); shapes/connectors (line, arrow, ellipse); copy/paste style; opacity + letter/line spacing; on-canvas drag-to-reorder array items; find & replace across deck; history panel (labels already exist via `F.do(name)`).

## Next session
1. Get feedback on the prototype; iterate (likely: drag-to-reorder in the items panel, editable JSON tab, multi-array layouts e.g. agenda/comparison in the modal).
2. Prototype 1–2 backlog items (layout-thumbnail switcher and image insert are highest leverage).
3. Then spec implementation notes per feature against `src/editor.js` (where each hook lives: items panel ≈ rewrite of `forge-tree`; modal ≈ replace `#forge-struct` Items side; breadcrumb ≈ new chrome div fed by `F.sels[0]` key path).


---

# Deltas from the spec (decided during implementation)

1. **The stage is now inset between the panels while editing.** The spec assumed a stage region
   (breadcrumb top-centre of it, zoom cluster bottom-right of it), but the v3 editor scaled the deck
   to the *whole window*, so the side panels overlapped the slide. Zoom/Focus math needs a defined
   stage rect anyway, so `fit()` gained an optional `SG.viewTransform` hook: in edit mode the deck is
   fitted between the panels and under the bar, and panned/scaled from there. Present mode is
   byte-identical to before (the hook returns null).

2. **Clicking again steps INTO a group.** The spec covers walking *up* (breadcrumb) but left walking
   *down* on Alt-click. Alt-click is undiscoverable for the audience this overhaul is for, so a
   second click inside the current selection now descends one level of the key hierarchy
   (grid → stat card → its label). Alt-click still jumps straight to the deepest element.

3. **The items panel does not list the leaves inside a list item.** The prototype's slide had two
   levels; real layouts have four or five, and listing every leaf turns a 4-stat slide into 20 rows.
   Rows are: top-level blocks, list containers, and the items in them. An item's own fields are
   already right there as labelled inputs in the Selected panel.

Smaller ones: the text-size stepper clamps 10–200px (the prototype's 28–96 was tuned to one title);
the fifth colour swatch is `--muted` (there is no `--gold` token in the theme system); "Exact colour"
keeps the old literal colour picker alongside the token swatches, folded away.

---

