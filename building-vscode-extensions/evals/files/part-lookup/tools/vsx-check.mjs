#!/usr/bin/env node
// vsx-check: mechanical best-practice checks for VS Code extensions.
//
// Zero dependencies, Node >= 20. Vendored into generated repos as tools/vsx-check.mjs so CI
// enforces the same rules the review gates use. Rule IDs match references/review-rubric.md.
//
//   node vsx-check.mjs [repo] [--gate baseline|slice|release] [--json] [--deep] [--list-rules]
//
// Exit codes: 0 = gate passes, 1 = unwaived blocking findings, 2 = usage/config error.
// Blocking severities: blocker at every gate; blocker + major at the release gate.
//
// The checks are static heuristics (regex over comment-stripped source), chosen to be precise
// rather than exhaustive: anything needing judgment lives in the rubric, not here.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHECKER_VERSION = '0.1.0';

const GATES = ['baseline', 'slice', 'release'];

// Budget for src/extension.ts code lines. The composition root only builds services and
// registers features; past ~60 lines it has started accumulating feature logic.
const EXTENSION_TS_LINE_BUDGET = 60;
// Marketplace minimum icon size (px).
const ICON_MIN_SIZE = 128;
// A bundled extension ships a handful of files; hundreds means node_modules or sources leaked.
const VSIX_FILE_BUDGET = 100;

const NODE_BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'fs/promises', 'http', 'http2',
  'https', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers',
  'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
];

// ---------------------------------------------------------------------------------------------
// Repository model

class Repo {
  constructor(root) {
    this.root = root;
    this.cache = new Map();
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) {
      usageError(`No package.json in ${root}`);
    }
    try {
      this.pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (error) {
      usageError(`package.json is not valid JSON: ${error.message}`);
    }
    if (!this.pkg.engines?.vscode) {
      usageError(`${root} does not look like a VS Code extension (no engines.vscode in package.json)`);
    }
    this.srcFiles = existsSync(join(root, 'src')) ? walk(join(root, 'src')).filter((f) => /\.(m|c)?[jt]sx?$/.test(f)) : [];
  }

  rel(file) {
    return relative(this.root, file).split(sep).join('/');
  }

  read(file) {
    if (!this.cache.has(file)) {
      this.cache.set(file, readFileSync(file, 'utf8'));
    }
    return this.cache.get(file);
  }

  code(file) {
    const key = `code:${file}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, stripComments(this.read(file)));
    }
    return this.cache.get(key);
  }

  exists(relPath) {
    return existsSync(join(this.root, relPath));
  }

  /** Source files that ship (not tests). */
  get productFiles() {
    return this.srcFiles.filter((f) => !isTestFile(this.rel(f)));
  }

  get testFiles() {
    return this.srcFiles.filter((f) => isTestFile(this.rel(f)));
  }

  under(prefix) {
    return this.srcFiles.filter((f) => this.rel(f).startsWith(prefix));
  }

  contributes(key) {
    return this.pkg.contributes?.[key];
  }

  allDependencies() {
    return { ...(this.pkg.dependencies ?? {}), ...(this.pkg.devDependencies ?? {}) };
  }
}

function isTestFile(rel) {
  return rel.startsWith('src/test/') || /\.test\.[jt]sx?$/.test(rel) || /\.spec\.[jt]sx?$/.test(rel);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Blanks comments while preserving strings and line numbers. */
function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i++;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function* matches(text, regex) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) {
    yield { match: m, line: lineOf(text, m.index) };
    if (m[0].length === 0) {
      re.lastIndex++;
    }
  }
}

function parseJsonc(text) {
  const noComments = stripComments(text);
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, '$1'));
}

function cleanVersion(range) {
  const m = String(range ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

function literalPresent(repo, files, value) {
  const needles = [`'${value}'`, `"${value}"`, `\`${value}\``];
  return files.some((f) => needles.some((n) => repo.read(f).includes(n)));
}

function importSpecifiers(code) {
  const specs = [];
  const re = /(?:import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?|export\s+[\w*{}\s,]+\s+from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const { match, line } of matches(code, re)) {
    specs.push({ spec: match[1], line });
  }
  return specs;
}

