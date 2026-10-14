// Builds the fixture marketplace into .tmp/e2e-site with the fake effects renderer switched on.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURE_ROOT = join(repoRoot, 'test', 'fixtures', 'marketplace');
export const FIXTURE_SITE_DIR = join(repoRoot, '.tmp', 'e2e-site');

/**
 * Returns the built site directory. Idempotent: when the global setup has already built it
 * (E2E_SITE_READY=1) workers reuse it; otherwise it is rebuilt from scratch.
 */
export function buildFixtureSite({ force = false } = {}) {
  if (!force && process.env.E2E_SITE_READY === '1' && existsSync(join(FIXTURE_SITE_DIR, 'index.html'))) {
    return FIXTURE_SITE_DIR;
  }
  rmSync(FIXTURE_SITE_DIR, { recursive: true, force: true });
  mkdirSync(dirname(FIXTURE_SITE_DIR), { recursive: true });
  const r = runBuild({ root: FIXTURE_ROOT, out: FIXTURE_SITE_DIR, env: { SITE_FAKE_FX: '1' } });
  if (r.code !== 0) throw new Error(`fixture site build failed (exit ${r.code})\n${r.stderr || r.stdout}`);
  return FIXTURE_SITE_DIR;
}
