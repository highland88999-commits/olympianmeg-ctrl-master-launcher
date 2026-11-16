// lib/backpack/trophies.js
// THE BACKPACK'S TROPHY HEALS (Merlin, 2026-11-15).
//
// Medusa's head and the Ghost Rider's flaming chain are earned
// in the realms, but the SERVER is the authority for both
// (medusa_heads / ghost_rider_chains — one row per user). The
// backpack item is the local handle. When the server says owned
// and the pack lacks the handle — the claim already happened,
// the handle just went missing — the pack gains it. The heal is
// idempotent (a second run changes nothing) and never removes.
//
// The pure fold lives here so the tests can pin it without a
// network. The fetch + token plumbing lives in the hook
// (components/backpack/usePackTrophies.js), which both panels
// share: the profile section heals on sign-in, the realm HUD
// heals when its panel opens. Merlin's own head is healed by
// this same path — he earned it (Nov 15 ~04:17 first-run video:
// entry, fight, head claim all work), so the next time he opens
// the profile the server says owned and the head appears in his
// inventory, without him re-earning it.

import { addFlamingChainItem, addMedusaHeadItem, countItem } from './backpack.js';
import { createChainItem, chainsPerThrow, chainStateOf, formatCooldown, refreshChain } from '../ghost-rider/chain.js';
import { HEAD_ITEM_ID, medusaHeadItem, victimsPerUse } from '../nether-realm/medusa.js';

const OTHER_SOURCE_LABELS = {
  'tiangong-peach-gardens': "Tiangong's Peach Gardens",
  'omega-hub': 'the Omega Hub',
};

/**
 * The detail a selected head / chain / Other row opens. Pure.
 * The server is the authority for level/uses — the pack shows
 * what the server says, and says so when the server hasn't
 * answered. `trophies` is the usePackTrophies shape
 * ({ head: { level, uses, serverLive }, chain: { level, serverLive } }).
 */
export function trophyDetailFor(entry, trophies, nowMs = Date.now()) {
  if (!entry) return '';
  if (entry.kind === 'medusa-head') {
    const level = (trophies && trophies.head && trophies.head.level) ?? 0;
    if (trophies && trophies.head && trophies.head.serverLive === true) {
      return `Level ${level} · ${trophies.head.uses ?? 0} uses banked · petrifies ${victimsPerUse(level)} per use · reusable`;
    }
    if (trophies && trophies.head && trophies.head.serverLive === false) {
      return 'Server status unknown — the pack is the interim truth · reusable';
    }
    return "Earned in Medusa's lair · reusable";
  }
  if (entry.kind === 'flaming-chain') {
    const level = (trophies && trophies.chain && trophies.chain.level) ?? 0;
    const st = chainStateOf(refreshChain(entry));
    const cool = st.cooldownUntilMs > nowMs
      ? ` · ready again in ${formatCooldown(st.cooldownUntilMs - nowMs)}`
      : ' · ready';
    if (trophies && trophies.chain && trophies.chain.serverLive === false) {
      return `Level ${level} · ${st.charges}/3 charges${cool} · server status unknown`;
    }
    return `Level ${level} · ${st.charges}/3 charges · ${chainsPerThrow(level)} chains per throw${cool}`;
  }
  if (entry.kind === 'other') {
    const source = entry.meta && typeof entry.meta.source === 'string' ? entry.meta.source : null;
    const where = source ? (OTHER_SOURCE_LABELS[source] || source) : null;
    if (entry.id === 'peach') return `From ${where || "Tiangong's Peach Gardens"}. A collectible for now — no effect yet.`;
    return where ? `From ${where}. A collectible for now.` : 'A collectible for now.';
  }
  return '';
}

/**
 * Fold the server's trophy statuses into a record. Pure.
 *   status: { headOwned, headEarnedAt, chainOwned }
 * Returns the record unchanged when nothing is missing.
 */
export function healTrophies(record, status = {}) {
  let next = record;
  if (status.headOwned && countItem(next, HEAD_ITEM_ID) === 0) {
    next = addMedusaHeadItem(next, medusaHeadItem(status.headEarnedAt || undefined));
  }
  if (status.chainOwned && countItem(next, 'flaming-chain') === 0) {
    next = addFlamingChainItem(next, createChainItem());
  }
  return next;
}
