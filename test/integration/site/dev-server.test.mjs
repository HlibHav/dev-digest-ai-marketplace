import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_PLUGINS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'suite'];

/** A raw GET: keeps "/../" and "%2e%2e" exactly as written, which fetch would normalise away. */
const get = (port, path) =>
  new Promise((res, rej) => {
    const r = request({ host: '127.0.0.1', port, path, method: 'GET' }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', rej);
    r.end();
  });

/** Starts the dev server on a free port (PORT=0) and resolves with the port it prints. */
function startServer() {
  const child = spawn(process.execPath, [join(REPO, 'scripts', 'dev-server.mjs')], {
    cwd: REPO,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`dev server did not print its URL in 15 s:\n${output}`)), 15000);
    const onData = (d) => {
      output += d;
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        res(Number(m[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => (output += d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`dev server exited early (${code}):\n${output}`));
    });
  });
  return { child, ready };
}

test('dev server serves the real catalog only, injects live reload in the response and keeps disk output clean', async () => {
  const { child, ready } = startServer();
  try {
    const port = await ready;

    const home = await get(port, '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /^text\/html/);
    assert.equal(home.headers['cache-control'], 'no-store');
    assert.ok(home.body.includes('/__dev/reload.js'), 'index.html carries the reload script');

    const raw = (await get(port, '/index.json')).body;
    const index = JSON.parse(raw);
    const catalog = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
    assert.deepEqual(index.plugins.map((p) => p.name), catalog.plugins.map((p) => p.name));
    for (const n of FIXTURE_PLUGINS) {
      assert.ok(!index.plugins.some((p) => p.name === n), `no fixture plugin ${n}`);
    }

    assert.equal((await get(port, '/../package.json')).status, 404);
    assert.equal((await get(port, '/%2e%2e/package.json')).status, 404);
    assert.equal((await get(port, '/nope.txt')).status, 404);

    const reload = await get(port, '/__dev/reload.js');
    assert.equal(reload.status, 200);
    assert.match(reload.headers['content-type'], /javascript/);

    const onDisk = readFileSync(join(REPO, '.tmp', 'dev-site', 'index.html'), 'utf8');
    assert.ok(!onDisk.includes('__dev'), 'the built file on disk is untouched');
  } finally {
    child.kill('SIGTERM');
  }
});
