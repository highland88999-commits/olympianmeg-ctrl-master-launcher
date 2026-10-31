// lib/world-engine/life-render.js
// Renders the life-seed foundation: flora and fauna as THREE objects
// on a user-forged planet. Takes the life seed (lib/world-engine/life-seed.js)
// and the planet's terrain info, returns a THREE.Group.
//
// Flora is instanced for phone budgets. Fauna are low-poly procedural
// bodies driven by their bauplan. Everything is seeded — the same
// world seed grows the same visible life, every time.
//
// This EXCEEDS the built-in standard: built-in planets have fauna but
// no flora system; user worlds get both, with ten fauna archetypes
// (built-ins have six).

import { lifeSeedFromParams } from './life-seed.js';

// --- seeded placement --------------------------------------------------------
// Deterministic pseudo-random from an integer index (no RNG state).

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Fibonacci sphere point — even distribution over the sphere.
function fibPoint(i, n, out) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
  return out;
}

// --- flora builders -----------------------------------------------------------
// Each returns a THREE.Group (a single specimen). The caller instances
// or clones them across the surface.

function buildFloraSpecimen(THREE, flora) {
  const g = new THREE.Group();
  const color = new THREE.Color(flora.color);
  const h = flora.height;

  const mat = (c, emissive = 0x000000, ei = 0) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.1, emissive, emissiveIntensity: ei });

  switch (flora.kind) {
    case 'canopy-tree': {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * h, 0.1 * h, h, 6),
        mat(new THREE.Color(flora.color).multiplyScalar(0.45))
      );
      trunk.position.y = h / 2;
      g.add(trunk);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.45, 1), mat(color));
      canopy.position.y = h * 1.05;
      canopy.scale.y = 0.75;
      g.add(canopy);
      break;
    }
    case 'ground-cover': {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(h * 0.4, 8), mat(color));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.02;
      g.add(disc);
      break;
    }
    case 'spire-bloom': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * h, 0.05 * h, h, 5), mat(color));
      stalk.position.y = h / 2;
      g.add(stalk);
      const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.18, 1), mat(new THREE.Color(flora.color).offsetHSL(0.08, 0, 0.15)));
      bloom.position.y = h * 1.05;
      g.add(bloom);
      break;
    }
    case 'drifter-seed': {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.22, 1),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.6 }));
      puff.position.y = h * 1.5;
      g.add(puff);
      g.userData.float = true;
      break;
    }
    case 'crystal-shard': {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.3),
        new THREE.MeshStandardMaterial({
          color, roughness: 0.15, metalness: 0.7,
          emissive: new THREE.Color(flora.glowColor || flora.color), emissiveIntensity: 0.35,
        }));
      shard.position.y = h * 0.3;
      shard.rotation.y = hash01(h * 100) * Math.PI;
      g.add(shard);
      break;
    }
    case 'fungal-cap': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * h, 0.12 * h, h * 0.7, 6),
        mat(new THREE.Color(flora.color).multiplyScalar(0.7)));
      stem.position.y = h * 0.35;
      g.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(h * 0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
      cap.position.y = h * 0.7;
      g.add(cap);
      break;
    }
    case 'kelp-forest': {
      for (let s = 0; s < 3; s++) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * h, 0.05 * h, h * (0.8 + s * 0.15), 5), mat(color));
        strand.position.set((hash01(s * 7 + h) - 0.5) * h * 0.3, h * 0.45, (hash01(s * 13 + h) - 0.5) * h * 0.3);
        strand.rotation.z = (hash01(s * 29) - 0.5) * 0.3;
        g.add(strand);
      }
      break;
    }
    case 'coral-mound': {
      const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(h * 0.35, 0), mat(color));
      mound.position.y = h * 0.2;
      mound.scale.y = 0.6;
      g.add(mound);
      break;
    }
    case 'vine-web': {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * h, 0.04 * h, h, 5), mat(color));
      vine.position.y = h / 2;
      g.add(vine);
      for (let b = 0; b < 4; b++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * h, 0.02 * h, h * 0.4, 4), mat(color));
        branch.position.set((hash01(b * 3) - 0.5) * h * 0.3, h * (0.3 + b * 0.15), 0);
        branch.rotation.z = (hash01(b * 11) - 0.5) * 1.2;
        g.add(branch);
      }
      break;
    }
    case 'glow-moss': {
      const moss = new THREE.Mesh(new THREE.SphereGeometry(h * 0.25, 8, 6),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(flora.color).multiplyScalar(0.5),
          emissive: new THREE.Color(flora.glowColor || '#66ff99'), emissiveIntensity: 1.2,
        }));
      moss.position.y = h * 0.1;
      moss.scale.y = 0.4;
      g.add(moss);
      break;
    }
    default: {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.3, 1), mat(color));
      blob.position.y = h * 0.3;
      g.add(blob);
    }
  }
  return g;
}

