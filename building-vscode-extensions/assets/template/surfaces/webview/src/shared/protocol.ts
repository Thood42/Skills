// Message protocol between the extension host and the panel webview.
// Shared by both sides; must stay free of `vscode` and DOM APIs.
//
// Inbound messages come from a less-trusted context (webview content), so the host validates
// every message with the type guard before acting on it.

export type WebviewToHost =
  | { readonly type: 'ready' }
  | { readonly type: 'requestGreeting'; readonly name: string };

export type HostToWebview =
  | { readonly type: 'greeting'; readonly text: string }
  | { readonly type: 'error'; readonly message: string };

/** Upper bound on user-supplied text crossing the boundary; a greeting name has no reason to be longer. */
export const MAX_NAME_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'ready':
      return true;
    case 'requestGreeting':
      return typeof value.name === 'string' && value.name.length <= MAX_NAME_LENGTH;
    default:
      return false;
  }
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'greeting':
      return typeof value.text === 'string';
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
  }
}
