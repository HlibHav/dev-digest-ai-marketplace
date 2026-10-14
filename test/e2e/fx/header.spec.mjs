// AC-49: header effect with WebGPU (stubbed on), static gradient without it. AC-57: no CSP violation, no off-origin request.
import { test, expect } from '@playwright/test';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';
import { netLog } from '../helpers/net-log.mjs';
import { startServer, headerLocator, liveCanvases } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

test('AC-49: WebGPU present and motion allowed gives an "on" header with one canvas', async ({ page }) => {
  await stubWebGpu(page, true);
  const messages = [];
  page.on('console', (m) => messages.push(m.text()));
  page.on('pageerror', (e) => messages.push(String(e)));
  const log = netLog(page);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await expect(liveCanvases(page)).toHaveCount(1);
  await expect(headerLocator(page).locator('canvas[data-fx-canvas]')).toHaveAttribute('data-fx-kind', 'header');
  expect(messages.filter((t) => /content security policy|refused to/i.test(t))).toEqual([]);
  expect(log.offOrigin()).toEqual([]);
});

test('AC-49: WebGPU absent gives a "static" header and no canvas anywhere', async ({ page }) => {
  await stubWebGpu(page, false);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'static');
  await expect(liveCanvases(page)).toHaveCount(0);
});
