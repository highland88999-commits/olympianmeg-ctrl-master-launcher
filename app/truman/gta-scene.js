// app/truman/gta-scene.js — Three.js GTA scene controller for Truman.
// Reuses the shared GTA engine. Suburban town, uncanny perfect aesthetic.
// Keeps Matrix Brain time system (day/night synced to simulated time).

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { generateTown, createTownGroundTexture, createShopSignTexture, buildTownTrees, TRUMAN_POIS } from './town.js';
import {
  trumanSkyAt, trumanWind, lighthouseBeamAngle, trumanClouds, cloudOffset,
  materialForTruman, TRUMAN_CLOUD_SPAN,
} from './cgi.js';
import { createTownTraffic, stepTownTraffic, trafficHeading } from './traffic.js';
import { pedestrianAt, TRUMAN_PEDESTRIAN_COUNT } from './life.js';
import { createPlayer, updatePlayer } from '@/lib/gta/player.js';
import { createVehicle, updateVehicle, enterVehicle, exitVehicle, nearestVehicle, VEHICLE_TYPES } from '@/lib/gta/vehicle.js';
import { createWanted, commitCrime, updateWanted, updateCop, checkBusted, resetWanted } from '@/lib/gta/wanted.js';
import { createMission, updateMission, startMission, currentObjective, MISSION_STATE, TRUMAN_MISSIONS } from '@/lib/gta/missions.js';
import { createInput } from '@/lib/gta/input.js';
import { findClearSpot } from '@/lib/gta/collisions.js';
import { createWalkerEmbodiment, capsuleProcSize } from '@/lib/gta/walker-embodiment.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Small-town car palette — every car its own colour, never beige twice.
const CAR_PALETTE = [0xc96f4a, 0x7fae7a, 0x5b7fa6, 0xd8c27a, 0xa86f9e, 0xd8d0c0, 0x8a9a8b, 0xb85450];
const ROOF_HUES = [0x8a4030, 0x6b4a3a, 0x4a5a6b, 0x7a6a4a, 0x5a3a3a];
const AWNING_COLORS = [0x3b82f6, 0xc96f4a, 0x7fae7a, 0xd8c27a, 0xa86f9e];

// Radial glow sprite texture (sun / moon discs). Canvas 2D, built once.
function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

// Solid-disc texture for the sun's bright core: opaque white out to
// 0.7 of the radius, then a falloff to transparent at the rim.
function makeSolidDiscTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

// One town car: body + cabin + 4 wheels + headlights + taillights.
// Front is local +Z (matches the shared vehicle forward law:
// forward = (sin(heading), cos(heading))). Returns
// { group, headMat, tailMat, barRed, barBlue } — bar mats are
// null unless opts.cop.
function makeCarMesh(colorHex, opts = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.5 })
  );
  body.position.y = 0.6;
  body.castShadow = true;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.2, metalness: 0.7 })
  );
  cabin.position.set(0, 1.2, -0.2);
  group.add(body, cabin);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }
  // Headlights (front, +Z) + taillights — unlit materials, so they
  // glow at night with no new real lights; opacity rides the dusk.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8d6, transparent: true, opacity: 0.3 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5 });
  const headGeo = new THREE.SphereGeometry(0.14, 8, 6);
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.set(hx, 0.65, 2.12);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), tailMat);
    t.position.set(hx, 0.7, -2.12);
    group.add(t);
  }
  let barRed = null, barBlue = null;
  if (opts.cop) {
    barRed = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9 });
    barBlue = new THREE.MeshBasicMaterial({ color: 0x2a6aff, transparent: true, opacity: 0.9 });
    const barGeo = new THREE.BoxGeometry(0.55, 0.22, 0.5);
    const r = new THREE.Mesh(barGeo, barRed);
    r.position.set(-0.32, 1.62, -0.2);
    const b = new THREE.Mesh(barGeo, barBlue);
    b.position.set(0.32, 1.62, -0.2);
    group.add(r, b);
  }
  return { group, headMat, tailMat, barRed, barBlue };
}

