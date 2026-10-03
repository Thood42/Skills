# Review rubric

Every rule has a stable ID used by `vsx-check`, gate reports and waivers. **Mechanical** rules
are enforced by `scripts/vsx-check.mjs` (and in CI via the vendored copy). **Judgment** rules
(`-J` IDs) are applied by a reviewer at the gates listed.

Severity → effect: **blocker** stops every gate; **major** stops the release gate (tracked as a
follow-up at slice gates); **minor** never blocks. `rel:` marks a different severity at the
release gate.

## Contents
- Mechanical rules: Manifest (MAN), AI (AI), Architecture (ARC), TypeScript (TS), Security (SEC),
  Dependencies (DEP), Web (BRW), Tests (TST), Packaging (PKG), Docs (DOC)
- Judgment rules: UX, Architecture, Errors, Security, AI, Tests, Manifest, Docs & Release
- Changing the rubric

---

## Mechanical rules (vsx-check; gates baseline, slice, release)

### Manifest

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| MAN-001 | blocker | name, publisher, version and main/browser exist — the extension cannot load or package otherwise. |
| MAN-002 | blocker | `@types/vscode` ≤ `engines.vscode` floor, pinned exactly (a range is major) — newer types let code compile against APIs the floor lacks; vsce rejects it → pin types to the floor. |
| MAN-003 | blocker | No `"*"` activation — activates in every window at startup → rely on contribution-implied events. |
| MAN-004 | minor | No `onCommand:`/`onView:` events for contributed items — implied since VS Code 1.74 → delete them. |
| MAN-005 | minor | `onStartupFinished` is justified — runs in every window → ADR or waiver with the reason. |
| MAN-006 | blocker | Every contributed command ID appears in `src/` — otherwise users get "command not found" → register it or remove the contribution. |
| MAN-007 | minor | Registered commands are contributed or `_`-prefixed internal — invisible commands confuse support → contribute with title+category or prefix `_`. |
| MAN-008 | major | Commands have `title` and `category` — palette shows "Category: Title". |
| MAN-009 | major | Settings: one prefix, `type`, `default`, description — defaults live in one place; `readSetting()` relies on them. |
| MAN-010 | major | `capabilities.untrustedWorkspaces` declared — otherwise VS Code decides for you in Restricted Mode. |
| MAN-011 | minor | `capabilities.virtualWorkspaces` declared. |
| MAN-012 | major, rel: blocker | No `enabledApiProposals` — proposed APIs only work in Insiders with flags. |
| MAN-013 | minor, rel: blocker | `repository` and a LICENSE file — vsce prompts interactively without them, hanging CI. |
| MAN-014 | minor, rel: major | Icon is a PNG ≥128×128 — vsce rejects SVG. |
| MAN-015 | blocker | Version is `MAJOR.MINOR.PATCH` — VSIX versions cannot carry suffixes. |
| MAN-016 | major | `main`/`browser` point into `dist/` — unbundled extensions load slowly and cannot run on the web. |
| MAN-017 | major, rel: blocker | `%key%` manifest strings resolve in `package.nls.json` — users otherwise see raw keys. |
| MAN-018 | major | `vscode.l10n.t()` usage has an `l10n` bundle folder. |

### AI integration

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| AI-001 | blocker | Every contributed `languageModelTools[].name` is registered with `vscode.lm.registerTool`. |
| AI-002 | major | Tools have `displayName`, `modelDescription`, `userDescription`, `inputSchema` — the model chooses tools from these. |
| AI-003 | blocker | Every contributed chat participant is created. |
| AI-004 | blocker | Every contributed MCP server definition provider is registered. |
| AI-005 | minor | Tool names are `<extension>_<verb>_<noun>` snake_case — avoids collisions across extensions. |

### Architecture

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| ARC-001 | blocker | `src/core` never imports `vscode` — keeps core unit-testable in plain Node → pass data in from the feature. |
| ARC-002 | blocker | Imports point inward (core ← platform ← features ← extension) — cycles and upward imports are how layering erodes. |
| ARC-003 | major | `src/extension.ts` ≤ 60 code lines — the composition root only wires features. |
| ARC-004 | major | No sync `fs` calls in shipped code — blocks the extension host, breaks remote/virtual → `vscode.workspace.fs`. |
| ARC-005 | minor | No `console.*` outside webviews — invisible to users → `ctx.log`. |
| ARC-006 | blocker | Secret-looking keys never go to `globalState`/`workspaceState` — plain text on disk → `context.secrets`. |
| ARC-007 | major | ESLint config contains the `src/core` import restriction — otherwise the boundary is only checked at review. |

