// app/mega-city/city.js — Realistic 3D Mega City for GTA-style gameplay.
// Procedural Manhattan-style metropolis: skyscrapers downtown, shorter outskirts.
// PBR materials, day/night cycle, emissive windows at night.
// Subway: 3 stations integrated (underground, enterable).

import * as THREE from 'three';
import { buildColliders } from '@/lib/gta/collisions.js';
import { materialForFacade, facadeKindForDistrict } from '@/lib/gta/city-cgi.js';

export const CITY = {
  size: 600, // world units (square)
  blockSize: 40,
  roadWidth: 12,
};

// Seeded RNG
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// District layout
export const DISTRICTS_3D = [
  { id: 'downtown', name: 'Downtown', cx: 0, cz: 0, r: 120, minH: 60, maxH: 160, color: 0x8a94a6 },
  { id: 'harbor', name: 'Harbor', cx: -180, cz: 140, r: 100, minH: 15, maxH: 40, color: 0x7a8494, water: true },
  { id: 'residential', name: 'Residential', cx: 160, cz: -120, r: 110, minH: 10, maxH: 30, color: 0x9aa2b2 },
  { id: 'industrial', name: 'Industrial', cx: -140, cz: -160, r: 90, minH: 12, maxH: 35, color: 0x6e7686 },
];

// Subway stations (keep Merlin's 3: Neon Harbor, Spire District, Data Bazaar)
export const SUBWAY_STATIONS = [
  { id: 'harbor', name: 'Neon Harbor', x: -180, z: 140 },
  { id: 'spire', name: 'Spire District', x: 0, z: 0 },
  { id: 'bazaar', name: 'Data Bazaar', x: 120, z: 60 },
];

export function generateCity(seed = 1337) {
  const rand = mulberry32(seed);
  const buildings = [];
  const { blockSize, roadWidth } = CITY;
  const half = CITY.size / 2;

  // Grid: blocks with roads between
  for (let gx = -half; gx < half; gx += blockSize) {
    for (let gz = -half; gz < half; gz += blockSize) {
      // Skip road areas (keep roads clear)
      const bx = gx + blockSize / 2;
      const bz = gz + blockSize / 2;

      // Find district for height variation
      let minH = 15, maxH = 40, color = 0x8a94a6, districtId = 'outer';
      for (const d of DISTRICTS_3D) {
        const dx = bx - d.cx, dz = bz - d.cz;
        if (dx * dx + dz * dz < d.r * d.r) {
          minH = d.minH; maxH = d.maxH; color = d.color; districtId = d.id;
          break;
        }
      }

      // Skip water areas in harbor
      const harbor = DISTRICTS_3D[1];
      const hdx = bx - harbor.cx, hdz = bz - harbor.cz;
      if (hdx * hdx + hdz * hdz < 50 * 50) continue; // water

      // 1-4 buildings per block
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const w = 12 + rand() * 14;
        const d = 12 + rand() * 14;
        const h = minH + rand() * (maxH - minH);
        const x = bx + (rand() - 0.5) * (blockSize - roadWidth - w);
        const z = bz + (rand() - 0.5) * (blockSize - roadWidth - d);

        buildings.push({
          x, z, w, d, h,
          color: color + Math.floor((rand() - 0.5) * 0x101010),
          windows: rand() > 0.3,
          rooftop: rand() > 0.6,
          district: districtId,
        });
      }
    }
  }

  return { buildings, colliders: buildColliders(buildings) };
}

