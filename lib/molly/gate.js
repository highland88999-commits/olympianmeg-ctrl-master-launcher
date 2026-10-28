// lib/molly/gate.js
//
// Molly's door — pure helpers, no framework, no logging, no storage.
//
// The gate keeps a testing sandbox out of casual sight. It is NOT a vault:
// the sandbox behind it holds no secrets by design (the real Molly stays
// sealed in her own private repo), and the check below is a privacy screen,
// not a security boundary.
//
// The passcode itself is NEVER stored, logged, or displayed anywhere —
// only its SHA-256 hash lives in the route that uses this helper. The
// hash comparison runs server-side only; the browser bundle never sees it.

import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function checkMollyPasscode(input, expectedHash) {
  if (typeof input !== 'string' || input.length === 0) return false;
  if (typeof expectedHash !== 'string' || expectedHash.length !== 64) return false;
  const a = Buffer.from(sha256Hex(input), 'utf8');
  const b = Buffer.from(expectedHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
