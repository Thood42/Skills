# Status: slide-forge v3.6 — motion overhaul

- Gate 1 — Product: **APPROVED 2026-08-15** (with one amendment, folded in — see below)
- Gate 2 — Architecture: **APPROVED 2026-08-15** (2 decisions taken by the user — see below)
- Gate 3 — Program Design: **APPROVED 2026-08-15** (1 decision taken by the user — see below)
- Gate 4 — Slice plan: **APPROVED 2026-08-16** (user directed implementation to begin)

## Decisions taken by the user
- **2026-08-15, Gate 2:** size budget → **500 KB** (`scripts/build.py` `BUDGET`), not the 480 KB
  recommended. Leaves ~50 KB of real headroom instead of a cliff at 444 KB.
- **2026-08-15, Gate 2:** extend `tests/parity.mjs` `norm()`'s ignore list for the new motion
  attributes; parity baseline stays **7** and `tests/motion-audit.mjs` asserts what parity stops
  seeing.
- **2026-08-15, Gate 3:** add a **stagger cap**. Implemented as step COMPRESSION, not clamping:
  `--m-step-eff: min(--m-step, --m-cap / --m-span)`, with `--m-cap` per preset (calm .6s,
  standard .9s, expressive 1.2s) and `tag()` supplying `--m-span`. Verified in a browser before
  adopting — the cap engages only past ~12 elements, and **every delay stays distinct and
  monotonic at every density** (40 elements → last starts .877s, 40 distinct delays). A clamp
  would have piled late elements onto the ceiling and re-created the collision this feature fixes.

## Slices
- [ ] Slice 1 — tracer: one role end to end; the 6 never-animated lists stagger
- [ ] Slice 2 — full role vocabulary + cascade + 4 presets + stagger cap → **metric 31 → 0**
- [ ] Slice 3 — real "off": shared resolved-state block, narrowed ambient, migration v3→v4
- [ ] Slice 4 — build steps + appear/wipe/spotlight
- [ ] Slice 5 — typewriter + word-by-word (`split()`, present-mode only)
- [ ] Slice 6 — editor surface (`F.setMotion`/`F.setReveal`, deck + slide controls)
- [ ] Slice 7 — generation surface: `references/motion.md`, SKILL.md, rack test

## Notes for a fresh session

**The ask (2026-08-15, user):** overhaul the animation mechanism *for the generation tool* in a
3.6 update. Stated complaint: "the animations are not consistent with each element type and
layouts." Review current state first, then propose upgrades.

**Predecessor:** `docs/plans/slide-forge-composer/` — v3.5, all 7 slices complete (composition
core, deck personality, preset gallery). Read its `00-status.md` before touching sections/layouts;
its sizing semantics and font-precedence notes are load-bearing and must not be re-litigated.

### Measured baseline (2026-08-15, real browser at localhost:8901, not grep)

Method: lift every rule out of `@media (prefers-reduced-motion: no-preference)` and re-insert it
unconditionally (the preview browser reports reduced motion), then call each `SG.layouts[name]`
with generic content and inspect the emitted tree. Repeatable — see `01-product.md` §Evidence.

| measure | today |
|---|---|
| layouts emitting **zero** entrance motion | **15 of 31** (code, pipeline, manifesto, image, gallery, diagram, embed, diptych, before-after, stat-grid, comparison, timeline, bignum, media-split, raw) |
| `h1.title` elements that animate | **2 of 23** layouts that render one (only `cover`, `divider`) |
| list containers that stagger in | **10 of 20** |
| **inconsistent elements** (behave unlike an identical element elsewhere) | **31** = 21 silent titles + 10 silent list containers |
| distinct animation systems in the file | **4** (`sg-*` entrance library, 13 always-on decorative loops in deck.css, 10 `amb-*` ambients, chart enter animations) |
| motion channels the generation tool is *told* it has | **2** (`ambient`, `count`) |

### Two confirmed defects (both reproduced, not inferred)

