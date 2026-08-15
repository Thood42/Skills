# Program Design: slide-forge quality & composition upgrade

Everything below is grounded in the current `src/` (v5). Notation: `S` = the new section registry,
`L` = the existing layout registry (`SG.layouts`), `F` = editor namespace, `c` = content object.

## Files

New:
- `src/sections.js` — the section registry `S`, per-section metadata, the `composed` layout, the
  per-layout `toSections` promotion maps, and re-registration of decomposable classic layouts as
  section compositions. Loads AFTER `engine.js` (it consumes `SG.N`, `SG.layouts`, and the new
  `SG.h` helper export) and BEFORE `editor.js`. Lives apart from engine.js so the engine stays the
  "kernel" (node builder, render loop, assets, embeds) and the vocabulary is one readable module.
- `src/personality.css` — `[data-personality=X]` variable sets + a bounded list of structural
  rules per personality. Separate file so a personality is reviewable as a unit and the default
  path provably has zero rules.
- `references/personalities.md` — generation-time reference (what each personality says, when to
  pick it, its Google Fonts pairing) — mirrors how `themes.md` works.

Changed:
- `src/engine.js` — (1) export closure helpers as `SG.h = {rich, esc, arr, kickerN, titleN, pad}`;
  (2) DELETE the bodies of decomposable layouts (they move to sections.js as compositions);
  (3) apply `data.personality` → `document.documentElement.dataset.personality` at boot and on
  `SG.render`.
- `src/engine.css` — port section-level CSS for `bignum`/`quote` (today scoped via
  `SECTION_LAYOUTS` classes on the `<section>`) to also match the composed wrapper class; add the
  tiny `.sec`/`.sec-row` arrangement rules.
- `src/editor.js` — insert-into-flow + promotion + section reorder verbs, personality picker,
  ⊞ Insert tabs (Elements | Slides | From this deck), built-in `PRESETS`, whole-slide ghost
  thumbnails.
- `src/editor.css` — gallery tab chrome, section hover/selection affordances, section toolbar.
- `src/shell.html` + `scripts/build.py` — two new markers/parts: `%SECTIONS_JS%`,
  `%PERSONALITY_CSS%`.
- `scripts/validate.py` — `composed` schema (recursive sections, one-row-deep rule, known section
  types), `personality` membership check. (`OVERRIDE_KEY_RE` already accepts
  `sections.0.content.stats.2.label` — verified; no grammar change.)
- `references/layouts.md` — the `composed` layout + section vocabulary; each decomposable layout's
  entry gains its section decomposition line.
- `references/editor.md` — "v6" section documenting all of the above for future sessions.
- `SKILL.md` — generation workflow gains: personality pick (beside theme pick) and
  when-to-use-composed guidance.
- `tests/editor-ops.mjs` — new assertion groups (below). `tests/parity.mjs` — untouched; its
  7-diff baseline is itself the test that layout re-expression is byte-identical.

## Types & signatures

