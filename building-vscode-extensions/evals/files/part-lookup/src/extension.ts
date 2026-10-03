import type * as vscode from 'vscode';
import { FEATURES } from './features';
import { createFeatureContext } from './platform/featureContext';

/**
 * Composition root. Keep this file thin: build platform services, register features, nothing else.
 * Feature logic lives in src/features/<name>/, pure logic in src/core/.
 */
export function activate(context: vscode.ExtensionContext): void {
  const ctx = createFeatureContext(context);
  ctx.log.info(`Activating ${context.extension.id} ${ctx.version}`);
  for (const feature of FEATURES) {
    feature.register(ctx);
  }
}

export function deactivate(): void {
  // Intentionally empty: every disposable is owned by context.subscriptions.
}
