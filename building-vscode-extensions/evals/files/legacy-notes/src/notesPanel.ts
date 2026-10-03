import * as vscode from 'vscode';
import { Note } from './core/notesStore';

export function showNotesPanel(context: vscode.ExtensionContext, notes: Note[]) {
  const panel = vscode.window.createWebviewPanel('legacyNotes', 'Notes', vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  const items = notes.map((n) => `<li>${n.text}</li>`).join('');
  panel.webview.html = `<!DOCTYPE html>
<html>
<body>
  <ul id="notes">${items}</ul>
  <input id="filter" placeholder="Filter" />
  <script>
    const all = ${JSON.stringify(notes)};
    document.getElementById('filter').addEventListener('input', (e) => {
      const q = e.target.value;
      document.getElementById('notes').innerHTML = all
        .filter((n) => n.text.includes(q))
        .map((n) => '<li>' + n.text + '</li>')
        .join('');
    });
  </script>
</body>
</html>`;
}
