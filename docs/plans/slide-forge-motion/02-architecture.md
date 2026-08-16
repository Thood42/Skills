# Architecture: slide-forge v3.6 — motion overhaul

## Fit

Four uncoordinated motion systems exist today. v3.6 keeps all four but puts **one resolver** in
front of them, and moves the vocabulary from JS class-strings into CSS.

| system | where | today | after |
|---|---|---|---|
| `sg-*` entrance library | `src/anim.css` + `src/anim.js` | 5 entrance effects, applied by class strings **hardcoded in 13 layout functions** | library stays; the hardcoded strings stop being the mechanism (they remain valid as per-element overrides) |
| decorative loops | `src/deck.css` | 13 always-on infinite animations on layout-internal classes, unaddressable | tagged as decor so a real "off" can silence them; per-preset tuning deferred |
| ambients | `src/engine.css` | 10 `amb-*` background layers, slide-level, addressable | unchanged **except** its kill-switch stops reaching element motion (defect 1) |
| chart entrance | `src/charts.js` + `engine.css` | already correct — wrapper carries `.chart-anim.sg-onenter` | unchanged; becomes the model the rest follows |

**The load-bearing decision: roles are DERIVED from what layouts already author, not inferred
positionally and not hand-authored 31 times.**

The v3 ADR says identity is authored, and the composer work reinforced it — so a selector-guessing
pass would be a regression. But layouts *already* declare the two things that matter, and this was
measured, not assumed:

- **`data-arr` marks a container that renders an array. 18 of the 20 list containers in the
  codebase already carry it** — including every one of the six that currently has no motion
  (`stat-grid`, `comparison`'s inner lists, `timeline`, `media-split` bullets, `before-after`,
  `pipeline`). Role `list` therefore costs **zero layout edits**.
- The 2 that don't carry it — `.cmp` and `.bna` — are not lists. They are two-panel wrappers
  holding `left`/`right`, so they are a different role (`group`) and get it authored explicitly.
  Two edits, and they are semantically correct edits rather than papering over a gap.
- **`data-bind`'s last path segment names the field**, and the field names are a small closed set
  (`title`, `kicker`, `subtitle`, `sub`, `lead`, `body`, `head`, `desc`, `quote`, `by`, `label`,
  `note`, `caption`, `value`, `year`, `tag`, `name`, `statement`, `index`, `accent`). A field→role
  table turns those into `title` / `kicker` / `lead` / `body` / `meta`.

So the resolver reads authored semantics. The only genuinely new authoring is a `role:` on a
handful of nodes the existing attributes can't speak for (figures, numbers, chrome).

Files touched: `src/anim.css` (motion vocabulary), `src/anim.js` (role pass + step engine),
`src/engine.css` (narrow the ambient kill-switch, share the resolved-state rules), `src/engine.js`
(migration, defaults plumbing), `src/sections.js` + `src/engine.js` layouts (≈8 `role:` additions),
`src/editor.js` (deck/slide motion + reveal controls), `scripts/validate.py`, `tests/`.

## Endpoints

None — the deliverable is a single offline HTML file. The equivalent surface is the **deck JSON
contract** (below) and the **`SG` runtime API**:

