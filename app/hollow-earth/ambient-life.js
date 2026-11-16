// OLYMPIAN MONSTERVERSE — ambient life (G-08, WS4).
//
// Small, non-hostile, non-colliding ambient creatures — procedural
// geometry + clock-driven paths (the Aethelgard pattern: no animal
// model slots). No hunt, no rewards, no colliders, never counted
// as monsters: they live in their own group, outside the monster
// field entirely.
//   - dark winged shapes circling high over the mountain band
//     (echoing the demobat sky-life on J2, without importing them)
//   - fireflies/motes over the acid flats at NIGHT only (opacity
//     follows the day/night cycle — 0 at noon, full at midnight)
//   - spore-flies circling low over the poison band
// ZERO new real lights; fireflies are additive points, wings are
// unlit basic-material triangles.

import { sunMoonState } from './elemental.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const AMBIENT_LIFE_COUNTS = { skyWings: 5, fireflies: 24, sporeFlies: 16 };

/* One winged shape: two flat triangles hinged at a body line.
 * Returns { group, wingL, wingR } — the wings flap by rotating
 * around the body axis. */
function buildWingShape(R, span, color) {
  const g = new R.Group();
  const mat = new R.MeshBasicMaterial({ color, side: R.DoubleSide });
  const mkWing = (sign) => {
    const geo = new R.BufferGeometry();
    geo.setAttribute('position', new R.Float32BufferAttribute([
      0, 0, 0.6, sign * span, 0, -0.4, 0, 0, -0.7,
    ], 3));
    geo.computeVertexNormals();
    const w = new R.Mesh(geo, mat);
    g.add(w);
    return w;
  };
  const wingL = mkWing(-1);
  const wingR = mkWing(1);
  return { group: g, wingL, wingR };
}

