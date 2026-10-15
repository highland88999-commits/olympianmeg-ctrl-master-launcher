// tests/webgl-fallback.test.mjs — Homepage WebGL resilience guard.
//
// Regression coverage for client_errors class B ("Error creating WebGL
// context.", the site's #1 client error — 47 rows, investigation
// 2026-10-14): three.js throws synchronously at R3F Canvas mount on
// browsers that cannot create a WebGL context, and with no local guard
// the throw replaced the ENTIRE homepage via the global error boundary.
//
// The guard has three parts, all pinned here:
//   1. lib/webgl-support.js pre-flight probe (real unit tests below).
//   2. components/HomeScene.jsx wraps the scene: probe before Canvas,
//      a local error boundary, and a webglcontextlost route to the same
//      fallback (structural assertions — no DOM in this harness).
//   3. app/api/client-error/route.js intake hygiene: scanner/crawler UAs
//      dropped, identical (message + UA) bursts deduped (unit tests on
//      lib/client-error-hygiene.js + structural assertions on the route).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeWebGL, resetWebGLProbeCache } from '../lib/webgl-support.js';
import { isScannerUserAgent, createErrorDeduper } from '../lib/client-error-hygiene.js';

const ROOT = join(import.meta.dirname, '..');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// ---------------------------------------------------------------------------
// 1. The probe, against fake documents.
// ---------------------------------------------------------------------------

function fakeDoc(contexts) {
  // contexts: map of context-type -> result (object | null | 'throw')
  const calls = [];
  return {
    calls,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        getContext(type) {
          calls.push(type);
          const r = contexts[type];
          if (r === 'throw') throw new Error('nope');
          return r || null;
        },
      };
    },
  };
}

function fakeGL() {
  return {
    lost: false,
    getExtension(name) {
      if (name !== 'WEBGL_lose_context') return null;
      return { loseContext: () => { this.lost = true; } };
    },
  };
}

check('probe: webgl2 available -> true, probe context released', () => {
  resetWebGLProbeCache();
  const gl = fakeGL();
  const doc = fakeDoc({ webgl2: gl });
  assert.equal(probeWebGL(doc), true);
  assert.equal(gl.lost, true, 'probe must release its throwaway context');
});

check('probe: webgl2 missing, webgl present -> true', () => {
  resetWebGLProbeCache();
  const gl = fakeGL();
  const doc = fakeDoc({ webgl2: null, webgl: gl });
  assert.equal(probeWebGL(doc), true);
});

check('probe: no context at all -> false (the fallback case)', () => {
  resetWebGLProbeCache();
  const doc = fakeDoc({ webgl2: null, webgl: null, 'experimental-webgl': null });
  assert.equal(probeWebGL(doc), false);
});

check('probe: getContext throwing -> false, never propagates', () => {
  resetWebGLProbeCache();
  const doc = fakeDoc({ webgl2: 'throw', webgl: 'throw', 'experimental-webgl': 'throw' });
  assert.equal(probeWebGL(doc), false);
});

check('probe: verdict is memoized until reset', () => {
  resetWebGLProbeCache();
  const doc = fakeDoc({ webgl2: null, webgl: null, 'experimental-webgl': null });
  assert.equal(probeWebGL(doc), false);
  const callsBefore = doc.calls.length;
  assert.equal(probeWebGL(doc), false);
  assert.equal(doc.calls.length, callsBefore, 'second call must not re-probe');
  resetWebGLProbeCache();
});

// ---------------------------------------------------------------------------
// 2. HomeScene structure: probe + boundary + context-loss routing.
// ---------------------------------------------------------------------------

const homeScene = readFileSync(join(ROOT, 'components', 'HomeScene.jsx'), 'utf8');

