/*
 * STAR WARS — lightsaber state machine (pure: no three, no DOM, no
 * audio — characters.js renders and sounds whatever this decides).
 *
 * A saber lives in one of four states:
 *   retracted -> igniting -> lit -> retracting -> retracted
 *
 * Ignition is proximity-driven with HYSTERESIS so a player hovering
 * at the edge never makes the blade flicker:
 *   - at distance <= SABER_IGNITE_DIST (12 m) the blade ignites;
 *   - it stays lit until the player leaves beyond SABER_RETRACT_DIST
 *     (18 m), then retracts.
 * Extension progress p runs linearly in time (IGNITE_S to full,
 * RETRACT_S to dark); the RENDERED length applies saberEase (an
 * easeOutCubic) to p, so ignition snaps out fast and settles, and
 * retraction holds its length then collapses — the film behaviour.
 *
 * update(dt, dist) returns the events fired this tick, in order:
 * 'ignite' (extension started), 'lit' (fully extended), 'retract'
 * (retraction started), 'dark' (fully retracted). A mid-ignite
 * reversal (player backs past 18 m while the blade is still coming
 * out) flips straight to retracting from the current p, and vice
 * versa — the blade never teleports.
 */

export const SABER_IGNITE_DIST = 12;
export const SABER_RETRACT_DIST = 18;
export const SABER_IGNITE_S = 0.18;
export const SABER_RETRACT_S = 0.14;

/* easeOutCubic over [0,1] — the blade's rendered length curve. */
export function saberEase(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

export function createSaberState() {
  let state = 'retracted';
  let p = 0; // linear extension progress, 0..1

  return {
    get state() { return state; },
    get progress() { return p; },
    /* Rendered blade length as a fraction of full length, 0..1. */
    blade01() { return saberEase(p); },
    update(dt, dist) {
      const events = [];
      const d = typeof dist === 'number' && Number.isFinite(dist) ? dist : Infinity;
      const step = Math.max(0, dt || 0);

      if ((state === 'retracted' || state === 'retracting') && d <= SABER_IGNITE_DIST) {
        state = 'igniting';
        events.push('ignite');
      } else if ((state === 'lit' || state === 'igniting') && d > SABER_RETRACT_DIST) {
        state = 'retracting';
        events.push('retract');
      }

      if (state === 'igniting') {
        p += step / SABER_IGNITE_S;
        if (p >= 1) { p = 1; state = 'lit'; events.push('lit'); }
      } else if (state === 'retracting') {
        p -= step / SABER_RETRACT_S;
        if (p <= 0) { p = 0; state = 'retracted'; events.push('dark'); }
      }
      return events;
    },
  };
}
