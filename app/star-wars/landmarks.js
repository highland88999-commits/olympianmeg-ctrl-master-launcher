/*
 * STAR WARS pocket universe — landmark & ambient-creature builders.
 *
 * buildLandmark(type, THREE, T) -> { group, colliders }
 *   colliders are [{x, z, r}] circles in LANDMARK-LOCAL space
 *   (origin at the landmark base center). zone.js offsets them to world.
 * buildAmbient(type, THREE, T) -> { group, update(t, dt) }
 *
 * Perf: every mesh gets castShadow=false / receiveShadow=false, materials use
 * flatShading. Emissive accents are small MeshBasicMaterial bits only —
 * localized glow, never a texture wash.
 */
import * as ThreeJS from 'three';
import { surfaceMaps } from '../../lib/earth4/creature-textures.js';

/* THREE may be passed in (page shell / tests) — fall back to the import. */
function R3(THREE) { return THREE || ThreeJS; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Flat-shaded standard material. opts.tex = { family, seed,
 * roughness? } paints the house creature-surface maps
 * (lib/earth4/creature-textures.js: seeded fur / feather / scale /
 * chitin / skin / keratin / bark DataTextures, cached per
 * family+seed) over the colour — the map carries the surface
 * structure, the colour carries the hue. */
function M(R, color, opts) {
  const o = Object.assign(
    { color: color, flatShading: true, roughness: 0.92, metalness: 0.05 }, opts || {});
  if (o.tex) {
    const maps = surfaceMaps(o.tex.family, o.tex.seed);
    o.map = maps.map;
    o.bumpMap = maps.bumpMap;
    o.bumpScale = maps.bumpScale;
    if (o.tex.roughness != null) o.roughness = o.tex.roughness;
    delete o.tex;
  }
  return new R.MeshStandardMaterial(o);
}
/* Localized "emissive" accent — unlit, cheap. */
function E(R, color, opts) {
  return new R.MeshBasicMaterial(Object.assign({ color: color }, opts || {}));
}
function mesh(R, geo, material, x, y, z, ry) {
  const m = new R.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  if (ry) m.rotation.y = ry;
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
/* Per-vertex color jitter on a geometry (needs material.vertexColors=true). */
function tintGeo(R, geo, base, amt, rand) {
  const c = new R.Color(base);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 1 + (rand() - 0.5) * amt;
    cols[i * 3] = Math.min(1, c.r * v);
    cols[i * 3 + 1] = Math.min(1, c.g * v);
    cols[i * 3 + 2] = Math.min(1, c.b * v);
  }
  geo.setAttribute('color', new R.BufferAttribute(cols, 3));
  return geo;
}
function done(R, group, colliders) {
  group.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: group, colliders: colliders || [] };
}
function dome(R, r, ws, hs) {
  return new R.SphereGeometry(r, ws || 12, hs || 8, 0, Math.PI * 2, 0, Math.PI / 2);
}

export const LANDMARK_TYPES = [
  'mos-eisley', 'moisture-farm', 'podrace-arch', 'beggars-canyon', 'podracer', 'theed-palace',
  'jedi-temple', 'kyber-forge', 'senate-dome', 'tipoca-city', 'geonosis-arena', 'droid-foundry',
  'mustafar-fortress', 'lava-falls', 'yavin-temple', 'echo-base', 'swamp-hut',
  'cloud-city', 'shield-generator', 'ewok-village', 'niima-outpost', 'maz-castle',
  'starkiller-cannon', 'jedi-village', 'salt-arch', 'sith-citadel', 'sith-throne',
  'death-star', 'debris-field', 'star-destroyer', 'cantina', 'landspeeder', 'crashed-ship',
];

/* ------------------------------------------------------------------
 * GLB seats — real Tripo models that REPLACE a landmark's procedural
 * stand-in when they arrive. A data.js landmark entry opts in with
 * `model: '<key>'`; zone.js then uses the registry colliders (local
 * space, after the metres fit below) and calls attachGlbModel.
 *
 * The files are meshopt-compressed + WebP (unrigged pipeline), so the
 * loader carries the MeshoptDecoder — the house pattern from
 * lib/hawkins/loader.js. Loading is async and best-effort: if it
 * fails (or there is no window, e.g. node tests), the procedural
 * stand-in simply stays.
 * ------------------------------------------------------------------ */
export const GLB_MODELS = {
  homestead: {
    url: '/models/star-wars/homestead.glb',
    meters: 17, // largest horizontal extent after fitting
    // bounding radius (8.5) + a small stop margin so the camera
    // never clips the wall skin
    colliders: [{ x: 0, z: 0, r: 8.9 }],
  },
  cantina: {
    url: '/models/star-wars/cantina.glb',
    meters: 15,
    colliders: [{ x: 0, z: 0, r: 8.4 }],
  },
  /* NOTE (Nov 15, 2026): the 'tatooine-rover' seat was REMOVED with
   * the rover itself — its GLB was a rigged Tripo export whose broken
   * skinning twisted its own undercarriage into the spiky mass the
   * truck sat on (see the crash-site note on the Tatooine def). The
   * file still exists on the shared vehicle shelf because Earth 2's
   * fleet references it (lib/earth/vehicles.js) — it is simply no
   * longer seated anywhere in Star Wars. */
  landspeeder: {
    url: '/models/star-wars/landspeeder.glb',
    meters: 5.6,
    // The fitted hull spans +/-2.8 on its long axis; r 2.4 let the
    // camera clip the nose/tail. 2.9 covers it with margin.
    colliders: [{ x: 0, z: 0, r: 2.9 }],
    /* Measured from the GLB geometry (z-slice profiles): the nose
     * tapers at +Z. The drive system (vehicles.js) drives toward
     * the landmark group's -Z, so the fitted model turns half a
     * turn inside its slot. One constant to flip if it ever reads
     * backward on device. */
    yawFix: Math.PI,
  },
};

/**
 * Load GLB_MODELS[key] into a slot inside `holder` (the landmark's
 * group), normalised: largest horizontal extent -> def.meters, base
 * on y=0, centred on x/z. On arrival the holder's other children (the
 * procedural stand-in) are hidden. Returns the slot group, or null
 * when loading can't happen here. Never throws.
 */
export function attachGlbModel(R, holder, key) {
  const def = GLB_MODELS[key];
  if (!def || !holder || typeof window === 'undefined') return null;
  const slot = new R.Group();
  slot.name = 'glb:' + key;
  if (def.yawFix) slot.rotation.y = def.yawFix;
  holder.add(slot);
  (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(def.url);
      const model = gltf.scene;
      const box = new R.Box3().setFromObject(model);
      const size = new R.Vector3(); box.getSize(size);
      const center = new R.Vector3(); box.getCenter(center);
      const fit = def.meters / Math.max(size.x, size.z, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      slot.add(model);
      for (const child of [...holder.children]) {
        /* keepVisible children (e.g. zone.js exhaust flames) ride on
         * the group, not the stand-in — hiding them would kill the
         * effect the moment the GLB arrives. */
        if (child !== slot && !child.userData.keepVisible) child.visible = false;
      }
      holder.userData.glbModel = key;
    } catch (e) {
      /* the procedural stand-in stays — by design */
    }
  })();
  return slot;
}

