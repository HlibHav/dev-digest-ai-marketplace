import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightRanges, appendHighlighted } from '../../../site-src/app/highlight.js';
import { fakeDocument, tags } from './fake-dom.mjs';

test('finds case-insensitive occurrences of every term', () => {
  assert.deepEqual(highlightRanges('Architecture review of architecture', ['architecture']), [[0, 12], [23, 35]]);
});

test('overlapping and adjacent ranges merge', () => {
  assert.deepEqual(highlightRanges('abcdef', ['abc', 'cde']), [[0, 5]]);
  assert.deepEqual(highlightRanges('abcdef', ['abc', 'def']), [[0, 6]]);
});

test('AC-24: regex metacharacters and markup in terms are plain text', () => {
  assert.deepEqual(highlightRanges('call f(x) and <script>', ['(']), [[6, 7]]);
  assert.deepEqual(highlightRanges('call f(x) and <script>', ['<script>']), [[14, 22]]);
  assert.deepEqual(highlightRanges('a.b axb', ['a.b']), [[0, 3]]);
  assert.deepEqual(highlightRanges('x', ['[', '*', '\\', '(?<=']), []);
});

test('empty and blank terms are ignored, no match gives no ranges', () => {
  assert.deepEqual(highlightRanges('abc', ['', '  ']), []);
  assert.deepEqual(highlightRanges('abc', []), []);
  assert.deepEqual(highlightRanges('', ['a']), []);
});

test('Ukrainian text matches case-insensitively and indices stay aligned', () => {
  assert.deepEqual(highlightRanges('Рев\'ю Архітектури', ['архітектури']), [[6, 17]]);
  assert.deepEqual(highlightRanges('İstanbul x', ['x']), [[9, 10]]);
});

test('AC-24: appendHighlighted builds text nodes and mark elements, never markup', () => {
  const doc = fakeDocument();
  const el = doc.createElement('p');
  const text = 'hello <img src=x onerror=1> world';
  appendHighlighted(el, text, highlightRanges(text, ['<img src=x onerror=1>']));
  assert.deepEqual(tags(el), ['#text', 'mark', '#text']);
  assert.equal(el.childNodes[1].textContent, '<img src=x onerror=1>');
  assert.equal(el.textContent, text);
});

test('appendHighlighted with no ranges appends one text node', () => {
  const doc = fakeDocument();
  const el = doc.createElement('p');
  appendHighlighted(el, 'plain', []);
  assert.deepEqual(tags(el), ['#text']);
  assert.equal(el.textContent, 'plain');
});
