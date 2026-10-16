// hole3d.js — the Hitchhiker's Guide singularity in true 3D.
//
// The 2D orbital plane (singularity.js, untouched) is laid onto a tilted
// group so bodies visibly swing around the hole with real depth. The black
// hole is a black sphere with a thin cyan rim; the accretion disk is a set
// of glowing flow particles orbiting at different radii. Launched bodies
// become colored spheres (instanced-material cache keeps it cheap); impact
// flashes become expanding rings in the orbital plane. The starfield is a
// 3D point shell. Everything is MeshBasicMaterial: no lights, no
// postprocessing, no shadows — mobile-friendly by construction.
//
// createHoleScene(canvas, { reducedMotion }) ->
//   { sync(world, slabImage), render(dt), resize(w,h), dispose() }

import * as THREE from 'three';
import { TIERS } from './singularity.js';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';

export const WORLD_SCALE = 0.022; // world px -> scene units
export const PLANE_TILT = -Math.PI / 3; // orbital plane tilt about the X axis
export const ACCRETION_COUNT = 56;
export const FLASH_TTL = 0.6; // matches singularity.js flash aging

// World (px) -> scene position inside the tilted orbital group.
export function bodyScenePos(x, y, w, h) {
  return [(x - w / 2) * WORLD_SCALE, 0, (y - h / 2) * WORLD_SCALE];
}

