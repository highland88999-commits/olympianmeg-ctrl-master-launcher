// lib/aquarium/pin-gate.js
//
// Deletion asks for Merlin's PIN — the SAME pin he uses to log in to
// ARES. This module does not check the PIN itself: it posts what was
// typed to /api/molly/gate, the exact endpoint the ARES console's Pin
// wall uses (app/ares/page.jsx PinWall), so the same PIN opens both
// doors and there is only ever one check to keep true.
//
// The PIN value never appears in this file, in any log, or in any
// test — tests call this with a mocked fetch and a dummy value, never
// the real one. A wrong PIN waits on the server (1.5 s) and answers
// 401; a network failure answers false. Either way, deletion does not
// happen.

export const ARES_PIN_GATE_URL = '/api/molly/gate';

export async function verifyAresPin(passcode, fetchImpl) {
  if (typeof passcode !== 'string' || passcode.length === 0) return false;
  const doFetch = fetchImpl || fetch;
  try {
    const res = await doFetch(ARES_PIN_GATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    return !!res && res.ok === true;
  } catch {
    return false;
  }
}
