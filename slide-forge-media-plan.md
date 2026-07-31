# slide-forge — Media & Embeds ("UI Import") implementation plan

*Drafted 2026-07-31. Scope: images, diagrams, hyperlinks and live iframe embeds — both as
generation-time deck content and as editable free objects in the in-deck editor.
Companion to `slides-editor-plan.md` (§3.2 identity, §5 distribution, §10 v3 ADR).*

---

## 0. TL;DR

Four capabilities, one foundation:

| # | Capability | Shape |
|---|---|---|
| A | **Asset store v2** | `SG.assets.images` becomes a metadata-carrying registry that the *editor* can write to (browser-side import, downscale, dedupe, GC, budget meter). Everything else depends on this. |
| B | **Image / diagram objects** | New free-object `type:"image"` (raster) and `type:"svg"` (inline, theme-aware) — drag, resize with aspect lock, crop-by-focal-point, frame/radius/opacity, alt text. Drop a file on the canvas or paste from the clipboard. |
| C | **Media layouts** | `image`, `media-split`, `gallery`, `diagram` layouts (+ `figure` upgraded to the asset picker) so Claude can place user-supplied imagery at generation time with real layout quality, and the user can restyle it later. |
| D | **Links & embeds** | `href` on *any* element (external URL or internal `#slideN`), plus free-object `type:"embed"` and a full-slide `embed` layout — a sandboxed iframe with a click-to-interact shield, poster fallback, and graceful offline/blocked degradation. |

Sequencing is strict: **A → B → C → D**. A is load-bearing for B/C; D is independent of B/C but
is the riskiest and should land last.

**Standing decision (2026-07-31): the offline guarantee is dropped for network-backed elements.**
Links and embeds may require the network. In exchange, every unreachable link or embed renders one
**shared, consistent "unavailable" card** — the same component, the same wording, on every slide,
in the editor, while presenting, and in the printed PDF (where a live iframe *always* prints as the
card, since an iframe cannot be captured reliably). Images and diagrams remain fully self-contained;
see §7 for the exact storage rule.

---

## 1. What exists today (verified)

- **Asset registry is read-only at runtime.** `SG.assets = {icons, images, styles}` is parsed once
  from `<script id="deck-assets">` (`src/engine.js:106-114`). `imageURL(name)` returns a bare data
  URI string (`src/engine.js:125`). Only three consumers: `L.figure` background
  (`src/engine.js:306-313`), `brandMark` (`src/engine.js:420-423`), and `icon()` for inline SVG.
- **Assets already survive a save.** `currentHTML()` re-serializes `SG.assets` into `#deck-assets`
  on download (`src/editor.js:1353`). *Anything the editor adds to the registry persists* — this is
  the hook the whole feature hangs on, and it already works.
- **Assets are NOT in `SG.data`** — so they are outside undo snapshots (`F.pushUndo`,
  `src/editor.js:108`) and outside the localStorage autosave (`F.save`, `src/editor.js:130`).
  Deliberate, and worth keeping (see §2.3), but it needs explicit handling.
- **Free objects** are `{id,type,x,y,w,h,rot,scale,z,text,size,html,…}`, mounted in
  `decorateSection` (`src/editor.js:198-202`), positioned by `applyFree` (`src/editor.js:238-242`),
  styled by `.forge-free` (`src/editor.css:152-154`). Three types exist: `txt`, `box`, `html`.
- **Resize** = `startDrag(…,'size')` sets `w`/`h` with text reflow; Alt = `scale`
  (`src/editor.js:361-392`). No aspect lock.
- **Deep-copy paths clone DOM to markup**: `specFromSel` (`src/editor.js:495-515`) serializes a
  selection's `outerHTML` into a `type:"html"` free object; `buildSorter` (`src/editor.js:835-855`)
  and the speaker view (`src/engine.js:624-628`) clone whole `<section>`s. All three must be taught
  about media (§6.4).
- **`<a>` clicks are already safe in present mode** — the deck's advance-on-click handler bails on
  `a,button,input` (`src/engine.js:519`).
- **Build budget**: 450 KB, currently ~255 KB (`scripts/build.py:16`). Deck assets are excluded
  from that budget (they are injected after build).
- **Generation-time pipeline**: `scripts/assets.py` inlines `assets/icons/*.svg` and
  `assets/images/*` and filters by *referenced* names — but its walker only recognises the keys
  `icon`, `iconAsset`, `image` (`scripts/assets.py:66-78`). It will silently drop assets referenced
  by any new key.
