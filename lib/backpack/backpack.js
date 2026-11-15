// lib/backpack/backpack.js
// THE BACKPACK (Merlin, 2026-10-23): one pack that lives in the
// user's profile and follows them into every realm they travel to.
// Weapons forged at the Weapons Forge live here; the pack's header
// shows the traveller's currency (the real server balances — gold,
// aether, gold bars — read live by the profile, never stored here);
// and Earth 2's field finds (blood sacs, fossils, Dracula's and
// Hammond's gifts) land here instead of device-only counters.
//
// THE RECORD — what actually persists (via the /api/ui-state
// preference mechanism, key 'backpack'; device-local fallback when
// signed out — lib/backpack/store.js):
//   { v: 1,
//     style: <style id>,
//     items: [ { uid, id, kind, name, qty, meta } ],
//     tallies: { gold, aether },   // Earth 2 field tallies (the
//                                  // Dracula/Hammond preview counters,
//                                  // moved here from device storage)
//     history: [ ... ],            // Earth 2 exchange history, capped
//     migratedE2: true|false,      // device tallies folded in already?
//     forgeKeys: [ ... ] }         // recent forge idempotency keys
//
// ITEMS — { id, kind, name, qty, meta }:
//   kind: 'weapon' | 'material' | 'collectible' | 'consumable' | 'dino' | 'medusa-head' | 'flaming-chain'.
//   Weapons and fossil specimens are individual instances (qty 1,
//   never stacked); plain materials/collectibles/consumables stack
//   by id + meta. Raised dinos (kind 'dino', Merlin 2026-11-14)
//   are individual instances too — one item per dino, never
//   stacked, qty 1 — and their meta carries the dino's species,
//   birth moment, id, state ('out' | 'home' | 'pack') and home
//   parcel. Medusa's head (kind 'medusa-head', Merlin 2026-11-15)
//   and the Ghost Rider's flaming chain (kind 'flaming-chain',
//   Merlin 2026-11-15) are the same shape: one per user, qty 1,
//   never a stack.
//   is an individual instance the same way — one head per user,
//   never stacked, qty 1, reusable. Every function here is pure:
//   record in, new record out, inputs never mutated.
//
// THE RETICLE LAW (Merlin, 2026-10-23: "make sure all weapons have
// a reticle"): a weapon entry CANNOT exist without meta.reticle =
// { style }. createItem stamps the class default when a weapon
// arrives without one; sanitize coerces an invalid style back to
// the class default. There is no code path in this module that
// returns a weapon without a valid reticle.

export const BACKPACK_RECORD_VERSION = 1;
export const BACKPACK_ITEM_KINDS = ['weapon', 'material', 'collectible', 'consumable', 'dino', 'medusa-head', 'flaming-chain'];

const MAX_ITEMS = 600;
const MAX_HISTORY = 50;
const MAX_FORGE_KEYS = 24;
const MAX_QTY = 99999;
const MAX_NAME = 90;
const MAX_META_JSON = 2400;

// ── Reticles ─────────────────────────────────────────────────────
// The styles the future gun system renders. The class map is the
// law's defaulting table: ranged precision wears a crosshair,
// thrown and drawn weapons a chevron, hand weapons a plain dot —
// but EVERY class has one. That is the point of the law.
export const RETICLE_STYLES = ['crosshair', 'dot', 'chevron'];

export const RETICLE_BY_CLASS = {
  firearm: 'crosshair',
  bow: 'chevron',
  spear: 'chevron',
  blade: 'dot',
  blunt: 'dot',
  cane: 'dot',
  staff: 'dot',
};

export const DEFAULT_RETICLE_STYLE = 'crosshair';

/** The reticle style a weapon class wears by default. */
export function defaultReticleForClass(weaponClass) {
  return RETICLE_BY_CLASS[weaponClass] || DEFAULT_RETICLE_STYLE;
}

function saneReticle(reticle, weaponClass) {
  if (reticle && typeof reticle === 'object' && RETICLE_STYLES.includes(reticle.style)) {
    return { style: reticle.style };
  }
  return { style: defaultReticleForClass(weaponClass) };
}

