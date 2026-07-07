# Design Critique: slide-forge (deck + in-file editor)

> Reviewed 2026-07-06 against `src/` at `50e0189`. Scope: architecture and editing UX of the
> generated `.html` deliverable, plus a strategic option analysis for a "full application"
> successor. Companion to `slides-editor-plan.md` — treat this as review input for a future §10.

---

## Overall Impression

This is an unusually disciplined piece of engineering for a single-file app: a data-driven
engine with an *additive* editor whose empty state renders byte-identically to a plain deck,
snapshot undo, smart guides, multi-select, groups, masters, brand kits, build steps, and a
speaker view — in ~235 KB with zero dependencies and a reproducible build (verified: rebuild
matches the shipped template, hash `ebe66b7944`). The biggest opportunity is no longer polish:
the editor has reached the ceiling of its two load-bearing compromises — **string-template
layouts with post-render identity tagging** and **whole-deck re-render on every keystroke**.
Every remaining feature gap (true resize/reflow, deep nested editing, images/shapes as first-class
objects, robust override attachment) traces back to one of those two.

---

## Usability

| Finding | Severity | Recommendation |
|---------|----------|----------------|
| `renderLive()` re-renders the **entire deck** on every keystroke/slider tick (`SG.render` rebuilds all slides' `innerHTML`, then `decorate()` re-walks everything). Fine at 11 slides; will visibly lag at 40+ slides or with charts on many slides, and it destroys/recreates DOM the user is mid-interaction with. | 🔴 Critical (scaling) | Implement the targeted per-slide re-render the plan already promised (§3.3): re-render only `slides[i]`'s `<section>`, full render only on structural change. The engine is already re-entrant; this is a contained change. |
| **Resize = `scale()` only.** Dragging a corner scales the block (text included), it never changes the box's width/height, so text doesn't rewrap. Users coming from PowerPoint/Figma expect reflow; scaling headlines produces blurry-feeling, off-grid type. Free `box`/`html` objects have `w/h` but template blocks don't. | 🔴 Critical (expectation gap) | Add `w`/`h` to the override channel: apply as `width/height` + `transform: translate` on the block, keep `scale` as an explicit secondary control. This is the single highest-leverage editing upgrade available without a re-architecture. |
| **Positional identity detaches overrides.** `data-el` keys (`b0`, `b0.1`) are index-derived. Adding/removing a content item shifts siblings' keys, silently re-attaching styling/geometry to the wrong element. Plan §6 called for orphan-override GC with a warning; it was never implemented. | 🟡 Moderate | On structural content edits, diff old/new key sets and either remap (same block count) or drop orphans with a toast + undo. Longer term: content-hash or authored keys (see New Direction). |
| **Undo-stack flooding from continuous inputs.** Color inputs call `F.pushUndo()` on every `input` event — one picker drag can emit dozens of snapshots, evicting real history (stack cap 80). The float-bar color, inspector color/accent/surface, and theme token inputs all do this. | 🟡 Moderate | Push one undo snapshot on the first `input` after `focus`/`pointerdown` (the pattern `boundText` already uses), commit on `change`. |
| **Text write-back is value-matched, not path-matched.** `endEdit` finds the content field by searching for a string equal to the old text. Two fields with the same value (common: multiple `""` empty fields, repeated labels like "Label") → ambiguity → silently falls back to an `overrides[key].html` shadow, which then goes stale if content is edited in the sidebar. | 🟡 Moderate | Record the content path at decorate-time (you know which field produced which node in most layouts) or at least surface "edited as override — detached from sidebar field" in the inspector. |
| Nested identity stops at `depth<2`, and `keyableChildren` skips empty-text elements — some visual elements (icons, bars, orbs) can never be selected or styled. | 🟡 Moderate | Acceptable v1 boundary, but document it; consider tagging non-text leaves with keys too so recolor/hide works on them. |
| **No touch path.** Right-click menu, hover tools, and `Alt`/`Shift` modifiers have no touch equivalents; the panels assume desktop width. The single-file deck will get opened on iPads. | 🟡 Moderate | Long-press → context menu, larger handles, collapse panels below ~900px. Or explicitly declare desktop-only in the delivered "what to tell the user" copy. |
| `prompt()` for "Save as layout" naming; `alert()` for popup-block and import errors — jarring against otherwise custom chrome. | 🟢 Minor | Small inline name field / toast in the existing chrome style. |
| Build stamp embeds the build date, so byte-identical rebuilds differ by one comment line — noise in git and in "is the template in sync?" checks. | 🟢 Minor | Stamp hash only (hash already excludes the stamp line — good), or add a real `--check` flag to `build.py`. |

---

## Visual Hierarchy (of the editor UI itself)

- **What draws the eye first:** the selected element's outline + floating toolbar — correct; the
  strongest signal sits on the object being edited, and the `.forge-live` pulse tying sidebar
  fields to the canvas is a genuinely good invention.
- **Reading flow:** canvas → floating bar → right inspector works. The inspector, however, is
  becoming a long single scroll (Content → Elements tree → Slide → Deck → Brand) — at ~6 sections
  it needs collapsible headers or tabs before more features land.
- **Emphasis miss:** "Save .html" is the single most important action for data safety (autosave is
  best-effort on `file://`) yet is visually one button among nine in the top bar. Give it stronger
  affordance and a dirty-state indicator ("unsaved changes" dot).

---

## Consistency

| Element | Issue | Recommendation |
|---------|-------|----------------|
| Docs vs. code | `Skills/CLAUDE.md` says double-click was *removed* in favor of right-click (§ recent work), but `editor.js` restored dblclick as the primary path (with the context menu kept). The Esc-commits bug CLAUDE.md flags is fixed (Esc now cancels, Enter commits). `README.md` still documents only the old Slides skill. | The code moved; the memory files didn't. Reconcile CLAUDE.md's "recent work" section and README — stale-context files actively mislead future sessions, which is this workspace's whole workflow. |
| SKILL.md | "What to tell the user" contains **two adjacent "Saving:" bullets** with overlapping, partially contradictory copy (in-place save vs. always-downloads). | Merge into one bullet: Chrome/Edge = in-place after first pick; others = download. |
| Duplicate semantics | `Ctrl+D` on a nested item duplicates *in layout*; on a block it creates a *free deep copy*; the context menu labels differ ("Duplicate item (in layout)" vs "Duplicate as free copy (deep)"). Defensible design, but the shortcut gives no hint which one you'll get. | Keep behavior, add the distinction to the `?` shortcuts overlay and hints card. |
| Theme sources | Themes exist in three places: `references/themes.md` (11 palettes, authoritative for generation), `F.themes` in editor.js (11 embedded), and the `:root` block. Palette drift between the .md and the JS copy is unchecked. | Generate `F.themes` from a single source at build time (build.py already does marker substitution — add a `%THEMES%` marker). |

---

## Accessibility

- **Canvas editing is pointer-only.** Selection via keyboard doesn't exist (arrows nudge but can't
  *choose* an element); the Elements tree is the de-facto keyboard path — make its rows real
  buttons with focus styles and you're 80% there.
