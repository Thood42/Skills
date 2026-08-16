# Program Design: slide-forge v3.6 — motion overhaul

## Files

| file | change | why here |
|---|---|---|
| `src/anim.js` | **major** — gains `SG.motion` (resolver, role pass, finalize, step units) | it already owns `activate`/`deactivate`/`wire` and the entrance lifecycle; motion logic belongs beside them, not in the engine |
| `src/anim.css` | **major** — preset custom properties, role rules, 5 reveal styles, shared resolved-state block | CSS owns the vocabulary so JS never picks an animation |
| `src/engine.js` | `N()` gains a `role:` branch; `buildSection` calls the role pass; `SG.migrate` v3→v4; `SCHEMA_VERSION`→4; ~6 `role:` additions on figure/number/chrome nodes | the node builder and render path live here |
| `src/engine.css` | narrow `[data-ambient="none"]`; extract print's resolved-state rules to a shared selector list | defect 1's fix is a selector change, and the correct rules already live in this file |
| `src/deck.css` | tag the 13 always-on decorative loops with `[data-decor]` | they are declared here; the attribute is what lets `off`/`calm` reach them |
| `src/sections.js` | `role:'group'` on `.cmp`; roles on `.chart-wrap`/`.tbl-wrap`/`.hero-num`/`.ms-media` | the 12 section builders live here and must resolve identically to their classic callers |
| `src/editor.js` | Motion + Reveal controls in `deckSettings` and `slidePanel`; `F.setMotion`/`F.setReveal`; cascade readout in the existing Animations overview | `slidePanel` already hosts the Ambient select (`editor.js:2054`) — Motion sits beside it |
| `scripts/validate.py` | `MOTIONS`/`REVEALS` sets; deck- and slide-level checks | it already validates `ambient` and `personality` the same way |
| `scripts/build.py` | `BUDGET = 500 * 1024` | Gate 2 decision |
| `tests/motion-audit.mjs` | **new** — the Gate 1 success metric, executable | parity stops seeing motion attributes; this asserts what it stops seeing |
| `tests/parity.mjs` | extend `norm()`'s ignore list | Gate 2 decision; baseline stays 7 |
| `tests/editor-ops.mjs` | cascade, migration, editor-verb assertions | existing data-layer suite |
| `references/motion.md` | **new** — the motion vocabulary as a field reference | siblings: `layouts.md`, `themes.md`, `personalities.md` |
| `SKILL.md`, `references/layouts.md`, `references/editor.md` | generation guidance | **this is the actual deliverable** — the feature is for the generation tool |

## Types & signatures

```js
/* ===================== src/anim.js — SG.motion ===================== */

/** The closed role vocabulary. Anything not in here is not animated. */
SG.motion.ROLES = ['title','kicker','lead','body','meta','list','group',
                   'figure','number','quote','chrome'];

/** data-bind's LAST path segment -> role. Derived from the ~20 field names
 *  layouts actually author (measured at Gate 2). */
SG.motion.FIELD_ROLE;   // {title:'title', kicker:'kicker', subtitle:'lead', sub:'lead',
                        //  lead:'lead', body:'body', head:'title', desc:'body',
                        //  quote:'quote', by:'meta', label:'meta', note:'meta',
                        //  caption:'meta', value:'number', year:'meta', tag:'meta',
                        //  name:'body', statement:'quote', index:'meta', accent:'title'}

/** Class/tag table for what data-arr and data-bind cannot speak for. */
SG.motion.CLASS_ROLE;   // [['.chart-anim,.tbl-wrap,.code-panel,.ms-media,.fig-img,img,svg', 'figure'],
                        //  ['.sg-count,.hero-num,.num,.sg-ring',                            'number'],
                        //  ['.rail,.quote-mark,.tl-track,.tl-spark,.vs-rail,.divline,' +
                        //   '.pager,.progress,.amb,.dotrow,.code-sweep',                     'chrome']]

/** Resolve one element's role. Precedence: authored data-role > data-arr >
 *  data-bind field > class table > null (not animated). */
SG.motion.roleOf = function (node) /* -> string | null */ {};

/** The deck -> slide cascade. Never reads the DOM. */
SG.motion.resolve = function (slide, data) /* -> {
     motion: 'calm'|'standard'|'expressive'|'off',
     reveal: {style:'appear'|'wipe'|'typewriter'|'words'|'spotlight', unit:'item'|'block'} | null,
     stepped: boolean
   } */ {};

/** One pass over a freshly built section:
 *   - stamps data-motion / data-reveal on the <section>
 *   - sets data-role on every element roleOf() names
 *   - assigns --i in document order (list children continue the sequence)
 *   - sets --m-span = the final count, which is what drives the stagger cap
 *  Idempotent: safe to run again on the same section. */
SG.motion.tag = function (sec, resolved) /* -> void */ {};

/** The ordered step units for a slide: children of the first [data-role="list"]
 *  (unit:'item'), or the section's roled top-level blocks (unit:'block'). */
SG.motion.steps = function (sec) /* -> Element[] */ {};

/** Withholding styles hide what is next; the focusing style hides nothing. */
SG.motion.isFocusing = function (style) /* -> boolean */ {};   // spotlight -> true

/** Split a step unit into per-word / per-character spans, for the two styles
 *  that need them. PRESENT MODE ONLY — never while document.body has
 *  .forge-edit, because wrapping inside a [data-bind] leaf fights the editor's
 *  contenteditable commit. Rebuilt from content each render; never persisted. */
SG.motion.split = function (unit, style) /* -> void */ {};

/** Resolve every entrance element in scope to its finished state.
 *  Generalizes today's SG.finalizeAnimations, which keeps delegating here. */
SG.motion.finalize = function (scope) /* -> void */ {};

/* ===================== src/engine.js ===================== */

/** N() gains ONE branch. It must be explicit: unknown attrs fall through to
 *  setAttribute, so an attrs key literally named `role` would emit an ARIA
 *  role attribute instead of ours. */
// else if (k === 'role') n.setAttribute('data-role', v);

SG.SCHEMA_VERSION = 4;

/** v3 -> v4: ambient:"none" used to mean "silence everything" (destructively).
 *  It now means "no background layer", so intent is preserved by also setting
 *  motion:"off" wherever it appears. Runs once, on load. */
SG.migrate = function (data) /* -> data */ {};

/* ===================== src/editor.js ===================== */

/** slideIdx omitted = deck default (data.defaults.motion).
 *  One F.do() = one undo, matching F.setPersonality. */
F.setMotion = function (preset, slideIdx) /* -> void */ {};
F.setReveal = function (style, slideIdx) /* -> void */ {};
```

