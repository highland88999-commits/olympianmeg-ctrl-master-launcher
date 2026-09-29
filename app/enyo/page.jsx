'use client';

// ENYO — arena first-person shooter vs AI bots. All procedural, zero assets,
// zero network. Desktop: click to lock the mouse, WASD + mouse, click to
// fire. Mobile: left stick moves, right side drags to look, FIRE button.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  WEAPONS,
  WEAPON_KEYS,
  weaponByKey,
  fireInterval,
  damageAt,
  applySpread,
  mulberry32,
  createBot,
  botThink,
  resolveBotShot,
  damageBot,
  BOT_HP,
  BOT_SKILLS,
  SKILL_KEYS,
  skillByKey,
  hasLineOfSight,
} from '@/lib/enyo-bots';
import { fx, unlockFx, setFxEnabled, isFxEnabled } from '@/lib/fx';

const TITLE = 'ENYO — Arena Shooter';
const EYE = 1.65;
const PLAYER_R = 0.45;
const WALK = 6;
const SPRINT = 9;
const JUMP_V = 7;
const GRAVITY = -20;
const RESPAWN_DELAY = 3;
const TDM_TARGET = 30;
const FFA_TARGET = 20;
const MATCH_SECONDS = 600;

// ---------------------------------------------------------------------------
// Maps — procedural arenas. obstacles: {x,z,w,d,h,c} axis-aligned boxes.
// ---------------------------------------------------------------------------

const MAPS = [
  {
    key: 'plaza',
    name: 'Ruined Plaza',
    desc: 'Sun-bleached stone ruins. Broken walls, tight corners.',
    sky: 0xcfd8e3,
    fog: 0xcfd8e3,
    fogNear: 40,
    fogFar: 140,
    ground: '#9a917f',
    hemiSky: 0xe8f0ff,
    hemiGround: 0x8a7f66,
    sun: 0xfff2d8,
    seed: 1101,
  },
  {
    key: 'depot',
    name: 'Neon Depot',
    desc: 'Night freight yard. Containers and humming neon strips.',
    sky: 0x070a16,
    fog: 0x0a0e1e,
    fogNear: 30,
    fogFar: 120,
    ground: '#232838',
    hemiSky: 0x3a4a7a,
    hemiGround: 0x0c0e16,
    sun: 0x8fb4ff,
    seed: 2202,
    neon: true,
  },
  {
    key: 'hollow',
    name: 'Dust Hollow',
    desc: 'Wind-carved canyon floor. Rocks for cover, dust in the air.',
    sky: 0xe8b07a,
    fog: 0xe0a266,
    fogNear: 35,
    fogFar: 130,
    ground: '#a9743f',
    hemiSky: 0xffd9a8,
    hemiGround: 0x7a4a22,
    sun: 0xffd9a0,
    seed: 3303,
  },
];

function mapByKey(key) {
  return MAPS.find((m) => m.key === key) || MAPS[0];
}

// Deterministic obstacle layout per map. Spawn lanes at z=±45 stay clear.
function buildObstacles(mapKey, seed) {
  const rng = mulberry32(seed);
  const obs = [];
  const add = (x, z, w, d, h, c) => obs.push({ x, z, w, d, h, c });

  if (mapKey === 'plaza') {
    // Broken wall segments ringing a central ruined fountain.
    add(0, 0, 10, 10, 1.2, 'stone'); // fountain base
    add(0, 0, 4, 4, 3.2, 'stoneDark'); // fountain column
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const r = 22 + rng() * 6;
      add(Math.cos(a) * r, Math.sin(a) * r, 6 + rng() * 4, 1.6, 2.4 + rng() * 1.4, 'stone');
    }
    for (let i = 0; i < 10; i++) {
      add((rng() - 0.5) * 80, (rng() - 0.5) * 70, 2.2, 2.2, 2.2, 'crate');
    }
  } else if (mapKey === 'depot') {
    // Shipping containers in rows + neon pylons.
    for (let i = -2; i <= 2; i++) {
      add(i * 14, -12, 10, 3.4, 3.4, 'containerA');
      add(i * 14 + 7, 12, 10, 3.4, 3.4, 'containerB');
    }
    add(-24, 0, 3, 3, 6, 'neonPylon');
    add(24, 0, 3, 3, 6, 'neonPylon');
    add(0, -28, 8, 2.4, 2.4, 'crate');
    add(0, 28, 8, 2.4, 2.4, 'crate');
    for (let i = 0; i < 8; i++) {
      add((rng() - 0.5) * 90, (rng() - 0.5) * 70, 2.4, 2.4, 2.4, 'crate');
    }
  } else {
    // Dust Hollow: rock clusters + canyon wall chunks.
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = 14 + rng() * 30;
      const s = 2.5 + rng() * 4;
      add(Math.cos(a) * r, Math.sin(a) * r, s, s, s * (0.8 + rng() * 0.8), 'rock');
    }
    for (let i = 0; i < 6; i++) {
      add(-48 + i * 19, -40, 8, 3, 7, 'canyon');
      add(-48 + i * 19, 40, 8, 3, 7, 'canyon');
    }
  }
  return obs;
}

function buildSpawns() {
  // Blue (south, z=+), Red (north, z=-). Spread across x.
  const blue = [
    { x: -14, z: 45 },
    { x: 0, z: 47 },
    { x: 14, z: 45 },
  ];
  const red = [
    { x: -14, z: -45 },
    { x: 0, z: -47 },
    { x: 14, z: -45 },
  ];
  return { blue, red };
}

// Circle (x,z,r) vs AABB push-out. Mutates pos. Returns true if pushed.
function collideCircle(pos, r, obstacles) {
  let pushed = false;
  for (const o of obstacles) {
    const hx = o.w / 2;
    const hz = o.d / 2;
    const cx = Math.max(o.x - hx, Math.min(pos.x, o.x + hx));
    const cz = Math.max(o.z - hz, Math.min(pos.z, o.z + hz));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    let d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 1e-6) {
        // Center inside the box: push along the smallest penetration axis.
        const px = hx + r - Math.abs(pos.x - o.x);
        const pz = hz + r - Math.abs(pos.z - o.z);
        if (px < pz) pos.x += pos.x >= o.x ? px : -px;
        else pos.z += pos.z >= o.z ? pz : -pz;
      } else {
        const push = (r - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
      pushed = true;
    }
  }
  // Arena bounds.
  const B = 56;
  pos.x = Math.max(-B, Math.min(B, pos.x));
  pos.z = Math.max(-B, Math.min(B, pos.z));
  return pushed;
}

