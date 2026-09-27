// stateMachine.js — pure interaction state machine for the Guillotine module.
// No DOM, no three.js: fully unit-testable in Node.
//
// Flow: idle --tap--> approach --tap--> entering --zoomComplete--> inside
//       --beginRaise--> raising (hold winch; release ratchets the blade in
//       place) --lift reaches 1--> ready --dropBlade--> dropping (slow-mo
//       fall) --drop completes--> split --timer elapses--> inside (fresh log)
export const STATES = Object.freeze({
  IDLE: 'idle',
  APPROACH: 'approach',
  ENTERING: 'entering',
  INSIDE: 'inside',
  RAISING: 'raising',
  READY: 'ready',
  DROPPING: 'dropping',
  SPLIT: 'split',
});

// Seconds of continuous holding to winch the blade fully up.
export const RAISE_SECONDS = 4.0;
// Slow-motion drop duration (dramatic, but readable).
export const DROP_SECONDS = 1.1;
// Seconds the split log rests before a fresh log is set on the stand.
export const SPLIT_SECONDS = 2.5;

export function createMachine() {
  let state = STATES.IDLE;
  let lift = 0; // 0 = blade down, 1 = blade locked at top
  let dropProgress = 0; // 0..1 while dropping
  let splitTimer = 0;

  function set(next) {
    state = next;
    return state;
  }

  return {
    getState: () => state,
    getLift: () => lift,
    getDropProgress: () => dropProgress,

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

    // Fired when the user's pointer lands on the winch wheel.
    beginRaise() {
      if (state === STATES.INSIDE && lift < 1) return set(STATES.RAISING);
      return state;
    },

    // Fired when the user taps the raised blade (or the Drop button).
    dropBlade() {
      if (state === STATES.READY) {
        dropProgress = 0;
        return set(STATES.DROPPING);
      }
      return state;
    },

    // Called every frame. `holding` = pointer still down on the winch.
    update(dt, holding) {
      const safeDt = Math.max(0, Math.min(dt, 0.1));
      if (state === STATES.RAISING) {
        if (holding) {
          lift = Math.min(1, lift + safeDt / RAISE_SECONDS);
          if (lift >= 1) return set(STATES.READY);
        } else {
          // The winch ratchets: release early and the blade stays put.
          return set(STATES.INSIDE);
        }
        return state;
      }
      if (state === STATES.DROPPING) {
        dropProgress = Math.min(1, dropProgress + safeDt / DROP_SECONDS);
        if (dropProgress >= 1) {
          splitTimer = 0;
          return set(STATES.SPLIT);
        }
        return state;
      }
      if (state === STATES.SPLIT) {
        splitTimer += safeDt;
        if (splitTimer >= SPLIT_SECONDS) {
          lift = 0;
          dropProgress = 0;
          return set(STATES.INSIDE);
        }
        return state;
      }
      return state;
    },

    reset() {
      lift = 0;
      dropProgress = 0;
      splitTimer = 0;
      return set(STATES.IDLE);
    },
  };
}