// ── Styles ───────────────────────────────────────────────────────
// A style is a colourway/trim record — the profile renders the
// pack's frame from shell/trim/accent. No logos, no art assets.
// GTA-flavoured packs lead the list (Merlin: "style user backpacks
// offer gta backpacks"); Olympus-native packs follow.
export const BACKPACK_STYLES = [
  {
    id: 'gta-street',
    name: 'GTA Street Pack',
    blurb: 'Vice-ready street pack — loud trim, louder nights.',
    shell: '#111827', trim: '#f59e0b', accent: '#22d3ee',
  },
  {
    id: 'gta-tactical',
    name: 'GTA Tactical Rig',
    blurb: 'Surplus-grade rig with a pocket for every score.',
    shell: '#1f2937', trim: '#84cc16', accent: '#facc15',
  },
  {
    id: 'gta-vice',
    name: 'GTA Vice Runner',
    blurb: 'Sunset pastels and chrome zips. Shades sold separately.',
    shell: '#312e81', trim: '#f472b6', accent: '#67e8f9',
  },
  {
    id: 'olympus-aegis',
    name: 'Aegis Field Pack',
    blurb: 'The guard’s own issue — black canvas, molten-gold trim.',
    shell: '#0b1220', trim: '#ffd98a', accent: '#ff7847',
  },
  {
    id: 'olympus-voyager',
    name: 'Voyager Satchel',
    blurb: 'Deep-space canvas for travellers between realms.',
    shell: '#172554', trim: '#7ef0c8', accent: '#8fd8ff',
  },
];

export const DEFAULT_BACKPACK_STYLE = 'gta-street';

/** One style by id, or null. */
export function backpackStyleById(id) {
  return BACKPACK_STYLES.find((s) => s.id === id) || null;
}

// ── Record ───────────────────────────────────────────────────────

export function emptyBackpackRecord() {
  return {
    v: BACKPACK_RECORD_VERSION,
    style: DEFAULT_BACKPACK_STYLE,
    items: [],
    tallies: { gold: 0, aether: 0 },
    history: [],
    migratedE2: false,
    presetsSeeded: false, // Tripo starter presets folded in already?
    forgeKeys: [],
    // THE EQUIPPED WEAPON (Merlin, 2026-10-24: the pack follows
    // the traveller into every realm, and the weapon they equip
    // there is the one the realms fight with): the uid of the
    // weapon entry currently equipped, or null; and the realm id
    // where the last equip happened (kept after unequip, so the
    // profile can say "last equipped in …"). One record, one
    // load path — the realms read this same field, never a copy.
    activeWeaponUid: null,
    activeWeaponRealm: null,
  };
}

const num0 = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function saneMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  try {
    if (JSON.stringify(meta).length > MAX_META_JSON) return {};
  } catch {
    return {};
  }
  return meta;
}

let uidCounter = 0;
/** A process-unique entry uid (instance identity for list entries).
 *  Entropy comes from time + a counter — identity, not gameplay,
 *  so the procedural-seed law does not bind it. */
