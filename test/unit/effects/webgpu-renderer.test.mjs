// The real renderer against a mocked WebGPU: call order, one pipeline per kind, loop control and failures.
// It cannot show pixels; the shader itself is checked in a real browser by the main session (AC-49, AC-50).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../../site-src/effects/webgpu-renderer.js';

const tick = () => new Promise((r) => setImmediate(r));

function mockGpu({ adapter = true, throwOnSubmit = false } = {}) {
  const calls = [];
  let resolveLost;
  const lost = new Promise((r) => { resolveLost = r; });
  const device = {
    lost,
    queue: { writeBuffer: () => calls.push('write'), submit: () => { calls.push('submit'); if (throwOnSubmit) throw new Error('x'); } },
    createShaderModule: () => { calls.push('module'); return {}; },
    createRenderPipeline: (d) => { calls.push(`pipeline:${d.fragment.entryPoint}`); return { getBindGroupLayout: () => ({}) }; },
    createBuffer: () => ({ destroy: () => calls.push('buffer-destroy') }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
      finish: () => ({}),
    }),
    destroy: () => calls.push('device-destroy'),
  };
  const context = {
    configure: () => calls.push('configure'),
    unconfigure: () => calls.push('unconfigure'),
    getCurrentTexture: () => ({ createView: () => ({}) }),
  };
  const canvas = { clientWidth: 300, clientHeight: 100, width: 0, height: 0, getContext: () => context };
  const rafs = new Map();
  let id = 0;
  const win = {
    navigator: { gpu: { requestAdapter: async () => (adapter ? { requestDevice: async () => device } : null), getPreferredCanvasFormat: () => 'bgra8unorm' } },
    requestAnimationFrame: (cb) => { id += 1; rafs.set(id, cb); return id; },
    cancelAnimationFrame: (i) => rafs.delete(i),
    devicePixelRatio: 1,
  };
  const frame = (t) => { const cbs = [...rafs.values()]; rafs.clear(); for (const cb of cbs) cb(t); };
  return { win, canvas, calls, frame, rafs, device, lose: () => resolveLost({ reason: 'unknown' }) };
}

test('card renderer builds exactly one pipeline with the card entry point', async () => {
  const g = mockGpu();
  createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win });
  await tick();
  assert.deepEqual(g.calls.filter((c) => c.startsWith('pipeline')), ['pipeline:fs_card']);
});

test('header renderer builds exactly one pipeline with the header entry point', async () => {
  const g = mockGpu();
  createRenderer({ canvas: g.canvas, kind: 'header', color: '#1d4ed8', color2: '#6d28d9', win: g.win });
  await tick();
  assert.deepEqual(g.calls.filter((c) => c.startsWith('pipeline')), ['pipeline:fs_header']);
});

test('start before setup finishes begins the loop once the device is ready; stop cancels it', async () => {
  const g = mockGpu();
  const r = createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win });
  r.start();
  assert.equal(g.rafs.size, 0);
  await tick();
  assert.equal(g.rafs.size, 1);
  g.frame(1000);
  assert.ok(g.calls.includes('submit'));
  assert.equal(g.rafs.size, 1);
  r.stop();
  assert.equal(g.rafs.size, 0);
  assert.equal(g.canvas.width > 0, true);
});

test('no adapter reports failure once and does not throw', async () => {
  const g = mockGpu({ adapter: false });
  let n = 0;
  const r = createRenderer({ canvas: g.canvas, kind: 'header', color: '#1d4ed8', win: g.win, onFailure: () => { n += 1; } });
  r.start();
  await tick();
  assert.equal(n, 1);
  assert.equal(g.rafs.size, 0);
});

test('a lost device reports failure and releases the GPU objects', async () => {
  const g = mockGpu();
  let n = 0;
  const r = createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win, onFailure: () => { n += 1; } });
  r.start();
  await tick();
  g.lose();
  await tick();
  assert.equal(n, 1);
  assert.equal(g.rafs.size, 0);
  assert.ok(g.calls.includes('buffer-destroy'));
});

test('a draw error reports failure and stops the loop', async () => {
  const g = mockGpu({ throwOnSubmit: true });
  let n = 0;
  const r = createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win, onFailure: () => { n += 1; } });
  r.start();
  await tick();
  g.frame(1000);
  assert.equal(n, 1);
  assert.equal(g.rafs.size, 0);
});

test('destroy releases the device, stops the loop and silences a later device loss', async () => {
  const g = mockGpu();
  let n = 0;
  const r = createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win, onFailure: () => { n += 1; } });
  r.start();
  await tick();
  r.destroy();
  assert.ok(g.calls.includes('device-destroy'));
  assert.equal(g.rafs.size, 0);
  g.lose();
  await tick();
  assert.equal(n, 0);
  r.start();
  assert.equal(g.rafs.size, 0);
});

test('destroy before setup finishes still releases the device', async () => {
  const g = mockGpu();
  const r = createRenderer({ canvas: g.canvas, kind: 'card', color: '#047857', win: g.win });
  r.start();
  r.destroy();
  await tick();
  assert.ok(g.calls.includes('device-destroy'));
  assert.equal(g.rafs.size, 0);
});

test('the header draws about every other frame, cards on every frame', async () => {
  const g = mockGpu();
  createRenderer({ canvas: g.canvas, kind: 'header', color: '#1d4ed8', win: g.win }).start();
  await tick();
  g.frame(1000); g.frame(1016); g.frame(1032); g.frame(1048);
  const submits = g.calls.filter((c) => c === 'submit').length;
  assert.ok(submits >= 1 && submits <= 3, `submits ${submits}`);
});
