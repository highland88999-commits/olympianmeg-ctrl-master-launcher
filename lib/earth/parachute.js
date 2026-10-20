// lib/earth/parachute.js — shrink/grow, reanimate, climb state
// for the hub Earth street system.
//
// Pure state + math, no DOM, no THREE. The scene layer
// (EarthFlightController / EarthWalker / NexusEarth) reads and writes
// these singletons; the geometry stays in the components.
//
// The model (Ant-Man):
// - SHRINK: user taps a tile → character starts at normal street
//   size (1x) and shrinks to micro size (0.00001x) during the ~3s descent
//   INTO the tile. The world lives inside the tiles — at micro scale
//   the terrain becomes a vast landscape. The camera scales in lockstep
//   so framing stays consistent.
// - REANIMATE: user hits the button → character grows from 0.00001x back to
//   1x (normal size) at their current lat/lon, camera scaling up with them.
// - CLIMB: ladders and monument elevators move the walker vertically.
//   climbAltM is the current altitude in metres above the surface.

/** Normal street-level scale (character multiplier). */
export const PARACHUTE_START_SCALE = 1;
/** Micro scale inside the tile world (Ant-Man). */
export const PARACHUTE_END_SCALE = 0.00001;
/** Descent duration, seconds. Matches the street dive camera. */
export const PARACHUTE_DURATION = 3.2;

/** Parachute/reanimate animation state. */
export const parachuteState = {
  mode: 'idle', // 'idle' | 'diving' | 'reanimating'
  t: 0, // 0..1 progress
  scale: 1, // current character scale multiplier
};

/** Climb state for ladders and monument elevators. */
export const climbState = {
  active: false,
  t: 0, // 0..1 progress
  dur: 2.0, // seconds
  fromAltM: 0,
  toAltM: 0,
  altM: 0, // current altitude in metres above surface
};

/** Bike state for the summonable TRON bike. */
export const bikeState = {
  summoned: false,
  mounted: false,
  lat: 0,
  lon: 0,
  altM: 1.2, // hover height in metres
  yawDeg: 0,
  speed: 0,
};

function easeInOutCubic(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Scale during a shrink at progress k (0..1): 1 → 0.00001, exponential feel. */
export function diveScaleAt(k) {
  const e = easeInOutCubic(Math.max(0, Math.min(1, k)));
  // 1 * (0.00001)^e: starts at 1, ends at 0.00001, "infinitely smaller" feel
  return PARACHUTE_START_SCALE * Math.pow(PARACHUTE_END_SCALE / PARACHUTE_START_SCALE, e);
}

/** Scale during reanimate at progress k (0..1): 0.00001 → 1 (grow back to normal). */
export function reanimateScaleAt(k) {
  const e = easeInOutCubic(Math.max(0, Math.min(1, k)));
  // 0.00001 * (1/0.00001)^e: starts at 0.00001, ends at 1
  return PARACHUTE_END_SCALE * Math.pow(PARACHUTE_START_SCALE / PARACHUTE_END_SCALE, e);
}

export function beginParachuteDive() {
  parachuteState.mode = 'diving';
  parachuteState.t = 0;
  parachuteState.scale = PARACHUTE_START_SCALE;
  // Reset climb when parachuting to a new spot
  climbState.active = false;
  climbState.altM = 0;
  climbState.t = 0;
  return parachuteState;
}

export function beginReanimate() {
  if (parachuteState.scale > 0.9) return parachuteState; // already normal size
  parachuteState.mode = 'reanimating';
  parachuteState.t = 0;
  return parachuteState;
}

/** Advance the parachute/reanimate animation. Returns { done, scale }. */
export function stepParachute(dt, dur = PARACHUTE_DURATION) {
  const st = parachuteState;
  if (st.mode !== 'diving' && st.mode !== 'reanimating') {
    return { done: true, scale: st.scale };
  }
  st.t = Math.min(1, st.t + dt / dur);
  if (st.mode === 'diving') {
    st.scale = diveScaleAt(st.t);
  } else {
    st.scale = reanimateScaleAt(st.t);
  }
  const done = st.t >= 1;
  if (done) {
    // Snap to exact endpoints: 0.00001 after shrinking, 1 after reanimating
    const wasDiving = st.mode === 'diving';
    st.mode = 'idle';
    st.scale = wasDiving ? PARACHUTE_END_SCALE : PARACHUTE_START_SCALE;
  }
  return { done, scale: st.scale };
}

export function resetParachute() {
  parachuteState.mode = 'idle';
  parachuteState.t = 0;
  parachuteState.scale = 1;
  return parachuteState;
}

/** Start a climb animation from current altitude to target metres. */
export function beginClimb(toAltM, dur = 2.0) {
  climbState.active = true;
  climbState.t = 0;
  climbState.dur = dur;
  climbState.fromAltM = climbState.altM;
  climbState.toAltM = toAltM;
  return climbState;
}

/** Advance the climb animation. Returns { done, altM }. */
export function stepClimb(dt) {
  const c = climbState;
  if (!c.active) return { done: true, altM: c.altM };
  c.t = Math.min(1, c.t + dt / c.dur);
  const e = easeInOutCubic(c.t);
  c.altM = c.fromAltM + (c.toAltM - c.fromAltM) * e;
  const done = c.t >= 1;
  if (done) c.active = false;
  return { done, altM: c.altM };
}

/** Current climb altitude in metres. */
export function getClimbAltM() {
  return climbState.altM;
}

/** True when the character is at street-level (shrunk) scale. */
export function isAtStreetScale() {
  return parachuteState.scale < 1.5 && parachuteState.mode === 'idle';
}
