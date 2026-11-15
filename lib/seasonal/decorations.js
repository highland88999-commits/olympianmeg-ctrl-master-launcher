// lib/seasonal/decorations.js
//
// Procedural seasonal decorations for the launcher hub — plain three.js.
// Every builder: buildXxx(THREE, ...args) -> { group, update(t, dt) | null }
//
// Design rules (Merlin: cleanest UI, mobile-first):
// - Decor lives on a ring at radius 78-95 (outside the satellite bands at
//   46-66) so it ACCENTS the hub without cluttering it.
// - Cheap: InstancedMesh + Points + Sprites. No shadow-casting decor,
//   no per-frame allocations. Bright basic materials bloom nicely.
// - update(t, dt) is optional; keep per-frame matrix writes under ~250.

import { getParticleTexture } from '../particles/sprites.js';

/** Deterministic RNG so layouts are stable across reloads. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGlowTexture(THREE, inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function canvasTexture(THREE, size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Position on the decor ring with jitter. Hub center y=35. */
function ringPos(rand, i, count, rMin, rMax, yBase, yVar) {
  const a = (i / count) * Math.PI * 2 + rand() * 0.35;
  const r = rMin + rand() * (rMax - rMin);
  return [
    Math.cos(a) * r,
    yBase + (rand() - 0.5) * yVar,
    -80 + Math.sin(a) * r, // hub z-center is -80 (ORBIT_CENTER)
  ];
}

