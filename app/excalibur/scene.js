// scene.js — Excalibur three.js scene.
// Port of highland88999-commits/Excalibur ("Nexus Vortex – Excalibur in the Stone").
// Changes from the original:
//  - Telemetry removed (no network requests of any kind).
//  - All textures are procedural canvas paintings (painters.js) — the original
//    hotlinked remote video files, which is forbidden here.
//  - Bloom restrained per the lighting rule: strength 2.2 -> 0.75, threshold
//    0.1 -> 0.8, so only the sword's glow blooms and the stone stays readable.
//  - Flash intensities lowered; pixel ratio capped at 1.5 for battery life.
//  - Exposes an API for the React page: beginZoom, hitSword, setPulling,
//    setWorthiness, triggerChampion, dispose.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { paintSky, paintEnergy, paintFloor } from './painters.js';

const EMBEDDED_Y = -30;
const DRAWN_Y = 300;

function canvasTexture(painter, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  painter(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createExcaliburScene(canvas, options = {}) {
  const { reducedMotion = false, onZoomComplete = () => {} } = options;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x010103, 0.001);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 8000);
  camera.position.set(0, 300, 1000);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // RESTRAINED bloom (lighting rule): strength 0.75, radius 0.45, threshold 0.8.
  // Only emissive sources brighter than the threshold (the sword) bloom;
  // the stone and floor stay crisp.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.8);
  composer.addPass(bloomPass);

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 100, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 1500;

  // ── Procedural textures (zero network) ──────────────────────────────
  const skyTex = canvasTexture(paintSky, 1024, 512);
  const energyTex = canvasTexture(paintEnergy, 128, 512);
  const floorTex = canvasTexture(paintFloor, 512, 512);
  energyTex.wrapS = energyTex.wrapT = THREE.MirroredRepeatWrapping;
  energyTex.repeat.set(1, 4);
  floorTex.wrapS = floorTex.wrapT = THREE.MirroredRepeatWrapping;
  floorTex.repeat.set(12, 12);

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

  // ── The Stone / Anvil ────────────────────────────────────────────────
  const stoneGroup = new THREE.Group();
  const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.65, metalness: 0.75 });
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(80, 1), obsidianMat);
  stone.scale.set(1.5, 0.8, 1.2);
  stone.position.y = 40;
  stoneGroup.add(stone);

  const shardGeo = new THREE.BoxGeometry(40, 100, 40);
  const shard1 = new THREE.Mesh(shardGeo, obsidianMat);
  shard1.position.set(-60, 50, 20);
  shard1.rotation.set(0.2, 0.5, -0.3);
  stoneGroup.add(shard1);
  const shard2 = new THREE.Mesh(shardGeo, obsidianMat);
  shard2.position.set(50, 40, -40);
  shard2.rotation.set(-0.3, 0.1, 0.4);
  stoneGroup.add(shard2);
  scene.add(stoneGroup);

  // ── Excalibur ────────────────────────────────────────────────────────
  const swordGroup = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    map: energyTex,
    emissiveMap: energyTex,
    emissive: 0x00ffff,
    emissiveIntensity: 1.2, // restrained from 2.0; bloom threshold keeps the glow local
    color: 0x00ffff,
    metalness: 1.0,
    roughness: 0.15,
  });
  const bladeGeo = new THREE.CylinderGeometry(0.1, 12, 220, 4);
  bladeGeo.translate(0, 110, 0);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.scale.set(1, 1, 0.2);
  swordGroup.add(blade);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(70, 15, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.9, roughness: 0.35 })
  );
  swordGroup.add(guard);

  const hilt = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 4, 40, 16),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.2, roughness: 0.9 })
  );
  hilt.position.y = -25;
  swordGroup.add(hilt);

  const pommelMat = new THREE.MeshStandardMaterial({
    color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.6, // restrained from 2.5
  });
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 32), pommelMat);
  pommel.position.y = -50;
  swordGroup.add(pommel);

  swordGroup.position.set(0, EMBEDDED_Y, 0);
  scene.add(swordGroup);

  // ── Lightning ────────────────────────────────────────────────────────
  const lightningGroup = new THREE.Group();
  scene.add(lightningGroup);
  const lightningMats = [
    new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.7 }),
  ];
  const SEGMENTS = 12;
  const lightningBolts = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((SEGMENTS + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geo, lightningMats[i]);
    lightningGroup.add(line);
    lightningBolts.push({ line, positions });
  }

  function strikeBolts() {
    const pommelWorldPos = new THREE.Vector3();
    pommel.getWorldPosition(pommelWorldPos);
    const originY = 1500;
    for (const bolt of lightningBolts) {
      for (let j = 0; j <= SEGMENTS; j++) {
        const progress = j / SEGMENTS;
        const jitterStrength = (1.0 - progress) * 150;
        bolt.positions[j * 3] = pommelWorldPos.x * progress + (Math.random() - 0.5) * jitterStrength;
        bolt.positions[j * 3 + 1] = originY - (originY - pommelWorldPos.y) * progress;
        bolt.positions[j * 3 + 2] = pommelWorldPos.z * progress + (Math.random() - 0.5) * jitterStrength;
      }
      bolt.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ── Lighting ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0a0a18, 1.5));
  const rimLightGold = new THREE.DirectionalLight(0xffd700, 2.5);
  rimLightGold.position.set(-300, 200, -300);
  scene.add(rimLightGold);
  const coreLightPink = new THREE.PointLight(0xff00ff, 400, 1000);
  coreLightPink.position.set(100, 100, 100);
  scene.add(coreLightPink);
  const strikeLight = new THREE.PointLight(0x00ffff, 0, 2000);
  strikeLight.position.set(0, 150, 0);
  scene.add(strikeLight);
  const swordGlow = new THREE.PointLight(0x00ffff, 300, 600);
  swordGlow.position.set(0, 100, 0);
  swordGroup.add(swordGlow);

  // ── Interaction state ────────────────────────────────────────────────
  let isDrawn = false;
  let drawProgress = 0;
  let pulling = false;
  let worthiness = 0;
  let engineState = 'ORBITING';
  let orbitAngle = 0.6; // composed starting angle (stone framed against nebula)
  const insideCameraPos = new THREE.Vector3(0, 0.001, 250);
  const centerTarget = new THREE.Vector3(0, 80, 0);
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let rafId = 0;
  let disposed = false;

  if (reducedMotion) {
    // Static composed frame: no auto orbit, storm drawn once, no flashes.
    strikeBolts();
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
    const t = reducedMotion ? 0 : clock.getElapsedTime();

    if (!reducedMotion) energyTex.offset.y = t * 0.5;

    if (!isDrawn) {
      if (reducedMotion) {
        lightningGroup.visible = true;
      } else if (Math.random() > 0.8) {
        // Restrained storm flash (was 400..1200).
        strikeLight.intensity = Math.random() * 200 + 150;
        strikeLight.color.setHex(Math.random() > 0.5 ? 0x00ffff : 0xffffff);
        strikeBolts();
      } else {
        strikeLight.intensity = THREE.MathUtils.lerp(strikeLight.intensity, 0, 0.3);
      }
    } else {
      lightningGroup.visible = false;
      if (drawProgress < 1.0) {
        drawProgress = Math.min(1, drawProgress + (reducedMotion ? 0.05 : 0.004));
        const e = drawProgress < 0.5
          ? 2 * drawProgress * drawProgress
          : 1 - Math.pow(-2 * drawProgress + 2, 2) / 2;
        swordGroup.position.y = THREE.MathUtils.lerp(EMBEDDED_Y, DRAWN_Y, e);
        strikeLight.intensity = THREE.MathUtils.lerp(strikeLight.intensity, 0, 0.05);
      } else {
        swordGroup.position.y = DRAWN_Y + (reducedMotion ? 0 : Math.sin(t * 1.5) * 15);
        if (!reducedMotion) swordGroup.rotation.y = t * 0.5;
        bladeMat.emissiveIntensity = 1.8 + (reducedMotion ? 0 : Math.sin(t * 5) * 0.6);
        swordGlow.intensity = 500 + (reducedMotion ? 0 : Math.sin(t * 5) * 200);
      }
    }

    // The sword trembles while being pulled, harder as worthiness grows.
    if (pulling && !isDrawn && !reducedMotion) {
      const s = worthiness * 5;
      swordGroup.position.x = (Math.random() - 0.5) * s;
      swordGroup.position.z = (Math.random() - 0.5) * s;
    } else if (!isDrawn) {
      swordGroup.position.x = 0;
      swordGroup.position.z = 0;
    }

    if (engineState === 'ORBITING') {
      if (!reducedMotion) {
        orbitAngle += 0.002;
        camera.position.set(
          Math.sin(orbitAngle) * 500,
          150 + Math.sin(t * 0.8) * 30,
          Math.cos(orbitAngle) * 500
        );
        camera.lookAt(centerTarget);
      } else {
        camera.position.set(Math.sin(orbitAngle) * 500, 150, Math.cos(orbitAngle) * 500);
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
      if (isDrawn) centerTarget.y = THREE.MathUtils.lerp(centerTarget.y, DRAWN_Y + 50, 0.02);
    }

    composer.render();
  }
  loop();

  return {
    beginZoom() {
      if (engineState === 'ORBITING') engineState = 'ZOOMING';
    },
    hitSword(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(swordGroup.children, true).length > 0;
    },
    setPulling(active) {
      pulling = active;
    },
    setWorthiness(v) {
      worthiness = Math.max(0, Math.min(1, v));
      if (!isDrawn) {
        bladeMat.emissiveIntensity = 1.2 + worthiness * 1.2;
        swordGlow.intensity = 300 + worthiness * 400;
      }
    },
    triggerChampion() {
      if (isDrawn) return;
      isDrawn = true;
      pulling = false;
      swordGroup.position.x = 0;
      swordGroup.position.z = 0;
      strikeLight.intensity = 2500; // restrained from 5000
      strikeLight.color.setHex(0xffffff);
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
