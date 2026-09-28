// scene.js — Guillotine three.js scene.
// Port of highland88999-commits/Guillotine ("Nexus Vortex – The Guillotine").
// Changes from the original:
//  - Telemetry removed (no network requests of any kind).
//  - All textures are procedural canvas paintings (painters.js) — the original
//    hotlinked remote video files, which is forbidden here.
//  - Bloom restrained per the lighting rule: strength 2.0 -> 0.75, threshold
//    0.1 -> 0.8, so only the blade's glow blooms and the frame stays readable.
//  - Taste: the original's automatic blade cycle is gone. The blade only
//    moves when the visitor works the winch, and it drops onto a fresh-cut
//    log — timber, nothing else. The scene is a craftsman's demonstration.
//  - Pixel ratio capped at 1.5 for battery life.
//  - Exposes an API for the React page: beginZoom, hitLever, hitBlade,
//    hitPart, setLift, setRaising, beginDrop, setDropProgress, triggerSplit,
//    resetLog, dispose.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { paintSky, paintEnergy, paintFloor, paintWood } from './painters.js';

// Plain-English labels for the examine mode.
export const PART_LABELS = {
  blade: { name: 'The blade', blurb: 'A heavy, angled blade. It slides between the uprights.' },
  lever: { name: 'The winch', blurb: 'Hold the winch wheel to wind the blade up.' },
  upright: { name: 'The uprights', blurb: 'Two tall guides that keep the blade falling straight.' },
  crossbar: { name: 'The crossbar', blurb: 'Locks the two uprights together at the top.' },
  collar: { name: 'The collar', blurb: 'A two-part block the blade comes to rest on.' },
  log: { name: 'The log', blurb: 'Fresh-cut timber. The blade splits wood here — nothing else.' },
  deck: { name: 'The deck', blurb: 'An oak platform that carries the whole machine.' },
};

const BLADE_DOWN_Y = 175;
const BLADE_TOP_Y = 530;
const LOG_Y = 121;

