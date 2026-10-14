// AC-55: the JavaScript needed for search, builder and the static look is at most 60 KB gzipped.
// The effects code is loaded on demand (dynamic import) and is excluded.
import { gzipSync } from 'node:zlib';
import { BuildError } from './errors.mjs';

export const CORE_JS_FAIL_BYTES = 60 * 1024;
export const CORE_JS_WARN_BYTES = 45 * 1024;
const TOP_INPUTS = 5;

/** Output files that load with the page: entry outputs that nothing imports lazily, plus their static imports. */
export function coreOutputs(metafile) {
  const outputs = metafile.outputs;
  const lazy = new Set();
  for (const out of Object.values(outputs)) {
    for (const imp of out.imports ?? []) if (imp.kind === 'dynamic-import') lazy.add(imp.path);
  }
  const roots = Object.keys(outputs).filter((p) => outputs[p].entryPoint && !lazy.has(p));
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p) || !outputs[p]) continue;
    seen.add(p);
    for (const imp of outputs[p].imports ?? []) if (imp.kind === 'import-statement') stack.push(imp.path);
  }
  return [...seen].sort();
}

/** Sum of the gzipped size of each core output. `contents` maps an output path to its bytes. */
export function coreJsGzipBytes(metafile, contents) {
  return coreOutputs(metafile)
    .filter((p) => p.endsWith('.js'))
    .reduce((sum, p) => sum + gzipSync(contents.get(p) ?? Buffer.alloc(0)).length, 0);
}

function biggestInputs(metafile) {
  const bytes = new Map();
  for (const p of coreOutputs(metafile)) {
    for (const [input, info] of Object.entries(metafile.outputs[p].inputs ?? {})) {
      bytes.set(input, (bytes.get(input) ?? 0) + info.bytesInOutput);
    }
  }
  return [...bytes.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, TOP_INPUTS)
    .map(([input, n]) => `${input} (${n} bytes)`);
}

/** Returns {bytes, warning}; throws a BuildError naming the biggest inputs when over the fail limit. */
export function checkJsBudget(metafile, contents, { failBytes = CORE_JS_FAIL_BYTES, warnBytes = CORE_JS_WARN_BYTES } = {}) {
  const bytes = coreJsGzipBytes(metafile, contents);
  if (bytes > failBytes) {
    throw new BuildError(
      'core JavaScript',
      `${bytes} bytes gzipped, over the budget of ${failBytes} bytes (AC-55); biggest inputs: ${biggestInputs(metafile).join(', ')}`,
    );
  }
  const warning = bytes > warnBytes ? `core JavaScript is ${bytes} bytes gzipped, above the ${warnBytes} byte warning level (limit ${failBytes})` : null;
  return { bytes, warning };
}
