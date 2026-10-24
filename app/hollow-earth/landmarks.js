// OLYMPIAN MONSTERVERSE — procedural landmarks (pure geometry).
//
// Every landmark is built from primitives in code: no GLB is
// required for the world to stand. The collider contract is the
// same as the saga's — the returned group's userData.colliderR
// covers the visual hull, and zone.js turns it into a solid
// {x, z, r} circle. Monster models are NOT landmarks: they live
// in spawns.js (MONSTER_MODELS), where the Tripo GLBs will land.

export const LANDMARK_TYPES = [
  'ooze-pool', 'ember-spire', 'storm-pylon', 'mire-arch',
  'gloom-monolith', 'wreck-hulk', 'peak-shrine',
  'korus-throne', 'intro-arch', 'haven',
];

function mat(color, extra) {
  return { color, roughness: 0.8, metalness: 0.1, ...(extra || {}) };
}

function mesh(R, geo, m, x, y, z, ry) {
  const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  return o;
}

export function buildLandmark(type, R, T = {}) {
  const g = new R.Group();
  let colliderR = 3;
  const M = (geo, m, x, y, z, ry) => { const o = mesh(R, geo, m, x, y, z, ry); g.add(o); return o; };

  if (type === 'ooze-pool') {
    colliderR = 6;
    M(new R.CylinderGeometry(6, 6.4, 0.5, 20), mat(0x6da83c), 0, 0.25, 0);
    M(new R.CylinderGeometry(5, 5, 0.2, 20), mat(0xb6e33c, { emissive: 0x4a7a28, emissiveIntensity: 0.6 }), 0, 0.55, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      M(new R.SphereGeometry(0.5, 8, 6), mat(0xd8f26a), Math.cos(a) * 3, 0.9, Math.sin(a) * 3);
    }
  } else if (type === 'ember-spire') {
    colliderR = 3;
    M(new R.CylinderGeometry(0.6, 2.2, 9, 7), mat(0x2a201c), 0, 4.5, 0);
    M(new R.ConeGeometry(1.1, 3, 7), mat(0xff6a22, { emissive: 0xff4400, emissiveIntensity: 1.2 }), 0, 10.5, 0);
    M(new R.CylinderGeometry(3, 3.4, 0.8, 8), mat(0x1e1712), 0, 0.4, 0);
  } else if (type === 'storm-pylon') {
    colliderR = 2.5;
    M(new R.CylinderGeometry(0.5, 0.8, 12, 8), mat(0x8a907e, { metalness: 0.6 }), 0, 6, 0);
    M(new R.TorusGeometry(2, 0.18, 6, 20), mat(0xffe14d, { emissive: 0xccaa00, emissiveIntensity: 1 }), 0, 11, 0);
    M(new R.SphereGeometry(0.7, 10, 8), mat(0xfff2a8, { emissive: 0xffe14d, emissiveIntensity: 1.4 }), 0, 12.6, 0);
  } else if (type === 'mire-arch') {
    colliderR = 4;
    M(new R.CylinderGeometry(0.9, 1.1, 6, 7), mat(0x423252), -3, 3, 0);
    M(new R.CylinderGeometry(0.9, 1.1, 6, 7), mat(0x423252), 3, 3, 0);
    M(new R.BoxGeometry(8.5, 1.2, 1.4), mat(0x5a4270), 0, 6.4, 0);
    M(new R.SphereGeometry(1.1, 8, 6), mat(0xc06ae0, { emissive: 0x7a2aa0, emissiveIntensity: 0.8 }), 0, 7.4, 0);
  } else if (type === 'gloom-monolith') {
    colliderR = 3;
    M(new R.BoxGeometry(3, 14, 1.6), mat(0x242428), 0, 7, 0);
    M(new R.BoxGeometry(3.6, 1, 2.2), mat(0x3a3a40), 0, 0.5, 0);
    M(new R.SphereGeometry(0.5, 8, 6), mat(0x8a8a9a, { emissive: 0x555560, emissiveIntensity: 0.8 }), 0, 12.5, 0);
  } else if (type === 'wreck-hulk') {
    colliderR = 7;
    const hull = M(new R.BoxGeometry(11, 2.2, 4), mat(0x6a4e28, { metalness: 0.4 }), 0, 1.4, 0, 0.5);
    hull.rotation.z = 0.22;
    for (let i = -2; i <= 2; i++) {
      M(new R.BoxGeometry(0.5, 3.4, 3.6), mat(0x4a3418), i * 2.2, 2.6, 0, 0.5);
    }
    M(new R.CylinderGeometry(0.9, 0.9, 5, 8), mat(0x3a2c1a), 5.5, 1, 0, 0.5);
  } else if (type === 'peak-shrine') {
    colliderR = 4;
    M(new R.CylinderGeometry(1.5, 3.5, 2, 7), mat(0x6e6e78), 0, 1, 0);
    M(new R.CylinderGeometry(0.8, 2.2, 3, 6), mat(0x7a7a82), 0, 3, 0);
    M(new R.ConeGeometry(0.7, 4.5, 4), mat(0xd8d8e0, { emissive: 0x888899, emissiveIntensity: 0.4 }), 0, 6.5, 0);
  } else if (type === 'korus-throne') {
    // The boss seat: a colossal dark throne under a storm arch.
    // Korus himself is a monster figure (spawns.js), not stone.
    colliderR = 10;
    M(new R.BoxGeometry(10, 1.2, 8), mat(0x1c1c20), 0, 0.6, 0);
    M(new R.BoxGeometry(2.4, 12, 2), mat(0x242428), -4.5, 6, -2);
    M(new R.BoxGeometry(2.4, 12, 2), mat(0x242428), 4.5, 6, -2);
    M(new R.BoxGeometry(11, 2, 2), mat(0x2e2e34), 0, 12.4, -2);
    M(new R.CylinderGeometry(0.12, 0.12, 11, 5), mat(0xffe14d, { emissive: 0xffe14d, emissiveIntensity: 1.6 }), -2.5, 7, 1);
    M(new R.CylinderGeometry(0.12, 0.12, 11, 5), mat(0x8a8a9a, { emissive: 0x666670, emissiveIntensity: 1 }), 2.5, 7, 1);
  } else if (type === 'haven') {
    // The Haven: the realm's sanctuary — a ring of pale pillars
    // under a glowing dome, unmistakable from anywhere in the
    // southern flats. The pillar ring sits ON the safe-base
    // boundary (r 28, spawns.js SAFE_BASE) so the eye learns
    // exactly where safety starts.
    colliderR = 0; // sanctuary, never a wall: walk straight in
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      M(new R.CylinderGeometry(0.9, 1.2, 7, 7), mat(0xd8d2c2), Math.cos(a) * 26, 3.5, Math.sin(a) * 26);
    }
    M(new R.SphereGeometry(26, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffe9a8, { transparent: true, opacity: 0.18, emissive: 0xaa8822, emissiveIntensity: 0.5 }), 0, 0, 0);
    M(new R.CylinderGeometry(0.4, 0.4, 12, 6), mat(0xe8c87a, { emissive: 0xaa8822, emissiveIntensity: 0.8 }), 0, 6, 0);
    M(new R.SphereGeometry(1.1, 10, 8), mat(0xffe9a8, { emissive: 0xffcc55, emissiveIntensity: 1.4 }), 0, 12.6, 0);
  } else if (type === 'intro-arch') {
    colliderR = 4;
    M(new R.CylinderGeometry(1, 1.3, 7, 8), mat(0xb4935a), -4, 3.5, 0);
    M(new R.CylinderGeometry(1, 1.3, 7, 8), mat(0xb4935a), 4, 3.5, 0);
    M(new R.BoxGeometry(10.5, 1.4, 1.6), mat(0xc2a15e), 0, 7.4, 0);
    M(new R.SphereGeometry(0.9, 10, 8), mat(0xe8c87a, { emissive: 0xaa8822, emissiveIntensity: 0.7 }), 0, 8.6, 0);
  } else {
    // Unknown type: a plain marker stone, never a crash.
    colliderR = 1.5;
    M(new R.CylinderGeometry(0.8, 1.1, 2.4, 7), mat(0x888888), 0, 1.2, 0);
  }

  g.userData.landmarkType = type;
  g.userData.colliderR = colliderR;
  return g;
}

