// lib/world-nexus/asset-loader.js
// Loads generated GLB assets for the World Nexus hub from
// public/models/world-nexus/<id>.glb, with graceful procedural fallbacks.
//
// Contract: loadAsset() NEVER throws and ALWAYS returns a solid, colliding
// group. If the GLB is missing (or fails to parse), a clean procedural
// placeholder of the same footprint is built instead, so the hub is
// complete and walkable before generation runs.
//
// Colliders are 2D circles {x, z, r} in world space. The hub scene pushes
// the player out of them (bounce/deflect, never kill). Portal planes are
// the ONLY pass-through exception in the hub.
//
// Interface note for the future lib/world/walk-controls.js unification:
// this module owns "asset -> group + colliders". Walk controls own
// "player vs colliders". Keep that boundary.

const MODEL_BASE = '/models/world-nexus';

function mat(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, ...opts });
}

/** Push a circle collider in world space. */
function circle(colliders, x, z, r) {
  colliders.push({ x, z, r });
}

function box(THREE, group, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  group.add(m);
  return m;
}

function cyl(THREE, group, rt, rb, h, seg, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/**
 * Procedural fallback builders, one per asset id.
 * Each returns { group, colliders } where colliders are LOCAL-space circles
 * {x, z, r} (the caller transforms them to world space).
 * accent: hex color tinting the asset to its district.
 */
const FALLBACKS = {
  // ---- district gate arches ----
  'gate-ares': fbArch, 'gate-apollo': fbArch, 'gate-hermes': fbArch,
  'gate-hephaestus': fbArch, 'gate-athena': fbArch, 'gate-artemis': fbArch,
  'gate-hestia': fbArch, 'gate-dionysus': fbArch, 'gate-plutus': fbArch,
  'gate-aphrodite': fbArch, 'gate-utilities': fbArch,

  'nexus-core': fbCore,
  'nexus-rock': fbRock,
  'nexus-tree': fbTree,
  'nexus-crystal': fbCrystal,
  'nexus-floating-isle': fbIsle,
  'nexus-lantern': fbLantern,
  'statue-guardian': fbStatue,
  'obelisk-rune': fbObelisk,
  'fountain-light': fbFountain,
  'brazier-flame': fbBrazier,
  'bench-stone': fbBench,
  'banner-pole': fbBanner,
  'sundial': fbSundial,
  'arch-small': fbMoonGate,
};

function fbArch(THREE, accent) {
  const g = new THREE.Group();
  const stone = mat(THREE, 0x8a8d96);
  const trim = mat(THREE, accent, { emissive: accent, emissiveIntensity: 0.35, roughness: 0.5 });
  // pillars
  box(THREE, g, 1.2, 6, 1.2, -2.6, 3, 0, stone);
  box(THREE, g, 1.2, 6, 1.2, 2.6, 3, 0, stone);
  // lintel + keystone + trim inlay
  box(THREE, g, 7.4, 1.2, 1.4, 0, 6.6, 0, stone);
  box(THREE, g, 0.9, 1.8, 1.5, 0, 6.4, 0, trim);
  box(THREE, g, 0.25, 5.6, 0.25, -2.6, 3, 0.65, trim);
  box(THREE, g, 0.25, 5.6, 0.25, 2.6, 3, 0.65, trim);
  return { group: g, colliders: [{ x: -2.6, z: 0, r: 1.1 }, { x: 2.6, z: 0, r: 1.1 }] };
}

function fbCore(THREE, accent) {
  const g = new THREE.Group();
  const dais = cyl(THREE, g, 4.2, 4.8, 1.0, 24, 0, 0.5, 0, mat(THREE, 0x3a3f4a));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.5, 0.18, 10, 48),
    mat(THREE, accent, { emissive: accent, emissiveIntensity: 0.8 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.1;
  g.add(ring);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    mat(THREE, 0xcfe8ff, { emissive: accent, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 })
  );
  crystal.position.y = 4.6;
  g.add(crystal);
  void dais;
  const update = (t) => {
    crystal.rotation.y = t * 0.4;
    crystal.position.y = 4.6 + Math.sin(t * 0.9) * 0.35;
  };
  return { group: g, colliders: [{ x: 0, z: 0, r: 5.2 }], update };
}

function fbRock(THREE) {
  const g = new THREE.Group();
  const m = mat(THREE, 0x6b6f75);
  const r1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), m);
  r1.position.set(0, 0.7, 0); r1.rotation.set(0.4, 0.2, 0.1); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), m);
  r2.position.set(1.0, 0.45, 0.4); r2.rotation.set(0.1, 0.8, 0.3); g.add(r2);
  const r3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), m);
  r3.position.set(-0.8, 0.35, 0.5); r3.rotation.set(0.7, 0.4, 0.2); g.add(r3);
  return { group: g, colliders: [{ x: 0.1, z: 0.2, r: 1.5 }] };
}

