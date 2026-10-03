// REFERENCE TOOL logic. Pure: takes plain data, returns the text the language model will read.

export interface FolderInfo {
  readonly name: string;
  readonly uri: string;
}

export function summarizeWorkspace(folders: readonly FolderInfo[]): string {
  if (folders.length === 0) {
    return 'No folder is open in this VS Code window. Ask the user to open a folder or workspace first.';
  }
  const lines = folders.map((f, i) => `${i + 1}. ${f.name} (${f.uri})`);
  return [`${folders.length} workspace folder(s) open:`, ...lines].join('\n');
}
