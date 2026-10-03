// app/shadow-realm/orbit.js — OrbitControls-style camera for the Shadow Realm.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly. The Rig in scene.jsx owns one orbit state per run and
// applies it on top of the chase-camera baseline every frame.
//
// The state holds OFFSETS from the chase baseline, so a rider who never
// touches the screen gets the exact legacy chase camera:
//   yaw   — radians of orbit around the rider (0 = dead behind the bike)
//   dDist — meters added to the chase distance
//   dElev — radians added to the chase elevation angle
//
// Gesture map (coexists with tilt steering + gyro look, no conflicts):
//   one-finger drag -> orbit the camera around the rider (grab-the-world,
//                        OrbitControls-style: drag right, the world follows)
//   two-finger pinch -> dolly in/out
//   wheel (desktop)  -> dolly in/out
// Device rotation stays gyro look; device tilt stays steering. Touch-drag
// never steers and never pans the gyro view.
//
// STANDING GEOMETRY LAW: the orbiting camera can NEVER clip through
// geometry. Barrier walls are 1.15 high and the light-cycle is ~3 units
// long, so distance is clamped to [ORBIT_MIN_DIST, ORBIT_MAX_DIST] and
// elevation to [ORBIT_MIN_ELEV_DEG, ORBIT_MAX_ELEV_DEG]. At the tightest
// allowed setting the camera still rides >1.4 above the grid and 7 out
// from the rider — clear of walls, bike, and rider. The camera never goes
// below the grid plane (min elevation 12° > 0). Portals are the only
// pass-through exception; nothing else here is a portal.

export const ORBIT_MIN_DIST = 7;
export const ORBIT_MAX_DIST = 42;
export const ORBIT_MIN_ELEV_DEG = 12;
export const ORBIT_MAX_ELEV_DEG = 75;
/** Radians of orbit per pixel dragged (horizontal). */
export const ORBIT_YAW_PER_PX = 0.0052;
/** Radians of elevation per pixel dragged (vertical). */
export const ORBIT_ELEV_PER_PX = 0.0042;
/** Meters of dolly per unit of pinch-ratio delta. */
export const ORBIT_PINCH_GAIN = 26;
/** Meters of dolly per wheel-delta unit (desktop). */
export const ORBIT_WHEEL_GAIN = 0.02;

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function createOrbit() {
  return { yaw: 0, dDist: 0, dElev: 0 };
}

export function resetOrbit(o) {
  o.yaw = 0;
  o.dDist = 0;
  o.dElev = 0;
  return o;
}

/**
 * applyDrag(o, dxPx, dyPx) — one-finger orbit, OrbitControls grab-the-world.
 * Drag right -> camera swings left so the world follows the finger.
 * Drag up -> camera drops (the view tilts up), matching OrbitControls.
 * Returns o.
 */
export function applyDrag(o, dxPx, dyPx) {
  if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return o;
  o.yaw -= dxPx * ORBIT_YAW_PER_PX;
  o.dElev += dyPx * ORBIT_ELEV_PER_PX;
  return o;
}

/**
 * applyPinch(o, ratioDelta) — two-finger dolly.
 * ratioDelta = curSpread / prevSpread - 1 (> 0 = fingers spreading).
 * Spread -> camera closes in; pinch -> camera pulls back. Returns o.
 */
export function applyPinch(o, ratioDelta) {
  if (!Number.isFinite(ratioDelta)) return o;
  o.dDist -= ratioDelta * ORBIT_PINCH_GAIN;
  return o;
}

/** applyWheel(o, deltaY) — desktop scroll dolly. Scroll down -> pull back. */
export function applyWheel(o, deltaY) {
  if (!Number.isFinite(deltaY)) return o;
  o.dDist += deltaY * ORBIT_WHEEL_GAIN;
  return o;
}

/**
 * orbitCamera(bike, chase, o) -> {x, y, z}.
 * bike: {x, z} — rider position (rides at y ~ 0).
 * chase: {x, y, z} — the legacy chase-camera position (absolute).
 * o: orbit state (offsets).
 *
 * Rotates the chase offset around world-up by o.yaw, then re-fits distance
 * and elevation with the solid-geometry clamps. With a zeroed orbit state
 * the result is EXACTLY the chase position (no drift for non-draggers).
 */
export function orbitCamera(bike, chase, o) {
  const yaw = (o && o.yaw) || 0;
  const dDist = (o && o.dDist) || 0;
  const dElev = (o && o.dElev) || 0;

  const ox = chase.x - bike.x;
  const oz = chase.z - bike.z;
  const oy = chase.y;

  // Rotate the horizontal offset about world-up.
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = ox * c + oz * s;
  const rz = -ox * s + oz * c;

  // Re-fit distance + elevation under the solid-geometry clamps.
  const horiz = Math.hypot(rx, rz);
  let dist = Math.hypot(horiz, oy);
  let elev = Math.asin(clamp(oy / (dist || 1), -1, 1));
  dist = clamp(dist + dDist, ORBIT_MIN_DIST, ORBIT_MAX_DIST);
  elev = clamp(elev + dElev, ORBIT_MIN_ELEV_DEG * DEG, ORBIT_MAX_ELEV_DEG * DEG);

  const ch = Math.cos(elev);
  const se = Math.sin(elev);
  const hd = horiz || 1;
  const nx = rx / hd;
  const nz = rz / hd;
  return {
    x: bike.x + nx * dist * ch,
    y: dist * se,
    z: bike.z + nz * dist * ch,
  };
}
