// The cursed archipelago — islands and treasure chests (three.js).
//
// - Islands: low-poly radial-grid isles with a sand beach at the
//   waterline, dark rock above, dead trees, beach rocks, and a
//   spectral wisp at the peak so they read through the storm fog.
// - Chests: beached treasure on sandbars just off the beach. A chest
//   bobs on the swell and glows gold; sailing close opens it (lid
//   swings, glow fades) and the engine pays the souls.
// - The world is deterministic: island placement comes from the
//   engine's seeded world, so a voyage always finds the same isles.

import * as THREE from 'three';
import { waveHeight, ISLAND } from './engine.js';

const TAU = Math.PI * 2;

function radialTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Deterministic 0..1 wobble from an island seed + angle.
function wob(seed, a, k) {
  return Math.sin(a * k + seed * 0.0013) * 0.5 + Math.sin(a * (k + 4) - seed * 0.0021) * 0.5;
}

/** Island height at a local fraction f (0 = peak, 1 = beach) and angle. */
function profileH(isl, f, a) {
  if (f >= 1) return 0;
  return isl.h * (1 - f * f) * (0.88 + 0.12 * Math.sin(a * 5 + f * 8 + isl.seed * 0.003));
}

function buildIslandGeometry(isl) {
  const S = 28; // segments around
  const R = 10; // rings out to the beach
  const pos = [];
  const col = [];
  const idx = [];
  const sand = new THREE.Color(0xc7ab7d);
  const rock = new THREE.Color(0x3d454b);
  const peak = new THREE.Color(0x1e2428);
  const tmp = new THREE.Color();

  // Center vertex (the peak).
  pos.push(0, isl.h, 0);
  col.push(peak.r, peak.g, peak.b);
  const ringStart = (i) => 1 + (i - 1) * S;

  for (let i = 1; i <= R; i++) {
    const f = i / R;
    for (let j = 0; j < S; j++) {
      const a = (j / S) * TAU;
      const rw = 1 + 0.10 * wob(isl.seed, a, 3) + 0.06 * wob(isl.seed, a, 7);
      const radius = f * isl.r * rw;
      const h = profileH(isl, f, a);
      pos.push(Math.cos(a) * radius, h, Math.sin(a) * radius);
      if (h < 2.5) tmp.copy(sand);
      else if (h < 9) tmp.copy(rock);
      else tmp.copy(peak);
      // slight tonal variation so the facets read
      const v = 0.92 + 0.16 * Math.abs(wob(isl.seed + 77, a, 5));
      col.push(tmp.r * v, tmp.g * v, tmp.b * v);
    }
  }
  // Center fan.
  for (let j = 0; j < S; j++) {
    idx.push(0, ringStart(1) + ((j + 1) % S), ringStart(1) + j);
  }
  // Quads between rings.
  for (let i = 1; i < R; i++) {
    for (let j = 0; j < S; j++) {
      const a0 = ringStart(i) + j, a1 = ringStart(i) + ((j + 1) % S);
      const b0 = ringStart(i + 1) + j, b1 = ringStart(i + 1) + ((j + 1) % S);
      idx.push(a0, b0, a1, b1, a1, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildDeadTree(h) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x17110b, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, h, 6), mat);
  trunk.position.y = h / 2;
  trunk.rotation.z = (Math.random() - 0.5) * 0.2;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, h * 0.45, 5), mat);
    br.position.set((Math.random() - 0.5) * 0.6, h * (0.6 + i * 0.12), (Math.random() - 0.5) * 0.6);
    br.rotation.z = 0.7 + Math.random() * 0.6;
    br.rotation.y = Math.random() * TAU;
    g.add(br);
  }
  return g;
}

/**
 * Build the islands. Returns { group, update(t) } — update pulses the
 * peak wisps so the isles read through the fog.
 */