- **`scripts/validate.py`** hard-codes the layout schemas, `OVERRIDE_KEYS` and `FREE_KEYS`; new
  fields are *errors* until it is updated.

---

## 2. Phase A — Asset store v2 (foundation)

### 2.1 Registry shape

`SG.assets.images[name]` becomes **either** a string (legacy, still accepted) **or**:

```json
{ "store":"embedded", "src":"data:image/webp;base64,…",
  "w":1600, "h":900, "bytes":48213, "type":"image/webp",
  "alt":"System architecture", "origin":"assets.py|import" }
```

```json
{ "store":"linked", "path":"assets/diagram-large.png",
  "w":3200, "h":1800, "bytes":4180233, "type":"image/png", "alt":"…" }
```

`SG.assets.svg[name]` is a new sibling map holding **sanitized inline SVG markup** (diagrams), kept
separate from `icons` because icons are small, monochrome and `currentColor`-driven, while diagrams
are large and may carry their own palette.

**Storage rule (decided — see §7.3):**

| Where the image came from | Store | Why |
|---|---|---|
| Present in `assets/images/` (or `assets/diagrams/`) at **generation time** | **`embedded`**, always | The delivered deck must travel as one file. This overrides the size budget — a 12 MB deck is the correct outcome if the user supplied 12 MB of imagery. |
| Imported in the editor via drop / library panel | `embedded` by default; the library panel offers **"Link instead of embed"** per asset | Lets a user keep a huge image out of the HTML by shipping `deck.html` + `./assets/` side by side. |
| Explicitly linked | `linked` — resolved relative to the deck file | Opt-in only, with a visible "needs the assets folder" badge on the asset and in the save flow. |

`linked` assets that fail to load render the same **unavailable card** as an unreachable embed
(§6.2) — one fallback component for every missing-resource case.

Changes:
- `src/engine.js:125` — `imageURL(name)` accepts all three shapes (legacy string, embedded, linked);
  add `SG.imageMeta(name)` returning `{src,w,h,alt,store}` and `SG.svgMarkup(name)`.
- `src/engine.js:107-114` — `loadAssets()` normalises `svg:{}` into the parsed object.
- `scripts/assets.py` — emit the object shape (with real `w`/`h` read from the file header) and a
  new `svg` bucket for `assets/diagrams/*.svg`; **embed by default with no size ceiling**; a
  `--link-over N` flag (opt-in, off by default) emits `store:"linked"` for files above N MB and
  copies them next to the deck. Keep writing plain strings only under `--legacy`.

### 2.2 Browser-side import (`F.assets.*`, new `src/media.js`)

New module `src/media.js` (built in via a `%MEDIA_JS%` marker in `shell.html` + `scripts/build.py`
`PARTS`), exposing:

| API | Behaviour |
|---|---|
| `F.assets.importFile(file) → Promise<name>` | Reads a `File`/`Blob`; raster → decode to `<canvas>`, downscale to `maxEdge` (default **1920 px**), re-encode (WebP q0.86, PNG kept when it has alpha and is small, GIF passed through untouched to preserve animation), store as data URI. SVG → sanitize (§2.4) → `assets.svg`. Returns a unique registry name derived from the filename. Downscaling applies to **editor imports only** — `assets.py` embeds generation-time assets byte-for-byte, since the user chose those files deliberately. The library panel exposes "keep original resolution" per import. |
| `F.assets.dedupe(dataURI)` | SHA-ish content hash (cheap FNV over the base64) → reuse an existing name instead of storing a second copy. |
| `F.assets.refs()` | Walks `SG.data` for every asset reference (free objects, layout content, brand logo, posters) → `Set<name>`. |
| `F.assets.gc({dryRun})` | Drops unreferenced entries. Runs on **Save**, never silently mid-session. |
| `F.assets.bytes()` | Total registry size, for the meter. |
| `F.assets.rename/replace/remove` | Backing the library panel. |

### 2.3 Undo, autosave and quota (the awkward corner)

Decisions, with rationale:

1. **Assets stay out of `SG.data`.** Snapshot undo stringifies the whole deck on every gesture
   (`src/editor.js:108`); putting megabytes of base64 in there would make undo O(deck size) per
   keystroke. Instead the registry is **append-mostly**: inserting an image adds a registry entry
   (not undone) plus a free object (undone normally). An orphaned entry costs nothing until Save,
   when GC removes it.
