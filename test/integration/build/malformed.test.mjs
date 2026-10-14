import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { runBuild } from '../../helpers/run-build.mjs';

const skill = (extra = '') => `---\ndescription: A skill\n${extra}---\nBody\n`;
const dep = (name, version = '~1.0.0') => ({ name, version });

// [label, plugins, file named in the error, rule fragment]
const CASES = [
  ['skill without description', [{ name: 'a', files: { 'skills/s/SKILL.md': '---\nname: s\n---\nBody\n' } }],
    'plugins/a/skills/s/SKILL.md', /description/],
  ['agent without frontmatter', [{ name: 'a', files: { 'agents/x.md': 'Just text\n' } }],
    'plugins/a/agents/x.md', /frontmatter/],
  ['agent without description', [{ name: 'a', files: { 'agents/x.md': '---\nname: x\n---\nBody\n' } }],
    'plugins/a/agents/x.md', /description/],
  ['invalid JSON in hooks.json', [{ name: 'a', files: { 'hooks/hooks.json': '{ nope' } }],
    'plugins/a/hooks/hooks.json', /JSON/],
  ['hooks.json without a top-level hooks key', [{ name: 'a', files: { 'hooks/hooks.json': { Stop: [] } } }],
    'plugins/a/hooks/hooks.json', /top-level "hooks"/],
  ['invalid JSON in .mcp.json', [{ name: 'a', files: { '.mcp.json': '{ nope' } }],
    'plugins/a/.mcp.json', /JSON/],
  ['two artifacts with the same namespaced name', [{ name: 'a', files: {
    'skills/one/SKILL.md': skill('name: same\n'), 'skills/two/SKILL.md': skill('name: same\n'),
  } }], 'plugins/a/skills/two/SKILL.md', /duplicate name "\/a:same"/],
  ['dependency naming a plugin not in the catalog', [{ name: 'a', dependencies: [dep('ghost')] }],
    'plugins/a/.claude-plugin/plugin.json', /"ghost" is not in the catalog/],
  ['dependency cycle', [{ name: 'a', dependencies: [dep('b')] }, { name: 'b', dependencies: [dep('a')] }],
    'plugins/a/.claude-plugin/plugin.json', /cycle: a -> b -> a/],
  ['non-semver range', [{ name: 'a', dependencies: [dep('b', '~1.x')] }, { name: 'b' }],
    'plugins/a/.claude-plugin/plugin.json', /not a semver range/],
  ['range that is neither ^ nor ~', [{ name: 'a', dependencies: [dep('b', '>=1.0.0')] }, { name: 'b' }],
    'plugins/a/.claude-plugin/plugin.json', /must be a \^ or ~ range/],
  ['string dependency naming a plugin not in the catalog', [{ name: 'a', dependencies: ['ghost@m@^1.0.0'] }],
    'plugins/a/.claude-plugin/plugin.json', /"ghost" is not in the catalog/],
  ['dependency given as a bare string', [{ name: 'a', dependencies: ['b'] }, { name: 'b' }],
    'plugins/a/.claude-plugin/plugin.json', /bare string/],
  ['plugin.json without a version', [{ name: 'a', manifest: { version: 42 } }],
    'plugins/a/.claude-plugin/plugin.json', /version/],
];

for (const [label, plugins, file, rule] of CASES) {
  test(`AC-5: ${label} fails the build, names file and rule, writes no index`, () => {
    const root = mkdtempSync(join(tmpdir(), 'bad-root-'));
    const out = mkdtempSync(join(tmpdir(), 'bad-out-'));
    try {
      makeMarketplace(root, { plugins });
      const r = runBuild({ root, out });
      assert.notEqual(r.code, 0, `expected failure, stdout: ${r.stdout}`);
      assert.ok(r.stderr.includes(file), `stderr should name ${file}: ${r.stderr}`);
      assert.match(r.stderr, rule);
      assert.equal(existsSync(join(out, 'index.json')), false, 'no index.json');
      assert.deepEqual(readdirSync(out), [], 'nothing published at all');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
}

test('control: the same scaffolding without a defect builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'ok-root-'));
  const out = mkdtempSync(join(tmpdir(), 'ok-out-'));
  try {
    makeMarketplace(root, { plugins: [
      { name: 'a', dependencies: [dep('b')], files: { 'skills/s/SKILL.md': skill() } },
      { name: 'b' },
    ] });
    const r = runBuild({ root, out });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(out, 'index.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('catalog problems: missing catalog, unreadable plugin.json and a source outside the root fail with the file named', () => {
  const root = mkdtempSync(join(tmpdir(), 'cat-root-'));
  const out = mkdtempSync(join(tmpdir(), 'cat-out-'));
  try {
    let r = runBuild({ root, out });
    assert.notEqual(r.code, 0);
    assert.ok(r.stderr.includes('.claude-plugin/marketplace.json'), r.stderr);

    makeMarketplace(root, { plugins: [{ name: 'a' }], catalog: {} });
    rmSync(join(root, 'plugins', 'a', '.claude-plugin', 'plugin.json'));
    r = runBuild({ root, out });
    assert.notEqual(r.code, 0);
    assert.ok(r.stderr.includes('plugins/a/.claude-plugin/plugin.json'), r.stderr);

    makeMarketplace(root, { plugins: [{ name: 'a', entry: { source: '../outside' } }] });
    r = runBuild({ root, out });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /outside/);
    assert.deepEqual(readdirSync(out), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
