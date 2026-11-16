// lib/world-engine/forge-agent.js
// THE FORGE AGENT (Merlin, Nov 15, 2026) — the single handler for
// forge prompts.
//
// THE forge is /world-engine/weapons (the World Engine weapons
// builder). This module is the ONE path every forge prompt travels:
// the realms, the backpack panels, and the forge page itself all
// call this agent — never the synthesis or commission routes
// directly, and never a second parallel forge path.
//
//   validateForgePrompt(prompt)  — pure: is this prompt forgeable?
//   sanitizeForgePrompt(prompt)  — pure: clamp it into the safe shape.
//   forgePromptToWeaponParams(prompt) — pure: prompt -> weapon-builder params.
//   applyPromptKeywordNets(params, prompt, category) — pure: the plain-words
//     safety nets (scope / red-dot / long-range for weapons, weather words
//     for weather, class words for vehicles, archetype / size / temper
//     words for creatures) — moved here from the synthesize route so they
//     live in exactly one place; the route imports them from here.
//   damageForBackpack(damage)   — pure: prompt damage -> backpack damage.
//   isPortalGunForgePrompt(prompt) — pure: is this prompt the portal gun
//     (name + canonical description, exact match — the forge form
//     carries no presenter, so the prompt itself is the identity)?
//   mintForgeWeapon(record, forge) — pure: prompt -> backpack weapon entry.
//   forgeCommissionUrl(patron)  — pure: the forge link carrying patron context.
//   executePatronCommission(...) — the commission path: posts to the kept
//     commission route (/api/weapons-forge/commission), which stays the
//     agent's backend — commissions are free under a daily guard, a
//     different economy from the forge's 100-Aether billing.
//   executeForgeSynthesis(...)  — the AI path: posts to
//     /api/world-engine/synthesize (billing resolved server-side BEFORE
//     the AI call, deducted only AFTER success).
//
// PURE FIRST, EXECUTION SECOND: everything above the execute*
// functions is pure (record in, record out — no fetch, no clock
// except an injectable timestamp for the mint id). The execute*
// functions take their fetch + auth as injectable arguments so
// tests can stub them and the browser passes the real ones.
// Hostile values never reach geometry: every prompt is clamped
// through lib/world-engine/aesthetic.js before it becomes params.
//
// The portal gun's 10-portal award path (lib/portal/gun.js,
// PortalGunCard catch-up) is NOT touched by this agent — the gun
// is earned by walking portals, not by forging. What this agent
// DOES own is the gun's identity at the forge: a forged weapon
// that IS the portal gun (name 'Portal Gun' + the canonical
// prompt below, matched exactly) mints with the id 'portal-gun',
// so it fires from the backpack like the award gun. A weapon
// merely NAMED "Portal Gun" with any other description is a
// generic weapon — the canonical prompt is the discriminator, and
// the forge form carries no presenter input, so nothing else can
// stand in for it. Whether the award itself ever moves onto the
// forge is Merlin's call.

import { applyWeaponAesthetic } from './aesthetic.js';
import { PORTAL_GUN_FORGE_PROMPT } from './datasheets/weapons.js';
import { PATRON_IDS, patronById, sanitizeAiText } from '../backpack/patrons.js';
import { addItem, sanitizeBackpackRecord } from '../backpack/backpack.js';
import { cgiForClass } from '../weapons/cgi.js';

export const FORGE_AGENT_VERSION = 1;

// The portal-gun prompt data lives in the Weapons datasheet
// (lib/world-engine/datasheets/weapons.js PORTAL_GUN_FORGE_PROMPT) —
// the sheet owns the data, the agent owns the behaviour. Re-exported
// here so every existing importer keeps working, and so the sheet
// never imports back into the agent (that would be a cycle: the
// agent imports the aesthetic clamps, and the aesthetic layer
// re-exports its vocabularies from the sheet).
export { PORTAL_GUN_FORGE_PROMPT };

/** A fresh copy of the portal-gun prompt (callers never mutate the original). */
export function portalGunForgePrompt() {
  return { ...PORTAL_GUN_FORGE_PROMPT };
}

/** The weapon-builder params for the portal-gun prompt. */
export function portalGunForgeParams() {
  return forgePromptToWeaponParams(PORTAL_GUN_FORGE_PROMPT);
}