```css
/* ===================== src/anim.css — the CSS contract ===================== */

/* A preset is five numbers. Every role reads the same five; that is what makes
   drift structurally impossible. */
[data-motion]            { --m-dur:.7s; --m-dist:26px; --m-step:.08s; --m-cap:.9s;
                           --m-ease:cubic-bezier(.2,.7,.2,1) }
[data-motion="calm"]     { --m-dur:.45s; --m-dist:10px; --m-step:.05s; --m-cap:.6s }
[data-motion="expressive"]{ --m-dur:.95s; --m-dist:46px; --m-step:.13s; --m-cap:1.2s }

/* STAGGER CAP (decided by the user at Gate 3). The step is COMPRESSED so the
   whole sequence finishes inside --m-cap — it is not clamped. Clamping would
   pile every late element onto the ceiling and re-create the exact collision
   this feature exists to fix. tag() supplies --m-span (the element count);
   CSS does the rest, and every delay stays distinct and monotonic. */
.slide { --m-step-eff: min(var(--m-step), calc(var(--m-cap) / var(--m-span,1))) }
/*   … animation-delay: calc(var(--i,0) * var(--m-step-eff))                    */

/* `.mrun` is set on the SECTION when it becomes active — one class toggle for
   the whole slide, rather than per-element like the legacy .run path.
   `:not([data-anim])` is the precedence rule in CSS form: an element carrying an
   explicit per-element override is left entirely to the legacy sg-* path. */
.mrun [data-role]:not([data-anim]) {
  animation: mRise var(--m-dur) var(--m-ease) both;
  animation-delay: calc(var(--i,0) * var(--m-step));
}
.mrun [data-role="figure"]:not([data-anim]) { animation-name: mWipe }
[data-role="chrome"]                        { animation: none }   /* never */

/* ONE resolved-state block, four callers. These rules already exist and are
   already proven — they are engine.css:330-331, today reachable only by print. */
@media print                                   { /* … */ }
[data-motion="off"] ,
:root[data-static] ,
@media (prefers-reduced-motion: reduce)        { /* same declarations */ }

/* Defect 1's fix: ambient stops reaching element motion. */
.slide[data-ambient="none"] .amb,
.slide[data-ambient="none"] [data-decor] { animation: none !important }
```

## Call stack

**Render (every slide, every time):**
```
SG.render(deck, data)
└ buildSection(slide, i, total, defAmb, brand)
  ├ L[layout](content)                     unchanged — layouts emit node trees
  ├ SG.motion.resolve(slide, data)         deck -> slide cascade, no DOM
  └ SG.motion.tag(sec, resolved)
    ├ sec.setAttribute('data-motion' | 'data-reveal')
    ├ walk sec in document order:
    │   SG.motion.roleOf(node) -> data-role
    │   monotonic --i (list children continue the parent's sequence)
    └ if resolved.stepped && style needs spans: defer to first activate()
└ SG.wireAnims(deck)                       unchanged
```

**Slide becomes active:**
```
MutationObserver (anim.js, unchanged)
└ activate(slide)
  ├ legacy: .sg-onenter -> .run                      unchanged (per-element overrides)
  ├ sec.classList.add('mrun')                        NEW — drives every role rule
  ├ if stepped: SG.motion.steps(sec), split() if typewriter|words,
  │             withhold or dim per isFocusing()
  └ .sg-count / .sg-ring / .sg-draw                  unchanged
```

