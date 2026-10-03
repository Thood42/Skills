#!/usr/bin/env node
// Runs the mechanical half of a review gate and writes the gate report skeleton.
// Zero dependencies; Node >= 20.
//
//   node gate.mjs --gate baseline|slice|release [--repo .] [--slug <name>] [--skip <step,...>] [--no-report]
//
// Steps run through the repo's own npm scripts so the gate checks exactly what CI checks.
// The judgment half of the review is filled into the report afterwards (workflows/review-gates.md).
// Exit codes: 0 = mechanical pass, 1 = blocked, 2 = usage error, 3 = incomplete (steps skipped).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKER_VERSION, evaluate } from './vsx-check.mjs';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';
// Lines of output kept from a failing step; enough to show the error without flooding the report.
const FAILURE_TAIL_LINES = 40;

const PLAN = {
  baseline: ['check-types', 'lint', 'vsx-check', 'test:unit', 'test:integration', 'test:web', 'package:vsix'],
  slice: ['check-types', 'lint', 'vsx-check', 'test:unit', 'test:integration', 'test:web'],
  release: ['check-types', 'lint', 'vsx-check', 'test:unit', 'test:integration', 'test:integration:floor', 'test:web', 'package:vsix'],
};
// Steps whose npm script is optional (only some repos have them).
const OPTIONAL = new Set(['test:web', 'test:integration:floor']);
const NEEDS_DISPLAY = new Set(['test:integration', 'test:integration:floor']);
// Steps that download VS Code before any test runs. If the download fails, no test result
// exists: the step is NOT RUN (gate INCOMPLETE), which is different from failing tests.
const DOWNLOADS_VSCODE = new Set(['test:integration', 'test:integration:floor', 'test:web']);
const DOWNLOAD_FAILURE = /Failed to (?:download|parse response|get content)|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|tunnel(?:ing)? (?:socket|failed)|status code:? 40[37]/i;
const TEST_SUMMARY = /\d+ passing|\d+ failing/;

