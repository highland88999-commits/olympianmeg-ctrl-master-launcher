// scene.js — three.js scene factory for the IQ Test module.
// Builds the neon tile board, handles drag-to-swap / tap-to-rotate input,
// and animates tiles toward their target slots. Pure three.js + DOM canvas;
// all game rules live in puzzle.js and page.jsx.
//
// Lighting (per project rule): bloom is restrained so tiles stay readable.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Restrained bloom: the original ran strength 1.2 / threshold 0.2, which
// washed the tiles out. Only the brightest neon edges bloom now.
export const BLOOM_STRENGTH = 0.75;
export const BLOOM_RADIUS = 0.5;
export const BLOOM_THRESHOLD = 0.8;
export const TONE_EXPOSURE = 1.15;

const COLOR_PAIRS = [
  { head: 0xff003c, tail: 0x4a0011 }, // red
  { head: 0x00f0ff, tail: 0x003344 }, // cyan
  { head: 0x8a2be2, tail: 0x2e0e4c }, // purple
  { head: 0x00ff7f, tail: 0x004422 }, // green
];

const PIECE = 3;
const GAP = 0.2;
const STEP = PIECE + GAP;
const HALF = PIECE / 2;
const TRI_INSET = 0.08;
const TAP_SLOP_PX = 12;
const IDLE_EMISSIVE = 0.8;
const DRAG_EMISSIVE = 2.0;

function edgeColor(edge) {
  return COLOR_PAIRS[edge.pairIndex][edge.isHead ? 'head' : 'tail'];
}

function makeTriangle(p1, p2, p3, hexColor) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([...p1, ...p2, ...p3]), 3)
  );
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: hexColor,
      emissiveIntensity: IDLE_EMISSIVE,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
  );
}

function setTileEmissive(group, intensity) {
  group.children.forEach((child) => {
    if (child.material && child.material.emissiveIntensity !== undefined) {
      child.material.emissiveIntensity = intensity;
    }
  });
}