// Create Three.js meshes for the city — grouped by facade kind so
// downtown reads as glass towers, the harbor as brick, the rest as
// concrete / industrial (lib/gta/city-cgi.js). Unused by the live
// scene (gta-scene.js builds the same groups inline) but kept as
// the canonical builder; no callers pass materials any more.
export function buildCityMeshes(scene, cityData) {
  const { buildings } = cityData;
  const group = new THREE.Group();
  const byKind = new Map();
  for (const b of buildings) {
    const kind = facadeKindForDistrict(b.district);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(b);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const colorObj = new THREE.Color();
  for (const [kind, list] of byKind) {
    const mesh = new THREE.InstancedMesh(boxGeo, materialForFacade(kind, 1337), list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colorObj.setHex(b.color);
      mesh.setColorAt(i, colorObj);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

// Ground plane with road grid texture
export function createGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Asphalt base
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(0, 0, size, size);

  // Grid roads
  const { blockSize, roadWidth } = CITY;
  const scale = size / CITY.size;
  ctx.fillStyle = '#1e2126'; // road color

  for (let x = 0; x < CITY.size; x += blockSize) {
    ctx.fillRect(x * scale, 0, roadWidth * scale, size);
  }
  for (let z = 0; z < CITY.size; z += blockSize) {
    ctx.fillRect(0, z * scale, size, roadWidth * scale);
  }

  // Lane markings
  ctx.strokeStyle = '#c8a84b';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  for (let x = 0; x < CITY.size; x += blockSize) {
    const lx = (x + roadWidth / 2) * scale;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, size); ctx.stroke();
  }
  for (let z = 0; z < CITY.size; z += blockSize) {
    const lz = (z + roadWidth / 2) * scale;
    ctx.beginPath(); ctx.moveTo(0, lz); ctx.lineTo(size, lz); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Sidewalks (lighter border around blocks)
  ctx.strokeStyle = '#3a3e45';
  ctx.lineWidth = 4;
  for (let x = 0; x < CITY.size; x += blockSize) {
    for (let z = 0; z < CITY.size; z += blockSize) {
      ctx.strokeRect(
        (x + roadWidth) * scale, (z + roadWidth) * scale,
        (blockSize - roadWidth) * scale, (blockSize - roadWidth) * scale
      );
    }
  }

  // --- CGI wear pass (was flat asphalt: no crosswalks, no wear,
  // no variation at all) — seeded so every phone paints the same street.
  const wearRand = mulberry32(20261115);
  // Asphalt speckle: fine light/dark grain across the whole tile.
  for (let i = 0; i < 9000; i++) {
    const g = wearRand();
    ctx.fillStyle = g > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(wearRand() * size, wearRand() * size, 2, 2);
  }
  // Wear patches: pale, worn asphalt blotches on the blocks.
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = `rgba(120,125,135,${0.04 + wearRand() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(wearRand() * size, wearRand() * size, 14 + wearRand() * 42, 10 + wearRand() * 30, wearRand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Oil stains: dark drips along the road centres.
  for (let i = 0; i < 60; i++) {
    const horizontal = wearRand() > 0.5;
    const road = Math.floor(wearRand() * (CITY.size / blockSize)) * blockSize + roadWidth / 2;
    const along = wearRand() * CITY.size;
    ctx.fillStyle = `rgba(8,8,10,${0.10 + wearRand() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(
      horizontal ? along * scale : road * scale,
      horizontal ? road * scale : along * scale,
      4 + wearRand() * 8, 3 + wearRand() * 6, wearRand() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
  }
  // Crosswalks: white zebra stripes at every intersection, on both axes.
  ctx.fillStyle = 'rgba(230,230,225,0.75)';
  const stripeW = 3 * scale, stripeGap = 3.4 * scale, stripeLen = 11 * scale;
  for (let x = 0; x < CITY.size; x += blockSize) {
    for (let z = 0; z < CITY.size; z += blockSize) {
      const cx = (x + roadWidth / 2) * scale;
      const cz = (z + roadWidth / 2) * scale;
      // Across the north-south road (stripes run east-west).
      for (let s = -stripeLen / 2; s < stripeLen / 2; s += stripeGap) {
        ctx.fillRect(cx - stripeW / 2, cz + s - roadWidth * scale * 0.5 - 2, stripeW, stripeGap * 0.55);
        ctx.fillRect(cx - stripeW / 2, cz + s + roadWidth * scale * 0.5 - 2, stripeW, stripeGap * 0.55);
      }
      // Across the east-west road (stripes run north-south).
      for (let s = -stripeLen / 2; s < stripeLen / 2; s += stripeGap) {
        ctx.fillRect(cx + s - roadWidth * scale * 0.5 - 2, cz - stripeW / 2, stripeGap * 0.55, stripeW);
        ctx.fillRect(cx + s + roadWidth * scale * 0.5 - 2, cz - stripeW / 2, stripeGap * 0.55, stripeW);
      }
    }
  }
  // Manholes: dark rings in the middle of blocks of road.
  ctx.strokeStyle = 'rgba(12,12,14,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const mx = wearRand() * size, mz = wearRand() * size;
    ctx.beginPath();
    ctx.arc(mx, mz, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Harbor wet tint: darker, damp asphalt around the water.
  const harbor = DISTRICTS_3D[1];
  const hx = (harbor.cx + CITY.size / 2) * scale;
  const hz = (harbor.cz + CITY.size / 2) * scale;
  const wet = ctx.createRadialGradient(hx, hz, 10, hx, hz, 90 * scale);
  wet.addColorStop(0, 'rgba(20,40,55,0.35)');
  wet.addColorStop(1, 'rgba(20,40,55,0)');
  ctx.fillStyle = wet;
  ctx.fillRect(hx - 90 * scale, hz - 90 * scale, 180 * scale, 180 * scale);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Streetlights (instanced poles + emissive lamp heads).
// Heads carry their own emissive material so the scene can light
// them at night with no new real lights. Returns { poles, heads, headMat }.
export function buildStreetlights(scene, count = 80) {
  const geo = new THREE.CylinderGeometry(0.15, 0.2, 8, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cc, emissive: 0xffdf9e, emissiveIntensity: 0.2,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  const dummy = new THREE.Object3D();
  const rand = mulberry32(999);
  const { blockSize } = CITY;
  const half = CITY.size / 2;

  let placed = 0;
  for (let x = -half; x < half && placed < count; x += blockSize) {
    for (let z = -half; z < half && placed < count; z += blockSize) {
      if (rand() > 0.5) continue;
      dummy.position.set(x + 6, 4, z + 6);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      dummy.position.set(x + 6, 8.1, z + 6);
      dummy.updateMatrix();
      heads.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
  }
  mesh.count = placed;
  heads.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  scene.add(heads);
  return { poles: mesh, heads, headMat };
}
