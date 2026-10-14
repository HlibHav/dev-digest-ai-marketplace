// AC-49 to AC-54: the effects controller, with an injected renderer and a fake window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../site-src/effects/controller.js';
import { makePage, makeWin, makeFactory } from './fake-win.mjs';

const canvases = (root) => root.querySelectorAll('[data-fx-canvas]');
const state = (el) => el.getAttribute('data-fx-state');

function setup(winOpts = {}, factoryOpts = {}, pageOpts = {}) {
  const page = makePage(pageOpts);
  const win = makeWin(page, winOpts);
  const factory = makeFactory(factoryOpts);
  const ctl = createController({ win, createRenderer: factory.create, maxCanvases: 2 });
  return { page, win, factory, ctl };
}

test('AC-49: with WebGPU and motion allowed the header effect is on, with one started canvas', () => {
  const { page, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  assert.equal(state(page.header), 'on');
  assert.equal(canvases(page.header).length, 1);
  assert.equal(factory.instances.length, 1);
  assert.equal(factory.instances[0].opts.kind, 'header');
  assert.deepEqual(factory.instances[0].calls, ['start']);
  assert.equal(page.header.firstChild.getAttribute('aria-hidden'), 'true');
});

test('AC-49: the header palette comes from the page tokens', () => {
  const { page, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  assert.equal(factory.instances[0].opts.color, '#1d4ed8');
  assert.equal(factory.instances[0].opts.color2, '#6d28d9');
});

test('the header reads the middle of its colour ramp too, and passes it as color3', () => {
  const { page, factory, ctl } = setup();
  page.header.cssVars['--header-mid'] = '#445566';
  ctl.attachHeader(page.header);
  assert.equal(factory.instances[0].opts.color3, '#445566');
});

test('without --header-mid the header passes no color3 and the renderer picks the middle itself', () => {
  const { page, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  assert.equal(factory.instances[0].opts.color3, undefined);
});

test('AC-49: without WebGPU the header is static, with no canvas and no renderer', () => {
  const { page, factory, ctl } = setup({ gpu: false });
  ctl.attachHeader(page.header);
  assert.equal(state(page.header), 'static');
  assert.equal(canvases(page.header).length, 0);
  assert.equal(factory.instances.length, 0);
});

test('AC-50: hover turns the card effect on in the card colour and leaving turns it off', () => {
  const { page, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  const [a, b] = page.cards;
  a.fire('pointerenter');
  assert.equal(state(a), 'on');
  assert.equal(canvases(a).length, 1);
  assert.equal(factory.instances[0].opts.kind, 'card');
  assert.equal(factory.instances[0].opts.color, '#1d4ed8');
  a.fire('pointerleave');
  assert.equal(state(a), 'off');
  assert.equal(canvases(a).length, 0);
  assert.equal(factory.instances[0].destroyed, true);
  b.fire('pointerenter');
  assert.equal(factory.instances[1].opts.color, '#6d28d9');
});

test('AC-50: keyboard focus drives the card effect like hover', () => {
  const { page, ctl } = setup();
  ctl.attachCards(page.doc);
  const card = page.cards[2];
  const inner = card; // focus events bubble from inside the card in the page
  inner.fire('focusin', true);
  assert.equal(state(card), 'on');
  inner.fire('focusout', true);
  assert.equal(state(card), 'off');
});

test('AC-50: the colour of each of the six types is read from its own --type-color', () => {
  const { page, factory, ctl } = setup({}, {}, { cards: 6 });
  ctl.attachCards(page.doc);
  for (const c of page.cards) { c.fire('pointerenter'); c.fire('pointerleave'); }
  const colors = factory.instances.map((i) => i.opts.color);
  assert.equal(new Set(colors).size, 6);
});

test('AC-50: a card that is hovered and focused stays on until both leave', () => {
  const { page, ctl } = setup();
  ctl.attachCards(page.doc);
  const card = page.cards[0];
  card.fire('pointerenter');
  card.fire('focusin', true);
  card.fire('pointerleave');
  assert.equal(state(card), 'on');
  card.fire('focusout', true);
  assert.equal(state(card), 'off');
});

test('AC-50: the colour falls back to the type colour module when --type-color is unusable', () => {
  const { page, factory, ctl } = setup();
  page.cards[1].cssVars = {};
  ctl.attachCards(page.doc);
  page.cards[1].fire('pointerenter');
  assert.match(factory.instances[0].opts.color, /^#[0-9a-f]{6}$/i);
});

test('AC-50: an element that is not inside [data-fx-cards] is ignored', () => {
  const { page, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  page.list.children[0].remove();
  const stray = page.cards[0];
  page.doc.append(stray);
  stray.fire('pointerenter');
  assert.equal(factory.instances.length, 0);
});

test('AC-51: moving across ten cards never leaves more than 2 canvases or 2 live renderers', () => {
  const { page, factory, ctl } = setup({}, {}, { cards: 10 });
  ctl.attachHeader(page.header);
  ctl.attachCards(page.doc);
  let max = 0;
  for (const c of page.cards) {
    c.fire('pointerenter');
    max = Math.max(max, canvases(page.doc).length, factory.live().length);
  }
  assert.ok(max <= 2, `max ${max}`);
  assert.equal(canvases(page.doc).length, 2);
  assert.equal(factory.live().length, 2);
  assert.equal(ctl.liveCount(), 2);
});

test('AC-51: a new card stops and removes the previous card effect before the next starts', () => {
  const { page, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  const [a, b] = page.cards;
  a.fire('pointerenter');
  b.fire('pointerenter');
  assert.equal(state(a), 'off');
  assert.equal(canvases(a).length, 0);
  assert.equal(state(b), 'on');
  assert.deepEqual(factory.instances[0].calls, ['start', 'stop', 'destroy']);
});

test('AC-51: a card removed from the page while active releases its renderer', () => {
  const { page, win, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  page.cards[0].remove();
  win.mutationObservers[0].trigger();
  assert.equal(factory.live().length, 0);
  assert.equal(ctl.liveCount(), 0);
});

test('AC-52: hiding the tab stops every running effect and showing it starts them again', () => {
  const { page, win, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  assert.ok(factory.instances.every((i) => i.running));
  win.setHidden(true);
  assert.ok(factory.instances.every((i) => !i.running));
  win.setHidden(false);
  assert.ok(factory.instances.every((i) => i.running));
});

test('AC-52: an effect created while the tab is hidden does not start until it is shown', () => {
  const { page, win, factory, ctl } = setup();
  win.document.hidden = true;
  ctl.attachHeader(page.header);
  assert.equal(factory.instances[0].running, false);
  win.setHidden(false);
  assert.equal(factory.instances[0].running, true);
});

test('AC-52: a canvas that leaves the viewport pauses and resumes on return', () => {
  const { page, win, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  const canvas = canvases(page.header)[0];
  const io = win.observers[0];
  io.set(canvas, false);
  assert.equal(factory.instances[0].running, false);
  assert.equal(state(page.header), 'on');
  io.set(canvas, true);
  assert.equal(factory.instances[0].running, true);
});

test('AC-52: without IntersectionObserver the effect still runs', () => {
  const { page, factory, ctl } = setup({ observers: false });
  ctl.attachHeader(page.header);
  assert.equal(factory.instances[0].running, true);
});

test('AC-53: reduced motion makes the header static and starts nothing', () => {
  const { page, factory, ctl } = setup({ reduced: true });
  ctl.attachHeader(page.header);
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  assert.equal(state(page.header), 'static');
  assert.equal(canvases(page.doc).length, 0);
  assert.equal(factory.instances.length, 0);
  assert.equal(state(page.cards[0]), null);
});

test('AC-53: reduced motion switched on later tears every effect down', () => {
  const { page, win, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  win.setReduced(true);
  assert.equal(canvases(page.doc).length, 0);
  assert.equal(state(page.header), 'static');
  assert.equal(factory.live().length, 0);
  page.cards[1].fire('pointerenter');
  assert.equal(factory.instances.length, 2);
});

test('AC-54: a renderer that fails to initialise leaves a static header and does not throw', () => {
  const { page, ctl } = setup({}, { failCreate: true });
  assert.doesNotThrow(() => ctl.attachHeader(page.header));
  assert.equal(state(page.header), 'static');
  assert.equal(canvases(page.header).length, 0);
});

test('AC-54: a renderer whose start throws is torn down to the static look', () => {
  const { page, factory, ctl } = setup({}, { failStart: true });
  assert.doesNotThrow(() => ctl.attachHeader(page.header));
  assert.equal(state(page.header), 'static');
  assert.equal(factory.live().length, 0);
});

test('AC-54: a device lost after start falls back to static and removes the canvas', () => {
  const { page, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  factory.instances[0].opts.onFailure('device-lost');
  assert.equal(state(page.header), 'static');
  assert.equal(canvases(page.header).length, 0);
  assert.equal(factory.instances[0].destroyed, true);
});

test('AC-54: a card failure shows static on that card and later cards get no effect', () => {
  const { page, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  factory.instances[0].opts.onFailure('device-lost');
  assert.equal(state(page.cards[0]), 'static');
  assert.equal(canvases(page.doc).length, 0);
  page.cards[1].fire('pointerenter');
  assert.equal(factory.instances.length, 1);
  assert.equal(state(page.cards[1]), null);
});

test('AC-54: a failure report that arrives after teardown is ignored', () => {
  const { page, factory, ctl } = setup();
  ctl.attachCards(page.doc);
  const [a, b] = page.cards;
  a.fire('pointerenter');
  b.fire('pointerenter');
  factory.instances[0].opts.onFailure('late');
  assert.equal(state(b), 'on');
  assert.equal(canvases(b).length, 1);
});

test('AC-54: the controller never writes to the console', () => {
  const calls = [];
  const saved = {};
  for (const m of ['log', 'warn', 'error', 'info', 'debug']) {
    saved[m] = console[m];
    console[m] = (...a) => calls.push([m, a]);
  }
  try {
    const { page, factory, ctl } = setup({}, { failCreate: true });
    ctl.attachHeader(page.header);
    ctl.attachCards(page.doc);
    page.cards[0].fire('pointerenter');
    assert.equal(factory.instances.length, 0);
  } finally {
    Object.assign(console, saved);
  }
  assert.deepEqual(calls, []);
});

test('destroy removes canvases, listeners and renderers', () => {
  const { page, factory, ctl } = setup();
  ctl.attachHeader(page.header);
  ctl.attachCards(page.doc);
  page.cards[0].fire('pointerenter');
  ctl.destroy();
  assert.equal(canvases(page.doc).length, 0);
  assert.equal(factory.live().length, 0);
  page.cards[1].fire('pointerenter');
  assert.equal(factory.instances.length, 2);
});
