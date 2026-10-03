# package.json (extension manifest)

## Contents
- Identity and engines
- Entry points and activation
- Contributions
- Capabilities
- Localization
- Scripts and dependencies
- Common mistakes

## Identity and engines

- `name` (kebab-case), `publisher`, `displayName`, `description`, `version` (`MAJOR.MINOR.PATCH`),
  `license` (`SEE LICENSE IN LICENSE.md` for proprietary), `repository`, `icon` (PNG ≥128×128).
  `"private": true` prevents an accidental `npm publish`.
- `engines.vscode` is the **floor**: the oldest VS Code the extension must run on. VS Code now
  ships stable releases weekly, so "latest" is a moving target; pick the floor from the
  oldest version deployed in the organization (enterprise fleets lag), and raise it only
  when a needed API requires it (ADR, MAN-J01).
- `@types/vscode` is pinned **exactly** to a version ≤ the floor (MAN-002). The compiler then
  rejects APIs newer than the floor, and `npm run test:integration:floor` runs the tests on
  that exact VS Code version before every release.
- To raise the floor: change `engines.vscode`, pin `@types/vscode` to the new floor, update
  ADR 0001 (or a new ADR), check `NODE_TARGET` in `esbuild.mjs` and `@types/node`, run the
  release gate.

## Entry points and activation

- `main` → `./dist/extension.js` (desktop, CommonJS bundle); `browser` →
  `./dist/web/extension.js` (web worker) when the extension supports vscode.dev.
- `activationEvents`: since VS Code 1.74, contributions imply their own activation events
  (commands, views, language model tools, chat participants, custom editors...). Keep the
  array empty unless something is not implied, e.g. `onLanguage:<id>` for a language you do
  not contribute, `workspaceContains:<glob>`, `onUri`, `onWebviewPanel:<viewType>` for
  serializers, `onFileSystem:<scheme>`.
- Never `"*"` (MAN-003). `onStartupFinished` only with an ADR (MAN-005).

## Contributions

**Commands**: `command` (`<prefix>.<verbNoun>`), `title` (Title Case "Verb Noun"),
`category` (display name), optional `icon` (`$(codicon)`), `enablement`. Hide commands that
cannot apply:

```json
"menus": {
  "commandPalette": [{ "command": "partLookup.copyPartNumber", "when": "editorHasSelection" }],
  "editor/context": [{ "command": "partLookup.findPart", "when": "resourceLangId == json", "group": "navigation" }]
}
```

**Configuration**: one object (or array of titled sections) whose properties share the
prefix. Each property: `type`, `default`, `markdownDescription`, `scope`
(`application` | `machine` | `window` | `resource` | `language-overridable`), plus `enum` +
`enumDescriptions`, `minimum`/`maximum`, `pattern` where they apply. Rename by adding the new
key and marking the old one `deprecationMessage` for one minor release.

**Views**: put views in an existing container (`explorer`, `scm`, `test`) before creating a
custom `viewsContainers` entry. Use `viewsWelcome` for empty states.

**Keybindings**: always with a `when` clause; avoid common chords; document them in README.

**AI**: `languageModelTools`, `chatParticipants`, `mcpServerDefinitionProviders` — see
`references/ai-integration.md`.

## Capabilities

```json
"capabilities": {
  "untrustedWorkspaces": { "supported": "limited", "description": "Catalog path settings are ignored in Restricted Mode.", "restrictedConfigurations": ["partLookup.catalogPath"] },
  "virtualWorkspaces": true
}
```

Declare both explicitly (MAN-010/011). `true` is a claim: it must hold (no executing workspace
content, no local-path assumptions). `extensionKind` (`["workspace"]` default, `["ui"]` for
extensions that must run next to the UI, e.g. clipboard or local-only tools) matters for
remote development.

## Localization

Two separate mechanisms:

- Manifest strings: `"title": "%findPart.title%"` with `package.nls.json` (+
  `package.nls.<locale>.json`). MAN-017 checks every key resolves.
- Runtime strings: `vscode.l10n.t('Found {0} parts', count)` with `"l10n": "./l10n"` in
  `package.json`; extract with `npx @vscode/l10n-dev export -o ./l10n ./src`. MAN-018 checks the
  folder is declared.

Internal tools often ship English only; adopt l10n when there is a second locale, not before.

## Scripts and dependencies

The baseline's script names are a contract used by `gate.mjs`, CI and `AGENTS.md`:
`check-types`, `lint`, `check:extension`, `test:unit`, `test:integration`,
`test:integration:floor`, `test:web` (web only), `package:vsix`, `verify`. Rename none of them.

- `dependencies`: runtime libraries bundled by esbuild. `devDependencies`: everything else
  (DEP-002). Packaging uses `--no-dependencies` because the bundle already contains runtime code.
- `.vscodeignore` is an allowlist (`**` then `!dist/**/*.js`, `!media/**`, ...). vsce applies
  `!` re-includes after all excludes regardless of order, so re-include precisely instead of
  excluding afterwards. Check with `npx vsce ls --no-dependencies`.

## Common mistakes

| Symptom | Cause |
| --- | --- |
| "command 'x' not found" | Contributed but not registered (MAN-006), or activation threw before registering — check the log |
| Works in dev, fails after install | File missing from VSIX (`vsce ls`), or a runtime dependency was not bundled |
| `vsce` hangs in CI | Missing `repository` or LICENSE → interactive prompt (MAN-013) |
| "incompatible with VS Code" on install | User's VS Code is older than `engines.vscode` |
| Setting has no effect | Key missing its prefix, wrong `scope`, or code reads a different key |
