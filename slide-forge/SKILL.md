---
name: slide-forge
description: Generate a polished presentation that ships as ONE self-contained, editable .html file — a deck plus a built-in visual editor in one file. Claude builds the first draft (narrative, layouts, the user's text, any icons/images they supply); the delivered file then lets the user keep editing in the browser with no install — toggle Edit to drag/resize/rotate elements, edit text and nested list items, add slides or free text/boxes, switch themes or recolor one object, undo/redo, then download the edited file. Use this skill WHENEVER the user wants slides, a deck, a presentation, a slideshow, a talk, a pitch, or to turn notes/an outline/a topic/a document into slides AND wants to edit or rearrange them afterward themselves — even if they don't say 'editor'. Prefer slide-forge over the plain slides skill when the user mentions editing, moving things around, tweaking later, drag-and-drop, or handing an editable deck to someone. For PowerPoint .pptx use the pptx skill; for a static non-editable HTML deck use slides.
---

# Slide-Forge — generate a deck that ships its own editor

Produce **one `.html` file** that is two things at once: a finished presentation (open it,
press `F`, present) **and** an editor for itself (press **Edit**, rearrange everything by hand).
Claude generates the first construction — the narrative, the layout for each idea, the user's
chosen words, and any icons/images they provide — and the file hands the user a real editing
surface afterward, with no install and no server.

The deck is **data-driven**: all content lives in one JSON block (`<script id="deck-data">`). A
small in-file engine renders each slide from a registry of layout templates and derives the pager
and progress bar from position, so adding or reordering slides never means renumbering. **You do
not start from a blank file — you copy `editor-template.html` and replace its `deck-data` JSON.**

```
slide-forge/
├── SKILL.md                ← you are here
├── editor-template.html    ← the standalone deck+editor. COPY THIS, edit its deck-data JSON.
├── references/
│   ├── layouts.md          ← FULL per-layout content schema (read when authoring slides)
│   ├── charts.md           ← chart + table data schemas (v2: author charts as DATA, never SVG)
│   ├── themes.md           ← 11 drop-in palettes (let the user pick)
│   ├── personalities.md    ← 2 design personalities (type/space/shape) — picked WITH the theme
│   ├── motion.md           ← element motion (calm/standard/expressive/off) + step-through reveal
│   ├── audiences.md        ← 8 content strategies (let the user pick)
│   ├── templates.md        ← brand kits, masters, template packs
│   └── editor.md           ← how the in-file editor works + what to tell the user
├── templates/              ← curated template packs (apply with deckdata.py)
├── src/ + scripts/build.py ← the template's SOURCE; build only when developing the tool itself
└── scripts/
    ├── assets.py           ← inline user-provided icons/images so the file stays single-file
    ├── validate.py         ← per-layout schema validation (run before delivering)
    └── deckdata.py         ← extract/inject deck JSON; template extract/apply (packs)
```

The editor layer is **purely additive**: a deck with no manual edits renders identically to a plain
static deck. Everything Claude generates is normal slide data; the editor simply lets the user layer
position/scale/rotation/recolor *overrides* and free-floating objects on top later.

---

## Workflow (follow in order)

1. **Ask the user first.** The **audience strategy** (how the content is built) and the **theme**
   (what colour it is) are required, presented as short pick-lists, never silently defaulted. Then
   two optional ones, asked fast: a **personality** (what character it has — type, spacing, shape;
   "editorial / blueprint / default?") and a **brand kit** ("logo / brand colors / fonts, or shall I
   use the theme as-is?"). Strategies live in `references/audiences.md`, themes in
   `references/themes.md`, personalities in `references/personalities.md`, brand format in
   `references/templates.md`. If the user has a team template pack, apply it instead:
   `python3 scripts/deckdata.py template apply pack.json <deck>.html`.
2. **Plan the narrative.** Using the chosen strategy's arc, turn the topic/notes into an ordered
   slide list — one idea per slide — and give each one a shape. Aim for variety; don't repeat a
   shape back-to-back. Skim `references/layouts.md` for the fields.
   **Fit the shape to the idea, not the idea to a shape.** If a fixed layout matches the idea
   exactly, use it — it is the shortest way to write a common arrangement. If it doesn't, build a
   `composed` slide out of sections (title band, stat row, chart, quote, picture, bullets…) rather
   than forcing the idea into the nearest layout or dropping to `raw`. A stat row under a chart, a
   quote beside numbers, a picture next to bullets with a headline over both — all of those are one
   `composed` slide and none of them is a fixed layout. `raw` is a last resort, not a second option.
3. **Copy the template:** `cp editor-template.html <deck>.html`. You edit its JSON, not its markup.
4. **Apply the theme once, and the personality if there is one.** Swap the font `<link>` and the
   `:root` block for the chosen theme's (from `references/themes.md`), and add the personality's font
   pairing to the same `<link>`. The personality itself is one key in the deck JSON —
   `"personality": "editorial"` — not a CSS edit. Omit the key for the default look. The user can
   change both later from the editor; this sets the starting look.
   **Pick a `defaults.motion` deliberately from the same audience read that picked the strategy in
   step 1** — `calm` for a serious/regulated/executive audience, `expressive` for a keynote or
   launch, otherwise leave it unset (`standard`, the built-in default). Never reach for
   `"ambient":"none"` to mean "calm" — that only ever silences the background layer now; `motion` is
   the actual dial. See `references/motion.md`.
5. **Write the content as JSON.** Charts are DATA (`references/charts.md`) — labels + series, never
   hand-drawn SVG.  Replace the `<script id="deck-data">` block: set `meta.title`,
   and build the `slides` array — one `{ "layout", "content" }` object per slide. Read
   `references/layouts.md` for each layout's `content` fields. Use the user's exact words where they
   gave them; where they gave a topic, write tight slide copy (titles ≤ 6 words, supporting lines
   ≤ ~14 words). This is the whole deck — there is no per-slide HTML to renumber.
   If a slide's whole point is being talked through one item at a time (a phased plan, a
   step-by-step comparison, a build-up to a number), give THAT slide `"reveal":{"style":"…"}` —
   see `references/motion.md` for the five styles. Most slides want no `reveal` at all.
6. **Add the user's icons/images (only if they provided them).** See *Assets*. If they gave none,
   leave icon/image slots out — do not invent or fetch images.
7. **Self-inspect (required).** Validate the JSON and confirm the deck structure before delivering
   (see *Checking your work*).
8. **Deliver the single `.html`.** Present it, and tell the user the two things they can do:
   present it (`F`), or click **Edit** (bottom-right) to rearrange, retheme, add slides, and then
   **Save .html** to download their edited version. See *What to tell the user*.

Keep the deck a single file. The only external dependency is the web-font `<link>`, which degrades
to installed fallbacks, so it still works offline from `file://`.

---

## The deck data model

One JSON object in `<script id="deck-data">`:

```jsonc
{
  "meta":   { "title": "How Machines Learn", "seed": 7 },
  "theme":  "midnight-neon",                 // label; the real palette is the :root you pasted
  "personality": "editorial",                // optional: type/space/shape/motif. Omit = default look.
  "defaults": { "ambient": "auto", "motion": "calm" },   // motion: omit for the standard default
  "slides": [
    { "layout": "cover",  "content": { "title": "How Machines", "accent": "Learn", "subtitle": "…" } },
    { "layout": "stat-grid",
      "content": { "title": "By the numbers", "stats": [ { "count": 94, "unit": "%", "label": "…" } ] } },
    { "layout": "agenda", "reveal": { "style": "spotlight" },
      "content": { "items": [ { "title": "…" }, { "title": "…" } ] } }
  ]
}
```

- **`layout`** picks a template; **`content`** is that layout's fields (in `references/layouts.md`).
- **Numbering is derived** — never store pager text or progress widths.
- Inline emphasis in text fields: `[[glow]]`, `**bold**`, `` `mono` ``.
- A slide can carry a `"theme"` object (per-slide recolor), `"ambient"` ("auto"/"none"/a named
  motion — background texture only), `"motion"` ("calm"/"standard"/"expressive"/"off" — element
  motion, `references/motion.md`), and `"reveal"` (`{"style":"…"}` — step through its list point by
  point). The **`raw`** layout (`content.html`) is the escape hatch for a one-off bespoke slide.

You author the deck purely through `content`. The editor's manual edits land in two **optional**
per-slide channels you normally leave absent — `overrides` and `freeObjects` — documented in
`references/editor.md`. You generally don't write those by hand; the user creates them in the editor.

---

## Assets: user-provided icons, images & diagrams only

This skill does **not** generate or fetch imagery. Use only files the user supplies.

- Drop their `*.svg` icons into `assets/icons/` and reference by filename: `{ "icon": "rocket" }`
  or `{ "iconAsset": "rocket" }` (the `stack`/`pipeline` layouts take `iconAsset`). Author icons with
  `stroke="currentColor"` / `fill="currentColor"` so they inherit the theme color.
- Drop their images into `assets/images/` and reference by filename: `{ "image": "architecture" }`
  — used by `figure`, `image`, `media-split`, `gallery`.
- Drop their diagram `*.svg` files into `assets/diagrams/` and reference by filename:
  `{ "svg": "request-flow" }` on the `diagram` layout. Author them the same theme-aware way as icons
  (`currentColor`); unlike icons these can carry their own multi-color palette too.
- Inline everything so the file stays single-file and offline:
  `python3 scripts/assets.py inject <deck>.html <deck>.json`. Images embed **at full quality with no
  size ceiling** — a deck is allowed to be large because the user supplied large images; don't
  downscale or compress source files yourself. (`--link-over N` exists for the opt-in case where the
  user wants `deck.html` + an `assets/` folder shipped side by side instead — only use it if asked.)
- Alt text lives on the asset (`assets.py` leaves it blank; the user fills it in from the editor's
  Asset library). You don't need to author it.
- A missing/unreachable image or diagram never renders blank — it falls back to a small "Content
  unavailable" card, in the deck and in the printed PDF alike.

If the user provided no assets, build a clean text-and-shape deck — the layouts look complete without
icons. Never substitute stock or AI imagery the user didn't ask for.

---

## Theming

All color and type live in CSS variables in `:root`; retheme by editing variables only. To set the
starting theme, swap the `:root` block and the Google-Fonts `<link>` for the chosen palette in
`references/themes.md` (the two edits that file documents). Keep a distinctive display face and the
`DejaVu` fallbacks so it renders offline. The user can switch themes later from the editor's Theme
control, recolor any single slide (per-slide `theme`), or recolor a single object — all via CSS
variables, so nothing hard-codes a color.

---

## Content & layout principles

- **One idea per slide.** If a slide has two ideas, split it.
- **Structured layouts beat bullet walls.** Prefer a stat grid, comparison, timeline, pipeline,
  big-number, dashboard, matrix, or chart over a generic list. When you do list, keep items short
  and never more than ~6.
- **Short text.** Titles ≤ 6 words; supporting lines ≤ ~14 words. The slide is a visual aid.
- **Lead with the takeaway**, not the buildup.
- **Use the user's words.** When they gave specific copy, keep it. When they gave a topic, write
  the copy yourself in this tight style and tell them they can edit any of it in the editor.

The 29 layouts: cover · agenda · divider · stat-grid · bignum · chart · comparison · quote · code ·
timeline · pipeline · closing · manifesto · editorial · hero-asym · figure · metric-dash ·
leaderboard · diptych · matrix · stack · quote-mosaic · index-mosaic · before-after · image ·
media-split · gallery · diagram · embed — plus `raw`. Reach for `image`/`media-split`/`gallery`/
`diagram` whenever the user supplied photos, screenshots, or diagram SVGs — they're the
purpose-built layouts for that content, better than shoehorning imagery into `figure` or a `raw`
slide. Only reach for `embed` when the user specifically wants a *live* external page on a slide —
it's the one layout that needs the network; everything else in the deck stays fully offline.
`references/layouts.md` is the full field reference; read it while authoring.

**Links**: any object can carry `overrides[key].href` / `freeObjects[].href` — `"#3"` jumps to
slide 3, `"https://…"`/`"mailto:…"` opens in a new tab. You don't normally author these by hand
(the user adds them from the editor's Link field), but they're valid deck-data if asked for.

---

## What to tell the user (include a short version on delivery)

The delivered file does double duty, so close by telling them how to use both halves:

- **Present:** open the file, click to advance, press `F` for fullscreen.
- **Edit (no install):** click **Edit** (bottom-right). The right panel opens on **"On this slide"** —
  every element on the slide, named in plain English ("Stat 3 — 12×"), not code. Hover a row to find
  it on the slide, click to select it, and use the **eye** to hide something without deleting it.
  Selecting anything shows just what applies to it: its own text fields, a **text-size** stepper,
  colour swatches that follow the theme, **B / ✦ / `<>`** formatting, and **↑ ↓ ⧉ ✕** to reorder,
  duplicate or remove a list item.
- **On the slide itself:** **drag any element to move it** — smart guides snap it to centers, edges
  and neighbours (hold **Alt** to snap freely). Drag a corner to **resize both width and height —
  text rewraps** inside the new box (hold **Shift** to keep the proportions, **Alt** to scale the
  whole element instead), the green handle to rotate, and
  **double-click any text to edit it in place** (highlight part of it and a floating **B / ✦ / `<>`**
  toolbar formats just that range). Click a group once to select it, **click again to step inside**
  it; the **breadcrumb** above the slide walks back out. **Shift-click or drag a box** to select
  several at once, then **align & distribute** from the floating toolbar. **Copy / paste / duplicate**
  with `Cmd/Ctrl+C·V·D`, nudge with arrow keys (Shift = 10px), **Group** with `Cmd/Ctrl+G`.
- **Getting around:** **⌖ Focus** (bottom-right) zooms to whatever is selected and follows the
  selection; **− / ＋ / Fit**, `Ctrl+scroll` and `Ctrl 0` control the zoom. **⤢ Manage items…** opens
  every field on the slide side by side (with an **Advanced (JSON)** tab for power users), and
  **⊞ Insert** is a searchable gallery of every element type in the deck — a stat card, a timeline
  event, a quote — droppable onto any slide. The top bar also adds slides, **Text/Box/Image**
  objects, the **▦ sorter**, **◐ Theme** and **⚙ Deck** settings. **Undo/redo** is `Cmd/Ctrl+Z` /
  `Shift+Z`; press **?** for every shortcut.
- **Present like a pro:** add per-slide **presenter notes** in the Slide panel, then press **S**
  while presenting — a **speaker view** popup shows the current slide, your notes, what's next, and
  a timer. Set an animation's trigger to **On click** to reveal content **step-by-step** with → /
  Space / click, PowerPoint-style; the Slide panel's Animations list manages every effect in one
  place.
- **Saving:** edits autosave in the browser, but the file itself is the source of truth — save with
  **Save .html** / `Cmd/Ctrl+S`. On Chrome/Edge this writes **in place** (first save asks where;
  after that it's silent). Other browsers can't overwrite an opened file, so they download a fresh
  self-contained copy with the changes baked in — mention this so it isn't a surprise.

`references/editor.md` has the complete editor reference if the user wants depth or asks how a
specific interaction maps to the saved data.

---

## Checking your work (required before delivering)

You can't see a rendered HTML file here, so verify what you *can*:

1. **Run the validator:** `python3 scripts/validate.py <deck>.html` — parses the JSON and checks
   every layout's required fields, chart series/label consistency, table shape, overrides, brand and
   masters. Fix every ERROR; read the WARNs.
2. **Every `layout` is a real layout name** and each slide's `content` has the fields that layout
   needs (cross-check `references/layouts.md`). Unknown layouts fall back to `raw` and look wrong.
3. **The theme actually changed** if the user picked a non-default one — confirm the `:root` block and
   the font `<link>` match the chosen palette, not Midnight Neon.
4. **Asset references resolve** — every `icon`/`iconAsset`/`image` name maps to a file you inlined.
5. **Counts and structure are sane** — slide count matches the plan; no layout repeats back-to-back.
6. **No slide was forced into the wrong shape.** Re-read the plan against the deck: if any slide's
   idea had to be trimmed or padded to fit its layout, that slide wanted to be `composed`. Also check
   the reverse — a `composed` slide whose sections are exactly one classic layout's decomposition
   should just be that layout.
7. **Motion reads as a deliberate choice, not a default nobody made.** Check `defaults.motion`
   against the audience picked in step 1 — a `calm` request that still says nothing, or an
   `expressive` keynote left at the plain default, both mean step 4 was skipped. Grep the deck for
   `"ambient":"none"`: if it's there, it's very likely wrong (see the next section) — it hasn't meant
   "calm" since this system shipped.

If you have a browser-capable renderer available, also open the file, toggle **Edit**, and confirm
panels appear and an element drags. If not, rely on the JSON + structure checks above and tell the
user the deck is generated and ready to open.

---

## Pitfalls

1. **Don't hand-number slides.** The engine derives the pager/progress from position.
2. **Don't hard-code colors in content** — use theme tokens (`[[glow]]`, per-slide/per-object
   `theme`), so the user's later re-theming and brand kits keep working. Charts inherit
   `--chart-1…6` automatically.
3. **Keep `deck-data` valid JSON.** Escape quotes inside strings; the engine shows an error slide if
   it can't parse. `scripts/validate.py` catches this and every schema mistake — run it.
4. **Don't fetch or invent imagery.** User-provided assets only.
5. **Don't reach for `raw` before `composed`.** A shape no fixed layout makes is what `composed` is
   for, and it stays fully editable — sections can be reordered, restyled and retyped in the editor.
   `raw` freezes into markup with none of that. `raw` is for genuinely one-off HTML, not for
   "none of the 29 quite fit".
6. **One heading per section stack.** `chart` and `bullets` sections carry their own heading; putting
   a `titleband` above either gives the slide two titles.
7. **`size` goes on the stretchy section.** Weight the chart / table / timeline / picture and leave
   stat rows and title bands unweighted — they should be exactly as tall as their content.
8. **Don't edit the engine or the editor `<script>` blocks.** You only replace `deck-data` (and
   `deck-assets` via `assets.py`). The template's source lives in `src/` and is rebuilt with
   `scripts/build.py` — that's for developing the tool, never for authoring a deck.
9. **`"ambient":"none"` does not mean "calm" or "no animation".** It silences the background layer
   only. If the ask is a quieter or motion-free deck, that's `"motion":"calm"` or `"motion":"off"`
   (`references/motion.md`) — never ambient.
10. **Don't hand-author per-element animation to fake step-through.** A slide that wants to reveal
    point by point gets one `"reveal":{"style":"…"}` key; every title/list/figure already enters
    consistently on its own without you touching individual elements' `overrides[key].anim`.
11. **Reveal is for slides that are genuinely talked through one point at a time**, not a default to
    reach for on every list. Most slides should have no `reveal` key at all — stepping is a real
    presenting-style commitment (the audience has to click through it), not free polish.
