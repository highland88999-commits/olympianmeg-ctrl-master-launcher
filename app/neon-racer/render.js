// Neon Racer — CGI three.js renderer (Merlin, Nov 28, from his phone
// video: "serious upgrade using cgi"). Replaces the flat 2D canvas
// pseudo-3D renderer. Same exported API, so page.jsx and game.js are
// untouched: createRenderer(canvas, opts) -> { resize, render,
// addShake, dispose }.
//
// The scene graph lives in lib/neon-racer/cgi.js (builders + world);
// this shell owns the WebGLRenderer, the camera, and the frame.
// Camera framing reproduces the 2D projection exactly (neonCameraFov):
// the whole flight corridor stays readable on a phone, exactly as
// before. Budgets: 2 real lights, no shadow maps, pixel ratio capped
// at 2 (mobile GPU rule, same spirit as the old no-shadowBlur note).

import * as THREE from 'three';
import { isLightspeed } from './game.js';
import {
  createNeonWorld,
  neonCameraFov,
  CAM_DIST,
  NEON_PALETTE,
} from '../../lib/neon-racer/cgi.js';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';

export function createRenderer(canvas, opts = {}) {
  const reducedMotion = !!opts.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and render() below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'NEON RACER' });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NEON_PALETTE.bg);
  scene.fog = new THREE.Fog(NEON_PALETTE.bg, 70, 230);

  const world = createNeonWorld();
  scene.add(world.group);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 0, -CAM_DIST);
  camera.lookAt(0, 0, 0);

  let w = 0;
  let h = 0;
  let baseFov = 45;
  let shake = 0;
  let fogK = 0;
  let disposed = false;
  const fogNormal = new THREE.Color(NEON_PALETTE.bg);
  const fogWarp = new THREE.Color(0x14060f);

  function resize() {
    if (disposed) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width * dpr));
    h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    baseFov = neonCameraFov(camera.aspect);
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }

  function render(state, now, dt) {
    if (disposed || w === 0) return;
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const warp = state.phase === 'playing' && isLightspeed(state);

    world.update(state, now, dt, { reducedMotion });

    // Camera: fixed chase position behind the ship plane (the 2D
    // projection's viewpoint), plus shake. FOV kicks out in lightspeed.
    const targetFov = warp && !reducedMotion ? baseFov + 12 : baseFov;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
    if (shake > 0.2 && !reducedMotion) {
      camera.position.set(
        (Math.random() - 0.5) * shake * 0.12,
        (Math.random() - 0.5) * shake * 0.12,
        -CAM_DIST);
      shake *= 0.88;
    } else {
      shake = 0;
      camera.position.set(0, 0, -CAM_DIST);
    }
    camera.lookAt(0, 0, 0);

    // Warp tint: fog leans magenta while lightspeed holds.
    const targetK = warp && !reducedMotion ? 1 : 0;
    fogK += (targetK - fogK) * Math.min(1, dt * 4);
    scene.fog.color.lerpColors(fogNormal, fogWarp, fogK);

    renderer.render(scene, camera);
  }

  function addShake(v) {
    if (!reducedMotion) shake = Math.min(14, shake + v);
  }

  function isLost() {
    return contextGuard.isLost();
  }

  function dispose() {
    disposed = true;
    contextGuard.dispose();
    world.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    });
    renderer.dispose();
  }

  return { resize, render, addShake, dispose, isLost };
}
