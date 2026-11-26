// ARES abyss — DISABLED (Phase 1, standing law — 2026-11-25).
//
// This route used to serve the sandbox maze (lib/ares/tarpit.js: fake
// pages + a slow drip) and to trap extra-malicious sources persistently.
// That is a tarpit, and the tarpit stays OFF: ARCHITECTURE.md §1c.7
// makes it Phase 3, explicit Merlin opt-in only, and the standing
// posture since 2026-09-28 is no-tarpit. The middleware no longer
// rewrites anything here, the honeypot no longer branches here, and
// this route now answers the same plain 404 as every honeypot trap.
//
// The file stays (nothing is deleted): lib/ares/tarpit.js, dolls.js,
// and prison.js are untouched, and the maze builders still work as
// pure functions under test. Re-enable only on Merlin's explicit word.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
