// lib/hub-collision.js
// Minimal solid-geometry system for hub flight (free-fly camera + TRON bike).
// Standing rule: in every 3D space, NO passing through geometry — planets,
// towers, satellites, asteroids, all solid. Bounce/deflect, never kill.
// Portals are the only pass-through exception (they're effects, not here).
//
// Colliders are spheres with live position getters (satellites, moon, and
// asteroids all move). resolveFlightCollision() sweeps the frame's motion
// segment against every collider and pushes the endpoint out along the
// contact normal — a slide/deflect. Pure math on {x,y,z} — no three.js —
// so it stays headless-testable.

const colliders = []; // { id, getPos: () => ({x,y,z}|null), radius }

export function registerCollider(id, getPos, radius) {
  unregisterCollider(id);
  if (typeof getPos === 'function' && radius > 0) {
    colliders.push({ id, getPos, radius });
  }
}

export function unregisterCollider(id) {
  const i = colliders.findIndex((c) => c.id === id);
  if (i >= 0) colliders.splice(i, 1);
}

export function clearColliders() {
  colliders.length = 0;
}

export function colliderCount() {
  return colliders.length;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Sweep `prev` → `next` (both mutated {x,y,z}; `next` is corrected in place).
 * `radius` is the moving body's own radius. Returns true when any contact
 * was resolved. Two relaxation passes keep stacked contacts stable.
 * Never throws, never NaNs — worst case the body keeps its old position.
 */
export function resolveFlightCollision(prev, next, radius) {
  if (!prev || !next || !(radius >= 0)) return false;
  let collided = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      let cp;
      try {
        cp = c.getPos();
      } catch {
        continue;
      }
      if (!cp) continue;
      const R = c.radius + radius;

      const abx = next.x - prev.x;
      const aby = next.y - prev.y;
      const abz = next.z - prev.z;
      const len2 = abx * abx + aby * aby + abz * abz;

      let qx;
      let qy;
      let qz;
      if (len2 < 1e-12) {
        qx = next.x;
        qy = next.y;
        qz = next.z;
      } else {
        const t = clamp01(
          ((cp.x - prev.x) * abx + (cp.y - prev.y) * aby + (cp.z - prev.z) * abz) / len2
        );
        qx = prev.x + abx * t;
        qy = prev.y + aby * t;
        qz = prev.z + abz * t;
      }

      let dx = qx - cp.x;
      let dy = qy - cp.y;
      let dz = qz - cp.z;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < R) {
        collided = true;
        if (d < 1e-6) {
          dx = 0;
          dy = 1;
          dz = 0;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        // Push the endpoint out to the surface + a hair, along the normal:
        // the body slides/deflects instead of passing through.
        const push = R - d + 0.05;
        next.x += nx * push;
        next.y += ny * push;
        next.z += nz * push;
        // Keep the segment start honest too so the next frame's sweep starts
        // outside the surface instead of tunneling from inside.
        prev.x = qx + nx * (R + 0.05);
        prev.y = qy + ny * (R + 0.05);
        prev.z = qz + nz * (R + 0.05);
      }
    }
  }
  return collided;
}