function canvasTexture(painter, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  painter(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGuillotineScene(canvas, options = {}) {
  const { reducedMotion = false, onZoomComplete = () => {}, onSplit = () => {} } = options;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0705, 0.001);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 8000);
  camera.position.set(0, 230, 1000);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // RESTRAINED bloom (lighting rule): strength 0.75, radius 0.45, threshold 0.8.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.8);
  composer.addPass(bloomPass);

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 300, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 1500;

  // ── Procedural textures (zero network) ──────────────────────────────
  const skyTex = canvasTexture(paintSky, 1024, 512);
  const energyTex = canvasTexture(paintEnergy, 128, 512);
  const floorTex = canvasTexture(paintFloor, 512, 512);
  const woodTex = canvasTexture(paintWood, 512, 512);
  energyTex.wrapS = energyTex.wrapT = THREE.MirroredRepeatWrapping;
  energyTex.repeat.set(1, 4);
  floorTex.wrapS = floorTex.wrapT = THREE.MirroredRepeatWrapping;
  floorTex.repeat.set(12, 12);
  woodTex.wrapS = woodTex.wrapT = THREE.MirroredRepeatWrapping;

  // ── Environment ──────────────────────────────────────────────────────
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(3500, 48, 24), skyMat));

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    emissive: 0xffffff,
    emissiveMap: floorTex,
    emissiveIntensity: 0.1,
    roughness: 0.35,
    metalness: 0.85,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ── The machine ──────────────────────────────────────────────────────
  const machine = new THREE.Group();
  const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.6, metalness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, metalness: 0.05 });

  // Platform + oak deck.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 250), obsidianMat);
  platform.position.set(0, 10, 0);
  machine.add(platform);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(420, 8, 270), woodMat);
  deck.position.set(0, 24, 0);
  machine.add(deck);

  // Uprights.
  const towerGeo = new THREE.BoxGeometry(40, 600, 40);
  const towerL = new THREE.Mesh(towerGeo, obsidianMat);
  towerL.position.set(-100, 320, 0);
  machine.add(towerL);
  const towerR = new THREE.Mesh(towerGeo, obsidianMat);
  towerR.position.set(100, 320, 0);
  machine.add(towerR);

  // Crossbar.
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(280, 50, 50), obsidianMat);
  crossbar.position.set(0, 620, 0);
  machine.add(crossbar);

  // Collar (two-part block the blade rests on).
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.8, metalness: 0.2 });
  const collarBottom = new THREE.Mesh(new THREE.BoxGeometry(160, 50, 60), collarMat);
  collarBottom.position.set(0, 70, 0);
  machine.add(collarBottom);
  const collarTop = new THREE.Mesh(new THREE.BoxGeometry(160, 40, 60), collarMat);
  collarTop.position.set(0, 140, 0);
  machine.add(collarTop);

  // ── Blade group ──────────────────────────────────────────────────────
  const bladeGroup = new THREE.Group();
  const weight = new THREE.Mesh(
    new THREE.BoxGeometry(156, 60, 20),
    new THREE.MeshStandardMaterial({ color: 0x111115, metalness: 0.8, roughness: 0.5 })
  );
  weight.position.set(0, 40, 0);
  bladeGroup.add(weight);

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-78, 10);
  bladeShape.lineTo(78, -50); // slanted cutting edge
  bladeShape.lineTo(78, 10);
  bladeShape.lineTo(-78, 10);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 4, bevelEnabled: true, bevelThickness: 1, bevelSize: 2, bevelSegments: 3,
  });
  bladeGeo.center();
  const bladeMat = new THREE.MeshStandardMaterial({
    map: energyTex,
    emissiveMap: energyTex,
    emissive: 0xff44cc,
    emissiveIntensity: 1.2, // restrained; bloom threshold keeps the glow local
    color: 0xff66dd,
    metalness: 1.0,
    roughness: 0.15,
  });
  const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
  bladeMesh.position.set(0, -10, 0);
  bladeGroup.add(bladeMesh);
  bladeGroup.position.set(0, BLADE_DOWN_Y, 0);
  machine.add(bladeGroup);

  // ── The log (timber for the demonstration) ───────────────────────────
  const logGroup = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(26, 26, 65, 24);
  logGeo.rotateZ(Math.PI / 2); // axis along X
  const halfL = new THREE.Mesh(logGeo, woodMat);
  halfL.position.set(-32.5, LOG_Y, 0);
  const halfR = new THREE.Mesh(logGeo, woodMat);
  halfR.position.set(32.5, LOG_Y, 0);
  // Bark ends: darker caps.
  const capMat = new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 0.9 });
  for (const half of [halfL, halfR]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(26, 24), capMat);
    cap.position.x = half === halfL ? -32.6 : 32.6;
    cap.rotation.y = half === halfL ? -Math.PI / 2 : Math.PI / 2;
    half.add(cap);
  }
  logGroup.add(halfL, halfR);
  machine.add(logGroup);

  // ── Winch wheel ──────────────────────────────────────────────────────
  const leverGroup = new THREE.Group();
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, metalness: 0.9, roughness: 0.4 });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(34, 7, 16, 40), wheelMat);
  wheel.rotation.y = Math.PI / 2;
  leverGroup.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(4, 62, 4), wheelMat);
    spoke.rotation.x = (i * Math.PI) / 3;
    leverGroup.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 30, 16), wheelMat);
  hub.rotation.z = Math.PI / 2;
  leverGroup.add(hub);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 26, 12), woodMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(14, 30, 0);
  leverGroup.add(grip);
  leverGroup.position.set(150, 540, 0);
  machine.add(leverGroup);

  scene.add(machine);

  // ── Sawdust burst (spawned on the split) ──────────────────────────────
  const SAW_COUNT = 90;
  const sawGeo = new THREE.BufferGeometry();
  const sawPos = new Float32Array(SAW_COUNT * 3);
  const sawVel = new Float32Array(SAW_COUNT * 3);
  sawGeo.setAttribute('position', new THREE.BufferAttribute(sawPos, 3));
  const sawMat = new THREE.PointsMaterial({
    color: 0xd8a85c, size: 7, transparent: true, opacity: 0, sizeAttenuation: true,
  });
  const sawdust = new THREE.Points(sawGeo, sawMat);
  sawdust.frustumCulled = false;
  scene.add(sawdust);
  let sawLife = -1; // -1 = idle

  function burstSawdust() {
    for (let i = 0; i < SAW_COUNT; i++) {
      sawPos[i * 3] = (Math.random() - 0.5) * 60;
      sawPos[i * 3 + 1] = LOG_Y + 20 + Math.random() * 20;
      sawPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      sawVel[i * 3] = (Math.random() - 0.5) * 260;
      sawVel[i * 3 + 1] = Math.random() * 320 + 60;
      sawVel[i * 3 + 2] = (Math.random() - 0.5) * 260;
    }
    sawGeo.attributes.position.needsUpdate = true;
    sawLife = 0;
    sawMat.opacity = 0.95;
  }

  // ── Lighting ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0a0a18, 1.5));
  const rimLightGold = new THREE.DirectionalLight(0xffd700, 2.5);
  rimLightGold.position.set(-300, 600, 300);
  scene.add(rimLightGold);
  const coreLightPink = new THREE.PointLight(0xff44cc, 400, 1200);
  coreLightPink.position.set(0, 300, 150);
  scene.add(coreLightPink);
  const coreLightCyan = new THREE.PointLight(0x00ffff, 400, 1200);
  coreLightCyan.position.set(0, 300, -150);
  scene.add(coreLightCyan);
  // Restrained impact flash (never a white-out).
  const impactLight = new THREE.PointLight(0xffffff, 0, 1500);
  impactLight.position.set(0, 160, 50);
  scene.add(impactLight);
  const bladeGlow = new THREE.PointLight(0xff44cc, 300, 600);
  bladeGlow.position.set(0, 100, 0);
  bladeGroup.add(bladeGlow);

  // ── Interaction state ────────────────────────────────────────────────
  let raising = false;
  let lift = 0;
  let dropping = false;
  let splitT = -1; // -1 = whole log, 0..1 = splitting animation
  let splitDone = false;
  let engineState = 'ORBITING';
  let orbitAngle = 0.6;
  const insideCameraPos = new THREE.Vector3(0, 0.001, 330);
  const centerTarget = new THREE.Vector3(0, 300, 0);
  const clock = new THREE.Clock();
  let elapsed = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let rafId = 0;
  let disposed = false;

  // Part hit-testing registry (priority order matters).
  const partTargets = [
    { id: 'lever', objects: [leverGroup] },
    { id: 'blade', objects: [bladeGroup] },
    { id: 'log', objects: [logGroup] },
    { id: 'collar', objects: [collarBottom, collarTop] },
    { id: 'upright', objects: [towerL, towerR] },
    { id: 'crossbar', objects: [crossbar] },
    { id: 'deck', objects: [deck, platform] },
  ];

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
    composer.setSize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  function loop() {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    const dt = reducedMotion ? 0 : Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    const t = reducedMotion ? 0 : elapsed;

    if (!reducedMotion) energyTex.offset.y = t * 0.4;

    // Winch wheel spins while winding.
    if (raising && !reducedMotion) {
      leverGroup.rotation.x += dt * 4;
      bladeMat.emissiveIntensity = 1.2 + lift * 0.8;
    }

    // Split animation: halves tip outward and settle.
    if (splitT >= 0 && splitT < 1 && !reducedMotion) {
      splitT = Math.min(1, splitT + dt / 0.9);
      const e = splitT * splitT;
      halfL.rotation.z = e * 1.1;
      halfL.position.x = -32.5 - e * 55;
      halfL.position.y = LOG_Y - e * e * 95;
      halfR.rotation.z = -e * 1.1;
      halfR.position.x = 32.5 + e * 55;
      halfR.position.y = LOG_Y - e * e * 95;
    }

    // Sawdust physics.
    if (sawLife >= 0 && !reducedMotion) {
      sawLife += dt;
      for (let i = 0; i < SAW_COUNT; i++) {
        sawVel[i * 3 + 1] -= 500 * dt;
        sawPos[i * 3] += sawVel[i * 3] * dt;
        sawPos[i * 3 + 1] += sawVel[i * 3 + 1] * dt;
        sawPos[i * 3 + 2] += sawVel[i * 3 + 2] * dt;
        if (sawPos[i * 3 + 1] < 24) sawPos[i * 3 + 1] = 24;
      }
      sawGeo.attributes.position.needsUpdate = true;
      sawMat.opacity = Math.max(0, 0.95 * (1 - sawLife / 1.2));
      if (sawLife > 1.2) sawLife = -1;
    }

    // Impact flash fades fast (restrained: peak 500, no white-out).
    impactLight.intensity = THREE.MathUtils.lerp(impactLight.intensity, 0, reducedMotion ? 1 : 0.15);

    if (engineState === 'ORBITING') {
      if (!reducedMotion) {
        orbitAngle += 0.002;
        camera.position.set(
          Math.sin(orbitAngle) * 700,
          230 + Math.sin(t * 0.8) * 30,
          Math.cos(orbitAngle) * 700
        );
        camera.lookAt(centerTarget);
      } else {
        camera.position.set(Math.sin(orbitAngle) * 700, 230, Math.cos(orbitAngle) * 700);
        camera.lookAt(centerTarget);
      }
    } else if (engineState === 'ZOOMING') {
      if (reducedMotion) {
        camera.position.copy(insideCameraPos);
        engineState = 'INSIDE';
        controls.enabled = true;
        controls.target.copy(centerTarget);
        onZoomComplete();
      } else {
        camera.position.lerp(insideCameraPos, 0.025);
        camera.lookAt(centerTarget);
        if (camera.position.distanceTo(insideCameraPos) < 2.0) {
          engineState = 'INSIDE';
          controls.enabled = true;
          controls.target.copy(centerTarget);
          onZoomComplete();
        }
      }
    } else if (engineState === 'INSIDE') {
      controls.update();
    }

    composer.render();
  }
  loop();

  return {
    beginZoom() {
      if (engineState === 'ORBITING') engineState = 'ZOOMING';
    },
    hitLever(clientX, clientY) {
      return castAt(clientX, clientY, [leverGroup]);
    },
    hitBlade(clientX, clientY) {
      return castAt(clientX, clientY, [bladeGroup]);
    },
    // Returns a part id for the examine mode, or null.
    hitPart(clientX, clientY) {
      for (const part of partTargets) {
        if (castAt(clientX, clientY, part.objects)) return part.id;
      }
      return null;
    },
    setLift(v) {
      lift = Math.max(0, Math.min(1, v));
      bladeGroup.position.y = THREE.MathUtils.lerp(BLADE_DOWN_Y, BLADE_TOP_Y, lift);
    },
    setRaising(active) {
      raising = active;
    },
    beginDrop() {
      dropping = true;
    },
    // p: 0..1 drop progress; eased as a free-fall inside the scene.
    setDropProgress(p) {
      const e = Math.pow(Math.max(0, Math.min(1, p)), 3);
      bladeGroup.position.y = THREE.MathUtils.lerp(BLADE_TOP_Y, BLADE_DOWN_Y, e);
      if (reducedMotion) {
        bladeGroup.position.y = BLADE_DOWN_Y;
      }
    },
    triggerSplit() {
      if (splitDone) return;
      splitDone = true;
      dropping = false;
      raising = false;
      if (reducedMotion) {
        splitT = 1;
        halfL.rotation.z = 1.1;
        halfL.position.set(-87.5, 26, 0);
        halfR.rotation.z = -1.1;
        halfR.position.set(87.5, 26, 0);
      } else {
        splitT = 0;
        burstSawdust();
        impactLight.intensity = 500; // restrained flash
      }
      onSplit();
    },
    resetLog() {
      splitDone = false;
      splitT = -1;
      halfL.rotation.z = 0;
      halfL.position.set(-32.5, LOG_Y, 0);
      halfR.rotation.z = 0;
      halfR.position.set(32.5, LOG_Y, 0);
      bladeGroup.position.y = BLADE_DOWN_Y;
      sawLife = -1;
      sawMat.opacity = 0;
    },
    dispose() {
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
      if (composer.dispose) composer.dispose();
      renderer.dispose();
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}
