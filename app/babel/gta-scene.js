// app/babel/gta-scene.js — Three.js GTA scene controller for BABEL.
// THE TOWER district: realistic tower + plaza + vault entrance at the base.
// Walk, drive, wanted system, missions. Vault door → /babel/vault (real vault, untouched).

import * as THREE from 'three';
import {
  generateBabelDistrict,
  buildTowerMeshes,
  buildVaultDoorMesh,
  createBabelGroundTexture,
  VAULT_DOOR,
  BABEL,
} from './babel-district.js';
import { createPlayer, updatePlayer } from '@/lib/gta/player.js';
import { createVehicle, updateVehicle, enterVehicle, exitVehicle, nearestVehicle, VEHICLE_TYPES } from '@/lib/gta/vehicle.js';
import { createWanted, commitCrime, updateWanted, updateCop, checkBusted, resetWanted } from '@/lib/gta/wanted.js';
import { createMission, updateMission, startMission, currentObjective, MISSION_STATE, BABEL_MISSIONS } from '@/lib/gta/missions.js';
import { createInput } from '@/lib/gta/input.js';
import { findClearSpot } from '@/lib/gta/collisions.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGTAScene(canvas, opts = {}) {
  const onEvent = opts.onEvent || (() => {});

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene + camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 120, 600);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);

  // Lights
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x3a3f45, 0.6));

  // District
  const district = generateBabelDistrict(2026);

  // Ground
  const groundTex = createBabelGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BABEL.size, BABEL.size),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // THE TOWER
  buildTowerMeshes(scene);

  // Vault door at the base
  buildVaultDoorMesh(scene);

  // Surrounding buildings (instanced)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
  const buildMesh = new THREE.InstancedMesh(boxGeo, buildMat, district.buildings.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  district.buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    buildMesh.setMatrixAt(i, dummy.matrix);
    col.setHex(b.color);
    buildMesh.setColorAt(i, col);
  });
  buildMesh.castShadow = true;
  buildMesh.receiveShadow = true;
  scene.add(buildMesh);

  // Player — spawn on the plaza, facing the tower
  const spawn = findClearSpot(0, 80, district.colliders, 2);
  const player = createPlayer(spawn.x, spawn.z);
  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4a24e, roughness: 0.6 })
  );
  playerMesh.castShadow = true;
  scene.add(playerMesh);

  // Vehicles (parked around the district)
  const vehicles = [];
  const vehicleMeshes = new Map();
  const rand = mulberry32(99);
  const vTypes = Object.keys(VEHICLE_TYPES);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle) * (100 + rand() * 120);
    const z = Math.sin(angle) * (100 + rand() * 120);
    const spot = findClearSpot(x, z, district.colliders, 3);
    const type = vTypes[Math.floor(rand() * vTypes.length)];
    const v = createVehicle(type, spot.x, spot.z, rand() * Math.PI * 2);
    vehicles.push(v);

    const carGroup = new THREE.Group();
    const bodyColor = [0x8a6a2f, 0x2a2d38, 0xd4a24e, 0x4a5568, 0x1a1a1a][i % 5];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.6 })
    );
    body.position.y = 0.6;
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.6, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.2, metalness: 0.8 })
    );
    cabin.position.set(0, 1.2, -0.2);
    carGroup.add(body, cabin);
    carGroup.position.set(v.x, 0, v.z);
    carGroup.rotation.y = v.heading;
    scene.add(carGroup);
    vehicleMeshes.set(v, carGroup);
  }

  // Police cars
  const cops = [];
  const copMeshes = new Map();
  for (let i = 0; i < 2; i++) {
    const cop = { x: 120 + i * 60, z: -100, heading: 0, speed: 0, vx: 0, vz: 0, radius: 1.6 };
    cops.push(cop);
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.6 })
    );
    body.position.y = 0.6;
    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 })
    );
    lightbar.position.y = 1.35;
    g.add(body, lightbar);
    g.position.set(cop.x, 0, cop.z);
    g.visible = false;
    scene.add(g);
    copMeshes.set(cop, g);
  }

  // Wanted + missions
  const wanted = createWanted();
  const missions = BABEL_MISSIONS.map(m => createMission(m.id, m));
  let activeMission = null;
  const bustTimer = { t: 0 };
  let money = 0;

  // Input
  const input = createInput();
  input.attach();

  // Camera
  let camYaw = Math.PI, camPitch = 0.35, camDist = 9; // start facing the tower

  // Day/night
  let timeOfDay = 0.5;

  function updateTimeOfDay(dt) {
    timeOfDay = (timeOfDay + dt / 600) % 1;
    const sunAngle = timeOfDay * Math.PI * 2;
    sun.position.set(
      Math.cos(sunAngle) * 250,
      Math.sin(sunAngle) * 180 + 60,
      120
    );
    const dayness = Math.max(0, Math.sin(sunAngle));
    sun.intensity = 0.2 + dayness * 1.0;
    const skyColor = new THREE.Color().lerpColors(
      new THREE.Color(0x0a0a20),
      new THREE.Color(0x87ceeb),
      dayness
    );
    scene.background = skyColor;
    scene.fog.color = skyColor;
  }

  // Vault door proximity check
  function nearVaultDoor() {
    const dx = player.x - VAULT_DOOR.x;
    const dz = player.z - VAULT_DOOR.z;
    return Math.sqrt(dx * dx + dz * dz) < VAULT_DOOR.promptRadius;
  }

  let lastT = performance.now();
  let raf = 0;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const inp = input.update();
    updateTimeOfDay(dt);

    // E: enter/exit vehicle, or open the vault door
    if (inp.action) {
      if (player.inVehicle) {
        exitVehicle(player);
        onEvent({ type: 'exit_vehicle' });
      } else if (nearVaultDoor()) {
        // The vault door — routes to the real Miles' vault page
        onEvent({ type: 'vault_enter' });
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

    // Vault prompt hint (on foot, near door)
    const vaultNear = !player.inVehicle && nearVaultDoor();

    if (player.inVehicle) {
      const v = player.inVehicle;
      const res = updateVehicle(v, inp, district.colliders, dt);
      player.x = v.x; player.z = v.z;
      if (res.crashed && res.impact > 15) {
        commitCrime(wanted, 'recklessDriving', now / 1000);
      }
      const mesh = vehicleMeshes.get(v);
      if (mesh) {
        mesh.position.set(v.x, 0, v.z);
        mesh.rotation.y = v.heading;
      }
    } else {
      updatePlayer(player, inp, camYaw, district.colliders, dt);
    }

    // Player mesh
    playerMesh.position.set(player.x, player.y + 1.0, player.z);
    playerMesh.rotation.y = player.heading;

    // Camera follow
    const targetX = player.x, targetZ = player.z;
    const px = targetX - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const pz = targetZ - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    const py = 2 + Math.sin(camPitch) * camDist;
    camera.position.lerp(new THREE.Vector3(px, py, pz), 0.15);
    camera.lookAt(targetX, 1.5, targetZ);

    // Wanted + cops
    const seen = cops.some(c => {
      const dx = player.x - c.x, dz = player.z - c.z;
      return Math.sqrt(dx * dx + dz * dz) < 80;
    });
    updateWanted(wanted, dt, now / 1000, seen && wanted.stars > 0);

    cops.forEach((cop, i) => {
      const mesh = copMeshes.get(cop);
      const active = wanted.stars > 0 && i < Math.min(2, wanted.stars);
      mesh.visible = active;
      if (active) {
        const dx = player.x - cop.x, dz = player.z - cop.z;
        if (Math.sqrt(dx * dx + dz * dz) > 200) {
          cop.x = player.x + (Math.random() - 0.5) * 120;
          cop.z = player.z + (Math.random() - 0.5) * 120;
        }
        updateCop(cop, player.x, player.z, wanted.stars, district.colliders, dt);
        mesh.position.set(cop.x, 0, cop.z);
        mesh.rotation.y = cop.heading;
      }
    });

    // Busted?
    const pSpeed = player.inVehicle ? Math.abs(player.inVehicle.speed) : Math.sqrt(player.vx ** 2 + player.vz ** 2);
    if (checkBusted(cops.filter((_, i) => i < wanted.stars), player.x, player.z, pSpeed, dt, bustTimer)) {
      // Respawn on the plaza, clear wanted
      player.x = 0; player.z = 80;
      if (player.inVehicle) exitVehicle(player);
      resetWanted(wanted);
      money = Math.max(0, money - 50);
      onEvent({ type: 'busted', money });
    }

    // Missions
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

    // HUD sync
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
      vaultNear,
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
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      input.detach();
      renderer.dispose();
    },
    setCamYaw(yaw) { camYaw = yaw; },
    setCamPitch(pitch) { camPitch = Math.max(0.1, Math.min(1.2, pitch)); },
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
    input,
  };
}
