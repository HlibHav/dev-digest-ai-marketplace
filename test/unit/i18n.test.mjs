// All user-visible text lives in site-src/i18n/messages.en.json and is read through t(). This test keeps it that way:
// (a) every key used in code exists, (b) no key is unused, (c) no hardcoded user-visible literal is left in the components.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from '../../site-src/i18n/t.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const messages = JSON.parse(readFileSync(join(root, 'site-src', 'i18n', 'messages.en.json'), 'utf8'));

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
// Files that may call t(): all browser code and the static renderer. The i18n folder itself only defines t().
const CODE = [...walk(join(root, 'site-src')).filter((p) => p.endsWith('.js') && !p.includes(`${join('site-src', 'i18n')}`)), ...walk(join(root, 'scripts', 'lib', 'render')).filter((p) => p.endsWith('.mjs'))];
// Files whose text must be free of hardcoded user-visible strings.
const COMPONENTS = [...walk(join(root, 'site-src', 'app')).filter((p) => p.endsWith('.js')), join(root, 'scripts', 'lib', 'render', 'page.mjs')];

const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (node) => node && typeof node === 'object' && 'other' in node && Object.keys(node).every((k) => PLURAL_FORMS.has(k));

/** Dotted key of every message: a string, or a plural object. */
export function leafKeys(node, prefix = '') {
  return Object.entries(node).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' || isPlural(v) ? [key] : leafKeys(v, key);
  });
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const usedKeys = (text) => [...stripComments(text).matchAll(/(?<![\w.$])t\(\s*'([^']+)'/g)].map((m) => m[1]);

const KEYS = new Set(leafKeys(messages));
const used = new Map();
const dynamic = []; // t() calls whose key is not a single-quoted literal: they would hide keys from this test
for (const file of CODE) {
  const text = readFileSync(file, 'utf8');
  for (const key of usedKeys(text)) used.set(key, [...(used.get(key) ?? []), relative(root, file)]);
  dynamic.push(...[...stripComments(text).matchAll(/(?<![\w.$])t\(\s*[^'\s)]/g)].map(() => relative(root, file)));
}

test('the messages file has keys, and code uses t()', () => {
  assert.ok(KEYS.size > 50);
  assert.ok(used.size > 50);
});

test('t() is always called with a single-quoted literal key', () => {
  assert.deepEqual(dynamic, []);
});

test('every key used in code exists in messages.en.json', () => {
  const missing = [...used].filter(([key]) => !KEYS.has(key)).map(([key, files]) => `${key} (${files[0]})`);
  assert.deepEqual(missing, []);
});

test('no key in messages.en.json is unused', () => {
  const unused = [...KEYS].filter((key) => !used.has(key));
  assert.deepEqual(unused, []);
});

test('t() fills placeholders, picks plural forms, and throws on a missing key, placeholder or count', () => {
  assert.equal(t('card.copyInstallAria', { name: 'x' }), 'Copy install commands for x');
  assert.equal(t('catalog.count', { count: 1 }), '1 plugin');
  assert.equal(t('catalog.count', { count: 2 }), '2 plugins');
  assert.throws(() => t('no.such.key'), /missing key/);
  assert.throws(() => t('card.copyInstallAria'), /needs \{name\}/);
  assert.throws(() => t('catalog.count'), /needs params\.count/);
  assert.throws(() => t('card', { count: 1 }), /not a message/);
});

test('meta.lang is the document language', () => {
  assert.match(messages.meta.lang, /^[a-z]{2}(-[A-Z]{2})?$/);
});

// ---- hardcoded-string scan -------------------------------------------------------------------------------------
const LETTERS = /[A-Za-zЀ-ӿ]{2,}/;
const LIT = `(['"\`])((?:(?!\\1)[^\\\\\\n]|\\\\.)*)\\1`; // a quoted literal: group 1 quote, group 2 body
const onlyInterpolation = (body) => !LETTERS.test(body.replace(/\$\{[^}]*\}/g, ''));

// Strings that are code, not words: CLI commands, selectors, URLs, event and attribute names.
const ALLOW = [/^\/plugin\s/, /^[\w.#[\]=:>~*'" -]+$/ /* identifiers, selectors, class lists */];
const looksTranslatable = (body) => LETTERS.test(body) && /[A-Za-zЀ-ӿ]{2,}\s+[A-Za-zЀ-ӿ]{2,}/.test(body) && !ALLOW[0].test(body);

/** Findings in component source: [{rule, text}]. Pure so the self-test below can feed it bad samples. */
export function scanComponent(source) {
  const text = stripComments(source);
  const found = [];
  const add = (rule, body) => found.push({ rule, text: body });
  for (const m of text.matchAll(new RegExp(`\\b(?:textContent|innerText|ariaLabel)\\s*=\\s*${LIT}`, 'g'))) {
    if (!onlyInterpolation(m[2])) add('assigned text', m[2]);
  }
  for (const m of text.matchAll(new RegExp(`setAttribute\\(\\s*['"](?:aria-label|aria-description|title|placeholder|alt)['"]\\s*,\\s*${LIT}`, 'g'))) {
    if (!onlyInterpolation(m[2])) add('text attribute', m[2]);
  }
  for (const m of text.matchAll(new RegExp(`['"](?:aria-label|aria-description|title|placeholder|alt)['"]\\s*:\\s*${LIT}`, 'g'))) {
    if (!onlyInterpolation(m[2])) add('text attribute', m[2]);
  }
  // h(doc, 'tag', {attrs}, 'literal child')
  for (const m of text.matchAll(new RegExp(`\\bh\\(\\s*\\w+\\s*,\\s*'[a-z0-9]+'\\s*,\\s*(?:\\{[^{}]*\\}|\\w+)\\s*,\\s*${LIT}`, 'g'))) {
    if (!onlyInterpolation(m[2])) add('element text', m[2]);
  }
  // Any other multi-word literal that is not a command, selector or error message.
  for (const m of text.matchAll(new RegExp(LIT, 'g'))) {
    const line = text.slice(text.lastIndexOf('\n', m.index) + 1, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index));
    if (/^\s*(?:import|export)\b.*\bfrom\b/.test(line) || /new Error\(|querySelector|throw /.test(line)) continue;
    if (/\bclass\b/.test(line) && /^[a-z][\w-]*(\s+[a-z][\w-]*)*$/.test(m[2])) continue; // class lists
    if (m[2].includes('<')) continue; // markup in the page template: scanTemplate reads it
    if (found.some((f) => f.text === m[2])) continue; // already reported by a more specific rule
    const body = m[2].replace(/\$\{[^}]*\}/g, ' ');
    if (looksTranslatable(body)) add('multi-word literal', m[2]);
  }
  return found;
}

/** Removes every ${...} (balanced, nested templates included) so only the literal markup text is left. */
function stripInterpolations(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < text.length; j += 1) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}' && (depth -= 1) === 0) break;
      }
      i = j;
    } else out += text[i];
  }
  return out;
}

/** Findings in the static page template: text between tags and text attributes written as plain HTML. */
export function scanTemplate(source) {
  let text = stripComments(source);
  text = stripInterpolations(text); // innermost first; t('...') keys sit inside
  text = (text.match(/`[^`]*`/g) ?? []).join('\n'); // only template literals hold markup
  const found = [];
  for (const m of text.matchAll(/>([^<>\n`]*[A-Za-zЀ-ӿ]{2,}[^<>\n`]*)</g)) {
    if (!/^\s*\/plugin\s/.test(m[1])) found.push({ rule: 'text between tags', text: m[1] });
  }
  for (const m of text.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*[A-Za-zЀ-ӿ]{2,}[^"]*)"/g)) {
    found.push({ rule: 'text attribute', text: m[1] });
  }
  return found;
}

test('the scanner flags hardcoded strings (it can fail)', () => {
  assert.equal(scanComponent("el.textContent = 'Loading data';").length, 1);
  assert.equal(scanComponent('el.textContent = `Hello ${name}`;').length, 1);
  assert.equal(scanComponent("el.setAttribute('aria-label', 'Close the panel');").length, 1);
  assert.equal(scanComponent("h(doc, 'button', { 'aria-label': 'Close' }, x);").length, 1);
  assert.equal(scanComponent("h(doc, 'p', { class: 'a' }, 'Plain words');").length, 1);
  assert.equal(scanComponent("const s = 'Some visible sentence';").length, 1);
  assert.equal(scanTemplate('`<p class="a">Find a plugin</p>`').length, 1);
  assert.equal(scanTemplate('`<button aria-label="Copy it">${x}</button>`').length, 1);
});

test('the scanner passes t() calls, symbols, commands and selectors', () => {
  assert.deepEqual(scanComponent("el.textContent = t('a.b');\nel.textContent = '';\nel.textContent = `${n}`;"), []);
  assert.deepEqual(scanComponent("h(doc, 'span', { 'aria-hidden': 'true' }, '!');\nconst c = `/plugin install ${n}@${m}`;"), []);
  assert.deepEqual(scanComponent("doc.querySelectorAll('input[data-add-set]'); // Hello world"), []);
  assert.deepEqual(scanTemplate("`<p>${esc(t('card.noDependencies', { a: 1 }))}</p><code>/plugin marketplace add ${REPO}</code>`"), []);
});

test('no hardcoded user-visible string in site-src/app or the static page renderer', () => {
  const problems = [];
  for (const file of COMPONENTS) {
    const source = readFileSync(file, 'utf8');
    // page.mjs is markup in template literals plus a few plain strings; the app files are DOM code.
    const found = file.endsWith('page.mjs') ? [...scanTemplate(source), ...scanComponent(source)] : scanComponent(source);
    for (const f of found) problems.push(`${relative(root, file)}: ${f.rule}: ${JSON.stringify(f.text)}`);
  }
  assert.deepEqual(problems, []);
});