export function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Fireworks: shared by newyear / canadaday / independence / starwars-day-6.
// Points-based bursts from N launchers, recycled. Palette = array of hex.
// ---------------------------------------------------------------------------
function makeFireworks(THREE, palette, launcherCount = 6, seed = 7) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const P = 42; // particles per burst
  const total = launcherCount * P;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const vel = [];
  const life = new Float32Array(total);
  const maxLife = new Float32Array(total);
  const color = new THREE.Color();

  const launchers = [];
  for (let i = 0; i < launcherCount; i++) {
    const [x, y, z] = ringPos(rand, i, launcherCount, 80, 95, 55, 20);
    launchers.push([x, y, z]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    map: getParticleTexture('spark') || undefined,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);
  for (let i = 0; i < total; i++) { vel.push([0, 0, 0]); life[i] = -1; }

  let timer = 0;
  function burst(li) {
    const [lx, ly, lz] = launchers[li];
    const c = palette[Math.floor(rand() * palette.length)];
    color.setHex(c);
    for (let p = 0; p < P; p++) {
      const idx = li * P + p;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      const sp = 14 + rand() * 16;
      vel[idx] = [
        Math.sin(ph) * Math.cos(th) * sp,
        Math.cos(ph) * sp * 0.9 + 6,
        Math.sin(ph) * Math.sin(th) * sp,
      ];
      pos[idx * 3] = lx; pos[idx * 3 + 1] = ly; pos[idx * 3 + 2] = lz;
      col[idx * 3] = color.r; col[idx * 3 + 1] = color.g; col[idx * 3 + 2] = color.b;
      maxLife[idx] = 1.1 + rand() * 0.7;
      life[idx] = maxLife[idx];
    }
  }
  // seed one burst so the sky is alive on first frame
  burst(0);

  function update(t, dt) {
    timer -= dt;
    if (timer <= 0) {
      burst(Math.floor(rand() * launcherCount));
      timer = 0.9 + rand() * 1.4;
    }
    for (let i = 0; i < total; i++) {
      if (life[i] < 0) { pos[i * 3 + 1] = -9999; continue; }
      life[i] -= dt;
      if (life[i] < 0) { pos[i * 3 + 1] = -9999; continue; }
      vel[i][1] -= 9 * dt;
      pos[i * 3] += vel[i][0] * dt;
      pos[i * 3 + 1] += vel[i][1] * dt;
      pos[i * 3 + 2] += vel[i][2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { group, update };
}

// ---------------------------------------------------------------------------
// Generic falling loop: leaves / petals / snow-ish drift in a band.
// ---------------------------------------------------------------------------
function makeFallingLoop(THREE, { count, colors, size, area, yTop, yBottom, fallSpeed, sway, seed }) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: (rand() - 0.5) * area,
      y: yBottom + rand() * (yTop - yBottom),
      z: -80 + (rand() - 0.5) * area,
      sp: fallSpeed * (0.7 + rand() * 0.6),
      ph: rand() * Math.PI * 2,
      sw: sway * (0.5 + rand()),
    });
    color.setHex(colors[i % colors.length]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  function update(t, dt) {
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      p.y -= p.sp * dt;
      if (p.y < yBottom) p.y = yTop;
      dummy.position.set(p.x + Math.sin(t * 0.9 + p.ph) * p.sw, p.y, p.z);
      dummy.rotation.set(t * 0.7 + p.ph, p.ph, t * 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// HALLOWEEN — pumpkins, cobweb corners, accent lights
// (mist removed 2026-10-27 at Merlin's order — see below)
// ---------------------------------------------------------------------------
function buildHalloween(THREE) {
  const rand = mulberry32(31);
  const group = new THREE.Group();

  // pumpkins: instanced squashed spheres + stems + glow faces
  const N = 12;
  const pGeo = new THREE.SphereGeometry(2.2, 18, 14);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xd9621e, roughness: 0.7 });
  const pumpkins = new THREE.InstancedMesh(pGeo, pMat, N);
  const sGeo = new THREE.CylinderGeometry(0.28, 0.4, 1.4, 8);
  const sMat = new THREE.MeshStandardMaterial({ color: 0x3d5a1e, roughness: 0.9 });
  const stems = new THREE.InstancedMesh(sGeo, sMat, N);
  const glowTex = makeGlowTexture(THREE, 'rgba(255,180,60,1)', 'rgba(255,120,20,0)');
  const dummy = new THREE.Object3D();
  const spots = [];   // harvestable pumpkin spots: { x, y, z, s }
  const faces = [];   // jack-o-lantern face sprites (dimmed once harvested)
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 92, 8, 6);
    const s = 0.8 + rand() * 0.9;
    dummy.position.set(x, y, z);
    dummy.scale.set(s, s * 0.78, s);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    pumpkins.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + 1.9 * s, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    // jack-o-lantern face glow
    const face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa030, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    face.scale.set(3.4 * s, 2.6 * s, 1);
    face.position.set(x, y + 0.4, z);
    group.add(face);
    faces.push(face);
    spots.push({ x, y, z, s });
  }
  group.add(pumpkins, stems);

  // Gold pieces: one harvestable nugget per pumpkin (Merlin 2026-10-09).
  // Plus invisible hit-proxies for tap harvesting. Nugget bobs gently until
  // harvested; harvested pumpkins go dim via setHarvested(i).
  const nuggetGeo = new THREE.OctahedronGeometry(0.55);
  const nuggetMat = new THREE.MeshStandardMaterial({
    color: 0xffd75e, emissive: 0xcc8a00, emissiveIntensity: 1.1,
    metalness: 0.9, roughness: 0.25,
  });
  const nuggets = new THREE.InstancedMesh(nuggetGeo, nuggetMat, N);
  const nuggetBase = [];
  const proxies = [];
  const proxyGeo = new THREE.SphereGeometry(3.2, 8, 6);
  // opacity-0 but raycastable (visible=false would also work in most three
  // versions, but an invisible-material mesh is guaranteed hittable).
  const proxyMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, colorWrite: false,
  });
  for (let i = 0; i < N; i++) {
    const sp = spots[i];
    dummy.position.set(sp.x, sp.y + 2.6 * sp.s, sp.z);
    dummy.scale.set(sp.s, sp.s, sp.s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    nuggets.setMatrixAt(i, dummy.matrix);
    nuggetBase.push({ x: sp.x, y: sp.y + 2.6 * sp.s, z: sp.z, s: sp.s });
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.position.set(sp.x, sp.y + 0.5, sp.z);
    proxy.scale.setScalar(sp.s);
    proxy.userData.pumpkinId = `pumpkin-${i}`;
    group.add(proxy);
    proxies.push(proxy);
  }
  nuggets.instanceMatrix.needsUpdate = true;
  group.add(nuggets);

  const _c = new THREE.Color();
  const _m = new THREE.Matrix4();

  const pumpkinSpots = spots.map((sp, i) => ({
    id: `pumpkin-${i}`,
    position: [sp.x, sp.y, sp.z],
    scale: sp.s,
  }));

  // Keyholes (the Halloween ghosts: white sheet phantoms) removed
  // 2026-10-20 at Merlin's order — pure decor, no interaction, no
  // purpose; restore from git history if they ever earn a place back.
  // The ghost block burned 40 seeded draws (8 ghosts × (3 ringPos +
  // ph + sp)); those draws are still burned here so the cobweb
  // layout below stays byte-for-byte identical to before.
  // The drifting mist sprites that followed the cobwebs were removed
  // 2026-10-27 at Merlin's order ("get rid of the things marked with
  // x's from this space entirely, leave the pumpkins"); nothing after
  // the mist block drew from rand, so no other layout shifts.
  for (let i = 0; i < 40; i++) rand();

  // cobweb corners: line fans
  const webPts = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = ringPos(rand, i, 6, 84, 92, 30, 30);
    for (let r = 0; r < 5; r++) {
      const a0 = rand() * Math.PI * 2;
      webPts.push(x, y, z, x + Math.cos(a0) * (3 + r * 1.6), y + (rand() - 0.5) * 3, z + Math.sin(a0) * (3 + r * 1.6));
    }
  }
  const webGeo = new THREE.BufferGeometry();
  webGeo.setAttribute('position', new THREE.Float32BufferAttribute(webPts, 3));
  group.add(new THREE.LineSegments(webGeo, new THREE.LineBasicMaterial({ color: 0x9aa4c0, transparent: true, opacity: 0.5 })));

  const orange = new THREE.PointLight(0xff7a1e, 60, 220, 1.6);
  orange.position.set(60, 30, -40);
  const purple = new THREE.PointLight(0x8a2be2, 50, 220, 1.6);
  purple.position.set(-60, 45, -120);
  group.add(orange, purple);

  const harvestedIdx = new Set();
  function update(t) {
    // gold nuggets bob and spin until harvested
    for (let i = 0; i < N; i++) {
      if (harvestedIdx.has(i)) continue;
      const b = nuggetBase[i];
      dummy.position.set(b.x, b.y + Math.sin(t * 2 + i * 1.7) * 0.35, b.z);
      dummy.scale.setScalar(b.s * (1 + Math.sin(t * 3 + i) * 0.08));
      dummy.rotation.set(0, t * 1.2 + i, 0);
      dummy.updateMatrix();
      nuggets.setMatrixAt(i, dummy.matrix);
    }
    nuggets.instanceMatrix.needsUpdate = true;
  }
  function setHarvested(i) {
    if (i < 0 || i >= N || harvestedIdx.has(i)) return;
    harvestedIdx.add(i);
    // nugget vanishes
    _m.makeScale(0, 0, 0);
    nuggets.setMatrixAt(i, _m);
    nuggets.instanceMatrix.needsUpdate = true;
    // pumpkin goes dim and cold
    pumpkins.setColorAt(i, _c.setHex(0x5a3a22));
    if (pumpkins.instanceColor) pumpkins.instanceColor.needsUpdate = true;
    // face glow fades to ember
    if (faces[i]) faces[i].material.opacity = 0.12;
  }
  return { group, update, pumpkinSpots, proxies, setHarvested };
}