export function newItemUid(prefix = 'item') {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter.toString(36)}-${Math.floor(Math.random() * 4294967296).toString(36)}`;
}

/**
 * Build one item entry, enforcing the reticle law for weapons.
 * input: { id, kind, name, qty?, meta?, uid? } — returns a clean
 * entry or null when the input cannot name an item at all.
 * Weapons: qty forced to 1 (individual instances), and meta is
 * guaranteed to carry a valid reticle on the way out. Raised
 * dinos (kind 'dino') and Medusa's head (kind 'medusa-head') and
 * the flaming chain (kind 'flaming-chain'):
 * qty forced to 1 the same way — one item per dino, one head
 * per user, one chain per user, never a stack.
 */
export function createItem(input) {
  if (!input || typeof input !== 'object') return null;
  const kind = BACKPACK_ITEM_KINDS.includes(input.kind) ? input.kind : null;
  const id = typeof input.id === 'string' && input.id ? input.id.slice(0, 80) : null;
  const name = typeof input.name === 'string' && input.name ? input.name.slice(0, MAX_NAME) : null;
  if (!kind || !id || !name) return null;
  const meta = { ...saneMeta(input.meta) };
  if (kind === 'weapon') {
    meta.weaponClass = typeof meta.weaponClass === 'string' && meta.weaponClass
      ? meta.weaponClass
      : 'blade';
    meta.reticle = saneReticle(meta.reticle, meta.weaponClass);
  }
  return {
    uid: typeof input.uid === 'string' && input.uid ? input.uid : newItemUid(kind),
    id,
    kind,
    name,
    qty: kind === 'weapon' || kind === 'dino' || kind === 'medusa-head' || kind === 'flaming-chain' ? 1 : Math.min(MAX_QTY, Math.max(1, Math.floor(Number(input.qty) || 1))),
    meta,
  };
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return createItem(raw);
}

function sanitizeHistoryEntry(h) {
  if (!h || typeof h !== 'object' || typeof h.label !== 'string') return null;
  return {
    at: Number.isFinite(h.at) ? h.at : null,
    giftId: typeof h.giftId === 'string' ? h.giftId : '',
    label: h.label.slice(0, MAX_NAME),
    rarity: typeof h.rarity === 'string' ? h.rarity : 'common',
    kind: typeof h.kind === 'string' ? h.kind : 'gold',
    gold: num0(h.gold),
    aether: num0(h.aether),
    weapon: typeof h.weapon === 'string' ? h.weapon : null,
  };
}

/** Coerce anything into a valid backpack record. Always returns a
 *  record (an empty one for junk) — callers never branch on null. */
export function sanitizeBackpackRecord(raw) {
  const out = emptyBackpackRecord();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.style = backpackStyleById(raw.style) ? raw.style : DEFAULT_BACKPACK_STYLE;
  if (Array.isArray(raw.items)) {
    out.items = raw.items.map(sanitizeItem).filter(Boolean).slice(0, MAX_ITEMS);
  }
  if (raw.tallies && typeof raw.tallies === 'object') {
    out.tallies = { gold: num0(raw.tallies.gold), aether: num0(raw.tallies.aether) };
  }
  if (Array.isArray(raw.history)) {
    out.history = raw.history.map(sanitizeHistoryEntry).filter(Boolean).slice(0, MAX_HISTORY);
  }
  out.migratedE2 = raw.migratedE2 === true;
  out.presetsSeeded = raw.presetsSeeded === true;
  if (Array.isArray(raw.forgeKeys)) {
    out.forgeKeys = raw.forgeKeys
      .filter((k) => typeof k === 'string' && k)
      .slice(0, MAX_FORGE_KEYS);
  }
  // Equipped weapon: kept only as a uid string (or null); the
  // entry itself is looked up in items, so a removed weapon
  // simply reads as unequipped. Realm is a plain label string.
  out.activeWeaponUid = typeof raw.activeWeaponUid === 'string' && raw.activeWeaponUid
    ? raw.activeWeaponUid.slice(0, 120)
    : null;
  out.activeWeaponRealm = typeof raw.activeWeaponRealm === 'string' && raw.activeWeaponRealm
    ? raw.activeWeaponRealm.slice(0, 60)
    : null;
  return out;
}

// ── Item helpers (pure: record in, new record out) ───────────────

/** Whether two entries stack: same id + same meta, and neither is
 *  an individual instance (weapons never stack; raised dinos never
 *  stack — one item per dino; a meta.unique or fossil-bearing
 *  entry is one specimen, not a pile). */
export function itemsStack(a, b) {
  if (!a || !b || a.id !== b.id || a.kind !== b.kind) return false;
  if (a.kind === 'weapon' || a.kind === 'dino' || a.kind === 'medusa-head' || a.kind === 'flaming-chain') return false;
  if (a.meta && (a.meta.unique || a.meta.fossil)) return false;
  if (b.meta && (b.meta.unique || b.meta.fossil)) return false;
  return JSON.stringify(a.meta || {}) === JSON.stringify(b.meta || {});
}

/** Add an item (an input for createItem, or qty onto a stack).
 *  Returns a NEW record; a malformed item returns the record
 *  unchanged (sanitized). */
export function addItem(record, input, qty) {
  const rec = sanitizeBackpackRecord(record);
  const item = createItem(input);
  if (!item) return rec;
  const addQty = item.kind === 'weapon'
    ? 1
    : Math.min(MAX_QTY, Math.max(1, Math.floor(Number(qty) || item.qty || 1)));
  const idx = rec.items.findIndex((e) => itemsStack(e, item));
  if (idx >= 0) {
    const items = rec.items.slice();
    items[idx] = { ...items[idx], qty: Math.min(MAX_QTY, items[idx].qty + addQty) };
    return { ...rec, items };
  }
  if (rec.items.length >= MAX_ITEMS) return rec;
  return { ...rec, items: [...rec.items, { ...item, qty: addQty }] };
}

/** Add a raised dino (kind 'dino') as its own item — never a
 *  stack, never merged with another dino. Thin wrapper over
 *  addItem, kept explicit so call sites read as dino law. */
export function addDinoItem(record, dinoItem) {
  return addItem(record, dinoItem, 1);
}

/** Add Medusa's head (kind 'medusa-head') as its own item —
 *  never a stack: one head per user, qty 1, reusable. Thin
 *  wrapper over addItem, kept explicit so call sites read as
 *  the head law (Merlin, 2026-11-15). Refuses a second head:
 *  the pack itself holds at most one — the server (medusa_heads,
 *  one row per user) is the authority, the pack is the mirror. */
export function addMedusaHeadItem(record, headItem) {
  const rec = sanitizeBackpackRecord(record);
  if (rec.items.some((e) => e.kind === 'medusa-head')) return rec;
  return addItem(rec, headItem, 1);
}

/** Add the Ghost Rider's flaming chain (kind 'flaming-chain') as
 *  its own item — never a stack: one chain per user, qty 1. Thin
 *  wrapper over addItem, kept explicit so call sites read as the
 *  chain law (Merlin, 2026-11-15). Refuses a second chain: the
 *  pack itself holds at most one. Charges + the one-hour cooldown
 *  live on the item's meta (lib/ghost-rider/chain.js) — the pack
 *  is the record until a server mirror is ordered. */
export function addFlamingChainItem(record, chainItem) {
  const rec = sanitizeBackpackRecord(record);
  if (rec.items.some((e) => e.kind === 'flaming-chain')) return rec;
  return addItem(rec, chainItem, 1);
}

/** Remove qty of a stack by item id. Returns a NEW record —
 *  unchanged when the id is not held in that quantity. Weapons
 *  (qty 1 instances) leave one entry per call. */
export function removeItem(record, id, qty = 1) {
  const rec = sanitizeBackpackRecord(record);
  const want = Math.max(1, Math.floor(Number(qty) || 1));
  const idx = rec.items.findIndex((e) => e.id === id);
  if (idx < 0) return rec;
  const entry = rec.items[idx];
  if (entry.qty > want) {
    const items = rec.items.slice();
    items[idx] = { ...entry, qty: entry.qty - want };
    return { ...rec, items };
  }
  if (entry.qty === want) {
    return { ...rec, items: rec.items.filter((_, i) => i !== idx) };
  }
  return rec;
}

/** Remove one entry outright by its uid (weapon/fossil instances). */
export function removeEntry(record, uid) {
  const rec = sanitizeBackpackRecord(record);
  if (!rec.items.some((e) => e.uid === uid)) return rec;
  return { ...rec, items: rec.items.filter((e) => e.uid !== uid) };
}

/** Total quantity held of one item id (0 when absent). */
export function countItem(record, id) {
  const rec = sanitizeBackpackRecord(record);
  return rec.items.reduce((n, e) => (e.id === id ? n + e.qty : n), 0);
}

/** All entries of one kind ('weapon' | 'material' | …). */
export function itemsOfKind(record, kind) {
  const rec = sanitizeBackpackRecord(record);
  return rec.items.filter((e) => e.kind === kind);
}

/** Set the pack's style. Unknown styles leave the record as-is. */
export function setBackpackStyle(record, styleId) {
  const rec = sanitizeBackpackRecord(record);
  if (!backpackStyleById(styleId)) return rec;
  return { ...rec, style: styleId };
}

/** The reticle a weapon entry wears — always a valid { style } for
 *  a weapon (the law), null for anything else. */
export function weaponReticle(entry) {
  if (!entry || entry.kind !== 'weapon') return null;
  return saneReticle(entry.meta && entry.meta.reticle, entry.meta && entry.meta.weaponClass);
}

// ── Merlin's gifts ───────────────────────────────────────────────
// Merlin, 2026-11-01: special items he gifts to EVERY backpack —
// new packs start with them, existing packs gain them exactly once
// via seedMerlinGifts (below). Idempotent by the flag + presence
// check, runs safely on every load.
export const MERLIN_GIFT_ITEMS = [
  { id: 'rusty-grappling-hook', name: 'Rusty Grappling Hook', weaponClass: 'spear', damage: 12, model: '/models/weapons/rusty-grappling-hook.glb' },
];

/** Seed Merlin's gift items into a backpack record. Idempotent:
 *  adds each gift once, sets the flag when all are present. */
export function seedMerlinGifts(record) {
  const rec = sanitizeBackpackRecord(record);
  if (rec.giftsSeeded) return record;
  const items = rec.items.slice();
  let added = false;
  for (const gift of MERLIN_GIFT_ITEMS) {
    if (items.some((e) => e.id === gift.id)) continue;
    if (items.length >= MAX_ITEMS) break;
    const entry = createItem({
      kind: 'weapon',
      id: gift.id,
      name: gift.name,
      meta: {
        weaponClass: gift.weaponClass,
        damage: gift.damage,
        source: 'merlin-gift',
        model: gift.model,
        createdAt: new Date().toISOString(),
      },
    });
    if (entry) { items.push(entry); added = true; }
  }
  const seeded = MERLIN_GIFT_ITEMS.every((g) => items.some((e) => e.id === g.id));
  if (!added && !seeded) return record;
  return { ...rec, items, giftsSeeded: seeded };
}

// ── Tripo preset weapons ─────────────────────────────────────────
// Merlin, 2026-10-24: the seven Tripo-forged starter weapons seed
// EVERY backpack — new packs start with them, existing packs gain
// them exactly once via seedPresetWeapons (below). One per weapon
// class; the crystal sniper is NOT a preset — it is the Redwater
// core claim prize, wired separately. Damage is a builder judgment
// call, held at or below the forge's basic-tier ceiling (20):
// the gun hits hardest, the cane barely counts as a weapon, and
// nothing here outclasses a forged weapon. Models are the
// optimized Tripo GLBs under public/models/weapons/ (the six
// HD-stage downloads are big — see the build report — but the
// paths are the same whatever stage the file is).
export const TRIPO_PRESET_WEAPONS = [
  { id: 'preset-revolver', name: 'Revolver', weaponClass: 'firearm', damage: 20, model: '/models/weapons/revolver-handgun.glb' },
  { id: 'preset-bow', name: 'Recurve Bow', weaponClass: 'bow', damage: 14, model: '/models/weapons/recurve-bow.glb' },
  { id: 'preset-spear', name: 'Spear', weaponClass: 'spear', damage: 16, model: '/models/weapons/spear.glb' },
  { id: 'preset-sword', name: 'Short Sword', weaponClass: 'blade', damage: 12, model: '/models/weapons/short-sword.glb' },
  { id: 'preset-mace', name: 'Spiked Mace', weaponClass: 'blunt', damage: 18, model: '/models/weapons/heavy-spiked-mace.glb' },
  { id: 'preset-cane', name: 'Walking Cane', weaponClass: 'cane', damage: 10, model: '/models/weapons/walking-cane.glb' },
  { id: 'preset-staff', name: 'Wizard Staff', weaponClass: 'staff', damage: 15, model: '/models/weapons/wizard-staff.glb' },
];

/**
 * Seed the seven Tripo presets into a record, exactly once.
 * Pure: record in, new record out. Brand-new packs get all seven;
 * an existing pack gains only the presets it does not already hold
 * (presence-checked by id, so a pack that already holds one never
 * duplicates it); a pack whose flag is already set is returned
 * UNCHANGED (same reference) — so repeated loads never duplicate,
 * and a preset the user deliberately removed stays removed. When
 * the 600-item cap blocks the full set, the flag stays false so a
 * later load (after room frees up) retries — again without
 * duplicating anything already seeded.
 */
export function seedPresetWeapons(record) {
  const rec = sanitizeBackpackRecord(record);
  if (rec.presetsSeeded) return record;
  const items = rec.items.slice();
  let added = false;
  for (const preset of TRIPO_PRESET_WEAPONS) {
    if (items.some((e) => e.id === preset.id)) continue;
    if (items.length >= MAX_ITEMS) break;
    const entry = createItem({
      kind: 'weapon',
      id: preset.id,
      name: preset.name,
      meta: {
        weaponClass: preset.weaponClass,
        damage: preset.damage,
        source: 'tripo-preset',
        model: preset.model,
        createdAt: new Date().toISOString(),
      },
    });
    if (entry) { items.push(entry); added = true; }
  }
  const seeded = TRIPO_PRESET_WEAPONS.every((p) => items.some((e) => e.id === p.id));
  if (!added && !seeded) return record;
  return { ...rec, items, presetsSeeded: seeded };
}

// ── Equipped weapon ──────────────────────────────────────────────
// Which hand a weapon class arms — the rule the realms fight by:
// hand weapons arm the melee hand, drawn/shot weapons the ranged
// hand. A spear is melee-only (thrown spears are a later system).

export const MELEE_WEAPON_CLASSES = ['blade', 'blunt', 'spear', 'staff', 'cane'];
export const RANGED_WEAPON_CLASSES = ['bow', 'firearm'];

/** The weapon entry currently equipped, or null (unknown uid,
 *  removed weapon, or nothing equipped all read as unequipped). */
export function equippedWeaponEntry(record) {
  const rec = sanitizeBackpackRecord(record);
  if (!rec.activeWeaponUid) return null;
  return rec.items.find((e) => e.kind === 'weapon' && e.uid === rec.activeWeaponUid) || null;
}

/** Which hand an entry arms ('melee' | 'ranged' | null). */
export function weaponHand(entry) {
  if (!entry || entry.kind !== 'weapon') return null;
  const cls = entry.meta && entry.meta.weaponClass;
  if (MELEE_WEAPON_CLASSES.includes(cls)) return 'melee';
  if (RANGED_WEAPON_CLASSES.includes(cls)) return 'ranged';
  return null;
}

/** Equip a weapon by uid (or unequip with null). An unknown uid
 *  leaves the record unchanged; the realm id is recorded on
 *  equip and kept afterwards as the "last equipped in" note. */
export function setActiveWeapon(record, uid, realm) {
  const rec = sanitizeBackpackRecord(record);
  if (uid === null || uid === undefined) {
    return { ...rec, activeWeaponUid: null };
  }
  if (typeof uid !== 'string' || !rec.items.some((e) => e.kind === 'weapon' && e.uid === uid)) {
    return rec;
  }
  return {
    ...rec,
    activeWeaponUid: uid,
    activeWeaponRealm: typeof realm === 'string' && realm ? realm.slice(0, 60) : rec.activeWeaponRealm,
  };
}

/** The damage an equipped weapon deals from one hand: its own
 *  meta.damage when it arms that hand and carries a finite
 *  rating, else null (the realm falls back to its native
 *  number — gift weapons carry no rating, by design). */
export function equippedDamageForSlot(entry, slot) {
  if (!entry || weaponHand(entry) !== slot) return null;
  const d = Math.floor(Number(entry.meta && entry.meta.damage));
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** The reticle style an equipped weapon lends one hand, or null
 *  (the realm keeps its native reticle) — the reticle law, read
 *  from the equipped weapon rather than the hero's native kind. */
export function equippedReticleForSlot(entry, slot) {
  if (!entry || weaponHand(entry) !== slot) return null;
  const r = weaponReticle(entry);
  return r ? r.style : null;
}

// ── Lightsaber slot ──────────────────────────────────────────────
// Merlin, 2026-10-24: the pack carries a dedicated lightsaber
// slot. v1 rule: a weapon entry counts as a lightsaber when its
// name or its description (meta.description, where patron specs
// store it) contains "saber" or "lightsaber", case-insensitive.
// Provenance does NOT count — a Kyber-forged blade that is not
// named a saber is not a saber. The slot shows the FIRST such
// weapon in record order; any further sabers still list with the
// other weapons. Before the user owns one, the slot is a link to
// the crystal forge: the Kyber Smith's commissions on the Weapons
// Forge page (/weapons-forge) — there is no separate "liner"
// forge route in the repo, and Merlin confirmed Kyber is the
// place lightsabers are made.
export function isLightsaberEntry(entry) {
  if (!entry || entry.kind !== 'weapon') return false;
  const hay = `${entry.name || ''} ${entry.meta && entry.meta.description ? entry.meta.description : ''}`.toLowerCase();
  return hay.includes('saber') || hay.includes('lightsaber');
}

/** The lightsaber for the slot (first in record order), or null. */
export function lightsaberEntry(record) {
  const rec = sanitizeBackpackRecord(record);
  return rec.items.find(isLightsaberEntry) || null;
}
