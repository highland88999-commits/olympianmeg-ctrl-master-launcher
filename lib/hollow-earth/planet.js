// lib/hollow-earth/planet.js — HOLLOW EARTH AS AN INNER SPHERE
// (Merlin, Nov 16 ~01:52: "FULL WORLD — INNER SPHERE like
// Jupiter 2, but in its own rite (in its own right)").
//
// Jupiter 2 is an OUTER sphere — you walk on the outside of a
// ball, up is away from the centre. Hollow Earth is an INNER
// world — you walk on the INSIDE of a hollow shell under a
// core-sun, up is TOWARD the centre, gravity pulls you toward
// the shell (outward from the centre). The maths is the J2
// maths sign-flipped; this module is MODELLED on
// lib/jupiter2/planet.js, not copied from it:
//
//   * The spawn pole is the deck origin (0, 0), mapped to the
//     direction (0, -1, 0) — the inside-BOTTOM of the shell —
//     so local up near spawn is world +Y and every landmark,
//     figure and scatter piece stands upright where the action
//     is. (J2's pole is +Y, the outside-top.)
//   * Ground radius = SPHERE_R − terrain height: a hill pokes
//     toward the centre (smaller radius), a valley dips away
//     from it. J2 adds the undulation; the inside subtracts it.
//   * Up is −dir (toward the centre). Jump velocity points
//     toward the centre; gravity pulls outward, toward the
//     shell. Landing is r ≥ ground radius (J2: r ≤ ground
//     radius). A drop is ground radius GROWING (the ground
//     falling away outward, J2: shrinking).
//   * There is NO drop, cliff, causeway, cave or mountain —
//     the sphere IS the geography (no order for one exists).
//     The ground law is one continuous radius: the seeded
//     terrain undulation (±3.4 m) over the whole shell.
//
// THE CHART — flat (x, z) maps onto the sphere by SURFACE
// DISTANCE (J2's pattern): a deck point's distance from the
// pole IS its surface distance from the pole, so every old
// (x, z) still means the same walk. Deck distances between
// nearby points are surface distances to first order (the
// chart is the exponential map at the pole); the azimuthal
// compression sin θ / θ stays under 8% inside the old world
// (θ ≤ 0.7) and reaches ~30% only at the far rim/antipode,
// where nothing is spawned. All game logic (spawns, senses,
// auras, Haven, missions) therefore keeps running in deck
// coordinates unchanged; only rendering and the walker read
// the 3D sphere.
//
// NUMBERS THAT ARE THE WORKER'S CALL (Merlin ordered the inner
// sphere, not the metres): sphere radius 382 m — pole-to-
// equator surface distance π/2 × 382 ≈ 600 m, exactly the old
// disc radius, so the ground you could see before is the same
// size, but it never ends: walk past the old r550 and you keep
// going, around the far side and back. Gravity 18, jump 6,
// walk 10, sprint ×1.8 — the flat walker's own numbers, kept,
// radial direction. Step law (J2's): grounded rises re-project
// onto the new ground (a rise is a climb, never a wall); only
// a drop > 2 m or a downhill gradient > 2.5 goes airborne.
//
// Pure: no DOM, no React, no THREE — node tests drive this
// module directly. The terrain height function is injected
// (heightAt) so this module never imports the saga engine.

import { radialVelocityStep } from '../planet-walker.js';

/** Sphere radius (m) — pole-to-equator surface distance is the old 600 m disc radius. */
export const SPHERE_R = 382;
/** Gravity on the inner surface (m/s²) — the flat walker's 18, pulling toward the shell. */
export const HE_GRAVITY = 18;
/** Jump take-off speed (m/s) toward the centre — the flat walker's 6. */
export const HE_JUMP_V = 6;
/** Walk speed (m/s) — the flat walker's 10. */
export const HE_WALK_SPEED = 10;
/** Sprint multiplier — the flat walker's ×1.8. */
export const HE_SPRINT_MULT = 1.8;
/** A one-step ground fall bigger than this (m) is a fall, never a slope (J2's STEP_WALL_M). */
export const STEP_WALL_M = 2;
/** Downhill ground steeper than this (rise/run) is a fall, not a walk (J2's STEEP_FALL_GRADIENT). */
export const STEEP_FALL_GRADIENT = 2.5;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function norm3(p) {
  const r = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / r, y: p.y / r, z: p.z / r };
}
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** The spawn pole direction — the inside-bottom of the shell. */
export const POLE_DIR = Object.freeze({ x: 0, y: -1, z: 0 });

