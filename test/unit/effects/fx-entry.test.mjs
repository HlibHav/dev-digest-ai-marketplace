// AC-54: startEffects wires the controller and never throws to its caller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEffects } from '../../../site-src/effects/fx-entry.js';
import { makePage, makeWin } from './fake-win.mjs';

test('AC-54: without WebGPU the header gets "static" and startEffects resolves', async () => {
  const page = makePage();
  const win = makeWin(page, { gpu: false });
  await startEffects({ root: page.doc, win });
  assert.equal(page.header.getAttribute('data-fx-state'), 'static');
});

test('AC-49 and AC-54: with a WebGPU stub the header starts "on", and a missing adapter later ends in "static"', async () => {
  const page = makePage();
  const win = makeWin(page, { gpu: true });
  win.navigator.gpu = { requestAdapter: async () => null, getPreferredCanvasFormat: () => 'bgra8unorm' };
  win.requestAnimationFrame = () => 1;
  win.cancelAnimationFrame = () => {};
  await startEffects({ root: page.doc, win });
  assert.equal(page.header.getAttribute('data-fx-state'), 'on');
  assert.equal(page.header.querySelectorAll('[data-fx-canvas]').length, 1);
  await new Promise((r) => setImmediate(r));
  assert.equal(page.header.getAttribute('data-fx-state'), 'static');
  assert.equal(page.header.querySelectorAll('[data-fx-canvas]').length, 0);
});

test('AC-54: bad input never makes startEffects reject', async () => {
  await assert.doesNotReject(() => startEffects());
  await assert.doesNotReject(() => startEffects({ root: {}, win: {} }));
  await assert.doesNotReject(() => startEffects({ root: null, win: { document: null } }));
});
