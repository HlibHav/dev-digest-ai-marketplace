import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../../scripts/lib/frontmatter.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';

const F = 'x.md';

test('plain scalars', () => {
  const r = parseFrontmatter('---\nname: lookup\ndescription: Look up a symbol.\n---\nBody here\n', F);
  assert.equal(r.hasFrontmatter, true);
  assert.deepEqual(r.data, { name: 'lookup', description: 'Look up a symbol.' });
  assert.equal(r.body, 'Body here\n');
});

test('quoted scalars keep markup and unescape', () => {
  const single = parseFrontmatter("---\ndescription: '<script>x</script> it''s'\n---\n", F);
  assert.equal(single.data.description, "<script>x</script> it's");
  const double = parseFrontmatter('---\ndescription: "say \\"hi\\"\\nnow: ok"\n---\n', F);
  assert.equal(double.data.description, 'say "hi"\nnow: ok');
});

test('a colon or hash inside a plain value stays in the value', () => {
  const r = parseFrontmatter('---\ndescription: Use when: a, b # not a comment\n---\n', F);
  assert.equal(r.data.description, 'Use when: a, b # not a comment');
});

test('folded block scalars: >- strips the last newline, > keeps one', () => {
  const strip = parseFrontmatter('---\ndescription: >-\n  one\n  two\n\n  three\nname: n\n---\n', F);
  assert.equal(strip.data.description, 'one two\nthree');
  assert.equal(strip.data.name, 'n');
  const clip = parseFrontmatter('---\ndescription: >\n  one\n  two\n---\n', F);
  assert.equal(clip.data.description, 'one two\n');
});

test('literal block scalars keep line breaks', () => {
  const r = parseFrontmatter('---\ndescription: |\n  line one\n  line two\nname: n\n---\n', F);
  assert.equal(r.data.description, 'line one\nline two\n');
  const strip = parseFrontmatter('---\ndescription: |-\n  a\n   b\n---\n', F);
  assert.equal(strip.data.description, 'a\n b');
});

test('other keys such as lists and maps are skipped, not errors', () => {
  const r = parseFrontmatter(
    '---\nname: a\ntools:\n  - Read\n  - Grep\nmeta:\n  k: v\ndescription: d\nallowed: [x, y]\n---\nbody',
    F,
  );
  assert.equal(r.data.name, 'a');
  assert.equal(r.data.description, 'd');
  assert.equal('tools' in r.data, false);
  assert.equal('meta' in r.data, false);
  assert.equal('k' in r.data, false);
});

test('a plain value may continue on indented lines', () => {
  const r = parseFrontmatter('---\ndescription: first part\n  second part\nname: n\n---\n', F);
  assert.equal(r.data.description, 'first part second part');
  assert.equal(r.data.name, 'n');
});

test('CRLF line endings are accepted', () => {
  const r = parseFrontmatter('---\r\nname: a\r\ndescription: d\r\n---\r\nbody\r\n', F);
  assert.deepEqual(r.data, { name: 'a', description: 'd' });
  assert.equal(r.body, 'body\r\n');
});

test('missing frontmatter is reported, not thrown', () => {
  const r = parseFrontmatter('# Just a body\n', F);
  assert.equal(r.hasFrontmatter, false);
  assert.deepEqual(r.data, {});
  assert.equal(r.body, '# Just a body\n');
});

test('an unclosed frontmatter block throws BuildError naming the file', () => {
  assert.throws(
    () => parseFrontmatter('---\nname: a\nno end\n', 'plugins/p/agents/a.md'),
    (e) => e instanceof BuildError && e.file === 'plugins/p/agents/a.md' && /not closed/.test(e.rule),
  );
});

test('an empty frontmatter block is present with no data', () => {
  const r = parseFrontmatter('---\n---\nbody', F);
  assert.equal(r.hasFrontmatter, true);
  assert.deepEqual(r.data, {});
  assert.equal(r.body, 'body');
});