/**
 * Direction (unit) for a deck point (x, z): the deck distance
 * from the pole IS the surface distance from the pole
 * (θ = r / R), and the azimuth is measured from north (−Z)
 * toward east (+X), so deck north (−z) is azimuth 0 and the
 * flat yaw-0 heading still faces north on the sphere.
 */
export function deckToDir(x, z) {
  const r = Math.hypot(x, z);
  const theta = r / SPHERE_R;
  const alpha = Math.atan2(x, -z);
  const s = Math.sin(theta);
  return {
    x: s * Math.sin(alpha),
    y: -Math.cos(theta),
    z: -s * Math.cos(alpha),
  };
}

/** Deck coordinates (x, z) for a direction: the inverse of deckToDir. */
export function dirToDeck(dir) {
  const d = norm3(dir);
  const theta = Math.acos(clamp(-d.y, -1, 1));
  const alpha = Math.atan2(d.x, -d.z);
  const r = theta * SPHERE_R;
  return { x: r * Math.sin(alpha), z: -r * Math.cos(alpha) };
}

/** Angular distance (rad) of a direction from the spawn pole. */
export function thetaFromPole(dir) {
  return Math.acos(clamp(-norm3(dir).y, -1, 1));
}

/** Azimuth (rad) of a direction, 0 = north (−Z), positive toward east (+X). */
export function azimuthOf(dir) {
  const d = norm3(dir);
  return Math.atan2(d.x, -d.z);
}

/** Direction (unit) at an angular distance + azimuth from the spawn pole. */
export function dirAt(theta, alpha) {
  const s = Math.sin(theta);
  return { x: s * Math.sin(alpha), y: -Math.cos(theta), z: -s * Math.cos(alpha) };
}

/**
 * The ground radius (m) at a direction: the shell radius MINUS
 * the seeded terrain height at the direction's deck coordinates
 * — a hill pokes toward the centre, a valley dips away from it.
 * heightAt is the realm's own height function, (x, z) => m.
 */
export function groundRadiusAt(dir, heightAt = () => 0) {
  const deck = dirToDeck(dir);
  return SPHERE_R - heightAt(deck.x, deck.z);
}

/** The 3D ground point under a direction: the direction at its ground radius. */
export function groundPointAt(dir, heightAt = () => 0) {
  const d = norm3(dir);
  const r = groundRadiusAt(d, heightAt);
  return { x: d.x * r, y: d.y * r, z: d.z * r };
}

/** The 3D ground point for a deck point (x, z). */
export function spherePointFromDeck(x, z, heightAt = () => 0) {
  return groundPointAt(deckToDir(x, z), heightAt);
}

/** Local up (toward the centre) at a deck point. */
export function sphereUpAtDeck(x, z) {
  const d = deckToDir(x, z);
  return { x: -d.x, y: -d.y, z: -d.z };
}

/** Local up (toward the centre) at a 3D point on/near the shell. */
export function sphereUpAt(feet) {
  const d = norm3(feet);
  return { x: -d.x, y: -d.y, z: -d.z };
}

/**
 * The 3D point `lift` metres above the ground at a deck point
 * (toward the centre): the ground point plus up × lift.
 */
export function liftedPoint(x, z, lift, heightAt = () => 0) {
  const p = spherePointFromDeck(x, z, heightAt);
  const up = sphereUpAtDeck(x, z);
  return { x: p.x + up.x * lift, y: p.y + up.y * lift, z: p.z + up.z * lift };
}

