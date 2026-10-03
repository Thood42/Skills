# Architecture for maintainable extensions

## Contents
- Layers and the dependency rule
- Composition root and feature modules
- Commands and the error boundary
- Disposables and lifetimes
- Settings
- State and storage
- File I/O, URIs, remote and multi-root
- Activation cost
- Async, cancellation, progress
- Logging
- Adding a feature: checklist

## Layers and the dependency rule

```
src/extension.ts       composition root: build services, register FEATURES
src/features/<name>/   one folder per feature: manifest contributions -> handlers
src/platform/          thin adapters over the VS Code API, shared by features
src/core/              pure logic: plain data in, plain data out
src/shared/            types shared with webviews (message protocols)
src/webview/           browser code (own tsconfig)
src/node/              Node-only code, web extensions only (behind a capability check)
```

Imports point inward only: `extension → features → platform → core`. Core imports nothing
outward and never imports `vscode` (ESLint + ARC-001/ARC-002). Why: almost every extension bug
worth a test lives in logic that can run without VS Code; keeping it in `core` makes it
testable in milliseconds, and keeps VS Code API churn contained in `platform` and features.

What goes where — a quick test: "Could this run in a plain Node script given the same
inputs?" Yes → `core`. Needs `vscode` but no feature knowledge → `platform`. Wires a specific
contribution → the feature.

## Composition root and feature modules

`extension.ts` builds a `FeatureContext` (extension context, `LogOutputChannel`, display
name, version) and calls `register(ctx)` on each entry of `FEATURES` (`src/features/index.ts`).
Each feature exports one `Feature` object:

```ts
export const findPartFeature: Feature = {
  id: 'findPart',
  register(ctx) {
    registerCommand(ctx, 'partLookup.findPart', async () => {
      const catalog = await loadCatalog(ctx);              // platform/feature: I/O
      const pick = await pickPart(searchParts(catalog));   // core: pure search
      ...
    });
  },
};
```

Rules: one feature per folder; features do not import each other (share through `core` or
`platform`); add shared services to `FeatureContext` rather than module-level singletons.

## Commands and the error boundary

Register every command through `registerCommand(ctx, id, handler)` from
`src/platform/commands.ts`. It awaits the handler, logs failures with stack to the log
channel, shows one actionable error message with a "Show Log" button, and owns the
disposable. Raw `vscode.commands.registerCommand` scatters error handling and leaks
unhandled rejections.

Make handlers accept their inputs as arguments when invoked programmatically (fall back to
UI prompts only when the argument is missing). That keeps commands scriptable from other
commands, keybindings and tests:

```ts
registerCommand(ctx, 'partLookup.findPart', async (queryArg?: unknown) => {
  const query = typeof queryArg === 'string' ? queryArg : await vscode.window.showInputBox({ prompt: 'Part number or name' });
  ...
});
```

Return values from commands when tests need to observe the result.

## Disposables and lifetimes

Everything that returns a `Disposable` — commands, event subscriptions, providers, status
bar items, panels, watchers, output channels — must end up in `context.subscriptions`, directly
or via an owner that is itself disposed. Event APIs accept the array as their third argument:

```ts
vscode.workspace.onDidChangeConfiguration(onConfigChange, undefined, ctx.extension.subscriptions);
```

Per-panel or per-document resources belong to that object's own disposable list, disposed in
its `onDidDispose`. `deactivate()` stays empty when ownership is right.

## Settings

- `package.json` is the single source of truth for keys, types and defaults. All keys share
  one prefix (the extension's camelCase ID).
- Read through `readSetting<T>(key, scope?)`, which throws if a key is missing from the
  manifest instead of inventing a second default in code.
- React to changes with `affectsSetting(event, key)`; re-read on demand rather than caching
  unless reads are hot.
- Pass a scope (`document.uri` / workspace folder) for `resource`-scoped settings so
  multi-root workspaces work.
- Settings that point at executables or URLs are security-relevant in untrusted workspaces:
  declare them in `capabilities.untrustedWorkspaces.restrictedConfigurations`.

## State and storage

| Need | Use | Notes |
| --- | --- | --- |
| User intent / preferences | Settings | Visible, syncable, documented in README |
| Small non-secret state (last choice, dismissed tips) | `workspaceState` / `globalState` | Plain JSON on disk; version the key (`partLookup.recent.v2`) |
| Tokens, passwords, keys | `context.secrets` | OS keychain; never Memento or settings |
| Caches, downloaded files, indexes | `context.storageUri` / `globalStorageUri` via `workspace.fs` | Create the directory first; may be undefined with no workspace |
| Sharing state across machines | `globalState.setKeysForSync([...])` | Only small, non-secret values |

When a stored shape changes, read the old key, migrate, write the new key, and delete the old
one; keep the migration for at least one minor release (REL-J02).

## File I/O, URIs, remote and multi-root

- Use `vscode.workspace.fs` and `vscode.Uri` for workspace files. It works for local, remote
  (SSH, WSL, containers), virtual (GitHub Repositories) and web workspaces; Node `fs` with
  `fsPath` only works for local disks and sync calls block the extension host.
- Handle "no folder open" (`workspaceFolders` undefined) and multi-root (pick the folder from
  the active editor or ask) explicitly.
- Build paths with `Uri.joinPath`; never concatenate strings with `/` or `\`.
- Confine paths derived from user or file input to the workspace (`SEC-J02`).

## Activation cost

Activation runs on the extension host's single thread, shared with every other extension.
Keep `activate()` to registration only. No network, prompts, file scans or large imports at
activation; load them lazily on first use (dynamic `import()` of a heavy module inside the
handler is fine with esbuild). Measure with **Developer: Show Running Extensions** (activation
time column). Avoid `onStartupFinished` unless the feature must react before any user action,
and record why in an ADR.

## Async, cancellation, progress

- No floating promises (lint rule). Fire-and-forget calls use `void` deliberately — e.g.
  `void vscode.window.showInformationMessage(...)`, whose promise only settles on dismissal.
- Providers, language model tools and long operations take a `CancellationToken`: check it
  between steps, pass it to APIs that accept it, and throw `vscode.CancellationError`.
- Anything that can take over ~1 s runs inside `vscode.window.withProgress` with
  `cancellable: true`.

## Logging

`ctx.log` is a `LogOutputChannel` (`createOutputChannel(name, { log: true })`): levels
(`trace`…`error`) follow the user's **Developer: Set Log Level**, and it is what users attach to
bug reports via the "Show Log" command. Log the operation, inputs that matter (never secrets
or personal data), and outcomes. `console.*` goes to the developer tools nobody opens.

## Adding a feature: checklist

```
- [ ] Contribution added to package.json (title + category, when-clauses)
- [ ] src/features/<name>/index.ts exports a Feature; added to src/features/index.ts
- [ ] Pure logic in src/core/ with unit tests that fail without it
- [ ] Commands via registerCommand(); disposables owned
- [ ] Settings declared with type/default/description; read via readSetting()
- [ ] Integration test covers registration and the happy path
- [ ] README (features/settings), CHANGELOG [Unreleased], AGENTS.md if conventions changed
- [ ] node scripts/gate.mjs --gate slice passes
```
