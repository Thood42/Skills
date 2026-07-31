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

Run:  `node tests/parity.mjs && node tests/editor-ops.mjs`
(with jsdom resolvable, e.g. `NODE_PATH=/path/to/node_modules`)
