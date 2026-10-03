// Integration tests run inside a real VS Code Extension Host via @vscode/test-cli.
//   stable -> what users get today; runs on every PR.
//   floor  -> the oldest VS Code allowed by engines.vscode; catches use of APIs newer than the
//             declared floor. Run before every release (`npm run test:integration:floor`).
import { defineConfig } from '@vscode/test-cli';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const floorVersion = String(pkg.engines.vscode).replace(/^[\^~>=\s]+/, '');

const shared = {
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: './test-fixtures/workspace',
  // GUESS: cold Extension Host start on hosted CI agents can exceed 10s; 20s avoids flaky first tests.
  mocha: { ui: 'bdd', timeout: 20_000 },
};

export default defineConfig([
  { label: 'stable', version: 'stable', ...shared },
  { label: 'floor', version: floorVersion, ...shared },
]);
