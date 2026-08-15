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
Click an element on the slide to select it; the **Object** panel exposes position (X/Y),
**width/height** (width reflows text; 0/blank = natural size), scale, rotation, **text color**,
**accent**, **font** (from the theme fonts), a **surface** color, and an **Animation** effect
(+ delay). These write to a per-slide `overrides` map (for template elements, keyed by the
element's **authored `data-el` key** — a content path like `title` or `stats.2`) or to a free
object. Arrow keys nudge a selected object (Shift = 10px).
"Reset element" drops the override; "Delete object" removes a free object.

**Animation binding.** The Object panel's **Animation** section assigns one effect to the selected
element from a curated catalog (entrance: *fade-rise, reveal-wipe, typewriter, kinetic*; continuous:
*glow-pulse, shimmer, gradient-text, neon-flicker, float*) plus a **delay** in seconds. Entrance
effects replay when the slide opens (and a **▶ Replay** button previews them while editing);
continuous effects loop. Stored as `overrides[key].anim` / `.animDelay`.

**Nested elements (array items & their fields).** Every meaningful element carries an authored
key: named blocks (`title`, `rail`), array items by content path (`stats.2`, `left.items.0`) and
their child fields (`stats.2.label`). Select them via the **Elements tree** in the Inspector, or
**Alt-click** the element on the canvas to drill straight in. Once selected, all of the
above — style, geometry, and **animation** — apply to that individual item or field.

```jsonc
{ "layout": "stat-grid",
  "content": { "title": "By the numbers", "stats": [ {"count":94,"unit":"%","label":"…"} ] },
  "overrides": { "title": { "x":120, "y":60, "w":420, "rot":-2, "scale":1.1,
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
- **Clipboard.** `Cmd/Ctrl+C · V · D` copy / paste / duplicate within and across slides. A copied
  template element lands as a free object — content-backed if it has a layout to re-render from
  (see v5 below), free text if it's a lone leaf.
- **Z-order.** Bring forward / send back (`overrides[key].z` or `freeObjects[i].z`).
- **Keyboard.** Arrow keys nudge the selection (Shift = 10px); `Delete`/`Backspace` removes/resets;
  `Esc` clears; `Cmd/Ctrl+S` saves the `.html`; `Cmd/Ctrl+Z` / `Shift+Z` undo/redo.
- **Slide row tools.** The left panel's slide rows expose move-up/down, duplicate and delete on hover.

**Schema.** `meta.schemaVersion` is stamped to `3` on load by `SG.migrate()`. v1/v2 decks open
cleanly: their positional override keys (`b0`, `b3.1`) are remapped once to the authored keys at
first render (unmappable ones are dropped with a console note), then the deck re-saves as v3.
`raw` slides keep positional keys — their HTML has no content schema.

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
- **Faithful duplication.** Duplicating a container (right-click, toolbar, `Ctrl+D`) deep-copies it
  instead of producing an empty box. (v2.1 froze the markup into a `{type:"html"}` object; **v5**
  replaced that with a content-backed `{type:"node"}` copy — see below.) Nested array items
  additionally offer **Duplicate item (in layout)**, which clones the content entry in place.
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

## v3 — authored identity, exact write-back, reflow resize

The engine's layouts now return **node trees** (built with `SG.N`) instead of HTML strings, and
author identity directly (plan §10). Three attributes drive everything the editor does:

- **`data-el`** — the element's stable key, derived from its content path (`title`, `stats.2`,
  `left.items.0`). Overrides are keyed by it; it no longer depends on DOM position, so it can't
  silently reattach to a neighbouring element.
- **`data-bind`** — the exact `content` field a text leaf renders. On-canvas text edits write back
  to that path **deterministically**; the old "find the matching string value" heuristic is gone.
  An `html` override is used only for unbound composites (cover title+accent, code blocks), `raw`
  slides, and free html objects.
- **`data-arr`** — on containers, the content path of the array they render. **＋ add / ⧉ duplicate
  / ✕ remove item** parse the item index from the element key, so they also work where the DOM
  interleaves (pipeline connectors between nodes).

What that enables:

- **Overrides survive list edits.** Adding/duplicating/removing/reordering items REMAPS sibling
  override keys (a style on `stats.2` follows its stat when `stats.0` is deleted). Duplicating an
  item copies its overrides to the new slot. A GC pass in every structural commit drops overrides
  whose element no longer exists — logged to the console, reversible with Undo.
- **Resize means resize.** Dragging a corner handle changes the element's **width and height** —
  text rewraps inside the new box, like PowerPoint. Auto-height elements (text blocks, list
  containers, free text) only take a fixed height once the pointer moves ~5px on the Y axis, so a
  horizontal-only drag still leaves them free to grow. **Shift+corner** locks the aspect ratio
  (image/svg are locked by default — there Shift frees it); **Alt+corner** is the old proportional
  scale. `overrides[key].w/h`, editable in the Inspector (0/blank clears back to natural size).
- **Targeted re-render.** Typing in the sidebar re-renders only the current slide
  (`SG.renderSlide`), so large decks stay snappy; structural and theme changes still re-render all.
- **One undo per gesture.** Color-picker drags, token tweaks and arrow-nudge runs coalesce into a
  single undo snapshot instead of flooding the 80-deep stack.

Verification lives in `tests/` (jsdom): a 26-slide structural parity diff against the frozen v2
build, and 29 data-layer assertions (item remap, GC, migration, bind write-back, targeted render).

## Media (2026-07-31) — images, diagrams, links, embeds

Implements `slide-forge-media-plan.md`. See that file for the full design and the decisions in its
§7 (offline guarantee dropped for network-backed elements in favor of one shared "unavailable" card;
clipboard paste deferred; generation-time assets always embed with no size ceiling).

- **Asset registry v2** (`SG.assets`): `images[name]` is a legacy plain string, or an object —
  `{store:"embedded", src, w, h, bytes, type, alt}` (travels inside the .html) or
  `{store:"linked", path, w, h, bytes, type, alt}` (resolved relative to the deck; falls back to the
  unavailable card if the file is missing). `svg{}` is a sibling bucket for inline diagram markup.
  `SG.imageMeta`/`imageURL`/`svgMarkup` normalize all shapes.
- **`SG.unavailable(spec)`** — the one component used for a missing linked image, an unreachable/
  blocked embed, or (inline variant) a link shown while the browser is offline. Same wording and
  styling everywhere: editor, present, thumbnails, speaker view, print.
- **Image/svg free objects** (`type:"image"`/`"svg"`): `{asset, fit, focal:[x,y], radius, opacity,
  frame, alt, href?}`. Drop a file on the canvas or use the 🖼 Assets library panel to import;
  corner-drag resizes with the aspect ratio **locked by default** (Shift frees it — the inverse of
  the text case, where reflow is the point). No clipboard paste in v1 (§7.2 of the media plan) — use
  drop-import or the library panel.
- **Asset library panel** (`F.assetsPanel`, toolbar 🖼 Assets): import, insert, inline rename
  (remaps every reference via `F.assets._remapRefs`), replace file, delete with an undo bar, and
  "Link instead of embed" (downloads the original + converts the registry entry to a relative path).
  The size meter is informational only — it never blocks an import.
- **Media layouts**: `image`, `media-split`, `gallery`, `diagram` (content schemas in
  `references/layouts.md`). All four follow the v3 identity contract above. `figure` was upgraded to
  render a real `<img>` instead of a CSS `background-image`, specifically so a missing asset's
  native `error` event can drive the unavailable fallback (a CSS background failure is silent).
- **Links**: `href` on any override or free object (`{href:"https://…"}`, `{href:"#3"}`,
  `{href:"mailto:…"}`). Sanitized on write by an allow-list (`F.sanitizeHref` in editor.js,
  `HREF_RE` in `scripts/validate.py`) — `javascript:`/`data:`/anything else is rejected outright, not
  silently dropped. Rendered as `data-href` + `role="link"` + `tabindex="0"` on the existing node
  (deliberately not wrapped in `<a>`, which would disturb `data-el` identity); a delegated click/
  Enter handler in `engine.js` (`SG.followLink`) resolves it. A small ↗ badge shows in edit mode
  only (pure CSS, gone once `body.forge-edit` is removed on save). `html[data-offline]` (from the
  browser's own `online`/`offline` events) drives a small ⚠ marker on external links — a *specific*
  dead link while online can't be detected (opaque cross-origin response), so that case is
  intentionally not claimed.
- **Embeds** (`type:"embed"` free object, or the full-slide `embed` layout): a sandboxed iframe
  (`sandbox="allow-scripts allow-popups"` by default; `allow-same-origin` is a separate, explicitly
  labelled "trust this site" toggle) behind a transparent **shield** — always pointer-events:auto
  while editing (so the object stays draggable/selectable no matter what), and in present mode either
  click-to-interact (`mode:"click"`, default — the hint disappears once clicked, **Esc** restores it),
  always-live (`mode:"live"`, no shield at all), or never-loaded (`mode:"poster"`). A 6s heartbeat
  swaps a loading/blocked/offline embed to the unavailable card instead of a blank rectangle — but
  this is a heuristic, not a guarantee: verified empirically, many `X-Frame-Options` refusals still
  fire the iframe's `load` event (the browser considers the navigation complete even though it
  refused to render), which the heartbeat can't distinguish from success. Every embed ALSO carries an
  always-present, normally-hidden poster card; `F.posterize()` strips the live iframe and forces that
  poster visible wherever a slide gets cloned for separate display (sorter thumbnails, speaker view,
  deep-copy), and print/`SG.static` do the same **unconditionally**, via CSS alone, regardless of the
  on-screen load state — an iframe cannot be captured in a print job (media plan §7.1). Esc-to-restore
  can't reach keystrokes typed *inside* a cross-origin frame once it has focus — an inherent iframe
  limitation, not something worth chasing further. Corner-drag resizes an embed **freely on both
  axes** (unlike image/svg, an embed doesn't default to aspect-locked — a video player's useful shape
  varies too much to assume 16:9). The Inspector's **⛶ Fill slide** button is a one-click way to size
  an embed to the full 1280×720 stage; it remembers the prior geometry (`freeObjects[].fillPrev`) so
  a second click restores it, and ordinary drag/Width/Height editing keeps working normally in either
  state — it's a starting point, not a locked mode. (2026-07-31 fix: this axis + the fill toggle were
  added after QA found corner-drag only resized width for embeds — a stale ad hoc type check that
  predated the fill toggle and simply never included `"embed"`.)
- **Storage**: generation-time assets (`assets/images/`, `assets/diagrams/` via `scripts/assets.py`)
  always embed, no size ceiling — the delivered deck may exceed the 450 KB *template* budget
  (`scripts/build.py`'s budget covers code only). Editor imports downscale to 1920px/WebP by default
  and get their own quota-safe localStorage key, separate from deck-JSON autosave, so an oversized
  asset registry can never cost the user their text edits.

## v4 (2026-07-31) — editing for people who don't read markup

Implements `slide-forge-editor-ux-plan.md` (design handoff + prototype). The goal of this pass was
narrow and specific: **an editor a non-programmer can use**. Everything below is still additive —
present mode, the engine, the layouts and the data model are untouched, and a deck with no
`overrides`/`freeObjects` renders byte-for-byte as before.

### The sidebar is now a list of things, not a tree of nodes

**"On this slide"** replaces the v2.1 Elements tree as the right panel's home view, and it *stays
visible while something is selected* (the Selected panel appears below it, so the list you picked
from never vanishes under you).

- One row per element, named in plain language: `stats` → **"Stat cards"**, `stats.2` → **"Stat 3 —
  12×"**. Names come from three small maps (`FIELD_LABEL`, `ITEM_LABEL`, `ARRAY_LABEL`) with a
  `pretty()`/naive-singular fallback, so a new layout still reads sensibly. **A dotted key is never a
  primary label** — it survives only as a small mono chip in the Selected card, for debugging.
- An item's row reads from **content, not the DOM**: the DOM text of a stat is mid-count-up ("0",
  "3" for 3.2) and runs its fields together. The headline field goes after the item number, the
  descriptive field underneath.
- **What earns a row:** top-level blocks, list containers, and the items in a list. Not the leaves
  inside an item — real layouts nest four or five deep and listing every leaf turns a 4-stat slide
  into 20 rows; those fields are already labelled inputs in the Selected panel. Purely decorative
  keyed nodes (cover orbs, rails, timeline dots — no text, no binding, no children) are filtered out
  of the list but stay selectable on canvas.
- **Hover a row → the element outlines on the canvas**, and vice-versa. Click selects.
- **The eye** writes `overrides[key].hide` (or `freeObjects[].hide`). Hidden elements render at 12%
  opacity **while editing** — so they can be found and brought back — and are genuinely `display:none`
  when presenting, printing, or in a downloaded copy. Undoable like any other edit.
- Below the list: **＋ Add \<item\>** (derived from the `data-arr` the selection sits in, else the
  slide's first list) and **⤢ Manage items…**.

### Selection: a breadcrumb up, a second click down

- **Breadcrumb** (floats top-centre over the stage): `Slide ▸ Stat cards ▸ Stat 3 ▸ Label`. Each chip
  selects that key prefix; "Slide" clears the selection. Derived by `F.crumbPath(sel)` — exported so
  the path logic is assertable without a viewport.
- **Click again to go deeper.** The first click on a group selects the group (so dragging still moves
  the whole thing); clicking inside the current selection steps down **one** level of the key
  hierarchy. Alt-click still jumps straight to the deepest element. This is the discoverable
  counterpart to the breadcrumb — Alt-click alone was not something this audience finds.

### The inspector is contextual

The **Selected** panel shows only what applies to the selection kind (text leaf / list container /
list item / free object):

- **Identity card** — icon, plain name, and the mono key chip.
- **That element's own content fields**, rendered with the *same* widget renderer (`fieldFor` /
  `contentForm`) the sidebar Content panel and the Manage-items modal use, so the three can't drift.
  A bound leaf shows one field; a list item shows its fields; a container shows a count and an Add.
- **Text size** — a direct px stepper writing a new override prop **`fs`** (10–200px), applied in
  `applyStyle` next to `color`/`font`. Additive, no migration.
- **Style & formatting** (collapsible, open by default) — five **theme-token** swatches (`--ink`,
  `--cyan`, `--indigo`, `--mint`, `--muted`) that write `var(--cyan)`, **not hex**, so re-theming and
  brand kits keep working; a Reset chip; and **B / ✦ / `<>`** chips that toggle `**bold**` /
  `[[glow]]` / `` `mono` `` around the **whole element's** bound content value. The old literal colour
  picker survives as "Exact color", folded away with Font/Accent/Surface.
  Range-level formatting is unchanged and still lives on the canvas (double-click, highlight, the
  floating toolbar) — the panel copy says so explicitly.
- **List verbs** for an item — ↑ ↓ ⧉ ✕, landing in `content` through the existing `data-arr`
  machinery. **Selection follows the item** when it moves or is duplicated (repeated ↑ walks a card
  up a list), and its overrides follow it, as they already did.
- Geometry, Link and Animation fold away (`F._open` remembers per-title open state).

### Stage: zoom and ⌖ Focus

While editing, the deck is fitted **to the stage between the panels** rather than to the whole window
— previously the side panels overlapped the slide. This is an optional engine hook: `fit()` calls
`SG.viewTransform()` if something installed one, else keeps the v3 `scale(min(w/1280,h/720))`. Present
mode and plain decks are unaffected (the hook returns `null` when `body` isn't `.forge-edit`).

- One combined `translate(...) scale(...)` on `#deck`, transitioned 450ms `cubic-bezier(.22,1,.3,1)`.
- Controls bottom-right: **⌖ Focus** toggle + **− / % / ＋ / Fit** pill. `Ctrl/Cmd + scroll`,
  `Ctrl +`, `Ctrl -` and `Ctrl 0` (fit) also work. 100% = fitted; zoom clamps to 0.25–3×.
- **Focus** centres the selected element at ~1.7× (capped so a large element still fits) and
  **follows the selection** while on; Fit resets zoom and turns it off.
- **Gesture math is unchanged and stays correct**, because `scale()` already reads the *rendered*
  width of `#deck` back off `getBoundingClientRect()` — it sees the combined scale for free. Verified
  in a browser: at 200% zoom a 100px pointer move produces exactly `round(100/1.588) = 63` slide px.

### "Manage items" replaces the structure modal

`#forge-struct` is now titled **Manage items — "\<slide title\>"** with two tabs:

- **Items** (default) — every field on the slide, side by side, using the shared content renderer:
  scalars in a 2-column grid, then one section per content array (**"Stat cards · 4"** with a green
  **＋ Add stat**) and one card per item (**↑ ↓ ⧉ ✕**) in a 2-column grid. Everything routes through
  `F.do()` and applies to the slide instantly. The modal re-renders itself when a structural edit
  re-runs `buildInspect`, so it can't go stale behind you.
- **Advanced (JSON)** — the v2.2 direct JSON editor, unchanged (Copy / Apply round-trip). Demoted to
  a tab, deliberately **not removed**: it is the power-user escape hatch and the only way to re-shape
  a slide wholesale.

`arrayEditor` gained a **⧉ Duplicate** verb and plain-language headers, which the sidebar gets too.

### ⊞ Insert an element, and a fuller top bar

- **Insert gallery** — a searchable 4-column grid of every insertable element type across the
  layouts. Each card's preview is a **live, scaled miniature of the real element**: the layout is
  rendered with its `DEFAULTS` content into an off-screen slide-sized `.forge-ghost` section (so the
  deck's CSS cascade and theme apply), the element is measured, and the copy is scaled to the card.
  Ghosts are always removed before anything commits — they must never be in `#deck` during a render,
  or `.slide` indices would shift. A catalog entry whose key no longer resolves is skipped silently,
  so a layout change degrades to a missing card rather than a crash.
- Clicking inserts it as a themed `freeObjects` entry (the same path `Ctrl+D` uses — `{type:'node'}`
  since v5), centred and selected, at a clamped starting width — a grid cell measures as wide as the
  grid stretched it, which is not a sane object size. Free objects may now carry a `name`, shown in
  the items panel and inspector instead of "Copied group".
- **Top bar**: ＋ Slide · ⧉ Duplicate · T Text · ▭ Box · ▣ Image · ⊞ Insert · 🖼 Assets · ◲ Embed ‖
  ▦ Sorter · ◐ Theme · ⚙ Deck ‖ ⟲ ⟳ ‖ ？ · { } JSON · ▶ Present · **Save .html**. Every button has a
  tooltip. ◐ Theme and ⚙ Deck open the *same* renderers the sidebar uses (`themeSection`,
  `brandPanel`, `deckSettings`) in a modal, so they're reachable without deselecting first; ▣ Image
  is the file-picker twin of drag-and-drop import.

### New data keys (all optional, no migration)

`overrides[key].hide` · `overrides[key].fs` · `freeObjects[].hide` · `freeObjects[].name`.
`meta.schemaVersion` stays **3** — nothing about identity or write-back changed.

## v5 — content-backed copies (`{type:"node"}`)

**The problem.** A duplicated or inserted element used to freeze into `{type:"html"}`: the clone had
its `data-el`/`data-bind`/`data-arr` stripped, which are exactly the attributes that make an element
editable. The copy kept its looks and lost its fields — an inserted metric ring had no way to change
its value, no text editing, no list verbs, and (until this release) a "Text" box in the inspector
that did nothing at all.

**The fix.** A copy now carries the *data* it was made from, not the pixels:

```jsonc
{ "id":"f7x2k", "type":"node",
  "layout":"metric-dash",                      // the layout to re-render
  "pick":"ring",                               // the branch of it to mount
  "content":{ "ring":{"value":72,"suffix":"%","label":"Uptime"}, … },
  "overrides":{ "ring.label":{"color":"var(--cyan)"} },   // its OWN bag, keys relative to `pick`
  "x":565, "y":270, "w":150 }                  // no h — height follows content, width reflows
```

On every render the editor runs `SG.layouts[layout](content)`, lifts the subtree at `pick`, and
mounts it **with its authored keys intact**. So the copy behaves like the element it came from:
fields in the inspector, double-click text editing, `＋ Add item` / reorder / remove on its lists,
per-part styling and animation — all of it writing to the object's own `content`/`overrides`, never
the slide's.

- **Namespaced keys.** A mounted part's key is `<objectId>/<key>` (`f7x2k/ring.label`). The `/` can't
  occur in a content path, so a copy can never collide with the slide's own keys, and one parse
  (`partOf`) tells every accessor which content root and override bag a key belongs to (`scopeOf`).
  Nothing user-facing shows the namespace — labels, breadcrumbs and the identity chip strip it.
- **Selection.** First click selects the whole object (draggable); clicking again drills into it,
  exactly as on the slide. The breadcrumb reads `Slide ▸ Metric ring ▸ Stat 2 ▸ Label`.
- **Items panel.** A copy's lists and list items get rows indented under it.
- **Item ops need a MOUNTED list.** A copy keeps its layout's whole content but mounts only the
  picked branch, so a copy of *one* stat card (`pick:"stats.0"`) still carries the entire `stats[]`
  while rendering a single item. Adding to it there would grow an array nothing draws, so
  add/duplicate/remove decline (`listMounted`/`itemArr`) and `Ctrl+D` falls through to copying the
  **whole object** — which is what "duplicate this card" means anyway. A copy of the list itself
  (`pick:"stats"`) does mount `data-arr` and gets the full set of verbs.
- **Where it does NOT apply.** A lone text leaf still copies as `{type:"txt"}` — lifted out of its
  parent it would lose any styling written as a descendant selector, and free text is already fully
  editable. Markup with no layout behind it (a `raw` slide) still freezes into `{type:"html"}`, which
  keeps rendering for existing decks and now says so in the inspector.
- **Layout CSS.** Rules written against the section (`.quote blockquote`) still match: the subtree is
  mounted inside a `.forge-part-shell` carrying the source layout's classes, at `display:contents`
  so it adds no box of its own.
- **Degradation.** If the layout or the picked key no longer exists (a deck edited by hand, a layout
  renamed), the object renders a short "no longer part of this layout" card instead of throwing.

`scripts/validate.py` checks `layout`/`pick`/`content` and the object's own override bag; the
content is schema-checked against its layout exactly like a slide's.

**Still schemaVersion 3.** `type:"node"` is a new optional free-object shape, not a migration.

### Verification

`tests/editor-ops.mjs` gained ~45 data-layer assertions (label derivation, hide semantics in both
modes, breadcrumb path, token-swatch and marker writes, `fs`, item-verb reorder with style+selection
following, modal edits landing in content, gallery insert shape, viewport-hook inertness, zoom
clamps). **These were not run in this workspace — it has no Node.** Every one of them was instead
mirrored and passed in a real browser (Chrome, served over `python -m http.server`), which also
covered what jsdom can't: focus centring to the stage centre, gesture math at zoom, live preview
miniatures, and the downloaded copy carrying no editor chrome.

---

# v6 — composition, personality, whole-slide presets (2026-08-15)

The composer upgrade. Full design in `docs/plans/slide-forge-composer/`. Additive as always:
present mode, the identity model and every existing data key are untouched, `meta.schemaVersion`
stays **3**, and a deck with no `composed` slide and no `personality` renders exactly as it did.

## Sections and the `composed` layout

A slide can now be an **arrangement of sections** instead of one fixed layout. The mechanism is
worth understanding because it explains why nothing else had to change:

```js
S[type].build(content, base) -> Node[]
```

A section *is* the classic layout's own body, extracted and parameterized by one key prefix. At
`base=''` it is the classic layout (byte-identical — `tests/parity.mjs` is the guard); at
`base='sections.2.content.'` it is a section of a composed slide. **One implementation, two
callers.** Because every authored `data-el`/`data-bind`/`data-arr` key stays a literal content path,
overrides, bind write-back, `hide`/`fs`, item verbs and the orphan GC all work at section depth with
no new machinery — the payoff of the v3 authored-identity decision.

Twelve section types (`titleband`, `stats`, `bignum`, `chart`, `table`, `comparison`, `quote`,
`agenda`, `timeline`, `prose`, `media`, `bullets`) live in `src/sections.js` alongside the ten
classic layouts that are now compositions of them. `SG.SECTION_TYPES` is the single source of the
list, read by both the editor and `scripts/validate.py`.

Data shape: `content.sections = [Section | Row]`, `Section = {type, size?, content}`,
`Row = {type:'row', size?, items:[Section]}`. **Rows cannot nest** — a deliberate ceiling.

### The sizing rules (settled after several wrong attempts; don't re-derive them)

- `size` writes **`flex-grow` only**, never the `flex` shorthand. The basis differs by axis: `0` in
  a row so weights read as literal width proportions, `auto` in the column so a weight distributes
  *leftover* height and can never cap a section below its content.
- `.sec` keeps flexbox's **automatic minimum height**. The elastic types (`chart`, `table`,
  `timeline`, `media`) opt out with `min-height:0` and absorb an over-full slide. A chart's SVG
  carries ~600px of *intrinsic* height, so without that split the shrink phase takes a proportional
  bite out of every section and the rigid ones spill off the bottom.
- Rigid bodies (`.stat-grid`, `.cmp`, `.editorial`, `.agenda-grid`, `.take`, `.gallery`) get
  `flex-basis:auto` back inside a `.sec`, or they contribute nothing to their section's height.
- CSS refugees — rules scoped to a classic layout's own `<section>` or wrapper (`quote`, `bignum`,
  `.media-split .ms-media`, `.media-split .ms-text`) — are **dual-scoped** onto `.sec-<type>`.

