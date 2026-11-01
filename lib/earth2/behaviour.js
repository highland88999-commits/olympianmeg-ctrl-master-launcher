// lib/earth2/behaviour.js
// EARTH 2 — RESTLESS ANIMALS (Living Planet Wave A, 2026-10-23).
// Merlin's verdict on his first long walks: the animals READ AS
// STATUES at a glance. The idle life in bones.js breathes and
// glances, but nothing a creature does can be read from 20 m.
// This module is the fix: a seeded per-creature BEHAVIOUR STATE
// MACHINE whose states are big, legible acts —
//
//   GRAZE   herbivores: repeated deep head-to-ground dips
//   DIG     forage: head scrape arcs, forelimbs scraping
//   DRINK   walk to the shoreline, head to the waterline, hold
//   ALERT   head high, scanning — something caught its ear
//   WANDER  the roam circuits the world already walks
//   SLEEP   settled, head down, slow deep breathing — mostly
//           at local night (flyers roost, swimmers drift slow)
//
// — plus the predator ecology Merlin ordered the same morning:
// "Predators hunt, walk when full, eat dinosaurs they kill…
// drink water, etc." A predator's hunger rises over minutes;
// HUNGRY → STALK (a purposeful walk at chosen prey) → CHASE
// (both run; the prey FLEES; chases are losable — a hunt that
// always succeeds empties the world) → KILL routes through
// lib/earth2/lifecycle.js (the prey respawns far away, so the
// population never depletes) → EAT (tearing dips at the
// carcass) → SATED ("walk when full": slow roaming only) →
// thirst and hunger rebuild → the wheel turns again.
//
// HARD RULE — REVERSED (Merlin, 2026-10-31, "chomp chomp"): the walker
// IS prey now. Predators target, chase and catch the player — the user
// exists as prey. pickPreyTarget accepts a walker record ONLY when the
// scene marks it vulnerable (walkerImmune === false); the scene grants
// immunity while the walker builds or stands on their own parcel.
// A walker record that claims immunity (or omits the flag) is refused
// outright — no hunt state may ever select a protected player.
// The guardian carnivore (behaviourCaps.guardian) never hunts via
// pickPreyTarget at all: it hunts PREDATORS through pickGuardianTarget.
//
// Pure arithmetic throughout: no three.js, no DOM, no
// Math.random — every creature's rng is a seeded mulberry32
// carried in its state, so a creature lives the same life for
// every visitor. Movement helpers are shared math; the scene
// (Earth2World.jsx) executes the modes bones can carry and
// reports honest limits for the ones they can't.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Seeded rng (carried in the behaviour state) ───────────────
export function rngNext(beh) {
  let a = (beh.rngState | 0) + 0x6d2b79f5 | 0;
  beh.rngState = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function seedFor(slug, copy) {
  let h = 20261023;
  const s = `${slug}#${copy || 0}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// ── Capabilities, from the manifest's own data ────────────────
// diet/social/posture live on the manifest entries
// (lib/earth2/models.js) — this reads them, never a second list.
// The one exception is locomotion: Diplodocus's bind pose is
// REARING (measured, models.js header) — it is idle-only by
// rig truth, so it never walks anywhere, not even to drink.
const NO_LOCOMOTION = new Set(['diplodocus']);
const MIN_PREDATOR_SCALE_M = 2; // under this, a "carnivore" is a compy, not a hunter

export function behaviourCaps(entry) {
  if (!entry) {
    return { land: false, grazer: false, digger: false, drinker: false, predator: false, prey: false, locomotion: false };
  }
  const land = entry.kind === 'dinosaur';
  const carnivore = entry.diet === 'carnivore';
  return {
    land,
    grazer: land && entry.diet === 'herbivore',
    digger: land && (entry.diet === 'herbivore' || entry.diet === 'omnivore'),
    drinker: land,
    predator: land && carnivore && (entry.scaleM || 0) >= MIN_PREDATOR_SCALE_M,
    prey: land && (entry.diet === 'herbivore' || entry.diet === 'omnivore'),
    // The guardian (Merlin, 2026-10-31): one carnivore — the
    // Spinosaurus — hunts predator dinosaurs and defends users
    // instead of hunting prey. Flagged on the manifest entry.
    guardian: land && carnivore && entry.guardian === true,
    locomotion: land && !NO_LOCOMOTION.has(entry.slug),
  };
}

// ── The machine ───────────────────────────────────────────────
export const BEHAVIOUR_MODES = Object.freeze([
  'idle', 'graze', 'dig', 'alert', 'wander', 'drink-go', 'drink',
  'sleep', 'stalk', 'chase', 'flee', 'eat', 'sated', 'winded',
]);

// Modes the SCENE owns end-to-end (it moves the animal and ends
// the mode on an event, not a timer): the chooser never picks
// them and the timer never expires them.
const SCENE_MODES = new Set(['stalk', 'chase', 'flee']);

// How fast needs rebuild (seconds 0 → 1). Hunger is the
// predator's clock; thirst is everyone's.
export const HUNGER_RISE_S = 210;
export const THIRST_RISE_S = 170;

export function createBehaviour(seed, entry) {
  const beh = {
    rngState: (seed >>> 0) || 1,
    mode: 'idle',
    t: 0,
    dur: 3,
    hunger: 0,
    thirst: 0,
    huntCooldown: 0,
  };
  const caps = behaviourCaps(entry);
  beh.hunger = caps.predator ? 0.3 + rngNext(beh) * 0.3 : 0;
  beh.thirst = caps.drinker ? rngNext(beh) * 0.5 : 0;
  beh.dur = 2 + rngNext(beh) * 4;
  return beh;
}

/** Force a mode (scene events: a stalk begins, a chase ends, a
 *  drink is reached). dur seconds, or Infinity for scene-ended
 *  modes. */
export function setBehaviourMode(beh, mode, dur) {
  beh.mode = mode;
  beh.t = 0;
  beh.dur = Number.isFinite(dur) ? Math.max(0.1, dur) : Infinity;
  return beh;
}

const DUR = {
  idle: [3, 7], graze: [9, 18], dig: [6, 12], alert: [3, 6],
  wander: [10, 22], sleep: [24, 48], drink: [8, 14],
  eat: [16, 30], sated: [26, 46], winded: [5, 8],
};
const durFor = (beh, mode) => {
  const [lo, hi] = DUR[mode] || [4, 8];
  return lo + rngNext(beh) * (hi - lo);
};

/**
 * Choose the creature's next act. ctx: { isNight, waterNear } —
 * waterNear means a shoreline point exists within the scene's
 * drink range, so 'drink-go' is only chosen when the walk is
 * actually possible. Sleep rules the night; thirst outranks
 * appetite's lesser acts; a full predator does not hunt (the
 * scene enforces that separately — sated is chosen here right
 * after an eat, hunger already reset by the scene).
 */
export function chooseBehaviour(beh, caps, ctx) {
  const night = !!(ctx && ctx.isNight);
  if (night && rngNext(beh) < 0.8) {
    return setBehaviourMode(beh, 'sleep', durFor(beh, 'sleep'));
  }
  if (caps.drinker && beh.thirst >= 0.6 && ctx && ctx.waterNear && caps.locomotion) {
    return setBehaviourMode(beh, 'drink-go', Infinity);
  }
  // The weighted day menu.
  const menu = [['idle', 10], ['alert', 10], ['wander', 16]];
  if (caps.grazer) menu.push(['graze', 30]);
  if (caps.digger) menu.push(['dig', 18]);
  let total = 0;
  for (const [, w] of menu) total += w;
  let roll = rngNext(beh) * total;
  for (const [mode, w] of menu) {
    roll -= w;
    if (roll <= 0) return setBehaviourMode(beh, mode, durFor(beh, mode));
  }
  return setBehaviourMode(beh, 'idle', durFor(beh, 'idle'));
}

/**
 * Advance the machine's clocks by dt seconds. Needs rebuild;
 * a sleeping creature whose night ends wakes; a timed mode that
 * expires chooses its successor. Scene modes (stalk/chase/flee)
 * and 'drink-go' hold until the scene ends them. Returns beh.
 */
export function stepBehaviour(beh, caps, ctx, dt) {
  const step = Math.max(0, Number(dt) || 0);
  if (caps.predator) beh.hunger = clamp(beh.hunger + step / HUNGER_RISE_S, 0, 1);
  if (caps.drinker) beh.thirst = clamp(beh.thirst + step / THIRST_RISE_S, 0, 1);
  beh.huntCooldown = Math.max(0, (beh.huntCooldown || 0) - step);
  if (beh.mode === 'sleep' && !(ctx && ctx.isNight)) {
    // Dawn breaks the sleep, whatever the timer says.
    return chooseBehaviour(beh, caps, ctx);
  }
  if (SCENE_MODES.has(beh.mode) || beh.mode === 'drink-go') return beh;
  beh.t += step;
  if (beh.t >= beh.dur) {
    // A finished drink slakes the thirst that sent the animal
    // to the water; a finished eat leaves a FULL predator —
    // Merlin's "walk when full": sated roaming, no hunting,
    // until hunger rebuilds (the scene gates stalks on hunger).
    if (beh.mode === 'drink') beh.thirst = 0.05;
    if (beh.mode === 'eat') return setBehaviourMode(beh, 'sated', durFor(beh, 'sated'));
    return chooseBehaviour(beh, caps, ctx);
  }
  return beh;
}

// ── Poses: what a mode looks like ─────────────────────────────
/**
 * The pose numbers for a mode at time t (seconds in mode), as
 * amplitudes the scene maps onto the rig:
 *   dip       head/neck pitch down (radians of total bend,
 *             distributed neck→head) — graze and drink are DEEP
 *             and repeated/sustained on purpose: this is the
 *             number that makes the act readable at 20 m
 *   yawAmp    head scanning amplitude (alert scans widest)
 *   settle    0..1 body settle (sleep lowers the whole animal)
 *   breathMul rate multiplier on the idle breath
 *   breathAmp amplitude multiplier on the idle breath
 *   scrape    0..1 forelimb scrape oscillation (dig)
 */
export function behaviourPose(mode, t) {
  switch (mode) {
    case 'graze': {
      // A dip every ~4.5 s: down, two nibbles, up, swallow, down.
      const cyc = (t % 4.5) / 4.5;
      const dip = cyc < 0.3 ? (cyc / 0.3) : cyc < 0.75 ? 1 : 1 - (cyc - 0.75) / 0.25;
      const nibble = cyc >= 0.3 && cyc < 0.75 ? Math.sin(t * 9) * 0.05 : 0;
      return { dip: 0.62 * dip + nibble, yawAmp: 0.05, settle: 0, breathMul: 1, breathAmp: 1, scrape: 0 };
    }
    case 'dig':
      return {
        dip: 0.46 + Math.sin(t * 1.9) * 0.14,
        yawAmp: 0.10, settle: 0.06, breathMul: 1.15, breathAmp: 1.1,
        scrape: 0.5 + 0.5 * Math.sin(t * 3.4),
      };
    case 'drink': {
      // Head at the waterline, held, with a swallow lift every
      // few seconds — the shoreline read Merlin asked for.
      const lift = (t % 5) > 4.2 ? Math.sin(((t % 5) - 4.2) / 0.8 * Math.PI) * 0.22 : 0;
      return { dip: 0.80 - lift, yawAmp: 0.02, settle: 0.03, breathMul: 0.9, breathAmp: 1, scrape: 0 };
    }
    case 'alert':
      return { dip: -0.10, yawAmp: 0.5, settle: 0, breathMul: 1.1, breathAmp: 0.9, scrape: 0 };
    case 'sleep':
      return { dip: 0.36, yawAmp: 0, settle: 1, breathMul: 0.55, breathAmp: 1.9, scrape: 0 };
    case 'eat': {
      // Tearing: sharp repeated yanks at the carcass.
      const yank = Math.pow(Math.max(0, Math.sin(t * 2.2)), 3);
      return { dip: 0.30 + 0.38 * yank, yawAmp: 0.06, settle: 0.08, breathMul: 1.2, breathAmp: 1.1, scrape: 0 };
    }
    case 'stalk':
      return { dip: 0.10, yawAmp: 0.04, settle: 0.04, breathMul: 0.9, breathAmp: 0.8, scrape: 0 };
    case 'chase':
    case 'flee':
      return { dip: 0.04, yawAmp: 0.02, settle: 0, breathMul: 1.7, breathAmp: 1.2, scrape: 0 };
    case 'winded':
      return { dip: 0.16, yawAmp: 0.08, settle: 0.05, breathMul: 2.3, breathAmp: 1.7, scrape: 0 };
    case 'sated':
      return { dip: 0.05, yawAmp: 0.14, settle: 0.02, breathMul: 0.85, breathAmp: 1.05, scrape: 0 };
    default: // idle, wander, drink-go
      return { dip: 0, yawAmp: 0.16, settle: 0, breathMul: 1, breathAmp: 1, scrape: 0 };
  }
}

// ── Movement math (shared, pure) ──────────────────────────────
/** One step toward a target at a speed. Returns the new
 *  position, the heading of travel (the world's atan2(x, z)
 *  convention), and whether the step arrived. */
export function stepToward(pos, target, speed, dt) {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = Math.max(0, speed) * Math.max(0, dt);
  if (dist <= Math.max(step, 0.05)) {
    return { x: target.x, z: target.z, heading: Math.atan2(dx, dz), arrived: true, dist };
  }
  const f = step / dist;
  return { x: pos.x + dx * f, z: pos.z + dz * f, heading: Math.atan2(dx, dz), arrived: false, dist };
}

/** The point a fleeing animal runs TO: away from the predator,
 *  biased back toward its home anchor — panic with a compass. */
export function fleePoint(preyPos, predPos, anchor, dist = 26) {
  let ax = preyPos.x - predPos.x;
  let az = preyPos.z - predPos.z;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;
  let hx = anchor.x - preyPos.x;
  let hz = anchor.z - preyPos.z;
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl; hz /= hl;
  let dx = ax * 0.78 + hx * 0.45;
  let dz = az * 0.78 + hz * 0.45;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  return { x: preyPos.x + dx * dist, z: preyPos.z + dz * dist };
}

/** A ground speed (m/s) for a creature of this size walking
 *  with intent — to water, or home from it. */
export function intentSpeed(entry) {
  return clamp(0.5 * Math.sqrt(Math.max(0.2, entry && entry.scaleM || 1)), 0.45, 2.4);
}

// ── The hunt ──────────────────────────────────────────────────
// The hunt's shape: STALK inside 140 m, CHASE inside the
// trigger distance, KILL at contact. The chase's verdict is
// rolled when it begins (seeded, so a hunt plays out the same
// for every visitor): caught ~45% of the time. A caught prey
// is a little slower than its pursuer for the chase's length;
// an escaping one is a touch faster and breaks away when the
// clock runs out. Either way the chase is BOUNDED — nothing
// runs forever.
export const HUNT = Object.freeze({
  stalkRangeM: 140,
  chaseTriggerM: 20,
  killRangeM: 3.2,
  // Provocation (Merlin, 2026-10-31): a vulnerable walker inside
  // this radius gets a reaction regardless of hunger — walking up
  // to a predator's face is an invitation. Wakes sleepers.
  provokeM: 18,
  caughtChance: 0.45,
  chaseSeconds: [5, 9.5],
  caughtSpeedFactor: 1.06,
  escapeSpeedFactor: 0.96,
  fleeSpeedFactor: 2.1, // prey run speed = intentSpeed × this
  stalkSpeedFactor: 1.35, // predator stalk = intentSpeed × this
  hungerThreshold: 0.72,
  postChaseCooldownS: 25,
});

/** Roll a chase's verdict from the predator's rng. */
export function rollChase(beh) {
  const caught = rngNext(beh) < HUNT.caughtChance;
  const durationS = HUNT.chaseSeconds[0] + rngNext(beh) * (HUNT.chaseSeconds[1] - HUNT.chaseSeconds[0]);
  return {
    caught,
    durationS,
    speedFactor: caught ? HUNT.caughtSpeedFactor : HUNT.escapeSpeedFactor,
  };
}

/**
 * Choose a predator's prey from scene records. A creature record is
 * eligible ONLY when the scene marked it a creature
 * (creature === true) AND a prey animal (prey === true), it is
 * alive, it is not the predator itself, and it stands within
 * range. THE WALKER IS PREY (Merlin, 2026-10-31 — the old
 * immunity was reversed): a walker record (isWalker === true) is
 * eligible when the scene marks it vulnerable
 * (walkerImmune === false) and it is alive. A walker record that
 * is immune — or omits the flag — is refused outright: immunity
 * (building, or standing on one's own parcel) is decided by the
 * scene, and no hunt state may ever select a protected player.
 * Guardians never call this function; they hunt via
 * pickGuardianTarget.
 */
export function pickPreyTarget(predator, creatures, rangeM = HUNT.stalkRangeM) {
  if (!predator) return null;
  let best = null;
  let bestD = rangeM;
  for (const c of Array.isArray(creatures) ? creatures : []) {
    if (!c) continue;
    if (c.isWalker) {
      // The player, as prey: vulnerable only when the scene says so.
      if (c.walkerImmune !== false) continue;
      if (c.alive === false) continue;
    } else {
      if (c.creature !== true || c.prey !== true) continue;
      if (c.alive === false || c.id === predator.id) continue;
    }
    const d = Math.hypot(c.x - predator.x, c.z - predator.z);
    if (d <= bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Choose a guardian carnivore's target (Merlin, 2026-10-31): the
 * guardian hunts PREDATOR dinosaurs, never prey creatures and
 * never the walker. Eligible records are living predator
 * creatures (predator === true) within range that are not the
 * guardian itself and not fellow guardians. DEFENSE FIRST: a
 * predator currently hunting the walker (huntingWalker === true)
 * outranks every other target — the guardian answers the user's
 * danger before its own hunger. Ties break by distance.
 */
export function pickGuardianTarget(guardian, creatures, rangeM = HUNT.stalkRangeM) {
  if (!guardian) return null;
  let defend = null;
  let defendD = rangeM;
  let best = null;
  let bestD = rangeM;
  for (const c of Array.isArray(creatures) ? creatures : []) {
    if (!c || c.isWalker) continue; // the guardian never hunts the user
    if (c.predator !== true) continue;
    if (c.guardian === true) continue; // guardians don't hunt guardians
    if (c.alive === false || c.id === guardian.id) continue;
    const d = Math.hypot(c.x - guardian.x, c.z - guardian.z);
    if (d > rangeM) continue;
    if (c.huntingWalker === true) {
      if (d <= defendD) { defendD = d; defend = c; }
    } else if (d <= bestD) { bestD = d; best = c; }
  }
  return defend || best;
}
