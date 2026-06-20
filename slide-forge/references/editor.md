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
layout switch**. Text fields offer inline-emphasis chips — **B** (`**bold**`), **✦** (`[[glow]]`,
the accent color), **‹›** (`` `mono` ``) — that wrap the selection.

**2. Object (geometry & style) — overrides layered on a template element or free object.**
Click an element on the slide to select it; the **Object** panel exposes position (X/Y), scale,
rotation, **text color**, **accent**, **font** (from the theme fonts), and a **surface** color.
These write to a per-slide `overrides` map (for template elements, keyed by `data-el` like `b0`)
or to a free object. Arrow keys nudge a selected object (Shift = 10px). "Reset element" drops the
override; "Delete object" removes a free object.

```jsonc
{ "layout": "stat-grid",
  "content": { "title": "By the numbers", "stats": [ {"count":94,"unit":"%","label":"…"} ] },
  "overrides": { "b0": { "x":120, "y":60, "rot":-2, "scale":1.1,
                         "color":"#ffd166", "font":"var(--font-mono)",
                         "theme": { "--cyan":"#ff5", "--bg":"#101" } } },
  "freeObjects": [ { "id":"f1", "type":"txt", "x":900, "y":120, "text":"Draft", "size":40 } ] }
```

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

- `data-el` keys for geometry overrides are positional; if a slide's content shape changes a lot,
  a geometry override may detach — recoverable via Undo or "Reset element". Text edits live in
  `content` and are unaffected.
- The editor is vanilla JS with zero dependencies, so the single-file/offline guarantee holds.
