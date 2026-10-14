// The one list of paths that feed the built site. The pages workflow's
// `paths:` trigger must carry every entry (asserted by
// test/integration/ci/triggers.test.mjs), so a source change redeploys the site.
export const INDEXED_SOURCE_GLOBS = Object.freeze([
  '.claude-plugin/marketplace.json',
  'plugins/**',
  'data/**',
  'site-src/**',
  'scripts/**',
  'package.json',
  'package-lock.json',
  '.github/workflows/pages.yml',
]);
