// scene.js — Ice Dragon three.js scene.
// Port of highland88999-commits/Ice-Dragon ("Nexus Vortex – The Glacial Dragon").
// Changes from the original:
//  - Telemetry removed (no network requests of any kind).
//  - All remote assets replaced with procedural canvas textures (painters.js):
//    the landing jpeg, the floor .mov video texture, and the dragon skin .png
//    are gone — the scene is fully self-contained.
//  - The original had NO bloom pass (its template cousins did); we keep it
//    that way. Glow is restrained emissive + point lights only, per the
//    lighting rule — ice and crystal geometry stays readable.
//  - Interactivity added: the dragon rests on a glacier peak; touch-and-hold
//    wakes it (wakefulness 0..1: breath intensifies, wings unfold, ice cracks
//    around it); at full wakefulness it takes a flight loop around the glacier.
//  - Pixel ratio capped at 1.5 for battery life.
//  - Exposes an API for the React page: beginZoom, hitDragon, setWakefulness,
//    setFlying, setFlightProgress, setAltitude, dispose.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { paintArcticSky, paintIce, paintScales, paintFrost } from './painters.js';

// Terrain math — shared with the original: rolling glacial hills.
export function getTerrainY(x, z) {
  return Math.sin(x * 0.0015) * Math.cos(z * 0.0015) * 800.0;
}

const WAKE_FLIGHT_RADIUS = 2400;

