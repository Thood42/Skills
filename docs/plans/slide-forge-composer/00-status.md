# Status: slide-forge quality & composition upgrade ("composer")

- Gate 1 — Product: APPROVED 2026-08-15
- Gate 2 — Architecture: APPROVED 2026-08-15
- Gate 3 — Program Design: APPROVED 2026-08-15
- Gate 4 — Slice plan: APPROVED 2026-08-15

## Slices
- [ ] Slice 1 — tracer: `composed` renders (3 section types incl. a CSS refugee; parity canary)
- [ ] Slice 2 — full 12-type vocabulary + ~10 classics re-expressed + validator
- [ ] Slice 3 — promotion (`TO_SECTIONS`, override remap, single-undo restore)
- [ ] Slice 4 — integrated insert + section verbs (move/remove/resize, fallback toast)
- [ ] Slice 5 — personality (Editorial + Blueprint, picker, boot, validator)
- [ ] Slice 6 — preset gallery (tabs, whole-slide thumbnails, masters round-trip)
- [ ] Slice 7 — generation surface docs + the Gate-1 rack test (≥8/10)

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