function fbTree(THREE) {
  const g = new THREE.Group();
  cyl(THREE, g, 0.35, 0.5, 2.6, 8, 0, 1.3, 0, mat(THREE, 0x5b4632));
  const can = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), mat(THREE, 0x3f7a4e, { roughness: 1 }));
  can.position.y = 3.6; g.add(can);
  const can2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), mat(THREE, 0x4c8a5c, { roughness: 1 }));
  can2.position.set(1.1, 2.9, 0.5); g.add(can2);
  return { group: g, colliders: [{ x: 0, z: 0, r: 0.8 }] };
}

function fbCrystal(THREE, accent) {
  const g = new THREE.Group();
  const m = mat(THREE, 0x9a7bd0, { emissive: 0x6a3fb0, emissiveIntensity: 0.45, roughness: 0.25, transparent: true, opacity: 0.9 });
  const base = mat(THREE, 0x2c2f38);
  cyl(THREE, g, 1.3, 1.6, 0.5, 8, 0, 0.25, 0, base);
  const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), m);
  c1.position.set(0, 1.1, 0); c1.scale.y = 1.8; g.add(c1);
  const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), m);
  c2.position.set(0.7, 0.7, 0.3); c2.scale.y = 1.6; c2.rotation.z = 0.3; g.add(c2);
  const c3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), m);
  c3.position.set(-0.6, 0.6, -0.2); c3.scale.y = 1.5; c3.rotation.z = -0.25; g.add(c3);
  void accent;
  return { group: g, colliders: [{ x: 0, z: 0, r: 1.4 }] };
}

function fbIsle(THREE) {
  const g = new THREE.Group();
  const top = cyl(THREE, g, 2.2, 1.4, 1.0, 10, 0, 0, 0, mat(THREE, 0x4c8a5c, { roughness: 1 }));
  const under = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 8), mat(THREE, 0x6b6f75));
  under.rotation.x = Math.PI; under.position.y = -1.7; g.add(under);
  cyl(THREE, g, 0.16, 0.22, 1.4, 6, 0.4, 1.2, 0.2, mat(THREE, 0x5b4632));
  const pine = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 8), mat(THREE, 0x2f6b3e));
  pine.position.set(0.4, 2.4, 0.2); g.add(pine);
  void top;
  return { group: g, colliders: [] }; // floats above the player — no collision
}

function fbLantern(THREE, accent) {
  const g = new THREE.Group();
  const stone = mat(THREE, 0x7a7e88);
  box(THREE, g, 1.0, 0.25, 1.0, 0, 0.12, 0, stone);
  cyl(THREE, g, 0.22, 0.28, 1.1, 6, 0, 0.8, 0, stone);
  box(THREE, g, 0.8, 0.5, 0.8, 0, 1.6, 0, stone);
  const glow = box(THREE, g, 0.6, 0.34, 0.6, 0, 1.6, 0,
    mat(THREE, 0xffd9a0, { emissive: 0xffb84d, emissiveIntensity: 1.2 }));
  box(THREE, g, 1.1, 0.18, 1.1, 0, 1.95, 0, stone);
  void glow; void accent;
  return { group: g, colliders: [{ x: 0, z: 0, r: 0.7 }] };
}

