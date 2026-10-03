import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Note {
  id: string;
  text: string;
  created: number;
}

export class NotesStore {
  constructor(private readonly root: string) {}

  load(): Note[] {
    const file = path.join(this.root, notesFolder(), 'notes.json');
    if (!fs.existsSync(file)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  save(notes: Note[]): void {
    const dir = path.join(this.root, notesFolder());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'notes.json'), JSON.stringify(notes, null, 2));
  }
}

function notesFolder(): string {
  return vscode.workspace.getConfiguration().get('notesFolder');
}
