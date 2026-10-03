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
  backdropVideoUrl,
  backdropImageUrl,
  normalizeBackdropSelection,
  isBackdropRealm,
  newSignalState,
  setSignalPart,
  getSignalPart,
  hologramTint,
  scanlineFactor,
  revealVisibility,
  flickerFactor,
  MAX_GUEST_PROJECTORS,
  PROJECTOR_ARC_RADIUS,
  projectorSlotPositions,
  throneCameraFrame,
  isCompactPhase,
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

// --- realm backdrops: the dome ("like a horse shelter") ---
// Priority per realm: video -> banner image -> void.
{
  t('ten realm backdrops', BACKDROP_REALMS.length === 10);
  t('all expected realms present',
    ['ares', 'apollo', 'hermes', 'hephaestus', 'athena', 'artemis', 'hestia', 'dionysus', 'plutus', 'aphrodite']
      .every((r) => BACKDROP_REALMS.includes(r)));
  t('video URL per realm', backdropVideoUrl('ares') === '/videos/order-67/backdrop-ares.mp4');
  t('banner image fallback per realm',
    backdropImageUrl('apollo') === '/images/menu/banners/banner-apollo.webp');
  t('unknown realm -> nulls (graceful void)',
    backdropVideoUrl('bogus') === null && backdropImageUrl('bogus') === null);
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
  t('realm picker buttons wear banner thumbnails', page.includes('/images/menu/banners/banner-'));
  t('page has a camera flip control', page.includes('switchCamera') && page.includes('FLIP'));
  t('camera flip swaps the peer track without renegotiation', page.includes('replaceTrack'));
  t('camera flip keeps the old stream until the new one is live',
    page.includes('Could not switch camera'));
  t('page states the honest P2P privacy note', page.includes('only sees room codes'));
  t('page handles camera denial honestly', page.includes('no-camera'));
  t('page handles the missing DB migration honestly', page.includes('supabase/order-67.sql'));
  t('no alert() pop-ups', !page.includes('alert('));

  const throne = src('../app/order-67/throne-room.js');
  t('throne room uses a hologram ShaderMaterial', throne.includes('ShaderMaterial'));
  t('throne room has the reveal wipe', throne.includes('uReveal'));
  t('throne room has the light cone', throne.includes('ConeGeometry'));
  t('throne room uses the real BufferGeometry rotation API (regression: v.rotate crash)',
    !/\.rotate\s*\(/.test(throne) && throne.includes('coneGeo.rotateX(Math.PI)'));
  t('throne room drops a BackSide dome, not a flat plane',
    throne.includes('SphereGeometry') && throne.includes('THREE.BackSide')
    && !throne.includes('CylinderGeometry(13.5'));
  t('throne room tries realm video first, banner image fallback, void last',
    throne.includes('backdropVideoUrl') && throne.includes('backdropImageUrl')
    && throne.includes('probeBackdropVideo'));
  t('dome fades in and stays phone-cheap (one sphere, one texture)',
    throne.includes('domeFadeTarget') && throne.includes('DOME_RADIUS'));
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

// --- call-UX overhaul: compact phases, multi-projector framing ---
t('guest cap is 4 (mesh ceiling, documented)', MAX_GUEST_PROJECTORS === 4);
t('projector arc has a sane radius', PROJECTOR_ARC_RADIUS > 0 && PROJECTOR_ARC_RADIUS < 20);
{
  t('0 guests -> no slots', projectorSlotPositions(0).length === 0);
  const one = projectorSlotPositions(1);
  t('1 guest centers behind the main dais', one.length === 1 && approx(one[0].x, 0) && one[0].z < 0);
  const four = projectorSlotPositions(4);
  t('4 guests -> 4 slots', four.length === 4);
  const R = PROJECTOR_ARC_RADIUS;
  t('slots sit on the (squashed) arc ellipse',
    four.every((s) => approx((s.x / R) ** 2 + (s.z / (0.85 * R)) ** 2, 1, 0.01)));
  t('slots fan outward (x spread grows)', Math.max(...four.map((s) => Math.abs(s.x))) > Math.abs(one[0].x) + 0.5);
  const xs = four.map((s) => s.x).sort((a, b) => a - b);
  t('slots are symmetric left/right', approx(xs[0], -xs[3]) && approx(xs[1], -xs[2]));
  t('clamps beyond the cap', projectorSlotPositions(9).length === MAX_GUEST_PROJECTORS);
  t('negative count -> no slots', projectorSlotPositions(-2).length === 0);
}
{
  const idle = throneCameraFrame('idle', 0);
  const call0 = throneCameraFrame('call', 0);
  const call4 = throneCameraFrame('call', 4);
  t('call frame pulls back vs idle', call0.z > idle.z && call0.y < idle.y);
  t('call frame widens as guests arrive', call4.z > call0.z && call4.y > call0.y);
  t('call frame clamps at the cap', approx(throneCameraFrame('call', 9).z, call4.z));
  t('unknown mode falls back to idle', approxArr(Object.values(throneCameraFrame('party', 0)), Object.values(idle)));
}
t('idle is not a compact phase', !isCompactPhase('idle'));
for (const ph of ['hosting', 'joining', 'in-call', 'solo']) {
  t(`${ph} collapses the header`, isCompactPhase(ph));
}
t('junk phase is not compact', !isCompactPhase('party') && !isCompactPhase(null));

{ // --- source-level checks for the overhaul ---
  const page = src('../app/order-67/page.jsx');
  t('compact header collapses on call phases', page.includes('isCompactPhase(phase)'));
  t('slim bar keeps status visible with an expand affordance', page.includes('aria-label="Expand header"'));
  t('floating vortex icon plays the nebula fallback video', page.includes('/videos/menu-background.mp4') && page.includes('o67-vortex-video'));
  t('vortex respects reduced motion (static gradient)', page.includes('reducedMotion') && page.includes('from-cyan-500/70'));
  t('expanded drawer holds the realm chips mid-call', page.includes('Collapse header') && page.includes('renderRealmChips'));
  t('realm chips hidden from the bottom panel mid-call', page.includes('{!compact && (') && page.includes('PROJECTED REALM BACKDROP'));
  t('camera reframes on phase change', page.includes("setFraming(compact ? 'call' : 'idle')"));
  t('control cluster has mute', page.includes('toggleMute') && page.includes('UNMUTE'));
  t('control cluster has speaker toggle', page.includes('toggleSpeaker') && page.includes('SPEAKER'));
  t('control cluster has camera on/off', page.includes('toggleCamera') && page.includes('CAM OFF'));
  t('control cluster keeps FLIP prominent', page.includes('switchCamera') && page.includes('FLIP'));
  t('control cluster has ADD PROJECTOR', page.includes('ADD PROJECTOR'));
  t('control cluster has ADD FRIEND (in-call invite)', page.includes('ADD FRIEND') && page.includes('inviteToCall'));
  t('control cluster has SHARE', page.includes('SHARE INVITE') && page.includes('shareGuestInvite'));
  t('control cluster has HANG UP', page.includes('HANG UP'));
  t('mute/camera states persist across fresh streams', page.includes('applyLocalTrackStates'));
  t('mute state applied to new streams', page.includes('t.enabled = !mutedRef.current'));
  t('local preview is always mounted (no null-ref bug)', (page.match(/ref={localVideoRef}/g) || []).length === 1 && page.includes('always mounted'));
  t('share invite uses the native sheet with clipboard fallback',
    page.includes('navigator.share') && page.includes('navigator.clipboard.writeText'));
  t('share link is the olympusverse deep link', page.includes('https://olympusverse.com/order-67?code='));
  t('share dismiss is silent (AbortError)', page.includes("e.name === 'AbortError'"));
  t('?code= deep link prefills the join field', page.includes("q.get('code')") && page.includes('setJoinCode(c)'));
  t('deep link is honest about sign-in', page.includes('sign in, then tap JOIN'));
  t('guest cap message is honest about the SFU ceiling', page.includes('needs a media server'));
  t('guests get their own 1:1 rooms (mesh)', page.includes('hostCall(userId)') && page.includes('addProjector'));
  t('guest audio rides a Web Audio mixer', page.includes('createMediaStreamSource'));
  t('guest strip shows live state + remove + share', page.includes('removeGuest') && page.includes('Guests'));
  t('hang up closes every projector room', page.includes('endCall(g.code)'));
  t('in-call friend invite reuses the projector path', page.includes('inviteToCall') && page.includes('addProjector(friend)'));
  t('sheet has BLOCK next to friends', page.includes('doBlockUser') && page.includes("'SURE?'"));
  t('block is two-tap, no pop-ups', page.includes('confirmBlockId') && !page.includes('confirm('));
  t('sheet invite mode hides search/requests', page.includes("friendsMode === 'summon'"));
  t('no alert() pop-ups', !page.includes('alert('));

  const throne = src('../app/order-67/throne-room.js');
  t('throne exposes the projector API',
    throne.includes('addProjector(id)') && throne.includes('removeProjector(id)')
    && throne.includes('setProjectorStream') && throne.includes('showProjector')
    && throne.includes('hideProjector') && throne.includes('projectorCount'));
  t('each guest gets its own hologram shader instance', throne.includes('makeProjectorParts') && throne.includes('holoUniforms'));
  t('dome brightened past the muddy 0.55', throne.includes('setScalar(0.95)') && !throne.includes('setScalar(0.55)'));
  t('realm drop fades the black wall toward transparent', throne.includes('wallFadeTarget = 0.02'));
  t('void restores the wall', throne.includes('wallFadeTarget = 1'));
  t('framing API exists (idle/call)', throne.includes("setFraming(mode)"));
  t('guest daises are laid out in an arc', throne.includes('layoutProjectors'));

  const bell = src('../components/NotificationsWindow.jsx');
  t('bell JOINs call invites via the deep link', bell.includes('order67-invite') && bell.includes('/order-67?code='));

  const prof = src('../components/profiles/ProfileClient.jsx');
  t('profile has a BLOCK button under the header', prof.includes('doBlockToggle') && prof.includes('Block'));
  t('profile block is two-tap', prof.includes('Tap again to confirm block'));
  t('own profile has a floating blocked-list icon', prof.includes('pf-fab') && prof.includes('Open blocked list'));
  t('blocked panel lists users with UNBLOCK', prof.includes('pf-blocked-sheet') && prof.includes('Unblock'));
  t('block copy is honest about silence', prof.includes('never told'));
  // Share to Agora: lands on the created post, never a dead 404
  t('share-to-agora navigates to the created post', prof.includes('data.agora_url'));
  t('share-to-agora validates the post URL before navigating',
    prof.includes('/^\\/agora\\/post\\/[A-Za-z0-9-]+$/'));
  t('share-to-agora keeps the honest toast', prof.includes("showToast('Shared to the Agora!')"));
  t('share-to-agora failure stays a toast (no navigation)', prof.includes("showToast(data.error || 'Could not share to the Agora.')"));
}

// --- profile 404s: business toggle + share-to-agora -------------------------
{
  const upage = src('../app/u/[username]/page.jsx');
  t('business toggle uses a query param, not a separate route',
    upage.includes("?v=business"));
  t('missing business profile is an honest empty state, not a 404',
    upage.includes('No business profile yet'));
  t('empty state keeps the Personal/Business switch',
    upage.includes('aria-label="Profile type"'));
  t('empty state links to the editor to create it',
    upage.includes('Create business profile') && upage.includes('/edit'));
  t('empty state is honest about owner-only creation',
    upage.includes('Only the profile owner can create it'));
  t('truly unknown usernames still 404', upage.includes('notFound()'));
  t('business empty state checks the personal profile first',
    upage.includes("loadProfile(username, 'personal')"));
}

// --- link health: a dead P2P link must say so, never pulse forever --------
{
  const page = src('../app/order-67/page.jsx');
  const webrtc = src('../app/order-67/webrtc.js');
  t('webrtc exports monitorPeerConnection', webrtc.includes('export function monitorPeerConnection'));
  t('webrtc exports the disconnect grace constant', webrtc.includes('export const LINK_DISCONNECT_GRACE_MS'));
  t('monitor listens for connectionstatechange', webrtc.includes("addEventListener('connectionstatechange'"));
  t('monitor reports failed immediately', webrtc.includes("state === 'failed'"));
  t('monitor reports disconnected after a grace period', webrtc.includes("state === 'disconnected'"));
  t('monitor clears the grace timer on connected', webrtc.includes("state === 'connected'"));
  t('monitor returns an unmonitor cleanup', webrtc.includes('removeEventListener'));

  t('page imports monitorPeerConnection', page.includes('monitorPeerConnection'));
  t('host wires link health', page.includes('watchLinkHealth(pc, (msg) => hangUp(msg))'));
  t('host arms the post-handshake watchdog', page.includes('armLinkWatchdog(pc)'));
  t('guest arms the post-handshake watchdog', page.includes("armLinkWatchdog(pc);"));
  t('link failure copy is honest about strict networks',
    page.includes('a strict network may be blocking it'));
  t('watchdog copy is honest about still connecting',
    page.includes('Still connecting'));
  t('hangup clears link health', page.includes('clearLinkHealth();'));
  t('guests get their own link monitor', page.includes('monitorPeerConnection(pc, {')
    && page.includes("removeGuest(id, `${name}'s projector link failed"));

  // self-view: bottom-center, above the cluster + Safari bar, never over the hologram
  t('self-view is horizontally centered', page.includes('left-1/2'));
  t('self-view centers with translateX', page.includes('translateX(-50%)'));
  t('self-view clears the control cluster', page.includes('12.5rem'));
  t('self-view respects the Safari safe area', page.includes('env(safe-area-inset-bottom)'));
  t('self-view no longer sits bottom-right', !page.includes('bottom-56 right-4'));

  // friends search: existing friends get SUMMON, not a 409-ing ADD
  t('search dedups existing friends', page.includes('alreadyFriend'));
  t('search offers SUMMON to existing friends',
    page.includes('alreadyFriend ? (') && page.includes('executeOrder67({ user_id: pl.user_id'));
}

// --- monitorPeerConnection: functional test with a fake peer connection ---
// webrtc.js uses the @/ alias; rewrite to a temp file with a relative import
// so the real function runs headless (no browser, no network).
{
  const { writeFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const libUrl = new URL('../lib/order-67.js', import.meta.url).href;
  const webrtcSrc = src('../app/order-67/webrtc.js').replace(
    "from '@/lib/order-67'",
    `from '${libUrl}'`
  );
  const tmpFile = join(tmpdir(), `webrtc-link-test-${Date.now()}.mjs`);
  writeFileSync(tmpFile, webrtcSrc);
  let monitorPeerConnection;
  let LINK_DISCONNECT_GRACE_MS;
  try {
    const mod = await import(tmpFile);
    monitorPeerConnection = mod.monitorPeerConnection;
    LINK_DISCONNECT_GRACE_MS = mod.LINK_DISCONNECT_GRACE_MS;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* noop */ }
  }

  t('monitorPeerConnection is a function', typeof monitorPeerConnection === 'function');
  t('disconnect grace is 12s', LINK_DISCONNECT_GRACE_MS === 12000);

  const fakePc = (initialState = 'new') => {
    const listeners = {};
    return {
      connectionState: initialState,
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
      _fire(type) { (listeners[type] || []).forEach((fn) => fn()); },
      _set(s) { this.connectionState = s; this._fire('connectionstatechange'); },
      _listenerCount(type) { return (listeners[type] || []).length; },
    };
  };

  // 'failed' -> onFailed immediately
  {
    const pc = fakePc('connecting');
    let failed = 0;
    const un = monitorPeerConnection(pc, { onFailed: () => { failed++; } });
    pc._set('failed');
    t("monitor calls onFailed on 'failed'", failed === 1);
    un();
    t('unmonitor detaches the listener', pc._listenerCount('connectionstatechange') === 0);
  }

  // 'connected' -> onConnected, no failure
  {
    const pc = fakePc('connecting');
    let connected = 0;
    let failed = 0;
    monitorPeerConnection(pc, { onConnected: () => { connected++; }, onFailed: () => { failed++; } });
    pc._set('connected');
    t("monitor calls onConnected on 'connected'", connected === 1);
    t("monitor does not call onFailed on 'connected'", failed === 0);
  }

  // 'disconnected' -> grace period: fake timers fire it manually
  {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const pending = [];
    globalThis.setTimeout = (fn) => { pending.push(fn); return pending.length - 1; };
    globalThis.clearTimeout = (id) => { pending[id] = null; };
    try {
      const pc = fakePc('new');
      let lost = 0;
      let back = 0;
      monitorPeerConnection(pc, {
        onDisconnected: () => { lost++; },
        onConnected: () => { back++; },
      });
      pc._set('disconnected');
      t("monitor does not report 'disconnected' immediately", lost === 0);
      // recovers before the grace timer fires -> no report
      pc._set('connected');
      pending.forEach((fn) => { if (fn) fn(); });
      t('recovery inside the grace period stays silent', lost === 0 && back === 1);
      // drops again and the timer fires -> reported
      pc._set('disconnected');
      pending.forEach((fn) => { if (fn) fn(); });
      t("monitor reports 'disconnected' after the grace period", lost === 1);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  }

  // null pc -> no-op unmonitor, never throws
  {
    let threw = false;
    try {
      const un = monitorPeerConnection(null, { onFailed: () => { throw new Error('nope'); } });
      un();
    } catch { threw = true; }
    t('monitor tolerates a null peer connection', !threw);
  }
}

console.log(`\norder-67: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