| call | purpose |
|---|---|
| `SG.motion.resolve(slide)` | preset + reveal style for a slide, after the deck→slide cascade |
| `SG.motion.tag(sec)` | one pass over a rendered section: assign `data-role`, `--i` stagger indices |
| `SG.motion.finalize(scope)` | resolve every entrance element to its finished state (replaces + generalizes today's `SG.finalizeAnimations`) |
| `SG.stepNext()` | **existing**, extended: handles slide-level reveals and the focusing/withholding split |

## Data

All additive. No existing key changes meaning except `ambient`, which is narrowed (see Migration).

```jsonc
{
  "defaults": {
    "ambient": "auto",                    // unchanged — BACKGROUND layer only, from now on
    "motion":  "standard",                // NEW: calm | standard | expressive | off
    "reveal":  { "style": "appear" }      // NEW: appear|wipe|typewriter|words|spotlight
  },
  "slides": [{
    "motion": "calm",                     // NEW: per-slide override of defaults.motion
    "reveal": { "style": "spotlight",     // NEW: per-slide override; omit = inherit
                "unit": "item" },         //      item (default) | block
    "overrides": {
      "stats.2": { "anim": "reveal-wipe", "animDelay": 0.2 }   // UNCHANGED, still wins over everything
    }
  }]
}
```

**Precedence, one direction only:** `overrides[key].anim` (an explicit per-element choice) →
`slide.motion` / `slide.reveal` → `defaults.*` → built-in `standard`. The per-element channel
already exists and is already validated; v3.6 adds the two layers above it, so no existing deck's
per-element intent is overridden by the new defaults.

**Role vocabulary** (the closed set the CSS is written against):
`title`, `kicker`, `lead`, `body`, `meta`, `list`, `group`, `figure`, `number`, `quote`, `chrome`.
`chrome` is the important one — rails, quote marks, timeline tracks, pagers and progress bars are
matched explicitly and **never** entrance-animated.

**Preset = four numbers.** Each preset is a set of CSS custom properties, nothing more, which is
what makes drift impossible: every role reads the same four values.

| preset | `--m-dur` | `--m-dist` | `--m-step` | decor loops |
|---|---|---|---|---|
| calm | .45s | 10px | .05s | off |
| standard | .7s | 26px | .08s | on |
| expressive | .95s | 46px | .13s | on |
| off | — | — | — | off |

(Values are the mockup's, already judged in a browser at Gate 1.)

## Flow

**Render path** — one new pass, sited exactly where entrance wiring already happens:

```
SG.render(deck, data)
  └ buildSection(slide, i)                      unchanged — layouts emit their node trees
  └ SG.motion.tag(sec)                          NEW, per section:
      ├ resolve role for each element:
      │    authored `data-role`  →  wins
      │    [data-arr]            →  list
      │    [data-bind] field     →  FIELD_ROLE table
      │    class/tag table       →  figure | number | chrome
      ├ set --i on each child of a [data-role="list"]   (unbounded stagger — the nth-child
      │                                                  ceiling at 6 disappears)
      └ stamp data-motion / data-reveal on the <section> from the resolved cascade
  └ SG.wireAnims(deck)                          unchanged — .active observers add/remove .run
```

CSS then does the work: `[data-motion="calm"] .run [data-role="title"] { … }`. **JS never picks an
animation.** That is the whole reason consistency becomes structural rather than maintained.

**The "resolve to finished state" path — one rule set, four callers.** The correct rules already
exist and are already proven: `engine.css:330-331` inside `@media print` resolves every entrance
state (`opacity:1`, `clip-path:none`, `stroke-dashoffset:0`, typewriter width). Today only print
uses them, which is precisely why defect 1 exists — `ambient:"none"` killed the animation without
them. v3.6 extracts them to a shared selector consumed by:

1. `@media print` (unchanged behavior),
2. `[data-motion="off"]`,
3. `@media (prefers-reduced-motion: reduce)`,
4. `SG.static` capture.

**Defect 1's actual fix** is then one narrowed selector:

```css
/* was: .slide[data-ambient="none"] *  { animation:none !important }   ← reached element motion */
.slide[data-ambient="none"] .amb,
.slide[data-ambient="none"] [data-decor] { animation:none !important }
```

`ambient` goes back to meaning *background layer*; `motion` means *element motion*. Orthogonal.

**Step path** — `SG.stepNext()` already exists and is already bound to →/Space/click. Two changes:

- Steps can come from a **slide-level** `reveal` (the children of the slide's list), not only from
  per-element `animTrigger:"click"` authoring. `defaults.buildSteps` stays as the legacy switch.
- Reveal styles split in two, and the split is the contract:
  **withholding** (`appear`/`wipe`/`typewriter`/`words`) hides what's next;
  **focusing** (`spotlight`) hides nothing and moves a `.live` marker.
  Both advance identically — verified across all five in the Gate 1 mockup.

`typewriter` and `words` need per-character/per-word spans. **Built lazily, in present mode only,
and never while the editor is active** — wrapping the inside of a `data-bind` leaf would fight the
editor's `contenteditable` commit path, which writes the element's text back to the content field.
Spans are rebuilt from content on each render, so they are never persisted.

## External

None. No new network dependency; the offline guarantee is untouched (Google Fonts remains the only
external touch, unchanged). Motion is CSS + a small DOM pass.

---

## Decisions that need recording

**1. Parity baseline moves — deliberately.** `tests/parity.mjs` compares tag / sorted classes /
attributes, ignoring only `data-el`, `data-bind`, `data-arr` and `class`. A new `data-role` and a
`style="--i:N"` would therefore register as a diff on nearly every element and drown the 7-diff
canary. Precedent exists in the file: the doc-panel is already exempted with a comment explaining
that the test's real question is *"did the v3 rewrite keep every layout's rendering faithful to
v2?"*. Motion attributes are equally orthogonal. **Extend the ignore list to `data-role`,
`data-decor`, `data-motion`, `data-reveal` and the `--i` custom property, and keep the baseline at
7.** Nothing is lost: the new `tests/motion-audit.mjs` asserts exactly what parity stops seeing,
and it is the Gate 1 success metric (inconsistent elements → 0), so it fails the build on
regression.

**2. Migration: schemaVersion 3 → 4, one intent-preserving rewrite.** `ambient:"none"` currently
means "silence everything" (destructively). After the narrowing it means "no background layer",
which would leave a deck that asked for quiet suddenly animating. `SG.migrate` therefore rewrites,
once, on load: for `schemaVersion < 4`, any slide with `ambient === "none"` also gets
`motion: "off"`; `defaults.ambient === "none"` also sets `defaults.motion: "off"`. Intent is
preserved and the destructive side effect is dropped.

**3. Delivered decks are frozen artifacts.** A `.html` already on disk carries its own engine and
does not change. v3.6 affects newly generated decks, and deck JSON re-imported into a 3.6 template
(where the migration above applies). This is what makes the Gate 1 promise — "nothing you have
already made changes" — literally true.

**4. Size budget raised to 500 KB — DECIDED (user, at Gate 2 approval).** Build is **444 KB**
against the old 450 KB ceiling (~6 KB headroom); this work is ~5.5 KB (motion CSS ~2.5, role pass
+ step engine ~2, editor controls ~1.5, less ~0.5 of removed hardcoded class strings), which would
have landed within a rounding error of failing. `BUDGET` in `scripts/build.py` becomes
`500 * 1024`, leaving ~50 KB of genuine headroom rather than a cliff. Gzip (129 KB today) remains
the number that actually governs delivery.

**5. Deferred, explicitly.** Per-preset *tuning* of the 13 decorative loops (v3.6 only gives them
an off switch); motion character per deck personality (`--p-*` tokens make it easy later);
per-element reveal-style overrides below slide level.
