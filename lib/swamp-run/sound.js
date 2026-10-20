// lib/swamp-run/sound.js
// Procedural WebAudio effects for Swamp Run. No audio files.
// Lazy AudioContext on first user gesture, master gain, tone()/noise()
// helpers — plus a living swamp ambience (frogs, crickets, distant birds)
// synthesized from scheduled chirps while the run is live.

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;
  let ambientTimer = null;

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
    master.gain.value = muted ? 0 : 0.4;
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
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, delay = 0, freq = 900, q = 0.8, sweepTo = null }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
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
      if (master) master.gain.value = muted ? 0 : 0.4;
    },

    // -- swamp life ------------------------------------------------------
    ambientStart() {
      if (!ensure() || ambientTimer) return;
      const chirp = () => {
        if (muted) return;
        const roll = Math.random();
        if (roll < 0.45) {
          // frog croak: two low square blips
          tone({ freq: 130 + Math.random() * 60, type: 'square', dur: 0.09, vol: 0.1 });
          tone({ freq: 110 + Math.random() * 50, type: 'square', dur: 0.11, vol: 0.09, delay: 0.14 });
        } else if (roll < 0.8) {
          // cricket trill: fast high pulses
          for (let i = 0; i < 4; i++) {
            tone({ freq: 4200 + Math.random() * 600, type: 'sine', dur: 0.03, vol: 0.045, delay: i * 0.055 });
          }
        } else {
          // distant heron cry
          tone({ freq: 900, freqEnd: 500, type: 'sawtooth', dur: 0.35, vol: 0.05 });
        }
      };
      chirp();
      ambientTimer = setInterval(chirp, 2600);
    },
    ambientStop() {
      if (ambientTimer) {
        clearInterval(ambientTimer);
        ambientTimer = null;
      }
    },

    // -- the run ---------------------------------------------------------
    paddle() {
      noise({ dur: 0.16, vol: 0.22, freq: 700, sweepTo: 300 });
    },
    sprintPaddle() {
      noise({ dur: 0.12, vol: 0.3, freq: 950, sweepTo: 350 });
      noise({ dur: 0.1, vol: 0.2, freq: 1200, delay: 0.05 });
    },
    splash(big = false) {
      noise({ dur: big ? 0.5 : 0.25, vol: big ? 0.5 : 0.3, freq: 800, sweepTo: 200 });
    },
    step() {
      noise({ dur: 0.09, vol: 0.14, freq: 380, sweepTo: 180 });
    },
    growl() {
      // Sub-bass rumble with a slow tremolo — the swamp answering back.
      tone({ freq: 68, freqEnd: 52, type: 'sawtooth', dur: 1.1, vol: 0.42 });
      tone({ freq: 96, freqEnd: 70, type: 'triangle', dur: 1.1, vol: 0.3, delay: 0.05 });
      tone({ freq: 55, type: 'square', dur: 0.16, vol: 0.22, delay: 0.15 });
      tone({ freq: 55, type: 'square', dur: 0.16, vol: 0.22, delay: 0.5 });
    },
    sting() {
      // Chase sting: a dissonant hit that says RUN.
      tone({ freq: 233, type: 'sawtooth', dur: 0.5, vol: 0.4 });
      tone({ freq: 247, type: 'sawtooth', dur: 0.5, vol: 0.4 });
      tone({ freq: 116, freqEnd: 58, type: 'triangle', dur: 0.7, vol: 0.45 });
      noise({ dur: 0.3, vol: 0.25, freq: 2000, sweepTo: 500 });
    },
    ram() {
      noise({ dur: 0.45, vol: 0.55, freq: 500, sweepTo: 120 });
      tone({ freq: 120, freqEnd: 45, type: 'sine', dur: 0.5, vol: 0.55 });
    },
    tick() {
      tone({ freq: 1180, type: 'sine', dur: 0.05, vol: 0.25 });
    },
    graceEnd() {
      tone({ freq: 196, type: 'sawtooth', dur: 0.4, vol: 0.4 });
      tone({ freq: 185, type: 'sawtooth', dur: 0.4, vol: 0.4, delay: 0.02 });
    },
    chomp() {
      noise({ dur: 0.18, vol: 0.6, freq: 1600, sweepTo: 300 });
      tone({ freq: 90, freqEnd: 38, type: 'sine', dur: 0.6, vol: 0.6, delay: 0.03 });
      tone({ freq: 60, freqEnd: 30, type: 'sawtooth', dur: 0.7, vol: 0.4, delay: 0.12 });
    },
    start() {
      tone({ freq: 392, type: 'triangle', dur: 0.12, vol: 0.3 });
      tone({ freq: 523, type: 'triangle', dur: 0.18, vol: 0.3, delay: 0.12 });
    },
  };
  return api;
}
