// lib/backpack/patrons.js
// PATRON SMITHS (Merlin, 2026-10-24): John Hammond, Dracula, the
// Dwarven Smith, and the Kyber Smith commission AI-created weapons
// at the Weapons Forge and distribute them to travellers — the
// forge's patron channel.
//
// The patrons already hand out weapons on Earth 2 (Hammond's
// cabinet, lib/earth2/hammond.js; Dracula's gift table, lib/earth2/
// gifts.js). Here they do it as smiths: the traveller commissions
// one weapon per patron per day, the patron's persona shapes the
// prompt, the app's existing Artemis Gemini plumbing (lib/artemis/
// server.js — geminiGenerate) invents the spec, and this module
// validates it HARD before anything is shelved. The model's text
// is data, never instructions: a bad class or rarity rejects the
// whole generation, damage is clamped to the catalogue's band,
// and the reticle is stamped from the law's table (RETICLE_BY_
// CLASS), never from the model.
//
// PURE — no imports beyond the backpack law, no fetch, no clock
// except an injectable date for the daily guard. The route owns
// auth, the AI call, and persistence; this module owns the shape
// of every weapon that may leave the patron's anvil.

import {
  createItem,
  defaultReticleForClass,
  RETICLE_BY_CLASS,
  sanitizeBackpackRecord,
} from './backpack.js';

// ── The patrons ──────────────────────────────────────────────────

export const PATRONS = {
  hammond: {
    id: 'hammond',
    name: 'John Hammond',
    title: 'the Fossil Smith',
    glyph: '🏛️',
    seat: 'Royal Tyrrell Museum, Earth 2',
    line: 'Sixty-five million years in the making.',
    favours: ['fossil', 'bone', 'amber'],
    // Persona markers the prompt must carry — pinned by test.
    markers: ['fossil', 'amber', 'paleontological', 'museum'],
    system:
      'You are John Hammond, the Fossil Smith of the Royal Tyrrell Museum, ' +
      'forging weapons from fossil bone, amber, and paleontological wonders. ' +
      'Every design must feel museum-grade: ancient materials, deep time, ' +
      'amber set like a jewel. Never modern, never plastic, never generic.',
  },
  dracula: {
    id: 'dracula',
    name: 'Dracula',
    title: 'the Night Smith',
    glyph: '🧛',
    seat: 'Castle Transylvania, Earth 2',
    line: 'The night provides.',
    favours: ['blood', 'silver', 'moonlight'],
    markers: ['blood', 'silver', 'moon', 'night', 'gothic'],
    system:
      'You are Dracula, the Night Smith of Castle Transylvania, forging ' +
      'weapons from blood, silver, moonlight, and gothic night. Every ' +
      'design must feel nocturnal and aristocratic: silver edges, crimson ' +
      'accents, the moon over the castle. Never sunny, never crude.',
  },
  dwarf: {
    id: 'dwarf',
    name: 'The Dwarven Smith',
    title: 'of the White City',
    glyph: '🔨',
    seat: 'The White City of Gondor — the forge beside the dwarf of Erebor',
    line: 'Iron remembers. So do I.',
    favours: ['iron', 'steel', 'runes'],
    markers: ['iron', 'steel', 'rune', 'orc-slaying', 'dwarven'],
    system:
      'You are the Dwarven Smith of the White City of Gondor, forging ' +
      'weapons from iron, steel, and rune-work, made for orc-slaying. ' +
      'Your steel comes from the hunt: orc iron, battlefield scrap, ' +
      'reclaimed blades reforged with dwarven craft. Every design must ' +
      'feel heavy, honest, and made to kill orcs: runes cut into the ' +
      'metal, edges that hold, no ornament that weakens the work.',
  },
  kyber: {
    id: 'kyber',
    name: 'The Kyber Smith',
    title: 'of the Jedi Temple',
    glyph: '💎',
    seat: 'Jedi Temple, Coruscant',
    line: 'The crystal chooses. I only listen.',
    favours: ['kyber', 'crystal', 'energy'],
    markers: ['kyber', 'crystal', 'energy', 'attunement'],
    system:
      'You are the Kyber Smith of the Jedi Temple on Coruscant, forging ' +
      'weapons around kyber crystals: crystal-cored blades, energy ' +
      'weapons, attunement between bearer and crystal. Every design ' +
      'must feel disciplined and luminous: a crystal at its heart, ' +
      'energy humming through the frame, the light side in every line. ' +
      'Never crude, never corrupt.',
  },
};

export const PATRON_IDS = Object.keys(PATRONS);

/** One patron by id, or null. */
export function patronById(id) {
  return PATRONS[id] || null;
}

// ── Prompt shaping ───────────────────────────────────────────────

/** The JSON contract the model must answer in. Shared by both
 *  patrons so the validator below can trust the shape. */
export const AI_WEAPON_CONTRACT =
  'Respond ONLY with a raw JSON object containing exactly these keys: ' +
  'name (string, a weapon name), weaponClass (string, one of: ' +
  Object.keys(RETICLE_BY_CLASS).join(', ') +
  '), damage (integer), rarity (string, one of: common, uncommon, rare, epic, legendary), ' +
  'description (string, one sentence about the weapon). No markdown, no code fences, no extra text.';

/**
 * Build the system + user prompts for a commission. theme is the
 * traveller's optional one-line hint (sanitized, capped) — or
 * empty, in which case the patron surprises them.
 */
