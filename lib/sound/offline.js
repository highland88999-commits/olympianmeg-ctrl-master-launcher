// lib/sound/offline.js
// SOUND STUDIO (Merlin, Nov 12, 2026) — browser offline rendering.
//
// Renders a species' sound profile into a WAV file with
// OfflineAudioContext, using the same Web Audio node graph the live
// engine uses (engine.js): one oscillator per harmonic with an
// exponential frequency sweep, or filtered white noise for noise
// voices, with the ADSR envelope from the profile. The downloaded
// file therefore sounds like the preview.
//
// One deliberate difference from the live engine: the file honours
// the profile volume. The engine sets the voice gain to the profile
// volume and then schedules the envelope on the same gain node, which
// overwrites it — live voices play at full envelope scale. Here the
// envelope points are scaled by the profile volume, so a quiet
// species (a mosquito at 0.3) downloads quiet, as its profile says.
//
// Browser-only: returns null when OfflineAudioContext is missing —
// the page then falls back to the pure renderer (render.js).

import { voicePlan, envelopePoints, expandPattern } from './math.js';
import { encodeWav, buildFileName, totalDuration, CHORUS_CALLS, RENDER_SAMPLE_RATE } from './render.js';

export function hasOfflineAudio() {
  return typeof window !== 'undefined'
    && !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);
}

function scheduleGain(gainNode, t0, duration, envelope, volume) {
  const points = envelopePoints(duration, envelope);
  for (const [t, v] of points) {
    const scaled = Math.max(0.0001, v * volume);
    if (t === 0) gainNode.gain.setValueAtTime(scaled, t0);
    else gainNode.gain.linearRampToValueAtTime(scaled, t0 + t);
  }
}

function renderOscVoice(ctx, plan, t0, out) {
  for (const oscDef of plan.oscillators) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = oscDef.type;
    osc.frequency.setValueAtTime(Math.max(1, oscDef.freq), t0);
    if (oscDef.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, oscDef.freqEnd), t0 + plan.duration);
    }
    g.gain.value = oscDef.gain;
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + plan.duration + 0.1);
  }
  scheduleGain(out, t0, plan.duration, plan.envelope, plan.volume);
}

function renderNoiseVoice(ctx, plan, t0, out) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * plan.duration));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.max(40, plan.frequency), t0);
  if (plan.sweepTo) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, plan.sweepTo), t0 + plan.duration);
  }
  filter.Q.value = plan.q || 0.8;
  src.connect(filter);
  filter.connect(out);
  scheduleGain(out, t0, plan.duration, plan.envelope, plan.volume);
  src.start(t0);
  src.stop(t0 + plan.duration + 0.1);
}

/**
 * Render a profile offline. Returns
 * { bytes, fileName, duration, sampleRate, channels, via: 'offline' }
 * or null for a silent / math-less profile, or when the browser has
 * no OfflineAudioContext.
 */
export async function renderOffline(profile, { sampleRate = RENDER_SAMPLE_RATE, chorusCalls = CHORUS_CALLS } = {}) {
  if (!profile || profile.silent || !profile.math) return null;
  const OC = typeof window !== 'undefined'
    ? (window.OfflineAudioContext || window.webkitOfflineAudioContext)
    : null;
  if (!OC) return null;
  const plan = voicePlan(profile);
  if (!plan) return null;
  const duration = totalDuration(profile, { chorusCalls });
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OC(1, length, sampleRate);
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  const { events, loop } = expandPattern(profile);
  const starts = loop
    ? Array.from({ length: Math.max(1, chorusCalls) }, (_, i) => i * (profile.pattern?.interval || 2.5))
    : events.map((e) => e.delay);
  for (const at of starts) {
    if (plan.kind === 'noise') renderNoiseVoice(ctx, plan, at, out);
    else renderOscVoice(ctx, plan, at, out);
  }
  const buffer = await ctx.startRendering();
  const data = buffer.getChannelData(0);
  return {
    bytes: encodeWav(data, sampleRate),
    fileName: buildFileName(profile, profile.context),
    duration,
    sampleRate,
    channels: 1,
    via: 'offline',
  };
}