// ---------------------------------------------------------------------------
// Procedural audio — tiny synth, no assets. Created on first user gesture.
// ---------------------------------------------------------------------------

function createAudio() {
  let ctx = null;
  // Mute is global now (lib/fx "Sound & vibration" setting): the local synth
  // only covers reload clicks; every combat event routes through fx pairs.
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBurst(dur, freq, gain) {
    const ac = ensure();
    if (!ac || !isFxEnabled()) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }
  function blip(freq, dur, gain, slideTo) {
    const ac = ensure();
    if (!ac || !isFxEnabled()) return;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }
  return {
    ensure,
    shot(kind) {
      if (kind === 'marksman') noiseBurst(0.28, 900, 0.5);
      else if (kind === 'smg') noiseBurst(0.09, 2400, 0.32);
      else noiseBurst(0.14, 1600, 0.4);
    },
    hit() {
      blip(880, 0.07, 0.25);
    },
    kill() {
      blip(660, 0.09, 0.3, 990);
    },
    hurt() {
      blip(180, 0.18, 0.35, 90);
    },
    reload() {
      blip(420, 0.06, 0.2);
      setTimeout(() => blip(560, 0.06, 0.2), 140);
    },
    toggleMute() {
      // The mute button now drives the launcher-wide "Sound & vibration"
      // setting (lib/fx); the page reflects it via isFxEnabled().
      setFxEnabled(!isFxEnabled());
      return !isFxEnabled();
    },
  };
}

// Ground texture: tinted noise, generated per map.
function makeGroundTexture(base) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(99);
  for (let i = 0; i < 2600; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

const OBSTACLE_STYLE = {
  stone: { color: 0xb8ad94, rough: 0.95 },
  stoneDark: { color: 0x8a8069, rough: 0.95 },
  crate: { color: 0x9c7a4d, rough: 0.9 },
  containerA: { color: 0x2e6f8e, rough: 0.7, metal: 0.35 },
  containerB: { color: 0x8e3a2e, rough: 0.7, metal: 0.35 },
  neonPylon: { color: 0x11131f, rough: 0.6, emissive: 0x00e5ff, emissiveI: 1.6 },
  rock: { color: 0x9c5f30, rough: 1 },
  canyon: { color: 0x8a4e26, rough: 1 },
};

// ---------------------------------------------------------------------------
// Engine — raw three.js FPS. Created on deploy, destroyed on exit.
// ---------------------------------------------------------------------------

// Closest approach of ray (origin + t*dir) to a vertical segment.
// Returns t along the ray, or Infinity on miss.
function rayHitBot(origin, dir, bx, bz, radius) {
  // Solve in 2D (xz) for the cylinder, then check height.
  const ox = origin.x - bx;
  const oz = origin.z - bz;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) {
    // Looking straight up/down: check horizontal distance.
    const d = Math.hypot(ox, oz);
    if (d > radius) return Infinity;
    const t = (0.95 - origin.y) / dir.y;
    return t > 0 ? t : Infinity;
  }
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return Infinity;
  const y = origin.y + dir.y * t;
  if (y < -0.1 || y > 2.0) return Infinity;
  return t;
}

function makeBotMesh(team) {
  const g = new THREE.Group();
  const trim = team === 'blue' ? 0x3b82f6 : 0xef4444;
  const armor = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.55, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 12), armor);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), armor);
  head.position.y = 1.72;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x050505, emissive: trim, emissiveIntensity: 1.4 })
  );
  visor.position.set(0, 1.74, 0.2);
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.05, 8, 20),
    new THREE.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.9 })
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72;
  const padL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), armor);
  padL.position.set(-0.44, 1.35, 0);
  const padR = padL.clone();
  padR.position.x = 0.44;
  g.add(body, head, visor, belt, padL, padR);

  // Floating health bar (sprite, always faces camera).
  const hc = document.createElement('canvas');
  hc.width = 64;
  hc.height = 10;
  const htex = new THREE.CanvasTexture(hc);
  const hb = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, depthWrite: false, transparent: true }));
  hb.scale.set(1.0, 0.16, 1);
  hb.position.y = 2.2;
  g.add(hb);
  g.userData.health = { canvas: hc, tex: htex };
  paintHealthBar(g, 1);
  return g;
}

function paintHealthBar(mesh, frac) {
  const { canvas, tex } = mesh.userData.health;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 64, 10);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 0, 64, 10);
  g.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
  g.fillRect(2, 2, 60 * Math.max(0, frac), 6);
  tex.needsUpdate = true;
}

// First-person weapon viewmodel — chunky low-poly, per-weapon silhouette.
function makeViewmodel(weaponKey) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.7, roughness: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.13, 0.1);
  grip.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.12), dark);
  sight.position.set(0, 0.1, -0.05);
  const dot = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.015, 0.015),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  dot.position.set(0, 0.1, -0.05);
  g.add(body, grip, sight, dot);

  let muzzleZ = -0.5;
  if (weaponKey === 'rifle') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.42);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), dark);
    mag.position.set(0, -0.14, -0.08);
    mag.rotation.x = 0.25;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.3), accent);
    stripe.position.set(0, 0.02, 0.05);
    g.add(barrel, mag, stripe);
    muzzleZ = -0.62;
  } else if (weaponKey === 'smg') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.35);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.08), dark);
    mag.position.set(0, -0.16, 0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), dark);
    stock.position.set(0, -0.02, 0.36);
    g.add(barrel, mag, stock);
    muzzleZ = -0.47;
  } else {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.7, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.55);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.14, -0.02);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), dark);
    bipod.position.set(0, -0.1, -0.5);
    g.add(barrel, scope, bipod);
    muzzleZ = -0.92;
  }

  // Muzzle flash quad + light (localized glow only).
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(0.4, 'rgba(255,180,80,0.8)');
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, opacity: 0 })
  );
  flash.scale.set(0.45, 0.45, 1);
  flash.position.set(0, 0.02, muzzleZ);
  const flashLight = new THREE.PointLight(0xffc873, 0, 7);
  flashLight.position.set(0, 0.1, muzzleZ);
  g.add(flash, flashLight);

  g.position.set(0.28, -0.26, -0.5);
  g.userData = { flash, flashLight, muzzleZ, flashT: 0 };
  return g;
}

