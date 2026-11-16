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

// Ground texture: grass with road grid + beach sand on east.
// CGI pass: per-block lawn tones, sidewalk strips along every
// road, dashed centre lines + edge lines, crosswalks on the main
// street, speckled sand with dune grass, foam at the waterline
// and wave strokes on the water. Seeded — same town every load.
export function createTownGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(4242);

  // Grass base (perfect green — uncanny)
  ctx.fillStyle = '#4a7c3a';
  ctx.fillRect(0, 0, size, size);

  // Per-block lawn tone: each 60-unit block its own shade of green.
  const { blockSize, roadWidth } = TOWN;
  const scale = size / TOWN.size;
  for (let bx = -TOWN.size / 2; bx < TOWN.size / 2; bx += blockSize) {
    for (let bz = -TOWN.size / 2; bz < TOWN.size / 2; bz += blockSize) {
      const tone = 0.9 + rand() * 0.2;
      const r = Math.round(74 * tone), g = Math.round(124 * tone), b = Math.round(58 * tone);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect((bx + TOWN.size / 2) * scale, (bz + TOWN.size / 2) * scale,
        blockSize * scale, blockSize * scale);
    }
  }

  // Subtle grass variation
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 20}, ${110 + Math.random() * 20}, ${50 + Math.random() * 15}, 0.3)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
  }

  // Roads (asphalt) + sidewalks (pale strips on both sides)
  ctx.fillStyle = '#33363b';
  for (let x = 0; x < TOWN.size; x += blockSize) {
    ctx.fillRect(x * scale, 0, roadWidth * scale, size);
  }
  for (let z = 0; z < TOWN.size; z += blockSize) {
    ctx.fillRect(0, z * scale, size, roadWidth * scale);
  }
  // Sidewalk strips: 3 units wide, tight to each road edge.
  ctx.fillStyle = '#a89e88';
  const sw = 3 * scale;
  for (let x = 0; x < TOWN.size; x += blockSize) {
    const rx = x * scale;
    ctx.fillRect(rx - sw, 0, sw, size);
    ctx.fillRect(rx + roadWidth * scale, 0, sw, size);
  }
  for (let z = 0; z < TOWN.size; z += blockSize) {
    const rz = z * scale;
    ctx.fillRect(0, rz - sw, size, sw);
    ctx.fillRect(0, rz + roadWidth * scale, size, sw);
  }
  // Asphalt speckle
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // Centre dashes (pale yellow) + edge lines on every road.
  ctx.fillStyle = 'rgba(216,194,122,0.85)';
  for (let x = 0; x < TOWN.size; x += blockSize) {
    const cx = (x + roadWidth / 2) * scale;
    for (let y = 0; y < size; y += 26) ctx.fillRect(cx - 1.5, y, 3, 14);
  }
  for (let z = 0; z < TOWN.size; z += blockSize) {
    const cz = (z + roadWidth / 2) * scale;
    for (let x = 0; x < size; x += 26) ctx.fillRect(x, cz - 1.5, 14, 3);
  }
  ctx.fillStyle = 'rgba(230,230,230,0.35)';
  for (let x = 0; x < TOWN.size; x += blockSize) {
    const rx = x * scale;
    ctx.fillRect(rx + 1, 0, 2, size);
    ctx.fillRect(rx + roadWidth * scale - 3, 0, 2, size);
  }
  for (let z = 0; z < TOWN.size; z += blockSize) {
    const rz = z * scale;
    ctx.fillRect(0, rz + 1, size, 2);
    ctx.fillRect(0, rz + roadWidth * scale - 3, size, 2);
  }
  // Crosswalks: zebra stripes across the main-street road (z = 110
  // world) at each shop, and one by Henry's house (x = -10 road).
  ctx.fillStyle = 'rgba(235,235,235,0.7)';
  const roadZc = (110 + TOWN.size / 2) * scale + (roadWidth * scale) / 2; // z=110 road centre
  for (const sx of [-80, -40, 0, 40, 80]) {
    const px = (sx + TOWN.size / 2) * scale;
    for (let k = 0; k < 5; k++) ctx.fillRect(px - 10 + k * 5, roadZc - (roadWidth * scale) / 2, 3, roadWidth * scale);
  }
  const roadXc = (-10 + TOWN.size / 2) * scale + (roadWidth * scale) / 2; // x=-10 road centre
  for (let k = 0; k < 5; k++) ctx.fillRect(roadXc - (roadWidth * scale) / 2, (0 + TOWN.size / 2) * scale - 10 + k * 5, roadWidth * scale, 3);

  // Beach sand (east side, x > 150)
  const beachX = (150 + TOWN.size / 2) * scale;
  ctx.fillStyle = '#d4c49a';
  ctx.fillRect(beachX, 0, size - beachX, size);
  // Sand speckle + dune grass tufts near the top of the beach.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,200,0.35)' : 'rgba(120,90,40,0.25)';
    ctx.fillRect(beachX + Math.random() * (size - beachX), Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(90,130,60,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const gx = beachX + 6 + rand() * 70, gy = rand() * size;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 2, gy - 7);
    ctx.moveTo(gx, gy); ctx.lineTo(gx + 2, gy - 8); ctx.stroke();
  }

  // Water (far east)
  const waterX = (220 + TOWN.size / 2) * scale;
  const grad = ctx.createLinearGradient(waterX, 0, size, 0);
  grad.addColorStop(0, '#4a90c2');
  grad.addColorStop(1, '#2a5a8a');
  ctx.fillStyle = grad;
  ctx.fillRect(waterX, 0, size - waterX, size);
  // Foam at the waterline + wave strokes.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = 0; y < size; y += 18) ctx.fillRect(waterX - 2, y, 5, 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const wy = rand() * size, wx = waterX + 10 + rand() * (size - waterX - 30);
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 24 + rand() * 30, wy); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Shop sign: painted board with the shop's name. One canvas per
// shop, built once by the scene — small-town storefronts, not
// blank cream boxes.
export function createShopSignTexture(name, bg = '#3a5a3a') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = '#fdf6e0';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Trees (manicured — perfect spheres, uncanny)
// CGI pass: layered two-tone canopies (a main crown + a lighter
// top crown), varied scale and tilt, and the sway bases returned
// so the scene can bend them in the breeze. Skipped slots (beach)
// are zero-scaled — the old code left them piled at the origin,
// right on Henry's house. Returns the meshes + sway bases.
export function buildTownTrees(scene, count = 120) {
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
  const leafGeo = new THREE.SphereGeometry(2.2, 8, 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7c2a, roughness: 0.8 });
  const topGeo = new THREE.SphereGeometry(1.5, 8, 6);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x4a9c3a, roughness: 0.8 });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  const leavesTop = new THREE.InstancedMesh(topGeo, topMat, count);
  const dummy = new THREE.Object3D();
  const rand = mulberry32(777);
  const half = TOWN.size / 2 - 20;
  const leafBase = [];

  for (let i = 0; i < count; i++) {
    // Along streets, not in houses
    const x = (rand() - 0.5) * half * 2;
    const z = (rand() - 0.5) * half * 2;
    const s = 0.9 + rand() * 0.3; // slight variation, still perfect
    const phase = rand() * Math.PI * 2;
    if (x > 140) { // not on beach: zero-scale the slot, never the origin
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.0001);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
      leavesTop.setMatrixAt(i, dummy.matrix);
      leafBase.push({ x: 0, z: 0, s: 0, phase, hidden: true });
      continue;
    }
    leafBase.push({ x, z, s, phase, hidden: false });

    dummy.position.set(x, 1, z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 3.5, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, phase, 0);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x + 0.5, 4.9, z - 0.3);
    dummy.scale.setScalar(s * 0.8);
    dummy.updateMatrix();
    leavesTop.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(1);
  }

  trunks.castShadow = true;
  leaves.castShadow = true;
  leavesTop.castShadow = true;
  scene.add(trunks, leaves, leavesTop);
  return { trunks, leaves, leavesTop, leafBase };
}
