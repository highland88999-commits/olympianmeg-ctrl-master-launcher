// stateMachine.js — pure interaction state machine for the Ice Monster module.
// No DOM, no three.js: fully unit-testable in Node.
//
// Flow: idle --tap--> approach --tap--> entering --zoomComplete--> inside
//       --beginCalm--> calming (hold the behemoth; release keeps progress —
//       it stirs but does not lose your trust)
//       --trust reaches 1--> trusted (the behemoth kneels, tremor stops)
//       --after the trusted moment--> inside (trusted; holding again is a no-op)
//
// This differs from the Ice Dragon module on purpose: there is no wake/flight
// loop here. The payoff is trust — the behemoth slows, its breath calms, the
// ground tremor eases, and it kneels to you.
export const STATES = Object.freeze({
  IDLE: 'idle',
  APPROACH: 'approach',
  ENTERING: 'entering',
  INSIDE: 'inside',
  CALMING: 'calming',
  TRUSTED: 'trusted',
});

// Seconds of continuous holding to earn the behemoth's full trust.
export const CALM_SECONDS = 5.5;

export function createMachine() {
  let state = STATES.IDLE;
  let trust = 0; // 0 = wary, 1 = fully trusts you

  function set(next) {
    state = next;
    return state;
  }

  return {
    getState: () => state,
    getTrust: () => trust,

    // Full-screen tap: advances the cinematic intro.
    tap() {
      if (state === STATES.IDLE) return set(STATES.APPROACH);
      if (state === STATES.APPROACH) return set(STATES.ENTERING);
      return state;
    },

    // Fired by the scene when the approach camera move finishes.
    zoomComplete() {
      if (state === STATES.ENTERING) return set(STATES.INSIDE);
      return state;
    },

    // Fired when the user's pointer lands on the behemoth.
    beginCalm() {
      if (state !== STATES.INSIDE) return state;
      if (trust >= 1) return set(STATES.TRUSTED);
      return set(STATES.CALMING);
    },

    // Called every frame. `holding` = pointer still down on the behemoth.
    update(dt, holding) {
      const safeDt = Math.max(0, Math.min(dt, 0.1));
      if (state === STATES.CALMING) {
        if (holding) {
          trust = Math.min(1, trust + safeDt / CALM_SECONDS);
          if (trust >= 1) return set(STATES.TRUSTED);
        } else {
          // Trust ratchets: the behemoth remembers your patience.
          return set(STATES.INSIDE);
        }
        return state;
      }
      if (state === STATES.TRUSTED) {
        // The behemoth kneels a while, then settles back into the scene,
        // still trusting you.
        return set(STATES.INSIDE);
      }
      return state;
    },

    reset() {
      trust = 0;
      return set(STATES.IDLE);
    },
  };
}
