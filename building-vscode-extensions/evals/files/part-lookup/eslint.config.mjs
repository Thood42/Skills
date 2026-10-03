// @ts-check
// Lint rules double as architecture enforcement: the layer boundaries below are what keep
// src/core unit-testable without VS Code and the web build free of Node built-ins.
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { readFileSync } from 'node:fs';
import tseslint from 'typescript-eslint';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const runsInBrowser = typeof pkg.browser === 'string';

const NODE_BUILTINS = ['fs', 'fs/promises', 'path', 'os', 'child_process', 'net', 'http', 'https', 'crypto', 'util', 'stream', 'worker_threads'];

export default defineConfig(
  {
    ignores: ['dist/**', 'out/**', 'dist-vsix/**', '.vscode-test/**', '.vscode-test-web/**', 'tools/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      curly: 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Layer rule: core is pure logic. No VS Code API, no platform adapters, no features.
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'vscode', message: 'src/core must stay host-agnostic; put VS Code calls in src/platform or a feature.' }],
          patterns: [{ group: ['**/platform/**', '**/features/**'], message: 'src/core may not depend on outer layers.' }],
        },
      ],
    },
  },
  {
    // Layer rule: platform adapters never reach into features.
    files: ['src/platform/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/features/**'], message: 'src/platform may not depend on features.' }] },
      ],
    },
  },
  ...(runsInBrowser
    ? [
        {
          // Web extension: shared code runs in a web worker. Node-only code lives in src/node/.
          files: ['src/**/*.ts'],
          ignores: ['src/node/**', 'src/test/unit/**', 'src/test/integration/**'],
          rules: {
            'no-restricted-imports': [
              'error',
              {
                paths: NODE_BUILTINS.map((name) => ({ name, message: 'Not available in the web extension host; use vscode.workspace.fs or move to src/node/.' })),
                patterns: [{ group: ['node:*'], message: 'Node built-ins are not available in the web extension host.' }],
              },
            ],
          },
        },
      ]
    : []),
  {
    // Build and config scripts run in Node.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' } },
  },
);
