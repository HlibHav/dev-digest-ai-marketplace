# Effects spike: `shaders` 4.0.4

Step 20 of `docs/plans/2026-10-14-catalog-search.md`. Everything below was read from the installed
package or measured with esbuild 0.28.2 on Node 24. Paths are relative to `node_modules/`.

## Verdict: NO-GO (blocked, the main session decides)

The package is MIT and has no paid component, but the plan's stop rule fires on three findings:

1. **Telemetry that is on by default.** `shaders/js` imports a telemetry module and POSTs to a
   third-party host from any page that is not on localhost. See section 2.
2. **`new Function`** in the bundle (a typegpu feature probe plus a code-generating writer). It
   raises a CSP `script-src eval` violation at load time. See section 2.
3. **Two `fetch(` call sites stay in the bundle** after every exclusion below. They are the SDF
   atlas loaders. So "no network code in the bundle" is false even though no allowed component
   can reach them.

All three can be neutralised at build time (section 5), but that means lane 6's bundler rewrites
vendor code. That is a supply-chain decision, so lane 4 stops after step 20 and does not write
steps 21 and 22. If the main session accepts the recipe in section 5, steps 21 and 22 are
unaffected: they run against a fake renderer.

## 1. API (exact, from `shaders/dist/js` and `shaders/dist/core`)

The `shaders/js` entry is `dist/js/index.js`. It re-exports `createShader`, `createPreview`,
`createSharedDevice`, `isWebGPUSupported`, `getWebGPUSupport`, `setShadersDebug`, `isShadersDebug`.

```js
import { createShader, isWebGPUSupported } from 'shaders/js';
import FlowingGradient from 'shaders/core/FlowingGradient';   // a GpuShaderDefinition

const shader = await createShader(
  canvas,                                            // HTMLCanvasElement
  { components: [{ type: 'FlowingGradient', id: 'fx',
      props: { colorA: c, colorB: c, colorC: c, colorD: c, speed: 1 } }] },
  { components: [FlowingGradient],                   // definitions the preset may reference
    disableTelemetry: true, observeElement: false,   // we own pause/resume and sizing
    onError: (reason) => { /* terminal reasons: unsupported, no-adapter, no-device, ... */ } },
);
// shader = { update(id, props), resize(w, h), pause(), resume(), destroy(), getFailureReason() }
```

- Source: `dist/js/createShader.js:20` (signature), `:281` (the returned object),
  `dist/js/types.d.ts` (options and the `onError` reason list).
- Colour: any prop typed `transformColor` accepts a hex string, `{r,g,b}` or a CSS name
  (`dist/core/shaders/FlowingGradient/index.d.ts`). `SolidColor` takes one `color`.
- Start/stop: rendering starts by itself after `await createShader`. `pause()` calls
  `renderer.stopAnimation()` and `resume()` calls `renderer.startAnimation()`
  (`createShader.js:275-280`). `destroy()` stops the telemetry timers and calls `renderer.cleanup()`.
- Sizing: `createShader` writes `canvas.style.width/height` through CSSOM
  (`createShader.js:27-31`, `:263`), which a `style-src 'self'` CSP allows. No `setAttribute('style')` and
  no `cssText` anywhere in the patched bundle.
- Failure: with no WebGPU, `onError('unsupported')` fires and `createShader` resolves, it does not
  throw. Run in plain Node against a fake canvas: `getFailureReason()` returned `unsupported`.
  Headless Chromium (adapter missing) gave `no-adapter`.
- `isWebGPUSupported()` can be called before creating anything. `createSharedDevice()` returns one
  device and adapter that both effects can share (`dist/js/createSharedDevice.js`).
- Renderer pausing: with `observeElement: false` the library installs no IntersectionObserver and
  no ResizeObserver, so the controller must call `pause()`, `resume()` and `resize()` itself.

Adapter design for `renderer.js`: `createRenderer(canvas, {color}) -> {start(), stop(), destroy()}`
wraps `createShader`. `start()` is `resume()` (the first call also awaits creation), `stop()` is
`pause()`, `destroy()` is `destroy()`. Any rejection or `onError` sets a failed flag and never
throws to the controller.

