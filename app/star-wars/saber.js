/*
 * STAR WARS — lightsaber state machine (pure: no three, no DOM, no
 * audio — characters.js renders and sounds whatever this decides).
 *
 * Two nested proximity laws, both driven by the observer distance:
 *
 * GRIP — where the hilt lives (the holster law, Merlin 2026-10-23:
 * "they should be holstered when they aren't using them"):
 *   holstered -> drawing -> hand -> holstering -> holstered
 *   Beyond SABER_DRAW_DIST (24 m) the hilt sits at the BELT, blade
 *   dark. Inside 24 m the character DRAWS — the hilt travels from
 *   the belt anchor to the hand anchor over SABER_DRAW_S. When the
 *   blade has gone dark and the observer is back beyond 24 m, the
 *   hilt re-holsters over SABER_HOLSTER_S. A draw reversed mid-way
 *   (observer steps back out) returns from the current grip travel —
 *   nothing teleports.
 *
 * BLADE — only ever extends from the hand:
 *   retracted -> igniting -> lit -> retracting -> retracted
 *   Ignition has HYSTERESIS so a player hovering at the edge never
 *   makes the blade flicker:
 *   - at distance <= SABER_IGNITE_DIST (12 m) the blade ignites;
 *   - it stays lit until the player leaves beyond SABER_RETRACT_DIST
 *     (18 m), then retracts.
 *   Extension progress p runs linearly in time (IGNITE_S to full,
 *   RETRACT_S to dark); the RENDERED length applies saberEase (an
 *   easeOutCubic) to p — the film behaviour. grip01() renders the
 *   same easing over the belt->hand travel.
 *
 * update(dt, dist) returns the events fired this tick, in order:
 * grip: 'draw' (draw started), 'inhand' (hilt reached the hand),
 * 'holster' (hilt back at the belt); blade: 'ignite', 'lit',
 * 'retract', 'dark'.
 */

export const SABER_IGNITE_DIST = 12;
export const SABER_RETRACT_DIST = 18;
export const SABER_DRAW_DIST = 24;
export const SABER_IGNITE_S = 0.18;
export const SABER_RETRACT_S = 0.14;
export const SABER_DRAW_S = 0.28;
export const SABER_HOLSTER_S = 0.24;

/* easeOutCubic over [0,1] — the blade's rendered length curve. */
export function saberEase(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

export function createSaberState() {
  let state = 'retracted';
  let p = 0; // linear blade extension progress, 0..1
  let grip = 'holstered';
  let g = 0; // linear grip travel, 0 = belt, 1 = hand

  return {
    get state() { return state; },
    get progress() { return p; },
    get grip() { return grip; },
    get gripProgress() { return g; },
    /* Rendered blade length as a fraction of full length, 0..1. */
    blade01() { return saberEase(p); },
    /* Rendered hilt travel belt(0) -> hand(1), eased like the blade. */
    grip01() { return saberEase(g); },
    update(dt, dist) {
      const events = [];
      const d = typeof dist === 'number' && Number.isFinite(dist) ? dist : Infinity;
      const step = Math.max(0, dt || 0);

      /* ---- grip law ---- */
      if (d <= SABER_DRAW_DIST) {
        if (grip === 'holstered' || grip === 'holstering') {
          grip = 'drawing';
          events.push('draw');
        }
      } else if (grip === 'drawing') {
        grip = 'holstering'; // walked away mid-draw: back to the belt
      } else if (grip === 'hand' && state === 'retracted') {
        grip = 'holstering'; // blade dark, observer gone: re-holster
      }
      /* The blade advances only with the time the grip did NOT
       * consume this tick: a draw that completes mid-tick hands
       * its leftover time to the ignition, never the whole tick. */
      let bladeStep = step;
      if (grip === 'drawing') {
        const need = (1 - g) * SABER_DRAW_S;
        g += step / SABER_DRAW_S;
        if (g >= 1) {
          g = 1; grip = 'hand'; events.push('inhand');
          bladeStep = Math.max(0, step - need);
        } else {
          bladeStep = 0;
        }
      } else if (grip === 'holstering') {
        g -= step / SABER_HOLSTER_S;
        if (g <= 0) { g = 0; grip = 'holstered'; events.push('holster'); }
      }

      /* ---- blade law (a blade only ever leaves the hand) ---- */
      if ((state === 'retracted' || state === 'retracting') && grip === 'hand' && d <= SABER_IGNITE_DIST) {
        state = 'igniting';
        events.push('ignite');
      } else if ((state === 'lit' || state === 'igniting') && d > SABER_RETRACT_DIST) {
        state = 'retracting';
        events.push('retract');
      }

      if (state === 'igniting') {
        p += bladeStep / SABER_IGNITE_S;
        if (p >= 1) { p = 1; state = 'lit'; events.push('lit'); }
      } else if (state === 'retracting') {
        p -= bladeStep / SABER_RETRACT_S;
        if (p <= 0) { p = 0; state = 'retracted'; events.push('dark'); }
      }
      return events;
    },
  };
}