## Promotion

`SG.TO_SECTIONS[layout](content) -> {sections, keymap}` for the ten decomposable classics.
`F.promoteSlide(i)` rewrites the slide and remaps override keys **longest-prefix-first** — matching
on `k === p || k.startsWith(p + '.')`, which is what stops `title` swallowing `timeline`. The whole
rewrite is one `F.do`, so one undo restores the classic slide exactly.

Reachable from right-click, "Convert to composed". It never runs on load.

**One deliberate loss:** agenda's `rail` is slide chrome with no section to live in, so converting
an agenda slide drops a styled rail. The orphan GC removes the key and logs it.

## Integrated insert — the point of the whole exercise

`F.insertIntoFlow(slideIdx, secType, content?, atIdx?)`. From the Insert gallery, one click has
three outcomes and the user is always told which they got:

| target slide | what happens |
|---|---|
| `composed` | the section is spliced into the flow; neighbours make room |
| decomposable classic | a two-button confirm, then promote + insert as **one** undo step |
| genuinely bespoke | the old floating object, plus a toast saying why |

13 of the 26 gallery cards carry a "joins the layout" tag (the 5th field in `GALLERY`). A card that
picks one item of a list ("Stat card" picks `stats.0`) inserts a section holding **one** item, so
the list verbs work on it immediately.

