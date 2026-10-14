import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fx = join(root, 'test', 'fixtures', 'marketplace');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = () => json(join(fx, '.claude-plugin', 'marketplace.json'));
const manifest = (n) => json(join(fx, 'plugins', n, '.claude-plugin', 'plugin.json'));
const ls = (n, sub) => readdirSync(join(fx, 'plugins', n, sub)).sort();

function allFiles(dir) {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    if (d.isDirectory()) out.push(...allFiles(full));
    else if (d.isFile()) out.push(full);
  }
  return out;
}

test('the fixture lives outside plugins/ and has six plugins', () => {
  assert.deepEqual(catalog().plugins.map((p) => p.name), ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'suite']);
  assert.ok(!relative(root, fx).startsWith('plugins'));
});

test('every catalog plugin dir exists with a manifest that matches its entry', () => {
  for (const e of catalog().plugins) {
    assert.equal(e.source, `./plugins/${e.name}`);
    assert.ok(existsSync(join(fx, e.source)), `${e.name} directory missing`);
    assert.equal(manifest(e.name).name, e.name);
    assert.match(manifest(e.name).version, /^\d+\.\d+\.\d+$/);
    assert.ok(existsSync(join(fx, e.source, 'README.md')), `${e.name} README missing`);
  }
});

test('every dependency names a catalog plugin with a tilde range', () => {
  const names = new Set(catalog().plugins.map((p) => p.name));
  for (const n of names) {
    for (const dep of manifest(n).dependencies ?? []) {
      assert.ok(names.has(dep.name), `${n} depends on unknown ${dep.name}`);
      assert.match(dep.version, /^~\d+\.\d+\.\d+$/, `${n} -> ${dep.name} range`);
    }
  }
});

test('dependency graph: beta -> alpha, gamma; gamma -> delta; suite -> alpha, beta, delta', () => {
  const deps = (n) => (manifest(n).dependencies ?? []).map((d) => d.name).sort();
  assert.deepEqual(deps('alpha'), []);
  assert.deepEqual(deps('beta'), ['alpha', 'gamma']);
  assert.deepEqual(deps('gamma'), ['delta']);
  assert.deepEqual(deps('delta'), []);
  assert.deepEqual(deps('epsilon'), []);
  assert.deepEqual(deps('suite'), ['alpha', 'beta', 'delta']);
});

test('alpha is one-of-each: 1 skill, 1 agent, 1 command, 2 hooks, 2 MCP servers', () => {
  assert.equal(ls('alpha', 'skills').length, 1);
  assert.equal(ls('alpha', 'agents').length, 1);
  assert.equal(ls('alpha', 'commands').length, 1);
  const hooks = json(join(fx, 'plugins', 'alpha', 'hooks', 'hooks.json')).hooks;
  assert.equal(Object.values(hooks).flat().length, 2);
  assert.equal(Object.keys(json(join(fx, 'plugins', 'alpha', '.mcp.json')).mcpServers).length, 2);
  assert.ok(!existsSync(join(fx, 'plugins', 'alpha', 'scripts')));
});

test('beta covers naming, trust and scripts cases', () => {
  assert.ok(ls('beta', 'skills').includes('review'));
  assert.match(
    readFileSync(join(fx, 'plugins', 'beta', 'skills', 'review', 'SKILL.md'), 'utf8'),
    /Architecture review of a diff against layer boundaries/,
  );
  assert.match(readFileSync(join(fx, 'plugins', 'beta', 'skills', 'x', 'SKILL.md'), 'utf8'), /^name: audit$/m);
  assert.ok(existsSync(join(fx, 'plugins', 'beta', 'commands', 'ops', 'deploy.md')));
  assert.equal(ls('beta', 'agents').length, 1);
  const hooks = json(join(fx, 'plugins', 'beta', 'hooks', 'hooks.json')).hooks;
  assert.ok(hooks.SessionStart);
  assert.equal(hooks.PreToolUse.length, 1);
  assert.equal('matcher' in hooks.PreToolUse[0], false, 'PreToolUse must have no matcher');
  const servers = json(join(fx, 'plugins', 'beta', '.mcp.json')).mcpServers;
  assert.ok(Object.values(servers).some((s) => s.command));
  assert.ok(Object.values(servers).some((s) => s.url === 'https://example.com/mcp'));
  assert.ok(statSync(join(fx, 'plugins', 'beta', 'scripts')).isDirectory());
});

test('delta carries script and onerror payloads in a skill description', () => {
  const text = readFileSync(join(fx, 'plugins', 'delta', 'skills', ls('delta', 'skills')[0], 'SKILL.md'), 'utf8');
  assert.ok(text.includes('<script>window.__x=1</script>'));
  assert.ok(text.includes('<img src=x onerror=window.__x=2>'));
});

test('epsilon and suite have no artifacts', () => {
  for (const n of ['epsilon', 'suite']) {
    const entries = readdirSync(join(fx, 'plugins', n)).filter((f) => f !== '.claude-plugin' && f !== 'README.md');
    assert.deepEqual(entries, [], `${n} must hold only a manifest and a README`);
  }
});

test('hook commands use CLAUDE_PLUGIN_ROOT', () => {
  for (const n of ['alpha', 'beta']) {
    const hooks = json(join(fx, 'plugins', n, 'hooks', 'hooks.json')).hooks;
    for (const group of Object.values(hooks).flat()) {
      for (const h of group.hooks) assert.match(h.command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    }
  }
});

test('no fixture file contains a user-home or drive-letter absolute path', () => {
  const ABS = /\/Users\/|\/home\/|[A-Za-z]:\\/i;
  const files = allFiles(fx);
  assert.ok(files.length > 10);
  for (const f of files) {
    const hit = readFileSync(f, 'utf8').split('\n').findIndex((l) => ABS.test(l));
    assert.equal(hit, -1, `${relative(root, f)}:${hit + 1} has an absolute path`);
  }
});
