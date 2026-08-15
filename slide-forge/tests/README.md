# slide-forge tests (jsdom)

Requires Node + `npm i jsdom` (any scratch dir, or here).

    cd slide-forge/tests && npm install && node parity.mjs && node editor-ops.mjs

On the Windows authoring box Node 26 lives at `C:\Program Files\nodejs`; drive it
from PowerShell (a Git-Bash shell may not have it on PATH).

- `parity.mjs` — renders a 26-slide deck covering every layout through the v3
  node-tree engine AND through the frozen v2 build (`fixtures/v2-template.html`),
  then structurally diffs the DOM (ignoring `data-el`/`data-bind`/`data-arr`,
  `forge-*` classes, and the Docs (D) panel — deck chrome added after this
  fixture was frozen, not layout content). Expected output: **`PARITY: 7 diffs`**
  — the documented cosmetic deltas (timeline desc span, two hero-asym value
  spans, figure's `media-img` class from the media-plan `<img>` upgrade, and a
  three-part closing-slide whitespace split). That count is the baseline; only a
  CHANGE in it is a regression.
- `editor-ops.mjs` — data-layer assertions on the editor: authored keys,
  item add/dup/remove with override REMAP, orphan-override GC, bind write-back,
  targeted `SG.renderSlide`, w/h overrides, undo coalescing, the one-time
  v2→v3 positional-key migration, and (2026-07-31, media plan) the asset
  registry v2 shape normalization, `F.assets.refs()`/`gc()`/`rename()`, the
  SVG sanitizer (script/handler stripping, id namespacing), the link/embed
  URL allow-lists, the new media layouts' authored identity + synchronous
  missing-asset fallback, and an embed free object's shield/poster/iframe.
  **Not covered here**: raster image import (`F.assets.importFile`'s canvas
  downscale/re-encode path) — it needs `<canvas>`/`Image` decoding jsdom
  doesn't provide without extra dependencies, and live iframe load/timeout
  behavior — jsdom doesn't fetch subresources. Both were instead verified
  end-to-end in a real browser during implementation (see the media plan
  commits); a future session with a real browser test runner could promote
  those into automated coverage.

  (2026-07-31, v4 editor UX) it also asserts the items-panel row set and
  label derivation, the hide override in both edit and present states, the
  breadcrumb path (`F.crumbPath`), theme-token swatch + whole-element marker
  writes, the `fs` text-size override, item reorder with style AND selection
  following, manage-items modal edits landing in `content`, the insert
  gallery's freeObject shape, and the zoom/viewport hook staying inert
  outside edit mode. **Not covered here**: anything needing real layout —
  focus centring on the stage, drag deltas at zoom, and the gallery's live
  scaled previews all measure `getBoundingClientRect`, which jsdom returns
  as zeros. Those are covered by `scale-gestures.html` instead (below).

- `scale-gestures.html` — **no Node required.** A self-contained page (open
  it directly in a browser) that loads `../editor-template.html` into a real
  same-origin iframe and drives it exactly like a user would: real
  `PointerEvent`s on the actual corner handles, real `Forge.setZoom()` /
  `toggleFocus()` calls, real `getBoundingClientRect()` reads. It's the
  automated version of the manual verification the v3/v4 engine commits
  described doing by hand — now repeatable by anyone (or any future session)
  without Node. Covers: corner-drag resize math staying gesture-accurate
  (screen-px moved == pointer-px moved) at 100% AND 200% zoom, the
  slide-space delta halving correctly at 2x zoom, Alt+corner proportional
  scale (width/height move together), two-axis corner resize (downward drag
  changes height 1:1, horizontal-only drag leaves the height unpinned,
  Shift locks the aspect ratio), ⌖ Focus centering the selection
  between the side panels, zoom clamping to `[0.25, 3]`, and undo restoring
  pre-resize geometry. Kills `#deck`'s CSS transition before measuring
  (`transition:none`) so results are deterministic even in a backgrounded/
  non-compositing tab — the transition itself is a cosmetic nicety, not
  something correctness needs.

- `make-demo.py` + `composed-demo.json` — **no Node required.** Rebuilds the
  template with a hand-authored deck so composed slides can be eyeballed in a
  real browser beside their classic originals (the "proof" step each composer
  slice ends with). `python tests/make-demo.py` writes `composed-demo.html`
  (gitignored — it's a build product of the template + the JSON), then serve
  the repo root and open it. jsdom can assert the section KEYS but not that a
  weighted row actually lands where it should, which is the whole question a
  composition feature has to answer. What to look for: **no element's bounding
  box may cross the 1280×720 frame**, row children must share one top edge, and
  the weights must read as literal width proportions (`size` 2 beside 1 = 713 /
  357 px with the 34px gap). The composed slides are followed by their classic
  originals so the two can be compared directly.

  The sizing rules this checks are the subtle part and jsdom returns zeros for
  all of them: a section keeps flexbox's automatic minimum height so it is never
  handed less room than it draws, while the elastic types (`chart`, `table`,
  `timeline`, `media`) opt out with `min-height:0` and absorb an over-full
  slide. A chart's SVG carries ~600px of intrinsic height, so without that split
  every section shrinks proportionally and the rigid ones spill off the bottom.

- `rack-test.json` — the composer plan's **Gate-1 success metric**, kept as a
  fixture so it can be re-run. Ten slides taken from the shapes real decks
  actually use (keynote opener, board review, product launch, strategy offset,
  incident review, research readout, all-hands, sales QBR, design review,
  closing line), rebuilt with slide-forge. The bar: **at least 8 of 10 rebuild
  faithfully with no escape hatch and no compromise a presenter would notice.**
  Build it with `python tests/make-demo.py tests/rack-test.json` and check three
  things in a browser: no `raw` slides, no bounding box crossing 1280×720, and
  no element whose `scrollHeight` exceeds its `clientHeight` (text clipped
  inside its own box). Result on 2026-08-15: **10/10, zero `raw` slides.**

Run:  `node tests/parity.mjs && node tests/editor-ops.mjs`
(with jsdom resolvable, e.g. `NODE_PATH=/path/to/node_modules`)

Gesture math needs a real layout engine, so it stays a browser page:
`python -m http.server` at the repo root, then open
`http://localhost:PORT/slide-forge/tests/scale-gestures.html`.
