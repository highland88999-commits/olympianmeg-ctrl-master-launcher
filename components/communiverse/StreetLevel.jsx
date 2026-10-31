// Communiverse — StreetLevel: stand ON a forged world, at ground level.
//
// The orbit preview (MiniViewport + buildWorld) shows the planet from
// space; this is the other half of Merlin's ask (2026-10-22): clicking a
// world brings you to STREET LEVEL of that world. The terrain is rebuilt
// from the same generation_params the planet was forged from — same
// terrain type palette as lib/world-engine/world-builder.js, same sun
// color — flattened into a walkable ground plane with procedural
// structures scattered by a seed derived from the params themselves, so
// every visitor lands on the same streets of the same world.
//
// Controls: drag to look around, W A S D / arrow keys or the on-screen
// pad to walk. No collisions to tune: structures are visual landmarks,
// the ground height function is shared by the mesh, the landmarks and
// the camera, so you always walk ON the terrain.
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { lifeSeedFromParams } from '@/lib/world-engine/life-seed';
import { buildFloraSpecimen, buildFaunaSpecimen } from '@/lib/world-engine/life-render';

// Terrain palettes mirror lib/world-engine/world-builder.js PALETTES:
// [low, mid, high, accent].
const PALETTES = {
  alien: [0x2a0a4a, 0x6b21a8, 0xc084fc, 0x2dd4bf],
  desert: [0x8a5a2b, 0xd9a05b, 0xf5d9a0, 0x6b4226],
  ocean: [0x0a2a5e, 0x1e5fa8, 0x7fd4ff, 0x2dd4bf],
  mountains: [0x2b2f36, 0x6b7280, 0xf3f4f6, 0x9ca3af],
  plains: [0x1a4d2e, 0x3d8b4f, 0xa3d9a5, 0xd9c05b],
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Small deterministic 2D value noise (fbm), shared by mesh + camera.
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rand(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + u * (b - a) + v * (c - a) + u * v * (a - b - c + d);
  };
  return (x, y) => noise(x, y) * 0.6 + noise(x * 2.13, y * 2.13) * 0.28 + noise(x * 4.31, y * 4.31) * 0.12;
}

