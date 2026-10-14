import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText, MANUAL_COPY_MESSAGE } from '../../../site-src/app/clipboard.js';

test('copies through the Clipboard API', async () => {
  let written;
  const win = { navigator: { clipboard: { writeText: async (t) => { written = t; } } } };
  assert.equal(await copyText('two\nlines', win), 'copied');
  assert.equal(written, 'two\nlines');
});

test('AC-59: a missing Clipboard API gives manual', async () => {
  assert.equal(await copyText('x', { navigator: {} }), 'manual');
  assert.equal(await copyText('x', {}), 'manual');
});

test('AC-59: a denied write gives manual', async () => {
  const win = { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } };
  assert.equal(await copyText('x', win), 'manual');
});

test('AC-59: the fallback message is the specified text', () => {
  assert.equal(MANUAL_COPY_MESSAGE, 'Copy is unavailable here. Select the text and copy it manually.');
});