2. **Asset *deletion* is explicitly undoable** via a small side-stack (`F.assets._trash`), so
   "Delete asset" in the library is not a data-loss cliff.
3. **Autosave**: assets go to a *second* localStorage key `forge:<id>:assets`, written on a longer
   debounce. If the write throws `QuotaExceededError` (5–10 MB in practice), catch it, set
   `F._assetsUnsaved = true`, and show a persistent (dismissible) bar: *"Images are too large to
   autosave — use ⤓ Save .html so you don't lose them."* Silent failure here is the worst outcome;
   it must be visible. Because §7.3 removes the size ceiling, **hitting this limit is expected, not
   exceptional** — an image-heavy deck will simply autosave its text and rely on explicit saves for
   its media. Deck JSON must therefore be written to its own key *first*, so an oversized asset
   registry never costs the user their content edits.
4. **Restore** (`checkRestore`, `src/editor.js:1381`) must restore both keys together, and must not
   offer a restore that would resurrect deck data whose assets were dropped.

### 2.4 SVG sanitization in the browser

`scripts/assets.py:21-29` sanitizes at generation time; editor-time imports need the same guarantee
in JS. Implement `F.assets.sanitizeSVG(text)` with **DOMParser + allow-list**, not regex:

- Parse `image/svg+xml`; bail on `parsererror`.
- Remove `<script>`, `<foreignObject>`, `<use href>` pointing off-document, `<image href>` pointing
  at anything but a `data:` URI, `<animate*>` with `attributeName="href"`, and every `on*` attribute.
- Strip `href`/`xlink:href` values not starting with `#`.
- Namespace-scope IDs (`id="a"` → `id="sf-<name>-a"` plus matching `url(#…)` rewrites) — two
  imported SVGs with colliding gradient IDs is a real, confusing bug.
- Return serialized markup + intrinsic `viewBox`/width/height.

### 2.5 Asset library panel

