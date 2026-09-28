/**
 * Convergence — three.js 3D audio-reactive field renderer.
 * The same force model as the 2D build, now in a volume: bass pulls the
 * point cloud toward the core, mids swirl it around the vertical axis,
 * treble scatters it. Camera slowly orbits (frozen under reduced motion).
 * Zero network calls. No postprocessing — the only glow is the localized
 * core sprite, which follows the bass like the 2D build's core.
 */
import * as THREE from 'three';
import { FIELD_R, makeParticle3D, stepConvergence3D } from './engine.js';

/** HSL (h 0..360, s/l 0..1) -> [r, g, b] 0..1. Pure, headless-testable. */
export function hslToRgb(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}

/** Core glow radius for a bass level, mirroring the 2D build's core. */
export function coreRadiusFor(bass) {
  return 26 + bass * 90;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCoreTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(160,240,255,0.35)');
  grad.addColorStop(1, 'rgba(160,240,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFieldScene(canvas, options = {}) {
  const { reducedMotion = false } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000208, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);

  const rng = mulberry(20260927);
  let particles = [];
  let positions = new Float32Array(0);
  let colors = new Float32Array(0);
  let geo = null;
  let points = null;
  let pointsMat = null;

  function build(count) {
    if (points) {
      scene.remove(points);
      geo.dispose();
      pointsMat.dispose();
    }
    particles = [];
    for (let i = 0; i < count; i++) particles.push(makeParticle3D(rng));
    positions = new Float32Array(count * 3);
    colors = new Float32Array(count * 3);
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    pointsMat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    points = new THREE.Points(geo, pointsMat);
    points.frustumCulled = false;
    scene.add(points);
  }
  build(700);

  // core glow sprite (localized, follows the bass)
  const coreTex = makeCoreTexture();
  const coreMat = new THREE.SpriteMaterial({
    map: coreTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5,
  });
  const core = new THREE.Sprite(coreMat);
  scene.add(core);

  let camAngle = 0.6;
  let disposed = false;

  const params = { count: 700, strength: 1, hueShift: 190, paused: false };

  /**
   * Advance + draw one frame. levels: {bass, mid, treble} in 0..1.
   * nowMs drives color shimmer; pass 0 under reduced motion for a still.
   */
  function setState(levels, dt, nowMs) {
    if (disposed || !points) return;
    if (particles.length !== params.count) build(params.count);

    if (!params.paused && dt > 0) {
      for (const p of particles) stepConvergence3D(p, levels, dt, params.strength);
    }

    const t = nowMs / 1000;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const hue = params.hueShift + p.hue * 0.25 + levels.mid * 60 + (reducedMotion ? 0 : Math.sin(t * 2 + p.hue) * 8);
      const [r, g, b] = hslToRgb(hue, 0.9, 0.45 + levels.treble * 0.3);
      const bright = 0.35 + levels.bass * 0.65;
      colors[i * 3] = r * bright;
      colors[i * 3 + 1] = g * bright;
      colors[i * 3 + 2] = b * bright;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    // core follows the bass
    const cr = coreRadiusFor(levels.bass) * 0.32;
    core.scale.set(cr * 2, cr * 2, 1);
    coreMat.opacity = 0.3 + levels.bass * 0.45;
    coreMat.color.setHSL(params.hueShift / 360, 0.95, 0.6);

    // slow camera orbit (frozen under reduced motion)
    if (!reducedMotion && dt > 0) camAngle += dt * 0.12;
    const camR = FIELD_R * 2.7;
    camera.position.set(Math.cos(camAngle) * camR, FIELD_R * 1.15, Math.sin(camAngle) * camR);
    camera.lookAt(0, 0, 0);
  }

  function render() {
    if (!disposed) renderer.render(scene, camera);
  }

  function setParams(next) {
    Object.assign(params, next);
  }

  function resize(w, h) {
    if (disposed) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    disposed = true;
    if (geo) geo.dispose();
    if (pointsMat) pointsMat.dispose();
    coreTex.dispose();
    coreMat.dispose();
    renderer.dispose();
  }

  // first frame is never blank
  setState({ bass: 0.2, mid: 0.2, treble: 0.1 }, 0, 0);
  render();

  return { setState, setParams, render, resize, dispose };
}
