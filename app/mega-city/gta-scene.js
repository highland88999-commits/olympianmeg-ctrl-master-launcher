// app/mega-city/gta-scene.js — Three.js GTA scene controller for Mega City.
// Ties together: city gen, player, vehicles, wanted, missions, HUD, day/night.

import * as THREE from 'three';
import { generateCity, createGroundTexture, buildStreetlights, SUBWAY_STATIONS } from './city.js';
import { createPlayer, updatePlayer } from '@/lib/gta/player.js';
import { createVehicle, updateVehicle, enterVehicle, exitVehicle, nearestVehicle, VEHICLE_TYPES } from '@/lib/gta/vehicle.js';
import { createWanted, commitCrime, updateWanted, updateCop, checkBusted, resetWanted } from '@/lib/gta/wanted.js';
import { createMission, updateMission, startMission, currentObjective, MISSION_STATE, MEGA_CITY_MISSIONS } from '@/lib/gta/missions.js';
import { createInput } from '@/lib/gta/input.js';
import { findClearSpot } from '@/lib/gta/collisions.js';
import { createWalkerEmbodiment, capsuleProcSize } from '@/lib/gta/walker-embodiment.js';
import {
  SUBWAY as SUBWAY_CFG, createSubway, updateSubway, subwayPos,
  subwayStatus, nearestStationEntrance,
} from '@/lib/gta/subway.js';

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
  scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

  // Lights
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x3a3f45, 0.6));

  // City
  const cityData = generateCity(1337);
  const groundTex = createGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Buildings (instanced)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
  const buildMesh = new THREE.InstancedMesh(boxGeo, buildMat, cityData.buildings.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  cityData.buildings.forEach((b, i) => {
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

  buildStreetlights(scene);

  // Subway stations (simple entrances)
  const stationGroup = new THREE.Group();
  for (const st of SUBWAY_STATIONS) {
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.5 })
    );
    entrance.position.set(st.x, 1.5, st.z);
    entrance.castShadow = true;
    stationGroup.add(entrance);
    // Sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffcc33, emissiveIntensity: 0.6 })
    );
    sign.position.set(st.x, 3.8, st.z);
    stationGroup.add(sign);
  }
  scene.add(stationGroup);

  // ---- Subway: bored tunnel, platforms, and the Line One train ----
  // The line runs as a loop through the 3 stations below street level.
  const subway = createSubway(SUBWAY_STATIONS);
  const TUNNEL_Y = SUBWAY_CFG.tunnelY; // tunnel floor
  const _sv = {}; // scratch for subwayPos

  function makeStationSign(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#111827'; x.fillRect(0, 0, 512, 96);
    x.fillStyle = '#ffcc33';
    x.font = '700 44px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text.toUpperCase(), 256, 50);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    return m;
  }

  // Tunnel segments (hollow boxes viewed from inside) + light strips
  const tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1f26, roughness: 0.95, side: THREE.BackSide,
  });
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cc, emissive: 0xffdf9e, emissiveIntensity: 1.2,
  });
  for (let i = 0; i < SUBWAY_STATIONS.length; i++) {
    const a = SUBWAY_STATIONS[i];
    const b = SUBWAY_STATIONS[(i + 1) % SUBWAY_STATIONS.length];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(14, 10, len), tunnelMat);
    tube.position.set(mx, TUNNEL_Y + 5, mz);
    tube.rotation.y = heading;
    scene.add(tube);
    // Light strips along the top edges
    for (const side of [-5.5, 5.5]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, len), stripMat);
      strip.position.set(mx, TUNNEL_Y + 9, mz);
      strip.rotation.y = heading;
      // offset perpendicular to the tunnel direction
      strip.position.x += Math.cos(heading) * side;
      strip.position.z += -Math.sin(heading) * side;
      scene.add(strip);
    }
  }

  // Platforms: a room under each station with slab, edge line, sign, stairs
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x232a33, roughness: 0.95, side: THREE.BackSide,
  });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xffcc33, emissive: 0xffcc33, emissiveIntensity: 0.9,
  });
  const stairsMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.0,
  });
  const PLAT = { w: 46, d: 22 }; // platform bounds (x, z half-extents: 23, 11)
  for (const st of SUBWAY_STATIONS) {
    const room = new THREE.Mesh(new THREE.BoxGeometry(50, 12, 26), platformMat);
    room.position.set(st.x, TUNNEL_Y + 6, st.z);
    scene.add(room);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PLAT.w, 1, PLAT.d), slabMat);
    slab.position.set(st.x, TUNNEL_Y - 0.5, st.z);
    slab.receiveShadow = true;
    scene.add(slab);
    // Yellow safety edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(PLAT.w, 0.12, 0.8), edgeMat);
    edge.position.set(st.x, TUNNEL_Y + 0.06, st.z - 4);
    scene.add(edge);
    // Station name sign
    const sign = makeStationSign(st.name);
    sign.position.set(st.x, TUNNEL_Y + 7, st.z - 12.6);
    scene.add(sign);
    // Stairs marker (exit to street)
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(2.5, 6, 2.5), stairsMat);
    stairs.position.set(st.x + 18, TUNNEL_Y + 3, st.z - 6);
    scene.add(stairs);
    st._stairs = { x: st.x + 18, z: st.z - 6 };
  }

  // The train: 3 cars with sliding doors, warm interior light
  const trainGroup = new THREE.Group();
  const carBodyMat = new THREE.MeshStandardMaterial({
    color: 0xb8c0cc, roughness: 0.35, metalness: 0.7,
  });
  const carWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b8, emissive: 0xffd98a, emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8a94a0, roughness: 0.4, metalness: 0.6,
  });
  const trainDoors = []; // { mesh, baseZ, side }
  const CAR_LEN = 12, CAR_GAP = 1.5;
  for (let ci = 0; ci < 3; ci++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, CAR_LEN), carBodyMat);
    body.position.y = 1.8;
    car.add(body);
    // Window band
    const windows = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, CAR_LEN - 1), carWindowMat);
    windows.position.y = 2.4;
    car.add(windows);
    // Sliding doors: 2 per side, they part along the car's length
    for (const side of [-1, 1]) {
      for (const dz of [-2.5, 2.5]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 2.2), doorMat);
        door.position.set(side * 1.72, 1.7, dz);
        car.add(door);
        trainDoors.push({ mesh: door, baseZ: dz, dir: dz > 0 ? 1 : -1 });
      }
    }
    car.position.z = -(ci * (CAR_LEN + CAR_GAP) + CAR_LEN / 2);
    trainGroup.add(car);
  }
  // Headlight
  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
  );
  headlight.position.set(0, 1.5, 0.5);
  trainGroup.add(headlight);
  const trainLight = new THREE.PointLight(0xffe0b0, 60, 50, 1.6);
  trainLight.position.set(0, 4, -6);
  trainGroup.add(trainLight);
  trainGroup.position.y = TUNNEL_Y;
  scene.add(trainGroup);

  // Player
  const spawn = findClearSpot(0, 50, cityData.colliders, 2);
  const player = createPlayer(spawn.x, spawn.z);
  player.subway = null; // null | { mode: 'platform', station } | { mode: 'riding' }
  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6 })
  );
  playerMesh.castShadow = true;
  scene.add(playerMesh);

  // Wave 1 (characters everywhere): the walker IS your character —
  // the shared adapter (lib/gta/walker-embodiment.js) embodies the
  // resolved pick at the capsule's footprint; the capsule above
  // stays as the native fallback until the model is ready, and
  // forever if the load fails.
  const walker = createWalkerEmbodiment({
    scene, surface: 'mega-city', procSize: capsuleProcSize(0.5, 1.0),
  });

  // Vehicles (parked around the city)
  const vehicles = [];
  const vehicleMeshes = new Map();
  const rand = mulberry32(42);
  const vTypes = Object.keys(VEHICLE_TYPES);
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 400;
    const z = (rand() - 0.5) * 400;
    const spot = findClearSpot(x, z, cityData.colliders, 3);
    const type = vTypes[Math.floor(rand() * vTypes.length)];
    const v = createVehicle(type, spot.x, spot.z, rand() * Math.PI * 2);
    vehicles.push(v);

    // Simple car mesh: body + cabin
    const carGroup = new THREE.Group();
    const bodyColor = [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x6b7280][i % 5];
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
  for (let i = 0; i < 3; i++) {
    const cop = { x: 100 + i * 50, z: 100, heading: 0, speed: 0, vx: 0, vz: 0, radius: 1.6 };
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
  const missions = MEGA_CITY_MISSIONS.map(m => createMission(m.id, m));
  let activeMission = null;
  const bustTimer = { t: 0 };
  let money = 0;
  let lastSubwayPrompt = null;

  // Input
  const input = createInput();
  input.attach();

  // Camera
  let camYaw = 0, camPitch = 0.35, camDist = 8;

  // Day/night
  let timeOfDay = 0.5; // 0..1, 0.5 = noon

  function updateTimeOfDay(dt) {
    // Slow cycle: full day = 10 minutes
    timeOfDay = (timeOfDay + dt / 600) % 1;
    const sunAngle = timeOfDay * Math.PI * 2;
    sun.position.set(
      Math.cos(sunAngle) * 200,
      Math.sin(sunAngle) * 150 + 50,
      100
    );
    const dayness = Math.max(0, Math.sin(sunAngle));
    sun.intensity = 0.2 + dayness * 1.0;
    const skyColor = new THREE.Color().lerpColors(
      new THREE.Color(0x0a0a20), // night
      new THREE.Color(0x87ceeb), // day
      dayness
    );
    scene.background = skyColor;
    scene.fog.color = skyColor;
  }

  let lastT = performance.now();
  let raf = 0;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const inp = input.update();
    updateTimeOfDay(dt);

    // ---- Subway: the Line One train always runs its loop ----
    updateSubway(subway, dt);
    subwayPos(subway, _sv);
    trainGroup.position.set(_sv.x, TUNNEL_Y, _sv.z);
    trainGroup.rotation.y = _sv.heading;
    for (const d of trainDoors) {
      d.mesh.position.z = d.baseZ + d.dir * subway.door * 1.05;
    }
    const subStatus = subwayStatus(subway);
    let sw = player.subway;

    // E: subway first, then vehicles (edge trigger)
    if (inp.action) {
      if (sw && sw.mode === 'riding') {
        if (subway.mode === 'dwell') {
          const si = subway.station;
          const st = SUBWAY_STATIONS[si];
          player.subway = { mode: 'platform', station: si };
          player.x = st.x; player.z = st.z + 6; player.y = TUNNEL_Y;
          onEvent({ type: 'subway_platform', station: st.name });
        } else {
          onEvent({ type: 'subway_prompt', text: 'Wait for the next stop to exit.' });
        }
      } else if (sw && sw.mode === 'platform') {
        const st = SUBWAY_STATIONS[sw.station];
        const dStairs = Math.hypot(player.x - st._stairs.x, player.z - st._stairs.z);
        if (dStairs < 4) {
          player.subway = null;
          player.x = st.x + 8; player.z = st.z + 8; player.y = 0;
          onEvent({ type: 'subway_surface', station: st.name });
        } else if (subway.mode === 'dwell' && subway.station === sw.station) {
          const dTrain = Math.hypot(player.x - _sv.x, player.z - _sv.z);
          if (dTrain < 14) {
            player.subway = { mode: 'riding' };
            onEvent({ type: 'subway_board', station: st.name });
          }
        }
      } else if (player.inVehicle) {
        exitVehicle(player);
        onEvent({ type: 'exit_vehicle' });
      } else {
        const near = nearestStationEntrance(player.x, player.z, SUBWAY_STATIONS);
        if (near.dist < 9) {
          player.subway = { mode: 'platform', station: near.index };
          player.x = near.station.x; player.z = near.station.z + 6; player.y = TUNNEL_Y;
          onEvent({ type: 'subway_enter', station: near.station.name });
        } else {
          const v = nearestVehicle(player.x, player.z, vehicles);
          if (v) {
            enterVehicle(player, v);
            commitCrime(wanted, 'stealCar', now / 1000);
            onEvent({ type: 'enter_vehicle', wanted: wanted.stars });
          }
        }
      }
      inp.action = false;
      input.keys['KeyE'] = false;
    }
    // Re-read: the E handler above may have changed subway state.
    sw = player.subway;
    const underground = !!(sw && (sw.mode === 'platform' || sw.mode === 'riding'));

    if (sw && sw.mode === 'riding') {
      // Ride the train: stick to the lead car
      player.x = _sv.x; player.z = _sv.z; player.y = TUNNEL_Y;
    } else if (sw && sw.mode === 'platform') {
      // Walk the platform (bounded room, no street colliders down here)
      updatePlayer(player, inp, camYaw, [], dt);
      const st = SUBWAY_STATIONS[sw.station];
      player.x = Math.max(st.x - 22, Math.min(st.x + 22, player.x));
      player.z = Math.max(st.z - 10, Math.min(st.z + 10, player.z));
      player.y = TUNNEL_Y;
    } else if (player.inVehicle) {
      const v = player.inVehicle;
      const res = updateVehicle(v, inp, cityData.colliders, dt);
      player.x = v.x; player.z = v.z;
      if (res.crashed && res.impact > 15) {
        commitCrime(wanted, 'recklessDriving', now / 1000);
      }
      // Update car mesh
      const mesh = vehicleMeshes.get(v);
      if (mesh) {
        mesh.position.set(v.x, 0, v.z);
        mesh.rotation.y = v.heading;
      }
    } else {
      updatePlayer(player, inp, camYaw, cityData.colliders, dt);
    }

    // Player mesh (hidden while riding the train; hidden whenever
    // the embodied character is standing in for it)
    const ridingTrain = !!(sw && sw.mode === 'riding');
    const embShowing = walker.update(player, dt, now / 1000, { hidden: ridingTrain });
    playerMesh.visible = !ridingTrain && !embShowing;
    playerMesh.position.set(player.x, player.y + 1.0, player.z);
    playerMesh.rotation.y = player.heading;

    // Camera follow
    if (sw && sw.mode === 'riding') {
      // In-train view: glide through the bored tunnel with the train
      const fx = Math.sin(_sv.heading), fz = Math.cos(_sv.heading);
      camera.position.lerp(
        new THREE.Vector3(_sv.x - fx * 2, TUNNEL_Y + 3.4, _sv.z - fz * 2), 0.2);
      camera.lookAt(_sv.x + fx * 18, TUNNEL_Y + 2, _sv.z + fz * 18);
    } else {
      const targetX = player.x, targetZ = player.z;
      const baseY = (sw && sw.mode === 'platform') ? TUNNEL_Y : 0;
      const px = targetX - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
      const pz = targetZ - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
      const py = baseY + 2 + Math.sin(camPitch) * camDist;
      camera.position.lerp(new THREE.Vector3(px, py, pz), 0.15);
      camera.lookAt(targetX, baseY + 1.5, targetZ);
    }

    // Subway proximity prompts (only emit on change)
    let prompt = null;
    if (!sw && !player.inVehicle) {
      const near = nearestStationEntrance(player.x, player.z, SUBWAY_STATIONS);
      if (near.dist < 9) prompt = `Press E — enter ${near.station.name} station`;
    } else if (sw && sw.mode === 'platform') {
      const st = SUBWAY_STATIONS[sw.station];
      const dStairs = Math.hypot(player.x - st._stairs.x, player.z - st._stairs.z);
      if (dStairs < 4) {
        prompt = 'Press E — back to the street';
      } else if (subway.mode === 'dwell' && subway.station === sw.station) {
        prompt = 'Train here — Press E to board';
      } else {
        prompt = `Waiting for the train at ${st.name}…`;
      }
    } else if (sw && sw.mode === 'riding') {
      if (subway.mode === 'dwell' && subStatus.atStation) {
        prompt = `Doors open — ${subStatus.atStation.name}. Press E to exit.`;
      }
    }
    if (prompt !== lastSubwayPrompt) {
      lastSubwayPrompt = prompt;
      onEvent({ type: 'subway_prompt', text: prompt });
    }
    // Riding overlay data (every frame while riding)
    if (sw && sw.mode === 'riding') {
      onEvent({
        type: 'subway_ride',
        nextStop: subStatus.nextStop ? subStatus.nextStop.name : '',
        atStation: subStatus.atStation ? subStatus.atStation.name : '',
        mode: subStatus.mode,
        door: subStatus.door,
      });
    }

    // Wanted + cops (the law can't see you underground)
    const seen = !underground && cops.some(c => {
      const dx = player.x - c.x, dz = player.z - c.z;
      return Math.sqrt(dx * dx + dz * dz) < 80;
    });
    updateWanted(wanted, dt, now / 1000, seen && wanted.stars > 0);

    cops.forEach((cop, i) => {
      const mesh = copMeshes.get(cop);
      const active = wanted.stars > 0 && i < Math.min(3, wanted.stars);
      mesh.visible = active;
      if (active) {
        // Spawn near player if far
        const dx = player.x - cop.x, dz = player.z - cop.z;
        if (Math.sqrt(dx * dx + dz * dz) > 200) {
          cop.x = player.x + (Math.random() - 0.5) * 120;
          cop.z = player.z + (Math.random() - 0.5) * 120;
        }
        updateCop(cop, player.x, player.z, wanted.stars, cityData.colliders, dt);
        mesh.position.set(cop.x, 0, cop.z);
        mesh.rotation.y = cop.heading;
      }
    });

    // Busted?
    const pSpeed = player.inVehicle ? Math.abs(player.inVehicle.speed) : Math.sqrt(player.vx ** 2 + player.vz ** 2);
    if (checkBusted(cops.filter((_, i) => i < wanted.stars), player.x, player.z, pSpeed, dt, bustTimer)) {
      // Respawn at station, clear wanted
      const st = SUBWAY_STATIONS[1];
      player.x = st.x + 10; player.z = st.z + 10;
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

    // HUD sync via event
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
      subway: sw ? sw.mode : null,
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
      walker.dispose();
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
    setWalkerCharacter(id) { walker.setCharacter(id); },
    getWalkerCharacter() { return walker.characterId(); },
    input,
  };
}
