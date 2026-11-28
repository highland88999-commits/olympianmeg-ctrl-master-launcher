// OLYMPIAN MONSTERVERSE — ambient life (G-08, WS4).
//
// Small, non-hostile, non-colliding ambient creatures — CGI
// geometry + canvas-generated feather/wing textures (the house
// procedural + canvas-texture idiom), clock-driven paths (the
// Aethelgard pattern: no animal model slots). No hunt, no
// rewards, no colliders, never counted as monsters: they live
// in their own group, outside the monster field entirely.
//   - dark winged shapes circling high over the mountain band
//     (echoing the demobat sky-life on J2, without importing them)
//     — now real bodies: tapered torso, head + beak, tail, and
//     feather-textured wings with a scalloped trailing edge
//   - fireflies/motes over the acid flats at NIGHT only (opacity
//     follows the day/night cycle — 0 at noon, full at midnight)
//   - spore-flies circling low over the poison band — small
//     glowing-bodied fliers with translucent veined wings
// ZERO new real lights; fireflies are additive points, wings are
// emissive-first standard materials, glow bits are basic.

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

/* Canvas feather/wing texture: a membrane gradient with barbs
 * fanning from the leading edge and a darker scalloped trailing
 * edge. House idiom (lib/planet-cgi/textures.js): canvas-drawn,
 * never a fetched image. Returns null outside a browser (node
 * tests) — callers fall back to the plain material colour. */
function makeWingTexture(R, base, accent) {
  try {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, base);
    grad.addColorStop(0.7, accent);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    // Feather barbs: fine lines fanning from the leading edge.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 42; i++) {
      const y = (i / 42) * 256;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(128, y + 26, 256, y - 18);
      ctx.stroke();
    }
    // Lighter shafts over the barbs.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 14; i++) {
      const y = (i / 14) * 256 + 8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(128, y + 20, 256, y - 12);
      ctx.stroke();
    }
    // Dark scalloped trailing edge.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(216 + (i % 2) * 18, 16 + i * 32, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new R.CanvasTexture(cv);
    if (R.SRGBColorSpace !== undefined) tex.colorSpace = R.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

/* One winged creature: a real body (tapered torso, head, tail)
 * with two feather-textured wings hinged at the body line.
 * Returns { group, wingL, wingR } — the wings flap by rotating
 * around the body axis, exactly as the old flat triangles did,
 * so the update loop below is untouched. `kind` is 'sky' (large
 * dark wings over the mountain band) or 'spore' (small glowing
 * fliers over the poison band). */
function buildWingShape(R, span, color, kind = 'sky') {
  const g = new R.Group();
  const isSpore = kind === 'spore';
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const wingTex = makeWingTexture(R, hex(color), isSpore ? '#e0a0ff' : '#4a3a5a');
  const wingMat = new R.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    emissive: color,
    emissiveIntensity: isSpore ? 0.9 : 0.25,
    map: wingTex || undefined,
    side: R.DoubleSide,
  });
  // Feathered wing outline, drawn in the shape plane with +x
  // outward and +y toward the trailing edge; rotateX(-PI/2)
  // lays it flat with the leading edge forward (+z). The hinge
  // sits at x=0 so rotation.x flaps the tip up and down.
  const mkWing = (sign) => {
    const s = new R.Shape();
    const w = span;
    const chordF = 0.55 * w; // leading-edge root, forward
    const chordB = 0.65 * w; // trailing-edge root, back
    s.moveTo(0, -chordF);
    s.quadraticCurveTo(w * 0.45, -chordF * 0.9, w, -chordF * 0.25);
    // Scalloped trailing edge: three feather tips.
    s.quadraticCurveTo(w * 0.82, chordB * 0.15, w * 0.66, chordB * 0.45);
    s.quadraticCurveTo(w * 0.5, chordB * 0.2, w * 0.34, chordB * 0.7);
    s.quadraticCurveTo(w * 0.18, chordB * 0.45, 0, chordB);
    s.closePath();
    const geo = new R.ShapeGeometry(s, 8);
    geo.rotateX(-Math.PI / 2);
    // Normalise UVs to the wing bounds so the feather texture
    // maps 0..1 across each wing.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    let minX = Infinity; let maxX = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(
        i,
        (pos.getX(i) - minX) / Math.max(maxX - minX, 1e-6),
        (pos.getZ(i) - minZ) / Math.max(maxZ - minZ, 1e-6)
      );
    }
    if (sign < 0) geo.scale(-1, 1, 1);
    const mesh = new R.Mesh(geo, wingMat);
    g.add(mesh);
    return mesh;
  };
  const wingL = mkWing(-1);
  const wingR = mkWing(1);
  // Body: a tapered torso along +z (forward), a head with a
  // beak for sky wings, a glowing abdomen for spore-flies.
  const bodyLen = isSpore ? span * 0.55 : span * 0.5;
  const bodyR = isSpore ? span * 0.09 : span * 0.07;
  const bodyMat = new R.MeshStandardMaterial({
    color: isSpore ? 0x6a2a8a : 0x241a2e,
    roughness: 0.8,
    emissive: color,
    emissiveIntensity: isSpore ? 0.7 : 0.2,
  });
  const body = new R.Mesh(new R.ConeGeometry(bodyR, bodyLen, 8), bodyMat);
  body.rotation.x = Math.PI / 2; // cone tip forward (+z)
  body.position.z = bodyLen * 0.08;
  g.add(body);
  const head = new R.Mesh(new R.SphereGeometry(bodyR * 1.15, 8, 6), bodyMat);
  head.position.set(0, bodyR * 0.25, bodyLen * 0.55);
  g.add(head);
  if (isSpore) {
    // Glowing abdomen — basic material, the glow bit.
    const glow = new R.Mesh(
      new R.SphereGeometry(bodyR * 1.3, 8, 6),
      new R.MeshBasicMaterial({ color: 0xe8b0ff })
    );
    glow.position.set(0, 0, -bodyLen * 0.42);
    glow.scale.set(1, 0.8, 1.4);
    g.add(glow);
  } else {
    const beak = new R.Mesh(new R.ConeGeometry(bodyR * 0.45, bodyR * 2.2, 6), bodyMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, bodyR * 0.2, bodyLen * 0.55 + bodyR * 1.6);
    g.add(beak);
    // Tail fan, trailing behind.
    const tail = new R.Mesh(new R.ConeGeometry(bodyR * 1.5, bodyLen * 0.45, 4), bodyMat);
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(1, 1, 0.35);
    tail.position.set(0, 0, -bodyLen * 0.55);
    g.add(tail);
  }
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
    const w = buildWingShape(R, span, 0x1a1420, 'sky');
    const radius = 40 + rng() * 30;
    const y = 55 + rng() * 20;
    const speed = 0.12 + rng() * 0.1;
    const phase = rng() * Math.PI * 2;
    group.add(w.group);
    wings.push({ ...w, ...circ(210, -150, y), radius, speed, phase });
  }
  // Spore-flies circling low over the poison band.
  for (let i = 0; i < AMBIENT_LIFE_COUNTS.sporeFlies; i++) {
    const w = buildWingShape(R, 0.5 + rng() * 0.3, 0xc06ae0, 'spore');
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
