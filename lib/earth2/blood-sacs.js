// lib/earth2/blood-sacs.js
// EARTH 2 — BLOOD SACS & THE EXCHANGE TALLIES (Merlin, 2026-10-22).
//
// Giant mosquitos drink from the dinosaurs; shoot a full one and it
// drops a blood sac; carry sacs to Dracula at Castle Transylvania
// and he trades each one for a random gift (lib/earth2/gifts.js).
//
// This module is the state layer for that loop: how many sacs the
// player holds, the preview tallies the gifts have paid out (gold,
// aether shards, gifted weapons), and the gift history.
//
// PERSISTENCE + AETHER, HONESTLY: the tallies persist on-device
// (localStorage), like the home-base choice — no server crediting
// happens anywhere in this loop until the earth2 tables land
// (supabase/earth2.sql is still Merlin's green light). The aether
// balance here is a PARALLEL Earth 2 shard counter, deliberately:
// Earth 1's aether (lib/earth/aether.js, key 'olympus.earthAether.v1')
// is a finite set of collected interior placements — an Earth-1-scoped
// collection, not an open-ended balance — so Dracula's shards cannot
// pour into it; they keep their own count here until a real Aether
// ledger exists to receive them.
//
// State functions are pure (state in, new state out); the storage
// reader/writer is storage-guarded like lib/earth2/home-base.js.

export const BLOOD_SAC_STORAGE_KEY = 'earth2:blood-sacs:v1';

const HISTORY_CAP = 50;

export function emptyBloodSacState() {
  return { sacs: 0, gold: 0, aether: 0, weapons: [], history: [] };
}

function sanitizeState(raw) {
  const out = emptyBloodSacState();
  if (!raw || typeof raw !== 'object') return out;
  const num = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  out.sacs = num(raw.sacs);
  out.gold = num(raw.gold);
  out.aether = num(raw.aether);
  if (Array.isArray(raw.weapons)) {
    out.weapons = raw.weapons.filter((w) => typeof w === 'string' && w);
  }
  if (Array.isArray(raw.history)) {
    out.history = raw.history
      .filter((h) => h && typeof h === 'object' && typeof h.label === 'string')
      .slice(0, HISTORY_CAP)
      .map((h) => ({
        at: Number.isFinite(h.at) ? h.at : null,
        giftId: typeof h.giftId === 'string' ? h.giftId : '',
        label: h.label,
        rarity: typeof h.rarity === 'string' ? h.rarity : 'common',
        kind: typeof h.kind === 'string' ? h.kind : 'gold',
        gold: num(h.gold),
        aether: num(h.aether),
        weapon: typeof h.weapon === 'string' ? h.weapon : null,
      }));
  }
  return out;
}

export function loadBloodSacState() {
  try {
    if (typeof localStorage === 'undefined') return emptyBloodSacState();
    const raw = localStorage.getItem(BLOOD_SAC_STORAGE_KEY);
    if (!raw) return emptyBloodSacState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return emptyBloodSacState();
  }
}

export function saveBloodSacState(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BLOOD_SAC_STORAGE_KEY, JSON.stringify(sanitizeState(state)));
  } catch {
    // storage unavailable — the tallies just won't persist
  }
}

/** A blood sac is collected (a shot mosquito dropped it, the player
 *  picked it up). Returns the new state. */
export function collectBloodSac(state) {
  const s = sanitizeState(state);
  return { ...s, sacs: s.sacs + 1 };
}

/**
 * Offer one blood sac to Dracula in exchange for the rolled gift.
 * Returns { ok: true, state } with the sac consumed and the gift
 * applied (gold/aether tallies up, weapon added, history prepended),
 * or { ok: false, error, state } with the state untouched when the
 * player holds no sacs.
 */
export function offerBloodSac(state, gift, atMs) {
  const s = sanitizeState(state);
  if (!gift || typeof gift.label !== 'string') {
    return { ok: false, error: 'No gift was rolled.', state: s };
  }
  if (s.sacs < 1) {
    return { ok: false, error: 'You hold no blood sacs — shoot a full mosquito first.', state: s };
  }
  const entry = {
    at: Number.isFinite(atMs) ? atMs : null,
    giftId: typeof gift.id === 'string' ? gift.id : '',
    label: gift.label,
    rarity: typeof gift.rarity === 'string' ? gift.rarity : 'common',
    kind: typeof gift.kind === 'string' ? gift.kind : 'gold',
    gold: Math.max(0, Math.floor(Number(gift.gold) || 0)),
    aether: Math.max(0, Math.floor(Number(gift.aether) || 0)),
    weapon: typeof gift.weapon === 'string' ? gift.weapon : null,
  };
  return {
    ok: true,
    state: {
      sacs: s.sacs - 1,
      gold: s.gold + entry.gold,
      aether: s.aether + entry.aether,
      weapons: entry.weapon ? [...s.weapons, entry.weapon] : [...s.weapons],
      history: [entry, ...s.history].slice(0, HISTORY_CAP),
    },
  };
}

/**
 * Apply one Hammond exchange record (lib/earth2/hammond.js) to
 * the tallies — the fossil economy pays into the SAME counters
 * Dracula's gifts pay into, on the same terms (Merlin, 2026-10-22:
 * Phase 1 designed the payouts to land on these preview tallies;
 * the fossil inventory itself lives on-device in lib/earth2/
 * fossils.js, so no server path can verify a trade — when the
 * earth2 tables grow a fossil ledger, this record is the audit
 * trail that posts). A gold outcome tops up gold, an aether
 * outcome the shard counter, a weapon joins the gifted weapons;
 * every trade prepends a history entry naming the fossil traded.
 * Malformed records return the state untouched. Pure.
 */
export function applyFossilExchange(state, record, atMs) {
  const s = sanitizeState(state);
  if (!record || typeof record !== 'object') return s;
  const outcome = record.outcome === 'aether' || record.outcome === 'weapon'
    ? record.outcome
    : 'gold';
  const amount = Math.max(0, Math.floor(Number(record.amount) || 0));
  const weapon = outcome === 'weapon' && typeof record.weapon === 'string' && record.weapon
    ? record.weapon
    : null;
  if (outcome === 'weapon' && !weapon) return s;
  if (outcome !== 'weapon' && amount < 1) return s;
  const fossilName = typeof record.type === 'string' && record.type ? record.type : 'Fossil';
  const entry = {
    at: Number.isFinite(atMs) ? atMs : null,
    giftId: typeof record.fossilId === 'string' ? record.fossilId : '',
    label: weapon
      ? weapon
      : `${fossilName} — ${amount} ${outcome === 'aether' ? 'aether' : 'gold'}`,
    rarity: outcome === 'weapon' && typeof record.weaponRarity === 'string'
      ? record.weaponRarity
      : 'common',
    kind: outcome,
    gold: outcome === 'gold' ? amount : 0,
    aether: outcome === 'aether' ? amount : 0,
    weapon,
  };
  return {
    ...s,
    gold: s.gold + entry.gold,
    aether: s.aether + entry.aether,
    weapons: entry.weapon ? [...s.weapons, entry.weapon] : [...s.weapons],
    history: [entry, ...s.history].slice(0, HISTORY_CAP),
  };
}
