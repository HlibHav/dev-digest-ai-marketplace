import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Runs `node scripts/build-index.mjs --root <root> --out <out>` and reports the outcome. */
export function runBuild({ root, out, env = {}, nodeArgs = [] }) {
  const r = spawnSync(
    process.execPath,
    [...nodeArgs, join(repoRoot, 'scripts', 'build-index.mjs'), '--root', root, '--out', out],
    { cwd: repoRoot, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.error) throw r.error;
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}
