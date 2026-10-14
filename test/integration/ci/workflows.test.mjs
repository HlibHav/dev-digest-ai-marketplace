// AC-4/AC-9 (CI side): validate workflow, check.sh and the docs agree with the plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const validate = read('.github/workflows/validate.yml');
const check = read('scripts/check.sh');

/** Text of one top-level job (2-space indented id) up to the next job. */
function job(src, id) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l === `  ${id}:`);
  assert.notEqual(start, -1, `job ${id} exists`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

test('validate job keeps its id and runs npm ci --ignore-scripts before check.sh', () => {
  const v = job(validate, 'validate');
  const ci = v.indexOf('npm ci --ignore-scripts');
  const sh = v.indexOf('bash scripts/check.sh');
  assert.ok(ci !== -1 && sh !== -1 && ci < sh);
  assert.match(v, /node-version: +22/);
});

test('e2e is a separate job that installs chromium and runs the e2e tests', () => {
  const e = job(validate, 'e2e');
  const ci = e.indexOf('npm ci --ignore-scripts');
  const pw = e.indexOf('npx playwright install --with-deps chromium');
  const run = e.indexOf('npm run test:e2e');
  assert.ok(ci !== -1 && pw !== -1 && run !== -1);
  assert.ok(ci < pw && pw < run);
  assert.ok(!job(validate, 'validate').includes('test:e2e'), 'e2e does not live in validate');
});

test('check.sh runs npm test after plugin validation and before the build', () => {
  const plugins = check.lastIndexOf('claude plugin validate');
  const t = check.indexOf('\nnpm test\n');
  const build = check.indexOf('node scripts/build-index.mjs');
  assert.ok(plugins !== -1 && t !== -1 && build !== -1);
  assert.ok(plugins < t && t < build);
});

test('check.sh hints when node_modules is missing, before any check runs', () => {
  const hint = check.indexOf('node_modules');
  assert.ok(hint !== -1);
  assert.match(check, /npm ci/);
  assert.ok(hint < check.indexOf('node scripts/check-repo.mjs'));
});

test('CONTRIBUTING is current', () => {
  const c = read('CONTRIBUTING.md');
  assert.ok(!/Node 20/.test(c));
  assert.ok(!/does not\s+validate skill or agent frontmatter/.test(c));
  assert.match(c, /Node 22/);
  for (const cmd of ['npm ci', 'npm test', 'npm run test:e2e']) assert.ok(c.includes(cmd), cmd);
});

test('README and SITE-SPEC point to the catalog search spec', () => {
  const spec = 'specs/SPEC-2026-10-14-catalog-search.md';
  assert.ok(read('README.md').includes(spec));
  assert.ok(read('docs/SITE-SPEC.md').includes(spec));
  assert.ok(!read('docs/SITE-SPEC.md').includes('site/**'));
});
