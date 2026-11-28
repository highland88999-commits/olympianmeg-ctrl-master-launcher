// lib/neon-racer/cgi.js — NEON RACER CGI renderer (Merlin, Nov 28, from
// his phone video: "serious upgrade using cgi and redesign it a little bit").
//
// The game was flat 2D canvas line art (neon triangle ship, pink polygon
// rocks, gold diamonds, pink rings, dark gradient). This module is the
// CGI replacement: a real three.js scene — textured CGI ship, displaced
// rocky asteroids with pink glowing cracks, gold crystal shards,
// emissive torus rings, a painted nebula sky, drifting starfield and
// lightspeed streaks.
//
// VISUAL ONLY. The game state (app/neon-racer/game.js) is never written
// here — every mesh is placed from state, every rule (score, shields,
// timers, spawns) lives in game.js untouched. The camera framing
// reproduces the 2D projection exactly: camera CAM_DIST behind the ship
// plane, FOV from the aspect, so the whole flight corridor (x ±10,
// y ±6) stays readable on a phone, exactly as before.
//
// Budgets (tests pin these): 2 real lights, no shadow maps, pooled
// meshes (no per-frame allocation), shared geometries/materials/
// textures, deterministic from seeds. Node-safe: canvasTexture falls
// back to a blank texture without a DOM, so headless tests can build
// the whole world.

import * as THREE from 'three';
import {
  mulberry32,
  wmat,
  canvasTexture,
  glowSprite,
} from '../worlds/environment.js';
import { FAR_Z, WORLD, isLightspeed, isInvulnerable } from '../../app/neon-racer/game.js';

// ---------------------------------------------------------------------------
// Law — palette, framing, budgets. Tests pin these.
// ---------------------------------------------------------------------------
export const NEON_PALETTE = {
  ship: 0x00e5ff,
  shipHull: 0x0d1626,
  shipMetal: 0x8a97a8,
  asteroid: 0xff2d78,
  rock: 0x14101c,
  shard: 0xffd23f,
  ring: 0xff3df0,
  bullet: 0xd8fbff,
  flame: 0xff9f1c,
  bg: 0x04040c,
};

// Camera framing — reproduces the 2D projection (FOCAL 60, unit fits
// ±11.5 world units across the MIN screen dimension). Camera sits
// CAM_DIST behind the ship plane (z = 0); the corridor reads exactly
// as it did in 2D, on any aspect.
export const CAM_DIST = 60;
export const HALF_SPAN = 11.5;
export function neonCameraFov(aspect) {
  const a = Math.max(0.2, Math.min(3, aspect || 1));
  return (2 * Math.atan(HALF_SPAN / CAM_DIST / Math.min(1, a))) * (180 / Math.PI);
}

export const NEON_CGI = {
  maxLights: 2,
  shadows: false,
  asteroidVariants: 8,
  poolCaps: { asteroid: 48, shard: 16, ring: 8, bullet: 32 },
  particleCap: 256,
  starLayers: [
    { count: 90, depth: 0.35, size: 0.5, opacity: 0.45 },
    { count: 60, depth: 0.6, size: 0.8, opacity: 0.7 },
    { count: 34, depth: 1.0, size: 1.2, opacity: 1.0 },
  ],
};

