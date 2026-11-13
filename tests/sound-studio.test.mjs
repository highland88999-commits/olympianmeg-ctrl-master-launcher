// tests/sound-studio.test.mjs — SOUND STUDIO: downloadable sound files.
// Pure logic only — WAV encoding/header, render math, filename building.
// The browser path (OfflineAudioContext) is not exercised here; it is the
// same node graph as the live engine, and a headless load of the studio
// page proves the wiring instead.
// Run: node tests/sound-studio.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  buildFileName,
  totalDuration,
  renderSamples,
  encodeWav,
  renderProfileToWav,
  RENDER_SAMPLE_RATE,
  CHORUS_CALLS,
  RENDER_TAIL,
} from '../lib/sound/render.js';
import { SEED_PROFILES } from '../lib/sound/seed-profiles.js';
import { createRegistry } from '../lib/sound/profiles.js';

const registry = createRegistry(SEED_PROFILES);
const wolf = registry.resolve('canis-lupus');
const dog = registry.resolve('canis-familiaris');
const peeper = registry.resolve('pseudacris-crucifer');
const oak = registry.resolve('quercus-robur');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- filenames --------------------------------------------------------------

test('slugify makes file-safe lowercase hyphen names', () => {
  assert.equal(slugify('Gray wolf'), 'gray-wolf');
  assert.equal(slugify('American robin'), 'american-robin');
  assert.equal(slugify('  Plainfin midshipman! '), 'plainfin-midshipman');
  assert.equal(slugify(''), 'sound');
});

test('buildFileName names the file like wolf-howl.wav', () => {
  assert.equal(buildFileName(wolf, 'howl'), 'gray-wolf-howl.wav');
  assert.equal(buildFileName(wolf), 'gray-wolf-howl.wav');
  assert.equal(buildFileName(dog, 'alarm'), 'domestic-dog-alarm.wav');
  assert.equal(buildFileName(peeper, 'chorus'), 'spring-peeper-chorus.wav');
});

// --- durations --------------------------------------------------------------

test('totalDuration is one call plus the tail for a single', () => {
  assert.ok(approx(totalDuration(wolf), 3.5 + RENDER_TAIL));
});

test('totalDuration spans all repeats for a repeat pattern', () => {
  // 3 barks, 0.15s each, 0.35s apart: last starts at 0.7, ends 0.85.
  assert.ok(approx(totalDuration(dog), 0.7 + 0.15 + RENDER_TAIL));
});

test('totalDuration renders a chorus as three calls, then stops', () => {
  // 3 peeps at 2.5s apart: last starts at 5.0, 0.1s long.
  assert.ok(approx(totalDuration(peeper), 5.0 + 0.1 + RENDER_TAIL));
  assert.equal(CHORUS_CALLS, 3);
});

test('totalDuration is 0 for a silent species — no file', () => {
  assert.equal(totalDuration(oak), 0);
  assert.equal(totalDuration(null), 0);
});

// --- WAV encoding -----------------------------------------------------------

test('encodeWav writes a valid 16-bit mono PCM header', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const bytes = encodeWav(samples, 44100);
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 12), 'WAVE');
  assert.equal(text(12, 16), 'fmt ');
  assert.equal(text(36, 40), 'data');
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(4, true), 36 + 10);
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 10);
  assert.equal(bytes.length, 44 + 10);
});

test('encodeWav round-trips sample values to int16', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const bytes = encodeWav(samples, 44100);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 16383);
  assert.equal(view.getInt16(48, true), -16384);
  assert.equal(view.getInt16(50, true), 32767);
  assert.equal(view.getInt16(52, true), -32768);
});

// --- rendering --------------------------------------------------------------

test('renderSamples renders the wolf howl at the right length', () => {
  const out = renderSamples(wolf);
  assert.ok(out);
  assert.equal(out.sampleRate, RENDER_SAMPLE_RATE);
  assert.ok(approx(out.duration, 3.65));
  assert.equal(out.samples.length, Math.ceil(3.65 * RENDER_SAMPLE_RATE));
});

test('renderSamples is deterministic — same profile, same bytes', () => {
  const a = renderSamples(wolf);
  const b = renderSamples(wolf);
  assert.deepEqual(a.samples, b.samples);
});

test('renderSamples honours the envelope and never clips', () => {
  const out = renderSamples(wolf);
  let peak = 0;
  for (let i = 0; i < out.samples.length; i += 1) {
    const v = Math.abs(out.samples[i]);
    if (v > peak) peak = v;
    assert.ok(Number.isFinite(out.samples[i]));
    assert.ok(v <= 1);
  }
  // Envelope attack: the first samples are near silence.
  assert.ok(Math.abs(out.samples[0]) < 0.01);
  assert.ok(Math.abs(out.samples[100]) < 0.05);
  // The call itself is really there.
  assert.ok(peak > 0.2);
  // The tail is silence (envelope released).
  assert.ok(Math.abs(out.samples[out.samples.length - 1]) < 0.01);
});

test('renderSamples renders every waveform without error', () => {
  for (const waveform of ['sine', 'triangle', 'sawtooth', 'square']) {
    const profile = {
      id: `wave-${waveform}`, species: `Wave ${waveform}`,
      math: {
        frequency: 440, frequencyEnd: null,
        harmonics: [{ multiple: 1, gain: 1 }],
        waveform,
        envelope: { attack: 0.01, decay: 0.01, sustain: 0.8, release: 0.05 },
      },
      duration: 0.1, pattern: { type: 'single' }, volume: 0.5,
    };
    const out = renderSamples(profile);
    assert.ok(out);
    assert.equal(out.samples.length, Math.ceil(0.25 * RENDER_SAMPLE_RATE));
    let peak = 0;
    for (const s of out.samples) peak = Math.max(peak, Math.abs(s));
    assert.ok(peak > 0.1, `${waveform} should be audible`);
  }
});

test('renderSamples renders a noise voice deterministically', () => {
  const profile = {
    id: 'test-noise', species: 'Test noise',
    math: {
      frequency: 1000, frequencyEnd: 500,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'noise',
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.2 },
    },
    duration: 0.5, pattern: { type: 'single' }, volume: 0.6,
  };
  const a = renderSamples(profile);
  const b = renderSamples(profile);
  assert.ok(a);
  assert.deepEqual(a.samples, b.samples);
  let peak = 0;
  for (const s of a.samples) peak = Math.max(peak, Math.abs(s));
  assert.ok(peak > 0.05, 'filtered noise should be audible');
});

test('renderSamples returns null for a silent species', () => {
  assert.equal(renderSamples(oak), null);
  assert.equal(renderSamples(null), null);
});

// --- whole file -------------------------------------------------------------

test('renderProfileToWav returns a named RIFF file for the wolf', () => {
  const file = renderProfileToWav(wolf);
  assert.ok(file);
  assert.equal(file.fileName, 'gray-wolf-howl.wav');
  assert.equal(String.fromCharCode(...file.bytes.slice(0, 4)), 'RIFF');
  assert.equal(file.sampleRate, RENDER_SAMPLE_RATE);
  assert.equal(file.channels, 1);
  assert.ok(approx(file.duration, 3.65));
  assert.ok(file.bytes.length > 44);
});

test('renderProfileToWav returns null for a silent species', () => {
  assert.equal(renderProfileToWav(oak), null);
});
