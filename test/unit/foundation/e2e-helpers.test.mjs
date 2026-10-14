import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../../e2e/helpers/serve.mjs';
import { netLog } from '../../e2e/helpers/net-log.mjs';
import { stubWebGpu, countRaf, setHidden } from '../../e2e/helpers/fx-stubs.mjs';
import { buildFixtureSite, FIXTURE_SITE_DIR } from '../../e2e/helpers/build-fixture-site.mjs';

function rawGet(url, path) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serve: serves files same-origin on an ephemeral port with content types', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {}');
  writeFileSync(join(dir, 'index.json'), '{"a":1}');
  const s = await serve(dir);
  try {
    assert.match(s.url, /^http:[/][/]127[.]0[.]0[.]1:\d+$/);
    const root = await rawGet(s.url, '/');
    assert.equal(root.status, 200);
    assert.match(root.type, /text\/html/);
    assert.equal(root.body, '<h1>hi</h1>');
    const js = await rawGet(s.url, '/assets/app.js');
    assert.match(js.type, /javascript/);
    const json = await rawGet(s.url, '/index.json?v=abc');
    assert.equal(json.status, 200);
    assert.match(json.type, /application\/json/);
    assert.equal((await rawGet(s.url, '/missing.txt')).status, 404);
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serve: refuses path traversal outside the served directory', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'serve-parent-'));
  const dir = join(parent, 'site');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), 'ok');
  writeFileSync(join(parent, 'secret.txt'), 'secret');
  const s = await serve(dir);
  try {
    const r = await rawGet(s.url, '/../secret.txt');
    assert.notEqual(r.status, 200);
    assert.ok(!r.body.includes('secret'));
    const enc = await rawGet(s.url, '/%2e%2e/secret.txt');
    assert.ok(!enc.body.includes('secret'));
  } finally {
    await s.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

test('serve: close() stops the server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-'));
  writeFileSync(join(dir, 'index.html'), 'ok');
  const s = await serve(dir);
  await s.close();
  await assert.rejects(rawGet(s.url, '/'));
  rmSync(dir, { recursive: true, force: true });
});

test('netLog: records requests and reports those off the page origin', () => {
  const page = new EventEmitter();
  page.url = () => 'http://127.0.0.1:4000/index.html';
  const log = netLog(page);
  for (const url of [
    'http://127.0.0.1:4000/index.html',
    'http://127.0.0.1:4000/assets/app.js',
    'https://cdn.example.com/lib.js',
    'http://127.0.0.1:4001/other-port',
    'data:text/plain,hi',
    'blob:http://127.0.0.1:4000/uuid',
  ]) page.emit('request', { url: () => url });
  assert.equal(log.requests.length, 6);
  assert.deepEqual(log.offOrigin(), ['https://cdn.example.com/lib.js', 'http://127.0.0.1:4001/other-port']);
});

test('netLog: an explicit origin overrides the page URL', () => {
  const page = new EventEmitter();
  page.url = () => 'about:blank';
  const log = netLog(page, { origin: 'http://127.0.0.1:5000' });
  page.emit('request', { url: () => 'http://127.0.0.1:5000/a' });
  page.emit('request', { url: () => 'http://example.org/b' });
  assert.deepEqual(log.offOrigin(), ['http://example.org/b']);
});

test('fx-stubs: stubWebGpu, countRaf and setHidden talk to the page', async () => {
  const calls = [];
  const page = {
    addInitScript: async (fn, arg) => { calls.push(['init', typeof fn, arg]); },
    evaluate: async (fn, arg) => { calls.push(['eval', typeof fn, arg]); return 7; },
  };
  await stubWebGpu(page, true);
  await stubWebGpu(page, false);
  assert.deepEqual(calls.filter((c) => c[0] === 'init').map((c) => c[2]), [true, false]);
  const raf = await countRaf(page);
  assert.equal(await raf.count(), 7);
  await setHidden(page, true);
  assert.deepEqual(calls.at(-1), ['eval', 'function', true]);
});

test('buildFixtureSite exports a stable output directory under .tmp', () => {
  assert.equal(typeof buildFixtureSite, 'function');
  assert.match(FIXTURE_SITE_DIR.split('\\').join('/'), /\/\.tmp\/e2e-site$/);
});
