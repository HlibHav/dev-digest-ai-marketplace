// AC-52: the render loop pauses while the tab is hidden or the canvas is out of the viewport.
import { test, expect } from '@playwright/test';
import { stubWebGpu, countRaf, setHidden } from '../helpers/fx-stubs.mjs';
import { startServer, headerLocator } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

const frames = (page) => page.locator('#site-header canvas[data-fx-canvas]').getAttribute('data-fx-frames').then((v) => Number(v ?? 0));
const settle = (page) => page.waitForTimeout(300);

async function growing(page) {
  const before = await frames(page);
  await expect.poll(async () => (await frames(page)) > before).toBe(true);
}

async function stopped(page) {
  await settle(page);
  const a = await frames(page);
  await settle(page);
  expect(await frames(page)).toBe(a);
}

test('AC-52: frame callbacks stop when the tab is hidden and resume when it is shown', async ({ page }) => {
  await stubWebGpu(page, true);
  const raf = await countRaf(page);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await growing(page);
  await setHidden(page, true);
  await settle(page);
  await raf.reset();
  await page.waitForTimeout(400);
  expect(await raf.count()).toBe(0);
  await stopped(page);
  await setHidden(page, false);
  await growing(page);
});

test('AC-52: the header loop pauses when its canvas scrolls out of the viewport', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await growing(page);
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '6000px';
    document.body.append(spacer);
    window.scrollTo(0, 5000);
  });
  await expect(page.locator('#site-header canvas[data-fx-canvas]')).toHaveAttribute('data-fx-running', '0');
  await stopped(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#site-header canvas[data-fx-canvas]')).toHaveAttribute('data-fx-running', '1');
  await growing(page);
});
