// app/babel/babel-district.js — Realistic BABEL district for GTA-style gameplay.
// THE TOWER: central landmark, tiered stone-and-glass tower ~200 units tall
// with golden Ω accents. Vault entrance at the base (south face) — walk up
// and press E to enter Miles' vault (the real vault page, untouched).
// Surrounding district: city blocks, roads, plaza. No pass-through.

import * as THREE from 'three';
import { buildColliders } from '@/lib/gta/collisions.js';

export const BABEL = {
  size: 600,
  blockSize: 44,
  roadWidth: 14,
  plazaRadius: 55, // open plaza around the tower
};

// The tower — tiered setbacks, dark stone + glass, golden accents.
// Returns { tiers: [{w, d, h, y}], totalHeight }
export const TOWER_SPEC = {
  tiers: [
    { w: 60, d: 60, h: 40, y: 20 },   // base
    { w: 50, d: 50, h: 45, y: 62 },   // second tier
    { w: 42, d: 42, h: 45, y: 107 },  // third tier
    { w: 34, d: 34, h: 40, y: 150 },  // fourth tier
    { w: 22, d: 22, h: 30, y: 185 },  // crown
  ],
  crownY: 200, // top of tower
};

// Vault entrance: bronze door on the tower's south face (+z).
// Player walks up and presses E → routes to /babel/vault.
export const VAULT_DOOR = {
  x: 0,
  z: TOWER_SPEC.tiers[0].d / 2 + 1.5, // just outside the base south face
  promptRadius: 6,
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

export function generateBabelDistrict(seed = 2026) {
  const rand = mulberry32(seed);
  const buildings = [];
  const { blockSize, roadWidth, plazaRadius } = BABEL;
  const half = BABEL.size / 2;

  // City blocks around the plaza — realistic mid-rise buildings
  for (let gx = -half; gx < half; gx += blockSize) {
    for (let gz = -half; gz < half; gz += blockSize) {
      const bx = gx + blockSize / 2;
      const bz = gz + blockSize / 2;

      // Keep the plaza clear
      const distPlaza = Math.sqrt(bx * bx + bz * bz);
      if (distPlaza < plazaRadius + blockSize / 2) continue;

      // 1-3 buildings per block
      const count = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < count; i++) {
        const w = 14 + rand() * 16;
        const d = 14 + rand() * 16;
        // Taller near the tower, shorter at the edges
        const distFactor = Math.max(0.3, 1 - distPlaza / 400);
        const h = 18 + rand() * 50 * distFactor + rand() * 20;
        const x = bx + (rand() - 0.5) * (blockSize - roadWidth - w);
        const z = bz + (rand() - 0.5) * (blockSize - roadWidth - d);

        buildings.push({
          x, z, w, d, h,
          color: 0x7d8494 + Math.floor((rand() - 0.5) * 0x0e0e0e),
          windows: rand() > 0.25,
        });
      }
    }
  }

  // Colliders: buildings + tower base (vault door approach stays walkable)
  const towerBase = TOWER_SPEC.tiers[0];
  const colliders = buildColliders(buildings);
  colliders.push({
    minX: -towerBase.w / 2,
    maxX: towerBase.w / 2,
    minZ: -towerBase.d / 2,
    maxZ: towerBase.d / 2,
  });

  return { buildings, colliders };
}