/**
 * True surface distance (m) between two deck points, along the
 * great circle — R × the angle between their directions. Deck
 * hypot is the same number to first order nearby; this is the
 * exact one, for tests and for the Haven/activation pins.
 * atan2(|cross|, dot) stays stable at zero distance, where
 * acos(1 − ε) would not.
 */
export function surfaceDistanceBetween(x1, z1, x2, z2) {
  const a = deckToDir(x1, z1);
  const b = deckToDir(x2, z2);
  const c = cross3(a, b);
  return SPHERE_R * Math.atan2(Math.hypot(c.x, c.y, c.z), dot3(a, b));
}

// ── tangent frame (inside) ─────────────────────────────────────
// Up is toward the centre; north is world −Z projected onto the
// tangent plane (world +X when the walker stands where that
// projection degenerates — a compass bearing, so it turns
// exactly like a real compass does). Forward at yaw 0 is north;
// positive yaw turns toward west, the flat walker's convention
// (yaw +90° faces −X at the pole), so drag-look and movement
// keep the feel the flat world had.

/**
 * Projected north at 3D feet: world −Z projected onto the
 * tangent plane (the J2 pattern). It stays continuous across
 * the spawn pole, so walking north from spawn crosses the pole
 * and keeps going straight. It degenerates at exactly two
 * points — the equator, due north and due south (up ∥ −Z) —
 * where the fallback is the projection's limit ALONG THE
 * MERIDIAN (0, sinθ·cosα, −cosθ): a figure there keeps its
 * meridian facing instead of being spun onto the equator (the
 * +X fallback J2 uses would do exactly that).
 */
export function projectedNorth(feet) {
  const up = sphereUpAt(feet);
  const d = norm3(feet);
  const theta = Math.acos(clamp(-d.y, -1, 1));
  const alpha = Math.atan2(d.x, -d.z);
  const ref = { x: 0, y: 0, z: -1 };
  const refDot = dot3(up, ref);
  if (Math.abs(refDot) > 0.98) {
    return norm3({ x: 0, y: Math.sin(theta) * Math.cos(alpha), z: -Math.cos(theta) });
  }
  return norm3({
    x: ref.x - up.x * refDot,
    y: ref.y - up.y * refDot,
    z: ref.z - up.z * refDot,
  });
}

/**
 * Tangent basis at 3D feet for a camera yaw (radians, 0 = facing
 * north). Returns unit { up, north, east, forward, right }.
 * This is the COMPASS frame — figures, landmarks and the spawn
 * heading read it. The WALKER does not steer by it: a compass
 * bearing can never take you past the equator (past it, the
 * projected north points back toward the pole, so a constant
 * yaw would march you to the equator and strand you there).
 * The walker carries a parallel-transported reference frame
 * instead (frameFromRef), so holding forward keeps you on a
 * great circle all the way round and back.
 */
export function insideTangentBasis(feet, yaw) {
  const up = sphereUpAt(feet);
  const north = projectedNorth(feet);
  const east = norm3(cross3(north, up));
  const cy = Math.cos(yaw || 0);
  const sy = Math.sin(yaw || 0);
  const forward = norm3({
    x: north.x * cy - east.x * sy,
    y: north.y * cy - east.y * sy,
    z: north.z * cy - east.z * sy,
  });
  const right = norm3(cross3(forward, up));
  return { up, north, east, forward, right };
}

