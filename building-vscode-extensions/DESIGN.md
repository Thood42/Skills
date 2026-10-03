# building-vscode-extensions — design and status

Status: **first draft (v0.1.0), awaiting review gate** — 2026-10-03.
Next step: Trevor approves the draft + test prompts, then the skill-creator eval loop runs
(with-skill vs no-skill on 3 prompts, static eval viewer).

## Scope decisions (from Trevor, 2026-10-03)

- Distribution: Azure DevOps artifact mechanisms for an enterprise environment (no public
  Marketplace / Open VSX in scope).
- First-class surfaces beyond core: webviews, AI integration (LM tools, chat participants,
  MCP), web extensions. No LSP recipe in v1.
- CI: Azure DevOps Pipelines.
- Gate policy: blockers stop the gate; user can waive a specific finding (recorded with
  reason, approver, expiry).

## Hierarchy (and why not several skills)

```
building-vscode-extensions/
├── SKILL.md                 router: modes, gate model, non-negotiables, index (≈150 lines)
├── workflows/               one file per mode, read only when that mode runs
│   ├── bootstrap.md         generate baseline repo → baseline gate → hand off to Feature
│   ├── feature.md           software-factory Gates 1–4 + VS Code overlays + plan reviews
│   ├── review-gates.md      gate procedure, independent reviewer prompt, verdicts, waivers
│   ├── adopt.md             ratchet an existing extension up to the standard
│   ├── release.md           versioning, release gate, tag → pipeline → Azure Artifacts
│   └── maintain.md          dependency groups, engines floor raises, health checks
├── references/              domain knowledge, loaded on demand (TOC where >100 lines)
│   ├── architecture.md  manifest.md  testing.md  webviews.md
│   ├── ai-integration.md  web-extensions.md  azure-devops.md
│   └── review-rubric.md     55 mechanical + 41 judgment rules, stable IDs
├── scripts/                 zero-dependency Node ESM
│   ├── scaffold.mjs         baseline generator (version resolution, surfaces, icon, vendoring)
│   ├── gate.mjs             mechanical half of a gate + report skeleton
│   ├── vsx-check.mjs        rule checker (vendored into repos as tools/vsx-check.mjs)
│   └── selftest.mjs         regression test for the skill itself
└── assets/
    ├── template/base/       baseline repo (dot-* and *.tmpl names renamed at scaffold)
    ├── template/surfaces/   webview | ai | web overlays (files + JSON merge fragments)
    ├── report-template.md   gate report
    └── versions.json        pinned fallback dependency set
```

One skill with internal progressive disclosure rather than a family of skills, because:
skills cannot invoke each other (only Claude can load several); several VS Code skills would
compete on the same trigger words; all modes share the rubric and scripts; and the Skills
API / claude.ai accept exactly one SKILL.md per skill (nested SKILL.md files are rejected).
software-factory stays a separate skill and owns the gate protocol; this skill overlays it.

## Key technical decisions

- Layers: core (pure) ← platform (VS Code adapters) ← features ← extension.ts; enforced by
  ESLint `no-restricted-imports` + vsx-check ARC-001/002.
- `@types/vscode` pinned exactly to the newest published version ≤ engines floor; integration
  tests run on stable and on the floor (`.vscode-test.mjs` labels).
- Scaffold resolves versions live: TypeScript within typescript-eslint's peer range (TS 7 is
  out but typescript-eslint supports <6.1 → TS 6.0.x today), mocha/@types/mocha follow
  @vscode/test-cli (single mocha instance), `@types/node` ^22.
- `.vscodeignore` allowlist re-including `dist/**/*.js` (vsce applies `!` after excludes).
- Distribution default: Universal Package per release on an Azure Artifacts feed, published by
  a deployment job gated by an environment approval; install/update scripts (sh + ps1).
  Private Marketplace (npm feed + Microsoft's Publish-VsixToAzureArtifacts.ps1) documented for
  auto-update.
- Gate verdicts: PASS / PASS_WITH_WAIVERS / BLOCKED / INCOMPLETE (skipped or VS Code download
  failed — never reported as a pass).

## Verification done in the sandbox

- Scaffolded core-only and all-surfaces repos: `check-types`, `lint`, `test:unit`,
  `package:vsix`, vsx-check (release, deep) all pass; VSIX contains only dist JS, media, docs.
- Production bundles (node + web) activated against a fake `vscode` host: every contributed
  command/tool registered, protocol + CSP/nonce correct, error boundary works, all
  disposables released.
- Negative tests: lint and vsx-check catch layer violations and Node built-ins in web code;
  selftest: 16 mutations each trigger their rule; rubric ↔ checker IDs in sync.
- Reference snippets (AI tool, chat participant, MCP provider, vscode.lm) type-check against
  @types/vscode 1.110.
- **Not verified here**: Extension Host integration tests, floor tests and web tests —
  update.code.visualstudio.com is blocked in the sandbox (gate reports INCOMPLETE). First run
  on a real machine or Azure Pipelines is the open check.
- Unverified assumptions marked in docs: `az artifacts universal download --feed <feed>@<view>`;
  npmAuthenticate pre-auth for Publish-VsixToAzureArtifacts.ps1 in pipelines.

## Eval set (evals/evals.json)

1. bootstrap-signal-lens — new extension with webview, Azure DevOps details, floor 1.112.
2. review-legacy-notes — seeded legacy extension (evals/files/legacy-notes): 14 mechanical
   blockers + judgment issues (undisposed listeners, token prompt at activation, auto git
   commit, token over HTTP, HTML injection).
3. feature-agent-tool-gated — add an LM tool to a baseline repo; must stop at Gate 1.

Regenerate the part-lookup fixture:
`node scripts/scaffold.mjs --dir evals/files/part-lookup --name part-lookup --publisher acme-devtools --display-name "Part Lookup" --description "Look up internal part numbers." --owner "Acme Automotive" --ado-org acme-auto --ado-project DevTools --ado-feed vscode-extensions --engine 1.110.0 --no-install --no-git`

## Restoring the source from this project

Docs here: SKILL.md, workflows/*, references/*, scripts/* as individual docs, and
`assets-and-evals-bundle.txt` (text archive). Unpack the archive with:

```python
import os, re
text = open('assets-and-evals-bundle.txt', encoding='utf-8').read()
for path, body in re.findall(r'<<<FILE (.+?)>>>\n(.*?)\n<<<END>>>', text, re.S):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(body)
```