// --- fauna builders ------------------------------------------------------------

function buildFaunaSpecimen(THREE, fauna) {
  const g = new THREE.Group();
  const b = fauna.bauplan;
  const color = new THREE.Color(fauna.color);
  const accent = new THREE.Color(fauna.accent);

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: b.surface === 'armored' ? 0.5 : 0.75,
    metalness: b.surface === 'armored' ? 0.4 : 0.1,
    transparent: b.surface === 'translucent',
    opacity: b.surface === 'translucent' ? 0.7 : 1,
  });

  // Body: elongated sphere scaled by bauplan
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    bodyMat
  );
  body.scale.set(b.bodyLength, b.bodyWidth, b.bodyWidth);
  body.position.y = 0.3 + b.stance * 0.4;
  g.add(body);

  // Frill (accent) for frilled surface
  if (b.surface === 'frilled') {
    const frill = new THREE.Mesh(
      new THREE.TorusGeometry(b.bodyWidth * 0.7, 0.06, 6, 12),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 })
    );
    frill.position.y = body.position.y;
    frill.rotation.x = Math.PI / 2;
    g.add(frill);
  }

  // Limbs
  const limbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(fauna.color).multiplyScalar(0.8), roughness: 0.8 });
  for (let i = 0; i < b.limbCount; i++) {
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, b.limbLength, 5), limbMat);
    const side = i % 2 === 0 ? 1 : -1;
    const along = Math.floor(i / 2) / Math.max(1, Math.floor(b.limbCount / 2)) - 0.5;
    limb.position.set(along * b.bodyLength * 0.8, body.position.y - b.limbLength * 0.3, side * b.bodyWidth * 0.7);
    limb.rotation.z = side * 0.25;
    limb.userData.limbPhase = i * 0.7;
    g.add(limb);
  }

  // Wings for flyer/drifter
  if (fauna.archetype === 'flyer' || fauna.archetype === 'drifter') {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.PlaneGeometry(b.bodyLength * 0.9, b.bodyWidth * 1.4),
        new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      wing.position.set(0, body.position.y + 0.15, side * b.bodyWidth * 0.9);
      wing.rotation.x = side * 0.35;
      wing.userData.wing = true;
      wing.userData.side = side;
      g.add(wing);
    }
  }

  // Leviathan: scale up
  if (fauna.archetype === 'leviathan') g.scale.multiplyScalar(2.2);
  // Swarmer/darter: scale down
  if (fauna.archetype === 'swarmer' || fauna.archetype === 'darter') g.scale.multiplyScalar(0.45);

  g.scale.multiplyScalar(fauna.size);
  g.userData.archetype = fauna.archetype;
  g.userData.speed = fauna.speed;
  return g;
}

// --- main API -------------------------------------------------------------------

/**
 * Build the living layer for a planet.
 * @param {object} THREE - the three.js module
 * @param {object} params - world params (must carry seed + lifeType)
 * @param {number} planetRadius - the planet's render radius
 * @returns {THREE.Group} group with flora + fauna, or empty group if no seed
 *
 * The group gets a userData.update(dt, t) for animation (fauna wander,
 * drifters float, glow pulses).
 */
