// Molly's voice: device speech, no network, wired into both talk boxes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = readFileSync('lib/molly/voice.js', 'utf8');
const page = readFileSync('app/molly/page.jsx', 'utf8');
const panel = readFileSync('components/ares/MollyPanel.jsx', 'utf8');

test('voice helper uses the device speech engine and nothing else', () => {
  assert.match(voice, /speechSynthesis/);
  assert.match(voice, /cancel\(\)/); // new speech stops the old one
  assert.match(voice, /export function speakMolly/);
  assert.match(voice, /export function stopMollySpeech/);
  assert.match(voice, /export function speechSupported/);
  assert.doesNotMatch(voice, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('both talk boxes carry a voice toggle and speak her replies', () => {
  for (const [name, src] of [['sandbox page', page], ['ARES panel', panel]]) {
    assert.match(src, /molly-voice/, `${name}: preference key`);
    assert.match(src, /speakMolly\(last\.text\)/, `${name}: speaks latest reply`);
    assert.match(src, /stopMollySpeech\(\)/, `${name}: stops speech`);
    assert.match(src, /Voice: on/, `${name}: toggle label`);
  }
});
