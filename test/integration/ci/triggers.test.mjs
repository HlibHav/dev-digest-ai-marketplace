// AC-4 (integration side): the Pages workflow redeploys on every indexed source.
// The workflow is read by a line parser; no YAML library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INDEXED_SOURCE_GLOBS } from '../../../scripts/lib/source-globs.mjs';

const pages = readFileSync(new URL('../../../.github/workflows/pages.yml', import.meta.url), 'utf8');
const lines = pages.split('\n');

function pathsTrigger(src) {
  const start = src.findIndex((l) => /^ {4}paths: *$/.test(l));
  assert.notEqual(start, -1, 'pages.yml has a push `paths:` list');
  const out = [];
  for (const l of src.slice(start + 1)) {
    const m = /^\s{6}-\s+'?"?([^'"#]+?)'?"?\s*$/.exec(l);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

function globToRegExp(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

const triggers = pathsTrigger(lines);

test('every indexed source glob is a pages.yml path trigger', () => {
  for (const g of INDEXED_SOURCE_GLOBS) {
    assert.ok(triggers.includes(g), `pages.yml paths is missing ${g}`);
  }
});

test('pages.yml has no trigger beyond the shared constant, and not the ignored site/**', () => {
  assert.ok(!triggers.includes('site/**'));
  assert.deepEqual([...triggers].sort(), [...INDEXED_SOURCE_GLOBS].sort());
});

test('sample indexed paths match some glob', () => {
  const samples = [
    'plugins/x/skills/y/SKILL.md',
    'plugins/x/.mcp.json',
    'plugins/x/.claude-plugin/plugin.json',
    'plugins/x/hooks/hooks.json',
    'data/dictionary.ua-en.txt',
    'site-src/app/boot.js',
    'scripts/build-index.mjs',
    'package-lock.json',
    '.claude-plugin/marketplace.json',
  ];
  const res = INDEXED_SOURCE_GLOBS.map(globToRegExp);
  for (const s of samples) {
    assert.ok(res.some((r) => r.test(s)), `${s} matches no glob`);
  }
  assert.ok(!res.some((r) => r.test('README.md')), 'README.md must not trigger a deploy');
});

test('pages build runs npm ci --ignore-scripts before the build script', () => {
  const ci = lines.findIndex((l) => /run: +npm ci --ignore-scripts *$/.test(l));
  const build = lines.findIndex((l) => /node scripts\/build-index\.mjs/.test(l));
  assert.notEqual(ci, -1, 'npm ci --ignore-scripts present');
  assert.notEqual(build, -1, 'build step present');
  assert.ok(ci < build, 'install comes before build');
  assert.match(pages, /node-version: +22/);
});
