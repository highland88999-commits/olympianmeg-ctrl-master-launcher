// World Engine datasheet — WEAPON BUILDER / THE FORGE (/world-engine/weapons).
//
// WHAT READS IT: lib/world-engine/forge-agent.js (the single handler
// for forge prompts — prompt validation, the portal-gun prompt, the
// keyword nets, the backpack mint), lib/world-engine/aesthetic.js
// (re-exports VALID_WEAPON_TYPES, VALID_STOCK_TYPES,
// VALID_OPTIC_TYPES, DEFAULT_WEAPON_PARAMS from here — the
// vocabularies and clamps the synthesis API validates against),
// lib/world-engine/sectors.js (WEAPON_SLIDERS),
// lib/world-engine/useEngineStore.js (WEAPON_STORE_DEFAULTS),
// components/world-engine/ForgeSector.jsx (via the store + the
// agent), components/world-engine/PatronCommissions.jsx (via the
// agent + PATRON_ROSTER).
//
// WHERE EVERY ENTRY CAME FROM (nothing invented):
// - VALID_WEAPON_TYPES / VALID_STOCK_TYPES / VALID_OPTIC_TYPES /
//   DEFAULT_WEAPON_PARAMS: lib/world-engine/aesthetic.js (moved
//   here verbatim; aesthetic.js now re-exports them so no existing
//   import breaks) — they must match lib/world-engine/
//   weapon-builder.js, which they do.
// - WEAPON_ARCHETYPES (rifle/smg/precision + per-type optic/stock
//   defaults): lib/world-engine/weapon-builder.js sanitizeParams()
//   + buildWeapon() (the three procedural firearms, gold Omega mark).
// - WEAPON_SLIDERS: lib/world-engine/sectors.js SECTORS.weapons.sliders
//   (Length 0.1–5 m default 1.0; Damage 1–100 AP default 10).
// - WEAPON_STORE_DEFAULTS: lib/world-engine/useEngineStore.js
//   defaultWeapon (length 1.0, damage 10, material 'metal', color
//   '#ffd700').
// - FORGE_CATALOGUE: re-exported from lib/backpack/weapons.js
//   (FORGE_WEAPONS — the 13 catalogue weapons: the basic tier,
//   Dracula's gifted trio, Hammond's cabinet). The lib remains the
//   catalogue's home — Earth 2 gifts (lib/backpack/earth2-bridge.js
//   weaponItemForName) read it directly — the sheet re-exports it
//   so the forge has one data home.
// - PATRON_ROSTER: lib/backpack/patrons.js PATRONS (the four patron
//   smiths) + the portal system as the fifth presenter (the portal
//   gun is presented by the portal system, not a smith —
//   lib/portal/gun.js).
// - FINISHES: the builder's default finish '#1c1f26'
//   (weapon-builder.js), the store's gold '#ffd700'
//   (useEngineStore.js), the portal gun's near-white '#f2f0ea'
//   (PORTAL_GUN_FORGE_PROMPT, defined below).
// - COST: lib/world-engine/economy.js COST_MAP.weapon (100 Aether)
//   + FREE_GENERATIONS_PER_MONTH (20).
// - DAMAGE_RULES: the ForgeSector mint rule since 2026-10-24
//   (prompt 1–100 AP clamps into the backpack's [5, 40]; 0 stays 0
//   — the portal gun opens, it does not wound), now owned by
//   lib/world-engine/forge-agent.js damageForBackpack().
// - WEAPON_PRESETS: WORKER'S CHOICE — no presets existed in code.
//   Each preset is built only from the vocabularies and clamp ranges
//   above, so every preset passes validateForgePrompt() unchanged.
//   The Portal Gun preset IS the prompt defined below; the forge
//   agent re-exports it from here so the sheet and the agent can
//   never drift apart.

import { costFor, FREE_GENERATIONS_PER_MONTH } from '../economy.js';
import { FORGE_WEAPONS } from '../../backpack/weapons.js';
import { PATRONS, PATRON_IDS } from '../../backpack/patrons.js';
export { FORGE_WEAPONS, PATRONS, PATRON_IDS };

export const BUILDER = {
  id: 'weapons',
  sectorKey: 'weapons',
  route: '/world-engine/weapons',
  name: 'Weapon Builder',
  category: 'weapon',
  accent: '#ffd700',
  costAether: costFor('weapon'),
  storeKey: 'weapon',
  storeSetter: 'setWeaponParams',
};

