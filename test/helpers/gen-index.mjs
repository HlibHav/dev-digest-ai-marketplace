// Deterministic synthetic index sized to a gzip budget, for the size and performance checks.
import { gzipSync } from 'node:zlib';
import { MARKETPLACE, REPO, SCHEMA_VERSION, TYPES } from '../../site-src/contract/index-contract.js';

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function makeWord(rand) {
  const len = 3 + Math.floor(rand() * 8);
  let w = '';
  for (let i = 0; i < len; i += 1) w += LETTERS[Math.floor(rand() * 26)];
  return w;
}

function makeText(rand, chars) {
  let s = '';
  while (s.length < chars) s += `${makeWord(rand)} `;
  return s.slice(0, chars).trim();
}

const PLUGIN_COUNT = 25;
const ARTIFACT_TYPES = TYPES.filter((t) => t !== 'plugin');

function build(artifactCount) {
  const rand = prng(20261014);
  const install = (n) => [`/plugin marketplace add ${REPO}`, `/plugin install ${n}@${MARKETPLACE}`];
  const plugins = [];
  for (let i = 0; i < PLUGIN_COUNT; i += 1) {
    const name = `gen-plugin-${String(i).padStart(2, '0')}`;
    plugins.push({
      name,
      version: '1.0.0',
      description: makeText(rand, 80),
      category: 'generated',
      tags: ['generated'],
      dependencies: [],
      install_commands: install(name),
      trust: { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] },
      cost: {
        always_loaded_tokens: 0, on_invocation_tokens: 0,
        method: 'characters / 4, rounded up', excluded: ['hook output', 'MCP tool descriptions and results'],
      },
    });
  }
  const artifacts = [];
  for (let i = 0; i < artifactCount; i += 1) {
    const plugin = plugins[i % PLUGIN_COUNT].name;
    const type = ARTIFACT_TYPES[i % ARTIFACT_TYPES.length];
    artifacts.push({
      type,
      name: `/${plugin}:${makeWord(rand)}-${i}`,
      plugin,
      description: makeText(rand, 120),
      body_excerpt: makeText(rand, 4000),
      source_path: `plugins/${plugin}/generated/${i}.md`,
      install_commands: install(plugin),
    });
  }
  return { schema_version: SCHEMA_VERSION, marketplace: MARKETPLACE, plugins, artifacts };
}

const gzipSize = (index) => gzipSync(Buffer.from(`${JSON.stringify(index)}\n`)).length;

/** Largest generated index whose compact JSON gzips to at most `gzipBytes`. */
export function genIndexAtBudget(gzipBytes) {
  let lo = 0;
  let hi = 1;
  while (gzipSize(build(hi)) <= gzipBytes) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (gzipSize(build(mid)) <= gzipBytes) lo = mid;
    else hi = mid;
  }
  return build(lo);
}
