// scripts/lib/safe-path.mjs and the build call sites that use it: a `../` plugin path or a symlink that leaves
// its root is refused, never read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { buildIndex } from '../../../scripts/lib/index-builder.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';
import {
  PathEscapeError, assertRealInside, isInside, readTextInside, resolveInside, safeResolve,
} from '../../../scripts/lib/safe-path.mjs';
import { parseArgs, readEvalFile } from '../../../scripts/run-evals.mjs';

const withDirs = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'safe-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'safe-out-'));
  try {
    return fn(root, outside);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
};

test('resolveInside joins segments under the root and returns an absolute path', () => {
  withDirs((root) => {
    assert.equal(resolveInside(root, 'a', 'b.txt'), join(root, 'a', 'b.txt'));
    assert.equal(resolveInside(root, 'a/../b'), join(root, 'b'));
    assert.equal(resolveInside(root), root);
    assert.equal(resolveInside(root, '..foo'), join(root, '..foo'), 'a name that merely starts with two dots is fine');
  });
});

test('resolveInside rejects "..", absolute segments, sibling prefixes and NUL bytes', () => {
  withDirs((root) => {
    for (const bad of [['..'], ['../x'], ['a', '../../x'], ['/etc/passwd'], ['a', '/etc/passwd']]) {
      assert.throws(() => resolveInside(root, ...bad), PathEscapeError, bad.join('|'));
    }
    assert.throws(() => resolveInside(root, `../${root.split('/').pop()}-evil/x`), PathEscapeError);
    assert.throws(() => resolveInside(root, 'a\0b'), PathEscapeError);
    assert.throws(() => resolveInside(root, 42), PathEscapeError);
  });
});

test('isInside is true for the root itself and for descendants only', () => {
  assert.equal(isInside('/r', '/r'), true);
  assert.equal(isInside('/r', '/r/a/b'), true);
  assert.equal(isInside('/r', '/r-evil'), false);
  assert.equal(isInside('/r', '/'), false);
});

test('assertRealInside refuses a file symlink, a directory symlink and a dangling link that leave the root', () => {
  withDirs((root, outside) => {
    writeFileSync(join(outside, 'secret.txt'), 'secret');
    writeFileSync(join(root, 'real.txt'), 'ok');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'file-link'));
    symlinkSync(outside, join(root, 'dir-link'));
    symlinkSync(join(outside, 'missing'), join(root, 'dangling'));
    symlinkSync(join(root, 'real.txt'), join(root, 'inner-link'));
    assert.equal(assertRealInside(root, join(root, 'real.txt')), join(root, 'real.txt'));
    assert.equal(assertRealInside(root, join(root, 'inner-link')), join(root, 'inner-link'), 'a link that stays inside is fine');
    assert.equal(assertRealInside(root, join(root, 'not-there')), join(root, 'not-there'), 'a missing path is left to the caller');
    for (const p of ['file-link', 'dir-link', 'dir-link/secret.txt', 'dangling']) {
      assert.throws(() => assertRealInside(root, join(root, p)), PathEscapeError, p);
    }
  });
});

test('safeResolve and readTextInside combine the lexical and the symlink check', () => {
  withDirs((root, outside) => {
    writeFileSync(join(outside, 'secret.txt'), 'secret');
    writeFileSync(join(root, 'ok.txt'), 'fine');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'));
    assert.equal(readTextInside(root, 'ok.txt'), 'fine');
    assert.throws(() => readTextInside(root, 'leak.txt'), PathEscapeError);
    assert.throws(() => readTextInside(root, '../etc/passwd'), PathEscapeError);
    assert.throws(() => safeResolve(root, 'leak.txt'), PathEscapeError);
  });
});

test('buildIndex rejects a catalog source that climbs out with ../', () => {
  withDirs((root) => {
    makeMarketplace(root, { plugins: [{ name: 'demo', entry: { source: './plugins/../../elsewhere' } }] });
    assert.throws(() => buildIndex({ root }), (e) => e instanceof BuildError && /points outside the repository/.test(e.message));
  });
});

test('buildIndex rejects a plugin directory that is a symlink out of the repo', () => {
  withDirs((root, outside) => {
    makeMarketplace(root, { plugins: [{ name: 'demo' }] });
    mkdirSync(join(outside, '.claude-plugin'), { recursive: true });
    writeFileSync(join(outside, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', version: '9.9.9' }));
    rmSync(join(root, 'plugins', 'demo'), { recursive: true });
    symlinkSync(outside, join(root, 'plugins', 'demo'));
    assert.throws(() => buildIndex({ root }), (e) => e instanceof BuildError && /points outside the repository/.test(e.message));
  });
});

test('buildIndex rejects a hooks path that climbs out of the plugin with ../', () => {
  withDirs((root) => {
    makeMarketplace(root, { plugins: [{ name: 'demo', manifest: { hooks: '../../../outside.json' } }] });
    assert.throws(() => buildIndex({ root }), (e) => e instanceof BuildError && /points outside the plugin directory/.test(e.message));
  });
});

test('buildIndex rejects a skill whose SKILL.md is a symlink to a file outside the root', () => {
  withDirs((root, outside) => {
    writeFileSync(join(outside, 'secret.md'), '---\ndescription: leaked\n---\nsecret body\n');
    makeMarketplace(root, { plugins: [{ name: 'demo', files: { 'skills/x/placeholder.txt': 'x' } }] });
    symlinkSync(join(outside, 'secret.md'), join(root, 'plugins', 'demo', 'skills', 'x', 'SKILL.md'));
    assert.throws(() => buildIndex({ root }), (e) => e instanceof BuildError && /symlink/.test(e.message) && /SKILL\.md/.test(e.message));
  });
});

test('buildIndex rejects a skills directory that is a symlink out of the plugin', () => {
  withDirs((root, outside) => {
    mkdirSync(join(outside, 'x'), { recursive: true });
    writeFileSync(join(outside, 'x', 'SKILL.md'), '---\ndescription: leaked\n---\nbody\n');
    makeMarketplace(root, { plugins: [{ name: 'demo' }] });
    symlinkSync(outside, join(root, 'plugins', 'demo', 'skills'));
    assert.throws(() => buildIndex({ root }), (e) => e instanceof BuildError && /symlink/.test(e.message));
  });
});

test('readEvalFile returns the text of a file inside the project and "" for a planted symlink out of it', () => {
  withDirs((root, outside) => {
    writeFileSync(join(outside, 'secret.txt'), 'secret');
    writeFileSync(join(root, 'a.txt'), 'inside');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'));
    assert.equal(readEvalFile(root, 'a.txt'), 'inside');
    assert.equal(readEvalFile(root, 'leak.txt'), '');
    assert.equal(readEvalFile(root, '../x'), '');
  });
});

test('run-evals validates its free-text options before use', () => {
  assert.equal(parseArgs(['--model', 'claude-haiku-4.5:x', '--cases', 'negative,case_1', '--repeat', '3']).repeat, 3);
  for (const model of ['$(id)', 'a b', 'x;rm', '--bogus', '', 'a'.repeat(65)]) {
    assert.throws(() => parseArgs(['--model', model]), /--model/, model);
  }
  for (const cases of ['all; id', '$(id)', '`id`', '-x']) assert.throws(() => parseArgs(['--cases', cases]), /--cases/, cases);
  for (const repeat of ['0', '-1', '1.5', '3abc', '21', '', '100', '1e1']) assert.throws(() => parseArgs(['--repeat', repeat]), /--repeat/, repeat);
});
