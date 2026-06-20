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
                         "theme": { "--cyan":"#ff5", "--bg":"#101" } },
                 "b1.0": { "anim":"glow-pulse" } },               // a nested array item
  "freeObjects": [ { "id":"f1", "type":"txt", "x":900, "y":120, "text":"Draft", "size":40 } ] }
```

`html` (set by on-canvas editing) replaces that element's template text with `rich()`-formatted
markers, layered over `content` the same way geometry/style overrides are — so if both exist, the
override wins on the slide while `content` stays as the authored source. "Reset element" clears it.

A deck with no `overrides`/`freeObjects` renders byte-for-byte like a plain static deck — which is
why everything you generate stays clean and portable.

## Layout switching is safe

Changing a slide's layout loads that layout's default content (so the slide is never empty),
**carries shared fields over** (title, kicker, subtitle, accent), and **clears stale geometry
overrides** that referenced the old layout's elements. This is the fix for "text disappears after
switching layouts": text lives in `content` and is re-rendered fresh.

## Persistence

- **Autosave** to `localStorage` after every change (best-effort; some browsers restrict it on
  `file://`).
- **Save .html** (toolbar / `Cmd-Ctrl+S`) serializes the current deck JSON into a fresh clone of the
  file and downloads it — a full deck+editor with edits baked in, reopens clean. A browser can't
  overwrite the opened file, so saving always produces a new download; tell the user this.
- **Export/Import JSON** (`{ }` / `E`/`I`) remains for backup or hand-editing.

## Undo / redo & keys

Snapshot-based whole-deck undo (cap ~80). `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`. In Edit mode,
present-mode slide advancing (arrows/space/click) is suppressed so it can't interrupt editing —
navigate via the **Slides** panel. `Esc` deselects, `Delete` removes a selected object, arrows
nudge a selected object.

## Notes & limits (be honest with the user)

- `data-el` keys (including nested `b6.0` ones) are positional; if a slide's content shape changes a
  lot — reordering array items, switching layouts — an override (geometry, animation, or `html`) may
  detach or land on a different element. Recoverable via Undo or "Reset element". Plain text in
  `content` is unaffected.
- An on-canvas `html` edit and the sidebar **Content** field for the same element can diverge (the
  override wins on the slide). To go back to the content-driven text, use "Reset element".
- On-canvas text editing intentionally targets **leaf** text elements only; the right-click menu
  shows **✎ Edit text** only on a leaf — right-clicking a container (a grid/list wrapper) offers
  **Select** / **Reset** but no Edit text, so drill to the item/field first.
- The editor is vanilla JS with zero dependencies, so the single-file/offline guarantee holds.