/** Weapon vocab — was in lib/world-engine/aesthetic.js. */
export const VALID_WEAPON_TYPES = ['rifle', 'smg', 'precision'];
export const VALID_STOCK_TYPES = ['telescoping', 'wire', 'precision', 'none'];
export const VALID_OPTIC_TYPES = ['iron', 'red-dot', 'scope', 'none'];

export const DEFAULT_WEAPON_PARAMS = {
  weaponType: 'rifle',
  barrelLength: 0.9,
  stockType: 'telescoping',
  opticType: 'iron',
  finishColor: '#1c1f26',
  damageRating: 10,
};

/** The three procedural firearm archetypes the builder makes. */
export const WEAPON_ARCHETYPES = [
  {
    weaponType: 'rifle',
    name: 'Assault Rifle',
    defaultOptic: 'iron',
    defaultStock: 'telescoping',
    barrelLength: 0.9,
    blurb: 'The all-rounder: receiver, rail, curved 30-round magazine, gold Omega mark.',
  },
  {
    weaponType: 'smg',
    name: 'SMG',
    defaultOptic: 'red-dot',
    defaultStock: 'wire',
    barrelLength: 0.9,
    blurb: 'Compact and fast: suppressor, stick magazine, wire stock, gold Omega mark.',
  },
  {
    weaponType: 'precision',
    name: 'Precision Rifle',
    defaultOptic: 'scope',
    defaultStock: 'precision',
    barrelLength: 0.9,
    blurb: 'Long reach: heavy fluted barrel, scope, bipod, bolt handle, gold Omega mark.',
  },
];

/** The builder's own clamp ranges (aesthetic.js + weapon-builder.js). */
export const PARAM_RANGES = {
  barrelLength: { min: 0.3, max: 2.0, fallback: 0.9 },
  damageRating: { min: 1, max: 100, fallback: 10 },
  // The forge form's Length slider runs wider than the barrel: the
  // agent maps length 0.1–5 m onto barrelLength 0.3–2.0 m.
  length: { min: 0.1, max: 5, fallback: 1.0 },
  // Prompt damage 0 is the designed exception (opens, does not wound).
  promptDamage: { min: 0, max: 100, fallback: 10 },
};

/** The forge form's sliders (was SECTORS.weapons.sliders). Ranges,
// defaults and labels are the data; lib/world-engine/sectors.js
// attaches the parse functions (withParse), like the other sheets. */
export const WEAPON_SLIDERS = [
  { key: 'length', label: 'Length', min: 0.1, max: 5, step: 0.1, default: 1.0, format: (v) => `${v.toFixed(1)} m` },
  { key: 'damage', label: 'Damage rating', min: 1, max: 100, step: 1, default: 10, format: (v) => `${v} AP` },
];

/** The store's weapon defaults (was defaultWeapon in useEngineStore.js). */
export const WEAPON_STORE_DEFAULTS = {
  scale: { x: 1, y: 1, z: 1 },
  length: 1.0,
  damage: 10,
  material: 'metal',
  color: '#ffd700',
};

/** Finishes the forge knows by name (each appears in code — see header). */
export const FINISHES = [
  { id: 'standard', name: 'Standard', hex: '#1c1f26', blurb: 'The builder\u2019s default dark finish.' },
  { id: 'gold', name: 'Forge Gold', hex: '#ffd700', blurb: 'The store default — the forge\u2019s own gold.' },
  { id: 'near-white', name: 'Near-White', hex: '#f2f0ea', blurb: 'The portal gun\u2019s shell — heaven-gold to hell-crimson gradient over near-white.' },
];

/** The forge's catalogue: the 13 weapons, as the sheet presents them. */
export const FORGE_CATALOGUE = FORGE_WEAPONS.map((w) => ({
  id: w.id,
  name: w.name,
  weaponClass: w.weaponClass,
  damage: w.damage,
  rarity: w.rarity,
  cost: w.cost,
  blurb: w.blurb,
}));

/** The presenters: four patron smiths + the portal system. */
export const PATRON_ROSTER = [
  ...PATRON_IDS.map((id) => ({
    id,
    name: PATRONS[id].name,
    title: PATRONS[id].title,
    glyph: PATRONS[id].glyph,
    seat: PATRONS[id].seat,
    favours: PATRONS[id].favours,
    presenter: 'patron',
  })),
  {
    id: 'portal-system',
    name: 'The Portal System',
    title: 'of the upper and lower portals',
    glyph: '🌀',
    seat: 'Heaven above, Nether below Earth',
    favours: ['portals', 'heaven light', 'hell fire'],
    presenter: 'portal-system',
  },
];