// ---------------------------------------------------------------------------
// REMEMBRANCE — poppy field. Respectful: static, no flashing, soft light.
// ---------------------------------------------------------------------------
function buildRemembrance(THREE) {
  const rand = mulberry32(11);
  const group = new THREE.Group();
  const N = 220;
  const dummy = new THREE.Object3D();

  const stemGeo = new THREE.CylinderGeometry(0.06, 0.09, 2.2, 6);
  const stemMat = new THREE.MeshBasicMaterial({ color: 0x2d5a27 });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, N);
  const headGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xc0272d });
  const heads = new THREE.InstancedMesh(headGeo, headMat, N);
  const dotGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, N);

  for (let i = 0; i < N; i++) {
    // a sweeping field below the hub, denser toward one side
    const a = rand() * Math.PI * 2;
    const r = 70 + Math.pow(rand(), 0.7) * 40;
    const x = Math.cos(a) * r;
    const z = -80 + Math.sin(a) * r;
    const y = -2 + rand() * 4;
    const s = 0.8 + rand() * 0.7;
    dummy.position.set(x, y, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + 1.25 * s, z);
    dummy.scale.set(s, s * 0.55, s);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + 1.55 * s, z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
  }
  group.add(stems, heads, dots);

  const soft = new THREE.PointLight(0xff5040, 25, 200, 1.8);
  soft.position.set(0, 12, -80);
  group.add(soft);
  return { group, update: null };
}

// ---------------------------------------------------------------------------
// THANKSGIVING — falling harvest leaves, gourds, warm amber tones
// ---------------------------------------------------------------------------
function buildThanksgiving(THREE) {
  const rand = mulberry32(21);
  const group = new THREE.Group();

  const leaves = makeFallingLoop(THREE, {
    count: 150,
    colors: [0xd97b29, 0xb8451f, 0xe0a93e, 0x8f5a1d, 0xc25e2e],
    size: 1.4, area: 150, yTop: 75, yBottom: -5,
    fallSpeed: 3.2, sway: 4, seed: 21,
  });
  group.add(leaves.group);

  // gourds on the ring
  const N = 8;
  const dummy = new THREE.Object3D();
  const gGeo = new THREE.SphereGeometry(1.6, 14, 12);
  const gMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const gourds = new THREE.InstancedMesh(gGeo, gMat, N);
  const color = new THREE.Color();
  const gCols = [0xc47b1e, 0x9a5f16, 0xd8a03c, 0x7a4a12];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 92, 8, 6);
    const s = 0.9 + rand() * 0.8;
    dummy.position.set(x, y, z);
    dummy.scale.set(s, s * (0.7 + rand() * 0.5), s);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    gourds.setMatrixAt(i, dummy.matrix);
    color.setHex(gCols[i % gCols.length]);
    gourds.setColorAt(i, color);
  }
  gourds.instanceColor.needsUpdate = true;
  group.add(gourds);

  const amber = new THREE.PointLight(0xffb347, 55, 230, 1.6);
  amber.position.set(40, 35, -60);
  group.add(amber);

  return { group, update: leaves.update };
}

