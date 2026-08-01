# slide-forge tests (jsdom)

Requires Node + `npm i jsdom` (any scratch dir, or here). Not runnable in the
skill-authoring sandbox (no Node there) — run wherever Node exists.

- `parity.mjs` — renders a 26-slide deck covering every layout through the v3
  node-tree engine AND through the frozen v2 build (`fixtures/v2-template.html`),
  then structurally diffs the DOM (ignoring `data-el`/`data-bind`/`data-arr` and
  `forge-*` classes). Expected output: exactly the documented cosmetic deltas
  (timeline desc span, hero-asym value span, closing whitespace split).
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
  scale (width/height move together), ⌖ Focus centering the selection
  between the side panels, zoom clamping to `[0.25, 3]`, and undo restoring
  pre-resize geometry. Kills `#deck`'s CSS transition before measuring
  (`transition:none`) so results are deterministic even in a backgrounded/
  non-compositing tab — the transition itself is a cosmetic nicety, not
  something correctness needs.

Run:  `node tests/parity.mjs && node tests/editor-ops.mjs`
(with jsdom resolvable, e.g. `NODE_PATH=/path/to/node_modules`)

Run (no Node): `python -m http.server` at the repo root, then open
`http://localhost:PORT/slide-forge/tests/scale-gestures.html`.