New Inspector section (and a toolbar button `🖼 Assets`): grid of thumbnails, each with name, px
dimensions, weight, and an `embedded`/`linked` badge; actions Insert / Replace file / Rename /
Delete / **Link instead of embed**. Footer meter reads `4 images · 1.8 MB · deck ≈ 2.1 MB` — it is
**informational, not a gate**: above ~20 MB it adds a neutral note ("large decks can exceed email
attachment limits — consider linking this asset") and never blocks or auto-downgrades. This panel is
also where generation-time assets from `assets/images/` show up, which is what makes "assets
provided during slide generation" reusable later.

---

## 3. Phase B — Image & diagram objects

### 3.1 Data

```json
{ "id":"f3k2", "type":"image", "asset":"architecture",
  "x":120, "y":90, "w":520, "h":293, "rot":0, "z":3,
  "fit":"cover", "focal":[0.5,0.5], "radius":14, "opacity":1,
  "frame":"none|panel|glow|shadow", "alt":"System architecture", "href":null }
```

`type:"svg"` is identical but resolves `asset` from `SG.assets.svg` and inlines the markup
(so `stroke="currentColor"` diagrams follow the theme and the per-object accent override).

### 3.2 Rendering & interaction

- `decorateSection` (`src/editor.js:198-202`) gains the two types: `image` → `<img>` inside the
  `.forge-free` wrapper (`loading="eager"`, `draggable=false`, `alt` from data); `svg` → sanitized
  markup injected once.
- `applyFree` (`src/editor.js:238-242`) applies `w/h/radius/opacity/frame` and maps
  `fit`+`focal` → `object-fit` + `object-position`.
- **Aspect-locked resize**: in `startDrag` (`src/editor.js:361-392`), corner drags on `image`/`svg`
  keep the intrinsic ratio by default and free it with **Shift** — the inverse of the text case,
  where reflow is the point. Edge handles (if added) resize one axis and switch `fit` to `cover` so
  the image crops rather than distorts.
- **Crop = focal point, not a crop tool.** With `fit:"cover"`, dragging *inside* a selected image
  while holding **C** (or via an inspector 3×3 focal pad) moves `focal`. A real crop rectangle is
  deliberately out of scope for v1 — it needs a second geometry channel and re-encode-on-export.

### 3.3 Import gestures

- **Drop on canvas** — `dragover`/`drop` on `#deck` in `wireDeck` (`src/editor.js:739`): accept
  `image/*` and `.svg` files, import, and place centred at the drop point (converting client px →
  deck px through `scale()`, `src/editor.js:259`). Multiple files → cascade with a 24 px offset.
  Also accept a dragged *image URL* from another tab: fetch → blob → import; on CORS failure, offer
  to keep the remote `src` (with an explicit "this deck will need the network" warning).
- **Paste — DEFERRED (decided §7.2).** Pasting an image from the system clipboard needs the native
  `paste` event, which `wireKeys` (`src/editor.js:781`) currently kills by `preventDefault`-ing
  Ctrl+V for the editor's internal clipboard. Rather than re-plumb both behaviours through one
  handler now, image paste is **out of scope for v1**: drop-on-canvas, the `＋ Image` toolbar button
  and the library panel cover import, and internal copy/paste keeps working exactly as it does
  today. Revisit only if users actually reach for Ctrl+V. *(If picked up later: move both paths into
  a single `paste` listener — files present → import; otherwise → `F.paste()`.)*
- **Toolbar** `＋ Image` → file picker, and the library panel's Insert.

### 3.4 Inspector

`objectPanel` (`src/editor.js:1243`) gets a media branch: asset thumbnail + Replace, Alt text,
Fit (cover/contain/fill), focal pad, Corner radius, Opacity, Frame preset, plus **Link** (§5) —
above the existing geometry/style/animation sections, which apply unchanged.

---

## 4. Phase C — Media layouts (generation-time authoring)

All new layouts must follow the v3 contract (`slides-editor-plan.md` §10): return `SG.N` node trees
authoring `data-el` / `data-bind` / `data-arr`, so text stays double-click editable and array items
stay add/remove/reorder-able with override remapping.

| Layout | Content | Notes |
|---|---|---|
| `image` | `{kicker,title?,image,caption?,fit,focal,frame}` | Full-bleed or framed single image. Supersedes hand-rolled `raw` image slides. |
| `media-split` | `{kicker,title,body?,items?,image,side:"left"\|"right",fit}` | The workhorse: picture one side, prose/bullets the other. `items` reuses the bullet rendering so item ops work. |
| `gallery` | `{kicker,title,items:[{image,caption?}]}` | 2–6 auto-grid; `data-arr:"items"` so the editor can add/remove tiles. |
| `diagram` | `{kicker,title,svg,caption?}` | Inlines `assets.svg[svg]`, scaled to fit the stage, inherits theme color. The intended path for architecture/flow diagrams. |
| `embed` | see §7 | Phase D. |
| `figure` *(existing)* | unchanged JSON | Upgrade only: use `SG.imageMeta` (alt text, no `url("…")` escaping fragility at `src/engine.js:308`) and expose the asset picker in the Content inspector. |

Supporting changes:
- `SECTION_LAYOUTS` (`src/engine.js:429`) — add `image`, `diagram`, `embed` (they style the section).
- `src/engine.css` — new blocks; `@media print` rules so images print at full bleed
  (`print-color-adjust` is already global at `src/engine.css:167`).
- `src/editor.js:51` `LAYOUTS`, `src/editor.js:63-90` `DEFAULTS` — register the new layouts so the
  ＋ Slide menu and layout switching work.
- **Content inspector asset picker**: `contentForm` (`src/editor.js:875`) currently renders every
  content field as text. Add a field-name → widget hint map so `image`/`svg`/`poster` render an
  asset chooser (thumbnail + pick/import) instead of a raw string input.
- `scripts/assets.py:66-78` — extend `referenced()` to walk `asset`, `svg`, `poster`, `images[]`,
  and `freeObjects[].asset`; **without this, generation-time assets referenced by the new keys are
  silently dropped from the inject.**
- `scripts/validate.py` — new layout schemas, `ITEM` entry for `gallery.items`, extended
  `FREE_KEYS`/`OVERRIDE_KEYS`, plus a new check: *every referenced asset name exists in the
  registry* (only possible on the `.html` path, where both blocks are present) and *every image
  object has non-empty `alt`* (warning, not error).
- `slide-forge/SKILL.md` §"Assets" and `references/layouts.md` — document the new layouts, the
  `assets/diagrams/` folder, and keep the existing rule intact: **only user-supplied imagery, never
  stock or generated**.

---

## 5. Phase D-1 — Links

- **Model**: `href` (+ optional `target`) on any `overrides[key]` entry *and* any free object.
  Values allowed: `https:`, `http:`, `mailto:`, and internal `#<slideNumber>`.
- **Render**: `applyOverride`/`applyFree` set `data-href`; a delegated click handler on `#deck`
  (present mode only) resolves it — `#n` → `SG.show(n-1)`, otherwise
  `window.open(url,'_blank','noopener,noreferrer')`. Using a data attribute + delegation rather than
  wrapping in `<a>` avoids restructuring authored node trees and keeps `data-el` identity stable;
  for accessibility the node also gets `role="link"`, `tabindex="0"` and Enter-key handling.
- **Sanitize on write** (`F.setHref`): reject anything not in the scheme allow-list — in particular
  `javascript:` and `data:` — and surface the rejection in the inspector rather than silently
  dropping it. A deck is a file people forward; a stored `javascript:` href is a real XSS vector.
- **Affordance**: a small ↗ badge on linked elements in edit mode (`.forge-chrome`, stripped on
  download); underline/hover style is opt-in per object so links don't fight the design.
- **Print**: `@media print` appends the URL after linked text (`content: " (" attr(data-href) ")"`)
  so a PDF keeps the reference.
- **Unreachable links** use the shared unavailable treatment (§5.1): the element keeps its text and
  gains a muted `⚠ unavailable` marker plus the standard tooltip/caption, rather than silently
  failing on click.

### 5.1 The shared "unavailable" component

One component, `SG.unavailable(reason, url)` → a `.sf-unavailable` card (block form, for embeds and
missing images) with an inline variant (for links). Same markup, same wording, same styling
everywhere — editor, present, thumbnail, speaker view, PDF:

> **⚠ Content unavailable** — this element needs a network connection.
> `https://example.com/dashboard`

Trigger conditions:

| Trigger | Detectable? |
|---|---|
| `navigator.onLine === false` | Yes, cheaply — covers the common offline case for links *and* embeds |
| Embed `load` never fires within ~6 s, or the frame is refused by `X-Frame-Options`/CSP | Yes, via the heartbeat in §6.2 |
| `store:"linked"` image whose file is missing | Yes — `<img>` `error` event |
| Internal `#slideN` link whose target slide no longer exists | Yes, at render |
| A *specific* external URL is 404/blocked while the machine is online | **No.** A cross-origin probe returns an opaque response that cannot distinguish success from failure, and probing every URL on every render is not acceptable anyway. Per-URL link validation is therefore explicitly not promised; online link clicks go to the browser, which shows its own error. |

The wording is a single string constant so it can be localised or overridden per deck via
`meta.strings.unavailable`.

---

## 6. Phase D-2 — Embeds (iframes)

### 6.1 Model

```json
{ "id":"f9x1", "type":"embed", "url":"https://example.com/dashboard",
  "x":160, "y":110, "w":960, "h":540, "ratio":"16:9",
  "mode":"click|live|poster", "poster":"dash-poster",
  "sandbox":{"scripts":true,"forms":false,"popups":false,"sameOrigin":false},
  "chrome":true, "title":"Live dashboard" }
```

Plus an `embed` **layout** for the full-slide case: `{kicker,title,url,ratio,mode,poster,note}`.

### 6.2 The four hard problems and their answers

1. **An iframe eats pointer events → you can't drag or select it.**
   Mount the iframe under a transparent **shield** `<div class="forge-embed-shield">` that is
   `pointer-events:auto` whenever `body.forge-edit` is on. Editing therefore behaves exactly like
   any other free object; the iframe never receives a stray click.

2. **Interaction vs. slide navigation while presenting.**
   Default `mode:"click"`: the shield stays in present mode showing a subtle *"Click to interact"*
   overlay; the first click removes it and focuses the frame; **Esc** (captured on `document`,
   before the deck's key handler at `src/engine.js:504`) restores the shield so arrows/space drive
   the deck again. `mode:"live"` skips the shield (for a background visualisation that needs no
   input); `mode:"poster"` never loads the frame at all.

3. **The remote site may refuse to be framed.**
   `X-Frame-Options: DENY` / `frame-ancestors` produce a blank frame with **no reliable
   cross-origin error signal**. Mitigation is a heartbeat, not a detection: start with the
   unavailable card visible, swap to the frame on `load`, and if `load` hasn't fired in ~6 s (or
   `navigator.onLine === false`) keep the card up. Never a blank rectangle. The card is the §5.1
   component with an added *"open in a browser ↗"* action.

4. **Clones and captures multiply iframes — and a PDF can't hold one at all.**
   `buildSorter` thumbnails (`src/editor.js:835`), the speaker view (`src/engine.js:624`) and
   `specFromSel`'s `outerHTML` copy (`src/editor.js:504`) would each spawn extra live loads.
   All three get a shared helper `F.posterize(clonedSection)` that swaps every embed for its card.
   **Printing always posterizes** (decided §7.1): `@media print` hides the iframe and shows the
   unavailable card with the URL, because an iframe's contents cannot be captured dependably in a
   print job. `SG.static` (`src/sg.js:23`) does the same, keeping headless captures deterministic.
   A `poster` image, when supplied, renders *behind* the card text rather than replacing it — the
   viewer always sees that this is a live element they are looking at a still of.

### 6.3 Security posture

- **Default sandbox** = `sandbox="allow-scripts allow-popups"`, `referrerpolicy="no-referrer"`,
  `allow=""` (no camera/mic/geolocation), `loading="lazy"`.
- `allow-same-origin` is an explicit, separately-labelled toggle in the inspector
  (*"Let the page access its own cookies/storage — only for sites you trust"*), because
  `allow-scripts` + `allow-same-origin` together lets the frame reach out of its sandbox when it is
  same-origin with the deck.
- URL allow-list identical to §5 (https/http only for embeds; no `data:`, no `javascript:`,
  no `file:`).
- The URL is stored as data and rendered via `setAttribute` — never string-concatenated into HTML.

### 6.4 Honest limits (document them, in the UI and in `references/`)

- Embeds require the network. Images and diagrams do not — that asymmetry is the deal, and it is
  stated plainly in `SKILL.md`, in `references/editor.md`, and in a one-time notice on first insert.
- Many major sites (Google, most SaaS dashboards, some news sites) simply cannot be framed.
  Sites that *do* embed well: YouTube/Vimeo embed URLs, Figma/Miro embed links, Observable, CodePen,
  Google Maps embed URLs, most docs sites.
- `file://` deck + `https://` frame is fine; the reverse (a frame trying to reach the deck) is not.
- No local video embedding in v1 — a base64 MP4 in a single HTML file is a size trap. Link out, or
  use an animated GIF/WebP image object.

---

## 7. Decisions taken (2026-07-31)

### 7.1 Offline guarantee — **dropped for network-backed elements** ✅ decided

Embeds and external links may require the network; this is accepted, not worked around. The
obligation that replaces it is *uniform, honest failure*: one `.sf-unavailable` component (§5.1)
used by every unreachable link, every embed that can't load, and every missing `linked` image — in
the editor, while presenting, in thumbnails, in the speaker view, and **always** in the printed PDF,
where live iframes are posterized unconditionally because a print job cannot capture them.

Not promised: per-URL reachability checking for online external links. Cross-origin probes return
opaque responses that can't distinguish 200 from 404 (§5.1 table). Offline, blocked-frame, missing-
file and dead-internal-link cases *are* all detected.

### 7.2 Clipboard image paste — **deferred** ✅ decided

Import lands via drop-on-canvas, the `＋ Image` toolbar button and the library panel; those are
sufficient, and every imported image is fully manipulable in the UI. The Ctrl+V conflict in
`wireKeys` (`src/editor.js:781`) is therefore left alone, and the editor's internal copy/paste keeps
its current behaviour untouched. Documented as a known gap in `references/editor.md`.

### 7.3 Asset storage — **embed generation-time assets, allow linking for the rest** ✅ decided

Anything the user supplied during generation (`assets/images/`, `assets/diagrams/`) is **embedded in
the .html as a data URI, always**, with no size ceiling and no re-encode — the delivered deck travels
as one file even when that pushes it well past the code budget. A deck is allowed to be 12 MB.

Separately, an `assets/` folder alongside the deck is a supported arrangement for images the user
adds later and would rather not inline: the library panel's **"Link instead of embed"** switches an
asset to `store:"linked"` with a relative path, flagged with a "needs the assets folder" badge, and
falling back to the §5.1 card when the file is missing.

**Consequence for the budget:** `scripts/build.py`'s 450 KB limit is a *template/code* budget and
stays that way — it measures the built template with an empty asset registry (`build.py:50`). There
is deliberately **no cap on the delivered deck's size**; the library meter is informational only.
This must be spelled out in `build.py`'s docstring so a future session doesn't "fix" a large deck.

### 7.4 Carried over from the original draft

- **Default image downscale at 1920 px / WebP for editor imports** (not for generation-time assets,
  per §7.3), overridable per import.
- **Crop = focal point, not a crop rectangle** in v1 (§3.2).
- **Mermaid/live diagram rendering rejected** — vendoring it is ~1 MB against a 450 KB *template*
  budget (which §7.3 does not relax; that relaxation is for user content, not for code). Diagrams
  come in as sanitized SVG, which already themes correctly via `currentColor`.

---

## 8. Work breakdown

| Phase | Deliverable | Touches | Est. |
|---|---|---|---|
| **A** | Asset store v2 (embedded + linked), importer, sanitizer, library panel, size meter, quota handling | `src/media.js` *(new)*, `src/engine.js`, `src/editor.js`, `src/editor.css`, `src/shell.html`, `scripts/build.py`, `scripts/assets.py` | ~700 lines |
| **A′** | **`.sf-unavailable` shared component** (§5.1) — built early because A (linked assets), D-1 and D-2 all consume it | `src/engine.js`, `src/engine.css` | ~80 lines |
| **B** | `image` + `svg` free objects, drop import, aspect-locked resize, focal crop, inspector *(no clipboard paste — §7.2)* | `src/editor.js`, `src/editor.css`, `src/media.js` | ~400 lines |
| **C** | `image` / `media-split` / `gallery` / `diagram` layouts, `figure` upgrade, asset picker in content form | `src/engine.js`, `src/engine.css`, `src/editor.js`, `scripts/validate.py`, `scripts/assets.py`, `SKILL.md`, `references/layouts.md` | ~500 lines |
| **D-1** | Links on any element, scheme sanitizer, unavailable states, print rule, inspector field | `src/editor.js`, `src/engine.js`, `src/engine.css` | ~150 lines |
| **D-2** | Embed object + `embed` layout, shield/activation, heartbeat → card, unconditional print posterize, posterize in clones, sandbox UI | `src/editor.js`, `src/engine.js`, `src/engine.css`, `src/editor.css`, `scripts/validate.py` | ~450 lines |
| **E** | Docs, tests, evals, plan/ADR entry | `references/*.md`, `tests/*`, `slides-editor-plan.md` §11, `CLAUDE.md`, `README.md` | ~300 lines |

**Size budget**: ~2.5 k new lines ≈ +60–75 KB → built template ~320–330 KB against the 450 KB
*template* budget (`scripts/build.py:16`), which measures code with an empty asset registry and
stays enforced. Per §7.3 there is **no cap on the delivered deck** — Phase E updates the `build.py`
docstring to say so explicitly, so a large user deck is never mistaken for a regression.

---

## 9. Testing

**Automated** (`slide-forge/tests/`, jsdom — needs Node, run outside this sandbox):
- *Parity*: extend `parity.mjs` fixtures with the five new layouts; assert an asset-free deck still
  renders byte-identically to the current build (the additive guarantee).
- *Data layer* (`editor-ops.mjs`): import→dedupe→GC round trip; asset delete/undo; `refs()` finds
  every reference shape; override remapping still works when a `gallery` item is removed;
  `specFromSel` on an image copies by **reference**, not by inlining the data URI (regression guard
  against a 5 MB duplicate).
- *Sanitizer unit tests*: `<script>`, `on*`, external `href`, `<foreignObject>`, ID collision
  between two SVGs — each asserted stripped/renamed.
- *URL sanitizer*: `javascript:`, `data:text/html`, `vbscript:`, protocol-relative `//evil` all
  rejected; `#3`, `mailto:`, `https:` accepted.

**Manual** (browser; serve the repo root over HTTP per `CLAUDE.md`, open
`slide-forge/editor-template.html?edit`):
1. Drop a 4 MB PNG → lands as an object, registry shows a downscaled WebP, meter updates.
2. Save .html → reopen the downloaded file **from `file://` with the network off** → images and
   diagrams intact and unchanged; every embed and external link shows the *same* unavailable card.
3. Generation-time check: put a 9 MB image in `assets/images/`, run `assets.py inject` → it is
   embedded (not linked), the deck exceeds the code budget, and `build.py --check` still passes
   (the budget covers the template, not the deck — §7.3).
4. Flip one asset to **Link instead of embed** → save → deck loads with `./assets/` present; move
   the folder away → that image shows the unavailable card, nothing else breaks.
5. Resize an image from a corner (locked) and with Shift (free); rotate; undo/redo each.
6. Internal copy/paste (Ctrl+C/Ctrl+V of a text object) is unchanged — regression check for §7.2.
7. Insert an embed → drag it in edit mode → Present → click to interact → Esc → arrows navigate.
8. Point an embed at a site that sends `X-Frame-Options: DENY` → the card appears within ~6 s, never
   a blank rectangle.
9. Sorter thumbnails and the speaker view show cards, not extra live frames.
10. Print to PDF: images full-bleed; **every** embed renders the unavailable card with its URL
    (§7.1), regardless of whether it was loading fine on screen; links annotated with their URL.
11. `python3 scripts/build.py --check`, `scripts/validate.py` on a deck using every new layout.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Deck files reach tens of MB | **Accepted by decision (§7.3)** for generation-time assets. Mitigated where it's free: dedupe, GC on save, downscale on editor imports, and an opt-in "link instead of embed" for later additions. The meter informs; it never blocks |
| localStorage quota → silent loss of imported images on refresh | Separate assets key, catch `QuotaExceededError`, persistent visible warning, never fail silently (§2.3). Large decks will routinely exceed quota — the warning is the normal path, not an edge case, so its wording must be calm and actionable |
| The unavailable card becomes a mystery ("why is this blank?") | Single component, single wording, always shows the URL and the reason; used identically in all six render contexts (§5.1) |
| Imported SVG carries script/external refs | DOMParser allow-list sanitizer + ID namespacing (§2.4), mirroring the existing Python sanitizer |
| `javascript:` in a link or embed URL | Scheme allow-list on write *and* on render; validator check |
| Iframe can't be framed / offline | Card-first render, 6 s heartbeat, "open in browser" affordance, `navigator.onLine` check (§6.2) |
| Clone paths spawn duplicate iframes / duplicate base64 | Shared `F.posterize()` for all clone sites; `specFromSel` copies image objects by asset reference (§6.2/§9). With embedding now unbounded, an accidental base64 duplication is a *multi-MB* bug — this is the single most important regression test in §9 |
| `linked` assets go missing when the deck is emailed alone | Visible badge on the asset, a reminder in the save flow, and the §5.1 card at render — never a broken-image icon |
| Present-mode key capture lost to a focused iframe | Shield + Esc-to-release, handler bound in the capture phase ahead of `src/engine.js:504` |
| New layouts drift from the v3 identity contract | Parity fixtures + the `data-el`/`data-bind`/`data-arr` review checklist in `slides-editor-plan.md` §10 |
| `assets.py` silently drops newly-keyed assets | Extend `referenced()` in Phase C *before* authoring any deck that uses the new keys; validator flags missing assets |

---

## 11. Recommended first working session

1. `src/media.js` skeleton + build wiring (`shell.html` marker, `build.py` `PARTS`) — prove the
   built template still passes `--check` and stays under the *template* budget.
2. Registry v2 read path (`imageURL`/`imageMeta` accepting legacy string, `embedded`, `linked`) —
   pure back-compat, no UI.
3. `SG.unavailable()` + `.sf-unavailable` (A′) — small, and every later phase depends on it.
4. `F.assets.importFile` + sanitizer + dedupe, with the asset library panel as the only UI.
5. Then Phase B, where it becomes visible: drop an image on the canvas and drag it.

Land A and B before touching D — links and embeds are the parts most likely to need a second design
pass, and they are worth nothing if the asset foundation underneath them is shaky.

---

## 12. Changelog

- **2026-07-31 — initial draft.**
- **2026-07-31 — decisions folded in (§7):** offline guarantee dropped for network-backed elements
  in favour of one shared unavailable card (including unconditional posterizing in PDF export);
  clipboard image paste deferred; generation-time assets always embedded with no size ceiling, with
  an opt-in `linked` store and an `assets/` folder as a supported arrangement for later additions.
