#!/usr/bin/env node
// Repo invariants that `claude plugin validate` does not cover.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCycle, parseDependency } from './lib/deps.mjs';
import { BuildError } from './lib/errors.mjs';
import { firstChangelogVersion, parseCompatibility } from './lib/plugin-docs.mjs';
import { PathEscapeError, assertRealInside, resolveInside } from './lib/safe-path.mjs';

// Usage: node scripts/check-repo.mjs [--root <dir>]   (--root exists so tests can point at a bad fixture)
// A bad argument exits 2 instead of falling back to the real repo, so a test aimed at a broken
// fixture cannot pass by checking the wrong tree.
const usage = () => {
  console.error('usage: node scripts/check-repo.mjs [--root <dir>]');
  process.exit(2);
};
let rootArg = null;
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] !== '--root') usage();
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) usage();
  rootArg = value;
  i += 1;
}
const root = rootArg ? resolve(rootArg) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
const fail = (path, rule) => violations.push(`${path}: ${rule}`);

const readJson = (rel) => {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    fail(rel, `unreadable or invalid JSON (${e.message})`);
    return null;
  }
};
const isDir = (p) => existsSync(p) && lstatSync(p).isDirectory();
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

const catalogPath = '.claude-plugin/marketplace.json';
const catalog = readJson(catalogPath);
const entries = Array.isArray(catalog?.plugins) ? catalog.plugins : [];
if (catalog && !Array.isArray(catalog.plugins)) fail(catalogPath, '"plugins" must be an array');

const catalogNames = new Set(entries.map((e) => e?.name).filter((n) => typeof n === 'string'));
const listedDirs = new Set();
const depEdges = new Map(); // plugin name -> dependency names that exist in the catalog
const PLUGIN_FILES = ['CHANGELOG.md', 'COMPATIBILITY.md', 'LICENSE'];
const GUARD_CANONICAL = 'plugins/engineering-paved-path/scripts/agent-guard.py';

for (const entry of entries) {
  const label = `${catalogPath}#${entry?.name ?? '?'}`;
  if (typeof entry?.source !== 'string' || !entry.source.startsWith('./plugins/')) {
    fail(label, 'source must be a string starting with ./plugins/');
    continue;
  }
  // `source` is contributor-edited: "./plugins/../../x" starts with ./plugins/ but leaves the repo.
  let dir;
  try {
    dir = resolveInside(root, entry.source);
    assertRealInside(root, dir);
  } catch (e) {
    if (!(e instanceof PathEscapeError)) throw e;
    fail(label, `source ${entry.source} points outside the repository`);
    continue;
  }
  listedDirs.add(resolve(dir));
  if (!isDir(dir)) {
    fail(label, `source directory ${entry.source} does not exist`);
    continue;
  }
  if ('version' in entry) fail(label, 'catalog entry must not carry a version (plugin.json owns it)');

  const manifestRel = `${entry.source.replace(/^\.\//, '')}/.claude-plugin/plugin.json`;
  const manifest = existsSync(join(root, manifestRel)) ? readJson(manifestRel) : (fail(manifestRel, 'plugin.json missing'), null);
  if (!manifest) continue;
  if (manifest.name !== entry.name) fail(manifestRel, `name "${manifest.name}" differs from catalog name "${entry.name}"`);
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) fail(manifestRel, 'version must be a semver string');

  const deps = manifest.dependencies ?? [];
  if (!Array.isArray(deps)) fail(manifestRel, '"dependencies" must be an array');
  else {
    const edges = [];
    deps.forEach((dep, i) => {
      // Claude Code 2.1.296 ignores the range in the "name@marketplace@^x" string form (see the
      // dependency-form ADR), so only the object form is accepted in this marketplace.
      if (typeof dep === 'string') {
        fail(manifestRel, `dependency "${dep}": use the object form {"name", "version"}; the string form's range is not enforced`);
        return;
      }
      let parsed;
      try {
        parsed = parseDependency(dep, manifestRel, i);
      } catch (e) {
        if (!(e instanceof BuildError)) throw e;
        fail(manifestRel, e.rule);
        return;
      }
      if (!parsed.range.startsWith('^')) fail(manifestRel, `dependency "${parsed.name}": range "${parsed.range}" must start with ^`);
      if (!catalogNames.has(parsed.name)) fail(manifestRel, `dependency "${parsed.name}" is not in the catalog`);
      else edges.push(parsed.name);
    });
    depEdges.set(entry.name, edges);
  }

  const pluginRel = entry.source.replace(/^\.\//, '');
  if (!existsSync(join(dir, 'README.md'))) fail(`${pluginRel}/README.md`, 'plugin README.md missing');
  for (const f of PLUGIN_FILES) {
    if (!existsSync(join(dir, f))) fail(`${pluginRel}/${f}`, `plugin ${f} missing`);
  }
  const changelogFile = join(dir, 'CHANGELOG.md');
  if (existsSync(changelogFile)) {
    const first = firstChangelogVersion(readFileSync(changelogFile, 'utf8'));
    if (first === null) fail(`${pluginRel}/CHANGELOG.md`, 'no "## x.y.z" version heading');
    else if (first !== manifest.version) {
      fail(`${pluginRel}/CHANGELOG.md`, `first version heading ${first} differs from plugin.json version ${manifest.version}`);
    }
  }
  const compatFile = join(dir, 'COMPATIBILITY.md');
  if (existsSync(compatFile) && !parseCompatibility(readFileSync(compatFile, 'utf8'))) {
    fail(`${pluginRel}/COMPATIBILITY.md`, 'no Claude Code range line such as "Claude Code >=2.1.0"');
  }
  if (existsSync(join(dir, 'CLAUDE.md'))) fail(`${pluginRel}/CLAUDE.md`, 'CLAUDE.md is not allowed at a plugin root');
  if (existsSync(join(dir, 'bin'))) fail(`${pluginRel}/bin`, 'bin/ is not allowed at a plugin root');
  const meta = join(dir, '.claude-plugin');
  if (isDir(meta)) {
    for (const f of readdirSync(meta)) {
      if (f !== 'plugin.json') fail(`${pluginRel}/.claude-plugin/${f}`, '.claude-plugin/ may contain only plugin.json');
    }
  }
}