export function buildPatronPrompt(patronId, theme) {
  const patron = patronById(patronId);
  if (!patron) return null;
  const hint = sanitizeAiText(theme, 120);
  return {
    system: `${patron.system}\n\n${AI_WEAPON_CONTRACT}`,
    user: hint
      ? `Forge a weapon for a traveller. Their hint: "${hint}".`
      : 'Forge a weapon for a traveller. Surprise them — stay true to your craft.',
  };
}

// ── Validation ───────────────────────────────────────────────────

/** The catalogue's sane damage band (catalogue weapons run 6–34;
 *  the patron band keeps a little headroom either way). */
export const AI_WEAPON_DAMAGE_MIN = 5;
export const AI_WEAPON_DAMAGE_MAX = 40;

export const AI_WEAPON_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * Sanitize model or user text: strip markup and control
 * characters, collapse whitespace, cap length. Returns '' for
 * non-strings. This is the only way model text reaches a weapon.
 */
export function sanitizeAiText(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>&\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'weapon';
}

/**
 * Validate a model's raw spec object. HARD gates:
 *   - weaponClass must be a law class, else REJECT the generation
 *     (never store a bad class — the reticle law cannot stamp it);
 *   - rarity must be in the table, else REJECT;
 *   - damage is CLAMPED to [5, 40] (a number out of band is
 *     corrected, not fatal);
 *   - name/description are sanitized and capped.
 * Returns { ok: true, spec } or { ok: false, error }.
 */
export function validateAiWeaponSpec(raw, patronId) {
  if (!patronById(patronId)) return { ok: false, error: 'Unknown patron.' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The patron returned no design.' };
  }
  const weaponClass = typeof raw.weaponClass === 'string' ? raw.weaponClass.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(RETICLE_BY_CLASS, weaponClass)) {
    return { ok: false, error: `The patron designed an unknown weapon class (${weaponClass || 'none'}).` };
  }
  const rarity = typeof raw.rarity === 'string' ? raw.rarity.trim().toLowerCase() : '';
  if (!AI_WEAPON_RARITIES.includes(rarity)) {
    return { ok: false, error: `The patron designed an unknown rarity (${rarity || 'none'}).` };
  }
  const damageRaw = Math.floor(Number(raw.damage));
  if (!Number.isFinite(damageRaw)) {
    return { ok: false, error: 'The patron designed no damage rating.' };
  }
  const damage = Math.min(AI_WEAPON_DAMAGE_MAX, Math.max(AI_WEAPON_DAMAGE_MIN, damageRaw));
  const name = sanitizeAiText(raw.name, 60);
  if (!name) return { ok: false, error: 'The patron designed no name.' };
  const description = sanitizeAiText(raw.description, 200);
  return {
    ok: true,
    spec: { name, weaponClass, damage, rarity, description },
  };
}

// ── Minting + provenance ─────────────────────────────────────────

/**
 * A backpack weapon entry for a validated AI spec — built through
 * createItem, so the reticle law stamps meta.reticle from the
 * class (never from the model). Provenance rides in meta: the
 * pack renders it like any weapon, and the profile can say who
 * forged it.
 */
export function aiWeaponItemFor(spec, patronId, commissionedAt) {
  const patron = patronById(patronId);
  if (!patron || !spec) return null;
  return createItem({
    id: `ai-${patronId}-${Date.now().toString(36)}-${slugify(spec.name)}`,
    kind: 'weapon',
    name: spec.name,
    meta: {
      weaponClass: spec.weaponClass,
      damage: spec.damage,
      rarity: spec.rarity,
      reticle: { style: defaultReticleForClass(spec.weaponClass) },
      source: 'patron-forge',
      aiGenerated: true,
      forgedBy: patronId,
      commissionedAt: typeof commissionedAt === 'string' && commissionedAt
        ? commissionedAt
        : new Date().toISOString(),
      description: spec.description || '',
    },
  });
}

// ── The daily guard ──────────────────────────────────────────────

/** UTC date key (YYYY-MM-DD) for a date — injectable for tests. */
export function commissionDateKey(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '1970-01-01';
  return date.toISOString().slice(0, 10);
}

/** The forgeKeys entry that marks one patron's commission for a
 *  day. Guard keys live in the backpack record's forgeKeys array
 *  (the same idempotency store the catalogue forge uses), so they
 *  survive sanitize and need no new table. */
export function commissionGuardKey(patronId, d = new Date()) {
  return `commission-${patronId}-${commissionDateKey(d)}`;
}

/** Whether this record already holds today's commission for the
 *  patron. */
export function hasCommissionedToday(record, patronId, d = new Date()) {
  const rec = sanitizeBackpackRecord(record);
  return rec.forgeKeys.includes(commissionGuardKey(patronId, d));
}

/**
 * Shelve a validated AI weapon into a record and stamp the day's
 * guard key. PURE — returns { ok, record, item } or
 * { ok: false, record (unchanged) } when the guard already fired.
 */
export function shelveAiWeapon(record, spec, patronId, d = new Date()) {
  const rec = sanitizeBackpackRecord(record);
  if (hasCommissionedToday(rec, patronId, d)) return { ok: false, record: rec };
  const item = aiWeaponItemFor(spec, patronId, new Date().toISOString());
  if (!item) return { ok: false, record: rec };
  const guardKey = commissionGuardKey(patronId, d);
  const forgeKeys = rec.forgeKeys.includes(guardKey)
    ? rec.forgeKeys
    : [guardKey, ...rec.forgeKeys].slice(0, 24);
  return { ok: true, record: { ...rec, items: [...rec.items, item], forgeKeys }, item };
}