export function createHoleScene(canvas, opts = {}) {
  const reducedMotion = !!opts.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and render() below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: "HITCHHIKER'S GUIDE" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010103);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  const CAM_R = 27;
  const CAM_Y = 17;
  let camAngle = 0.7;
  function placeCamera() {
    camera.position.set(Math.sin(camAngle) * CAM_R, CAM_Y, Math.cos(camAngle) * CAM_R);
    camera.lookAt(0, 0, 0);
  }
  placeCamera();

  // The orbital plane: 2D world coords land in this group's XZ plane.
  const group = new THREE.Group();
  group.rotation.x = PLANE_TILT;
  scene.add(group);

  // --- 3D starfield shell ---
  {
    const n = 520;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 70 + Math.random() * 120;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.7 - 8;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xcfefff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8 })
    );
    scene.add(stars);
  }

  // --- black hole (rebuilt when world dims change) ---
  let holeKey = '';
  const holeGroup = new THREE.Group();
  group.add(holeGroup);
  function ensureHole(w, h) {
    const key = `${w}x${h}`;
    if (key === holeKey) return;
    holeKey = key;
    while (holeGroup.children.length) {
      const c = holeGroup.children.pop();
      c.geometry.dispose();
      c.material.dispose();
    }
    const hr = Math.max(28, Math.min(w, h) * 0.07) * WORLD_SCALE;
    const black = new THREE.Mesh(
      new THREE.SphereGeometry(hr, 28, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    holeGroup.add(black);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(hr * 1.03, hr * 0.045, 10, 72),
      new THREE.MeshBasicMaterial({ color: 0x66f6ff })
    );
    rim.rotation.x = Math.PI / 2;
    holeGroup.add(rim);
    // two soft translucent disk bands around the rim
    const bands = [
      [1.55, 0.07, 0x00ffff, 0.32],
      [2.15, 0.05, 0x0088aa, 0.18],
    ];
    for (const [rf, tube, color, op] of bands) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(hr * rf, hr * tube, 8, 72),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op })
      );
      band.rotation.x = Math.PI / 2;
      holeGroup.add(band);
    }
    // accretion flow: glowing particles orbiting at staggered radii
    const flow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(hr * 0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x9ff6ff }),
      ACCRETION_COUNT
    );
    flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flow.userData.parts = [];
    for (let i = 0; i < ACCRETION_COUNT; i++) {
      flow.userData.parts.push({
        r: hr * (1.35 + Math.random() * 0.9),
        a: Math.random() * Math.PI * 2,
        // inner particles orbit faster (Kepler-ish)
        w: (1.4 + Math.random() * 0.8) / (1 + (i % 5) * 0.22),
      });
    }
    holeGroup.add(flow);
    holeGroup.userData.flow = flow;
  }

  // --- launched bodies: pooled spheres, materials cached by color ---
  const bodyGeo = new THREE.SphereGeometry(1, 14, 10);
  const matCache = new Map();
  let slabTexture = null;
  function bodyMaterial(color, useSlab) {
    const key = `${color}|${useSlab ? 'slab' : 'flat'}`;
    if (!matCache.has(key)) {
      const params = { color: new THREE.Color(color) };
      if (useSlab && slabTexture) params.map = slabTexture;
      matCache.set(key, new THREE.MeshBasicMaterial(params));
    }
    return matCache.get(key);
  }
  const bodyPool = [];
  function bodyMesh(i) {
    if (!bodyPool[i]) {
      const m = new THREE.Mesh(bodyGeo, bodyMaterial('#ffffff', false));
      m.visible = false;
      group.add(m);
      bodyPool[i] = m;
    }
    return bodyPool[i];
  }

  // --- impact flashes: pooled expanding rings in the orbital plane ---
  const flashGeo = new THREE.TorusGeometry(1, 0.045, 8, 40);
  const flashPool = [];
  function flashMesh(i) {
    if (!flashPool[i]) {
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      group.add(m);
      flashPool[i] = m;
    }
    return flashPool[i];
  }

  const slabTierIndex = TIERS.length - 1;

  function sync(world, slabImage) {
    ensureHole(world.width, world.height);
    if (slabImage && slabImage !== sync._slabImg) {
      sync._slabImg = slabImage;
      if (slabTexture) slabTexture.dispose();
      slabTexture = new THREE.CanvasTexture(slabImage);
      slabTexture.colorSpace = THREE.SRGBColorSpace;
      // drop cached slab materials so they pick up the new texture
      for (const k of [...matCache.keys()]) {
        if (k.endsWith('|slab')) {
          matCache.get(k).dispose();
          matCache.delete(k);
        }
      }
    }

    for (let i = 0; i < world.bodies.length; i++) {
      const b = world.bodies[i];
      const m = bodyMesh(i);
      const useSlab = b.tierIndex === slabTierIndex && !!slabTexture;
      const want = bodyMaterial(b.color, useSlab);
      if (m.material !== want) m.material = want;
      const [px, , pz] = bodyScenePos(b.x, b.y, world.width, world.height);
      m.position.set(px, 0, pz);
      m.scale.setScalar(Math.max(0.06, b.radius * WORLD_SCALE));
      m.visible = true;
    }
    for (let i = world.bodies.length; i < bodyPool.length; i++) bodyPool[i].visible = false;

    for (let i = 0; i < world.flashes.length; i++) {
      const f = world.flashes[i];
      const m = flashMesh(i);
      const want = bodyMaterial(f.color, false);
      if (m.material !== want) m.material = want;
      // under reduced motion the world never ages flashes; show them popped
      const t = reducedMotion ? 0.85 : Math.min(1, f.age / FLASH_TTL);
      const [px, , pz] = bodyScenePos(f.x, f.y, world.width, world.height);
      m.position.set(px, 0, pz);
      m.scale.setScalar(Math.max(0.06, (6 + t * 46) * WORLD_SCALE));
      m.material.opacity = Math.max(0, 1 - t);
      m.visible = true;
    }
    for (let i = world.flashes.length; i < flashPool.length; i++) flashPool[i].visible = false;
  }

  const _m4 = new THREE.Matrix4();

  function render(dt) {
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const flow = holeGroup.userData.flow;
    if (flow && !reducedMotion) {
      for (let i = 0; i < ACCRETION_COUNT; i++) {
        const p = flow.userData.parts[i];
        p.a += p.w * dt;
        _m4.makeTranslation(Math.cos(p.a) * p.r, 0, Math.sin(p.a) * p.r);
        flow.setMatrixAt(i, _m4);
      }
      flow.instanceMatrix.needsUpdate = true;
    }
    if (!reducedMotion) {
      camAngle += dt * 0.05; // slow cinematic drift
      placeCamera();
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
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isPoints) {
        if (obj.geometry && obj.geometry !== bodyGeo && obj.geometry !== flashGeo) obj.geometry.dispose();
        // materials live in matCache; disposed below
      }
    });
    bodyGeo.dispose();
    flashGeo.dispose();
    for (const m of matCache.values()) m.dispose();
    matCache.clear();
    if (slabTexture) slabTexture.dispose();
    renderer.dispose();
  }

  return { sync, render, resize, dispose };
}