export function createIslands(scene, islands) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
  });
  const wispTex = radialTexture('rgba(140,255,210,0.95)', 'rgba(40,255,170,0)', 128);
  const wisps = [];

  for (const isl of islands) {
    const ig = new THREE.Group();
    ig.position.set(isl.x, 0, isl.z);
    const mesh = new THREE.Mesh(buildIslandGeometry(isl), mat);
    mesh.frustumCulled = false;
    ig.add(mesh);

    // Dead trees on the slope.
    const treeCount = 3 + (isl.seed % 3);
    for (let k = 0; k < treeCount; k++) {
      const a = ((isl.seed % 1000) / 1000 + k * 0.37) * TAU;
      const f = 0.35 + ((k * 0.13 + (isl.seed % 7) * 0.03) % 0.35);
      const h = profileH(isl, f, a);
      const tree = buildDeadTree(6 + (isl.seed % 4));
      tree.position.set(Math.cos(a) * f * isl.r, h - 0.2, Math.sin(a) * f * isl.r);
      tree.rotation.y = a + k;
      ig.add(tree);
    }
    // Beach rocks.
    for (let k = 0; k < 4; k++) {
      const a = ((isl.seed % 500) / 500 + k * 0.61) * TAU;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1 + ((isl.seed + k * 13) % 15) / 10, 0),
        new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 1, flatShading: true })
      );
      rock.position.set(Math.cos(a) * isl.r * 0.96, 0.4, Math.sin(a) * isl.r * 0.96);
      rock.rotation.set(k, a, k * 0.7);
      ig.add(rock);
    }
    // Spectral wisp at the peak — the landmark you steer by.
    const wisp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: wispTex, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    wisp.scale.set(20, 20, 1);
    wisp.position.set(0, isl.h + 6, 0);
    ig.add(wisp);
    wisps.push({ s: wisp, phase: isl.seed % 10 });

    group.add(ig);
  }
  scene.add(group);
  return {
    group,
    update(t) {
      for (const w of wisps) {
        const k = 0.6 + 0.3 * Math.sin(t * 1.4 + w.phase);
        w.s.material.opacity = k;
        const sc = 19 + Math.sin(t * 0.9 + w.phase) * 2;
        w.s.scale.set(sc, sc, 1);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Treasure chests
// ---------------------------------------------------------------------------

function buildChestMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2f16, roughness: 0.85 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x2e1c0c, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0x8a6a1f, roughness: 0.35, metalness: 0.8,
    emissive: new THREE.Color(0x6a4a00), emissiveIntensity: 0.5,
  });
  // Sandbar mound so it reads as beached treasure.
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a744e, roughness: 1 })
  );
  mound.scale.set(1.4, 0.28, 1.4);
  mound.position.y = -0.1;
  g.add(mound);
  // Chest body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.1), wood);
  body.position.y = 0.55;
  g.add(body);
  // Gold bands.
  for (const x of [-0.55, 0.55]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 1.14), gold);
    band.position.set(x, 0.55, 0);
    g.add(band);
  }
  // Hinged lid (pivot at the back top edge of the body).
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.0, -0.55);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 1.1), woodDark);
  lid.position.set(0, 0.18, 0.55);
  pivot.add(lid);
  const lidGold = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.12), gold);
  lidGold.position.set(0, 0.36, 0.55);
  pivot.add(lidGold);
  g.add(pivot);
  // Gold glow (the "come and get me" beacon).
  const glowTex = radialTexture('rgba(255,210,90,0.95)', 'rgba(255,160,20,0)', 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.75, depthWrite: false,
  }));
  glow.scale.set(10, 10, 1);
  glow.position.y = 2.2;
  g.add(glow);
  return { group: g, pivot, glow };
}

/**
 * Build the chests. Returns { group, sync(chests, t) } — sync bobs them
 * on the swell, swings a collected lid open, and fades its glow.
 */
export function createChests(scene, chests) {
  const group = new THREE.Group();
  const meshes = new Map();
  for (const c of chests) {
    const m = buildChestMesh();
    m.group.position.set(c.x, 0.3, c.z);
    m.group.userData.phase = (c.id.charCodeAt(c.id.length - 1) || 0) * 0.7;
    group.add(m.group);
    meshes.set(c.id, m);
  }
  scene.add(group);
  return {
    group,
    sync(list, t) {
      for (const c of list) {
        const m = meshes.get(c.id);
        if (!m) continue;
        const wh = waveHeight(c.x, c.z, t);
        m.group.position.y = wh + 0.35 + Math.sin(t * 1.3 + m.group.userData.phase) * 0.12;
        if (c.opened) {
          const k = Math.min(1, (t - c.openT) / 0.5);
          m.pivot.rotation.x = -1.9 * k;
          m.glow.material.opacity = Math.max(0.12, 0.75 * (1 - k));
        } else {
          m.pivot.rotation.x = 0;
          m.glow.material.opacity = 0.6 + 0.25 * Math.sin(t * 2.2 + m.group.userData.phase);
        }
      }
    },
  };
}