```js
/* ---------- sections.js ---------- */

// A section builder returns the SAME node array the classic layout emits for that
// region, with every authored key prefixed by `base` ('' for classic callers).
// S[type] is the registry; meta rides alongside the builder.
SG.S = S;                                   // exposed for editor + tests
S[type] = {
  build: function(c, base) -> Node[],       // base: '' | 'sections.N.content.' | 'sections.N.items.M.content.'
  label: 'Stat row',                        // Items panel / gallery name
  fields: {…},                              // contentForm field spec (reuses FIELD_LABEL vocabulary)
  defaults: {…},                            // placeholder content for inserts
};

// v1 section vocabulary (source layout in parens; fields = that layout's fields today):
//   titleband (all headed layouts: kicker?, title)   stats (stat-grid)     bignum (bignum)
//   chart (chart)      table (table)     comparison (comparison)   quote (quote)
//   bullets (media-split points)   media (media-split image side)  agenda (agenda)
//   timeline (timeline)   prose (editorial columns)
// Non-decomposable (stay monolithic, insert falls back to floating): cover, divider, figure,
//   diptych, hero-asym, manifesto, image, embed, raw.

// Composed slide content:
//   Section = {type: keyof S, size?: number, content: {…}}
//   Row     = {type:'row', size?: number, items: Section[]}      // rows cannot nest
L.composed = function(c) -> Node[];
// per entry: N('div.sec.sec-'+type, {key:'sections.'+i, style:'flex:'+size}, S[type].build(...))
// rows:      N('div.sec-row',        {key:'sections.'+i}, items.map(...))

// Classic layouts become compositions — byte-identical at base='' (parity-checked), e.g.:
L['stat-grid'] = function(c){ return S.titleband.build(c,'').concat(S.stats.build(c,'')); };

// Promotion map, one per decomposable layout. keymap remaps override keys.
TO_SECTIONS[layout] = function(content) -> {sections: (Section|Row)[],
                                            keymap: {oldPrefix: newPrefix}};
// e.g. stat-grid: {sections:[{type:'titleband',content:{kicker,title}},
//                            {type:'stats',content:{stats}}],
//                  keymap:{'kicker':'sections.0.content.kicker', 'title':'sections.0.content.title',
//                          'stats':'sections.1.content.stats'}}   // prefix match, longest first

/* ---------- engine.js ---------- */
SG.h = {rich, esc, arr, kickerN, titleN, pad};          // helper export for sections.js
function applyPersonality(){ /* data.personality -> root data attribute (or removal) */ }

/* ---------- editor.js ---------- */

// --- integrated insert ---
F.insertIntoFlow = function(slideIdx, secType, content?, atIdx?) -> bool;
//   composed slide  -> splice Section at atIdx (default: end), select it, renderSlide
//   decomposable    -> confirm dialog -> F.promoteSlide -> splice
//   non-decomposable-> returns false; caller falls back to F.insertElement (floating, labeled)
F.promoteSlide = function(slideIdx) -> bool;
//   TO_SECTIONS[layout](content) -> rewrite slide to {layout:'composed', content:{sections}},
//   remap override keys via keymap (longest-prefix-first), single F.do entry (one undo step)

// --- section verbs (Items panel rows + on-canvas section toolbar) ---
F.moveSection   = function(slideIdx, from, to);   // splice + remapSectionIndices
F.removeSection = function(slideIdx, idx);        // + orphan-override GC (existing pass)
F.resizeSection = function(slideIdx, idx, size);  // flex weight; 0/blank = auto
function remapSectionIndices(host, from, to);     // override-key prefix rewrite,
                                                  // same pattern as item-op remap today

// --- personality ---
F.setPersonality = function(name|null);           // F.do -> data.personality -> applyPersonality -> render
var PERSONALITIES = ['editorial','blueprint'];    // v1 set (matches approved mockups)

// --- presets ---
var PRESETS = [{name, desc, badge:'classic'|'composed', slide:{layout, content}}];
F.insertPreset = function(preset) ;               // clone slide, splice after current, select
// "From this deck" tab = data.masters, unchanged; a master may hold a composed slide already.
function gallerySlideThumb(slide) -> Node;        // whole-slide forge-ghost scaled miniature
                                                  // (same technique as galleryNode, section-sized -> slide-sized)
// F.insertGallery grows tabs: Elements (today's GALLERY) | Slides (PRESETS) | From this deck.
// GALLERY entries that correspond to a section gain a 5th field: ['Stat card','stat-grid','stats.0',null,'stats']
// — when the target slide is composed/decomposable, that field routes to insertIntoFlow.
```

```python
# ---------- validate.py ----------
SECTION_TYPES = {'titleband','stats','bignum','chart','table','comparison','quote',
                 'bullets','media','agenda','timeline','prose'}
PERSONALITIES = {'editorial','blueprint'}
def _check_sections(sections, where, errs, warns, depth=0): ...
#   entry is dict; type in SECTION_TYPES or 'row'; row only at depth 0; row.items non-empty;
#   size, when present, is a positive number
```

## Call stack

**Render a composed slide (present + editor, identical):**
`SG.render` → `buildSection(slide)` → `L.composed(content)` → per entry `S[type].build(entry.content, 'sections.N.content.')` (rows: one more level) → node tree → mount → `decorate()` applies `overrides` by key exactly as today (keys are just deeper paths).

**Integrated insert:**
gallery card click → `F.insertGallery` handler → `F.insertIntoFlow(cur, secType)` →
[composed? splice] / [decomposable? confirm → `F.promoteSlide` → splice] / [else `F.insertElement` floating fallback, toast says so] → `F.do` snapshot → `SG.renderSlide` → select new section.

**Promotion (also reachable as right-click → "Convert to composed"):**
`F.promoteSlide(i)` → `TO_SECTIONS[layout](content)` → rewrite slide object → remap
`overrides` keys longest-prefix-first → orphan-GC → single undo entry → `SG.renderSlide`.

**Reorder:** section toolbar ▲/▼ or Items-panel row drag → `F.moveSection` →
`remapSectionIndices` → `SG.renderSlide`.

**Personality switch:** picker (beside Theme) → `F.setPersonality(name)` → `F.do` →
`applyPersonality()` (root attribute) → `SG.render`. Boot path: `SG.render` calls
`applyPersonality()` so a saved deck opens styled.

**Preset insert:** Slides tab card → `F.insertPreset(p)` → clone → splice after current →
`SG.render` → go to slide. Thumbnails: on tab open, each preset renders once through
`gallerySlideThumb` into the ghost section, scaled miniature cached per (preset, theme, personality).

## Test plan

