// lib/kombat/temperament.js
//
// KOMBAT ARENA — per-fighter combat TEMPERAMENT (Merlin's order:
// the fighters fight FAST, VICIOUS and BRUTAL).
//
// The gap this fills: difficulty (lib/kombat/rules.js DIFFICULTY)
// was the ONLY voice in the CPU's decisions — every fighter on
// 'normal' attacked, retreated, reacted and finished at the same
// rates. Temperament is each fighter's own style WITHIN a
// difficulty: how fast they strike, how hard they press, how long
// they chase a combo, how heavy their hands are, how eagerly they
// finish a wounded opponent. Difficulty still scales the whole
// fight; temperament gives Jason his slow, retreating-never stalk
// and Chucky his frantic knife tempo inside the same tier.
//
// DERIVATION — pure + deterministic, no Math.random anywhere:
// the same construction movementProfile() (pose-driver.js) uses
// for gait — base numbers from the fighter's roster stats, keyword
// rules over the bridge movementStyle prose, and a short table of
// hand overrides where the roster's own prose demands them. The
// roster as a whole is tuned HOT (Merlin's baseline direction):
// median aggression and strike tempo sit ABOVE the neutral
// difficulty numbers, with per-fighter spread around them —
// creatures and villains skew brutal, speedsters skew fast,
// tanks skew heavy and slow.
//
// ID LAW: fighters carry two id namespaces (roster kombatId
// 't-800' vs bridge characterId 'q017-t-800-terminator'). This
// module keys through the bridge — temperamentFor() accepts
// EITHER id and resolves via the loadouts records, never by
// string similarity.
//
// Slimer and B.O.B. are rigless BY DESIGN (floater / ooze — do
// not "fix" them). Temperament is not a rig property: their AI
// decisions flow through the exact same aiThink path as every
// skeletal fighter, so they get temperaments like everyone else
// (theirs are gentle — they are the roster's comic relief).

import { FIGHTERS, getFighter } from './roster.js';
import { LOADOUTS, getLoadout } from './loadouts.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Bridge lookup in the OTHER namespace: characterId -> loadout.
const LOADOUT_BY_CHARACTER_ID = new Map(
  LOADOUTS.map((l) => [l.characterId, l]),
);

/** Resolve either id namespace to the roster (kombatId) id. */
export function resolveKombatId(id) {
  if (typeof id !== 'string') return null;
  if (getFighter(id)) return id;
  const byCharacter = LOADOUT_BY_CHARACTER_ID.get(id);
  return byCharacter ? byCharacter.kombatId : null;
}

/** Rig kind from the bridge record — same dispatch pose-driver uses. */
export function temperamentKind(loadout) {
  if (!loadout) return 'humanoid';
  if (loadout.rigClass === 'none') return 'rigless';
  if (loadout.rigClass === 'creature' || loadout.motionClass === 'creature') return 'creature';
  return 'humanoid';
}

// Keyword rules over the movementStyle prose, per dimension —
// the same technique (and several of the same tells) as
// movementProfile's PROFILE_RULES. Small nudges, applied in order.
const PACE_RULES = [
  [/feral|frantic|twitchy|sprint|explodes into motion|skitter/i, +0.10],
  [/never hurries|metronom|glacial|slow |deliberate|measured/i, -0.20],
  [/float|hover|drift|levitat/i, -0.06],
];
const FURY_RULES = [
  [/feral|frantic|barely[- ]contained|wild|relentless|unstoppable|screaming/i, +0.10],
  [/calm|measured|econom|ritual|grace/i, -0.08],
  [/taunt|theatrical|showman/i, +0.04],
];

// Hand overrides (kombatId -> intensity deltas), only where the
// roster's own prose demands a signature read the formulas miss.
const TEMPERAMENT_OVERRIDES = {
  // Jason: the slowest hands in the game, max pressure, never backs
  // off — the formulas get the fury; the pace must be forced down.
  'jason-voorhees': { pace: -0.18, fury: +0.08, savagery: +0.10 },
  // Michael: the same metronome — pressure without tempo.
  'michael-myers': { pace: -0.15 },
  // Taz is a whirlwind with teeth: tempo and fury both pinned up.
  'tasmanian-devil': { pace: +0.15, fury: +0.12 },
  // The apex predator tops the brutality scale by design.
  't-rex': { savagery: +0.08 },
  'xenomorph': { savagery: +0.05 },
  'thanos': { savagery: +0.10, fury: +0.06 },
  'hulk': { savagery: +0.08, fury: +0.10 },
  // Berserker rage is Wolverine's whole file.
  'wolverine': { fury: +0.10, savagery: +0.06 },
  // Stay Puft is a skyscraper with a smile: tempo forced down.
  'stay-puft': { pace: -0.20 },
  // The gentle pair — rigless by design, harmless by temperament.
  'slimer': { fury: -0.15, savagery: -0.25 },
  'bob-blob': { fury: -0.20, savagery: -0.30 },
  // Bugs wins by humiliation, not by maiming.
  'bugs-bunny': { savagery: -0.20, fury: -0.05 },
};

function applyRules(rules, prose) {
  let delta = 0;
  for (const [re, d] of rules) if (re.test(prose)) delta += d;
  return delta;
}

/**
 * Pure core: derive a temperament from a roster record + its
 * bridge loadout. Either may be null (unknown fighter) — the
 * roster-median default comes back, so callers never crash.
 */