- **Modals don't trap focus** (structure editor, hints, shortcuts) and lack `role="dialog"`/`aria-modal`.
- **Chrome contrast** is likely fine (light-on-dark panels) but unverified; the pink guide lines and
  the `.forge-live` pulse are color-only signals.
- Slide sections carry good `role="group"`/`aria-label`s; editor buttons mostly have
  `aria-label` — better than typical for a side project, still short of an audit. Run
  `/design:accessibility-review` on the editor chrome once the UI settles.

---

## What Works Well

- **The additive-overrides contract** — a deck with no edits renders byte-identically; every editor
  feature is layered, reversible ("Reset element"), and serializes to two optional JSON keys. This
  is the architectural idea worth keeping in *any* successor.
- **Save = re-serialize into a clone of the document** plus File System Access API in-place save
  with graceful download fallback — the "file edits itself" thesis is genuinely delivered.
- **Container↔content-array mapping** (`arrayForContainer`) — inferring "this DOM container is that
  content array" by length-matching, and refusing on ambiguity, gives type-correct add/duplicate/
  remove of layout items with zero per-layout code. Clever and honest about its limits.
- **Snapshot undo** — trivially correct, and the right call at this deck size (§8.2.4 was a good
  reversal of the fancier plan).
- **Reproducible modular build** — `src/` modules + marker substitution keeps the single-file
  deliverable while making the tool developable; verified in sync with the shipped template.
