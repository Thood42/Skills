import * as vscode from 'vscode';
import { formatGreeting } from '../../core/greeting';
import { registerCommand } from '../../platform/commands';
import type { Feature } from '../../platform/featureContext';
import { readSetting } from '../../platform/settings';

/**
 * REFERENCE FEATURE: demonstrates the layering (manifest -> feature -> platform -> core).
 * Delete it when the first real feature lands: this folder, src/core/greeting.ts, its tests,
 * the command + setting in package.json, and its entry in src/features/index.ts.
 */
export const helloFeature: Feature = {
  id: 'hello',
  register(ctx) {
    // Accepting the name as an argument keeps the command scriptable and testable without UI.
    registerCommand(ctx, '{{ID}}.helloWorld', async (nameArg?: unknown) => {
      const name =
        typeof nameArg === 'string'
          ? nameArg
          : await vscode.window.showInputBox({ prompt: 'Who should be greeted?', placeHolder: 'world' });
      const message = formatGreeting(readSetting<string>('greeting'), name);
      ctx.log.info(`helloWorld -> ${message}`);
      // Not awaited: the promise only settles when the user dismisses the notification.
      void vscode.window.showInformationMessage(message);
      return message;
    });
  },
};
