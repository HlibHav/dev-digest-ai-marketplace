// Effects controller: decides when an effect runs. It knows nothing about WebGPU itself; the renderer
// factory and the window are injected, so the same logic is tested with fakes (AC-49 to AC-54).
//
//   createRenderer({ canvas, kind, color, color2, win, onFailure }) -> { start(), stop(), destroy() }
//
// Rules: header effect only with WebGPU and no reduced-motion request; a card effect on hover or focus;
// at most `maxCanvases` live canvases (header plus one card); every effect is paused while the tab is
// hidden or its canvas is out of the viewport; any failure ends in the static look, silently.
import { TYPE_COLORS } from '../app/type-colors.js';

const HEX = /^#[0-9a-f]{6}$/i;
const REDUCED = '(prefers-reduced-motion: reduce)';
const DARK = '(prefers-color-scheme: dark)';

export function webgpuAvailable(win) {
  try {
    return Boolean(win.navigator && win.navigator.gpu);
  } catch {
    return false;
  }
}

function query(win, q) {
  try {
    return win.matchMedia ? win.matchMedia(q) : null;
  } catch {
    return null;
  }
}

function readVar(win, el, name) {
  try {
    const v = String(win.getComputedStyle(el).getPropertyValue(name)).trim();
    return HEX.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function createController({ win, createRenderer, maxCanvases = 2 }) {
  const doc = win.document;
  const reducedQuery = query(win, REDUCED);
  const darkQuery = query(win, DARK);
  let reduced = Boolean(reducedQuery && reducedQuery.matches);
  let broken = false;
  let destroyed = false;
  const effects = new Set();
  const cleanups = [];
  let headerEffect = null;
  let cardEffect = null;
  let hoverCard = null;
  let focusCard = null;
  let io = null;

  const scheme = () => (darkQuery && darkQuery.matches ? 'dark' : 'light');
  const setState = (el, v) => {
    try { el.setAttribute('data-fx-state', v); } catch { /* element gone */ }
  };

  function observe(eff) {
    if (io === null && typeof win.IntersectionObserver === 'function') {
      try {
        io = new win.IntersectionObserver((entries) => {
          for (const e of entries) {
            for (const f of effects) if (f.canvas === e.target) { f.inView = e.isIntersecting !== false; sync(f); }
          }
        });
      } catch {
        io = false;
      }
    }
    if (io) {
      try { io.observe(eff.canvas); } catch { /* keep inView = true */ }
    }
  }

  function sync(eff) {
    if (eff.dead) return;
    const want = !doc.hidden && eff.inView && !reduced;
    try {
      if (want && !eff.running) { eff.renderer.start(); eff.running = true; }
      else if (!want && eff.running) { eff.renderer.stop(); eff.running = false; }
    } catch {
      fail(eff);
    }
  }

  function dispose(eff) {
    if (eff.dead) return;
    eff.dead = true;
    effects.delete(eff);
    if (io) { try { io.unobserve(eff.canvas); } catch { /* ignore */ } }
    try { if (eff.running) eff.renderer.stop(); } catch { /* ignore */ }
    try { eff.renderer.destroy(); } catch { /* ignore */ }
    try { eff.canvas.remove(); } catch { /* ignore */ }
    eff.running = false;
    if (eff === headerEffect) headerEffect = null;
    if (eff === cardEffect) cardEffect = null;
  }

  function fail(eff) {
    if (eff.dead) return;
    const el = eff.el;
    dispose(eff);
    broken = true;
    setState(el, 'static');
  }

  function create(el, kind, color, color2) {
    if (effects.size >= maxCanvases) return null;
    const canvas = doc.createElement('canvas');
    canvas.setAttribute('data-fx-canvas', '');
    canvas.setAttribute('aria-hidden', 'true');
    const eff = { el, kind, canvas, renderer: null, running: false, inView: true, dead: false };
    try {
      eff.renderer = createRenderer({ canvas, kind, color, color2, win, onFailure: () => fail(eff) });
      effects.add(eff);
      el.prepend(canvas);
      observe(eff);
      setState(el, 'on');
      sync(eff);
    } catch {
      effects.delete(eff);
      try { eff.renderer && eff.renderer.destroy(); } catch { /* ignore */ }
      try { canvas.remove(); } catch { /* ignore */ }
      broken = true;
      setState(el, 'static');
      return null;
    }
    return eff.dead ? null : eff;
  }

  function onVisibility() {
    for (const eff of [...effects]) sync(eff);
  }
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => doc.removeEventListener('visibilitychange', onVisibility));
  }

  function onReduced(e) {
    reduced = Boolean(e && e.matches);
    if (!reduced) return;
    for (const eff of [...effects]) {
      const el = eff.el;
      const wasHeader = eff === headerEffect;
      dispose(eff);
      setState(el, wasHeader ? 'static' : 'off');
    }
    hoverCard = null;
    focusCard = null;
  }
  if (reducedQuery && typeof reducedQuery.addEventListener === 'function') {
    reducedQuery.addEventListener('change', onReduced);
    cleanups.push(() => reducedQuery.removeEventListener('change', onReduced));
  }

  function attachHeader(el) {
    if (!el || destroyed) return;
    if (reduced || broken || !webgpuAvailable(win)) {
      setState(el, 'static');
      return;
    }
    const from = readVar(win, el, '--header-from') || TYPE_COLORS.plugin[scheme()].effect;
    const to = readVar(win, el, '--header-to') || TYPE_COLORS.skill[scheme()].effect;
    headerEffect = create(el, 'header', from, to);
  }

  function cardColor(card) {
    const own = readVar(win, card, '--type-color');
    if (own) return own;
    const t = TYPE_COLORS[card.getAttribute('data-type')];
    return t ? t[scheme()].effect : null;
  }

  function deactivateCard() {
    if (!cardEffect) return;
    const el = cardEffect.el;
    dispose(cardEffect);
    setState(el, 'off');
  }

  function activate(card) {
    if (destroyed || reduced || broken || !webgpuAvailable(win)) return;
    if (cardEffect && cardEffect.el === card) return;
    deactivateCard();
    const color = cardColor(card);
    if (!color) return;
    cardEffect = create(card, 'card', color, color);
  }

  const cardOf = (target) => {
    if (!target || typeof target.closest !== 'function') return null;
    const card = target.closest('[data-card]');
    return card && card.closest('[data-fx-cards]') ? card : null;
  };

  // After a leave, fall back to whatever still holds the pointer or focus.
  function settle() {
    if (cardEffect && (cardEffect.el === hoverCard || cardEffect.el === focusCard)) return;
    deactivateCard();
    const next = hoverCard || focusCard;
    if (next) activate(next);
  }

  function attachCards(container) {
    if (!container || destroyed) return;
    const on = (type, fn, capture) => {
      container.addEventListener(type, fn, capture);
      cleanups.push(() => container.removeEventListener(type, fn, capture));
    };
    // pointerenter and pointerleave do not bubble, so they are caught in the capture phase.
    on('pointerenter', (e) => { const c = cardOf(e.target); if (c && e.target === c) { hoverCard = c; activate(c); } }, true);
    on('pointerleave', (e) => { const c = cardOf(e.target); if (c && e.target === c) { if (hoverCard === c) hoverCard = null; settle(); } }, true);
    on('focusin', (e) => { const c = cardOf(e.target); if (c) { focusCard = c; activate(c); } }, false);
    on('focusout', (e) => { const c = cardOf(e.target); if (c) { if (focusCard === c) focusCard = null; settle(); } }, false);

    if (typeof win.MutationObserver === 'function') {
      try {
        const mo = new win.MutationObserver(() => {
          if (cardEffect && !cardEffect.el.isConnected) { hoverCard = null; focusCard = null; deactivateCard(); }
        });
        mo.observe(container, { childList: true, subtree: true });
        cleanups.push(() => mo.disconnect());
      } catch { /* the card is then released on the next hover */ }
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const eff of [...effects]) dispose(eff);
    for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* ignore */ } }
    if (io) { try { io.disconnect(); } catch { /* ignore */ } }
  }

  return { attachHeader, attachCards, destroy, liveCount: () => effects.size };
}
