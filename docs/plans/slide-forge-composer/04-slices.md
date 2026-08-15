# Slices: slide-forge quality & composition upgrade

Build order. Every slice ends with the template rebuilt (`build.py`), the Node tests green
(`parity.mjs` at its 7-diff baseline + `editor-ops.mjs`), and a browser-visible proof. Test
numbers refer to the Gate 3 test plan.

- [ ] **Slice 1 — tracer bullet: `composed` renders.** `src/sections.js` skeleton with THREE
  section types (`titleband`, `stats`, `quote` — quote is a `SECTION_LAYOUTS` CSS refugee, chosen
  to surface the dual-scoping risk immediately). `SG.h` export, `%SECTIONS_JS%` marker,
  build.py wiring, minimal `.sec`/`.sec-row` CSS. `stat-grid` re-expressed through `S` (the
  parity canary). Proof: a hand-authored composed slide (title + stats/quote row) renders in the
  browser; parity baseline unchanged.
- [ ] **Slice 2 — full v1 vocabulary + classic re-expression.** All 12 section types; the ~10
  rack-test layouts become compositions; dual-scoped CSS for the refugees; `validate.py` learns
  `composed` (recursion, one-row-deep, `SECTION_TYPES`). Tests 1–3, 10 (composed half). Proof:
  a demo deck exercising every section type + rows, side-by-side with the classic originals.
- [ ] **Slice 3 — promotion.** `TO_SECTIONS` maps, `F.promoteSlide`, longest-prefix override
  remap, single-undo restore, right-click "Convert to composed". Tests 4, 7. Proof: promote a
  styled stat-grid in the browser, styles survive, one undo returns it.
- [ ] **Slice 4 — integrated insert + section verbs.** `F.insertIntoFlow`, gallery section tags,
  promote-confirm, floating-fallback toast on bespoke layouts; `F.moveSection` /
  `F.removeSection` / `F.resizeSection` + ▲/▼ toolbar + Items-panel rows. Tests 5, 6. Proof:
  the Gate-1 insert-flow mockup scenario reproduced live (stat row joins a media-split slide).
- [ ] **Slice 5 — personality.** `src/personality.css` (Editorial, Blueprint), `%PERSONALITY_CSS%`
  marker, `F.setPersonality` + picker beside Theme, boot application, `validate.py` membership
  check. Tests 8, 10 (personality half). Proof: live switch on the demo deck; default deck
  byte-identical with no attribute.
- [ ] **Slice 6 — preset gallery.** `PRESETS` built-ins, ⊞ Insert tabs (Elements | Slides | From
  this deck), `gallerySlideThumb` whole-slide miniatures (cached, rendered on tab open),
  `F.insertPreset`; masters round-trip with composed slides. Tests 9, 13. Proof: gallery
  screenshot in deck theme+personality; insert a preset; ghost leaves no residue.
- [ ] **Slice 7 — generation surface + the rack test.** `references/layouts.md` (composed +
  sections), new `references/personalities.md`, `references/editor.md` "v6", `SKILL.md`
  (personality pick, composed guidance). Then run the Gate-1 success metric: rebuild 10
  real-world slides; ≥8 must rebuild faithfully with no escape hatch. Proof: the rack-test deck
  + a pass/fail table per slide.

Browser-only checks 11–14 are folded into their owning slices' proofs. Wave-2 items deliberately
out (deferred, not forgotten): promotion for the remaining decomposable classics, on-canvas
drag-to-reorder, additional personalities.
