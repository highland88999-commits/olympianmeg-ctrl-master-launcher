// lib/afterlife/rebirth.js
// THE WHEEL OF REBIRTH (Merlin, Nov 15 ~02:15, green-lit purposes
// list, tranche 1: the design spine) — the rebirth gate.
//
// The sojourn/fade law made visible, and the player's own respawn
// point. No player respawn system exists anywhere in code today
// (only vehicle and creature respawns), so the Wheel introduces
// the first one: ride it once and it remembers you — that wheel is
// your rebirth point from then on. Riding the wheel returns you to
// the world above (the hub).
//
// "Dying/fading returns you here" is the stored fact other systems
// read later: the respawn point is recorded (device-local first,
// server mirror in soul_balances.respawn_realm when the souls
// tables exist) and the ride itself works now. No user-death
// mechanic exists in any realm yet, so there is nothing to return
// FROM yet — the gate is built, the death that uses it comes later
// (flagged, not invented).

// The only realms with a wheel: Naraka and Diyu (their world.js
// REGIONS carry { key: 'wheel', name: 'The Wheel of Rebirth',
// x: 0, z: -230, r: 80 }).
export const WHEEL_REALMS = ['naraka', 'diyu'];
export const WHEEL = { x: 0, z: -230, r: 80 };

// Riding the wheel returns you to the world above (the hub).
export const REBIRTH_DESTINATION = { route: '/', label: 'the world above' };

/** Does this realm have a Wheel of Rebirth? */
export function hasWheel(realmKey) {
  return WHEEL_REALMS.includes(realmKey);
}

/** Is (x, z) standing in the wheel disc? */
export function inWheel(x, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return false;
  return Math.hypot(x - WHEEL.x, z - WHEEL.z) <= WHEEL.r;
}

/** Idempotency key for attuning a rebirth point (one per user+realm). */
export function rebirthAttuneIdemKey(userId, realmKey) {
  return `rebirth:attune:${userId}:${realmKey}`;
}
