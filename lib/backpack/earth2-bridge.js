// lib/backpack/earth2-bridge.js
// EARTH 2 ⇄ BACKPACK BRIDGE (Merlin, 2026-10-23).
//
// Earth 2's field economy was built on device tallies (lib/earth2/
// blood-sacs.js: sacs, gold/aether preview counters, gifted weapon
// names, history) and a device fossil pack (lib/earth2/fossils.js).
// The backpack is now the container for all of it — the same shapes
// live in the account record (server-persisted when signed in via
// /api/ui-state, device-local when not) instead of Earth-2-only
// storage keys.
//
// This bridge is the translation layer, kept pure so the chamber
// and the world keep driving the ORIGINAL pure engines
// (offerBloodSac, applyFossilExchange, collectBloodSac) on an
// adapted state shape, and the result folds back into the record:
//
//   bloodStateFromRecord(record)  -> { sacs, gold, aether,
//                                      weapons: [names], history }
//   withBloodState(record, state) -> the record, updated
//
// THE GOLD/AETHER HONESTY RULE, unchanged from blood-sacs.js: the
// gold/aether here are Earth 2 FIELD TALLIES — preview counters
// for Dracula's and Hammond's counters, NOT the server gold/aether
// ledgers. They ride in the record's `tallies` and are labelled as
// field tallies wherever they are displayed. Flows that already
// credit the real server balances (the Gold Forge's ledger claims)
// are untouched and never double-credited here.

import {
  addItem,
  countItem,
  removeEntry,
  sanitizeBackpackRecord,
} from './backpack.js';
import { weaponItemForName } from './weapons.js';
import { sanitizeFossilInventory } from '../earth2/fossils.js';
import { offerBloodSac, applyFossilExchange } from '../earth2/blood-sacs.js';

export const BLOOD_SAC_ITEM_ID = 'blood-sac';
export const BLOOD_SAC_NAME = 'Blood sac';

/** Blood sacs are a plain material stack in the pack. */
export function bloodSacItem(qty) {
  return { id: BLOOD_SAC_ITEM_ID, kind: 'material', name: BLOOD_SAC_NAME, qty: Math.max(1, qty || 1), meta: {} };
}

/** How many blood sacs the pack holds. */
export function sacCount(record) {
  return countItem(record, BLOOD_SAC_ITEM_ID);
}

/** One fossil specimen as a backpack entry: an individual material
 *  (meta.unique — never stacks), the full instance riding in
 *  meta.fossil so Hammond's counter trades the exact specimen. */
export function fossilItem(fossil) {
  if (!fossil || typeof fossil.id !== 'string') return null;
  return {
    uid: `fossil:${fossil.id}`,
    id: 'fossil',
    kind: 'material',
    name: fossil.type || 'Fossil',
    qty: 1,
    meta: { unique: true, fossil },
  };
}

/** The fossil instances the pack holds, in pack order — the same
 *  list shape lib/earth2/fossils.js inventories use. */
export function fossilItemsFromRecord(record) {
  const rec = sanitizeBackpackRecord(record);
  return rec.items
    .filter((e) => e.meta && e.meta.fossil)
    .map((e) => e.meta.fossil);
}

/** Add freshly dropped fossils to the pack. Pure. */
export function addFossilsToRecord(record, fossils) {
  let next = sanitizeBackpackRecord(record);
  const clean = sanitizeFossilInventory(fossils);
  const held = new Set(fossilItemsFromRecord(next).map((f) => f.id));
  for (const fossil of clean) {
    if (held.has(fossil.id)) continue;
    const item = fossilItem(fossil);
    if (item) next = { ...next, items: [...next.items, item] };
  }
  return next;
}

/** Take one fossil (by instance id) out of the pack — Hammond
 *  settled it. Pure; unchanged when not held. */
export function removeFossilFromRecord(record, fossilId) {
  const rec = sanitizeBackpackRecord(record);
  const entry = rec.items.find((e) => e.meta && e.meta.fossil && e.meta.fossil.id === fossilId);
  if (!entry) return rec;
  return removeEntry(rec, entry.uid);
}

// ── The blood-sac state adapter ──────────────────────────────────

/** The blood-sac engine's state shape, read out of a record. */
export function bloodStateFromRecord(record) {
  const rec = sanitizeBackpackRecord(record);
  return {
    sacs: sacCount(rec),
    gold: rec.tallies.gold,
    aether: rec.tallies.aether,
    weapons: rec.items.filter((e) => e.kind === 'weapon').map((e) => e.name),
    history: rec.history,
  };
}

/**
 * Fold an engine state back into the record: sac stack set to the
 * state's count, tallies + history replaced, and weapon entries
 * reconciled by name — existing entries keep their full meta
 * (forge ratings, reticles); names the pack lacks gain an entry
 * through the catalogue (the reticle law stamps it). Weapons are
 * only ever added by the Earth 2 engines, so a name present in the
 * state but missing from the pack is an addition; entries whose
 * names vanish from the state are left alone (the forge page, not
 * this bridge, is where a weapon could ever leave).
 */