const pluginsDir = join(root, 'plugins');
if (isDir(pluginsDir)) {
  for (const d of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (d.isDirectory() && !listedDirs.has(resolve(pluginsDir, d.name))) {
      fail(`plugins/${d.name}`, 'directory is not listed in the catalog (orphan)');
    }
  }
}

const cycle = findCycle(depEdges);
if (cycle) fail(catalogPath, `dependency cycle: ${cycle.cycle}`);

// Every copy of the agent guard is byte-identical to the paved-path original.
const guardCanonical = join(root, GUARD_CANONICAL);
if (isDir(pluginsDir)) {
  for (const d of readdirSync(pluginsDir, { withFileTypes: true })) {
    const copy = join(pluginsDir, d.name, 'scripts', 'agent-guard.py');
    if (!d.isDirectory() || !existsSync(copy) || resolve(copy) === resolve(guardCanonical)) continue;
    const rel = `plugins/${d.name}/scripts/agent-guard.py`;
    if (!existsSync(guardCanonical)) fail(rel, `canonical ${GUARD_CANONICAL} is missing`);
    else if (!readFileSync(copy).equals(readFileSync(guardCanonical))) fail(rel, `differs from ${GUARD_CANONICAL} (copies must be byte-identical)`);
  }
}

// Absolute paths in text files; no symlinks anywhere under plugins/.
const ABS_PATH = /\/Users\/|\/home\/|(?:^|[^A-Za-z0-9_\\])[A-Za-z]:\\/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'site', '.tmp', 'test-results', 'playwright-report']);

function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    const rel = relative(root, full).split(sep).join('/');
    if (d.isSymbolicLink()) {
      if (rel.startsWith('plugins/')) fail(rel, 'symlinks are not allowed under plugins/');
      continue;
    }
    if (d.isDirectory()) {
      if (SKIP_DIRS.has(d.name)) continue;
      walk(full);
    } else if (d.isFile()) {
      // A worktree's .git is a file holding the absolute gitdir path.
      if (d.name === '.git' && dir === root) continue;
      const buf = readFileSync(full);
      if (buf.includes(0)) continue;
      const lines = buf.toString('utf8').split('\n');
      const hit = lines.findIndex((l) => ABS_PATH.test(l));
      if (hit >= 0) fail(`${rel}:${hit + 1}`, 'contains an absolute local path (user home or drive letter)');
    }
  }
}
walk(root);

if (violations.length) {
  console.log(violations.join('\n'));
  process.exit(1);
}
console.log(`check-repo: OK (${entries.length} plugins)`);