/** Rotate a vector around a unit axis by an angle (Rodrigues). */
export function rotateAroundAxis(v, axis, angle) {
  const a = norm3(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = dot3(a, v);
  const cr = cross3(a, v);
  return {
    x: v.x * c + cr.x * s + a.x * dot * (1 - c),
    y: v.y * c + cr.y * s + a.y * dot * (1 - c),
    z: v.z * c + cr.z * s + a.z * dot * (1 - c),
  };
}

/**
 * The walker's steering frame at 3D feet: `ref` is the
 * parallel-transported yaw-0 forward (a unit tangent vector
 * carried in the walker state), `yaw` rotates it around local
 * up. Returns unit { up, forward, right }.
 */
export function frameFromRef(feet, ref, yaw) {
  const up = sphereUpAt(feet);
  const forward = norm3(rotateAroundAxis(ref, up, yaw || 0));
  const right = norm3(cross3(forward, up));
  return { up, forward, right };
}

/**
 * Parallel-transport a tangent reference vector to new feet:
 * project it onto the new tangent plane and renormalise. One
 * step's error is O((step/R)²) — negligible at walk speeds —
 * and the transport is what keeps a held heading on a great
 * circle instead of bending it toward the equator.
 */
export function transportRef(ref, newFeet) {
  const up = sphereUpAt(newFeet);
  const d = dot3(ref, up);
  const t = norm3({ x: ref.x - up.x * d, y: ref.y - up.y * d, z: ref.z - up.z * d });
  return t;
}

/**
 * Deck-space unit step in the facing direction: the deck
 * displacement of walking 1 m along the tangent forward at
 * feet. Used where a 3D aim must become a deck target (bolts
 * at max range, mission checks).
 */
export function deckStepFor(feet, yaw) {
  const basis = insideTangentBasis(feet, yaw || 0);
  const d0 = dirToDeck(feet);
  const ahead = norm3({
    x: feet.x + basis.forward.x,
    y: feet.y + basis.forward.y,
    z: feet.z + basis.forward.z,
  });
  const d1 = dirToDeck(ahead);
  const dx = d1.x - d0.x;
  const dz = d1.z - d0.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: 0, z: -1 };
  return { x: dx / len, z: dz / len };
}

// ── pure quaternion helpers (no THREE) ─────────────────────────

function quatMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromUnitVectors(from, to) {
  const f = norm3(from);
  const t = norm3(to);
  const d = dot3(f, t);
  if (d < -0.999999) {
    // Opposite: any axis perpendicular to `from` will do.
    const axis = Math.abs(f.y) < 0.9 ? norm3(cross3(f, { x: 0, y: 1, z: 0 })) : norm3(cross3(f, { x: 1, y: 0, z: 0 }));
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }
  const c = cross3(f, t);
  // {cross, 1 + d} has magnitude sqrt(2 + 2d) — normalise it.
  const m = Math.sqrt(2 + 2 * d) || 1;
  return { x: c.x / m, y: c.y / m, z: c.z / m, w: (1 + d) / m };
}

