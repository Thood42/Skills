# Status: slide-forge quality & composition upgrade ("composer")

- Gate 1 — Product: APPROVED 2026-08-15
- Gate 2 — Architecture: APPROVED 2026-08-15
- Gate 3 — Program Design: APPROVED 2026-08-15
- Gate 4 — Slice plan: APPROVED 2026-08-15

## Slices
- [x] Slice 1 — tracer: `composed` renders (3 section types incl. a CSS refugee; parity canary)
- [x] Slice 2 — full 12-type vocabulary + ~10 classics re-expressed + validator
- [ ] Slice 3 — promotion (`TO_SECTIONS`, override remap, single-undo restore)
- [ ] Slice 4 — integrated insert + section verbs (move/remove/resize, fallback toast)
- [ ] Slice 5 — personality (Editorial + Blueprint, picker, boot, validator)
- [ ] Slice 6 — preset gallery (tabs, whole-slide thumbnails, masters round-trip)
- [ ] Slice 7 — generation surface docs + the Gate-1 rack test (≥8/10)

## Progress log
- **Slice 1 done 2026-08-15.** `src/sections.js` (registry `S` + `L.composed` + `SG.sectionNode`),
  `SG.h` helper export, `%SECTIONS_JS%` marker, `.sec`/`.sec-row` CSS in engine.css, quote CSS
  dual-scoped `.quote, .sec-quote` in deck.css. `stat-grid` AND `quote` re-expressed through `S`.
  parity.mjs still 7 diffs (both re-expressed layouts show ZERO); editor-ops.mjs 156/156 (14 new).
  Browser-verified via `tests/make-demo.py` + `composed-demo.json`: weighted row lands 713/357 with
  a 34px gap, nothing overflows 1280×720, classic quote still 52px/380px vs the section's 34px/200px,
  editor boots on a composed slide and selects `sections.1.items.0`. **Screenshots were unavailable
  in that session** (Browser pane not compositing) — proof is measured geometry, not an image.

- **Slice 2 done 2026-08-15.** All 12 section types; 10 classics are now compositions (stat-grid,
  quote, chart, table, comparison, timeline, bignum, editorial, agenda, media-split). `SG.h` widened
  with emRich/icon/mediaImgWrap/fitStyle; `SG.SECTION_TYPES` exported. `validate.py` learns
  `composed` (`SECTION_S`/`SECTION_ITEM`/`_check_sections`, one-row-deep, positive `size`) and
  exempts `composed` from the back-to-back-layout warning. parity 7; editor-ops 164/164.
  - **Sizing semantics settled here, after three wrong tries — don't re-litigate.** `size` writes
    `flex-grow` ONLY. Basis differs by axis (row: 0, literal width proportions; column: auto).
    `.sec` KEEPS flexbox's automatic min-height; the elastic types (`chart`/`table`/`timeline`/
    `media`) opt out via `min-height:0` and absorb an over-full slide. Rigid bodies
    (`.stat-grid`/`.cmp`/`.editorial`/`.agenda-grid`/`.take`/`.gallery`) get `flex-basis:auto` back
    inside a `.sec`. Root cause of the original spill: a chart SVG carries ~600px of INTRINSIC
    height (viewBox 1000×540 at width:100%), so the shrink phase was taking a proportional bite out
    of every section, including the ones that cannot shrink.
  - Browser-verified on a 12-slide demo (6 composed exercising all 12 types + rows, then the 6
    classic originals): **zero bounding boxes cross 1280×720**, rows share one top edge, weights
    land 713/357 and 535/535.

## Notes for a fresh session
- User's founding complaint (2026-08-15): slide-forge isn't user-friendly enough; layouts and
  components added to new/existing slides are not well integrated; the fixed-layout mechanism
  makes decks feel templated rather than custom. Quality/functionality outrank the size budget
  for this effort.
- Context docs to read: `slide-forge/SKILL.md`, `slide-forge/references/layouts.md`,
  `slide-forge-design-critique.md` (the "Option B / node-tree" verdict — already shipped as v3),
  `slide-forge/references/editor.md` (v4 UX + v5 content-backed copies).
- Key prior art: v5 free objects (`type:'node'`) already re-render layout subtrees with editable
  fields — but they FLOAT; they don't join the slide's flow. That gap is the heart of complaint #2.
- Scope confirmed 2026-08-15 via chat: composition core + deck personality + slide preset
  gallery are IN; the standalone friendliness pass is OUT (except what falls out naturally).
- Gate 1 doc + 4 mockups written (composed-slide, insert-flow, personality, preset-gallery);
  all verified rendering in a browser. Gate 1 approved 2026-08-15.
- Gate 2 (`02-architecture.md`) approved 2026-08-15. Core decisions: section registry `S[type]`
  extracted from layout internals, parameterized by key-prefix (`base=''` = byte-identical classic
  render); `composed` layout renders `content.sections` (one-level row nesting only); identity =
  literal content paths, no new machinery; classic→composed promotion only on explicit user action
  via per-layout `toSections()` + mechanical override-key remap; personality = `data.personality`
  → `data-personality` attr + build-time CSS variable sets (themes own color, personalities own
  type/space/shape/motif); presets ride `data.masters` + a built-in template list; all data
  additive, schemaVersion stays 3; Google Fonts remains the only external touch.