check('HomeScene: default export is the guard wrapper, scene is internal', () => {
  assert.match(homeScene, /export default function HomeScene\(props\)/);
  assert.match(homeScene, /function HubScene\(\{/);
});

check('HomeScene: pre-flight probe gates the Canvas', () => {
  assert.match(homeScene, /import \{ probeWebGL \} from '\.\.\/lib\/webgl-support'/);
  assert.match(homeScene, /useState\(\(\) => probeWebGL\(\)\)/);
  assert.match(homeScene, /unavailable \? \(\s*<ThreeDUnavailableNotice \/>/);
});

check('HomeScene: local error boundary swaps scene failures to the fallback', () => {
  assert.match(homeScene, /class SceneErrorBoundary extends Component/);
  assert.match(homeScene, /getDerivedStateFromError/);
  assert.match(
    homeScene,
    /<SceneErrorBoundary fallback=\{<ThreeDUnavailableNotice \/>\}>/
  );
});

check('HomeScene: webglcontextlost routes to the fallback via onCreated', () => {
  assert.match(homeScene, /onCreated=\{\(\{ gl \}\) =>/);
  assert.match(homeScene, /addEventListener\('webglcontextlost'/);
  assert.match(homeScene, /onContextLost=\{handleContextLost\}/);
});

check('HomeScene: fallback is the dark shell with the on-brand notice', () => {
  assert.match(homeScene, /bg-\[#050505\]/);
  assert.match(homeScene, /3D is unavailable on this device/);
  assert.match(homeScene, /kind: 'scene-fallback'/);
});

check('HomeScene: capable path unchanged — Canvas props preserved', () => {
  assert.match(
    homeScene,
    /<Canvas shadows="soft" gl=\{\{ alpha: true \}\} camera=\{\{ position: \[ORBIT_CENTER\.x, ORBIT_CENTER\.y, ORBIT_CENTER\.z\], fov: 52, far: 2000 \}\}/
  );
  // The DOM siblings that lived beside the Canvas still render on every path.
  assert.match(homeScene, /<SeasonBadge \/>/);
  assert.match(homeScene, /<TrophyOverlay \/>/);
});

// ---------------------------------------------------------------------------
// 3. Client-error intake hygiene.
// ---------------------------------------------------------------------------

check('hygiene: named crawlers and HTTP clients are scanners', () => {
  assert.equal(isScannerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isScannerUserAgent('meta-webindexer/1.1 (+https://developer.facebook.com/)'), true);
  assert.equal(isScannerUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'), true);
  assert.equal(isScannerUserAgent('python-requests/2.31.0'), true);
  assert.equal(isScannerUserAgent('curl/8.4.0'), true);
  assert.equal(isScannerUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0 Safari/537.36'), true);
});

check('hygiene: plausible browsers are never dropped', () => {
  assert.equal(
    isScannerUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'),
    false
  );
  assert.equal(
    isScannerUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1'),
    false
  );
  assert.equal(
    isScannerUserAgent('Mozilla/5.0 (Linux; Android 13; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'),
    false,
    'a real budget-phone UA containing "cubot" must not be dropped as a "bot"'
  );
  assert.equal(isScannerUserAgent(''), false, 'unknown UA: record, do not drop');
});

check('hygiene: dedupe thins identical bursts, keeps distinct signal', () => {
  const d = createErrorDeduper(10 * 60 * 1000);
  const t0 = 1_000_000;
  assert.equal(d.shouldRecord('Error creating WebGL context.', 'UA-A', t0), true, 'first sighting records');
  assert.equal(d.shouldRecord('Error creating WebGL context.', 'UA-A', t0 + 102_000), false, 'same crash retrying is one signal');
  assert.equal(d.shouldRecord('Error creating WebGL context.', 'UA-B', t0 + 103_000), true, 'a different client is new signal');
  assert.equal(d.shouldRecord('Some other crash', 'UA-A', t0 + 104_000), true, 'a different message is new signal');
  assert.equal(
    d.shouldRecord('Error creating WebGL context.', 'UA-A', t0 + 10 * 60 * 1000 + 1),
    true,
    'after the window, the same crash records again'
  );
});

const route = readFileSync(join(ROOT, 'app', 'api', 'client-error', 'route.js'), 'utf8');

check('route: scanner and duplicate reports are not persisted', () => {
  assert.match(route, /from '@\/lib\/client-error-hygiene'/);
  assert.match(route, /isScannerUserAgent\(ua\)/);
  assert.match(route, /deduper\.shouldRecord\(report\.message, ua\)/);
  assert.match(route, /!scanner && !duplicate && url && key/);
});

console.log(`webgl-fallback: ${passed} checks passed`);
