import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { assertIndexShape } from '../../../site-src/contract/index-contract.js';
import { buildIndex } from '../../../scripts/lib/index-builder.mjs';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'marketplace');
const ADD = '/plugin marketplace add HlibHav/dev-digest-ai-marketplace';

test('AC-1: one plugin of one-of-each yields 1 plugin entry and 7 artifacts with the right types and owner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shape-'));
  try {
    makeMarketplace(dir, {
      plugins: [{
        name: 'demo',
        files: {
          'skills/lookup/SKILL.md': '---\ndescription: Look things up\n---\nBody\n',
          'agents/scout.md': '---\ndescription: Scouts\n---\nBody\n',
          'commands/ping.md': '---\ndescription: Ping\n---\nBody\n',
          'hooks/hooks.json': { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a.sh' }] }], SessionStart: [{ hooks: [{ type: 'command', command: 'b.sh' }] }] } },
          '.mcp.json': { mcpServers: { one: { command: 'x' }, two: { type: 'http', url: 'https://example.com/m' } } },
        },
      }],
    });
    const { index, json } = buildIndex({ root: dir });
    assertIndexShape(index);
    assert.equal(index.plugins.length, 1);
    assert.equal(index.artifacts.length, 7);
    assert.deepEqual(index.artifacts.map((a) => a.type), ['skill', 'agent', 'command', 'hook', 'hook', 'mcp_server', 'mcp_server']);
    assert.ok(index.artifacts.every((a) => a.plugin === 'demo'));
    assert.deepEqual(index.artifacts.map((a) => a.name), [
      '/demo:lookup', 'demo:scout', '/demo:ping', 'demo/SessionStart#0', 'demo/Stop#0', 'demo/one', 'demo/two',
    ]);
    assert.equal(json, `${JSON.stringify(index)}\n`, 'compact JSON with one trailing newline');
    assert.equal(index.schema_version, 1);
    assert.equal(index.marketplace, 'dev-digest-ai-marketplace');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the fixture marketplace passes the contract; plugins keep catalog order', () => {
  const { index } = buildIndex({ root: FIXTURE });
  assertIndexShape(index);
  assert.deepEqual(index.plugins.map((p) => p.name), ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'suite']);
  assert.equal(index.artifacts.length, 17);
  const byPlugin = (n) => index.artifacts.filter((a) => a.plugin === n).map((a) => a.name);
  assert.deepEqual(byPlugin('alpha'), [
    '/alpha:lookup', 'alpha:scout', '/alpha:ping', 'alpha/PostToolUse#0', 'alpha/SessionStart#0', 'alpha/local-tool', 'alpha/loopback-api',
  ]);
  assert.deepEqual(byPlugin('beta'), [
    '/beta:audit', '/beta:review', 'beta:inspector', '/beta:ops:deploy', 'beta/PreToolUse#0', 'beta/SessionStart#0', 'beta/remote-docs', 'beta/stdio-tool',
  ]);
  assert.deepEqual(byPlugin('epsilon'), []);
});

test('plugin entries carry dependencies with ranges, install commands, trust and cost', () => {
  const { index } = buildIndex({ root: FIXTURE });
  const p = Object.fromEntries(index.plugins.map((x) => [x.name, x]));
  assert.deepEqual(p.suite.dependencies, [{ name: 'alpha', range: '^1.0.0' }, { name: 'beta', range: '^1.0.0' }, { name: 'delta', range: '^0.2.0' }]);
  assert.deepEqual(p.alpha.install_commands, [ADD, '/plugin install alpha@dev-digest-ai-marketplace']);
  assert.equal(p.beta.version, '1.0.0');
  assert.equal(p.delta.version, '0.2.1');
  assert.equal(p.alpha.category, 'engineering');
  assert.deepEqual(p.alpha.tags, ['fixture', 'complete']);
  // trust
  assert.deepEqual(p.alpha.trust.hooks.map((h) => [h.event, h.matcher, h.broad, h.source_path]), [
    ['SessionStart', null, false, 'plugins/alpha/hooks/hooks.json'],
    ['PostToolUse', 'Write', true, 'plugins/alpha/hooks/hooks.json'],
  ]);
  assert.equal(p.alpha.trust.has_scripts, false);
  assert.deepEqual(p.alpha.trust.network_urls, ['http://localhost:8080/mcp']);
  assert.equal(p.beta.trust.has_scripts, true);
  assert.deepEqual(p.beta.trust.mcp_servers.map((s) => [s.name, s.transport, s.non_loopback]), [['stdio-tool', 'command', false], ['remote-docs', 'url', true]]);
  assert.deepEqual(p.beta.trust.network_urls, ['https://example.com/mcp']);
  assert.deepEqual(p.epsilon.trust, { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] });
  // cost: alpha has a skill, an agent and a command
  const alphaFiles = [
    ['lookup', 'Look up a symbol in the repository and report where it is defined and used.'],
    ['scout', 'Read-only scout that maps an unfamiliar directory before work starts.'],
    ['ping', 'Check that the plugin is loaded.'],
  ];
  const expectedAlways = alphaFiles.reduce((n, [s, d]) => n + Math.ceil((s.length + d.length) / 4), 0);
  assert.equal(p.alpha.cost.always_loaded_tokens, expectedAlways);
  assert.ok(p.alpha.cost.on_invocation_tokens > 0);
  assert.equal(p.epsilon.cost.always_loaded_tokens, 0);
  assert.equal(p.epsilon.cost.on_invocation_tokens, 0);
});

test('hook and MCP artifacts describe event, matcher, command and transport', () => {
  const { index } = buildIndex({ root: FIXTURE });
  const by = Object.fromEntries(index.artifacts.map((a) => [a.name, a]));
  assert.equal(by['alpha/PostToolUse#0'].description, 'PostToolUse hook on Write: ${CLAUDE_PLUGIN_ROOT}/hooks/after-write.sh');
  assert.equal(by['alpha/SessionStart#0'].description, 'SessionStart hook: ${CLAUDE_PLUGIN_ROOT}/hooks/session.sh');
  assert.equal(by['alpha/local-tool'].description, 'command MCP server: node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js --stdio');
  assert.equal(by['beta/remote-docs'].description, 'url MCP server: https://example.com/mcp');
  assert.equal(by['alpha/PostToolUse#0'].source_path, 'plugins/alpha/hooks/hooks.json');
  assert.equal(by['/beta:audit'].source_path, 'plugins/beta/skills/x/SKILL.md');
  assert.deepEqual(by['/alpha:ping'].install_commands, [ADD, '/plugin install alpha@dev-digest-ai-marketplace']);
});

test('hook indexes count per event across sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shape-'));
  try {
    const g = (c) => ({ hooks: [{ type: 'command', command: c }] });
    makeMarketplace(dir, {
      plugins: [{
        name: 'demo',
        files: { 'hooks/hooks.json': { hooks: { Stop: [g('a'), g('b')] } } },
        manifest: { hooks: { Stop: [g('c')] } },
      }],
    });
    const { index } = buildIndex({ root: dir });
    assert.deepEqual(index.artifacts.map((a) => a.name), ['demo/Stop#0', 'demo/Stop#1', 'demo/Stop#2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
