// Bundles the browser code (site-src) with esbuild. Nothing is written here: the caller gets every output
// file in memory, so the build stays all-or-nothing.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { coreOutputs } from './budget-js.mjs';
import { BuildError } from './errors.mjs';
import { CuratedError, FILES, parseCurated } from '../../site-src/search/curated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIRTUAL_OUT = '.bundle-out';
const CSS_ORDER = ['tokens', 'base', 'header', 'layout', 'cards', 'builder'];
const CURATED_KEYS = Object.keys(FILES);

/** Path of each curated file: <root>/data/<name> when the root has one, else the repo's own. */
export function curatedPaths(root) {
  const paths = {};
  for (const key of CURATED_KEYS) {
    const name = basename(FILES[key]);
    const own = join(root, 'data', name);
    paths[key] = existsSync(own) ? own : join(repoRoot, 'data', name);
  }
  return paths;
}

/** Reads and validates the curated files (AC-5). Throws a BuildError "<file>: <rule>". */
export function loadCurated(root) {
  const paths = curatedPaths(root);
  const texts = {};
  for (const key of CURATED_KEYS) texts[key] = readFileSync(paths[key], 'utf8');
  try {
    parseCurated(texts);
  } catch (e) {
    if (e instanceof CuratedError) throw new BuildError(e.file, e.rule);
    throw e;
  }
  return { paths, texts };
}

const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

function normalise(metafile) {
  const strip = (p) => (p.startsWith(`${VIRTUAL_OUT}/`) ? p.slice(VIRTUAL_OUT.length + 1) : p);
  const outputs = {};
  for (const [p, out] of Object.entries(metafile.outputs)) {
    outputs[strip(p)] = { ...out, imports: out.imports.map((i) => ({ ...i, path: strip(i.path) })) };
  }
  return { inputs: metafile.inputs, outputs };
}

function licenseText() {
  const pkgDir = join(repoRoot, 'node_modules', 'minisearch');
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const file = ['LICENSE.txt', 'LICENSE', 'LICENSE.md'].map((n) => join(pkgDir, n)).find((p) => existsSync(p));
  if (!file) throw new BuildError('node_modules/minisearch', 'LICENSE file not found');
  return `Third-party software shipped in this site\n\nminisearch ${pkg.version} (${pkg.license})\n\n${readFileSync(file, 'utf8').trim()}\n`;
}

/**
 * bundleSite({root, fakeFx?}) -> {css[], js[], effects[], metafile, contents: Map<path, Buffer>}
 * Paths are relative to the site directory ("assets/app-<hash>.js"). `js` is the page entry, `effects` is every
 * output that loads lazily. fakeFx swaps the WebGPU renderer for the test double; it defaults to SITE_FAKE_FX=1.
 */
export async function bundleSite({ root = repoRoot, fakeFx = process.env.SITE_FAKE_FX === '1' } = {}) {
  const paths = curatedPaths(root);
  const byName = new Map(CURATED_KEYS.map((k) => [basename(FILES[k]), paths[k]]));
  const plugin = {
    name: 'site-wiring',
    setup(b) {
      b.onResolve({ filter: /\.txt$/ }, (args) => {
        const file = byName.get(basename(args.path));
        return file ? { path: file } : undefined;
      });
      if (fakeFx) {
        // The import is relative ("./webgpu-renderer.js"), so match on the file name and the directory it resolves in.
        const effectsDir = join(repoRoot, 'site-src', 'effects');
        b.onResolve({ filter: /(^|\/)webgpu-renderer\.js$/ }, (args) => (
          resolve(args.resolveDir, args.path) === join(effectsDir, 'webgpu-renderer.js') ? { path: join(effectsDir, 'fake-renderer.js') } : undefined
        ));
      }
    },
  };

  let result;
  try {
    result = await build({
      absWorkingDir: repoRoot,
      entryPoints: { app: 'site-src/entry.js' },
      outdir: VIRTUAL_OUT,
      entryNames: 'assets/[name]-[hash]',
      chunkNames: 'assets/[name]-[hash]',
      bundle: true,
      splitting: true,
      format: 'esm',
      minify: true,
      target: 'es2022',
      platform: 'browser',
      loader: { '.txt': 'text' },
      legalComments: 'none',
      metafile: true,
      write: false,
      logLevel: 'silent',
      plugins: [plugin],
    });
  } catch (e) {
    const first = e.errors?.[0];
    const where = first?.location ? `${first.location.file}:${first.location.line}` : 'site-src';
    throw new BuildError(where, `bundling failed: ${first?.text ?? e.message}`);
  }

  const contents = new Map();
  for (const f of result.outputFiles) {
    contents.set(relative(join(repoRoot, VIRTUAL_OUT), f.path).split('\\').join('/'), Buffer.from(f.contents));
  }
  const metafile = normalise(result.metafile);

  let cssSource = '';
  for (const name of CSS_ORDER) cssSource += `${readFileSync(join(repoRoot, 'site-src', 'styles', `${name}.css`), 'utf8')}\n`;
  const css = (await transform(cssSource, { loader: 'css', minify: true, target: 'es2022' })).code;
  const cssBuf = Buffer.from(css);
  const cssPath = `assets/app-${sha8(cssBuf)}.css`;
  contents.set(cssPath, cssBuf);
  contents.set('licenses.txt', Buffer.from(licenseText()));

  const outputs = Object.keys(metafile.outputs);
  const entryJs = outputs.filter((p) => metafile.outputs[p].entryPoint === 'site-src/entry.js');
  if (entryJs.length !== 1) throw new BuildError('site-src/entry.js', `expected one entry output, got ${entryJs.length}`);
  const core = new Set(coreOutputs(metafile));
  const effects = outputs.filter((p) => p.endsWith('.js') && !core.has(p)).sort();

  return { css: [cssPath], js: entryJs, effects, metafile, contents };
}
