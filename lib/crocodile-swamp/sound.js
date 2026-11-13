// lib/crocodile-swamp/sound.js
// Procedural WebAudio effects for Crocodile Swamp. No audio files.
// Lazy AudioContext on first user gesture, master gain, tone()/noise()
// helpers — same pattern as neon-void's sound module.

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
    master.gain.value = muted ? 0 : 0.32;
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

  function noise({ dur = 0.25, vol = 0.3, delay = 0, low = 400, high = 1200 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(low, t0);
    filter.frequency.exponentialRampToValueAtTime(high, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const api = {
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.32;
    },
    paddle() {
      noise({ dur: 0.18, vol: 0.12, low: 500, high: 900 });
    },
    splash() {
      noise({ dur: 0.3, vol: 0.25, low: 600, high: 1600 });
    },
    spotted() {
      // Two low, rising warnings — something just noticed you.
      tone({ freq: 98, freqEnd: 146, type: 'sawtooth', dur: 0.35, vol: 0.3 });
      tone({ freq: 98, freqEnd: 164, type: 'sawtooth', dur: 0.4, vol: 0.3, delay: 0.3 });
    },
    bump() {
      noise({ dur: 0.4, vol: 0.5, low: 200, high: 700 });
      tone({ freq: 160, freqEnd: 50, type: 'square', dur: 0.35, vol: 0.4 });
      noise({ dur: 0.6, vol: 0.35, low: 700, high: 1800, delay: 0.1 });
    },
    landfall() {
      noise({ dur: 0.25, vol: 0.3, low: 300, high: 600 });
      tone({ freq: 220, type: 'triangle', dur: 0.15, vol: 0.3, delay: 0.05 });
      tone({ freq: 330, type: 'triangle', dur: 0.2, vol: 0.3, delay: 0.16 });
    },
    hunt() {
      tone({ freq: 130, freqEnd: 65, type: 'sawtooth', dur: 0.8, vol: 0.38 });
      tone({ freq: 65, type: 'square', dur: 0.8, vol: 0.2, delay: 0.05 });
    },
    caught() {
      noise({ dur: 0.7, vol: 0.55, low: 300, high: 1400 });
      tone({ freq: 300, freqEnd: 40, type: 'sawtooth', dur: 0.9, vol: 0.42, delay: 0.05 });
    },
    start() {
      tone({ freq: 196, type: 'triangle', dur: 0.14, vol: 0.3 });
      tone({ freq: 262, type: 'triangle', dur: 0.2, vol: 0.3, delay: 0.13 });
    },
    gameOver() {
      [262, 220, 175, 131].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.32, delay: i * 0.22 })
      );
    },
  };
  return api;
}
