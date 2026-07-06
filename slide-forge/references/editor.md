# The in-file editor — how it works and what it writes

The delivered `.html` contains the data-driven deck engine **plus** an additive editor layer
(`<style id="forge-css">` + `<script id="forge-editor">`). Present mode is unchanged; the editor
activates only when the user toggles **Edit**. You (Claude) author plain `content`; the user makes
the edits below. This file lets you explain the editor accurately and understand how edits persist.

## Two kinds of edit

**1. Content (text & structure) — edited in the right sidebar, written to `content`.**
Selecting a slide shows a **Content** panel that reflects that slide's `content` fields. Plain
fields are text/number inputs; **nested arrays** (a stat-grid's `stats`, an agenda's `items`, a
timeline's `items`, comparison `items`, etc.) render as **separate cards** — each item editable on
its own, with **＋ Add**, **✕ remove**, and **↑/↓ reorder**. Editing here changes
`slides[i].content` directly and re-renders from data, so text never goes stale and **survives a
layout switch**. The sidebar holds **no text-formatting controls** — emphasis is applied visually on
the canvas (next paragraph). You can still type the light inline markers by hand if you prefer —
`**bold**`, `[[glow]]` (the accent color), `` `mono` `` — and they render the same way.

**On-canvas WYSIWYG (the primary way to format).** In Edit mode, **right-click any text element on
the slide and choose ✎ Edit text** to edit it in place. Selecting text raises a small floating toolbar (**B / ✦ / `<>`**)
that toggles the same bold / glow / mono formatting directly on what you see — no markers visible.
Press **Enter** (or click away) to commit, **Esc** to cancel. The edit is serialized back to marker
text and stored as that element's `html` override (see below), so it round-trips and exports clean.

**2. Object (geometry, style & animation) — overrides layered on a template element or free object.**
Click an element on the slide to select it; the **Object** panel exposes position (X/Y), scale,
rotation, **text color**, **accent**, **font** (from the theme fonts), a **surface** color, and an
**Animation** effect (+ delay). These write to a per-slide `overrides` map (for template elements,
keyed by `data-el` like `b0`) or to a free object. Arrow keys nudge a selected object (Shift = 10px).
"Reset element" drops the override; "Delete object" removes a free object.

**Animation binding.** The Object panel's **Animation** section assigns one effect to the selected
element from a curated catalog (entrance: *fade-rise, reveal-wipe, typewriter, kinetic*; continuous:
*glow-pulse, shimmer, gradient-text, neon-flicker, float*) plus a **delay** in seconds. Entrance
effects replay when the slide opens (and a **▶ Replay** button previews them while editing);
continuous effects loop. Stored as `overrides[key].anim` / `.animDelay`.

**Nested elements (array items & their fields).** Beyond the top-level blocks (`b0`, `b1`…), the
editor also keys **array items and their child fields** with positional dotted keys (`b6.0`,
`b6.0.1`). Select them via the **Nested** list in the Object panel (a child picker with a ↑ parent
button), or **Alt-click** the element on the canvas to drill straight in. Once selected, all of the
above — style, geometry, and **animation** — apply to that individual item or field.

```jsonc
{ "layout": "stat-grid",
  "content": { "title": "By the numbers", "stats": [ {"count":94,"unit":"%","label":"…"} ] },
  "overrides": { "b0": { "x":120, "y":60, "rot":-2, "scale":1.1,
                         "color":"#ffd166", "font":"var(--font-mono)",
                         "anim":"reveal-wipe", "animDelay":0.2,
                         "html":"**By** the [[numbers]]",          // on-canvas WYSIWYG edit
                         "theme": { "--cyan":"#ff5", "--bg":"#101" } } },
  "freeObjects": [ { "id":"f1a2b3c", "type":"txt", "x":900, "y":600,
                     "text":"Hand-placed note", "size":28, "color":"#ffd166" } ] }
```

Deleting a free object removes it from `freeObjects`; "Reset element" deletes that key from
`overrides`. Undo/redo snapshots the whole deck JSON (80 deep); edits autosave to localStorage
keyed by `meta.id`, and **Save .html** re-serializes the entire file with `deck-data` (and
`deck-assets`) updated — so the saved file is byte-equivalent to one authored that way directly.

---

## v2 additions (editing UX)

The editor now wraps every selectable thing — template blocks (`b0`), nested dotted keys
(`b6.0.1`) and free objects — behind **one element model** (`Forge.sels[]`), so all of them share
the same verbs. New in v2:

- **Double-click text to edit in place** (right-click → *Edit text* still works). The floating
  **B / ✦ / `<>`** toolbar toggles bold / glow / mono on the selection.
- **Smart guides + snapping.** Dragging snaps to slide center/edges/margins and to sibling
  edges/centers, with pink guide lines; falls back to an 8px grid. Hold **Alt** to disable snapping.
  Rotation snaps to 15° (Alt for free).
- **Multi-select.** Shift-click to add/remove; drag a marquee on empty canvas to box-select. The
  floating toolbar gains **align** (left/center/right/top/middle/bottom) and, at 3+, **distribute**
  (horizontal/vertical). All geometry math is in slide-space (pre-transform), so it's correct at any
  fit scale.
- **Clipboard.** `Cmd/Ctrl+C · V · D` copy / paste / duplicate within and across slides. A pasted
  template element lands as a free object carrying its text + computed style.
- **Z-order.** Bring forward / send back (`overrides[key].z` or `freeObjects[i].z`).
- **Keyboard.** Arrow keys nudge the selection (Shift = 10px); `Delete`/`Backspace` removes/resets;
  `Esc` clears; `Cmd/Ctrl+S` saves the `.html`; `Cmd/Ctrl+Z` / `Shift+Z` undo/redo.
- **Slide row tools.** The left panel's slide rows expose move-up/down, duplicate and delete on hover.

**Schema.** `meta.schemaVersion` is stamped to `2` on load by `SG.migrate()`; v1 decks are valid v2
decks (all new keys — `overrides[key].z`, `slides[i].notes`, top-level `brand`/`masters` — are
optional), so old decks open and re-save with no visual diff.

**Source layout.** The template is now built from `src/` by `scripts/build.py`; validate a deck with
`scripts/validate.py <deck.html|deck.json>`. Claude's authoring workflow is unchanged — copy
`editor-template.html`, inject the `deck-data` JSON.

## v2 phase 2

- **Grouping.** Select several elements, `Ctrl+G` (or the chain button on the floating toolbar) to
  group, `Ctrl+Shift+G` to ungroup. Stored as a shared `group` id on `overrides[key]` /
  `freeObjects[i]`; selecting any member selects the whole group, and all verbs apply to it.
- **Detach to freeform.** Right-click a template *text* element → **Detach to free text**: recreated
  as a free object at identical position/size/style; the original is hidden via
  `overrides[key].hide` (reset the element to restore it).
- **Slide sorter.** The ▦ button in the Slides panel toggles a thumbnail grid (live-rendered
  miniatures). Drag thumbnails to reorder; hover for duplicate/delete.
- **Presenter notes + speaker view.** Notes live in `slides[i].notes` (Slide panel textarea). Press
  **S** while presenting: a popup shows the current slide, notes, next-up, a clock and an elapsed
  timer; arrow keys in the popup drive the main deck.
- **In-place save.** On Chrome/Edge, **Save .html** / `Ctrl+S` writes the file in place via the File
  System Access API (first save picks the file, later saves are silent). Elsewhere it falls back to
  downloading a fresh copy.
- **Onboarding hints.** First entry into Edit mode shows a dismissable basics overlay (stored in
  localStorage under `forge:hints-seen`).
- **Text-edit write-back.** On-canvas text edits are written back into the matching `content` field
  (so the sidebar and layout switches stay in sync); an `html` override is used only when the source
  field can't be identified unambiguously.

## v2.1 refinements

- **Elements tree.** The flat "Nested" picker is now a collapsible hierarchical tree (in the
  Inspector, with or without a selection): every block, nested item and free object, indented, with
  the selection highlighted. Click a row to select; disclosure arrows collapse branches.
- **Item operations from the tree / right-click.** Containers that render a content array (agenda
  items, stats, matrix cells...) map back to it, so the tree offers **＋ add item** (cloned with the
  right field shape), and item rows offer **⧉ duplicate item** / **✕ remove item** — all edits land
  in `content`, so they survive layout switches. Ambiguous mappings simply don't offer the buttons.
- **Animation triggers & build steps.** Entrance effects have a **Trigger**: *On slide enter*
  (default) or *On click (build step)* with a **step order** number. While presenting, → / Space /
  click plays pending steps in order (same number = together) before advancing to the next slide.
  Stored as `animTrigger`/`animStep` on the override or free object. New **"Stagger children"**
  effect animates a container's children in sequence. The Slide panel shows an **Animations**
  overview — every animated element with its trigger/step/delay, select / replay / clear, and Play all.
- **Faithful duplication.** Duplicating a container (right-click, toolbar, `Ctrl+D`) now deep-copies
  its full markup — nested items included — as a `{type:"html"}` free object (previously an empty
  box). Nested array items additionally offer **Duplicate item (in layout)**, which clones the
  content entry in place.
- **`?` opens a keyboard-shortcut overlay** in Edit mode; editor chrome carries aria-labels and
  visible focus rings.

## v2.2 refinements

- **One control corner.** Present / Docs / Export / Import / Save PDF now sit bottom-right beside
  the Edit button, in the same pill style. Presentation mode hides every control.
- **Structure editor.** The Elements panel's ⤢ button opens a large modal: the elements tree beside
  a direct JSON editor for the slide. **Copy JSON** exports the structure; paste JSON back in and
  **Apply** (validated: parse + known layout) to replace the slide — round-trips with Export/Import.
- **Faithful duplicate.** Duplicating a nested layout item now clones its content entry in place —
  a real element of the same type, not a free copy. Containers still deep-copy as `html` free
  objects, and those now carry every override property (color, font, theme, animation, z).
- **Delete key.** Deleting a selected nested item removes the item from `content` (not just the
  override); containers reset; free objects are removed.
- **Build steps are opt-in.** `defaults.buildSteps` (Deck panel toggle, **off by default**) gates
  click-to-reveal: when off, everything is visible everywhere; when on, On-click elements wait for
  → / Space / click while presenting. Setting a click trigger enables the toggle automatically.