## 2. Network, telemetry, eval, CSP (measured)

| finding | where | consequence |
|---|---|---|
| Telemetry POST to `https://shaders.com/api/telemetry` | `shaders/dist/core/telemetry/index.js:7` (endpoint), `:167` (`await fetch`) | sent in 5% of sessions (`:3`, `samplingRate: .05`) |
| It is imported by the js entry | `shaders/dist/js/createShader.js:3` (import), `:179` (`isExternalUser()` gate), `:188` (`startTelemetry`) | on for every host except `shaders.com`, `localhost`, `127.0.0.1` (`telemetry/index.js:205`), so on GitHub Pages |
| It can be switched off at run time | `createShader` option `disableTelemetry: true` (`createShader.js:188`; `telemetry/index.js` `shouldCollectTelemetry`) | the code and the URL stay in the bundle |
| `./core/telemetry` and `./partner` are separate exports | `shaders/package.json` exports | `partner` is not reachable from `shaders/js`; telemetry is |
| `new Function("return true")` feature probe, runs at module load | `shaders/dist/core/std-DcYKWFSQ.js:8712-8714` (copy of `typegpu/data/compiledIO.js:9-12`) | CSP violation event even though the error is caught |
| `new Function(...)` code-generated writer | `std-DcYKWFSQ.js:8924` (`typegpu/data/compiledIO.js:240`), guarded by `EVAL_ALLOWED_IN_ENV` (`:8912`) | dead when the probe returns false |
| `fetch(url, {mode:"cors"})` image loader | `std-DcYKWFSQ.js:106552` | dropped from the minimal bundle |
| `fetch` SDF loaders | `std-DcYKWFSQ.js:118824` (`loadSdfFromUrl`), `:119666` | **stay in the minimal bundle**; only run for a URL prop on SDF-based components |
| Google Fonts `<link>` | `core/Ascii-CPdyy-Ce.js:32`, `std-DcYKWFSQ.js:106793` | dropped from the minimal bundle |
| Default sample media URLs | `core/ImageTexture-CTL2VXJa.js:16`, `core/VideoTexture-DYm45n8L.js:16` | dropped from the minimal bundle |
| `blob:`, `Worker`, `WebAssembly`, `importScripts`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `createObjectURL`, `eval(` | grepped in the default and the minimal bundle | 0 hits in both |
| `localStorage.getItem("shaders:debug")` in try/catch | `core/support-D3W86vgR.js:22` | read only, no write |

Measured with a CSP of `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
connect-src 'self'` in headless Chromium (page served from 127.0.0.1):

| bundle | `securitypolicyviolation` events | external requests |
|---|---|---|
| default (`shaders/js`, nothing patched) | `script-src eval` | none |
| registry stub + telemetry stub, probe not patched | `script-src eval` | none |
| registry stub + telemetry stub + probe patched | none | none |

What this does and does not prove. The page ran on 127.0.0.1 and had no GPU adapter, so no frame
rendered and `isExternalUser()` was false. These runs prove the CSP behaviour and that the patched
module loads and fails cleanly. They do **not** prove that telemetry is absent. That claim rests on
static evidence: in the patched bundle `apiEndpoint`, `sendTelemetry`, `TelemetryCollector`,
`doNotTrack` and `shaders.com` each have 0 occurrences, and the esbuild metafile lists no
`core/telemetry/` and no `partner/` input. The 8 remaining "telemetry" matches are property names
inside `createShader.js` (`telemetryCollector`, `telemetryStartTimeout`), and its call to the stubbed
`startTelemetry` is behind a stubbed `isExternalUser()` that returns false.

CSP keywords needed by the patched bundle: none beyond `'self'`. No `unsafe-eval`, no
`wasm-unsafe-eval`, no `blob:`, no `worker-src`. WebGPU shader modules are created with
`device.createShaderModule(wgsl)`, which is not gated by `script-src`.

## 3. Licence

