// lib/sound/math.js
// SOUND ENGINE (Merlin, Nov 12, 2026) — pure sound math.
//
// Everything here is numbers in, numbers out: no window, no
// AudioContext, no randomness. The browser engine (engine.js) turns
// these plans into Web Audio nodes; node tests assert these plans.
//
//   voicePlan(profile)   oscillators / noise filter + envelope + volume
//   envelopePoints()     gain automation points for an ADSR envelope
//   expandPattern()      when each call in a pattern starts
//   gainForDistance()    how loud a sound is at a distance
//   panForListener()     distance + stereo pan from listener/source positions

export const REFERENCE_DISTANCE = 8; // metres — inside this, full volume
export const MAX_DISTANCE = 120; // metres — beyond this, silence (for the loudest species)

// Earshot: how far a species can be heard. Louder animals carry farther —
// a mosquito is only heard up close, a lion across the valley. The radius
// scales with the species' volume (its profile volume, 0..1) and never
// drops below the reference distance. Earth 4 (true Earth size, fully
// explorable) uses this same model: volume fades with distance, and each
// species goes silent past its own earshot.
export function earshotFor(volume) {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  return Math.max(REFERENCE_DISTANCE, MAX_DISTANCE * v);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Turn a profile into a synth voice plan.
 * Oscillators: one per harmonic, frequencies from the base frequency
 * times the harmonic multiple, gains normalized so they sum to 1 (the
 * profile volume sets the loudness, not the harmonic mix).
 * Noise waveform: a filtered-noise voice instead — the profile's
 * frequency is the bandpass centre, frequencyEnd the sweep target.
 */
export function voicePlan(profile) {
  if (!profile || profile.silent || !profile.math) return null;
  const { frequency, frequencyEnd, harmonics, waveform, envelope } = profile.math;
  if (waveform === 'noise') {
    return {
      kind: 'noise',
      frequency,
      sweepTo: frequencyEnd,
      q: 0.8,
      envelope: { ...envelope },
      duration: profile.duration,
      volume: profile.volume,
    };
  }
  const total = harmonics.reduce((s, h) => s + h.gain, 0) || 1;
  return {
    kind: 'osc',
    oscillators: harmonics.map((h) => ({
      freq: frequency * h.multiple,
      freqEnd: frequencyEnd ? frequencyEnd * h.multiple : null,
      type: waveform,
      gain: h.gain / total,
    })),
    envelope: { ...envelope },
    duration: profile.duration,
    volume: profile.volume,
  };
}

/**
 * Gain automation points for an ADSR envelope over `duration` seconds.
 * Returns [[time, value], ...] — starts at 0, peaks at 1 after the
 * attack, holds at sustain, fades to 0 across the release. When the
 * duration is too short for the full envelope, attack/decay/release
 * are scaled down proportionally so the shape still fits.
 */
export function envelopePoints(duration, envelope) {
  const env = envelope || { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.2 };
  const d = Math.max(0.05, duration);
  let { attack, decay, release } = env;
  const sustain = clamp(env.sustain ?? 0.7, 0, 1);
  const needed = attack + decay + release;
  if (needed > d) {
    const scale = d / needed;
    attack *= scale;
    decay *= scale;
    release *= scale;
  }
  const attackEnd = attack;
  const decayEnd = attack + decay;
  const releaseStart = Math.max(decayEnd, d - release);
  const points = [[0, 0]];
  if (attackEnd > 0) points.push([attackEnd, 1]);
  else points[0] = [0, 1];
  if (decayEnd > attackEnd) points.push([decayEnd, sustain]);
  if (releaseStart > decayEnd) points.push([releaseStart, sustain]);
  points.push([d, 0]);
  return points;
}

/**
 * Expand a profile's pattern into scheduled call events.
 * single  → one event now.
 * repeat  → `count` events, `interval` seconds apart.
 * chorus  → one event now, plus loop: true — the caller re-triggers
 *            every `interval` seconds while the bed is alive.
 */
export function expandPattern(profile) {
  const pattern = (profile && profile.pattern) || { type: 'single' };
  if (pattern.type === 'repeat') {
    const events = [];
    for (let i = 0; i < pattern.count; i += 1) {
      events.push({ delay: i * pattern.interval, duration: profile.duration });
    }
    return { events, loop: false, interval: pattern.interval };
  }
  if (pattern.type === 'chorus') {
    return { events: [{ delay: 0, duration: profile.duration }], loop: true, interval: pattern.interval };
  }
  return { events: [{ delay: 0, duration: profile.duration }], loop: false, interval: 0 };
}

/**
 * Loudness of a sound at `distance` metres: full volume inside the
 * reference distance, inverse-distance falloff beyond it, silence
 * past the max distance.
 */
export function gainForDistance(distance, referenceDistance = REFERENCE_DISTANCE, maxDistance = MAX_DISTANCE) {
  const d = Math.max(0, distance);
  if (d >= maxDistance) return 0;
  if (d <= referenceDistance) return 1;
  return referenceDistance / d;
}

/**
 * Distance + stereo pan of a sound source from a listener.
 * listener: { x, z, yaw } (yaw 0 faces north, -Z — the three.js
 * convention the worlds use). source: { x, y?, z }.
 * pan -1 = fully left, +1 = fully right, 0 = straight ahead/behind.
 */
export function panForListener(listener, source) {
  const dx = source.x - listener.x;
  const dy = (source.y || 0) - (listener.y || 0);
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) return { distance: 0, pan: 0 };
  // Forward (-sin yaw, -cos yaw) and right (cos yaw, -sin yaw).
  const fx = -Math.sin(listener.yaw || 0);
  const fz = -Math.cos(listener.yaw || 0);
  const rx = Math.cos(listener.yaw || 0);
  const rz = -Math.sin(listener.yaw || 0);
  const nx = dx / distance;
  const nz = dz / distance;
  // Pan from the right-vector component; ahead/behind both read ~0.
  const pan = clamp(nx * rx + nz * rz, -1, 1);
  return { distance, pan };
}
