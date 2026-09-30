// POST /api/economy/mine/claim { log, tickCount } -> { ok, creditedGold, sells, gold }
// Liquid Gold mining claims. The server replays the submitted action log
// through the real game engine and credits MINE_GOLD_PER_BAR for every bar
// the replay proves was minted and sold. Nothing is trusted from the client
// except the action sequence itself — and a fabricated sequence that passes
// the replay IS real play.
//
// Idempotent per sell: resubmitting the same log credits nothing new;
// appending more play credits only the new sells.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ECONOMY } from '@/lib/economy/config';
import { getUserFromRequest } from '@/lib/economy/auth';
import { creditGold, EconomyUnavailableError, CapReachedError } from '@/lib/economy/ledger';
import { validateMineClaim, mineSellKey } from '@/lib/economy/mining';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const check = validateMineClaim({ log: body?.log, tickCount: body?.tickCount });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  let creditedGold = 0;
  const sells = [];
  try {
    for (const sell of check.sells) {
      if (sell.bars <= 0) continue; // selling an empty inventory proves nothing
      const amountGold = sell.bars * ECONOMY.MINE_GOLD_PER_BAR;
      const res = await creditGold({
        userId: auth.user.id,
        amountGold,
        reason: 'mining:liquid-gold',
        idemKey: mineSellKey(auth.user.id, sell.prefixHash),
        meta: { bars: sell.bars, game_credits: sell.gameValue, ticks: check.ticks },
        capGroup: 'mining',
        capLimit: ECONOMY.MINING_DAILY_CAP,
      });
      const credited = !res.wasDuplicate;
      if (credited) creditedGold += amountGold;
      sells.push({ bars: sell.bars, credited });
    }
  } catch (err) {
    if (err instanceof CapReachedError) {
      return NextResponse.json({
        ok: true, creditedGold, sells,
        capped: true,
        notice: `Daily mining limit reached (${ECONOMY.MINING_DAILY_CAP} gold). Come back tomorrow.`,
      });
    }
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not credit your gold.' }, { status: err.status || 502 });
  }

  return NextResponse.json({
    ok: true,
    creditedGold,
    sells,
    goldPerBar: ECONOMY.MINE_GOLD_PER_BAR,
    notice: creditedGold > 0
      ? `+${creditedGold} gold for your bars.`
      : 'Those bars were already credited — no double-dipping.',
  });
});
