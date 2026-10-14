import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wcagRatio } from '../../helpers/contrast.mjs';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { runBuild } from '../../helpers/run-build.mjs';
import { genIndexAtBudget } from '../../helpers/gen-index.mjs';
import { assertIndexShape } from '../../../site-src/contract/index-contract.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'catalog-helpers-'));

test('wcagRatio: black on white is about 21', () => {
  assert.ok(Math.abs(wcagRatio('#000000', '#ffffff') - 21) < 0.01);
});

test('wcagRatio: identical colours give 1 and the order does not matter', () => {
  assert.equal(wcagRatio('#336699', '#336699'), 1);
  assert.equal(wcagRatio('#123456', '#fedcba'), wcagRatio('#fedcba', '#123456'));
});

test('wcagRatio accepts 3-digit hex', () => {
  assert.ok(Math.abs(wcagRatio('#000', '#fff') - 21) < 0.01);
});

test('makeMarketplace writes a tree that JSON.parse can read', () => {
  const dir = tmp();
  try {
    const out = makeMarketplace(dir, {
      plugins: [
        {
          name: 'one', version: '1.2.3', description: 'First', category: 'demo', tags: ['a'],
          dependencies: [{ name: 'two', version: '~1.0.0' }],
          files: {
            'skills/s/SKILL.md': '---\ndescription: S\n---\nbody\n',
            'hooks/hooks.json': { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo' }] }] } },
          },
        },
        { name: 'two' },
      ],
    });
    assert.equal(out, dir);
    const catalog = JSON.parse(readFileSync(join(dir, '.claude-plugin/marketplace.json'), 'utf8'));
    assert.deepEqual(catalog.plugins.map((p) => p.name), ['one', 'two']);
    assert.equal(catalog.plugins[0].source, './plugins/one');
    assert.equal(catalog.plugins[0].category, 'demo');
    const manifest = JSON.parse(readFileSync(join(dir, 'plugins/one/.claude-plugin/plugin.json'), 'utf8'));
    assert.equal(manifest.version, '1.2.3');
    assert.deepEqual(manifest.dependencies, [{ name: 'two', version: '~1.0.0' }]);
    assert.ok(existsSync(join(dir, 'plugins/one/README.md')));
    assert.match(readFileSync(join(dir, 'plugins/one/skills/s/SKILL.md'), 'utf8'), /description: S/);
    JSON.parse(readFileSync(join(dir, 'plugins/one/hooks/hooks.json'), 'utf8'));
    const two = JSON.parse(readFileSync(join(dir, 'plugins/two/.claude-plugin/plugin.json'), 'utf8'));
    assert.equal(two.version, '0.1.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('makeMarketplace lets a manifest override fields and a catalog entry carry extras', () => {
  const dir = tmp();
  try {
    makeMarketplace(dir, {
      plugins: [{ name: 'p', manifest: { hooks: { Stop: [] } }, entry: { mcpServers: { x: { command: 'y' } } } }],
    });
    const manifest = JSON.parse(readFileSync(join(dir, 'plugins/p/.claude-plugin/plugin.json'), 'utf8'));
    assert.deepEqual(manifest.hooks, { Stop: [] });
    const catalog = JSON.parse(readFileSync(join(dir, '.claude-plugin/marketplace.json'), 'utf8'));
    assert.deepEqual(catalog.plugins[0].mcpServers, { x: { command: 'y' } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runBuild spawns the build CLI with --root and --out and returns code, stdout, stderr', () => {
  const dir = tmp();
  try {
    // Until the build exists in a later lane the CLI may fail; the helper must still report it faithfully.
    const r = runBuild({ root: dir, out: join(dir, 'out'), env: { SOME_FLAG: '1' } });
    assert.equal(typeof r.code, 'number');
    assert.equal(typeof r.stdout, 'string');
    assert.equal(typeof r.stderr, 'string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('genIndexAtBudget builds a valid index close to the gzip budget', () => {
  const target = 20_000;
  const index = genIndexAtBudget(target);
  assertIndexShape(index);
  const size = gzipSync(Buffer.from(`${JSON.stringify(index)}\n`)).length;
  assert.ok(size <= target, `gzip ${size} must not exceed ${target}`);
  assert.ok(size >= target * 0.9, `gzip ${size} must be within 10% of ${target}`);
  assert.deepEqual(genIndexAtBudget(target), index, 'must be deterministic');
});

test('no-network.mjs makes fetch, http, net and dns throw', () => {
  const helper = pathToFileURL(join(root, 'test/helpers/no-network.mjs')).href;
  const script = `
    const results = [];
    const note = (k, v) => results.push(k + ':' + v);
    try { await fetch('http://example.com'); note('fetch', 'resolved'); } catch (e) { note('fetch', 'rejected'); }
    const http = await import('node:http');
    try { http.get('http://example.com'); note('http', 'ok'); } catch (e) { note('http', 'threw'); }
    const https = await import('node:https');
    try { https.request('https://example.com'); note('https', 'ok'); } catch (e) { note('https', 'threw'); }
    const net = await import('node:net');
    try { net.connect(80, 'example.com'); note('net', 'ok'); } catch (e) { note('net', 'threw'); }
    const dns = await import('node:dns');
    try { dns.lookup('example.com', () => {}); note('dns', 'ok'); } catch (e) { note('dns', 'threw'); }
    console.log(results.join(','));
  `;
  const r = spawnSync(process.execPath, ['--import', helper, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'fetch:rejected,http:threw,https:threw,net:threw,dns:threw');
});

test('no-network.mjs leaves local file work alone', () => {
  const helper = pathToFileURL(join(root, 'test/helpers/no-network.mjs')).href;
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const r = spawnSync(
      process.execPath,
      ['--import', helper, '-e', `console.log(require('node:fs').readFileSync(process.argv[1], 'utf8'))`, join(dir, 'a.txt')],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'hi');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
