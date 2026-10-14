// The project's own WebGPU effects (no effect library; see the ADR 2026-10-14-own-webgpu-effects).
// One full-screen triangle and one render pipeline per effect kind:
//   header: a slow noise gradient between two palette colours,
//   card:   a soft glow in the card's type colour, drifting around the card.
// The shader source is a constant in this file. This module makes no network call and starts no worker.
//
//   createRenderer({ canvas, kind, color, color2, win, onFailure }) -> { start(), stop(), destroy() }
//
// Setup is asynchronous. start() and stop() may be called before it finishes; the loop begins when the
// device is ready. A failed setup, a shader or validation error, or a lost device calls onFailure once.

const WGSL = /* wgsl */ `
struct Params {
  a: vec4f,   // x: seconds, y: aspect ratio
  c1: vec4f,
  c2: vec4f,
}
@group(0) @binding(0) var<uniform> u: Params;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var q = p;
  for (var k = 0; k < 4; k = k + 1) {
    v = v + amp * vnoise(q);
    q = q * 2.02 + vec2f(17.0, 9.0);
    amp = amp * 0.5;
  }
  return v;
}

@fragment
fn fs_header(inp: VOut) -> @location(0) vec4f {
  let t = u.a.x * 0.04;
  let p = vec2f(inp.uv.x * u.a.y, inp.uv.y) * 1.6;
  let q = vec2f(fbm(p + vec2f(t, 0.0)), fbm(p + vec2f(5.2, 1.3 - t)));
  let n = fbm(p + 2.0 * q + vec2f(0.0, t));
  let base = mix(u.c1.rgb, u.c2.rgb, smoothstep(0.25, 0.75, n));
  let lift = smoothstep(0.55, 0.9, q.x) * 0.18;
  return vec4f(base + vec3f(lift), 1.0);
}

@fragment
fn fs_card(inp: VOut) -> @location(0) vec4f {
  let t = u.a.x * 0.5;
  let c = vec2f(0.5 + 0.28 * sin(t), 0.5 + 0.22 * cos(t * 0.8));
  let d = (inp.uv - c) * vec2f(u.a.y, 1.0);
  let g = exp(-dot(d, d) * 5.0);
  let e = min(min(inp.uv.x, 1.0 - inp.uv.x), min(inp.uv.y, 1.0 - inp.uv.y));
  let rim = exp(-e * 14.0) * (0.55 + 0.25 * sin(t * 1.7));
  let a = clamp(g * 0.85 + rim * 0.5, 0.0, 1.0);
  return vec4f(u.c1.rgb * a, a);
}
`;

// WebGPU usage flags, used when the window does not expose the global enum.
const USAGE_UNIFORM = 0x40;
const USAGE_COPY_DST = 0x08;

function rgb(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function createRenderer({ canvas, kind, color, color2, win, onFailure }) {
  let destroyed = false;
  let failed = false;
  let wantRunning = false;
  let ready = false;
  let raf = 0;
  let elapsed = 0;
  let last = 0;
  let sinceDraw = 0;
  let device = null;
  let context = null;
  let pipeline = null;
  let buffer = null;
  let bindGroup = null;
  const params = new Float32Array(12);
  const c1 = rgb(color);
  const c2 = rgb(color2 || color);
  params.set([0, 1, 0, 0, c1[0], c1[1], c1[2], 1, c2[0], c2[1], c2[2], 1]);

  function fail() {
    if (failed || destroyed) return;
    failed = true;
    release();
    if (typeof onFailure === 'function') {
      try { onFailure(); } catch { /* the controller never throws back */ }
    }
  }

  function release() {
    wantRunning = false;
    ready = false;
    if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
    try { buffer && buffer.destroy(); } catch { /* already gone */ }
    try { context && context.unconfigure(); } catch { /* already gone */ }
    try { device && device.destroy(); } catch { /* already gone */ }
    buffer = null; bindGroup = null; pipeline = null; context = null; device = null;
  }

  async function init() {
    const gpu = win.navigator.gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    const dev = await adapter.requestDevice();
    if (destroyed) { try { dev.destroy(); } catch { /* ignore */ } return; }
    device = dev;
    device.lost.then(() => { if (!destroyed) fail(); });
    device.onuncapturederror = (e) => {
      try { e.preventDefault(); } catch { /* ignore */ }
      fail();
    };
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('no context');
    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const module = device.createShaderModule({ code: WGSL });
    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: kind === 'card' ? 'fs_card' : 'fs_header', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const usage = win.GPUBufferUsage || {};
    buffer = device.createBuffer({ size: params.byteLength, usage: (usage.UNIFORM ?? USAGE_UNIFORM) | (usage.COPY_DST ?? USAGE_COPY_DST) });
    bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
    ready = true;
    if (wantRunning) schedule();
  }

  function size() {
    // The header is slow and soft, so it renders at half resolution; cards cap at 1x.
    const scale = kind === 'header' ? 0.5 : Math.min(win.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.min(2048, Math.round((canvas.clientWidth || 1) * scale)));
    const h = Math.max(1, Math.min(2048, Math.round((canvas.clientHeight || 1) * scale)));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return w / h;
  }

  function draw() {
    params[0] = elapsed;
    params[1] = size();
    device.queue.writeBuffer(buffer, 0, params);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function frame(now) {
    raf = 0;
    if (!wantRunning || !ready || destroyed) return;
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    elapsed += dt / 1000;
    sinceDraw += dt;
    try {
      // The header moves slowly, so about 30 frames a second is enough.
      if (kind !== 'header' || sinceDraw >= 30) { draw(); sinceDraw = 0; }
    } catch {
      fail();
      return;
    }
    schedule();
  }

  function schedule() {
    if (!raf && !destroyed && !failed) raf = win.requestAnimationFrame(frame);
  }

  try {
    init().catch(() => fail());
  } catch {
    fail();
  }

  return {
    start() {
      if (destroyed || failed) return;
      wantRunning = true;
      last = 0;
      if (ready) schedule();
    },
    stop() {
      wantRunning = false;
      if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
    },
  };
}
