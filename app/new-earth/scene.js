// NEW EARTH — Merlin's explorable vision of Earth's future.
// Procedural Three.js world module. The landscape is built from
// primitives; the dinosaurs are Earth 2's real GLB models,
// loaded on demand through Earth 2's delivery path (signed
// store URL first, public site file as fallback). Mobile-first,
// Safari-safe. Export contract:
//   LANDMARKS, TOUR, createWorld(canvas, cb) -> world API.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { dayNightFor, getDayNightPlace, requestDayNightPlace, applyDayNightRig } from '../../lib/day-night.js';
import { dinosNear, stepDino, shouldDespawn, showcaseGround, SPAWN_RADIUS_M, REFRESH_SECONDS } from '../../lib/earth3/spawner.js';
import { plantTrees, islandTreeSpeciesForIndex } from '../../lib/earth3/trees.js';
import { tileToWorld, TILE_M } from '../../lib/earth3/terrain.js';
import { tileIndexFromId } from '../../lib/earth3/claims.js';
import { modelDeliveryUrls, fetchEarth2ModelUrls } from '../../lib/earth2/models.js';
import { resolveBones, normalizeJointName } from '../../lib/earth2/bones.js';
import { supabase } from '../../lib/supabase';

/* ============================================================
   Landmarks — the page shell builds against this exact shape
   ============================================================ */

export const LANDMARKS = [
  {
    id: 'plaza',
    name: 'Central Plaza',
    tagline: 'The heart of New Earth',
    caption: "Welcome to New Earth — Merlin's vision of the planet thriving. Walk it, fly it, or take the tour.",
    honesty: 'vision',
    camPos: [0, 3.2, 24],
    camLook: [0, 2.6, 0],
  },
  {
    id: 'aetheris',
    name: 'AETHERIS Scrubbers',
    tagline: 'Scrubbing the sky clean',
    caption: 'AETHERIS towers scrub the sky — the reason the air is this blue. Vision concept: atmosphere-scale filtration.',
    honesty: 'vision',
    camPos: [28, 14, -104],
    camLook: [0, 22, -140],
  },
  {
    id: 'housing',
    name: 'Tensegrity Homes',
    tagline: 'Homes for everyone',
    caption: 'Tensegrity homes: cable-and-strut houses that go up fast and cost little. Nobody sleeps outside here.',
    honesty: 'vision',
    camPos: [-115, 9, 2],
    camLook: [-115, 6, -35],
  },
  {
    id: 'factory',
    name: 'Hephaestus Factory',
    tagline: 'Digital becomes physical',
    caption: 'The Hephaestus factory — where the digital designs become physical things.',
    honesty: 'vision',
    camPos: [115, 11, -14],
    camLook: [115, 7, -55],
  },
  {
    id: 'mordor',
    name: 'MORDOR Smelter',
    tagline: 'Waste into building blocks',
    caption: 'MORDOR smelter: landfill waste in, Karbonite building blocks out. What you see rising is clean vapor, not smoke.',
    honesty: 'vision',
    camPos: [60, 10, 60],
    camLook: [95, 10, 95],
  },
  {
    id: 'island',
    name: 'Floating Island',
    tagline: 'Trash turned paradise',
    caption: 'The floating island — built from Pacific garbage-patch plastic, now a green paradise.',
    honesty: 'vision',
    camPos: [-50, 12, 132],
    camLook: [-50, 9, 175],
  },
  {
    id: 'ocean-dome',
    name: 'Ocean-Dome City',
    tagline: 'Living with the sea',
    caption: 'Ocean-dome city on the horizon — whole communities living with the sea, not against it.',
    honesty: 'vision',
    camPos: [-182, 14, 55],
    camLook: [-235, 10, 55],
  },
  {
    id: 'arctic',
    name: 'Arctic Dome',
    tagline: 'Warmth at the top',
    caption: 'Arctic dome habitat — warm life at the top of the world.',
    honesty: 'vision',
    camPos: [132, 13, -132],
    camLook: [175, 8, -175],
  },
];

export const TOUR = ['plaza', 'aetheris', 'housing', 'factory', 'mordor', 'island', 'ocean-dome', 'arctic'];

/* ============================================================
   Internal constants
   ============================================================ */

const WORLD_R = 250;        // walk/fly XZ clamp radius
const EYE = 2.4;            // walk eye height
const WALK_SPEED = 10;
const FLY_SPEED = 22;
const GLIDE_TIME = 2.5;     // tour glide seconds
const HOLD_TIME = 8;        // tour hold seconds per stop
const GRAV = 18, JUMP_V = 6;

// Push-out circles around major structures (fly-through allowed above h)
const COLLIDERS = [
  { x: 0, z: 0, r: 4, h: 8 },          // plaza fountain
  { x: 0, z: -140, r: 20, h: 46 },     // aetheris towers
  { x: -115, z: -35, r: 42, h: 22 },   // housing district
  { x: 115, z: -55, r: 30, h: 20 },    // factory
  { x: 95, z: 95, r: 26, h: 28 },      // mordor
  { x: -50, z: 175, r: 30, h: 24 },     // floating island
  { x: -235, z: 55, r: 36, h: 48 },    // ocean dome
  { x: 175, z: -175, r: 30, h: 32 },   // arctic dome
];

// Tree/flower exclusion zones (keep structures clear)
const EXCLUDE = [
  [0, 0, 18], [0, -140, 26], [-115, -35, 50], [115, -55, 36],
  [95, 95, 32], [-50, 175, 48], [-235, 55, 82], [175, -175, 68],
];

// Plaque marker positions (all landmarks except plaza)
const PLAQUE_DEFS = [
  { id: 'aetheris', pos: [0, 46, -140] },
  { id: 'housing', pos: [-115, 24, -35] },
  { id: 'factory', pos: [115, 22, -55] },
  { id: 'mordor', pos: [95, 24, 95] },
  { id: 'island', pos: [-50, 24, 175] },
  { id: 'ocean-dome', pos: [-235, 46, 55] },
  { id: 'arctic', pos: [175, 30, -175] },
];

/* ============================================================
   Small pure helpers (no DOM — safe at module top level)
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

// yaw/pitch that looks from pos toward target (Euler YXZ convention)
function yawPitchFrom(pos, target) {
  const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}

// Flat disc geometry with concentric rings (for smooth vertex-color ground)
function makeDisc(radius, rings, segs) {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const uvs = [0.5, 0.5];
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      normals.push(0, 1, 0);
      uvs.push(0.5 + (Math.cos(a) * r) / (radius * 2), 0.5 + (Math.sin(a) * r) / (radius * 2));
    }
  }
  const index = [];
  for (let j = 0; j < segs; j++) index.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      index.push(a0 + j, b0 + j1, b0 + j, a0 + j, a0 + j1, b0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/* ============================================================
   Canvas texture helpers (called inside createWorld — DOM ok)
   ============================================================ */

function softCircleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  blob(40, 40, 26, 0.95); blob(64, 32, 30, 1); blob(90, 42, 24, 0.9);
  blob(58, 46, 22, 0.85); blob(78, 30, 18, 0.8);
  return new THREE.CanvasTexture(c);
}

/* ============================================================
   World builders — each receives a ctx object and registers
   per-frame updaters into ctx.anim
   ============================================================ */