// ---------------------------------------------------------------------------
// CHRISTMAS decor — snowfall + string-light ring. (Merlin's perfected tree
// is mounted separately by the component via lib/seasonal/tree.js.)
// ---------------------------------------------------------------------------
function buildChristmasDecor(THREE) {
  const rand = mulberry32(25);
  const group = new THREE.Group();

  // snowfall around the hub
  const N = 400;
  const pos = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rand() - 0.5) * 220;
    pos[i * 3 + 1] = -10 + rand() * 100;
    pos[i * 3 + 2] = -80 + (rand() - 0.5) * 220;
    spd[i] = 2 + rand() * 4;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xeef4ff, size: 0.9, transparent: true, opacity: 0.9, depthWrite: false,
    map: getParticleTexture('flake') || undefined,
  }));
  snow.frustumCulled = false;
  group.add(snow);

  // string lights ringing the hub
  const M = 64;
  const dummy = new THREE.Object3D();
  const bulbGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const bulbMat = new THREE.MeshBasicMaterial();
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, M);
  const color = new THREE.Color();
  const cols = [0xffd27a, 0xff5a5a, 0x5aff8a, 0x5aa8ff, 0xfff3c4];
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 84, 52 + Math.sin(a * 3) * 3, -80 + Math.sin(a) * 84);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    color.setHex(cols[i % cols.length]);
    bulbs.setColorAt(i, color);
  }
  bulbs.instanceColor.needsUpdate = true;
  group.add(bulbs);

  function update(t, dt) {
    const arr = snowGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] -= spd[i] * dt;
      arr[i * 3] += Math.sin(t * 0.8 + i) * dt * 2;
      if (arr[i * 3 + 1] < -10) arr[i * 3 + 1] = 90;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
  return { group, update };
}

// ---------------------------------------------------------------------------
// NEW YEAR — gold/white fireworks + drifting confetti
// ---------------------------------------------------------------------------
function buildNewyear(THREE) {
  const group = new THREE.Group();
  const fw = makeFireworks(THREE, [0xffd700, 0xffffff, 0xc0c0e0, 0xffe9a8], 6, 77);
  group.add(fw.group);
  const confetti = makeFallingLoop(THREE, {
    count: 120, colors: [0xffd700, 0xffffff, 0xff6b9d, 0x4da6ff],
    size: 0.9, area: 160, yTop: 80, yBottom: 0,
    fallSpeed: 4.5, sway: 6, seed: 78,
  });
  group.add(confetti.group);
  function update(t, dt) { fw.update(t, dt); confetti.update(t, dt); }
  return { group, update };
}

