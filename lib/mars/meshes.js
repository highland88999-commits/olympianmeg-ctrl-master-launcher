// MARS — procedural flora & fauna mesh builders.
// Faithful ports of the Xenogenesis createAlienFloraMesh /
// createAlienFaunaMesh builders: raw THREE.Group hierarchies built from
// the seeded rng (flora) and the species spec (fauna), so a seed always
// grows the same world. Fauna builders return { group, limbs } where
// limbs are the pivots the scene animates (wings, legs, claws, tails,
// swim segments, gyro rings). No React in here.
import * as THREE from 'three';

// Shared materials, mirroring the source's SharedMaterials singleton.
export const SharedMaterials = {
  mercuryChrome: null,
  init() {
    if (this.mercuryChrome) return this.mercuryChrome;
    this.mercuryChrome = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f1f5f9'),
      metalness: 0.98,
      roughness: 0.05,
      emissive: new THREE.Color('#1e293b'),
      emissiveIntensity: 0.25
    });
    this.mercuryChrome.userData.shared = true;
    return this.mercuryChrome;
  }
};

// Build a procedural flora node (4 elemental archetypes).
// rng is the seeded entity stream — every draw matches the source order.
export function buildFloraGroup(archetype, rng, profile) {
  SharedMaterials.init();
  const group = new THREE.Group();
  // Mars reskin of the source's full-spectrum accent draw: flora glow
  // stays in the regolith family (ground-accent hue with an ember drift)
  // so a seeded world reads as one Martian region, not a rainbow.
  const accentHSL = {};
  profile.groundAccentColor.getHSL(accentHSL);
  const accentCol = new THREE.Color().setHSL(
    (accentHSL.h + rng.range(-0.05, 0.2) + 1) % 1,
    rng.range(0.55, 0.85),
    rng.range(0.45, 0.62)
  );
  const darkCol = profile.groundColor.clone().multiplyScalar(0.65);

  if (archetype === 'crystal_earth') {
    // Earth/Silicon Element: Harmonic Piezo-Crystal Cluster
    const clusterCount = rng.int(3, 6);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: accentCol,
      emissive: accentCol,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.6,
      flatShading: true
    });
    for (let i = 0; i < clusterCount; i++) {
      const h = rng.range(2.0, 5.8);
      const r = rng.range(0.3, 0.75);
      const geo = new THREE.CylinderGeometry(0.04, r, h, rng.int(5, 7));
      geo.translate(0, h / 2, 0);
      const mesh = new THREE.Mesh(geo, crystalMat);
      mesh.rotation.x = rng.range(-0.38, 0.38);
      mesh.rotation.z = rng.range(-0.38, 0.38);
      mesh.rotation.y = rng.range(0, Math.PI * 2);
      group.add(mesh);
    }
  } else if (archetype === 'myco_air') {
    // Air/Aether Element: Bioluminescent Fungal Canopy & Floating Spore-Rings
    const stemH = rng.range(2.8, 6.2);
    const stemGeo = new THREE.CylinderGeometry(0.22, 0.48, stemH, 8);
    stemGeo.translate(0, stemH / 2, 0);
    const stemMat = new THREE.MeshStandardMaterial({
      color: darkCol,
      roughness: 0.7
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    group.add(stem);

    const capR = rng.range(1.3, 2.7);
    const capGeo = new THREE.ConeGeometry(capR, rng.range(1.0, 1.9), 12, 1, true);
    const capMat = new THREE.MeshStandardMaterial({
      color: accentCol,
      emissive: accentCol,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      side: THREE.DoubleSide
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = stemH;
    group.add(cap);

    // Glowing Spore Orb above cap
    const orbGeo = new THREE.OctahedronGeometry(0.35, 1);
    const orb = new THREE.Mesh(orbGeo, capMat);
    orb.position.y = stemH + 1.15;
    orb.userData.isPulseOrb = true;
    group.add(orb);
  } else if (archetype === 'mercury_metal') {
    // Mercury/Metal Element: Chrome Helical Spire with Levitating Quicksilver Droplets
    const spireH = rng.range(2.5, 5.0);
    const torusCount = rng.int(3, 5);
    for (let i = 0; i < torusCount; i++) {
      const tGeo = new THREE.TorusGeometry(rng.range(0.45, 1.05), 0.12, 10, 22);
      const tMesh = new THREE.Mesh(tGeo, SharedMaterials.mercuryChrome);
      tMesh.position.y = 0.7 + i * (spireH / torusCount);
      tMesh.rotation.x = Math.PI / 2 + rng.range(-0.3, 0.3);
      group.add(tMesh);
    }
    const coreGeo = new THREE.SphereGeometry(0.48, 16, 16);
    const coreMesh = new THREE.Mesh(coreGeo, SharedMaterials.mercuryChrome);
    coreMesh.position.y = spireH + 0.5;
    group.add(coreMesh);
  } else {
    // Fire/Pyro-Thermal Tentacle Vent
    const baseGeo = new THREE.ConeGeometry(rng.range(0.8, 1.4), rng.range(1.8, 3.4), 7);
    baseGeo.translate(0, 0.9, 0);
    const baseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1e1b18'),
      roughness: 0.85,
      flatShading: true
    });
    const vent = new THREE.Mesh(baseGeo, baseMat);
    group.add(vent);

    const lavaCol = new THREE.Color().setHSL(rng.range(0.02, 0.11), 0.95, 0.55);
    const coreGeo = new THREE.SphereGeometry(0.55, 10, 10);
    const coreMat = new THREE.MeshStandardMaterial({
      color: lavaCol,
      emissive: lavaCol,
      emissiveIntensity: 0.85
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 1.9;
    group.add(core);
  }

  return group;
}

// Build a procedural fauna entity by ecological niche.
// Returns { group, limbs } — limbs carry the animation pivots.
export function buildFaunaGroup(niche, spec) {
  SharedMaterials.init();
  const group = new THREE.Group();
  const col1 = new THREE.Color(spec.primaryColor);
  const col2 = new THREE.Color(spec.secondaryColor);

  const matPrimary = new THREE.MeshStandardMaterial({
    color: col1,
    emissive: col1,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.25
  });

  const matGlow = new THREE.MeshStandardMaterial({
    color: col2,
    emissive: col2,
    emissiveIntensity: 0.85,
    roughness: 0.2
  });

  const limbs = [];

  if (niche === 'airborne') {
    // AIRBORNE: Sky-Manta / Aether-Glider with Articulated Flapping Wings & Tail
    const bodyGeo = new THREE.ConeGeometry(0.65, 2.6, 8);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, matPrimary);
    group.add(body);

    const coreOrb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), matGlow);
    coreOrb.position.set(0, 0.15, 0.3);
    group.add(coreOrb);

    const wingPairs = spec.wingCount || 2;
    for (let p = 0; p < wingPairs; p++) {
      const zOffset = 0.3 - p * 0.65;
      const span = 2.2 - p * 0.35;
      [-1, 1].forEach((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.35, 0, zOffset);

        const wingGeo = new THREE.BoxGeometry(span, 0.08, 0.85 - p * 0.15);
        wingGeo.translate((side * span) / 2, 0, 0);
        const wing = new THREE.Mesh(wingGeo, p % 2 === 0 ? matPrimary : matGlow);
        pivot.add(wing);

        group.add(pivot);
        limbs.push({ pivot, side, pairIndex: p, type: 'wing' });
      });
    }

    // Trailing bioluminescent tail ribbon
    const tailGeo = new THREE.CylinderGeometry(0.04, 0.18, 2.2, 6);
    tailGeo.rotateX(Math.PI / 2);
    tailGeo.translate(0, 0, -2.1);
    const tail = new THREE.Mesh(tailGeo, matGlow);
    group.add(tail);

  } else if (niche === 'grazer') {
    // GRAZER: Multi-Legged Crystalline Carapace Walker
    const shellGeo = new THREE.SphereGeometry(1.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65);
    shellGeo.scale(1, 0.85, 1.35);
    const shell = new THREE.Mesh(shellGeo, matPrimary);
    shell.position.y = 0.9;
    group.add(shell);

    // Dorsal Bioluminescent Crystal Crests on back
    for (let c = -1; c <= 1; c++) {
      const crestGeo = new THREE.OctahedronGeometry(0.32, 0);
      const crest = new THREE.Mesh(crestGeo, matGlow);
      crest.position.set(0, 1.75, c * 0.65);
      group.add(crest);
    }

    // Neck & Herbivore Spore-Snout
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.05, 1.45);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), matPrimary);
    headGroup.add(headMesh);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), matGlow);
    eyeL.position.set(0.28, 0.15, 0.25);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.28;
    headGroup.add(eyeL, eyeR);
    group.add(headGroup);

    // Articulated Walking Legs
    const pairs = spec.legPairs || 3;
    for (let i = 0; i < pairs; i++) {
      const zPos = 0.75 - (i / Math.max(1, pairs - 1)) * 1.5;
      [-1, 1].forEach((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.85, 0.9, zPos);
        const legGeo = new THREE.CylinderGeometry(0.14, 0.08, 1.15, 6);
        legGeo.translate(0, -0.52, 0);
        const leg = new THREE.Mesh(legGeo, matPrimary);
        leg.rotation.z = side * 0.28;
        pivot.add(leg);
        group.add(pivot);
        limbs.push({ pivot, side, pairIndex: i, type: 'leg' });
      });
    }

  } else if (niche === 'carnivore') {
    // CARNIVORE: Apex Chitinous Stalker with Glowing Sensory Eyes, Raptorial Claws & Whip Tail
    const torsoGeo = new THREE.ConeGeometry(0.78, 2.7, 7);
    torsoGeo.rotateX(Math.PI / 2);
    const torso = new THREE.Mesh(torsoGeo, matPrimary);
    torso.position.y = 1.25;
    group.add(torso);

    // Armored Head & Glowing Predator Eyes
    const skull = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 1), matPrimary);
    skull.position.set(0, 1.5, 1.45);
    group.add(skull);

    for (let e = -1; e <= 1; e++) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), matGlow);
      eye.position.set(e * 0.26, 1.65, 1.88);
      group.add(eye);
    }

    // Front Raptorial Scythe-Mandibles
    [-1, 1].forEach((side) => {
      const clawPivot = new THREE.Group();
      clawPivot.position.set(side * 0.55, 1.35, 1.25);
      const bladeGeo = new THREE.ConeGeometry(0.16, 1.35, 5);
      bladeGeo.rotateX(Math.PI * 0.62);
      bladeGeo.translate(0, -0.2, 0.55);
      const blade = new THREE.Mesh(bladeGeo, matGlow);
      clawPivot.add(blade);
      group.add(clawPivot);
      limbs.push({ pivot: clawPivot, side, pairIndex: 0, type: 'claw' });
    });

    // 4 Striding Stalker Legs
    for (let i = 0; i < 2; i++) {
      const zPos = 0.55 - i * 1.2;
      [-1, 1].forEach((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.7, 1.2, zPos);
        const legGeo = new THREE.CylinderGeometry(0.16, 0.07, 1.4, 6);
        legGeo.translate(0, -0.65, 0);
        const leg = new THREE.Mesh(legGeo, matPrimary);
        leg.rotation.z = side * 0.32;
        pivot.add(leg);
        group.add(pivot);
        limbs.push({ pivot, side, pairIndex: i, type: 'leg' });
      });
    }

    // Stinger Whip Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 1.35, -1.25);
    const tailGeo = new THREE.ConeGeometry(0.22, 2.1, 6);
    tailGeo.rotateX(-Math.PI * 0.35);
    tailGeo.translate(0, 0.65, -0.75);
    const tailMesh = new THREE.Mesh(tailGeo, matGlow);
    tailPivot.add(tailMesh);
    group.add(tailPivot);
    limbs.push({ pivot: tailPivot, side: 1, pairIndex: 0, type: 'tail' });

  } else if (niche === 'waterBorne') {
    // WATER-BORNE: Bioluminescent Multi-Segmented Abyssal Eel / Hydro-Glider
    const segCount = spec.segments || 5;
    for (let s = 0; s < segCount; s++) {
      const radius = (0.48 - s * 0.065) * 1.1;
      const segPivot = new THREE.Group();
      segPivot.position.set(0, 0, 0.9 - s * 0.58);

      const segMesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.14, radius), 10, 10),
        s % 2 === 0 ? matPrimary : matGlow
      );
      segPivot.add(segMesh);

      if (s === 0 || s === 2) {
        [-1, 1].forEach((side) => {
          const finGeo = new THREE.BoxGeometry(0.95 - s * 0.15, 0.05, 0.38);
          finGeo.translate(side * 0.45, 0, 0);
          const fin = new THREE.Mesh(finGeo, matGlow);
          segPivot.add(fin);
        });
      }
      group.add(segPivot);
      limbs.push({ pivot: segPivot, side: 1, pairIndex: s, type: 'swim_seg' });
    }

  } else if (niche === 'mercuryBorne') {
    // MERCURY-BORNE: Liquid-Chrome Morphing Ferro-Symbiote with Gyroscopic Rings
    const coreGeo = new THREE.IcosahedronGeometry(0.68, 2);
    const coreMesh = new THREE.Mesh(coreGeo, SharedMaterials.mercuryChrome);
    coreMesh.position.y = 0.55;
    group.add(coreMesh);

    // Orbiting Gyroscopic Liquid-Metal Rings & Electromagnetic Core
    const ringCount = spec.orbitalRings || 3;
    for (let r = 0; r < ringCount; r++) {
      const ringPivot = new THREE.Group();
      ringPivot.position.y = 0.55;
      const ringGeo = new THREE.TorusGeometry(0.95 + r * 0.28, 0.075, 10, 28);
      const ringMesh = new THREE.Mesh(
        ringGeo,
        r % 2 === 0 ? SharedMaterials.mercuryChrome : matGlow
      );
      ringPivot.add(ringMesh);
      group.add(ringPivot);
      limbs.push({ pivot: ringPivot, side: r % 2 === 0 ? 1 : -1, pairIndex: r, type: 'gyro_ring' });
    }
  }

  group.scale.setScalar(spec.scale || 1.0);
  return { group, limbs };
}