### TypeScript

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| TS-001 | blocker | `strict: true`. |
| TS-002 | minor | `noUncheckedIndexedAccess: true`. |
| TS-003 | major | No `@ts-ignore`/`@ts-nocheck` → `@ts-expect-error` with a reason. |

### Security

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| SEC-001 | blocker | No `eval` / `new Function`. |
| SEC-002 | major | No `exec` with interpolated strings, no `shell: true` → `execFile`/`spawn` with argument arrays. |
| SEC-003 | blocker | Webviews render a CSP starting at `default-src 'none'`, no `'unsafe-eval'`, no inline script (nonce instead). |
| SEC-004 | major | `enableScripts` webviews set `localResourceRoots` narrowly. |
| SEC-005 | major | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` → DOM nodes + `textContent`. |
| SEC-006 | minor | `retainContextWhenHidden` is justified → prefer `getState`/`setState`. |
| SEC-007 | major | No plain-HTTP endpoints (localhost excepted). |

### Dependencies

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| DEP-001 | major | No `@vscode/webview-ui-toolkit` (deprecated) → `@vscode-elements/elements`. |
| DEP-002 | major | Build/test/type packages are devDependencies. |
| DEP-003 | major | No legacy `vscode` npm package → `@types/vscode` + `@vscode/test-electron`. |

### Web extension (only when `browser` is set)

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| BRW-001 | blocker | Shared code imports no Node built-ins (`src/node/` and Node-only tests excepted). |
| BRW-002 | major | Shared code avoids `__dirname`, `Buffer`, `process.env/cwd/platform/argv`. |

### Tests

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| TST-001 | blocker | No `.only` — silently disables every other test. |
| TST-002 | major | No `.skip`/`xit` without a waiver. |
| TST-003 | major | Both `src/test/unit/` and `src/test/integration/` have tests. |
| TST-004 | major | `test` script and `.vscode-test.*` config exist. |

### Packaging

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| PKG-001 | blocker | `.vscodeignore` exists and keeps sources/node_modules out (allowlist preferred). |
| PKG-002 | major | `vscode:prepublish` builds the production bundle. |
| PKG-003 | major (`--deep`, release gate) | `vsce ls` shows no sources, tests, node_modules; ≤100 files; source maps are minor. |

### Docs

| ID | Severity | Rule — why → fix |
| --- | --- | --- |
| DOC-001 | blocker (release only) | CHANGELOG has a heading for the version being released. |
| DOC-002 | minor, rel: major | README is not generator boilerplate. |
| DOC-003 | minor | `AGENTS.md` exists. |

---

## Judgment rules

Gates: `plan-1` Product doc, `plan-2` Architecture doc, `plan-3` Program Design doc, `slice`
code of a slice, `release` everything since the last tag.

### UX

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| UX-J01 | major | plan-1, slice | Native UI first (quick pick, tree view, notification, editor); a webview only when native UI cannot express the interaction. |
| UX-J02 | major | plan-1, slice | Notifications only for important or actionable events; routine success uses the status bar or nothing. |
| UX-J03 | minor | plan-1 | Command titles are "Verb Noun" in Title Case with the extension's display name as category. |
| UX-J04 | major | slice | Operations that can exceed ~1 s show progress (`withProgress`) and are cancellable. |
| UX-J05 | major | plan-1, slice | Keyboard and screen-reader usable; webviews follow light, dark and high-contrast themes; no colour-only meaning. |
| UX-J06 | minor | plan-3, slice | Commands are hidden from the palette where they cannot apply (`menus.commandPalette` when-clauses). |
| UX-J07 | major | plan-1 | No modal dialogs except to confirm destructive actions. |

### Architecture

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| ARC-J01 | blocker | slice | Every command, event and provider callback runs inside an error boundary (`registerCommand()` or equivalent); no floating promises. |
| ARC-J02 | blocker | slice | Every disposable has an owner (`context.subscriptions` or a disposable owned by it), including event listeners and panels. |
| ARC-J03 | major | plan-3, slice | Core takes plain data; no hidden reads of settings, state or the clock inside core. |
| ARC-J04 | major | plan-2, slice | Activation does no network calls, prompts or heavy I/O; work is deferred to first use. |
| ARC-J05 | major | plan-2, slice | Cancellation tokens are honoured in providers, tools and long operations. |
| ARC-J06 | major | plan-2 | State lives in the right store (settings / Memento / secrets / storageUri); persisted keys are versioned with a migration path. |
| ARC-J07 | major | plan-2, slice | Works remote (SSH/WSL/containers) and with no folder or multi-root open: workspace files as `Uri`, never assumed local paths. |
| ARC-J08 | minor | slice | No module-level mutable service singletons; services flow through `FeatureContext`. |
| ARC-J09 | major | plan-3 | One feature per folder; features do not import each other (share through core or platform). |

### Errors and logging

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| ERR-J01 | major | slice | User-facing errors say what happened and what to do, offer Show Log, and never show stack traces. |
| ERR-J02 | blocker | slice | No swallowed errors: no empty `catch`, no silent fallback without a log line. |
| ERR-J03 | major | slice | Log levels are meaningful; no secrets or personal data in logs. |

### Security

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| SEC-J01 | blocker | plan-2, release | Data leaving the machine (network, language models, MCP, telemetry) is listed in the Architecture doc and README and fits company policy; no secrets in prompts. |
| SEC-J02 | blocker | slice | Untrusted input (workspace files, settings, webview messages, tool input) is validated; file paths are confined to the workspace. |
| SEC-J03 | major | plan-2, slice | Restricted Mode behaviour matches `untrustedWorkspaces`; settings that run programs or reach URLs are `restrictedConfigurations` when "limited". |
| SEC-J04 | blocker | slice | Webview HTML never interpolates untrusted strings; data goes over `postMessage` (or escaped JSON, never raw `</script>`-breakable text). |
| SEC-J05 | major | plan-1, slice | Side effects (writes, git, network posts) happen only on explicit user intent; nothing surprising happens automatically. |

### AI integration

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| AI-J01 | major | plan-2 | Mechanism fits the need: tool (agent mode + VS Code API), MCP provider (reuse outside VS Code), chat participant (owned conversation), `vscode.lm` (AI inside non-chat features). |
| AI-J02 | blocker | slice | Tools with side effects return `confirmationMessages`; read-only tools say so in `modelDescription`. |
| AI-J03 | major | slice | `modelDescription` covers what, when, when not, and limits; schema properties are described; thrown errors tell the model what to do next. |
| AI-J04 | major | slice | Tool output is bounded and plain; no secrets; deterministic for the same input. |
| AI-J05 | major | slice | Works or degrades clearly when no model is available, consent is denied, or policy disables chat (`LanguageModelError`). |

### Tests

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| TST-J01 | blocker | slice | Each new test fails without the change (name it and how it failed before). |
| TST-J02 | major | plan-3, slice | Unit tests for core, integration tests for registration and behaviour, web tests when `browser` is set. |
| TST-J03 | major | slice | Deterministic: no sleeps, no network, no order dependence; fixtures under `test-fixtures/`. |

### Manifest

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| MAN-J01 | major | plan-2 | Raising `engines.vscode` is justified against the fleet's versions and recorded in an ADR. |
| MAN-J02 | minor | plan-3 | Menus, keybindings and views use when-clauses that scope them to where they apply. |

### Docs and release

| ID | Severity | Gates | Rule |
| --- | --- | --- | --- |
| DOC-J01 | minor | slice | `AGENTS.md` changes with commands, conventions or layers. |
| DOC-J02 | major | plan-2 | Decisions that outlive the feature get an ADR. |
| REL-J01 | blocker | release | CHANGELOG matches the diff since the last tag. |
| REL-J02 | blocker | release | Upgrading users keep their data: stored state migrated; removed settings deprecated (`deprecationMessage`) for one minor first. |
| REL-J03 | major | release | Version bump matches `workflows/release.md`; breaking changes called out. |
| REL-J04 | major | release | No reference/example features; no TODO/FIXME without an issue link in shipped code. |
| PERF-J01 | major | release | VSIX size and bundle size compared with the previous release; growth explained. |

---

## Changing the rubric

Rule IDs are permanent: retire a rule by marking it retired here, never reuse its ID. A new
mechanical rule lands in `scripts/vsx-check.mjs` and this file in the same change, with a
fixture that triggers it and the baseline template still passing clean.
