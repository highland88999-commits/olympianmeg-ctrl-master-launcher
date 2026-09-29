// lib/entrance-audio.js — 100% synthesized sound for the entrance cinematic.
//
// No audio files, no copyrighted material: every sound is generated with the
// Web Audio API (oscillators + a generated noise buffer). Everything is
// guarded so a missing/blocked AudioContext (SSR, autoplay policy, old
// browsers) silently degrades to silence instead of crashing.
//
// FX PASS HOOKS (for the upcoming sound/haptics pass):
//   1. `window` CustomEvent 'nexus:entrance-phase' with detail { phase }
//      fires on every phase change from components/EntranceSequence.jsx —
//      subscribe to it to layer richer sound or haptics per phase.
//   2. The functions below are intentionally thin wrappers; replace or
//      extend per-phase bodies without touching the component.
//   3. Call `setEntranceAudioEnabled(false)` to mute the intro globally
//      (e.g. when a user-level mute setting exists).

let ctx = null;
let enabled = true;
let masterGain = null;

export function setEntranceAudioEnabled(v) {
  enabled = !!v;
  if (!enabled) stopAllEntranceAudio();
}

/** Try to get a running AudioContext; null when unavailable (SSR/blocked). */
function audio() {
  if (typeof window === 'undefined' || !enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      // Autoplay policy: only resumes after a user gesture. Never throws.
      ctx.resume().catch(() => {});
    }
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

/** Call from the first user gesture inside the intro overlay. */
export function unlockEntranceAudio() {
  audio();
}

function makeNoiseBuffer(c) {
  const len = c.sampleRate * 1.5;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(c, dest, { freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.08, slideTo = null }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(c, dest, { at = 0, dur = 0.5, gain = 0.05, filterFreq = 3000, slideTo = null }) {
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFreq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** One synthesized cue per cinematic phase. Safe to call any time. */
export function playPhaseSound(phase) {
  const c = audio();
  if (!c || !masterGain) return;
  try {
    switch (phase) {
      case 'static':
        // broadcast hiss while the signal locks
        noiseBurst(c, masterGain, { dur: 1.6, gain: 0.045, filterFreq: 4500 });
        break;
      case 'speech':
        // two soft broadcast beeps under the podium address
        blip(c, masterGain, { freq: 220, type: 'square', dur: 0.12, gain: 0.03 });
        blip(c, masterGain, { freq: 220, type: 'square', at: 0.25, dur: 0.12, gain: 0.03 });
        break;
      case 'glitch':
        // harsh hijack stutter
        blip(c, masterGain, { freq: 180, type: 'sawtooth', dur: 0.12, gain: 0.06, slideTo: 60 });
        blip(c, masterGain, { freq: 320, type: 'sawtooth', at: 0.14, dur: 0.12, gain: 0.06, slideTo: 90 });
        blip(c, masterGain, { freq: 140, type: 'sawtooth', at: 0.28, dur: 0.2, gain: 0.07, slideTo: 50 });
        break;
      case 'commander':
        // deep two-note sting: "We DROP it."
        blip(c, masterGain, { freq: 82, type: 'sine', dur: 0.7, gain: 0.12 });
        blip(c, masterGain, { freq: 55, type: 'sine', at: 0.5, dur: 1.1, gain: 0.14 });
        break;
      case 'drop':
        // rising whoosh into a low orbital thud as satellites seat into rings
        noiseBurst(c, masterGain, { dur: 1.4, gain: 0.05, filterFreq: 400, slideTo: 5000 });
        blip(c, masterGain, { freq: 48, type: 'sine', at: 1.1, dur: 1.2, gain: 0.16, slideTo: 30 });
        break;
      default:
        break;
    }
  } catch {
    // audio must never break the cinematic
  }
}

export function stopAllEntranceAudio() {
  try {
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      masterGain = null;
    }
  } catch {
    // ignore
  }
}
