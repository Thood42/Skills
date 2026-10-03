---
name: building-vscode-extensions
description: "Builds and maintains VS Code extensions to an enterprise maintainability standard: generates a baseline TypeScript repository when none exists (esbuild bundle, enforced layering, unit and Extension Host tests, Azure DevOps pipeline, Azure Artifacts VSIX distribution), plans features through the software-factory gates with VS Code-specific overlays, and runs blocking best-practice review gates backed by a rule checker. Use whenever work touches a VS Code extension: creating one, adding a command, view, setting, webview, language model tool, chat participant or MCP provider, making it run on vscode.dev, reviewing or refactoring extension code, fixing package.json contributes or activation events, raising engines.vscode, updating its dependencies, or packaging and releasing a .vsix, even if the user only says my extension or the VS Code plugin. Not for configuring VS Code itself or recommending extensions to install."
compatibility: Node.js 22+ and npm. Integration tests download VS Code from update.code.visualstudio.com. Feed installs need the Azure CLI with the azure-devops extension.
metadata:
  version: "0.1.0"
---

# Building VS Code extensions

The goal is extensions a team can still change safely in two years. Three mechanisms carry
that, and every workflow below uses them:

1. **Standards enforced by machines, not memory.** ESLint layer rules and `scripts/vsx-check.mjs`
   (vendored into each repo as `tools/vsx-check.mjs`) fail the build on the mistakes that cost
   the most later. Judgment calls go to a rubric, reviewed at gates.
2. **Decisions made before code, at gates.** Features run through the software-factory gates
   (Product → Architecture → Program Design → Vertical Slices) with VS Code overlays, and
   every slice and release passes a best-practice review gate.
3. **Context on disk, not in chat.** `AGENTS.md`, ADRs, `docs/plans/`, and `docs/reviews/`
   let any future session or teammate resume without this conversation.

Paths below are relative to this skill's base directory. Scripts have no dependencies; run
them with Node by full path from the user's repo, e.g. `node <skill-dir>/scripts/gate.mjs`.

## Pick the mode

| Situation | Mode | Read |
| --- | --- | --- |
| Target folder has no extension (no `package.json` with `engines.vscode`) | **Bootstrap** | `workflows/bootstrap.md` |
| Existing extension the user wants brought up to this standard | **Adopt** | `workflows/adopt.md` |
| New capability: manifest + code + tests, several files, ~100+ line diff | **Feature** | `workflows/feature.md` |
| Rename, copy change, default tweak, single-file bug fix | **Fast path** | below |
| "Review", "audit", "is this ready to ship", PR review | **Review** | `workflows/review-gates.md` |
| Version bump, package, publish, distribute, install, rollback | **Release** | `workflows/release.md` |
| Dependency updates, raising `engines.vscode`, health check, updating the vendored checker | **Maintain** | `workflows/maintain.md` |

Chain modes when a request spans them: "create an extension that does X" is Bootstrap, then
Feature for X starting at Gate 1. Never implement X inside the bootstrap. State the mode you
picked in one line so the user can redirect.

If unsure between Feature and Fast path, ask once: "This looks big enough for the gated
workflow — run it, or do you want the fast version?" Respect the answer.

On an existing extension that was not built from this baseline (no `tools/vsx-check.mjs`), run
`node scripts/vsx-check.mjs <repo> --gate slice` once to learn its state before planning. New
code follows the standard; do not refactor untouched code unless the user opts into Adopt.

## Fast path

1. Make the change, following the non-negotiables below.
2. Run `node scripts/gate.mjs --gate slice --slug <short-name> --repo <repo>`.
3. Fix blockers; report the verdict in one line with the report path.

## Gates

| Gate | When | Blocks on |
| --- | --- | --- |
| baseline | after Bootstrap or Adopt | blockers |
| plan-1, plan-2, plan-3 | software-factory Gates 1–3 (design docs, before code) | blockers |
| slice | end of every vertical slice, fast-path change, or PR | blockers |
| release | before tagging `v<version>` | blockers and majors |

Each gate has two halves. The **mechanical half** is `scripts/gate.mjs`: it runs the repo's own
npm scripts (types, lint, unit, integration, web, package) plus `vsx-check`, and writes a
report skeleton to `docs/reviews/`. The **judgment half** applies the rubric rules marked
*judgment* for that gate — by an independent reviewer subagent when subagents are available,
because the author grading their own work misses the most. `workflows/review-gates.md` has
the procedure and the reviewer prompt.

