# Feature: software-factory gates with VS Code overlays

## Contents
- Setup
- Condensed protocol (only if software-factory is unavailable)
- Best-practice review at every gate
- Gate 1 overlay — Product
- Gate 2 overlay — Architecture
- Gate 3 overlay — Program Design
- Gate 4 overlay — Vertical slices
- Status file additions

## Setup

1. Load the `software-factory` skill (it may be listed as `anthropic-skills:software-factory`)
   and follow its protocol, file layout (`docs/plans/<feature-slug>/`), approval question and
   resume rule exactly. This file only adds VS Code content to each gate.
2. Read `AGENTS.md` and the newest `docs/reviews/` report so the plan builds on the real repo.
3. Note the starting state: `node scripts/vsx-check.mjs <repo> --gate slice`. Existing
   findings outside the feature's files are not this feature's job; list them in
   `00-status.md` notes and offer Adopt separately.

## Condensed protocol (only if software-factory is unavailable)

Create `docs/plans/<feature-slug>/00-status.md` first (gate states + slice checklist + notes
for a fresh session). For each gate: write the doc → run the best-practice review below →
summarize 5–10 decisions + doc path → ask **"Approve Gate N, or what should change?"** →
anything but a clear yes means revise and re-ask → on approval mark it in `00-status.md`. If
a later gate invalidates an earlier decision, reopen that gate. No implementation code before
the Gate 4 slice plan is approved. At every boundary, make sure the docs hold everything
decided; a fresh session must be able to resume from them.

## Best-practice review at every gate

Before asking for approval at Gates 1–3, review the gate doc against the rubric rules tagged
for that gate (`references/review-rubric.md`, gates `plan-1`, `plan-2`, `plan-3`) and append:

```markdown
## Best-practice review
Verdict: PASS | PASS_WITH_WAIVERS | BLOCKED
| Rule | Result | Note |
| --- | --- | --- |
| UX-J01 | pass | native quick pick; no webview |
Waivers: none
```

BLOCKED means fix the design doc first (or get a user waiver) — a design blocker is cheapest
to fix now. Then ask the software-factory question, with the verdict in the summary:
"Best-practice review: PASS. Approve Gate 2, or what should change?"

Gate 4 slices use the slice gate instead (see below).

## Gate 1 overlay — Product

Still no tech talk. Add these to `01-product.md`:

```markdown
## Where users meet it
<each entry point in user terms: "Command Palette: Part Lookup: Find Part", "right-click a
 file in Explorer", "status bar item", "sidebar view", "Copilot agent can call it",
 "@partlookup in chat">

## Interaction sketch
<for native UI: a text mockup of the quick pick items / tree / notification wording.
 for webviews only: HTML mockups in mockups/ using var(--vscode-*) colours>
```

Success metric for internal tools: something countable — minutes saved per task (timed
before/after on 3 users), weekly active users from feed downloads + an opt-in counter, or
support tickets on the workflow being replaced.

## Gate 2 overlay — Architecture

Replace the web-app sections of `02-architecture.md` with these:

```markdown
## Fit
<features/ folders touched or added; existing platform/ services reused>

## Contribution points
| Kind | ID | Title / when-clause | Notes |
| command | partLookup.findPart | "Find Part", category "Part Lookup" | palette + editor/context |
| setting | partLookup.catalogPath | string, default "parts.json", scope resource | |
| languageModelTool | part_lookup_find_part | — | read-only, no confirmation |

## State and storage
<per item: settings (user intent) | workspaceState/globalState (small, non-secret) |
 context.secrets (credentials) | storageUri/globalStorageUri (files) — plus how stored
 state migrates between versions>

## Flow
<activation event → register → handler → core → result surface, for the main path>

## External
<processes spawned (argument arrays, no shell), network endpoints (HTTPS, proxy-aware),
 auth (vscode.authentication / Entra), language models or MCP servers, env var NAMES>

## Runtime compatibility
<desktop local / remote (SSH, WSL, dev containers) / web; extensionKind if it matters;
 Restricted Mode behaviour (untrustedWorkspaces); virtual workspaces; minimum VS Code
 version this feature needs and whether it raises engines.vscode>

## Activation cost
<what runs at activation; anything >50 ms is deferred until first use>
```

## Gate 3 overlay — Program Design

Additions to `03-program-design.md`:

- **Files** must respect the layers: pure logic in `src/core/`, VS Code calls in
  `src/features/<name>/` or `src/platform/`, shared webview types in `src/shared/`.
- **Manifest diff**: the exact JSON to add to `package.json` `contributes` (and
  `activationEvents` only if a contribution does not imply it). This is the contract the
  slice gate later checks.
- **Types & signatures**: core functions take plain data and return plain data; for webviews,
  the protocol unions and guards; for tools, the input interface next to its `inputSchema`.
- **Disposal plan**: every `register*`/`on*` call and who owns its disposable.
- **Error plan**: what the user sees, what is logged, and (for tools) what the model is told
  to do next.
- **Test plan**: unit tests for core, integration tests for registration and behaviour in the
  Extension Host, web tests if the extension has a `browser` entry. Name each test and what
  it asserts.

## Gate 4 overlay — Vertical slices

- **Slice 1 (tracer bullet)**: contribute the command/view/tool, register it with a stub
  handler returning a hardcoded result, and extend the integration tests so the contribution
  is proven registered and callable. Visible with F5 ("Run Extension"). In the first feature
  of a new repo, Slice 1 also deletes the reference features it replaces.
- **Slice 2**: real core logic for the happy path, unit-tested.
- **Slice 3+**: one capability each — error handling, settings, edge cases, web compatibility,
  polish.

After every slice:

1. Run `node scripts/gate.mjs --gate slice --slug <feature>-s<N> --repo <repo>`.
2. Complete the judgment half (`workflows/review-gates.md`), at least the rules tagged `slice`.
3. Show the user the proof: test names that now pass, the gate verdict, and what to try with
   F5. A slice with verdict BLOCKED or INCOMPLETE is not done.
4. Add a `## [Unreleased]` CHANGELOG line for user-visible changes.
5. Check the slice off in `00-status.md` with the report path, then ask
   "Continue to slice N+1, or re-steer?"

## Status file additions

Extend software-factory's `00-status.md` with review results so a fresh session sees them:

```markdown
- Gate 2 — Architecture: APPROVED 2026-10-03 (best-practice review PASS)
## Slices
- [x] Slice 1 — tracer bullet: findPart stub (slice gate PASS, docs/reviews/2026-10-03-slice-find-part-s1.md)
```
