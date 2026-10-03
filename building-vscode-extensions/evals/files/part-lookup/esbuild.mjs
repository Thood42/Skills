// Bundles the extension with esbuild. tsc does type checking separately (`npm run check-types`);
// esbuild only strips types.
//
// Targets switch on by manifest/file presence, so adding a surface (webview, web) never requires
// editing this file:
//   extension:node  <- package.json "main"
//   extension:web   <- package.json "browser"
//   webview         <- src/webview/main.ts exists
//   web-tests       <- package.json "browser" + `--web-tests` flag (browser test suite -> out/, never shipped)
import * as esbuild from 'esbuild';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const webTests = process.argv.includes('--web-tests');
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GUESS: oldest Node major across the desktop extension hosts we support (VS Code at the
// engines.vscode floor). Raise it only when the floor moves past a VS Code release that
// upgraded Electron's Node; a too-new target emits syntax older hosts cannot parse.
const NODE_TARGET = 'node22';
// Webviews and the web extension host run in VS Code's Chromium; es2022 sits well below
// every Chromium shipped by supported VS Code versions.
const BROWSER_TARGET = 'es2022';

/** @type {{ name: string; enabled: boolean; options: esbuild.BuildOptions }[]} */
const targets = [
  {
    name: 'extension:node',
    enabled: typeof pkg.main === 'string',
    options: {
      entryPoints: ['src/extension.ts'],
      outfile: pkg.main,
      platform: 'node',
      format: 'cjs',
      target: NODE_TARGET,
      external: ['vscode'],
    },
  },
  {
    name: 'extension:web',
    enabled: typeof pkg.browser === 'string',
    options: {
      entryPoints: ['src/extension.ts'],
      outfile: pkg.browser,
      platform: 'browser',
      format: 'cjs',
      target: BROWSER_TARGET,
      external: ['vscode'],
    },
  },
  {
    name: 'webview',
    enabled: existsSync('src/webview/main.ts'),
    options: {
      entryPoints: ['src/webview/main.ts'],
      outfile: 'dist/webview.js',
      platform: 'browser',
      format: 'iife',
      target: BROWSER_TARGET,
    },
  },
  {
    name: 'web-tests',
    enabled: webTests && typeof pkg.browser === 'string' && existsSync('src/test/web/index.ts'),
    options: {
      entryPoints: ['src/test/web/index.ts'],
      outfile: 'out/web/test/index.js',
      platform: 'browser',
      format: 'cjs',
      target: BROWSER_TARGET,
      external: ['vscode'],
    },
  },
];

/** Prints errors in the format the connor4312.esbuild-problem-matchers extension parses in watch mode. */
const problemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const active = targets.filter((t) => t.enabled && !(webTests && t.name !== 'web-tests'));
  if (active.length === 0) {
    throw new Error('No build targets enabled: package.json needs "main" and/or "browser".');
  }
  const contexts = await Promise.all(
    active.map((t) =>
      esbuild.context({
        bundle: true,
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        logLevel: 'warning',
        plugins: watch ? [problemMatcherPlugin] : [],
        ...t.options,
      }),
    ),
  );
  if (production && !webTests) {
    // Start from an empty dist/ so stale dev artifacts (source maps, removed entries) never ship.
    rmSync('dist', { recursive: true, force: true });
  }
  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    return;
  }
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
