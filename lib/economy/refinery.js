// lib/economy/refinery.js
// Liquid Gold Refinery conversions, server-validated.
// (Merlin's corrected model, 2026-10-22.)
//
// THE MODEL: the refinery's input is molten gold. Each refined batch
// converts to the output the player picked:
//   'bars'   — gold bars, the refinery's upgrade currency. A purely
//              internal loop (bars persist in the server save; upgrades
//              are bought with them). Uncapped, no ledger, no diary.
//   'aether' — the platform's TRUE currency. Aether mints are proven by
//              replay and credited to the server aether balance
//              (lib/economy/aether.js) under a 1000 gold-value/day cap
//              that governs this leg alone — the gold scattered through
//              the universe, mining, engagement and the forge keep
//              their own rules and are never counted here.
//
// HOW IT STAYS HONEST:
// - State + log persist server-side per account (refinery_state), so
//   leaving and returning restores the exact game.
// - Claims replay the action log through the REAL engine (same physics
//   discipline as lib/economy/mining.js) — but from a server CHECKPOINT:
//   after a claim converts every aether mint it covers, the route
//   stores the replayed end state as the new checkpoint (written only
//   here, never by the client), and later claims replay only the tail
//   since that seal. Segments are capped instead of a whole lifetime,
//   so a years-old refinery stays claimable.
// - A mint's identity is its global sequence number (the checkpoint's
//   barsMinted + position in the replay) — path-independent across
//   full and segmented replays. Conversions are TRANCHES of a mint:
//   each converts whole bar-equivalents up to the remaining daily
//   headroom, and the rest stays claimable tomorrow. Tranche keys are
//   deterministic, so retries heal instead of double-crediting.

import { createHash } from 'node:crypto';
import { ECONOMY } from './config.js';
import {
  creditAether, getAetherBalance,
  AetherCapReachedError, AetherUnavailableError,
} from './aether.js';
import {
  newState, pourTick, refineTick,
  togglePour, activateSurge, buyUpgradeWithBars, setOutput, TICK,
} from '../../app/liquid-gold/engine.js';
import {
  REFINERY_OUTPUT_AETHER, refineryGoldValue,
  toStoredState, toEngineState, cleanLogAction,
} from './refinery-shared.js';

export const REFINERY_AETHER_REASON = 'refinery:conversion';