function buildSky(ctx) {
  const { scene, anim } = ctx;
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const top = new THREE.Color(0x2e7cd6), mid = new THREE.Color(0x8ec8ee), hor = new THREE.Color(0xd8f0f7);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 900;
    if (y > 0.25) tmp.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.75));
    else tmp.lerpColors(hor, mid, clamp((y + 0.08) / 0.33, 0, 1));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // The dome material is kept on ctx: the day/night refresh tints
  // it by the day factor (white = the built blue day, dark = night)
  // because the baked vertex colours alone never change.
  const skyDomeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(geo, skyDomeMat));
  ctx.skyDomeMat = skyDomeMat;

  // Sun disc + glow — kept on ctx: the day/night refresh rides
  // them along the real sun vector at their built distance.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  sun.position.set(420, 400, -680); sun.lookAt(0, 0, 0);
  scene.add(sun);
  ctx.sunDisc = sun;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.tex.soft, color: 0xfff2c0, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
  }));
  glow.scale.set(340, 340, 1); glow.position.copy(sun.position);
  scene.add(glow);
  ctx.sunGlow = glow;

  // Drifting clouds (billboard sprites)
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.tex.cloud, transparent: true, opacity: 0.75 + ctx.rng() * 0.2, depthWrite: false,
    }));
    const w = 60 + ctx.rng() * 70;
    s.scale.set(w, w * 0.45, 1);
    s.position.set((ctx.rng() - 0.5) * 900, 95 + ctx.rng() * 55, (ctx.rng() - 0.5) * 900);
    s.userData.v = 1.5 + ctx.rng() * 2.5;
    scene.add(s); clouds.push(s);
  }
  anim.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 480) c.position.x = -480;
    }
  });

  // Circling birds — two-triangle flapping
  const birds = [];
  const wingGeo = new THREE.PlaneGeometry(1.7, 0.7);
  wingGeo.translate(0.85, 0, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x3a3f45, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Group();
    const wr = new THREE.Mesh(wingGeo, wingMat);
    const wl = new THREE.Mesh(wingGeo, wingMat); wl.rotation.y = Math.PI;
    b.add(wr); b.add(wl); scene.add(b);
    birds.push({
      g: b, wr, wl,
      r: 120 + ctx.rng() * 90, h: 55 + ctx.rng() * 30,
      a: ctx.rng() * Math.PI * 2, sp: 0.05 + ctx.rng() * 0.06, ph: ctx.rng() * Math.PI * 2,
    });
  }
  anim.push((t, dt) => {
    for (const b of birds) {
      b.a += b.sp * dt;
      b.g.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(t * 0.7 + b.ph) * 3, Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a;
      const f = Math.sin(t * 10 + b.ph) * 0.55;
      b.wr.rotation.z = f; b.wl.rotation.z = -f;
    }
  });
}

function buildGround(ctx) {
  const { scene } = ctx;
  const geo = makeDisc(260, 24, 96);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const green = new THREE.Color(), sand = new THREE.Color(0xd9c08a), snow = new THREE.Color(0xf4f8fb);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const v = ctx.rng();
    green.setHSL(0.29 + v * 0.035, 0.52, 0.3 + v * 0.09);
    // sand: south beach ring + lagoon shores
    const dDome = Math.hypot(x + 235, z - 55), dIsl = Math.hypot(x + 50, z - 175);
    let s = 0;
    if (z > 168) s = Math.min(1, (z - 168) / 28);
    s = Math.max(s, 1 - clamp((dDome - 62) / 18, 0, 1));
    s = Math.max(s, 1 - clamp((dIsl - 52) / 16, 0, 1));
    // snow: arctic patch
    const dArc = Math.hypot(x - 175, z + 175);
    const sn = 1 - clamp((dArc - 50) / 16, 0, 1);
    tmp.copy(green).lerp(sand, s).lerp(snow, sn * 0.95);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  })));
}

function buildWater(ctx) {
  const { scene, anim } = ctx;
  const mkMat = (op) => new THREE.MeshStandardMaterial({
    color: 0x2f9fd8, transparent: true, opacity: op, roughness: 0.25, metalness: 0.1, depthWrite: false,
  });
  // South ocean — big animated plane, shoreline beyond the ground disc
  const sg = new THREE.PlaneGeometry(760, 280, 48, 18);
  sg.rotateX(-Math.PI / 2);
  const south = new THREE.Mesh(sg, mkMat(0.82));
  south.position.set(0, 0.22, 280);
  scene.add(south);
  const sp = sg.attributes.position;
  const base = Float32Array.from(sp.array);
  const southMat = south.material;
  anim.push((t) => {
    for (let i = 0; i < sp.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      sp.array[i * 3 + 1] = Math.sin(x * 0.06 + t * 1.4) * 0.35 + Math.cos(z * 0.09 + t * 0.9) * 0.3;
    }
    sp.needsUpdate = true;
    southMat.opacity = 0.78 + Math.sin(t * 0.8) * 0.05;
  });
  // Ocean-dome lagoon
  const dg = new THREE.CircleGeometry(75, 48); dg.rotateX(-Math.PI / 2);
  const dome = new THREE.Mesh(dg, mkMat(0.8));
  dome.position.set(-235, 0.26, 55);
  scene.add(dome);
  const domeMat = dome.material;
  anim.push((t) => { domeMat.opacity = 0.76 + Math.sin(t * 0.9 + 2) * 0.05; });
}

// Cheap blob shadow helper (no shadow maps anywhere)
function addBlob(ctx, x, z, r, opacity = 0.25) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24),
    new THREE.MeshBasicMaterial({ color: 0x0a2010, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z);
  ctx.scene.add(m);
  return m;
}

function buildPlaza(ctx) {
  const { scene, anim } = ctx;
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.95 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 0.5, 48), stone);
  disc.position.y = 0.25; scene.add(disc);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.7 });
  for (const r of [6, 10]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 64), gold);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.52; scene.add(ring);
  }
  // Fountain
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1.1, 24), stone);
  base.position.y = 1.05; scene.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 10, 32), stone);
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.65; scene.add(rim);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4fc3e8, transparent: true, opacity: 0.75, roughness: 0.15,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.7, 24), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = 1.5; scene.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 12), stone);
  col.position.y = 2.2; scene.add(col);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.8, 0.5, 16), stone);
  bowl.position.y = 3.5; scene.add(bowl);
  const topWater = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), waterMat);
  topWater.rotation.x = -Math.PI / 2; topWater.position.y = 3.78; scene.add(topWater);
  // Fountain droplets
  const drops = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.tex.soft, color: 0xbfeaff, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    s.userData = { life: ctx.rng(), x: (ctx.rng() - 0.5) * 1.4, z: (ctx.rng() - 0.5) * 1.4 };
    s.scale.set(0.7, 0.7, 1); scene.add(s); drops.push(s);
  }
  anim.push((t, dt) => {
    waterMat.opacity = 0.68 + Math.sin(t * 2.2) * 0.12;
    water.position.y = 1.5 + Math.sin(t * 2.2) * 0.05;
    for (const d of drops) {
      d.userData.life += dt / 1.1;
      if (d.userData.life > 1) d.userData.life = 0;
      const l = d.userData.life;
      d.position.set(d.userData.x, 3.9 + l * 1.8, d.userData.z);
      d.material.opacity = 0.7 * (1 - l);
    }
  });
  // Benches
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    b.position.set(Math.cos(a) * 11, 0.75, Math.sin(a) * 11);
    b.rotation.y = -a + Math.PI / 2; scene.add(b);
  }
  addBlob(ctx, 0, 0, 14, 0.18);
}

// Rising particle column (AETHERIS clean-air visualization)
function makeRiseColumn(ctx, x, z, height, color, size, opacity, count) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = ctx.rng() * Math.PI * 2, r = ctx.rng() * 2.6;
    arr[i * 3] = x + Math.cos(a) * r; arr[i * 3 + 1] = ctx.rng() * height; arr[i * 3 + 2] = z + Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    map: ctx.tex.soft, color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  ctx.scene.add(pts);
  ctx.anim.push((t, dt) => {
    const p = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + dt * 5;
      if (y > height) {
        y = 0;
        const a = ctx.rng() * Math.PI * 2, r = ctx.rng() * 2.6;
        p.setX(i, x + Math.cos(a) * r); p.setZ(i, z + Math.sin(a) * r);
      }
      p.setY(i, y);
    }
    p.needsUpdate = true;
  });
  return pts;
}

