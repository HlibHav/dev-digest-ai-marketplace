#!/usr/bin/env node
// Local development server for the catalog site: `npm run dev`.
//
// It builds the site from the REAL repository root only (the plugins in .claude-plugin/marketplace.json and
// plugins/), into .tmp/dev-site, by running the production build as a child process:
//   node scripts/build-index.mjs --out .tmp/dev-site
// so dev and GitHub Pages never diverge. There is deliberately no --root option: the dev server never shows
// test fixtures. It serves that directory on 127.0.0.1 and rebuilds (debounced, one build at a time) when
// .claude-plugin/, plugins/, site-src/, data/ or scripts/ change.
//
// Live reload keeps the page's CSP intact (no inline code, same-origin only): the HTTP response for index.html
// gets <script src="/__dev/reload.js" defer></script> before </body>; that file opens an EventSource on
// /__dev/events and reloads on a "reload" event. The injection happens only in the response, never on disk.
//
// Env: PORT (default 3400; 0 picks a free port, the printed URL always carries the real one).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(repoRoot, '.tmp', 'dev-site');
const HOST = '127.0.0.1';
const WATCHED = ['.claude-plugin', 'plugins', 'site-src', 'data', 'scripts'];
const DEBOUNCE_MS = 200;
const INJECT = '<script src="/__dev/reload.js" defer></script>';
const RELOAD_JS = [
  "const es = new EventSource('/__dev/events');",
  "es.addEventListener('reload', () => location.reload());",
  '',
].join('\n');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const log = (msg) => console.log(`dev-server: ${msg}`);

// ---- build loop -----------------------------------------------------------------------------------------

const clients = new Set();
let building = false;
let queued = false;
let timer = null;
let child = null;
let stopping = false;

function runBuild() {
  return new Promise((resolveBuild) => {
    child = spawn(process.execPath, [join(repoRoot, 'scripts', 'build-index.mjs'), '--out', siteDir], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolveBuild({ ok: false, out, err: String(e) }));
    child.on('close', (code) => {
      child = null;
      resolveBuild({ ok: code === 0, out, err });
    });
  });
}

async function rebuild() {
  if (building) {
    queued = true;
    return false;
  }
  building = true;
  let ok = false;
  try {
    do {
      queued = false;
      const started = Date.now();
      const r = await runBuild();
      if (stopping) return false;
      ok = r.ok;
      if (ok) {
        const line = r.out.trim().split('\n').pop() ?? '';
        log(`rebuilt in ${Date.now() - started} ms: ${line}`);
        for (const res of clients) res.write('event: reload\ndata: 1\n\n');
      } else {
        console.error(`dev-server: build failed, still serving the last good site\n${(r.err || r.out).trimEnd()}`);
      }
    } while (queued);
  } finally {
    building = false;
  }
  return ok;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void rebuild();
  }, DEBOUNCE_MS);
}

// ---- HTTP -----------------------------------------------------------------------------------------------

const headers = (type, extra = {}) => ({ 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });

function notFound(res) {
  res.writeHead(404, headers('text/plain; charset=utf-8'));
  res.end('not found\n');
}

/** Maps a request target to a file inside siteDir, or null for anything outside it or malformed. */
function resolveFile(target) {
  let pathname;
  try {
    pathname = decodeURIComponent(target.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || !pathname.startsWith('/')) return null;
  const file = resolve(siteDir, `.${pathname}`);
  if (file !== siteDir && !file.startsWith(siteDir + sep)) return null;
  return pathname.endsWith('/') ? join(file, 'index.html') : file;
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers('text/plain; charset=utf-8', { Allow: 'GET, HEAD' }));
    res.end('method not allowed\n');
    return;
  }
  const target = req.url ?? '/';
  const path = target.split('?')[0];
  if (path === '/__dev/reload.js') {
    res.writeHead(200, headers(TYPES['.js']));
    res.end(RELOAD_JS);
    return;
  }
  if (path === '/__dev/events') {
    res.writeHead(200, headers('text/event-stream', { Connection: 'keep-alive' }));
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const file = resolveFile(target);
  if (file === null || !existsSync(file) || !statSync(file).isFile()) {
    notFound(res);
    return;
  }
  let body = readFileSync(file);
  if (file === join(siteDir, 'index.html')) {
    const html = body.toString('utf8');
    body = Buffer.from(html.includes('</body>') ? html.replace('</body>', `${INJECT}</body>`) : html + INJECT);
  }
  res.writeHead(200, headers(TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'));
  res.end(req.method === 'HEAD' ? undefined : body);
});

// ---- start and stop -------------------------------------------------------------------------------------

const watchers = [];

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  for (const w of watchers) w.close();
  if (child) child.kill();
  for (const res of clients) res.end();
  clients.clear();
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const rawPort = process.env.PORT ?? '3400';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`dev-server: PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  process.exit(2);
}

if (!(await rebuild())) {
  console.error('dev-server: the first build failed, nothing to serve');
  process.exit(1);
}

for (const name of WATCHED) {
  const dir = join(repoRoot, name);
  if (!existsSync(dir)) continue;
  const w = watch(dir, { recursive: true }, schedule);
  w.on('error', (e) => console.error(`dev-server: watcher on ${name}/ failed: ${e.message}`));
  watchers.push(w);
}

server.on('error', (e) => {
  console.error(`dev-server: ${e.message}`);
  process.exit(1);
});
server.listen(port, HOST, () => {
  log(`http://${HOST}:${server.address().port}`);
});
