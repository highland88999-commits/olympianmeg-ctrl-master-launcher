// lib/tidal-rush/sound.js
// Procedural WebAudio effects for Tidal Rush. No audio files.
// Lazy AudioContext on first user gesture, master gain, tone()/noise()
// helpers — plus a continuous engine hum whose pitch tracks your speed.

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null; // { osc, gain, filter }

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

  function noise({ dur = 0.3, vol = 0.3, delay = 0, freqFrom = 400, freqTo = 1200, q = 1 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freqFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
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

    // --- continuous engine hum -------------------------------------------
    engineStart() {
      if (!ensure() || engine) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(muted ? 0 : 0.11, ctx.currentTime + 0.4);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      engine = { osc, gain, filter };
    },
    /** speed01: 0 (idle) .. 1 (full boost) */
    engineSet(speed01) {
      if (!engine || !ctx) return;
      const s = Math.max(0, Math.min(1.3, speed01));
      const t = ctx.currentTime;
      engine.osc.frequency.setTargetAtTime(55 + s * 105, t, 0.06);
      engine.filter.frequency.setTargetAtTime(420 + s * 900, t, 0.08);
    },
    engineStop() {
      if (!engine || !ctx) return;
      const e = engine;
      engine = null;
      e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(() => {
        try {
          e.osc.stop();
        } catch {
          /* already gone */
        }
      }, 350);
    },

    // --- one-shots ---------------------------------------------------------
    beep(final = false) {
      tone({ freq: final ? 1320 : 880, type: 'square', dur: final ? 0.4 : 0.16, vol: 0.3 });
    },
    buoyPass() {
      tone({ freq: 1046, type: 'sine', dur: 0.09, vol: 0.28 });
      tone({ freq: 1568, type: 'sine', dur: 0.14, vol: 0.28, delay: 0.07 });
    },
    missedGate() {
      tone({ freq: 220, freqEnd: 160, type: 'square', dur: 0.22, vol: 0.25 });
    },
    orb() {
      tone({ freq: 740, type: 'sine', dur: 0.08, vol: 0.3 });
      tone({ freq: 1108, type: 'sine', dur: 0.12, vol: 0.3, delay: 0.06 });
    },
    boostStart() {
      noise({ dur: 0.45, vol: 0.32, freqFrom: 300, freqTo: 2600, q: 0.8 });
    },
    splash(big = false) {
      noise({ dur: big ? 0.5 : 0.22, vol: big ? 0.34 : 0.16, freqFrom: 900, freqTo: 300, q: 0.6 });
    },
    collision() {
      tone({ freq: 90, freqEnd: 45, type: 'sine', dur: 0.25, vol: 0.5 });
      noise({ dur: 0.18, vol: 0.25, freqFrom: 500, freqTo: 150, q: 0.7 });
    },
    lap() {
      [659, 880].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.3, delay: i * 0.1 }));
    },
    finish(win = false) {
      const seq = win ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
      seq.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.32, delay: i * 0.13 }));
    },
  };
  return api;
}
