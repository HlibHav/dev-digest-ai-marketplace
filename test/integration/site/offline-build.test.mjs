// AC-9: the whole build, bundling included, needs no network. The preload makes net, dns, fetch and http(s) throw.
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');
const PRELOAD = join(REPO, 'test', 'helpers', 'no-network.mjs');

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p.slice(dir.length)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

test('AC-9: two builds with the network blocked both succeed and give equal output', () => {
  const hashes = [];
  for (let i = 0; i < 2; i += 1) {
    const out = mkdtempSync(join(tmpdir(), 'off-'));
    try {
      const r = runBuild({ root: FIXTURE, out, nodeArgs: ['--import', PRELOAD] });
      assert.equal(r.code, 0, r.stderr);
      assert.ok(readdirSync(join(out, 'assets')).some((n) => n.endsWith('.js')));
      hashes.push(treeHash(out));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }
  assert.equal(hashes[0], hashes[1]);
});

test('the no-network preload really blocks (control)', () => {
  const r = spawnSync(process.execPath, ['--import', PRELOAD, '--input-type=module', '-e', "await fetch('http://127.0.0.1:1/')"], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /network access blocked/);
});
