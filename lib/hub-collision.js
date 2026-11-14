// lib/hub-collision.js
// Minimal solid-geometry system for hub flight (free-fly camera + TRON bike).
// Standing rule: in every 3D space, NO passing through geometry — planets,
// towers, satellites, asteroids, all solid. Bounce/deflect, never kill.
// Portals are the only pass-through exception (they're effects, not here).
//
// Colliders are spheres with live position getters (satellites, moon, and
// asteroids all move) — plus oriented boxes (the god towers: a box fits
// their square body, where a sphere would wall off the gaps between
// them). resolveFlightCollision() sweeps the frame's motion segment
// against every collider and pushes the endpoint out along the contact
// normal — a slide/deflect. Pure math on {x,y,z} — no three.js — so it
// stays headless-testable.

const colliders = []; // { id, kind: 'sphere'|'box', getPos: () => ({x,y,z}|null), radius, half, getYaw }

export function registerCollider(id, getPos, radius) {
  unregisterCollider(id);
  if (typeof getPos === 'function' && radius > 0) {
    colliders.push({ id, kind: 'sphere', getPos, radius });
  }
}

/**
 * Register an oriented box collider: `half` is the half-extents
 * {x, y, z} in world units, `getYaw` returns the box's rotation about
 * Y in radians (the box is axis-aligned in its own frame; yaw rotates
 * it into world space). The box centre comes from `getPos` each frame,
 * so a bobbing or drifting box stays honest.
 */
export function registerBoxCollider(id, getPos, half, getYaw) {
  unregisterCollider(id);
  if (
    typeof getPos === 'function' &&
    half && half.x > 0 && half.y > 0 && half.z > 0
  ) {
    colliders.push({
      id,
      kind: 'box',
      getPos,
      half: { x: half.x, y: half.y, z: half.z },
      getYaw: typeof getYaw === 'function' ? getYaw : () => 0,
    });
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
      if (c.kind === 'box') {
        if (resolveBoxCollision(c, prev, next, radius)) collided = true;
        continue;
      }
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

// --- Oriented-box sweep -------------------------------------------------------
// Segment vs the box expanded by the body's radius (Minkowski), in the
// box's local frame. A slab test gives the entry face; the endpoint is
// pushed back out along that face's outward normal so the body slides
// along the face instead of passing through — the same slide/deflect
// contract as the spheres. A segment that starts inside the expanded
// box is pushed out along the shallowest face; a through-pass in one
// frame stops the body at the entry point (it cannot pass through).
// Returns true when the endpoint was corrected.
function resolveBoxCollision(c, prev, next, radius) {
  let cp;
  let yaw = 0;
  try {
    cp = c.getPos();
    yaw = c.getYaw();
  } catch {
    return false;
  }
  if (!cp) return false;
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) yaw = 0;
  const H = {
    x: c.half.x + radius,
    y: c.half.y + radius,
    z: c.half.z + radius,
  };
  // World -> local: translate by -centre, rotate by -yaw about Y.
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const toLocal = (p) => {
    const dx = p.x - cp.x;
    const dy = p.y - cp.y;
    const dz = p.z - cp.z;
    return [dx * cos + dz * sin, dy, -dx * sin + dz * cos];
  };
  // Local -> world: rotate by +yaw about Y, translate by +centre.
  const cos2 = Math.cos(yaw);
  const sin2 = Math.sin(yaw);
  const toWorld = (l, out) => {
    out.x = l[0] * cos2 + l[2] * sin2 + cp.x;
    out.y = l[1] + cp.y;
    out.z = -l[0] * sin2 + l[2] * cos2 + cp.z;
  };
  const p0 = toLocal(prev);
  const p1 = toLocal(next);
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const h = [H.x, H.y, H.z];
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (p0[a] < -h[a] || p0[a] > h[a]) return false;
    } else {
      let t1 = (-h[a] - p0[a]) / d[a];
      let t2 = (h[a] - p0[a]) / d[a];
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = a;
        sign = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  if (tmax < 0 || tmin > 1) return false;
  if (tmin < 0) {
    // Starts inside the expanded box: out along the shallowest face.
    let best = Infinity;
    let bAxis = 0;
    let bSign = 1;
    for (let a = 0; a < 3; a++) {
      const pen = h[a] - Math.abs(p0[a]);
      if (pen < best) {
        best = pen;
        bAxis = a;
        bSign = p0[a] >= 0 ? 1 : -1;
      }
    }
    const out = [p1[0], p1[1], p1[2]];
    out[bAxis] = bSign * (h[bAxis] + 0.05);
    toWorld(out, next);
    const pOut = [p0[0], p0[1], p0[2]];
    pOut[bAxis] = bSign * (h[bAxis] + 0.05);
    toWorld(pOut, prev);
    return true;
  }
  // Entry through face (axis, sign) at tmin; its outward normal is
  // `sign` along that axis.
  const q = [p0[0] + d[0] * tmin, p0[1] + d[1] * tmin, p0[2] + d[2] * tmin];
  if (tmax >= 1) {
    // Endpoint ends inside the expanded box: slide it back out to the
    // entry face, keeping the tangential motion.
    const corrected = [p1[0], p1[1], p1[2]];
    corrected[axis] = sign * (h[axis] + 0.05);
    toWorld(corrected, next);
    q[axis] += sign * 0.05;
    toWorld(q, prev);
    return true;
  }
  // Through-pass in one frame: stop the body at the entry point.
  q[axis] += sign * 0.05;
  toWorld(q, next);
  toWorld(q, prev);
  return true;
}
