// Path containment for the build tools. Plugin directories, manifest fields and directory listings come from
// contributor PRs, so any path built from them must stay inside the directory it is meant to live in.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Thrown when a path escapes its allowed root, lexically (`..`, absolute) or through a symlink. */
export class PathEscapeError extends Error {
  constructor(root, target, why) {
    super(`path "${target}" ${why} (allowed root: ${root})`);
    this.name = 'PathEscapeError';
    this.root = root;
    this.target = target;
  }
}

/** True when `target` is `root` itself or lies below it. Both must already be absolute. */
export function isInside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel));
}

/**
 * resolveInside(root, ...segments) -> absolute path
 * Joins the segments under `root` and throws a PathEscapeError when the result is outside it. Purely lexical:
 * it does not touch the disk, so it is the right check for paths that may not exist yet.
 */
export function resolveInside(root, ...segments) {
  const base = resolve(root);
  for (const s of segments) {
    if (typeof s !== 'string' || s.includes('\0')) throw new PathEscapeError(base, String(s), 'is not a valid path segment');
  }
  const abs = resolve(base, ...segments);
  if (!isInside(base, abs)) throw new PathEscapeError(base, segments.join('/'), 'points outside the allowed root');
  return abs;
}

/**
 * assertRealInside(root, abs) -> abs
 * Refuses a path whose real location (symlinks resolved) is outside the real `root`. A path that does not
 * exist passes: the caller's own existence check reports it. A dangling symlink is refused.
 */
export function assertRealInside(root, abs) {
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    throw new PathEscapeError(root, abs, 'has an unreadable root');
  }
  let real;
  try {
    real = realpathSync(abs);
  } catch (e) {
    if (e.code === 'ENOENT' && !isDanglingLink(abs)) return abs;
    throw new PathEscapeError(realRoot, abs, `cannot be resolved (${e.code ?? e.message})`);
  }
  if (!isInside(realRoot, real)) throw new PathEscapeError(realRoot, abs, 'resolves outside the allowed root through a symlink');
  return abs;
}

/** A symlink whose target is missing: realpath fails with ENOENT but lstat still sees the link itself. */
function isDanglingLink(abs) {
  try {
    lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** resolveInside + assertRealInside: the lexical and the symlink check in one call. */
export function safeResolve(root, ...segments) {
  const abs = resolveInside(root, ...segments);
  assertRealInside(root, abs);
  return abs;
}

/** Reads a UTF-8 file that must lie inside `root`, symlinks resolved. */
export function readTextInside(root, ...segments) {
  return readFileSync(safeResolve(root, ...segments), 'utf8');
}
