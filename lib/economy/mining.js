// lib/economy/mining.js
// Liquid Gold mining claims, server-validated.
//
// The client plays locally and records an append-only action log:
//   { t: <ticks completed when the action happened>, a: 'pour'|'surge'|'buy'|'sell',
//     on?: boolean, kind?: 'pump'|'filter'|'vat' }
// On every sell the client POSTs { log, tickCount }. The server replays the
// log through the REAL game engine (app/liquid-gold/engine.js) from a fresh
// state and credits gold only for the bars the replay proves were minted and
// sold. A tampered client cannot inflate earnings: the log is just actions,
// and the physics are recomputed here.
//
// Idempotency: each sell in the log gets key
//   mine:<userId>:<sha256 of the canonical log prefix up to and including it>
// Resubmitting the same log (retry, double-click, or a copied log) hits the
// existing keys and credits nothing new. Appending more play creates new
// prefixes, so continued play keeps earning.

import { createHash } from 'node:crypto';
import { ECONOMY } from './config.js';
import {
  newState, pourTick, refineTick, sellBars,
  togglePour, activateSurge, buyUpgrade, TICK,
} from '../../app/liquid-gold/engine.js';

const ACTION_TYPES = new Set(['pour', 'surge', 'buy', 'sell']);
const BUY_KINDS = new Set(['pump', 'filter', 'vat']);

function fail(error) {
  return { ok: false, error };
}

/**
 * Validate the claim shape and replay it.
 * Returns { ok:true, sells:[{ bars, gameValue, prefixHash }], ticks } or { ok:false, error }.
 * `sells` is in log order; prefixHash identifies the log prefix through that sell.
 */
export function validateMineClaim({ log, tickCount }) {
  if (!Array.isArray(log) || log.length === 0) return fail('No game activity to verify.');
  if (log.length > ECONOMY.MINE_MAX_ACTIONS_PER_CLAIM) return fail('Game log is too long for one claim.');
  if (!Number.isInteger(tickCount) || tickCount < 1 || tickCount > ECONOMY.MINE_MAX_TICKS_PER_CLAIM) {
    return fail('Invalid game length.');
  }

  // Shape-check every action.
  for (const a of log) {
    if (!a || typeof a !== 'object') return fail('Invalid game log entry.');
    if (!Number.isInteger(a.t) || a.t < 0 || a.t > tickCount) return fail('Game log timestamps out of range.');
    if (!ACTION_TYPES.has(a.a)) return fail('Unknown game action.');
    if (a.a === 'pour' && typeof a.on !== 'boolean') return fail('Invalid pour action.');
    if (a.a === 'buy' && !BUY_KINDS.has(a.kind)) return fail('Invalid upgrade action.');
  }

  // Stable canonical order: by tick, then original position.
  const indexed = log.map((a, i) => ({ a, i }));
  indexed.sort((x, y) => (x.a.t - y.a.t) || (x.i - y.i));
  const ordered = indexed.map((e) => e.a);

  const st = newState();
  const sells = [];
  let li = 0;

  const applyAction = (a, prefixEnd) => {
    if (a.a === 'pour') {
      if (st.pouring !== a.on) togglePour(st);
    } else if (a.a === 'surge') {
      activateSurge(st);
    } else if (a.a === 'buy') {
      buyUpgrade(st, a.kind);
    } else if (a.a === 'sell') {
      const bars = st.bars;
      const gameValue = sellBars(st);
      const prefixHash = createHash('sha256')
        .update(JSON.stringify(ordered.slice(0, prefixEnd + 1)))
        .digest('hex');
      sells.push({ bars, gameValue, prefixHash });
    }
  };

  // Mirror the client's tick loop exactly: now advances first, then pour/refine.
  // An action stamped t==k happened after k ticks completed, before tick k+1.
  for (let k = 0; k < tickCount; k++) {
    while (li < ordered.length && ordered[li].t === k) { applyAction(ordered[li], li); li++; }
    st.now += TICK;
    pourTick(st, TICK);
    refineTick(st, TICK);
  }
  // Trailing actions (the sell click happens after the last completed tick).
  while (li < ordered.length) {
    if (ordered[li].t !== tickCount) return fail('Game log timestamps out of range.');
    applyAction(ordered[li], li); li++;
  }

  if (sells.length === 0) return fail('No bars were sold in this game log.');
  return { ok: true, sells, ticks: tickCount };
}

/** Idempotency key for one proven sell. */
export function mineSellKey(userId, prefixHash) {
  return `mine:${userId}:${prefixHash}`;
}
