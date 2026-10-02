// Pure collision helpers for the Duat arena.
// Dependency-free, deterministic, no React — safe to use in useFrame and in
// headless node tests (same convention as lib/babel/walk.js).

/**
 * pushOutOfCircles — resolve a ground position {x, z} against a list of
 * circle colliders {x, z, r}. Any collider the point is strictly inside is
 * pushed out along the surface normal so the point ends exactly on the rim.
 * Runs 2 passes so chained/overlapping colliders converge.
 *
 * Never mutates its arguments; returns a fresh {x, z}.
 */
export function pushOutOfCircles(pos, colliders) {
  let x = pos.x;
  let z = pos.z;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      const r2 = c.r * c.r;
      if (d2 >= r2) continue;
      if (d2 === 0) {
        // Dead center — push along +x so the result is deterministic.
        x = c.x + c.r;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = (c.r - d) / d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z };
}

/**
 * makeRiverBlocker — build a walker clamp for a straight north-south river.
 * The river is the rect |px - x| < width/2 within [zMin, zMax]; bridges are
 * rects {z, halfWidth} that cross it and pass freely.
 *
 * Returns function(px, pz) -> {x, z}: points inside the river rect but not on
 * a bridge are pushed out to the nearest river edge (east or west). Points on
 * a bridge, outside the z range, or clear of the river return unchanged.
 */
export function makeRiverBlocker({ x, width, zMin, zMax, bridges }) {
  const half = width / 2;
  const west = x - half;
  const east = x + half;
  const bs = Array.isArray(bridges) ? bridges : [];
  return function riverCheck(px, pz) {
    if (pz < zMin || pz > zMax) return { x: px, z: pz };
    if (Math.abs(px - x) >= half) return { x: px, z: pz };
    for (const b of bs) {
      if (Math.abs(pz - b.z) < b.halfWidth) return { x: px, z: pz };
    }
    return px - west <= east - px ? { x: west, z: pz } : { x: east, z: pz };
  };
}
