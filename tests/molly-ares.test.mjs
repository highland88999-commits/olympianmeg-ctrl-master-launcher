// tests/molly-ares.test.mjs
//
// Molly seated in the ARES program (Merlin, 2026-10-28): the /molly demo
// interface moves into /ares as a Molly panel — digitized head, tracking
// display, talk, demo hunt — while the real Molly stays sealed in her own
// repo and the /molly sandbox portal stays standing.
//
// Boundary locked by test: the tracking display follows a DECOY TRIP, never
// a person. No facial / voice / DNA / behavior scoring of any human, no
// clearance levels, no re-education language anywhere in the panel.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOLLY_DEMO_LINES, mollyReplyFor } from '../lib/molly/talk.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('ARES page renders the Molly panel (owner view only)', () => {
  const page = read('app/ares/page.jsx');
  assert.match(page, /import MollyPanel from '@\/components\/ares\/MollyPanel'/);
  assert.match(page, /<MollyPanel \/>/);
});

test('Molly panel has the digitized head and the tracking display', () => {
  const panel = read('components/ares/MollyPanel.jsx');
  assert.match(panel, /digitized head/i);
  assert.match(panel, /signal search \/\/ decoy trip/i);
  assert.match(panel, /SWARM TRACKING/);
  assert.match(panel, /Run a demo hunt/);
  assert.match(panel, /Freeze Molly/);
  assert.match(panel, /Talk to her/);
});

test('tracking display never scores a person', () => {
  const panel = read('components/ares/MollyPanel.jsx');
  for (const banned of ['FACIAL \\d+%', 'DNA \\d+%', 'VOICE \\d+%', 'BEHAVIOR \\d+%', 'RE-EDUCATION', 'CLEARANCE LEVEL', 'TARGET SEARCH // EVE']) {
    assert.doesNotMatch(panel, new RegExp(banned), `panel must not contain ${banned}`);
  }
  assert.match(panel, /tracks decoy trips, never people/);
});

test('shared talk content still answers and the demo still replays', () => {
  assert.match(mollyReplyFor('what is your mission'), /hunt online predation/);
  assert.equal(MOLLY_DEMO_LINES.length, 11);
  assert.match(MOLLY_DEMO_LINES[7], /total 0\.686/);
});

test('sandbox portal still stands with its gate after the refactor', () => {
  const page = read('app/molly/page.jsx');
  assert.match(page, /SANDBOX — TESTING ONLY/);
  assert.match(page, /\/api\/molly\/gate/);
  assert.match(page, /from '@\/lib\/molly\/talk'/);
});