// White vapor puffs (chimneys, MORDOR — vapor only, never smoke)
function makePuffs(ctx, ox, oy, oz, n, rise, startS, endS, opacity, dur) {
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.tex.soft, color: 0xffffff, transparent: true, opacity, depthWrite: false,
    }));
    s.userData = { life: ctx.rng(), jx: (ctx.rng() - 0.5) * 3, jz: (ctx.rng() - 0.5) * 3 };
    ctx.scene.add(s); puffs.push(s);
  }
  ctx.anim.push((t, dt) => {
    for (const p of puffs) {
      p.userData.life += dt / dur;
      if (p.userData.life > 1) {
        p.userData.life = 0;
        p.userData.jx = (ctx.rng() - 0.5) * 3; p.userData.jz = (ctx.rng() - 0.5) * 3;
      }
      const l = p.userData.life;
      p.position.set(ox + p.userData.jx * l, oy + l * rise, oz + p.userData.jz * l);
      const sc = startS + (endS - startS) * l;
      p.scale.set(sc, sc, 1);
      p.material.opacity = opacity * (1 - l);
    }
  });
  return puffs;
}

function buildAetheris(ctx) {
  const { scene } = ctx;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.45 });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x0a2a33, emissive: 0x35e0ff, emissiveIntensity: 2.2, roughness: 0.4,
  });
  const towerXs = [-14, 0, 14], cz = -140, H = 34;
  const radiusAt = (y) => 4.6 - (4.6 - 2.2) * (y / H);
  for (const tx of towerXs) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.6, H, 20), white);
    tower.position.set(tx, H / 2, cz); scene.add(tower);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 2, 20), white);
    foot.position.set(tx, 1, cz); scene.add(foot);
    for (const ry of [18, 25, 31]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(ry) + 0.55, 0.35, 10, 32), ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(tx, ry, cz); scene.add(ring);
    }
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), ringMat);
    crown.position.set(tx, H + 0.6, cz); scene.add(crown);
    makeRiseColumn(ctx, tx, cz, 40, 0xbdf3ff, 2.6, 0.32, 60);
  }
  addBlob(ctx, 0, -140, 24, 0.22);
}

function buildHousing(ctx) {
  const { scene } = ctx;
  const HX = -115, HZ = -35;
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd7dce0, roughness: 0.4, metalness: 0.6 });
  const podCols = [0xf5efe4, 0xdfe8d8, 0xe8ddc8, 0xe4eef2];
  const cablePts = [];
  const podGeo = new THREE.CapsuleGeometry(1.7, 2.6, 4, 10);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const hx = HX + Math.cos(a) * 26 + (ctx.rng() - 0.5) * 6;
    const hz = HZ + Math.sin(a) * 26 + (ctx.rng() - 0.5) * 6;
    const rot = ctx.rng() * Math.PI * 2;
    const g = new THREE.Group(); g.position.set(hx, 0, hz); g.rotation.y = rot;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 14, 10), mastMat);
    mast.position.y = 7; g.add(mast);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mastMat);
    hub.position.y = 14; g.add(hub);
    const nPods = 2 + Math.floor(ctx.rng() * 2);
    for (let k = 0; k < nPods; k++) {
      const pa = (k / nPods) * Math.PI * 2 + rot;
      const px = hx + Math.cos(pa) * 5.5, pz = hz + Math.sin(pa) * 5.5;
      const py = 4.2 + (k % 2) * 2.2;
      const pod = new THREE.Mesh(podGeo, new THREE.MeshStandardMaterial({
        color: podCols[Math.floor(ctx.rng() * podCols.length)], roughness: 0.6,
      }));
      pod.rotation.z = Math.PI / 2; pod.rotation.y = -pa;
      pod.position.set(px - hx, py, pz - hz); g.add(pod);
      // cables: mast top -> pod, pod -> ground anchor
      cablePts.push(hx, 13.6, hz, px, py + 1.6, pz);
      cablePts.push(px, py - 1.6, pz, px * 1.0 + (px - hx) * 0.35, 0, pz * 1.0 + (pz - hz) * 0.35);
    }
    // garden patch
    const gx = hx + 8.5, gz = hz + 3.5;
    const garden = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20),
      new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 1 }));
    garden.rotation.x = -Math.PI / 2; garden.position.set(gx - hx, 0.06, gz - hz); g.add(garden);
    ctx.gardens.push([gx, gz]);
    scene.add(g);
    addBlob(ctx, hx, hz, 8, 0.2);
  }
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  scene.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({
    color: 0x8a8f96, transparent: true, opacity: 0.85,
  })));
  // curved path ribbons through the district
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(20 + i * 9, 23 + i * 9, 40, 1, i * 0.7, 2.1), pathMat);
    arc.rotation.x = -Math.PI / 2; arc.position.set(HX, 0.07, HZ);
    scene.add(arc);
  }
  addBlob(ctx, HX, HZ, 44, 0.12);
}

function buildFactory(ctx) {
  const { scene } = ctx;
  const FX = 115, FZ = -55;
  const wall = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.8 });
  const hall1 = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 16), wall);
  hall1.position.set(FX, 5, FZ); scene.add(hall1);
  const hall2 = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 12),
    new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.8 }));
  hall2.position.set(FX - 15, 3.5, FZ - 17); scene.add(hall2);
  // glass fronts
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd8e8, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.3,
  });
  const gf = new THREE.Mesh(new THREE.BoxGeometry(24, 3.4, 0.3), glass);
  gf.position.set(FX, 4.5, FZ + 8.05); scene.add(gf);
  // rooftop solar panels
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x14386e, roughness: 0.35, metalness: 0.6 });
  const panelGeo = new THREE.PlaneGeometry(3.4, 2.2);
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(panelGeo, panelMat);
    p.rotation.x = -Math.PI / 2 + 0.5;
    p.position.set(FX - 9 + (i % 4) * 6, 10.7, FZ - 4 + Math.floor(i / 4) * 5);
    scene.add(p);
  }
  // forge glow window (contained)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 3.6, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 }));
  frame.position.set(FX - 7, 3, FZ + 8.05); scene.add(frame);
  const forge = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xff7b2a, emissiveIntensity: 2.5 }));
  forge.position.set(FX - 7, 3, FZ + 8.2); scene.add(forge);
  ctx.anim.push((t) => { forge.material.emissiveIntensity = 2.2 + Math.sin(t * 3.1) * 0.5; });
  // chimney — WHITE vapor only
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 15, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.7 }));
  chim.position.set(FX + 13, 7.5, FZ - 7); scene.add(chim);
  makePuffs(ctx, FX + 13, 15.5, FZ - 7, 10, 22, 2.5, 7, 0.55, 5);
  addBlob(ctx, FX, FZ, 20, 0.22);
  addBlob(ctx, FX - 15, FZ - 17, 12, 0.2);
}

function buildMordor(ctx) {
  const { scene } = ctx;
  const MX = 95, MZ = 95;
  const basalt = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.85 });
  const main = new THREE.Mesh(new THREE.BoxGeometry(18, 13, 14), basalt);
  main.position.set(MX, 6.5, MZ); main.rotation.y = 0.35; scene.add(main);
  const shard = new THREE.Mesh(new THREE.ConeGeometry(5.5, 20, 5), dark);
  shard.position.set(MX - 9, 10, MZ + 5); shard.rotation.z = 0.15; scene.add(shard);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 16), dark);
  slab.position.set(MX + 10, 3, MZ - 7); slab.rotation.y = -0.3; scene.add(slab);
  // glowing orange intake arch
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0a, emissive: 0xff6a1a, emissiveIntensity: 2.2, roughness: 0.5,
  });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(5, 1.15, 12, 28, Math.PI), archMat);
  arch.position.set(MX, 0.5, MZ + 9.5); scene.add(arch);
  const throat = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x140a04, emissive: 0xff7a1e, emissiveIntensity: 1.6 }));
  throat.position.set(MX, 4.8, MZ + 9.2); scene.add(throat);
  const glow = new THREE.PointLight(0xff7a2a, 80, 70, 2);
  glow.position.set(MX, 6, MZ + 11); scene.add(glow);
  ctx.anim.push((t) => { archMat.emissiveIntensity = 2.0 + Math.sin(t * 2.4) * 0.4; });
  // clean white vapor column
  makePuffs(ctx, MX, 14, MZ, 14, 45, 3, 11, 0.5, 7);
  // neat stacks of glossy dark Karbonite blocks
  const karb = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.15, metalness: 0.7 });
  const blockGeo = new THREE.BoxGeometry(2.4, 1.2, 1.5);
  const piles = [[MX + 17, MZ - 7], [MX + 17, MZ - 2], [MX + 14, MZ + 6]];
  for (const [px, pz] of piles) {
    const layers = [3, 2, 1];
    layers.forEach((nB, li) => {
      for (let b = 0; b < nB; b++) {
        const blk = new THREE.Mesh(blockGeo, karb);
        blk.position.set(px + (b - (nB - 1) / 2) * 2.5, 0.6 + li * 1.25, pz);
        scene.add(blk);
      }
    });
  }
  addBlob(ctx, MX, MZ, 18, 0.28);
}

