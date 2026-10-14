#!/usr/bin/env node
// Repo invariants that `claude plugin validate` does not cover.
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

for (const entry of entries) {
  const label = `${catalogPath}#${entry?.name ?? '?'}`;
  if (typeof entry?.source !== 'string' || !entry.source.startsWith('./plugins/')) {
    fail(label, 'source must be a string starting with ./plugins/');
    continue;
  }
  const dir = join(root, entry.source);
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

  for (const dep of manifest.dependencies ?? []) {
    const depName = typeof dep === 'string' ? dep : dep?.name;
    if (!catalogNames.has(depName)) fail(manifestRel, `dependency "${depName}" is not in the catalog`);
  }

  const pluginRel = entry.source.replace(/^\.\//, '');
  if (!existsSync(join(dir, 'README.md'))) fail(`${pluginRel}/README.md`, 'plugin README.md missing');
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

// Absolute paths in text files and symlinks that escape the repo.
const ABS_PATH = /\/Users\/|\/home\/|[A-Za-z]:\\/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'site']);
const rootPrefix = root + sep;

function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    const rel = relative(root, full).split(sep).join('/');
    if (d.isSymbolicLink()) {
      if (rel.startsWith('plugins/')) {
        const target = resolve(dirname(full), readlinkSync(full));
        if (target !== root && !target.startsWith(rootPrefix)) fail(rel, 'symlink points outside the repo');
      }
      continue;
    }
    if (d.isDirectory()) {
      if (SKIP_DIRS.has(d.name) || rel === 'docs/research') continue;
      walk(full);
    } else if (d.isFile()) {
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
