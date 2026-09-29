// tests/maptiles.test.mjs
// Headless tests for the Google Map Tiles photorealistic Earth layer.
// Run: node tests/maptiles.test.mjs (from the repo root).
// Pure logic in lib/maptiles.js is tested behaviorally with a mocked fetch;
// the server route and client components are tested structurally (key
// isolation, honest fallback copy, real-tile wiring) because they need the
// Next.js / WebGL runtime.
import { readFileSync } from 'fs';
import {
  MAPTILES_ENV_VAR,
  MAPTILES_SESSION_URL,
  MAPTILES_KEY_REFERER,
  buildSessionRequest,
  rootUrlForSession,
  withSession,
  sessionExpiryMs,
  refreshDelayMs,
  createMapTilesSession,
} from '../lib/maptiles.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- mocked fetch -------------------------------------------------------
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  fn.calls = calls;
  return fn;
}
const okJson = (obj, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => obj,
});

// --- session request construction ---------------------------------------
const req = buildSessionRequest('KEY123');
t('session URL is the 3D-tiles sessions endpoint',
  req.url === 'https://tile.googleapis.com/v1/3dtiles/sessions?key=KEY123');
t('session request is a POST', req.options.method === 'POST');
t('session request sends the key referrer (HTTP-referrer-restricted key)',
  req.options.headers.Referer === 'https://nexus-phi-taupe.vercel.app/');
t('session request is JSON', req.options.headers['Content-Type'] === 'application/json');
const body = JSON.parse(req.options.body);
t('session body asks for satellite photorealistic tiles',
  body.mapType === 'satellite' && body.language === 'en-US' && body.region === 'US');
t('key is URL-encoded in the session URL',
  buildSessionRequest('a b&c').url.includes('key=a%20b%26c'));
t('referrer constant matches the key restriction',
  MAPTILES_KEY_REFERER === 'https://nexus-phi-taupe.vercel.app/');
t('env var contract is GOOGLE_MAP_TILES_API_KEY',
  MAPTILES_ENV_VAR === 'GOOGLE_MAP_TILES_API_KEY');

// --- honest 503 when the key is missing ----------------------------------
{
  const f = mockFetch(async () => okJson({ session: 'SHOULD-NOT-HAPPEN' }));
  const r = await createMapTilesSession('', f);
  t('missing key -> not ok', r.ok === false);
  t('missing key -> honest 503', r.status === 503);
  t('missing key -> no network call at all', f.calls.length === 0);
  t('missing key -> no fake token', !r.json.session);
  t('missing key -> names the satellite fallback', r.json.layer === 'satellite');
  t('missing key -> error names the missing env var',
    /GOOGLE_MAP_TILES_API_KEY/.test(r.json.error + (r.json.detail || '')));
}

// --- successful exchange --------------------------------------------------
{
  const f = mockFetch(async () => okJson({
    session: 'tok_abc', expiry: '1999999999',
    tileWidth: 256, tileHeight: 256, imageFormat: 'jpeg',
  }));
  const r = await createMapTilesSession('REAL_KEY', f);
  t('good exchange -> ok + 200', r.ok === true && r.status === 200);
  t('good exchange -> session token returned', r.json.session === 'tok_abc');
  t('good exchange -> expiry passed through', r.json.expiry === '1999999999');
  t('good exchange -> exactly one network call', f.calls.length === 1);
  t('good exchange -> called the sessions endpoint', f.calls[0].url.startsWith(MAPTILES_SESSION_URL));
  t('good exchange -> key travels server-side as query param',
    f.calls[0].url.includes('key=REAL_KEY'));
  t('good exchange -> Referer header sent for the restricted key',
    f.calls[0].options.headers.Referer === MAPTILES_KEY_REFERER);
  const leaked = JSON.stringify(r.json);
  t('good exchange -> API key never leaks to the client',
    !/REAL_KEY/.test(leaked) && !/api[_-]?key/i.test(leaked));
}

// --- failure modes ---------------------------------------------------------
{
  const f = mockFetch(async () => okJson({ error: { message: 'API key not valid' } }, 403));
  const r = await createMapTilesSession('BAD_KEY', f);
  t('Google 403 -> not ok', r.ok === false);
  t('Google 403 -> honest 502', r.status === 502);
  t('Google 403 -> names the HTTP status', /403/.test(r.json.error));
  t('Google 403 -> no token fabricated', !r.json.session);
}
{
  const f = mockFetch(async () => { throw new Error('socket hang up'); });
  const r = await createMapTilesSession('K', f);
  t('network throw -> honest 502', r.ok === false && r.status === 502);
}
{
  const f = mockFetch(async () => okJson({ expiry: '1' }));
  const r = await createMapTilesSession('K', f);
  t('tokenless success body -> 502, no fake token',
    r.ok === false && r.status === 502 && !r.json.session);
}