function buildIsland(ctx) {
  const { scene, anim } = ctx;
  const g = new THREE.Group(); g.position.set(-50, 8, 175); scene.add(g);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(28, 14, 12, 20),
    new THREE.MeshStandardMaterial({ color: 0x6f665c, roughness: 1 }));
  g.add(rock);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(28, 48),
    new THREE.MeshStandardMaterial({ color: 0x58a34f, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = 6.05; g.add(grass);
  // 3 small structures
  const hutMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc9, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.9 });
  const hutAt = (x, z) => {
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 2.8, 4), hutMat);
    hut.position.set(x, 7.4, z); g.add(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 6), roofMat);
    roof.position.set(x, 10, z); g.add(roof);
  };
  hutAt(8, 4); hutAt(-10, -2); hutAt(2, -10);
  // small real trees on the island (Merlin, 2026-11-14): the two
  // smallest of Earth 2's trees, at their real heights, seated on
  // the grass (top y 6.05, base bury 0.1). They ride the island
  // group, so they bob with it.
  const spots = [[-4, 8], [12, -6], [-14, 8], [6, 12], [-2, -14], [14, 10]];
  ctx.treeHandles.push(plantTrees({
    parent: g,
    placements: spots.map(([sx, sz], i) => ({
      x: sx, z: sz, scale: 1, heading: (i * 2.39996) % (Math.PI * 2),
    })),
    speciesForIndex: islandTreeSpeciesForIndex,
    groundY: 6.05,
  }));
  ctx.gardens.push([-42, 179], [-58, 171]);
  // gentle bobbing
  anim.push((t) => {
    g.position.y = 8 + Math.sin(t * 0.5) * 0.9;
    g.rotation.z = Math.sin(t * 0.33) * 0.02;
    g.rotation.x = Math.cos(t * 0.27) * 0.015;
  });
}

function buildOceanDome(ctx) {
  const { scene, anim } = ctx;
  const OX = -235, OZ = 55;
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xbfe6f5, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(OX, 0.3, OZ); scene.add(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(30, 1.4, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.6, metalness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(OX, 0.6, OZ); scene.add(rim);
  // tiny buildings inside
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.7 });
  const litMat = new THREE.MeshStandardMaterial({
    color: 0xf2ead2, emissive: 0xffe6a3, emissiveIntensity: 0.7, roughness: 0.7,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.3, r = 6 + ctx.rng() * 15;
    const w = 2 + ctx.rng() * 2, h = 3 + ctx.rng() * 6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 3 === 0 ? litMat : boxMat);
    b.position.set(OX + Math.cos(a) * r, h / 2 + 0.3, OZ + Math.sin(a) * r);
    b.rotation.y = ctx.rng() * Math.PI; scene.add(b);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 16, 10), boxMat);
  spire.position.set(OX, 8.3, OZ); scene.add(spire);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), litMat);
  beacon.position.set(OX, 17, OZ); scene.add(beacon);
  const glow = new THREE.PointLight(0x9fd8ff, 60, 100, 2);
  glow.position.set(OX, 14, OZ); scene.add(glow);
  anim.push((t) => { domeMat.opacity = 0.2 + Math.sin(t * 1.1) * 0.03; });
}

function buildArctic(ctx) {
  const { scene, anim } = ctx;
  const AX = 175, AZ = -175;
  const snowPatch = new THREE.Mesh(new THREE.CircleGeometry(62, 48),
    new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.9 }));
  snowPatch.rotation.x = -Math.PI / 2; snowPatch.position.set(AX, 0.15, AZ); scene.add(snowPatch);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xf6fafd, roughness: 0.35, emissive: 0xcfe4f8, emissiveIntensity: 0.08,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(24, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(AX, 0.2, AZ); scene.add(dome);
  // entrance with warm door
  const entry = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5),
    new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.7 }));
  entry.position.set(AX, 2, AZ + 23); scene.add(entry);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3),
    new THREE.MeshStandardMaterial({ color: 0x1a0f06, emissive: 0xffb35c, emissiveIntensity: 1.4 }));
  door.position.set(AX, 2, AZ + 25.6); scene.add(door);
  // snow pines
  const pineMat = new THREE.MeshStandardMaterial({ color: 0xdfeee8, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, r = 32 + ctx.rng() * 20;
    const h = 5 + ctx.rng() * 3;
    const pine = new THREE.Mesh(new THREE.ConeGeometry(1.6 + ctx.rng() * 0.8, h, 8), pineMat);
    pine.position.set(AX + Math.cos(a) * r, h / 2, AZ + Math.sin(a) * r);
    scene.add(pine);
  }
  anim.push((t) => { domeMat.emissiveIntensity = 0.08 + Math.sin(t * 1.2) * 0.05; });
  addBlob(ctx, AX, AZ, 26, 0.15);
}

