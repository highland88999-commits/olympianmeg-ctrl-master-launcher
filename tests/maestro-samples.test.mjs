// Maestro sampled instruments: multisample resolution, pitch math, fallback.
import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUMENTS, getInstrument } from '../app/maestro/instruments.js';
import {
  resolveSample,
  samplePlaybackRate,
  isSampledInstrument,
  samplesReady,
  playSampledNote,
} from '../app/maestro/samples.js';

test('the piano declares sampleRoots + sampleDir', () => {
  assert.equal(INSTRUMENTS.length, 1);
  for (const inst of INSTRUMENTS) {
    assert.ok(Array.isArray(inst.sampleRoots) && inst.sampleRoots.length > 0, `${inst.id} sampleRoots`);
    assert.ok(typeof inst.sampleDir === 'string' && inst.sampleDir.length > 0, `${inst.id} sampleDir`);
    assert.ok(isSampledInstrument(inst), `${inst.id} isSampledInstrument`);
  }
});

test('every MIDI note 21-108 resolves to a declared piano root', () => {
  for (const inst of INSTRUMENTS) {
    for (let midi = 21; midi <= 108; midi++) {
      const root = resolveSample(inst.sampleRoots, midi);
      assert.ok(inst.sampleRoots.includes(root), `${inst.id} midi ${midi} -> ${root}`);
    }
  }
});

test('resolveSample picks the nearest root', () => {
  assert.equal(resolveSample([52, 55, 60], 53), 52);
  assert.equal(resolveSample([52, 55, 60], 54), 55);
  assert.equal(resolveSample([52, 55, 60], 20), 52); // below range clamps
  assert.equal(resolveSample([52, 55, 60], 200), 60); // above range clamps
  assert.equal(resolveSample([], 60), null);
  assert.equal(resolveSample(null, 60), null);
});

test('samplePlaybackRate pitch math', () => {
  assert.equal(samplePlaybackRate(60, 60), 1);
  assert.equal(samplePlaybackRate(72, 60), 2);
  assert.equal(samplePlaybackRate(48, 60), 0.5);
  const semi = samplePlaybackRate(61, 60);
  assert.ok(Math.abs(semi - Math.pow(2, 1 / 12)) < 1e-12, `semitone up: ${semi}`);
  const down = samplePlaybackRate(59, 60);
  assert.ok(Math.abs(down - Math.pow(2, -1 / 12)) < 1e-12, `semitone down: ${down}`);
  // transpose is applied by the caller: target = midi + transpose
  assert.equal(samplePlaybackRate(60 + 2, 60), samplePlaybackRate(62, 60));
});

test('samplesReady is false before priming (node has no decoded buffers)', () => {
  for (const inst of INSTRUMENTS) {
    assert.equal(samplesReady(inst.id), false);
  }
  assert.equal(samplesReady('nope'), false);
});

test('playSampledNote falls back to null when samples are not ready', () => {
  const fakeA = { ctx: {}, filter: {}, lfoDepth: null };
  const voice = getInstrument('piano');
  // no decoded buffers in node -> null -> caller uses oscillator synth
  assert.equal(playSampledNote({ a: fakeA, voice, midi: 60, when: 0, duration: 1 }), null);
  // no audio rig -> null
  assert.equal(playSampledNote({ a: null, voice, midi: 60 }), null);
  // voice without samples -> null
  assert.equal(playSampledNote({ a: fakeA, voice: { id: 'x' }, midi: 60 }), null);
});

test('isSampledInstrument rejects non-sampled voices', () => {
  assert.equal(isSampledInstrument(null), false);
  assert.equal(isSampledInstrument({}), false);
  assert.equal(isSampledInstrument({ sampleDir: 'piano', sampleRoots: [] }), false);
});