// ── Prompt shape ─────────────────────────────────────────────────
//
//   { name, description, assetUrl, length, damage,
//     weaponType, finishColor, opticType, stockType,
//     patron, presenter }
//
// name 1–60 chars; description 1–2000; assetUrl '' or an
// http(s) URL ≤ 500 chars; length 0.1–5 m (the forge form's
// Length slider); damage integer 0–100 — 0 is a legal prompt
// value and means "opens, does not wound" (the portal gun);
// patron null or a valid patron id; presenter 'portal-system'
// | 'patron' | 'traveller' (default 'traveller').

export const FORGE_PROMPT_LENGTH_MIN = 0.1;
export const FORGE_PROMPT_LENGTH_MAX = 5;
export const FORGE_PROMPT_DAMAGE_MIN = 0;
export const FORGE_PROMPT_DAMAGE_MAX = 100;
export const FORGE_PROMPT_NAME_MAX = 60;
export const FORGE_PROMPT_DESCRIPTION_MAX = 2000;
export const FORGE_PROMPT_ASSET_URL_MAX = 500;

const PRESENTERS = ['portal-system', 'patron', 'traveller'];

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Validate a raw forge prompt. Returns { ok, errors[], prompt } —
 * prompt is the sanitized shape when ok, null when not. Every
 * failure names its field; nothing is thrown.
 */
export function validateForgePrompt(raw) {
  const errors = [];
  const src = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const name = sanitizeAiText(src.name, FORGE_PROMPT_NAME_MAX);
  if (!name) errors.push('name is required (1–60 characters).');

  const description = sanitizeAiText(src.description, FORGE_PROMPT_DESCRIPTION_MAX);
  if (!description) errors.push('description is required (1–2000 characters).');

  const assetUrl = typeof src.assetUrl === 'string' ? src.assetUrl.trim().slice(0, FORGE_PROMPT_ASSET_URL_MAX) : '';
  if (assetUrl && !isHttpUrl(assetUrl)) {
    errors.push('assetUrl must start with http:// or https://.');
  }

  const lengthRaw = Number(src.length);
  if (!Number.isFinite(lengthRaw) || lengthRaw < FORGE_PROMPT_LENGTH_MIN || lengthRaw > FORGE_PROMPT_LENGTH_MAX) {
    errors.push(`length must be a number between ${FORGE_PROMPT_LENGTH_MIN} and ${FORGE_PROMPT_LENGTH_MAX} metres.`);
  }

  const damageRaw = Number(src.damage);
  if (!Number.isFinite(damageRaw) || !Number.isInteger(damageRaw) || damageRaw < FORGE_PROMPT_DAMAGE_MIN || damageRaw > FORGE_PROMPT_DAMAGE_MAX) {
    errors.push(`damage must be a whole number between ${FORGE_PROMPT_DAMAGE_MIN} and ${FORGE_PROMPT_DAMAGE_MAX} (0 opens, it does not wound).`);
  }

  const patron = src.patron === null || src.patron === undefined || src.patron === '' ? null : String(src.patron).trim().toLowerCase();
  if (patron !== null && !PATRON_IDS.includes(patron)) {
    errors.push(`patron must be one of: ${PATRON_IDS.join(', ')}.`);
  }

  const presenter = src.presenter === undefined || src.presenter === null || src.presenter === '' ? 'traveller' : String(src.presenter).trim().toLowerCase();
  if (!PRESENTERS.includes(presenter)) {
    errors.push(`presenter must be one of: ${PRESENTERS.join(', ')}.`);
  }
  if (presenter === 'patron' && patron === null) {
    errors.push('presenter "patron" needs a patron.');
  }
  if (presenter === 'portal-system' && patron !== null) {
    errors.push('presenter "portal-system" carries no patron.');
  }

  if (errors.length > 0) return { ok: false, errors, prompt: null };
  return {
    ok: true,
    errors: [],
    prompt: sanitizeForgePrompt(src),
  };
}

/**
 * Clamp a raw prompt into the safe shape. Hostile or malformed
 * values fall back to known-good defaults — never throw, never
 * pass a raw value through. Weapon params ride through
 * applyWeaponAesthetic (lib/world-engine/aesthetic.js).
 */
