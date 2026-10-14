// The fake renderer must behave like the real one for the e2e build (AC-52 frame counting).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../../site-src/effects/fake-renderer.js';
import { FakeEl } from './fake-win.mjs';

function rafWin() {
  const pending = new Map();
  let id = 0;
  return {
    requestAnimationFrame: (cb) => { id += 1; pending.set(id, cb); return id; },
    cancelAnimationFrame: (i) => pending.delete(i),
    tick() { const cbs = [...pending.values()]; pending.clear(); for (const cb of cbs) cb(0); },
    pending: () => pending.size,
  };
}

test('fake renderer: frames run only between start and stop, and every call is recorded', () => {
  const win = rafWin();
  const canvas = new FakeEl('canvas');
  const r = createRenderer({ canvas, kind: 'card', color: '#047857', win });
  assert.equal(canvas.getAttribute('data-fx-running'), '0');
  r.start();
  win.tick(); win.tick();
  assert.equal(canvas.getAttribute('data-fx-frames'), '2');
  assert.equal(canvas.getAttribute('data-fx-running'), '1');
  r.stop();
  win.tick();
  assert.equal(canvas.getAttribute('data-fx-frames'), '2');
  assert.equal(win.pending(), 0);
  r.destroy();
  r.start();
  assert.equal(win.pending(), 0);
  assert.deepEqual(win.__fxLog.map((l) => l.call), ['create', 'start', 'stop', 'destroy']);
  assert.equal(canvas.getAttribute('data-fx-color'), '#047857');
});
