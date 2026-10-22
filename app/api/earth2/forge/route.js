// app/api/earth2/forge/route.js
// POST /api/earth2/forge — claim the gold the forge has poured since
// the last claim. The server recomputes the accrual from the owner's
// last forge row in earth2_ledger (lib/earth2/forge.js does the math)
// and credits it through the gold ledger under the economy's
// engagement cap group, so forged gold shares the $1/day ceiling
// with every other engagement source.
//
// The very first claim pours nothing — it lights the forge (a
// zero-amount ledger row starts the accrual clock).
//
// OWNER-LOCKED like every /api/earth2/* route: non-owners get a 404.

import { NextResponse } from 'next/server';
import { verifyOwnerSession } from '@/lib/owner';
import { getServiceClient } from '@/lib/economy/supabase';
import { creditGold, CapReachedError } from '@/lib/economy/ledger';
import { forgeAccrued, FORGE_DAILY_CAP_GOLD } from '@/lib/earth2/forge';

export const dynamic = 'force-dynamic';

async function requireOwner(req) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { user } = await verifyOwnerSession(token).catch(() => ({ user: null }));
  return user;
}

function notFound() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

export async function POST(req) {
  const user = await requireOwner(req);
  if (!user) return notFound();
  try {
    const db = await getServiceClient();
    if (!db) return NextResponse.json({ ok: false, setupRequired: true });

    const last = await db
      .from('earth2_ledger')
      .select('id, created_at')
      .eq('user_id', user.id)
      .eq('kind', 'forge')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) {
      if (isMissingTable(last.error)) {
        return NextResponse.json({ ok: false, setupRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'Could not read the forge.' }, { status: 502 });
    }

    const lastClaim = last.data ? Date.parse(last.data.created_at) : null;
    const accrued = forgeAccrued(lastClaim, Date.now());

    if (accrued <= 0) {
      if (!last.data) {
        // First touch: light the forge. The zero row is the clock start.
        const ins = await db.from('earth2_ledger').insert({
          user_id: user.id,
          kind: 'forge',
          parcel_id: null,
          amount_gold: 0,
          counterparty: 'gold-forge',
        });
        if (ins.error && isMissingTable(ins.error)) {
          return NextResponse.json({ ok: false, setupRequired: true });
        }
        return NextResponse.json({
          ok: true,
          claimed: 0,
          lit: true,
          forge: { accrued: 0, lastClaim: Date.now() },
        });
      }
      return NextResponse.json({
        ok: true,
        claimed: 0,
        forge: { accrued: 0, lastClaim },
      });
    }

    let credit;
    try {
      credit = await creditGold(
        {
          userId: user.id,
          amountGold: accrued,
          reason: 'earth2-forge',
          idemKey: `earth2-forge:${user.id}:${lastClaim}`,
          capGroup: 'engagement',
          capLimit: FORGE_DAILY_CAP_GOLD,
          meta: { source: 'gold-forge' },
        },
        db
      );
    } catch (e) {
      if (e instanceof CapReachedError) {
        return NextResponse.json(
          {
            ok: false,
            capped: true,
            error: 'The forge has poured all it can today — the daily cap is reached.',
          },
          { status: 429 }
        );
      }
      throw e;
    }

    if (!credit.wasDuplicate) {
      await db.from('earth2_ledger').insert({
        user_id: user.id,
        kind: 'forge',
        parcel_id: null,
        amount_gold: accrued,
        counterparty: 'gold-forge',
      });
    }

    return NextResponse.json({
      ok: true,
      claimed: accrued,
      gold: credit.balanceAfter,
      forge: { accrued: 0, lastClaim: Date.now() },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
