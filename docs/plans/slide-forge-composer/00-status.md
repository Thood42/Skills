# Status: slide-forge quality & composition upgrade ("composer")

- Gate 1 — Product: APPROVED 2026-08-15
- Gate 2 — Architecture: APPROVED 2026-08-15
- Gate 3 — Program Design: APPROVED 2026-08-15
- Gate 4 — Slice plan: APPROVED 2026-08-15

## Slices
- [x] Slice 1 — tracer: `composed` renders (3 section types incl. a CSS refugee; parity canary)
- [x] Slice 2 — full 12-type vocabulary + ~10 classics re-expressed + validator
- [x] Slice 3 — promotion (`TO_SECTIONS`, override remap, single-undo restore)
- [x] Slice 4 — integrated insert + section verbs (move/remove/resize, fallback toast)
- [x] Slice 5 — personality (Editorial + Blueprint, picker, boot, validator)
- [x] Slice 6 — preset gallery (tabs, whole-slide thumbnails, masters round-trip)
- [x] Slice 7 — generation surface docs + the Gate-1 rack test (≥8/10) — **scored 10/10**

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

- **Slice 3 done 2026-08-15.** `SG.TO_SECTIONS` (all 10 decomposable layouts) + `SG.canPromote`;
  `F.promoteSlide` / `F.canPromote` + `remapPrefixes` (longest-prefix-first, which is why `title`
  can't swallow `timeline` — the `+'.'` in the match is load-bearing); right-click →
  "⧉ Convert to composed". One `F.do` = one undo. media-split promotes to a ROW (its real
  arrangement) and `side:"right"` flips which item is which. **Known + deliberate:** agenda's `rail`
  is slide chrome with no section home, so converting an agenda slide drops a styled rail; the GC
  logs it and one undo restores it. editor-ops 187/187; parity 7.
  - Browser proof: styled a classic stat-grid (mint rotated title, 280px stat, 24px label), hit
    convert — all three overrides re-key and still apply, and the stat-grid's rendered box is
    **identical at 1104×427 before and after**; one undo returns the classic keys.

- **Slice 4 done 2026-08-15.** `F.insertIntoFlow` / `moveSection` / `removeSection` / `resizeSection`
  + `sectionIndexOf` / `take`+`putSectionOverrides`; `promoteMutate` factored out so promote+insert is
  ONE undo. GALLERY entries gained a 5th field = section type (13 of 26 tagged "joins the layout");
  4 new cards (Chart, Table, Bullets, Picture). New chrome: `F.toast` + `F.confirmDo` (two NAMED
  buttons — "Add to the layout" / "Add floating on top" — neither is "cancel"). Inspector grows a
  "Section N of M" block (▲ ▼ ✕ + space-weight) whenever the selection is inside a section at any
  depth; `elName` names sections by TYPE ("Stat row") off the `.sec-<type>` class. editor-ops
  222/222; parity 7.
  - Browser proof, all four paths: (1) stat row inserted into the media+bullets slide — the row
    shrank 580→375 to make space, stats took 205px, **0 free objects, 0 overflow**, card themed by
    deck tokens with no inline style; (2) classic stat-grid → confirm → promoted to
    titleband/stats/quote, 0 free objects, one undo back to `stat-grid`; (3) `cover` slide → floating
    object + toast "a 'cover' slide has no flow to join"; (4) inspector shows "Section 2 of 2" ▲ ▼ ✕.

- **Slice 5 done 2026-08-15.** `src/personality.css` (Editorial + Blueprint), `%PERSONALITY_CSS%`
  marker, `SG.applyPersonality` + `SG.clearPersonalityFonts`, `F.setPersonality` + picker under
  Theme, `validate.py` membership check. 13 `--p-*` tokens, every one consumed as
  `var(--p-x, <today's value>)` at its use site, so deleting the file changes nothing.
  editor-ops 235/235 (13 new); parity 7.
  - **The font-precedence trap, solved once — don't undo it.** Themes write `--font-*` as INLINE
    styles on `<html>`, which beat any stylesheet, so a personality's pairing is declared as
    `--p-font-*` and copied onto `--font-*` inline by the engine. The CLEARING of those inline props
    must run BEFORE `applyGlobalTheme`, in its own `clearPersonalityFonts()` — doing it inside
    `applyPersonality` strips the font the theme just set, and turning a personality off silently
    took the theme's typeface with it. (Found and fixed in the browser; jsdom can't resolve
    `--p-font-*` from a stylesheet, so this is NOT covered by the Node suite.)
  - Browser-verified order: theme Playfair → +blueprint Archivo → +editorial Fraunces → off Playfair
    → brand Syne wins over both. `--cyan` stays the theme's `#b98cff` throughout — colour never moves.
  - Measured deltas (default → editorial → blueprint): title 62/58/54px, radius 16/4/0px, pad
    70·88 / 84·104 / 56·68, row gap 34/44/26px, dot texture .30/0/.55, editorial adds a 1px hairline
    under every title band. Turning it off returns EVERY value to the default probe. Zero overflow
    under both personalities across all 12 demo slides.

