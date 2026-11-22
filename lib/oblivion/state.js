// lib/oblivion/state.js — the Jupiter 2 oblivion cycle, pure logic.
//
// Merlin's canon (Nov 19 ~00:16, OVERWRITES all previous oblivion
// rules where they conflict): pulling the J2 lever blows up Earth 1;
// everyone on Earth is pulled to the hub to witness it; when the
// explosion sequence completes, a 72-hour timer appears where Earth
// was; when it runs out, Earth respawns EXACTLY as it was, all saved
// game data preserved. Earth 2 stays live throughout. The lever
// re-locks until Earth returns.
//
// This module holds ONLY pure, node-testable decisions: the cycle's
// phase math and the dragon-shield tier math. Rendering lives in the
// hub (components/hub/OblivionTimerCube.jsx) and the witness overlay
// (components/earth/OblivionCollapse.jsx, reused); server enforcement
// lives in lib/oblivion/events.js + app/api/oblivion/*.
// Nothing here touches the network, the DOM, or Supabase.

import { OBLIVION_WAIT_MS, formatCountdown, remainingMs } from '../earth/oblivion.js';

export { OBLIVION_WAIT_MS, formatCountdown, remainingMs };

/** sessionStorage: the puller / evacuee carries the witness flag to the hub. */
export const OBLIVION_WITNESS_KEY = 'olympus:oblivion-witness:v1';
/** sessionStorage: the collapse cinematic plays once per session. */
export const OBLIVION_COLLAPSE_SEEN_KEY = 'olympus:oblivion-collapse-seen:v1';

/**
 * The cycle's phase at nowMs, from the server event's endsAtMs.
 * armed=false → nothing is happening. armed + now < endsAt → active
 * (Earth is gone, the timer runs). armed + now >= endsAt → complete
 * (Earth is back, exactly as it was). remainingMs never goes below 0.
 */
export function cycleState({ armed, endsAtMs, nowMs = Date.now() }) {
  const a = armed === true;
  const ends = Number(endsAtMs);
  if (!a || !Number.isFinite(ends)) {
    return { armed: false, active: false, complete: false, remainingMs: 0 };
  }
  const left = Math.max(0, ends - nowMs);
  const complete = left <= 0;
  return { armed: true, active: !complete, complete, remainingMs: left };
}

/** True when Earth travel must be refused (the timer is running). */
export function earthTravelBlocked({ armed, endsAtMs, nowMs = Date.now() }) {
  return cycleState({ armed, endsAtMs, nowMs }).active;
}

/**
 * The hub's witness decision, pure: the collapse cinematic plays
 * ONLY when the session carries the witness flag AND the server
 * says the cycle is active. A flag with no active event means the
 * arm did not land — never play the cinematic for an event the
 * server does not have (Nov 21: the phone showed a fake explosion
 * for an event that never existed). A flag with a check error means
 * the server could not be reached — never play, and never clear
 * the flag, because the arm may exist; the next poll re-checks.
 * Returns 'play' | 'not-landed' | 'unconfirmed' | 'none'.
 */
export function witnessDecision({ flag, active, error }) {
  if (!flag) return 'none';
  if (active) return 'play';
  if (error) return 'unconfirmed';
  return 'not-landed';
}

// ── The dragon shield ────────────────────────────────────────────
// Killing a guard dragon (Stormwing or Aureline) on Jupiter 2 drops
// a shield upgrade that CARRIES OVER to Earth 2 (Merlin, Nov 19
// ~00:22). One dragon = one tier; killing BOTH stacks to tier 2.
// Each dragon grants once per user (the server record is per user +
// per dragon); a reborn dragon can be killed by the NEXT user for
// theirs.
//
// On Earth 2 the catch is binary — a predator that catches the
// walker kills them outright (components/earth2/Earth2World.jsx
// killWalker) — so the shield is CHARGES, not an HP pool: one
// charge blocks one catch (the predator is driven off), then it is
// spent. Charges refill to the tier max on arrival + on respawn
// (the J2 pattern: death refills the bought shield to its tier max).
// Tier 0 = no shield. No second currency, no shop around it.

/** The two guard dragons, by their server key. */
export const DRAGON_SHIELD_DRAGONS = Object.freeze(['stormwing', 'aureline']);

/** True when `dragon` is one of the two guard dragons. */
export function isDragonShieldDragon(dragon) {
  return DRAGON_SHIELD_DRAGONS.includes(String(dragon || ''));
}

/**
 * The shield tier for a user's kills: the count of DISTINCT guard
 * dragons killed (0..2). Unknown keys never count.
 */
export function dragonShieldTierFor(kills) {
  const seen = new Set();
  for (const k of Array.isArray(kills) ? kills : []) {
    if (isDragonShieldDragon(k)) seen.add(String(k));
  }
  return seen.size;
}

/** Charges the tier grants: one catch blocked per tier. */
export function dragonShieldChargesFor(tier) {
  return Math.max(0, Math.min(DRAGON_SHIELD_DRAGONS.length, Math.floor(Number(tier) || 0)));
}