/* Ambient world furniture: the glowing core-sun overhead and the
 * inverted horizon ring — the two things that make the sky read
 * as an inner world rather than an open sky. */
export function buildAmbient(type, R, T = {}) {
  const g = new R.Group();
  if (type === 'core-sun') {
    const sun = new R.Mesh(
      new R.SphereGeometry(26, 20, 14),
      new R.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    sun.position.set(0, 200, 0);
    g.add(sun);
    const halo = new R.Mesh(
      new R.SphereGeometry(42, 20, 14),
      new R.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.22 })
    );
    halo.position.set(0, 200, 0);
    g.add(halo);
  } else if (type === 'inverted-horizon') {
    // A jagged silhouette ring far out, leaning inward: the
    // world's rim curving up overhead, as an inner world does.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const h = 26 + ((i * 37) % 22);
      const peak = new R.Mesh(
        new R.ConeGeometry(26, h, 4),
        new R.MeshStandardMaterial({ color: 0x2a2238, roughness: 1 })
      );
      peak.position.set(Math.cos(a) * 430, h / 2 - 4, Math.sin(a) * 430);
      peak.rotation.z = -0.12;
      peak.rotation.y = a;
      g.add(peak);
    }
  }
  g.userData.ambientType = type;
  return g;
}

export const AMBIENT_TYPES = ['core-sun', 'inverted-horizon'];
