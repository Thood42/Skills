# Bootstrap: generate the baseline repository

Use when the target folder has no VS Code extension. The output is a repository that already
passes its own baseline gate, so the first feature starts from green instead of from setup work.

Copy this checklist and track it:

```
Bootstrap progress:
- [ ] 1. Confirm the target is empty / not an extension
- [ ] 2. Collect inputs (one batch of questions)
- [ ] 3. Scaffold
- [ ] 4. Baseline gate (mechanical)
- [ ] 5. Baseline review (judgment) + fill placeholders
- [ ] 6. Present and ask for approval
- [ ] 7. Hand off to Feature mode if the user named a feature
```

## 1. Confirm the target

- Folder has a `package.json` with `engines.vscode` → this is not a bootstrap; switch to
  `workflows/adopt.md` (bring up to standard) or `workflows/feature.md` (add to it).
- Folder has unrelated files → ask where the extension should live. The scaffold refuses
  non-empty folders (a lone `.git` is fine) so it can never overwrite work.

## 2. Collect inputs

Ask once, in one batch, and offer the defaults. Infer what you can from the request (a
feature description implies a description line and often a surface).

| Input | Flag | Default / how to decide |
| --- | --- | --- |
| Extension name (kebab-case) | `--name` | from the feature/product name |
| Publisher id | `--publisher` | the team's existing publisher id; ask |
| Display name, description | `--display-name`, `--description` | derived from name / request |
| Copyright owner | `--owner` | company name |
| Surfaces | `--surfaces webview,ai,web` | only what the first features need; each adds a reference implementation |
| Azure DevOps org / project / feed | `--ado-org`, `--ado-project`, `--ado-feed` | ask; placeholders `CHANGE-ME-*` are allowed but become follow-ups |
| Feed scope | `--feed-scope project\|organization` | project (Azure DevOps' default for new feeds) |
| engines.vscode floor | `--engine x.y.z` | **ask for the oldest VS Code version deployed in the fleet**. If unknown, `auto` picks the newest `@types/vscode` published ≥180 days ago and records it as a GUESS in ADR 0001 |

Surface guidance: AI tools need nothing else; a webview is justified only when native UI
(quick picks, tree views, notifications, editors) cannot express the interaction; `web` is
for extensions that must run on vscode.dev/github.dev and forbids Node built-ins in shared code.

## 3. Scaffold

```bash
node scripts/scaffold.mjs --dir <target> --name <name> --publisher <publisher> \
  --display-name "<Display Name>" --description "<one line>" --owner "<Company>" \
  --surfaces <list> --ado-org <org> --ado-project "<project>" --ado-feed <feed> --engine <x.y.z|auto>
```

The script validates inputs, resolves compatible package versions, renders the template,
vendors `tools/vsx-check.mjs`, generates a placeholder icon, runs `npm install`, and runs
`git init` if needed (it never commits). Its JSON output lists the derived IDs (command
prefix, tool prefix, universal package name) — keep them for the summary.

If it fails, read the message: input validation errors name the flag; `ERESOLVE` means the
registry moved past a compatibility rule — rerun with `--deps pinned` and tell the user which
package conflicted so the skill can be updated.

## 4. Baseline gate (mechanical)

```bash
node scripts/gate.mjs --gate baseline --repo <target>
```

Expected: every step PASS and zero vsx-check findings. Anything else is a defect in the
template or the environment; diagnose it and report it plainly rather than patching around it
in the generated repo. If integration tests cannot download VS Code here (proxy or sandbox),
the verdict is `INCOMPLETE`: say which steps did not run and that the user must run
`npm run verify` locally or let the pipeline run before treating the baseline as verified.

## 5. Baseline review (judgment)

Check the generated repo against the inputs, then fill the "Judgment review" table of the
report (`docs/reviews/<date>-baseline.md`):

- `package.json` identity, engines floor and surfaces match what the user asked for.
- `docs/adr/0001-baseline-architecture.md` states the floor rationale; if it is the auto GUESS,
  list "confirm fleet minimum VS Code version" as a follow-up.
- `CHANGE-ME-*` placeholders: list every one in Follow-ups (feed, org, repository URL).
- README describes the real extension (replace the generic description line if the user gave a
  better one).

## 6. Present and ask

Keep it short:

- Where the repo is, extension ID, command prefix, tool prefix, universal package name.
- Gate verdict and report path; any steps that did not run.
- One-time Azure DevOps setup the user must do (from the header of `azure-pipelines.yml`):
  create the pipeline, grant the build identities Feed Publisher on the feed, add an
  Approvals check to the `<name>-release` environment.
- Follow-ups (placeholders, floor confirmation, replace `media/icon.png`).

Ask: **"Approve the baseline, or what should change?"** Do not commit unless asked; when asked,
suggest `chore: baseline extension repository`.

## 7. Hand off

If the request named a feature, continue in `workflows/feature.md` at Gate 1. Slice 1 of the
first real feature deletes the `hello` reference feature (and the webview/AI reference
features if the new feature replaces them) so example code never ships in a release.
