// lib/kombat/specials.js
//
// STEP 6 — specials carry LOGIC (Merlin, 2026-10-14: "The special
// moves don't seem to have any logic attached to them"). Every roster
// special is classified by what it IS, from its name + effect text:
//
//   strike     a hit that needs proximity
//   projectile a traveling attack that works at range
//   grab       a contact throw — tight band, ignores block
//   movement   repositions (dash/teleport), damage lands on arrival
//   ward       shields / halves incoming damage — NEVER deals damage
//   heal       restores health — NEVER deals damage
//   buff       temporarily raises the user's own stats
//   debuff     damages and/or weakens the opponent for a few seconds
//
// Execution parameters (range bands), fire conditions, the AI policy,
// and the per-kind effect language all live here so the duel engine,
// the brawl engine, and the headless tests share one source of truth.
// Pure module: no three, no DOM.

export const SPECIAL_KINDS = ['strike', 'projectile', 'grab', 'movement', 'ward', 'heal', 'buff', 'debuff'];

/** Range bands in arena units (duel: |x| distance; brawl: 2D). */
export const KIND_BANDS = {
  strike: [0, 2.5],
  projectile: [0, 99],     // fires at any range; the ORB travels
  grab: [0, 1.5],
  movement: [0, 99],       // closes the distance itself
  ward: [0, 99],
  heal: [0, 99],
  buff: [0, 99],
  debuff: [0, 2.6],
};

/** Effect language per kind — every special is READABLE at a glance. */
export const KIND_FX = {
  strike: { color: 0xffcf4d, label: 'STRIKE' },
  projectile: { color: 0xff7733, label: 'PROJECTILE' },
  grab: { color: 0xff4455, label: 'GRAB' },
  movement: { color: 0xf2f2f2, label: 'DASH' },
  ward: { color: 0x5fc9ff, label: 'WARD' },
  heal: { color: 0x6dffa8, label: 'HEAL' },
  buff: { color: 0xffb52e, label: 'BUFF' },
  debuff: { color: 0xc07fff, label: 'CURSE' },
};

const RE = {
  heal: /restor|heal|recover|regenerat|mends?|stitch|knit|second wind/i,
  ward: /half damage|halved|takes? (reduced|less)|shield|ward|sidestep|dodg|pass(es)? (straight )?through|shrugs? off|harden|impervious|invulnerab|deflect/i,
  buff: /speeds? up|speed boost|faster|stronger|power(s|ed)? up|surge|overdrive|adrenal|rage build|grows? (larger|bigger)|enlarg/i,
  // NOTE: deliberately NO bare 'wave' (every slam has a "shockwave"),
  // no bare 'projectile' (dashes go "under projectiles"), no bare
  // 'breath' (Vader's "breathing quickens"), no bare 'energy'.
  projectile: /throw|toss|hurl|fireball|fire ball|blast|beam|bolt|orb|spit|shoot|shot|phantom|missile|shard|spike volley|ray|grenade|lightning|rifle|minigun|machine ?gun|force push|push wave|zapper|spear.*(throw|hurl)|web shot/i,
  throwVerb: /\b(throws?|tosses|hurls?|flings?|launches?)\b/i,
  throwObject: /machete|knife|axe|hatchet|hammer|spear|shield|boomerang|chakram|grenade|bomb|rock|skull|pumpkin|car|anchor/i,
  grab: /grab|grappl|grip|crush(es|ed)? (the|their|his|her|its|your)\b|force crush|choke|strangle|suplex|piledriver|bear hug|absorb|hoist|slams? (the opponent|him|her|them)|picks? (up|him|her|them)|seizes|lifts? (him|her|them|the opponent)|is lifted/i,
  movement: /teleport|reappear|dissolves|blink|phase|dash(es)? (under|through|behind|forward)\b|leap(s|ing)? (in|forward|at|that)?\b|crosses the arena|\blunges?\b|charges? (toward|at|forward|into|in)\b|shoulder charge|rush(es)? (in|forward)|materializ/i,
  nameDash: /\bdash\b/i,
  buffSelf: /attack power surges|power surges|self[- ]buff|cannot miss|gets madder/i,
  debuff: /poison|venom|ignit|ablaze|acid burn|burning (flesh|wounds|pain)|slow|weaken|stun|snare|trap|entangle|drain|curse|chill|freeze|confus|intimidat|taunt|slips?|slippery|vulnerable|stagger|roar|web(s|bed)? (up|down)|sticky|blinds? (the|him|her|them|opponent)|blinding (light|flash|gaze)/i,
};