function buildVegetation(ctx) {
  const { scene } = ctx;
  const rng = ctx.rng;
  const clearOf = (x, z) => {
    if (z > 166) return false;
    if (Math.hypot(x, z) > 246) return false;
    for (const [ex, ez, er] of EXCLUDE) if (Math.hypot(x - ex, z - ez) < er) return false;
    return true;
  };
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  // ~300 real trees (Merlin, 2026-11-14): Earth 2's tree models
  // replace the procedural trunk + blob canopy. Placement is
  // untouched — the same seeded stream, the same clearOf, the
  // same per-tree scale — so every tree grows where the old one
  // stood, only the look changes. The colour draws below still
  // run so the rng stream stays identical for everything placed
  // after the trees (flowers, plaques, ...).
  const N = 300;
  const placements = [];
  let placed = 0, guard = 0;
  while (placed < N && guard++ < 6000) {
    const a = rng() * Math.PI * 2, r = 246 * Math.sqrt(rng());
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clearOf(x, z)) continue;
    const s = 0.8 + rng() * 0.7;
    dummy.position.set(x, 1.1 * s, z); dummy.scale.setScalar(s);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0); dummy.updateMatrix();
    col.setHSL(0.07, 0.4, 0.22 + rng() * 0.08);
    dummy.position.set(x, 3.9 * s, z); dummy.scale.set(s, s * 1.15, s);
    dummy.updateMatrix();
    col.setHSL(0.3 + rng() * 0.06, 0.5, 0.28 + rng() * 0.1);
    placements.push({ x, z, scale: s, heading: dummy.rotation.y });
    placed++;
  }
  // Species are picked by placement index, not the scene rng —
  // drawing from the stream would move every tree after this one.
  // The models load async and pop in; a species whose GLB fails
  // grows the old procedural tree instead, never a hole.
  ctx.treeHandles.push(plantTrees({ parent: scene, placements }));

  // ~400 instanced flowers: stems + blossoms
  const F = 400;
  const stemGeo = new THREE.ConeGeometry(0.06, 0.5, 5);
  const blosGeo = new THREE.OctahedronGeometry(0.28);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2f7a34, roughness: 1 });
  const blosMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, F);
  const blos = new THREE.InstancedMesh(blosGeo, blosMat, F);
  const petal = [0xffffff, 0xffd94d, 0xff9ec6, 0xc39bd3, 0xff6b6b, 0xffb347];
  let fp = 0; guard = 0;
  while (fp < F && guard++ < 9000) {
    let x, z;
    if (fp < 150 && ctx.gardens.length) {
      const [gx, gz] = ctx.gardens[Math.floor(rng() * ctx.gardens.length)];
      const a = rng() * Math.PI * 2, r = 1 + rng() * 6;
      x = gx + Math.cos(a) * r; z = gz + Math.sin(a) * r;
    } else {
      const a = rng() * Math.PI * 2, r = 240 * Math.sqrt(rng());
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    if (!clearOf(x, z)) continue;
    const s = 0.7 + rng() * 0.7;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 0.25 * s, z); dummy.scale.setScalar(s); dummy.updateMatrix();
    stems.setMatrixAt(fp, dummy.matrix);
    dummy.position.set(x, 0.55 * s, z); dummy.updateMatrix();
    blos.setMatrixAt(fp, dummy.matrix);
    blos.setColorAt(fp, col.set(petal[Math.floor(rng() * petal.length)]));
    fp++;
  }
  stems.count = fp; blos.count = fp;
  stems.instanceMatrix.needsUpdate = true; blos.instanceMatrix.needsUpdate = true;
  if (blos.instanceColor) blos.instanceColor.needsUpdate = true;
  scene.add(stems); scene.add(blos);

  // butterflies near gardens
  const bCols = [0xffb347, 0xffffff, 0xc39bd3];
  const wingG = new THREE.PlaneGeometry(0.45, 0.32);
  wingG.translate(0.225, 0, 0);
  const flies = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: bCols[i % 3], side: THREE.DoubleSide });
    const wr = new THREE.Mesh(wingG, m);
    const wl = new THREE.Mesh(wingG, m); wl.rotation.y = Math.PI;
    g.add(wr); g.add(wl); scene.add(g);
    const gc = ctx.gardens.length ? ctx.gardens[i % ctx.gardens.length] : [0, 20];
    flies.push({ g, wr, wl, cx: gc[0], cz: gc[1], ph: rng() * Math.PI * 2, sp: 0.4 + rng() * 0.3 });
  }
  ctx.anim.push((t) => {
    for (const f of flies) {
      f.g.position.set(
        f.cx + Math.sin(t * f.sp + f.ph) * 4,
        1.6 + Math.sin(t * 1.3 + f.ph) * 0.5,
        f.cz + Math.cos(t * f.sp * 0.8 + f.ph) * 4
      );
      f.g.rotation.y = Math.atan2(Math.cos(t * f.sp + f.ph), -Math.sin(t * f.sp * 0.8 + f.ph));
      const flap = Math.sin(t * 18 + f.ph) * 0.9;
      f.wr.rotation.y = flap; f.wl.rotation.y = Math.PI - flap;
    }
  });
}

// The claim marker (Merlin, 2026-11-14): a gold 28 m square on
// the ground — the outline of the tile the walker owns, drawn
// where that tile really sits. Hidden until the page hands it a
// tile (world.setClaimMarker), so an unclaimed visit shows none.
function buildClaimMarker(ctx) {
  const { scene } = ctx;
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE_M, TILE_M),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.08;
  group.add(fill);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
  const edgeH = new THREE.BoxGeometry(TILE_M + 0.3, 0.12, 0.3);
  const edgeV = new THREE.BoxGeometry(0.3, 0.12, TILE_M + 0.3);
  const e1 = new THREE.Mesh(edgeH, edgeMat); e1.position.set(0, 0.1, -TILE_M / 2);
  const e2 = new THREE.Mesh(edgeH, edgeMat); e2.position.set(0, 0.1, TILE_M / 2);
  const e3 = new THREE.Mesh(edgeV, edgeMat); e3.position.set(-TILE_M / 2, 0.1, 0);
  const e4 = new THREE.Mesh(edgeV, edgeMat); e4.position.set(TILE_M / 2, 0.1, 0);
  group.add(e1, e2, e3, e4);
  group.visible = false;
  scene.add(group);
  ctx.claimMarker = group;
}

// One procedural dinosaur, built from primitives in unit space
// (about 1 m long, facing +Z) and scaled to the species' real
// length (scaleM from Earth 2's registry). Hide by diet
// (herbivores green, carnivores grey-red, omnivores tan);
// bipeds stand on two big hind legs with tiny arms, quadrupeds
// on four. This is the FALLBACK only — a real GLB that fails
// to load still leaves an animal standing there, never a hole.
function makeProceduralDinoMesh(d) {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({
    color: d.diet === 'herbivore' ? 0x5f8f4a : d.diet === 'carnivore' ? 0x7d5a5a : 0xa08c5a,
    roughness: 1,
  });
  const pale = new THREE.MeshStandardMaterial({ color: 0xd9cdb2, roughness: 1 });
  const biped = d.posture === 'biped';
  const bodyY = biped ? 0.34 : 0.30;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), hide);
  body.scale.set(0.85, 0.8, 1.7);
  body.position.set(0, bodyY, 0);
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), pale);
  belly.scale.set(0.7, 0.55, 1.5);
  belly.position.set(0, bodyY - 0.08, 0.02);
  g.add(belly);
  // neck leans forward-up, head at the end of it
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 0.34, 8), hide);
  neck.position.set(0, bodyY + 0.22, 0.38);
  neck.rotation.x = 0.7;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), hide);
  head.position.set(0, bodyY + 0.36, 0.52);
  g.add(head);
  // tail points back (-Z), slightly down
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 8), hide);
  tail.rotation.x = -Math.PI / 2 - 0.15;
  tail.position.set(0, bodyY - 0.02, -0.55);
  g.add(tail);
  const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.34, 8);
  const legSpots = biped
    ? [[-0.12, 0.17, 0.02], [0.12, 0.17, 0.02]]
    : [[-0.14, 0.15, 0.18], [0.14, 0.15, 0.18], [-0.14, 0.15, -0.18], [0.14, 0.15, -0.18]];
  for (const [lx, ly, lz] of legSpots) {
    const leg = new THREE.Mesh(legGeo, hide);
    leg.position.set(lx, ly, lz);
    g.add(leg);
  }
  if (biped) {
    const armGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, hide);
      arm.position.set(sx * 0.14, bodyY + 0.02, 0.30);
      arm.rotation.x = 0.5;
      g.add(arm);
    }
  }
  g.scale.setScalar(d.scaleM);
  return g;
}

