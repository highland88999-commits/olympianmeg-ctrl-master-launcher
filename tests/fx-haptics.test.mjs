// tests/fx-haptics.test.mjs — Headless tests for the haptics-everywhere pass
// (new game-feel pairs in lib/fx.js). Run: node --test tests/fx-haptics.test.mjs
// (from the repo root). No browser, no network.
//
// Covers: every new pair exists and is a MATCHED pair (sound + haptic both
// logged in FX_DEBUG); the throttle() helper drops rapid repeats inside the
// hot pairs (coin, shoot, hit, boost); reduced motion collapses the big
// patterns (death, gameWin, boost) to a single short pulse; the global mute
// silences the new pairs; SSR safety.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fx,
  unlockFx,
  setFxEnabled,
  setReducedMotion,
  canVibrate,
  throttle,
  resetFxThrottle,
  FX_DEBUG,
  resetFxDebug,
} from '../lib/fx.js';

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
function installMocks({ vibrate = true } = {}) {
  vibrateCalls.length = 0;
  global.window = {
    AudioContext: mockAudioContext(),
    matchMedia: () => ({ matches: false }),
  };
  // Node 24 ships a getter-only global navigator; override it properly.
  const nav = {};
  if (vibrate) {
    nav.vibrate = (p) => { vibrateCalls.push(p); return true; };
  }
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

const NEW_PAIRS = [
  'coin', 'jump', 'hit', 'death', 'levelUp', 'checkpoint',
  'gameWin', 'countdownBeep', 'go', 'shoot', 'boost',
];

describe('fx haptics-everywhere: new game-feel pairs', () => {
  it('all new pairs are defined on fx', () => {
    for (const name of NEW_PAIRS) {
      assert.equal(typeof fx[name], 'function', `${name} should be a function`);
    }
    assert.equal(typeof throttle, 'function', 'throttle helper exported');
    assert.equal(typeof resetFxThrottle, 'function', 'resetFxThrottle exported');
  });

  it('new pairs are SSR-safe (no browser globals)', () => {
    delete global.window;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    resetFxDebug();
    assert.doesNotThrow(() => {
      for (const name of NEW_PAIRS) {
        if (name === 'countdownBeep') fx.countdownBeep(false);
        else if (name === 'shoot') fx.shoot('rifle');
        else fx[name]();
      }
    });
  });

  describe('matched pairs: sound + haptic for every new pair', () => {
    beforeEach(() => {
      installMocks({ vibrate: true });
      unlockFx();
      setFxEnabled(true);
      setReducedMotion(false);
      resetFxDebug();
      resetFxThrottle();
      vibrateCalls.length = 0;
    });

    for (const name of NEW_PAIRS) {
      it(`${name}: plays sound AND fires haptic`, () => {
        resetFxDebug();
        resetFxThrottle();
        vibrateCalls.length = 0;
        if (name === 'countdownBeep') {
          fx.countdownBeep(false);
          fx.countdownBeep(true);
        } else if (name === 'shoot') {
          fx.shoot('rifle');
          resetFxThrottle();
          fx.shoot('marksman');
          resetFxThrottle();
          fx.shoot('smg');
        } else {
          fx[name]();
        }
        assert.ok(FX_DEBUG.sounds.length > 0, `${name}: expected sound logged`);
        assert.ok(FX_DEBUG.haptics.length > 0, `${name}: expected haptic logged`);
        assert.ok(
          FX_DEBUG.haptics.every((h) => h.fired),
          `${name}: every haptic should have fired`
        );
        assert.ok(vibrateCalls.length > 0, `${name}: navigator.vibrate called`);
      });
    }

    it('small events stay light (<=120ms patterns)', () => {
      for (const name of ['coin', 'jump', 'checkpoint']) {
        resetFxDebug();
        resetFxThrottle();
        fx[name]();
        for (const h of FX_DEBUG.haptics) {
          const total = (Array.isArray(h.pattern) ? h.pattern : [h.pattern]).reduce((a, b) => a + b, 0);
          assert.ok(total <= 120, `${name}: small-event pattern total ${total}ms > 120ms`);
        }
      }
    });

    it('levelUp is a rising arpeggio, distinct from victory()', () => {
      resetFxDebug();
      resetFxThrottle();
      fx.levelUp();
      const freqs = FX_DEBUG.sounds.filter((s) => s.kind === 'tone').map((s) => s.freq);
      assert.ok(freqs.length >= 4, `levelUp: expected >= 4 tones, got ${freqs.length}`);
      for (let i = 1; i < freqs.length; i++) {
        assert.ok(freqs[i] > freqs[i - 1], 'levelUp: tones rise in pitch');
      }
    });

    it('countdownBeep(final=true) is higher and longer than a plain tick', () => {
      resetFxDebug();
      fx.countdownBeep(false);
      const plain = FX_DEBUG.sounds[0];
      resetFxDebug();
      fx.countdownBeep(true);
      const fin = FX_DEBUG.sounds[0];
      assert.ok(fin.freq > plain.freq, 'final beep is higher pitched');
      assert.ok(fin.dur >= plain.dur, 'final beep is at least as long');
    });
  });

  describe('throttle() drops rapid repeats', () => {
    beforeEach(() => {
      installMocks({ vibrate: true });
      unlockFx();
      setFxEnabled(true);
      setReducedMotion(false);
      resetFxDebug();
      resetFxThrottle();
    });

    it('throttle() allows the first fire, drops the immediate second', () => {
      assert.equal(throttle('t:test', 1000), true);
      assert.equal(throttle('t:test', 1000), false);
    });

    it('coin shower: only the first of a rapid burst plays', () => {
      resetFxThrottle();
      resetFxDebug();
      fx.coin(); fx.coin(); fx.coin(); fx.coin(); fx.coin();
      assert.equal(FX_DEBUG.haptics.length, 1, 'one coin pair for the burst');
    });

    it('automatic fire: shoot() throttles', () => {
      resetFxThrottle();
      resetFxDebug();
      fx.shoot('smg'); fx.shoot('smg'); fx.shoot('smg');
      assert.equal(FX_DEBUG.haptics.length, 1, 'one shoot pair for the burst');
    });

    it('hit flurry: hit() throttles', () => {
      resetFxThrottle();
      resetFxDebug();
      fx.hit(); fx.hit();
      assert.equal(FX_DEBUG.haptics.length, 1, 'one hit pair for the flurry');
    });

    it('boost: held boost fires at most ~once a second', () => {
      resetFxThrottle();
      resetFxDebug();
      fx.boost(); fx.boost(); fx.boost();
      assert.equal(FX_DEBUG.haptics.length, 1, 'one boost pair for held boost');
    });
  });

  describe('reduced motion collapses the big patterns', () => {
    beforeEach(() => {
      installMocks({ vibrate: true });
      unlockFx();
      setFxEnabled(true);
      resetFxDebug();
      resetFxThrottle();
    });

    for (const name of ['death', 'gameWin', 'boost']) {
      it(`${name}: collapses to a single short pulse`, () => {
        setReducedMotion(true);
        resetFxDebug();
        resetFxThrottle();
        vibrateCalls.length = 0;
        fx[name]();
        assert.ok(FX_DEBUG.haptics.length > 0, 'haptic still logged');
        const p = FX_DEBUG.haptics[0].pattern;
        assert.ok(Array.isArray(p) && p.length === 1, `${name}: expected single pulse, got ${JSON.stringify(p)}`);
        assert.ok(p[0] <= 25, `${name}: pulse ${p[0]}ms > 25ms`);
        assert.ok(vibrateCalls.length > 0, 'vibrate still called (collapsed)');
        setReducedMotion(false);
      });
    }

    it('full motion keeps the multi-pulse patterns', () => {
      setReducedMotion(false);
      resetFxDebug();
      resetFxThrottle();
      fx.death();
      const p = FX_DEBUG.haptics[0].pattern;
      assert.ok(p.length === 3, `death keeps 3-pulse rumble, got ${JSON.stringify(p)}`);
      resetFxDebug();
      resetFxThrottle();
      fx.gameWin();
      const g = FX_DEBUG.haptics[0].pattern;
      assert.ok(g.length === 5, `gameWin keeps 5-pulse fanfare, got ${JSON.stringify(g)}`);
    });

    it('small pairs stay crisp under reduced motion', () => {
      setReducedMotion(true);
      resetFxDebug();
      resetFxThrottle();
      fx.coin();
      const p = FX_DEBUG.haptics[0].pattern;
      assert.deepEqual(p, [10], 'coin stays a single 10ms tick');
      setReducedMotion(false);
    });
  });

  describe('global mute silences the new pairs', () => {
    beforeEach(() => {
      installMocks({ vibrate: true });
      unlockFx();
      setReducedMotion(false);
      resetFxDebug();
      resetFxThrottle();
      vibrateCalls.length = 0;
    });

    it('setFxEnabled(false): no sounds, no fired vibrations', () => {
      setFxEnabled(false);
      for (const name of NEW_PAIRS) {
        resetFxDebug();
        resetFxThrottle();
        if (name === 'countdownBeep') fx.countdownBeep(true);
        else if (name === 'shoot') fx.shoot('smg');
        else fx[name]();
        assert.equal(FX_DEBUG.sounds.length, 0, `${name}: muted, no sounds`);
        assert.ok(FX_DEBUG.haptics.every((h) => !h.fired), `${name}: muted, no fired haptics`);
      }
      assert.equal(canVibrate(), false, 'canVibrate() false while muted');
      assert.equal(vibrateCalls.length, 0, 'navigator.vibrate never called while muted');
      setFxEnabled(true);
    });

    it('re-enabled: new pairs play again', () => {
      setFxEnabled(false);
      setFxEnabled(true);
      resetFxDebug();
      resetFxThrottle();
      fx.gameWin();
      assert.ok(FX_DEBUG.sounds.length > 0, 'sound plays after re-enable');
      assert.ok(vibrateCalls.length > 0, 'vibrate fires after re-enable');
    });
  });

  describe('honest iOS degradation (no navigator.vibrate)', () => {
    beforeEach(() => {
      installMocks({ vibrate: false });
      unlockFx();
      setFxEnabled(true);
      setReducedMotion(false);
      resetFxDebug();
      resetFxThrottle();
    });

    it('new pairs stay sound-only, never faked', () => {
      for (const name of NEW_PAIRS) {
        resetFxDebug();
        resetFxThrottle();
        if (name === 'countdownBeep') fx.countdownBeep(false);
        else if (name === 'shoot') fx.shoot('rifle');
        else fx[name]();
        assert.ok(FX_DEBUG.sounds.length > 0, `${name}: sound still plays`);
        assert.ok(FX_DEBUG.haptics.every((h) => !h.fired), `${name}: haptics recorded as not fired`);
      }
      assert.equal(canVibrate(), false, 'canVibrate() false without the API (never faked)');
    });
  });
});
