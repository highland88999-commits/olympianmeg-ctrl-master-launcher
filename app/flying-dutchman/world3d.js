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
import { dayNightFor, getDayNightPlace } from '../../lib/day-night.js';

/**
 * Night factor for the Dutchman (0.15 day … 1 night) from the real
 * clock via the shared day/night law (lib/day-night.js): the
 * walker's real lat/lon when granted, Sydney when not. Falls back
 * to 1 (full night — this is a night storm world) only if no place
 * is available at all or the law throws.
 */
export function dutchmanNightFactor(nowMs = Date.now()) {
  try {
    const place = getDayNightPlace();
    if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number') return 1;
    const { night } = dayNightFor(nowMs, place.lat, place.lon);
    const n = typeof night === 'number' ? night : 1;
    return 0.15 + 0.85 * Math.max(0, Math.min(1, n));
  } catch {
    return 1;
  }
}

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

/** Procedural wood texture: brown planks with grain lines (docks). */
function dockWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5a3d22'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#63452a' : '#54391f';
    g.fillRect(0, i * 32, 256, 30);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, i * 32 + 30, 256, 2);
    // grain lines
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const y = i * 32 + 5 + k * 6 + (i % 3);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + 2, 170, y - 2, 256, y + 1);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Floating name plate (canvas text sprite, same pattern as the page's ⚓ marker). */
function namePlateTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 56px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name, 256, 64);
  g.fillStyle = '#ffd76a';
  g.fillText(name, 256, 64);
  return new THREE.CanvasTexture(c);
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
  // Torches: one shared flickering PointLight per island (light budget
  // = at most one light per island that has torches or a brazier, i.e.
  // <= 8 lights for the 8-island ring), flames flicker per torch.
  const flameTex = radialTexture('rgba(255,220,120,1)', 'rgba(255,90,10,0)', 128);
  const dockTex = dockWoodTexture();
  const dockMat = new THREE.MeshStandardMaterial({ map: dockTex, roughness: 0.9 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2e1f12, roughness: 1 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a1f, roughness: 0.35, metalness: 0.8,
    emissive: new THREE.Color(0x6a4a00), emissiveIntensity: 0.5,
  });
  const islandLights = []; // { light, flames: [{s, phase, base}], phase }
  let nightFNow = 1; // last night factor handed to update(t, nightF)

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

    // Island name plate — a small floating text sprite over the peak.
    // Always visible, small; skipped when the engine gives no name.
    if (typeof isl.name === 'string' && isl.name) {
      const plate = new THREE.Sprite(new THREE.SpriteMaterial({
        map: namePlateTexture(isl.name), transparent: true, depthWrite: false,
      }));
      plate.scale.set(22, 5.5, 1);
      plate.position.set(0, isl.h + 17, 0);
      ig.add(plate);
    }

    // Dock — a wooden pier from the dock point out to sea along
    // dock.angle. Plank positions come from dock.x/z + dock.angle
    // (never re-derived); dock.x/z is the shore end of the pier.
    const dock = isl.dock;
    const hasDock = dock && typeof dock.x === 'number' && typeof dock.z === 'number'
      && typeof dock.angle === 'number';
    const dockDir = hasDock ? { x: Math.sin(dock.angle), z: Math.cos(dock.angle) } : null;
    const PIER_LEN = 18;
    if (hasDock) {
      const pier = new THREE.Group();
      const plankCount = 9;
      for (let k = 0; k < plankCount; k++) {
        const d = k * 2 + 1.1;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 2.0), dockMat);
        plank.position.set(dock.x + dockDir.x * d, 1.5, dock.z + dockDir.z * d);
        plank.rotation.y = dock.angle;
        pier.add(plank);
        // Support piles under every third plank.
        if (k % 3 === 0) {
          for (const s of [-1, 1]) {
            const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 6), postMat);
            pile.position.set(
              dock.x + dockDir.x * d - dockDir.z * s * 1.3, 0.2,
              dock.z + dockDir.z * d + dockDir.x * s * 1.3,
            );
            pier.add(pile);
          }
        }
      }
      // Two mooring posts at the seaward end.
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 8), postMat);
        post.position.set(
          dock.x + dockDir.x * PIER_LEN - dockDir.z * s * 1.7, 1.9,
          dock.z + dockDir.z * PIER_LEN + dockDir.x * s * 1.7,
        );
        pier.add(post);
      }
      group.add(pier);
    }

    // Torches + slot-machine brazier. One shared light per island.
    const flames = []; // { s, phase, base } — flame sprites to flicker
    const torchList = Array.isArray(isl.torches) ? isl.torches : [];
    for (const tp of torchList) {
      if (!tp || typeof tp.x !== 'number' || typeof tp.z !== 'number') continue;
      // Post base sits on the island slope at that spot.
      const lx = tp.x - isl.x, lz = tp.z - isl.z;
      const f = Math.min(1, Math.hypot(lx, lz) / Math.max(1, isl.r));
      const baseY = profileH(isl, f, Math.atan2(lz, lx));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.5, 6), postMat);
      post.position.set(tp.x, baseY + 1.25, tp.z);
      group.add(post);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      flame.position.set(tp.x, baseY + 3.1, tp.z);
      flame.scale.set(2.4, 3.4, 1);
      group.add(flame);
      flames.push({ s: flame, phase: (tp.x * 0.7 + tp.z * 1.3) % 10, base: 2.4 });
    }
    // Brazier at the slot-machine spot — gold-trimmed bowl, bigger
    // flame. The contract gives no slot-machine coordinates, so it
    // sits beside the dock (or the first torch / beach when no dock).
    if (isl.hasSlotMachine) {
      const bx = hasDock ? dock.x - dockDir.z * 4 : (torchList[0] ? torchList[0].x + 4 : isl.x + isl.r * 0.5);
      const bz = hasDock ? dock.z + dockDir.x * 4 : (torchList[0] ? torchList[0].z : isl.z + isl.r * 0.5);
      const blx = bx - isl.x, blz = bz - isl.z;
      const bf = Math.min(1, Math.hypot(blx, blz) / Math.max(1, isl.r));
      const baseY = profileH(isl, bf, Math.atan2(blz, blx));
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.6, 8), postMat);
      stand.position.set(bx, baseY + 0.8, bz);
      group.add(stand);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.5, 0.8, 10), goldMat);
      bowl.position.set(bx, baseY + 1.9, bz);
      group.add(bowl);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      flame.position.set(bx, baseY + 3.2, bz);
      flame.scale.set(4.5, 6, 1);
      group.add(flame);
      flames.push({ s: flame, phase: 3.7, base: 4.5 });
    }
    if (flames.length > 0) {
      // One light per island, parked at the dock (or first flame).
      const lx = hasDock ? dock.x + dockDir.x * 9 : flames[0].s.position.x;
      const lz = hasDock ? dock.z + dockDir.z * 9 : flames[0].s.position.z;
      const light = new THREE.PointLight(0xff8a2a, 0, 60, 1.8);
      light.position.set(lx, 5, lz);
      group.add(light);
      islandLights.push({ light, flames, phase: isl.seed % 10 });
    }

    group.add(ig);
  }
  scene.add(group);
  const api = {
    group,
    get nightF() { return nightFNow; },
    update(t, nightF = 1) {
      nightFNow = typeof nightF === 'number' ? Math.max(0, Math.min(1, nightF)) : 1;
      for (const w of wisps) {
        const k = 0.6 + 0.3 * Math.sin(t * 1.4 + w.phase);
        w.s.material.opacity = k;
        const sc = 19 + Math.sin(t * 0.9 + w.phase) * 2;
        w.s.scale.set(sc, sc, 1);
      }
      // Torches: lit at night, bare posts by day. The night factor
      // runs 0.15 (day) … 1 (night), so litK is 0 at day and 1 at
      // night; flames and the shared island light scale with it and
      // flicker like the nether torch lights.
      const litK = Math.max(0, Math.min(1, (nightFNow - 0.15) / 0.85));
      for (const entry of islandLights) {
        for (const fl of entry.flames) {
          const flick = 0.75 + 0.25 * Math.sin(t * 11 + fl.phase) * Math.sin(t * 5.3 + fl.phase * 2);
          const sc = fl.base * flick;
          fl.s.visible = litK > 0.02;
          fl.s.scale.set(sc, sc * 1.4, 1);
          fl.s.material.opacity = 0.95 * litK;
        }
        entry.light.intensity = (24 + 6 * Math.sin(t * 13 + entry.phase * 3.1)
          * Math.sin(t * 5.7 + entry.phase)) * litK;
      }
    },
  };
  return api;
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
