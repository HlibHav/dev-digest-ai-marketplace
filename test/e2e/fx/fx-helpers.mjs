// Shared helpers for the effects e2e specs. They run against the fixture site built with SITE_FAKE_FX=1,
// where the fake renderer stands in for WebGPU (it marks canvases with data-fx-* attributes).
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';

export const TYPES = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp_server'];

export async function startServer() {
  return serve(buildFixtureSite());
}

/** Appends n cards (types cycle through all six) to [data-fx-cards]; each holds one button to focus. */
export async function injectCards(page, n) {
  await page.evaluate(({ count, types }) => {
    const list = document.querySelector('[data-fx-cards]');
    for (let i = 0; i < count; i += 1) {
      const li = document.createElement('li');
      li.className = 'card';
      li.setAttribute('data-card', '');
      li.setAttribute('data-fx-test', String(i));
      li.setAttribute('data-type', types[i % types.length]);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `card ${i}`;
      li.append(b);
      list.append(li);
    }
  }, { count: n, types: TYPES });
}

export const cardLocator = (page, i) => page.locator(`[data-fx-test="${i}"]`);
export const liveCanvases = (page) => page.locator('canvas[data-fx-canvas]');
export const headerLocator = (page) => page.locator('#site-header[data-fx-header]');