export function sanitizeForgePrompt(raw) {
  const src = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const weapon = applyWeaponAesthetic({
    weaponType: src.weaponType,
    barrelLength: Number.isFinite(Number(src.length)) ? Number(src.length) : undefined,
    stockType: src.stockType,
    opticType: src.opticType,
    finishColor: src.finishColor,
    damageRating: src.damage,
  });
  const lengthRaw = Number(src.length);
  const length = Number.isFinite(lengthRaw)
    ? Math.max(FORGE_PROMPT_LENGTH_MIN, Math.min(FORGE_PROMPT_LENGTH_MAX, lengthRaw))
    : 1.0;
  const damageRaw = Number(src.damage);
  // No usable rating stays unset (the old ForgeSector rule): the
  // mint leaves meta.damage off so the realms' native-damage
  // fallback applies. A finite rating clamps into [0, 100].
  const damage = Number.isFinite(damageRaw)
    ? Math.max(FORGE_PROMPT_DAMAGE_MIN, Math.min(FORGE_PROMPT_DAMAGE_MAX, Math.floor(damageRaw)))
    : undefined;
  const patron = src.patron === null || src.patron === undefined || src.patron === '' ? null : String(src.patron).trim().toLowerCase();
  const presenter = src.presenter === undefined || src.presenter === null || src.presenter === '' ? 'traveller' : String(src.presenter).trim().toLowerCase();
  return {
    name: sanitizeAiText(src.name, FORGE_PROMPT_NAME_MAX) || 'Unnamed weapon',
    description: sanitizeAiText(src.description, FORGE_PROMPT_DESCRIPTION_MAX),
    assetUrl: typeof src.assetUrl === 'string' ? src.assetUrl.trim().slice(0, FORGE_PROMPT_ASSET_URL_MAX) : '',
    length,
    damage,
    weaponType: weapon.weaponType,
    finishColor: weapon.finishColor,
    opticType: weapon.opticType,
    stockType: weapon.stockType,
    patron: patron !== null && PATRON_IDS.includes(patron) ? patron : null,
    presenter: PRESENTERS.includes(presenter) ? presenter : 'traveller',
  };
}

// ── Prompt -> builder params ─────────────────────────────────────

/**
 * Map a (sanitized) forge prompt onto the weapon-builder's
 * params. The form's Length slider (0.1–5 m) maps onto the
 * builder's barrelLength (0.3–2.0 m) — a 0.9 m gun keeps a 0.9 m
 * barrel; anything longer stretches only as far as the builder
 * allows. damageRating rides as the prompt's damage (0 stays 0:
 * the builder never renders damage, the pack carries it).
 * Plain words in the description are honoured by the keyword
 * nets below.
 */
export function forgePromptToWeaponParams(prompt) {
  const clean = sanitizeForgePrompt(prompt);
  const params = applyWeaponAesthetic({
    weaponType: clean.weaponType,
    barrelLength: clean.length,
    stockType: clean.stockType,
    opticType: clean.opticType,
    finishColor: clean.finishColor,
    damageRating: clean.damage,
  });
  // applyWeaponAesthetic clamps damageRating to [1, 100]; the
  // portal gun's 0 is a design value, not a hostile one — keep it.
  params.damageRating = clean.damage;
  return applyPromptKeywordNets(params, clean.description, 'weapon');
}

// ── Prompt-keyword safety nets ───────────────────────────────────
//
// Moved here from app/api/world-engine/synthesize/route.js so
// they live in exactly one place. If the user explicitly asked
// for an optic in plain words and the AI missed it, the words
// win. Pure: params in, new params out.
// Nets: weapon (scope / red-dot / long-range), weather (storm,
// snow, rain, fog, ash, clear), vehicle (class words), creature
// (archetype / size / temper words). Character, object and
// asset_link get no net — see the note at the end of
// applyPromptKeywordNets.

const WEAPON_SCOPE_RE = /\bscope[ds]?\b/;
const WEAPON_REDDOT_RE = /red[\s-]?dot/;
const WEAPON_LONGRANGE_RE = /long[\s-]?range|sniper/;

const WEATHER_KEYWORD_MAP = [
  [/blizzard|snow/, 'snow'],
  [/thunder|lightning|tempest/, 'storm'],
  [/\brain\b|downpour|drizzle/, 'rain'],
  [/\bfog\b|mist|haze/, 'fog'],
  [/\bash\b|ember|wildfire/, 'ash'],
  [/\bclear\b|sunny|blue sky/, 'clear'],
];