// ---------------------------------------------------------------------------
// VALENTINE'S — floating hearts, pink/red, gentle bob
// ---------------------------------------------------------------------------
function buildValentines(THREE) {
  const rand = mulberry32(214);
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.4);
  shape.bezierCurveTo(-2.2, 0.2, -1.4, 1.8, 0, 0.7);
  shape.bezierCurveTo(1.4, 1.8, 2.2, 0.2, 0, -1.4);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  geo.center();
  const mat = new THREE.MeshBasicMaterial();
  const N = 40;
  const hearts = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const cols = [0xff4d6d, 0xff8fa3, 0xd90429, 0xffb3c1];
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 94, 42, 22);
    const s = 0.9 + rand() * 1.3;
    items.push({ x, y, z, s, ph: rand() * Math.PI * 2, sp: 0.5 + rand() * 0.6 });
    color.setHex(cols[i % cols.length]);
    hearts.setColorAt(i, color);
  }
  hearts.instanceColor.needsUpdate = true;
  group.add(hearts);
  const pink = new THREE.PointLight(0xff6b9d, 40, 220, 1.7);
  pink.position.set(0, 45, -80);
  group.add(pink);

  function update(t) {
    for (let i = 0; i < N; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y + Math.sin(t * p.sp + p.ph) * 2.5, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.y = t * 0.4 + p.ph;
      dummy.updateMatrix();
      hearts.setMatrixAt(i, dummy.matrix);
    }
    hearts.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// ST. PATRICK'S — shamrock field (canvas sprites), green + gold accents
// ---------------------------------------------------------------------------
function buildStpatricks(THREE) {
  const rand = mulberry32(317);
  const group = new THREE.Group();
  const tex = canvasTexture(THREE, 128, (g, s) => {
    g.fillStyle = '#2d8a4e';
    const leaf = (x, y) => { g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill(); };
    leaf(64, 40); leaf(40, 72); leaf(88, 72);
    g.strokeStyle = '#2d8a4e'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(64, 80); g.quadraticCurveTo(70, 105, 58, 120); g.stroke();
  });
  const N = 60;
  const geo = new THREE.PlaneGeometry(3.2, 3.2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const rocks = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D();
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 94, 30, 30);
    items.push({ x, y, z, ph: rand() * Math.PI * 2, s: 0.8 + rand() * 0.9 });
  }
  group.add(rocks);
  const green = new THREE.PointLight(0x2d8a4e, 45, 220, 1.7);
  green.position.set(-40, 40, -100);
  const gold = new THREE.PointLight(0xd4af37, 35, 200, 1.7);
  gold.position.set(50, 30, -60);
  group.add(green, gold);

  function update(t) {
    for (let i = 0; i < N; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y + Math.sin(t * 0.7 + p.ph) * 1.6, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.y = t * 0.25 + p.ph;
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// EASTER — pastel eggs + spring blooms, soft light
// ---------------------------------------------------------------------------
function buildEaster(THREE) {
  const rand = mulberry32(44);
  const group = new THREE.Group();
  const N = 36;
  const dummy = new THREE.Object3D();
  const eggGeo = new THREE.SphereGeometry(1.1, 14, 12);
  const eggMat = new THREE.MeshBasicMaterial();
  const eggs = new THREE.InstancedMesh(eggGeo, eggMat, N);
  const color = new THREE.Color();
  const cols = [0xf9c6d3, 0xc6e7f9, 0xf9ecc6, 0xd9c6f9, 0xc6f9d4];
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 93, 32, 26);
    const s = 0.9 + rand() * 0.8;
    items.push({ x, y, z, s, ph: rand() * Math.PI * 2 });
    color.setHex(cols[i % cols.length]);
    eggs.setColorAt(i, color);
  }
  eggs.instanceColor.needsUpdate = true;
  group.add(eggs);

  // spring blooms: soft pink/white glow sprites drifting
  const bloomTex = makeGlowTexture(THREE, 'rgba(255,200,220,0.9)', 'rgba(255,200,220,0)');
  const blooms = [];
  for (let i = 0; i < 24; i++) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bloomTex, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    const [x, y, z] = ringPos(rand, i, 24, 82, 94, 40, 24);
    b.position.set(x, y, z);
    const s = 3 + rand() * 3;
    b.scale.set(s, s, 1);
    b.userData = { baseY: y, ph: rand() * Math.PI * 2 };
    group.add(b);
    blooms.push(b);
  }
  const pastel = new THREE.PointLight(0xffc6d3, 35, 220, 1.7);
  pastel.position.set(0, 45, -80);
  group.add(pastel);

  function update(t) {
    for (let i = 0; i < N; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y + Math.sin(t * 0.6 + p.ph) * 2, p.z);
      dummy.scale.set(p.s, p.s * 1.3, p.s);
      dummy.rotation.y = t * 0.3 + p.ph;
      dummy.updateMatrix();
      eggs.setMatrixAt(i, dummy.matrix);
    }
    eggs.instanceMatrix.needsUpdate = true;
    for (const b of blooms) {
      b.position.y = b.userData.baseY + Math.sin(t * 0.5 + b.userData.ph) * 3;
    }
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// HOLI — swirling color petals
// ---------------------------------------------------------------------------
function buildHoli(THREE) {
  const group = new THREE.Group();
  const petals = makeFallingLoop(THREE, {
    count: 200,
    colors: [0xff2a7a, 0xffd21f, 0x2aff7a, 0x2a7aff, 0xb02aff, 0xff6a2a],
    size: 1.1, area: 170, yTop: 80, yBottom: 0,
    fallSpeed: 5, sway: 8, seed: 55,
  });
  group.add(petals.group);
  const vivid = new THREE.PointLight(0xff6ab0, 40, 220, 1.7);
  vivid.position.set(0, 45, -80);
  group.add(vivid);
  return { group, update: petals.update };
}

// ---------------------------------------------------------------------------
// LUNAR NEW YEAR — red lanterns swaying, gold accents
// ---------------------------------------------------------------------------
function buildLunarnewyear(THREE) {
  const rand = mulberry32(66);
  const group = new THREE.Group();
  const N = 20;
  const dummy = new THREE.Object3D();
  const lanGeo = new THREE.SphereGeometry(1.8, 16, 12);
  const lanMat = new THREE.MeshBasicMaterial({ color: 0xd42a1e });
  const lanterns = new THREE.InstancedMesh(lanGeo, lanMat, N);
  const capGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.5, 8);
  const capMat = new THREE.MeshBasicMaterial({ color: 0xd4af37 });
  const caps = new THREE.InstancedMesh(capGeo, capMat, N * 2);
  const glowTex = makeGlowTexture(THREE, 'rgba(255,120,60,0.85)', 'rgba(255,80,30,0)');
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 93, 42, 16);
    const s = 0.9 + rand() * 0.7;
    items.push({ x, y, z, s, ph: rand() * Math.PI * 2 });
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    gl.scale.set(7 * s, 7 * s, 1);
    gl.position.set(x, y, z);
    gl.userData = { i };
    group.add(gl);
    items[i].glow = gl;
  }
  group.add(lanterns, caps);
  const gold = new THREE.PointLight(0xd4af37, 45, 220, 1.7);
  gold.position.set(0, 45, -80);
  group.add(gold);

  function update(t) {
    for (let i = 0; i < N; i++) {
      const p = items[i];
      const sway = Math.sin(t * 0.8 + p.ph) * 1.4;
      dummy.position.set(p.x + sway, p.y, p.z);
      dummy.scale.set(p.s, p.s * 1.15, p.s);
      dummy.updateMatrix();
      lanterns.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x + sway, p.y + 2.1 * p.s, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      caps.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(p.x + sway, p.y - 2.1 * p.s, p.z);
      dummy.updateMatrix();
      caps.setMatrixAt(i * 2 + 1, dummy.matrix);
      p.glow.position.set(p.x + sway, p.y, p.z);
    }
    lanterns.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// DIWALI — clay diyas with flickering flames, warm light
// ---------------------------------------------------------------------------
function buildDiwali(THREE) {
  const rand = mulberry32(77);
  const group = new THREE.Group();
  const N = 30;
  const dummy = new THREE.Object3D();
  const diyaGeo = new THREE.CylinderGeometry(1.0, 0.7, 0.7, 12);
  const diyaMat = new THREE.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.9 });
  const diyas = new THREE.InstancedMesh(diyaGeo, diyaMat, N);
  const flameTex = makeGlowTexture(THREE, 'rgba(255,220,120,1)', 'rgba(255,140,40,0)');
  const flames = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 93, 14, 10);
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    diyas.setMatrixAt(i, dummy.matrix);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    f.position.set(x, y + 1.3, z);
    f.userData = { ph: rand() * Math.PI * 2 };
    group.add(f);
    flames.push(f);
  }
  group.add(diyas);
  const warm1 = new THREE.PointLight(0xff9a3c, 50, 220, 1.7);
  warm1.position.set(50, 25, -60);
  const warm2 = new THREE.PointLight(0xff9a3c, 50, 220, 1.7);
  warm2.position.set(-50, 25, -100);
  group.add(warm1, warm2);

  function update(t) {
    for (const f of flames) {
      const fl = 0.8 + 0.25 * Math.sin(t * 11 + f.userData.ph) + 0.1 * Math.sin(t * 23 + f.userData.ph);
      f.scale.set(1.6 * fl, 2.4 * fl, 1);
    }
    warm1.intensity = 50 + Math.sin(t * 9) * 6;
    warm2.intensity = 50 + Math.sin(t * 9 + 2) * 6;
  }
  return { group, update };
}

