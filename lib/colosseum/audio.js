// Colosseum — procedural sound effects. WebAudio only, no assets.
// Mirrors the basketball SoundFX pattern: created on user gesture.
'use client';

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (!this.ctx && typeof window !== 'undefined') {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch { /* no audio */ }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) { this.muted = !!m; }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.25, delay = 0, lowpass = 1200) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t0);
  }

  click() { this.tone(660, 0.07, 'triangle', 0.12); }
  strike() { this.noise(0.12, 0.3, 0, 900); this.tone(180, 0.1, 'square', 0.12, 90); }
  kill(combo = 1) {
    const base = 300 + Math.min(combo, 8) * 60;
    this.tone(base, 0.12, 'triangle', 0.2, base * 1.6);
    this.tone(base * 2, 0.1, 'sine', 0.1, null, 0.05);
  }
  finish() {
    this.tone(220, 0.15, 'sawtooth', 0.2, 440);
    this.tone(440, 0.2, 'triangle', 0.22, 880, 0.08);
    this.tone(660, 0.25, 'triangle', 0.2, 1320, 0.16);
  }
  hurt() { this.tone(140, 0.25, 'sawtooth', 0.25, 70); this.noise(0.2, 0.2, 0, 500); }
  inject() {
    this.tone(80, 0.5, 'sine', 0.3, 400);
    this.noise(0.5, 0.25, 0.05, 2500);
  }
  horn() {
    // round-start war horn
    this.tone(98, 0.7, 'sawtooth', 0.22);
    this.tone(147, 0.7, 'sawtooth', 0.18, null, 0.02);
    this.tone(196, 0.9, 'sawtooth', 0.15, null, 0.35);
  }
  buzzer() { this.tone(220, 0.5, 'square', 0.2, 110); }
  enrage() { this.tone(70, 0.6, 'sawtooth', 0.3, 45); this.tone(105, 0.6, 'sawtooth', 0.2, 60, 0.1); }
}
