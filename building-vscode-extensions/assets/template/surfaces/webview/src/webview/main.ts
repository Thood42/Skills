// Browser code for the panel webview. Runs in VS Code's webview iframe: DOM available,
// no Node, no `vscode` module. Talks to the host only through the typed protocol.
import '@vscode-elements/elements/dist/vscode-button/index.js';
import '@vscode-elements/elements/dist/vscode-textfield/index.js';
import type { HostToWebview, WebviewToHost } from '../shared/protocol';
import { isHostToWebview, MAX_NAME_LENGTH } from '../shared/protocol';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PanelState {
  readonly name: string;
}

// acquireVsCodeApi may be called only once per webview lifetime.
const vscodeApi = acquireVsCodeApi();

function readState(): PanelState {
  const state = vscodeApi.getState() as Partial<PanelState> | undefined;
  return { name: typeof state?.name === 'string' ? state.name : '' };
}

function render(root: HTMLElement): void {
  const field = document.createElement('vscode-textfield') as HTMLElement & { value: string };
  field.setAttribute('placeholder', 'Name');
  field.setAttribute('maxlength', String(MAX_NAME_LENGTH));
  field.value = readState().name;

  const button = document.createElement('vscode-button');
  button.textContent = 'Greet';

  const output = document.createElement('p');
  output.id = 'output';

  button.addEventListener('click', () => {
    const name = field.value;
    vscodeApi.setState({ name } satisfies PanelState); // survives the panel being hidden
    vscodeApi.postMessage({ type: 'requestGreeting', name });
  });

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message: unknown = event.data;
    if (!isHostToWebview(message)) {
      return;
    }
    handle(message, output);
  });

  root.append(field, button, output);
}

function handle(message: HostToWebview, output: HTMLElement): void {
  switch (message.type) {
    case 'greeting':
      output.textContent = message.text; // textContent, never innerHTML: host data is not markup
      output.classList.remove('error');
      return;
    case 'error':
      output.textContent = message.message;
      output.classList.add('error');
      return;
  }
}

const root = document.getElementById('app');
if (root) {
  render(root);
  vscodeApi.postMessage({ type: 'ready' });
}
