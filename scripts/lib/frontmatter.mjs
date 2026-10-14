// Minimal in-house frontmatter reader. It reads top-level `key: value` pairs only:
// plain, single-quoted, double-quoted and `|` / `>` block scalars (with `-`, `+` chomping).
// Every other key (lists, maps, flow sequences) is skipped on purpose.
import { BuildError } from './errors.mjs';

const KEY = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*)|\s*)$/;
const BLOCK = /^([|>])([+-]?)\d*\s*(?:#.*)?$/;

const indentOf = (line) => line.length - line.trimStart().length;

function unquoteSingle(s) {
  return s.slice(1, -1).replace(/''/g, "'");
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', 0: '\0' };
function unquoteDouble(s) {
  return s.slice(1, -1).replace(/\\(.)/g, (m, c) => (c in ESCAPES ? ESCAPES[c] : m));
}

function scalar(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return unquoteSingle(v);
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return unquoteDouble(v);
  return v;
}

function blockScalar(lines, style, chomp) {
  // Drop trailing blank lines now, re-add the final newline according to the chomp indicator.
  const body = [...lines];
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  const first = body.find((l) => l.trim() !== '');
  const base = first === undefined ? 0 : indentOf(first);
  const stripped = body.map((l) => (l.trim() === '' ? '' : l.slice(base)));
  let text;
  if (style === '|') {
    text = stripped.join('\n');
  } else {
    // Folded: adjacent non-blank, non-indented lines join with a space; a blank line is a line break.
    let out = '';
    let pendingBreaks = 0;
    stripped.forEach((l, i) => {
      if (l === '') {
        pendingBreaks += 1;
        return;
      }
      if (i > 0 && out !== '') out += pendingBreaks > 0 ? '\n'.repeat(pendingBreaks) : ' ';
      pendingBreaks = 0;
      out += l;
    });
    text = out;
  }
  if (chomp === '-' || text === '') return text;
  return `${text}\n`;
}

/**
 * parseFrontmatter(text, file) -> { data, body, hasFrontmatter }
 * `body` is the raw text after the closing delimiter line. Throws BuildError when the block is not closed.
 */
export function parseFrontmatter(text, file) {
  const src = String(text);
  const open = /^---[ \t]*\r?\n/.exec(src);
  if (!open) return { data: {}, body: src, hasFrontmatter: false };

  const rest = src.slice(open[0].length);
  const lines = rest.split('\n');
  let end = -1;
  let offset = 0;
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    starts.push(offset);
    if (/^---[ \t]*\r?$/.test(lines[i])) {
      end = i;
      break;
    }
    offset += lines[i].length + 1;
  }
  if (end < 0) throw new BuildError(file, 'frontmatter is not closed (missing the closing "---" line)');

  const block = lines.slice(0, end).map((l) => l.replace(/\r$/, ''));
  const afterIdx = starts[end] + lines[end].length + 1;
  const body = afterIdx >= rest.length ? '' : rest.slice(afterIdx);

  const data = {};
  let i = 0;
  while (i < block.length) {
    const line = block[i];
    const m = indentOf(line) === 0 ? KEY.exec(line) : null;
    if (!m) {
      i += 1;
      continue;
    }
    const [, key, valueRaw = ''] = m;
    // Collect the indented continuation lines that belong to this key.
    let j = i + 1;
    while (j < block.length && (block[j].trim() === '' || indentOf(block[j]) > 0)) j += 1;
    const cont = block.slice(i + 1, j);
    const value = valueRaw.trim();

    const bm = BLOCK.exec(value);
    if (bm) {
      data[key] = blockScalar(cont, bm[1], bm[2]);
    } else if (value === '') {
      // No inline value: a list or a map. Skipped.
    } else if (/^[[{]/.test(value)) {
      // Flow sequence or map. Skipped.
    } else if (value.startsWith("'") || value.startsWith('"')) {
      data[key] = scalar(value);
    } else {
      const parts = [value, ...cont.map((c) => c.trim()).filter((c) => c !== '')];
      data[key] = parts.join(' ');
    }
    i = j;
  }
  return { data, body, hasFrontmatter: true };
}
