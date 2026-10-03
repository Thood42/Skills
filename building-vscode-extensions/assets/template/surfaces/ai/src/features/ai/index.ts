import * as vscode from 'vscode';
import { summarizeWorkspace } from '../../core/workspaceSummary';
import type { Feature } from '../../platform/featureContext';

/** Must equal contributes.languageModelTools[].name in package.json. */
export const WORKSPACE_SUMMARY_TOOL = '{{ID_SNAKE}}_get_workspace_summary';

type NoInput = Record<string, never>;

/**
 * REFERENCE TOOL: read-only, so no confirmation is requested. A tool that changes anything
 * (files, settings, external systems) must return confirmationMessages from prepareInvocation.
 */
class WorkspaceSummaryTool implements vscode.LanguageModelTool<NoInput> {
  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Listing workspace folders' };
  }

  invoke(
    _options: vscode.LanguageModelToolInvocationOptions<NoInput>,
    token: vscode.CancellationToken,
  ): vscode.LanguageModelToolResult {
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, uri: f.uri.toString() }));
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(summarizeWorkspace(folders))]);
  }
}

export const aiFeature: Feature = {
  id: 'ai',
  register(ctx) {
    ctx.extension.subscriptions.push(vscode.lm.registerTool(WORKSPACE_SUMMARY_TOOL, new WorkspaceSummaryTool()));
  },
};
