// tests/molly-sandbox.test.mjs
//
// Molly's testing-sandbox portal inside Olympus (Merlin, 2026-10-28):
// a Concourse tile named Molly opens /molly, a passcode door guards it,
// and the sandbox behind the door is a contained demo copy — no outside
// services, no real Molly, nothing sent anywhere.
//
// The passcode itself appears NOWHERE in this repo: the route holds only
// its SHA-256 hash, and these tests use a dummy hash computed in-test.
// The gate check runs server-side; the browser bundle never sees the hash.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMollyPasscode, sha256Hex } from '../lib/molly/gate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('gate accepts the right input and rejects everything else', () => {
  const dummy = 'test-only-value';
  const hash = sha256Hex(dummy);
  assert.equal(hash.length, 64);
  assert.equal(checkMollyPasscode(dummy, hash), true);
  assert.equal(checkMollyPasscode('wrong', hash), false);
  assert.equal(checkMollyPasscode('', hash), false);
  assert.equal(checkMollyPasscode(null, hash), false);
  assert.equal(checkMollyPasscode(1234, hash), false);
  assert.equal(checkMollyPasscode(dummy, 'short'), false);
});

test('gate route only exports POST and never logs', () => {
  const route = read('app/api/molly/gate/route.js');
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export (const|function|async function) GET/);
  assert.doesNotMatch(route, /console\.log/);
  assert.match(route, /[0-9a-f]{64}/); // a hash lives here, never a passcode
});

test('Concourse carries a Molly tile that opens /molly', () => {
  const concourse = read('components/Concourse.jsx');
  assert.match(concourse, /\{\s*id:\s*'molly',\s*label:\s*'Molly'/);
  assert.match(concourse, /tile\.id === 'molly'\) router\.push\('\/molly'\)/);
});

test('sandbox page is a contained demo: gate + banner + no outside calls', () => {
  const page = read('app/molly/page.jsx');
  assert.match(page, /SANDBOX — TESTING ONLY/);
  assert.match(page, /\/api\/molly\/gate/);
  assert.match(page, /type="password"/);
  assert.doesNotMatch(page, /fetch\('https?:\/\//);
  assert.doesNotMatch(page, /supabase|firebase|stripe/i);
  assert.match(page, /Run a demo hunt/);
  assert.match(page, /Freeze Molly/);
});