Section verbs: `F.moveSection` / `F.removeSection` / `F.resizeSection`, all remapping override keys
through the same helper the item verbs use (`sections` is just another array path). A move lifts the
moved section's overrides out *before* the shift and puts them back at the destination. The
inspector shows a **"Section N of M"** block whenever the selection is inside a section at any
depth, and sections name themselves by type ("Stat row") off their `.sec-<type>` class.

New chrome: `F.toast(msg)` and `F.confirmDo(title, body, okLabel, ok, altLabel, alt)` — two *named*
buttons, because both outcomes are legitimate and neither is "cancel".

## Personality

`data.personality` becomes `data-personality` on `<html>`, driving `src/personality.css`. Themes own
colour; personalities own type, space, shape and motif. Two to start: `editorial` and `blueprint`.
Thirteen `--p-*` tokens, each consumed as `var(--p-x, <today's value>)` at its use site, so deleting
the file changes nothing and a deck with no personality matches no rule in it.

**The font-precedence trap.** Themes write `--font-*` as *inline* styles on `<html>`, which beat any
stylesheet, so a personality declares `--p-font-*` and `SG.applyPersonality` copies them onto
`--font-*` inline — after the theme, before the brand kit, which wins over both. The **clearing** of
those inline props is a separate `SG.clearPersonalityFonts()` that must run **before**
`applyGlobalTheme`: doing it inside `applyPersonality` strips the font the theme just set, so
turning a personality off silently took the theme's typeface with it.

