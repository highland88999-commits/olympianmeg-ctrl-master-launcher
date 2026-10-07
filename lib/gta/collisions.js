// lib/gta/collisions.js — Collision system for GTA-style gameplay.
// Merlin's rule: NO geometry pass-through. All collisions slide/deflect, never kill.
// Circle (player/cars) vs AABB (buildings) with slide response.

/**
 * AABB collider: { minX, maxX, minZ, maxZ }
 * Circle: { x, z, radius }
 */

// Check if a circle overlaps an AABB
export function circleVsAABB(cx, cz, radius, box) {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return (dx * dx + dz * dz) < (radius * radius);
}

// Resolve circle out of AABB, returns push vector { x, z }
// Slide response: push along the smallest penetration axis
export function resolveCircleAABB(cx, cz, radius, box) {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  let dx = cx - closestX;
  let dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return null; // no overlap

  if (distSq > 1e-8) {
    // Push radially outward
    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    return { x: dx * push, z: dz * push };
  }

  // Center inside box: push along smallest penetration axis
  const penLeft = cx - box.minX + radius;
  const penRight = box.maxX - cx + radius;
  const penTop = cz - box.minZ + radius;
  const penBottom = box.maxZ - cz + radius;
  const min = Math.min(penLeft, penRight, penTop, penBottom);
  if (min === penLeft) return { x: -penLeft, z: 0 };
  if (min === penRight) return { x: penRight, z: 0 };
  if (min === penTop) return { x: 0, z: -penTop };
  return { x: 0, z: penBottom };
}

// Move a circle body, resolving against all colliders
// body: { x, z, radius, vx, vz }
// Returns collision info { hit: boolean, nx, nz } for effects
export function moveBody(body, colliders, dt) {
  body.x += body.vx * dt;
  body.z += body.vz * dt;

  let hit = false;
  let nx = 0, nz = 0;

  // Resolve against each collider (a few iterations for corners)
  for (let iter = 0; iter < 3; iter++) {
    let resolved = false;
    for (const box of colliders) {
      const push = resolveCircleAABB(body.x, body.z, body.radius, box);
      if (push) {
        body.x += push.x;
        body.z += push.z;
        hit = true;
        // Slide: remove velocity into the wall
        const len = Math.sqrt(push.x * push.x + push.z * push.z);
        if (len > 1e-8) {
          nx = push.x / len;
          nz = push.z / len;
          const dot = body.vx * nx + body.vz * nz;
          if (dot < 0) {
            body.vx -= dot * nx;
            body.vz -= dot * nz;
          }
        }
        resolved = true;
      }
    }
    if (!resolved) break;
  }

  return { hit, nx, nz };
}

// Build AABB colliders from building list
// buildings: [{ x, z, w, d }] (center x/z, width/depth)
export function buildColliders(buildings) {
  return buildings.map(b => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  }));
}

// Check if a point is inside any collider (for spawn validation)
export function pointInColliders(x, z, colliders) {
  for (const box of colliders) {
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
      return true;
    }
  }
  return false;
}

// Find a clear spawn point near (x, z)
export function findClearSpot(x, z, colliders, radius = 2, maxTries = 20) {
  if (!pointInColliders(x, z, colliders)) return { x, z };
  for (let i = 0; i < maxTries; i++) {
    const angle = (i / maxTries) * Math.PI * 2;
    const dist = radius * (1 + Math.floor(i / 8));
    const tx = x + Math.cos(angle) * dist;
    const tz = z + Math.sin(angle) * dist;
    if (!pointInColliders(tx, tz, colliders)) return { x: tx, z: tz };
  }
  return { x, z }; // fallback
}