export default function StreetLevel({ params }) {
  const mountRef = useRef(null);
  const keysRef = useRef({ fwd: false, back: false, left: false, right: false });
  const padRef = useRef({ fwd: false, back: false, left: false, right: false });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;
    const p = params || {};
    const terrainType = PALETTES[p.terrainType] ? p.terrainType : 'alien';
    const palette = PALETTES[terrainType];
    const roughness = Math.min(1, Math.max(0.05, Number(p.terrainRoughness) || 0.5));
    const sunColor = new THREE.Color(p.sunColor || '#c084fc');
    const seed = hashStr(JSON.stringify(p));
    const fbm = makeNoise2D(seed);
    const groundH = (x, z) => (fbm(x * 0.045 + 13.7, z * 0.045 + 7.9) - 0.5) * 2 * roughness * 6;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette[0]).lerp(new THREE.Color(0x000000), 0.35);
    scene.fog = new THREE.Fog(scene.background.getHex(), 40, 160);

    const camera = new THREE.PerspectiveCamera(68, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const contextGuard = guardCanvasContext(renderer.domElement, { label: 'COMMUNIVERSE STREET' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(sunColor.getHex(), palette[0], 0.9));
    const sun = new THREE.DirectionalLight(sunColor.getHex(), 1.6);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    // --- ground: displaced plane, vertex colors by height ---
    const SIZE = 240, SEG = 110;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(palette[0]), cMid = new THREE.Color(palette[1]);
    const cHigh = new THREE.Color(palette[2]);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundH(x, z);
      pos.setY(i, h);
      const t = Math.min(1, Math.max(0, (h / (roughness * 6)) * 0.5 + 0.5));
      if (t < 0.5) tmp.copy(cLow).lerp(cMid, t * 2); else tmp.copy(cMid).lerp(cHigh, (t - 0.5) * 2);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

    // --- landmarks: deterministic scatter from the world seed ---
    const rand = mulberry32(seed ^ 0x9e3779b9);
    const accent = new THREE.MeshStandardMaterial({ color: palette[3], roughness: 0.4, emissive: palette[3], emissiveIntensity: 0.25 });
    const midMat = new THREE.MeshStandardMaterial({ color: palette[1], roughness: 0.8 });
    const highMat = new THREE.MeshStandardMaterial({ color: palette[2], roughness: 0.7 });
    for (let i = 0; i < 130; i++) {
      const x = (rand() - 0.5) * (SIZE - 30);
      const z = (rand() - 0.5) * (SIZE - 30);
      if (Math.hypot(x, z) < 9) continue; // keep the landing spot clear
      const kind = rand();
      let mesh;
      if (kind < 0.45) { // tower / building
        const hgt = 2 + rand() * 9;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6 + rand() * 2.4, hgt, 1.6 + rand() * 2.4), rand() < 0.3 ? accent : midMat);
        mesh.position.set(x, groundH(x, z) + hgt / 2 - 0.2, z);
      } else if (kind < 0.8) { // spire / tree
        const hgt = 2.5 + rand() * 5;
        mesh = new THREE.Mesh(new THREE.ConeGeometry(1 + rand() * 1.4, hgt, 6), rand() < 0.4 ? accent : highMat);
        mesh.position.set(x, groundH(x, z) + hgt / 2 - 0.2, z);
      } else { // monolith block
        const s = 1 + rand() * 2;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * (1 + rand()), s), highMat);
        mesh.position.set(x, groundH(x, z) + s / 2, z);
        mesh.rotation.y = rand() * Math.PI;
      }
      scene.add(mesh);
    }

    // --- LIFE: the seed-grown flora + fauna ---
    // Same life seed as the orbit view — the ground blooms with the
    // same flora and roams with the same fauna the planet shows from space.
    const life = lifeSeedFromParams(params);
    if (life) {
      const lifeRand = mulberry32((seed ^ 0x5bd1e995) >>> 0);
      // Flora: scatter specimens
      for (const flora of life.flora) {
        const specimen = buildFloraSpecimen(THREE, flora);
        const count = Math.round(8 + flora.density * 24);
        for (let i = 0; i < count; i++) {
          const inst = specimen.clone();
          const x = (lifeRand() - 0.5) * (SIZE - 20);
          const z = (lifeRand() - 0.5) * (SIZE - 20);
          if (Math.hypot(x, z) < 8) continue; // keep landing clear
          inst.position.set(x, groundH(x, z), z);
          inst.rotation.y = lifeRand() * Math.PI * 2;
          const s = 0.8 + lifeRand() * 0.7;
          inst.scale.setScalar(s);
          scene.add(inst);
        }
      }
      // Fauna: a few wanderers (static poses — full animation is orbit-view)
      for (const fauna of life.fauna.slice(0, 3)) {
        const specimen = buildFaunaSpecimen(THREE, fauna);
        const count = Math.min(4, fauna.count);
        for (let i = 0; i < count; i++) {
          const inst = specimen.clone(true);
          const x = (lifeRand() - 0.5) * (SIZE - 30);
          const z = (lifeRand() - 0.5) * (SIZE - 30);
          if (Math.hypot(x, z) < 10) continue;
          inst.position.set(x, groundH(x, z), z);
          inst.rotation.y = lifeRand() * Math.PI * 2;
          inst.scale.multiplyScalar(0.9);
          scene.add(inst);
        }
      }
    }

    // --- first-person walk: drag to look, keys/pad to move ---
    const state = { x: 0, z: 14, yaw: Math.PI, pitch: 0 };
    let dragging = false, lastX = 0, lastY = 0;
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onMove = (e) => {
      if (!dragging) return;
      state.yaw -= (e.clientX - lastX) * 0.005;
      state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    const onKey = (down) => (e) => { const k = KEYMAP[e.code]; if (k) keysRef.current[k] = down; };
    const onKeyDown = onKey(true), onKeyUp = onKey(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (contextGuard.isLost()) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const keys = keysRef.current, pad = padRef.current;
      const speed = 10 * dt;
      const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
      if (keys.fwd || pad.fwd) { state.x += -sin * speed; state.z += -cos * speed; }
      if (keys.back || pad.back) { state.x += sin * speed; state.z += cos * speed; }
      if (keys.left || pad.left) { state.x += -cos * speed; state.z += sin * speed; }
      if (keys.right || pad.right) { state.x += cos * speed; state.z += -sin * speed; }
      const lim = SIZE / 2 - 6;
      state.x = Math.max(-lim, Math.min(lim, state.x));
      state.z = Math.max(-lim, Math.min(lim, state.z));
      camera.position.set(state.x, groundH(state.x, state.z) + 1.7, state.z);
      const look = new THREE.Vector3(
        state.x - sin * Math.cos(state.pitch),
        camera.position.y + Math.sin(state.pitch),
        state.z - cos * Math.cos(state.pitch)
      );
      camera.lookAt(look);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('pointerdown', onDown);
      renderer.dispose();
      if (el.parentNode === container) container.removeChild(el);
    };
  }, [params]);

  const padBtn = (key, label, className) => (
    <button
      type="button"
      aria-label={label}
      className={'min-h-[44px] min-w-[44px] rounded-lg bg-black/55 border border-white/25 text-white text-lg backdrop-blur ' + (className || '')}
      onPointerDown={(e) => { e.preventDefault(); padRef.current[key] = true; }}
      onPointerUp={() => { padRef.current[key] = false; }}
      onPointerLeave={() => { padRef.current[key] = false; }}
      onPointerCancel={() => { padRef.current[key] = false; }}
    >
      {label}
    </button>
  );

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1.5 w-[148px]">
        <span />
        {padBtn('fwd', '↑')}
        <span />
        {padBtn('left', '←')}
        {padBtn('back', '↓')}
        {padBtn('right', '→')}
      </div>
      <p className="absolute bottom-3 left-3 text-[11px] text-white/70 bg-black/45 rounded px-2 py-1 backdrop-blur">
        Drag to look · WASD / arrows / pad to walk
      </p>
    </div>
  );
}
