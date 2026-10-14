// Parses the curated word lists (dictionary, stop words, type words) kept in data/.
// Isomorphic: receives file contents as strings, so it reads no files itself.
import { TYPES } from '../contract/index-contract.js';
import { normalizeApostrophes, tokenize } from './normalize.js';

export const FILES = Object.freeze({
  dictionary: 'data/dictionary.ua-en.txt',
  stopUk: 'data/stopwords.uk.txt',
  stopEn: 'data/stopwords.en.txt',
  typewords: 'data/typewords.txt',
});

export class CuratedError extends Error {
  constructor(file, rule) {
    super(`${file}: ${rule}`);
    this.name = 'CuratedError';
    this.file = file;
    this.rule = rule;
  }
}

const WORD = /^[\p{L}\p{N}][\p{L}\p{N}' -]*$/u;

/** Yields {no, text} for every non-blank, non-comment line (a trailing `# ...` is stripped). */
function* lines(text) {
  const rows = normalizeApostrophes(text ?? '').split(/\r?\n/);
  for (let i = 0; i < rows.length; i += 1) {
    const hash = rows[i].indexOf('#');
    const t = (hash === -1 ? rows[i] : rows[i].slice(0, hash)).trim();
    if (t) yield { no: i + 1, text: t.toLowerCase() };
  }
}

function parseDictionary(text) {
  const file = FILES.dictionary;
  const out = new Map();
  const firstSeen = new Map();
  for (const { no, text: line } of lines(text)) {
    const eq = line.indexOf('=');
    if (eq === -1) throw new CuratedError(file, `line ${no}: expected "word = en1, en2"`);
    const key = line.slice(0, eq).trim();
    if (!key || tokenize(key).length !== 1 || tokenize(key)[0] !== key) {
      throw new CuratedError(file, `line ${no}: the key must be one word`);
    }
    if (out.has(key)) throw new CuratedError(file, `line ${no}: duplicate key "${key}" (first at line ${firstSeen.get(key)})`);
    const raw = line.slice(eq + 1).split(',').map((s) => s.trim());
    const values = raw.filter((s) => s.length > 0);
    if (values.length === 0 || values.length !== raw.length) {
      // `a,,b` and a trailing comma are as broken as an empty value.
      throw new CuratedError(file, `line ${no}: the value for "${key}" is empty or has an empty item (must be a word list)`);
    }
    for (const v of values) {
      if (!WORD.test(v)) throw new CuratedError(file, `line ${no}: "${v}" is not a word (the value must be a word list)`);
    }
    firstSeen.set(key, no);
    out.set(key, [...new Set(values)]);
  }
  return out;
}

function parseStop(text, file) {
  const out = new Set();
  for (const { no, text: line } of lines(text)) {
    const toks = tokenize(line);
    if (toks.length !== 1 || toks[0] !== line) throw new CuratedError(file, `line ${no}: one word per line`);
    out.add(line);
  }
  return out;
}

function parseTypewords(text) {
  const file = FILES.typewords;
  const out = new Map();
  for (const { no, text: line } of lines(text)) {
    const colon = line.indexOf(':');
    if (colon === -1) throw new CuratedError(file, `line ${no}: expected "type: form, form"`);
    const type = line.slice(0, colon).trim();
    if (!TYPES.includes(type)) throw new CuratedError(file, `line ${no}: unknown type "${type}"`);
    const forms = line.slice(colon + 1).split(',').map((s) => s.trim());
    if (forms.length === 0 || forms.some((f) => !f || tokenize(f).length !== 1 || tokenize(f)[0] !== f)) {
      throw new CuratedError(file, `line ${no}: each form must be one word`);
    }
    for (const f of forms) {
      if (out.has(f)) throw new CuratedError(file, `line ${no}: duplicate form "${f}"`);
      out.set(f, type);
    }
  }
  return out;
}

/**
 * @param {{dictionary: string, stopUk: string, stopEn: string, typewords: string}} texts
 * @returns {{dictionary: Map<string,string[]>, stop: Set<string>, typeForms: Map<string,string>}}
 * @throws {CuratedError}
 */
export function parseCurated(texts) {
  const dictionary = parseDictionary(texts?.dictionary);
  const stop = new Set([...parseStop(texts?.stopUk, FILES.stopUk), ...parseStop(texts?.stopEn, FILES.stopEn)]);
  const typeForms = parseTypewords(texts?.typewords);
  return { dictionary, stop, typeForms };
}
