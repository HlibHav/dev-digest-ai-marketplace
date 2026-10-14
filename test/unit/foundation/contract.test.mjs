import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPES, SCHEMA_VERSION, MARKETPLACE, REPO, MAX_EXCERPT, MAX_QUERY, assertIndexShape,
} from '../../../site-src/contract/index-contract.js';

const ADD = `/plugin marketplace add ${REPO}`;

function sample() {
  const install = [ADD, `/plugin install alpha@${MARKETPLACE}`];
  return {
    schema_version: SCHEMA_VERSION,
    marketplace: MARKETPLACE,
    plugins: [{
      name: 'alpha', version: '0.1.0', description: 'A plugin', category: 'engineering', tags: ['x'],
      dependencies: [{ name: 'beta', range: '~1.0.0' }],
      install_commands: install,
      trust: {
        hooks: [{ event: 'PreToolUse', matcher: null, broad: true, source_path: 'plugins/alpha/hooks/hooks.json' }],
        mcp_servers: [{
          name: 's', transport: 'url', url: 'https://example.com/mcp', args: [], non_loopback: true,
          source_path: 'plugins/alpha/.mcp.json',
        }],
        has_scripts: false,
        network_urls: ['https://example.com/mcp'],
      },
      cost: {
        always_loaded_tokens: 10, on_invocation_tokens: 20, method: 'characters / 4, rounded up',
        excluded: ['hook output'],
      },
    }],
    artifacts: [{
      type: 'skill', name: '/alpha:review', plugin: 'alpha', description: 'Reviews', body_excerpt: 'body',
      source_path: 'plugins/alpha/skills/review/SKILL.md', install_commands: install,
    }],
  };
}

test('constants have the contract values', () => {
  assert.deepEqual(TYPES, ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp_server']);
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(MARKETPLACE, 'dev-digest-ai-marketplace');
  assert.equal(REPO, 'HlibHav/dev-digest-ai-marketplace');
  assert.equal(MAX_EXCERPT, 4000);
  assert.equal(MAX_QUERY, 200);
});

test('assertIndexShape accepts a sample index', () => {
  assert.equal(assertIndexShape(sample()), undefined);
});

test('assertIndexShape rejects a missing artifacts array', () => {
  const idx = sample();
  delete idx.artifacts;
  assert.throws(() => assertIndexShape(idx), /artifacts/);
});

test('assertIndexShape rejects an unknown type', () => {
  const idx = sample();
  idx.artifacts[0].type = 'widget';
  assert.throws(() => assertIndexShape(idx), /type/);
});

test('assertIndexShape rejects a body_excerpt over 4000 chars', () => {
  const idx = sample();
  idx.artifacts[0].body_excerpt = 'x'.repeat(MAX_EXCERPT + 1);
  assert.throws(() => assertIndexShape(idx), /body_excerpt/);
});

test('assertIndexShape accepts an excerpt of exactly 4000 chars', () => {
  const idx = sample();
  idx.artifacts[0].body_excerpt = 'x'.repeat(MAX_EXCERPT);
  assert.doesNotThrow(() => assertIndexShape(idx));
});

test('assertIndexShape rejects a bare array and a wrong schema_version', () => {
  assert.throws(() => assertIndexShape([]), Error);
  const idx = sample();
  idx.schema_version = 2;
  assert.throws(() => assertIndexShape(idx), /schema_version/);
});

test('assertIndexShape rejects a plugin missing trust or cost', () => {
  const a = sample();
  delete a.plugins[0].trust;
  assert.throws(() => assertIndexShape(a), /trust/);
  const b = sample();
  delete b.plugins[0].cost;
  assert.throws(() => assertIndexShape(b), /cost/);
});

test('assertIndexShape rejects a dependency without a range', () => {
  const idx = sample();
  delete idx.plugins[0].dependencies[0].range;
  assert.throws(() => assertIndexShape(idx), /range/);
});

test('assertIndexShape throws plain Error instances', () => {
  const idx = sample();
  idx.artifacts = 'nope';
  try {
    assertIndexShape(idx);
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof Error);
  }
});
