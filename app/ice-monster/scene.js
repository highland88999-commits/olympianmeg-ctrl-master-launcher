// scene.js — three.js scene factory for the Ice Monster module.
// Builds the frost behemoth encounter: a procedurally-built walking ice
// creature on a glacier, with ice breath, an ice-crystal trail, and a floor
// that freezes around the creature.
//
// Conventions (shared with the ice-dragon module):
//  - three comes from the installed npm package — zero network requests.
//  - All textures are procedural canvas painters (see painters.js).
//  - The original had NO bloom pass; we keep it that way. Lighting is
//    restrained (exposure 1.15, a modest cyan aura) so the ice stays readable.
//  - Factory returns { beginZoom, hitBehemoth, setTrust, getTremor, dispose }.
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  paintArcticSky,
  paintGlacierIce,
  paintBehemothSkin,
  paintMistSprite,
} from './painters.js';

function canvasTexture(painter, w, h, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  painter(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

export function createIceMonsterScene(canvas, options = {}) {
  const { reducedMotion = false, onZoomComplete = () => {} } = options;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x01050a, 0.0003);

  const camera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    15000
  );
  camera.position.set(0, 1500, 4500);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'ICE MONSTER' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ── Sky ──────────────────────────────────────────────────────────
  const skyTex = canvasTexture(paintArcticSky, 1024, 512);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(12000, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // ── Glacier floor with a freeze aura around the behemoth ───────────
  const floorUniforms = {
    tBase: { value: canvasTexture(paintGlacierIce, 512, 512, 16) },
    uMonsterPos: { value: new THREE.Vector3(0, 0, 0) },
    uTime: { value: 0 },
  };
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D tBase;
      uniform vec3 uMonsterPos;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      float rand(vec2 co){ return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec3 base = texture2D(tBase, vUv).rgb;
        float dist = distance(vWorldPos.xz, uMonsterPos.xz);
        float noise = rand(floor(vWorldPos.xz * 0.04)) * 120.0;
        float iceFactor = 1.0 - smoothstep(200.0, 500.0, dist + noise);
        vec3 iceColor = vec3(0.55, 0.92, 1.0) * 1.25;
        float shimmer = 0.06 * sin(uTime * 1.7 + vWorldPos.x * 0.02);
        vec3 finalColor = mix(base, iceColor, clamp(iceFactor * 0.9 + shimmer, 0.0, 1.0));
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ── The frost behemoth (procedural, pivot-friendly limbs) ─────────
  const skinTex = canvasTexture(paintBehemothSkin, 512, 512, 2);
  const skinMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: 0.55,
    metalness: 0.1,
    color: 0xdff2fa,
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0xbfe9ff,
    roughness: 0.25,
    metalness: 0.35,
    emissive: 0x0a3d52,
    emissiveIntensity: 0.35,
  });

  const behemoth = new THREE.Group();
  scene.add(behemoth);

  function limb(geo, yOffset) {
    geo.translate(0, yOffset, 0);
    return new THREE.Mesh(geo, skinMat);
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(120, 180, 100), skinMat);
  torso.position.y = 220;
  behemoth.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), skinMat);
  head.position.set(0, 130, 20);
  torso.add(head);

  // Ice horns.
  const hornGeo = new THREE.ConeGeometry(14, 70, 6);
  const hornL = new THREE.Mesh(hornGeo, clawMat);
  hornL.position.set(46, 44, 0);
  hornL.rotation.z = -0.5;
  head.add(hornL);
  const hornR = new THREE.Mesh(hornGeo, clawMat);
  hornR.position.set(-46, 44, 0);
  hornR.rotation.z = 0.5;
  head.add(hornR);

  // Eyes: two small restrained embers.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9fefff });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 10), eyeMat);
  eyeL.position.set(22, 8, 42);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 10), eyeMat);
  eyeR.position.set(-22, 8, 42);
  head.add(eyeR);

  const armL = limb(new THREE.CylinderGeometry(25, 20, 160), -80);
  armL.position.set(85, 80, 0);
  torso.add(armL);
  const armR = limb(new THREE.CylinderGeometry(25, 20, 160), -80);
  armR.position.set(-85, 80, 0);
  torso.add(armR);
  const legL = limb(new THREE.CylinderGeometry(30, 25, 150), -75);
  legL.position.set(40, -90, 0);
  torso.add(legL);
  const legR = limb(new THREE.CylinderGeometry(30, 25, 150), -75);
  legR.position.set(-40, -90, 0);
  torso.add(legR);

  // ── Ice breath (soft mist sprites from the mouth) ─────────────────
  const BREATH_COUNT = 420;
  const breathPos = new Float32Array(BREATH_COUNT * 3);
  const breathVel = new Float32Array(BREATH_COUNT * 3);
  function resetBreath(i, randomize) {
    breathPos[i * 3] = (Math.random() - 0.5) * 12;
    breathPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    breathPos[i * 3 + 2] = randomize ? Math.random() * 700 : 0;
    breathVel[i * 3] = (Math.random() - 0.5) * 5;
    breathVel[i * 3 + 1] = (Math.random() - 0.5) * 5;
    breathVel[i * 3 + 2] = 14 + Math.random() * 18;
  }
  for (let i = 0; i < BREATH_COUNT; i++) resetBreath(i, true);
  const breathGeo = new THREE.BufferGeometry();
  breathGeo.setAttribute('position', new THREE.BufferAttribute(breathPos, 3));
  const mistTex = canvasTexture(paintMistSprite, 64, 64);
  const breathMat = new THREE.PointsMaterial({
    map: mistTex,
    size: 34,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    color: 0xcfeeff,
  });
  const breath = new THREE.Points(breathGeo, breathMat);
  breath.position.set(0, -14, 44);
  head.add(breath);

  // ── Ice crystal trail (instanced, blooms under the behemoth) ──────
  const TRAIL_COUNT = 700;
  const trailGeo = new THREE.ConeGeometry(22, 90, 5);
  const trailMat = new THREE.MeshStandardMaterial({
    color: 0x9fe8ff,
    roughness: 0.2,
    metalness: 0.1,
    emissive: 0x1a6a8a,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9,
  });
  const trail = new THREE.InstancedMesh(trailGeo, trailMat, TRAIL_COUNT);
  const dummy = new THREE.Object3D();
  dummy.position.set(0, -2000, 0);
  dummy.updateMatrix();
  for (let i = 0; i < TRAIL_COUNT; i++) trail.setMatrixAt(i, dummy.matrix);
  trail.instanceMatrix.needsUpdate = true;
  scene.add(trail);
  let trailIndex = 0;

  // ── Lighting (restrained: no bloom pass) ──────────────────────────
  scene.add(new THREE.AmbientLight(0x1a2a3a, 1.2));
  const moon = new THREE.DirectionalLight(0xbfe0ff, 1.1);
  moon.position.set(-3000, 5000, 2000);
  scene.add(moon);
  // The behemoth's freezing aura — modest, so the ice stays readable.
  const aura = new THREE.PointLight(0x00d5ff, 1200, 1600, 1.8);
  aura.position.set(0, 260, 0);
  behemoth.add(aura);

  // ── Controls & camera engine ───────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 200, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.minDistance = 200;
  controls.maxDistance = 6000;

  const groundPos = new THREE.Vector3(0, 40, 900);
  const centerTarget = new THREE.Vector3(0, 200, 0);
  let engineState = 'ORBITING'; // ORBITING -> ZOOMING -> INSIDE
  let orbitAngle = 0.6;
  let trust = 0; // 0 = wary, 1 = fully trusts you
  let kneel = 0; // 0 = standing, 1 = kneeling before you
  let tremor = 0;
  let zoomNotified = false;
  let disposed = false;
  const clock = new THREE.Clock();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  function beginZoom() {
    if (engineState === 'ORBITING') engineState = 'ZOOMING';
  }

  function hitBehemoth(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(behemoth, true).length > 0;
  }

  function setTrust(t) {
    trust = Math.max(0, Math.min(1, t));
  }

  function getTremor() {
    return tremor;
  }

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // The behemoth roams a Lissajous path; it slows as it trusts you.
    const roamSpeed = reducedMotion ? 0 : 0.6 * (1 - trust * 0.8);
    const targetX = Math.sin(time * roamSpeed) * 2000;
    const targetZ = Math.cos(time * roamSpeed * 0.75) * 2000;
    if (!reducedMotion) {
      behemoth.position.x += (targetX - behemoth.position.x) * Math.min(1, dt * 2);
      behemoth.position.z += (targetZ - behemoth.position.z) * Math.min(1, dt * 2);
      const look = new THREE.Vector3(targetX, behemoth.position.y, targetZ);
      if (behemoth.position.distanceToSquared(look) > 1) behemoth.lookAt(look);
    }

    floorUniforms.uMonsterPos.value.copy(behemoth.position);
    floorUniforms.uTime.value = time;

    // Walk cycle, gentler as trust grows.
    const stride = reducedMotion ? 0 : time * 8.0 * (1 - trust * 0.6);
    const swing = 0.8 * (1 - trust * 0.55);
    legL.rotation.x = Math.sin(stride) * swing;
    legR.rotation.x = Math.sin(stride + Math.PI) * swing;
    armL.rotation.x = Math.sin(stride + Math.PI) * swing * 0.7;
    armR.rotation.x = Math.sin(stride) * swing * 0.7;
    torso.position.y = 220 + (reducedMotion ? 0 : Math.abs(Math.sin(stride * 2)) * 15 * (1 - trust * 0.5));
    head.rotation.y = reducedMotion ? 0 : Math.sin(time * 2.0) * 0.3 * (1 - trust * 0.5);

    // Kneel: at full trust the behemoth lowers itself and its head toward you.
    const kneelTarget = trust >= 1 ? 1 : 0;
    kneel += (kneelTarget - kneel) * Math.min(1, dt * 1.5);
    behemoth.position.y = -110 * kneel;
    torso.rotation.x = 0.28 * kneel;
    head.rotation.x = 0.35 * kneel;

    // Breath: calmer as trust grows.
    const breathRate = reducedMotion ? 0 : 1 - trust * 0.75;
    const arr = breathGeo.attributes.position.array;
    for (let i = 0; i < BREATH_COUNT; i++) {
      arr[i * 3] += breathVel[i * 3] * breathRate;
      arr[i * 3 + 1] += breathVel[i * 3 + 1] * breathRate;
      arr[i * 3 + 2] += breathVel[i * 3 + 2] * breathRate;
      if (arr[i * 3 + 2] > 800) resetBreath(i, false);
    }
    breathGeo.attributes.position.needsUpdate = true;
    breathMat.opacity = 0.5 * (1 - trust * 0.6);

    // Ice trail: crystals bloom under the behemoth; denser as it calms.
    if (!reducedMotion && Math.random() > 0.55 - trust * 0.3) {
      dummy.position.copy(behemoth.position);
      dummy.position.x += (Math.random() - 0.5) * 320;
      dummy.position.z += (Math.random() - 0.5) * 320;
      dummy.position.y = 45;
      dummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
      dummy.scale.setScalar((0.5 + Math.random() * 1.2) * (1 + trust * 0.8));
      dummy.updateMatrix();
      trail.setMatrixAt(trailIndex, dummy.matrix);
      trail.instanceMatrix.needsUpdate = true;
      trailIndex = (trailIndex + 1) % TRAIL_COUNT;
    }

    // Tremor: the ground shakes while the behemoth is wary and near.
    const distToCam = camera.position.distanceTo(behemoth.position);
    const proximity = Math.max(0, 1 - distToCam / 4000);
    const targetTremor = reducedMotion ? 0 : (1 - trust) * proximity;
    tremor += (targetTremor - tremor) * Math.min(1, dt * 3);
    const shake = tremor * 14;
    const shx = reducedMotion ? 0 : (Math.random() - 0.5) * shake;
    const shy = reducedMotion ? 0 : (Math.random() - 0.5) * shake;

    // Camera engine.
    if (engineState === 'ORBITING') {
      if (!reducedMotion) orbitAngle += dt * 0.06;
      camera.position.set(
        Math.sin(orbitAngle) * 4500,
        1200 + Math.sin(time * 0.5) * 300,
        Math.cos(orbitAngle) * 4500
      );
      camera.lookAt(0, 150, 0);
    } else if (engineState === 'ZOOMING') {
      camera.position.lerp(groundPos, reducedMotion ? 1 : Math.min(1, dt * 1.4));
      centerTarget.lerp(behemoth.position, Math.min(1, dt * 2));
      camera.lookAt(centerTarget);
      if (camera.position.distanceTo(groundPos) < 12) {
        engineState = 'INSIDE';
        controls.enabled = true;
        if (!zoomNotified) {
          zoomNotified = true;
          onZoomComplete();
        }
      }
    } else {
      centerTarget.lerp(behemoth.position, Math.min(1, dt * 4));
      controls.target.copy(centerTarget);
      controls.update();
    }

    // Apply tremor on top of the composed camera.
    camera.position.x += shx;
    camera.position.y += shy;

    renderer.render(scene, camera);
  }
  animate();

  function dispose() {
    contextGuard.dispose();
    disposed = true;
    window.removeEventListener('resize', resize);
    controls.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    });
    renderer.dispose();
  }

  return { beginZoom, hitBehemoth, setTrust, getTremor, dispose };
}