export function buildWorldLife(THREE, params, planetRadius = 2) {
  const group = new THREE.Group();
  const life = lifeSeedFromParams(params);
  if (!life) return group;

  const v = new THREE.Vector3();
  const up = new THREE.Vector3();
  const q = new THREE.Quaternion();

  // --- flora: scatter specimens across the surface ---
  const floraAnim = [];
  for (const flora of life.flora) {
    const specimen = buildFloraSpecimen(THREE, flora);
    // Count by density: 12-48 specimens per flora kind
    const count = Math.round(12 + flora.density * 36);
    for (let i = 0; i < count; i++) {
      const inst = specimen.clone();
      // Seeded surface point
      const idx = (life.flora.indexOf(flora) * 1000 + i);
      fibPoint(idx, count, v);
      // Elevation filter: keep flora in its band (y is elevation here)
      const elev = (v.y + 1) / 2; // 0..1
      if (elev < flora.elevMin || elev > flora.elevMax) continue;

      const r = planetRadius * 1.01; // sit on surface
      up.copy(v).normalize();
      inst.position.copy(up).multiplyScalar(r);
      // Orient upright along surface normal
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      inst.quaternion.copy(q);
      // Seeded scale/rotation variation
      const s = 0.7 + hash01(idx * 3.7) * 0.6;
      inst.scale.multiplyScalar(s * (planetRadius / 2));
      inst.rotateY(hash01(idx * 9.1) * Math.PI * 2);

      if (inst.userData.float || flora.kind === 'drifter-seed') {
        floraAnim.push({ obj: inst, baseY: inst.position.y, phase: hash01(idx) * 6.28, float: true });
      }
      if (flora.kind === 'glow-moss') {
        floraAnim.push({ obj: inst, phase: hash01(idx * 1.3) * 6.28, pulse: true });
      }
      group.add(inst);
    }
  }

  // --- fauna: place individuals, they wander in update ---
  const faunaList = [];
  for (const fauna of life.fauna) {
    const specimen = buildFaunaSpecimen(THREE, fauna);
    for (let i = 0; i < fauna.count; i++) {
      const inst = specimen.clone(true);
      const idx = (life.fauna.indexOf(fauna) * 5000 + i * 17);
      fibPoint(idx, fauna.count, v);
      const r = planetRadius * 1.02;
      up.copy(v).normalize();
      inst.position.copy(up).multiplyScalar(r);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      inst.quaternion.copy(q);
      inst.rotateY(hash01(idx * 5.3) * Math.PI * 2);
      inst.scale.multiplyScalar(planetRadius / 2 * 0.35);

      // Flyers/drifters hover above surface
      if (fauna.archetype === 'flyer' || fauna.archetype === 'drifter') {
        inst.position.addScaledVector(up, planetRadius * 0.35);
      }

      faunaList.push({
        obj: inst,
        up: up.clone(),
        speed: fauna.speed * 0.15,
        phase: hash01(idx * 2.9) * 6.28,
        archetype: fauna.archetype,
      });
      group.add(inst);
    }
  }

  // --- animation ---
  group.userData.update = (dt, t) => {
    for (const f of floraAnim) {
      if (f.float) {
        f.obj.position.y = f.baseY + Math.sin(t * 0.8 + f.phase) * 0.15;
      }
      if (f.pulse) {
        const s = 1 + Math.sin(t * 2 + f.phase) * 0.12;
        f.obj.scale.setScalar(f.obj.scale.x * s / (f.obj.userData.lastS || 1));
        f.obj.userData.lastS = s;
      }
    }
    for (const f of faunaList) {
      // Wander: slow orbit around the surface normal axis
      const wobble = Math.sin(t * f.speed + f.phase) * 0.3;
      f.obj.rotateY(dt * f.speed * 0.4 + wobble * dt * 0.1);
      // Bob
      f.obj.position.addScaledVector(f.up, Math.sin(t * 2 * f.speed + f.phase) * dt * 0.1);
      // Limb swing
      f.obj.traverse((o) => {
        if (o.userData.limbPhase !== undefined) {
          o.rotation.x = Math.sin(t * 3 * f.speed + o.userData.limbPhase) * 0.4;
        }
        if (o.userData.wing) {
          o.rotation.x = o.userData.side * (0.35 + Math.sin(t * 6 + f.phase) * 0.45);
        }
      });
    }
  };

  return group;
}
