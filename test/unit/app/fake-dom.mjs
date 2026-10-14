// Minimal DOM double for tests: just enough for createElement, createTextNode, append, setAttribute.
class Node_ {
  constructor(doc) { this.ownerDocument = doc; this.childNodes = []; }
  append(...kids) { for (const k of kids) this.childNodes.push(typeof k === 'string' ? this.ownerDocument.createTextNode(k) : k); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
}
class Text_ extends Node_ {
  constructor(doc, data) { super(doc); this.nodeType = 3; this.data = data; }
  get textContent() { return this.data; }
}
class Element_ extends Node_ {
  constructor(doc, tag) { super(doc); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set textContent(v) { this.childNodes = [this.ownerDocument.createTextNode(String(v))]; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
}
export function fakeDocument() {
  const doc = {
    createElement: (tag) => new Element_(doc, tag),
    createTextNode: (data) => new Text_(doc, data),
  };
  return doc;
}
export const tags = (el) => el.childNodes.map((c) => (c.nodeType === 3 ? '#text' : c.tagName.toLowerCase()));