// --- tile URL session helper -----------------------------------------------
t('withSession appends the token to tile URLs',
  withSession('https://tile.googleapis.com/v1/3dtiles/a.b3dm', 'tok') ===
    'https://tile.googleapis.com/v1/3dtiles/a.b3dm?session=tok');
t('withSession never double-appends',
  withSession('https://tile.googleapis.com/v1/3dtiles/a?session=old', 'new').includes('session=old') &&
  !withSession('https://tile.googleapis.com/v1/3dtiles/a?session=old', 'new').includes('session=new'));
t('withSession leaves non-Google URLs alone',
  withSession('https://example.com/tiles/a.png', 'tok') === 'https://example.com/tiles/a.png');
t('withSession resolves relative URIs against the tile origin',
  withSession('datasets/files/x.b3dm', 'tok') ===
    'https://tile.googleapis.com/datasets/files/x.b3dm?session=tok');
t('withSession returns the URI unchanged without a token',
  withSession('https://tile.googleapis.com/v1/3dtiles/a', '') ===
    'https://tile.googleapis.com/v1/3dtiles/a');
t('root URL carries the session token',
  rootUrlForSession('tok') === 'https://tile.googleapis.com/v1/3dtiles/root.json?session=tok');

// --- expiry math --------------------------------------------------------------
t('sessionExpiryMs parses unix seconds', sessionExpiryMs('1361824211') === 1361824211000);
t('sessionExpiryMs rejects junk', sessionExpiryMs(null) === null && sessionExpiryMs('nope') === null);
{
  const now = 1_000_000_000_000;
  const d = refreshDelayMs(now + 3_600_000, now);
  t('refresh is scheduled 5 min before expiry', d === 3_600_000 - 5 * 60_000);
  t('nearly-expired token still waits at least a minute',
    refreshDelayMs(now + 10_000, now) === 60_000);
  t('unknown expiry -> no refresh scheduled', refreshDelayMs(null, now) === null);
}

// --- structural: the server route ----------------------------------------------
const route = readFileSync('app/api/earth/tiles/session/route.js', 'utf8');
t('route delegates to createMapTilesSession', /createMapTilesSession/.test(route));
t('route reads the key from process.env via the env-var constant',
  /process\.env\[MAPTILES_ENV_VAR\]/.test(route));
t('route returns the result status honestly', /result\.status/.test(route));
t('route never hardcodes a key', !/AIza[0-9A-Za-z_-]{10,}/.test(route));
t('route exposes nothing public', !/NEXT_PUBLIC/.test(route));
t('route is force-dynamic (fresh token per request)', /force-dynamic/.test(route));

// --- structural: the client tile component ---------------------------------------
const tiles = readFileSync('components/GoogleEarthTiles.jsx', 'utf8');
t('client never references the API key env var', !/GOOGLE_MAP_TILES_API_KEY/.test(tiles));
t('client lazy-loads the 3D-tiles renderer (SSR/bundle safe)',
  /import\('3d-tiles-renderer'\)/.test(tiles) && !/^import .* from '3d-tiles-renderer'/m.test(tiles));
t('client mints the session through the server route',
  /\/api\/earth\/tiles\/session/.test(tiles));
t('client attaches the token via preprocessURL', /preprocessURL/.test(tiles) && /withSession/.test(tiles));
t('client refreshes the token before expiry',
  /refreshDelayMs/.test(tiles) && /sessionExpiryMs/.test(tiles));
t('client waits for the real tileset before going active', /load-tile-set/.test(tiles));
t('client falls back on failure or timeout', /onInactive/.test(tiles) && /TILESET_LOAD_TIMEOUT_MS/.test(tiles));
t('client disposes the renderer on unmount', /\.dispose\(\)/.test(tiles));
t('client scales ECEF meters to hub units', /6378137/.test(tiles));
t('client orients Z-up tiles to the Y-up globe', /rotation\.x = -Math\.PI \/ 2/.test(tiles));

// --- structural: NexusEarth integration --------------------------------------------
const nexus = readFileSync('components/NexusEarth.jsx', 'utf8');
t('earth mounts the photorealistic tile globe', /<GoogleEarthTiles/.test(nexus));
t('earth defaults to the honest satellite layer', /useState\('satellite'\)/.test(nexus));
t('earth only claims photorealistic after tiles render', /onActive=\{[^}]*'photorealistic'/.test(nexus));
t('earth falls back to satellite on tile failure', /onInactive=\{[^}]*'satellite'/.test(nexus));
t('earth keeps the ESRI lens as fallback', /tileGrid/.test(nexus) && /CanvasTexture/.test(nexus));
t('earth hides the lens while photorealistic', /layer === 'satellite' && patchTex/.test(nexus));
t('earth labels the layers in plain English',
  /Photorealistic/.test(nexus) && /Satellite/.test(nexus));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