**Forward navigation:**
```
keydown → / Space / click
└ SG.stepNext()
  ├ legacy path: [data-anim-trigger="click"] pending steps       unchanged
  ├ NEW: slide-level reveal — next unit from SG.motion.steps(sec)
  │      withholding → add .shown (+ .live)
  │      focusing    → move .live only; nothing is ever hidden
  └ returns false when exhausted → navigation proceeds to the next slide
```

**Print / PDF / static capture:** `beforeprint` → `SG.finalizeAnimations()` → `SG.motion.finalize()`
→ same resolved-state rules. Unchanged behavior, one implementation.

## Test plan

**`tests/motion-audit.mjs` (new — this file *is* the Gate 1 metric):**

| test | asserts |
|---|---|
| `every rendered title carries role=title` | 23 of 23 layouts that render an `h1.title` |
| `every list container carries role=list` | 20 of 20 (18 via `data-arr`, 2 via authored `group`→inner lists) |
| `no layout is silent` | 30 of 31 emit ≥1 roled element (`raw` excluded, by name) |
| **`inconsistentElements === 0`** | **the metric: 31 → 0.** Counts elements behaving unlike an identical element elsewhere; fails the build above zero |
| `chrome is never animated` | rails, quote marks, timeline tracks, pagers, progress bars resolve to `chrome` or to no role |
| `stagger indices are unique and monotonic` | 9-item list → 9 distinct increasing `--i`; no duplicates (today: 1,7,8,9 collide) |
| `stagger cap bounds a dense slide` | 40 roled elements → last starts < `--m-cap`, **and all 40 delays still distinct** (a clamp would fail the second half) |
| `motion:off resolves everything` | every roled element at opacity 1, no clip-path, zero animations |
| **`ambient:none no longer strands content`** | **regression test for defect 1** — the exact reproduction from Gate 1, inverted |
| `per-element override wins` | an element with `overrides[k].anim` gets no role animation (no double-animation) |
| `composed sections resolve like their classic callers` | a `stats` section and a classic `stat-grid` produce identical roles |

**`tests/editor-ops.mjs` (additions):**
`cascade: override > slide > deck > builtin` · `migrate v3→v4 sets motion:off for slide ambient:none`
· `…and for defaults.ambient:none` · `F.setMotion is one undo` · `F.setReveal per slide, deck
untouched` · `step units come from the slide's list` · `spotlight marks live without hiding` ·
`split() refuses while .forge-edit is on` · `validate.py accepts/rejects the new enums`.

**`tests/parity.mjs`:** baseline stays at **7**. A change in that number is a real regression.

**Real-test rule:** every audit assertion above fails against today's `master`. The two that must
be written first and watched fail are `inconsistentElements === 0` (31 today) and the defect-1
regression — a test that cannot fail tests nothing.

## Least confident decisions

1. **Two run-flags coexisting.** `.mrun` on the section (new) alongside per-element `.sg-onenter`
   → `.run` (legacy). It is the smallest change that keeps per-element overrides working, but two
   mechanisms for "has entered" is a smell, and replay granularity differs between them. The
   alternative — migrating the legacy path onto `.mrun` — is cleaner but touches the override
   system, which is well-tested and load-bearing. **I chose compatibility over cleanliness; worth
   challenging now.**
2. ~~**Monotonic `--i` across the whole section.**~~ **RESOLVED** (user, at Gate 3: "add a cap on
   the stagger delay"). Step *compression*, not clamping — `--m-step-eff: min(--m-step,
   --m-cap / --m-span)`. Measured in a browser before adopting, because dividing a time by a
   unitless custom property is exactly the kind of CSS that silently resolves to `initial`:

   | elements @ standard | 3 | 8 | 12 | 20 | 40 |
   |---|---|---|---|---|---|
   | effective step | .08s | .08s | .075s | .045s | .0225s |
   | last element starts | .16s | .56s | .825s | .855s | .877s |

   The cap engages only past ~12 elements, so sparse slides are untouched; each preset keeps its
   character (expressive@20 → 1.14s, calm@20 → .57s); and **every delay stays distinct and
   monotonic at every density**, so the audit's uniqueness assertion still holds. A clamp would
   have failed that assertion.
3. **`defaults.motion` defaults to `standard`.** Every *regenerated* deck therefore looks different
   from one generated last week (the 15 silent layouts light up). Delivered `.html` files are
   frozen and unaffected, so nothing breaks — but it is a visible change of house style, chosen
   deliberately because "consistent" is the entire point.
4. **Typewriter/word spans in present mode only.** The editor then shows an unsplit rendering while
   present mode shows a split one — a preview-fidelity gap. The alternative (splitting in the
   editor too) risks the `contenteditable` commit path writing span markup back into content,
   which would corrupt the deck JSON. **Fidelity gap accepted over corruption risk.**
5. **`group` role for `.cmp` / `.bna`.** Two panels arriving together, not a list. Correct-feeling,
   but it is the one place I am inventing a role rather than reading one the layouts already
   author — and it is exactly 2 elements. It could equally be `list` with 2 children.
6. **`FIELD_ROLE` maps `head`→`title` and `accent`→`title`.** Both are judgement calls on fields
   that appear inside items (`columns[].head`) rather than at slide level, so they inherit a
   title's motion inside a staggering list. Cheap to change; easy to get subtly wrong.
