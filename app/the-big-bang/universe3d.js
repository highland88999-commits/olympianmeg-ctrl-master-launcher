/**
 * The Big Bang — three.js 3D universe renderer.
 * Pure helpers (headless-testable, no DOM) + createUniverseScene(canvas, opts).
 *
 * The same seeded particle field from cosmos.js is rendered as a true 3D
 * point cloud: the camera pulls back as the universe expands, the galaxy
 * stage swirls in depth, and the finale crossfades to a 3D solar system.
 * Zero network calls. No postprocessing (lighting rule: the only glows are
 * the bang flash itself and the sun, both localized).
 */
import * as THREE from 'three';
import {
  makeParticles,
  starColor,
  starBrightness,
  expansionFactor,
  stageFor,
  PLANETS,
  planetAngle,
} from './cosmos.js';

// ---------------------------------------------------------------------------
// Pure helpers (no DOM, no three.js scene objects)
// ---------------------------------------------------------------------------

export const WORLD_R = 60; // world radius of the fully expanded universe
export const PARTICLE_HIGH = 2600;
export const PARTICLE_LOW = 1400;
export const PARTICLE_SEED = 20260927;

/** Fewer particles on low-power devices; pure so it is headless-testable. */
export function pickParticleCount(lowPower) {
  return lowPower ? PARTICLE_LOW : PARTICLE_HIGH;
}

