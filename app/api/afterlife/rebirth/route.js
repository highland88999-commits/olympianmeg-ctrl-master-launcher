// POST /api/afterlife/rebirth { realm, action: 'attune'|'ride' }
//   -> { ok, destination, attuned, serverStored }
//
// THE WHEEL OF REBIRTH (Naraka / Diyu only): the rebirth gate.
// Attuning records the player's respawn point — the wheel that
// remembers you. Riding returns you to the world above (the hub).
// The ride always works: the rebirth point is device-local first
// (lib/afterlife/souls.js, the portal-progress pattern) and the
// server mirror (soul_balances.respawn_realm) is best-effort — a
// missing souls table never blocks the ride, it just reports
// serverStored: false.
//
//   400 unknown_realm — only Naraka and Diyu have a wheel
//   503 souls_setup_required — only when the caller needs the
//       server copy; the ride itself never 503s on this.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { setRespawnRealm, SoulUnavailableError } from '@/lib/economy/souls';
import { hasWheel, REBIRTH_DESTINATION } from '@/lib/afterlife/rebirth';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const realm = typeof body?.realm === 'string' ? body.realm.trim().slice(0, 80) : '';
  const action = body?.action === 'ride' ? 'ride' : body?.action === 'attune' ? 'attune' : '';
  if (!realm || !action || !hasWheel(realm)) {
    return NextResponse.json({ ok: false, reason: 'unknown_realm' }, { status: 400 });
  }

  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  const userId = auth.user.id;

  // The server mirror is best-effort: the device-local copy is the
  // live one, so a missing souls table (or no service client) never
  // blocks the attune or the ride.
  let serverStored = false;
  try {
    const admin = await getServiceClient();
    if (admin) {
      const res = await setRespawnRealm({ userId, realm }, admin);
      serverStored = !!res.stored;
    }
  } catch (err) {
    if (err instanceof SoulUnavailableError) {
      serverStored = false;
    } else {
      throw err;
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    realm,
    attuned: true,
    serverStored,
    ...(action === 'ride' ? { destination: REBIRTH_DESTINATION.route, label: REBIRTH_DESTINATION.label } : {}),
  });
});
