import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readState, writeState } from '../../../site-src/app/url-state.js';

test('AC-23: a 10 000-character q is truncated to 200', () => {
  const s = readState(`?q=${'a'.repeat(10000)}`);
  assert.equal([...s.q].length, 200);
});

test('AC-23: writeState also caps q at 200', () => {
  const out = writeState({ q: 'b'.repeat(500), types: [], plugins: [] });
  assert.equal(new URLSearchParams(out).get('q').length, 200);
});

test('truncation never splits a surrogate pair', () => {
  const s = readState(`?q=${encodeURIComponent('😀'.repeat(300))}`);
  assert.equal([...s.q].length, 200);
  assert.ok(!/[\ud800-\udbff]$/.test(s.q));
});

test('unknown types are dropped, duplicates collapse', () => {
  const s = readState('?type=skill&type=bogus&type=agent&type=skill&type=__proto__');
  assert.deepEqual(s.types, ['skill', 'agent']);
});

test('unknown plugins are dropped when the known names are given', () => {
  const s = readState('?plugins=alpha,ghost,beta', ['alpha', 'beta']);
  assert.deepEqual(s.plugins, ['alpha', 'beta']);
});

test('without a known list only well-formed plugin names survive', () => {
  const s = readState(`?plugins=${encodeURIComponent('alpha,<script>,b e t a,gamma-2')}`);
  assert.deepEqual(s.plugins, ['alpha', 'gamma-2']);
});

test('defaults: empty search gives an empty state', () => {
  assert.deepEqual(readState(''), { q: '', types: [], plugins: [] });
  assert.deepEqual(readState('?'), { q: '', types: [], plugins: [] });
});

test('AC-22: write then read round-trips', () => {
  const state = { q: "рев'ю <script> & more=1", types: ['skill', 'mcp_server'], plugins: ['alpha', 'beta'] };
  const search = writeState(state);
  assert.ok(search.startsWith('?'));
  assert.deepEqual(readState(search, ['alpha', 'beta']), state);
});

test('an empty state writes an empty string so the URL stays clean', () => {
  assert.equal(writeState({ q: '', types: [], plugins: [] }), '');
});

test('the query is data: markup in q comes back unchanged', () => {
  assert.equal(readState('?q=%3Cscript%3E').q, '<script>');
});