// Vehicle class words — first matching pattern wins, checked
// space -> air -> ground so "flying car" reads as air, not ground.
const VEHICLE_CLASS_MAP = [
  [/space(?:ship|craft)?|starship|rocket|\borbit\b/, 'space'],
  [/aircraft|\bair\b|\bplane\b|\bjet\b|helicopter|drone|\bwing(?:s|ed)?\b|\bfly(?:ing)?\b/, 'air'],
  [/\bcars?\b|truck|rover|tank|wheel|ground|\bdriv(?:e|ing|er)?\b/, 'ground'],
];

// Creature archetype words — first matching pattern wins. Stalker
// is checked before grazer on purpose: "a predator stalking the
// herd" is a stalker, and "herd" alone is only contextual.
const CREATURE_ARCHETYPE_MAP = [
  [/stalker|predator|hunter/, 'stalker'],
  [/grazer|herbivore|\bherd\b/, 'grazer'],
  [/flyer|flying|winged|\bbird\b/, 'flyer'],
  [/swarm|flock|swarmer/, 'swarmer'],
  [/burrow/, 'burrower'],
  [/drift|float/, 'drifter'],
  [/dart/, 'darter'],
  [/leviathan|titan|giant|colossal/, 'leviathan'],
  [/weaver|\bweb\b|spider/, 'weaver'],
  [/mimic|camouflag/, 'mimic'],
];

// Creature size words — strongest first, so "big giant" reads huge.
const CREATURE_SIZE_MAP = [
  [/huge|massive|giant|colossal|titan/, 'huge'],
  [/large|\bbig\b/, 'large'],
  [/small|little/, 'small'],
  [/tiny|miniature|pocket/, 'tiny'],
];

// Creature temper words — the aggression poles (0.9 / 0.1).
const CREATURE_AGGRESSION_MAP = [
  [/aggressive|fierce|hostile|vicious|ferocious/, 0.9],
  [/calm|gentle|docile|peaceful|\btame\b/, 0.1],
];

export function applyPromptKeywordNets(params, promptText, category) {
  const out = { ...(params !== null && typeof params === 'object' ? params : {}) };
  const words = typeof promptText === 'string' ? promptText.toLowerCase() : '';
  const cat = (category || '').toString().toLowerCase();
  if (cat === 'weapon' && words) {
    // Precedence is the route's old order, kept exactly: scope
    // beats red-dot (else-if), and long-range promotes a rifle to
    // precision with a scope unless a red-dot was asked for.
    const wantsScope = WEAPON_SCOPE_RE.test(words);
    const wantsRedDot = WEAPON_REDDOT_RE.test(words);
    if (wantsScope && out.opticType !== 'scope') out.opticType = 'scope';
    else if (wantsRedDot && out.opticType !== 'red-dot') out.opticType = 'red-dot';
    if (WEAPON_LONGRANGE_RE.test(words) && out.weaponType === 'rifle') {
      out.weaponType = 'precision';
      if (!wantsRedDot) out.opticType = 'scope';
    }
  }
  if (cat === 'weather' && words) {
    for (const [re, wt] of WEATHER_KEYWORD_MAP) {
      if (re.test(words)) { out.weatherType = wt; break; }
    }
  }
  if (cat === 'vehicle' && words) {
    for (const [re, vc] of VEHICLE_CLASS_MAP) {
      if (re.test(words)) { out.vehicleClass = vc; break; }
    }
  }
  if (cat === 'creature' && words) {
    for (const [re, arch] of CREATURE_ARCHETYPE_MAP) {
      if (re.test(words)) { out.archetype = arch; break; }
    }
    for (const [re, size] of CREATURE_SIZE_MAP) {
      if (re.test(words)) { out.sizeClass = size; break; }
    }
    for (const [re, agg] of CREATURE_AGGRESSION_MAP) {
      if (re.test(words)) { out.aggression = agg; break; }
    }
  }
  // No nets for character, object, or asset_link: character height /
  // proportions and object scale / density are numbers, and plain
  // words for them ("tall", "big", "dense") are relative — there is
  // no number to map them to without inventing one. The uplink's
  // url is the input itself and its type is always 'glb'.
  return out;
}

// ── Damage: prompt -> backpack ───────────────────────────────────

/**
 * The backpack's damage band is [5, 40] — the ForgeSector rule
 * since 2026-10-24. Prompt damage 1–100 clamps into it. Damage
 * 0 is the designed exception: it stays 0 (the portal gun opens,
 * it does not wound). No usable rating -> undefined, so the
 * realms' native-damage fallback applies.
 */
