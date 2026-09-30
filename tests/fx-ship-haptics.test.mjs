// tests/fx-ship-haptics.test.mjs — Merlin's battleship spec + the native/web
// haptic channel. Run: node --test tests/fx-ship-haptics.test.mjs
//
// Covers:
// - shipHit / shipMiss / shipSunk exist and are matched pairs (sound + haptic
//   both logged in FX_DEBUG), with the exact patterns Merlin specified:
//   HIT = [50, 60, 50] (medium double-pulse), MISS = [15] (light tick),
//   SINK = [120, 80, 220] (heavy long pattern).
// - The sink explosion is IDENTICAL no matter which direction the ship sank
//   (one function, one sound body, one pattern — verified by calling it
//   twice and comparing the logged descriptors).
// - fx.pulse() is haptic-only: it logs a haptic, never a sound (for modules
//   like omega-pinball and guillotine that already own their audio).
// - fx.unlock() is a matched pair (OASIS boss unlocks, program unlocks).
// - patternHaptic() (lib/native.js) on web: passes the exact pattern to
//   navigator.vibrate and reports 'vibrate'; with no vibrate API it reports
//   'none' and never throws.
// - The global nexus_fx_enabled toggle silences the new pairs entirely.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fx,
  unlockFx,
  setFxEnabled,
  setReducedMotion,
  canVibrate,
  resetFxDebug,
  FX_DEBUG,
} from '../lib/fx.js';
import { patternHaptic } from '../lib/native.js';

// --- mock browser (mirrors tests/fx-haptics.test.mjs) -----------------------
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
function installMocks({ vibrate = true } = {}) {
  vibrateCalls.length = 0;
  global.window = {
    AudioContext: mockAudioContext(),
    matchMedia: () => ({ matches: false }),
  };
  const nav = {};
  if (vibrate) {
    nav.vibrate = (p) => { vibrateCalls.push(Array.isArray(p) ? p.slice() : p); return true; };
  }
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

describe('battleship haptics (Merlin spec)', () => {
  beforeEach(() => {
    installMocks({ vibrate: true });
    unlockFx();
    setFxEnabled(true);
    setReducedMotion(false);
    resetFxDebug();
  });

  it('shipHit / shipMiss / shipSunk / pulse / unlock are defined', () => {
    for (const name of ['shipHit', 'shipMiss', 'shipSunk', 'pulse', 'unlock']) {
      assert.equal(typeof fx[name], 'function', `${name} should be a function`);
    }
  });

  it('HIT = medium double-pulse [50, 60, 50] with a thud sound', () => {
    fx.shipHit();
    assert.equal(FX_DEBUG.haptics.length, 1);
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [50, 60, 50]);
    assert.equal(FX_DEBUG.haptics[0].fired, true);
    assert.ok(FX_DEBUG.sounds.length > 0, 'sound must accompany the haptic');
    assert.deepEqual(vibrateCalls[0], [50, 60, 50]);
  });

  it('MISS = light single tick [15] with a soft plop', () => {
    fx.shipMiss();
    assert.equal(FX_DEBUG.haptics.length, 1);
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [15]);
    assert.equal(FX_DEBUG.haptics[0].fired, true);
    assert.ok(FX_DEBUG.sounds.length > 0);
    assert.deepEqual(vibrateCalls[0], [15]);
  });

  it('SINK = heavy long pattern [120, 80, 220] with the explosion sound', () => {
    fx.shipSunk();
    assert.equal(FX_DEBUG.haptics.length, 1);
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [120, 80, 220]);
    assert.equal(FX_DEBUG.haptics[0].fired, true);
    // The explosion: filtered noise + sub rumble.
    const noises = FX_DEBUG.sounds.filter((s) => s.kind === 'noise');
    const tones = FX_DEBUG.sounds.filter((s) => s.kind === 'tone');
    assert.ok(noises.length > 0, 'explosion noise burst expected');
    assert.ok(tones.length > 0, 'sub rumble expected');
    assert.deepEqual(vibrateCalls[0], [120, 80, 220]);
  });

  it('the sink explosion is identical in both directions (one function, one sound)', () => {
    fx.shipSunk(); // "I sank theirs"
    const firstSounds = JSON.stringify(FX_DEBUG.sounds);
    const firstHaptics = JSON.stringify(FX_DEBUG.haptics);
    resetFxDebug();
    fx.shipSunk(); // "they sank mine"
    assert.equal(JSON.stringify(FX_DEBUG.sounds), firstSounds);
    assert.equal(JSON.stringify(FX_DEBUG.haptics), firstHaptics);
  });

  it('pulse() is haptic-only: vibration logged, no sound', () => {
    fx.pulse([40, 40, 80]);
    assert.equal(FX_DEBUG.haptics.length, 1);
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [40, 40, 80]);
    assert.equal(FX_DEBUG.sounds.length, 0, 'pulse must not make sound');
    assert.deepEqual(vibrateCalls[0], [40, 40, 80]);
  });

  it('unlock() is a matched pair (sound + shimmer haptic)', () => {
    fx.unlock();
    assert.equal(FX_DEBUG.haptics.length, 1);
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [20, 50, 40]);
    assert.ok(FX_DEBUG.sounds.length > 0);
  });

  it('the global toggle silences hit/miss/sink entirely', () => {
    setFxEnabled(false);
    fx.shipHit(); fx.shipMiss(); fx.shipSunk(); fx.pulse([10]);
    assert.equal(FX_DEBUG.haptics.filter((h) => h.fired).length, 0);
    assert.equal(vibrateCalls.length, 0);
    assert.equal(canVibrate(), false);
    setFxEnabled(true);
  });

  it('reduced motion collapses the sink to a single short pulse', () => {
    setReducedMotion(true);
    fx.shipSunk();
    assert.deepEqual(FX_DEBUG.haptics[0].pattern, [25]);
    setReducedMotion(false);
  });
});

describe('patternHaptic shared channel (lib/native.js)', () => {
  it('web path: passes the exact pattern through and reports vibrate', async () => {
    installMocks({ vibrate: true });
    const channel = await patternHaptic([120, 80, 220]);
    assert.equal(channel, 'vibrate');
    assert.deepEqual(vibrateCalls[0], [120, 80, 220]);
  });

  it('no vibration API: reports none and never throws', async () => {
    installMocks({ vibrate: false });
    const channel = await patternHaptic([15]);
    assert.equal(channel, 'none');
    assert.equal(vibrateCalls.length, 0);
  });

  it('accepts a single duration too', async () => {
    installMocks({ vibrate: true });
    const channel = await patternHaptic(40);
    assert.equal(channel, 'vibrate');
    assert.equal(vibrateCalls[0], 40);
  });
});