// ---------------------------------------------------------------------------
// CANADA DAY — red/white fireworks + drifting maple leaves
// ---------------------------------------------------------------------------
function buildCanadaday(THREE) {
  const rand = mulberry32(71);
  const group = new THREE.Group();
  const fw = makeFireworks(THREE, [0xff0000, 0xffffff, 0xff6b6b], 6, 71);
  group.add(fw.group);
  const leafTex = canvasTexture(THREE, 128, (g) => {
    g.fillStyle = '#d42a1e';
    g.beginPath();
    // simple maple leaf silhouette
    const pts = [[64,8],[74,38],[104,30],[86,56],[110,70],[84,74],[92,104],[64,88],[36,104],[44,74],[18,70],[42,56],[24,30],[54,38]];
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fill();
    g.strokeStyle = '#d42a1e'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(64, 88); g.lineTo(64, 122); g.stroke();
  });
  const N = 20;
  const geo = new THREE.PlaneGeometry(3, 3);
  const mat = new THREE.MeshBasicMaterial({ map: leafTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const leaves = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D();
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 94, 38, 24);
    items.push({ x, y, z, ph: rand() * Math.PI * 2, s: 0.9 + rand() * 0.8 });
  }
  group.add(leaves);
  function update(t, dt) {
    fw.update(t, dt);
    for (let i = 0; i < N; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y + Math.sin(t * 0.7 + p.ph) * 2.4, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.y = t * 0.5 + p.ph;
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// US INDEPENDENCE DAY — red/white/blue fireworks + drifting stars
// ---------------------------------------------------------------------------
function buildIndependence(THREE) {
  const rand = mulberry32(74);
  const group = new THREE.Group();
  const fw = makeFireworks(THREE, [0xff3b3b, 0xffffff, 0x3b6bff, 0xffd700], 7, 74);
  group.add(fw.group);
  const starTex = canvasTexture(THREE, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 52 : 22;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  });
  const N = 24;
  const geo = new THREE.PlaneGeometry(2.6, 2.6);
  const mat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const stars = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D();
  const items = [];
  for (let i = 0; i < N; i++) {
    const [x, y, z] = ringPos(rand, i, N, 80, 94, 40, 24);
    items.push({ x, y, z, ph: rand() * Math.PI * 2, s: 0.8 + rand() * 0.9 });
  }
  group.add(stars);
  function update(t, dt) {
    fw.update(t, dt);
    for (let i = 0; i < N; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y + Math.sin(t * 0.6 + p.ph) * 2.2, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.y = t * 0.4 + p.ph;
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    stars.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { group, update };
}

// ---------------------------------------------------------------------------
// STAR WARS DAYS — May 4-6, exact 72-hour window. Tasteful accents:
// lightsaber glow pylons, intensified starfield, flybys, Death Star.
// Per-day flavor: 4th = Jedi (blue/green), 5th = Sith (red),
// 6th = celebration (Endor greens/golds).
// ---------------------------------------------------------------------------
function buildTIEFighter(THREE) {
  const g = new THREE.Group();
  const hull = new THREE.MeshBasicMaterial({ color: 0x8a94a6 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x3a4150 });
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), hull);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), dark);
  win.position.set(0, 0.15, 1.0);
  g.add(cockpit, win);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.12, 6), hull);
    wing.rotation.z = Math.PI / 2;
    wing.position.set(sx * 2.7, 0, -0.2);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6), dark);
    strut.rotation.z = Math.PI / 2;
    strut.position.set(sx * 1.6, 0, -0.1);
    g.add(wing, strut);
  }
  return g;
}