export function deriveTemperament(fighter, loadout) {
  const stats = fighter?.stats || { power: 5, speed: 5, toughness: 5, range: 5 };
  const kind = temperamentKind(loadout);
  const prose = `${(loadout && loadout.movementStyle) || ''} ${(loadout && loadout.weapon && loadout.weapon.name) || ''}`;
  const specials = fighter?.specials || [];
  const avgSpecialDamage = specials.length
    ? specials.reduce((a, s) => a + (s.damage || 0), 0) / specials.length
    : 12;

  // --- intensities (0..1) --------------------------------------
  let pace = 0.32 + 0.068 * stats.speed + applyRules(PACE_RULES, prose);
  let fury = 0.38 + 0.038 * stats.power + 0.022 * stats.speed + applyRules(FURY_RULES, prose);
  let savagery = 0.28 + 0.04 * stats.power + (avgSpecialDamage - 12) * 0.008;
  if (kind === 'creature') savagery += 0.16; // teeth, claws, appetite
  if (fighter && fighter.franchise === 'Horror') { savagery += 0.08; fury += 0.05; }
  const ov = (fighter && TEMPERAMENT_OVERRIDES[fighter.id]) || {};
  pace = clamp01(pace + (ov.pace || 0));
  fury = clamp01(fury + (ov.fury || 0));
  savagery = clamp01(savagery + (ov.savagery || 0));

  // --- engine-facing shape --------------------------------------
  return Object.freeze({
    id: fighter ? fighter.id : null,
    kind,
    // intensities
    pace,
    fury,
    savagery,
    ferocity: fury, // combo pressure rides the same fire as aggression
    brutality: savagery, // heavy hands + finisher hunger
    // multipliers composed with DIFFICULTY by composeAiProfile()
    attackSpeed: 0.8 + 0.55 * pace, // thinkMs divisor: strike tempo
    aggressionMul: 0.75 + 0.6 * fury, // advance + attack vs reposition
    specialMul: 0.7 + 0.7 * fury, // special usage appetite
    heavyMul: 0.7 + 0.8 * savagery, // heavy-attack share
    retreatMul: 1.25 - 0.75 * fury, // vicious fighters rarely back off
    dashMul: 0.6 + 1.0 * pace, // dash-in appetite from range
    blockMul: 1.1 - 0.3 * fury, // pressure fighters guard less
    reactionMul: 1.15 - 0.45 * pace, // DEFENDER's reactionMs multiplier
    fatalityMul: 0.5 + 1.3 * savagery, // finisher eagerness at FINISH HIM
    finisherPressure: savagery, // bloodlust strength vs a low-health foe
    pressureRange: 2.6 + 1.6 * fury, // metres: inside this, no caution
  });
}

const cache = new Map();

/**
 * Temperament for a fighter, by kombatId OR bridge characterId.
 * Unknown ids get the roster-median default (never null, never
 * throws) — the engines can always fight.
 */
export function temperamentFor(id) {
  const kombatId = resolveKombatId(id);
  if (!kombatId) return deriveTemperament(null, null);
  if (!cache.has(kombatId)) {
    cache.set(kombatId, deriveTemperament(getFighter(kombatId), getLoadout(kombatId)));
  }
  return cache.get(kombatId);
}

/** Temperaments for the whole roster, in roster order. */
export function allTemperaments() {
  return FIGHTERS.map((f) => temperamentFor(f.id));
}

/**
 * Compose a difficulty tier with a fighter's temperament into the
 * concrete AI profile the engines roll against. Probabilities are
 * clamped to [0, 0.97] (a sliver of unpredictability always
 * survives); reactionMs is NOT composed here — reaction belongs to
 * the DEFENDER, and the engines arm it with the defender's own
 * reactionMul at the attack site.
 */
export function composeAiProfile(diff, t) {
  const p = (v) => clamp(v, 0, 0.97);
  return {
    aggression: p(diff.aggression * t.aggressionMul),
    specialChance: p(diff.specialChance * t.specialMul),
    heavyChance: p(diff.heavyChance * t.heavyMul),
    retreatChance: p(diff.retreatChance * t.retreatMul),
    dashChance: p(diff.dashChance * t.dashMul),
    blockChance: p(diff.blockChance * t.blockMul),
    fatalityChance: p((diff.fatalityChance ?? 0) * t.fatalityMul),
    thinkMs: diff.thinkMs / t.attackSpeed,
    speedMul: diff.speedMul, // walk speed stays difficulty's word
  };
}

/**
 * Bloodlust: the effective aggression/heavy pressure of a fighter
 * whose opponent is nearly finished. Returns composed chances
 * nudged by the attacker's finisherPressure, strongest at 0 HP.
 * Pure — the engines call it per think with live health values.
 */
export function bloodlust(profile, t, foeHealthFrac) {
  if (!(foeHealthFrac <= 0.35)) return profile;
  const heat = t.finisherPressure * (0.35 - Math.max(0, foeHealthFrac)) / 0.35;
  return {
    ...profile,
    aggression: clamp(profile.aggression + heat * 0.25, 0, 0.97),
    heavyChance: clamp(profile.heavyChance + heat * 0.2, 0, 0.97),
    specialChance: clamp(profile.specialChance + heat * 0.15, 0, 0.97),
    retreatChance: profile.retreatChance * (1 - heat * 0.7),
  };
}

/**
 * Select-screen readout (1..10 bars, the statBar scale) derived
 * from the SAME intensities the AI consumes — the UI never
 * invents numbers the sim doesn't hold.
 */
export function temperamentBars(id) {
  const t = temperamentFor(id);
  const bar = (v) => Math.round(1 + v * 9);
  return { speed: bar(t.pace), fury: bar(t.fury), brutality: bar(t.savagery) };
}
