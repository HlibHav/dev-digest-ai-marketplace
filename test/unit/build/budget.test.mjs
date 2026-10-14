import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { MAX_EXCERPT } from '../../../site-src/contract/index-contract.js';
import { DEFAULT_INDEX_BUDGET_GZIP_BYTES, checkIndexBudget, excerpt } from '../../../scripts/lib/budget.mjs';
import { buildIndex } from '../../../scripts/lib/index-builder.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';

const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const skill = (desc, body) => `---\ndescription: ${desc}\n---\n${body}\n`;

test('the default budget is 500 KB gzipped', () => {
  assert.equal(DEFAULT_INDEX_BUDGET_GZIP_BYTES, 500 * 1024);
});

test('excerpt keeps at most 4000 characters and never splits a surrogate pair', () => {
  assert.equal(MAX_EXCERPT, 4000);
  assert.equal(excerpt('a'.repeat(100000)).length, 4000);
  assert.equal(excerpt('short'), 'short');
  const emoji = `${'a'.repeat(3999)}\u{1F600}tail`;
  const cut = excerpt(emoji);
  assert.ok(cut.length <= 4000);
  assert.equal(cut, 'a'.repeat(3999));
});

test('a body of 100 000 chars stores 4000 in the index; the full body still counts for cost', () => {
  withDir((dir) => {
    makeMarketplace(dir, { plugins: [{ name: 'demo', files: { 'skills/big/SKILL.md': skill('Big', 'x'.repeat(100000)) } }] });
    const { index } = buildIndex({ root: dir });
    const art = index.artifacts.find((a) => a.name === '/demo:big');
    assert.equal(art.body_excerpt.length, 4000);
    // always loaded: ceil((3 + 3) / 4) = 2; on invocation: 100000 / 4
    assert.equal(index.plugins[0].cost.on_invocation_tokens, 25000);
    assert.equal(index.plugins[0].cost.always_loaded_tokens, 2);
  });
});

test('over a lowered budget the error names the 5 largest artifacts', () => {
  withDir((dir) => {
    const files = {};
    for (let i = 1; i <= 7; i += 1) files[`skills/s${i}/SKILL.md`] = skill(`Skill ${i}`, `${'w'.repeat(i * 100)}`);
    makeMarketplace(dir, { plugins: [{ name: 'demo', files }] });
    assert.throws(
      () => buildIndex({ root: dir, indexBudgetGzipBytes: 1 }),
      (e) => {
        assert.ok(e instanceof BuildError);
        assert.match(e.rule, /budget/);
        for (const n of [7, 6, 5, 4, 3]) assert.match(e.message, new RegExp(`/demo:s${n}\\b`));
        for (const n of [1, 2]) assert.doesNotMatch(e.message, new RegExp(`/demo:s${n}\\b`));
        return true;
      },
    );
  });
});

test('a budget that fits builds fine', () => {
  withDir((dir) => {
    makeMarketplace(dir, { plugins: [{ name: 'demo', files: { 'skills/a/SKILL.md': skill('A', 'body') } }] });
    assert.doesNotThrow(() => buildIndex({ root: dir, indexBudgetGzipBytes: 100000 }));
  });
});

test('checkIndexBudget alone: passes under the limit, fails over it', () => {
  const index = { artifacts: [{ name: 'a', body_excerpt: 'x' }] };
  const json = `${JSON.stringify(index)}\n`;
  assert.doesNotThrow(() => checkIndexBudget(index, json, 10000));
  assert.throws(() => checkIndexBudget(index, json, 1), BuildError);
});
