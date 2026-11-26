// ARES abyss catch-all — DISABLED (Phase 1, standing law — 2026-11-25).
//
// Same as the abyss index route: the sandbox maze is off, the tarpit
// stays off, and every subpath answers the same plain 404 as every
// honeypot trap. The file stays; lib/ares/tarpit.js, dolls.js, and
// prison.js are untouched. Re-enable only on Merlin's explicit word.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