- **Slice 6 done 2026-08-15.** 10 built-in `PRESETS` (8 composed, 2 classic) + `F.insertPreset`;
  ⊞ Insert grew tabs (Elements | Slides | From this deck); `gallerySlideThumb` renders a WHOLE slide
  into the ghost and scales it into a 16:9 well; `F.saveMaster(name,slideIdx)` extracted from its
  button so masters are testable and the third tab can show them. editor-ops 253/253 (18 new);
  parity 7.
  - **Naming collision, cost an hour — don't repeat it.** The preset card was `class="forge-gal-card
    slide"`, which picked up **deck.css's** `.slide{position:absolute; inset:0; display:flex}` and
    blew every card out to 1280px inside a 202px grid track. Editor chrome must never reuse a DECK
    class name; the modifier is now `whole`.
  - Ghost hygiene is asserted three ways (before/while open/after close) in both jsdom and the
    browser, plus a MutationObserver that sweeps `#deck` when the modal leaves. A surviving
    `.forge-ghost` shifts every `.slide` index and breaks navigation.
  - Browser proof: 10 cards at 197px in a 3-column grid, thumbnails fitting their 179×101 wells
    exactly, rendered in the deck's live theme AND personality (blueprint padding 56·68 visible in
    the miniature), 0 ghosts throughout, inserting a preset took the deck 12 → 13 slides.
  - **Size watch:** the built template is now **443 KB of the 450 KB budget**. Gate 1 put quality
    above the budget, but slice 7 is docs-only for a reason — the next code slice needs either a
    raised budget or a trim.

- **Slice 7 done 2026-08-15 — ALL SEVEN SLICES COMPLETE.** `references/layouts.md` gained a full
  `composed` entry (shape, the `size` rule of thumb, the 12-type table, the classic→composition map);
  new `references/personalities.md`; `references/editor.md` "v6"; `SKILL.md` step 1 asks for a
  personality, step 2 says fit the shape to the idea and reach for `composed` before `raw`, step 4
  applies it, plus 3 new pitfalls and 1 new self-check.
  - **Gate-1 rack test: 10/10** (bar was ≥8/10). `tests/rack-test.json`, kept as a fixture. Ten
    real-world slide shapes; 9 composed + 1 classic `quote`; **zero `raw` slides**, zero bounding
    boxes crossing 1280×720, zero elements with clipped text, under the `blueprint` personality.
  - The test earned its keep on the first pass: slide 4 overflowed 68px because `prose` emitted its
    `.ed-cols` grid (30px margin + rule) even with an EMPTY columns array. Fixed in `S.prose`, and
    `layouts.md` now says one line of body text is a `bullets` section with only `body`.
  - Final state: parity 7 (baseline), editor-ops 253/253, `build.py --check` clean, template
    443 KB / 450 KB.

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
