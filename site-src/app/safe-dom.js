// Small DOM builder that only creates text nodes and a fixed set of elements and attributes (AC-24).
const TAGS = new Set([
  'a', 'article', 'b', 'button', 'code', 'details', 'div', 'footer', 'form', 'h1', 'h2', 'h3', 'header', 'input',
  'label', 'li', 'mark', 'nav', 'p', 'pre', 'section', 'span', 'strong', 'summary', 'ul', 'ol', 'textarea',
]);
const ATTRS = new Set([
  'class', 'id', 'type', 'hidden', 'role', 'title', 'tabindex', 'name', 'value', 'for', 'open', 'disabled',
  'checked', 'href', 'placeholder', 'readonly', 'rows', 'autocomplete', 'spellcheck',
]);
const SCHEME = /^\s*[a-z][a-z0-9+.-]*:/i;

function setAttr(el, name, value) {
  const ok = ATTRS.has(name) || name.startsWith('aria-') || name.startsWith('data-');
  if (!ok) throw new Error(`attribute "${name}" is not allowed`);
  if (value === false || value === null || value === undefined) return;
  if (name === 'href' && SCHEME.test(String(value))) throw new Error('href with a scheme is not allowed');
  el.setAttribute(name, value === true ? '' : String(value));
}

/** h(document, 'p', {class: 'x'}, 'text', childElement) -> element. Strings become text nodes. */
export function h(doc, tag, attrs = {}, ...children) {
  if (!TAGS.has(tag)) throw new Error(`element "${tag}" is not allowed`);
  const el = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) setAttr(el, name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' || typeof child === 'number' ? doc.createTextNode(String(child)) : child);
  }
  return el;
}
