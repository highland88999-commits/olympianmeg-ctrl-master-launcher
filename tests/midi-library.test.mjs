// tests/midi-library.test.mjs
// Headless tests for the Maestro universal MIDI library.
// Run: node tests/midi-library.test.mjs (from the repo root).
// No browser, no network — asserts on the SMF parser against the real seed
// file, the backend's validation/dedupe helpers, and the library listing
// (which must always resolve, even with no cloud configured).

import { readFileSync } from 'fs';
import { parseMidi } from '../app/maestro/midi.js';
import {
  isMidiBytes,
  sha256Hex,
  titleFromUrl,
  midiMetadata,
  listLibrary,
  MAX_MIDI_BYTES,
} from '../app/api/midi/_server.js';
import { MIDI_SEEDS } from '../lib/midi/seeds.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- the seed file: Axel F, first on the shelf ---------------------------
const seedBytes = new Uint8Array(readFileSync('public/midi/axel-f-1.mid'));
t('seed file exists and is non-trivial', seedBytes.length === 38222);
t('seed file has the SMF magic', isMidiBytes(seedBytes));

const parsed = parseMidi(seedBytes);
t('seed parses to 10 tracks', parsed.tracks.length === 10);
t('seed has notes to play', parsed.totalNotes === 4466);
t('seed duration is sane (~3 min)', parsed.duration > 180 && parsed.duration < 190);

const meta = midiMetadata(seedBytes);
t('metadata: note count', meta.noteCount === 4466);
t('metadata: track count', meta.trackCount === 10);
t('metadata: duration', meta.durationSec > 180 && meta.durationSec < 190);

// --- validation ------------------------------------------------------------
t('rejects non-MIDI bytes', !isMidiBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])));
t('rejects truncated input', !isMidiBytes(new Uint8Array([0x4d, 0x54, 0x68])));
t('rejects empty input', !isMidiBytes(new Uint8Array(0)));
t('size cap is 8 MB', MAX_MIDI_BYTES === 8 * 1024 * 1024);
t('seed is under the cap', seedBytes.length < MAX_MIDI_BYTES);

let threw = false;
try {
  midiMetadata(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
} catch { threw = true; }
t('metadata() throws on unplayable bytes', threw);

// --- dedupe -----------------------------------------------------------------
const h1 = sha256Hex(seedBytes);
const h2 = sha256Hex(seedBytes.slice());
t('same bytes -> same hash', h1 === h2);
t('seed hash matches the manifest', h1 === MIDI_SEEDS[0].hash);
const mutated = seedBytes.slice();
mutated[100] ^= 0xff;
t('different bytes -> different hash', sha256Hex(mutated) !== h1);

// --- title from URL ----------------------------------------------------------
t('titleFromUrl strips extension + query', titleFromUrl('https://x.com/m/axel-f-1.mid?dl=1') === 'axel-f-1');
t('titleFromUrl decodes + unscores', titleFromUrl('https://x.com/m/crazy_frog%20axel.mid') === 'crazy frog axel');
t('titleFromUrl falls back', titleFromUrl('not a url') === 'untitled');

// --- library listing (no cloud configured in test env) ----------------------
const lib = await listLibrary('');
t('library always resolves ok', lib.ok === true);
t('library carries the Axel F seed', lib.entries.some((e) => e.hash === MIDI_SEEDS[0].hash));
t('seed entry points at the bundled file', lib.entries.find((e) => e.seed).url === '/midi/axel-f-1.mid');

const searched = await listLibrary('axel');
t('search finds Axel F', searched.entries.length >= 1);
const missed = await listLibrary('zzz-no-such-song');
t('search with no match is empty (seeds filtered)', missed.entries.length === 0);

console.log(`\nmidi-library: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
