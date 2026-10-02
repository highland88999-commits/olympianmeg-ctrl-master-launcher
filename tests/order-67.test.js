// tests/order-67.test.js — Headless tests for the ORDER 67 pocket universe.
// Run: node tests/order-67.test.js (from the repo root).
// No browser, no network — asserts on lib/order-67.js pure helpers plus
// source-level checks (menu registration, honesty labels, no telemetry).
import { readFileSync } from 'fs';
import {
  ORDER67_GAME,
  ORDER67_ROUTE,
  ICE_SERVERS,
  BACKDROP_REALMS,
  BACKDROP_NONE,
  backdropFileCandidates,
  normalizeBackdropSelection,
  isBackdropRealm,
  newSignalState,
  setSignalPart,
  getSignalPart,
  hologramTint,
  scanlineFactor,
  revealVisibility,
  flickerFactor,
} from '../lib/order-67.js';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeCode,
} from '../lib/oasis/rooms.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function approx(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}
function approxArr(a, b, tol = 1e-9) {
  return a.length === b.length && a.every((v, i) => approx(v, b[i], tol));
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- identity / constants ---
t('game slug is order-67', ORDER67_GAME === 'order-67');
t('route is /order-67', ORDER67_ROUTE === '/order-67');
t('ICE servers configured (public STUN, documented)', Array.isArray(ICE_SERVERS) && ICE_SERVERS.length > 0
  && ICE_SERVERS.every((s) => typeof s.urls === 'string' && s.urls.startsWith('stun:')));

// --- room codes (OASIS pattern reuse) ---
{
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const c = generateRoomCode();
    if (!isValidRoomCode(c) || c.length !== 6) { ok = false; break; }
    if (/[01IO]/.test(c)) { ok = false; break; } // no ambiguous glyphs
  }
  t('200 generated codes are valid 6-char, no ambiguous glyphs', ok);
  t('normalizeCode uppercases/trims', normalizeCode('  ab12cd ') === 'AB12CD');
}

// --- signal state encode/decode ---
{
  const s0 = newSignalState();
  t('new signal state is empty', s0.offer === null && s0.answer === null && s0.v === 1);
  const s1 = setSignalPart(s0, 'offer', 'fake-sdp-offer');
  t('offer round-trips', getSignalPart(s1, 'offer') === 'fake-sdp-offer');
  t('answer still null', getSignalPart(s1, 'answer') === null);
  t('original state untouched (immutable)', s0.offer === null);
  const s2 = setSignalPart(s1, 'answer', 'fake-sdp-answer');
  t('answer round-trips, offer preserved', getSignalPart(s2, 'answer') === 'fake-sdp-answer' && getSignalPart(s2, 'offer') === 'fake-sdp-offer');
  t('null state reads null', getSignalPart(null, 'offer') === null);
  t('empty sdp reads null', getSignalPart(setSignalPart(s0, 'offer', ''), 'offer') === null);
  let threw = false;
  try { setSignalPart(s0, 'bogus', 'x'); } catch { threw = true; }
  t('invalid signal part throws', threw);
}

// --- hologram color math (mirrors the GLSL) ---
{
  t('white -> hologram cyan', approxArr(hologramTint(1, 1, 1), [0.35, 0.85, 1.0]));
  t('black -> black', approxArr(hologramTint(0, 0, 0), [0, 0, 0]));
  t('pure red tints by luminance', approxArr(hologramTint(1, 0, 0), [0.35 * 0.299, 0.85 * 0.299, 0.299], 1e-6));
  const [r, g, b] = hologramTint(0.5, 0.5, 0.5);
  t('gray stays blue-dominant', b >= g && g >= r);
}

// --- scanlines / reveal / flicker ---
{
  let inRange = true;
  for (let i = 0; i <= 40; i++) {
    const f = scanlineFactor(i / 40);
    if (f < 0.55 || f > 1.0) { inRange = false; break; }
  }
  t('scanline factor stays in [0.55, 1.0]', inRange);
  t('reveal: hidden below, shown above', revealVisibility(0, 1) === 1 && revealVisibility(1, 0) === 0);
  let mono = true;
  for (let i = 1; i <= 20; i++) {
    if (revealVisibility(0.5, i / 20) < revealVisibility(0.5, (i - 1) / 20) - 1e-9) { mono = false; break; }
  }
  t('reveal is monotonic in the wipe parameter', mono);
  let flRange = true;
  for (let i = 0; i <= 100; i++) {
    const f = flickerFactor(i * 0.37);
    if (f < 0.89 || f > 1.0) { flRange = false; break; }
  }
  t('flicker stays subtle [0.89, 1.0]', flRange);
}

