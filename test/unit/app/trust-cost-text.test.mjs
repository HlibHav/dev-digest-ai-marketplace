import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTrust, TRUST_NOTICE } from '../../../site-src/app/trust-text.js';
import { describeCost, COST_NOTICE } from '../../../site-src/app/cost-text.js';

const EMPTY_TRUST = { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] };

test('AC-37: an empty trust profile says it declares no hooks, MCP servers or scripts', () => {
  const t = describeTrust(EMPTY_TRUST);
  assert.equal(t.empty, true);
  assert.match(t.sentence, /declares no hooks, MCP servers or scripts/);
});

test('AC-36: the trust notice says it describes declarations, not a security audit', () => {
  assert.match(TRUST_NOTICE, /describes what this plugin declares, not a security audit/);
});

test('AC-33/34/35 display: hooks, broad flag, servers and non-loopback appear as text lines', () => {
  const t = describeTrust({
    hooks: [
      { event: 'PreToolUse', matcher: null, broad: true, source_path: 'hooks/hooks.json' },
      { event: 'SessionStart', matcher: 'startup', broad: false, source_path: 'hooks/hooks.json' },
    ],
    mcp_servers: [
      { name: 'web', transport: 'url', url: 'https://example.com/mcp', args: [], non_loopback: true, source_path: '.mcp.json' },
      { name: 'local', transport: 'command', command: 'node', args: ['srv.js', '--x'], non_loopback: false, source_path: '.mcp.json' },
    ],
    has_scripts: true,
    network_urls: ['https://example.com/mcp'],
  });
  assert.equal(t.empty, false);
  const text = t.lines.join('\n');
  assert.match(text, /PreToolUse/);
  assert.match(text, /no matcher/);
  assert.match(text, /broad/);
  assert.match(text, /matcher: startup/);
  assert.match(text, /hooks\/hooks\.json/);
  assert.match(text, /https:\/\/example\.com\/mcp/);
  assert.match(text, /non-loopback/);
  assert.match(text, /node srv\.js --x/);
  assert.match(text, /scripts\//);
  assert.ok(t.lines.every((l) => typeof l === 'string'));
  assert.match(t.sentence, /2 hooks/);
  assert.match(t.sentence, /2 MCP servers/);
});

test('AC-40: zero cost says "0 tokens (no loaded content)"', () => {
  const c = describeCost({ always_loaded_tokens: 0, on_invocation_tokens: 0, method: 'characters / 4, rounded up', excluded: [] });
  assert.equal(c.empty, true);
  assert.deepEqual(c.lines, ['0 tokens (no loaded content)']);
});

test('AC-39: non-zero cost is labelled as an estimate with its method and exclusions', () => {
  const c = describeCost({
    always_loaded_tokens: 120, on_invocation_tokens: 3400,
    method: 'characters / 4, rounded up', excluded: ['hook output', 'MCP tool descriptions and results'],
  });
  assert.equal(c.empty, false);
  const text = c.lines.join('\n');
  assert.match(text, /120/);
  assert.match(text, /3,?400/);
  assert.match(text, /estimate/i);
  assert.match(COST_NOTICE, /estimate/i);
  assert.match(COST_NOTICE, /characters ÷ 4/);
  assert.match(COST_NOTICE, /hook output, MCP tool descriptions and results/);
});
