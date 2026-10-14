// AC-54: when the effects bundle is blocked, or WebGPU is missing, search and the builder keep working,
// the static look stays and no error is shown. AC-57: no CSP violation while effects run.
import { test, expect } from '@playwright/test';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';
import { startServer, liveCanvases } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

test('AC-54: with the effects bundle blocked, search still works and no effect or error appears', async ({ page }) => {
  await stubWebGpu(page, true);
  let blocked = 0;
  await page.route('**/fx-entry*.js', (route) => { blocked += 1; return route.abort(); });
  await page.goto(server.url);
  await expect(page.locator('#q')).toBeVisible();
  await page.locator('#q').fill('skill');
  await expect(page.locator('[data-fx-cards] [data-card][data-type="skill"]').first()).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(liveCanvases(page)).toHaveCount(0);
  await expect(page.locator('#site-header')).not.toHaveAttribute('data-fx-state', 'on');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/effects? (failed|error)|webgpu/i);
});

test('AC-54: without WebGPU, search works and the static gradient stays', async ({ page }) => {
  await stubWebGpu(page, false);
  await page.goto(server.url);
  await expect(page.locator('#site-header')).toHaveAttribute('data-fx-state', 'static');
  await page.locator('#q').fill('agent');
  await expect(page.locator('[data-fx-cards] [data-card][data-type="agent"]').first()).toBeVisible();
  const bg = await page.locator('#site-header').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('linear-gradient');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});