export function buildAmbientLife(R, opts = {}) {
  const heightAt = opts.heightAt || (() => 0);
  const rng = opts.rng || mulberry32(77708);
  const group = new R.Group();
  const wings = [];
  const sporeFlies = [];
  // SPHERE PROJECTION (Nov 16 inner sphere): a circling
  // creature flies in the TANGENT PLANE at its centre ground
  // point — centre = ground point lifted by its height, the
  // circle axes are a stored per-creature tangent basis
  // (e1, e2), the body +Z rides the direction of travel and
  // +Y rides the local up. Without opts the module falls back
  // to the flat placement, so the ambient tests keep passing.
  const groundPoint = opts.groundPoint || ((x, z, lift = 0) => ({ x, y: heightAt(x, z) + lift, z }));
  const groundUp = opts.groundUp || (() => ({ x: 0, y: 1, z: 0 }));
  const tangentBasis = (x, z) => {
    const u = groundUp(x, z);
    const ul = Math.hypot(u.x, u.y, u.z) || 1;
    const up = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
    const ref = Math.abs(up.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const e1 = {
      x: up.y * ref.z - up.z * ref.y,
      y: up.z * ref.x - up.x * ref.z,
      z: up.x * ref.y - up.y * ref.x,
    };
    const e1l = Math.hypot(e1.x, e1.y, e1.z) || 1;
    const e1n = { x: e1.x / e1l, y: e1.y / e1l, z: e1.z / e1l };
    const e2 = {
      x: e1n.y * up.z - e1n.z * up.y,
      y: e1n.z * up.x - e1n.x * up.z,
      z: e1n.x * up.y - e1n.y * up.x,
    };
    return { up, e1: e1n, e2 };
  };
  const circ = (cx, cz, lift) => {
    const centre = groundPoint(cx, cz, lift);
    const { up, e1, e2 } = tangentBasis(cx, cz);
    return { centre, up, e1, e2 };
  };

  // Dark winged shapes circling high over the mountain band.
  for (let i = 0; i < AMBIENT_LIFE_COUNTS.skyWings; i++) {
    const span = 2.2 + rng() * 1.4;
    const w = buildWingShape(R, span, 0x1a1420);
    const radius = 40 + rng() * 30;
    const y = 55 + rng() * 20;
    const speed = 0.12 + rng() * 0.1;
    const phase = rng() * Math.PI * 2;
    group.add(w.group);
    wings.push({ ...w, ...circ(210, -150, y), radius, speed, phase });
  }
  // Spore-flies circling low over the poison band.
  for (let i = 0; i < AMBIENT_LIFE_COUNTS.sporeFlies; i++) {
    const w = buildWingShape(R, 0.5 + rng() * 0.3, 0xc06ae0);
    const radius = 12 + rng() * 18;
    const y = 3 + rng() * 3;
    const speed = 0.25 + rng() * 0.2;
    const phase = rng() * Math.PI * 2;
    group.add(w.group);
    sporeFlies.push({ ...w, ...circ(180, 110, y), radius, speed, phase });
  }
  // Fireflies over the acid flats: one Points system, opacity
  // driven by the night (see update). Additive, no light.
  const ffCount = AMBIENT_LIFE_COUNTS.fireflies;
  const ffPos = new Float32Array(ffCount * 3);
  const ffBase = [];
  for (let i = 0; i < ffCount; i++) {
    const x = -160 + (rng() - 0.5) * 110;
    const z = 40 + (rng() - 0.5) * 110;
    const lift = 1 + rng() * 3;
    const p = groundPoint(x, z, lift);
    ffPos[i * 3] = p.x;
    ffPos[i * 3 + 1] = p.y;
    ffPos[i * 3 + 2] = p.z;
    const { up, e1, e2 } = tangentBasis(x, z);
    ffBase.push({ x, z, lift, up, e1, e2, phase: rng() * Math.PI * 2 });
  }
  const ffGeo = new R.BufferGeometry();
  ffGeo.setAttribute('position', new R.BufferAttribute(ffPos, 3));
  const ffMat = new R.PointsMaterial({
    color: 0xd8f26a, size: 0.5, transparent: true, opacity: 0,
    depthWrite: false, blending: R.AdditiveBlending, sizeAttenuation: true,
    map: opts.texture || undefined,
  });
  const fireflies = new R.Points(ffGeo, ffMat);
  fireflies.userData.ambientFireflies = true;
  group.add(fireflies);
  group.userData.ambientLife = { wings, sporeFlies, fireflies, ffBase, ffCount };

  function update(dt, t) {
    const step = (typeof dt === 'number' && dt > 0 && dt < 5) ? dt : 0.016;
    void step;
    const flap = (c, rate) => {
      const a = t * c.speed + c.phase;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Circle in the tangent plane at the centre ground
      // point, bobbing 2 m along the local up.
      const bob = Math.sin(t * 0.7 + c.phase) * 2;
      c.group.position.set(
        c.centre.x + c.e1.x * ca * c.radius + c.e2.x * sa * c.radius + c.up.x * bob,
        c.centre.y + c.e1.y * ca * c.radius + c.e2.y * sa * c.radius + c.up.y * bob,
        c.centre.z + c.e1.z * ca * c.radius + c.e2.z * sa * c.radius + c.up.z * bob,
      );
      // Body +Z rides the direction of travel, +Y the local
      // up — a rotation matrix built from the tangent frame.
      const fx = -c.e1.x * sa + c.e2.x * ca;
      const fy = -c.e1.y * sa + c.e2.y * ca;
      const fz = -c.e1.z * sa + c.e2.z * ca;
      const fl = Math.hypot(fx, fy, fz) || 1;
      const fwd = new R.Vector3(fx / fl, fy / fl, fz / fl);
      const upV = new R.Vector3(c.up.x, c.up.y, c.up.z);
      const xAxis = new R.Vector3().crossVectors(upV, fwd).normalize();
      const m = new R.Matrix4().makeBasis(xAxis, upV, fwd);
      c.group.quaternion.setFromRotationMatrix(m);
      const f = Math.sin(t * rate + c.phase) * 0.5;
      c.wingL.rotation.x = f;
      c.wingR.rotation.x = -f;
    };
    for (const w of wings) flap(w, 3);
    for (const s of sporeFlies) flap(s, 6);
    // Fireflies: night only — opacity 0 at noon, full at midnight,
    // with a slow breathing blink on top. They drift in place.
    const night = 1 - sunMoonState(t).dayFactor;
    ffMat.opacity = night * (0.55 + 0.45 * Math.sin(t * 2));
    const pos = ffGeo.attributes.position.array;
    for (let i = 0; i < ffBase.length; i++) {
      const b = ffBase[i];
      // Drift in the tangent plane, bob along the local up.
      const base = groundPoint(b.x, b.z, b.lift);
      const sx = Math.sin(t * 0.6 + b.phase) * 1.2;
      const sz = Math.cos(t * 0.5 + b.phase) * 1.2;
      const sy = Math.sin(t * 0.9 + b.phase) * 0.5;
      pos[i * 3] = base.x + b.e1.x * sx + b.e2.x * sz + b.up.x * sy;
      pos[i * 3 + 1] = base.y + b.e1.y * sx + b.e2.y * sz + b.up.y * sy;
      pos[i * 3 + 2] = base.z + b.e1.z * sx + b.e2.z * sz + b.up.z * sy;
    }
    ffGeo.attributes.position.needsUpdate = true;
  }

  return { group, update };
}