export class RefinerySetupError extends Error {
  constructor() { super('Refinery persistence is not connected yet.'); this.status = 503; this.setupRequired = true; }
}
export class RefineryResyncError extends Error {
  constructor() { super('Refinery state is out of sync — reload your saved refinery.'); this.status = 409; this.resync = true; }
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' ||
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

function fail(error) { return { ok: false, error }; }

function cloneState(st) {
  return { ...st, upgrades: { ...st.upgrades } };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// --- Replay ---------------------------------------------------------------

/**
 * Replay a refinery log segment through the real engine.
 *   log:        raw submitted actions ({ t, a, ... }; 'mode' actions
 *               carry the conversion output pick, buys spend bars)
 *   tickCount:  absolute game tick the segment runs to
 *   startState: engine state to start from (checkpoint or fresh)
 *   startTick:  absolute tick startState corresponds to
 * Returns { ok:true, conversions, endState, ordered, boundaries }:
 *   conversions — the AETHER mints proven, each { mintIndex, tick, iter }
 *                 (mintIndex is the mint's global sequence number)
 *   boundaries  — map of iteration k (an aether mint happened in it) to
 *                 the seal snapshot taken after that tick completed:
 *                 { baseTick: k+1, state, coveredThruTick: k }
 * Or { ok:false, error }.
 */
export function replayRefinery({ log, tickCount, startState = null, startTick = 0 }) {
  if (!Array.isArray(log)) return fail('Invalid game log.');
  if (log.length > ECONOMY.REFINERY_MAX_ACTIONS_PER_CLAIM) return fail('Game log is too long for one claim.');
  if (!Number.isInteger(tickCount) || !Number.isInteger(startTick) || startTick < 0 || tickCount < startTick) {
    return fail('Invalid game length.');
  }
  if (tickCount - startTick > ECONOMY.REFINERY_MAX_SEGMENT_TICKS) {
    return fail('Game segment is too long for one claim.');
  }

  // Shape-check every action.
  for (const a of log) {
    const clean = cleanLogAction(a);
    if (!clean) return fail('Invalid game log entry.');
    if (clean.t < startTick || clean.t > tickCount) return fail('Game log timestamps out of range.');
  }

  // Stable canonical order: by tick, then original position.
  const indexed = log.map((a, i) => ({ a, i }));
  indexed.sort((x, y) => (x.a.t - y.a.t) || (x.i - y.i));
  const ordered = indexed.map((e) => e.a);

  const st = startState ? cloneState(startState) : newState();
  const startBarsMinted = Math.max(0, Math.floor(Number(st.barsMinted) || 0));
  let mintsSeen = 0;
  const conversions = [];
  const boundaries = new Map();
  let li = 0;

  const applyAction = (a) => {
    if (a.a === 'pour') {
      if (st.pouring !== a.on) togglePour(st);
    } else if (a.a === 'surge') {
      activateSurge(st);
    } else if (a.a === 'buy') {
      buyUpgradeWithBars(st, a.kind);
    } else if (a.a === 'mode') {
      setOutput(st, a.out);
    }
  };

  // Mirror the client's tick loop exactly: actions stamped t==k happen
  // after k ticks completed, before tick k+1; then the tick advances,
  // pours, refines — and a batch that finishes refining converts to
  // the output in effect for that tick.
  for (let k = startTick; k < tickCount; k++) {
    while (li < ordered.length && ordered[li].t === k) { applyAction(ordered[li]); li++; }
    const outputThisTick = st.output;
    st.now += TICK;
    pourTick(st, TICK);
    const minted = refineTick(st, TICK);
    if (minted > 0) {
      const mintIndex = startBarsMinted + mintsSeen;
      mintsSeen += minted;
      if (outputThisTick === REFINERY_OUTPUT_AETHER) {
        conversions.push({ mintIndex, tick: k + 1, iter: k });
        boundaries.set(k, { baseTick: k + 1, state: null, coveredThruTick: k });
      }
    }
    if (boundaries.has(k)) boundaries.get(k).state = cloneState(st);
  }
  // Trailing actions (a mode flip can land after the last completed tick).
  while (li < ordered.length) {
    if (ordered[li].t !== tickCount) return fail('Game log timestamps out of range.');
    applyAction(ordered[li]); li++;
  }

  return { ok: true, conversions, endState: st, ordered, boundaries };
}

/** Idempotency base key for one proven aether mint. */
export function refineryMintKey(userId, mintIndex) {
  return `refinery:${userId}:mint:${mintIndex}`;
}

/** sha256 of the canonical ordered log prefix ending at index `end`. */
export function prefixHashOf(ordered, end) {
  return sha256(JSON.stringify(ordered.slice(0, end + 1)));
}

/** Chained hash for a tail prefix, chained from a checkpoint's hash. */
export function chainedPrefixHash(baseHash, orderedTail, end) {
  return sha256(`${baseHash}|${JSON.stringify(orderedTail.slice(0, end + 1))}`);
}

// --- Persistence (refinery_state) ------------------------------------------

export async function loadRefineryRow(userId, client) {
  const { data, error } = await client
    .from('refinery_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new RefinerySetupError();
    const e = new Error('Could not load your refinery.'); e.status = 502; e.cause = error; throw e;
  }
  return data || null;
}

/** Save the client's game (state + log tail + its base descriptor). */
export async function saveRefinerySave(userId, { gameState, log, base }, client) {
  const stored = toStoredState(gameState);
  if (!stored) { const e = new Error('Invalid refinery state.'); e.status = 400; throw e; }
  if (!Array.isArray(log) || log.length > 6000) {
    const e = new Error('Invalid refinery log.'); e.status = 400; throw e;
  }
  const cleanedLog = [];
  for (const a of log) {
    const clean = cleanLogAction(a);
    if (!clean) { const e = new Error('Invalid refinery log entry.'); e.status = 400; throw e; }
    cleanedLog.push(clean);
  }
  const saveBase = base && typeof base === 'object'
    ? {
        prefixHash: typeof base.prefixHash === 'string' ? base.prefixHash : null,
        baseTick: Number.isInteger(base.baseTick) ? base.baseTick : 0,
        coveredI: Number.isInteger(base.coveredI) ? base.coveredI : 0,
      }
    : null;

  const existing = await loadRefineryRow(userId, client);
  const patch = {
    game_state: stored,
    action_log: cleanedLog,
    save_base: saveBase,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await client.from('refinery_state').update(patch).eq('user_id', userId);
    if (error) { const e = new Error('Could not save your refinery.'); e.status = 502; e.cause = error; throw e; }
  } else {
    const { error } = await client.from('refinery_state').insert({ user_id: userId, ...patch });
    if (error) {
      if (isMissingTable(error)) throw new RefinerySetupError();
      const e = new Error('Could not save your refinery.'); e.status = 502; e.cause = error; throw e;
    }
  }
  return { gameState: stored, log: cleanedLog, base: saveBase };
}

// --- Conversion diary --------------------------------------------------------

async function loadDiary(userId, client) {
  const { data, error } = await client
    .from('refinery_conversions')
    .select('mint_key, mint_index, gold_value, aether_credited, created_at')
    .eq('user_id', userId);
  if (error) {
    if (isMissingTable(error)) throw new RefinerySetupError();
    const e = new Error('Could not read your conversions.'); e.status = 502; e.cause = error; throw e;
  }
  return data || [];
}

function utcDay(iso) { return String(iso || '').slice(0, 10); }

/** Diary aggregates: today's converted gold value + per-mint progress. */
export function diaryTotals(rows, nowIso = new Date().toISOString()) {
  const today = utcDay(nowIso);
  let todayGoldValue = 0;
  const byMintKey = new Map();
  for (const r of rows) {
    if (utcDay(r.created_at) === today) todayGoldValue += r.gold_value || 0;
    byMintKey.set(r.mint_key, (byMintKey.get(r.mint_key) || 0) + (r.gold_value || 0));
  }
  return { todayGoldValue, byMintKey };
}

export async function refinerySummary(userId, client) {
  const rows = await loadDiary(userId, client);
  const totals = diaryTotals(rows);
  return {
    convertedTodayGold: totals.todayGoldValue,
    capRemainingGold: Math.max(0, ECONOMY.REFINERY_DAILY_CAP - totals.todayGoldValue),
  };
}

// --- The claim ---------------------------------------------------------------

/**
 * Process one refinery claim. `base` is the client's checkpoint
 * descriptor ({ prefixHash, baseTick, coveredI }) or null for a full
 * log. Aether mints proven by the replay are credited to the server
 * aether balance in whole-bar tranches up to the daily headroom; the
 * checkpoint then seals over fully-converted play.
 */
export async function processRefineryClaim({ userId, log, tickCount, base = null }, client) {
  if (!client) { const e = new Error('The gold service is not connected yet.'); e.status = 503; throw e; }
  const row = await loadRefineryRow(userId, client);

  // Decide the replay start: verified checkpoint (segmented) or fresh.
  let startState = null;
  let startTick = 0;
  let segmented = false;
  if (base && typeof base === 'object' && base.prefixHash) {
    const matches = row
      && row.checkpoint_prefix_hash === base.prefixHash
      && row.checkpoint_base_tick === base.baseTick
      && row.checkpoint_covered === base.coveredI
      && row.checkpoint_state;
    if (!matches) throw new RefineryResyncError();
    startState = toEngineState(row.checkpoint_state);
    if (!startState) throw new RefineryResyncError();
    startTick = base.baseTick;
    segmented = true;
  }

  const replay = replayRefinery({ log, tickCount, startState, startTick });
  if (!replay.ok) { const e = new Error(replay.error); e.status = 400; throw e; }
  const { conversions, endState, ordered, boundaries } = replay;

  const diary = await loadDiary(userId, client);
  const totals = diaryTotals(diary);
  let todayGoldValue = totals.todayGoldValue;

  const outcomes = [];
  let creditedAether = 0;
  let firstUnconverted = null; // first aether mint not fully converted

  for (const mint of conversions) {
    const goldValue = refineryGoldValue(1);
    const mintKey = refineryMintKey(userId, mint.mintIndex);
    const already = totals.byMintKey.get(mintKey) || 0;
    const remaining = goldValue - already;
    if (remaining <= 0) {
      outcomes.push({ mintIndex: mint.mintIndex, goldValue, converted: 0, aetherCredited: 0, outcome: 'duplicate' });
      continue;
    }

    // Whole bar-equivalents only: aether is integer-denominated, so a
    // tranche never splits a bar. A headroom smaller than one bar
    // means the mint waits for tomorrow, whole.
    const headroom = ECONOMY.REFINERY_DAILY_CAP - todayGoldValue;
    const rawConvert = Math.min(remaining, Math.max(0, headroom));
    const convertNow = rawConvert - (rawConvert % ECONOMY.MINE_GOLD_PER_BAR);
    if (convertNow <= 0) {
      outcomes.push({ mintIndex: mint.mintIndex, goldValue, converted: 0, aetherCredited: 0, outcome: 'capped' });
      if (!firstUnconverted) firstUnconverted = mint;
      continue;
    }
    const aetherAmount = (convertNow / ECONOMY.MINE_GOLD_PER_BAR) * ECONOMY.AETHER_PER_BAR;
    const trancheKey = `${mintKey}:t${already}`;

    try {
      await creditAether({
        userId,
        amount: aetherAmount,
        reason: REFINERY_AETHER_REASON,
        idemKey: trancheKey,
        meta: { mint_key: mintKey, mint_index: mint.mintIndex },
        capGroup: 'refinery',
        capLimit: ECONOMY.REFINERY_AETHER_DAILY_CAP,
      }, client);
    } catch (err) {
      if (err instanceof AetherCapReachedError) {
        outcomes.push({ mintIndex: mint.mintIndex, goldValue, converted: 0, aetherCredited: 0, outcome: 'capped' });
        if (!firstUnconverted) firstUnconverted = mint;
        continue;
      }
      if (err instanceof AetherUnavailableError) throw new RefinerySetupError();
      throw err;
    }

    const { error: insErr } = await client.from('refinery_conversions').insert({
      user_id: userId,
      mint_key: mintKey,
      mint_index: mint.mintIndex,
      gold_value: convertNow,
      aether_credited: aetherAmount,
      idempotency_key: trancheKey,
    });
    if (insErr && isMissingTable(insErr)) throw new RefinerySetupError();
    if (insErr && String(insErr.code) !== '23505') {
      const e = new Error('Could not record your conversion.'); e.status = 502; e.cause = insErr; throw e;
    }

    todayGoldValue += convertNow;
    creditedAether += aetherAmount;
    totals.byMintKey.set(mintKey, already + convertNow);

    const done = convertNow >= remaining;
    outcomes.push({
      mintIndex: mint.mintIndex, goldValue,
      converted: convertNow, aetherCredited: aetherAmount,
      outcome: done ? 'converted' : 'partial',
    });
    if (!done && !firstUnconverted) firstUnconverted = mint;
  }

  // --- Seal: advance the checkpoint over fully-converted play only. ---
  let sealed = null;
  let sealState = null;
  let sealBaseTick = null;
  let sealCoveredThruTick = null;
  if (!firstUnconverted) {
    sealState = endState;
    sealBaseTick = tickCount;
    sealCoveredThruTick = tickCount;
  } else {
    // Greatest aether-mint boundary strictly before the blocking mint's
    // iteration (a boundary past it would seal over unconverted value).
    let best = null;
    for (const [iter, snap] of boundaries) {
      if (snap && snap.state && iter < firstUnconverted.iter && (!best || iter > best.coveredThruTick)) {
        best = snap;
      }
    }
    if (best) {
      sealState = best.state;
      sealBaseTick = best.baseTick;
      sealCoveredThruTick = best.coveredThruTick;
    }
  }
  if (sealState) {
    const coveredCount = ordered.filter((a) => a.t <= sealCoveredThruTick).length;
    const storedSeal = toStoredState(sealState);
    if (storedSeal && coveredCount > 0) {
      const coveredI = (segmented ? base.coveredI : 0) + coveredCount;
      const prefixHash = segmented
        ? chainedPrefixHash(base.prefixHash, ordered, coveredCount - 1)
        : prefixHashOf(ordered, coveredCount - 1);
      const patch = {
        checkpoint_state: storedSeal,
        checkpoint_base_tick: sealBaseTick,
        checkpoint_covered: coveredI,
        checkpoint_prefix_hash: prefixHash,
        updated_at: new Date().toISOString(),
      };
      const { error } = row
        ? await client.from('refinery_state').update(patch).eq('user_id', userId)
        : await client.from('refinery_state').insert({ user_id: userId, ...patch });
      if (error && isMissingTable(error)) throw new RefinerySetupError();
      if (error) { const e = new Error('Could not seal your refinery.'); e.status = 502; e.cause = error; throw e; }
      sealed = { coveredI, baseTick: sealBaseTick, prefixHash };
    }
  }

  let aetherBalance = null;
  try { aetherBalance = await getAetherBalance(userId, client); } catch { aetherBalance = null; }
  return {
    ok: true,
    conversions: outcomes,
    creditedAether,
    capped: outcomes.some((o) => o.outcome === 'capped' || o.outcome === 'partial'),
    convertedTodayGold: todayGoldValue,
    capRemainingGold: Math.max(0, ECONOMY.REFINERY_DAILY_CAP - todayGoldValue),
    aetherBalance,
    sealed,
  };
}