function fbStatue(THREE, accent) {
  const g = new THREE.Group();
  const stone = mat(THREE, 0x9aa0ac);
  box(THREE, g, 1.6, 0.5, 1.6, 0, 0.25, 0, stone);
  cyl(THREE, g, 0.5, 0.65, 0.4, 8, 0, 0.7, 0, stone);
  cyl(THREE, g, 0.42, 0.5, 1.9, 8, 0, 1.85, 0, stone); // robed body
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), stone);
  head.position.set(0, 3.0, 0); g.add(head);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10),
    mat(THREE, accent, { emissive: accent, emissiveIntensity: 1.4 }));
  orb.position.set(0.62, 2.1, 0.25); g.add(orb);
  box(THREE, g, 0.18, 1.1, 0.18, 0.45, 1.9, 0.18, stone); // arm hint
  return { group: g, colliders: [{ x: 0, z: 0, r: 1.0 }] };
}

function fbObelisk(THREE, accent) {
  const g = new THREE.Group();
  box(THREE, g, 1.8, 0.5, 1.8, 0, 0.25, 0, mat(THREE, 0x3a3f4a));
  const ob = cyl(THREE, g, 0.28, 0.75, 4.6, 4, 0, 2.8, 0, mat(THREE, 0x23262e, { roughness: 0.6 }));
  ob.rotation.y = Math.PI / 4;
  const rune = box(THREE, g, 0.1, 3.6, 0.5, 0, 2.8, 0.62,
    mat(THREE, accent, { emissive: accent, emissiveIntensity: 1.1 }));
  void rune;
  return { group: g, colliders: [{ x: 0, z: 0, r: 1.1 }] };
}

function fbFountain(THREE, accent) {
  const g = new THREE.Group();
  const marble = mat(THREE, 0xb9bec9);
  const water = mat(THREE, 0x5fb8e8, { transparent: true, opacity: 0.75, roughness: 0.2 });
  cyl(THREE, g, 2.4, 2.6, 0.5, 20, 0, 0.25, 0, marble);
  cyl(THREE, g, 2.1, 2.1, 0.25, 20, 0, 0.55, 0, water);
  cyl(THREE, g, 0.28, 0.34, 1.6, 10, 0, 1.2, 0, marble);
  cyl(THREE, g, 1.3, 1.4, 0.35, 16, 0, 2.0, 0, marble);
  cyl(THREE, g, 1.1, 1.1, 0.18, 16, 0, 2.2, 0, water);
  const jet = cyl(THREE, g, 0.12, 0.2, 1.1, 8, 0, 2.9, 0,
    mat(THREE, accent, { emissive: accent, emissiveIntensity: 0.9, transparent: true, opacity: 0.8 }));
  void jet;
  return { group: g, colliders: [{ x: 0, z: 0, r: 2.8 }] };
}

function fbBrazier(THREE, accent) {
  const g = new THREE.Group();
  const bronze = mat(THREE, 0x7a5a2e, { metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(THREE, g, 0.07, 0.07, 1.3, 6, Math.cos(a) * 0.4, 0.6, Math.sin(a) * 0.4, bronze);
    leg.rotation.z = Math.cos(a) * 0.35;
    leg.rotation.x = -Math.sin(a) * 0.35;
  }
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze);
  bowl.rotation.x = Math.PI; bowl.position.y = 1.35; g.add(bowl);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8),
    mat(THREE, 0xff9a3d, { emissive: 0xff7a1d, emissiveIntensity: 1.6 }));
  flame.position.y = 1.75; g.add(flame);
  void accent;
  return { group: g, colliders: [{ x: 0, z: 0, r: 0.7 }] };
}

function fbBench(THREE) {
  const g = new THREE.Group();
  const stone = mat(THREE, 0x8a8d96);
  box(THREE, g, 2.2, 0.28, 0.7, 0, 0.62, 0, stone);
  box(THREE, g, 0.35, 0.5, 0.6, -0.8, 0.25, 0, stone);
  box(THREE, g, 0.35, 0.5, 0.6, 0.8, 0.25, 0, stone);
  return { group: g, colliders: [{ x: 0, z: 0, r: 1.2 }] };
}

