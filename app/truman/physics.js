/*
 * TRUMAN — lightweight custom physics (no engine, no imports).
 *
 * Pure logic, zero imports, no browser APIs: runnable under plain `node`
 * for headless tests. The page layer (page.jsx) owns all DOM/canvas work
 * and calls into this module each frame.
 *
 * Units match world.js: city blocks are 50 units, towers are 16-22 units
 * wide and 40-160 tall, cars move ~1 unit/frame.
 */

export const GRAVITY = 60;      // debris gravity, units/s^2 (tuned for tower scale)
export const MAX_SUBSTEPS = 6;  // cap on swept substeps per stepBody call
export const CAR_RADIUS = 4;    // traffic car collision radius

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Build circle-vs-AABB colliders from city buildings. Call once, reuse.
 * Footprint is square (w x w); height h is stored for vertical use.
 * @param {Array<{x:number,z:number,w:number,h:number}>} buildings
 * @returns {Array<{minX,maxX,minZ,maxZ,h,cx,cz}>}
 */
export function buildColliders(buildings) {
  const out = new Array(buildings.length);
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const hw = b.w / 2;
    out[i] = {
      minX: b.x - hw, maxX: b.x + hw,
      minZ: b.z - hw, maxZ: b.z + hw,
      h: b.h, cx: b.x, cz: b.z,
    };
  }
  return out;
}

/**
 * Integrate a circular body against AABB colliders with swept substeps.
 * Fast bodies can never tunnel: the frame is split so each substep moves
 * at most radius*0.5 (capped at MAX_SUBSTEPS for pathological speeds),
 * and every substep ends with a push-out, so the body is never left
 * inside solid geometry.
 *
 * b = { x, z, vx, vz, radius, restitution (0..1), friction (per-second) }
 * On hit: push out along the minimum-penetration axis, reflect the normal
 * velocity component with restitution (bounce), damp the tangential
 * component with friction (slide).
 */
export function stepBody(b, colliders, dt) {
  const speed = Math.hypot(b.vx, b.vz);
  let n = 1;
  if (speed > 0) {
    n = Math.ceil((speed * dt) / (b.radius * 0.5));
    if (n < 1) n = 1;
    else if (n > MAX_SUBSTEPS) n = MAX_SUBSTEPS;
  }
  const sdt = dt / n;
  const r = b.radius;
  const e = b.restitution || 0;
  const fr = b.friction || 0;

  for (let s = 0; s < n; s++) {
    b.x += b.vx * sdt;
    b.z += b.vz * sdt;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const qx = clamp(b.x, c.minX, c.maxX);
      const qz = clamp(b.z, c.minZ, c.maxZ);
      const dx = b.x - qx, dz = b.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;

      let nx, nz, pen;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; pen = r - d;
      } else {
        // Center inside the box: push out along min-penetration axis
        const pl = b.x - c.minX, pr = c.maxX - b.x;
        const pt = b.z - c.minZ, pb = c.maxZ - b.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) { nx = -1; nz = 0; pen = pl + r; }
        else if (m === pr) { nx = 1; nz = 0; pen = pr + r; }
        else if (m === pt) { nx = 0; nz = -1; pen = pt + r; }
        else { nx = 0; nz = 1; pen = pb + r; }
      }
      b.x += nx * pen;
      b.z += nz * pen;

      // Bounce: reflect the inward normal component with restitution
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= (1 + e) * vn * nx;
        b.vz -= (1 + e) * vn * nz;
      }
      // Friction: damp only the tangential component (sliding)
      if (fr > 0) {
        const damp = Math.max(0, 1 - fr * sdt);
        const vn2 = b.vx * nx + b.vz * nz;
        const tx = b.vx - vn2 * nx, tz = b.vz - vn2 * nz;
        b.vx = vn2 * nx + tx * damp;
        b.vz = vn2 * nz + tz * damp;
      }
    }
  }
  return b;
}

/**
 * Gravity + ground bounce for a storm debris chunk.
 * p = { x, y, z, vx, vy, vz, bounces?, settled? }
 * Ground plane y=0 bounces with `restitution`; weak impacts settle
 * (p.settled = true) so the caller can despawn them.
 * Storm wind is a lateral force (units/s^2).
 */
export function stepDebris(p, dt, windX = 0, windZ = 0, restitution = 0.35) {
  p.vy -= GRAVITY * dt;
  p.vx += windX * dt;
  p.vz += windZ * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  if (p.y <= 0) {
    p.y = 0;
    if (p.vy < 0) {
      p.bounces = (p.bounces || 0) + 1;
      const impact = -p.vy;
      p.vy = impact * restitution;
      p.vx *= 0.6; // lateral friction on bounce
      p.vz *= 0.6;
      if (impact < 6) { p.vy = 0; p.vx = 0; p.vz = 0; p.settled = true; }
    }
  }
  return p;
}

