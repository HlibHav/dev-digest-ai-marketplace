import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { readHooks } from '../../../scripts/lib/hooks.mjs';
import { readMcpServers } from '../../../scripts/lib/mcp.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';

const group = (command, matcher) => ({ ...(matcher === undefined ? {} : { matcher }), hooks: [{ type: 'command', command }] });

/** Builds a one-plugin marketplace and returns the args readHooks/readMcpServers take. */
function setup(spec) {
  const root = mkdtempSync(join(tmpdir(), 'hm-'));
  makeMarketplace(root, { plugins: [{ name: 'demo', ...spec }] });
  const pluginDir = join(root, 'plugins', 'demo');
  const manifest = structuredClone(spec.manifest ?? {});
  return { root, pluginDir, manifest, entry: spec.entry ?? {}, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('merges default, inline, custom-path and catalog declarations with sources', () => {
  const s = setup({
    files: {
      'hooks/hooks.json': { hooks: { PreToolUse: [group('default-pre.sh', 'Bash')], SessionStart: [group('start.sh')] } },
      'extra/more-hooks.json': { hooks: { PreToolUse: [group('custom-pre.sh')] } },
    },
    manifest: { hooks: { PostToolUse: [group('inline-post.sh', 'Write')] } },
    entry: { hooks: { Stop: [group('catalog-stop.sh')] } },
  });
  try {
    const hooks = readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(
      hooks.map((h) => [h.event, h.matcher, h.commands, h.source_path]),
      [
        ['PreToolUse', 'Bash', ['default-pre.sh'], 'plugins/demo/hooks/hooks.json'],
        ['SessionStart', null, ['start.sh'], 'plugins/demo/hooks/hooks.json'],
        ['PostToolUse', 'Write', ['inline-post.sh'], 'plugins/demo/.claude-plugin/plugin.json'],
        ['Stop', null, ['catalog-stop.sh'], '.claude-plugin/marketplace.json'],
      ],
    );
  } finally { s.done(); }
});

test('a custom hooks path (string or array) is read after the inline declaration', () => {
  const s = setup({
    files: {
      'hooks/hooks.json': { hooks: { Stop: [group('default.sh')] } },
      'extra/a.json': { hooks: { Stop: [group('a.sh')] } },
      'extra/b.json': { hooks: { Stop: [group('b.sh')] } },
    },
    manifest: { hooks: ['./extra/a.json', 'extra/b.json'] },
  });
  try {
    const hooks = readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(hooks.map((h) => [h.commands[0], h.source_path]), [
      ['default.sh', 'plugins/demo/hooks/hooks.json'],
      ['a.sh', 'plugins/demo/extra/a.json'],
      ['b.sh', 'plugins/demo/extra/b.json'],
    ]);
  } finally { s.done(); }
});

test('the default hooks file named again by a custom path is read once', () => {
  const s = setup({
    files: { 'hooks/hooks.json': { hooks: { Stop: [group('default.sh')] } } },
    manifest: { hooks: './hooks/hooks.json' },
  });
  try {
    const hooks = readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.equal(hooks.length, 1);
  } finally { s.done(); }
});

test('one entry per matcher group, several commands kept together; empty matcher is no matcher', () => {
  const s = setup({
    files: {
      'hooks/hooks.json': {
        hooks: { PreToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'a.sh' }, { type: 'command', command: 'b.sh' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'c.sh' }] },
        ] },
      },
    },
  });
  try {
    const hooks = readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(hooks.map((h) => [h.matcher, h.commands]), [['Edit|Write', ['a.sh', 'b.sh']], [null, ['c.sh']]]);
  } finally { s.done(); }
});

test('an inline declaration wrapped in a "hooks" key is accepted too', () => {
  const s = setup({ manifest: { hooks: { hooks: { Stop: [group('wrapped.sh')] } } } });
  try {
    const hooks = readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(hooks.map((h) => h.commands), [['wrapped.sh']]);
  } finally { s.done(); }
});

test('a plugin without hooks yields an empty list', () => {
  const s = setup({});
  try {
    assert.deepEqual(readHooks({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root }), []);
    assert.deepEqual(readMcpServers({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root }), []);
  } finally { s.done(); }
});