function fbBanner(THREE, accent) {
  const g = new THREE.Group();
  cyl(THREE, g, 0.09, 0.11, 4.4, 8, 0, 2.2, 0, mat(THREE, 0x5b4632));
  box(THREE, g, 0.7, 0.12, 0.12, 0.35, 4.1, 0, mat(THREE, 0x5b4632));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2),
    mat(THREE, accent, { side: 2, roughness: 0.9 }));
  cloth.position.set(0.35, 2.9, 0); g.add(cloth);
  return { group: g, colliders: [{ x: 0, z: 0, r: 0.5 }] };
}

function fbSundial(THREE, accent) {
  const g = new THREE.Group();
  const bronze = mat(THREE, 0x8a6a3a, { metalness: 0.6, roughness: 0.45 });
  cyl(THREE, g, 0.4, 0.5, 1.1, 10, 0, 0.55, 0, mat(THREE, 0x9aa0ac));
  const dial = cyl(THREE, g, 0.85, 0.85, 0.1, 20, 0, 1.2, 0, bronze);
  dial.rotation.z = 0.35;
  box(THREE, g, 0.08, 0.7, 0.5, 0, 1.5, 0, bronze);
  void accent;
  return { group: g, colliders: [{ x: 0, z: 0, r: 0.7 }] };
}

function fbMoonGate(THREE, accent) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.45, 10, 28), mat(THREE, 0x7a7e88));
  ring.position.y = 2.1; g.add(ring);
  box(THREE, g, 0.9, 0.5, 0.9, -1.9, 0.25, 0, mat(THREE, 0x7a7e88));
  box(THREE, g, 0.9, 0.5, 0.9, 1.9, 0.25, 0, mat(THREE, 0x7a7e88));
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 8, 28),
    mat(THREE, accent, { emissive: accent, emissiveIntensity: 0.6 }));
  trim.position.y = 2.1; g.add(trim);
  // Moon gates are walk-THROUGH decoration: no collider on the ring itself.
  return { group: g, colliders: [{ x: -1.9, z: 0, r: 0.6 }, { x: 1.9, z: 0, r: 0.6 }] };
}

/**
 * Load one manifest asset.
 *
 * @param {object} THREE - the three module
 * @param {Function} GLTFLoader - three's GLTFLoader class
 * @param {object} scene - the THREE.Scene to add to
 * @param {object} entry - manifest asset entry {id, category, prompt}
 * @param {object} opts - {x, y, z, rotationY, scale, accent}
 * @returns {Promise<{group, colliders:[{x,z,r}], generated:boolean, update?:function}>}
 */
export async function loadAsset(THREE, GLTFLoader, scene, entry, opts = {}) {
  const { x = 0, y = 0, z = 0, rotationY = 0, scale = 1, accent = 0xc9a86a } = opts;
  const group = new THREE.Group();
  const colliders = [];
  let generated = false;
  let update = null;

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`${MODEL_BASE}/${entry.id}.glb`);
    const model = gltf.scene;
    model.scale.setScalar(scale);
    group.add(model);
    generated = true;
    // Collider from the model's bounding box (circle approximation).
    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const r = Math.max(size.x, size.z) / 2;
    if (r > 0.05 && entry.category !== 'landscape' && entry.id !== 'nexus-floating-isle') {
      colliders.push({ x, z, r: Math.min(r, 6) });
    } else if (r > 0.05) {
      colliders.push({ x, z, r: Math.min(r, 6) });
    }
  } catch (_) {
    // Missing or broken GLB -> clean procedural placeholder, same footprint.
    const builder = FALLBACKS[entry.id];
    if (builder) {
      const fb = builder(THREE, accent);
      fb.group.scale.setScalar(scale);
      group.add(fb.group);
      for (const c of fb.colliders) colliders.push({ x: x + c.x, z: z + c.z, r: c.r * scale });
      if (fb.update) update = fb.update;
    }
    generated = false;
  }

  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  scene.add(group);
  return { group, colliders, generated, update };
}