// Build the tower meshes — the landmark. Dark stone, glass bands,
// golden Ω ring near the crown.
// `mats` (optional): { stone, glass } materials from app/babel/cgi.js —
// textured stone with gold veining + streaked glass. Defaults keep
// the old flat materials, so existing callers are unaffected.
export function buildTowerMeshes(scene, mats = {}) {
  const group = new THREE.Group();
  const rand = mulberry32(7);

  const stoneMat = mats.stone || new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 0.75, metalness: 0.25 });
  const glassMat = mats.glass || new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.15, metalness: 0.85 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a24e, roughness: 0.3, metalness: 0.9,
    emissive: 0xd4a24e, emissiveIntensity: 0.25,
  });

  for (const tier of TOWER_SPEC.tiers) {
    // Stone core
    const core = new THREE.Mesh(new THREE.BoxGeometry(tier.w, tier.h, tier.d), stoneMat);
    core.position.set(0, tier.y, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    // Glass band around each tier (slightly larger, thin)
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w + 0.6, tier.h * 0.35, tier.d + 0.6),
      glassMat
    );
    band.position.set(0, tier.y, 0);
    group.add(band);

    // Golden trim at each setback
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w + 1.2, 1.2, tier.d + 1.2),
      goldMat
    );
    trim.position.set(0, tier.y + tier.h / 2, 0);
    group.add(trim);
  }

  // Golden Ω ring near the crown — the forge mark, scaled up
  const omegaRing = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 16, 64), goldMat);
  omegaRing.position.set(0, TOWER_SPEC.crownY - 12, 0);
  omegaRing.rotation.x = Math.PI / 2;
  group.add(omegaRing);

  // Spire on top
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2, 24, 8), goldMat);
  spire.position.set(0, TOWER_SPEC.crownY + 12, 0);
  group.add(spire);

  // Beacon light at the very top
  const beacon = new THREE.PointLight(0xd4a24e, 200, 120);
  beacon.position.set(0, TOWER_SPEC.crownY + 26, 0);
  group.add(beacon);

  // Plaza paving — circular stone plaza
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(BABEL.plazaRadius, BABEL.plazaRadius, 0.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.9 })
  );
  plaza.position.set(0, 0.2, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  // Plaza ring accents (gold inlay circles)
  for (const r of [20, 35, 50]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 8, 64), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.5, 0);
    group.add(ring);
  }

  // Streetlights around the plaza
  const lightGeo = new THREE.CylinderGeometry(0.15, 0.2, 9, 6);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const bulbGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b0, emissive: 0xffd77a, emissiveIntensity: 1.2,
  });
  // The scene drives the bulbs brighter at night (emissive only —
  // no new real lights); the handle rides on the group.
  group.userData.streetlightBulbMat = bulbMat;
  group.userData.goldMat = goldMat;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const x = Math.cos(angle) * (BABEL.plazaRadius - 4);
    const z = Math.sin(angle) * (BABEL.plazaRadius - 4);
    const pole = new THREE.Mesh(lightGeo, lightMat);
    pole.position.set(x, 4.5, z);
    pole.castShadow = true;
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 9.2, z);
    group.add(pole, bulb);
  }

  // Trees on the plaza edge
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const angle = ((i + 0.5) / 12) * Math.PI * 2;
    const x = Math.cos(angle) * (BABEL.plazaRadius - 8);
    const z = Math.sin(angle) * (BABEL.plazaRadius - 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 3, 6), trunkMat);
    trunk.position.set(x, 1.5, z);
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), leafMat);
    leaves.position.set(x, 4.5, z);
    leaves.castShadow = true;
    group.add(trunk, leaves);
  }

  scene.add(group);
  return group;
}

// Build the 3D vault door at the tower base — bronze, imposing.
// Returns the door group (positioned at VAULT_DOOR).
export function buildVaultDoorMesh(scene) {
  const group = new THREE.Group();
  const { x, z } = VAULT_DOOR;

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a2f, roughness: 0.4, metalness: 0.9,
    emissive: 0xd4a24e, emissiveIntensity: 0.15,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0e16, roughness: 0.9 });

  // Recessed arch frame
  const arch = new THREE.Mesh(new THREE.BoxGeometry(9, 11, 1.5), darkMat);
  arch.position.set(x, 5.5, z - 0.5);
  arch.castShadow = true;
  group.add(arch);

  // The door itself — round, bronze
  const door = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 40), bronzeMat);
  door.rotation.x = Math.PI / 2;
  door.position.set(x, 4.2, z + 0.4);
  door.castShadow = true;
  group.add(door);

  // Gold rim
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a24e, metalness: 0.9, roughness: 0.3,
    emissive: 0xd4a24e, emissiveIntensity: 0.35,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.4, 12, 48), goldMat);
  rim.position.set(x, 4.2, z + 0.5);
  group.add(rim);

  // Wheel handle
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.18, 10, 32), bronzeMat);
  wheel.position.set(x, 4.2, z + 0.95);
  group.add(wheel);

  // "MILES' VAULT" sign above — lettered, not a blank plaque.
  // Painted on a canvas (same as the ground texture below).
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#14100a';
  sctx.fillRect(0, 0, 512, 96);
  sctx.strokeStyle = '#d4a24e';
  sctx.lineWidth = 4;
  sctx.strokeRect(4, 4, 504, 88);
  sctx.fillStyle = '#d4a24e';
  sctx.font = 'bold 52px Georgia, serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText("MILES' VAULT", 256, 50);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(8, 1.2, 0.3),
    new THREE.MeshStandardMaterial({
      map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.45,
    })
  );
  sign.position.set(x, 11.5, z + 0.2);
  group.add(sign);

  // Warm light washing the door
  const light = new THREE.PointLight(0xd4a24e, 60, 30);
  light.position.set(x, 5, z + 5);
  group.add(light);

  scene.add(group);
  return group;
}

