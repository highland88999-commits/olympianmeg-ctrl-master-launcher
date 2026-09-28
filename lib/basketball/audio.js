// Streetball — procedural WebAudio sound effects. No audio files needed.
// Everything is synthesized: ball bounces, rim clang, swish, buzzer, crowd.
// The AudioContext is created lazily on the first user gesture.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.crowdNodes = null;
    this.muted = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.crowdNodes) this.crowdNodes.gain.gain.value = m ? 0 : 0.05;
  }

  // --- primitives ---------------------------------------------------------
  _tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.2, gain = 0.2, when = 0 }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.3, gain = 0.2, filterType = 'bandpass', freq = 2000, freqEnd = null, q = 1, when = 0 }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // --- game sounds ----------------------------------------------------------
  bounce(intensity = 0.5) {
    const k = Math.min(1, Math.max(0.05, intensity));
    this._tone({ freq: 160, freqEnd: 65, type: 'sine', dur: 0.13, gain: 0.25 * k + 0.05 });
  }

  rim(intensity = 0.6) {
    const k = Math.min(1, Math.max(0.1, intensity));
    // metallic clang: inharmonic partials
    this._tone({ freq: 612, type: 'triangle', dur: 0.28, gain: 0.16 * k });
    this._tone({ freq: 917, type: 'triangle', dur: 0.22, gain: 0.1 * k });
    this._tone({ freq: 1443, type: 'sine', dur: 0.16, gain: 0.07 * k });
  }

  board() {
    this._tone({ freq: 130, freqEnd: 70, type: 'sine', dur: 0.14, gain: 0.22 });
    this._noise({ dur: 0.08, gain: 0.1, filterType: 'lowpass', freq: 500 });
  }

  swish() {
    this._noise({ dur: 0.32, gain: 0.28, filterType: 'bandpass', freq: 3400, freqEnd: 750, q: 0.8 });
  }

  score(streak = 0) {
    // rising chime; pitch climbs with the streak
    const base = 520 + Math.min(streak, 6) * 60;
    this._tone({ freq: base, type: 'sine', dur: 0.16, gain: 0.18 });
    this._tone({ freq: base * 1.335, type: 'sine', dur: 0.22, gain: 0.16, when: 0.09 });
  }

  buzzer() {
    this._tone({ freq: 174, type: 'sawtooth', dur: 1.1, gain: 0.22 });
    this._tone({ freq: 87, type: 'square', dur: 1.1, gain: 0.08 });
  }

  buzzerBeater() {
    this.score(6);
    this._tone({ freq: 880, type: 'sine', dur: 0.5, gain: 0.2, when: 0.15 });
    this._tone({ freq: 1174, type: 'sine', dur: 0.7, gain: 0.2, when: 0.3 });
  }

  click() {
    this._tone({ freq: 700, freqEnd: 500, type: 'sine', dur: 0.07, gain: 0.12 });
  }

  whistle() {
    this._tone({ freq: 2300, freqEnd: 2600, type: 'sine', dur: 0.35, gain: 0.14 });
  }

  crowdCheer(big = false) {
    this._noise({
      dur: big ? 1.6 : 0.9, gain: big ? 0.3 : 0.18,
      filterType: 'bandpass', freq: 900, q: 0.4,
    });
  }

  // --- crowd ambience loop ----------------------------------------------------
  startCrowd() {
    const ctx = this.ensure();
    if (!ctx || this.crowdNodes) return;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: cheap low rumble of a crowd
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.05;
    // slow swell LFO so the crowd feels alive
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    lfo.start();
    this.crowdNodes = { src, lfo, gain };
  }

  stopCrowd() {
    if (!this.crowdNodes) return;
    try {
      this.crowdNodes.src.stop();
      this.crowdNodes.lfo.stop();
    } catch {
      /* already stopped */
    }
    this.crowdNodes = null;
  }
}
