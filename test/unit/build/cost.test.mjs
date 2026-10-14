import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCost, estimateTokens } from '../../../scripts/lib/cost.mjs';

const art = (type, short_name, description, body) => ({ type, short_name, name: `/p:${short_name}`, plugin: 'p', description, body });

test('estimateTokens is characters / 4 rounded up', () => {
  assert.equal(estimateTokens(0), 0);
  assert.equal(estimateTokens(1), 1);
  assert.equal(estimateTokens(4), 1);
  assert.equal(estimateTokens(5), 2);
  assert.equal(estimateTokens(400), 100);
});

test('name 4 + description 396 gives 100 always-loaded; body 4000 gives 1000 on invocation', () => {
  const c = buildCost([art('skill', 'abcd', 'd'.repeat(396), 'b'.repeat(4000))]);
  assert.equal(c.always_loaded_tokens, 100);
  assert.equal(c.on_invocation_tokens, 1000);
});

test('the full body counts even when the stored excerpt is capped', () => {
  const c = buildCost([art('skill', 'big', '', 'x'.repeat(100000))]);
  assert.equal(c.on_invocation_tokens, 25000);
});

test('each skill, agent and command is rounded up on its own, then summed', () => {
  const c = buildCost([
    art('skill', 'a', 'bc', ''),     // 3 chars -> 1
    art('agent', 'dd', 'eeee', 'x'), // 6 chars -> 2, body 1 -> 1
    art('command', 'f', 'g', 'yyyyy'), // 2 chars -> 1, body 5 -> 2
  ]);
  assert.equal(c.always_loaded_tokens, 4);
  assert.equal(c.on_invocation_tokens, 3);
});

test('hooks and MCP servers cost nothing', () => {
  const c = buildCost([art('hook', 'h', 'hook description here', ''), art('mcp_server', 'm', 'mcp description', 'body')]);
  assert.equal(c.always_loaded_tokens, 0);
  assert.equal(c.on_invocation_tokens, 0);
});

test('no artifacts: zero cost, method and exclusions are still stated', () => {
  assert.deepEqual(buildCost([]), {
    always_loaded_tokens: 0,
    on_invocation_tokens: 0,
    method: 'characters / 4, rounded up',
    excluded: ['hook output', 'MCP tool descriptions and results'],
  });
});

test('a missing short_name falls back to the name after the plugin prefix', () => {
  const a = { type: 'skill', name: '/p:abcd', plugin: 'p', description: 'd'.repeat(396), body: '' };
  assert.equal(buildCost([a]).always_loaded_tokens, 100);
});
