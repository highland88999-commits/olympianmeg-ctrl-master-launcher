import { NextResponse } from 'next/server';
import { checkMollyPasscode } from '@/lib/molly/gate';

// Molly's door (server-side only).
//
// The passcode itself is never stored, logged, or displayed anywhere —
// only its SHA-256 hash below. The browser posts what the visitor typed;
// this route hashes it and compares. A failed attempt waits briefly before
// answering, so guessing is slow. Nothing about the attempt is logged.
//
// This gate is a privacy screen for a testing sandbox, not a vault: the
// sandbox behind it holds no secrets by design (the real Molly stays
// sealed in her own private repo), so there is nothing valuable to steal
// past it.
const MOLLY_GATE_HASH =
  '731c883e561fe35d7c33b5c97f6e6d35ffda8f7b22e3fb64058a0b47ee4bd42a';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const passcode = body && typeof body.passcode === 'string' ? body.passcode : '';
  const ok = checkMollyPasscode(passcode, MOLLY_GATE_HASH);
  if (!ok) {
    await sleep(1500);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
