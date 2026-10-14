// Text normalisation shared by the query parser, the curated lists and the engine.
// Isomorphic: no node:* imports, no DOM access.

const APOSTROPHES = /[’ʼ]/g; // ’ and ʼ become '

/** Folds the apostrophe variants ' ’ ʼ into the ASCII apostrophe. */
export function normalizeApostrophes(s) {
  return String(s ?? '').replace(APOSTROPHES, "'");
}

/** Splits text into lowercase word tokens. Inner apostrophes stay (рев'ю); bare ones are dropped. */
export function tokenize(s) {
  return normalizeApostrophes(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 0);
}
