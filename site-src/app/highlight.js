// Highlighting without regular expressions and without markup strings (AC-24).

// Lower-cases per character and keeps the original character when the case mapping changes its length,
// so indices into the lowered string are indices into the original.
function fold(s) {
  let out = '';
  for (const ch of s) {
    const lo = ch.toLowerCase();
    out += lo.length === ch.length ? lo : ch;
  }
  return out;
}

/** Returns merged `[start, end)` ranges of every case-insensitive occurrence of any term in `text`. */
export function highlightRanges(text, terms) {
  const hay = fold(String(text ?? ''));
  const found = [];
  for (const raw of terms ?? []) {
    const needle = fold(String(raw ?? '').trim());
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      found.push([at, at + needle.length]);
      from = at + needle.length;
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Appends `text` to `el` as text nodes, wrapping each range in a `<mark>` element. */
export function appendHighlighted(el, text, ranges) {
  const doc = el.ownerDocument;
  const s = String(text ?? '');
  let pos = 0;
  for (const [start, end] of ranges ?? []) {
    if (start > pos) el.append(doc.createTextNode(s.slice(pos, start)));
    const mark = doc.createElement('mark');
    mark.append(doc.createTextNode(s.slice(start, end)));
    el.append(mark);
    pos = end;
  }
  if (pos < s.length || (!ranges?.length && s.length)) el.append(doc.createTextNode(s.slice(pos)));
}
