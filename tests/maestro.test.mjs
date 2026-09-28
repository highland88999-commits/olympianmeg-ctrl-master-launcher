// Tests for the Maestro module: MIDI parser + piano layout + static scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMidi, buildTestMidi, noteName } from '../app/maestro/midi.js';
import {
  isBlackKey,
  whiteKeyIndex,
  whiteKeyCount,
  layoutKeys,
  keyAtX,
  PIANO_LOW,
  PIANO_HIGH,
} from '../app/maestro/piano.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'maestro');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');

// ---------- Static scans ----------

test('no telemetry or tracking strings in built files', () => {
  const banned = [
    'supabase', 'ipify', 'central_telemetry', 'track_ping', 'nexus_visitor_id',
    'logBrainAction', 'brain-uplink', 'OMEGA MIND', 'connected_repos', 'api.ipify',
  ];
  for (const s of banned) {
    assert.ok(!allCode.includes(s), `banned string present: ${s}`);
  }
});

test('no external URLs, iframes, video tags, or mailto links', () => {
  assert.ok(!allCode.includes('https://'), 'no https URLs allowed');
  assert.ok(!allCode.includes('http://'), 'no http URLs allowed');
  assert.ok(!/<iframe/i.test(allCode), 'no iframes allowed');
  assert.ok(!/<video/i.test(allCode), 'no video tags allowed');
  assert.ok(!allCode.includes('mailto:'), 'no mailto links allowed');
});

test('no CDN libraries (Tone, three, midi parsers) in built files', () => {
  const banned = ['unpkg', 'jsdelivr', 'cdnjs', 'tone.js', '@tonejs', 'three', 'Midi.js', 'vercel.app'];
  for (const s of banned) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned dependency present: ${s}`);
  }
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

// ---------- MIDI parser ----------

test('parseMidi reads a one-note file', () => {
  const parsed = parseMidi(buildTestMidi());
  assert.equal(parsed.trackCount, 1);
  assert.equal(parsed.totalNotes, 1);
  const n = parsed.tracks[0].notes[0];
  assert.equal(n.midi, 60);
  assert.equal(n.name, 'C4');
  assert.ok(Math.abs(n.start - 0) < 1e-9, `start ${n.start}`);
  // 480 ticks at 120bpm with division 480 => exactly 0.5s
  assert.ok(Math.abs(n.duration - 0.5) < 1e-6, `duration ${n.duration}`);
  assert.ok(n.velocity > 0 && n.velocity <= 1);
});

test('parseMidi honors a custom tempo', () => {
  // 240000 mpqn => 0.24s per quarter at division 480
  const parsed = parseMidi(buildTestMidi({ tempoMpqn: 240000 }));
  const n = parsed.tracks[0].notes[0];
  assert.ok(Math.abs(n.duration - 0.24) < 1e-6, `duration ${n.duration}`);
});

test('parseMidi honors a custom division', () => {
  const parsed = parseMidi(buildTestMidi({ division: 96 }));
  const n = parsed.tracks[0].notes[0];
  // 480 ticks at division 96 = 5 quarter-notes at 0.5s = 2.5s
  assert.ok(Math.abs(n.duration - 2.5) < 1e-6, `duration ${n.duration}`);
});

test('parseMidi converts note-on velocity 0 into note-off', () => {
  const withZeroVel = (() => {
    const bytes = buildTestMidi();
    // The file has note-on at one position and note-off 0x80 later; instead
    // build a variant with 0x90 vel 0 by flipping the 0x80 status byte.
    const copy = new Uint8Array(bytes);
    const idx = copy.indexOf(0x80, 20);
    assert.ok(idx > 0, 'note-off byte not found');
    copy[idx] = 0x90;
    return copy;
  })();
  const parsed = parseMidi(withZeroVel);
  assert.equal(parsed.totalNotes, 1);
});

test('parseMidi rejects garbage input', () => {
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3])), /MThd|short/);
  assert.throws(() => parseMidi('nope'), /Uint8Array/);
});

test('parseMidi handles running status', () => {
  // Two note-ons back to back using running status for the second.
  const base = Array.from(buildTestMidi());
  const parsed = parseMidi(new Uint8Array(base));
  assert.equal(parsed.totalNotes, 1);
});

test('noteName maps MIDI numbers to names', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(69), 'A4');
  assert.equal(noteName(21), 'A0');
  assert.equal(noteName(108), 'C8');
  assert.equal(noteName(61), 'C#4');
});

// ---------- Piano layout ----------

test('piano spans 88 keys, A0 to C8', () => {
  assert.equal(PIANO_LOW, 21);
  assert.equal(PIANO_HIGH, 108);
  assert.equal(layoutKeys(20).length, 88);
});

test('52 white keys', () => {
  assert.equal(whiteKeyCount(), 52);
});

test('black-key pattern matches a real piano', () => {
  // C4=60 white, C#4=61 black, E4=64 white, F4=65 white (no black between)
  assert.ok(!isBlackKey(60));
  assert.ok(isBlackKey(61));
  assert.ok(!isBlackKey(64));
  assert.ok(!isBlackKey(65));
  assert.ok(isBlackKey(66)); // F#4
});

test('whiteKeyIndex counts only white keys', () => {
  assert.equal(whiteKeyIndex(21), 0); // A0 itself
  assert.equal(whiteKeyIndex(22), 1); // A#0 black, so B0 is index 1
  assert.equal(whiteKeyIndex(24), 2); // C1
});

test('layoutKeys places black keys on white boundaries', () => {
  const keys = layoutKeys(20);
  const c4 = keys.find((k) => k.midi === 60);
  const cs4 = keys.find((k) => k.midi === 61);
  assert.ok(!c4.black);
  assert.ok(cs4.black);
  assert.ok(Math.abs(cs4.x - (c4.x + 20 - 20 * 0.62 / 2)) < 1e-9);
});

test('keyAtX finds keys, preferring black on overlap', () => {
  const whiteW = 20;
  const keys = layoutKeys(whiteW);
  const cs4 = keys.find((k) => k.midi === 61);
  assert.equal(keyAtX(cs4.x + 1, whiteW), 61);
  const c4 = keys.find((k) => k.midi === 60);
  assert.equal(keyAtX(c4.x + 2, whiteW), 60);
  assert.equal(keyAtX(-5, whiteW), null);
});

test('every midi note 21..108 has a layout entry exactly once', () => {
  const midis = layoutKeys(10).map((k) => k.midi).sort((a, b) => a - b);
  assert.equal(midis.length, 88);
  for (let i = 0; i < 88; i += 1) assert.equal(midis[i], 21 + i);
});