- The **speaker view driven entirely from the opener window** (no scripts in the popup) is an
  elegant `file://`-safe design.
- Restraint: vanilla JS, zero deps, 63 KB gzipped, a written size budget, and an ADR-style plan
  document that records *reversals* — rare hygiene.

---

## A New Direction: what "a full application" should actually change

The request was for a fresh perspective on a full-fledged app with more advanced, complete
editing. The honest analysis: **the single-file constraint is not the ceiling — the rendering
model is.** Three options, in increasing ambition:

### Option A — Keep the architecture, pay the debt (weeks)
Targeted re-render, `w/h` resize, undo coalescing, orphan-override GC, touch pass, inspector
tabs. This gets slide-forge to "great single-file editor" and is worth doing regardless, because
the generated files already in the wild live forever.

### Option B — Node-tree layouts: the real unlock (the recommended "new perspective")
Replace `layout(content) → innerHTML string` with `layout(content) → node tree`:

```js
// today                              // proposed
L.agenda = c => '<div class="ag">…'   L.agenda = c => N('div.agenda-grid',
                                        c.items.map((it,i) => N('div.ag-item', {key:'items.'+i, bind:'items.'+i}, [
                                          N('div.ag-num', pad(i+1)),
                                          N('h3', {bind:'items.'+i+'.title'}, rich(it.title)) ])))
```

One tiny builder (`N()` ≈ 30 lines, still zero-dep, still one file) and a mechanical rewrite of
25 layouts buys, all at once:

- **Authored, stable identity** — keys come from content paths, not DOM position. Overrides never
  detach; the `decorate()` pass, the depth-2 limit, and the `keyableChildren` heuristics all disappear.
- **Path-bound text editing** — every text node knows its `content` path (`bind`), so on-canvas
  edits write back to data deterministically. The `findContentField` value-matching hack and the
  `overrides[key].html` shadow channel (the current model's most fragile part) are deleted.
- **True geometry** — nodes can expose declared resize behavior (reflow vs scale), enabling real
  `w/h` editing per element type.
- **Cheap targeted re-render** — re-render one node subtree, not a slide, not the deck.
- The container↔array mapping becomes explicit (`bind` on the container) instead of inferred.

This is a rewrite of the layout registry, not the product: JSON schema, themes, animations,
editor chrome, save path, and — critically — **all existing decks stay valid**, because `content`
is unchanged and `overrides` keys can be migrated (`b0.1` → authored key) by a one-time
`SG.migrate` v3 pass. This is what "complete editing features" actually requires; everything in
Option A is still a workaround without it.

### Option C — Split app + emitter (only if requirements truly outgrow the file)
A local PWA/Tauri "Forge Studio" that edits deck JSON with the full editor, and *emits* the
self-contained HTML (viewer + light editor) as its export. Pros: unlimited editor budget (font
embedding, image editing, PPTX export via a JS pptx writer, multi-deck projects, live
collaboration someday). Cons: it breaks the thesis — the deck stops being the app — and creates
version skew between studio and emitted files, the exact trap §5.2 already rejected. **Don't do
this for editing power; Option B gets you the power inside the file.** Reserve C for genuinely
out-of-file needs: asset libraries, team template governance, PPTX round-tripping.

### Verdict
A now; B as the v3 architecture (it preserves everything users love about the file while removing
all four structural hacks); C only when a requirement literally cannot live in one file. Record
the decision in `slides-editor-plan.md` §10 before adding more editor features — every feature
built on positional identity increases the migration cost of B.

---

## Priority Recommendations

1. **Stop the silent data damage first** — undo-stack flooding (color inputs) and override
   detachment on item add/remove. Both are quiet correctness bugs in an editor whose pitch is
   "hand the file to someone to edit."
2. **Ship `w/h` resize with text reflow** — the largest gap between user expectation and behavior,
   and it's implementable in the current override channel today.
3. **Decide A→B formally** — write the §10 ADR: node-tree layouts with authored keys as the v3
   engine, with an `overrides` key-migration path. Defer new editor surface area until decided.
4. **Reconcile the memory files** (CLAUDE.md recent-work section, README, duplicate SKILL.md
   save bullets) — in a Claude-driven workflow, stale docs are stale *instructions*.
5. **Targeted per-slide re-render** — prerequisite for bigger decks either way.