## Whole-slide presets

Ten built-in `PRESETS` (8 composed) on a new **Slides** tab; the Insert gallery is now
Elements | Slides | From this deck. `gallerySlideThumb` renders a whole slide into the off-screen
ghost and scales it into a 16:9 well, so a preview carries the deck's live theme *and* personality.
Built on tab open, never at editor boot. `F.insertPreset` deep-clones, so an inserted slide can
never edit the built-in.

"From this deck" is the existing `data.masters`, unchanged on disk — a master may now hold a
composed slide (`base` already recorded the layout). `F.saveMaster(name, slideIdx)` is now a real
function rather than a button handler.

**Naming trap:** the preset card was `class="forge-gal-card slide"` and picked up **deck.css's**
`.slide{position:absolute; inset:0}`, blowing every card out to 1280px inside a 202px grid track.
Editor chrome must never reuse a deck class name; the modifier is `whole`.

## Verification

`tests/editor-ops.mjs` is at **253 assertions** (from 142), covering composed key authoring,
section-depth overrides, promotion remapping and single-undo restore, insert-into-flow in all three
target states, move/remove/resize with overrides following, bind write-back at row depth,
personality data + attribute semantics, preset deep-clone isolation, masters round-trip, and the
`.forge-ghost` sweep. `tests/parity.mjs` holds at its **7-diff baseline**, which is itself the proof
that ten re-expressed layouts render byte-identically.

**Run in this workspace this time** (Node 26 is on PATH via PowerShell). What jsdom still cannot
reach was verified in a real browser and recorded in `docs/plans/slide-forge-composer/00-status.md`:
composed geometry (no bounding box crosses 1280x720, row weights landing at 713/357), the
neighbours-make-room insert, personality font precedence and measured token deltas, and the preset
thumbnails. Rebuild the browser fixture with `python tests/make-demo.py`.
