// Playwright globalSetup: build the fixture site once; workers inherit E2E_SITE_READY.
import { buildFixtureSite } from './build-fixture-site.mjs';

export default function globalSetup() {
  buildFixtureSite({ force: true });
  process.env.E2E_SITE_READY = '1';
}