export function createIqScene(canvas, opts) {
  const { n, tiles, reducedMotion } = opts;
  const api = { onTap: null, onDrop: null };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_EXPOSURE;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05010a);
  scene.fog = new THREE.FogExp2(0x05010a, 0.004);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  composer.addPass(bloom);

  // ---- Backdrop: starfield + one slow wireframe ring (astrolabe-lite) ----
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 1200; i++) {
    starPos.push(
      (Math.random() - 0.5) * 800,
      (Math.random() - 0.5) * 800,
      (Math.random() - 0.5) * 800
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      size: 0.6,
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(stars);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(n * STEP * 0.95, 0.12, 12, 90),
    new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    })
  );
  ring.position.z = -14;
  ring.rotation.x = 0.35;
  scene.add(ring);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0x88ccff, 0.7);
  key.position.set(6, 10, 12);
  scene.add(key);

  // ---- Board: slot outlines + tiles ----
  const slotOfTile = new Array(n * n).fill(0);
  const tileGroups = [];

  const slotGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(PIECE, PIECE));
  const slotMat = new THREE.LineBasicMaterial({
    color: 0x2a3a55,
    transparent: true,
    opacity: 0.9,
  });

  function slotPos(i) {
    const r = Math.floor(i / n);
    const c = i % n;
    return new THREE.Vector3(
      (c - (n - 1) / 2) * STEP,
      ((n - 1) / 2 - r) * STEP,
      0
    );
  }

  for (let i = 0; i < n * n; i++) {
    const outline = new THREE.LineSegments(slotGeo, slotMat);
    const p = slotPos(i);
    outline.position.set(p.x, p.y, -0.1);
    scene.add(outline);
  }

  for (const tile of tiles) {
    const group = new THREE.Group();
    const g = TRI_INSET;
    const e = tile.edges;
    group.add(
      makeTriangle([-HALF + g, HALF - g, 0], [HALF - g, HALF - g, 0], [0, g, 0], edgeColor(e.top))
    );
    group.add(
      makeTriangle([HALF - g, HALF - g, 0], [HALF - g, -HALF + g, 0], [g, 0, 0], edgeColor(e.right))
    );
    group.add(
      makeTriangle([HALF - g, -HALF + g, 0], [-HALF + g, -HALF + g, 0], [0, -g, 0], edgeColor(e.bottom))
    );
    group.add(
      makeTriangle([-HALF + g, -HALF + g, 0], [-HALF + g, HALF - g, 0], [-g, 0, 0], edgeColor(e.left))
    );
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(PIECE - g, PIECE - g),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    back.position.z = -0.05;
    group.add(back);
    group.userData = {
      tileId: tile.id,
      target: new THREE.Vector3(),
      targetRotZ: 0,
    };
    tileGroups[tile.id] = group;
    scene.add(group);
  }

  // ---- Camera fit + resize ----
  function fitCamera() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const aspect = w / h;
    camera.aspect = aspect;
    const fit = n * STEP + 6;
    const dist =
      Math.max(fit, fit / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5)));
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }
  fitCamera();

  // ---- Input: tap = rotate, drag = swap ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();
  let dragged = null;
  let downXY = null;

  function setPointer(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickTile(e) {
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(tileGroups.flatMap((t) => t.children));
    return hits.length > 0 ? hits[0].object.parent : null;
  }

  function onPointerDown(e) {
    const group = pickTile(e);
    if (!group) return;
    dragged = group;
    downXY = { x: e.clientX, y: e.clientY };
    group.position.z = 2;
    group.scale.set(1.05, 1.05, 1.05);
    setTileEmissive(group, DRAG_EMISSIVE);
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    group.userData.grabOffset = group.position.clone().sub(hitPoint);
    group.userData.grabOffset.z = 0;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* older browsers */
    }
  }

  function onPointerMove(e) {
    if (!dragged) return;
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      dragged.position.copy(hitPoint.add(dragged.userData.grabOffset));
      dragged.position.z = 2;
    }
  }

  function onPointerUp(e) {
    if (!dragged) return;
    const group = dragged;
    dragged = null;
    group.scale.set(1, 1, 1);
    setTileEmissive(group, IDLE_EMISSIVE);
    const tileId = group.userData.tileId;
    const moved = downXY
      ? Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y)
      : Infinity;
    downXY = null;
    if (moved < TAP_SLOP_PX) {
      snapBack(tileId);
      if (api.onTap) api.onTap(tileId);
      return;
    }
    // Drop: nearest slot within reach, else snap back.
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n * n; i++) {
      const p = slotPos(i);
      const d = Math.hypot(group.position.x - p.x, group.position.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0 && bestDist < STEP * 1.2) {
      if (api.onDrop) api.onDrop(tileId, best);
      else snapBack(tileId);
    } else {
      snapBack(tileId);
    }
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', fitCamera);

  // ---- Public API ----
  function layout(placement, rotations, snap) {
    for (let slot = 0; slot < n * n; slot++) {
      const tileId = placement[slot];
      slotOfTile[tileId] = slot;
      const group = tileGroups[tileId];
      const p = slotPos(slot);
      group.userData.target.copy(p);
      group.userData.targetRotZ = -rotations[tileId] * (Math.PI / 2);
      if (snap || reducedMotion) {
        group.position.copy(p);
        group.rotation.z = group.userData.targetRotZ;
      }
    }
  }

  function tapRotate(tileId) {
    const group = tileGroups[tileId];
    group.userData.targetRotZ -= Math.PI / 2; // continuous — no wrap snap
    if (reducedMotion) group.rotation.z = group.userData.targetRotZ;
  }

  function moveTileToSlot(tileId, slot) {
    slotOfTile[tileId] = slot;
    const group = tileGroups[tileId];
    group.userData.target.copy(slotPos(slot));
    group.position.z = 0;
  }

  function snapBack(tileId) {
    const group = tileGroups[tileId];
    group.userData.target.copy(slotPos(slotOfTile[tileId]));
    group.position.z = 0;
  }

  let celebrateTimer = 0;
  function celebrate() {
    tileGroups.forEach((g) => setTileEmissive(g, DRAG_EMISSIVE));
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      tileGroups.forEach((g) => setTileEmissive(g, IDLE_EMISSIVE));
    }, 1600);
  }

  // ---- Loop ----
  let raf = 0;
  const clock = new THREE.Clock();
  function animate() {
    raf = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) {
      ring.rotation.z -= delta * 0.15;
      stars.rotation.y += delta * 0.01;
    }
    const posLerp = reducedMotion ? 1 : 0.25;
    const rotLerp = reducedMotion ? 1 : 0.2;
    for (const group of tileGroups) {
      if (group !== dragged) {
        group.position.lerp(group.userData.target, posLerp);
      }
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, group.userData.targetRotZ, rotLerp);
    }
    composer.render();
  }
  animate();

  function dispose() {
    cancelAnimationFrame(raf);
    clearTimeout(celebrateTimer);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', fitCamera);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) =>
          m.dispose()
        );
      }
    });
    if (composer.dispose) composer.dispose();
    renderer.dispose();
  }

  return {
    onTap(fn) {
      api.onTap = fn;
    },
    onDrop(fn) {
      api.onDrop = fn;
    },
    layout,
    tapRotate,
    moveTileToSlot,
    snapBack,
    celebrate,
    dispose,
  };
}
