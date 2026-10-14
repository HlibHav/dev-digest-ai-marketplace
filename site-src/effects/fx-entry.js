// Effects entry, loaded lazily after the static list and search are interactive (AC-54).
//
//   startEffects({ root, win }) -> Promise<void>     never rejects, never logs
//
// root is the document (or any element holding [data-fx-header] and [data-fx-cards]); win is the window.
//
// Renderer swap for tests (wired by the site bundler, lane 6): this file imports the real renderer from
// './webgpu-renderer.js'. When the build runs with SITE_FAKE_FX=1 the bundler replaces that one import
// with './fake-renderer.js' (an esbuild onResolve plugin matching the path ending in
// "effects/webgpu-renderer.js"). Both modules export the same createRenderer. The default build never
// contains the fake, and a test proves it.
import { createController } from './controller.js';
import { createRenderer } from './webgpu-renderer.js';

export async function startEffects({ root, win } = {}) {
  try {
    const w = win || globalThis.window;
    const r = root || w.document;
    const controller = createController({ win: w, createRenderer, maxCanvases: 2 });
    const header = r.querySelector('[data-fx-header]');
    if (header) controller.attachHeader(header);
    controller.attachCards(r);
  } catch {
    // Effects are decoration. Whatever fails here leaves the static look in place.
  }
}
