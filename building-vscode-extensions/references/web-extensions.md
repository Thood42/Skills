# Web extensions (vscode.dev, github.dev)

## What changes

A web extension runs in a browser web worker: no Node.js, no child processes, no local file
system. VS Code loads the bundle named by `"browser"` in `package.json`. The baseline builds
the same `src/extension.ts` twice (esbuild targets `extension:node` → `main`,
`extension:web` → `browser`), so one code base serves both.

## Rules for shared code

- No Node built-ins (`fs`, `path`, `os`, `child_process`, `crypto` module, `node:*`) — ESLint
  and BRW-001 enforce it outside `src/node/`.
- No `__dirname`, `Buffer`, `process.env` (BRW-002). Use `context.extensionUri`,
  `TextEncoder`/`TextDecoder`, and settings instead of environment variables.
- Files via `vscode.workspace.fs` + `Uri` (works on local, remote, virtual and web).
- Web crypto (`globalThis.crypto.getRandomValues`, `crypto.subtle`) works in both hosts.
- `fetch` exists in both hosts; in the browser it is subject to CORS.

## Node-only capabilities

Put them in `src/node/` behind an interface defined in `core` or `platform`, choose the
implementation at runtime, and keep a web fallback (or a clear "not available on the web"
message):

```ts
// src/platform/capabilities.ts
export const isWeb = (): boolean => vscode.env.uiKind === vscode.UIKind.Web;
```

Prefer feature detection (`vscode.env.uiKind`, `vscode.workspace.fs.isWritableFileSystem`) to
guessing from the environment.

## Testing and debugging

- `npm run test:web` bundles `src/test/web/` and runs it with `@vscode/test-web` in Chromium
  against `test-fixtures/workspace`. No `node:assert` there.
- Debug with the **Run Web Extension** launch configuration
  (`--extensionDevelopmentKind=web`), or `npx @vscode/test-web --extensionDevelopmentPath=.`
  to open a local VS Code for the Web.
- Both the integration and web suites must pass for changes in shared code.

## Capabilities

Web extensions usually also declare `"virtualWorkspaces": true` (they cannot assume a disk)
and must work with `workspaceFolders` whose URIs are not `file:`.