// --- realm backdrops ---
{
  t('ten realm backdrops', BACKDROP_REALMS.length === 10);
  t('all expected realms present',
    ['ares', 'apollo', 'hermes', 'hephaestus', 'athena', 'artemis', 'hestia', 'dionysus', 'plutus', 'aphrodite']
      .every((r) => BACKDROP_REALMS.includes(r)));
  const c = backdropFileCandidates('ares');
  t('webp preferred, jpg fallback', c.length === 2 && c[0].endsWith('.webp') && c[1].endsWith('.jpg')
    && c[0].includes('backdrop-ares'));
  t('unknown realm -> no candidates (graceful void)', backdropFileCandidates('bogus').length === 0);
  t('isBackdropRealm case-insensitive', isBackdropRealm('ARES') && !isBackdropRealm('x'));
  t('normalize keeps known realms', normalizeBackdropSelection('Hestia') === 'hestia');
  t('normalize falls back to none', normalizeBackdropSelection('nope') === BACKDROP_NONE
    && normalizeBackdropSelection('') === BACKDROP_NONE && normalizeBackdropSelection(null) === BACKDROP_NONE);
}

// --- source-level checks ---
{
  const page = src('../app/order-67/page.jsx');
  t('page has the Execute Order 67 brand button', page.includes('EXECUTE ORDER 67'));
  t('page has solo demo mode', page.includes('SUMMON TEST HOLOGRAM'));
  t('page has the backdrop picker', page.includes('PROJECTED REALM BACKDROP'));
  t('page states the honest P2P privacy note', page.includes('only sees room codes'));
  t('page handles camera denial honestly', page.includes('no-camera'));
  t('page handles the missing DB migration honestly', page.includes('supabase/order-67.sql'));
  t('no alert() pop-ups', !page.includes('alert('));

  const throne = src('../app/order-67/throne-room.js');
  t('throne room uses a hologram ShaderMaterial', throne.includes('ShaderMaterial'));
  t('throne room has the reveal wipe', throne.includes('uReveal'));
  t('throne room has the light cone', throne.includes('ConeGeometry'));
  t('throne room loads backdrops with webp->jpg->void fallback', throne.includes('backdropFileCandidates'));
  t('throne room makes no network calls of its own', !throne.includes('fetch(') && !throne.includes('XMLHttpRequest'));

  const sig = src('../app/order-67/signaling.js');
  t('signaling reuses the OASIS rooms module (no new backend)', sig.includes('lib/oasis/rooms'));

  const rtc = src('../app/order-67/webrtc.js');
  t('webrtc uses the documented ICE servers', rtc.includes('ICE_SERVERS'));

  const lib = src('../lib/order-67.js');
  t('lib documents the STUN privacy posture', lib.includes('STUN only'));

  const sql = src('../supabase/order-67.sql');
  t('SQL migration widens the game check', sql.includes('oasis_rooms_game_check') && sql.includes("'order-67'"));

  const menus = src('../lib/god-menus.js');
  t('order-67 is a HERMES satellite', /satellites:\s*\[[^\]]*'order-67'/.test(menus));

  const en = JSON.parse(src('../lib/i18n/locales/en.json'));
  t('en locale has order-67 title/subtitle',
    en['sat.order-67.title'] === 'Order 67' && en['sat.order-67.subtitle'] === 'Holographic P2P Calls');

  const sats = src('../lib/i18n/satellites.ts');
  t('satellites registry has order-67 -> /order-67', sats.includes('key: "order-67"') && sats.includes('route: "/order-67"'));

  const menu = src('../components/SatelliteMenu.jsx');
  t('menu pins a featured Order 67 button above the rail', menu.includes('launchOrder67') && menu.includes('Featured: ORDER 67'));
  t('featured button launches /order-67 through onLaunch', menu.includes("onLaunch('/order-67', 'order-67'"));
  t('featured button uses menuArtFor with error fallback', menu.includes("menuArtFor('order-67')") && menu.includes('FeaturedArt'));
  t('featured button meets 44px touch target', menu.includes('min-h-[64px]'));
}

console.log(`\norder-67: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