function buildXWing(THREE) {
  const g = new THREE.Group();
  const hull = new THREE.MeshBasicMaterial({ color: 0x9aa0a8 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x4a5058 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 8), hull);
  fus.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 8), dark);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.7;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), dark);
  cockpit.position.set(0, 0.45, 0.6);
  g.add(fus, nose, cockpit);
  // S-foils in attack position (X config)
  for (const [sy, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.1), hull);
    wing.position.set(sy * 1.9, sz * 0.55, -0.6);
    wing.rotation.z = sy * sz * 0.28;
    g.add(wing);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(THREE, 'rgba(255,150,80,1)', 'rgba(255,80,30,0)'),
      transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(1.1, 1.1, 1);
    glow.position.set(sy * 0.9, sz * 0.35, -2.2);
    g.add(glow);
  }
  return g;
}

function makeFlyby(THREE, buildCraft, { count, radius, y, speed, seed, dir = 1 }) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const craft = [];
  for (let i = 0; i < count; i++) {
    const c = buildCraft(THREE);
    group.add(c);
    craft.push({
      obj: c,
      ph: (i / count) * Math.PI * 2 + rand() * 0.6,
      sp: speed * (0.9 + rand() * 0.2),
      r: radius * (0.92 + rand() * 0.16),
      y: y + (rand() - 0.5) * 16,
    });
  }
  function update(t) {
    for (const c of craft) {
      const a = c.ph + t * c.sp * dir;
      c.obj.position.set(Math.cos(a) * c.r, c.y, -80 + Math.sin(a) * c.r);
      c.obj.rotation.y = -a + (dir > 0 ? 0 : Math.PI);
      c.obj.rotation.z = dir * 0.3;
    }
  }
  return { group, update };
}