function readPngSize(file) {
  const buf = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== signature) {
    return undefined;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------------------------
// Rules. severity: 'blocker' | 'major' | 'minor', or a per-gate map { release: ..., default: ... }.
// gates: limit a rule to some gates (default: all).

const RULES = [
  // --- Manifest -------------------------------------------------------------------------------
  {
    id: 'MAN-001', severity: 'blocker', title: 'Manifest has identity and an entry point',
    check(repo) {
      const missing = ['name', 'publisher', 'version'].filter((k) => !repo.pkg[k]);
      if (!repo.pkg.main && !repo.pkg.browser) {
        missing.push('main or browser');
      }
      return missing.map((k) => ({ file: 'package.json', message: `package.json is missing "${k}"` }));
    },
  },
  {
    id: 'MAN-002', severity: 'blocker', title: '@types/vscode does not exceed the engines.vscode floor',
    check(repo) {
      const floor = cleanVersion(repo.pkg.engines.vscode);
      const declared = repo.pkg.devDependencies?.['@types/vscode'] ?? repo.pkg.dependencies?.['@types/vscode'];
      if (!declared) {
        return [{ file: 'package.json', message: '@types/vscode is not declared; the compiler cannot check API usage against the floor' }];
      }
      const findings = [];
      if (/^[\^~>]/.test(declared)) {
        findings.push({ file: 'package.json', severity: 'major', message: `@types/vscode "${declared}" is a range; pin it exactly (e.g. "${declared.replace(/^[\^~>=\s]+/, '')}") so npm cannot float it above the floor` });
      }
      const installedPath = join(repo.root, 'node_modules', '@types', 'vscode', 'package.json');
      const actual = existsSync(installedPath) ? cleanVersion(JSON.parse(readFileSync(installedPath, 'utf8')).version) : cleanVersion(declared);
      if (floor && actual && compare(actual, floor) > 0) {
        findings.push({ file: 'package.json', message: `@types/vscode ${actual.join('.')} is newer than engines.vscode ${floor.join('.')}: code can compile against APIs the declared floor lacks (vsce also rejects this)` });
      }
      return findings;
    },
  },
  {
    id: 'MAN-003', severity: 'blocker', title: 'No "*" activation event',
    check(repo) {
      return (repo.pkg.activationEvents ?? []).includes('*')
        ? [{ file: 'package.json', message: 'activationEvents contains "*": the extension activates in every window at startup. Use contribution-derived events or onStartupFinished with an ADR' }]
        : [];
    },
  },
  {
    id: 'MAN-004', severity: 'minor', title: 'No activation events that contributions already imply',
    check(repo) {
      const commands = new Set((repo.contributes('commands') ?? []).map((c) => c.command));
      const views = new Set(Object.values(repo.contributes('views') ?? {}).flat().map((v) => v.id));
      return (repo.pkg.activationEvents ?? [])
        .filter((e) => (e.startsWith('onCommand:') && commands.has(e.slice(10))) || (e.startsWith('onView:') && views.has(e.slice(7))))
        .map((e) => ({ file: 'package.json', message: `"${e}" is implied by the contribution (VS Code >= 1.74); remove it` }));
    },
  },
  {
    id: 'MAN-005', severity: 'minor', title: 'onStartupFinished is justified',
    check(repo) {
      return (repo.pkg.activationEvents ?? []).includes('onStartupFinished')
        ? [{ file: 'package.json', message: 'onStartupFinished activates in every window; record why in an ADR or waive with a reason' }]
        : [];
    },
  },
  {
    id: 'MAN-006', severity: 'blocker', title: 'Every contributed command is registered in code',
    check(repo) {
      return (repo.contributes('commands') ?? [])
        .filter((c) => !literalPresent(repo, repo.productFiles, c.command))
        .map((c) => ({ file: 'package.json', message: `command "${c.command}" is contributed but its ID never appears in src/ (users get "command not found")` }));
    },
  },
  {
    id: 'MAN-007', severity: 'minor', title: 'Registered commands are contributed or marked internal',
    check(repo) {
      const contributed = new Set((repo.contributes('commands') ?? []).map((c) => c.command));
      const findings = [];
      const re = /registerCommand\(\s*(?:[\w.]+\s*,\s*)?['"`]([^'"`]+)['"`]/g;
      for (const file of repo.productFiles) {
        for (const { match, line } of matches(repo.code(file), re)) {
          const id = match[1];
          if (!contributed.has(id) && !id.split('.').pop().startsWith('_')) {
            findings.push({ file: repo.rel(file), line, message: `"${id}" is registered but not contributed; contribute it (with title + category) or mark it internal with a "_" prefix` });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'MAN-008', severity: 'major', title: 'Contributed commands have a title and category',
    check(repo) {
      return (repo.contributes('commands') ?? [])
        .filter((c) => !c.title || !c.category)
        .map((c) => ({ file: 'package.json', message: `command "${c.command}" needs both "title" and "category" (Command Palette shows "Category: Title")` }));
    },
  },
  {
    id: 'MAN-009', severity: 'major', title: 'Settings are namespaced, typed, defaulted and described',
    check(repo) {
      const config = repo.contributes('configuration');
      const sections = Array.isArray(config) ? config : config ? [config] : [];
      const props = sections.flatMap((s) => Object.entries(s.properties ?? {}));
      const prefixes = new Set(props.map(([key]) => key.split('.')[0]));
      const findings = [];
      if (prefixes.size > 1) {
        findings.push({ file: 'package.json', message: `settings use several prefixes (${[...prefixes].join(', ')}); use one section named after the extension` });
      }
      for (const [key, schema] of props) {
        const missing = [];
        if (!key.includes('.')) missing.push('a "<section>." prefix');
        if (!schema.type && !schema.enum && !schema.$ref) missing.push('"type"');
        if (!('default' in schema)) missing.push('"default"');
        if (!schema.description && !schema.markdownDescription) missing.push('"description"/"markdownDescription"');
        if (missing.length > 0) {
          findings.push({ file: 'package.json', message: `setting "${key}" needs ${missing.join(', ')}` });
        }
      }
      return findings;
    },
  },
  {
    id: 'MAN-010', severity: 'major', title: 'Workspace Trust support is declared',
    check(repo) {
      return repo.pkg.capabilities?.untrustedWorkspaces
        ? []
        : [{ file: 'package.json', message: 'capabilities.untrustedWorkspaces is not declared; decide supported true/false/"limited" explicitly (VS Code otherwise disables the extension in Restricted Mode)' }];
    },
  },
  {
    id: 'MAN-011', severity: 'minor', title: 'Virtual workspace support is declared',
    check(repo) {
      return repo.pkg.capabilities && 'virtualWorkspaces' in repo.pkg.capabilities
        ? []
        : [{ file: 'package.json', message: 'capabilities.virtualWorkspaces is not declared (e.g. GitHub Repositories / remote file systems)' }];
    },
  },
  {
    id: 'MAN-012', severity: { release: 'blocker', default: 'major' }, title: 'No proposed APIs',
    check(repo) {
      return repo.pkg.enabledApiProposals?.length
        ? [{ file: 'package.json', message: `enabledApiProposals (${repo.pkg.enabledApiProposals.join(', ')}) only work in Insiders with flags; stable users get a broken extension` }]
        : [];
    },
  },
  {
    id: 'MAN-013', severity: { release: 'blocker', default: 'minor' }, title: 'Repository and license are present (vsce prompts otherwise)',
    check(repo) {
      const findings = [];
      if (!repo.pkg.repository) {
        findings.push({ file: 'package.json', message: '"repository" is missing; vsce stops to prompt, which hangs CI' });
      }
      if (!['LICENSE', 'LICENSE.md', 'LICENSE.txt'].some((f) => repo.exists(f))) {
        findings.push({ file: '.', message: 'no LICENSE file; vsce stops to prompt, which hangs CI' });
      }
      return findings;
    },
  },
  {
    id: 'MAN-014', severity: { release: 'major', default: 'minor' }, title: `Icon is a PNG of at least ${ICON_MIN_SIZE}x${ICON_MIN_SIZE}`,
    check(repo) {
      if (!repo.pkg.icon) {
        return [{ file: 'package.json', message: '"icon" is not set' }];
      }
      const file = join(repo.root, repo.pkg.icon);
      if (!existsSync(file)) {
        return [{ file: 'package.json', message: `icon "${repo.pkg.icon}" does not exist` }];
      }
      const size = readPngSize(file);
      if (!size) {
        return [{ file: repo.pkg.icon, message: 'icon is not a PNG (SVG icons are rejected by vsce)' }];
      }
      return size.width < ICON_MIN_SIZE || size.height < ICON_MIN_SIZE
        ? [{ file: repo.pkg.icon, message: `icon is ${size.width}x${size.height}; minimum is ${ICON_MIN_SIZE}x${ICON_MIN_SIZE}` }]
        : [];
    },
  },
  {
    id: 'MAN-015', severity: 'blocker', title: 'Version is plain MAJOR.MINOR.PATCH',
    check(repo) {
      return /^\d+\.\d+\.\d+$/.test(repo.pkg.version ?? '')
        ? []
        : [{ file: 'package.json', message: `version "${repo.pkg.version}" is not MAJOR.MINOR.PATCH; VSIX versions cannot carry pre-release or build suffixes` }];
    },
  },
  {
    id: 'MAN-016', severity: 'major', title: 'Entry points are bundled output',
    check(repo) {
      return ['main', 'browser']
        .filter((k) => typeof repo.pkg[k] === 'string' && !/^(\.\/)?dist\//.test(repo.pkg[k]))
        .map((k) => ({ file: 'package.json', message: `"${k}" is "${repo.pkg[k]}"; ship the esbuild bundle from dist/ (unbundled extensions load slowly and cannot run on the web)` }));
    },
  },
  {
    id: 'MAN-017', severity: { release: 'blocker', default: 'major' }, title: 'Localized manifest strings resolve',
    check(repo) {
      const text = readFileSync(join(repo.root, 'package.json'), 'utf8');
      const keys = [...text.matchAll(/"%([\w.-]+)%"/g)].map((m) => m[1]);
      if (keys.length === 0) {
        return [];
      }
      if (!repo.exists('package.nls.json')) {
        return [{ file: 'package.json', message: 'package.json uses %keys% but package.nls.json is missing (users see raw keys)' }];
      }
      const nls = JSON.parse(readFileSync(join(repo.root, 'package.nls.json'), 'utf8'));
      return keys.filter((k) => !(k in nls)).map((k) => ({ file: 'package.nls.json', message: `missing translation key "${k}"` }));
    },
  },
  {
    id: 'MAN-018', severity: 'major', title: 'vscode.l10n usage has an l10n bundle',
    check(repo) {
      const uses = repo.productFiles.some((f) => /\bl10n\.t\s*\(/.test(repo.code(f)));
      return uses && !repo.pkg.l10n
        ? [{ file: 'package.json', message: 'code calls vscode.l10n.t() but package.json has no "l10n" folder (run @vscode/l10n-dev export)' }]
        : [];
    },
  },

  // --- AI integration -------------------------------------------------------------------------
  {
    id: 'AI-001', severity: 'blocker', title: 'Every contributed language model tool is registered',
    check(repo) {
      return (repo.contributes('languageModelTools') ?? [])
        .filter((t) => !literalPresent(repo, repo.productFiles, t.name))
        .map((t) => ({ file: 'package.json', message: `tool "${t.name}" is contributed but never registered (vscode.lm.registerTool)` }));
    },
  },
  {
    id: 'AI-002', severity: 'major', title: 'Tools describe themselves to the model and the user',
    check(repo) {
      const findings = [];
      for (const t of repo.contributes('languageModelTools') ?? []) {
        const missing = ['displayName', 'modelDescription', 'userDescription', 'inputSchema'].filter((k) => !t[k]);
        if (missing.length > 0) {
          findings.push({ file: 'package.json', message: `tool "${t.name}" is missing ${missing.join(', ')}` });
        }
      }
      return findings;
    },
  },
  {
    id: 'AI-003', severity: 'blocker', title: 'Every contributed chat participant is created',
    check(repo) {
      return (repo.contributes('chatParticipants') ?? [])
        .filter((p) => !literalPresent(repo, repo.productFiles, p.id))
        .map((p) => ({ file: 'package.json', message: `chat participant "${p.id}" is contributed but never created (vscode.chat.createChatParticipant)` }));
    },
  },
  {
    id: 'AI-004', severity: 'blocker', title: 'Every contributed MCP server definition provider is registered',
    check(repo) {
      return (repo.contributes('mcpServerDefinitionProviders') ?? [])
        .filter((p) => !literalPresent(repo, repo.productFiles, p.id))
        .map((p) => ({ file: 'package.json', message: `MCP provider "${p.id}" is contributed but never registered (vscode.lm.registerMcpServerDefinitionProvider)` }));
    },
  },
  {
    id: 'AI-005', severity: 'minor', title: 'Tool names are prefixed snake_case verb_noun',
    check(repo) {
      return (repo.contributes('languageModelTools') ?? [])
        .filter((t) => !/^[a-z0-9]+(_[a-z0-9]+){2,}$/.test(t.name ?? ''))
        .map((t) => ({ file: 'package.json', message: `tool name "${t.name}" should be "<extension>_<verb>_<noun>" in snake_case` }));
    },
  },

  // --- Architecture ---------------------------------------------------------------------------
  {
    id: 'ARC-001', severity: 'blocker', title: 'src/core does not import vscode',
    check(repo) {
      const findings = [];
      for (const file of repo.under('src/core/')) {
        for (const { spec, line } of importSpecifiers(repo.code(file))) {
          if (spec === 'vscode') {
            findings.push({ file: repo.rel(file), line, message: 'src/core imports "vscode"; move VS Code calls to src/platform or the feature so core stays unit-testable' });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'ARC-002', severity: 'blocker', title: 'Layer dependencies point inward',
    check(repo) {
      const findings = [];
      const rules = [
        { from: 'src/core/', banned: ['src/platform/', 'src/features/', 'src/extension'] },
        { from: 'src/platform/', banned: ['src/features/', 'src/extension'] },
        { from: 'src/features/', banned: ['src/extension'] },
      ];
      for (const rule of rules) {
        for (const file of repo.under(rule.from)) {
          for (const { spec, line } of importSpecifiers(repo.code(file))) {
            if (!spec.startsWith('.')) continue;
            const target = repo.rel(resolve(dirname(file), spec));
            const hit = rule.banned.find((b) => target.startsWith(b));
            if (hit) {
              findings.push({ file: repo.rel(file), line, message: `${rule.from} imports ${target} (${hit} is an outer layer)` });
            }
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'ARC-003', severity: 'major', title: `src/extension.ts stays a thin composition root (<= ${EXTENSION_TS_LINE_BUDGET} code lines)`,
    check(repo) {
      const file = join(repo.root, 'src', 'extension.ts');
      if (!existsSync(file)) return [];
      const lines = repo.code(file).split('\n').filter((l) => l.trim()).length;
      return lines > EXTENSION_TS_LINE_BUDGET
        ? [{ file: 'src/extension.ts', message: `${lines} code lines; move feature logic into src/features/<name>/` }]
        : [];
    },
  },
  {
    id: 'ARC-004', severity: 'major', title: 'No synchronous file system calls in shipped code',
    check(repo) {
      const re = /\b(readFileSync|writeFileSync|appendFileSync|existsSync|statSync|lstatSync|readdirSync|mkdirSync|rmSync|unlinkSync|copyFileSync|accessSync)\s*\(/g;
      const findings = [];
      for (const file of repo.productFiles) {
        for (const { match, line } of matches(repo.code(file), re)) {
          findings.push({ file: repo.rel(file), line, message: `${match[1]}() blocks the extension host and fails on remote/virtual files; use vscode.workspace.fs` });
        }
      }
      return findings;
    },
  },
  {
    id: 'ARC-005', severity: 'minor', title: 'Logging goes through the LogOutputChannel',
    check(repo) {
      const findings = [];
      for (const file of repo.productFiles.filter((f) => !repo.rel(f).startsWith('src/webview/'))) {
        for (const { match, line } of matches(repo.code(file), /\bconsole\.(log|info|warn|error|debug)\s*\(/g)) {
          findings.push({ file: repo.rel(file), line, message: `console.${match[1]}() is invisible to users; use ctx.log` });
        }
      }
      return findings;
    },
  },
  {
    id: 'ARC-006', severity: 'blocker', title: 'Secrets go to SecretStorage, not Memento state',
    check(repo) {
      const findings = [];
      const re = /(globalState|workspaceState)\.update\(\s*['"`]([^'"`]+)['"`]/g;
      for (const file of repo.productFiles) {
        for (const { match, line } of matches(repo.code(file), re)) {
          if (/token|secret|password|passwd|api[-_]?key|credential|\bpat\b/i.test(match[2])) {
            findings.push({ file: repo.rel(file), line, message: `${match[1]} key "${match[2]}" looks like a secret; Memento state is plain text on disk, use context.secrets` });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'ARC-007', severity: 'major', title: 'Lint config enforces the core layer boundary',
    check(repo) {
      const config = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', 'eslint.config.ts'].find((f) => repo.exists(f));
      if (!config) {
        return [{ file: '.', message: 'no eslint.config.* found' }];
      }
      const text = readFileSync(join(repo.root, config), 'utf8');
      return text.includes('src/core') && text.includes('no-restricted-imports')
        ? []
        : [{ file: config, message: 'no no-restricted-imports rule for src/core; the layer boundary is only enforced at review time' }];
    },
  },

  // --- TypeScript -----------------------------------------------------------------------------
  {
    id: 'TS-001', severity: 'blocker', title: 'TypeScript strict mode is on',
    check(repo) {
      const options = readTsOptions(repo.root, 'tsconfig.json');
      if (!options) return [{ file: '.', message: 'no readable tsconfig.json' }];
      return options.strict === true ? [] : [{ file: 'tsconfig.json', message: '"strict" is not true' }];
    },
  },
  {
    id: 'TS-002', severity: 'minor', title: 'noUncheckedIndexedAccess is on',
    check(repo) {
      const options = readTsOptions(repo.root, 'tsconfig.json');
      return options && options.noUncheckedIndexedAccess !== true
        ? [{ file: 'tsconfig.json', message: 'enable "noUncheckedIndexedAccess" (array/record lookups can be undefined)' }]
        : [];
    },
  },
  {
    id: 'TS-003', severity: 'major', title: 'No @ts-ignore / @ts-nocheck',
    check(repo) {
      const findings = [];
      for (const file of repo.srcFiles) {
        for (const { match, line } of matches(repo.read(file), /@ts-(ignore|nocheck)\b/g)) {
          findings.push({ file: repo.rel(file), line, message: `@ts-${match[1]} hides errors silently; use @ts-expect-error with a reason` });
        }
      }
      return findings;
    },
  },

  // --- Security -------------------------------------------------------------------------------
  {
    id: 'SEC-001', severity: 'blocker', title: 'No eval or Function constructor',
    check(repo) {
      const findings = [];
      for (const file of repo.productFiles) {
        for (const { line } of matches(repo.code(file), /(?<![\w.])eval\s*\(|\bnew\s+Function\s*\(/g)) {
          findings.push({ file: repo.rel(file), line, message: 'dynamic code execution' });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC-002', severity: 'major', title: 'No shell-interpolated child processes',
    check(repo) {
      const findings = [];
      for (const file of repo.productFiles) {
        const code = repo.code(file);
        for (const { line } of matches(code, /\bexec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|[^,)]*\+)/g)) {
          findings.push({ file: repo.rel(file), line, message: 'exec() with an interpolated command string: use execFile/spawn with an argument array' });
        }
        for (const { line } of matches(code, /\bshell\s*:\s*true\b/g)) {
          findings.push({ file: repo.rel(file), line, message: 'shell: true re-enables shell injection; pass arguments as an array without a shell' });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC-003', severity: 'blocker', title: 'Webviews set a strict Content Security Policy',
    check(repo) {
      const files = repo.productFiles;
      const usesWebview = files.some((f) => /createWebviewPanel|registerWebviewViewProvider|registerCustomEditorProvider|\.webview\.html\s*=/.test(repo.code(f)));
      if (!usesWebview) return [];
      const findings = [];
      const cspFiles = files.filter((f) => repo.read(f).includes('Content-Security-Policy'));
      if (cspFiles.length === 0) {
        findings.push({ file: 'src', message: 'webviews are created but no Content-Security-Policy meta tag is rendered' });
      }
      for (const file of cspFiles) {
        const code = repo.read(file);
        if (code.includes("'unsafe-eval'")) {
          findings.push({ file: repo.rel(file), message: "CSP allows 'unsafe-eval'" });
        }
        if (/script-src[^;"]*'unsafe-inline'/.test(code)) {
          findings.push({ file: repo.rel(file), message: "CSP script-src allows 'unsafe-inline'; use a nonce" });
        }
        if (!code.includes("default-src 'none'")) {
          findings.push({ file: repo.rel(file), message: "CSP should start from default-src 'none'" });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC-004', severity: 'major', title: 'Script-enabled webviews restrict localResourceRoots',
    check(repo) {
      return repo.productFiles
        .filter((f) => /enableScripts\s*:\s*true/.test(repo.code(f)) && !/localResourceRoots/.test(repo.code(f)))
        .map((f) => ({ file: repo.rel(f), message: 'enableScripts without localResourceRoots exposes the whole workspace and extension folder to the webview' }));
    },
  },
  {
    id: 'SEC-005', severity: 'major', title: 'No HTML injection sinks',
    check(repo) {
      const findings = [];
      for (const file of repo.productFiles) {
        for (const { match, line } of matches(repo.code(file), /\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(|document\.write\s*\(/g)) {
          findings.push({ file: repo.rel(file), line, message: `${match[0].trim()} renders strings as markup (XSS); build DOM nodes or use textContent` });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC-006', severity: 'minor', title: 'retainContextWhenHidden is justified',
    check(repo) {
      return repo.productFiles
        .filter((f) => /retainContextWhenHidden\s*:\s*true/.test(repo.code(f)))
        .map((f) => ({ file: repo.rel(f), message: 'retainContextWhenHidden keeps the webview alive in memory; prefer getState/setState' }));
    },
  },
  {
    id: 'SEC-007', severity: 'major', title: 'No plain-HTTP endpoints',
    check(repo) {
      const findings = [];
      for (const file of repo.productFiles) {
        for (const { match, line } of matches(repo.code(file), /['"`]http:\/\/([^/'"`:]+)/g)) {
          if (!/^(localhost|127\.0\.0\.1|\[::1\]|www\.w3\.org)$/.test(match[1])) {
            findings.push({ file: repo.rel(file), line, message: `plain HTTP to ${match[1]}; use HTTPS` });
          }
        }
      }
      return findings;
    },
  },

  // --- Dependencies ---------------------------------------------------------------------------
  {
    id: 'DEP-001', severity: 'major', title: 'No deprecated webview-ui-toolkit',
    check(repo) {
      return '@vscode/webview-ui-toolkit' in repo.allDependencies()
        ? [{ file: 'package.json', message: '@vscode/webview-ui-toolkit is deprecated and unmaintained; migrate to @vscode-elements/elements' }]
        : [];
    },
  },
  {
    id: 'DEP-002', severity: 'major', title: 'Build and type packages are devDependencies',
    check(repo) {
      const tooling = /^(typescript|esbuild|webpack|eslint|mocha|vsce|@vscode\/vsce|@vscode\/test-.*|typescript-eslint|@typescript-eslint\/.*|@types\/.*)$/;
      return Object.keys(repo.pkg.dependencies ?? {})
        .filter((d) => tooling.test(d))
        .map((d) => ({ file: 'package.json', message: `"${d}" is build/test tooling; move it to devDependencies` }));
    },
  },
  {
    id: 'DEP-003', severity: 'major', title: 'No legacy "vscode" npm package',
    check(repo) {
      return 'vscode' in repo.allDependencies()
        ? [{ file: 'package.json', message: 'the "vscode" npm package is obsolete; use @types/vscode + @vscode/test-electron' }]
        : [];
    },
  },

  // --- Web extension --------------------------------------------------------------------------
  {
    id: 'BRW-001', severity: 'blocker', title: 'Web build imports no Node built-ins',
    check(repo) {
      if (typeof repo.pkg.browser !== 'string') return [];
      const findings = [];
      const shared = repo.srcFiles.filter((f) => {
        const r = repo.rel(f);
        return !r.startsWith('src/node/') && !r.startsWith('src/test/unit/') && !r.startsWith('src/test/integration/');
      });
      for (const file of shared) {
        for (const { spec, line } of importSpecifiers(repo.code(file))) {
          if (spec.startsWith('node:') || NODE_BUILTINS.includes(spec)) {
            findings.push({ file: repo.rel(file), line, message: `imports "${spec}", which does not exist in the web extension host; move it to src/node/ or use vscode.workspace.fs` });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'BRW-002', severity: 'major', title: 'Web build avoids Node globals',
    check(repo) {
      if (typeof repo.pkg.browser !== 'string') return [];
      const findings = [];
      for (const file of repo.productFiles.filter((f) => !repo.rel(f).startsWith('src/node/'))) {
        for (const { match, line } of matches(repo.code(file), /\b(__dirname|__filename|Buffer\.|process\.(env|cwd|platform|argv))\b/g)) {
          findings.push({ file: repo.rel(file), line, message: `${match[1]} is undefined in the web extension host` });
        }
      }
      return findings;
    },
  },

  // --- Tests ----------------------------------------------------------------------------------
  {
    id: 'TST-001', severity: 'blocker', title: 'No focused tests (.only)',
    check(repo) {
      const findings = [];
      for (const file of repo.testFiles) {
        for (const { match, line } of matches(repo.code(file), /\b(describe|it|suite|test|context)\.only\s*\(/g)) {
          findings.push({ file: repo.rel(file), line, message: `${match[1]}.only silently skips every other test` });
        }
      }
      return findings;
    },
  },
  {
    id: 'TST-002', severity: 'major', title: 'No skipped tests without a waiver',
    check(repo) {
      const findings = [];
      for (const file of repo.testFiles) {
        for (const { match, line } of matches(repo.code(file), /\b(describe|it|suite|test|context)\.skip\s*\(|\bx(it|describe)\s*\(/g)) {
          findings.push({ file: repo.rel(file), line, message: `${match[0].replace(/\s*\($/, '')} disables a test; fix it or waive with a reason and expiry` });
        }
      }
      return findings;
    },
  },
  {
    id: 'TST-003', severity: 'major', title: 'Unit and integration suites exist',
    check(repo) {
      const tests = repo.testFiles.map((f) => repo.rel(f));
      const findings = [];
      if (!tests.some((t) => t.startsWith('src/test/unit/'))) {
        findings.push({ file: 'src/test', message: 'no unit tests in src/test/unit/ (core logic is untested without VS Code)' });
      }
      if (!tests.some((t) => t.startsWith('src/test/integration/'))) {
        findings.push({ file: 'src/test', message: 'no integration tests in src/test/integration/ (activation and registration are untested)' });
      }
      return findings;
    },
  },
  {
    id: 'TST-004', severity: 'major', title: 'Test runner is configured',
    check(repo) {
      const findings = [];
      if (!repo.pkg.scripts?.test) {
        findings.push({ file: 'package.json', message: 'no "test" script' });
      }
      if (!['.vscode-test.mjs', '.vscode-test.js', '.vscode-test.cjs', '.vscode-test.json'].some((f) => repo.exists(f))) {
        findings.push({ file: '.', message: 'no .vscode-test.* config for @vscode/test-cli' });
      }
      return findings;
    },
  },

  // --- Packaging ------------------------------------------------------------------------------
  {
    id: 'PKG-001', severity: 'blocker', title: '.vscodeignore keeps sources and node_modules out of the VSIX',
    check(repo) {
      if (!repo.exists('.vscodeignore')) {
        return [{ file: '.', message: 'no .vscodeignore: the VSIX ships sources, tests and dev files' }];
      }
      const lines = readFileSync(join(repo.root, '.vscodeignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const allowlist = lines.includes('**');
      if (allowlist) return [];
      const missing = [];
      if (!lines.some((l) => /^(\*\*\/)?src(\/|\/\*\*)?$/.test(l))) missing.push('src/**');
      if (!lines.some((l) => /^(\*\*\/)?node_modules(\/|\/\*\*)?$/.test(l))) missing.push('node_modules/**');
      return missing.length
        ? [{ file: '.vscodeignore', severity: 'major', message: `does not exclude ${missing.join(', ')} (or switch to an allowlist: "**" then "!dist/**" ...)` }]
        : [];
    },
  },
  {
    id: 'PKG-002', severity: 'major', title: 'vscode:prepublish builds the production bundle',
    check(repo) {
      return repo.pkg.scripts?.['vscode:prepublish']
        ? []
        : [{ file: 'package.json', message: 'no "vscode:prepublish" script; vsce packages whatever happens to be in dist/' }];
    },
  },
  {
    id: 'PKG-003', severity: 'major', title: 'VSIX contents are minimal (deep check)', deep: true,
    check(repo) {
      const bin = join(repo.root, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');
      if (!existsSync(bin)) {
        return [{ file: 'package.json', severity: 'minor', message: '@vscode/vsce not installed; deep VSIX check skipped' }];
      }
      let files;
      try {
        files = execFileSync(bin, ['ls', '--no-dependencies'], { cwd: repo.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
          .split('\n').map((l) => l.trim()).filter(Boolean);
      } catch (error) {
        return [{ file: 'package.json', message: `vsce ls failed: ${String(error.stderr ?? error.message).split('\n')[0]}` }];
      }
      const findings = [];
      const leaked = files.filter((f) => /^(src|out|node_modules|test|\.vscode)\//.test(f) || (/\.ts$/.test(f) && !/\.d\.ts$/.test(f)));
      if (leaked.length) {
        findings.push({ file: '.vscodeignore', message: `VSIX would ship ${leaked.slice(0, 5).join(', ')}${leaked.length > 5 ? ` (+${leaked.length - 5} more)` : ''}` });
      }
      const maps = files.filter((f) => f.endsWith('.map'));
      if (maps.length) {
        findings.push({ file: '.vscodeignore', severity: 'minor', message: `VSIX would ship ${maps.length} source map(s); re-include dist/**/*.js instead of dist/**` });
      }
      if (files.length > VSIX_FILE_BUDGET) {
        findings.push({ file: '.vscodeignore', message: `VSIX would contain ${files.length} files (budget ${VSIX_FILE_BUDGET})` });
      }
      return findings;
    },
  },

  // --- Docs -----------------------------------------------------------------------------------
  {
    id: 'DOC-001', severity: 'blocker', gates: ['release'], title: 'CHANGELOG has an entry for the version being released',
    check(repo) {
      if (!repo.exists('CHANGELOG.md')) {
        return [{ file: '.', message: 'no CHANGELOG.md' }];
      }
      const text = readFileSync(join(repo.root, 'CHANGELOG.md'), 'utf8');
      const v = repo.pkg.version.replace(/\./g, '\\.');
      return new RegExp(`^##\\s+\\[?${v}\\]?`, 'm').test(text)
        ? []
        : [{ file: 'CHANGELOG.md', message: `no "## [${repo.pkg.version}]" heading; move the [Unreleased] notes under it` }];
    },
  },
  {
    id: 'DOC-002', severity: { release: 'major', default: 'minor' }, title: 'README is real documentation',
    check(repo) {
      if (!repo.exists('README.md')) {
        return [{ file: '.', message: 'no README.md' }];
      }
      const text = readFileSync(join(repo.root, 'README.md'), 'utf8');
      return /This is the README for your extension|\{\{[A-Z_]+\}\}|lorem ipsum/i.test(text)
        ? [{ file: 'README.md', message: 'README still contains generator boilerplate' }]
        : [];
    },
  },
  {
    id: 'DOC-003', severity: 'minor', title: 'AGENTS.md documents commands, layers and gates',
    check(repo) {
      return repo.exists('AGENTS.md') ? [] : [{ file: '.', message: 'no AGENTS.md; agents and new contributors start without the project rules' }];
    },
  },
];

function readTsOptions(root, file, depth = 0) {
  const path = join(root, file);
  if (!existsSync(path) || depth > 3) return undefined;
  let config;
  try {
    config = parseJsonc(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
  let base = {};
  if (typeof config.extends === 'string' && config.extends.startsWith('.')) {
    base = readTsOptions(dirname(path), config.extends.endsWith('.json') ? config.extends : `${config.extends}.json`, depth + 1) ?? {};
  }
  return { ...base, ...(config.compilerOptions ?? {}) };
}

// ---------------------------------------------------------------------------------------------
// Waivers, evaluation, output

function loadWaivers(repo, file) {
  const path = file ? resolve(file) : join(repo.root, 'docs', 'reviews', 'waivers.json');
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(data.waivers) ? data.waivers : [];
  } catch (error) {
    usageError(`waivers file ${path} is not valid JSON: ${error.message}`);
  }
  return [];
}

function severityFor(rule, gate) {
  if (typeof rule.severity === 'string') return rule.severity;
  return rule.severity[gate] ?? rule.severity.default;
}

export function evaluate(root, { gate = 'slice', deep = false, waiversFile } = {}) {
  const repo = new Repo(root);
  const waivers = loadWaivers(repo, waiversFile);
  const today = new Date().toISOString().slice(0, 10);
  const findings = [];
  const expiredWaivers = waivers.filter((w) => w.expires && w.expires < today);

  for (const rule of RULES) {
    if (rule.gates && !rule.gates.includes(gate)) continue;
    if (rule.deep && !deep) continue;
    let results;
    try {
      results = rule.check(repo);
    } catch (error) {
      results = [{ file: '.', severity: 'major', message: `rule crashed: ${error.message}` }];
    }
    for (const r of results) {
      const severity = r.severity ?? severityFor(rule, gate);
      const waiver = waivers.find((w) => w.rule === rule.id && (!w.expires || w.expires >= today) && (!w.path || (r.file ?? '').startsWith(w.path)));
      findings.push({ rule: rule.id, title: rule.title, severity, file: r.file, line: r.line, message: r.message, waived: Boolean(waiver), waiver });
    }
  }

  const blocking = gate === 'release' ? ['blocker', 'major'] : ['blocker'];
  const open = findings.filter((f) => !f.waived);
  const count = (sev) => findings.filter((f) => f.severity === sev).length;
  const blockingOpen = open.filter((f) => blocking.includes(f.severity));
  return {
    checker: CHECKER_VERSION,
    gate,
    repo: root,
    verdict: blockingOpen.length > 0 ? 'BLOCKED' : findings.some((f) => f.waived && blocking.includes(f.severity)) ? 'PASS_WITH_WAIVERS' : 'PASS',
    summary: {
      blocker: count('blocker'),
      major: count('major'),
      minor: count('minor'),
      waived: findings.filter((f) => f.waived).length,
      blockingOpen: blockingOpen.length,
    },
    expiredWaivers,
    findings,
  };
}

function printHuman(result) {
  const order = { blocker: 0, major: 1, minor: 2 };
  const sorted = [...result.findings].sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
  console.log(`vsx-check ${result.checker}  gate=${result.gate}  repo=${result.repo}`);
  for (const f of sorted) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    const tag = f.waived ? `${f.severity.toUpperCase()} (waived)` : f.severity.toUpperCase();
    console.log(`  ${tag.padEnd(18)} ${f.rule.padEnd(8)} ${where}  ${f.message}`);
  }
  for (const w of result.expiredWaivers) {
    console.log(`  EXPIRED WAIVER     ${w.rule.padEnd(8)} ${w.path ?? '(repo-wide)'} expired ${w.expires}; finding is active again`);
  }
  const s = result.summary;
  console.log(`Summary: ${s.blocker} blocker, ${s.major} major, ${s.minor} minor (${s.waived} waived) -> ${result.verdict}`);
}

function usageError(message) {
  console.error(`vsx-check: ${message}`);
  process.exit(2);
}

function main(argv) {
  const opts = { gate: 'slice', json: false, deep: false, listRules: false };
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--gate') opts.gate = argv[++i];
    else if (arg === '--json') opts.json = true;
    else if (arg === '--deep') opts.deep = true;
    else if (arg === '--waivers') opts.waiversFile = argv[++i];
    else if (arg === '--list-rules') opts.listRules = true;
    else if (arg === '--version') { console.log(CHECKER_VERSION); return 0; }
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: vsx-check [repo] [--gate baseline|slice|release] [--json] [--deep] [--waivers file] [--list-rules]');
      return 0;
    } else if (arg.startsWith('--')) usageError(`unknown option ${arg}`);
    else root = resolve(arg);
  }
  if (opts.listRules) {
    const rows = RULES.map((r) => ({ id: r.id, severity: r.severity, gates: r.gates ?? GATES, deep: Boolean(r.deep), title: r.title }));
    if (opts.json) console.log(JSON.stringify(rows, null, 2));
    else for (const r of rows) console.log(`${r.id.padEnd(8)} ${JSON.stringify(r.severity).padEnd(40)} ${r.title}`);
    return 0;
  }
  if (!GATES.includes(opts.gate)) usageError(`--gate must be one of ${GATES.join(', ')}`);
  const result = evaluate(root, opts);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  return result.verdict === 'BLOCKED' ? 1 : 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
