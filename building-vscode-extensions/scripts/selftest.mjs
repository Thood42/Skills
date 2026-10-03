#!/usr/bin/env node
// Regression test for this skill itself (run after changing the template, checker or rubric):
//   node scripts/selftest.mjs
// 1. Every vsx-check rule ID is documented in references/review-rubric.md and vice versa.
// 2. Freshly scaffolded repos (no surfaces / all surfaces) pass the release-gate rules clean.
// 3. Each mutation of a clean repo triggers the rule written to catch it.
// Offline-safe: scaffolds with --deps pinned --no-install. Does not run npm scripts; use
// gate.mjs on a real scaffold for that.

import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './vsx-check.mjs';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

// 1. Rubric <-> checker
const ruleIds = JSON.parse(execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'vsx-check.mjs'), '--list-rules', '--json'], { encoding: 'utf8' })).map((r) => r.id);
const rubric = readFileSync(join(SKILL_DIR, 'references', 'review-rubric.md'), 'utf8');
const documented = [...rubric.matchAll(/^\| ((?:MAN|AI|ARC|TS|SEC|DEP|BRW|TST|PKG|DOC)-\d{3}) \|/gm)].map((m) => m[1]);
check(ruleIds.every((id) => documented.includes(id)), `all ${ruleIds.length} checker rules are in the rubric`);
check(documented.every((id) => ruleIds.includes(id)), 'rubric lists no unknown mechanical rules');

// 2. Clean scaffolds
const work = mkdtempSync(join(tmpdir(), 'vsx-selftest-'));
function scaffold(name, surfaces) {
  const dir = join(work, name);
  const args = [join(SKILL_DIR, 'scripts', 'scaffold.mjs'), '--dir', dir, '--name', name, '--publisher', 'selftest', '--deps', 'pinned', '--no-install', '--no-git'];
  if (surfaces.length) args.push('--surfaces', surfaces.join(','));
  execFileSync(process.execPath, args, { stdio: 'pipe' });
  return dir;
}
const coreDir = scaffold('core-only', []);
const fullDir = scaffold('all-surfaces', ['webview', 'ai', 'web']);
for (const dir of [coreDir, fullDir]) {
  const r = evaluate(dir, { gate: 'release' });
  check(r.findings.length === 0, `${dir.split(/[\\/]/).pop()} scaffold is clean at the release gate${r.findings.length ? `: ${r.findings.map((f) => f.rule).join(', ')}` : ''}`);
}

// 3. Mutations: each must trigger its rule
const edit = (file, fn) => (dir) => writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));
const pkg = (fn) => edit('package.json', (t) => JSON.stringify(fn(JSON.parse(t)), null, 2));
const append = (file, text) => (dir) => appendFileSync(join(dir, file), text);
const MUTATIONS = [
  ['MAN-002', 'core', pkg((p) => ({ ...p, devDependencies: { ...p.devDependencies, '@types/vscode': '9.9.9' } }))],
  ['MAN-003', 'core', pkg((p) => ({ ...p, activationEvents: ['*'] }))],
  ['MAN-006', 'core', pkg((p) => ({ ...p, contributes: { ...p.contributes, commands: [...p.contributes.commands, { command: 'x.ghost', title: 'Ghost', category: 'X' }] } }))],
  ['MAN-015', 'core', pkg((p) => ({ ...p, version: '1.0.0-beta.1' }))],
  ['AI-001', 'full', pkg((p) => ({ ...p, contributes: { ...p.contributes, languageModelTools: [...p.contributes.languageModelTools, { name: 'x_get_ghost', displayName: 'G', modelDescription: 'm', userDescription: 'u', inputSchema: {} }] } }))],
  ['ARC-001', 'core', append('src/core/greeting.ts', "\nimport * as vscode from 'vscode';\nexport const v = vscode.version;\n")],
  ['ARC-002', 'core', append('src/core/errors.ts', "\nimport { registerCommand } from '../platform/commands';\nexport const r = registerCommand;\n")],
  ['ARC-004', 'core', append('src/features/hello/index.ts', "\nimport { readFileSync } from 'fs';\nexport const read = () => readFileSync('x');\n")],
  ['ARC-006', 'core', append('src/features/hello/index.ts', "\nexport const save = (c: { globalState: { update(k: string, v: string): void } }, t: string) => c.globalState.update('apiToken', t);\n")],
  ['TS-001', 'core', edit('tsconfig.json', (t) => t.replace('"strict": true', '"strict": false'))],
  ['SEC-003', 'full', edit('src/features/panel/panelHtml.ts', (t) => t.replace(/Content-Security-Policy/g, 'X-Removed'))],
  ['SEC-005', 'full', append('src/webview/main.ts', "\ndocument.body.innerHTML = '<b>x</b>';\n")],
  ['BRW-001', 'full', append('src/features/hello/index.ts', "\nimport * as os from 'os';\nexport const h = os.hostname;\n")],
  ['TST-001', 'core', edit('src/test/unit/greeting.test.ts', (t) => t.replace("it('greets", "it.only('greets"))],
  ['PKG-001', 'core', (dir) => rmSync(join(dir, '.vscodeignore'))],
  ['DOC-001', 'core', pkg((p) => ({ ...p, version: '0.2.0' }))],
];
for (const [rule, base, mutate] of MUTATIONS) {
  const dir = join(work, `mut-${rule}`);
  cpSync(base === 'core' ? coreDir : fullDir, dir, { recursive: true });
  mutate(dir);
  const hits = evaluate(dir, { gate: 'release' }).findings.map((f) => f.rule);
  check(hits.includes(rule), `${rule} fires on its mutation${hits.includes(rule) ? '' : ` (got: ${hits.join(', ') || 'nothing'})`}`);
}

rmSync(work, { recursive: true, force: true });
console.log(failures.length ? `\n${failures.length} selftest failure(s)` : '\nselftest passed');
process.exitCode = failures.length ? 1 : 0;