// ---------------------------------------------------------------------------
// Textures — procedural canvas, cached by the kit, deterministic.
// ---------------------------------------------------------------------------
export function nebulaTexture() {
  return canvasTexture('neon-racer-nebula', 1024, 512, (ctx, w, h) => {
    const rng = mulberry32(1337);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0a1c');
    g.addColorStop(0.55, '#050510');
    g.addColorStop(1, '#04040c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Nebula clouds — purple / blue / pink, soft radial blobs.
    const clouds = [
      ['#2a1050', 0.5], ['#0a2a55', 0.45], ['#4a0a3a', 0.4],
      ['#1a1040', 0.5], ['#0a3a4a', 0.35], ['#3a0a50', 0.35],
    ];
    for (let i = 0; i < 26; i++) {
      const [color, alpha] = clouds[i % clouds.length];
      const x = rng() * w;
      const y = rng() * h;
      const r = 60 + rng() * 170;
      const rg = ctx.createRadialGradient(x, y, 4, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // Star specks baked into the sky.
    for (let i = 0; i < 420; i++) {
      ctx.globalAlpha = 0.25 + rng() * 0.65;
      ctx.fillStyle = rng() < 0.8 ? '#cfe8ff' : '#ffd9f5';
      const s = rng() < 0.92 ? 1 : 2;
      ctx.fillRect(rng() * w, rng() * h, s, s);
    }
    ctx.globalAlpha = 1;
  });
}

export function rockTexture() {
  // Dark basalt with faint pink cracks — the same texture serves as map
  // and emissiveMap, so the cracks glow while the rock stays dark
  // (lighting law: the glow IS the light story, localized to cracks).
  return canvasTexture('neon-racer-rock', 256, 256, (ctx, w, h) => {
    const rng = mulberry32(4242);
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = rng();
      ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(90,70,110,0.22)';
      const s = 1 + rng() * 4;
      ctx.fillRect(rng() * w, rng() * h, s, s);
    }
    ctx.strokeStyle = '#ff2d78';
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur = 5;
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.35 + rng() * 0.5;
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      let x = rng() * w;
      let y = rng() * h;
      ctx.moveTo(x, y);
      const segs = 3 + Math.floor(rng() * 3);
      for (let s = 0; s < segs; s++) {
        x += (rng() - 0.5) * 90;
        y += (rng() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  });
}

function glowDotTexture() {
  return canvasTexture('neon-racer-glowdot', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---------------------------------------------------------------------------
// Builders — one mesh/group per game object. Sizes stay true to the
// game state (SHIP_RADIUS 0.9, asteroid r, shard r 0.55, ring r 2.2,
// bullet r 0.22) so the picture never lies about the hitbox.
// ---------------------------------------------------------------------------
export function buildShip() {
  const g = new THREE.Group();
  g.userData.kind = 'solid';
  const hull = wmat(NEON_PALETTE.shipHull, { roughness: 0.35, metalness: 0.75 });
  const metal = wmat(NEON_PALETTE.shipMetal, { roughness: 0.3, metalness: 0.85 });
  const cyan = wmat(0x062a33, {
    roughness: 0.25, metalness: 0.4,
    emissive: NEON_PALETTE.ship, emissiveIntensity: 1.6,
  });
  const trim = wmat(0x0a0a0a, {
    roughness: 0.4, metalness: 0.5,
    emissive: NEON_PALETTE.ship, emissiveIntensity: 0.9,
  });

  // Fuselage: a dart pointing +z (toward the incoming rocks). The chase
  // camera sits behind, so the rear + engines read first.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 8), hull);
  nose.rotation.x = Math.PI / 2; // cone tip -> +z
  nose.position.z = 0.15;
  nose.userData.kind = 'solid';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 8), hull);
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.55;
  body.userData.kind = 'solid';
  // Swept wings.
  const wingGeo = new THREE.BoxGeometry(0.85, 0.05, 0.55);
  const wingL = new THREE.Mesh(wingGeo, metal);
  wingL.position.set(-0.62, -0.05, -0.45);
  wingL.rotation.y = 0.5;
  wingL.rotation.z = 0.12;
  wingL.userData.kind = 'solid';
  const wingR = new THREE.Mesh(wingGeo, metal);
  wingR.position.set(0.62, -0.05, -0.45);
  wingR.rotation.y = -0.5;
  wingR.rotation.z = -0.12;
  wingR.userData.kind = 'solid';
  // Wingtip trim lights.
  const tipGeo = new THREE.BoxGeometry(0.06, 0.06, 0.3);
  const tipL = new THREE.Mesh(tipGeo, trim);
  tipL.position.set(-1.0, -0.02, -0.62);
  const tipR = new THREE.Mesh(tipGeo, trim);
  tipR.position.set(1.0, -0.02, -0.62);
  // Cockpit canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), cyan);
  canopy.scale.set(0.8, 0.55, 1.6);
  canopy.position.set(0, 0.28, 0.15);
  canopy.userData.kind = 'solid';
  // Twin engines + glow.
  const engGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.3, 10);
  const engL = new THREE.Mesh(engGeo, metal);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-0.24, -0.02, -0.85);
  const engR = new THREE.Mesh(engGeo, metal);
  engR.rotation.x = Math.PI / 2;
  engR.position.set(0.24, -0.02, -0.85);
  // Engine flames (cones pointing -z, toward the camera).
  const flameMat = new THREE.MeshBasicMaterial({
    color: NEON_PALETTE.flame, transparent: true, opacity: 0.85,
  });
  const flameGeo = new THREE.ConeGeometry(0.13, 0.7, 8);
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.rotation.x = -Math.PI / 2; // cone tip -> -z
  flameL.position.set(-0.24, -0.02, -1.25);
  const flameR = new THREE.Mesh(flameGeo, flameMat.clone());
  flameR.rotation.x = -Math.PI / 2;
  flameR.position.set(0.24, -0.02, -1.25);
  const glow = glowSprite(NEON_PALETTE.flame, 1.1, 0.75);
  glow.position.set(0, -0.02, -1.1);
  g.add(nose, body, wingL, wingR, tipL, tipR, canopy, engL, engR, flameL, flameR, glow);
  g.userData.ship = { flameL, flameR, flameMat, glow };
  return g;
}

// 8 prebuilt rock variants — displaced icosahedra, seeded, flat-shaded.
// The displacement language matches game.js (radii 0.75–1.25 per vertex).
const _rockVariants = [];
function rockVariant(i) {
  if (_rockVariants[i]) return _rockVariants[i];
  const rng = mulberry32(101 * i + 7);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const seen = new Set();
  for (let v = 0; v < pos.count; v++) {
    const key = `${pos.getX(v).toFixed(3)},${pos.getY(v).toFixed(3)},${pos.getZ(v).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = 0.72 + rng() * 0.55;
    pos.setXYZ(v, pos.getX(v) * f, pos.getY(v) * f, pos.getZ(v) * f);
  }
  geo.computeVertexNormals();
  _rockVariants[i] = geo;
  return geo;
}

export function buildAsteroid(variant = 0) {
  const tex = rockTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff,
    emissiveIntensity: 0.55, roughness: 0.95, metalness: 0.05,
    flatShading: true,
  });
  const m = new THREE.Mesh(
    rockVariant(variant % NEON_CGI.asteroidVariants), mat);
  m.userData.kind = 'solid';
  return m;
}

export function buildShard() {
  const g = new THREE.Group();
  const mat = wmat(NEON_PALETTE.shard, {
    roughness: 0.22, metalness: 0.9,
    emissive: NEON_PALETTE.shard, emissiveIntensity: 0.85,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mat);
  core.userData.kind = 'solid';
  const glow = glowSprite(NEON_PALETTE.shard, 1.6, 0.6);
  g.add(core, glow);
  g.userData.kind = 'solid';
  return g;
}

export function buildRing() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a0518, roughness: 0.35, metalness: 0.4,
    emissive: NEON_PALETTE.ring, emissiveIntensity: 1.7,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 12, 48), mat);
  torus.userData.kind = 'solid';
  // Inner glow ring.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.3, 8, 48),
    new THREE.MeshBasicMaterial({
      color: NEON_PALETTE.ring, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  // 8 inner ticks (the 2D ring's portal ticks, in 3D).
  const tickGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
  const tickMat = new THREE.MeshBasicMaterial({ color: NEON_PALETTE.ring });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
    tick.rotation.z = a;
    g.add(tick);
  }
  g.add(torus, halo);
  g.userData.kind = 'solid';
  return g;
}

export function buildBullet() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: NEON_PALETTE.bullet });
  const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), mat);
  core.rotation.x = Math.PI / 2; // capsule axis -> z (travel direction)
  core.userData.kind = 'solid';
  const glow = glowSprite(NEON_PALETTE.bullet, 0.9, 0.8);
  g.add(core, glow);
  g.userData.kind = 'solid';
  return g;
}

// ---------------------------------------------------------------------------
// The world — owns the whole scene graph for one game. The renderer shell
// (app/neon-racer/render.js) owns the WebGLRenderer + camera and calls
// update() every frame with the live game state.
// ---------------------------------------------------------------------------
export function createNeonWorld() {
  const group = new THREE.Group();
  group.name = 'neon-racer-cgi';

  // Sky: painted nebula sphere (unlit, fog-free) + 2 real lights only.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: nebulaTexture(), side: THREE.BackSide, fog: false }));
  sky.userData.kind = 'fx';
  group.add(sky);
  const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a0a2a, 0.85);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sun.position.set(18, 26, -30);
  group.add(hemi, sun);

  // Starfield — 3 layers, same counts as the 2D renderer.
  const starLayers = [];
  for (const L of NEON_CGI.starLayers) {
    const rng = mulberry32(9000 + L.count);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(L.count * 3);
    for (let i = 0; i < L.count; i++) {
      pos[i * 3] = (rng() * 2 - 1) * WORLD.x * 1.6;
      pos[i * 3 + 1] = (rng() * 2 - 1) * WORLD.y * 1.6;
      pos[i * 3 + 2] = rng() * FAR_Z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xc8ebff, size: L.size, transparent: true, opacity: L.opacity,
      depthWrite: false, map: glowDotTexture(), sizeAttenuation: true,
    }));
    pts.userData.kind = 'fx';
    pts.userData.layer = L;
    group.add(pts);
    starLayers.push({ pts, geo, depth: L.depth, rng });
  }

  // Lightspeed streaks — line segments trailing each star, shown only
  // while warping (and never under reduced motion).
  const streakGeo = new THREE.BufferGeometry();
  const streakPos = new Float32Array(184 * 2 * 3);
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
    color: 0xa0e6ff, transparent: true, opacity: 0.65,
  }));
  streaks.visible = false;
  streaks.userData.kind = 'fx';
  group.add(streaks);

  // Ship.
  const ship = buildShip();
  group.add(ship);

  // Particle Points — one draw call, additive, colours fade to black
  // (= invisible) as particles age. Preallocated, no per-frame alloc.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NEON_CGI.particleCap * 3);
  const pCol = new Float32Array(NEON_CGI.particleCap * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.32, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, map: glowDotTexture(), sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.userData.kind = 'fx';
  particles.frustumCulled = false;
  group.add(particles);

  // Pools — Map<state object, mesh> + freelist, so a filtered-out
  // object releases its mesh and a new object reuses one. No per-frame
  // geometry or material allocation.
  function makePool(cap, factory) {
    return { map: new Map(), free: [], cap, factory };
  }
  const pools = {
    asteroid: makePool(NEON_CGI.poolCaps.asteroid, () => buildAsteroid(0)),
    shard: makePool(NEON_CGI.poolCaps.shard, buildShard),
    ring: makePool(NEON_CGI.poolCaps.ring, buildRing),
    bullet: makePool(NEON_CGI.poolCaps.bullet, buildBullet),
  };
  // Asteroids need per-variant geometry: the pool factory takes the
  // variant from the state object at acquire time.
  let asteroidVariantCursor = 0;

  function acquire(pool, variant) {
    let mesh = pool.free.pop();
    if (!mesh) {
      if (pool.map.size >= pool.cap) return null;
      mesh = variant !== undefined ? buildAsteroid(variant) : pool.factory();
      group.add(mesh);
    }
    mesh.visible = true;
    return mesh;
  }
  function syncPool(pool, items, place, variantOf) {
    const live = new Set(items);
    for (const item of items) {
      let mesh = pool.map.get(item);
      if (!mesh) {
        mesh = acquire(pool, variantOf ? variantOf(item) : undefined);
        if (!mesh) continue; // pool full — drop the visual, never the rule
        pool.map.set(item, mesh);
      }
      place(mesh, item);
    }
    for (const [item, mesh] of pool.map) {
      if (!live.has(item)) {
        pool.map.delete(item);
        mesh.visible = false;
        pool.free.push(mesh);
      }
    }
  }

  const _c = new THREE.Color();

  function update(state, now, dt, opts = {}) {
    const reduced = !!opts.reducedMotion;
    const warp = state.phase === 'playing' && isLightspeed(state);
    const showShip = state.phase === 'playing' || state.phase === 'won' ||
      state.phase === 'ready'; // ready: the ship idles behind the title
    const invuln = state.phase === 'playing' && isInvulnerable(state);

    // --- ship ------------------------------------------------------------
    const parts = ship.userData.ship;
    if (showShip) {
      ship.visible = !(invuln && !warp && Math.floor(now / 110) % 2 === 0);
      const ease = state.phase === 'ready' ? 0.35 : 1;
      ship.position.set(
        state.ship.x * ease,
        state.ship.y * ease + (state.phase === 'ready' ? Math.sin(now / 900) * 0.35 : 0),
        0);
      const dx = state.ship.tx - state.ship.x;
      const dy = state.ship.ty - state.ship.y;
      ship.rotation.z = Math.max(-0.5, Math.min(0.5, dx * 0.06));
      ship.rotation.y = Math.max(-0.3, Math.min(0.3, -dx * 0.03));
      ship.rotation.x = Math.max(-0.25, Math.min(0.25, dy * 0.03));
      // Engine flame: flicker, magenta in warp, steady under reduced motion.
      const flame = reduced ? 0.5 : 0.45 + 0.18 * Math.sin(now / 60);
      const fLen = 0.7 * (0.6 + flame);
      parts.flameL.scale.set(1, 1, fLen / 0.7);
      parts.flameR.scale.set(1, 1, fLen / 0.7);
      const flameColor = warp ? NEON_PALETTE.ring : NEON_PALETTE.flame;
      parts.flameMat.color.setHex(flameColor);
      parts.flameL.material.color.setHex(flameColor);
      parts.flameR.material.color.setHex(flameColor);
      parts.glow.material.color.setHex(flameColor);
      parts.glow.material.opacity = warp ? 0.95 : 0.75;
    } else {
      ship.visible = false;
    }

    // --- objects -----------------------------------------------------------
    syncPool(pools.asteroid, state.asteroids, (m, a) => {
      m.position.set(a.x, a.y, a.z);
      m.scale.setScalar(a.r);
      m.rotation.set(a.rot * 0.4, a.rot * 0.3, a.rot);
    }, () => (asteroidVariantCursor = (asteroidVariantCursor + 1) % NEON_CGI.asteroidVariants));
    syncPool(pools.shard, state.shards, (m, s) => {
      m.position.set(s.x, s.y, s.z);
      m.rotation.set(0.4, s.spin, 0);
    });
    syncPool(pools.ring, state.rings, (m, r) => {
      m.position.set(r.x, r.y, r.z);
      m.rotation.set(0.45, 0, r.spin * 0.15);
    });
    syncPool(pools.bullet, state.bullets, (m, b) => {
      m.position.set(b.x, b.y, b.z);
    });

    // --- particles ---------------------------------------------------------
    const n = Math.min(state.particles.length, NEON_CGI.particleCap);
    for (let i = 0; i < n; i++) {
      const p = state.particles[i];
      const t = Math.max(0, 1 - p.age / p.life);
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
      _c.set(p.color);
      pCol[i * 3] = _c.r * t;
      pCol[i * 3 + 1] = _c.g * t;
      pCol[i * 3 + 2] = _c.b * t;
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    // --- stars ---------------------------------------------------------------
    const speedBase = reduced ? 0 : 1;
    let streakCount = 0;
    for (const L of starLayers) {
      const arr = L.geo.attributes.position.array;
      const mult = (warp ? 6 : 1) * speedBase;
      for (let i = 0; i < L.pts.geometry.attributes.position.count; i++) {
        let z = arr[i * 3 + 2] - dt * (14 + L.depth * 30) * mult - dt * 2;
        if (z < 1) {
          z = FAR_Z;
          arr[i * 3] = (L.rng() * 2 - 1) * WORLD.x * 1.6;
          arr[i * 3 + 1] = (L.rng() * 2 - 1) * WORLD.y * 1.6;
        }
        arr[i * 3 + 2] = z;
        if (warp && !reduced) {
          const x = arr[i * 3];
          const y = arr[i * 3 + 1];
          streakPos[streakCount * 6] = x;
          streakPos[streakCount * 6 + 1] = y;
          streakPos[streakCount * 6 + 2] = z;
          streakPos[streakCount * 6 + 3] = x;
          streakPos[streakCount * 6 + 4] = y;
          streakPos[streakCount * 6 + 5] = z + 14;
          streakCount++;
        }
      }
      L.geo.attributes.position.needsUpdate = true;
    }
    streaks.visible = warp && !reduced && streakCount > 0;
    streakGeo.setDrawRange(0, streakCount * 2);
    streakGeo.attributes.position.needsUpdate = true;
  }

  function counts() {
    let lights = 0;
    let meshes = 0;
    group.traverse((o) => {
      if (o.isLight) lights++;
      if (o.isMesh || o.isPoints || o.isSprite || o.isLineSegments) meshes++;
    });
    return {
      lights,
      meshes,
      poolSizes: {
        asteroid: pools.asteroid.map.size,
        shard: pools.shard.map.size,
        ring: pools.ring.map.size,
        bullet: pools.bullet.map.size,
      },
    };
  }

  function dispose() {
    group.traverse((o) => {
      if (o.geometry && !Object.values(_rockVariants).includes(o.geometry)) {
        o.geometry.dispose?.();
      }
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      }
    });
    _rockVariants.forEach((g) => g.dispose?.());
    _rockVariants.length = 0;
  }

  return { group, update, dispose, counts, ship, streaks };
}
