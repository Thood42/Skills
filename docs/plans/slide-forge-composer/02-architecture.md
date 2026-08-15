# Architecture: slide-forge quality & composition upgrade

Grounded in: `src/engine.js` (v3 node-tree registry, `buildSection`, authored `data-el`/`data-bind`/
`data-arr` keys = content paths), `src/editor.js` (v5 `type:'node'` free objects, `mountNodeFree`
key-namespacing, ⊞ Insert `GALLERY` + `galleryNode` ghost-render, masters, `F.addSlide`),
`src/deck.css` (`.slide` is already `display:flex;flex-direction:column` — layout output is flex
children), `src/engine.css` (per-layout CSS is class-scoped, mostly on inner containers).

## Fit

Everything lands in the existing single-file template pipeline: `src/*` modules → `scripts/build.py`
→ `editor-template.html`. No new runtime, no server, no dependency. Five touch areas:

1. **Engine** (`src/engine.js` + a new `src/sections.js` module): a **section registry** beside the
   layout registry, and one new layout, `composed`, that renders `content.sections`.
2. **Styles** (`src/deck.css`, `src/engine.css`, new personality CSS): row/column arrangement CSS
   (small — flex already does the work) + personality variable sets.
3. **Editor** (`src/editor.js`): insert-into-flow, promote-to-composed, section reorder,
   personality picker, and a "Slides" tab in the ⊞ Insert gallery.
4. **Generation surface** (`SKILL.md`, `references/layouts.md`, new `references/personalities.md`,
   `scripts/validate.py`): Claude can author composed slides and personalities directly.
5. **Tests** (`tests/parity.mjs` baseline must not change for classic decks; `tests/editor-ops.mjs`
   grows section/personality/preset assertions).

### Core architectural moves (the load-bearing decisions)

**A. Sections are the existing layout internals, extracted and parameterized by key-prefix.**
Today `L['stat-grid']` builds its stat cards inline with keys like `stats.2`. Extraction:
`S.stats(content, base)` builds the same nodes with keys `base+'stats.2'`. Then
`L['stat-grid'] = c => [S.titleband(c,''), S.stats(c,'')]` — byte-identical output when `base=''`
(parity-checked), and `composed` calls the same builder with `base='sections.2.content.'`.
One implementation, two callers. Classic layouts *become* thin section compositions where
decomposable; strongly bespoke layouts (cover, divider, figure, diptych, hero-asym, manifesto,
image, embed, raw) stay monolithic and are simply not decomposable.

**B. Identity needs no new machinery.** A composed slide's keys are literal content paths
(`sections.1.items.0.content.stats.2.label`), so `SG.getPath`/`SG.setPath`, deterministic bind
write-back, overrides, hide/fs, GC, and the whole v4 inspector work unchanged. This is the payoff
of the v3 authored-identity decision.

**C. The `composed` layout renders an arrangement tree, one level deep.**
`content.sections` is an array; each entry is `{type, size?, content}` or a row
`{type:'row', size?, items:[{type, size, content}]}`. Rows are the only nesting (rows cannot
contain rows) — deliberate ceiling to keep the editor's mental model and the validator sane.
`size` is a flex weight. Rendering: `<div class="sec-<type>" data-el="sections.N">` flex items in
the `.slide` column; rows are `display:flex` with weighted children.

**D. Classic ↔ composed conversion is a per-layout, declared mapping.** Each decomposable layout
registers `toSections(content) → sections[]` (trivial: it's the same composition the layout
function itself now uses). Promotion rewrites the slide to
`{layout:'composed', content:{sections}}` and remaps override keys by the same mapping
(`stats.2.label` → `sections.1.content.stats.2.label`) — the existing item-op key-remap pattern.
Promotion happens only on an explicit user action (insert-into-flow / reorder / "convert"), never
on load — untouched decks stay byte-identical.

**E. Personality is a second CSS-variable axis + one root attribute.** `data.personality` (deck
JSON) → `data-personality="<name>"` on `<html>`. A build-time-embedded personality stylesheet
defines, per personality: font-variable overrides, spacing/radius/letter-spacing tokens, and a
bounded set of structural rules scoped `[data-personality=X]`. Themes keep owning color;
personalities own type/space/shape/motif. Default personality = no attribute = today's rendering,
byte-identical.

**F. Slide presets ride the masters machinery.** A preset is `{name, desc, badge, slide}` where
`slide` is a normal slide object (usually `layout:'composed'`) with placeholder content. Built-in
presets are a build-time list; "From this deck" presets are the existing `data.masters`, unchanged
on disk. The gallery thumbnails reuse the ⊞ Insert `forge-ghost` scaled-miniature technique on
whole sections instead of single elements.

## Endpoints

None — no server. The equivalent contract surface is the deck JSON schema (below) and
`window.SG`/`window.F` internals.

## Data

Deck JSON (`<script id="deck-data">`) — all additive; `meta.schemaVersion` stays 3:

- **New layout value** `"composed"` with `content.sections:[ Section | Row ]`.
  `Section = {type:<section name>, size?:number, content:{…}}`;
  `Row = {type:'row', size?:number, items:[Section]}` (no nested rows).
  Sections carry the same field vocabulary their source layouts use today.
- **`data.personality`**: string naming a built-in personality (absent = default). No per-slide
  personality this round.
- **Presets**: built-ins live in the template (not deck JSON); user presets are the existing
  `data.masters` (a master may now hold a composed slide — no schema change).
- `overrides` / `freeObjects` unchanged; override keys on composed slides are the deeper paths.

Queries that hit this data (all in-file): `composed` render walks `content.sections`; editor item
ops splice `sections[]` and remap override key prefixes; validator recurses the section tree,
checks section types against the registry, enforces the one-row-deep rule, and checks
`personality` against the known set.

## Flow

**Generation:** Claude picks per idea either a classic layout (unchanged path) or
`composed` + sections (new vocabulary in `references/layouts.md`), plus `data.personality` chosen
with the theme (new step alongside the existing theme pick in SKILL.md).

**Render (composed slide):** `SG.render` → `buildSection` → `L.composed(content)` → for each
entry, section registry `S[type](entry.content, 'sections.N.content.')` → flex children of the
`.slide` column (rows wrap weighted flex children). Overrides/freeObjects decorate exactly as
today.

**Integrated insert:** ⊞ Insert (Elements or Slides tab) → target slide is composed? splice a new
section at the drop index → `SG.renderSlide`. Classic and decomposable? confirm → promote
(D above) → splice → render. Classic and non-decomposable? insert as the existing v5 floating
node object (today's behavior, now the fallback, offered as such).

**Reorder / switch:** drag a section's handle → splice `sections[]`, remap override prefixes,
re-render. Apply a different preset to an existing slide → match sections by type (title↔title,
stats↔stats, media↔media…), carry matched content over, keep unmatched content in the slide JSON
(unrendered, so switching back loses nothing).

**Personality switch (editor):** picker beside Theme → sets `data.personality`, flips the root
attribute, full re-render (cheap; same path as theme switch).

## External

- **Google Fonts `<link>`** (name only, already the template's single external touch): each
  personality declares its font pairing; at generation time the chosen personality's fonts are
  added to the link exactly as themes' fonts are today. In-editor personality *switching* on an
  offline deck falls back to the stack's system/DejaVu fallbacks — same degradation contract as
  themes. No other external anything.