export function withBloodState(record, state) {
  let rec = sanitizeBackpackRecord(record);
  if (!state || typeof state !== 'object') return rec;
  const wantSacs = Math.max(0, Math.floor(Number(state.sacs) || 0));
  const haveSacs = sacCount(rec);
  if (wantSacs > haveSacs) {
    rec = addItem(rec, bloodSacItem(wantSacs - haveSacs));
  } else if (wantSacs < haveSacs) {
    // Peel the stack down: set the sac entry's qty directly (a
    // stack partial-remove the generic helpers don't express).
    rec = {
      ...rec,
      items: rec.items
        .map((e) => (e.id === BLOOD_SAC_ITEM_ID ? { ...e, qty: wantSacs } : e))
        .filter((e) => e.qty > 0),
    };
  }
  rec = {
    ...rec,
    tallies: {
      gold: Math.max(0, Math.floor(Number(state.gold) || 0)),
      aether: Math.max(0, Math.floor(Number(state.aether) || 0)),
    },
    history: Array.isArray(state.history) ? state.history : rec.history,
  };
  // Reconcile weapons by name (multiset: duplicates are real —
  // Dracula can gift the same dagger twice).
  const wanted = new Map();
  for (const name of Array.isArray(state.weapons) ? state.weapons : []) {
    if (typeof name === 'string' && name) wanted.set(name, (wanted.get(name) || 0) + 1);
  }
  const held = new Map();
  for (const e of rec.items) {
    if (e.kind === 'weapon') held.set(e.name, (held.get(e.name) || 0) + 1);
  }
  for (const [name, count] of wanted) {
    let missing = count - (held.get(name) || 0);
    while (missing > 0) {
      const item = weaponItemForName(name, 'earth-2');
      if (!item) break;
      rec = { ...rec, items: [...rec.items, item] };
      missing -= 1;
    }
  }
  return sanitizeBackpackRecord(rec);
}

/** One sac collected, in record terms. */
export function collectSacInRecord(record) {
  return addItem(sanitizeBackpackRecord(record), bloodSacItem(1));
}

// ── Engine wrappers: the original pure engines, driven on the
//    record through the adapter. ─────────────────────────────────

/** Offer one sac to Dracula from the pack. Returns
 *  { ok, record } — record unchanged when ok is false. */
export function offerSacInRecord(record, gift, atMs) {
  const rec = sanitizeBackpackRecord(record);
  const res = offerBloodSac(bloodStateFromRecord(rec), gift, atMs);
  if (!res.ok) return { ok: false, record: rec };
  return { ok: true, record: withBloodState(rec, res.state) };
}

/** Settle one Hammond exchange record into the pack's tallies. */
export function applyFossilExchangeInRecord(record, exchangeRecord, atMs) {
  const rec = sanitizeBackpackRecord(record);
  const next = applyFossilExchange(bloodStateFromRecord(rec), exchangeRecord, atMs);
  return withBloodState(rec, next);
}

// ── The one-way migration ────────────────────────────────────────

/**
 * Fold the old device tallies into a record that has not migrated
 * yet: the raw 'earth2:blood-sacs:v1' JSON (sacs/gold/aether/
 * weapon names/history) and the raw 'earth2:fossils:v1' JSON
 * (fossil instances). PURE — the store reads storage and calls
 * this. Sets migratedE2 so it never runs twice; the old keys are
 * left in place as an archive and never read again.
 */
export function migrateEarth2Tallies(record, { bloodRaw, fossilsRaw } = {}) {
  let next = sanitizeBackpackRecord(record);
  if (next.migratedE2) return next;
  let blood = null;
  try { blood = typeof bloodRaw === 'string' ? JSON.parse(bloodRaw) : bloodRaw; } catch { blood = null; }
  if (blood && typeof blood === 'object') {
    const state = {
      sacs: Math.max(0, Math.floor(Number(blood.sacs) || 0)),
      gold: Math.max(0, Math.floor(Number(blood.gold) || 0)),
      aether: Math.max(0, Math.floor(Number(blood.aether) || 0)),
      weapons: Array.isArray(blood.weapons) ? blood.weapons : [],
      history: Array.isArray(blood.history) ? blood.history : [],
    };
    // The device tallies ADD onto whatever the record already
    // holds (an account copy may already carry field finds).
    const current = bloodStateFromRecord(next);
    state.sacs += current.sacs;
    state.gold += current.gold;
    state.aether += current.aether;
    state.weapons = [...current.weapons, ...state.weapons];
    state.history = [...state.history, ...current.history].slice(0, 50);
    next = withBloodState(next, state);
  }
  let fossils = null;
  try { fossils = typeof fossilsRaw === 'string' ? JSON.parse(fossilsRaw) : fossilsRaw; } catch { fossils = null; }
  if (Array.isArray(fossils)) next = addFossilsToRecord(next, fossils);
  return { ...next, migratedE2: true };
}