// The local dino spawner (Merlin, 2026-11-14): dinosaurs appear
// around the walker from the seeded law in lib/earth3/spawner.js
// — same spot, same dinosaur, for every visitor. The list
// refreshes every second (Earth 2's cadence); a dino is only
// DESPAWNED past 300 m, so between 150 m and 300 m it lingers
// instead of flickering at the edge of sight. The walk is
// stepped every frame from the pure law; the collider push-out
// is applied to the MESH only (the circuit underneath never
// bends), so a dino slides around a structure and rejoins its
// path cleanly on the other side.
//
// REAL MODELS (Merlin, 2026-11-14): the animals are Earth 2's
// real dino GLBs, loaded through Earth 2's own delivery path —
// signed store URL first, public site file as fallback
// (modelDeliveryUrls), decoded with the meshopt decoder, then
// normalized exactly the way Earth 2 normalizes them (largest
// horizontal extent = scaleM, feet at y=0) and turned so the
// model's head faces the walk (facing measured off the rig).
// One decode per species, cached; herd copies are
// SkeletonUtils clones of the base (a plain .clone() breaks
// skinned rigs). A species whose GLB fails to load falls back
// to the procedural animal, never to nothing. Loads are async,
// so a dino whose base is still in flight waits in
// ctx.pendingDinos and appears when it lands — if the walker
// has already moved past despawn by then, it never appears.
function buildDinos(ctx, S) {
  const { scene, anim } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  ctx.dinoGroup = group;
  ctx.dinos = new Map(); // id -> { data, mesh }
  ctx.dinoBases = new Map(); // slug -> { status, spin, SkeletonUtils } | { status: 'loading', promise } | { status: 'failed' }
  ctx.pendingDinos = new Set(); // ids awaiting their species' base
  const ground = showcaseGround();
  let refreshIn = 0;

  // The owner-signed model URLs, best effort (Earth 2's exact
  // pattern): signed in → signed URLs tried first; signed out
  // or vault unavailable → null, and the public site file
  // carries the load (EARTH2_PUBLIC_FALLBACK).
  const signedUrlsPromise = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) return null;
      return await fetchEarth2ModelUrls({ token });
    } catch {
      return null;
    }
  })();

  // The GLTF loader, decoded with meshopt — loaded lazily, the
  // way Earth 2 loads it inside its scene effect, so the world
  // pays nothing until the first dino is due.
  let loaderPromise = null;
  function dinoLoader() {
    if (!loaderPromise) {
      loaderPromise = (async () => {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
        const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        return { loader, SkeletonUtils };
      })();
    }
    return loaderPromise;
  }

  // Earth 2's normalize, verbatim in law: wrap in a spin group,
  // scale so the largest horizontal extent (scaleBasis 'length')
  // is scaleM, centre on X/Z, feet at y=0.
  function normalizeDinoScene(gltfScene, entry) {
    const spin = new THREE.Group();
    spin.add(gltfScene);
    spin.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(spin);
    const size = box.getSize(new THREE.Vector3());
    const extent = entry.scaleBasis === 'height' ? size.y : Math.max(size.x, size.z);
    const k = extent > 0 ? entry.scaleM / extent : 1;
    gltfScene.scale.multiplyScalar(k);
    spin.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(spin);
    const center = box.getCenter(new THREE.Vector3());
    gltfScene.position.x -= center.x;
    gltfScene.position.z -= center.z;
    gltfScene.position.y -= box.min.y;
    return spin;
  }

  // Earth 2's facing, verbatim in law: the yaw that turns the
  // model's head-forward axis onto +Z, measured off the rig's
  // head and pelvis bones (0 when the rig gives no axis).
  function measureDinoFacing(modelScene) {
    const holder = new THREE.Group();
    holder.add(modelScene);
    holder.updateMatrixWorld(true);
    const bones = new Map();
    modelScene.traverse((o) => {
      if (o.isBone) bones.set(normalizeJointName(o.name), o);
    });
    const roles = resolveBones([...bones.keys()]);
    const headBone = roles.head ? bones.get(normalizeJointName(roles.head)) || null : null;
    const pelvisBone = roles.spine && roles.spine[0] ? bones.get(normalizeJointName(roles.spine[0])) || null : null;
    if (headBone && pelvisBone) {
      const hp = headBone.getWorldPosition(new THREE.Vector3());
      const pp = pelvisBone.getWorldPosition(new THREE.Vector3());
      const fx = hp.x - pp.x, fz = hp.z - pp.z;
      if (Math.hypot(fx, fz) > 1e-4) return -Math.atan2(fx, fz);
    }
    return 0;
  }

  // One decode per species, cached on ctx (the world owns the
  // bases; destroy() disposes them). Resolves to the ready base
  // entry { spin, SkeletonUtils } or null when the GLB cannot
  // be delivered — the caller falls back procedural.
  function loadDinoBase(d) {
    const cached = ctx.dinoBases.get(d.slug);
    if (cached) {
      if (cached.status === 'ready') return Promise.resolve(cached);
      if (cached.status === 'failed') return Promise.resolve(null);
      return cached.promise;
    }
    const promise = (async () => {
      const entry = { slug: d.slug, file: d.file, scaleM: d.scaleM, scaleBasis: d.scaleBasis };
      try {
        const { loader, SkeletonUtils } = await dinoLoader();
        const signedUrls = await signedUrlsPromise;
        const urls = modelDeliveryUrls(entry, signedUrls);
        if (!urls.length) throw new Error(`No delivery URL for ${d.slug}`);
        let lastErr = null;
        let modelScene = null;
        for (const url of urls) {
          try {
            const gltf = await loader.loadAsync(url);
            modelScene = gltf.scene;
            break;
          } catch (err) {
            lastErr = err;
            if (url !== urls[urls.length - 1]) {
              console.warn('[new-earth] dino model URL failed, trying public fallback:', d.slug, url);
            }
          }
        }
        if (!modelScene) throw lastErr || new Error(`No delivery URL for ${d.slug}`);
        const facingYaw = measureDinoFacing(modelScene);
        const spin = normalizeDinoScene(modelScene, entry);
        spin.rotation.y = facingYaw;
        const ready = { status: 'ready', spin, SkeletonUtils };
        ctx.dinoBases.set(d.slug, ready);
        return ready;
      } catch (err) {
        console.warn('[new-earth] dino model failed to load, falling back procedural:', d.slug, err);
        ctx.dinoBases.set(d.slug, { status: 'failed' });
        return null;
      }
    })();
    ctx.dinoBases.set(d.slug, { status: 'loading', promise });
    return promise;
  }

  // A dino in the world: a root group (position + heading) over
  // the animal itself. Real model: a SkeletonUtils clone of the
  // cached base spin (facing already baked in) — the clone
  // shares the base's geometry, so removeDino must never
  // dispose it. Procedural fallback: the primitive animal.
  function spawnDinoMesh(d, baseEntry) {
    let inner;
    if (baseEntry && baseEntry.spin) {
      inner = baseEntry.SkeletonUtils.clone(baseEntry.spin);
    } else {
      inner = makeProceduralDinoMesh(d);
    }
    const root = new THREE.Group();
    root.add(inner);
    root.userData.sharedGeometry = Boolean(baseEntry && baseEntry.spin);
    root.position.set(d.x, d.y, d.z);
    root.rotation.y = d.heading;
    group.add(root);
    ctx.dinos.set(d.id, { data: d, mesh: root });
    ctx.pendingDinos.delete(d.id);
  }

  function removeDino(id) {
    const live = ctx.dinos.get(id);
    if (!live) return;
    group.remove(live.mesh);
    // GLB clones share the cached base's geometry and materials
    // — disposing them would gut the base for every later dino.
    // Only the procedural fallback owns its geometry.
    if (!live.mesh.userData.sharedGeometry) {
      live.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) m.dispose();
      });
    }
    ctx.dinos.delete(id);
  }

  anim.push((t, dt) => {
    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = REFRESH_SECONDS;
      const fresh = dinosNear(S.pos.x, S.pos.z, SPAWN_RADIUS_M, ground);
      for (const d of fresh) {
        if (ctx.dinos.has(d.id) || ctx.pendingDinos.has(d.id)) continue;
        const cached = ctx.dinoBases.get(d.slug);
        if (cached && cached.status === 'ready') {
          spawnDinoMesh(d, cached);
          continue;
        }
        if (cached && cached.status === 'failed') {
          spawnDinoMesh(d, null);
          continue;
        }
        ctx.pendingDinos.add(d.id);
        loadDinoBase(d).then((baseEntry) => {
          if (ctx.destroyed || ctx.dinos.has(d.id) || !ctx.pendingDinos.has(d.id)) return;
          // Still wanted? The walker may have moved on while the
          // GLB was in flight — a dino past despawn never appears.
          if (shouldDespawn(d, S.pos.x, S.pos.z)) {
            ctx.pendingDinos.delete(d.id);
            return;
          }
          spawnDinoMesh(d, baseEntry);
        });
      }
      for (const [id, live] of [...ctx.dinos]) {
        if (shouldDespawn(live.data, S.pos.x, S.pos.z)) removeDino(id);
      }
    }
    for (const live of ctx.dinos.values()) {
      live.data = stepDino(live.data, dt, ground);
      let mx = live.data.x, mz = live.data.z;
      for (const c of COLLIDERS) {
        if (live.data.y > (c.h || 40)) continue;
        const dx = mx - c.x, dz = mz - c.z;
        const dist = Math.hypot(dx, dz);
        if (dist < c.r && dist > 1e-4) {
          const push = (c.r - dist) / dist;
          mx += dx * push; mz += dz * push;
        }
      }
      live.mesh.position.set(mx, live.data.y, mz);
      live.mesh.rotation.y = live.data.heading;
    }
  });
}