export function damageForBackpack(damage) {
  const raw = Math.floor(Number(damage));
  if (!Number.isFinite(raw)) return undefined;
  if (raw === 0) return 0;
  if (raw < 0) return undefined;
  return Math.min(40, Math.max(5, raw));
}

// ── Minting ──────────────────────────────────────────────────────

/**
 * Is this forge prompt the portal gun — name 'Portal Gun' AND the
 * description an EXACT match for the canonical prompt
 * (PORTAL_GUN_FORGE_PROMPT)? The forge form carries no presenter
 * input, so the prompt itself is the identity: a weapon merely
 * NAMED "Portal Gun" with any other description is NOT the gun.
 * Both sides are compared after the same sanitization the mint
 * applies, so a pasted canonical prompt matches even with stray
 * spacing, and nothing else can slip through.
 */
export function isPortalGunForgePrompt(prompt) {
  const clean = sanitizeForgePrompt(prompt);
  return clean.name === PORTAL_GUN_FORGE_PROMPT.name
    && clean.description === sanitizeAiText(PORTAL_GUN_FORGE_PROMPT.description, FORGE_PROMPT_DESCRIPTION_MAX);
}

/**
 * Mint a forged weapon into a backpack record — through
 * createItem, so the reticle law stamps meta.reticle from the
 * class (firearm -> crosshair) and meta.cgi rides beside it
 * (procedural firearm + bullet firing, lib/weapons/cgi.js).
 * Provenance: source 'world-engine-weapon-builder' (or
 * 'portal-system' for the portal gun), aiGenerated,
 * weaponBuilderType, forgedBy when a patron presented it.
 * PURE — returns { ok, record, item }.
 *
 * The portal gun is one of a kind: when the prompt IS the gun
 * (isPortalGunForgePrompt — exact canonical-prompt match) and
 * the pack already holds it, the mint refuses
 * ({ ok: false, reason: 'already-held' }) instead of shelving a
 * second gun — the award path and the forge path must never
 * duplicate it.
 */
export function mintForgeWeapon(record, forge, now = new Date()) {
  const rec = sanitizeBackpackRecord(record);
  const clean = sanitizeForgePrompt(forge);
  const isPortalGun = isPortalGunForgePrompt(clean);
  const itemId = isPortalGun
    ? 'portal-gun'
    : `world-engine-weapon-${(now instanceof Date ? now : new Date(now)).getTime().toString(36)}`;
  if (isPortalGun && rec.items.some((e) => e.id === 'portal-gun')) {
    return { ok: false, record: rec, item: null, reason: 'already-held' };
  }
  const dmg = damageForBackpack(clean.damage);
  const meta = {
    weaponClass: 'firearm',
    source: isPortalGun || clean.presenter === 'portal-system' ? 'portal-system' : 'world-engine-weapon-builder',
    aiGenerated: true,
    createdAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    cgi: cgiForClass('firearm'),
    description: clean.description || '',
  };
  if (dmg !== undefined) meta.damage = dmg;
  if (clean.weaponType) meta.weaponBuilderType = clean.weaponType.slice(0, 40);
  if (clean.patron) meta.forgedBy = clean.patron;
  const item = {
    id: itemId,
    kind: 'weapon',
    name: clean.name,
    meta,
  };
  const next = addItem(rec, item);
  const minted = next.items.find((e) => e.id === itemId && e.kind === 'weapon') || null;
  if (!minted) return { ok: false, record: rec, item: null, reason: 'pack-full' };
  return { ok: true, record: next, item: minted };
}

// ── Links ────────────────────────────────────────────────────────

/**
 * The forge link carrying patron context: a realm's commission
 * link lands on the forge with that patron preselected
 * (/world-engine/weapons?patron=<id>). Unknown patron -> the
 * plain forge. This is the one function that builds forge links.
 */
export function forgeCommissionUrl(patron) {
  const id = typeof patron === 'string' ? patron.trim().toLowerCase() : '';
  if (id && PATRON_IDS.includes(id)) return `/world-engine/weapons?patron=${id}`;
  return '/world-engine/weapons';
}

/** The patron a forge URL carries (?patron=<id>), or null. */
export function patronFromForgeUrl(url) {
  try {
    const u = new URL(url, 'http://localhost');
    const id = (u.searchParams.get('patron') || '').trim().toLowerCase();
    return PATRON_IDS.includes(id) ? id : null;
  } catch {
    return null;
  }
}

/** One patron by id, or null — the agent's view of the roster. */
export function forgePatronById(id) {
  return patronById(id);
}

