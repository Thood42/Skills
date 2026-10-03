# Testing

## Contents
- The three suites
- Writing tests that can fail
- Unit tests
- Integration tests (Extension Host)
- Web tests
- CI notes
- Troubleshooting

## The three suites

| Suite | Runs in | Command | Covers |
| --- | --- | --- | --- |
| Unit | Plain Node + mocha (`.mocharc.cjs`) | `npm run test:unit` | `src/core`, `src/shared` — all logic, fast |
| Integration | Real VS Code via `@vscode/test-cli` (`.vscode-test.mjs`) | `npm run test:integration` (stable), `npm run test:integration:floor` (engines floor) | activation, registration, commands, providers, tools, settings |
| Web | Browser via `@vscode/test-web` | `npm run test:web` | the `browser` bundle on vscode.dev |

Most tests should be unit tests: they need logic in `core` (the layering rule exists for
this). Integration tests prove the wiring and the important user paths, not every branch.

## Writing tests that can fail

- Write or adjust the test first and watch it fail for the right reason (TST-J01); report the
  failure message in the slice summary.
- Assert behaviour the user would notice (returned value, document text, registered command),
  not implementation calls.
- One reason to fail per test; names state the expectation ("falls back to world when the
  name is blank").
- No sleeps: await the API call or event; for events, wrap in a promise with a timeout.
- Fixtures live in `test-fixtures/`; tests never depend on the developer's machine or network.

## Unit tests

`src/test/unit/**/*.test.ts`, compiled by `tsc -p .` to `out/`. Import
`{ describe, it } from 'mocha'` and `node:assert/strict`. Unit tests must not import `vscode`
(they run without it); if a test wants to, the logic belongs in core with the VS Code part
passed in.

## Integration tests (Extension Host)

`src/test/integration/**/*.test.ts`, run by `vscode-test` against the built bundle
(`npm run compile` first; the npm script does it). The baseline includes a generic test —
every command contributed in `package.json` is registered — that catches manifest/code drift
for free; keep it.

Patterns:

```ts
// Execute a command with arguments and assert its return value
const result = await vscode.commands.executeCommand<string>('partLookup.findPart', 'A-100');

// Settings: update in the test workspace, restore afterwards
const config = vscode.workspace.getConfiguration('partLookup');
await config.update('catalogPath', 'fixtures/parts.json', vscode.ConfigurationTarget.Workspace);
after(() => config.update('catalogPath', undefined, vscode.ConfigurationTarget.Workspace));

// Documents
const doc = await vscode.workspace.openTextDocument({ language: 'json', content: '{}' });
await vscode.window.showTextDocument(doc);

// Language model tools: invoke outside chat
const res = await vscode.lm.invokeTool('part_lookup_find_part', { input: { query: 'A-100' }, toolInvocationToken: undefined });
```

`mocha` is pinned to the major `@vscode/test-cli` uses so both runners share one mocha
instance; a second copy breaks `import { describe } from 'mocha'` inside the Extension Host.
The scaffold resolves this automatically; keep it when upgrading.

Floor run: the `floor` label in `.vscode-test.mjs` reads `engines.vscode` and downloads that
exact version. It is the only proof that the code runs on the oldest supported VS Code;
the release gate and pipeline run it.

Debugging: install **Extension Test Runner** (`ms-vscode.extension-test-runner`) to run and
debug tests from the Testing view.

## Web tests

`src/test/web/` is bundled by `node esbuild.mjs --web-tests` into `out/web/test/index.js` and
run by `vscode-test-web --browserType=chromium --quality stable` (its default is Insiders). No `node:assert` there (the baseline uses a
tiny `check()` helper). Run them for any change that touches shared code.

## CI notes

- Linux agents need a display: `xvfb-run -a npm run test:integration` (the pipeline and
  `gate.mjs` do this automatically).
- Integration tests download VS Code from `update.code.visualstudio.com` into `.vscode-test/`;
  cache that folder in CI if downloads are slow, and allow the host through corporate proxies
  (`HTTPS_PROXY` is honoured).
- When the download is blocked (sandboxes, locked-down agents) the gate reports `INCOMPLETE`;
  never treat skipped integration tests as passed.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `describe is not a function` / no tests found | Two mocha copies (`npm ls mocha`), or tests not compiled to `out/` |
| Extension not found in test | `EXTENSION_ID` does not match `publisher.name` |
| Tests pass locally, time out in CI | Cold start; first test triggers activation — keep the 20 s timeout, or activate in `before` |
| `Failed to parse response from update.code.visualstudio.com` | VS Code download blocked by network policy |
| Floor run fails, stable passes | Code uses an API newer than `engines.vscode` |
