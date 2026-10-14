// Size bounds for the search index (AC-41, AC-42).
import { gzipSync } from 'node:zlib';
import { MAX_EXCERPT } from '../../site-src/contract/index-contract.js';
import { BuildError } from './errors.mjs';

export const DEFAULT_INDEX_BUDGET_GZIP_BYTES = 500 * 1024;
const TOP_CONTRIBUTORS = 5;

/** At most MAX_EXCERPT characters of a body; a surrogate pair is never cut in half. */
export function excerpt(body) {
  const text = String(body);
  if (text.length <= MAX_EXCERPT) return text;
  const last = text.charCodeAt(MAX_EXCERPT - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? MAX_EXCERPT - 1 : MAX_EXCERPT;
  return text.slice(0, end);
}

export const gzipBytes = (text) => gzipSync(Buffer.from(text, 'utf8')).length;

/** Throws BuildError naming the largest artifacts when the gzipped index is over budget. */
export function checkIndexBudget(index, json, budgetBytes, file = 'index.json') {
  const size = gzipBytes(json);
  if (size <= budgetBytes) return size;
  const largest = index.artifacts
    .map((a) => ({ name: a.name, bytes: JSON.stringify(a).length }))
    .sort((x, y) => y.bytes - x.bytes || (x.name < y.name ? -1 : 1))
    .slice(0, TOP_CONTRIBUTORS)
    .map((c) => `${c.name} (${c.bytes} bytes)`);
  throw new BuildError(
    file,
    `search index is ${size} bytes gzipped, over the budget of ${budgetBytes} bytes; largest contributors: ${largest.join(', ')}`,
  );
}