function quatAxisAngle(axis, angle) {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

/** Rotate a vector by a quaternion {x, y, z, w}. */
export function applyQuat(q, v) {
  const u = { x: q.x, y: q.y, z: q.z };
  const s = q.w;
  const c1 = cross3(u, v);
  const c2 = cross3(u, c1);
  return {
    x: v.x + 2 * (s * c1.x + c2.x),
    y: v.y + 2 * (s * c1.y + c2.y),
    z: v.z + 2 * (s * c1.z + c2.z),
  };
}

/**
 * Orientation quaternion for a figure standing at 3D feet with
 * a yaw: the figure's local +Y lands on local up, its local
 * −Z (its facing) lands on the tangent forward at that yaw —
 * exactly the flat `rotation.y = yaw`, tilted onto the shell.
 * Apply with THREE.Quaternion.set(q.x, q.y, q.z, q.w).
 */
export function orientationQuat(feet, yaw) {
  const basis = insideTangentBasis(feet, yaw || 0);
  // Rotation matrix with columns [right, up, back]: model +X →
  // right, +Y → up, +Z → −forward. Converted to a quaternion.
  const r = basis.right;
  const u = basis.up;
  const b = { x: -basis.forward.x, y: -basis.forward.y, z: -basis.forward.z };
  const m00 = r.x; const m01 = u.x; const m02 = b.x;
  const m10 = r.y; const m11 = u.y; const m12 = b.y;
  const m20 = r.z; const m21 = u.z; const m22 = b.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return {
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
      w: 0.25 * s,
    };
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return {
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
      w: (m21 - m12) / s,
    };
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return {
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
      w: (m02 - m20) / s,
    };
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return {
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
    w: (m10 - m01) / s,
  };
}

/**
 * Quaternion that lays a +Z-facing flat disc (CircleGeometry /
 * RingGeometry, rotation.x = −π/2 on the flat world) onto the
 * tangent plane at 3D feet: +Z → local up.
 */
export function flatQuat(feet) {
  return quatFromUnitVectors({ x: 0, y: 0, z: 1 }, sphereUpAt(feet));
}

// ── the sphere walker (deck + radial height) ───────────────────
// The walker state is deck coordinates + a radial height, so the
// page keeps reading walker.pos.x/z (deck — every distance rule
// in spawns.js, every mission check, every HUD read stays
// deck-space) while the physics runs on the 3D feet:
//   state: { deck: {x, z}, h, vh, grounded, feet: {x, y, z},
//     ref: {x, y, z} } — ref is the parallel-transported yaw-0
//     forward (a unit tangent vector). A compass bearing cannot
//     steer a sphere walker: past the equator the projected
//     north points back toward the pole, so a constant yaw
//     would march the walker to the equator and strand it
//     there. The transported ref keeps a held heading on a
//     great circle all the way round and back.
//   h — height above the ground toward the centre (m); vh —
//     radial velocity (+ = up, toward the centre).
//   input: { fwd, strafe (-1..1), jump (edge-triggered), yaw }
//   planet: { gravity, walkSpeed, jumpSpeed, heightAt }
// Grounded, gentle ground: the feet re-project onto the new
// ground radius — a rise is a climb, never a wall. Grounded,
// ground falls away > 2 m, or a steep downhill gradient > 2.5:
// the walker goes AIRBORNE and falls outward under real gravity
// until the shell catches them. Airborne: radial velocity falls
// at gravity; landing (r ≥ ground radius) clamps to the surface
// and re-grounds. Tangential velocity applies in the air too.

/** Fresh sphere-walker state standing on the ground at a deck point. */
export function sphereStateForDeck(x, z, heightAt = () => 0, opts = {}) {
  const feet = spherePointFromDeck(x, z, heightAt);
  const h = opts.h || 0;
  const up = sphereUpAtDeck(x, z);
  return {
    deck: { x, z },
    h,
    vh: opts.vh || 0,
    grounded: opts.grounded !== false,
    feet: { x: feet.x + up.x * h, y: feet.y + up.y * h, z: feet.z + up.z * h },
    // The heading reference: projected north at the spawn point,
    // so yaw 0 faces north there. It is parallel-transported by
    // every step, so a held heading stays on a great circle.
    ref: projectedNorth(feet),
  };
}

/**
 * One physics step for the Hollow Earth inner-sphere walker.
 * Returns a NEW state { deck, h, vh, grounded, feet }.
 */
export function stepHollowEarthWalker(state, input, dt, planet) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const gravity = planet.gravity ?? HE_GRAVITY;
  const walkSpeed = planet.walkSpeed ?? HE_WALK_SPEED;
  const jumpSpeed = planet.jumpSpeed ?? HE_JUMP_V;
  const heightAt = planet.heightAt || (() => 0);
  const feet = { ...state.feet };
  let grounded = !!state.grounded;
  // The heading reference rides in the state and is
  // parallel-transported by the step below — a held heading
  // stays on a great circle all the way round and back.
  let ref = state.ref ? { ...state.ref } : projectedNorth(feet);

  const up = sphereUpAt(feet);
  const basis = frameFromRef(feet, ref, input.yaw || 0);
  let fwd = input.fwd || 0;
  let strafe = input.strafe || 0;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) {
    fwd /= len;
    strafe /= len;
  }
  const tvx = (basis.forward.x * fwd + basis.right.x * strafe) * walkSpeed;
  const tvy = (basis.forward.y * fwd + basis.right.y * strafe) * walkSpeed;
  const tvz = (basis.forward.z * fwd + basis.right.z * strafe) * walkSpeed;

  const step = radialVelocityStep(state.vh || 0, gravity, jumpSpeed, !!input.jump, grounded, dtC);
  let vh = step.vy;
  grounded = step.grounded;

  const rNow = Math.hypot(feet.x, feet.y, feet.z);
  let h = state.h || 0;
  if (!grounded) {
    feet.x += (tvx + up.x * vh) * dtC;
    feet.y += (tvy + up.y * vh) * dtC;
    feet.z += (tvz + up.z * vh) * dtC;
    const groundR = groundRadiusAt(feet, heightAt);
    const r = Math.hypot(feet.x, feet.y, feet.z);
    if (r >= groundR) {
      // Fell onto the shell (outward = down, inside): clamp to
      // the surface exactly and re-ground.
      const s = groundR / (r || groundR);
      feet.x *= s;
      feet.y *= s;
      feet.z *= s;
      grounded = true;
      vh = 0;
      h = 0;
    } else {
      h = groundR - r;
    }
  } else {
    const nx = feet.x + tvx * dtC;
    const ny = feet.y + tvy * dtC;
    const nz = feet.z + tvz * dtC;
    const newGroundR = groundRadiusAt({ x: nx, y: ny, z: nz }, heightAt);
    // Inside, the ground falling away means its radius GROWS
    // (further from the centre = lower); a rise means it
    // shrinks (closer to the centre = higher). Sign-flipped
    // from J2's drop = rNow − newGroundR.
    const drop = newGroundR - rNow;
    const stepLen = Math.hypot(tvx * dtC, tvy * dtC, tvz * dtC);
    if (drop > STEP_WALL_M) {
      // Walked off a drop bigger than one step: go airborne
      // and fall — do not teleport down.
      grounded = false;
      vh = 0;
      feet.x = nx;
      feet.y = ny;
      feet.z = nz;
      h = drop;
    } else if (drop > 0 && stepLen > 1e-6 && drop / stepLen > STEEP_FALL_GRADIENT) {
      // Stepping onto a steep face from above: no walking down
      // a cliff face — go airborne and fall. Gentler ground
      // walks down grounded.
      grounded = false;
      vh = 0;
      feet.x = nx;
      feet.y = ny;
      feet.z = nz;
      h = drop;
    } else {
      // A rise is a climb, never a wall: re-project onto the
      // new ground. The ground law is continuous, so the rise
      // in one step is bounded by the slope — never a teleport.
      const r = Math.hypot(nx, ny, nz) || newGroundR;
      const s = newGroundR / r;
      feet.x = nx * s;
      feet.y = ny * s;
      feet.z = nz * s;
      h = 0;
    }
  }
  return {
    deck: dirToDeck(feet), h, vh, grounded, feet,
    // Transport the heading reference along the step just
    // taken, so the next step's "straight ahead" is the same
    // world direction — the great-circle law.
    ref: transportRef(ref, feet),
  };
}

