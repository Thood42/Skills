#!/usr/bin/env node
// Generates a baseline VS Code extension repository from ../assets/template.
// Zero dependencies; Node >= 20. Run with --help for usage.
//
// What it does (in order):
//   1. validates inputs and derives identifiers (command prefix, tool prefix, package names)
//   2. resolves the engines.vscode floor and dependency versions (npm registry, or pinned fallback)
//   3. copies template/base + selected surfaces, renders {{TOKENS}}, renames dot-* files,
//      deep-merges surface fragments, registers surface features
//   4. writes a placeholder icon, vendors tools/vsx-check.mjs, runs npm install, git init
// It never overwrites existing files: the target directory must be empty (a lone .git is fine).

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';

const run = promisify(execFile);
const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = join(SKILL_DIR, 'assets', 'template');
const VERSIONS_FALLBACK = join(SKILL_DIR, 'assets', 'versions.json');
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

const SURFACES = ['webview', 'ai', 'web'];

// GUESS: how far behind current VS Code an enterprise fleet typically lags. The engines floor
// defaults to the newest @types/vscode published at least this long ago. Override with --engine.
const ENGINE_LAG_DAYS = 180;
// Node major for @types/node: must not exceed the extension host's Node at the engines floor,
// or the compiler will accept Node APIs older hosts lack. Keep in sync with NODE_TARGET in esbuild.mjs.
const NODE_TYPES_MAJOR = 22;

const BASE_DEV_DEPENDENCIES = [
  'typescript',
  'typescript-eslint',
  'eslint',
  '@eslint/js',
  'esbuild',
  'mocha',
  '@types/mocha',
  '@types/node',
  '@types/vscode',
  '@vscode/test-cli',
  '@vscode/test-electron',
  '@vscode/vsce',
];

const TEXT_EXTENSIONS = new Set(['.tmpl', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sh', '.ps1', '.css', '.html', '.txt']);

const HELP = `Usage: node scaffold.mjs --dir <path> --name <ext-name> --publisher <id> [options]

Required
  --dir <path>              target directory (created if missing; must be empty)
  --name <ext-name>         npm/extension name, lowercase-kebab (e.g. part-lookup)
  --publisher <id>          publisher id (e.g. acme-devtools)

Identity
  --display-name <text>     Marketplace/UI name (default: Title Case of --name)
  --description <text>      one-line description
  --owner <text>            copyright owner for LICENSE.md (default: publisher)
  --repo-url <url>          repository URL (default: Azure Repos URL from --ado-*)

Surfaces
  --surfaces <list>         comma list of: ${SURFACES.join(', ')} (default: none)

Azure DevOps distribution
  --ado-org <org>           Azure DevOps organization (default: CHANGE-ME-org)
  --ado-project <project>   Azure DevOps project (default: CHANGE-ME-project)
  --ado-feed <feed>         Azure Artifacts feed (default: vscode-extensions)
  --feed-scope <scope>      project | organization (default: project)

Versions
  --engine <x.y.z|auto>     engines.vscode floor (default: auto = newest @types/vscode published
                            >= ${ENGINE_LAG_DAYS} days ago)
  --deps <latest|pinned>    resolve devDependencies from the registry or use assets/versions.json
                            (default: latest; falls back to pinned when the registry is unreachable)

Behaviour
  --no-install              skip npm install
  --no-git                  skip git init
  --dry-run                 print the resolved plan as JSON and write nothing
  --help`;

// ---------------------------------------------------------------------------------------------
// Arguments and identity

function parseArgs(argv) {
  const args = { surfaces: [], deps: 'latest', engine: 'auto', install: true, git: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        fail(`Missing value for ${arg}`);
      }
      return value;
    };
    switch (arg) {
      case '--dir': args.dir = next(); break;
      case '--name': args.name = next(); break;
      case '--publisher': args.publisher = next(); break;
      case '--display-name': args.displayName = next(); break;
      case '--description': args.description = next(); break;
      case '--owner': args.owner = next(); break;
      case '--repo-url': args.repoUrl = next(); break;
      case '--surfaces': args.surfaces = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--ado-org': args.adoOrg = next(); break;
      case '--ado-project': args.adoProject = next(); break;
      case '--ado-feed': args.adoFeed = next(); break;
      case '--feed-scope': args.feedScope = next(); break;
      case '--engine': args.engine = next(); break;
      case '--deps': args.deps = next(); break;
      case '--no-install': args.install = false; break;
      case '--no-git': args.git = false; break;
      case '--dry-run': args.dryRun = true; break;
      case '--help': case '-h': console.log(HELP); process.exit(0); break;
      default: fail(`Unknown argument: ${arg}\n\n${HELP}`);
    }
  }
  return args;
}

