import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { runBuild } from '../../helpers/run-build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..', '..');
const FIXTURE = resolve(REPO, 'test', 'fixtures', 'marketplace');
const NO_NETWORK = pathToFileURL(resolve(REPO, 'test', 'helpers', 'no-network.mjs')).href;
const FIXTURE_PLUGINS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'suite'];

const withOut = (fn) => {
  const out = mkdtempSync(join(tmpdir(), 'fx-out-'));
  try {
    return fn(out);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
};

test('AC-3: a fixture root builds exactly like the catalog, writing index.json and index.html', () => {
  withOut((out) => {
    const r = runBuild({ root: FIXTURE, out });
    assert.equal(r.code, 0, r.stderr);
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    assert.deepEqual(index.plugins.map((p) => p.name), FIXTURE_PLUGINS);
    assert.equal(index.artifacts.length, 17);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const n of FIXTURE_PLUGINS) assert.ok(html.includes(n), `static list mentions ${n}`);
    // Markup in a fixture description is escaped in the static page.
    assert.ok(!html.includes('<script>window.__x'), 'script markup must not reach the page raw');
  });
});

test('AC-3: the real catalog index holds no fixture content', () => {
  withOut((out) => {
    const r = runBuild({ root: REPO, out });
    assert.equal(r.code, 0, r.stderr);
    const raw = readFileSync(join(out, 'index.json'), 'utf8');
    const index = JSON.parse(raw);
    const catalog = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
    assert.deepEqual(index.plugins.map((p) => p.name), catalog.plugins.map((p) => p.name));
    for (const n of FIXTURE_PLUGINS) {
      assert.ok(!index.plugins.some((p) => p.name === n), `no fixture plugin ${n}`);
      assert.ok(!index.artifacts.some((a) => a.plugin === n), `no fixture artifact for ${n}`);
    }
    assert.ok(!raw.includes('__x'), 'no fixture markup');
    assert.ok(!raw.includes('fixtures/'), 'no fixture path');
  });
});

test('AC-9 (build side): the build runs with network access blocked', () => {
  withOut((out) => {
    const r = runBuild({ root: FIXTURE, out, nodeArgs: ['--import', NO_NETWORK] });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(readFileSync(join(out, 'index.json'), 'utf8').length > 0);
  });
});

test('--out defaults to <root>/site when only --root is given', () => {
  const root = mkdtempSync(join(tmpdir(), 'fx-root-'));
  try {
    makeMarketplace(root, { plugins: [{ name: 'solo' }] });
    const r = spawnSync(process.execPath, [join(REPO, 'scripts', 'build-index.mjs'), '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'site', 'index.json'), 'utf8')).plugins.map((p) => p.name), ['solo']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown argument or a missing value fails with a usage line and writes nothing', () => {
  const out = mkdtempSync(join(tmpdir(), 'fx-out-'));
  try {
    for (const args of [['--bogus'], ['--root'], ['--out']]) {
      const r = spawnSync(process.execPath, [join(REPO, 'scripts', 'build-index.mjs'), ...args], { encoding: 'utf8' });
      assert.notEqual(r.status, 0, args.join(' '));
      assert.match(r.stderr, /usage/i);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('INDEX_BUDGET_GZIP_BYTES lowers the budget and the build fails naming a contributor', () => {
  withOut((out) => {
    const r = runBuild({ root: FIXTURE, out, env: { INDEX_BUDGET_GZIP_BYTES: '50' } });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /budget/);
    assert.match(r.stderr, /\/alpha:lookup|alpha:scout|beta/);
    assert.equal(existsSync(join(out, 'index.json')), false);
  });
});