function createEngine(canvas, cfg, cb) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const map = mapByKey(cfg.mapKey);
  const reduced = !!cfg.reduced;
  const isTouch = !!cfg.isTouch;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.sky);
  scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // Light.
  scene.add(new THREE.HemisphereLight(map.hemiSky, map.hemiGround, 0.9));
  const sun = new THREE.DirectionalLight(map.sun, 1.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(map.ground), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Obstacles: logic AABBs + meshes.
  const obstacles = buildObstacles(map.key, map.seed);
  const wallMeshes = [];
  const styleCache = {};
  const matFor = (c) => {
    if (!styleCache[c]) {
      const s = OBSTACLE_STYLE[c] || OBSTACLE_STYLE.crate;
      styleCache[c] = new THREE.MeshStandardMaterial({
        color: s.color,
        roughness: s.rough,
        metalness: s.metal || 0,
        emissive: s.emissive || 0x000000,
        emissiveIntensity: s.emissiveI || 0,
      });
    }
    return styleCache[c];
  };
  for (const o of obstacles) {
    let mesh;
    if (o.c === 'rock') {
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), matFor(o.c));
      mesh.scale.set(o.w, o.h, o.d);
      mesh.rotation.y = rng() * Math.PI;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), matFor(o.c));
    }
    mesh.position.set(o.x, o.h / 2, o.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes.push(mesh);
    // Neon strips on depot pylons / containers (localized glow).
    if (map.neon && (o.c === 'neonPylon' || o.c === 'containerA' || o.c === 'containerB')) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(o.w, 0.3), 0.12, Math.min(o.d, 0.3)),
        new THREE.MeshStandardMaterial({
          color: 0x0a0a0a,
          emissive: o.c === 'containerB' ? 0xff2fb3 : 0x00e5ff,
          emissiveIntensity: 2.2,
        })
      );
      strip.position.set(o.x, o.h + 0.1, o.z);
      scene.add(strip);
    }
  }

  const spawns = buildSpawns();
  const mode = cfg.mode; // 'tdm' | 'ffa'
  const playerTeam = mode === 'tdm' ? 'blue' : 'you';
  const diffKey = cfg.diffKey || 'regular';

  // Patrol waypoints for wandering bots: a ring plus mid-map, filtered so no
  // point sits inside a tall obstacle.
  const waypoints = [];
  {
    const cand = [{ x: 0, z: 0 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cand.push({ x: Math.cos(a) * 30, z: Math.sin(a) * 30 });
    }
    for (const p of cand) {
      let clear = Math.abs(p.x) < 52 && Math.abs(p.z) < 52;
      for (const o of obstacles) {
        if (o.h > 1.4 && Math.abs(p.x - o.x) < o.w / 2 + 1.5 && Math.abs(p.z - o.z) < o.d / 2 + 1.5) {
          clear = false;
          break;
        }
      }
      if (clear) waypoints.push(p);
    }
    if (waypoints.length === 0) waypoints.push({ x: 0, z: 0 });
  }

  // --- player state ---------------------------------------------------------
  const player = {
    pos: new THREE.Vector3(0, EYE, 46),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    yaw: 0, // face north (-z), toward the enemy side
    pitch: 0,
    hp: 100,
    alive: true,
    respawnT: 0,
    protectT: 0,
    kills: 0,
    deaths: 0,
    shots: 0,
    hits: 0,
    weaponKey: 'rifle',
    mag: WEAPONS.rifle.magSize,
    reserve: WEAPONS.rifle.reserveAmmo,
    reloading: false,
    reloadT: 0,
    switchT: 0,
    firing: false,
    triggerHeld: false,
    shake: 0,
    bobT: 0,
  };

  // --- bots -----------------------------------------------------------------
  const bots = [];
  const botMeshes = new Map();
  const mkBot = (id, team, spawn) => {
    const b = createBot(id, team, spawn, diffKey);
    const mesh = makeBotMesh(team);
    mesh.position.set(spawn.x, 0, spawn.z);
    scene.add(mesh);
    bots.push(b);
    botMeshes.set(id, mesh);
  };
  if (mode === 'tdm') {
    mkBot(0, 'blue', spawns.blue[1]);
    mkBot(1, 'blue', spawns.blue[2]);
    mkBot(2, 'red', spawns.red[0]);
    mkBot(3, 'red', spawns.red[1]);
    mkBot(4, 'red', spawns.red[2]);
  } else {
    const all = [...spawns.blue, ...spawns.red];
    for (let i = 0; i < 5; i++) mkBot(i, 'red', all[i % all.length]);
  }

  // --- scores / timer ---------------------------------------------------------
  let blueScore = 0;
  let redScore = 0;
  let timeLeft = MATCH_SECONDS;
  let over = false;
  let result = null;

  // --- viewmodel --------------------------------------------------------------
  let vm = makeViewmodel(player.weaponKey);
  camera.add(vm);

  // --- tracers / impacts ------------------------------------------------------
  const fx = [];
  function addTracer(from, to, color = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    scene.add(line);
    fx.push({ obj: line, t: 0, life: 0.09, kind: 'fade' });
  }
  function addImpact(p, color = 0xffcc88) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    s.position.copy(p);
    scene.add(s);
    fx.push({ obj: s, t: 0, life: 0.25, kind: 'pop' });
  }

  const audio = createAudio();
  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();

  // --- input ------------------------------------------------------------------
  const keys = new Set();
  let pointerLocked = false;
  let paused = false;

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === 'r') startReload();
    if (k === '1') switchWeapon('rifle');
    if (k === '2') switchWeapon('smg');
    if (k === '3') switchWeapon('marksman');
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    if (!pointerLocked || paused || over) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!pointerLocked && !isTouch) {
      canvas.requestPointerLock?.();
      return;
    }
    if (paused || over) return;
    const w = weaponByKey(player.weaponKey);
    if (w.auto) {
      player.firing = true;
    } else {
      tryFire(); // semi: one shot per click
    }
    player.triggerHeld = true;
  }
  function onMouseUp(e) {
    if (e.button !== 0) return;
    player.firing = false;
    player.triggerHeld = false;
  }
  function onLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    if (!pointerLocked && !isTouch && !over && started) {
      paused = true;
      cb.paused(true);
    } else if (pointerLocked) {
      paused = false;
      cb.paused(false);
    }
  }

  // Touch controls.
  const touches = new Map(); // id -> {role, ox, oy, x, y}
  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  function touchPos(t) {
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top, w: r.width, h: r.height };
  }
  function onTouchStart(e) {
    if (paused || over) return;
    for (const t of e.changedTouches) {
      const p = touchPos(t);
      if (p.x < p.w * 0.45 && p.y > p.h * 0.45 && !joy.active) {
        joy.active = true;
        joy.id = t.identifier;
        joy.ox = p.x;
        joy.oy = p.y;
        joy.dx = 0;
        joy.dy = 0;
        touches.set(t.identifier, { role: 'joy' });
      } else if (![...touches.values()].some((v) => v.role === 'look')) {
        touches.set(t.identifier, { role: 'look', x: p.x, y: p.y });
      }
    }
    if (e.cancelable) e.preventDefault();
    cb.touchUI(true);
  }
  function onTouchMove(e) {
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (!info) continue;
      const p = touchPos(t);
      if (info.role === 'joy') {
        let dx = p.x - joy.ox;
        let dy = p.y - joy.oy;
        const d = Math.hypot(dx, dy);
        const max = 60;
        if (d > max) {
          dx = (dx / d) * max;
          dy = (dy / d) * max;
        }
        joy.dx = dx / max;
        joy.dy = dy / max;
      } else if (info.role === 'look') {
        player.yaw -= (p.x - info.x) * 0.0048;
        player.pitch -= (p.y - info.y) * 0.0048;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
        info.x = p.x;
        info.y = p.y;
      }
    }
    if (e.cancelable) e.preventDefault();
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (info && info.role === 'joy') {
        joy.active = false;
        joy.id = null;
        joy.dx = 0;
        joy.dy = 0;
      }
      touches.delete(t.identifier);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  // --- weapons ----------------------------------------------------------------
  function switchWeapon(key) {
    if (!WEAPON_KEYS.includes(key) || key === player.weaponKey || player.reloading) return;
    player.weaponKey = key;
    const w = weaponByKey(key);
    player.mag = w.magSize;
    player.reserve = w.reserveAmmo;
    player.switchT = 0.35;
    player.firing = false;
    camera.remove(vm);
    vm = makeViewmodel(key);
    camera.add(vm);
    cb.hud(snapshotHud());
  }
  function startReload() {
    const w = weaponByKey(player.weaponKey);
    if (player.reloading || player.mag >= w.magSize || player.reserve <= 0 || !player.alive) return;
    player.reloading = true;
    player.reloadT = w.reloadTime;
    player.firing = false;
    audio.reload();
  }
  function finishReload() {
    const w = weaponByKey(player.weaponKey);
    const need = w.magSize - player.mag;
    const take = Math.min(need, player.reserve);
    player.mag += take;
    player.reserve -= take;
    player.reloading = false;
    cb.hud(snapshotHud());
  }

  function muzzleWorld() {
    const v = new THREE.Vector3(0, 0.02, vm.userData.muzzleZ);
    return vm.localToWorld(v);
  }

  function tryFire() {
    if (!player.alive || over || paused) return;
    const w = weaponByKey(player.weaponKey);
    if (player.reloading || player.switchT > 0) return;
    if (player.mag <= 0) {
      audio.ensure();
      startReload();
      return;
    }
    player.mag -= 1;
    player.shots += 1;
    audio.ensure();
    fx.shoot(player.weaponKey); // central FX: light zap + tick, throttled for automatics

    const moving =
      keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') || joy.active;
    const spread = w.spreadDeg + (moving ? w.moveSpreadDeg : 0);
    camera.getWorldDirection(tmpDir);
    const dir = applySpread({ x: tmpDir.x, y: tmpDir.y, z: tmpDir.z }, spread, rng);
    const origin = camera.position.clone();

    // Walls first.
    raycaster.set(origin, new THREE.Vector3(dir.x, dir.y, dir.z));
    raycaster.far = 200;
    const wallHits = raycaster.intersectObjects(wallMeshes, false);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
    const wallPoint = wallHits.length ? wallHits[0].point : null;

    // Bots.
    let bestT = wallDist;
    let bestBot = null;
    for (const b of bots) {
      if (!b.alive) continue;
      const t = rayHitBot(origin, dir, b.pos.x, b.pos.z, 0.55);
      if (t < bestT) {
        bestT = t;
        bestBot = b;
      }
    }

    const from = muzzleWorld();
    if (bestBot) {
      const dmg = damageAt(w, bestT);
      player.hits += 1;
      const killed = damageBot(bestBot, dmg);
      paintHealthBar(botMeshes.get(bestBot.id), bestBot.hp / BOT_HP);
      const to = new THREE.Vector3(
        bestBot.pos.x, 1.1, bestBot.pos.z
      );
      addTracer(from, to);
      addImpact(to, 0xff8888);
      cb.hitmarker(killed);
      if (killed) {
        player.kills += 1;
        if (mode === 'tdm') {
          if (bestBot.team === 'red') blueScore += 1;
          else redScore += 1;
        }
        audio.kill();
        cb.feed(`You eliminated ${bestBot.name}`);
        const mesh = botMeshes.get(bestBot.id);
        if (mesh) mesh.visible = false;
      } else {
        audio.hit();
      }
    } else {
      const to = wallPoint || origin.clone().add(new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(120));
      addTracer(from, to);
      if (wallPoint) addImpact(wallPoint);
    }

    // Recoil + shake (shake off under reduced motion).
    player.pitch = Math.min(1.45, player.pitch + w.recoilKick);
    player.yaw += (rng() - 0.5) * w.recoilKick * 0.6;
    if (!reduced) player.shake = Math.min(1, player.shake + 0.25);
    vm.userData.flashT = 0.06;
    vm.userData.flash.material.opacity = 1;
    vm.userData.flashLight.intensity = 9;
    vm.position.z = -0.44; // kick back

    cb.hud(snapshotHud());
    checkWin();
  }

  // --- bot combat ---------------------------------------------------------------
  function botFireAt(bot, target, dist) {
    const w = weaponByKey(bot.weaponKey);
    // True line of sight: tall obstacles block the shot entirely.
    if (!hasLineOfSight({ x: bot.pos.x, z: bot.pos.z }, { x: target.pos.x, z: target.pos.z }, obstacles)) return;
    const res = resolveBotShot(dist, w, rng, bot.skillKey);
    if (!res.hit) {
      // Tracer whizzing past — feedback without damage.
      const from = new THREE.Vector3(bot.pos.x, 1.4, bot.pos.z);
      const to = new THREE.Vector3(target.pos.x, 1.2 + (rng() - 0.5), target.pos.z);
      addTracer(from, to, 0xff6666);
      return;
    }
    if (target.id === 'player') {
      if (!player.alive || player.protectT > 0) return;
      player.hp -= res.damage;
      fx.hit(); // central FX: dull thud + medium buzz for damage taken
      if (!reduced) player.shake = Math.min(1, player.shake + 0.5);
      const ang = Math.atan2(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
      cb.damageDir(ang - player.yaw);
      if (player.hp <= 0) {
        player.hp = 0;
        player.alive = false;
        fx.death(); // central FX: descending tone + long rumble
        player.deaths += 1;
        player.respawnT = RESPAWN_DELAY;
        if (mode === 'tdm') redScore += 1;
        bot.kills += 1;
        cb.feed(`${bot.name} eliminated you`);
        checkWin();
      }
      cb.hud(snapshotHud());
    } else {
      const tb = bots.find((b) => b.id === target.id);
      if (!tb || !tb.alive) return;
      const killed = damageBot(tb, res.damage);
      paintHealthBar(botMeshes.get(tb.id), tb.hp / BOT_HP);
      const from = new THREE.Vector3(bot.pos.x, 1.4, bot.pos.z);
      const to = new THREE.Vector3(tb.pos.x, 1.1, tb.pos.z);
      addTracer(from, to, 0xffaa66);
      if (killed) {
        bot.kills += 1;
        if (mode === 'tdm') {
          if (tb.team === 'red') blueScore += 1;
          else redScore += 1;
        }
        cb.feed(`${bot.name} eliminated ${tb.name}`);
        const mesh = botMeshes.get(tb.id);
        if (mesh) mesh.visible = false;
        checkWin();
      }
    }
  }

  function respawnBot(b) {
    const pool = b.team === 'blue' ? spawns.blue : spawns.red;
    const s = pool[b.id % pool.length];
    b.pos.x = s.x + (rng() - 0.5) * 4;
    b.pos.z = s.z + (rng() - 0.5) * 4;
    b.hp = BOT_HP;
    const mesh = botMeshes.get(b.id);
    mesh.position.set(b.pos.x, 0, b.pos.z);
    mesh.visible = true;
    paintHealthBar(mesh, 1);
  }

  function respawnPlayer() {
    const pool = mode === 'tdm' ? spawns.blue : [...spawns.blue, ...spawns.red];
    const s = pool[(rng() * pool.length) | 0];
    player.pos.set(s.x, EYE, s.z);
    player.vel.set(0, 0, 0);
    player.vy = 0;
    player.hp = 100;
    player.alive = true;
    player.protectT = 2;
    const w = weaponByKey(player.weaponKey);
    player.mag = w.magSize;
    player.reserve = w.reserveAmmo;
    player.reloading = false;
    cb.hud(snapshotHud());
  }

  // --- win / lose ---------------------------------------------------------------
  function checkWin() {
    if (over) return;
    const target = mode === 'tdm' ? TDM_TARGET : FFA_TARGET;
    if (mode === 'tdm') {
      if (blueScore >= target) return endGame(true, `Victory — first to ${target}`);
      if (redScore >= target) return endGame(false, `Defeat — enemy reached ${target}`);
    } else {
      if (player.kills >= target) return endGame(true, `Victory — first to ${target} kills`);
      const leader = bots.reduce((a, b) => (b.kills > a.kills ? b : a), bots[0]);
      if (leader.kills >= target) return endGame(false, `${leader.name} reached ${target} kills`);
    }
  }

  function endGame(won, reason) {
    over = true;
    result = { won, reason };
    if (won) fx.gameWin(); // central FX: full match-win fanfare
    else fx.menuClose(); // defeat: a soft settle, no buzz-shame
    document.exitPointerLock?.();
    const acc = player.shots ? Math.round((player.hits / player.shots) * 100) : 0;
    cb.gameOver({
      won,
      reason,
      kills: player.kills,
      deaths: player.deaths,
      accuracy: acc,
      blueScore,
      redScore,
      mode,
    });
  }

  // --- HUD snapshot ---------------------------------------------------------------
  function snapshotHud() {
    const w = weaponByKey(player.weaponKey);
    return {
      hp: Math.ceil(player.hp),
      alive: player.alive,
      respawnIn: Math.ceil(player.respawnT),
      mag: player.mag,
      reserve: player.reserve,
      reloading: player.reloading,
      weaponKey: player.weaponKey,
      weaponName: w.name,
      blueScore,
      redScore,
      kills: player.kills,
      deaths: player.deaths,
      timeLeft: Math.ceil(timeLeft),
      mode,
      target: mode === 'tdm' ? TDM_TARGET : FFA_TARGET,
    };
  }

  // --- main loop --------------------------------------------------------------------
  let raf = 0;
  let lastT = 0;
  let hudT = 0;
  let started = false;
  const clock = { t: 0 };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const combatantCache = [];
  function loop(t) {
    if (!started) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (paused || over) return;
    clock.t += dt;

    // Timer.
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      if (mode === 'tdm') endGame(blueScore >= redScore, 'Time up');
      else {
        const leader = bots.reduce((a, b) => (b.kills > a.kills ? b : a), bots[0]);
        endGame(player.kills >= leader.kills, 'Time up');
      }
      return;
    }

    // --- player movement ------------------------------------------------------
    if (player.alive) {
      if (player.protectT > 0) player.protectT -= dt;
      let ix = 0;
      let iz = 0;
      if (keys.has('w') || keys.has('arrowup')) iz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) iz += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (joy.active) {
        ix += joy.dx;
        iz += joy.dy;
      }
      const sprinting = (keys.has('shift') || (joy.active && Math.hypot(joy.dx, joy.dy) > 0.92)) && iz < 0;
      const speed = sprinting ? SPRINT : WALK;
      // Camera-relative movement: forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw).
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const rx = Math.cos(player.yaw);
      const rz = -Math.sin(player.yaw);
      player.vel.x = (fx * -iz + rx * ix) * speed;
      player.vel.z = (fz * -iz + rz * ix) * speed;

      if ((keys.has(' ') || touchJump) && player.grounded) {
        player.vy = JUMP_V;
        player.grounded = false;
      }
      player.vy += GRAVITY * dt;
      let ny = player.pos.y + player.vy * dt;
      if (ny <= EYE) {
        ny = EYE;
        player.vy = 0;
        player.grounded = true;
      }
      player.pos.x += player.vel.x * dt;
      player.pos.z += player.vel.z * dt;
      player.pos.y = ny;
      collideCircle(player.pos, PLAYER_R, obstacles);

      // Head bob (skip under reduced motion).
      const movingAmt = Math.hypot(player.vel.x, player.vel.z);
      if (!reduced && movingAmt > 1 && player.grounded) player.bobT += dt * movingAmt * 1.4;

      // Firing (auto).
      const w = weaponByKey(player.weaponKey);
      if (player.switchT > 0) player.switchT -= dt;
      if (player.reloading) {
        player.reloadT -= dt;
        if (player.reloadT <= 0) finishReload();
      } else if (player.firing && w.auto && player.switchT <= 0) {
        player.fireT = (player.fireT || 0) - dt;
        if (player.fireT <= 0) {
          player.fireT = fireInterval(w);
          tryFire();
        }
      }

      // Camera.
      const bobY = !reduced ? Math.sin(player.bobT) * 0.035 : 0;
      const bobX = !reduced ? Math.cos(player.bobT * 0.5) * 0.02 : 0;
      player.shake = Math.max(0, player.shake - dt * 4);
      const shX = reduced ? 0 : (rng() - 0.5) * 0.05 * player.shake;
      const shY = reduced ? 0 : (rng() - 0.5) * 0.05 * player.shake;
      camera.position.set(
        player.pos.x + bobX + shX,
        player.pos.y + bobY + shY,
        player.pos.z
      );
      camera.rotation.set(player.pitch, player.yaw, 0);

      // Viewmodel sway + reload dip + muzzle flash decay.
      vm.position.z += (-0.5 - vm.position.z) * Math.min(1, dt * 10);
      if (player.reloading) {
        vm.rotation.x = -0.5 * Math.sin((1 - player.reloadT / w.reloadTime) * Math.PI);
      } else {
        vm.rotation.x *= 0.9;
      }
      if (vm.userData.flashT > 0) {
        vm.userData.flashT -= dt;
        if (vm.userData.flashT <= 0) {
          vm.userData.flash.material.opacity = 0;
          vm.userData.flashLight.intensity = 0;
        }
      }
    } else {
      // Dead: countdown to respawn.
      player.respawnT -= dt;
      if (player.respawnT <= 0) respawnPlayer();
    }

    // --- bots -----------------------------------------------------------------
    combatantCache.length = 0;
    combatantCache.push({
      id: 'player', team: playerTeam, pos: { x: player.pos.x, z: player.pos.z }, dead: !player.alive,
    });
    for (const b of bots) {
      combatantCache.push({ id: b.id, team: b.team, pos: { x: b.pos.x, z: b.pos.z }, dead: !b.alive });
    }
    for (const b of bots) {
      const mesh = botMeshes.get(b.id);
      if (!b.alive) {
        if (b.respawnT > 0) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            b.alive = true;
            respawnBot(b);
          }
        }
        continue;
      }
      const intents = botThink(b, combatantCache, dt, rng, { obstacles, waypoints });
      let mvx = 0;
      let mvz = 0;
      for (const it of intents) {
        if (it.type === 'move') {
          mvx = it.dx;
          mvz = it.dz;
        } else if (it.type === 'face') {
          b.yaw = it.yaw;
        } else if (it.type === 'fire') {
          const target = combatantCache.find((c) => c.id === it.targetId);
          if (target && !target.dead) botFireAt(b, target, it.dist);
        }
      }
      b.pos.x += mvx * dt;
      b.pos.z += mvz * dt;
      collideCircle(b.pos, 0.5, obstacles);
      mesh.position.set(b.pos.x, 0, b.pos.z);
      mesh.rotation.y = b.yaw;
      // Simple walk bob.
      mesh.position.y = Math.abs(Math.sin(clock.t * 9)) * 0.05;
    }

    // --- fx ---------------------------------------------------------------------
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        scene.remove(f.obj);
        f.obj.geometry?.dispose();
        f.obj.material?.dispose();
        fx.splice(i, 1);
        continue;
      }
      if (f.kind === 'fade') f.obj.material.opacity = 0.9 * (1 - k);
      else {
        f.obj.scale.setScalar(1 + k * 3);
        f.obj.material.opacity = 1 - k;
      }
    }

    // --- HUD sync ---------------------------------------------------------------
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      cb.hud(snapshotHud());
    }

    renderer.render(scene, camera);
  }

  let touchJump = false;

  const api = {
    start() {
      started = true;
      paused = false;
      lastT = performance.now();
      cb.hud(snapshotHud());
      if (!isTouch) {
        try {
          canvas.requestPointerLock?.();
        } catch {
          /* drag-look fallback */
        }
      }
      raf = requestAnimationFrame(loop);
    },
    resume() {
      // Re-lock the pointer after Esc (desktop).
      paused = false;
      cb.paused(false);
      lastT = performance.now();
      try {
        canvas.requestPointerLock?.();
      } catch {
        /* ignored */
      }
    },
    setFiring(v) {
      player.firing = v;
      if (v) {
        const w = weaponByKey(player.weaponKey);
        if (!w.auto) tryFire();
        else player.fireT = 0;
      }
    },
    jump() {
      touchJump = true;
      setTimeout(() => {
        touchJump = false;
      }, 120);
    },
    reload() {
      startReload();
    },
    cycleWeapon() {
      const i = WEAPON_KEYS.indexOf(player.weaponKey);
      switchWeapon(WEAPON_KEYS[(i + 1) % WEAPON_KEYS.length]);
    },
    switchWeapon,
    toggleMute() {
      return audio.toggleMute();
    },
    resize,
    destroy() {
      started = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', resize);
      document.exitPointerLock?.();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      renderer.dispose();
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Page shell: menu, HUD, overlays, mobile controls.
// ---------------------------------------------------------------------------

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function StatBar({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] uppercase tracking-widest text-neutral-400">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded overflow-hidden">
        <div className="h-full bg-amber-400 rounded" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function WeaponCard({ w, selected, onPick }) {
  return (
    <button
      onClick={onPick}
      className={`text-left p-3 rounded-lg border transition-colors w-full ${
        selected ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="text-sm font-bold text-neutral-100">{w.name}</div>
      <div className="text-[11px] text-neutral-400 mt-0.5 mb-2">{w.desc}</div>
      <div className="space-y-1">
        <StatBar label="Damage" value={w.damage / 90} />
        <StatBar label="Fire rate" value={w.rpm / 900} />
        <StatBar label="Range" value={w.falloffFar / 120} />
        <StatBar label="Magazine" value={w.magSize / 40} />
      </div>
      <div className="text-[10px] text-neutral-500 mt-2 tracking-wider">
        {w.magSize} PER MAG · {w.auto ? 'FULL AUTO' : 'SEMI AUTO'} · PRESS {w.key === 'rifle' ? '1' : w.key === 'smg' ? '2' : '3'}
      </div>
    </button>
  );
}

export default function EnyoPage() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const feedId = useRef(0);

  const [phase, setPhase] = useState('menu');
  const [mapKey, setMapKey] = useState('plaza');
  const [mode, setMode] = useState('tdm');
  const [diffKey, setDiffKey] = useState('regular');
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [hitmark, setHitmark] = useState(null);
  const [dmgDir, setDmgDir] = useState(null);
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState(null);
  const [reduced, setReduced] = useState(false);
  const [joy, setJoy] = useState({ active: false, dx: 0, dy: 0 });

  useEffect(() => {
    document.title = TITLE;
    try {
      setReduced(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
      setMuted(!isFxEnabled()); // mute button reflects the global FX setting
    } catch {
      /* defaults */
    }
    // FX system: unlock sound+haptics on the first gesture (deep links may
    // land here without passing through the hub).
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const destroyEngine = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
  }, []);

  const deploy = useCallback(() => {
    fx.tap(); // menu confirm: deploying into the arena
    destroyEngine();
    setFeed([]);
    setResult(null);
    setHitmark(null);
    setDmgDir(null);
    setPaused(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouch(touch);
    let joyT = 0;
    const engine = createEngine(
      canvas,
      { mapKey, mode, diffKey, reduced, isTouch: touch },
      {
        hud: (h) => setHud(h),
        feed: (msg) => {
          feedId.current += 1;
          const id = feedId.current;
          setFeed((f) => [...f.slice(-4), { id, msg }]);
        },
        hitmarker: (killed) => {
          setHitmark({ n: Date.now(), killed });
        },
        damageDir: (rel) => {
          const id = Date.now();
          setDmgDir({ rel, id });
          setTimeout(() => {
            setDmgDir((d) => (d && d.id === id ? null : d));
          }, 900);
        },
        paused: (p) => setPaused(p),
        touchUI: () => setIsTouch(true),
        joy: (j) => {
          const now = performance.now();
          if (now - joyT > 90 || j.active !== joy.active) {
            joyT = now;
            setJoy({ active: j.active, dx: j.dx, dy: j.dy });
          }
        },
        gameOver: (r) => {
          setResult(r);
          setPhase('over');
        },
      }
    );
    engineRef.current = engine;
    setPhase('playing');
    // Let the canvas mount before starting.
    requestAnimationFrame(() => engine.start());
  }, [mapKey, mode, diffKey, reduced, destroyEngine, joy.active]);

  const exitToMenu = useCallback(() => {
    fx.menuClose();
    destroyEngine();
    setPhase('menu');
    setHud(null);
  }, [destroyEngine]);

  const toggleMute = useCallback(() => {
    const m = engineRef.current?.toggleMute();
    setMuted(!!m);
  }, []);

  const dmgDeg = dmgDir ? 180 - (dmgDir.rel * 180) / Math.PI : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none text-neutral-100">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ touchAction: 'none' }} />

      {/* ================= MENU ================= */}
      {phase === 'menu' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#0b0e1a] via-[#101424] to-black/95">
          <div className="max-w-3xl mx-auto px-5 pt-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
            <div className="text-[11px] tracking-[0.4em] uppercase text-red-400/90">Goddess of war</div>
            <h1 className="text-5xl font-black tracking-widest mt-1">ENYO</h1>
            <p className="text-neutral-400 mt-2 text-sm max-w-xl">
              Arena shooter against AI combatants. Pick an arena and a way to fight, then deploy.
              Everything here is generated live — no downloads, no accounts.
            </p>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Arena</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {MAPS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMapKey(m.key)}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    mapKey === m.key ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div
                    className="h-14 rounded-md mb-3"
                    style={{ background: `linear-gradient(135deg, #${m.sky.toString(16).padStart(6, '0')}, #${m.fog.toString(16).padStart(6, '0')})` }}
                  />
                  <div className="font-bold">{m.name}</div>
                  <div className="text-[11px] text-neutral-400 mt-1">{m.desc}</div>
                </button>
              ))}
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Battle type</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('tdm')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  mode === 'tdm' ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-bold">Team battle</div>
                <div className="text-[11px] text-neutral-400 mt-1">You + 2 allies vs 3 enemies. First team to 30 wins.</div>
              </button>
              <button
                onClick={() => setMode('ffa')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  mode === 'ffa' ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-bold">Free for all</div>
                <div className="text-[11px] text-neutral-400 mt-1">You vs 5 rivals. First to 20 kills wins.</div>
              </button>
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Bot skill</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SKILL_KEYS.map((k) => {
                const sk = skillByKey(k);
                return (
                  <button
                    key={k}
                    onClick={() => setDiffKey(k)}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      diffKey === k ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-bold">{sk.name}</div>
                    <div className="text-[11px] text-neutral-400 mt-1">{sk.desc}</div>
                  </button>
                );
              })}
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Arsenal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {WEAPON_KEYS.map((k) => (
                <div key={k} className="pointer-events-none opacity-90">
                  <WeaponCard w={{ ...weaponByKey(k), key: k }} selected={false} onPick={() => {}} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">You carry all three — swap mid-fight with 1 / 2 / 3.</p>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Controls</h2>
            <div className="text-[12px] text-neutral-400 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <div><span className="text-neutral-200 font-bold">Mouse</span> — look (click the arena to lock)</div>
              <div><span className="text-neutral-200 font-bold">WASD</span> — move · <span className="text-neutral-200 font-bold">Shift</span> — sprint</div>
              <div><span className="text-neutral-200 font-bold">Click</span> — fire · <span className="text-neutral-200 font-bold">R</span> — reload</div>
              <div><span className="text-neutral-200 font-bold">Space</span> — jump · <span className="text-neutral-200 font-bold">1/2/3</span> — swap weapon</div>
              <div className="sm:col-span-2"><span className="text-neutral-200 font-bold">Touch</span> — left stick moves, drag right side to look, FIRE button shoots</div>
            </div>

            <button
              onClick={deploy}
              className="mt-10 w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black tracking-[0.35em] text-lg transition-colors"
            >
              DEPLOY
            </button>
            <p className="text-center text-[11px] text-neutral-600 mt-3 tracking-wider">
              Bots are procedural combatants — armored figures, not people.
            </p>
          </div>
        </div>
      )}

      {/* ================= HUD ================= */}
      {(phase === 'playing' || phase === 'over') && hud && (
        <>
          {/* crosshair */}
          {phase === 'playing' && !paused && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-[18px] h-[18px] relative">
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-[5px] bg-white/90" />
                <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[2px] h-[5px] bg-white/90" />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[2px] w-[5px] bg-white/90" />
                <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[2px] w-[5px] bg-white/90" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-[2px] bg-white rounded-full" />
              </div>
              {/* hitmarker */}
              {hitmark && (
                <div key={hitmark.n} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className={`text-2xl font-black ${hitmark.killed ? 'text-red-500' : 'text-white'}`}>✕</div>
                </div>
              )}
            </div>
          )}

          {/* damage direction indicator */}
          {dmgDir && phase === 'playing' && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-[120px] h-[120px] relative" style={{ transform: `rotate(${dmgDeg}deg)` }}>
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-10 h-3 rounded-full bg-red-500/80 blur-[1px]" />
              </div>
            </div>
          )}

          {/* low-health vignette */}
          {hud.hp <= 35 && hud.alive && !reduced && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(220,38,38,0.45) 100%)' }}
            />
          )}

          {/* top bar: score + timer */}
          <div className="absolute top-0 left-0 right-0 flex justify-center pt-3 pointer-events-none">
            <div className="flex items-center gap-4 px-5 py-2 rounded-full bg-black/55 backdrop-blur-sm border border-white/10">
              {hud.mode === 'tdm' ? (
                <>
                  <span className="text-blue-400 font-black text-lg">{hud.blueScore}</span>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">You</span>
                  <span className="text-neutral-200 font-bold tabular-nums">{fmtTime(hud.timeLeft)}</span>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">Enemy</span>
                  <span className="text-red-400 font-black text-lg">{hud.redScore}</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">Kills</span>
                  <span className="text-amber-400 font-black text-lg tabular-nums">
                    {hud.kills}/{hud.target}
                  </span>
                  <span className="text-neutral-200 font-bold tabular-nums">{fmtTime(hud.timeLeft)}</span>
                </>
              )}
            </div>
          </div>

          {/* kill feed */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none max-w-[46vw]">
            {feed.map((f) => (
              <div key={f.id} className="text-[11px] px-2.5 py-1 rounded bg-black/55 border border-white/10 text-neutral-300">
                {f.msg}
              </div>
            ))}
          </div>

          {/* health */}
          <div className="absolute left-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-1">Health</div>
            <div className="w-44 sm:w-56 h-3 rounded bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded transition-all ${hud.hp > 50 ? 'bg-emerald-400' : hud.hp > 25 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, hud.hp)}%` }}
              />
            </div>
            <div className="text-[11px] text-neutral-400 mt-1 tabular-nums">
              K {hud.kills} · D {hud.deaths}
            </div>
          </div>

          {/* ammo + weapons */}
          <div className="absolute right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] text-right pointer-events-none">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">{hud.weaponName}</div>
            <div className="text-3xl font-black tabular-nums">
              {hud.reloading ? <span className="text-amber-400 text-xl">RELOADING</span> : (
                <>
                  <span className={hud.mag === 0 ? 'text-red-400' : 'text-white'}>{hud.mag}</span>
                  <span className="text-neutral-500 text-xl"> / {hud.reserve}</span>
                </>
              )}
            </div>
            <div className="flex gap-1.5 justify-end mt-1.5">
              {WEAPON_KEYS.map((k, i) => (
                <div
                  key={k}
                  className={`px-2 py-1 rounded text-[10px] font-bold border ${
                    hud.weaponKey === k ? 'border-amber-400/80 text-amber-300 bg-amber-400/10' : 'border-white/15 text-neutral-500'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* mute */}
          <button
            onClick={toggleMute}
            className="absolute top-3 left-3 px-3 py-2 rounded-lg bg-black/55 border border-white/10 text-[11px] tracking-widest uppercase text-neutral-300"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? 'Muted' : 'Sound on'}
          </button>

          {/* respawn overlay */}
          {!hud.alive && phase === 'playing' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
              <div className="text-center">
                <div className="text-red-500 font-black text-3xl tracking-widest">TAKEN DOWN</div>
                <div className="text-neutral-300 mt-2">Back in {hud.respawnIn}…</div>
              </div>
            </div>
          )}

          {/* mobile controls */}
          {isTouch && phase === 'playing' && !paused && (
            <>
              {/* joystick visual */}
              <div className="absolute left-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-28 h-28 rounded-full border-2 border-white/25 bg-white/5 pointer-events-none">
                <div
                  className="absolute w-12 h-12 rounded-full bg-white/30 left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${joy.dx * 32}px), calc(-50% + ${joy.dy * 32}px))`,
                  }}
                />
              </div>
              <div className="absolute right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col items-end gap-3">
                <button
                  className="w-20 h-20 rounded-full bg-red-600/80 border-2 border-red-400/60 text-white font-black text-sm active:bg-red-500"
                  onTouchStart={(e) => { e.preventDefault(); engineRef.current?.setFiring(true); }}
                  onTouchEnd={(e) => { e.preventDefault(); engineRef.current?.setFiring(false); }}
                  aria-label="Fire"
                >
                  FIRE
                </button>
                <div className="flex gap-2">
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.jump(); }}
                    aria-label="Jump"
                  >
                    JUMP
                  </button>
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.reload(); }}
                    aria-label="Reload"
                  >
                    RELOAD
                  </button>
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.cycleWeapon(); }}
                    aria-label="Swap weapon"
                  >
                    SWAP
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ================= PAUSED ================= */}
      {phase === 'playing' && paused && (
        <button
          onClick={() => engineRef.current?.resume()}
          className="absolute inset-0 bg-black/70 flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-2xl font-black tracking-widest">PAUSED</div>
            <div className="text-neutral-400 mt-2 text-sm">Click to jump back in</div>
          </div>
        </button>
      )}

      {/* ================= GAME OVER ================= */}
      {phase === 'over' && result && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-5 overflow-y-auto">
          <div className="max-w-md w-full text-center py-8">
            <div className={`text-5xl font-black tracking-widest ${result.won ? 'text-amber-400' : 'text-red-500'}`}>
              {result.won ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="text-neutral-400 mt-2">{result.reason}</div>
            {result.mode === 'tdm' && (
              <div className="mt-4 text-xl font-bold tabular-nums">
                <span className="text-blue-400">{result.blueScore}</span>
                <span className="text-neutral-500 mx-2">—</span>
                <span className="text-red-400">{result.redScore}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.kills}</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Kills</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.deaths}</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Deaths</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.accuracy}%</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Accuracy</div>
              </div>
            </div>
            <button
              onClick={deploy}
              className="mt-8 w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 font-black tracking-[0.3em] transition-colors"
            >
              PLAY AGAIN
            </button>
            <button
              onClick={exitToMenu}
              className="mt-3 w-full py-3 rounded-xl border border-white/20 text-neutral-300 tracking-[0.25em] text-sm hover:bg-white/10 transition-colors"
            >
              CHANGE ARENA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
