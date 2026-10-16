// liberty3d.js — the real 3D Statue of Liberty monument.
//
// Loads the module's own procedural monument (glb.js) through three.js'
// GLTFLoader from a blob URL — zero network, zero downloaded assets.
// OrbitControls replaces the 2D drag-to-orbit; hotspot markers are HTML
// buttons positioned each frame via project(). Day/night is a smooth
// lighting mix: the torch flame becomes a localized point light after dark,
// and the verdigris copper keeps its texture under it (lighting rule).
//
// createLibertyScene(canvas, { reducedMotion }) ->
//   { ready, setNight(bool), zoomBy(d), project(anchorId), render(dt), resize(w,h), dispose() }

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildStatueGlb } from './glb.js';
import { HOTSPOT_ANCHORS_3D } from './liberty.js';

const DAY = {
  bg: new THREE.Color(0x8fa8bd),
  hemiSky: new THREE.Color(0xbfd4e6),
  hemiGround: new THREE.Color(0x3a4038),
  hemiInt: 0.85,
  sunColor: new THREE.Color(0xfff1da),
  sunInt: 1.7,
  groundColor: new THREE.Color(0x4c554e),
  waterColor: new THREE.Color(0x3d6a8a),
  stars: 0,
  torch: 0,
  flameGlow: 0.12,
};

const NIGHT = {
  bg: new THREE.Color(0x060a16),
  hemiSky: new THREE.Color(0x2a3a5f),
  hemiGround: new THREE.Color(0x0c0e14),
  hemiInt: 0.4,
  sunColor: new THREE.Color(0x9fb6ff),
  sunInt: 0.35,
  groundColor: new THREE.Color(0x23282c),
  waterColor: new THREE.Color(0x0a1830),
  stars: 1,
  torch: 55,
  flameGlow: 2.0,
};

const CENTER = new THREE.Vector3(0, 6.5, 0);
const MAX_DPR = 2;

function findGoldMaterial(root) {
  let found = null;
  root.traverse((obj) => {
    if (found || !obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.name === 'gold-flame') { found = m; return; }
      const c = m.color;
      if (c && c.r > 0.85 && c.g > 0.65 && c.b < 0.55) found = m;
    }
  });
  return found;
}

export function createLibertyScene(canvas, opts = {}) {
  const reducedMotion = !!opts.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'STATUE OF LIBERTY' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = DAY.bg.clone();

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  camera.position.set(15, 9.5, 27);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 13;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI / 2 + 0.06;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.5;

  // --- lights ---
  const hemi = new THREE.HemisphereLight(DAY.hemiSky.clone(), DAY.hemiGround.clone(), DAY.hemiInt);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(DAY.sunColor.clone(), DAY.sunInt);
  sun.position.set(24, 34, 14);
  scene.add(sun);
  // the one localized light source: the torch flame, lit only at night
  const torchLight = new THREE.PointLight(0xffb347, 0, 22, 1.8);
  torchLight.position.set(1.44, 13.4, 0);
  scene.add(torchLight);

  // --- island: stone plaza disc on dark harbor water ---
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48),
    new THREE.MeshStandardMaterial({ color: DAY.waterColor.clone(), roughness: 0.85, metalness: 0.05 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  scene.add(water);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(10.5, 40),
    new THREE.MeshStandardMaterial({ color: DAY.groundColor.clone(), roughness: 0.95, metalness: 0 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0;
  scene.add(plaza);

  // --- stars (night only) ---
  const starGeo = new THREE.BufferGeometry();
  {
    const n = 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 220;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0 })
  );
  scene.add(stars);

  // --- the monument itself ---
  let statue = null;
  let goldMat = null;
  let blobUrl = null;
  let readyResolve = null;
  const ready = new Promise((res) => { readyResolve = res; });

  try {
    const bytes = buildStatueGlb();
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    new GLTFLoader()
      .loadAsync(blobUrl)
      .then((gltf) => {
        statue = gltf.scene;
        scene.add(statue);
        goldMat = findGoldMaterial(statue);
        if (goldMat && goldMat.emissive) {
          goldMat.emissive.set(0xff9a3c);
          goldMat.emissiveIntensity = DAY.flameGlow;
        }
        readyResolve(true);
      })
      .catch(() => readyResolve(false));
  } catch (e) {
    readyResolve(false);
  }

  // --- day/night mix ---
  let nightTarget = 0;
  let nightMix = 0;

  function applyMix(m) {
    const L = (a, b) => a + (b - a) * m;
    scene.background.copy(DAY.bg).lerp(NIGHT.bg, m);
    hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, m);
    hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, m);
    hemi.intensity = L(DAY.hemiInt, NIGHT.hemiInt);
    sun.color.copy(DAY.sunColor).lerp(NIGHT.sunColor, m);
    sun.intensity = L(DAY.sunInt, NIGHT.sunInt);
    torchLight.intensity = L(DAY.torch, NIGHT.torch);
    plaza.material.color.copy(DAY.groundColor).lerp(NIGHT.groundColor, m);
    water.material.color.copy(DAY.waterColor).lerp(NIGHT.waterColor, m);
    stars.material.opacity = L(DAY.stars, NIGHT.stars);
    stars.visible = m > 0.02;
    if (goldMat && goldMat.emissive) goldMat.emissiveIntensity = L(DAY.flameGlow, NIGHT.flameGlow);
  }
  applyMix(0);

  const _v = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _anchorDir = new THREE.Vector3();

  function project(anchorId) {
    const a = HOTSPOT_ANCHORS_3D[anchorId];
    if (!a) return null;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    _v.set(a[0], a[1], a[2]).project(camera);
    const behind = _v.z > 1 || _v.z < -1;
    // hide markers on the far side of the monument
    _anchorDir.set(a[0] - CENTER.x, a[1] - CENTER.y, a[2] - CENTER.z).normalize();
    _camDir.copy(camera.position).sub(CENTER).normalize();
    const facing = _anchorDir.dot(_camDir);
    return {
      x: (_v.x * 0.5 + 0.5) * w,
      y: (-_v.y * 0.5 + 0.5) * h,
      visible: !behind && facing > -0.1,
    };
  }

  function setNight(b) {
    nightTarget = b ? 1 : 0;
  }

  function zoomBy(d) {
    const off = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(off.length() * (1 - d * 0.6), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).addScaledVector(off.normalize(), len);
  }

  function render(dt) {
    if (contextGuard.isLost()) return; // frozen while the context is gone
    controls.update();
    if (Math.abs(nightMix - nightTarget) > 0.0005) {
      nightMix += (nightTarget - nightMix) * Math.min(1, dt * 3.5);
      applyMix(nightMix);
    }
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    const cw = Math.max(1, Math.floor(w));
    const ch = Math.max(1, Math.floor(h));
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    contextGuard.dispose();
    controls.dispose();
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isPoints) {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m && m.dispose());
      }
    });
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    renderer.dispose();
  }

  return { ready, setNight, zoomBy, project, render, resize, dispose };
}
