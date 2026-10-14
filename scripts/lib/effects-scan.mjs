// AC-57: the built effects code makes no network call, runs no dynamic code and carries no URL.
import { BuildError } from './errors.mjs';

const FORBIDDEN = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['sendBeacon', /sendBeacon/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /new\s+Function\b/],
  ['http://', /http:\/\//],
  ['https://', /https:\/\//],
];

/** Labels of every forbidden construct found in the text, in a fixed order. */
export function scanEffects(text) {
  return FORBIDDEN.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/** files: [{path, text}]. Throws a BuildError naming each file and what it contains. */
export function checkEffectsChunks(files) {
  const problems = files.flatMap((f) => {
    const hits = scanEffects(f.text);
    return hits.length ? [`${f.path} contains ${hits.join(', ')}`] : [];
  });
  if (problems.length) {
    throw new BuildError('effects bundle', `network or dynamic-code construct found (AC-57): ${problems.join('; ')}`);
  }
}