// ── Execution: commissions ───────────────────────────────────────

/**
 * Execute a patron commission through the agent: POST the kept
 * commission route and return its answer. The route is the
 * agent's backend — it owns auth, the daily guard, the Artemis
 * Gemini call, validation, and shelving; this function is the
 * one client-side caller. fetchImpl + getAuthHeaders are
 * injected (the browser passes the real fetch + session token;
 * tests pass stubs). Returns the route's { ok, weapon, backpack }
 * on success, or { ok: false, error, alreadyCommissioned?,
 * backpack? } on failure. Never throws for a route-shaped error.
 */
export async function executePatronCommission({ patron, theme = '', fetchImpl, getAuthHeaders } = {}) {
  const id = typeof patron === 'string' ? patron.trim().toLowerCase() : '';
  if (!PATRON_IDS.includes(id)) return { ok: false, error: 'Unknown patron.' };
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  let headers = { 'content-type': 'application/json' };
  if (typeof getAuthHeaders === 'function') {
    try {
      const auth = await getAuthHeaders();
      if (auth && typeof auth === 'object') headers = { ...headers, ...auth };
    } catch {
      return { ok: false, error: 'Sign in to commission — the patrons forge for account holders.' };
    }
  }
  let res;
  try {
    res = await doFetch('/api/weapons-forge/commission', {
      method: 'POST',
      headers,
      body: JSON.stringify({ patron: id, theme: sanitizeAiText(theme, 120) }),
    });
  } catch {
    return { ok: false, error: 'The forge could not be reached. Your pack is unchanged.' };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    return {
      ok: false,
      error: (data && data.error) || 'The patron could not forge that. Try again.',
      alreadyCommissioned: Boolean(data && data.alreadyCommissioned),
      backpack: data && data.backpack ? data.backpack : undefined,
    };
  }
  return { ok: true, weapon: data.weapon, backpack: data.backpack };
}

/** Whether today's commission is already spent for a patron (GET the route). */
export async function loadPatronCommissions({ fetchImpl, getAuthHeaders } = {}) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  let headers = {};
  if (typeof getAuthHeaders === 'function') {
    try {
      const auth = await getAuthHeaders();
      if (auth && typeof auth === 'object') headers = { ...headers, ...auth };
    } catch {
      return { signedIn: false, commissions: null };
    }
  }
  try {
    const res = await doFetch('/api/weapons-forge/commission', { headers, cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!data || !data.commissions) return { signedIn: true, commissions: null };
    const commissions = {};
    for (const p of PATRON_IDS) commissions[p] = data.commissions[p] === true;
    return { signedIn: true, commissions };
  } catch {
    return { signedIn: true, commissions: null };
  }
}

// ── Execution: AI synthesis ──────────────────────────────────────

/**
 * Execute a forge synthesis through the agent: POST the kept
 * synthesize route and return its answer. Billing stays
 * server-side (20 free monthly generations, then the cost map —
 * weapon 100 Aether — resolved BEFORE the AI call, deducted
 * only AFTER success). Returns { ok, parameters, billing } or
 * { ok: false, error }. Never throws for a route-shaped error.
 */
export async function executeForgeSynthesis({ prompt, assetUrl = '', category = 'weapon', fetchImpl, getAuthHeaders } = {}) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 2000) : '';
  const cleanUrl = typeof assetUrl === 'string' ? assetUrl.trim().slice(0, 500) : '';
  if (!cleanPrompt && !cleanUrl) {
    return { ok: false, error: 'Describe what you want to build, or paste an asset URL first.' };
  }
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  let headers = { 'Content-Type': 'application/json' };
  if (typeof getAuthHeaders === 'function') {
    try {
      const auth = await getAuthHeaders();
      if (auth && typeof auth === 'object') headers = { ...headers, ...auth };
    } catch {
      return { ok: false, error: 'Sign in from the launcher to use AI synthesis and save your work.' };
    }
  }
  let res;
  try {
    res = await doFetch('/api/world-engine/synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: cleanPrompt, targetUrl: cleanUrl || undefined, category }),
    });
  } catch {
    return { ok: false, error: 'Synthesis failed. Please try again.' };
  }
  const data = await res.json().catch(() => null);
  if (!data || !data.success) {
    return { ok: false, error: (data && data.error) || 'Synthesis failed.' };
  }
  return { ok: true, parameters: data.parameters, billing: data.billing || {} };
}
