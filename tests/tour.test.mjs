// The Travelator: gate lists from the real registry, tour bar controls,
// SOON badge kept on the tile, shrink-back ending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GATE_SECONDS,
  buildFullTour,
  buildGrandTour,
  buildTour,
  prettifyKey,
  sectionOrder,
} from '../lib/tour/itinerary.js';

const registryText = readFileSync('lib/i18n/satellites.ts', 'utf8');
const entries = [...registryText.matchAll(/\{ key: "([^"]+)", route: "([^"]+)", pos: "([^"]+)", section: "([^"]+)", constellation: "([^"]+)" \}/g)]
  .map((m) => ({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] }));

test('registry parses: 220 programs, 9 sections', () => {
  assert.equal(entries.length, 222); // ARES seat removed: 223→222, Nov 26, 2026 (restoring Concourse-tile-only access, Nov 16 order; Phase 1 re-add reverted); Checker Tracks seat: 221→222, Nov 25, 2026; Job Board seat: 216→217, Nov 21, 2026 (pins were stale at 215 — registry was already 216 before this seat; Housing seat: 217→218; Social Assistance seat: 218→219; Business Services seat: 219→220 (four-program merge), Nov 21, 2026); Vault seat: 220→221 (Alexandria suite ship), Nov 22, 2026
  assert.equal(sectionOrder(entries).length, 9);
});

test('grand tour: one gate per section, first program of each', () => {
  const gates = buildGrandTour(entries);
  assert.equal(gates.length, 9);
  assert.equal(new Set(gates.map((g) => g.section)).size, 9);
  const games = gates.find((g) => g.section === 'GAMES');
  assert.equal(games.key, 'chess');
  const tools = gates.find((g) => g.section === 'TOOLS');
  assert.equal(tools.key, 'tools');
});

test('full tour: every program, registry order, nothing invented', () => {
  const gates = buildFullTour(entries);
  assert.equal(gates.length, 222);
  assert.equal(gates[0].key, 'chess');
  assert.deepEqual(gates.map((g) => g.key), entries.map((e) => e.key));
  assert.equal(buildTour(entries, 'full').length, 222);
  assert.equal(buildTour(entries, 'grand').length, 9);
});

test('cadence is five seconds and keys prettify', () => {
  assert.equal(GATE_SECONDS, 5);
  assert.equal(prettifyKey('hollow-earth'), 'Hollow Earth');
  assert.equal(prettifyKey('sanctuary'), 'Sanctuary');
});

test('concourse: tour tile opens the ride, SOON badge removed (Merlin 2026-10-29)', () => {
  const concourse = readFileSync('components/Concourse.jsx', 'utf8');
  assert.match(concourse, /id: 'tour', label: 'Tour', icon: '🗺️'/);
  assert.doesNotMatch(concourse, /id: 'tour'[^}]*soon: true/);
  assert.match(concourse, /setTravelatorOpen\(true\)/);
  assert.match(concourse, /<Travelator open=\{travelatorOpen\}/);
  assert.doesNotMatch(concourse, /gates are being built/);
});

test('travelator: tour bar controls and shrink-back ending', () => {
  const ride = readFileSync('components/tour/Travelator.jsx', 'utf8');
  assert.match(ride, /Pause/);
  assert.match(ride, /Next gate/);
  assert.match(ride, /Open this program/);
  assert.match(ride, /End tour/);
  assert.match(ride, /GATE_SECONDS/);
  assert.match(ride, /scale\(0\.1\)/);
  assert.match(ride, /Grand tour/);
  assert.match(ride, /Full tour/);
});
