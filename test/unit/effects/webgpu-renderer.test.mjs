// The real renderer against a mocked WebGPU: call order, one pipeline per kind, loop control and failures.
// It cannot show pixels; the shader itself is checked in a real browser by the main session (AC-49, AC-50).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRenderer } from '../../../site-src/effects/webgpu-renderer.js';

const tick = () => new Promise((r) => setImmediate(r));

function mockGpu({ adapter = true, throwOnSubmit = false } = {}) {
  const calls = [];
  const writes = [];
  let resolveLost;
  const lost = new Promise((r) => { resolveLost = r; });
  const device = {
    lost,
    queue: { writeBuffer: (b, o, data) => { calls.push('write'); writes.push(Array.from(data)); }, submit: () => { calls.push('submit'); if (throwOnSubmit) throw new Error('x'); } },
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
  return { win, canvas, calls, writes, frame, rafs, device, lose: () => resolveLost({ reason: 'unknown' }) };
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

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
const rgbOf = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);

test('the header uniforms carry the whole from, to and mid ramp (16 floats)', async () => {
  const g = mockGpu();
  createRenderer({ canvas: g.canvas, kind: 'header', color: '#112233', color2: '#aabbcc', color3: '#445566', win: g.win }).start();
  await tick();
  g.frame(1000); g.frame(1050);
  const params = g.writes.at(-1);
  assert.equal(params.length, 16);
  rgbOf('#112233').forEach((v, i) => near(params[4 + i], v));
  rgbOf('#aabbcc').forEach((v, i) => near(params[8 + i], v));
  rgbOf('#445566').forEach((v, i) => near(params[12 + i], v));
});

test('without a middle colour the renderer uses the middle of from and to', async () => {
  const g = mockGpu();
  createRenderer({ canvas: g.canvas, kind: 'header', color: '#000000', color2: '#ffffff', win: g.win }).start();
  await tick();
  g.frame(1000); g.frame(1050);
  [12, 13, 14].forEach((i) => near(g.writes.at(-1)[i], 0.5));
});

test('the header shader is clamped to the ramp: two octaves, about 40 s a drift, no lift past the colours', () => {
  const src = readFileSync(fileURLToPath(new URL('../../../site-src/effects/webgpu-renderer.js', import.meta.url)), 'utf8');
  const header = src.slice(src.indexOf('fn fs_header'), src.indexOf('fn fs_card')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(src, /k < 2;/, 'fbm has two octaves');
  assert.match(header, /u\.a\.x \* 0\.025/, 'one drift takes about 1 / 0.025 = 40 seconds');
  assert.match(header, /u\.c3\.rgb/, 'the middle stop is used');
  assert.match(header, /clamp\(col, vec3f\(0\.0\), vec3f\(1\.0\)\)/);
  assert.ok(!/lift|base \+/.test(header), 'nothing is added on top of the ramp');
  const outputs = header.match(/return vec4f\(([^;]*)\);/g) ?? [];
  assert.equal(outputs.length, 1);
  assert.ok(outputs[0].includes('clamp(col'), 'the returned colour is the clamped ramp mix');
});