function buildStarwars(THREE, day) {
  const group = new THREE.Group();
  const updates = [];

  // starfield intensification: dense bright shell
  {
    const rand = mulberry32(54);
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      const r = 400 + rand() * 500;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = 35 + Math.cos(ph) * r * 0.7;
      pos[i * 3 + 2] = -80 + Math.sin(ph) * Math.sin(th) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 1.8, sizeAttenuation: false, transparent: true,
      opacity: 0.85, depthWrite: false,
    }));
    stars.frustumCulled = false;
    group.add(stars);
  }

  // lightsaber glow pylons around the ring — color per day
  const palettes = {
    4: [0x4da6ff, 0x51ff7a], // Jedi: blue / green
    5: [0xff2a2a],           // Sith: red
    6: [0x51ff7a, 0xffd700], // Celebration: Endor greens / golds
  };
  const palette = palettes[day] || palettes[4];
  {
    const rand = mulberry32(55);
    const N = 12;
    for (let i = 0; i < N; i++) {
      const [x, y, z] = ringPos(rand, i, N, 84, 90, 10, 4);
      const col = palette[i % palette.length];
      const pylon = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6, metalness: 0.7 })
      );
      base.position.y = 0.8;
      const blade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 13, 10),
        new THREE.MeshBasicMaterial({ color: col })
      );
      blade.position.y = 8;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(THREE, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
        color: col, transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      glow.scale.set(3.2, 15, 1);
      glow.position.y = 8;
      pylon.add(base, blade, glow);
      pylon.position.set(x, y, z);
      group.add(pylon);
    }
  }

  if (day === 4) {
    // Jedi day: X-wing patrol
    const fly = makeFlyby(THREE, buildXWing, { count: 3, radius: 110, y: 55, speed: 0.14, seed: 56 });
    group.add(fly.group);
    updates.push(fly.update);
    const blue = new THREE.PointLight(0x4da6ff, 35, 240, 1.7);
    blue.position.set(0, 50, -80);
    group.add(blue);
  } else if (day === 5) {
    // Sith day: Death Star silhouette + TIE patrol
    const ds = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(38, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x14161c })
    );
    ds.add(sphere);
    const dish = new THREE.Mesh(
      new THREE.CircleGeometry(11, 24),
      new THREE.MeshBasicMaterial({ color: 0x23262e })
    );
    // face the dish toward the hub
    dish.position.set(0.42 * 38, 0.2 * 38, 0.88 * 38);
    dish.lookAt(0, 35 - 150, -80 + 620);
    ds.add(dish);
    ds.position.set(-380, 150, -620);
    group.add(ds);
    updates.push((t) => { ds.rotation.y = t * 0.02; });
    const fly = makeFlyby(THREE, buildTIEFighter, { count: 4, radius: 105, y: 50, speed: -0.16, seed: 57, dir: -1 });
    group.add(fly.group);
    updates.push(fly.update);
    const red = new THREE.PointLight(0xff2a2a, 30, 240, 1.7);
    red.position.set(0, 50, -80);
    group.add(red);
  } else {
    // Celebration day: green/gold fireworks + drifting light motes
    const fw = makeFireworks(THREE, [0x51ff7a, 0xffd700, 0xffffff, 0x7dffb0], 5, 58);
    group.add(fw.group);
    updates.push(fw.update);
    const rand = mulberry32(59);
    const N = 40;
    const moteTex = makeGlowTexture(THREE, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    const motes = [];
    const moteCols = [0x51ff7a, 0xffd700];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: moteTex, color: moteCols[i % 2], transparent: true, opacity: 0.8,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const [x, y, z] = ringPos(rand, i, N, 80, 94, 40, 24);
      m.position.set(x, y, z);
      const s = 1.2 + rand() * 1.6;
      m.scale.set(s, s, 1);
      m.userData = { baseY: y, ph: rand() * Math.PI * 2 };
      group.add(m);
      motes.push(m);
    }
    updates.push((t) => {
      for (const m of motes) {
        m.position.y = m.userData.baseY + Math.sin(t * 0.7 + m.userData.ph) * 3;
      }
    });
  }

  function update(t, dt) {
    for (const u of updates) u(t, dt);
  }
  return { group, update };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const BUILDERS = {
  halloween: (THREE) => buildHalloween(THREE),
  remembrance: (THREE) => buildRemembrance(THREE),
  thanksgiving: (THREE) => buildThanksgiving(THREE),
  christmas: (THREE) => buildChristmasDecor(THREE),
  newyear: (THREE) => buildNewyear(THREE),
  valentines: (THREE) => buildValentines(THREE),
  stpatricks: (THREE) => buildStpatricks(THREE),
  easter: (THREE) => buildEaster(THREE),
  holi: (THREE) => buildHoli(THREE),
  lunarnewyear: (THREE) => buildLunarnewyear(THREE),
  diwali: (THREE) => buildDiwali(THREE),
  canadaday: (THREE) => buildCanadaday(THREE),
  independence: (THREE) => buildIndependence(THREE),
  starwars: (THREE, day) => buildStarwars(THREE, day),
};
