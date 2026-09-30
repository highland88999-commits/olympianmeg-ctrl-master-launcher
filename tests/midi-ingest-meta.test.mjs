// Regression: /api/midi/ingest must return real metadata (duration/tracks/notes),
// not zeros, on the local (no-cloud) path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { POST } from '../app/api/midi/ingest/route.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'public', 'midi', 'axel-f-1.mid');

test('ingest local path returns parsed metadata for Axel F', async () => {
  const buf = await readFile(seedPath);
  const form = new FormData();
  form.append('file', new File([buf], 'Axel-F-1.mid', { type: 'audio/midi' }));
  const req = new Request('http://localhost/api/midi/ingest', { method: 'POST', body: form });
  const res = await POST(req);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.cloud, false);
  // The known-good parse of the seed file (verified 2026-09-30).
  assert.equal(j.entry.tracks, 10);
  assert.equal(j.entry.notes, 4466);
  assert.ok(Math.abs(j.entry.duration - 183.22) < 0.01, `duration was ${j.entry.duration}`);
  assert.equal(j.entry.hash, '7382306b143ea3a8e9612a1a07462ad345600db4296ae56865e5b4d9cc92123f');
  assert.ok(j.dataBase64.length > 1000, 'bytes handed back for immediate load');
});

test('ingest rejects non-MIDI uploads', async () => {
  const form = new FormData();
  form.append('file', new File(['hello not midi'], 'nope.txt', { type: 'text/plain' }));
  const req = new Request('http://localhost/api/midi/ingest', { method: 'POST', body: form });
  const res = await POST(req);
  assert.equal(res.status, 400);
});
