// Nexus Vortex fast travel (Merlin, 2026-10-29): the vortex is the
// journey, the destination is the point. Pick a program (or let the
// vortex decide), fly the tunnel, step through on arrival.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/nexus-vortex/page.jsx', 'utf8');

test('destination picker: search + list + surprise me', () => {
  assert.match(page, /Where to\?/);
  assert.match(page, /Search programs/);
  assert.match(page, /Surprise me/);
  assert.match(page, /setQuery/);
});

test('every registered program is a destination except the vortex itself', () => {
  assert.match(page, /SATELLITES\.filter\(\(s\) => s\.key !== 'nexus-vortex'\)/);
  assert.match(page, /prettifyKey\(s\.key\)/);
});

test('flight names the destination; arrival steps through to it', () => {
  assert.match(page, /Flying\{destination \? ` to \$\{destination\.name\}` : ''\}/);
  assert.match(page, /You arrived/);
  assert.match(page, /Step through/);
  assert.match(page, /router\.push\(destination\.route\)/);
  assert.match(page, /Fly somewhere else/);
});

test('the dead-end panel is gone', () => {
  assert.doesNotMatch(page, /The Vortex holds steady/);
  assert.doesNotMatch(page, /nothing external was loaded/);
});

test('flight engine untouched', () => {
  assert.match(page, /makeTunnel\(900\)/);
  assert.match(page, /FLIGHT_MS = 8000/);
});