function canvasTexture(painter, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  painter(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createIceDragonScene(canvas, options = {}) {
  const { reducedMotion = false, onZoomComplete = () => {} } = options;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x01050a, 0.0003);

  const camera = new THREE.PerspectiveCamera(60, 1, 1, 15000);
  camera.position.set(0, 1500, 3500);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'ICE DRAGON' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 200, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 5000;

  // ── Procedural textures (zero network) ───────────────────────────────
  const skyTex = canvasTexture(paintArcticSky, 1024, 512);
  const iceTex = canvasTexture(paintIce, 512, 512);
  const scalesTex = canvasTexture(paintScales, 512, 512);
  const frostTex = canvasTexture(paintFrost, 512, 512);
  iceTex.wrapS = iceTex.wrapT = THREE.RepeatWrapping;
  iceTex.repeat.set(10, 10);
  scalesTex.wrapS = scalesTex.wrapT = THREE.RepeatWrapping;

  // ── Environment ──────────────────────────────────────────────────────
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), skyMat));

  const floorGeo = new THREE.PlaneGeometry(16000, 16000, 128, 128);
  {
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, getTerrainY(x, y));
    }
    floorGeo.computeVertexNormals();
  }
  const floorMat = new THREE.MeshStandardMaterial({
    map: iceTex,
    roughness: 0.32,
    metalness: 0.12,
    emissive: 0x1a4a66,
    emissiveIntensity: 0.25,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ── The Glacial Dragon ───────────────────────────────────────────────
  const dragonMaster = new THREE.Group();
  scene.add(dragonMaster);

  const dragonMat = new THREE.MeshStandardMaterial({
    map: scalesTex,
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    map: frostTex,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
  });

  function createPart(geo, mat, x, y, z) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // Torso
  const torsoGeo = new THREE.CylinderGeometry(40, 50, 240, 8);
  torsoGeo.rotateX(Math.PI / 2);
  const torso = createPart(torsoGeo, dragonMat, 0, 180, 0);
  dragonMaster.add(torso);

  // Neck & head
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 20, 100);
  torso.add(neckGroup);
  const neckGeo = new THREE.CylinderGeometry(20, 30, 100, 8);
  neckGeo.rotateX(Math.PI / 4);
  neckGroup.add(createPart(neckGeo, dragonMat, 0, 30, 30));
  const headGeo = new THREE.BoxGeometry(40, 35, 90);
  const head = createPart(headGeo, dragonMat, 0, 70, 70);
  neckGroup.add(head);

  // Horns on the head (crystal spikes).
  const hornGeo = new THREE.ConeGeometry(7, 42, 6);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.25, metalness: 0.1 });
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(sx * 14, 92, 48);
    horn.rotation.z = sx * -0.35;
    horn.rotation.x = -0.3;
    head.add(horn);
  }

  // Webbed wings (original's scalloped extrude shape).
  const extrudeSettings = { depth: 8, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 3 };
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(150, 200, 400, 250);
  wingShape.quadraticCurveTo(380, 180, 500, 100);
  wingShape.quadraticCurveTo(380, 50, 480, -50);
  wingShape.quadraticCurveTo(300, -80, 400, -200);
  wingShape.quadraticCurveTo(200, -100, 250, -350);
  wingShape.quadraticCurveTo(100, -150, 0, -180);
  wingShape.lineTo(0, 0);
  const webbedWingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);

  const wingL = new THREE.Group();
  wingL.position.set(30, 40, 40);
  wingL.add(new THREE.Mesh(webbedWingGeo, wingMat));
  torso.add(wingL);
  const wingR = new THREE.Group();
  wingR.position.set(-30, 40, 40);
  const wingMeshR = new THREE.Mesh(webbedWingGeo, wingMat);
  wingMeshR.scale.set(-1, 1, 1);
  wingR.add(wingMeshR);
  torso.add(wingR);

  // Segmented tail.
  const tailSegments = [];
  let currentParent = torso;
  for (let i = 0; i < 8; i++) {
    const radius = 35 - i * 4;
    const len = 50;
    const segGeo = new THREE.CylinderGeometry(radius, radius * 0.8, len, 12);
    segGeo.rotateX(Math.PI / 2);
    segGeo.translate(0, 0, -len / 2);
    const segMesh = new THREE.Mesh(segGeo, dragonMat);
    segMesh.position.set(0, i === 0 ? -10 : 0, i === 0 ? -100 : -50);
    currentParent.add(segMesh);
    tailSegments.push(segMesh);
    currentParent = segMesh;
  }

  // Legs.
  function createLeg(x, z) {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, -20, z);
    const thighGeo = new THREE.CylinderGeometry(20, 15, 100, 8);
    thighGeo.translate(0, -50, 0);
    legGroup.add(new THREE.Mesh(thighGeo, dragonMat));
    return legGroup;
  }
  const legFL = createLeg(45, 80);
  const legFR = createLeg(-45, 80);
  const legBL = createLeg(45, -80);
  const legBR = createLeg(-45, -80);
  torso.add(legFL, legFR, legBL, legBR);

  // The dragon rests on a nearby glacier peak ("home").
  const HOME = new THREE.Vector3(600, 0, 400);
  HOME.y = getTerrainY(HOME.x, HOME.z);

  // ── Lightning (restrained) ───────────────────────────────────────────
  const lightningGroup = new THREE.Group();
  dragonMaster.add(lightningGroup);
  const lightningBolts = [];
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(9 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.8 })
    );
    line.visible = false;
    lightningGroup.add(line);
    lightningBolts.push({ line, positions: pos });
  }
  const lightningFlash = new THREE.PointLight(0xcfeaff, 0, 2000);
  lightningFlash.position.set(0, 100, 0);
  dragonMaster.add(lightningFlash);

  // ── Ice breath particles ─────────────────────────────────────────────
  const breathCount = 1200;
  const breathGeo = new THREE.BufferGeometry();
  const breathPos = new Float32Array(breathCount * 3);
  const breathVel = [];
  for (let i = 0; i < breathCount; i++) {
    breathPos[i * 3] = (Math.random() - 0.5) * 15;
    breathPos[i * 3 + 1] = (Math.random() - 0.5) * 15;
    breathPos[i * 3 + 2] = Math.random() * 40;
    breathVel.push({
      z: 20 + Math.random() * 30,
      x: (Math.random() - 0.5) * 8,
      y: (Math.random() - 0.5) * 8,
    });
  }
  breathGeo.setAttribute('position', new THREE.BufferAttribute(breathPos, 3));
  const breathMat = new THREE.PointsMaterial({
    color: 0xccffff,
    size: 20,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const breathSystem = new THREE.Points(breathGeo, breathMat);
  breathSystem.position.set(0, 0, 45);
  breathSystem.frustumCulled = false;
  head.add(breathSystem);

  // ── Ice trail: crystals spawned where the dragon passes ──────────────
  const iceCount = 800;
  const iceGeo = new THREE.ConeGeometry(30, 140, 5);
  iceGeo.translate(0, 70, 0);
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x9fdcff,
    roughness: 0.2,
    metalness: 0.05,
    emissive: 0x2a7ba8,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.9,
  });
  const iceTrailMesh = new THREE.InstancedMesh(iceGeo, iceMat, iceCount);
  let iceIndex = 0;
  const dummy = new THREE.Object3D();
  dummy.position.set(0, -5000, 0);
  dummy.updateMatrix();
  for (let i = 0; i < iceCount; i++) iceTrailMesh.setMatrixAt(i, dummy.matrix);
  iceTrailMesh.instanceMatrix.needsUpdate = true;
  iceTrailMesh.frustumCulled = false;
  scene.add(iceTrailMesh);

  // ── Wake shatter: ice chunks burst when the dragon stirs ──────────────
  const SHARD_COUNT = 120;
  const shardGeo = new THREE.BufferGeometry();
  const shardPos = new Float32Array(SHARD_COUNT * 3);
  const shardVel = new Float32Array(SHARD_COUNT * 3);
  shardGeo.setAttribute('position', new THREE.BufferAttribute(shardPos, 3));
  const shardMat = new THREE.PointsMaterial({
    color: 0xdff4ff, size: 26, transparent: true, opacity: 0, sizeAttenuation: true,
  });
  const shards = new THREE.Points(shardGeo, shardMat);
  shards.frustumCulled = false;
  scene.add(shards);
  let shardLife = -1; // -1 = idle
  let lastShardMilestone = -1;

  function burstShards() {
    const c = dragonMaster.position;
    for (let i = 0; i < SHARD_COUNT; i++) {
      shardPos[i * 3] = c.x + (Math.random() - 0.5) * 300;
      shardPos[i * 3 + 1] = c.y + Math.random() * 120;
      shardPos[i * 3 + 2] = c.z + (Math.random() - 0.5) * 300;
      shardVel[i * 3] = (Math.random() - 0.5) * 500;
      shardVel[i * 3 + 1] = Math.random() * 500 + 150;
      shardVel[i * 3 + 2] = (Math.random() - 0.5) * 500;
    }
    shardGeo.attributes.position.needsUpdate = true;
    shardLife = 0;
    shardMat.opacity = 0.95;
  }

  // ── Lighting (restrained: no bloom pass, readable ice) ───────────────
  scene.add(new THREE.AmbientLight(0x0a1626, 1.5));
  const moonLight = new THREE.DirectionalLight(0xbfd9ff, 2.2);
  moonLight.position.set(-2000, 3000, 1500);
  scene.add(moonLight);
  const dragonGlow = new THREE.PointLight(0x00d5ff, 1500, 2200);
  dragonMaster.add(dragonGlow);
  const mawGlow = new THREE.PointLight(0xeaffff, 800, 600);
  mawGlow.position.set(0, 0, 40);
  head.add(mawGlow);

  // ── Interaction state ────────────────────────────────────────────────
  let wakefulness = 0; // 0 asleep .. 1 fully awake
  let flying = false;
  let flightProgress = 0; // 0..1
  let targetAltitude = 800;
  let engineState = 'ORBITING';
  let orbitAngle = 0.6;
  const insideCameraPos = new THREE.Vector3(0, 0.001, 1200);
  const centerTarget = new THREE.Vector3(HOME.x, HOME.y + 200, HOME.z);
  const clock = new THREE.Clock();
  let elapsed = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let rafId = 0;
  let disposed = false;

  function castAt(clientX, clientY, objects) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, true).length > 0;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  // Dragon placement helpers.
  const flightFrom = new THREE.Vector3();
  const flightLook = new THREE.Vector3();
  function updateDragon(dt, t) {
    if (flying) {
      // Flight loop: 1.5 turns around the glacier, banking into the turns.
      const a = flightProgress * Math.PI * 2 * 1.5;
      const px = Math.sin(a) * WAKE_FLIGHT_RADIUS;
      const pz = Math.cos(a) * WAKE_FLIGHT_RADIUS;
      const groundY = getTerrainY(px, pz);
      const easeInOut = flightProgress < 0.08
        ? flightProgress / 0.08
        : flightProgress > 0.92 ? (1 - flightProgress) / 0.08 : 1;
      const py = THREE.MathUtils.lerp(HOME.y + 250, groundY + targetAltitude + 600, Math.min(1, easeInOut));
      dragonMaster.position.set(px, py, pz);
      const a2 = (flightProgress + 0.02) * Math.PI * 2 * 1.5;
      flightLook.set(Math.sin(a2) * WAKE_FLIGHT_RADIUS, py, Math.cos(a2) * WAKE_FLIGHT_RADIUS);
      dragonMaster.lookAt(flightLook);
      dragonMaster.rotation.z += 0.35; // bank into the turn
      return 1.0; // full flap energy
    }
    // Resting / waking: perched on the glacier peak, stirring more as it wakes.
    const bob = reducedMotion ? 0 : Math.sin(t * 1.2) * 12;
    dragonMaster.position.set(HOME.x, HOME.y + 250 + bob, HOME.z);
    dragonMaster.rotation.set(0, reducedMotion ? 0.5 : t * 0.05, 0);
    dragonMaster.lookAt(centerTarget);
    return wakefulness; // flap energy follows wakefulness
  }

  function loop() {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = reducedMotion ? 0 : Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    const t = reducedMotion ? 0 : elapsed;

    // Wake milestones: ice cracks burst at 25/50/75/100%.
    const milestone = Math.floor(wakefulness * 4);
    if (milestone > lastShardMilestone && wakefulness > 0 && !reducedMotion) {
      lastShardMilestone = milestone;
      burstShards();
    }
    if (wakefulness === 0) lastShardMilestone = -1;

    // Dragon placement + animation energy.
    const energy = updateDragon(dt, t);
    const flapAmp = 0.15 + energy * 0.55; // folded-ish when asleep, wide when awake
    const flapSpeed = reducedMotion ? 0 : t * (4 + energy * 4);

    torso.rotation.x = reducedMotion ? 0 : Math.sin(t * 2) * (0.05 + energy * 0.08);
    if (!reducedMotion) {
      wingL.rotation.z = Math.sin(flapSpeed) * flapAmp + 0.15 + energy * 0.25;
      wingR.rotation.z = -(Math.sin(flapSpeed) * flapAmp + 0.15 + energy * 0.25);
    }
    tailSegments.forEach((seg, i) => {
      if (reducedMotion) return;
      seg.rotation.y = Math.sin(t * 5 - i * 0.6) * (0.1 + energy * 0.25);
      seg.rotation.x = Math.sin(t * 4 - i * 0.5) * 0.1;
    });
    neckGroup.rotation.y = reducedMotion ? 0 : Math.sin(t * 2) * (0.1 + energy * 0.25);
    head.rotation.x = reducedMotion ? 0 : Math.sin(t * 5) * 0.1;

    // Legs paddle gently only while flying.
    const legAmp = flying && !reducedMotion ? 0.6 : 0.05;
    const runCycle = t * 10.0;
    legFL.rotation.x = Math.sin(runCycle) * legAmp;
    legBR.rotation.x = Math.sin(runCycle) * legAmp;
    legFR.rotation.x = Math.sin(runCycle + Math.PI) * legAmp;
    legBL.rotation.x = Math.sin(runCycle + Math.PI) * legAmp;

    // Breath: faint wisps asleep, a bright plume awake.
    breathMat.opacity = reducedMotion ? 0 : 0.2 + energy * 0.7;
    if (!reducedMotion) {
      const bArray = breathSystem.geometry.attributes.position.array;
      const spread = 1 + energy * 1.5;
      for (let i = 0; i < breathCount; i++) {
        bArray[i * 3] += breathVel[i].x * spread;
        bArray[i * 3 + 1] += breathVel[i].y * spread;
        bArray[i * 3 + 2] += breathVel[i].z * spread;
        if (bArray[i * 3 + 2] > 1200) {
          bArray[i * 3] = (Math.random() - 0.5) * 15;
          bArray[i * 3 + 1] = (Math.random() - 0.5) * 15;
          bArray[i * 3 + 2] = 0;
          breathVel[i].x = (Math.random() - 0.5) * 8;
          breathVel[i].y = (Math.random() - 0.5) * 8;
        }
      }
      breathSystem.geometry.attributes.position.needsUpdate = true;
    }

    // Lightning: rare and restrained (peak 1500, fast decay).
    if (!reducedMotion && Math.random() > 0.93) {
      lightningBolts.forEach((bolt) => {
        if (Math.random() > 0.5) {
          const start = new THREE.Vector3(
            (Math.random() - 0.5) * 800, 400 + Math.random() * 400, (Math.random() - 0.5) * 800
          );
          const step = new THREE.Vector3(0, -90, 0);
          const curr = start.clone();
          for (let i = 0; i <= 8; i++) {
            bolt.positions[i * 3] = curr.x + (Math.random() - 0.5) * 90;
            bolt.positions[i * 3 + 1] = curr.y;
            bolt.positions[i * 3 + 2] = curr.z + (Math.random() - 0.5) * 90;
            curr.add(step);
          }
          bolt.line.geometry.attributes.position.needsUpdate = true;
          bolt.line.position.copy(dragonMaster.position);
          bolt.line.visible = true;
        } else {
          bolt.line.visible = false;
        }
      });
      lightningFlash.intensity = 1200 + Math.random() * 600;
    } else {
      lightningBolts.forEach((bolt) => { bolt.line.visible = false; });
      lightningFlash.intensity = THREE.MathUtils.lerp(lightningFlash.intensity, 0, reducedMotion ? 1 : 0.25);
    }

    // Ice trail: crystals bloom where the dragon passes while flying.
    if (!reducedMotion && flying && Math.random() > 0.3) {
      dummy.position.copy(dragonMaster.position);
      dummy.position.x += (Math.random() - 0.5) * 500;
      dummy.position.z += (Math.random() - 0.5) * 500;
      dummy.position.y = getTerrainY(dummy.position.x, dummy.position.z);
      dummy.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
      dummy.scale.setScalar(Math.random() * 2.0 + 0.5);
      dummy.updateMatrix();
      iceTrailMesh.setMatrixAt(iceIndex, dummy.matrix);
      iceTrailMesh.instanceMatrix.needsUpdate = true;
      iceIndex = (iceIndex + 1) % iceCount;
    }

    // Wake shatter physics.
    if (shardLife >= 0 && !reducedMotion) {
      shardLife += dt;
      for (let i = 0; i < SHARD_COUNT; i++) {
        shardVel[i * 3 + 1] -= 900 * dt;
        shardPos[i * 3] += shardVel[i * 3] * dt;
        shardPos[i * 3 + 1] += shardVel[i * 3 + 1] * dt;
        shardPos[i * 3 + 2] += shardVel[i * 3 + 2] * dt;
      }
      shardGeo.attributes.position.needsUpdate = true;
      shardMat.opacity = Math.max(0, 0.95 * (1 - shardLife / 1.4));
      if (shardLife > 1.4) shardLife = -1;
    }

    // Camera engine.
    if (engineState === 'ORBITING') {
      if (reducedMotion) {
        camera.position.set(HOME.x + 1800, HOME.y + 900, HOME.z + 2400);
        camera.lookAt(centerTarget);
      } else {
        orbitAngle += 0.0015;
        camera.position.set(
          HOME.x + Math.sin(orbitAngle) * 4500,
          HOME.y + 1200 + Math.sin(t * 0.5) * 400,
          HOME.z + Math.cos(orbitAngle) * 4500
        );
        camera.lookAt(centerTarget);
      }
    } else if (engineState === 'ZOOMING') {
      if (reducedMotion) {
        camera.position.copy(insideCameraPos);
        camera.lookAt(centerTarget);
        engineState = 'INSIDE';
        controls.enabled = true;
        controls.target.copy(centerTarget);
        onZoomComplete();
      } else {
        camera.position.lerp(insideCameraPos, 0.025);
        centerTarget.lerp(new THREE.Vector3(dragonMaster.position.x, dragonMaster.position.y, dragonMaster.position.z), 0.05);
        camera.lookAt(centerTarget);
        if (camera.position.distanceTo(insideCameraPos) < 10.0) {
          engineState = 'INSIDE';
          controls.enabled = true;
          controls.target.copy(centerTarget);
          onZoomComplete();
        }
      }
    } else if (engineState === 'INSIDE') {
      centerTarget.lerp(new THREE.Vector3(dragonMaster.position.x, dragonMaster.position.y, dragonMaster.position.z), 0.1);
      controls.target.copy(centerTarget);
      controls.update();
    }

    renderer.render(scene, camera);
  }
  loop();

  return {
    beginZoom() {
      if (engineState === 'ORBITING') engineState = 'ZOOMING';
    },
    hitDragon(clientX, clientY) {
      return castAt(clientX, clientY, [dragonMaster]);
    },
    setWakefulness(w) {
      wakefulness = Math.max(0, Math.min(1, w));
      // The dragon's inner glow brightens as it wakes.
      dragonGlow.intensity = 1500 + wakefulness * 1500;
      mawGlow.intensity = 800 + wakefulness * 1200;
    },
    setFlying(active) {
      flying = active;
      if (!active) {
        // Settle back onto the glacier peak.
        dragonMaster.rotation.z = 0;
      }
    },
    setFlightProgress(p) {
      flightProgress = Math.max(0, Math.min(1, p));
    },
    setAltitude(v) {
      targetAltitude = Math.max(50, Math.min(4000, v));
    },
    dispose() {
      contextGuard.dispose();
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            for (const key of Object.keys(m)) {
              const v = m[key];
              if (v && v.isTexture) v.dispose();
            }
            m.dispose();
          }
        }
      });
      renderer.dispose();
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}