`shaders` 4.0.4 is MIT (`shaders/package.json` `"license"`, `shaders/LICENSE`). The README
(lines 152-192) says everything in the npm package is free: the engine, every component and the
framework bindings. "Pro" means hosted presets, website sections, HD export, Framer plugin and
version history on shaders.com. None of these ships in the package, and the 200+ components under
`dist/core/shaders/*` have no Pro marker. The package's only runtime dependency, `typegpu` 0.12.3,
is MIT (`typegpu/package.json`, `typegpu/LICENSE`), and it is inlined into the `std-*` chunk, so it
ships in the bundle and needs a credit line too. Result: AC-57 can be met. The allowlist is
`shaders/core/FlowingGradient` (header) and one card component, imported by path.

## 4. Size (esbuild 0.28.2, `--bundle --minify --format=esm --target=es2022`)

| bundle | raw | gzip -9 |
|---|---|---|
| `shaders/js` entry as shipped (registers all ~200 components) | 2,580,200 B | 713,520 B |
| registry stubbed, telemetry stubbed, probe patched, one component | 1,280,699 B | 301,584 B |
| `shaders/core/FlowingGradient` alone, no renderer | 1,175,077 B | 263,972 B |

The 60 KB budget (AC-55) excludes the effects bundle, but the effects bundle is still about 295 KB
of gzip, loaded after the page is interactive. `std-*` (typegpu plus the shader standard library)
is 1.16 MB raw of the 1.28 MB and cannot be shrunk: its top-level calls are not marked pure.

## 5. Recipe if the main session says GO (lane 6 bundler)

Stock `shaders/js` costs 713 KB gz and carries telemetry, so it must not be bundled as is. Three
esbuild plugins turn it into the 301 KB bundle above. They were measured as a scratch script;
the fail-closed assertions below were not exercised, so lane 6 must test them.

1. **Registry stub.** `createShader` and `core/index.js` call `getAllShaders()` from
   `dist/core/shaderRegistry-<hash>.js`, which imports all components. Replace that module with
   an empty registry and pass the allowed definitions through `options.components`:
   ```js
   b.onLoad({ filter: /shaders\/dist\/core\/shaderRegistry-[^/]+\.js$/ }, () => ({
     loader: 'js',
     contents: 'const a={};const i=()=>[],n=()=>undefined,r=()=>[],t=()=>[];export{a,i,n,r,t};',
   }));
   ```
   The real export aliases are `a` shaderRegistry, `i` getShadersByCategory, `n` getShaderByName,
   `r` getShaderCategories, `t` getAllShaders (`shaderRegistry-C-P5WvzF.js:447`). No `sideEffects` override is needed: the
   stub alone removes the component chunks (measured: same size with and without one).
2. **Telemetry stub.** Resolve `.../core/telemetry/index.js` to
   `export const isExternalUser=()=>false,startTelemetry=()=>null,shouldCollectTelemetry=()=>false;`
   `createShader` is then unable to start a collector, and `disableTelemetry: true` is still passed.
3. **Probe rewrite.** In `dist/core/std-<hash>.js` replace `new Function("return true");` with
   `throw new Error("eval disabled");` so `EVAL_ALLOWED_IN_ENV` is false and typegpu takes its
   default writer.

Each patch must fail closed. A patch asserts exactly one match in the expected file and fails the
build otherwise, because the chunk hashes belong to 4.0.4 and a version bump must break the build,
not silently re-enable telemetry. After bundling, assert that the output contains none of:
`shaders.com`, `googleapis`, `apiEndpoint`, `TelemetryCollector`, `blob:`, `Worker(`,
`WebAssembly`, `eval(`, and that `new Function` appears at most once (the guarded writer). Do not
claim the two SDF `fetch(` sites are gone; a runtime check is the e2e same-origin test (step 27)
plus the CSP `connect-src 'self'`, which would block them anyway.

## 6. Decisions for the main session

- Accept the build-time patches (section 5) and a superseding note on the catalog-stack ADR, or
  drop WebGPU effects and ship the static gradient only (AC-49 to AC-54 then move to the
  "static look" branch and the e2e fx specs are removed).
- A middle path with no vendor patching does not exist: `shaders/js` always bundles telemetry code
  and the `new Function` probe.
- If GO: steps 21 and 22 are ready to start, test-first, against the fake renderer. They need no
  GPU and no change to this spike's conclusions.
