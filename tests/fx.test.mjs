// tests/fx.test.mjs — Headless tests for the central FX library (lib/fx.js).
// Run: node tests/fx.test.mjs (from the repo root). No browser, no network.
//
// Covers: every matched pair is defined and safe to call anywhere (SSR,
// blocked AudioContext); sound+haptic correspondence for each pair;
// the graceful no-vibration path (iOS Safari has no navigator.vibrate —
// sound-only, never faked); the pre-gesture gate (nothing plays before
// unlockFx()); the global mute; reduced-motion handling; internal vs
// external route handling in routeLaunch (affiliate links get a neutral
// tap, never the drop fanfare); and the entrance-phase haptic layer
// (which extends lib/entrance-audio.js without replacing it).

import {
  fx,
  unlockFx,
  setFxEnabled,
  setReducedMotion,
  prefersReducedMotion,
  canVibrate,
  isFxUnlocked,
  FX_DEBUG,
  resetFxDebug,
} from '../lib/fx.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- mock browser -----------------------------------------------------------
// Minimal Web Audio mock: enough nodes for tone()/noiseBurst() to run.
function mockAudioContext() {
  const param = () => ({
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  const node = (extra = {}) => Object.assign({ connect() {} }, extra);
  function Ctor() {}
  Ctor.prototype = {
    get currentTime() { return 0; },
    get state() { return 'running'; },
    get destination() { return {}; },
    get sampleRate() { return 44100; },
    resume() { return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createOscillator() {
      return node({ type: 'sine', frequency: param(), start() {}, stop() {} });
    },
    createGain() { return node({ gain: param() }); },
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: { value: 1 } }); },
    createBuffer(ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    createBufferSource() { return node({ start() {}, stop() {} }); },
  };
  return Ctor;
}

const vibrateCalls = [];
function installMocks({ vibrate = true, reducedMotion = false } = {}) {
  vibrateCalls.length = 0;
  global.window = {
    AudioContext: mockAudioContext(),
    matchMedia: (q) => ({ matches: reducedMotion && q.includes('prefers-reduced-motion') }),
  };
  // Node 24 ships a getter-only global navigator; override it properly.
  const nav = {};
  if (vibrate) {
    nav.vibrate = (p) => { vibrateCalls.push(p); return true; };
  }
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

// --- 1. SSR-safe: no window, no navigator ------------------------------------
{
  resetFxDebug();
  const pairs = [
    'tap', 'menuOpen', 'menuClose', 'satelliteDrop', 'bikeMount', 'bikeDismount',
    'entrancePhase', 'checkoutConfirm', 'checkoutCancelled', 'error', 'victory',
    'doorEntry', 'stageWash', 'earthDive',
  ];
  let threw = null;
  try {
    for (const name of pairs) fx[name](name === 'entrancePhase' ? 'drop' : undefined);
    fx.routeLaunch('/persephone');
    fx.routeLaunch('https://stake.com/aff');
  } catch (e) { threw = e; }
  t('all pairs callable with no browser globals (SSR)', threw === null);
  t('every matched pair is defined', pairs.every((n) => typeof fx[n] === 'function'));
  t('routeLaunch defined', typeof fx.routeLaunch === 'function');
  t('stageWash exported (reserved for real ingest)', typeof fx.stageWash === 'function');
}

// --- 2. pre-gesture gate: nothing plays before unlockFx() --------------------
{
  installMocks({ vibrate: true });
  resetFxDebug();
  fx.tap();
  fx.satelliteDrop();
  fx.victory();
  t('not unlocked yet', isFxUnlocked() === false);
  t('no sounds before first gesture (autoplay policy)', FX_DEBUG.sounds.length === 0);
  t('no vibrations fired before first gesture', FX_DEBUG.haptics.every((h) => h.fired === false));
  t('navigator.vibrate never called before unlock', vibrateCalls.length === 0);
}

// --- 3. correspondence: every pair fires sound + haptic ----------------------
{
  installMocks({ vibrate: true });
  unlockFx();
  const correspond = [
    'tap', 'menuOpen', 'menuClose', 'satelliteDrop', 'bikeMount', 'bikeDismount',
    'checkoutConfirm', 'checkoutCancelled', 'error', 'victory',
    'doorEntry', 'stageWash', 'earthDive',
  ];
  for (const name of correspond) {
    resetFxDebug();
    vibrateCalls.length = 0;
    fx[name]();
    t(`${name}: sound played`, FX_DEBUG.sounds.length > 0);
    t(`${name}: haptic fired`, FX_DEBUG.haptics.length > 0 && FX_DEBUG.haptics.every((h) => h.fired));
    t(`${name}: navigator.vibrate called`, vibrateCalls.length > 0);
  }

  // entrancePhase: haptics layer onto the sounds in lib/entrance-audio.js —
  // extend, don't replace. So: haptic yes, added sound no.
  for (const phase of ['static', 'speech', 'glitch', 'commander', 'drop']) {
    resetFxDebug();
    vibrateCalls.length = 0;
    fx.entrancePhase(phase);
    t(`entrancePhase(${phase}): haptic fired`, vibrateCalls.length > 0);
    t(`entrancePhase(${phase}): no duplicate sound (stays in entrance-audio)`, FX_DEBUG.sounds.length === 0);
  }
  resetFxDebug();
  vibrateCalls.length = 0;
  fx.entrancePhase('skipped');
  fx.entrancePhase('completed');
  fx.entrancePhase('bogus');
  t('entrancePhase silent for skip/complete/unknown', vibrateCalls.length === 0 && FX_DEBUG.sounds.length === 0);
}

// --- 4. graceful no-vibration path (iOS Safari: no navigator.vibrate) --------
{
  installMocks({ vibrate: false }); // navigator exists, vibrate does not
  resetFxDebug();
  let threw = null;
  try {
    fx.satelliteDrop();
    fx.victory();
    fx.error();
    fx.entrancePhase('drop');
  } catch (e) { threw = e; }
  t('no-vibrate: pairs do not throw', threw === null);
  t('no-vibrate: sound still plays', FX_DEBUG.sounds.length > 0);
  t('no-vibrate: canVibrate() is false (never faked)', canVibrate() === false);
  t('no-vibrate: haptics recorded as not fired', FX_DEBUG.haptics.length > 0 && FX_DEBUG.haptics.every((h) => h.fired === false));
}

// --- 5. global mute -----------------------------------------------------------
{
  installMocks({ vibrate: true });
  resetFxDebug();
  setFxEnabled(false);
  fx.tap();
  fx.victory();
  fx.entrancePhase('drop');
  t('muted: no sounds', FX_DEBUG.sounds.length === 0);
  t('muted: no vibrations fired', FX_DEBUG.haptics.every((h) => h.fired === false));
  t('muted: canVibrate() false', canVibrate() === false);
  setFxEnabled(true);
  resetFxDebug();
  vibrateCalls.length = 0;
  fx.tap();
  t('re-enabled: FX plays again', FX_DEBUG.sounds.length > 0 && vibrateCalls.length > 0);
}

// --- 6. reduced motion ----------------------------------------------------------
{
  installMocks({ vibrate: true, reducedMotion: false });
  setReducedMotion(true);
  t('prefersReducedMotion() reflects override', prefersReducedMotion() === true);

  resetFxDebug();
  fx.satelliteDrop();
  const dropH = FX_DEBUG.haptics[0].pattern;
  t('reduced: drop collapses to a single short pulse', dropH.length === 1 && dropH[0] <= 25);

  resetFxDebug();
  fx.victory();
  const vicH = FX_DEBUG.haptics[0].pattern;
  t('reduced: victory collapses to a single short pulse', vicH.length === 1 && vicH[0] <= 25);

  resetFxDebug();
  fx.bikeMount();
  const bikeH = FX_DEBUG.haptics[0].pattern;
  t('reduced: bike mount collapses to a single short pulse', bikeH.length === 1 && bikeH[0] <= 25);

  setReducedMotion(false);
  resetFxDebug();
  fx.satelliteDrop();
  const fullH = FX_DEBUG.haptics[0].pattern;
  t('full motion: drop keeps its multi-pulse pattern', fullH.length === 3);
}

// --- 7. routeLaunch: internal drops vs external affiliate links -----------------
{
  installMocks({ vibrate: true });
  resetFxDebug();
  const r1 = fx.routeLaunch('/persephone');
  t("routeLaunch('/persephone') returns 'drop'", r1 === 'drop');
  t('internal route: drop fanfare sounds present', FX_DEBUG.sounds.some((s) => s.kind === 'noise'));

  resetFxDebug();
  const r2 = fx.routeLaunch('https://stake.com/?aff=nexus');
  t('routeLaunch(external url) returns external', r2 === 'external');
  t('affiliate link: neutral tap only, no drop fanfare', !FX_DEBUG.sounds.some((s) => s.kind === 'noise'));
  t('affiliate link: single short haptic, no thud pattern', FX_DEBUG.haptics.every((h) => h.pattern.length === 1));

  resetFxDebug();
  const r3 = fx.routeLaunch(null);
  t('routeLaunch(null) safe, treated as external/neutral', r3 === 'external');
}

// --- 8. sound descriptors are sane ----------------------------------------------
{
  installMocks({ vibrate: true });
  resetFxDebug();
  fx.error();
  t('error sound is low and muted (gain <= 0.08)', FX_DEBUG.sounds.every((s) => s.gain <= 0.08));
  resetFxDebug();
  fx.checkoutConfirm();
  t('checkoutConfirm is a warm 3-note rise (not a fanfare)', FX_DEBUG.sounds.length === 3);
  const freqs = FX_DEBUG.sounds.map((s) => s.freq);
  t('checkoutConfirm notes rise in pitch', freqs[0] < freqs[1] && freqs[1] < freqs[2]);
}

// --- summary ---------------------------------------------------------------------
console.log(`\nfx: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
