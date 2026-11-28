// lib/fortress/pluto.js — Fortress of Solitude on Pluto: pure ground +
// levitation math. No DOM, no three.js, no React — headless-testable in
// node (tests/fortress-pluto.test.mjs).
//
// Merlin (Nov 28 ~03:00-03:01): the Fortress is a 3D space inside a
// frozen world (Pluto), CGI. Users LAND on the floor that holds the
// crystals. If they walk off the edge they LEVITATE — they hover, they
// do not fall and do not die. A gravity-off switch lets them rise again;
// switching gravity back on brings them back down.
//
// Geometry (all heights are feet Y; the disc top is y = 0):
//   - the crystal floor is a flat disc, radius DISC_FLAT_R, top y = 0.
//   - a gentle ice slope runs from DISC_FLAT_R out to DISC_RIM_R,
//     down to the Pluto ice plain at ICE_Y.
//   - the ice plain stretches unbounded (no barriers, no walls).
// The vertical state machine:
//   grounded -> (walk off the flat top, gravity on) -> levitating
//   levitating -> (drift back over the disc) -> grounded
//   grounded | levitating -> (gravity off) -> rising
//   rising -> (gravity on) -> descending -> (reach ground) -> grounded
// Levitation holds you at disc-top height; you never fall. Rising caps
// at MAX_RISE_Y so nobody gets lost above the world.

/** Radius of the flat crystal-floor top, in world units. */
export const DISC_FLAT_R = 13;
/** Radius where the ice slope meets the Pluto plain. */
export const DISC_RIM_R = 16;
/** Height of the flat crystal-floor top (feet Y). */
export const DISC_Y = 0;
/** Height of the Pluto ice plain (feet Y). */
export const ICE_Y = -1.2;
/** Rise speed with gravity off, world units per second. */
export const RISE_SPEED = 3;
/** Descent speed with gravity back on, world units per second. */
export const DESCEND_SPEED = 4;
/** Highest the gravity-off rise can take you (feet Y). */
export const MAX_RISE_Y = 30;
/** Horizontal speed while levitating (slow drift), world units/s. */
export const LEVITATE_SPEED = 3;
/** Horizontal speed while rising or descending, world units/s. */
export const AIR_SPEED = 4;
/** Normal walk speed on solid ground, world units/s. */
export const PLUTO_WALK_SPEED = 10;

/** Ground height (feet Y) at a horizontal position. */
export function plutoGroundHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r <= DISC_FLAT_R) return DISC_Y;
  if (r >= DISC_RIM_R) return ICE_Y;
  const t = (r - DISC_FLAT_R) / (DISC_RIM_R - DISC_FLAT_R);
  return DISC_Y + (ICE_Y - DISC_Y) * t;
}

/** True while standing over the flat crystal-floor top. */
export function isOnDisc(x, z) {
  return Math.hypot(x, z) <= DISC_FLAT_R;
}

/** Distance in world units from the flat disc edge (0 while on it). */
export function distanceToDisc(x, z) {
  return Math.max(0, Math.hypot(x, z) - DISC_FLAT_R);
}

/** Horizontal speed for a vertical mode. */
export function speedForMode(mode) {
  if (mode === 'levitating') return LEVITATE_SPEED;
  if (mode === 'rising' || mode === 'descending') return AIR_SPEED;
  return PLUTO_WALK_SPEED;
}

/**
 * Create the vertical state. x/z is the spawn (the landing point on
 * the crystal floor); y starts at the disc top, gravity on.
 */
export function createPlutoState({ x = 0, z = 12 } = {}) {
  return {
    mode: 'grounded',
    y: DISC_Y,
    gravityOn: true,
    onDisc: isOnDisc(x, z),
  };
}

/**
 * Advance the vertical state one frame. Mutates and returns state.
 * @param {object} state the Pluto vertical state (from createPlutoState)
 * @param {{ x: number, z: number, gravityOn: boolean, dt?: number }} input
 * current horizontal position, the gravity switch, seconds since last frame
 */
export function stepPluto(state, { x, z, gravityOn, dt = 0.016 } = {}) {
  const ground = plutoGroundHeight(x, z);
  const onDisc = isOnDisc(x, z);
  const wasOnDisc = state.onDisc;
  state.gravityOn = !!gravityOn;

  if (state.mode === 'grounded') {
    if (!gravityOn) {
      state.mode = 'rising';
    } else if (wasOnDisc && !onDisc) {
      // Walked off the flat top with gravity on: the crystal field
      // catches you — you levitate at disc-top height, you do not fall.
      state.mode = 'levitating';
      state.y = DISC_Y;
    } else {
      state.y = ground;
    }
  } else if (state.mode === 'levitating') {
    state.y = DISC_Y;
    if (!gravityOn) {
      state.mode = 'rising';
    } else if (onDisc) {
      // Drifted back over the floor: the floor takes you again.
      state.mode = 'grounded';
      state.y = DISC_Y;
    }
  } else if (state.mode === 'rising') {
    if (gravityOn) {
      state.mode = 'descending';
    } else {
      state.y = Math.min(MAX_RISE_Y, state.y + RISE_SPEED * dt);
    }
  } else if (state.mode === 'descending') {
    if (!gravityOn) {
      state.mode = 'rising';
    } else {
      state.y -= DESCEND_SPEED * dt;
      if (state.y <= ground) {
        state.y = ground;
        state.mode = 'grounded';
      }
    }
  }

  state.onDisc = onDisc;
  return state;
}

/**
 * Solid colliders for the crystal ring, from the vault matrix: one
 * circle per crystal at its ring position (radius 11, matching the
 * scene). The walker never passes through a crystal.
 */
export function crystalColliders(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  return matrix.map((node, i) => {
    const angle = (i / matrix.length) * Math.PI * 2;
    return { x: Math.cos(angle) * 11, z: Math.sin(angle) * 11, r: 0.9 };
  });
}
