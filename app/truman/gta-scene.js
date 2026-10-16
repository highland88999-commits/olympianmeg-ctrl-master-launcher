// app/truman/gta-scene.js — Three.js GTA scene controller for Truman.
// Reuses the shared GTA engine. Suburban town, uncanny perfect aesthetic.
// Keeps Matrix Brain time system (day/night synced to simulated time).

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { generateTown, createTownGroundTexture, buildTownTrees, TRUMAN_POIS } from './town.js';
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
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 80, 400);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcde7ff, 0x4a5a3a, 0.7));

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

  // Houses (instanced boxes with color variation)
  const houseGeo = new THREE.BoxGeometry(1, 1, 1);
  const houseMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
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

  // Roofs (simple prisms — use cones for pitched roofs)
  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4030, roughness: 0.9 });
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, townData.houses.length);
  townData.houses.forEach((h, i) => {
    dummy.position.set(h.x, h.h + 1.5, h.z);
    dummy.scale.set(h.w * 0.75, 3, h.d * 0.75);
    dummy.rotation.y = Math.PI / 4;
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
  });
  roofMesh.castShadow = true;
  scene.add(roofMesh);

  // Shops
  for (const shop of townData.shops) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(shop.w, shop.h, shop.d),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 })
    );
    m.position.set(shop.x, shop.h / 2, shop.z);
    m.castShadow = true;
    scene.add(m);
    // Awning
    const awn = new THREE.Mesh(
      new THREE.BoxGeometry(shop.w + 2, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.8 })
    );
    awn.position.set(shop.x, 4, shop.z + shop.d / 2 + 1);
    scene.add(awn);
  }

  // Lighthouse (red/white stripes)
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

  // Observatory (dome)
  const obs = townData.observatory;
  const obsBase = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 11, 10, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7 })
  );
  obsBase.position.set(obs.x, 5, obs.z);
  obsBase.castShadow = true;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.3 })
  );
  dome.position.set(obs.x, 10, obs.z);
  dome.castShadow = true;
  scene.add(obsBase, dome);

  buildTownTrees(scene);

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

  // Vehicles (perfect identical sedans — uncanny)
  const vehicles = [];
  const vehicleMeshes = new Map();
  const rand = mulberry32(99);
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 300;
    const z = (rand() - 0.5) * 300;
    if (x > 140) continue;
    const spot = findClearSpot(x, z, townData.colliders, 3);
    const v = createVehicle('sedan', spot.x, spot.z, rand() * Math.PI * 2);
    vehicles.push(v);

    const carGroup = new THREE.Group();
    // Uncanny: all cars are the same beige color
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.3, metalness: 0.5 })
    );
    body.position.y = 0.6;
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.6, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.2, metalness: 0.7 })
    );
    cabin.position.set(0, 1.2, -0.2);
    carGroup.add(body, cabin);
    carGroup.position.set(v.x, 0, v.z);
    carGroup.rotation.y = v.heading;
    scene.add(carGroup);
    vehicleMeshes.set(v, carGroup);
  }

  // Cops
  const cops = [];
  const copMeshes = new Map();
  for (let i = 0; i < 2; i++) {
    const cop = { x: 50 + i * 40, z: 50, heading: 0, speed: 0, vx: 0, vz: 0, radius: 1.6 };
    cops.push(cop);
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.6 })
    );
    body.position.y = 0.6;
    g.add(body);
    g.position.set(cop.x, 0, cop.z);
    g.visible = false;
    scene.add(g);
    copMeshes.set(cop, g);
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

  function updateTimeOfDay(dt) {
    simTime = (simTime + dt / 600) % 1;
    const sunAngle = simTime * Math.PI * 2;
    sun.position.set(Math.cos(sunAngle) * 150, Math.sin(sunAngle) * 120 + 40, 80);
    const dayness = Math.max(0, Math.sin(sunAngle));
    sun.intensity = 0.25 + dayness * 1.0;
    const sky = new THREE.Color().lerpColors(
      new THREE.Color(0x0a0a25),
      new THREE.Color(0x87ceeb),
      dayness
    );
    scene.background = sky;
    scene.fog.color = sky;
  }

  let lastT = performance.now();
  let raf = 0;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const inp = input.update();
    updateTimeOfDay(dt);

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
