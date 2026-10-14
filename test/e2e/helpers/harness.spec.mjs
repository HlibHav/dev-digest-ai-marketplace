// Smoke test for the e2e harness itself: same-origin server, request log and page stubs in real Chromium.
import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { netLog } from './net-log.mjs';
import { stubWebGpu, countRaf, setHidden } from './fx-stubs.mjs';

const PAGE = `<!doctype html><meta charset="utf-8"><title>harness</title>
<h1 id="t">harness</h1>
<script>
  window.__ticks = 0;
  (function loop() { window.__ticks += 1; requestAnimationFrame(loop); })();
</script>`;

let dir;
let server;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(join(dir, 'index.html'), PAGE);
  server = await serve(dir);
});

test.afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('serve + netLog: a same-origin page makes no off-origin request', async ({ page }) => {
  const log = netLog(page);
  await page.goto(server.url);
  await expect(page.locator('#t')).toHaveText('harness');
  expect(log.requests.length).toBeGreaterThan(0);
  expect(log.offOrigin()).toEqual([]);
});

test('stubWebGpu switches navigator.gpu on and off', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  expect(await page.evaluate(() => Boolean(navigator.gpu))).toBe(true);
  await stubWebGpu(page, false);
  await page.goto(server.url);
  expect(await page.evaluate(() => navigator.gpu === undefined)).toBe(true);
});

test('countRaf counts frames and setHidden fires visibilitychange', async ({ page }) => {
  const raf = await countRaf(page);
  await page.goto(server.url);
  await expect.poll(() => raf.count()).toBeGreaterThan(2);
  await raf.reset();
  expect(await raf.count()).toBeLessThan(3);
  await page.evaluate(() => {
    window.__vis = [];
    document.addEventListener('visibilitychange', () => window.__vis.push(document.hidden));
  });
  await setHidden(page, true);
  await setHidden(page, false);
  expect(await page.evaluate(() => window.__vis)).toEqual([true, false]);
});