function parseArgs(argv) {
  const args = { repo: process.cwd(), skip: new Set(), report: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--gate') args.gate = argv[++i];
    else if (a === '--repo') args.repo = resolve(argv[++i]);
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--skip') argv[++i].split(',').forEach((s) => args.skip.add(s.trim()));
    else if (a === '--no-report') args.report = false;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: gate.mjs --gate baseline|slice|release [--repo .] [--slug name] [--skip step,...] [--no-report]');
      process.exit(0);
    } else {
      console.error(`gate: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!PLAN[args.gate]) {
    console.error(`gate: --gate must be one of ${Object.keys(PLAN).join(', ')}`);
    process.exit(2);
  }
  if (args.slug && !/^[a-z0-9][a-z0-9-]*$/.test(args.slug)) {
    console.error('gate: --slug must be lowercase kebab-case');
    process.exit(2);
  }
  return args;
}

function runStep(cmd, args, cwd) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, shell: IS_WINDOWS, env: { ...process.env, FORCE_COLOR: '0' } });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output, ms: Date.now() - started }));
    child.on('error', (error) => resolvePromise({ code: 1, output: String(error), ms: Date.now() - started }));
  });
}

async function hasCommand(name) {
  const probe = await runStep(IS_WINDOWS ? 'where' : 'which', [name], process.cwd());
  return probe.code === 0;
}

function vendoredCheckerNote(repo) {
  const vendored = join(repo, 'tools', 'vsx-check.mjs');
  if (!existsSync(vendored)) {
    return ' (repo has no tools/vsx-check.mjs; CI does not enforce these rules)';
  }
  const m = readFileSync(vendored, 'utf8').match(/CHECKER_VERSION = '([^']+)'/);
  const v = m?.[1] ?? 'unknown';
  return v === CHECKER_VERSION ? '' : ` (repo vendors ${v}; update tools/vsx-check.mjs from the skill so CI matches)`;
}

function formatFindings(result) {
  if (result.findings.length === 0) {
    return 'None.';
  }
  const order = { blocker: 0, major: 1, minor: 2 };
  const rows = [...result.findings]
    .sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule))
    .map((f) => `| ${f.waived ? `~~${f.severity}~~ waived` : f.severity} | ${f.rule} | ${f.line ? `${f.file}:${f.line}` : f.file} | ${f.message.replace(/\|/g, '\\|')} |`);
  return ['| Severity | Rule | Where | Finding |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

function uniqueReportPath(repo, gate, slug) {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}-${gate}${slug ? `-${slug}` : ''}`;
  const dir = join(repo, 'docs', 'reviews');
  let path = join(dir, `${base}.md`);
  for (let n = 2; existsSync(path); n++) {
    path = join(dir, `${base}-${n}.md`);
  }
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkgPath = join(args.repo, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error(`gate: no package.json in ${args.repo}`);
    process.exit(2);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!existsSync(join(args.repo, 'node_modules'))) {
    console.error('gate: node_modules missing; run `npm ci` (or `npm install`) first.');
    process.exit(2);
  }
  const useXvfb = process.platform === 'linux' && !process.env.DISPLAY && (await hasCommand('xvfb-run'));

  const steps = [];
  let checkResult;
  for (const step of PLAN[args.gate]) {
    if (args.skip.has(step)) {
      steps.push({ step, status: 'SKIPPED (requested)', ms: 0 });
      continue;
    }
    if (step === 'vsx-check') {
      const started = Date.now();
      checkResult = evaluate(args.repo, { gate: args.gate, deep: args.gate === 'release' });
      steps.push({ step: `vsx-check --gate ${args.gate}`, status: checkResult.verdict === 'BLOCKED' ? 'FAIL' : 'PASS', ms: Date.now() - started });
      continue;
    }
    if (!pkg.scripts?.[step]) {
      steps.push({ step: `npm run ${step}`, status: OPTIONAL.has(step) ? 'N/A (no script)' : 'FAIL (script missing)', ms: 0 });
      continue;
    }
    process.stdout.write(`gate: npm run ${step} ... `);
    const cmd = NEEDS_DISPLAY.has(step) && useXvfb ? ['xvfb-run', ['-a', NPM, 'run', step]] : [NPM, ['run', step]];
    const r = await runStep(cmd[0], cmd[1], args.repo);
    const downloadBlocked = r.code !== 0 && DOWNLOADS_VSCODE.has(step) && DOWNLOAD_FAILURE.test(r.output) && !TEST_SUMMARY.test(r.output);
    const status = r.code === 0 ? 'PASS' : downloadBlocked ? 'SKIPPED (not run: VS Code download failed)' : 'FAIL';
    console.log(`${status} (${(r.ms / 1000).toFixed(1)}s)`);
    steps.push({ step: `npm run ${step}`, status, ms: r.ms, tail: r.code === 0 ? undefined : r.output.split('\n').slice(-FAILURE_TAIL_LINES).join('\n') });
  }

  const failedSteps = steps.filter((s) => s.status.startsWith('FAIL'));
  const skippedSteps = steps.filter((s) => s.status.startsWith('SKIPPED'));
  // A gate with skipped steps has not been verified: it is INCOMPLETE, never PASS. The user may
  // accept the gap explicitly (recorded in the report), but the script will not call it a pass.
  const verdict = failedSteps.length > 0 ? 'BLOCKED' : skippedSteps.length > 0 ? 'INCOMPLETE' : checkResult?.verdict ?? 'PASS';

  if (checkResult) {
    const s = checkResult.summary;
    console.log(`gate: vsx-check ${s.blocker} blocker, ${s.major} major, ${s.minor} minor (${s.waived} waived)`);
    for (const f of checkResult.findings.filter((x) => !x.waived && x.severity !== 'minor')) {
      console.log(`  ${f.severity.toUpperCase()} ${f.rule} ${f.line ? `${f.file}:${f.line}` : f.file} ${f.message}`);
    }
  }

  let reportPath;
  if (args.report) {
    reportPath = uniqueReportPath(args.repo, args.gate, args.slug);
    const failureDetails = [...failedSteps, ...skippedSteps]
      .filter((s) => s.tail)
      .map((s) => `<details><summary>${s.step} output (last ${FAILURE_TAIL_LINES} lines)</summary>\n\n\`\`\`text\n${s.tail}\n\`\`\`\n\n</details>`)
      .join('\n\n');
    const template = readFileSync(join(SKILL_DIR, 'assets', 'report-template.md'), 'utf8');
    const values = {
      GATE: args.gate,
      SLUG_SUFFIX: args.slug ? ` — ${args.slug}` : '',
      DATE: new Date().toISOString().slice(0, 10),
      REPO: pkg.publisher && pkg.name ? `${pkg.publisher}.${pkg.name}@${pkg.version}` : args.repo,
      CHECKER: CHECKER_VERSION,
      CHECKER_NOTE: vendoredCheckerNote(args.repo),
      SCOPE: args.gate === 'slice' ? `slice ${args.slug ?? '(unnamed)'}` : args.gate === 'release' ? `release ${pkg.version}` : 'whole repository',
      VERDICT: verdict,
      STEP_TABLE: steps.map((s) => `| ${s.step} | ${s.status} | ${(s.ms / 1000).toFixed(1)}s |`).join('\n'),
      FINDINGS: checkResult ? formatFindings(checkResult) : 'vsx-check skipped.',
      FAILURE_DETAILS: failureDetails,
    };
    const text = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] ?? '');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, text);
  }

  console.log(JSON.stringify({ gate: args.gate, verdict, failedSteps: failedSteps.map((s) => s.step), skippedSteps: skippedSteps.map((s) => s.step), report: reportPath ?? null }, null, 2));
  process.exitCode = verdict === 'BLOCKED' ? 1 : verdict === 'INCOMPLETE' ? 3 : 0;
}

main().catch((error) => {
  console.error(`gate: ${error.stack ?? error}`);
  process.exit(1);
});
