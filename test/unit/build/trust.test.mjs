import test from 'node:test';
import assert from 'node:assert/strict';
import { BROAD_EVENTS, buildTrust, isLoopbackUrl } from '../../../scripts/lib/trust.mjs';

const hook = (event, matcher = null, commands = ['run.sh'], source_path = 'plugins/p/hooks/hooks.json') =>
  ({ event, matcher, commands, source_path });

test('BROAD_EVENTS lists the three broad events', () => {
  assert.deepEqual([...BROAD_EVENTS].sort(), ['PostToolUse', 'PreToolUse', 'UserPromptSubmit']);
});

test('three events are flagged broad, SessionStart is not, and the matcher is kept', () => {
  const t = buildTrust({
    hooks: [hook('UserPromptSubmit'), hook('PreToolUse', 'Bash'), hook('PostToolUse', 'Write'), hook('SessionStart')],
    servers: [],
    hasScripts: false,
  });
  assert.deepEqual(
    t.hooks.map((h) => [h.event, h.matcher, h.broad]),
    [['UserPromptSubmit', null, true], ['PreToolUse', 'Bash', true], ['PostToolUse', 'Write', true], ['SessionStart', null, false]],
  );
  assert.equal(t.hooks.filter((h) => h.broad).length, 3);
  assert.equal(t.hooks[0].source_path, 'plugins/p/hooks/hooks.json');
  assert.equal('commands' in t.hooks[0], false, 'trust hooks carry no commands');
});

test('loopback table', () => {
  for (const url of ['http://localhost:3000', 'http://localhost', 'http://127.0.0.1:8080/x', 'http://127.0.0.2/x', 'http://127.255.255.254/', 'http://[::1]/x', 'http://[::1]:9000/mcp', 'HTTP://LOCALHOST/x']) {
    assert.equal(isLoopbackUrl(url), true, url);
  }
  for (const url of ['https://example.com/mcp', 'http://example.com', 'http://128.0.0.1/', 'http://localhost.example.com/', 'http://10.0.0.1/', 'http://[::2]/', 'not a url', '']) {
    assert.equal(isLoopbackUrl(url), false, url);
  }
});

test('MCP servers: url servers are flagged unless loopback; command servers show command and args', () => {
  const t = buildTrust({
    hooks: [],
    servers: [
      { name: 'a', transport: 'url', url: 'http://localhost:3000', args: [], source_path: 'plugins/p/.mcp.json' },
      { name: 'b', transport: 'url', url: 'http://127.0.0.2/x', args: [], source_path: 'plugins/p/.mcp.json' },
      { name: 'c', transport: 'url', url: 'http://[::1]/x', args: [], source_path: 'plugins/p/.mcp.json' },
      { name: 'd', transport: 'url', url: 'https://example.com/mcp', args: [], source_path: 'plugins/p/.mcp.json' },
      { name: 'e', transport: 'url', url: 'http://example.com', args: [], source_path: 'plugins/p/.mcp.json' },
      { name: 'f', transport: 'command', command: 'npx', args: ['-y', 'thing'], source_path: 'plugins/p/.mcp.json' },
    ],
    hasScripts: true,
  });
  assert.deepEqual(t.mcp_servers.map((s) => [s.name, s.non_loopback]), [['a', false], ['b', false], ['c', false], ['d', true], ['e', true], ['f', false]]);
  assert.deepEqual(t.mcp_servers[5], { name: 'f', transport: 'command', command: 'npx', args: ['-y', 'thing'], non_loopback: false, source_path: 'plugins/p/.mcp.json' });
  assert.deepEqual(t.mcp_servers[3], { name: 'd', transport: 'url', url: 'https://example.com/mcp', args: [], non_loopback: true, source_path: 'plugins/p/.mcp.json' });
  assert.equal(t.has_scripts, true);
});

test('network URLs come from hook commands, MCP urls and MCP args, deduplicated and sorted', () => {
  const t = buildTrust({
    hooks: [hook('Stop', null, ['curl -s https://hooks.example.com/notify?x=1 && echo "ok."', 'ping http://localhost:9/health'])],
    servers: [
      { name: 'r', transport: 'url', url: 'https://example.com/mcp', args: [], source_path: 'p' },
      { name: 'l', transport: 'command', command: 'node', args: ['s.js', '--upstream=https://api.example.org/v1'], source_path: 'p' },
      { name: 'dup', transport: 'url', url: 'https://example.com/mcp', args: [], source_path: 'p' },
    ],
    hasScripts: false,
  });
  assert.deepEqual(t.network_urls, [
    'http://localhost:9/health',
    'https://api.example.org/v1',
    'https://example.com/mcp',
    'https://hooks.example.com/notify?x=1',
  ]);
});

test('an empty plugin has an empty trust profile', () => {
  assert.deepEqual(buildTrust({ hooks: [], servers: [], hasScripts: false }), {
    hooks: [], mcp_servers: [], has_scripts: false, network_urls: [],
  });
});
