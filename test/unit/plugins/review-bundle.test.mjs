// review-bundle.sh removes and rebuilds its out-dir, so it must refuse any out-dir outside the
// system temp folder or the repo's .tmp/ before it runs `rm -rf`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = join(repo, 'plugins/engineering-paved-path/skills/review-bundle/scripts/review-bundle.sh');

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

/** A throwaway repo with two commits under the system temp folder. */
function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-bundle-')));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'one');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  git(dir, 'commit', '-q', '-am', 'two');
  return dir;
}

const bundle = (cwd, out, env = {}) =>
  spawnSync('bash', [SCRIPT, 'HEAD~1...HEAD', out], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

test('an out-dir under the system temp folder or the repo .tmp/ is built', () => {
  const dir = makeRepo();
  try {
    for (const out of [join(dir, '.tmp', 'bundle'), '.tmp/rel-bundle', join(realpathSync(tmpdir()), `rb-out-${process.pid}`)]) {
      const r = bundle(dir, out);
      assert.equal(r.status, 0, `${out}: ${r.stderr}`);
      const abs = resolve(dir, out);
      assert.ok(existsSync(join(abs, 'index.txt')), `${out}: no index.txt`);
      if (!abs.startsWith(dir)) rmSync(abs, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a dangerous out-dir is refused and nothing is removed', () => {
  const dir = makeRepo();
  const sentinel = join(dir, 'keep-me');
  mkdirSync(sentinel);
  writeFileSync(join(sentinel, 'file'), 'x');
  const cases = [
    ['', 'empty'],
    ['/', 'root'],
    [dir, 'the repo itself'],
    [sentinel, 'a directory in the repo outside .tmp/'],
    ['keep-me', 'a relative directory outside .tmp/'],
    [join(dir, '.tmp'), 'the .tmp/ folder itself'],
    [join(dir, '.tmp', '..', 'keep-me'), 'a .. escape'],
    [homedir(), '$HOME'],
    [realpathSync(tmpdir()), 'the temp folder itself'],
  ];
  try {
    mkdirSync(join(dir, '.tmp'), { recursive: true });
    writeFileSync(join(dir, '.tmp', 'other'), 'x');
    for (const [out, why] of cases) {
      const r = bundle(dir, out);
      assert.equal(r.status, 2, `${why} (${out}) was accepted:\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /refusing out-dir/, why);
      assert.ok(existsSync(join(sentinel, 'file')), `${why}: sentinel removed`);
      assert.ok(existsSync(join(dir, '.tmp', 'other')), `${why}: .tmp content removed`);
      assert.ok(existsSync(join(dir, 'a.txt')), `${why}: repo file removed`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a TMPDIR of / or $HOME does not widen what may be removed', () => {
  const dir = makeRepo();
  const victim = mkdtempSync(join(homedir(), '.review-bundle-victim-'));
  writeFileSync(join(victim, 'file'), 'x');
  try {
    for (const TMPDIR of ['/', homedir()]) {
      const r = bundle(dir, victim, { TMPDIR });
      assert.equal(r.status, 2, `TMPDIR=${TMPDIR} let ${victim} through:\n${r.stdout}${r.stderr}`);
      assert.ok(existsSync(join(victim, 'file')), `TMPDIR=${TMPDIR}: victim removed`);
    }
  } finally {
    rmSync(victim, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
