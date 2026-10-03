/// <reference types="mocha" />
// Runs inside the web extension host (browser worker): no Node built-ins, so no node:assert.
import * as vscode from 'vscode';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

describe('web extension', () => {
  before(async () => {
    await vscode.extensions.getExtension('{{PUBLISHER}}.{{EXT_NAME}}')?.activate();
  });

  it('registers every contributed command in the web host', async () => {
    const extension = vscode.extensions.getExtension('{{PUBLISHER}}.{{EXT_NAME}}');
    check(extension, 'extension not found in web host');
    const manifest = extension.packageJSON as { contributes?: { commands?: { command: string }[] } };
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = (manifest.contributes?.commands ?? []).map((c) => c.command).filter((id) => !registered.has(id));
    check(missing.length === 0, `not registered in web host: ${missing.join(', ')}`);
  });

  it('helloWorld works without Node APIs', async () => {
    const result = await vscode.commands.executeCommand<string>('{{ID}}.helloWorld', 'Ada');
    check(result === 'Hello, Ada!', `unexpected greeting: ${String(result)}`);
  });
});