function fail(message) {
  console.error(`scaffold: ${message}`);
  process.exit(2);
}

const SAFE_TEXT = /^[^"'`\\\n\r<>{}$]+$/;

function deriveIdentity(args) {
  if (!args.dir || !args.name || !args.publisher) {
    fail(`--dir, --name and --publisher are required.\n\n${HELP}`);
  }
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(args.name) || args.name.length > 64) {
    fail(`--name "${args.name}" must be lowercase kebab-case (letters, digits, single hyphens), <= 64 chars.`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(args.publisher)) {
    fail(`--publisher "${args.publisher}" may contain only letters, digits and hyphens.`);
  }
  for (const s of args.surfaces) {
    if (!SURFACES.includes(s)) {
      fail(`Unknown surface "${s}". Choose from: ${SURFACES.join(', ')}.`);
    }
  }
  if (!['latest', 'pinned'].includes(args.deps)) {
    fail('--deps must be "latest" or "pinned".');
  }
  const feedScope = args.feedScope ?? 'project';
  if (!['project', 'organization'].includes(feedScope)) {
    fail('--feed-scope must be "project" or "organization".');
  }

  const words = args.name.split('-');
  const displayName = args.displayName ?? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const description = args.description ?? `${displayName} for VS Code.`;
  const owner = args.owner ?? args.publisher;
  for (const [flag, value] of [['--display-name', displayName], ['--description', description], ['--owner', owner]]) {
    if (!SAFE_TEXT.test(value)) {
      fail(`${flag} may not contain quotes, backslashes, angle/curly brackets, $ or newlines.`);
    }
  }

  const adoOrg = args.adoOrg ?? 'CHANGE-ME-org';
  const adoProject = args.adoProject ?? 'CHANGE-ME-project';
  const adoFeed = args.adoFeed ?? 'vscode-extensions';
  for (const [flag, value] of [['--ado-org', adoOrg], ['--ado-project', adoProject], ['--ado-feed', adoFeed]]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(value)) {
      fail(`${flag} "${value}" contains characters Azure DevOps names do not allow.`);
    }
  }

  // Command/config prefix: camelCase of the name (part-lookup -> partLookup).
  const id = words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  // Language model tool prefix: snake_case (part-lookup -> part_lookup).
  const idSnake = words.join('_');
  // Universal package names: lowercase, letters/digits/single dashes/underscores/periods.
  const upkgName = `${args.publisher}.${args.name}`.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9._]|-(?!-))*[a-z0-9]$/.test(upkgName)) {
    fail(`Derived universal package name "${upkgName}" is invalid for Azure Artifacts.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const repoUrl = args.repoUrl ?? `https://dev.azure.com/${adoOrg}/${encodeURIComponent(adoProject)}/_git/${args.name}`;
  return {
    dir: resolve(args.dir),
    tokens: {
      EXT_NAME: args.name,
      DISPLAY_NAME: displayName,
      DESCRIPTION: description,
      PUBLISHER: args.publisher,
      OWNER: owner,
      ID: id,
      ID_SNAKE: idSnake,
      UPKG_NAME: upkgName,
      ADO_ORG: adoOrg,
      ADO_PROJECT: adoProject,
      ADO_FEED: adoFeed,
      FEED_PROJECT: feedScope === 'project' ? adoProject : '',
      ADO_FEED_REF: feedScope === 'project' ? `${adoProject}/${adoFeed}` : adoFeed,
      REPO_URL: repoUrl,
      DATE: today,
      YEAR: today.slice(0, 4),
      SURFACES: args.surfaces.length > 0 ? args.surfaces.join(', ') : 'core only (commands, settings, log)',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Version resolution

async function npmView(spec, field) {
  const { stdout } = await run(NPM, ['view', spec, field, '--json'], { timeout: 60_000, shell: IS_WINDOWS });
  const text = stdout.trim();
  return text ? JSON.parse(text) : undefined;
}

/** Highest version matching an npm range spec, e.g. "typescript@>=4.8.4 <6.1.0". */
async function maxSatisfying(spec) {
  const result = await npmView(spec, 'version');
  const list = Array.isArray(result) ? result : [result];
  const version = list.filter(Boolean).at(-1);
  if (!version) {
    throw new Error(`No version satisfies ${spec}`);
  }
  return version;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) {
      return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
  }
  return 0;
}

async function resolveEngine(engineArg) {
  const times = await npmView('@types/vscode', 'time');
  const published = Object.entries(times)
    .filter(([v]) => /^\d+\.\d+\.\d+$/.test(v))
    .map(([version, date]) => ({ version, date: new Date(date) }))
    .sort((a, b) => compareVersions(a.version, b.version));
  if (engineArg !== 'auto') {
    // Types must not exceed the floor: take the newest published @types/vscode <= requested engine.
    const types = published.filter((p) => compareVersions(p.version, engineArg) <= 0).at(-1);
    if (!types) {
      fail(`No @types/vscode release at or below ${engineArg}.`);
    }
    return { engine: engineArg, typesVscode: types.version, rationale: 'set explicitly at scaffold time' };
  }
  const cutoff = Date.now() - ENGINE_LAG_DAYS * 24 * 60 * 60 * 1000;
  const pick = published.filter((p) => p.date.getTime() <= cutoff).at(-1);
  if (!pick) {
    throw new Error('Could not pick an engine floor from @types/vscode publish dates');
  }
  return {
    engine: pick.version,
    typesVscode: pick.version,
    rationale: `GUESS: newest @types/vscode published >= ${ENGINE_LAG_DAYS} days before scaffolding (${pick.date.toISOString().slice(0, 10)}); replace with the oldest VS Code version deployed in your organization`,
  };
}

async function resolveLatest(engineArg, extraDeps, extraDevDeps) {
  const engine = await resolveEngine(engineArg);
  // TypeScript must satisfy typescript-eslint's peer range, or npm install fails with ERESOLVE.
  const tsEslintPeers = await npmView('typescript-eslint', 'peerDependencies');
  const eslintVersion = await maxSatisfying('eslint');
  const eslintMajor = eslintVersion.split('.')[0];
  // mocha and @types/mocha follow @vscode/test-cli so unit and integration tests share one mocha
  // instance (a second copy breaks `import { describe } from 'mocha'` in the Extension Host).
  const testCliDeps = await npmView('@vscode/test-cli', 'dependencies');

  const devSpecs = {
    typescript: `typescript@${tsEslintPeers.typescript}`,
    'typescript-eslint': 'typescript-eslint',
    eslint: 'eslint',
    '@eslint/js': `@eslint/js@^${eslintMajor}`,
    esbuild: 'esbuild',
    mocha: `mocha@${testCliDeps.mocha}`,
    '@types/mocha': `@types/mocha@${testCliDeps['@types/mocha']}`,
    '@types/node': `@types/node@^${NODE_TYPES_MAJOR}`,
    '@vscode/test-cli': '@vscode/test-cli',
    '@vscode/test-electron': '@vscode/test-electron',
    '@vscode/vsce': '@vscode/vsce',
  };
  for (const name of extraDevDeps) {
    devSpecs[name] = name;
  }
  const devDependencies = { '@types/vscode': engine.typesVscode };
  await Promise.all(
    Object.entries(devSpecs).map(async ([name, spec]) => {
      devDependencies[name] = `^${await maxSatisfying(spec)}`;
    }),
  );
  const dependencies = {};
  await Promise.all(
    extraDeps.map(async (name) => {
      dependencies[name] = `^${await maxSatisfying(name)}`;
    }),
  );
  return { engine, dependencies: sortKeys(dependencies), devDependencies: sortKeys(devDependencies), source: 'registry' };
}

function resolvePinned(engineArg, extraDeps, extraDevDeps) {
  const pinned = JSON.parse(readFileSync(VERSIONS_FALLBACK, 'utf8'));
  const engineVersion = engineArg === 'auto' ? pinned.engine : engineArg;
  const pick = (name) => {
    const v = pinned.packages[name];
    if (!v) {
      fail(`assets/versions.json has no pinned version for ${name}`);
    }
    return v;
  };
  const devDependencies = {};
  for (const name of [...BASE_DEV_DEPENDENCIES, ...extraDevDeps]) {
    devDependencies[name] = pick(name);
  }
  devDependencies['@types/vscode'] = engineArg === 'auto' ? pinned.engine : pick('@types/vscode');
  const dependencies = {};
  for (const name of extraDeps) {
    dependencies[name] = pick(name);
  }
  return {
    engine: {
      engine: engineVersion,
      typesVscode: devDependencies['@types/vscode'],
      rationale: `pinned fallback from the skill's assets/versions.json (verified ${pinned.verified})`,
    },
    dependencies: sortKeys(dependencies),
    devDependencies: sortKeys(devDependencies),
    source: `pinned (${pinned.verified})`,
  };
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------------------------------------
// Template rendering

function render(text, tokens, file) {
  const out = text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in tokens)) {
      fail(`Template ${file} uses unknown token ${match}`);
    }
    return tokens[key];
  });
  return out;
}

