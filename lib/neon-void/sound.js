// lib/neon-void/sound.js
// Procedural WebAudio effects for Neon Void. No audio files.
// Follows the neon-racer audio pattern: lazy AudioContext on first user
// gesture, master gain, simple tone()/noise() helpers.

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    if (typeof window === 'undefined') return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
    return true;
  }

  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.12, vol = 0.4, delay = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const api = {
    /** Call from the page's first user gesture. */
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.35;
    },
    // Event -> effect mapping. Drive these from the engine's drained events.
    shard() {
      // Waka-free but familiar: a quick rising blip whose pitch climbs
      // with the combo — all original synthesis.
      const step = Math.min(api._n = (api._n || 0) + 1, 24);
      tone({ freq: 420 + step * 18, freqEnd: 620 + step * 18, type: 'sine', dur: 0.07, vol: 0.3 });
    },
    resetCombo() {
      api._n = 0;
    },
    nova() {
      tone({ freq: 900, freqEnd: 180, type: 'sawtooth', dur: 0.5, vol: 0.35 });
      tone({ freq: 180, freqEnd: 900, type: 'triangle', dur: 0.5, vol: 0.3, delay: 0.08 });
    },
    eatWraith(combo = 0) {
      const base = 500 + combo * 120;
      tone({ freq: base, type: 'square', dur: 0.08, vol: 0.32 });
      tone({ freq: base * 1.5, type: 'square', dur: 0.08, vol: 0.32, delay: 0.08 });
      tone({ freq: base * 2, type: 'square', dur: 0.14, vol: 0.32, delay: 0.16 });
    },
    bonus() {
      tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.35 });
      tone({ freq: 990, type: 'sine', dur: 0.16, vol: 0.35, delay: 0.1 });
    },
    death() {
      api.resetCombo();
      tone({ freq: 500, freqEnd: 60, type: 'sawtooth', dur: 0.9, vol: 0.4 });
      tone({ freq: 250, freqEnd: 40, type: 'triangle', dur: 1.0, vol: 0.35, delay: 0.1 });
    },
    levelClear() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.35, delay: i * 0.12 })
      );
    },
    start() {
      tone({ freq: 392, type: 'triangle', dur: 0.12, vol: 0.3 });
      tone({ freq: 523, type: 'triangle', dur: 0.18, vol: 0.3, delay: 0.12 });
    },
    extraLife() {
      [659, 784, 988, 1318].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 0.14, vol: 0.32, delay: i * 0.09 })
      );
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.35, delay: i * 0.18 })
      );
    },
  };
  return api;
}
