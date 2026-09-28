// Neon Racer — procedural WebAudio sound effects. No audio files, no streams.
// Everything is synthesized. Context is created on user gesture (ENGINE START).

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // Shared noise buffer for explosions.
    const len = ctx.sampleRate * 0.6;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.4, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.4, vol = 0.5, filterFreq = 1200, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    f.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    shoot() {
      tone({ freq: 880, freqEnd: 220, type: 'square', dur: 0.12, vol: 0.16 });
    },
    explosion() {
      noise({ dur: 0.45, vol: 0.5, filterFreq: 1600 });
      tone({ freq: 160, freqEnd: 40, type: 'triangle', dur: 0.4, vol: 0.35 });
    },
    pickup() {
      tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.3 });
      tone({ freq: 990, type: 'sine', dur: 0.14, vol: 0.3, delay: 0.08 });
    },
    warp() {
      tone({ freq: 180, freqEnd: 1400, type: 'sawtooth', dur: 0.7, vol: 0.28 });
      noise({ dur: 0.7, vol: 0.2, filterFreq: 4000 });
    },
    hit() {
      noise({ dur: 0.5, vol: 0.6, filterFreq: 900 });
      tone({ freq: 110, freqEnd: 35, type: 'sawtooth', dur: 0.5, vol: 0.4 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.35, delay: i * 0.14 })
      );
    },
    lose() {
      [330, 262, 196, 131].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.32, vol: 0.32, delay: i * 0.16 })
      );
    },
    dispose() {
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