/**
 * Points of the aura ring around a monster: a circle of surface
 * distance `radiusM` around the monster's direction, hugging the
 * shell (a flat ring would float up to ~4.5 m off the ground at
 * 59 m on a 382 m sphere). Returns [{x, y, z}, …] in world
 * coordinates — the caller writes them into the ring geometry
 * in place each frame, the J2 pattern. The ring rides 0.35 m
 * above the ground, toward the centre.
 */
export function auraRingPoints(centerDir, radiusM, segments = 48, heightAt = () => 0) {
  const c = norm3(centerDir);
  const ang = radiusM / SPHERE_R;
  const ref = Math.abs(c.y) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const dot = dot3(c, ref);
  const t1 = norm3({ x: ref.x - c.x * dot, y: ref.y - c.y * dot, z: ref.z - c.z * dot });
  const t2 = norm3(cross3(c, t1));
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dir = {
      x: c.x * Math.cos(ang) + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * Math.sin(ang),
      y: c.y * Math.cos(ang) + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * Math.sin(ang),
      z: c.z * Math.cos(ang) + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * Math.sin(ang),
    };
    const p = groundPointAt(dir, heightAt);
    // Lift the ring a touch off the ground, toward the centre,
    // so it reads over the swells.
    const r = Math.hypot(p.x, p.y, p.z) - 0.35;
    const s = r / (Math.hypot(p.x, p.y, p.z) || r);
    out.push({ x: p.x * s, y: p.y * s, z: p.z * s });
  }
  return out;
}
