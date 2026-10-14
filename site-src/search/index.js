// Public entry of the search core (contract: docs/CATALOG-CONTRACTS.md, "Search API").
export { normalizeApostrophes, tokenize } from './normalize.js';
export { parseCurated, CuratedError } from './curated.js';
export { parseQuery, clampQuery } from './parse-query.js';
export { buildDocs } from './docs.js';
export { createSearch } from './engine.js';
