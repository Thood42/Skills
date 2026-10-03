import * as vscode from 'vscode';
import { describeError } from '../../core/errors';
import { formatGreeting } from '../../core/greeting';
import { registerCommand } from '../../platform/commands';
import type { Feature, FeatureContext } from '../../platform/featureContext';
import { readSetting } from '../../platform/settings';
import type { HostToWebview, WebviewToHost } from '../../shared/protocol';
import { isWebviewToHost } from '../../shared/protocol';
import { renderPanelHtml } from './panelHtml';

const VIEW_TYPE = '{{ID}}.panel';

/** Single-instance panel: reveal the existing one instead of stacking duplicates. */
let current: vscode.WebviewPanel | undefined;

export const panelFeature: Feature = {
  id: 'panel',
  register(ctx) {
    registerCommand(ctx, '{{ID}}.openPanel', () => {
      if (current) {
        current.reveal();
        return;
      }
      current = createPanel(ctx);
      current.onDidDispose(() => (current = undefined), undefined, ctx.extension.subscriptions);
    });
  },
};

function createPanel(ctx: FeatureContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(VIEW_TYPE, ctx.displayName, vscode.ViewColumn.Active, {
    enableScripts: true,
    // Only the bundle and stylesheet are loadable; nothing else from disk.
    localResourceRoots: [
      vscode.Uri.joinPath(ctx.extension.extensionUri, 'dist'),
      vscode.Uri.joinPath(ctx.extension.extensionUri, 'media'),
    ],
  });
  panel.webview.html = renderPanelHtml(panel.webview, ctx.extension.extensionUri, ctx.displayName);

  const post = (message: HostToWebview): void => {
    void panel.webview.postMessage(message);
  };

  panel.webview.onDidReceiveMessage((raw: unknown) => {
    if (!isWebviewToHost(raw)) {
      ctx.log.warn('Ignoring malformed message from panel webview', raw);
      return;
    }
    handleMessage(raw, post, ctx);
  });
  return panel;
}

function handleMessage(message: WebviewToHost, post: (m: HostToWebview) => void, ctx: FeatureContext): void {
  switch (message.type) {
    case 'ready':
      ctx.log.debug('Panel webview ready');
      return;
    case 'requestGreeting':
      try {
        post({ type: 'greeting', text: formatGreeting(readSetting<string>('greeting'), message.name) });
      } catch (error) {
        post({ type: 'error', message: describeError(error) });
      }
      return;
  }
}
