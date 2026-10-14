// Test double for webgpu-renderer.js: same factory shape, no GPU. It runs a real requestAnimationFrame
// loop while started, so a test can see frames stop when the effect is paused. It marks its canvas with
// data attributes (kind, colour, running) and records every call in win.__fxLog. The controller, not
// this file, owns data-fx-state on the header and cards.
//
// Used by unit tests directly and by the e2e build when SITE_FAKE_FX=1 (see fx-entry.js).

export function createRenderer({ canvas, kind, color, color2, win }) {
  const log = (win.__fxLog = win.__fxLog || []);
  const record = (call) => log.push({ kind, call, color });
  let raf = 0;
  let running = false;
  let destroyed = false;
  canvas.setAttribute('data-fx-kind', kind);
  canvas.setAttribute('data-fx-color', color);
  if (color2) canvas.setAttribute('data-fx-color2', color2);
  canvas.setAttribute('data-fx-running', '0');
  record('create');

  function frame() {
    raf = 0;
    if (!running || destroyed) return;
    const n = Number(canvas.getAttribute('data-fx-frames') || '0') + 1;
    canvas.setAttribute('data-fx-frames', String(n));
    raf = win.requestAnimationFrame(frame);
  }

  return {
    start() {
      if (destroyed || running) return;
      running = true;
      canvas.setAttribute('data-fx-running', '1');
      record('start');
      raf = win.requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      canvas.setAttribute('data-fx-running', '0');
      record('stop');
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
    },
    destroy() {
      if (destroyed) return;
      this.stop();
      destroyed = true;
      record('destroy');
    },
  };
}
