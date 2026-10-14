import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const pkg = () => JSON.parse(read('package.json'));

test('package.json requires Node 22 or newer', () => {
  assert.match(pkg().engines?.node ?? '', /^>=\s*22/);
});

test('devDependencies are pinned exactly', () => {
  const dev = pkg().devDependencies ?? {};
  for (const name of ['minisearch', 'esbuild', '@playwright/test', '@axe-core/playwright']) {
    assert.ok(name in dev, `${name} missing from devDependencies`);
    assert.match(dev[name], /^\d+\.\d+\.\d+$/, `${name} must be an exact version, got ${dev[name]}`);
  }
});

test('no paid shader package is a dependency', () => {
  const all = { ...pkg().dependencies, ...pkg().devDependencies };
  // Effects are the project's own code (ADR 2026-10-14-own-webgpu-effects): no third-party effect library.
  assert.equal(Object.keys(all).filter((n) => /shader/i.test(n)).length, 0);
});

test('npm scripts exist', () => {
  const s = pkg().scripts ?? {};
  assert.equal(s.test, 'node --test "test/unit/**/*.test.mjs" "test/integration/**/*.test.mjs"');
  assert.equal(s['test:e2e'], 'playwright test');
  assert.equal(s.build, 'node scripts/build-index.mjs');
  assert.ok(s['test:unit'], 'test:unit missing');
  assert.ok(s['test:integration'], 'test:integration missing');
});

test('the lockfile exists', () => {
  assert.ok(existsSync(join(root, 'package-lock.json')));
});

test('.gitignore lists generated directories', () => {
  const lines = read('.gitignore').split('\n').map((l) => l.trim());
  for (const entry of ['node_modules/', '/site/', '.tmp/', 'test-results/', 'playwright-report/']) {
    assert.ok(lines.includes(entry), `.gitignore must list ${entry}`);
  }
});

test('CODEOWNERS covers curated data and dependency files', () => {
  const lines = read('CODEOWNERS').split('\n').map((l) => l.trim().split(/\s+/)[0]);
  for (const p of ['/data/', '/package.json', '/package-lock.json']) {
    assert.ok(lines.includes(p), `CODEOWNERS must have a line for ${p}`);
  }
});

test('check-repo SKIP_DIRS skips generated directories', () => {
  const src = read('scripts/check-repo.mjs');
  const m = src.match(/SKIP_DIRS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'SKIP_DIRS not found');
  for (const d of ['.tmp', 'test-results', 'playwright-report']) {
    assert.ok(m[1].includes(`'${d}'`), `SKIP_DIRS must include ${d}`);
  }
});
