import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test.only('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
  });

  test('commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes('legacyNotes.addNote'));
  });
});
