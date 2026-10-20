// lib/tetrus/sound.js
// Procedural WebAudio effects for Tetrus. No audio files.
// Follows the neon-void audio pattern: lazy AudioContext on first user
// gesture, master gain, a simple tone() helper. Stone, bronze and lyre —
// deep locks, ringing clears, and golden arpeggios for the freed children.

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
    move() {
      tone({ freq: 190, type: 'triangle', dur: 0.03, vol: 0.08 });
    },
    rotate() {
      tone({ freq: 320, freqEnd: 430, type: 'triangle', dur: 0.06, vol: 0.16 });
    },
    lock() {
      // Stone settling into the pit: a low thud with a bronze tick.
      tone({ freq: 130, freqEnd: 55, type: 'sine', dur: 0.14, vol: 0.5 });
      tone({ freq: 1180, type: 'square', dur: 0.03, vol: 0.07 });
    },
    hardDrop() {
      tone({ freq: 240, freqEnd: 50, type: 'sawtooth', dur: 0.18, vol: 0.3 });
      tone({ freq: 90, freqEnd: 45, type: 'sine', dur: 0.22, vol: 0.5, delay: 0.02 });
    },
    clear(layers = 1, combo = 1) {
      // The floor sings shut — a lyre arpeggio that climbs with the clear.
      const base = 392 * (1 + Math.min(combo - 1, 4) * 0.08);
      const notes = [1, 1.25, 1.5, 2].slice(0, 2 + Math.min(layers, 2));
      notes.forEach((m, i) =>
        tone({ freq: base * m, type: 'triangle', dur: 0.22, vol: 0.34, delay: i * 0.07 })
      );
      tone({ freq: base * 2, type: 'sine', dur: 0.4, vol: 0.18, delay: notes.length * 0.07 });
    },
    combo(combo = 2) {
      const base = 520 + combo * 60;
      tone({ freq: base, type: 'square', dur: 0.07, vol: 0.2 });
      tone({ freq: base * 1.335, type: 'square', dur: 0.1, vol: 0.2, delay: 0.07 });
    },
    childrenRise() {
      // Golden lights on their way up — soft high shimmer.
      [1318, 1568, 2093].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.1, delay: i * 0.09 })
      );
    },
    levelClear() {
      [392, 523, 659, 784, 1046].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.34, delay: i * 0.11 })
      );
    },
    strain() {
      // Kronos testing the lid: a deep groan of stressed stone.
      tone({ freq: 70, freqEnd: 48, type: 'sawtooth', dur: 0.7, vol: 0.22 });
      tone({ freq: 53, freqEnd: 38, type: 'square', dur: 0.8, vol: 0.14, delay: 0.05 });
    },
    start() {
      tone({ freq: 262, type: 'triangle', dur: 0.14, vol: 0.3 });
      tone({ freq: 392, type: 'triangle', dur: 0.2, vol: 0.3, delay: 0.13 });
    },
    gameOver() {
      [330, 262, 196, 131].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.35, delay: i * 0.2 })
      );
      tone({ freq: 55, freqEnd: 30, type: 'sawtooth', dur: 1.2, vol: 0.25, delay: 0.75 });
    },
    won() {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.3, delay: i * 0.12 })
      );
    },
  };
  return api;
}
