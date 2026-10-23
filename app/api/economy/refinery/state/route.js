// app/api/economy/refinery/state/route.js
// The refinery's server-side memory, per account:
//   GET — the saved game (state + remaining log tail + its base) plus
//         today's aether-conversion tally and the server aether balance.
//         This is what makes leaving and returning restore the exact
//         refinery (Merlin's order, 2026-10-22).
//   PUT — save the game as it stands. The save can never move the
//         conversion checkpoint: checkpoint columns are written only by
//         the claim route from its own replay, so a tampered save is
//         cosmetic — conversions are credited from proven play only.
//
// Until supabase/refinery.sql (and supabase/aether.sql for the balance)
// run, GET answers { setupRequired: true } and the page plays in local
// preview with an honest notice — nothing pretends to be saved.

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  loadRefineryRow, saveRefinerySave, refinerySummary, RefinerySetupError,
} from '@/lib/economy/refinery';
import { getAetherBalance } from '@/lib/economy/aether';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function summary(userId, client) {
  try {
    return await refinerySummary(userId, client);
  } catch (err) {
    if (err instanceof RefinerySetupError) throw err;
    return { convertedTodayGold: 0, capRemainingGold: null };
  }
}

export async function GET(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  try {
    const client = await getServiceClient();
    if (!client) return NextResponse.json({ setupRequired: true });
    const row = await loadRefineryRow(user.id, client);
    const sum = await summary(user.id, client);
    let aether = null;
    try { aether = await getAetherBalance(user.id, client); } catch { aether = null; }
    if (!row || !row.game_state) {
      return NextResponse.json({ saved: null, ...sum, aetherBalance: aether });
    }
    return NextResponse.json({
      saved: {
        gameState: row.game_state,
        log: Array.isArray(row.action_log) ? row.action_log : [],
        base: row.checkpoint_prefix_hash
          ? {
              prefixHash: row.checkpoint_prefix_hash,
              baseTick: row.checkpoint_base_tick || 0,
              coveredI: row.checkpoint_covered || 0,
            }
          : (row.save_base || null),
        updatedAt: row.updated_at || null,
      },
      ...sum,
      aetherBalance: aether,
    });
  } catch (err) {
    if (err instanceof RefinerySetupError || err?.setupRequired) {
      return NextResponse.json({ setupRequired: true });
    }
    return NextResponse.json({ error: 'Could not load your refinery.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { gameState, log, base } = body || {};
  if (!gameState || typeof gameState !== 'object') {
    return NextResponse.json({ error: 'Missing refinery state.' }, { status: 400 });
  }

  try {
    const client = await getServiceClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Refinery saving is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    const saved = await saveRefinerySave(
      user.id,
      { gameState, log: Array.isArray(log) ? log : [], base: base || null },
      client,
    );
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    if (err instanceof RefinerySetupError || err?.setupRequired) {
      return NextResponse.json(
        { error: 'Refinery saving is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Could not save your refinery.' : err.message },
      { status },
    );
  }
}
