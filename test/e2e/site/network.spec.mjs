// AC-8: load, search, build an install and hover cards. Every request is same-origin, no securitypolicyviolation
// event fires and no console message reports a CSP problem. The effects run (WebGPU stubbed on, fake renderer).
import { test, expect } from '@playwright/test';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';
import { netLog } from '../helpers/net-log.mjs';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';

let server;

test.beforeAll(async () => {
  server = await serve(buildFixtureSite());
});

test.afterAll(async () => {
  await server.close();
});

test('AC-8: a full session makes only same-origin requests and no CSP violation', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const log = netLog(page, { origin: server.url });
  const consoleProblems = [];
  page.on('console', (m) => {
    if (/content security policy|refused to|violat/i.test(m.text())) consoleProblems.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(server.url);
  await expect(page.locator('#q')).toBeVisible();

  // The CSP is delivered as a meta tag in the page head.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");

  // Search.
  await page.locator('#q').fill('skill');
  const card = page.locator('[data-fx-cards] [data-card][data-type="skill"]').first();
  await expect(card).toBeVisible();

  // Effects: header effect started and a card effect on hover.
  await expect(page.locator('#site-header')).toHaveAttribute('data-fx-state', 'on');
  await card.hover();
  await expect(card).toHaveAttribute('data-fx-state', 'on');
  await page.locator('[data-fx-cards] [data-card]').nth(1).hover();

  // Install builder.
  const box = page.locator('#builder input[type="checkbox"]').first();
  await box.check();
  await expect(page.locator('#builder button').first()).toBeVisible();

  // Index and assets were requested, all from this origin.
  expect(log.requests.some((u) => /\/index\.json\?v=[0-9a-f]{8}$/.test(u))).toBe(true);
  expect(log.requests.some((u) => /\/assets\/app-[A-Za-z0-9]+\.js$/.test(u))).toBe(true);
  expect(log.requests.some((u) => /\/assets\/fx-entry-[A-Za-z0-9]+\.js$/.test(u))).toBe(true);
  expect(log.offOrigin()).toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(consoleProblems).toEqual([]);
  expect(pageErrors).toEqual([]);
});
