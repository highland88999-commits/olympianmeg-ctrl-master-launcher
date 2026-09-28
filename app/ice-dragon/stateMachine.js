// stateMachine.js — pure interaction state machine for the Ice Dragon module.
// No DOM, no three.js: fully unit-testable in Node.
//
// Flow: idle --tap--> approach --tap--> entering --zoomComplete--> inside
//       --beginWake--> waking (hold the dragon; release keeps progress —
//       the dragon slowly stirs and does not fall back asleep)
//       --wakefulness reaches 1--> flying (a short loop around the glacier)
//       --flight completes--> inside (awake; holding again launches another flight)
export const STATES = Object.freeze({
  IDLE: 'idle',
  APPROACH: 'approach',
  ENTERING: 'entering',
  INSIDE: 'inside',
  WAKING: 'waking',
  FLYING: 'flying',
});

// Seconds of continuous holding to wake the dragon fully.
export const WAKE_SECONDS = 5.5;
// Seconds the flight loop lasts before the dragon settles back down.
export const FLIGHT_SECONDS = 8.0;

export function createMachine() {
  let state = STATES.IDLE;
  let wakefulness = 0; // 0 = fast asleep, 1 = fully awake
  let flightProgress = 0; // 0..1 while flying
  let flightElapsed = 0;

  function set(next) {
    state = next;
    return state;
  }

  return {
    getState: () => state,
    getWakefulness: () => wakefulness,
    getFlightProgress: () => flightProgress,

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

    // Fired when the user's pointer lands on the dragon.
    beginWake() {
      if (state !== STATES.INSIDE) return state;
      if (wakefulness >= 1) {
        // Already awake: another hold sends the dragon on a flight.
        flightProgress = 0;
        flightElapsed = 0;
        return set(STATES.FLYING);
      }
      return set(STATES.WAKING);
    },

    // Called every frame. `holding` = pointer still down on the dragon.
    update(dt, holding) {
      const safeDt = Math.max(0, Math.min(dt, 0.1));
      if (state === STATES.WAKING) {
        if (holding) {
          wakefulness = Math.min(1, wakefulness + safeDt / WAKE_SECONDS);
          if (wakefulness >= 1) {
            flightProgress = 0;
            flightElapsed = 0;
            return set(STATES.FLYING);
          }
        } else {
          // The dragon stirs but does not fall back asleep: progress ratchets.
          return set(STATES.INSIDE);
        }
        return state;
      }
      if (state === STATES.FLYING) {
        flightElapsed += safeDt;
        flightProgress = Math.min(1, flightElapsed / FLIGHT_SECONDS);
        if (flightProgress >= 1) {
          flightElapsed = 0;
          flightProgress = 0;
          return set(STATES.INSIDE);
        }
        return state;
      }
      return state;
    },

    reset() {
      wakefulness = 0;
      flightProgress = 0;
      flightElapsed = 0;
      return set(STATES.IDLE);
    },
  };
}
