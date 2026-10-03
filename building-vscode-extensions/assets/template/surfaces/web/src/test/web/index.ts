/// <reference types="mocha" />
// Browser test runner for @vscode/test-web. Bundled by `node esbuild.mjs --web-tests` into
// out/web/test/index.js (never shipped) and loaded by the web extension host.

// Defines the global `mocha` (browser build).
import 'mocha/mocha';

export function run(): Promise<void> {
  mocha.setup({ ui: 'bdd', reporter: undefined });
  // Test files are required after setup so their describe/it calls register with this mocha instance.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./extension.web.test');
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures > 0 ? reject(new Error(`${failures} web test(s) failed.`)) : resolve()));
  });
}