/**
 * Uniform-grid broadphase car-car soft separation (positional only, no
 * velocity exchange). Reuses its cell storage across frames: no hot-loop
 * allocations once warmed up.
 */
export class CarSeparator {
  constructor(capacity = 512) {
    this.capacity = capacity;
    this.cells = new Map(); // int key -> int[] of car indices (reused)
    this.used = [];         // cell keys touched this frame
  }

  /**
   * Push overlapping cars apart. radius = per-car radius (min gap = 2*radius).
   */
  separate(cars, cellSize, radius) {
    const cells = this.cells, used = this.used;
    for (let k = 0; k < used.length; k++) cells.get(used[k]).length = 0;
    used.length = 0;

    const minD = radius * 2, minD2 = minD * minD;
    const n = cars.length;
    const keyOf = (bx, bz) => (bx + 32768) * 65536 + (bz + 32768);

    for (let i = 0; i < n; i++) {
      const c = cars[i];
      const key = keyOf(Math.floor(c.x / cellSize), Math.floor(c.z / cellSize));
      let arr = cells.get(key);
      if (!arr) { arr = []; cells.set(key, arr); }
      if (arr.length === 0) used.push(key);
      arr.push(i);
    }

    for (let i = 0; i < n; i++) {
      const a = cars[i];
      const abx = Math.floor(a.x / cellSize), abz = Math.floor(a.z / cellSize);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const arr = cells.get(keyOf(abx + gx, abz + gz));
          if (!arr) continue;
          for (let m = 0; m < arr.length; m++) {
            const j = arr[m];
            if (j <= i) continue; // each pair handled once
            const c2 = cars[j];
            const dx = c2.x - a.x, dz = c2.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const shove = (minD - d) / 2;
            const ux = dx / d, uz = dz / d;
            a.x -= ux * shove; a.z -= uz * shove;
            c2.x += ux * shove; c2.z += uz * shove;
          }
        }
      }
    }
    return cars;
  }
}

// Module-level singleton so separateCars stays allocation-free per frame.
const _separator = new CarSeparator(512);

/** Cheap per-frame entry point: soft-separate traffic cars (radius 4). */
export function separateCars(cars, cellSize = 50) {
  return _separator.separate(cars, cellSize, CAR_RADIUS);
}

/** Circle-vs-collider overlap test (used by the self-test). */
function overlapsAny(x, z, radius, colliders) {
  for (const c of colliders) {
    const qx = clamp(x, c.minX, c.maxX);
    const qz = clamp(z, c.minZ, c.maxZ);
    const dx = x - qx, dz = z - qz;
    if (dx * dx + dz * dz < radius * radius - 1e-9) return true;
  }
  return false;
}

/**
 * Headless self-test: fire a fast body at a wall, bounce debris off the
 * ground, and separate overlapping cars. Returns
 * { tunneled, restOffset, groundOk, carsOk }.
 */
export function runPhysicsSelfTest() {
  const dt = 1 / 60;

  // 1. Fast body vs wall: 6000 u/s -> 100 u/frame, wall face at x=100
  //    (width 20, body radius 5). Must never tunnel through.
  const colliders = buildColliders([
    { x: 110, z: 0, w: 20, h: 100 },
    { x: -200, z: 50, w: 16, h: 80 },
    { x: 300, z: -100, w: 22, h: 120 },
  ]);
  const b = { x: 0, z: 0, vx: 6000, vz: 0, radius: 5, restitution: 0.5, friction: 0 };
  let tunneled = false;
  stepBody(b, colliders, dt);
  const restOffset = b.x - (100 - 5); // 0 = resting exactly on the wall face
  for (let i = 0; i < 120; i++) {
    stepBody(b, colliders, dt);
    if (overlapsAny(b.x, b.z, b.radius, colliders)) tunneled = true;
  }
  if (overlapsAny(b.x, b.z, b.radius, colliders)) tunneled = true;

  // 2. Debris: fast-falling chunk must never go below y=0 and must settle.
  const p = { x: 0, y: 50, z: 0, vx: 0, vy: -200, vz: 0, bounces: 0, settled: false };
  let groundOk = true;
  for (let i = 0; i < 600; i++) {
    stepDebris(p, dt, 0, 0, 0.35);
    if (p.y < -1e-9) groundOk = false;
  }
  groundOk = groundOk && p.settled === true && p.y === 0;

  // 3. Cars: two overlapping pairs must be pushed to >= 2*radius apart.
  const cars = [
    { x: 0, z: 0 }, { x: 5, z: 0 },
    { x: 100, z: 100 }, { x: 103, z: 104 },
  ];
  separateCars(cars, 50);
  let carsOk = true;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const dx = cars[j].x - cars[i].x, dz = cars[j].z - cars[i].z;
      const d = Math.hypot(dx, dz);
      if (d < 20 && d < CAR_RADIUS * 2 - 1e-6) carsOk = false;
    }
  }

  return { tunneled, restOffset, groundOk, carsOk };
}
