# Vertical slices: slide-forge v3.6 — motion overhaul

Build order. Each slice ends in a working, browser-verifiable deck — never "all the CSS, then all
the JS, then the editor". After every slice: prove it in a real browser, run the Node suites, tick
`00-status.md`, and re-steer if the trajectory is wrong.

**Running guards, every slice:** `parity.mjs` stays at the **7-diff baseline** · `editor-ops.mjs`
stays green · `build.py --check` clean and under the new **500 KB** budget · present mode for a deck
with no motion keys must still render (the additive guarantee).

---

**Slice 1 — tracer bullet: one role, end to end, and the 6 silent lists light up.**
`SG.motion` module skeleton with a *hardcoded* `resolve()` (always `standard`); `N()` gains the
explicit `role:` → `data-role` branch; `tag()` handles only `[data-arr]` → `role="list"` plus `--i`
and `--m-span`; `activate()` adds `.mrun` to the section; **one** CSS rule staggers list children.
Ship the budget bump and the `parity.mjs` ignore-list extension here so the build stays green from
the first commit. `tests/motion-audit.mjs` is created with the list assertions — **written first,
watched fail on `master`, then made pass.**
*Proves:* `stat-grid`, `comparison`, `timeline`, `media-split`, `before-after` and `pipeline` — six
layouts that have never had entrance motion — now stagger, with no layout function touched.

**Slice 2 — the full role vocabulary, the cascade, and the dial.**
`FIELD_ROLE` + `CLASS_ROLE` tables; the ~8 authored `role:` additions (figure/number/chrome/`group`);
the real `resolve()` reading `defaults.motion` → `slide.motion` → built-in; all four presets in CSS
including `--m-cap` compression; `:not([data-anim])` precedence so per-element overrides still win.
*Proves:* **the Gate 1 metric — `inconsistentElements` 31 → 0.** All 23 titles animate alike; all 20
list containers stagger; a dense 40-element slide finishes inside the cap with distinct delays.

**Slice 3 — a real "off", and the disappearing-content bug dies.**
Extract print's resolved-state rules into one shared block with four callers (print, `motion:"off"`,
reduced-motion, static capture); narrow `.slide[data-ambient="none"]` to `.amb` + `[data-decor]`;
tag the 13 decorative loops; `SG.migrate` v3→v4 preserving `ambient:"none"` intent as `motion:"off"`.
*Proves:* the exact Gate 1 reproduction, inverted — `ambient:"none"` keeps content on screen, and
`motion:"off"` leaves every element resolved with zero animations. Regression test locked in.

**Slice 4 — build steps and the three reveal styles that need no markup surgery.**
Slide-level `reveal`; `SG.motion.steps()`; `stepNext()` extended for slide-level units; the
withholding/focusing split with `appear`, `wipe`, `spotlight`.
*Proves:* a generated slide reveals point by point on →/Space/click; spotlight moves focus while
hiding nothing; stepping is identical across styles; with `motion:"off"` every point is present
from the start.

**Slice 5 — typewriter and word-by-word.**
`SG.motion.split()` with the present-mode-only guard. Isolated deliberately: this is the one change
that touches the inside of `data-bind` leaves, where the editor's `contenteditable` commit path
could write span markup back into deck JSON.
*Proves:* both styles type/land correctly in present mode, spans are rebuilt from content on every
render and never persisted, and `split()` refuses while `.forge-edit` is on — asserted, not assumed.

**Slice 6 — the editor surface.**
`F.setMotion` / `F.setReveal` (one `F.do` = one undo, mirroring `F.setPersonality`); Motion + Reveal
controls in `deckSettings` and beside the existing Ambient select in `slidePanel`; the resolved
cascade shown in the existing "Animations on this slide" overview.
*Proves:* deck default and per-slide override round-trip through save/reload, one undo restores,
and a downloaded `.html` carries the settings with no editor chrome.

**Slice 7 — the generation surface (the actual deliverable).**
`references/motion.md` (new); motion sections in `SKILL.md`, `layouts.md`, `editor.md`; the
`ambient` entry rewritten now that it means background-only. Ends with a **rack test**: generate a
deck from a realistic brief and score whether the motion reads as deliberate.
*Proves:* Claude, given only the skill docs, writes `defaults.motion` / `slide.reveal` correctly and
stops reaching for `ambient:"none"` to mean "calm". Docs-only by design — no code, so nothing can
regress while the reference is written.

---

## Notes on sequencing

- **Slice 1 is a true tracer:** thin, end-to-end (data → resolver → DOM pass → CSS → visible
  motion), and it already delivers a real chunk of the metric. It is not scaffolding.
- **Slices 3, 4 and 5 are separable risks** — the bug fix, the stepping engine, and the markup
  surgery each fail in different ways and should not share a commit.
- **Slice 7 is docs-only on purpose**, exactly as the composer plan's slice 7 was: the last slice
  carries no regression risk, and the reference gets written while the behavior is fresh.
- Slices 4–5 are the amendment the user added at Gate 1; if the trajectory needs cutting, they are
  the natural pause point — slices 1–3 alone already close the metric and kill the bug.