Verdicts: `PASS`, `PASS_WITH_WAIVERS`, `BLOCKED`, `INCOMPLETE` (a step was skipped or could not
run). Policy is block-and-waivable:

- A blocker stops the gate until it is fixed or the **user** waives that specific finding. A
  waiver names the rule, optional path, reason, approver and expiry, and goes in
  `docs/reviews/waivers.json`. Never self-waive, and never propose a waiver without first
  saying what fixing it would take.
- To reach green, fix the code. Do not skip or weaken tests, lower severities, edit the
  checker, or widen a waiver. If a check looks wrong, say so plainly, explain why, and let
  the user decide; a checker bug gets fixed in the skill, not bypassed in the repo.
- `INCOMPLETE` is not a pass. If integration tests could not download VS Code (sandbox, proxy),
  say exactly which steps did not run and that the gate is unverified until they run in CI or
  locally.

## Non-negotiables

These are the rules most expensive to retrofit. The rubric (`references/review-rubric.md`)
has the full set with rationale and fixes.

- **Layers point inward**: `extension.ts` (composition root) → `features/<name>/` → `platform/`
  (VS Code adapters) → `core/` (pure logic, no `vscode`, unit-tested in plain Node).
- **`extension.ts` stays thin**: build services, register `FEATURES`, nothing else.
- **Every command** goes through `registerCommand()` (uniform error boundary + log), is
  contributed with `title` and `category`, and is covered by the "every contributed command is
  registered" integration test.
- **Every disposable** lands in `context.subscriptions`.
- **Settings** have one source of truth (defaults in `package.json`), one prefix, typed reads.
- **I/O** uses `vscode.workspace.fs`; no sync `fs` in shipped code. **Secrets** use
  `context.secrets`, never Memento state or settings.
- **Webviews** render through one HTML builder with CSP `default-src 'none'` and a nonce;
  every message is a typed, validated protocol member. Native UI first; webview last.
- **Activation** comes from contributions; no `"*"`. `onStartupFinished` needs an ADR.
- **`@types/vscode` is pinned exactly to the `engines.vscode` floor**, so the compiler rejects
  APIs the floor lacks; integration tests also run at the floor before release.
- **Tests can fail**: each new test fails against the pre-change code. No `.only`, no `.skip`
  without a waiver.
- **Docs move with code**: `AGENTS.md`, `CHANGELOG.md` `[Unreleased]`, README settings table.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/scaffold.mjs` | Generate the baseline repo from `assets/template/` (`--help` for options; `--dry-run` shows resolved IDs and versions without writing). Never overwrites files. |
| `scripts/gate.mjs` | Mechanical half of a gate + report skeleton. Exit 0 pass, 1 blocked, 3 incomplete. |
| `scripts/vsx-check.mjs` | 55 static rules (IDs match the rubric). `--gate`, `--json`, `--deep` (inspects VSIX contents), `--list-rules`. |
| `scripts/selftest.mjs` | Regression test for this skill (rubric ↔ checker sync, clean scaffolds, one mutation per key rule). Run after changing the template, checker or rubric. |

The scaffold resolves current package versions from the npm registry with compatibility
constraints (TypeScript within typescript-eslint's peer range, mocha matching
`@vscode/test-cli`, `@types/vscode` pinned to the floor) and falls back to
`assets/versions.json` when offline.

## References

Read only what the current step needs.

| File | Read when |
| --- | --- |
| `references/architecture.md` | Designing or reviewing code structure: layers, feature modules, errors, disposables, state, I/O, activation cost |
| `references/manifest.md` | Editing `package.json`: contributes, activation, engines, capabilities, l10n |
| `references/testing.md` | Writing tests, debugging the test harness, CI test failures |
| `references/webviews.md` | Any webview, webview view, or custom editor |
| `references/ai-integration.md` | Language model tools, chat participants, MCP providers, `vscode.lm` |
| `references/web-extensions.md` | Running on vscode.dev / github.dev, `browser` entry |
| `references/azure-devops.md` | Pipelines, feeds, publishing, install scripts, Private Marketplace |
| `references/review-rubric.md` | Any gate: every rule ID, severity, mechanical vs judgment, why, and fix |

## Working with the software-factory skill

software-factory owns the gate protocol, the approval question, the resume rule and the
`docs/plans/<feature>/` layout; follow it as written. This skill adds what is specific to VS
Code: replacement sections for web-app concepts (contribution points instead of endpoints,
state and storage instead of tables), a best-practice review before each approval, and the
slice gate. If software-factory is not installed, `workflows/feature.md` contains the
condensed protocol to run the same gates.