function buildPlaques(ctx) {
  const { scene, anim } = ctx;
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd9a441, metalness: 0.9, roughness: 0.25, emissive: 0x6b4a12, emissiveIntensity: 0.5,
  });
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const octGeo = new THREE.OctahedronGeometry(1.5);
  const hitGeo = new THREE.SphereGeometry(5, 8, 6);
  const byId = {};
  for (const l of LANDMARKS) byId[l.id] = l;
  for (const def of PLAQUE_DEFS) {
    const lm = byId[def.id];
    if (!lm) continue;
    const grp = new THREE.Group();
    grp.position.set(def.pos[0], def.pos[1], def.pos[2]);
    const oct = new THREE.Mesh(octGeo, goldMat);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData.landmark = lm;
    grp.add(oct); grp.add(hit);
    scene.add(grp);
    ctx.plaques.push(hit);
    const ph = ctx.rng() * Math.PI * 2, baseY = def.pos[1];
    anim.push((t, dt) => {
      grp.position.y = baseY + Math.sin(t * 1.5 + ph) * 0.8;
      oct.rotation.y += dt * 0.8;
    });
  }
}

/* ============================================================
   createWorld — builds the scene, wires input, returns the API
   ============================================================ */

export function createWorld(canvas, cb) {
  if (!canvas) throw new Error('New Earth: createWorld requires a canvas element.');
  cb = cb || {};
  const fireCaption = (lm) => { if (cb.onCaption) cb.onCaption(lm); };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error('New Earth: WebGL is unavailable in this browser (' +
      (err && err.message ? err.message : String(err)) + '). A WebGL-capable browser is required.');
  }
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost. Kept OUT of
  // the try above on purpose: a guard failure must never masquerade
  // as "WebGL unavailable".
  const contextGuard = guardCanvasContext(canvas, { label: 'NEW EARTH' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // NOTE: no shadow maps anywhere — blob shadows only (cheap).

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0e8);
  scene.fog = new THREE.Fog(0xcfe8f5, 200, 750);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2500);

  // Lights: hemisphere + directional only (+2 small accent point lights in builders)
  // The hemisphere is kept: the day/night refresh drives its
  // intensity from the shared law's palette.
  const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x6fae5f, 0.85);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sunLight.position.set(220, 320, 140);
  scene.add(sunLight);

  // Day/night (Merlin, 2026-11-14): ask once for the walker's
  // place (real location when granted, Sydney when not — the
  // shared law); the ~1 s refresh in tick() does the rest.
  try { requestDayNightPlace(); } catch {}

  const ctx = {
    scene, camera, renderer,
    rng: mulberry32(20261009),
    anim: [],
    plaques: [],
    gardens: [],
    treeHandles: [],
    tex: { soft: softCircleTexture(), cloud: cloudTexture() },
  };

  buildSky(ctx);
  buildGround(ctx);
  buildWater(ctx);
  buildPlaza(ctx);
  buildAetheris(ctx);
  buildHousing(ctx);
  buildFactory(ctx);
  buildMordor(ctx);
  buildIsland(ctx);
  buildOceanDome(ctx);
  buildArctic(ctx);
  buildVegetation(ctx);
  buildPlaques(ctx);
  buildClaimMarker(ctx);

  /* ---------------- state ---------------- */
  const lmById = {};
  for (const l of LANDMARKS) lmById[l.id] = l;
  const plaza = lmById.plaza;
  const S = {
    mode: 'walk',
    pos: new THREE.Vector3(...plaza.camPos),
    yaw: 0, pitch: 0,
    move: { x: 0, y: 0 }, lift: 0,
    jumpY: 0, jumpV: 0, grounded: true,
    tour: { active: false, index: 0, glide: null, holdT: 0 },
    dragId: null, dragging: false, wasDrag: false,
    lastX: 0, lastY: 0, downX: 0, downY: 0, downT: 0,
  };
  const spawnLook = yawPitchFrom(new THREE.Vector3(...plaza.camPos), new THREE.Vector3(...plaza.camLook));
  S.yaw = spawnLook.yaw; S.pitch = spawnLook.pitch;

  // Dinosaurs need the walker state, so their builder runs here
  // (after S exists), not with the builders above.
  buildDinos(ctx, S);

  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  /* ---------------- tour / glide ---------------- */
  function startGlide(toPos, toYaw, toPitch, dur, onArrive) {
    S.tour.glide = {
      t: 0, dur,
      fromPos: S.pos.clone(), toPos: toPos.clone(),
      fromYaw: S.yaw, fromPitch: S.pitch, toYaw, toPitch,
      onArrive,
    };
  }
  function glideToStop(i) {
    const lm = lmById[TOUR[i]];
    if (!lm) return;
    const yp = yawPitchFrom(v3(lm.camPos), v3(lm.camLook));
    startGlide(v3(lm.camPos), yp.yaw, yp.pitch, GLIDE_TIME, () => fireCaption(lm));
  }
  function stopTourSilent() {
    S.tour.active = false; S.tour.glide = null; S.tour.holdT = 0;
  }
  function stopTourPublic() {
    const was = S.tour.active;
    stopTourSilent();
    if (was) fireCaption(null);
  }
  function cancelGlideForInput() {
    if (S.tour.glide) S.tour.glide = null;
    if (S.tour.active) stopTourPublic();
  }
  function updateTour(dt) {
    const T = S.tour;
    if (T.glide) {
      const gl = T.glide;
      gl.t += dt;
      const k = easeInOutCubic(Math.min(1, gl.t / gl.dur));
      S.pos.lerpVectors(gl.fromPos, gl.toPos, k);
      S.yaw = lerpAngle(gl.fromYaw, gl.toYaw, k);
      S.pitch = gl.fromPitch + (gl.toPitch - gl.fromPitch) * k;
      if (gl.t >= gl.dur) {
        S.pos.copy(gl.toPos); S.yaw = gl.toYaw; S.pitch = gl.toPitch;
        T.glide = null;
        if (gl.onArrive) gl.onArrive();
        if (T.active) T.holdT = HOLD_TIME;
      }
    } else if (T.active) {
      T.holdT -= dt;
      if (T.holdT <= 0) {
        T.index = (T.index + 1) % TOUR.length;
        glideToStop(T.index);
      }
    }
  }

  /* ---------------- movement ---------------- */
  const fwdV = new THREE.Vector3(), rightV = new THREE.Vector3(), fwd3V = new THREE.Vector3();
  function updateMovement(dt) {
    if (S.tour.active || S.tour.glide) return;
    const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
    fwdV.set(-sy, 0, -cy);
    rightV.set(cy, 0, sy);
    if (S.mode === 'walk') {
      S.pos.addScaledVector(fwdV, S.move.y * WALK_SPEED * dt);
      S.pos.addScaledVector(rightV, S.move.x * WALK_SPEED * dt);
      if (!S.grounded || S.jumpY > 0) {
        S.jumpV -= GRAV * dt;
        S.jumpY += S.jumpV * dt;
        if (S.jumpY <= 0) { S.jumpY = 0; S.jumpV = 0; S.grounded = true; }
      }
      const targetY = EYE + S.jumpY;
      S.pos.y += (targetY - S.pos.y) * Math.min(1, dt * 8);
    } else {
      const cp = Math.cos(S.pitch);
      fwd3V.set(-sy * cp, Math.sin(S.pitch), -cy * cp);
      S.pos.addScaledVector(fwd3V, S.move.y * FLY_SPEED * dt);
      S.pos.addScaledVector(rightV, S.move.x * FLY_SPEED * dt);
      S.pos.y += S.lift * FLY_SPEED * dt;
      S.pos.y = clamp(S.pos.y, 2, 120);
    }
    // collider push-out (only below the structure's fly-over height)
    for (const c of COLLIDERS) {
      if (S.pos.y > (c.h || 40)) continue;
      const dx = S.pos.x - c.x, dz = S.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r && d > 1e-4) {
        const push = (c.r - d) / d;
        S.pos.x += dx * push; S.pos.z += dz * push;
      }
    }
    const rr = Math.hypot(S.pos.x, S.pos.z);
    if (rr > WORLD_R) { S.pos.x *= WORLD_R / rr; S.pos.z *= WORLD_R / rr; }
  }

  /* ---------------- input: look-drag + plaque tap ---------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function handleTap(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(ctx.plaques, false);
    if (!hits.length) return;
    const lm = hits[0].object.userData.landmark;
    if (!lm) return;
    stopTourSilent();
    fireCaption(lm);
    // ease camera to face the plaque (hold position)
    const target = new THREE.Vector3();
    hits[0].object.getWorldPosition(target);
    const yp = yawPitchFrom(S.pos, target);
    startGlide(S.pos.clone(), yp.yaw, yp.pitch, 0.9, null);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    S.dragId = e.pointerId; S.dragging = true; S.wasDrag = false;
    S.lastX = e.clientX; S.lastY = e.clientY;
    S.downX = e.clientX; S.downY = e.clientY;
    S.downT = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }
  function onPointerMove(e) {
    if (!S.dragging || e.pointerId !== S.dragId) return;
    const dx = e.clientX - S.lastX, dy = e.clientY - S.lastY;
    S.lastX = e.clientX; S.lastY = e.clientY;
    if (!S.wasDrag && Math.hypot(e.clientX - S.downX, e.clientY - S.downY) > 10) {
      S.wasDrag = true;
      cancelGlideForInput(); // any manual look-drag stops the tour
    }
    if (!S.wasDrag) return;
    const s = S.mode === 'fly' ? 0.0042 : 0.0048;
    S.yaw -= dx * s;
    const lim = S.mode === 'fly' ? 1.5 : 1.25;
    S.pitch = clamp(S.pitch - dy * s, -lim, lim);
  }
  function onPointerUp(e) {
    if (e.pointerId !== S.dragId) return;
    S.dragging = false; S.dragId = null;
    const dtms = performance.now() - S.downT;
    const dist = Math.hypot(e.clientX - S.downX, e.clientY - S.downY);
    const wasDrag = S.wasDrag;
    S.wasDrag = false;
    if (!wasDrag && dist < 10 && dtms < 500) handleTap(e.clientX, e.clientY);
  }
  // Hawkins pattern: block page scroll/zoom gestures while touching the canvas
  function onTouchMove(e) { e.preventDefault(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  /* ---------------- main loop ---------------- */
  const clock = new THREE.Clock();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let raf = 0, readyFired = false, destroyed = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // Day/night refresh (Merlin, 2026-11-14): the SAME real-clock
  // cycle Earth 2 runs, throttled to ~1 s — the sun moves slowly.
  // applyDayNightRig drives background / fog / hemisphere / sun
  // from the shared palette; the sun disc rides the real sun
  // vector at its built distance (~894) and sets below the
  // horizon instead of shining through the ground; the baked
  // sky dome is tinted by the day factor so night actually
  // falls while the blue-day look is untouched at noon.
  const SUN_DISC_DIST = Math.hypot(420, 400, 680);
  let lastCycleMs = 0;
  function refreshDayNight(nowMs) {
    if (nowMs - lastCycleMs < 1000) return;
    lastCycleMs = nowMs;
    try {
      const place = getDayNightPlace();
      const dn = dayNightFor(Date.now(), place.lat, place.lon);
      applyDayNightRig(
        { sunLight, hemiLight, fog: scene.fog, background: scene.background },
        dn.palette, dn.sunVec, dn.moon, dn.moonVec,
      );
      const sunUp = dn.sun.elevationDeg > -2;
      if (ctx.sunDisc) {
        ctx.sunDisc.position.set(
          dn.sunVec.x * SUN_DISC_DIST,
          dn.sunVec.y * SUN_DISC_DIST,
          dn.sunVec.z * SUN_DISC_DIST,
        );
        ctx.sunDisc.lookAt(0, 0, 0);
        ctx.sunDisc.visible = sunUp;
      }
      if (ctx.sunGlow && ctx.sunDisc) {
        ctx.sunGlow.position.copy(ctx.sunDisc.position);
        ctx.sunGlow.visible = sunUp;
      }
      if (ctx.skyDomeMat) {
        const dayF = 1 - dn.palette.night;
        ctx.skyDomeMat.color.setRGB(0.08 + 0.92 * dayF, 0.10 + 0.90 * dayF, 0.22 + 0.78 * dayF);
      }
    } catch {}
  }

  function tick() {
    if (destroyed) return;
    raf = requestAnimationFrame(tick);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    refreshDayNight(performance.now());
    updateTour(dt);
    updateMovement(dt);
    for (const u of ctx.anim) u(t, dt);
    camera.position.copy(S.pos);
    camera.quaternion.setFromEuler(euler.set(S.pitch, S.yaw, 0));
    renderer.render(scene, camera);
    if (!readyFired) { readyFired = true; if (cb.onReady) cb.onReady(); }
  }

  resize();
  tick();

  /* ---------------- public API ---------------- */
  function startTourFn() {
    S.tour.active = true; S.tour.index = 0;
    glideToStop(0);
  }

  function destroy() {
    contextGuard.dispose();
    destroyed = true;
    ctx.destroyed = true; // late dino loads never add to a dead scene
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('touchmove', onTouchMove);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); });
      else if (m) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    for (const k of Object.keys(ctx.tex)) ctx.tex[k].dispose();
    ctx.anim.length = 0; ctx.plaques.length = 0; ctx.gardens.length = 0;
    if (ctx.dinos) ctx.dinos.clear();
    // The cached dino bases live off-scene, so the traverse above
    // never reaches them — dispose them here (a repeat dispose of
    // geometry the clones already released is harmless).
    if (ctx.dinoBases) {
      for (const entry of ctx.dinoBases.values()) {
        if (entry && entry.spin) {
          entry.spin.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else if (m) m.dispose();
          });
        }
      }
      ctx.dinoBases.clear();
    }
    if (ctx.pendingDinos) ctx.pendingDinos.clear();
    for (const h of ctx.treeHandles || []) h.cancel();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  return {
    destroy,
    resize,
    getPosition() { return { x: S.pos.x, y: S.pos.y, z: S.pos.z }; },
    getDinoCount() { return ctx.dinos ? ctx.dinos.size : 0; },
    setClaimMarker(tileId) {
      if (!ctx.claimMarker) return;
      const idx = tileIndexFromId(tileId);
      if (idx === null) { ctx.claimMarker.visible = false; return; }
      const c = tileToWorld(idx);
      ctx.claimMarker.position.set(c.x, 0, c.z);
      ctx.claimMarker.visible = true;
    },
    setMode(m) { if (m === 'walk' || m === 'fly') S.mode = m; },
    getMode() { return S.mode; },
    setMove(x, y) {
      S.move.x = clamp(x, -1, 1); S.move.y = clamp(y, -1, 1);
      if (Math.abs(x) > 0.04 || Math.abs(y) > 0.04) cancelGlideForInput();
    },
    setLift(v) {
      S.lift = clamp(v, -1, 1);
      if (Math.abs(v) > 0.04) cancelGlideForInput();
    },
    jump() {
      cancelGlideForInput();
      if (S.mode === 'walk' && S.grounded) { S.grounded = false; S.jumpV = JUMP_V; }
    },
    startTour() { startTourFn(); },
    stopTour() { stopTourPublic(); },
    tourNext() {
      if (!S.tour.active) { startTourFn(); return; }
      S.tour.index = (S.tour.index + 1) % TOUR.length;
      glideToStop(S.tour.index);
    },
    tourPrev() {
      if (!S.tour.active) { startTourFn(); return; }
      S.tour.index = (S.tour.index - 1 + TOUR.length) % TOUR.length;
      glideToStop(S.tour.index);
    },
    gotoLandmark(id) {
      const lm = lmById[id];
      if (!lm) return;
      stopTourSilent();
      const yp = yawPitchFrom(v3(lm.camPos), v3(lm.camLook));
      startGlide(v3(lm.camPos), yp.yaw, yp.pitch, GLIDE_TIME, null);
    },
    tourState() {
      return { active: S.tour.active, index: S.tour.index, total: TOUR.length };
    },
  };
}
