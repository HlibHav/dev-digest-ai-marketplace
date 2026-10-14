import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h } from '../../../site-src/app/safe-dom.js';
import { fakeDocument } from './fake-dom.mjs';

const SITE_SRC = fileURLToPath(new URL('../../../site-src', import.meta.url));
const FORBIDDEN = [
  ['innerHTML', /innerHTML/],
  ['outerHTML', /outerHTML/],
  ['insertAdjacentHTML', /insertAdjacentHTML/],
  ['document.write', /document\s*\.\s*write/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /new\s+Function\b/],
];

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test('AC-24: site-src contains no HTML-string sinks and no dynamic code', () => {
  const list = files(SITE_SRC);
  assert.ok(list.length > 0);
  const hits = [];
  for (const f of list) {
    const text = readFileSync(f, 'utf8');
    for (const [label, re] of FORBIDDEN) if (re.test(text)) hits.push(`${relative(SITE_SRC, f)}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test('h builds elements with text children and allowed attributes', () => {
  const doc = fakeDocument();
  const el = h(doc, 'button', { class: 'copy', type: 'button', 'aria-label': 'Copy', 'data-card': '' }, '<b>x</b>');
  assert.equal(el.tagName, 'BUTTON');
  assert.equal(el.getAttribute('class'), 'copy');
  assert.equal(el.getAttribute('aria-label'), 'Copy');
  assert.equal(el.textContent, '<b>x</b>');
  assert.equal(el.childNodes[0].nodeType, 3);
});

test('h refuses event handler and style attributes and unknown tags', () => {
  const doc = fakeDocument();
  assert.throws(() => h(doc, 'div', { onclick: 'x()' }), /not allowed/);
  assert.throws(() => h(doc, 'div', { style: 'color:red' }), /not allowed/);
  assert.throws(() => h(doc, 'script', {}), /not allowed/);
  assert.throws(() => h(doc, 'a', { href: 'javascript:alert(1)' }), /not allowed/);
});

test('h appends element children and skips null and false', () => {
  const doc = fakeDocument();
  const child = h(doc, 'span', {}, 'in');
  const el = h(doc, 'p', {}, 'a', null, false, child);
  assert.equal(el.textContent, 'ain');
});