function targetPath(relPath) {
  // dot-gitignore -> .gitignore, dot-vscode/launch.json -> .vscode/launch.json,
  // AGENTS.md.tmpl -> AGENTS.md (agent context files are stored inert so tools that auto-load
  // AGENTS.md/CLAUDE.md never pick up the template's copy).
  return relPath
    .split(sep)
    .map((part) => (part.startsWith('dot-') ? `.${part.slice(4)}` : part))
    .map((part) => (part.endsWith('.tmpl') ? part.slice(0, -5) : part))
    .join(sep);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function isText(file) {
  const base = file.split(sep).at(-1);
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  return TEXT_EXTENSIONS.has(ext) || base.startsWith('dot-') || base.startsWith('.');
}

function copyTree(srcRoot, destRoot, tokens, written) {
  for (const file of walk(srcRoot)) {
    const rel = relative(srcRoot, file);
    if (rel === 'surface.json') {
      continue;
    }
    const dest = join(destRoot, targetPath(rel));
    if (written.has(dest)) {
      fail(`Template conflict: ${rel} is provided by more than one template layer.`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (isText(file)) {
      writeFileSync(dest, render(readFileSync(file, 'utf8'), tokens, rel));
    } else {
      copyFileSync(file, dest);
    }
    written.add(dest);
  }
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      target[key] = [...existing, ...value];
    } else if (isPlainObject(existing) && isPlainObject(value)) {
      deepMerge(existing, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function applySurface(name, destRoot, tokens, written) {
  const surfaceDir = join(TEMPLATE_DIR, 'surfaces', name);
  const manifest = JSON.parse(render(readFileSync(join(surfaceDir, 'surface.json'), 'utf8'), tokens, `${name}/surface.json`));
  copyTree(surfaceDir, destRoot, tokens, written);

  for (const [templateRel, fragment] of Object.entries(manifest.merge ?? {})) {
    const file = join(destRoot, targetPath(templateRel));
    const current = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')));
    writeFileSync(file, `${JSON.stringify(deepMerge(current, fragment), null, 2)}\n`);
  }

  const registry = join(destRoot, 'src', 'features', 'index.ts');
  let text = readFileSync(registry, 'utf8');
  for (const line of manifest.imports ?? []) {
    text = text.replace('// @scaffold:imports', `${line}\n// @scaffold:imports`);
  }
  for (const line of manifest.features ?? []) {
    text = text.replace('  // @scaffold:features', `  ${line}\n  // @scaffold:features`);
  }
  writeFileSync(registry, text);
  return manifest;
}

function finalizeRegistry(destRoot) {
  const registry = join(destRoot, 'src', 'features', 'index.ts');
  const text = readFileSync(registry, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('@scaffold:'))
    .join('\n');
  writeFileSync(registry, text);
}

function appendAgentsNotes(destRoot, manifests) {
  const notes = manifests.map((m) => m.agentsNotes).filter(Boolean);
  if (notes.length === 0) {
    return;
  }
  const file = join(destRoot, 'AGENTS.md');
  const text = readFileSync(file, 'utf8').replace('## How work flows', `## Surfaces\n\n${notes.join('\n')}\n\n## How work flows`);
  writeFileSync(file, text);
}

// ---------------------------------------------------------------------------------------------
// Placeholder icon: 128x128 PNG (Marketplace minimum), colour derived from the name.

function writeIcon(file, seed) {
  const size = 128;
  const hash = createHash('sha256').update(seed).digest();
  const hue = hash[0] / 255;
  const [r, g, b] = hslToRgb(hue, 0.55, 0.42);
  const radius = 24;
  const inset = 36;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const inside = dx * dx + dy * dy <= radius * radius;
      const core = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const o = 1 + x * 4;
      if (!inside) {
        continue; // transparent
      }
      const lift = core ? 0.35 : 0;
      row[o] = Math.round(r + (255 - r) * lift);
      row[o + 1] = Math.round(g + (255 - g) * lift);
      row[o + 2] = Math.round(b + (255 - b) * lift);
      row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}

// ---------------------------------------------------------------------------------------------

function assertEmptyTarget(dir) {
  if (!existsSync(dir)) {
    return;
  }
  const entries = readdirSync(dir).filter((e) => e !== '.git');
  if (entries.length > 0) {
    fail(`${dir} is not empty (${entries.slice(0, 5).join(', ')}${entries.length > 5 ? ', ...' : ''}). ` +
      'The scaffold never overwrites files; use workflows/adopt.md for an existing extension.');
  }
}

function findUnrenderedTokens(root) {
  const leftovers = [];
  for (const file of walk(root)) {
    if (file.includes(`${sep}node_modules${sep}`) || !isText(file)) {
      continue;
    }
    const match = readFileSync(file, 'utf8').match(/\{\{[A-Z_]+\}\}/);
    if (match) {
      leftovers.push(`${relative(root, file)}: ${match[0]}`);
    }
  }
  return leftovers;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dir, tokens } = deriveIdentity(args);
  assertEmptyTarget(dir);

  const surfaceManifests = args.surfaces.map((s) =>
    JSON.parse(readFileSync(join(TEMPLATE_DIR, 'surfaces', s, 'surface.json'), 'utf8')),
  );
  const extraDeps = [...new Set(surfaceManifests.flatMap((m) => m.dependencies ?? []))];
  const extraDevDeps = [...new Set(surfaceManifests.flatMap((m) => m.devDependencies ?? []))];

  let versions;
  if (args.deps === 'latest') {
    try {
      versions = await resolveLatest(args.engine, extraDeps, extraDevDeps);
    } catch (error) {
      console.warn(`scaffold: registry resolution failed (${error.message}); using pinned versions.`);
      versions = resolvePinned(args.engine, extraDeps, extraDevDeps);
    }
  } else {
    versions = resolvePinned(args.engine, extraDeps, extraDevDeps);
  }
  tokens.ENGINE = versions.engine.engine;
  tokens.ENGINE_RATIONALE = versions.engine.rationale;

  const plan = { dir, surfaces: args.surfaces, tokens, versions };
  if (args.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  mkdirSync(dir, { recursive: true });
  const written = new Set();
  copyTree(join(TEMPLATE_DIR, 'base'), dir, tokens, written);
  const applied = args.surfaces.map((s) => applySurface(s, dir, tokens, written));
  finalizeRegistry(dir);
  appendAgentsNotes(dir, applied);

  const pkgFile = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = versions.dependencies;
  pkg.devDependencies = versions.devDependencies;
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

  writeIcon(join(dir, 'media', 'icon.png'), tokens.EXT_NAME);
  mkdirSync(join(dir, 'tools'), { recursive: true });
  copyFileSync(join(SKILL_DIR, 'scripts', 'vsx-check.mjs'), join(dir, 'tools', 'vsx-check.mjs'));

  const leftovers = findUnrenderedTokens(dir);
  if (leftovers.length > 0) {
    fail(`Unrendered template tokens:\n  ${leftovers.join('\n  ')}`);
  }

  if (args.git && !existsSync(join(dir, '.git'))) {
    try {
      await run('git', ['init', '--quiet'], { cwd: dir });
    } catch {
      console.warn('scaffold: git init failed; initialise the repository manually.');
    }
  }

  if (args.install) {
    console.log('scaffold: npm install (this takes a minute)...');
    try {
      await run(NPM, ['install', '--no-audit', '--no-fund'], { cwd: dir, timeout: 600_000, shell: IS_WINDOWS, maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      console.error(`scaffold: npm install failed:\n${error.stderr ?? error.message}`);
      process.exit(1);
    }
  }

  console.log(JSON.stringify({
    created: dir,
    extensionId: `${tokens.PUBLISHER}.${tokens.EXT_NAME}`,
    commandPrefix: tokens.ID,
    toolPrefix: tokens.ID_SNAKE,
    universalPackage: tokens.UPKG_NAME,
    feed: tokens.ADO_FEED_REF,
    engine: `^${tokens.ENGINE}`,
    engineRationale: tokens.ENGINE_RATIONALE,
    versionsSource: versions.source,
    surfaces: args.surfaces,
    installed: args.install,
    next: `node ${join(SKILL_DIR, 'scripts', 'gate.mjs')} --gate baseline --repo ${dir}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(`scaffold: ${error.stack ?? error}`);
  process.exit(1);
});
