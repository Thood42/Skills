import * as assert from 'node:assert/strict';
import { before, describe, it } from 'mocha';
import * as vscode from 'vscode';

const EXTENSION_ID = 'acme-devtools.part-lookup';

interface ContributedCommand {
  readonly command: string;
}

function getExtension(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} is not installed in the test instance`);
  return extension;
}

describe('extension', () => {
  before(async () => {
    await getExtension().activate();
  });

  it('registers every command contributed in package.json', async () => {
    const manifest = getExtension().packageJSON as { contributes?: { commands?: ContributedCommand[] } };
    const contributed = (manifest.contributes?.commands ?? []).map((c) => c.command);
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = contributed.filter((id) => !registered.has(id));
    assert.deepEqual(missing, [], 'Contributed but never registered (would fail with "command not found")');
  });

  it('helloWorld uses the configured greeting', async () => {
    const result = await vscode.commands.executeCommand<string>('partLookup.helloWorld', 'Ada');
    assert.equal(result, 'Hello, Ada!');
  });
});
