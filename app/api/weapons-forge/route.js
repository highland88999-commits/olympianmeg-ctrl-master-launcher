// app/api/weapons-forge/route.js
// THE WEAPONS FORGE (Merlin, 2026-10-23) — forge weapons into your
// backpack (lib/backpack). The catalogue + costs live in
// lib/backpack/weapons.js; this route is the till:
//
//   GET  -> { signedIn, bars } — the caller's gold-bar balance of
//           record (the refinery save's game_state.bars; null when
//           the refinery is not set up or the visitor is signed
//           out). The catalogue and the backpack itself are client
//           data — the page reads them from lib + the backpack
//           store; only the balance needs the server.
//   POST { weaponId, idemKey } -> forge one weapon:
//           1. materials are debited from the SERVER copy of the
//              backpack record (account_state preferences — the
//              client flushes its record before calling, the store's
//              merge is the write path);
//           2. the forged weapon is written into that same record,
//              its reticle stamped by the reticle law at creation;
//           3. gold bars are debited through the refinery save's
//              own writer (saveRefinerySave, log + base untouched)
//              — bars live in that save by the platform's design;
//              the gold/aether LEDGERS are never touched here.
//           An idemKey is honoured once: a retried forge returns
//           the record as it stands instead of charging twice.
//           If the bars write fails after the weapon is shelved,
//           the forge answers ok anyway — the traveller keeps the
//           weapon; the house eats a bookkeeping error rather than
//           the other way round (documented in the build report).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { sanitizeBackpackRecord } from '@/lib/backpack/backpack';
import {
  forgeWeaponById,
  forgeAffordability,
  applyForgeToRecord,
} from '@/lib/backpack/weapons';
import {
  loadRefineryRow,
  saveRefinerySave,
  RefinerySetupError,
} from '@/lib/economy/refinery';

/** The caller's bar balance + the refinery row (null row when the
 *  refinery has never saved for them). Throws RefinerySetupError
 *  when the tables are not there yet. */
async function readBars(userId, client) {
  const row = await loadRefineryRow(userId, client);
  if (!row || !row.game_state) return { row: null, bars: 0 };
  const bars = Math.max(0, Math.floor(Number(row.game_state.bars) || 0));
  return { row, bars };
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ signedIn: false, bars: null });
    const client = await getServiceClient();
    if (!client) return NextResponse.json({ signedIn: true, bars: null, setupRequired: true });
    try {
      const { bars } = await readBars(auth.user.id, client);
      return NextResponse.json({ signedIn: true, bars });
    } catch (err) {
      if (err instanceof RefinerySetupError) {
        return NextResponse.json({ signedIn: true, bars: null, setupRequired: true });
      }
      throw err;
    }
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.user.id;

    const client = await getServiceClient();
    if (!client) return NextResponse.json({ error: 'The forge is not connected yet.', setupRequired: true }, { status: 503 });

    const body = await req.json().catch(() => null);
    const weapon = forgeWeaponById(body && body.weaponId);
    if (!weapon) return NextResponse.json({ error: 'Unknown weapon.' }, { status: 400 });
    const idemKey = typeof (body && body.idemKey) === 'string' && body.idemKey
      ? body.idemKey.slice(0, 80)
      : null;

    // The server copy of the pack — the authority for materials.
    const { data: stateRow, error: stateErr } = await client
      .from('account_state')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle();
    if (stateErr) throw stateErr;
    const record = sanitizeBackpackRecord(
      stateRow && stateRow.preferences ? stateRow.preferences.backpack : null
    );

    if (idemKey && record.forgeKeys.includes(idemKey)) {
      let bars = null;
      try { bars = (await readBars(userId, client)).bars; } catch { bars = null; }
      return NextResponse.json({ ok: true, duplicate: true, backpack: record, bars });
    }

    // Bars: read the balance of record.
    let barsInfo;
    try {
      barsInfo = await readBars(userId, client);
    } catch (err) {
      if (err instanceof RefinerySetupError) {
        return NextResponse.json(
          { error: 'The refinery is not set up yet, so gold bars cannot be read.', setupRequired: true },
          { status: 503 }
        );
      }
      throw err;
    }

    const afford = forgeAffordability(record, weapon, barsInfo.bars);
    if (!afford.ok) {
      return NextResponse.json(
        { error: 'The forge lacks the price.', missing: afford.missing, backpack: record, bars: barsInfo.bars },
        { status: 409 }
      );
    }

    const applied = applyForgeToRecord(record, weapon, idemKey);
    if (!applied.ok) {
      return NextResponse.json(
        { error: 'The forge lacks the price.', missing: applied.missing, backpack: record, bars: barsInfo.bars },
        { status: 409 }
      );
    }

    // Shelve the weapon (materials already out) in the account copy.
    const { data: merged, error: mergeErr } = await client.rpc('merge_account_preferences', {
      p_user_id: userId,
      p_patch: { backpack: applied.record },
    });
    if (mergeErr) throw mergeErr;
    const savedRecord = sanitizeBackpackRecord(
      merged && merged.backpack ? merged.backpack : applied.record
    );

    // Settle the bars through the refinery save's own writer.
    let bars = barsInfo.bars;
    if (applied.barsDue > 0 && barsInfo.row) {
      try {
        const gameState = { ...barsInfo.row.game_state, bars: barsInfo.bars - applied.barsDue };
        await saveRefinerySave(userId, {
          gameState,
          log: Array.isArray(barsInfo.row.action_log) ? barsInfo.row.action_log : [],
          base: barsInfo.row.save_base || null,
        }, client);
        bars = barsInfo.bars - applied.barsDue;
      } catch {
        // The weapon is shelved and the materials are spent; the
        // house eats the bars bookkeeping error (see header).
        bars = barsInfo.bars;
      }
    }

    return NextResponse.json({ ok: true, backpack: savedRecord, bars, weapon: weapon.name });
  })
);