export function smoothstep(a, b, x) {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/**
 * Camera distance for normalized time t. Pulls back as the universe
 * expands, then eases in to frame the solar system at the end.
 */
export function cameraDistanceFor(t) {
  const c = Math.max(0, Math.min(1, t));
  const e = expansionFactor(c);
  const solar = smoothstep(0.86, 0.97, c);
  const far = 26 + e * 120;
  return far * (1 - solar) + 105 * solar;
}

/** 0 before the solar stage, 1 when the solar system owns the frame. */
export function solarBlendFor(t) {
  return smoothstep(0.86, 0.96, Math.max(0, Math.min(1, t)));
}

/** Flash intensity 1 -> 0 across the first 3% of time; 0 afterwards. */
export function flashFor(t) {
  if (t >= 0.03) return 0;
  return 1 - t / 0.03;
}

/** Galaxy-stage swirl weight, mirroring the 2D build's staging. */
export function swirlWeightFor(t) {
  const stage = stageFor(t);
  if (stage.id === 'galaxies') return 1;
  if (stage.id === 'stars') return 0.3;
  if (stage.id === 'solar' || stage.id === 'present') return 0.15;
  return 0;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function makeGlowTexture(inner, mid) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createUniverseScene(canvas, options = {}) {
  const { reducedMotion = false } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x010102, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1200);

  const lowPower =
    (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4) ||
    Math.min(window.innerWidth, window.innerHeight) < 500;
  const COUNT = pickParticleCount(lowPower);
  const parts = makeParticles(PARTICLE_SEED, COUNT);

  // --- starfield point cloud ---
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const pointsMat = new THREE.PointsMaterial({
    size: 2.6,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, pointsMat);
  points.frustumCulled = false;
  scene.add(points);

  // --- the flash: one localized glow sprite at the origin ---
  const flashTex = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,240,220,0.55)');
  const flashMat = new THREE.SpriteMaterial({
    map: flashTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);
  scene.add(flash);

  // --- solar system group (built once, crossfaded in late) ---
  const solar = new THREE.Group();
  solar.rotation.x = 0.16;
  const solarMats = [];
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true });
  solarMats.push(sunMat);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 18), sunMat);
  solar.add(sun);
  const sunGlowTex = makeGlowTexture('rgba(255,248,232,1)', 'rgba(255,170,70,0.5)');
  const sunGlowMat = new THREE.SpriteMaterial({
    map: sunGlowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  solarMats.push(sunGlowMat);
  const sunGlow = new THREE.Sprite(sunGlowMat);
  sunGlow.scale.set(20, 20, 1);
  solar.add(sunGlow);

  const planetMeshes = [];
  for (const pl of PLANETS) {
    const orbitR = pl.radius * WORLD_R;
    const seg = 128;
    const orbitPts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      orbitPts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR));
    }
    const orbitMat = new THREE.LineBasicMaterial({ color: 0x8ea4d8, transparent: true, opacity: 0.28 });
    solarMats.push(orbitMat);
    solar.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPts), orbitMat));

    const pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pl.color), transparent: true });
    solarMats.push(pMat);
    const pm = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.7, pl.size * 0.5), 18, 14), pMat);
    if (pl.ring) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe8d8a8,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      solarMats.push(ringMat);
      const ring = new THREE.Mesh(new THREE.RingGeometry(pm.geometry.parameters.radius * 1.4, pm.geometry.parameters.radius * 2.1, 40), ringMat);
      ring.rotation.x = Math.PI / 2 - 0.4;
      pm.add(ring);
    }
    solar.add(pm);
    planetMeshes.push({ def: pl, mesh: pm, orbitR });
  }
  solar.visible = false;
  scene.add(solar);

  let lastT = -1;
  let lastColorT = -1;
  let swirl = 0;
  let disposed = false;

  function updateParticles(t) {
    const e = expansionFactor(t);
    const blend = solarBlendFor(t);
    const starAlpha = 1 - blend;
    const cosS = Math.cos(swirl);
    const sinS = Math.sin(swirl);
    const doColor = Math.abs(t - lastColorT) > 0.0015 || lastColorT < 0;
    for (let i = 0; i < COUNT; i++) {
      const p = parts[i];
      const r = WORLD_R * e * p.speed;
      const x = p.dx * r;
      const y = p.dy * r;
      const z = p.dz * r;
      positions[i * 3] = x * cosS - y * sinS;
      positions[i * 3 + 1] = x * sinS + y * cosS;
      positions[i * 3 + 2] = z;
      if (doColor) {
        const b = starBrightness(p, t) * starAlpha;
        if (b <= 0.01) {
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
        } else {
          const [cr, cg, cb] = starColor(p, t);
          colors[i * 3] = (cr / 255) * b;
          colors[i * 3 + 1] = (cg / 255) * b;
          colors[i * 3 + 2] = (cb / 255) * b;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    if (doColor) {
      geo.attributes.color.needsUpdate = true;
      lastColorT = t;
    }
    pointsMat.opacity = 1;
  }

  function setTime(t, dt = 0) {
    if (disposed) return;
    const c = Math.max(0, Math.min(1, t));
    if (!reducedMotion && dt > 0) {
      swirl += dt * 2.4 * swirlWeightFor(c);
      points.rotation.y += dt * 0.008; // barely-there idle drift
    }
    const moved = Math.abs(c - lastT) > 1e-6 || swirl !== setTime._lastSwirl;
    if (moved || lastT < 0) {
      updateParticles(c);
      setTime._lastSwirl = swirl;
      lastT = c;
    }

    // camera pull-back
    const dist = cameraDistanceFor(c);
    camera.position.set(0, dist * 0.3, dist);
    camera.lookAt(0, 0, 0);

    // flash
    const f = flashFor(c);
    flash.visible = f > 0;
    if (flash.visible) {
      const e = Math.max(expansionFactor(c), 0.0005);
      const s = 6 + e * WORLD_R * 1.1;
      flash.scale.set(s, s, 1);
      flashMat.opacity = Math.min(1, f * 1.2);
    }

    // solar crossfade
    const blend = solarBlendFor(c);
    solar.visible = blend > 0.001;
    if (solar.visible) {
      const u = Math.min(1, (c - 0.86) / 0.14);
      for (const m of solarMats) m.opacity = m === sunGlowMat ? blend : blend * (m.userData.baseOpacity ?? 1);
      for (const { def, mesh, orbitR } of planetMeshes) {
        const ang = planetAngle(def, u, def.radius * 40);
        mesh.position.set(Math.cos(ang) * orbitR, 0, Math.sin(ang) * orbitR * 0.92);
      }
    }
  }
  setTime._lastSwirl = 0;

  // capture base opacities for the crossfade
  for (const m of solarMats) m.userData.baseOpacity = m.opacity;

  function render() {
    if (!disposed) renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (disposed) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    disposed = true;
    geo.dispose();
    pointsMat.dispose();
    flashTex.dispose();
    flashMat.dispose();
    sunGlowTex.dispose();
    for (const m of solarMats) m.dispose();
    solar.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    renderer.dispose();
  }

  // initial frame so the first paint is never blank
  setTime(0, 0);
  render();

  return { setTime, render, resize, dispose };
}
