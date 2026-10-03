import * as assert from 'node:assert/strict';
import { after, describe, it } from 'mocha';
import * as vscode from 'vscode';

describe('panel feature', () => {
  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('opens a single webview panel and reuses it on repeat', async () => {
    await vscode.commands.executeCommand('{{ID}}.openPanel');
    await vscode.commands.executeCommand('{{ID}}.openPanel');
    const panels = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('{{ID}}.panel'));
    assert.equal(panels.length, 1);
  });
});
