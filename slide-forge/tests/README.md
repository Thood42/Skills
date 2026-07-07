# slide-forge tests (jsdom)

Requires Node + `npm i jsdom` (any scratch dir, or here). Not runnable in the
skill-authoring sandbox (no Node there) — run wherever Node exists.

- `parity.mjs` — renders a 26-slide deck covering every layout through the v3
  node-tree engine AND through the frozen v2 build (`fixtures/v2-template.html`),
  then structurally diffs the DOM (ignoring `data-el`/`data-bind`/`data-arr` and
  `forge-*` classes). Expected output: exactly the documented cosmetic deltas
  (timeline desc span, hero-asym value span, closing whitespace split).
- `editor-ops.mjs` — 29 assertions on the editor data layer: authored keys,
  item add/dup/remove with override REMAP, orphan-override GC, bind write-back,
  targeted `SG.renderSlide`, w/h overrides, undo coalescing, and the one-time
  v2→v3 positional-key migration.

Run:  `node tests/parity.mjs && node tests/editor-ops.mjs`
(with jsdom resolvable, e.g. `NODE_PATH=/path/to/node_modules`)
