// app/truman/town.js — Realistic 3D Truman town for GTA-style gameplay.
// Perfect suburban coastal town with Truman Show uncanny valley —
// photorealistic rendering, but everything is TOO perfect.
// Houses with lawns, main street shops, beach, lighthouse.

import * as THREE from 'three';
import { buildColliders } from '@/lib/gta/collisions.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export const TOWN = {
  size: 500,
  blockSize: 60,
  roadWidth: 10,
};

// Points of interest (keep Truman identity)
export const TRUMAN_POIS = [
  { id: 'henrys-house', name: "Henry's House", x: 0, z: 0 },
  { id: 'market', name: 'Truman Market', x: 100, z: 150 },
  { id: 'observatory', name: 'Observatory', x: 0, z: -300 },
  { id: 'lighthouse', name: 'Lighthouse', x: 250, z: 200 },
  { id: 'beach', name: 'Beach', x: 200, z: 250 },
  { id: 'wok', name: "Henry's Wok & Grill", x: 150, z: 100 },
];

export function generateTown(seed = 4242) {
  const rand = mulberry32(seed);
  const buildings = []; // houses + shops (colliders)
  const houses = [];
  const { blockSize } = TOWN;
  const half = TOWN.size / 2;

  // Residential grid: houses with lawns
  // Skip the beach area (east) and POI locations
  for (let gx = -half; gx < half; gx += blockSize) {
    for (let gz = -half; gz < half; gz += blockSize) {
      const bx = gx + blockSize / 2;
      const bz = gz + blockSize / 2;

      // Skip beach (x > 150)
      if (bx > 150) continue;
      // Skip POIs (keep clear)
      let nearPOI = false;
      for (const poi of TRUMAN_POIS) {
        const dx = bx - poi.x, dz = bz - poi.z;
        if (dx * dx + dz * dz < 40 * 40) { nearPOI = true; break; }
      }
      if (nearPOI) continue;

      // 2-4 houses per block (uncanny: similar but not identical)
      const count = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < count; i++) {
        const w = 10 + rand() * 4;
        const d = 8 + rand() * 4;
        const h = 6 + rand() * 3; // 1-2 stories
        const x = bx + (rand() - 0.5) * (blockSize - 20);
        const z = bz + (rand() - 0.5) * (blockSize - 20);

        // Uncanny: limited color palette (too perfect)
        const colors = [0xf5f0e8, 0xe8e0d0, 0xd8e8f0, 0xf0e8d8];
        const color = colors[Math.floor(rand() * colors.length)];

        houses.push({ x, z, w, d, h, color, lawn: true });
        buildings.push({ x, z, w, d });
      }
    }
  }

  // Main street shops (along z=100, x from -100 to 100)
  const shops = [];
  const shopNames = ["Truman Market", "Wok & Grill", "Barber", "Cafe", "Books"];
  for (let i = 0; i < 5; i++) {
    const x = -80 + i * 40;
    const z = 100;
    shops.push({ x, z, w: 18, d: 12, h: 8, name: shopNames[i] });
    buildings.push({ x, z, w: 18, d: 12 });
  }

  // Henry's house (special, center)
  const henrysHouse = { x: 0, z: 0, w: 14, d: 10, h: 9, color: 0xffffff, lawn: true };
  houses.push(henrysHouse);
  buildings.push({ x: 0, z: 0, w: 14, d: 10 });

  // Lighthouse (coast)
  const lighthouse = { x: 250, z: 200, w: 8, d: 8, h: 40 };
  buildings.push(lighthouse);

  // Observatory (north hill)
  const observatory = { x: 0, z: -300, w: 20, d: 20, h: 15 };
  buildings.push(observatory);

  return {
    houses, shops,
    henrysHouse, lighthouse, observatory,
    buildings,
    colliders: buildColliders(buildings),
  };
}

// Ground texture: grass with road grid + beach sand on east
export function createTownGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Grass base (perfect green — uncanny)
  ctx.fillStyle = '#4a7c3a';
  ctx.fillRect(0, 0, size, size);

  // Subtle grass variation
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 20}, ${110 + Math.random() * 20}, ${50 + Math.random() * 15}, 0.3)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
  }

  const { blockSize, roadWidth } = TOWN;
  const scale = size / TOWN.size;

  // Roads (gray)
  ctx.fillStyle = '#3a3d42';
  for (let x = 0; x < TOWN.size; x += blockSize) {
    ctx.fillRect(x * scale, 0, roadWidth * scale, size);
  }
  for (let z = 0; z < TOWN.size; z += blockSize) {
    ctx.fillRect(0, z * scale, size, roadWidth * scale);
  }

  // Beach sand (east side, x > 150)
  const beachX = (150 + TOWN.size / 2) * scale;
  ctx.fillStyle = '#d4c49a';
  ctx.fillRect(beachX, 0, size - beachX, size);

  // Water (far east)
  const waterX = (220 + TOWN.size / 2) * scale;
  const grad = ctx.createLinearGradient(waterX, 0, size, 0);
  grad.addColorStop(0, '#4a90c2');
  grad.addColorStop(1, '#2a5a8a');
  ctx.fillStyle = grad;
  ctx.fillRect(waterX, 0, size - waterX, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Trees (manicured — perfect spheres, uncanny)
export function buildTownTrees(scene, count = 120) {
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
  const leafGeo = new THREE.SphereGeometry(2.2, 8, 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7c2a, roughness: 0.8 });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  const dummy = new THREE.Object3D();
  const rand = mulberry32(777);
  const half = TOWN.size / 2 - 20;

  for (let i = 0; i < count; i++) {
    // Along streets, not in houses
    const x = (rand() - 0.5) * half * 2;
    const z = (rand() - 0.5) * half * 2;
    if (x > 140) continue; // not on beach

    dummy.position.set(x, 1, z);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 3.5, z);
    dummy.scale.setScalar(0.9 + rand() * 0.3); // slight variation, still perfect
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(1);
  }

  trunks.castShadow = true;
  leaves.castShadow = true;
  scene.add(trunks, leaves);
}
