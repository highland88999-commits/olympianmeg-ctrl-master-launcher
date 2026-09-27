// stateMachine.js — pure interaction state machine for the Excalibur module.
// No DOM, no three.js: fully unit-testable in Node.
//
// Flow: idle --tap--> approach --tap--> entering --zoomComplete--> inside
//       --beginPull--> pulling --worthiness reaches 1--> champion
// Worthiness builds while the user holds the sword, decays on release;
// if it decays to zero the user is back to `inside`.

export const STATES = Object.freeze({
  IDLE: 'idle',
  APPROACH: 'approach',
  ENTERING: 'entering',
  INSIDE: 'inside',
  PULLING: 'pulling',
  CHAMPION: 'champion',
});

// Seconds of continuous holding to prove worthy; seconds for full decay on release.
export const HOLD_SECONDS = 5.5;
export const DECAY_SECONDS = 8;

export function createMachine() {
  let state = STATES.IDLE;
  let worthiness = 0;

  function set(next) {
    state = next;
    return state;
  }

  return {
    getState: () => state,
    getWorthiness: () => worthiness,

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

    // Fired when the user's pointer lands on the sword.
    beginPull() {
      if (state === STATES.INSIDE) {
        worthiness = 0;
        return set(STATES.PULLING);
      }
      return state;
    },

    // Called every frame while pulling. `holding` = pointer still down on sword.
    // Returns the new state (transitions to champion or back to inside).
    update(dt, holding) {
      if (state !== STATES.PULLING) return state;
      const safeDt = Math.max(0, Math.min(dt, 0.1));
      if (holding) {
        worthiness = Math.min(1, worthiness + safeDt / HOLD_SECONDS);
        if (worthiness >= 1) return set(STATES.CHAMPION);
      } else {
        worthiness = Math.max(0, worthiness - safeDt / DECAY_SECONDS);
        if (worthiness <= 0) return set(STATES.INSIDE);
      }
      return state;
    },

    reset() {
      worthiness = 0;
      return set(STATES.IDLE);
    },
  };
}
