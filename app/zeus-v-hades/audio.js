'use strict';

// Tiny WebAudio sound effects for the Neon Soul Race. All sounds are
// synthesized with oscillators — no audio files, no network. The AudioContext
// is created lazily on first user gesture.

export function createSfx() {
  let ctx = null;
  let muted = false;

  function ac() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    setMuted(m) {
      muted = !!m;
    },
    get muted() {
      return muted;
    },
    // Warm up the context from a user gesture.
    unlock() {
      ac();
    },
    soul() {
      tone(660, 0.12, 'sine', 0.1, 990);
    },
    bolt() {
      tone(440, 0.18, 'square', 0.08, 1320);
    },
    boostReady() {
      tone(520, 0.1, 'triangle', 0.1);
      setTimeout(() => tone(780, 0.14, 'triangle', 0.1), 90);
    },
    boost() {
      tone(180, 0.5, 'sawtooth', 0.1, 720);
    },
    hit() {
      tone(160, 0.25, 'sawtooth', 0.14, 60);
    },
    count() {
      tone(440, 0.12, 'square', 0.08);
    },
    go() {
      tone(880, 0.3, 'square', 0.1);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.12), i * 130));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 150));
    },
  };
}
