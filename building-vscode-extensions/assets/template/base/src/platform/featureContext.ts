import * as vscode from 'vscode';

/** Services every feature receives. Add shared services here, not as module-level singletons. */
export interface FeatureContext {
  readonly extension: vscode.ExtensionContext;
  /** Structured log in the Output panel; respects the user's log level. */
  readonly log: vscode.LogOutputChannel;
  readonly displayName: string;
  readonly version: string;
}

/** A feature owns one slice of the manifest (commands, views, tools...) and registers it here. */
export interface Feature {
  readonly id: string;
  register(ctx: FeatureContext): void;
}

interface ManifestIdentity {
  readonly displayName?: string;
  readonly version?: string;
}

export function createFeatureContext(extension: vscode.ExtensionContext): FeatureContext {
  const manifest = extension.extension.packageJSON as ManifestIdentity;
  const displayName = manifest.displayName ?? extension.extension.id;
  const log = vscode.window.createOutputChannel(displayName, { log: true });
  extension.subscriptions.push(log);
  return { extension, log, displayName, version: manifest.version ?? '0.0.0' };
}