export function createTrumanGTAScene(canvas, opts = {}) {
  const onEvent = opts.onEvent || (() => {});

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'TRUMAN' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // Sky colours are owned by trumanSkyAt() (cgi.js) and mutated
  // per frame — these objects are assigned once, never replaced.
  const skyColor = new THREE.Color(0x87ceeb);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(0x87ceeb, 80, 400);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xcde7ff, 0x4a5a3a, 0.7);
  scene.add(hemi);

  // Sun + moon discs (unlit sprites) and the night stars.
  const glowTex = makeGlowTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff3d6, transparent: true, opacity: 1, depthWrite: false,
  }));
  sunSprite.scale.setScalar(70);
  scene.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xdfe9ff, transparent: true, opacity: 0, depthWrite: false,
  }));
  moonSprite.scale.setScalar(38);
  scene.add(moonSprite);
  // Sun core disc: the bright centre inside the glow halo.
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSolidDiscTexture(), color: 0xfff3d6, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunDisc.scale.setScalar(14);
  sunDisc.renderOrder = 1;
  scene.add(sunDisc);
  // The real Moon: Merlin's photograph on a sphere (never a flat
  // disc — the photo is equirectangular and would smear). It sits
  // 30 m inside the glow sprite along its direction so the halo's
  // opaque centre never paints over the photo; the glow stays as
  // its halo. Pale fallback if the photo fails to load.
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0, fog: false });
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 32), moonMat);
  moonBall.name = 'truman-moon';
  scene.add(moonBall);
  try {
    new THREE.TextureLoader().load(
      '/images/moon/moon-surface.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        moonMat.map = tex;
        moonMat.color.set(0xffffff);
        moonMat.needsUpdate = true;
      },
      undefined,
      () => { /* photo failed: the pale fallback stays */ },
    );
  } catch { /* no loader available: the pale fallback stays */ }
  const starGeo = new THREE.BufferGeometry();
  {
    const rnd = mulberry32(31337);
    const pos = new Float32Array(320 * 3);
    for (let i = 0; i < 320; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.08 + rnd() * 0.9; // elevation above the horizon
      const r = 430;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // Lazy small-town clouds: flat white puffs drifting downwind.
  const cloudBases = trumanClouds();
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false,
  });
  const cloudPuffGeo = new THREE.SphereGeometry(1, 10, 8);
  const clouds = cloudBases.map((c) => {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(cloudPuffGeo, cloudMat);
      puff.position.set((k - 1) * c.scale * 0.7, (k % 2) * c.scale * 0.12, 0);
      puff.scale.set(c.scale * (1 - Math.abs(k - 1) * 0.25), c.scale * 0.42, c.scale * 0.7);
      g.add(puff);
    }
    g.position.set(c.x, c.y, c.z);
    scene.add(g);
    return g;
  });

  // Town
  const townData = generateTown(4242);
  const groundTex = createTownGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Houses (instanced boxes with siding texture + color variation)
  const houseGeo = new THREE.BoxGeometry(1, 1, 1);
  const houseMat = materialForTruman('houseSiding', 4242);
  const houseMesh = new THREE.InstancedMesh(houseGeo, houseMat, townData.houses.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  townData.houses.forEach((h, i) => {
    dummy.position.set(h.x, h.h / 2, h.z);
    dummy.scale.set(h.w, h.h, h.d);
    dummy.updateMatrix();
    houseMesh.setMatrixAt(i, dummy.matrix);
    col.setHex(h.color);
    houseMesh.setColorAt(i, col);
  });
  houseMesh.castShadow = true;
  houseMesh.receiveShadow = true;
  scene.add(houseMesh);

  // Roofs (simple prisms — use cones for pitched roofs), shingled
  // with one of five roof hues per house.
  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  const roofMat = materialForTruman('roofShingle', 4242);
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, townData.houses.length);
  townData.houses.forEach((h, i) => {
    dummy.position.set(h.x, h.h + 1.5, h.z);
    dummy.scale.set(h.w * 0.75, 3, h.d * 0.75);
    dummy.rotation.y = Math.PI / 4;
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
    col.setHex(ROOF_HUES[i % ROOF_HUES.length]);
    roofMesh.setColorAt(i, col);
    dummy.rotation.y = 0;
  });
  roofMesh.castShadow = true;
  scene.add(roofMesh);

  // Windows + doors: lit windows glow warm at dusk (unlit material,
  // opacity rides the day/night glow — no new real lights).
  // Collected first, then built as three instanced meshes.
  const winLit = []; const winDark = []; const doors = [];
  const winRand = mulberry32(4242);
  for (const h of townData.houses) {
    const fz = h.z + h.d / 2 + 0.06;
    for (const ox of [-h.w / 4, h.w / 4]) {
      const win = { x: h.x + ox, y: h.h * 0.55, z: fz, w: 1.2, h: 1.4 };
      (winRand() < 0.45 ? winLit : winDark).push(win);
    }
    doors.push({ x: h.x, y: 1.1, z: fz, w: 1.4, h: 2.2 });
  }
  const litWinMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.3 });
  const darkWinMat = new THREE.MeshBasicMaterial({ color: 0x1a2530 });
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x4a3220 });
  const winGeo = new THREE.PlaneGeometry(1, 1);
  function buildQuadMesh(list, mat) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(winGeo, mat, list.length);
    list.forEach((q, i) => {
      dummy.position.set(q.x, q.y, q.z);
      dummy.scale.set(q.w, q.h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    scene.add(m);
    return m;
  }
  buildQuadMesh(winLit, litWinMat);
  buildQuadMesh(winDark, darkWinMat);
  buildQuadMesh(doors, doorMat);

  // Shops (brick fronts, varied awnings, painted name signs, lit windows)
  const shopMat = materialForTruman('brickShop', 4242);
  for (const [si, shop] of townData.shops.entries()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(shop.w, shop.h, shop.d),
      shopMat
    );
    m.position.set(shop.x, shop.h / 2, shop.z);
    m.castShadow = true;
    scene.add(m);
    // Awning — one colour per shop, not all blue
    const awn = new THREE.Mesh(
      new THREE.BoxGeometry(shop.w + 2, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: AWNING_COLORS[si % AWNING_COLORS.length], roughness: 0.8 })
    );
    awn.position.set(shop.x, 4, shop.z + shop.d / 2 + 1);
    scene.add(awn);
    // Painted sign board above the awning
    const signTex = createShopSignTexture(shop.name, '#3a5a3a');
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(shop.w * 0.8, 2.2), signMat);
    sign.position.set(shop.x, shop.h - 1.4, shop.z + shop.d / 2 + 0.06);
    scene.add(sign);
    // Shop windows (lit at dusk, same material as house windows)
    const shopWins = [];
    for (const ox of [-shop.w / 4, shop.w / 4]) {
      shopWins.push({ x: shop.x + ox, y: 2.2, z: shop.z + shop.d / 2 + 0.06, w: 2.4, h: 2.0 });
    }
    buildQuadMesh(shopWins, litWinMat);
  }

  // Lighthouse (red/white stripes) + rotating beam (emissive cone,
  // never a light) + lamp. The beam turns on the device clock.
  const lh = townData.lighthouse;
  const lhGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5 - i * 0.2, 2.7 - i * 0.2, 8, 12),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xffffff : 0xdc2626, roughness: 0.6 })
    );
    seg.position.y = 4 + i * 8;
    lhGroup.add(seg);
  }
  lhGroup.position.set(lh.x, 0, lh.z);
  lhGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(lhGroup);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), lampMat);
  lamp.position.set(lh.x, 42, lh.z);
  scene.add(lamp);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beamGroup = new THREE.Group();
  beamGroup.position.set(lh.x, 42, lh.z);
  const beamGeo = new THREE.CylinderGeometry(0.6, 7, 55, 12, 1, true);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 27.5;
  beamGroup.add(beam);
  scene.add(beamGroup);

  // Observatory (dome) — siding-textured drum, white dome, dark slit.
  const obs = townData.observatory;
  const obsBase = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 11, 10, 16),
    materialForTruman('houseSiding', 4242, '#d8d0c0')
  );
  obsBase.position.set(obs.x, 5, obs.z);
  obsBase.castShadow = true;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.3 })
  );
  dome.position.set(obs.x, 10, obs.z);
  dome.castShadow = true;
  const slit = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 8, 1),
    new THREE.MeshBasicMaterial({ color: 0x0a1420 })
  );
  slit.position.set(obs.x, 14, obs.z + 9.2);
  scene.add(obsBase, dome, slit);

  // Wooden pier into the water by the beach (plank-textured deck).
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.5, 5),
    materialForTruman('woodPlank', 4242)
  );
  pierDeck.position.set(228, 0.8, 210);
  pierDeck.castShadow = true;
  scene.add(pierDeck);
  const pierPostGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.4, 8);
  const pierPostMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
  for (const [px, pz] of [[216, 208], [216, 212], [240, 208], [240, 212]]) {
    const post = new THREE.Mesh(pierPostGeo, pierPostMat);
    post.position.set(px, 0, pz);
    scene.add(post);
  }

  // Beach umbrellas — six bright cones on the sand.
  const umbrellaColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x7fae7a, 0xff9f43, 0xa86f9e];
  for (let i = 0; i < 6; i++) {
    const ux = 165 + i * 12, uz = 190 + (i % 2) * 15;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 })
    );
    pole.position.set(ux, 1.2, uz);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaColors[i], roughness: 0.7 })
    );
    top.position.set(ux, 2.8, uz);
    top.castShadow = true;
    scene.add(pole, top);
  }

  const treeData = buildTownTrees(scene);

  // POI markers
  for (const poi of TRUMAN_POIS) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.8 })
    );
    marker.position.set(poi.x, 8, poi.z);
    scene.add(marker);
  }

  // Player (spawn at Henry's house)
  const player = createPlayer(10, 10);
  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6 })
  );
  playerMesh.castShadow = true;
  scene.add(playerMesh);

  // Wave 1 (characters everywhere): the walker IS your character —
  // shared adapter (lib/gta/walker-embodiment.js); the capsule
  // stays as the native fallback until the model is ready.
  const walker = createWalkerEmbodiment({
    scene, surface: 'truman', procSize: capsuleProcSize(0.5, 1.0),
  });

  // Vehicles — one colour each, with wheels, headlights and
  // taillights. Same spawn rule as before (never on the beach).
  const vehicles = [];
  const vehicleMeshes = new Map();
  const vehicleLights = [];
  const rand = mulberry32(99);
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 300;
    const z = (rand() - 0.5) * 300;
    if (x > 140) continue;
    const spot = findClearSpot(x, z, townData.colliders, 3);
    const v = createVehicle('sedan', spot.x, spot.z, rand() * Math.PI * 2);
    vehicles.push(v);

    const car = makeCarMesh(CAR_PALETTE[i % CAR_PALETTE.length]);
    const carGroup = car.group;
    carGroup.position.set(v.x, 0, v.z);
    carGroup.rotation.y = v.heading;
    scene.add(carGroup);
    vehicleMeshes.set(v, carGroup);
    vehicleLights.push(car);
  }

  // Ambient town traffic — cars that actually drive the roads,
  // brake for the player, and turn at intersections (traffic.js).
  const trafficCars = createTownTraffic(4242, 10);
  const trafficMeshes = trafficCars.map((tc) => {
    const car = makeCarMesh(parseInt(tc.color.slice(1), 16));
    car.group.position.set(tc.x, 0, tc.z);
    car.group.rotation.y = trafficHeading(tc.dir);
    scene.add(car.group);
    vehicleLights.push(car);
    return car.group;
  });

  // Pedestrians — the town's residents (life.js operators: pure
  // functions of the device clock, sidestepping the player).
  const pedestrianMeshes = [];
  for (let i = 0; i < TRUMAN_PEDESTRIAN_COUNT; i++) {
    const route = pedestrianAt(i, Date.now(), null);
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: route.color, roughness: 0.7 })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.6 })
    );
    head.position.y = 1.95;
    g.add(body, head);
    g.position.set(route.x, 0, route.z);
    scene.add(g);
    pedestrianMeshes.push(g);
  }

  // Cops
  const cops = [];
  const copMeshes = new Map();
  const copBars = [];
  for (let i = 0; i < 2; i++) {
    const cop = { x: 50 + i * 40, z: 50, heading: 0, speed: 0, vx: 0, vz: 0, radius: 1.6 };
    cops.push(cop);
    const car = makeCarMesh(0x1e3a8a, { cop: true });
    const g = car.group;
    g.position.set(cop.x, 0, cop.z);
    g.visible = false;
    scene.add(g);
    copMeshes.set(cop, g);
    copBars.push(car);
  }

  const wanted = createWanted();
  const missions = TRUMAN_MISSIONS.map(m => createMission(m.id, m));
  let activeMission = null;
  const bustTimer = { t: 0 };
  let money = 0;

  const input = createInput();
  input.attach();

  let camYaw = 0, camPitch = 0.35, camDist = 8;
  let simTime = 0.3; // morning

  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();

  function updateTimeOfDay(dt, nowMs) {
    simTime = (simTime + dt / 600) % 1;
    const sunAngle = simTime * Math.PI * 2;
    sun.position.set(Math.cos(sunAngle) * 150, Math.sin(sunAngle) * 120 + 40, 80);
    // Sky, light colours and glow all come from the CGI kit —
    // the sun intensity law itself is unchanged (0.25 + dayness).
    const sky = trumanSkyAt(simTime);
    skyColor.set(sky.sky);
    scene.fog.color.copy(skyColor);
    sun.color.set(sky.sunColor);
    sun.intensity = sky.sunIntensity;
    hemi.color.set(sky.hemiSky);
    hemi.groundColor.set(sky.hemiGround);
    hemi.intensity = sky.hemiIntensity;
    const windowGlow = sky.windowGlow; // dusk/night glow factor
    // Sun + moon discs ride the sun direction; stars fade in at night.
    sunDir.copy(sun.position).normalize();
    sunSprite.position.copy(sunDir).multiplyScalar(420);
    sunSprite.material.opacity = sky.sunOpacity;
    moonDir.copy(sunDir).multiplyScalar(-1);
    if (moonDir.y < 0.08) moonDir.y = 0.08;
    moonDir.normalize();
    moonSprite.position.copy(moonDir).multiplyScalar(420);
    moonSprite.material.opacity = sky.moonOpacity;
    // Sun core rides the glow sprite; the real Moon rides 30 m
    // inside it, same opacity rule as the halo.
    sunDisc.position.copy(sunSprite.position);
    sunDisc.material.opacity = sky.sunOpacity;
    moonBall.position.copy(moonDir).multiplyScalar(420 - 30);
    moonBall.material.opacity = sky.moonOpacity;
    moonBall.visible = sky.moonOpacity > 0.02;
    starMat.opacity = sky.starOpacity;
    // Dusk/night glow: lit windows, headlights, the lighthouse beam.
    litWinMat.opacity = 0.3 + 0.65 * windowGlow;
    for (const car of vehicleLights) {
      car.headMat.opacity = 0.25 + 0.7 * windowGlow;
      car.tailMat.opacity = 0.4 + 0.5 * windowGlow;
    }
    beamMat.opacity = 0.06 + 0.3 * windowGlow;
    // Clouds drift downwind with the breeze.
    for (let i = 0; i < clouds.length; i++) {
      const base = cloudBases[i];
      let cx = base.x + cloudOffset(i, nowMs) - TRUMAN_CLOUD_SPAN / 2;
      cx = ((cx + TRUMAN_CLOUD_SPAN / 2) % TRUMAN_CLOUD_SPAN + TRUMAN_CLOUD_SPAN) % TRUMAN_CLOUD_SPAN - TRUMAN_CLOUD_SPAN / 2;
      clouds[i].position.x = cx;
    }
    // Lighthouse beam sweeps on the device clock.
    beamGroup.rotation.y = lighthouseBeamAngle(nowMs);
  }

  let lastT = performance.now();
  let raf = 0;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const inp = input.update();
    const nowMs = Date.now();
    updateTimeOfDay(dt, nowMs);

    // Ambient life: traffic rolls the roads (braking for the
    // player), pedestrians walk their routes, trees sway in the
    // breeze. None of it touches a mechanic.

    if (inp.action) {
      if (player.inVehicle) {
        exitVehicle(player);
        onEvent({ type: 'exit_vehicle' });
      } else {
        const v = nearestVehicle(player.x, player.z, vehicles);
        if (v) {
          enterVehicle(player, v);
          commitCrime(wanted, 'stealCar', now / 1000);
          onEvent({ type: 'enter_vehicle', wanted: wanted.stars });
        }
      }
      inp.action = false;
      input.keys['KeyE'] = false;
    }

    if (player.inVehicle) {
      const v = player.inVehicle;
      updateVehicle(v, inp, townData.colliders, dt);
      player.x = v.x; player.z = v.z;
      const mesh = vehicleMeshes.get(v);
      if (mesh) { mesh.position.set(v.x, 0, v.z); mesh.rotation.y = v.heading; }
    } else {
      updatePlayer(player, inp, camYaw, townData.colliders, dt);
    }

    playerMesh.position.set(player.x, player.y + 1.0, player.z);
    playerMesh.rotation.y = player.heading;
    // Embodied character stands in for the capsule while ready
    playerMesh.visible = !walker.update(player, dt, now / 1000, {});

    // Ambient traffic on the roads (yields to the player).
    stepTownTraffic(trafficCars, dt, { x: player.x, z: player.z });
    trafficCars.forEach((tc, i) => {
      const mesh = trafficMeshes[i];
      mesh.position.set(tc.x, 0, tc.z);
      mesh.rotation.y = trafficHeading(tc.dir);
    });
    // Pedestrians on their routes (sidestepping the player).
    for (let i = 0; i < pedestrianMeshes.length; i++) {
      const p = pedestrianAt(i, nowMs, { x: player.x, z: player.z });
      const g = pedestrianMeshes[i];
      g.position.set(p.x, p.bob, p.z);
      g.rotation.y = p.heading;
    }
    // Trees sway in the breeze.
    {
      const wind = trumanWind(nowMs);
      const tSec = nowMs / 1000;
      const swayAmp = 0.06 + 0.14 * wind.gust;
      for (let i = 0; i < treeData.leafBase.length; i++) {
        const lb = treeData.leafBase[i];
        if (lb.hidden) continue;
        const sway = Math.sin(tSec * 0.9 + lb.phase) * swayAmp;
        dummy.position.set(lb.x + sway, 3.5, lb.z);
        dummy.scale.setScalar(lb.s);
        dummy.rotation.set(0, lb.phase, 0);
        dummy.updateMatrix();
        treeData.leaves.setMatrixAt(i, dummy.matrix);
        dummy.position.set(lb.x + 0.5 + sway * 1.2, 4.9, lb.z - 0.3);
        dummy.scale.setScalar(lb.s * 0.8);
        dummy.updateMatrix();
        treeData.leavesTop.setMatrixAt(i, dummy.matrix);
        dummy.scale.setScalar(1);
        dummy.rotation.set(0, 0, 0);
      }
      treeData.leaves.instanceMatrix.needsUpdate = true;
      treeData.leavesTop.instanceMatrix.needsUpdate = true;
    }
    // Cop light bars flash while the cop is on screen.
    for (let i = 0; i < copBars.length; i++) {
      const mesh = copMeshes.get(cops[i]);
      if (!mesh.visible) continue;
      const phase = Math.sin(nowMs / 130 + i * Math.PI) > 0;
      copBars[i].barRed.opacity = phase ? 0.95 : 0.15;
      copBars[i].barBlue.opacity = phase ? 0.15 : 0.95;
    }

    const targetX = player.x, targetZ = player.z;
    const px = targetX - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const pz = targetZ - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    const py = 2 + Math.sin(camPitch) * camDist;
    camera.position.lerp(new THREE.Vector3(px, py, pz), 0.15);
    camera.lookAt(targetX, 1.5, targetZ);

    const seen = cops.some(c => {
      const dx = player.x - c.x, dz = player.z - c.z;
      return Math.sqrt(dx * dx + dz * dz) < 70;
    });
    updateWanted(wanted, dt, now / 1000, seen && wanted.stars > 0);

    cops.forEach((cop, i) => {
      const mesh = copMeshes.get(cop);
      const active = wanted.stars > 0 && i < Math.min(2, wanted.stars);
      mesh.visible = active;
      if (active) {
        const dx = player.x - cop.x, dz = player.z - cop.z;
        if (Math.sqrt(dx * dx + dz * dz) > 150) {
          cop.x = player.x + (Math.random() - 0.5) * 100;
          cop.z = player.z + (Math.random() - 0.5) * 100;
        }
        updateCop(cop, player.x, player.z, wanted.stars, townData.colliders, dt);
        mesh.position.set(cop.x, 0, cop.z);
        mesh.rotation.y = cop.heading;
      }
    });

    const pSpeed = player.inVehicle ? Math.abs(player.inVehicle.speed) : 0;
    if (checkBusted(cops.filter((_, i) => i < wanted.stars), player.x, player.z, pSpeed, dt, bustTimer)) {
      player.x = 10; player.z = 10;
      if (player.inVehicle) exitVehicle(player);
      resetWanted(wanted);
      money = Math.max(0, money - 25);
      onEvent({ type: 'busted', money });
    }

    if (activeMission) {
      const events = updateMission(activeMission, {
        playerX: player.x, playerZ: player.z,
        inVehicle: !!player.inVehicle,
        collected: new Set(),
      }, dt);
      for (const e of events) {
        if (e.type === 'mission_complete') {
          money += e.reward;
          onEvent({ type: 'mission_complete', mission: activeMission, reward: e.reward, money });
          activeMission = null;
        } else if (e.type === 'mission_failed') {
          onEvent({ type: 'mission_failed', mission: activeMission, reason: e.reason });
          activeMission = null;
        } else {
          onEvent({ type: 'objective_complete', objective: e.objective });
        }
      }
    }

    renderer.render(scene, camera);

    onEvent({
      type: 'hud',
      player: { x: player.x, z: player.z, vx: player.vx, vz: player.vz, health: player.health, inVehicle: !!player.inVehicle },
      vehicle: player.inVehicle ? { speed: player.inVehicle.speed } : null,
      wanted: wanted.stars,
      money,
      mission: activeMission,
      missionMarker: activeMission ? currentObjective(activeMission) : null,
      vehicles: vehicles.filter(v => !v.driver),
      cops: cops.filter((_, i) => i < wanted.stars),
    });
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    start() {
      resize();
      window.addEventListener('resize', resize);
      lastT = performance.now();
      raf = requestAnimationFrame(loop);
    },
    destroy() {
      contextGuard.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      input.detach();
      walker.dispose();
      renderer.dispose();
    },
    setCamYaw(yaw) { camYaw = yaw; },
    getCamYaw() { return camYaw; },
    startMission(id) {
      const m = missions.find(x => x.id === id);
      if (m && m.state !== 'active') {
        startMission(m);
        activeMission = m;
        onEvent({ type: 'mission_start', mission: m });
      }
    },
    getMissions() { return missions; },
    setWalkerCharacter(id) { walker.setCharacter(id); },
    getWalkerCharacter() { return walker.characterId(); },
    input,
  };
}
