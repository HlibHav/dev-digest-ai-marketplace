// Reads the per-plugin CHANGELOG.md and COMPATIBILITY.md. Shared by check-repo (rules) and the
// index builder (data for the catalog). Pure string parsing: no file access here.

const VERSION = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
// `## 1.2.3`, `## [1.2.3]`, `## v1.2.3`, each optionally followed by ` — 2026-10-14`, ` - 2026-10-14` or ` (2026-10-14)`.
const HEADING = new RegExp(
  `^##[ \\t]+\\[?v?(${VERSION})\\]?[ \\t]*(?:(?:—|–|-)[ \\t]*(\\d{4}-\\d{2}-\\d{2})|\\((\\d{4}-\\d{2}-\\d{2})\\))?[ \\t]*$`,
);
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;
const COMPAT = /Claude Code\s*`?(>=\s*\d+\.\d+\.\d+)/;

export const MAX_NOTES_CHARS = 600;

/** Removes markdown markers from one bullet's text: emphasis, backticks, link syntax. */
function plain(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joins lines with "\n" while the total stays within MAX_NOTES_CHARS; an oversized first line is cut with "…". */
function capNotes(lines) {
  const out = [];
  let size = 0;
  for (const line of lines) {
    const next = size + (out.length ? 1 : 0) + line.length;
    if (next > MAX_NOTES_CHARS) {
      if (!out.length) out.push(`${line.slice(0, MAX_NOTES_CHARS - 1)}…`);
      break;
    }
    out.push(line);
    size = next;
  }
  return out.join('\n');
}

/**
 * parseChangelog(text) -> Array<{ version, date: string|null, notes: string }>, in file order
 * (newest first by convention). `notes` is the bullets under the heading, markdown stripped.
 */
export function parseChangelog(text) {
  const entries = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const m = HEADING.exec(raw);
    if (m) {
      current = { version: m[1], date: m[2] ?? m[3] ?? null, lines: [] };
      entries.push(current);
      continue;
    }
    if (/^##\s/.test(raw) || /^#\s/.test(raw)) {
      current = null; // another section (for example "## Unreleased") ends the entry
      continue;
    }
    if (!current) continue;
    const b = BULLET.exec(raw);
    if (!b) continue;
    const line = plain(b[1]);
    if (line) current.lines.push(line);
  }
  return entries.map((e) => ({ version: e.version, date: e.date, notes: capNotes(e.lines) }));
}

/** First `## x.y.z` heading of a CHANGELOG, or null. */
export function firstChangelogVersion(text) {
  return parseChangelog(text)[0]?.version ?? null;
}

/** parseCompatibility(text) -> { claudeCode: ">=x.y.z" } | null (first match wins). */
export function parseCompatibility(text) {
  const m = COMPAT.exec(String(text));
  return m ? { claudeCode: m[1].replace(/\s+/g, '') } : null;
}