// Ground texture: asphalt with road grid + plaza.
// CGI pass (Nov 15, 2026): the old painter was flat asphalt — no
// grain, no wear, lane dashes drawn straight through the plaza, no
// crossings. Same road/plaza layout, now with seeded speckle grain,
// cracks, oil stains, zebra crosswalks at the four plaza approaches,
// plaza paver rings + radial seams, and a gold inlay ring at the
// plaza edge. Layout constants untouched — nothing moves.
export function createBabelGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d');
  const { size, blockSize, roadWidth, plazaRadius } = BABEL;
  const rand = mulberry32(2026);

  // Base: dark asphalt
  ctx.fillStyle = '#23252c';
  ctx.fillRect(0, 0, 1024, 1024);

  const px = (world) => ((world + size / 2) / size) * 1024;

  // Plaza: stone circle at center
  ctx.fillStyle = '#3a3d46';
  ctx.beginPath();
  ctx.arc(512, 512, (plazaRadius / size) * 1024, 0, Math.PI * 2);
  ctx.fill();

  // Roads: grid
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth = (roadWidth / size) * 1024;
  for (let g = -size / 2; g <= size / 2; g += blockSize) {
    const p = px(g);
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
  }

  // Lane markings — never through the plaza (the old painter drew
  // them straight across the stone circle).
  const plazaPx = (plazaRadius / size) * 1024;
  ctx.strokeStyle = 'rgba(240,200,100,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  for (let g = -size / 2; g <= size / 2; g += blockSize) {
    const p = px(g);
    if (Math.abs(p - 512) < plazaPx + 8) {
      // Road runs past the plaza: dashes stop at the stone edge and
      // resume on the far side (the old painter drew them straight
      // across the plaza; the old comment claimed to skip them).
      const edge = plazaPx + 8;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512 - edge); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, 512 + edge); ctx.lineTo(p, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512 - edge, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(512 + edge, p); ctx.lineTo(1024, p); ctx.stroke();
      continue;
    }
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── CGI wear: speckle grain over the whole map ──
  const grainColors = ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)', 'rgba(212,162,78,0.04)'];
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = grainColors[Math.floor(rand() * grainColors.length)];
    const s = 1 + rand() * 2;
    ctx.fillRect(rand() * 1024, rand() * 1024, s, s);
  }

  // Cracks: jagged dark polylines radiating near the plaza edge.
  ctx.strokeStyle = 'rgba(10,10,14,0.55)';
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    let x = 512 + Math.cos(a) * (plazaPx + 10 + rand() * 60);
    let y = 512 + Math.sin(a) * (plazaPx + 10 + rand() * 60);
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + Math.floor(rand() * 4);
    for (let s = 0; s < segs; s++) {
      x += (rand() - 0.5) * 46;
      y += (rand() - 0.5) * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Oil stains: dark soft blobs on the roads.
  for (let i = 0; i < 14; i++) {
    const gx = -size / 2 + Math.floor(rand() * 14) * blockSize;
    const gz = -size / 2 + Math.floor(rand() * 14) * blockSize;
    const x = px(gx) + (rand() - 0.5) * 10;
    const y = px(gz) + (rand() - 0.5) * 10;
    ctx.fillStyle = 'rgba(8,8,10,0.35)';
    ctx.beginPath(); ctx.arc(x, y, 4 + rand() * 9, 0, Math.PI * 2); ctx.fill();
  }

  // Zebra crosswalks where the ±44 m roads meet the plaza edge.
  // At x = ±44 the plaza circle ends at z = ±33, so the crossing
  // sits just clear at |z| = 42 (and mirrored on the ±44 m
  // horizontal roads). Bars run along the road, spaced across it.
  ctx.fillStyle = 'rgba(235,235,230,0.75)';
  const roadPx = (44 / size) * 1024; // 44 m from centre, in px
  const crossOff = (42 / size) * 1024; // 42 m from centre, in px
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Crossing a north–south road (x = ±44): bars tall, spaced in x.
      const cx = 512 + sx * roadPx;
      const cy = 512 + sz * crossOff;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(cx + k * 9 - 2.5, cy - 6, 5, 12);
      }
      // Crossing an east–west road (z = ±44): bars wide, spaced in z.
      const hx = 512 + sx * crossOff;
      const hy = 512 + sz * roadPx;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(hx - 6, hy + k * 9 - 2.5, 12, 5);
      }
    }
  }

  // Plaza pavers: concentric rings + radial seams on the stone.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.5;
  for (const r of [14, 26, 38, 48]) {
    ctx.beginPath();
    ctx.arc(512, 512, (r / size) * 1024, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(512 + Math.cos(a) * 8, 512 + Math.sin(a) * 8);
    ctx.lineTo(512 + Math.cos(a) * plazaPx, 512 + Math.sin(a) * plazaPx);
    ctx.stroke();
  }
  // Gold inlay ring at the plaza edge.
  ctx.strokeStyle = 'rgba(212,162,78,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(512, 512, plazaPx - 2, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
