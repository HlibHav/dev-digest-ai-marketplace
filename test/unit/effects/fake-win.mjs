// Small DOM, window and renderer doubles for the effects unit tests.
class FakeEvent {
  constructor(type, init = {}) { this.type = type; this.bubbles = Boolean(init.bubbles); this.target = null; }
}

export class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this.listeners = [];
    this.style = {};
    this.cssVars = {};
    this.width = 0;
    this.height = 0;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
  removeAttribute(k) { delete this.attrs[k]; }
  get firstChild() { return this.children[0] ?? null; }
  append(...kids) { for (const k of kids) { k.remove(); k.parent = this; this.children.push(k); } }
  prepend(...kids) { for (const k of [...kids].reverse()) { k.remove(); k.parent = this; this.children.unshift(k); } }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  get isConnected() {
    let n = this;
    while (n.parent) n = n.parent;
    return n.isRoot === true;
  }
  closest(sel) {
    const name = sel.slice(1, -1);
    for (let n = this; n; n = n.parent) if (n.hasAttribute && n.hasAttribute(name)) return n;
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  matches(sel) { return this.hasAttribute(sel.slice(1, -1)); }
  addEventListener(type, fn, capture = false) {
    this.listeners.push({ type, fn, capture: capture === true || capture?.capture === true });
  }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); }
  dispatchEvent(ev) {
    ev.target = this;
    const path = [];
    for (let n = this.parent; n; n = n.parent) path.unshift(n);
    for (const n of path) for (const l of [...n.listeners]) if (l.type === ev.type && l.capture) l.fn(ev);
    for (const l of [...this.listeners]) if (l.type === ev.type) l.fn(ev);
    if (ev.bubbles) for (const n of [...path].reverse()) for (const l of [...n.listeners]) if (l.type === ev.type && !l.capture) l.fn(ev);
  }
  fire(type, bubbles = false) { this.dispatchEvent(new FakeEvent(type, { bubbles })); }
}

export function makePage({ cards = 3, types = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp_server'] } = {}) {
  const doc = new FakeEl('document');
  doc.isRoot = true;
  const header = new FakeEl('header');
  header.setAttribute('data-fx-header', '');
  header.cssVars = { '--header-from': '#1d4ed8', '--header-to': '#6d28d9' };
  const list = new FakeEl('ul');
  list.setAttribute('data-fx-cards', '');
  const els = [];
  for (let i = 0; i < cards; i += 1) {
    const type = types[i % types.length];
    const card = new FakeEl('li');
    card.setAttribute('data-card', '');
    card.setAttribute('data-type', type);
    card.cssVars = { '--type-color': ['#1d4ed8', '#6d28d9', '#047857', '#b45309', '#be123c', '#0e7490'][i % 6] };
    list.append(card);
    els.push(card);
  }
  doc.append(header, list);
  return { doc, header, list, cards: els };
}

export function makeWin(page, { gpu = true, reduced = false, dark = false, observers = true } = {}) {
  const doc = page.doc;
  doc.hidden = false;
  doc.createElement = (tag) => new FakeEl(tag);
  const mq = new Map();
  const win = {
    document: doc,
    navigator: gpu ? { gpu: {} } : {},
    getComputedStyle: (el) => ({ getPropertyValue: (n) => el.cssVars?.[n] ?? '' }),
    matchMedia: (q) => {
      if (!mq.has(q)) {
        const state = {
          matches: q.includes('reduced-motion') ? reduced : q.includes('dark') ? dark : false,
          cbs: [],
          addEventListener(t, cb) { this.cbs.push(cb); },
          removeEventListener(t, cb) { this.cbs = this.cbs.filter((c) => c !== cb); },
        };
        mq.set(q, state);
      }
      return mq.get(q);
    },
    setReduced(v) {
      const m = win.matchMedia('(prefers-reduced-motion: reduce)');
      m.matches = v;
      for (const cb of [...m.cbs]) cb({ matches: v });
    },
    setHidden(h) {
      doc.hidden = h;
      doc.fire('visibilitychange');
    },
    observers: [],
    mutationObservers: [],
  };
  if (observers) {
    win.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; this.targets = new Set(); win.observers.push(this); }
      observe(t) { this.targets.add(t); }
      unobserve(t) { this.targets.delete(t); }
      disconnect() { this.targets.clear(); this.disconnected = true; }
      set(target, isIntersecting) { if (this.targets.has(target)) this.cb([{ target, isIntersecting }]); }
    };
    win.MutationObserver = class {
      constructor(cb) { this.cb = cb; win.mutationObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
      trigger() { this.cb([]); }
    };
  }
  return win;
}

/** A renderer factory that records every instance and call. */
export function makeFactory({ failCreate = false, failStart = false } = {}) {
  const instances = [];
  const create = (opts) => {
    if (failCreate) throw new Error('no device');
    const r = {
      opts,
      calls: [],
      running: false,
      destroyed: false,
      start() { if (failStart) throw new Error('start'); this.calls.push('start'); this.running = true; },
      stop() { this.calls.push('stop'); this.running = false; },
      destroy() { this.calls.push('destroy'); this.running = false; this.destroyed = true; },
    };
    instances.push(r);
    return r;
  };
  return { create, instances, live: () => instances.filter((i) => !i.destroyed) };
}
