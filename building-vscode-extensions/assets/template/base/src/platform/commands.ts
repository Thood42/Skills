import * as vscode from 'vscode';
import { describeError } from '../core/errors';
import type { FeatureContext } from './featureContext';

const SHOW_LOG = 'Show Log';

export type CommandHandler = (...args: unknown[]) => unknown;

/**
 * Registers a command behind a uniform error boundary. Failures are logged with their stack and
 * surfaced once to the user, instead of vanishing as unhandled rejections in the extension host.
 * The disposable is owned by context.subscriptions.
 */
export function registerCommand(ctx: FeatureContext, id: string, handler: CommandHandler): void {
  ctx.extension.subscriptions.push(
    vscode.commands.registerCommand(id, async (...args: unknown[]): Promise<unknown> => {
      try {
        return await handler(...args);
      } catch (error) {
        ctx.log.error(`Command ${id} failed: ${describeError(error)}`, error);
        void vscode.window
          .showErrorMessage(`${ctx.displayName}: ${describeError(error)}`, SHOW_LOG)
          .then((choice) => {
            if (choice === SHOW_LOG) {
              ctx.log.show(true);
            }
          });
        return undefined;
      }
    }),
  );
}