test('MCP: merges .mcp.json, inline, custom path and catalog entry with sources', () => {
  const s = setup({
    files: {
      '.mcp.json': { mcpServers: { local: { command: 'node', args: ['server.js'] }, remote: { type: 'http', url: 'https://example.com/mcp' } } },
      'extra/servers.json': { mcpServers: { custom: { command: 'npx', args: ['-y', 'thing'] } } },
    },
    manifest: { mcpServers: { inline: { type: 'sse', url: 'http://localhost:9000/sse' } } },
    entry: { mcpServers: { fromCatalog: { command: 'bin' } } },
  });
  // plugin.json may mix an inline map and a custom path in one array.
  s.manifest.mcpServers = [s.manifest.mcpServers, './extra/servers.json'];
  try {
    const servers = readMcpServers({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(servers, [
      { name: 'local', transport: 'command', command: 'node', args: ['server.js'], source_path: 'plugins/demo/.mcp.json' },
      { name: 'remote', transport: 'url', url: 'https://example.com/mcp', args: [], source_path: 'plugins/demo/.mcp.json' },
      { name: 'inline', transport: 'url', url: 'http://localhost:9000/sse', args: [], source_path: 'plugins/demo/.claude-plugin/plugin.json' },
      { name: 'custom', transport: 'command', command: 'npx', args: ['-y', 'thing'], source_path: 'plugins/demo/extra/servers.json' },
      { name: 'fromCatalog', transport: 'command', command: 'bin', args: [], source_path: '.claude-plugin/marketplace.json' },
    ]);
  } finally { s.done(); }
});

test('MCP: a flat server map without the mcpServers wrapper is accepted', () => {
  const s = setup({ files: { '.mcp.json': { only: { command: 'run' } } } });
  try {
    const servers = readMcpServers({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root });
    assert.deepEqual(servers.map((x) => [x.name, x.command]), [['only', 'run']]);
  } finally { s.done(); }
});

const BAD = [
  ['invalid JSON in hooks.json', { files: { 'hooks/hooks.json': '{ not json' } }, 'hooks', 'plugins/demo/hooks/hooks.json', /JSON/],
  ['hooks.json without a top-level hooks key', { files: { 'hooks/hooks.json': { PreToolUse: [] } } }, 'hooks', 'plugins/demo/hooks/hooks.json', /top-level "hooks"/],
  ['invalid JSON in .mcp.json', { files: { '.mcp.json': '{ nope' } }, 'mcp', 'plugins/demo/.mcp.json', /JSON/],
  ['hooks event that is not an array', { files: { 'hooks/hooks.json': { hooks: { Stop: 'x' } } } }, 'hooks', 'plugins/demo/hooks/hooks.json', /Stop/],
  ['hook group without a hooks array', { files: { 'hooks/hooks.json': { hooks: { Stop: [{ matcher: 'x' }] } } } }, 'hooks', 'plugins/demo/hooks/hooks.json', /hooks/],
  ['custom hooks path that does not exist', { manifest: { hooks: './missing.json' } }, 'hooks', 'plugins/demo/.claude-plugin/plugin.json', /missing\.json/],
  ['custom hooks path that leaves the plugin', { manifest: { hooks: '../../outside.json' } }, 'hooks', 'plugins/demo/.claude-plugin/plugin.json', /outside the plugin/],
  ['MCP server with neither command nor url', { files: { '.mcp.json': { mcpServers: { broken: { type: 'http' } } } } }, 'mcp', 'plugins/demo/.mcp.json', /broken/],
  ['custom MCP path that does not exist', { manifest: { mcpServers: './nowhere.json' } }, 'mcp', 'plugins/demo/.claude-plugin/plugin.json', /nowhere\.json/],
];

for (const [label, spec, kind, file, rule] of BAD) {
  test(`malformed: ${label} throws BuildError with file and rule`, () => {
    const s = setup(spec);
    try {
      const fn = kind === 'hooks' ? readHooks : readMcpServers;
      assert.throws(
        () => fn({ pluginDir: s.pluginDir, manifest: s.manifest, entry: s.entry, root: s.root }),
        (e) => e instanceof BuildError && e.file === file && rule.test(e.rule),
      );
    } finally { s.done(); }
  });
}