/**
 * Data-explicit exceptions: specials whose own effect text overrides
 * the band their kind normally carries. Keyed `kombatId::Name`.
 * Force Choke "lifts the opponent by the throat FROM ACROSS THE
 * ARENA" — a grab that works at any range (still ignores block).
 */
export const SPECIAL_OVERRIDES = {
  'darth-vader::Force Choke': { kind: 'grab', band: [0, 99] },
};

/**
 * Classify one roster special { name, effect, damage, cooldown }.
 * Ordered rules; damage-0 specials are never offensive kinds.
 * @returns {{ kind: string, band: [number, number] }}
 */
export function classifySpecial(spec, kombatId) {
  const override = kombatId ? SPECIAL_OVERRIDES[`${kombatId}::${spec.name}`] : null;
  if (override) return { kind: override.kind, band: [...override.band] };
  const text = `${spec.name || ''} ${spec.effect || ''}`;
  const dmg = spec.damage || 0;
  let kind;
  if (dmg <= 0) {
    if (RE.heal.test(text)) kind = 'heal';
    else if (RE.ward.test(text)) kind = 'ward';
    else if (RE.buff.test(text)) kind = 'buff';
    else if (RE.debuff.test(text)) kind = 'debuff';
    else kind = 'ward'; // a damageless special is defensive by default
  } else {
    if (/phantom/i.test(text)) kind = 'projectile'; // Freddy's Never Sleep: a phantom, not a dash
    else if (RE.throwVerb.test(text) && RE.throwObject.test(text)) kind = 'projectile';
    else if (RE.movement.test(text) || RE.nameDash.test(spec.name || '')) kind = 'movement';
    else if (RE.grab.test(text) || /engulf/i.test(spec.name || '')) kind = 'grab';
    else if (RE.projectile.test(text)) kind = 'projectile';
    else if (RE.buffSelf.test(text)) kind = 'buff';
    else if (RE.debuff.test(text)) kind = 'debuff';
    else kind = 'strike';
  }
  return { kind, band: KIND_BANDS[kind] };
}

/** Classify a whole kit (array of specials) once; engines cache this. */
export function classifyKit(specials, kombatId) {
  return (specials || []).map((s) => classifySpecial(s, kombatId));
}

/** HP a heal restores: bigger cooldown = bigger heal. */
export function healAmountFor(spec) {
  return Math.round(10 + (spec.cooldown || 6) * 1.2);
}

export const BUFF_SECONDS = 4;
export const DEBUFF_SECONDS = 3;
export const BUFF_DAMAGE_MUL = 1.3;
export const DEBUFF_TAKEN_MUL = 1.2;
export const DEBUFF_SPEED_MUL = 0.75;
export const BUFF_SPEED_MUL = 1.15;

/** Damage multiplier from status effects (attacker buff, defender curse). */
export function statusDamageMul(att, def) {
  let mul = 1;
  if (att && att.buffT > 0) mul *= BUFF_DAMAGE_MUL;
  if (def && def.debuffT > 0) mul *= DEBUFF_TAKEN_MUL;
  return mul;
}

/** Speed multiplier from status effects on one fighter. */
export function statusSpeedMul(f) {
  let mul = 1;
  if (f && f.buffT > 0) mul *= BUFF_SPEED_MUL;
  if (f && f.debuffT > 0) mul *= DEBUFF_SPEED_MUL;
  return mul;
}

