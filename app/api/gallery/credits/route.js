// app/api/gallery/credits/route.js
// GET /api/gallery/credits -> { balance, creditsPerPack, packPriceCents }
// Reads the signed-in user's download-credit balance. Requires
// `Authorization: Bearer <supabase access_token>`.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { CREDITS_PER_PACK, PACK_PRICE_CENTS } from '@/lib/gallery';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) {
    // Ledger not wired yet: report honestly instead of guessing a balance.
    return NextResponse.json({ balance: 0, creditsPerPack: CREDITS_PER_PACK, packPriceCents: PACK_PRICE_CENTS, unconfigured: true });
  }
  try {
    const { data, error } = await admin
      .from('gallery_balances')
      .select('balance')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({
      balance: data?.balance ?? 0,
      creditsPerPack: CREDITS_PER_PACK,
      packPriceCents: PACK_PRICE_CENTS,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === 'PGRST205' || /gallery_balances/i.test(msg)) {
      return NextResponse.json({ balance: 0, creditsPerPack: CREDITS_PER_PACK, packPriceCents: PACK_PRICE_CENTS, pending_table: true });
    }
    return NextResponse.json({ error: 'Could not load your credit balance.' }, { status: 500 });
  }
});
