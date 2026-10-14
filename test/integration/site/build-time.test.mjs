// AC-45: 50 plugins of 5 artifacts each build (index, bundle, page) in under 30 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { runBuild } from '../../helpers/run-build.mjs';

test('AC-45: 50 plugins x 5 artifacts build in under 30 seconds', () => {
  const root = mkdtempSync(join(tmpdir(), 'bt-root-'));
  const out = mkdtempSync(join(tmpdir(), 'bt-out-'));
  try {
    const plugins = Array.from({ length: 50 }, (_, i) => {
      const name = `plug-${String(i).padStart(2, '0')}`;
      const files = {};
      for (let s = 0; s < 2; s += 1) {
        files[`skills/skill-${s}/SKILL.md`] = `---\nname: skill-${s}\ndescription: Skill ${s} of ${name}\n---\nBody of skill ${s}. ${'text '.repeat(100)}\n`;
      }
      files['agents/helper.md'] = `---\nname: helper\ndescription: Helper agent of ${name}\n---\nAgent body.\n`;
      files['commands/run.md'] = `---\ndescription: Run command of ${name}\n---\nCommand body.\n`;
      files['hooks/hooks.json'] = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] } };
      return { name, files };
    });
    makeMarketplace(root, { plugins });
    const started = Date.now();
    const r = runBuild({ root, out });
    const seconds = (Date.now() - started) / 1000;
    assert.equal(r.code, 0, r.stderr);
    assert.ok(seconds < 30, `build took ${seconds}s`);
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    assert.equal(index.plugins.length, 50);
    assert.equal(index.artifacts.length, 250);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