/** The money: what a generation costs, and the free tier. */
export const FORGE_COST = {
  aetherPerGeneration: costFor('weapon'),
  freeGenerationsPerMonth: FREE_GENERATIONS_PER_MONTH,
  // Patron commissions are a different economy: free, one per patron
  // per user per day — the scarcity is the day, not the price.
  patronCommissionCost: 0,
  patronCommissionDailyGuard: 'one commission per patron per user per day',
};

/** Damage rules: prompt damage -> backpack damage (the agent owns the mapping). */
export const DAMAGE_RULES = {
  promptMin: 0,
  promptMax: 100,
  backpackMin: 5,
  backpackMax: 40,
  zeroMeans: 'opens, it does not wound (the portal gun)',
  noRatingMeans: 'unset — the realms\u2019 native-damage fallback applies',
};

// ── The portal gun, as a forge prompt ────────────────────────────
//
// Presenter: the PORTAL SYSTEM, not a patron. The gun is the
// reward for the portal journey itself — ten portals walked —
// and no smith's persona shapes it. Damage 0 by design: it
// opens, it does not wound. weaponType 'smg' is the closest
// procedural base the builder has (it builds no portal
// archetype); length 0.9 m; finish near-white with the
// heaven-gold to hell-crimson gradient in the description.
// Asset URL none — procedural. This object is a real prompt the
// forge form takes as-is: name + description + length + damage.
// Defined here (not in forge-agent.js) so the sheet stays pure
// data with no import back into the agent — the agent re-exports
// it from here.

export const PORTAL_GUN_FORGE_PROMPT = {
  name: 'Portal Gun',
  description:
    'A portal gun, not a bullet gun. It fires portals, never projectiles: ' +
    'pull the trigger and a realm portal opens anywhere — heaven light and ' +
    'hell fire braided into one gradient — and the portal sucks the user ' +
    'through into the place it opens. The gun is the reward for the portal ' +
    'journey itself, presented by the portal system, not by any smith: no ' +
    'patron’s persona shapes it. Near-white shell with a heaven-gold to ' +
    'hell-crimson gradient running its length, gold Omega mark, compact SMG ' +
    'frame, 0.9 metres long. Damage 0 by design — it opens, it does not ' +
    'wound. It grants every realm on demand, including the Heaven realms ' +
    'before the Heaven portal itself is unlocked.',
  assetUrl: '',
  length: 0.9,
  damage: 0,
  weaponType: 'smg',
  finishColor: '#f2f0ea',
  opticType: 'none',
  stockType: 'wire',
  patron: null,
  presenter: 'portal-system',
};

/** The forge's presets — every one passes validateForgePrompt() unchanged. */
export const WEAPON_PRESETS = [
  {
    id: 'portal-gun',
    name: 'Portal Gun',
    prompt: { ...PORTAL_GUN_FORGE_PROMPT },
    blurb: 'The portal gun, as a forge prompt — presented by the portal system, damage 0 by design.',
  },
  {
    id: 'assault-rifle',
    name: 'Assault Rifle',
    prompt: {
      name: 'Olympus Assault Rifle',
      description: 'A reliable assault rifle in the standard dark finish, iron sights, telescoping stock, gold Omega mark.',
      assetUrl: '',
      length: 0.9,
      damage: 10,
      weaponType: 'rifle',
      finishColor: '#1c1f26',
      opticType: 'iron',
      stockType: 'telescoping',
      patron: null,
      presenter: 'traveller',
    },
    blurb: 'The builder\u2019s default rifle, as a prompt.',
  },
  {
    id: 'smg',
    name: 'SMG',
    prompt: {
      name: 'Olympus SMG',
      description: 'A compact SMG with a suppressor and red-dot sight, wire stock, gold Omega mark.',
      assetUrl: '',
      length: 0.9,
      damage: 10,
      weaponType: 'smg',
      finishColor: '#1c1f26',
      opticType: 'red-dot',
      stockType: 'wire',
      patron: null,
      presenter: 'traveller',
    },
    blurb: 'The builder\u2019s default SMG, as a prompt.',
  },
  {
    id: 'precision-rifle',
    name: 'Precision Rifle',
    prompt: {
      name: 'Olympus Precision Rifle',
      description: 'A long-range precision rifle with a scope and bipod, heavy fluted barrel, gold Omega mark.',
      assetUrl: '',
      length: 0.9,
      damage: 10,
      weaponType: 'precision',
      finishColor: '#1c1f26',
      opticType: 'scope',
      stockType: 'precision',
      patron: null,
      presenter: 'traveller',
    },
    blurb: 'The builder\u2019s default precision rifle, as a prompt.',
  },
];
