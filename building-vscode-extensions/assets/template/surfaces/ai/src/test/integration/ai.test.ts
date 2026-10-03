import * as assert from 'node:assert/strict';
import { before, describe, it } from 'mocha';
import * as vscode from 'vscode';

const TOOL = '{{ID_SNAKE}}_get_workspace_summary';

describe('language model tools', () => {
  before(async () => {
    await vscode.extensions.getExtension('{{PUBLISHER}}.{{EXT_NAME}}')?.activate();
  });

  it('registers every tool contributed in package.json', () => {
    const registered = new Set(vscode.lm.tools.map((t) => t.name));
    assert.ok(registered.has(TOOL), `${TOOL} is contributed but not registered`);
  });

  it('returns a summary naming the test workspace folder', async () => {
    const result = await vscode.lm.invokeTool(TOOL, { input: {}, toolInvocationToken: undefined });
    const text = result.content
      .filter((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)
      .map((part) => part.value)
      .join('');
    assert.match(text, /workspace folder\(s\) open/);
  });
});
