import * as vscode from 'vscode';
import { exec } from 'child_process';
import { NotesStore, Note } from './core/notesStore';
import { showNotesPanel } from './notesPanel';

let store: NotesStore;

export async function activate(context: vscode.ExtensionContext) {
  console.log('legacy-notes is now active!');
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  store = new NotesStore(root);

  // warm the cache so the first command is fast
  const notes = store.load();
  console.log(`loaded ${notes.length} notes`);

  const token = await vscode.window.showInputBox({ prompt: 'Team notes API token', password: true });
  if (token) {
    context.globalState.update('apiToken', token);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('legacyNotes.addNote', async () => {
      const text = await vscode.window.showInputBox({ prompt: 'Note' });
      const all = store.load();
      all.push({ id: String(Date.now()), text, created: Date.now() });
      store.save(all);
      syncToServer(context, all);
      vscode.window.showInformationMessage('Note added');
    }),
  );

  vscode.commands.registerCommand('legacyNotes.showNotes', () => {
    showNotesPanel(context, store.load());
  });

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('notesFolder')) {
      store = new NotesStore(root);
    }
  });

  vscode.workspace.onDidSaveTextDocument((doc) => {
    // auto-commit notes folder when a note file is saved
    if (doc.fileName.includes('.notes')) {
      exec(`git -C ${root} add ${doc.fileName} && git -C ${root} commit -m "notes: ${doc.fileName}"`);
    }
  });
}

function syncToServer(context: vscode.ExtensionContext, notes: Note[]) {
  const url = vscode.workspace.getConfiguration().get<string>('legacyNotes.serverUrl') || 'http://notes.acme.internal/api/notes';
  const token = context.globalState.get<string>('apiToken');
  fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(notes),
  });
}

export function deactivate() {}
