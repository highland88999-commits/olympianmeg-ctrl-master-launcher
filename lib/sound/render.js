// lib/sound/render.js
// SOUND STUDIO (Merlin, Nov 12, 2026) — offline rendering, pure module.
//
// Renders a species' sound profile into PCM samples and a WAV file
// with no window and no AudioContext, so node tests can assert it.
// The browser page renders through OfflineAudioContext first (the
// exact Web Audio graph the live engine uses — see lib/sound/offline.js)
// and falls back to this pure renderer when OfflineAudioContext is
// unavailable. Both paths honour the profile: frequency sweep,
// harmonics, envelope, pattern, and volume.
//
// A chorus is endless live; a downloadable file gets CHORUS_CALLS
// calls and then stops. Silent profiles render nothing — never
// invent a sound.

import { voicePlan, envelopePoints, expandPattern } from './math.js';

export const RENDER_SAMPLE_RATE = 44100;
export const CHORUS_CALLS = 3;
export const RENDER_TAIL = 0.15; // seconds of silence after the last call

/** "Gray wolf" -> "gray-wolf". File-name safe, lowercase, hyphens. */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'sound';
}

/** "Gray wolf" + "howl" -> "gray-wolf-howl.wav". Uses the context that
 *  is actually in the file (the resolved profile's context). */
export function buildFileName(profile, context = null) {
  const name = slugify((profile && profile.species) || (profile && profile.id) || 'sound');
  const ctx = slugify(context || (profile && profile.context) || 'call');
  return `${name}-${ctx}.wav`;
}

/**
 * Total seconds of the rendered file: the last call's end plus the
 * tail. A chorus renders CHORUS_CALLS calls at the profile interval.
 * Silent / math-less profiles are 0 — there is no file for them.
 */
export function totalDuration(profile, { chorusCalls = CHORUS_CALLS } = {}) {
  if (!profile || profile.silent || !profile.math) return 0;
  const { events, loop } = expandPattern(profile);
  if (loop) {
    const interval = profile.pattern?.interval || 2.5;
    return (Math.max(1, chorusCalls) - 1) * interval + profile.duration + RENDER_TAIL;
  }
  const last = events[events.length - 1];
  return last.delay + last.duration + RENDER_TAIL;
}

/** Deterministic PRNG (mulberry32) — the pure renderer must produce
 *  the same bytes every time for the same profile. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function waveValue(waveform, phase) {
  const p = phase - Math.floor(phase);
  switch (waveform) {
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * p));
    case 'sawtooth':
      return 2 * p - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sine':
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

/**
 * RBJ bandpass (constant 0 dB peak gain) — the same filter the live
 * engine uses for noise voices, computed per sample so a frequency
 * sweep stays smooth. Coefficients follow the Audio EQ Cookbook.
 */
function bandpassCoefficients(freq, q, sampleRate) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Render one call of a noise voice into `out` at `offset` samples. */
function renderNoiseCall(plan, out, offset, sampleRate, rand) {
  const n = Math.max(1, Math.floor(plan.duration * sampleRate));
  const points = envelopePoints(plan.duration, plan.envelope);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const frac = plan.duration > 0 ? t / plan.duration : 0;
    const freq = plan.sweepTo
      ? plan.frequency * Math.pow(plan.sweepTo / plan.frequency, frac)
      : plan.frequency;
    const c = bandpassCoefficients(Math.max(40, freq), plan.q || 0.8, sampleRate);
    const x = rand() * 2 - 1;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[offset + i] += y * envelopeGainAt(points, t) * plan.volume;
  }
}

/** Render one call of an oscillator voice into `out` at `offset`. */
function renderOscCall(plan, out, offset, sampleRate) {
  const n = Math.max(1, Math.floor(plan.duration * sampleRate));
  const points = envelopePoints(plan.duration, plan.envelope);
  for (const osc of plan.oscillators) {
    let phase = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      const frac = plan.duration > 0 ? t / plan.duration : 0;
      const freq = osc.freqEnd
        ? osc.freq * Math.pow(osc.freqEnd / osc.freq, frac)
        : osc.freq;
      const value = waveValue(osc.type, phase) * osc.gain;
      out[offset + i] += value * envelopeGainAt(points, t) * plan.volume;
      phase += Math.max(1, freq) / sampleRate;
    }
  }
}

/** Linear interpolation of the ADSR gain points at time t (seconds). */
function envelopeGainAt(points, t) {
  if (!points || points.length === 0) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t <= t1) {
      if (t1 === t0) return v1;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Render a whole profile to mono PCM samples.
 * Returns { samples: Float32Array, sampleRate, duration } or null for
 * a silent / math-less profile. Deterministic: same profile, same bytes.
 */
export function renderSamples(profile, { sampleRate = RENDER_SAMPLE_RATE, chorusCalls = CHORUS_CALLS } = {}) {
  const plan = voicePlan(profile);
  if (!plan) return null;
  const duration = totalDuration(profile, { chorusCalls });
  const total = Math.max(1, Math.ceil(duration * sampleRate));
  const out = new Float32Array(total);
  const { events, loop } = expandPattern(profile);
  const starts = loop
    ? Array.from({ length: Math.max(1, chorusCalls) }, (_, i) => i * (profile.pattern?.interval || 2.5))
    : events.map((e) => e.delay);
  const rand = mulberry32(hashSeed(profile.id || 'sound'));
  for (const at of starts) {
    const offset = Math.round(at * sampleRate);
    if (offset >= total) continue;
    if (plan.kind === 'noise') renderNoiseCall(plan, out, offset, sampleRate, rand);
    else renderOscCall(plan, out, offset, sampleRate);
  }
  // Safety: nothing may clip — the harmonic gains sum to 1 and the
  // envelope peaks at 1, but clamp anyway.
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] > 1) out[i] = 1;
    else if (out[i] < -1) out[i] = -1;
  }
  return { samples: out, sampleRate, duration };
}

/** Encode mono Float32 samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples, sampleRate = RENDER_SAMPLE_RATE) {
  const n = samples.length;
  const dataSize = n * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/**
 * Whole profile -> WAV file, pure path.
 * Returns { bytes, fileName, duration, sampleRate, channels } or null
 * for a silent / math-less profile.
 */
export function renderProfileToWav(profile, opts = {}) {
  const rendered = renderSamples(profile, opts);
  if (!rendered) return null;
  return {
    bytes: encodeWav(rendered.samples, rendered.sampleRate),
    fileName: buildFileName(profile, profile.context),
    duration: rendered.duration,
    sampleRate: rendered.sampleRate,
    channels: 1,
  };
}