/**
 * Fire conditions for SELF-targeting kinds (the honest gates — the
 * player path denies these WITHOUT burning the cooldown, and the AI
 * simply never chooses them). Offensive kinds always "fire"; range
 * decides hit or whiff at resolution.
 * self/foe: { health, maxHealth, wardT, buffT, debuffT }
 */
export function specialUsable(spec, kind, self, foe) {
  if (kind === 'heal') {
    if (self.health >= (self.maxHealth || 100)) return { ok: false, reason: 'full-health' };
    return { ok: true };
  }
  if (kind === 'ward') {
    if (self.wardT > 0) return { ok: false, reason: 'already-warded' };
    if (self.health >= (self.maxHealth || 100)) return { ok: false, reason: 'full-health' };
    return { ok: true };
  }
  if (kind === 'buff') {
    if (self.buffT > 0) return { ok: false, reason: 'already-buffed' };
    return { ok: true };
  }
  if (kind === 'debuff') {
    return { ok: true };
  }
  return { ok: true };
}

/** Is `dist` inside the kind's band? */
export function inBand(kind, dist) {
  const band = KIND_BANDS[kind] || KIND_BANDS.strike;
  return dist >= band[0] && dist <= band[1];
}

/**
 * The AI policy: choose among READY specials by logic + situation —
 * never uniform-random, never a ward as an attack, never a grab from
 * across the arena. Returns a kit index or -1 (no sensible special;
 * the caller falls back to normal movement/attacks).
 *
 * @param kit       roster specials for the fighter
 * @param kinds     classifyKit() output (parallel to kit)
 * @param cooldowns remaining cooldown seconds (parallel)
 * @param s         situation { dist, selfHealth, foeHealth, selfWardT,
 *                  selfBuffT, foeDebuffT }
 * @param rng       () => [0,1) — injectable for tests
 */
export function chooseSpecial(kit, kinds, cooldowns, s, rng) {
  const rand = rng || Math.random;
  let best = -1;
  let bestScore = 0.5; // a special must be at least mildly sensible
  for (let i = 0; i < kit.length; i++) {
    if ((cooldowns[i] || 0) > 0) continue;
    const spec = kit[i];
    const kind = (kinds[i] && kinds[i].kind) || classifySpecial(spec).kind;
    const self = { health: s.selfHealth, maxHealth: 100, wardT: s.selfWardT || 0, buffT: s.selfBuffT || 0 };
    const foe = { health: s.foeHealth, debuffT: s.foeDebuffT || 0 };
    if (!specialUsable(spec, kind, self, foe).ok) continue;
    const dist = s.dist;
    const dmg = spec.damage || 0;
    const band = (kinds[i] && kinds[i].band) || KIND_BANDS[kind];
    const inEntryBand = dist >= band[0] && dist <= band[1];
    let score = 0;
    switch (kind) {
      case 'heal':
        score = s.selfHealth < 65 ? 13 - s.selfHealth / 8 : 0;
        break;
      case 'ward':
        score = s.selfHealth < 60 ? 8.5 : dist <= 2.6 ? 4.5 : 1.5;
        break;
      case 'buff':
        // early / fight-start bias: buff while the foe is still healthy
        score = s.foeHealth > 60 ? 7.5 : 4.5;
        if (dist > 3) score += 1;
        break;
      case 'debuff':
        score = foe.debuffT > 0 ? 1.5 : inEntryBand ? 7 : 0;
        break;
      case 'grab':
        score = inEntryBand ? 9 + dmg / 4 : 0;
        break;
      case 'strike':
        score = inEntryBand ? 8 + dmg / 5 : 0;
        break;
      case 'projectile':
        if (dist >= 2.2) score = 7 + dmg / 5;
        else if (dist >= 1.2) score = 4;
        else score = 1; // point-blank: almost never the right call
        break;
      case 'movement':
        score = dist > 2.5 ? 8.5 : 5;
        break;
      default:
        score = 0;
    }
    // finishers: a heavy hitter is worth more when the foe is low
    if (dmg >= 14 && s.foeHealth <= 30 && score > 0) score += 3;
    score += rand() * 1.2; // tie-break jitter only — logic dominates
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
