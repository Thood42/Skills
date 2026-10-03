# Webviews

## Contents
- Decide first: native UI or webview
- Panel, view, or custom editor
- Security model (CSP, resources, messages)
- Message protocol
- State and lifecycle
- UI toolkit, theming, accessibility
- Testing
- Checklist

## Decide first: native UI or webview

Webviews cost memory, startup time, accessibility work, security review and a second build
target. Use native UI when it can express the interaction (UX-J01):

| Interaction | Native option |
| --- | --- |
| Pick one of N items, search a list | `window.createQuickPick` |
| Hierarchical browse, actions per item | Tree view (`TreeDataProvider`) |
| Short status / progress | Status bar item, `withProgress` |
| Show results as text/table | Virtual document (`TextDocumentContentProvider`) or markdown preview |
| Annotations in code | Decorations, CodeLens, hovers, diagnostics |

A webview is right for rich, interactive visual content: forms with live validation,
charts, diagrams, previews.

## Panel, view, or custom editor

- **WebviewPanel** (`createWebviewPanel`): an editor tab. Keep one instance and `reveal()` it.
- **WebviewView** (`registerWebviewViewProvider` + `contributes.views` type `webview`): in the
  sidebar/panel next to other views.
- **CustomEditor** (`registerCustomEditorProvider`): editing a file type visually; the document
  stays the source of truth.

## Security model (CSP, resources, messages)

The webview is less trusted than the extension host: it renders data, and data can be hostile.

- One HTML builder per webview (`panelHtml.ts` in the template). CSP starts at
  `default-src 'none'`, re-enables only `style-src`/`font-src`/`img-src` from
  `webview.cspSource`, and scripts only with a fresh nonce: `script-src 'nonce-<nonce>'`. No
  `'unsafe-eval'`, no inline scripts without the nonce (SEC-003).
- `enableScripts: true` only when needed, always with narrow `localResourceRoots`
  (`dist/`, `media/`) (SEC-004). Load files via `webview.asWebviewUri`.
- Never interpolate data into HTML. Send data with `postMessage` after load and render it with
  DOM APIs and `textContent` (SEC-005, SEC-J04). Embedding `JSON.stringify(data)` inside a
  `<script>` breaks on `</script>` in the data.
- Validate every inbound message before acting on it (SEC-J02).

## Message protocol

Define both directions as discriminated unions in `src/shared/protocol.ts`, with type guards,
and use them on both sides:

```ts
export type WebviewToHost = { readonly type: 'ready' } | { readonly type: 'requestGreeting'; readonly name: string };
export type HostToWebview = { readonly type: 'greeting'; readonly text: string } | { readonly type: 'error'; readonly message: string };
export function isWebviewToHost(value: unknown): value is WebviewToHost { /* check type + fields + bounds */ }
```

Host side: `panel.webview.onDidReceiveMessage((raw: unknown) => { if (!isWebviewToHost(raw)) { log.warn(...); return; } handle(raw); })`,
with `handle` a `switch` over `type` so TypeScript flags unhandled messages. Unit-test the
guards (`src/test/unit/protocol.test.ts`).

## State and lifecycle

- Webview content is destroyed when hidden unless `retainContextWhenHidden` (memory-heavy;
  SEC-006). Persist UI state with `acquireVsCodeApi().setState()` / `getState()` instead.
- To restore panels after a reload, register a `WebviewPanelSerializer` and add
  `onWebviewPanel:<viewType>` to `activationEvents`.
- `acquireVsCodeApi()` may be called once per webview; keep the handle in a module variable.
- Own the panel's listeners in its own disposables; clear the single-instance reference in
  `onDidDispose`.

## UI toolkit, theming, accessibility

- Components: `@vscode-elements/elements` (web components matching VS Code's look). The
  Microsoft `@vscode/webview-ui-toolkit` is deprecated and unmaintained (DEP-001). Import only
  the components you use (`@vscode-elements/elements/dist/vscode-button/index.js`) to keep the
  bundle small.
- Colours and fonts only from CSS variables (`var(--vscode-foreground)`,
  `var(--vscode-errorForeground)`, `var(--vscode-font-family)`); test light, dark and high
  contrast themes. The body carries `vscode-light` / `vscode-dark` / `vscode-high-contrast`
  classes.
- Respect `vscode-reduce-motion` and `prefers-reduced-motion`; use landmarks and
  `aria-live` for updates; everything reachable by keyboard (UX-J05).

## Testing

- Unit: protocol guards and any rendering logic you keep in pure functions.
- Integration: the command opens exactly one panel and reuses it (see the template's
  `panel.test.ts`); the host answers protocol messages correctly (factor `handleMessage` so it
  can be called with a fake `post`).
- Manual: F5 → open the panel → **Developer: Open Webview Developer Tools** to check the
  console for CSP violations.

## Checklist

```
- [ ] Native UI considered and rejected for a stated reason
- [ ] One HTML builder; CSP default-src 'none' + nonce; no inline handlers
- [ ] localResourceRoots narrowed; resources via asWebviewUri
- [ ] Protocol unions + guards in src/shared; inbound validated
- [ ] No data interpolated into HTML; textContent rendering
- [ ] State via setState/getState; serializer if restore matters
- [ ] Theme variables only; keyboard + screen reader checked
```