1. **`ambient:"none"` makes content permanently invisible on screen.** `engine.css:338` is
   `.slide[data-ambient="none"] *{animation:none !important}`, but the entrance base states
   (`.sg-fade-rise{opacity:0}`, `.sg-reveal-wipe{clip-path:inset(0 100% 0 0)}`) live outside that
   rule. Killing the animation strands the element at its hidden base. Measured on a `cover` slide:
   `ambient:"auto"` → 1 animation, opacity settles at **1**; `ambient:"none"` → **0 animations,
   opacity stays 0 forever**. `references/layouts.md:272` actively recommends this value, and
   `defaults.ambient:"none"` applies it deck-wide. Print/PDF is **not** affected — the `@media print`
   block carries explicit `opacity:1 !important` / `clip-path:none !important` overrides
   (`engine.css:330-331`). Screen only, which is the presenting path.
2. **Stagger breaks at 7+ children.** `.sg-stagger.run>*` enumerates delays only to `nth-child(6)`.
   Measured on a 9-item agenda: children **1, 7, 8, 9 all fire at delay 0s**, then 2–6 trail.

### Gate 1 amendment (user, at approval): reveal STYLE is a first-class choice
"Add some consideration for editing the step-through defaults to allow for the different style of
revealing or showing the text." Folded into `01-product.md` (problem #4, announcement, metric row,
mockup 3). The settled product shape: **stepping and arrival are two separate decisions.** Five
styles — appear / wipe / typewriter / word-by-word / **spotlight** — and the choice cascades
**deck default → slide → element**, deliberately the same cascade shape as the motion dial so
there is one mental model, not two. Spotlight is the odd one out and the reason the amendment
matters: it hides nothing, keeping the whole list on the slide while the focus moves, so it is
also the only style that never withholds text from someone reading ahead.

### Gate 1 mockups — written AND verified in a browser (2026-08-15)
`mockups/01-audit.html` reproduces defect 1 faithfully (motion on → 1 animation, opacity settles at
`1`; quieted → **0 animations, opacity `0`**). `mockups/02-motion-roles.html` demonstrates the
proposal: four presets resolve from one rule set (calm .45s/10px, standard .7s/26px, expressive
.95s/46px, off → `animation:none` **with every element at opacity 1**), and a nine-item list
staggers `0s → 0.64s`, strictly increasing, **zero duplicate delays**.
`mockups/03-build-steps.html` (revised for the amendment) advances one point per click and
resets; all five reveal styles verified — stepping is **identical across all five**, the four
withholding styles hold the upcoming line at opacity `0`, and **spotlight holds every line at
`0.26` with the focused one at `1.0`** (focus singular, focus brightest). With motion off, all
five leave every line, word and character at opacity `1`.
- **Test trap worth remembering:** the Browser pane here is hidden, so CSS animations never
  advance and `transition`s are caught mid-flight. Reading `getComputedStyle` right after a class
  change gives the *from* state and looks like a bug. Finish animations explicitly
  (`el.getAnimations().forEach(a => a.finish())`) and let transitions settle (`setTimeout` — `rAF`
  never fires in a hidden tab) before asserting. This produced one false "spotlight hides content"
  reading that was purely the measurement.
Screenshots were unavailable this session (Browser pane not compositing, same as the composer
session) — the proof above is measured values, not an image.

### Gate 2 measurement — the architecture's load-bearing bet, proven before designing on it
Roles are DERIVED from what layouts already author, not inferred positionally (which the v3 ADR
forbids) and not hand-authored 31 times. Measured across all 31 layouts:
**18 of 20 list containers already carry `data-arr`** → role `list` costs zero layout edits,
including all six currently-silent ones. The 2 misses (`.cmp`, `.bna`) are not lists but two-panel
wrappers → role `group`, authored explicitly (2 edits, semantically correct). `data-bind`'s last
segment is a closed set of ~20 field names → a field→role table covers the text roles.

### Constraints carried in
- Built template is **444 KB raw / 129 KB gzipped against a 450 KB budget** (`scripts/build.py`) —
  ~6 KB headroom. (The 450.9 KB on-disk figure is CRLF expansion; the budget measures the build.)
- `tests/parity.mjs` baseline is **7 cosmetic diffs**. Any change to what layouts emit moves this
  number by design — decide deliberately at Gate 2, don't "fix" it silently.
- Node 26 + Python 3.13 available; run node from the **PowerShell** tool, not Bash.
