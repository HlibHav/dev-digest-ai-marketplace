import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildError } from '../../../scripts/lib/errors.mjs';

test('BuildError message is "<file>: <rule>" and keeps both parts', () => {
  const e = new BuildError('plugins/a/skills/x/SKILL.md', 'skill needs a description');
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'BuildError');
  assert.equal(e.message, 'plugins/a/skills/x/SKILL.md: skill needs a description');
  assert.equal(e.file, 'plugins/a/skills/x/SKILL.md');
  assert.equal(e.rule, 'skill needs a description');
});