Node (`tests/editor-ops.mjs`, jsdom):
1. `parity-guard` — all decomposable classic layouts render byte-identical to the frozen v2
   snapshots (this is just the existing `parity.mjs` run; its 7-diff baseline must not move).
2. `composed-render-keys` — a composed slide (2 sections + 1 row) renders `data-el`/`data-bind`
   keys that are exact content paths; `SG.getPath(data, key)` resolves for every bound leaf.
3. `composed-overrides` — an override keyed `sections.1.content.stats.0.label` styles the right
   node; `hide` and `fs` work at section depth.
4. `promote-remaps` — stat-grid slide with overrides on `title` and `stats.2` → `F.promoteSlide`
   → layout is `composed`, overrides now keyed `sections.0.content.title` /
   `sections.1.content.stats.2`, old keys gone, render shows the styles; one undo restores the
   classic slide byte-identically.
5. `insert-into-flow` — insert `stats` into a composed slide → sections length +1, new section
   selected-able by key; insert into a decomposable classic → slide auto-promotes first; insert
   into `cover` → returns false (caller falls back to floating).
6. `move-remove-section` — `F.moveSection` remaps override prefixes (style follows the section);
   `F.removeSection` drops the section and GCs its orphaned overrides (undoable).
7. `bind-writeback-deep` — `endEdit` on a leaf inside a row item writes to
   `sections.N.items.M.content.…` via the existing bind path.
8. `personality` — `F.setPersonality('blueprint')` sets `data.personality` + root attribute;
   `null` removes both; undo restores; a deck with no personality renders with no attribute.
9. `presets` — `F.insertPreset` splices a deep clone (mutating the inserted slide never mutates
   the preset); a composed slide saved as a master and re-inserted round-trips.
10. `validator` (python, `scripts/validate.py` self-tests / direct invocation) — accepts a valid
    composed deck; rejects nested rows, unknown section type, unknown personality; still accepts
    every existing example deck unchanged.

Real browser (documented in `tests/README.md`, jsdom can't cover):
11. Composed slide visual: flex weights, row wrapping, theme + personality both applied.
12. Insert-into-flow end-to-end from ⊞ Insert; floating fallback toast on `cover`.
13. Preset gallery thumbnails render in deck theme/personality; ghost section leaves no residue
    (slide indices unchanged after closing the gallery — the known `.forge-ghost` pitfall).
14. Personality switch live; downloaded .html reopens with personality intact and byte-clean
    of editor chrome.

## Least confident decisions

1. **CSS scoping for `bignum`/`quote` (and any other `SECTION_LAYOUTS` refugees).** Their CSS
   targets the `<section>` element itself; inside `composed` they render in a `div.sec` wrapper,
   so those rules must be dual-scoped (`.slide.bignum, .sec-bignum`). Risk: subtle spacing
   differences inside composed. Mitigated by making slice 1 (tracer) include one such section and
   eyeballing it early.
2. **`SG.h` helper export.** Exposing `rich/esc/arr/…` widens the internal API so `sections.js`
   can live as its own module. Alternative: fold sections into `engine.js` and export nothing.
   I prefer the module split (engine stays a kernel), but it's a one-line-per-helper reversal.
3. **Section wrapper vs. direct-child assumptions.** Classic layout CSS sometimes assumes its
   blocks are direct flex children of `.slide` (e.g. `flex:1` chains, `margin-top:auto`). Inside
   `.sec` wrappers those need `min-height:0`/`display:flex;flex-direction:column` on `.sec` to
   keep behaving. The arrangement CSS is small but load-bearing.
4. **v1 `toSections` coverage = 12 section types / ~10 promoted layouts** (the rack-test set).
   The other decomposable classics (pipeline, code, metric-dash, leaderboard, matrix, stack,
   mosaics, before-after) stay classic-only in v1 — still insertable as floating objects — and
   gain promotion in a later wave. If the rack test fails on one of them, that's the signal the
   wave was cut wrong.
5. **Single-item gallery picks inserting as sections.** "Stat card" (pick `stats.0`) inserting
   into flow creates a `stats` section with ONE item (defaults trimmed to length 1), not a bare
   card — so list verbs immediately work. Slightly surprising ("I asked for one card, got a
   row"), but the alternative (a special one-item section type) doubles the vocabulary.
6. **Reorder gesture = ▲/▼ + Items-panel drag in v1; free drag-to-reorder on canvas deferred.**
   Canvas drag currently means move/resize override geometry; overloading it for flow-reorder
   needs a distinct grip affordance and new gesture code — deferred until the model proves out.
7. **Preset thumbnail cost.** ~10 built-ins + masters, each a full slide render on tab open.
   Cached per theme+personality and rendered lazily (IntersectionObserver not needed at this
   count, but render-on-first-tab-open, not at editor boot).