const BUILDERS = {
  /* Tatooine — cluster of 5-7 domes + one tall tower. */
  'mos-eisley': function (R) {
    const g = new R.Group(), rand = mulberry32(21);
    const sand = M(R, 0xd9b57c), dark = M(R, 0xb08d58);
    for (let i = 0; i < 6; i++) {
      const r = 3 + rand() * 2.5, a = (i / 6) * Math.PI * 2;
      g.add(mesh(R, dome(R, r), i % 2 ? sand : dark, Math.cos(a) * 7, 0, Math.sin(a) * 7));
    }
    g.add(mesh(R, dome(R, 4.5), sand, 0, 0, 0));
    g.add(mesh(R, new R.CylinderGeometry(1.6, 2.4, 22, 8), dark, 9, 11, -6));
    g.add(mesh(R, dome(R, 2.2), sand, 9, 22, -6));
    // r 13.5: the tower base at (9,-6) reaches 10.8 + 2.4 = 13.2.
    return done(R, g, [{ x: 0, z: 0, r: 13.5 }]);
  },
  /* Tatooine — igloo dome + 3 vaporator poles. */
  'moisture-farm': function (R) {
    const g = new R.Group();
    const wall = M(R, 0xe6ddc8), pole = M(R, 0x8f959c, { metalness: 0.6, roughness: 0.5 });
    g.add(mesh(R, dome(R, 6, 14, 10), wall, 0, 0, 0));
    g.add(mesh(R, new R.CylinderGeometry(1.2, 1.2, 1.5, 8), M(R, 0xb9ac8f), 0, 0.4, 7));
    const cols = [{ x: 0, z: 0, r: 8.4 }]; // dome r6 + entrance drum at z7 (reaches 8.2)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5, x = Math.cos(a) * 11, z = Math.sin(a) * 11;
      g.add(mesh(R, new R.CylinderGeometry(0.25, 0.35, 9, 6), pole, x, 4.5, z));
      g.add(mesh(R, new R.BoxGeometry(2.4, 0.25, 0.25), pole, x, 8.2, z, a));
      g.add(mesh(R, new R.BoxGeometry(0.9, 0.9, 0.9), pole, x, 9, z));
      // the poles stand at ring 11, far outside the dome's circle —
      // each carries its own collider (all-worlds QA, 2026-10-23)
      cols.push({ x: x, z: z, r: 0.6 });
    }
    return done(R, g, cols);
  },
  /* Tatooine — two stone pillars + top beam (podrace start arch). */
  'podrace-arch': function (R) {
    const g = new R.Group();
    const stone = M(R, 0x9a7f5e, { vertexColors: false });
    const rand = mulberry32(23);
    for (const s of [-1, 1]) {
      g.add(mesh(R, tintGeo(R, new R.BoxGeometry(3, 16, 3), 0x9a7f5e, 0.25, rand),
        M(R, 0xffffff, { vertexColors: true }), s * 6, 8, 0));
      g.add(mesh(R, new R.BoxGeometry(4, 1.5, 4), stone, s * 6, 0.7, 0));
    }
    g.add(mesh(R, new R.BoxGeometry(16, 2.5, 3.5), stone, 0, 17, 0));
    // r 2.9: the pillar's square base (4 x 4) has a 2.83 half-diagonal
    return done(R, g, [{ x: -6, z: 0, r: 2.9 }, { x: 6, z: 0, r: 2.9 }]);
  },
  /* Tatooine — two long rock walls forming a gap. */
  'beggars-canyon': function (R) {
    const g = new R.Group(), rand = mulberry32(24);
    const rockMat = M(R, 0xffffff, { vertexColors: true });
    const cols = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const h = 10 + rand() * 6, z = -30 + i * 20;
        const geo = tintGeo(R, new R.BoxGeometry(8, h, 18), 0x8a6f52, 0.35, rand);
        g.add(mesh(R, geo, rockMat, s * 11, h / 2 - 1, z, (rand() - 0.5) * 0.2));
        // one circle per wall block left the block's long ends open
        // (18 m of wall, r 5.5) — a three-circle chain per block
        for (const dz of [-5.8, 0, 5.8]) cols.push({ x: s * 11, z: z + dz, r: 5.8 });
      }
    }
    return done(R, g, cols);
  },
  /* Tatooine — podracer: two engines with an energy beam, cockpit pod behind. */
  'podracer': function (R) {
    const g = new R.Group();
    const hull = M(R, 0xb8bcc2, { metalness: 0.65, roughness: 0.35 });
    const orange = M(R, 0xd96c27, { metalness: 0.45, roughness: 0.45 });
    const dark = M(R, 0x2b2f35, { metalness: 0.55, roughness: 0.45 });
    for (const s of [-1, 1]) {
      const engine = mesh(R, new R.CylinderGeometry(0.9, 0.75, 4.6, 12), hull, s * 2.4, 1.15, -0.6);
      engine.rotation.x = Math.PI / 2; g.add(engine);
      const intake = mesh(R, new R.CylinderGeometry(1.05, 0.9, 0.7, 12), orange, s * 2.4, 1.15, -3.1);
      intake.rotation.x = Math.PI / 2; g.add(intake);
      g.add(mesh(R, new R.SphereGeometry(0.42, 8, 6), E(R, 0x7fe7ff), s * 2.4, 1.15, -3.55));
      g.add(mesh(R, new R.BoxGeometry(0.18, 1.1, 1.4), orange, s * 2.4, 2, 1.5));
      const cable = mesh(R, new R.BoxGeometry(0.12, 0.12, 4.6), dark, s * 1.2, 1, 1.6);
      cable.rotation.y = s * 0.52; g.add(cable);
    }
    /* THE ENERGY BEAM (Nov 15, 2026 — Merlin's purple/pink band):
     * the old beam was one opaque flat magenta bar (0xd76bff,
     * opacity 0.9) floating between the engines — from the chase
     * camera it read as a painted stripe across the ground, not as
     * part of the pod. It is now a two-layer ADDITIVE energy tether:
     * a thin near-white core inside a soft violet halo, both
     * additive so the dune shows through and the eye reads LIGHT,
     * plus small violet anchors where it meets the engine intakes.
     * Same span (engine to engine), same place — it just reads as
     * energy now. The halo alone carries userData.pulse. */
    const beamCore = mesh(R, new R.BoxGeometry(4.8, 0.09, 0.09),
      new R.MeshBasicMaterial({ color: 0xefe4ff, transparent: true, opacity: 0.85,
        blending: R.AdditiveBlending, depthWrite: false, fog: false }), 0, 1.15, -3.1);
    g.add(beamCore);
    const beamHalo = mesh(R, new R.BoxGeometry(4.8, 0.3, 0.3),
      new R.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.32,
        blending: R.AdditiveBlending, depthWrite: false, fog: false }), 0, 1.15, -3.1);
    beamHalo.userData.pulse = true; g.add(beamHalo);
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.SphereGeometry(0.16, 8, 6),
        new R.MeshBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.8,
          blending: R.AdditiveBlending, depthWrite: false, fog: false }), s * 2.4, 1.15, -3.1));
    }
    const pod = mesh(R, new R.SphereGeometry(1.15, 12, 9), orange, 0, 0.95, 3.4);
    pod.scale.set(0.95, 0.8, 1.9); g.add(pod);
    const canopy = mesh(R, new R.SphereGeometry(0.55, 9, 7), dark, 0, 1.55, 2.9);
    canopy.scale.set(0.9, 0.65, 1.3); g.add(canopy);
    g.add(mesh(R, new R.BoxGeometry(1.5, 0.16, 0.9), hull, 0, 0.55, 5.4));
    /* Colliders must cover the VISUAL hull, not its centre points.
     * The old three circles (one per engine centre, one for the pod)
     * left the intake + glow ball (z to -3.97) and the pod nose
     * (z to 1.22) poking past the stop radius, and an open corridor
     * between the engines — Merlin walked straight through an engine
     * block on device (2026-10-23). Now an overlapping chain: two
     * circles per engine along its long axis, one on the beam, one
     * amidships sealing the corridor, one on the pod. */
    return done(R, g, [
      { x: -2.4, z: -2.3, r: 1.75 }, { x: -2.4, z: 0.7, r: 1.5 },
      { x: 2.4, z: -2.3, r: 1.75 }, { x: 2.4, z: 0.7, r: 1.5 },
      { x: 0, z: -3.1, r: 1.3 }, { x: 0, z: -0.4, r: 1.7 }, { x: 0, z: 3.4, r: 2.3 },
    ]);
  },
  /* Naboo — grand domed palace + columns + plaza disc. */
  'theed-palace': function (R) {
    const g = new R.Group();
    const cream = M(R, 0xe9dfc8), patina = M(R, 0x5f8f7a), gold = M(R, 0xc9a227, { metalness: 0.5, roughness: 0.4 });
    g.add(mesh(R, new R.CylinderGeometry(16, 16, 1, 32), M(R, 0xb9ac96), 0, 0.5, 0)); // plaza
    g.add(mesh(R, new R.BoxGeometry(22, 8, 14), cream, 0, 4.5, -4));
    g.add(mesh(R, dome(R, 7, 18, 12), patina, 0, 8.5, -4));
    g.add(mesh(R, new R.SphereGeometry(0.9, 8, 6), gold, 0, 16.4, -4));
    for (let i = -2; i <= 2; i++) g.add(mesh(R, new R.CylinderGeometry(0.7, 0.8, 7, 8), cream, i * 5, 4, 4.5));
    g.add(mesh(R, new R.BoxGeometry(26, 1.2, 3), cream, 0, 8, 4.5)); // entablature
    /* The main block's half-diagonal is 13.04 (r 13 clipped its
     * corners), and the two outer columns stand at (+/-10, 4.5) —
     * 13.1 from the centre, OUTSIDE the old circle: each column now
     * carries its own collider. The plaza disc (1 m) is a step, not
     * a wall — deliberately uncollided, like the throne's tiers. */
    const cols = [{ x: 0, z: -4, r: 13.2 }];
    for (let i = -2; i <= 2; i++) cols.push({ x: i * 5, z: 4.5, r: 1 });
    return done(R, g, cols);
  },
  /* Coruscant — stepped ziggurat + 5 spires. */
  'jedi-temple': function (R) {
    const g = new R.Group();
    const stone = M(R, 0xcfc39f);
    let w = 30;
    for (let i = 0; i < 4; i++) {
      g.add(mesh(R, new R.BoxGeometry(w, 4, w), stone, 0, 2 + i * 4, 0));
      w -= 6;
    }
    const top = 2 + 3 * 4 + 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 6, z = Math.sin(a) * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.2, 1.8, 14, 6), stone, x, top + 7, z));
      g.add(mesh(R, new R.ConeGeometry(1.6, 3, 6), M(R, 0x8f8468), x, top + 15.5, z));
    }
    g.add(mesh(R, new R.CylinderGeometry(2, 2.6, 10, 8), stone, 0, top + 5, 0));
    /* The base step is a 30 x 30 square: one r15 circle touches its
     * faces but leaves the corners (21.2) wide open — corner circles
     * complete the coverage (all-worlds QA, 2026-10-23). */
    const cols = [{ x: 0, z: 0, r: 15.6 }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cols.push({ x: sx * 10.6, z: sz * 10.6, r: 8.2 });
    }
    return done(R, g, cols);
  },
  /* Coruscant — the Kyber Smith's forge (patron smith, 2026-10-24):
   * a stone plinth at the temple's edge, a kyber crystal singing
   * above an anvil. Sits clear of the temple's corner colliders
   * (placed at 24,-30 in data.js — ~19 m from the nearest corner). */
  'kyber-forge': function (R) {
    const g = new R.Group();
    const stone = M(R, 0xcfc39f);
    g.add(mesh(R, new R.BoxGeometry(6, 1, 5), stone, 0, 0.5, 0));
    g.add(mesh(R, new R.CylinderGeometry(0.5, 0.7, 2.6, 8), stone, -1.8, 2.3, -1.2));
    g.add(mesh(R, new R.BoxGeometry(1.4, 0.3, 0.6), M(R, 0x3a3f52, { metalness: 0.6, roughness: 0.4 }), 1.2, 1.15, 0.8));
    const crystal = new R.Mesh(new R.OctahedronGeometry(0.9), E(R, 0x7fe8ff));
    crystal.position.set(0, 2.6, 0);
    g.add(crystal);
    const halo = new R.Mesh(new R.TorusGeometry(1.6, 0.08, 6, 24), E(R, 0x7fe8ff));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 1.1, 0);
    g.add(halo);
    return done(R, g, [{ x: 0, z: 0, r: 4 }]);
  },
  /* Coruscant — large hemisphere dome. */
  'senate-dome': function (R) {
    const g = new R.Group();
    const shell = M(R, 0xb9b3a4);
    g.add(mesh(R, new R.CylinderGeometry(19, 20, 3, 28), M(R, 0x9d968a), 0, 1.5, 0));
    g.add(mesh(R, dome(R, 18, 28, 16), shell, 0, 3, 0));
    g.add(mesh(R, new R.SphereGeometry(1.4, 10, 8), M(R, 0xc9a227, { metalness: 0.5, roughness: 0.4 }), 0, 21.6, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(mesh(R, new R.BoxGeometry(1.6, 2.4, 0.5), E(R, 0x9fd8ff), Math.cos(a) * 18.4, 6, Math.sin(a) * 18.4, -a));
    }
    // the drum flares to r 20 at the ground — the collider meets the
    // flare, not the r 19 top
    return done(R, g, [{ x: 0, z: 0, r: 20.2 }]);
  },
  /* Kamino — 3 stilt platforms over a water disc + bridges. */
  'tipoca-city': function (R, T) {
    const g = new R.Group();
    const water = new R.MeshStandardMaterial({ color: 0x2a6f9e, map: T.waterTexture(), roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.96 });
    water.map.repeat.set(6, 6);
    const disc = mesh(R, new R.CylinderGeometry(30, 30, 1, 32), water, 0, 0.2, 0);
    disc.userData.pulse = true; g.add(disc);
    const white = M(R, 0xdde3e8, { metalness: 0.3, roughness: 0.5 });
    const cols = [];
    const spots = [[-12, -6], [10, -8], [0, 12]];
    for (const [px, pz] of spots) {
      for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]])
        g.add(mesh(R, new R.CylinderGeometry(0.5, 0.6, 8, 6), white, px + lx, 4, pz + lz));
      g.add(mesh(R, new R.CylinderGeometry(6, 6.6, 2.5, 12), white, px, 9, pz));
      g.add(mesh(R, dome(R, 4, 12, 8), white, px, 10.2, pz));
      cols.push({ x: px, z: pz, r: 6 });
    }
    g.add(mesh(R, new R.BoxGeometry(24, 0.6, 2), white, -1, 8.6, -7, 0.35));
    g.add(mesh(R, new R.BoxGeometry(2, 0.6, 20), white, 5, 8.6, 2, 0.3));
    return done(R, g, cols);
  },
  /* Geonosis — rock bowl: ring wall + spires. */
  'geonosis-arena': function (R) {
    const g = new R.Group(), rand = mulberry32(25);
    const rockMat = M(R, 0xffffff, { vertexColors: true });
    const wall = tintGeo(R, new R.CylinderGeometry(20, 23, 10, 18, 1, true), 0xa0663a, 0.3, rand);
    const wm = mesh(R, wall, rockMat, 0, 5, 0); wm.material.side = R.DoubleSide; g.add(wm);
    const cols = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, h = 14 + rand() * 8;
      g.add(mesh(R, tintGeo(R, new R.ConeGeometry(2.5, h, 7), 0x96603a, 0.3, rand),
        rockMat, Math.cos(a) * 24, h / 2, Math.sin(a) * 24));
      cols.push({ x: Math.cos(a) * 24, z: Math.sin(a) * 24, r: 2.7 });
    }
    g.add(mesh(R, tintGeo(R, new R.ConeGeometry(3, 12, 7), 0x8a5636, 0.3, rand), rockMat, 0, 6, 0));
    /* The wall stands at r 20–23 but the old collider was r 14 —
     * the walker crossed the wall ring and stopped INSIDE the bowl
     * wall's far side (all-worlds QA, 2026-10-23). The wall has no
     * gate in its geometry, so the honest collider is the wall
     * itself: one circle at the wall's ground flare (23). The
     * mission gate completes at the wall face, outside. */
    cols.push({ x: 0, z: 0, r: 23.4 });
    return done(R, g, cols);
  },
  /* Geonosis — dark factory block + chimney stacks. */
  'droid-foundry': function (R) {
    const g = new R.Group(), rand = mulberry32(26);
    const dark = M(R, 0x2b2b30, { metalness: 0.4, roughness: 0.6 });
    g.add(mesh(R, new R.BoxGeometry(24, 10, 16), dark, 0, 5, 0));
    g.add(mesh(R, new R.BoxGeometry(26, 2, 18), M(R, 0x1d1d22), 0, 11, 0));
    for (let i = 0; i < 4; i++) {
      const x = -9 + i * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.2, 1.6, 12, 8), dark, x, 16, -4 + (rand() - 0.5) * 4));
      g.add(mesh(R, new R.SphereGeometry(0.9, 8, 6), E(R, 0xff7a1f, { transparent: true, opacity: 0.9 }), x, 22.2, -4));
    }
    for (let i = 0; i < 5; i++)
      g.add(mesh(R, new R.BoxGeometry(1.4, 2, 0.4), E(R, 0xffc23d), -10 + i * 5, 5, 8.1));
    /* The block is 24 x 16 (half-diagonal 14.4): one r11 circle let
     * the walker through its faces, let alone the corners — a
     * four-circle chain covers the rectangle. */
    const cols = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cols.push({ x: sx * 6, z: sz * 4, r: 8 });
    }
    return done(R, g, cols);
  },
  /* Mustafar — black angular fortress + red emissive slits. */
  'mustafar-fortress': function (R) {
    const g = new R.Group();
    const obs = M(R, 0x0e0d0f, { metalness: 0.3, roughness: 0.5 });
    const main = mesh(R, new R.BoxGeometry(16, 22, 12), obs, 0, 11, 0); main.rotation.y = 0.3; g.add(main);
    const wing = mesh(R, new R.BoxGeometry(10, 14, 18), obs, -10, 7, 4); wing.rotation.y = -0.4; g.add(wing);
    g.add(mesh(R, new R.ConeGeometry(5, 10, 4), obs, 6, 27, -2, 0.5));
    for (let i = 0; i < 4; i++)
      g.add(mesh(R, new R.BoxGeometry(0.5, 8, 0.5), E(R, 0xff2a1a), 8.1, 6 + i * 3.4, -2 + (i % 2) * 3, 0.3));
    for (let i = 0; i < 3; i++)
      g.add(mesh(R, new R.BoxGeometry(6, 0.5, 0.5), E(R, 0xff2a1a), -10, 4 + i * 3.5, 13.2, -0.4));
    /* The wing block (10 x 18, rotated) reaches 10.3 from its own
     * centre at (-10, 4) — far outside the main block's circle. */
    return done(R, g, [{ x: 0, z: 0, r: 12 }, { x: -10, z: 4, r: 10.5 }]);
  },
  /* Mustafar — rock cliff + emissive lava-fall strips. */
  'lava-falls': function (R, T) {
    const g = new R.Group(), rand = mulberry32(27);
    const cliff = mesh(R, tintGeo(R, new R.BoxGeometry(14, 20, 6), 0x2a2018, 0.35, rand),
      M(R, 0xffffff, { vertexColors: true }), 0, 10, 0);
    g.add(cliff);
    for (let i = 0; i < 3; i++) {
      const strip = mesh(R, new R.PlaneGeometry(1.6, 18),
        new R.MeshBasicMaterial({ map: T.lavaTexture(), transparent: true, opacity: 0.95 }), -4 + i * 4, 9.5, 3.1);
      strip.userData.pulse = true; g.add(strip);
    }
    const pool = mesh(R, new R.CircleGeometry(9, 20),
      new R.MeshBasicMaterial({ map: T.lavaTexture(), transparent: true, opacity: 0.95 }), 0, 0.3, 8);
    pool.rotation.x = -Math.PI / 2; pool.userData.pulse = true; g.add(pool);
    // the cliff block is 14 x 6 (half-diagonal 7.6); the lava pool
    // is a ground decal — a surface, not a hull — and stays open
    return done(R, g, [{ x: 0, z: 0, r: 7.7 }]);
  },
  /* Yavin 4 — stepped stone pyramid. */
  'yavin-temple': function (R) {
    const g = new R.Group(), rand = mulberry32(28);
    const stoneMat = M(R, 0xffffff, { vertexColors: true });
    let w = 26;
    for (let i = 0; i < 5; i++) {
      g.add(mesh(R, tintGeo(R, new R.BoxGeometry(w, 3.4, w), 0x8f8a76, 0.22, rand), stoneMat, 0, 1.7 + i * 3.4, 0, (i % 2) * 0.06));
      w -= 4.4;
    }
    g.add(mesh(R, new R.BoxGeometry(4, 3, 6), M(R, 0x6e6a5c), 0, 18.4, 3));
    /* The base step is a 26 x 26 square (half-diagonal 18.4): one
     * r12 circle covered neither its faces (13) nor its corners —
     * centre + corner circles, the jedi-temple pattern. */
    const cols = [{ x: 0, z: 0, r: 13.4 }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cols.push({ x: sx * 9.2, z: sz * 9.2, r: 7 });
    }
    return done(R, g, cols);
  },
  /* Hoth — ice arch hangar entrance + trench walls. */
  'echo-base': function (R) {
    const g = new R.Group();
    const ice = M(R, 0xd6e8f5, { roughness: 0.35 });
    const arch = mesh(R, new R.TorusGeometry(7, 2.2, 10, 20, Math.PI), ice, 0, 2, 0);
    g.add(arch);
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(3, 9, 4), ice, s * 8.5, 4.5, 0));
      g.add(mesh(R, new R.BoxGeometry(3, 6, 26), ice, s * 8.5, 3, -14));
    }
    g.add(mesh(R, new R.BoxGeometry(4, 1.6, 0.6), E(R, 0x9fd8ff), 0, 8.6, 0.6));
    /* The trench walls run 26 m (z -1 to -27) but carried colliders
     * only at their ends and middle — the walker entered the wall
     * anywhere along its length. A chain per wall now. */
    const cols = [];
    for (const s of [-1, 1]) {
      for (const z of [0, -5.5, -11, -16.5, -22, -26.5]) {
        cols.push({ x: s * 8.5, z: z, r: 3.2 });
      }
    }
    return done(R, g, cols);
  },
  /* Dagobah — hut on stilts + roots. */
  'swamp-hut': function (R) {
    const g = new R.Group(), rand = mulberry32(29);
    const wood = M(R, 0x5d4a33);
    for (const [lx, lz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]])
      g.add(mesh(R, new R.CylinderGeometry(0.35, 0.45, 5, 6), wood, lx, 2.5, lz));
    g.add(mesh(R, new R.BoxGeometry(7, 3.4, 6), M(R, 0x6e5a3e), 0, 6.6, 0));
    g.add(mesh(R, new R.ConeGeometry(5.4, 3.4, 8), M(R, 0x4a5d2e), 0, 10, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const root = mesh(R, new R.ConeGeometry(0.5, 3.5, 5), wood, Math.cos(a) * 5, 1.2, Math.sin(a) * 5);
      root.rotation.z = Math.cos(a) * 0.5; root.rotation.x = -Math.sin(a) * 0.5; g.add(root);
    }
    g.add(mesh(R, new R.BoxGeometry(1.6, 2.2, 0.4), E(R, 0xffd98a), 0, 6.2, 3.1));
    /* The roots flare past the hut's r5 circle (their tips reach
     * ~6.3): one small collider per root. */
    const cols = [{ x: 0, z: 0, r: 5 }];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cols.push({ x: Math.cos(a) * 5, z: Math.sin(a) * 5, r: 1.2 });
    }
    return done(R, g, cols);
  },
  /* Bespin — wide disc + towers on a tapered repulsor column. */
  'cloud-city': function (R, T) {
    const g = new R.Group();
    const white = M(R, 0xe8e4da, { metalness: 0.35, roughness: 0.45 });
    g.add(mesh(R, new R.CylinderGeometry(3.5, 11, 38, 12), M(R, 0xb9b3a4), 0, 19, 0)); // column
    g.add(mesh(R, new R.CylinderGeometry(26, 21, 4.5, 26), white, 0, 40, 0)); // disc
    const rand = mulberry32(30);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 12, z = Math.sin(a) * 12;
      const h = 8 + rand() * 10;
      g.add(mesh(R, new R.CylinderGeometry(1.8, 2.4, h, 8), white, x, 42 + h / 2, z));
      g.add(mesh(R, new R.SphereGeometry(2.4, 10, 8), white, x, 42 + h + 1.4, z));
    }
    g.add(mesh(R, new R.CylinderGeometry(3, 4, 16, 10), white, 0, 50, 0));
    const glow = new R.Sprite(new R.SpriteMaterial({ map: T.glowSprite(), color: 0x9fd8ff, transparent: true, opacity: 0.85, depthWrite: false }));
    glow.scale.set(16, 16, 1); glow.position.set(0, 2, 0); glow.userData.pulse = true; g.add(glow);
    // the repulsor column flares to r 11 at the ground (10.5 at
    // walker height) — the old r6 stopped walkers mid-air inside it
    return done(R, g, [{ x: 0, z: 0, r: 11.2 }]);
  },
  /* Endor — bunker + big dish. */
  'shield-generator': function (R) {
    const g = new R.Group();
    const army = M(R, 0x5a6148);
    g.add(mesh(R, dome(R, 7, 14, 8), army, 0, 0, 0));
    g.add(mesh(R, new R.BoxGeometry(10, 3, 6), army, 0, 1.2, 7));
    const mast = mesh(R, new R.CylinderGeometry(0.4, 0.5, 10, 6), M(R, 0x3a3f35), 4, 9, -2);
    mast.rotation.z = 0.35; g.add(mast);
    const dish = mesh(R, new R.SphereGeometry(4.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3.2),
      M(R, 0xd8d4c8, { metalness: 0.4, roughness: 0.4, side: R.DoubleSide }), 6.4, 13.4, -2);
    dish.rotation.z = -1.1; g.add(dish);
    g.add(mesh(R, new R.BoxGeometry(1.2, 1.2, 1.2), E(R, 0xff3b30), 6.4, 13.4, -2));
    /* The entrance block in front of the dome (10 x 6 at z 7) stood
     * outside the dome's circle entirely — it has its own now. */
    return done(R, g, [{ x: 0, z: 0, r: 7 }, { x: 0, z: 7, r: 5.9 }]);
  },
  /* Endor — 3 tall trees + rope platforms. */
  'ewok-village': function (R) {
    const g = new R.Group(), rand = mulberry32(31);
    const bark = M(R, 0x5d4630), leaf = M(R, 0x3f6b34);
    const cols = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4, x = Math.cos(a) * 9, z = Math.sin(a) * 9;
      const h = 22 + rand() * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.1, 1.7, h, 7), bark, x, h / 2, z));
      g.add(mesh(R, new R.SphereGeometry(5, 9, 7), leaf, x, h + 2.5, z));
      g.add(mesh(R, new R.CylinderGeometry(3.4, 3.4, 0.5, 10), M(R, 0x7a5f42), x, 12 + i * 2, z));
      g.add(mesh(R, new R.ConeGeometry(4, 2.4, 8), M(R, 0x8a6f4e), x, 14.6 + i * 2, z));
      cols.push({ x: x, z: z, r: 1.8 });
    }
    g.add(mesh(R, new R.BoxGeometry(9, 0.4, 1.2), M(R, 0x8a6f4e), 4.5, 12.4, 4.4, 0.5));
    return done(R, g, cols);
  },
  /* Jakku — junk walls: boxes + a downed walker-leg silhouette. */
  'niima-outpost': function (R) {
    const g = new R.Group(), rand = mulberry32(32);
    const junkCols = [0x8a7f6a, 0x6e6a5e, 0x9a8a70, 0x5d5a52];
    const cols = [];
    for (let i = 0; i < 14; i++) {
      const w = 1.5 + rand() * 3, h = 1.5 + rand() * 4;
      const a = rand() * Math.PI * 2, r = 4 + rand() * 9;
      const d = w * (0.6 + rand() * 0.8);
      const mat = M(R, junkCols[(rand() * junkCols.length) | 0],
        { metalness: 0.4, roughness: 0.6 });
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      g.add(mesh(R, new R.BoxGeometry(w, h, d), mat, x, h / 2, z, rand() * Math.PI));
      /* Every junk box carries its own collider at its true
       * half-diagonal (rotation-invariant). The old single r9 at
       * the centre left the outer ring of boxes (out to r 13)
       * walk-through and walled the gaps between the inner ones. */
      cols.push({ x: x, z: z, r: 0.5 * Math.hypot(w, d) });
    }
    const leg = mesh(R, new R.BoxGeometry(2.2, 16, 2.2), M(R, 0x4a4d52, { metalness: 0.5, roughness: 0.55 }), -8, 3, 6);
    leg.rotation.z = 1.25; leg.rotation.y = 0.4; g.add(leg);
    g.add(mesh(R, new R.BoxGeometry(5, 2, 4), M(R, 0x4a4d52), -13.5, 1.4, 7.5, 0.4));
    /* The downed leg lies along the (-0.92, 0.40) axis through
     * (-8, 6): a five-circle chain follows the limb; the foot block
     * takes its own half-diagonal. */
    for (const t of [-7, -3.5, 0, 3.5, 7]) {
      cols.push({ x: -8 - 0.918 * t, z: 6 + 0.397 * t, r: Math.abs(t) === 7 ? 2.2 : 2.6 });
    }
    cols.push({ x: -13.5, z: 7.5, r: 3.2 });
    return done(R, g, cols);
  },
  /* Takodana — stone castle: keep + towers + flags. */
  'maz-castle': function (R) {
    const g = new R.Group();
    const stone = M(R, 0x8f8a7c), dark = M(R, 0x6e6a5e);
    g.add(mesh(R, new R.BoxGeometry(14, 16, 12), stone, 0, 8, 0));
    g.add(mesh(R, new R.BoxGeometry(15, 2, 13), dark, 0, 17, 0));
    for (const [tx, tz] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) {
      g.add(mesh(R, new R.CylinderGeometry(2.4, 2.8, 20, 8), stone, tx, 10, tz));
      g.add(mesh(R, new R.ConeGeometry(3, 4, 8), dark, tx, 22, tz));
      g.add(mesh(R, new R.CylinderGeometry(0.08, 0.08, 4, 4), dark, tx, 25.5, tz));
      const flag = mesh(R, new R.PlaneGeometry(2.2, 1.2), E(R, 0xc23b2e, { side: R.DoubleSide }), tx + 1.15, 26.4, tz);
      g.add(flag);
    }
    g.add(mesh(R, new R.BoxGeometry(4, 5, 1), E(R, 0xffd98a), 0, 2.5, 6.1));
    /* The corner towers stand at (+/-8, +/-7), radius 2.8 — their
     * outer halves reach 13.4 from the centre, past the keep's
     * circle: one collider per tower. */
    const cols = [{ x: 0, z: 0, r: 11 }];
    for (const tx of [-8, 8]) for (const tz of [-7, 7]) {
      cols.push({ x: tx, z: tz, r: 2.9 });
    }
    return done(R, g, cols);
  },
  /* Starkiller — huge cannon barrel angled skyward in an ice trench. */
  'starkiller-cannon': function (R) {
    const g = new R.Group();
    const ice = M(R, 0xd6e8f5, { roughness: 0.35 });
    for (const s of [-1, 1]) g.add(mesh(R, new R.BoxGeometry(4, 8, 44), ice, s * 10, 4, 0));
    const barrel = mesh(R, new R.CylinderGeometry(2.6, 3.4, 34, 12), M(R, 0x3a3f46, { metalness: 0.6, roughness: 0.4 }), 0, 12, 6);
    barrel.rotation.x = -0.9; g.add(barrel);
    const muzzle = mesh(R, new R.CylinderGeometry(3.2, 2.6, 3, 12), M(R, 0x2b2f35), 0, 26.4, -8.6);
    muzzle.rotation.x = -0.9; g.add(muzzle);
    g.add(mesh(R, new R.BoxGeometry(8, 6, 10), M(R, 0x4a5058), 0, 3, 10));
    /* The trench walls (4 x 44) carried ONE circle between them —
     * now a chain per wall (the echo-base pattern), plus the base
     * block and the barrel's low breech end, which lands at z ~19
     * near the ground. */
    const cols = [];
    for (const s of [-1, 1]) {
      for (const z of [-21, -14, -7, 0, 7, 14, 21]) {
        cols.push({ x: s * 10, z: z, r: 4.4 });
      }
    }
    cols.push({ x: 0, z: 10, r: 6.5 });
    cols.push({ x: 0, z: 19.5, r: 3.6 });
    return done(R, g, cols);
  },
  /* Ahch-To — 5 stone beehive huts. */
  'jedi-village': function (R) {
    const g = new R.Group(), rand = mulberry32(33);
    const stoneMat = M(R, 0xffffff, { vertexColors: true });
    const cols = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 10, z = Math.sin(a) * 10;
      const r = 2.6 + rand() * 0.8;
      const hut = tintGeo(R, new R.SphereGeometry(r, 10, 8), 0x9d968a, 0.25, rand);
      const m = mesh(R, hut, stoneMat, x, 0, z); m.scale.y = 1.25; g.add(m);
      g.add(mesh(R, new R.BoxGeometry(1.2, 1.8, 0.4), M(R, 0x4a4438), x, 0.9, z + r * 0.92, a));
      /* collider = hut radius + the door appliqué's protrusion
       * (the door stands at r*0.92 with its face ~0.37 past the
       * sphere — all-worlds QA, 2026-10-23) */
      cols.push({ x: x, z: z, r: r + 0.45 });
    }
    return done(R, g, cols);
  },
  /* Crait — white arch with red under-cracks. */
  'salt-arch': function (R) {
    const g = new R.Group();
    const salt = M(R, 0xf2f4f6, { roughness: 0.7 });
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(2.6, 13, 2.6), salt, s * 5.5, 6.5, 0));
      g.add(mesh(R, new R.BoxGeometry(3.2, 0.8, 3.2), E(R, 0xb03a2e), s * 5.5, 0.4, 0));
    }
    const beam = mesh(R, new R.TorusGeometry(5.5, 1.5, 8, 16, Math.PI), salt, 0, 13, 0);
    g.add(beam);
    g.add(mesh(R, new R.BoxGeometry(11.5, 0.7, 2.2), E(R, 0xc0392b), 0, 12.4, 0));
    // r 2.35: the red base blocks are 3.2 x 3.2 (half-diagonal
    // 2.26) — r 2.2 left their corners' tips exposed
    return done(R, g, [{ x: -5.5, z: 0, r: 2.35 }, { x: 5.5, z: 0, r: 2.35 }]);
  },
  /* Exegol — cluster of black spires + red emissive windows. */
  'sith-citadel': function (R) {
    const g = new R.Group(), rand = mulberry32(34);
    const obs = M(R, 0x0c0b0e, { metalness: 0.35, roughness: 0.45 });
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = Math.cos(a) * (4 + rand() * 8), z = Math.sin(a) * (4 + rand() * 8);
      const h = 18 + rand() * 22;
      const coneR = 2.2 + rand() * 1.6;
      g.add(mesh(R, new R.ConeGeometry(coneR, h, 5), obs, x, h / 2, z, rand()));
      /* Every spire carries its own collider at its true cone
       * radius: the old single r12 sealed the walkable gaps between
       * the spires while leaving the outer spires' far sides open
       * (reach 12 + 3.8) — all-worlds QA, 2026-10-23. */
      cols.push({ x: x, z: z, r: coneR + 0.3 });
      for (let w = 0; w < 3; w++)
        g.add(mesh(R, new R.PlaneGeometry(0.7, 1.4), E(R, 0xff2a1a),
          x + (rand() - 0.5) * 2, 6 + rand() * (h - 8), z + 2.2, rand() * Math.PI * 2));
    }
    return done(R, g, cols);
  },
  /* Exegol — dais + throne + statues. */
  'sith-throne': function (R) {
    const g = new R.Group();
    const obs = M(R, 0x121114, { metalness: 0.3, roughness: 0.5 });
    g.add(mesh(R, new R.CylinderGeometry(9, 10, 1.6, 8), obs, 0, 0.8, 0));
    g.add(mesh(R, new R.CylinderGeometry(6.5, 7.5, 1.6, 8), obs, 0, 2.4, 0));
    g.add(mesh(R, new R.BoxGeometry(3.4, 2.6, 2.4), obs, 0, 4.4, -1));
    g.add(mesh(R, new R.BoxGeometry(3.4, 5, 1.2), obs, 0, 7.6, -2));
    g.add(mesh(R, new R.BoxGeometry(4.4, 0.8, 3), M(R, 0x1e1c22), 0, 8.6, -1.6));
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(1.6, 7, 1.6), obs, s * 7.5, 3.5, -4));
      g.add(mesh(R, new R.SphereGeometry(1.1, 7, 6), obs, s * 7.5, 7.6, -4));
      g.add(mesh(R, new R.BoxGeometry(0.5, 0.9, 0.2), E(R, 0xff2a1a), s * 7.5 - 0.3, 7.7, -3));
      g.add(mesh(R, new R.BoxGeometry(0.5, 0.9, 0.2), E(R, 0xff2a1a), s * 7.5 + 0.3, 7.7, -3));
    }
    /* r 10.3: the lowest dais tier is r 10 at the ground and the
     * statue plinths at (+/-7.5, -4) reach 9.6 — the old r7 let the
     * walker stand inside both. The 'Throne' mission gate radius
     * was widened to match (data.js), so the goal still reads as
     * arriving at the dais edge. */
    return done(R, g, [{ x: 0, z: 0, r: 10.3 }]);
  },
  /* Fly zone — long trench corridor segment along -z/+z. */
  'death-star': function (R) {
    const g = new R.Group(), rand = mulberry32(35);
    const hull = M(R, 0x8f959c, { metalness: 0.55, roughness: 0.45 });
    const dark = M(R, 0x5d6269, { metalness: 0.5, roughness: 0.5 });
    g.add(mesh(R, new R.BoxGeometry(32, 1.5, 220), dark, 0, -0.75, 0)); // floor
    const cols = [];
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(2.5, 16, 220), hull, s * 16, 8, 0)); // walls
      for (let i = 0; i < 22; i++) {
        const z = -105 + i * 10, w = 1 + rand() * 3;
        g.add(mesh(R, new R.BoxGeometry(1.2, 1 + rand() * 3, w), dark, s * 14.4, 3 + rand() * 9, z));
        if (rand() < 0.3)
          g.add(mesh(R, new R.BoxGeometry(0.6, 0.6, 2), E(R, 0x9fd8ff), s * 14.3, 6 + rand() * 6, z));
      }
      for (let z = -100; z <= 100; z += 20) cols.push({ x: s * 16, z: z, r: 8 });
    }
    return done(R, g, cols);
  },
  /* Fly zone — ring of floating rocks + central memorial beacon pylon. */
  'debris-field': function (R, T) {
    const g = new R.Group(), rand = mulberry32(36);
    const rockGeo = new R.IcosahedronGeometry(1, 0);
    const rockMat = M(R, 0x6e6258, { roughness: 1, metalness: 0 });
    const count = 200;
    const inst = new R.InstancedMesh(rockGeo, rockMat, count);
    const d = new R.Object3D();
    const cols = [];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, r = 60 + rand() * 55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      d.position.set(x, (rand() - 0.5) * 44, z);
      d.rotation.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
      const s = 1 + rand() * 4; d.scale.set(s, s * (0.6 + rand() * 0.8), s);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      /* Each rock is solid in flight too: its XZ hull is the
       * icosahedron's radius s (all-worlds QA, 2026-10-23). */
      cols.push({ x: x, z: z, r: s });
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false; inst.receiveShadow = false;
    g.add(inst);
    g.add(mesh(R, new R.CylinderGeometry(1.5, 2.5, 40, 8), M(R, 0x3a3f46, { metalness: 0.6, roughness: 0.4 }), 0, 20, 0));
    const beacon = mesh(R, new R.SphereGeometry(2.4, 12, 10), E(R, 0x9fd8ff, { transparent: true, opacity: 0.9 }), 0, 42, 0);
    beacon.userData.pulse = true; g.add(beacon);
    const halo = new R.Sprite(new R.SpriteMaterial({ map: T.glowSprite(), color: 0x9fd8ff, transparent: true, opacity: 0.7, depthWrite: false }));
    halo.scale.set(18, 18, 1); halo.position.set(0, 42, 0); halo.userData.pulse = true; g.add(halo);
    cols.push({ x: 0, z: 0, r: 4 }); // the beacon pylon
    return done(R, g, cols);
  },
  /* Distant wedge silhouette — no collider. */
  'star-destroyer': function (R) {
    const g = new R.Group();
    const hull = M(R, 0x9aa0a8, { metalness: 0.5, roughness: 0.5 });
    g.add(mesh(R, new R.BoxGeometry(70, 7, 90), hull, 0, 0, 30));
    const nose = mesh(R, new R.ConeGeometry(35, 70, 4), hull, 0, 0, -40);
    nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.scale.y = 1; g.add(nose);
    g.add(mesh(R, new R.BoxGeometry(10, 14, 8), hull, 0, 10, 62));
    g.add(mesh(R, new R.BoxGeometry(22, 3, 6), hull, 0, 18, 62));
    for (const s of [-1, 1]) g.add(mesh(R, new R.SphereGeometry(2.5, 8, 6), hull, s * 6, 18, 62));
    for (let i = 0; i < 12; i++)
      g.add(mesh(R, new R.BoxGeometry(1, 0.5, 1), E(R, 0xffe9b0), -30 + i * 5.5, -3.6, 10 + (i % 3) * 20));
    g.position.y = 90;
    return done(R, g, []);
  },
  /* Tatooine — the cantina: one big ring-domed hall + annex domes +
   * a glowing doorway. Procedural stand-in for the GLB seat. */
  'cantina': function (R) {
    const g = new R.Group(), rand = mulberry32(41);
    const sand = M(R, 0xd9b57c), dark = M(R, 0xb08d58);
    g.add(mesh(R, new R.CylinderGeometry(7.5, 8.2, 3.2, 18), dark, 0, 1.6, 0));
    g.add(mesh(R, dome(R, 7.5, 18, 10), sand, 0, 3.2, 0));
    g.add(mesh(R, new R.CylinderGeometry(0.5, 0.7, 3.4, 6), dark, 0, 9.4, 0));
    const cols = [{ x: 0, z: 0, r: 8.3 }]; // the drum flares to 8.2 at the ground
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.7, x = Math.cos(a) * 10.5, z = Math.sin(a) * 10.5;
      const ar = 2.4 + rand() * 0.8;
      g.add(mesh(R, dome(R, ar, 10, 7), i % 2 ? sand : dark, x, 0, z));
      // the annex domes stand at ring 10.5, far outside the drum's
      // circle — each carries its own collider
      cols.push({ x: x, z: z, r: ar + 0.2 });
    }
    const door = mesh(R, new R.BoxGeometry(2.2, 3, 0.4), E(R, 0xffc98a), 0, 1.5, 8.15);
    g.add(door);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      g.add(mesh(R, new R.BoxGeometry(0.7, 0.7, 0.3), E(R, 0x9fd8ff),
        Math.cos(a) * 7.9, 2.2, Math.sin(a) * 7.9, -a));
    }
    return done(R, g, cols);
  },
  /* Tatooine — THE CRASH SITE (Nov 15, 2026 rework): a downed
   * starship hull settled into the dunes where the army-truck rover
   * used to sit. Deliberate wreckage, not a pedestal: the hull lies
   * at a slight list with its low edge BURIED (its base sits below
   * y=0 by construction, and span seating sinks it further), a
   * detached engine nacelle rests beside it, thin debris plates lie
   * half-buried around it, and a scorch disc marks the sand. No
   * ride — it is a place, not a vehicle. Colliders chain the hull
   * and the nacelle; the flat debris plates are walk-over. */
  'crashed-ship': function (R) {
    const g = new R.Group();
    const hull = M(R, 0x3a3f46, { metalness: 0.6, roughness: 0.45 });
    const dark = M(R, 0x23262c, { metalness: 0.55, roughness: 0.5 });
    const scorched = M(R, 0x191512, { metalness: 0.2, roughness: 0.9 });
    // scorch mark on the sand under the wreck
    const scorch = mesh(R, new R.CircleGeometry(5.5, 20),
      new R.MeshBasicMaterial({ color: 0x241a10, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.06, 0);
    scorch.rotation.x = -Math.PI / 2;
    g.add(scorch);
    // main hull: 6.4 m of tapered fuselage, listed ~4 deg, low edge buried
    const body = mesh(R, new R.BoxGeometry(2.6, 1.5, 6.4), hull, 0, 0.65, 0);
    body.rotation.z = 0.07; body.rotation.x = -0.05;
    g.add(body);
    const nose = mesh(R, new R.ConeGeometry(1.15, 2.2, 4), scorched, 0, 0.7, -4.1);
    nose.rotation.x = -Math.PI / 2; nose.rotation.z = Math.PI / 4;
    g.add(nose);
    // broken wing stub, one end kicked up; tail fin, snapped forward
    const wing = mesh(R, new R.BoxGeometry(3.4, 0.18, 1.6), dark, 1.2, 1.15, 1.2);
    wing.rotation.z = 0.35; g.add(wing);
    const fin = mesh(R, new R.BoxGeometry(0.18, 1.6, 1.4), dark, -0.8, 1.55, 3.0);
    fin.rotation.x = 0.3; fin.rotation.z = -0.2; g.add(fin);
    // one dead running light, still faintly lit
    g.add(mesh(R, new R.BoxGeometry(0.5, 0.08, 0.08),
      E(R, 0x7fe7ff, { transparent: true, opacity: 0.6 }), 0, 1.25, -1.5));
    // detached engine nacelle, lying on its side beside the hull
    const nacelle = mesh(R, new R.CylinderGeometry(0.55, 0.65, 2.6, 10), hull, 4.6, 0.55, 2.2);
    nacelle.rotation.z = Math.PI / 2; nacelle.rotation.y = 0.5;
    g.add(nacelle);
    // debris plates, half-buried around the wreck — low but SOLID:
    // the QA hull law covers every vertex in the walker band, so
    // each plate carries its own collider and the walker steps
    // around them instead of through them
    const debris = [
      [3.8, 0.1, -2.5, 0.7, 1.6, 1.1], [-3.6, 0.08, 1.8, -0.4, 1.4, 0.9],
      [2.2, 0.06, 4.6, 1.2, 1.2, 0.8], [-2.8, 0.1, -4.2, 2.0, 1.8, 1.0],
    ];
    for (const [dx, dy, dz, ry, w, d] of debris) {
      const plate = mesh(R, new R.BoxGeometry(w, 0.12, d), scorched, dx, dy, dz, ry);
      plate.rotation.x = (ry % 0.7) * 0.2;
      g.add(plate);
    }
    /* Colliders cover the VISUAL hull (QA 2 law — every vertex in
     * the walker band must sit inside a disc + 0.35 m): the nose
     * cone pokes 3 m past the fuselage, the wing stub's raised tip
     * sticks out sideways, and each debris plate carries its own. */
    return done(R, g, [
      { x: 0, z: -4.6, r: 1.6 }, { x: 0, z: -2.2, r: 2.1 }, { x: 0, z: 0.2, r: 2.3 }, { x: 0, z: 2.6, r: 2.0 },
      { x: 2.4, z: 1.2, r: 1.2 }, { x: 4.6, z: 2.2, r: 1.3 },
      { x: 3.8, z: -2.5, r: 1.0 }, { x: -3.6, z: 1.8, r: 0.9 },
      { x: 2.2, z: 4.6, r: 0.8 }, { x: -2.8, z: -4.2, r: 1.1 },
    ]);
  },
  /* Tatooine — a parked landspeeder: rounded hull, twin intakes,
   * windshield, hover skirt. Procedural stand-in for the GLB seat. */
  'landspeeder': function (R) {
    const g = new R.Group();
    const hull = M(R, 0xc9a06a, { metalness: 0.35, roughness: 0.5 });
    const dark = M(R, 0x2b2f35, { metalness: 0.5, roughness: 0.4 });
    const body = mesh(R, new R.SphereGeometry(1.5, 12, 9), hull, 0, 0.85, 0);
    body.scale.set(0.85, 0.5, 1.85); g.add(body);
    for (const s of [-1, 1]) {
      const intake = mesh(R, new R.CylinderGeometry(0.42, 0.5, 1.6, 10), dark, s * 0.95, 1.05, -1.7);
      intake.rotation.x = Math.PI / 2; g.add(intake);
      g.add(mesh(R, new R.BoxGeometry(0.16, 0.5, 1.1), hull, s * 1.28, 0.95, 0.7));
    }
    const shield = mesh(R, new R.SphereGeometry(0.62, 10, 7), dark, 0, 1.45, -0.15);
    shield.scale.set(0.9, 0.62, 1.1); g.add(shield);
    g.add(mesh(R, new R.BoxGeometry(1.7, 0.22, 3.4), M(R, 0x8a6f42, { metalness: 0.3, roughness: 0.6 }), 0, 0.32, 0));
    // the hull (sphere scaled z 1.85 x 1.5) reaches 2.78 — the same
    // stop radius the GLB registry uses in play
    return done(R, g, [{ x: 0, z: 0, r: 2.9 }]);
  },
};

export function buildLandmark(type, THREE, T) {
  const R = R3(THREE);
  const b = BUILDERS[type];
  if (!b) throw new Error('[star-wars] unknown landmark type: ' + type);
  return b(R, T);
}

/* ------------------------- ambient creatures ------------------------- */

/* CGI CHARACTER SWAP (Merlin, Nov 28, 2026): every ambient kind is
 * rebuilt as textured CGI on the house creature-surface kit
 * (lib/earth4/creature-textures.js — seeded fur / feather / scale /
 * chitin / skin / keratin / bark DataTextures, cached per
 * family+seed, node-safe). M()'s opts.tex = { family, seed } paints
 * a kind's map over its colour; the map carries the surface
 * structure, the colour carries the hue. Counts, sizes, base
 * positions and every per-kind wander update(t) pattern below are
 * unchanged — visual swap only. The named GLB characters (Jedi
 * Knight, Sith Lord) are NOT ambient and are untouched. */

export const AMBIENT_TYPES = [
  'bantha', 'jawa', 'bird', 'wampa', 'tauntaun',
  'ewok', 'porg', 'probe-droid', 'fish', 'tuskan',
];

/* Lazily capture the zone-assigned base position on first update. */
function wanderState(g) {
  const s = { bx: null, bz: null, by: null, ph: Math.random() * 6.2832 };
  s.base = function () {
    if (s.bx === null) { s.bx = g.position.x; s.bz = g.position.z; s.by = g.position.y; }
  };
  return s;
}

/* Tapered wing in the XZ plane: spans +X from the body, chord along
 * Z, tip swept back. UVs map the feather texture across the wing.
 * Mirror with mesh.scale.x = -1 for the other side. */
function wingGeo(R, span, rootChord, tipChord, sweep) {
  const g = new R.BufferGeometry();
  const v = new Float32Array([
    0, 0, rootChord / 2, 0, 0, -rootChord / 2, span, 0, tipChord / 2 + sweep,
    0, 0, rootChord / 2, span, 0, tipChord / 2 + sweep, span, 0, -tipChord / 2 + sweep,
  ]);
  const uv = new Float32Array([0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0]);
  g.setAttribute('position', new R.BufferAttribute(v, 3));
  g.setAttribute('uv', new R.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* One triangle in the XY plane (dorsal fins), from [x, y] triples. */
function triGeo(R, a, b, c) {
  const g = new R.BufferGeometry();
  const v = new Float32Array([a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  g.setAttribute('position', new R.BufferAttribute(v, 3));
  g.setAttribute('uv', new R.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* Forked tail fin in the XY plane, root at x = 0, tips at -X. */
function tailFinGeo(R) {
  const g = new R.BufferGeometry();
  const v = new Float32Array([
    0, 0.06, 0, -0.55, 0.34, 0, -0.38, 0, 0,
    0, -0.06, 0, -0.38, 0, 0, -0.55, -0.34, 0,
  ]);
  const uv = new Float32Array([0, 0.5, 1, 1, 0.7, 0.5, 0, 0.5, 0.7, 0.5, 1, 0]);
  g.setAttribute('position', new R.BufferAttribute(v, 3));
  g.setAttribute('uv', new R.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const AMBIENT = {
  /* Shaggy quadruped: fur-textured barrel body + fringe skirt,
   * horned head, four legs. */
  'bantha': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0x8a6b4a, { tex: { family: 'fur', seed: 'sw-bantha' } });
    const dark = M(R, 0x6e5638, { tex: { family: 'fur', seed: 'sw-bantha-dark' } });
    const horn = M(R, 0xe8dcc0, { tex: { family: 'keratin', seed: 'sw-bantha-horn' } });
    const body = mesh(R, new R.SphereGeometry(1.35, 12, 9), fur, 0, 1.75, 0);
    body.scale.set(1.35, 0.75, 0.68); g.add(body);
    const fringe = mesh(R, new R.ConeGeometry(1.9, 0.8, 10), dark, 0, 0.85, 0);
    fringe.scale.set(1, 1, 0.5); g.add(fringe);
    g.add(mesh(R, new R.SphereGeometry(0.85, 10, 8), fur, 0, 2.3, 0));
    g.add(mesh(R, new R.BoxGeometry(1, 1.1, 1.2), fur, 2.05, 1.9, 0));
    g.add(mesh(R, new R.BoxGeometry(0.5, 0.4, 0.7), dark, 2.55, 1.65, 0));
    for (const [lx, lz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]])
      g.add(mesh(R, new R.BoxGeometry(0.5, 1.3, 0.5), dark, lx, 0.65, lz));
    for (const lz of [-0.75, 0.75]) g.add(mesh(R, new R.ConeGeometry(0.16, 1.5, 6), horn, 2.3, 2.7, lz));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.12 + s.ph) * 7;
        g.position.z = s.bz + Math.sin(t * 0.10 + s.ph) * 7;
        g.rotation.y = Math.atan2(-Math.sin(t * 0.12 + s.ph) * 0.12, Math.cos(t * 0.10 + s.ph) * 0.10);
        body.position.y = 1.75 + Math.sin(t * 2.2 + s.ph) * 0.09;
      },
    };
  },
  /* Small hooded figure: cloth robe + hood over a dark face,
   * glowing amber eyes, suggested sleeves, belt. */
  'jawa': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const robeMat = M(R, 0x4a3b2c, { tex: { family: 'skin', seed: 'sw-jawa-robe', roughness: 0.95 } });
    const robe = mesh(R, new R.ConeGeometry(0.55, 1.5, 7), robeMat, 0, 0.75, 0); g.add(robe);
    g.add(mesh(R, new R.SphereGeometry(0.34, 10, 8), robeMat, 0, 1.42, 0.05));
    g.add(mesh(R, new R.SphereGeometry(0.26, 8, 6), M(R, 0x1a1410), 0, 1.35, 0.18));
    g.add(mesh(R, new R.BoxGeometry(0.12, 0.08, 0.05), E(R, 0xffd76a), -0.1, 1.38, 0.44));
    g.add(mesh(R, new R.BoxGeometry(0.12, 0.08, 0.05), E(R, 0xffd76a), 0.1, 1.38, 0.44));
    for (const sx of [-1, 1]) {
      const arm = mesh(R, new R.CylinderGeometry(0.09, 0.11, 0.55, 6), robeMat, sx * 0.42, 0.85, 0.1);
      arm.rotation.z = sx * 0.25; g.add(arm);
    }
    g.add(mesh(R, new R.CylinderGeometry(0.33, 0.36, 0.12, 7), M(R, 0x2e241a), 0, 0.62, 0));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.35 + s.ph) * 4;
        g.position.z = s.bz + Math.sin(t * 0.3 + s.ph) * 4;
        g.rotation.y = t * 0.35 + s.ph;
        robe.position.y = 0.75 + Math.abs(Math.sin(t * 5 + s.ph)) * 0.08;
      },
    };
  },
  /* Feather-textured bird: shaped tapered wings on flap pivots,
   * streamlined body, head + beak, tail. */
  'bird': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const feather = M(R, 0x3a3f4a, { tex: { family: 'feather', seed: 'sw-bird', roughness: 0.55 }, side: R.DoubleSide });
    const wl = new R.Group(), wr = new R.Group();
    wl.add(mesh(R, wingGeo(R, 1.7, 0.7, 0.28, -0.15), feather));
    const wrm = mesh(R, wingGeo(R, 1.7, 0.7, 0.28, -0.15), feather);
    wrm.scale.x = -1; wr.add(wrm);
    g.add(wl, wr);
    const bodyMesh = mesh(R, new R.SphereGeometry(0.24, 10, 8), feather, 0, 0, 0);
    bodyMesh.scale.set(0.8, 0.7, 2.2); g.add(bodyMesh);
    g.add(mesh(R, new R.SphereGeometry(0.15, 8, 6), feather, 0, 0.06, 0.55));
    const beak = mesh(R, new R.ConeGeometry(0.06, 0.22, 6), M(R, 0x3a2e22), 0, 0.05, 0.75);
    beak.rotation.x = Math.PI / 2; g.add(beak);
    g.add(mesh(R, new R.BoxGeometry(0.3, 0.05, 0.5), feather, 0, 0.02, -0.6));
    return {
      group: g,
      update: function (t) {
        s.base();
        const f = Math.sin(t * 9 + s.ph);
        wl.rotation.z = 0.45 + f * 0.55; wr.rotation.z = -0.45 - f * 0.55;
        const nx = s.bx + Math.cos(t * 0.5 + s.ph) * 9, nz = s.bz + Math.sin(t * 0.42 + s.ph) * 9;
        g.rotation.y = Math.atan2(nx - g.position.x, nz - g.position.z);
        g.position.x = nx; g.position.z = nz;
        g.position.y = s.by + Math.sin(t * 1.6 + s.ph) * 1.4;
      },
    };
  },
  /* Tall white brute: fur-textured torso + shaggy chest and
   * shoulders, muzzle + brow + fangs + glowing eyes, clawed arms.
   * The fur is the house procedural fur map (guard-hair strands +
   * agouti banding over white) — the best textured fur the kit
   * paints; there is no strand-level hair system in this round. */
  'wampa': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0xe8e4da, { tex: { family: 'fur', seed: 'sw-wampa' } });
    const furDark = M(R, 0xcfc9bb, { tex: { family: 'fur', seed: 'sw-wampa-dark' } });
    const body = mesh(R, new R.BoxGeometry(1.6, 2.6, 1.1), fur, 0, 2, 0); g.add(body);
    const chest = mesh(R, new R.SphereGeometry(0.85, 10, 8), fur, 0, 2.6, 0);
    chest.scale.set(1.05, 1.1, 0.75); g.add(chest);
    for (const sx of [-1, 1]) {
      const tuft = mesh(R, new R.SphereGeometry(0.4, 8, 6), furDark, sx * 0.7, 3.1, 0);
      tuft.scale.set(1, 0.7, 1); g.add(tuft);
    }
    g.add(mesh(R, new R.SphereGeometry(0.55, 10, 8), fur, 0, 3.6, 0.2));
    g.add(mesh(R, new R.BoxGeometry(0.5, 0.3, 0.35), furDark, 0, 3.45, 0.65));
    g.add(mesh(R, new R.BoxGeometry(0.6, 0.12, 0.2), furDark, 0, 3.75, 0.68));
    g.add(mesh(R, new R.SphereGeometry(0.06, 6, 5), E(R, 0xffc46a), -0.2, 3.68, 0.68));
    g.add(mesh(R, new R.SphereGeometry(0.06, 6, 5), E(R, 0xffc46a), 0.2, 3.68, 0.68));
    for (const sx of [-1, 1]) {
      const fang = mesh(R, new R.ConeGeometry(0.05, 0.22, 5), M(R, 0xf2ead8), sx * 0.12, 3.3, 0.7);
      fang.rotation.x = Math.PI; g.add(fang);
    }
    for (const lz of [-1, 1]) {
      g.add(mesh(R, new R.CylinderGeometry(0.22, 0.2, 1.9, 8), fur, 0, 2, lz * 0.85));
      g.add(mesh(R, new R.SphereGeometry(0.24, 8, 6), furDark, 0, 1.05, lz * 0.85));
      const claw = mesh(R, new R.ConeGeometry(0.07, 0.3, 5), M(R, 0xe8dcc0), 0, 0.8, lz * 0.85);
      claw.rotation.x = Math.PI; g.add(claw);
      g.add(mesh(R, new R.BoxGeometry(0.4, 1.1, 0.4), fur, 0, 0.55, lz * 0.4));
    }
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.09 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.08 + s.ph) * 5;
        g.rotation.y = Math.sin(t * 0.09 + s.ph) * 0.8;
        body.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.06;
      },
    };
  },
  /* Two-legged mount: fur-textured barrel body, striding legs,
   * horned head + snout, tail. */
  'tauntaun': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const hide = M(R, 0xb9a58a, { tex: { family: 'fur', seed: 'sw-tauntaun' } });
    const horn = M(R, 0xe8dcc0, { tex: { family: 'keratin', seed: 'sw-tauntaun-horn' } });
    const body = mesh(R, new R.SphereGeometry(0.85, 12, 9), hide, 0, 1.9, 0);
    body.scale.set(1.5, 0.75, 0.62); g.add(body);
    const legL = mesh(R, new R.CylinderGeometry(0.18, 0.16, 1.4, 8), hide, 0, 0.7, -0.35); g.add(legL);
    const legR = mesh(R, new R.CylinderGeometry(0.18, 0.16, 1.4, 8), hide, 0, 0.7, 0.35); g.add(legR);
    for (const lz of [-0.35, 0.35])
      g.add(mesh(R, new R.SphereGeometry(0.2, 8, 6), M(R, 0x6e5638), 0, 0.08, lz));
    g.add(mesh(R, new R.BoxGeometry(0.7, 0.8, 0.6), hide, 1.4, 2.6, 0));
    g.add(mesh(R, new R.BoxGeometry(0.5, 0.4, 0.45), hide, 1.8, 2.5, 0));
    for (const lz of [-0.3, 0.3]) g.add(mesh(R, new R.ConeGeometry(0.1, 0.9, 5), horn, 1.5, 3.2, lz));
    g.add(mesh(R, new R.SphereGeometry(0.05, 6, 5), E(R, 0x1a1a1a), 1.76, 2.75, -0.18));
    g.add(mesh(R, new R.SphereGeometry(0.05, 6, 5), E(R, 0x1a1a1a), 1.76, 2.75, 0.18));
    g.add(mesh(R, new R.BoxGeometry(0.25, 1, 0.25), hide, -1.3, 1.9, 0));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.22 + s.ph) * 8;
        g.position.z = s.bz + Math.sin(t * 0.19 + s.ph) * 8;
        g.rotation.y = Math.atan2(-Math.sin(t * 0.22 + s.ph), Math.cos(t * 0.19 + s.ph));
        const hop = Math.abs(Math.sin(t * 4 + s.ph));
        body.position.y = 1.9 + hop * 0.22;
        legL.rotation.x = Math.sin(t * 4 + s.ph) * 0.5;
        legR.rotation.x = -Math.sin(t * 4 + s.ph) * 0.5;
      },
    };
  },
  /* Small furry biped: fur body + head, ears, lighter face patch
   * with eyes + nose, suggested arms and legs. */
  'ewok': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0x6e5138, { tex: { family: 'fur', seed: 'sw-ewok' } });
    const faceMat = M(R, 0xc8a878, { tex: { family: 'skin', seed: 'sw-ewok-face' } });
    const body = mesh(R, new R.SphereGeometry(0.5, 10, 8), fur, 0, 0.75, 0); g.add(body);
    g.add(mesh(R, new R.SphereGeometry(0.34, 10, 8), fur, 0, 1.3, 0.1));
    const face = mesh(R, new R.SphereGeometry(0.24, 8, 6), faceMat, 0, 1.28, 0.28);
    face.scale.set(1, 1, 0.55); g.add(face);
    for (const lz of [-0.28, 0.28]) g.add(mesh(R, new R.ConeGeometry(0.12, 0.35, 5), fur, 0, 1.62, lz));
    g.add(mesh(R, new R.SphereGeometry(0.04, 6, 5), E(R, 0x1a1a1a), -0.1, 1.35, 0.42));
    g.add(mesh(R, new R.SphereGeometry(0.04, 6, 5), E(R, 0x1a1a1a), 0.1, 1.35, 0.42));
    g.add(mesh(R, new R.SphereGeometry(0.05, 6, 5), E(R, 0x1a1a1a), 0, 1.26, 0.45));
    for (const sx of [-1, 1]) {
      const arm = mesh(R, new R.CylinderGeometry(0.09, 0.08, 0.45, 6), fur, sx * 0.48, 0.75, 0);
      arm.rotation.z = sx * -0.3; g.add(arm);
      g.add(mesh(R, new R.CylinderGeometry(0.1, 0.09, 0.4, 6), fur, sx * 0.2, 0.2, 0));
    }
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.4 + s.ph) * 3.5;
        g.position.z = s.bz + Math.sin(t * 0.36 + s.ph) * 3.5;
        g.rotation.y = t * 0.4 + s.ph;
        body.position.y = 0.75 + Math.abs(Math.sin(t * 6 + s.ph)) * 0.1;
      },
    };
  },
  /* Round bird: feather-textured ball, orange beak, eyes, two
   * shaped wings (the old build had only one), orange feet. */
  'porg': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const feather = M(R, 0xd8cfc0, { tex: { family: 'feather', seed: 'sw-porg', roughness: 0.55 } });
    const wingMat = M(R, 0x8a7a68, { tex: { family: 'feather', seed: 'sw-porg-wing', roughness: 0.55 }, side: R.DoubleSide });
    const body = mesh(R, new R.SphereGeometry(0.45, 12, 10), feather, 0, 0.7, 0); g.add(body);
    const beak = mesh(R, new R.ConeGeometry(0.14, 0.35, 6), M(R, 0xe09a3a, { tex: { family: 'keratin', seed: 'sw-porg-beak' } }), 0, 0.75, 0.45);
    beak.rotation.x = Math.PI / 2; g.add(beak);
    g.add(mesh(R, new R.SphereGeometry(0.04, 6, 5), E(R, 0x1a1a1a), -0.16, 0.85, 0.38));
    g.add(mesh(R, new R.SphereGeometry(0.04, 6, 5), E(R, 0x1a1a1a), 0.16, 0.85, 0.38));
    const wl = mesh(R, wingGeo(R, 0.55, 0.3, 0.12, -0.05), wingMat, -0.4, 0.8, 0); g.add(wl);
    const wr = mesh(R, wingGeo(R, 0.55, 0.3, 0.12, -0.05), wingMat, 0.4, 0.8, 0);
    wr.scale.x = -1; g.add(wr);
    for (const sx of [-1, 1])
      g.add(mesh(R, new R.BoxGeometry(0.12, 0.1, 0.2), M(R, 0xe09a3a), sx * 0.15, 0.28, 0.1));
    return {
      group: g,
      update: function (t) {
        s.base();
        const hop = Math.abs(Math.sin(t * 3 + s.ph));
        g.position.y = s.by + hop * 0.35;
        g.position.x = s.bx + Math.cos(t * 0.3 + s.ph) * 2.5;
        g.position.z = s.bz + Math.sin(t * 0.27 + s.ph) * 2.5;
        g.rotation.y = t * 0.3 + s.ph;
        body.scale.y = 1 - hop * 0.12;
      },
    };
  },
  /* Floating black pod: panelled chitin armour (sclerite plates
   * read as hull panelling), equatorial band, three legs, emissive
   * red eye + sensor, antenna. Hard-surfaced machine look kept. */
  'probe-droid': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const panel = M(R, 0x2a2c33, { tex: { family: 'chitin', seed: 'sw-probe', roughness: 0.4 }, metalness: 0.6 });
    const darkMetal = M(R, 0x2b2d33, { metalness: 0.6, roughness: 0.35 });
    const pod = mesh(R, new R.SphereGeometry(0.7, 12, 10), panel, 0, 2.4, 0);
    pod.scale.y = 1.25; g.add(pod);
    const band = mesh(R, new R.TorusGeometry(0.62, 0.06, 6, 16), panel, 0, 2.4, 0);
    band.rotation.x = Math.PI / 2; g.add(band);
    const cap = mesh(R, new R.SphereGeometry(0.3, 8, 6), darkMetal, 0, 3.15, 0);
    cap.scale.y = 0.6; g.add(cap);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(R, new R.CylinderGeometry(0.07, 0.05, 1.6, 5), panel, Math.cos(a) * 0.7, 1.5, Math.sin(a) * 0.7);
      leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; g.add(leg);
    }
    g.add(mesh(R, new R.SphereGeometry(0.16, 8, 6), E(R, 0xff3b30), 0, 2.5, 0.68));
    g.add(mesh(R, new R.SphereGeometry(0.07, 6, 5), E(R, 0xff3b30), 0.3, 2.75, 0.6));
    g.add(mesh(R, new R.CylinderGeometry(0.03, 0.03, 0.7, 5), darkMetal, 0, 3.5, 0));
    g.add(mesh(R, new R.SphereGeometry(0.06, 6, 5), E(R, 0xff3b30), 0, 3.85, 0));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.y = s.by + Math.sin(t * 1.8 + s.ph) * 0.35 + 0.2;
        g.position.x = s.bx + Math.cos(t * 0.25 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.22 + s.ph) * 5;
        g.rotation.y = t * 0.5 + s.ph;
      },
    };
  },
  /* Scaled swimmer: scale-textured streamlined body, dorsal fin,
   * forked tail fin that wags, eyes. */
  'fish': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fm = M(R, 0x4a7a9e, { tex: { family: 'scale_fish', seed: 'sw-fish', roughness: 0.4 } });
    const body = mesh(R, new R.SphereGeometry(0.35, 10, 8), fm, 0, 0, 0);
    body.scale.set(2.3, 0.9, 0.9); g.add(body);
    g.add(mesh(R, triGeo(R, [0.1, 0.3], [-0.3, 0.3], [-0.1, 0.62]), M(R, 0x3a6284, { tex: { family: 'scale_fish', seed: 'sw-fish-fin', roughness: 0.4 }, side: R.DoubleSide })));
    const tail = mesh(R, tailFinGeo(R), M(R, 0x4a7a9e, { tex: { family: 'scale_fish', seed: 'sw-fish-tail', roughness: 0.4 }, side: R.DoubleSide }), -0.8, 0, 0);
    g.add(tail);
    g.add(mesh(R, new R.SphereGeometry(0.05, 6, 5), E(R, 0x1a1a1a), 0.55, 0.1, -0.2));
    g.add(mesh(R, new R.SphereGeometry(0.05, 6, 5), E(R, 0x1a1a1a), 0.55, 0.1, 0.2));
    return {
      group: g,
      update: function (t) {
        s.base();
        const nx = s.bx + Math.cos(t * 0.45 + s.ph) * 6, nz = s.bz + Math.sin(t * 0.4 + s.ph) * 6;
        g.rotation.y = Math.atan2(nx - g.position.x, nz - g.position.z) - Math.PI / 2;
        g.position.x = nx; g.position.z = nz;
        g.position.y = s.by + Math.sin(t * 1.3 + s.ph) * 0.5;
        tail.rotation.y = Math.sin(t * 8 + s.ph) * 0.5;
      },
    };
  },
  /* Robed figure: cloth robe + head wrap with glowing eye slits,
   * keratin face tusks, bark-textured gaderffii staff. */
  'tuskan': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const robeMat = M(R, 0x9a8a72, { tex: { family: 'skin', seed: 'sw-tuskan-robe', roughness: 0.95 } });
    const robe = mesh(R, new R.ConeGeometry(0.6, 1.9, 7), robeMat, 0, 0.95, 0); g.add(robe);
    g.add(mesh(R, new R.SphereGeometry(0.32, 10, 8), M(R, 0x7a6a55, { tex: { family: 'skin', seed: 'sw-tuskan-wrap' } }), 0, 1.95, 0));
    g.add(mesh(R, new R.BoxGeometry(0.5, 0.12, 0.1), robeMat, 0, 2.08, 0.18));
    g.add(mesh(R, new R.BoxGeometry(0.09, 0.06, 0.04), E(R, 0xffc46a), -0.09, 1.98, 0.29));
    g.add(mesh(R, new R.BoxGeometry(0.09, 0.06, 0.04), E(R, 0xffc46a), 0.09, 1.98, 0.29));
    for (const lz of [-0.2, 0.2]) {
      const tusk = mesh(R, new R.ConeGeometry(0.06, 0.5, 5), M(R, 0xe8dcc0, { tex: { family: 'keratin', seed: 'sw-tuskan-tusk' } }), 0, 1.95, lz);
      tusk.rotation.x = lz > 0 ? 0.9 : -0.9; g.add(tusk);
    }
    for (const sx of [-1, 1]) {
      const arm = mesh(R, new R.CylinderGeometry(0.09, 0.11, 0.6, 6), robeMat, sx * 0.45, 0.9, 0.05);
      arm.rotation.z = sx * 0.2; g.add(arm);
    }
    const staff = mesh(R, new R.CylinderGeometry(0.06, 0.06, 2.2, 5), M(R, 0x5d4a33, { tex: { family: 'bark', seed: 'sw-tuskan-staff' } }), 0.55, 1.1, 0);
    g.add(staff);
    g.add(mesh(R, new R.BoxGeometry(0.1, 0.5, 0.1), M(R, 0x5d4a33), 0.55, 2.25, 0));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.16 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.14 + s.ph) * 5;
        g.rotation.y = Math.sin(t * 0.16 + s.ph) * 1.2;
        robe.rotation.z = Math.sin(t * 1.4 + s.ph) * 0.04;
        staff.rotation.z = Math.sin(t * 1.4 + s.ph) * 0.08;
      },
    };
  },
};

export function buildAmbient(type, THREE, T) {
  const R = R3(THREE);
  const b = AMBIENT[type];
  if (!b) throw new Error('[star-wars] unknown ambient type: ' + type);
  return b(R, T);
}
