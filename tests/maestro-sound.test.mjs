// Maestro sound: instruments, live transpose, BitMidi search, A–Z catalog.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENTS,
  DEFAULT_INSTRUMENT,
  INSTRUMENT_IDS,
  getInstrument,
  midiToFreq,
  makeDistortionCurve,
  groupByLetter,
  TRANSPOSE_MIN,
  TRANSPOSE_MAX,
  TEMPO_MIN,
  TEMPO_MAX,
  advanceSongPos,
  noteAudioTime,
} from '../app/maestro/instruments.js';

import {
  BITMIDI_ORIGIN,
  bitmidiSearchUrl,
  normalizeBitmidiResults,
} from '../app/api/midi/_bitmidi.js';

test('piano is the landing (default) instrument', () => {
  assert.equal(DEFAULT_INSTRUMENT, 'piano');
  assert.equal(INSTRUMENTS[0].id, 'piano');
});

test('piano is the one and only voice', () => {
  assert.equal(INSTRUMENTS.length, 1);
  const v = getInstrument('piano');
  assert.ok(v.name && v.icon, 'piano needs name+icon');
  assert.ok(['triangle', 'sawtooth', 'square'].includes(v.oscType), 'piano oscType');
  assert.ok(v.filterFreq > 0, 'piano filterFreq');
  assert.ok(v.attack >= 0, 'piano attack');
  assert.ok(Array.isArray(v.sampleRoots) && v.sampleRoots.length === 30, 'piano has 30 sample roots');
});

test('unknown instrument falls back to piano', () => {
  assert.equal(getInstrument('theremin').id, 'piano');
  assert.equal(getInstrument(undefined).id, 'piano');
});

test('no voice carries distortion (piano is clean)', () => {
  const withDist = INSTRUMENTS.filter((v) => v.distortion > 0).map((v) => v.id);
  assert.deepEqual(withDist, []);
});

test('midiToFreq: A4 is 440Hz, transpose shifts by octaves', () => {
  assert.ok(Math.abs(midiToFreq(69, 0) - 440) < 0.001);
  assert.ok(Math.abs(midiToFreq(69, 12) - 880) < 0.001);
  assert.ok(Math.abs(midiToFreq(69, -12) - 220) < 0.001);
  assert.ok(Math.abs(midiToFreq(60, 0) - 261.626) < 0.01); // middle C
});

test('transpose range is ±12 semitones', () => {
  assert.equal(TRANSPOSE_MIN, -12);
  assert.equal(TRANSPOSE_MAX, 12);
});

test('distortion curve is a clean symmetric S', () => {
  const c = makeDistortionCurve(45);
  assert.equal(c.length, 256);
  assert.ok(Math.abs(c[0] + 1) < 0.001);
  assert.ok(Math.abs(c[255] - 1) < 0.001);
  // odd symmetry around the center
  for (const i of [0, 32, 64, 96]) {
    assert.ok(Math.abs(c[i] + c[255 - i]) < 0.001, `symmetry at ${i}`);
  }
});

test('groupByLetter: alphabetical, case-insensitive, # for the rest', () => {
  const groups = groupByLetter([
    { id: '1', title: 'Axel F' },
    { id: '2', title: 'bohemian rhapsody' },
    { id: '3', title: 'Blue Danube' },
    { id: '4', title: '99 Luftballons' },
  ]);
  const letters = groups.map((g) => g.letter);
  assert.deepEqual(letters, ['A', 'B', '#']);
  const b = groups.find((g) => g.letter === 'B');
  assert.deepEqual(b.items.map((i) => i.title), ['Blue Danube', 'bohemian rhapsody']);
});

test('bitmidiSearchUrl builds the public API URL', () => {
  const u = bitmidiSearchUrl('axel f', 12);
  assert.ok(u.startsWith(`${BITMIDI_ORIGIN}/api/midi/search?`));
  assert.ok(u.includes('q=axel+f') || u.includes('q=axel%20f'));
  assert.ok(u.includes('pageSize=12'));
  assert.ok(bitmidiSearchUrl('x', 999).includes('pageSize=25')); // clamped
});

test('normalizeBitmidiResults maps the real API shape', () => {
  const payload = {
    result: {
      results: [
        {
          id: 8677,
          name: 'Axel Coon - I Wish.mid',
          slug: 'axel-coon-i-wish-mid',
          plays: 1371,
          url: '/axel-coon-i-wish-mid',
          downloadUrl: '/uploads/8677.mid',
        },
        { id: null, name: 'junk' },
      ],
    },
  };
  const rows = normalizeBitmidiResults(payload);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'bitmidi-8677');
  assert.equal(rows[0].name, 'Axel Coon - I Wish.mid');
  assert.equal(rows[0].plays, 1371);
  assert.equal(rows[0].downloadUrl, 'https://bitmidi.com/uploads/8677.mid');
  assert.equal(rows[0].pageUrl, 'https://bitmidi.com/axel-coon-i-wish-mid');
  assert.deepEqual(normalizeBitmidiResults({}), []);
});

test('tempo range is 0.5x to 2x, default 1x', () => {
  assert.equal(TEMPO_MIN, 0.5);
  assert.equal(TEMPO_MAX, 2);
});

test('advanceSongPos scales elapsed time by live tempo', () => {
  assert.equal(advanceSongPos(10, 0.1, 1), 10.1);
  assert.equal(advanceSongPos(10, 0.1, 2), 10.2);
  assert.equal(advanceSongPos(10, 0.1, 0.5), 10.05);
  // changing tempo mid-song just changes the slope — position never jumps
  const p1 = advanceSongPos(10, 0.1, 1);
  const p2 = advanceSongPos(p1, 0.1, 2);
  assert.ok(Math.abs(p2 - 10.3) < 1e-9);
  assert.equal(advanceSongPos(5, -0.5, 2), 5); // negative dt clamped
});

test('noteAudioTime maps song time to audio time at current tempo', () => {
  // note 0.6s of song-time ahead, at 1x, lands 0.6s of audio-time ahead
  assert.ok(Math.abs(noteAudioTime(100, 10.6, 10, 1) - 100.6) < 1e-9);
  // at 2x the same song gap is only 0.3s of audio time
  assert.ok(Math.abs(noteAudioTime(100, 10.6, 10, 2) - 100.3) < 1e-9);
  // a note already behind the playhead schedules immediately
  assert.equal(noteAudioTime(100, 9.5, 10, 1), 100);
});
