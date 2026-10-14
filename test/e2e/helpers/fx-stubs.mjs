// Page-level stubs for the effects tests. Call them before page.goto().

/** Makes navigator.gpu look present (on) or absent (off). */
export async function stubWebGpu(page, on) {
  await page.addInitScript((enabled) => {
    window.__fxWebGpuStub = enabled;
    const gpu = enabled
      ? {
          requestAdapter: async () => ({ requestDevice: async () => ({}) }),
          getPreferredCanvasFormat: () => 'bgra8unorm',
        }
      : undefined;
    Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true });
  }, on);
}

/** Counts requestAnimationFrame callbacks that actually ran. Returns { count(), reset() }. */
export async function countRaf(page) {
  await page.addInitScript(() => {
    window.__rafCount = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      window.__rafCount += 1;
      return cb(t);
    });
  });
  return {
    count: () => page.evaluate(() => window.__rafCount ?? 0),
    reset: () => page.evaluate(() => { window.__rafCount = 0; }),
  };
}

/** Emulates the tab being hidden or visible and fires visibilitychange. */
export async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
