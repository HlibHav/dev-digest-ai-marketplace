// Each rule of scripts/check-repo.mjs is proven twice: a good tree passes, a tree broken in exactly that
// one way fails with the rule's message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = join(repo, 'scripts', 'check-repo.mjs');
const GUARD = 'scripts/agent-guard.py';

const check = (root) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};

/** Builds a tree, lets `mutate(root)` break it, runs the check, removes the tree. */
function run(plugins, mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-repo-'));
  try {
    makeMarketplace(root, { plugins });
    mutate(root);
    return check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const ok = (r) => assert.equal(r.code, 0, r.out);
const bad = (r, rule) => {
  assert.equal(r.code, 1, `expected a failure, got:\n${r.out}`);
  assert.match(r.out, rule);
};

test('the fixture marketplace passes', () => {
  ok(check(join(repo, 'test', 'fixtures', 'marketplace')));
});

test('a plugin needs CHANGELOG.md, COMPATIBILITY.md and LICENSE', () => {
  ok(run([{ name: 'a' }]));
  for (const f of ['CHANGELOG.md', 'COMPATIBILITY.md', 'LICENSE']) {
    bad(run([{ name: 'a', files: { [f]: null } }], (root) => rmSync(join(root, 'plugins/a', f), { force: true })), new RegExp(`plugins/a/${f.replace('.', '\\.')}: plugin ${f.replace('.', '\\.')} missing`));
  }
});

test('the first CHANGELOG version heading must equal plugin.json version', () => {
  ok(run([{ name: 'a', version: '1.2.3' }]));
  bad(run([{ name: 'a', version: '1.2.3', files: { 'CHANGELOG.md': '# C\n\n## 1.2.2\n\n- old\n' } }]), /CHANGELOG\.md: first version heading 1\.2\.2 differs from plugin\.json version 1\.2\.3/);
  bad(run([{ name: 'a', files: { 'CHANGELOG.md': '# C\n\nnothing here\n' } }]), /CHANGELOG\.md: no "## x\.y\.z" version heading/);
  ok(run([{ name: 'a', version: '1.2.3', files: { 'CHANGELOG.md': '# C\n\n## 1.2.3 — 2026-10-14\n\n- new\n\n## 1.0.0\n\n- first\n' } }]));
});

test('COMPATIBILITY.md needs a Claude Code >= range line', () => {
  ok(run([{ name: 'a', files: { 'COMPATIBILITY.md': 'Requires Claude Code `>=2.1.296`.\n' } }]));
  bad(run([{ name: 'a', files: { 'COMPATIBILITY.md': 'Works with recent versions.\n' } }]), /COMPATIBILITY\.md: no Claude Code range line/);
  bad(run([{ name: 'a', files: { 'COMPATIBILITY.md': 'Claude Code 2.1\n' } }]), /COMPATIBILITY\.md: no Claude Code range line/);
});

test('no symlinks anywhere under plugins/', () => {
  const link = (target) => (root) => symlinkSync(target, join(root, 'plugins/a/link'));
  ok(run([{ name: 'a' }]));
  bad(run([{ name: 'a' }], link('README.md')), /plugins\/a\/link: symlinks are not allowed under plugins\//);
  bad(run([{ name: 'a' }], link('/etc/hosts')), /plugins\/a\/link: symlinks are not allowed/);
});

test('a catalog source that climbs out of the repo with ../ is refused', () => {
  bad(run([{ name: 'a', entry: { source: './plugins/../../elsewhere' } }]), /source \.\/plugins\/\.\.\/\.\.\/elsewhere points outside the repository/);
});

test('every agent-guard.py is byte-identical to the paved-path original', () => {
  const guard = (text) => ({ [GUARD]: text });
  const plugins = (copy) => [
    { name: 'engineering-paved-path', files: guard('#!/usr/bin/env python3\nprint("guard")\n') },
    { name: 'copy', files: guard(copy) },
  ];
  ok(run(plugins('#!/usr/bin/env python3\nprint("guard")\n')));
  bad(run(plugins('#!/usr/bin/env python3\nprint("guard ")\n')), /plugins\/copy\/scripts\/agent-guard\.py: differs from plugins\/engineering-paved-path\/scripts\/agent-guard\.py/);
  bad(run([{ name: 'copy', files: guard('x\n') }]), /canonical plugins\/engineering-paved-path\/scripts\/agent-guard\.py is missing/);
});

const withDeps = (deps, extra = []) => run([{ name: 'a', dependencies: deps }, { name: 'b' }, { name: 'c', dependencies: [{ name: 'a', version: '^1.0.0' }] }, ...extra]);

test('dependencies: the object form with a ^ range passes', () => {
  ok(withDeps([{ name: 'b', version: '^0.1.0' }]));
});

test('dependencies: the string form fails, because Claude Code ignores its range', () => {
  bad(withDeps(['b@fixture-marketplace@^0.1.0']), /use the object form/);
});

test('dependencies: a name outside the catalog fails', () => {
  bad(withDeps([{ name: 'ghost', version: '^1.0.0' }]), /plugin\.json: dependency "ghost" is not in the catalog/);
});

test('dependencies: a cycle fails', () => {
  bad(withDeps([{ name: 'c', version: '^1.0.0' }]), /dependency cycle: a -> c -> a/);
});

test('dependencies: every range must start with ^', () => {
  bad(withDeps([{ name: 'b', version: '~0.1.0' }]), /dependency "b": range "~0\.1\.0" must start with \^/);
  bad(withDeps([{ name: 'b', version: '>=0.1.0' }]), /\^/);
  bad(withDeps([{ name: 'b' }]), /needs a string "version" range/);
});

test('arguments: an unknown flag, or --root with no value, exits 2 with usage and checks nothing', () => {
  for (const args of [['--bogus'], ['--root'], ['--root', '--bogus'], ['--root', '']]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${args.join(' ')}:\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /usage: node scripts\/check-repo\.mjs/);
    assert.doesNotMatch(r.stdout, /check-repo: OK/);
  }
});
