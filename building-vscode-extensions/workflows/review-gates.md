# Review gates: procedure, reviewer, waivers

## Contents
- Which rules apply where
- Procedure
- Independent reviewer prompt
- Verdict rules
- Waivers
- Presenting the result
- Things that are never acceptable
- Keeping the vendored checker current

## Which rules apply where

`references/review-rubric.md` lists every rule with an ID, severity, the gates it applies to,
and whether it is **mechanical** (checked by `vsx-check`) or **judgment** (checked by a
reviewer). Mechanical rules run identically in CI; judgment rules are why a gate is more than
a CI run.

| Gate | Mechanical | Judgment rules to apply |
| --- | --- | --- |
| baseline | `gate.mjs --gate baseline` | identity, placeholders, ADR (see `workflows/bootstrap.md`) |
| plan-1/2/3 | none (no code yet) | rules tagged `plan-1`, `plan-2`, `plan-3` against the gate doc |
| slice | `gate.mjs --gate slice` | rules tagged `slice`, scoped to the slice diff |
| release | `gate.mjs --gate release` (adds floor tests, VSIX inspection) | rules tagged `release` |

## Procedure

1. **Scope.** Slice: the diff since the slice started (`git diff <base>...HEAD` plus
   uncommitted changes); release: everything since the previous tag; Review mode without a
   gate named: the whole repository at the slice level, plus release rules if the user asks
   "is it ready to ship".
2. **Mechanical.** `node scripts/gate.mjs --gate <gate> --slug <slug> --repo <repo>`. It writes
   `docs/reviews/<date>-<gate>[-<slug>].md` with the step table and findings. For a repo that
   should not be written to (a Review-mode audit the user did not ask to persist), add
   `--no-report` and present findings in chat instead.
3. **Judgment.** Apply the judgment rules for the gate to the scoped change. Prefer an
   independent reviewer (below); otherwise review it yourself, rule by rule, citing file:line.
4. **Write it down.** Fill the report's Judgment review table, Waivers applied, Follow-ups,
   and set the final verdict.
5. **Present** (below) and stop for the user's decision when the verdict is not PASS.

## Independent reviewer prompt

When subagents are available, the author should not grade their own slice. Spawn one with:

```text
You are reviewing a change to a VS Code extension at <repo> for the <gate> gate.
Read <skill>/references/review-rubric.md. Apply every rule whose Gates column includes
"<gate>" and whose Check column is "judgment". Scope: <diff command or file list>.
Also read AGENTS.md and <plan docs if any> for the intended design.
For each rule output: rule ID, pass/fail/n.a., evidence as file:line, one-sentence reason.
Then list anything else that would make this code harder to maintain, with file:line.
Do not edit files. Do not soften findings; a reviewer who finds nothing on a non-trivial
change should say what they checked.
```

Merge its findings into the report; disagreeing with a finding is fine, but say why in the
report rather than dropping it.

## Verdict rules

- Any open (unwaived) finding at a blocking severity → `BLOCKED`. Blocking severities:
  blocker at baseline/plan/slice; blocker and major at release.
- A step that failed → `BLOCKED`. A step that was skipped or could not run → `INCOMPLETE`.
- Blocking findings exist but all are waived → `PASS_WITH_WAIVERS`.
- Otherwise `PASS`. Majors and minors at a slice gate go to Follow-ups with an owner or a slice.

## Waivers

Waivers are human decisions. Offer one only after explaining what the fix would take. When
the user grants it, add to `docs/reviews/waivers.json`:

```json
{
  "rule": "ARC-004",
  "path": "src/features/import/legacyReader.ts",
  "reason": "Sync read of a <1 KB marker file inside a user-invoked command; replaced in slice 4.",
  "approvedBy": "<user's name>",
  "date": "<today>",
  "expires": "<a date by which it must be fixed; default: next planned release>"
}
```

Use `path` to keep the waiver narrow. Expired waivers stop applying automatically, so debt
resurfaces instead of becoming permanent. Judgment-rule waivers are recorded in the report's
Waivers section with the same fields.

## Presenting the result

Lead with the verdict and the blockers, then the rest:

```text
Slice gate: BLOCKED (docs/reviews/2026-10-03-slice-find-part-s2.md)
Blockers
- ARC-001 src/core/catalog.ts:1 imports vscode → move the config read to the feature, pass the path in
- J: ERR-J02 findPart swallows parse errors; user sees an empty list instead of the cause
Majors (release-blocking later): 1 · Minors: 2 (in report)
Fix these now, or waive a specific one?
```

Diagnose failures; never just restate the tool output. If a step failed for an environmental
reason (no network, no display), say that, and say what would make it run.

## Things that are never acceptable

- Editing tests, the checker, lint rules or `.vscode-test.mjs` to make a gate pass.
- `.skip`/`.only`, lowered severities, broadened waivers, or catch-all `try {} catch {}`
  added to hide a failure.
- Calling a gate PASS when steps did not run.
- Self-granted waivers.

## Keeping the vendored checker current

`gate.mjs` notes in the report when the repo's `tools/vsx-check.mjs` differs from the skill's
copy. Offer to update it (`cp <skill>/scripts/vsx-check.mjs <repo>/tools/`) in its own small
change, run the slice gate, and mention any new findings the update surfaces.
