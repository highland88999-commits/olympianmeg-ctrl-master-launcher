// app/dream-engine/ar/page.jsx — DREAM ENGINE AR ("magic window").
//
// From-scratch AR, no third-party services (Merlin, 2026-11-02).
// iOS Safari has no WebXR, so this is gyro AR: the live rear-camera feed
// is the background, the gyroscope steers a Three.js camera, and dream
// objects float in your room. Turn the phone to look around the dreamscape.
//
// Honest framing: objects sit in your view direction at fixed distances —
// they are NOT pinned to physical surfaces (no SLAM on iOS Safari).

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The 24 dream-object types, ported from components/dream-engine/DreamScene.jsx
// (R3F) to plain Three.js. Each builder returns a THREE.Group in unit-ish
// space. Material roles: main / glow / soft / dark / mirror.
// ---------------------------------------------------------------------------
const TYPE_EMOJI = {
  tower: '🗼', arch: '🌉', staircase: '🪜', door: '🚪', monolith: '🗿',
  sphere: '🔮', crystal: '💎', tree: '🌳', clock: '🕐', bridge: '🌁',
  island: '🏝️', pillar: '🏛️', ring: '💍', pyramid: '🔺', dome: '🛕',
  wall: '🧱', gate: '⛩️', mushroom: '🍄', obelisk: '🗿', 'floating-rock': '🪨',
  'water-plane': '🌊', mountain: '⛰️', candle: '🕯️', mirror: '🪞',
};
const TYPE_NAMES = {
  tower: 'Tower', arch: 'Arch', staircase: 'Staircase', door: 'Door',
  monolith: 'Monolith', sphere: 'Orb', crystal: 'Crystal', tree: 'Tree',
  clock: 'Melting Clock', bridge: 'Bridge', island: 'Floating Island',
  pillar: 'Pillar', ring: 'Ring', pyramid: 'Pyramid', dome: 'Dome',
  wall: 'Wall', gate: 'Gate', mushroom: 'Mushroom', obelisk: 'Obelisk',
  'floating-rock': 'Floating Rock', 'water-plane': 'Water', mountain: 'Mountain',
  candle: 'Candle', mirror: 'Mirror',
};
const ALL_TYPES = Object.keys(TYPE_EMOJI);

// Dreamlike default palette per type (color, emissive).
const TYPE_STYLE = {
  tower: ['#4a3f8f', '#2a1f6e'], arch: ['#5a4a9f', '#1a1a3a'],
  staircase: ['#6a5acd', '#3b2a8f'], door: ['#3a2a6e', '#7a5cff'],
  monolith: ['#241d4d', '#3b2a8f'], sphere: ['#8f7bff', '#5a3cff'],
  crystal: ['#7dd7ff', '#2b7fff'], tree: ['#3a2a6e', '#000000'],
  clock: ['#c9b896', '#ff9a3c'], bridge: ['#5a4a8f', '#2a1a5e'],
  island: ['#2c2358', '#000000'], pillar: ['#6a5a9f', '#2a1a5e'],
  ring: ['#c9a227', '#8a6a00'], pyramid: ['#8a6a3a', '#ff9a3c'],
  dome: ['#4a5a9f', '#2b7fff'], wall: ['#5a4a7f', '#1a1a3a'],
  gate: ['#6a5aaf', '#7a5cff'], mushroom: ['#8f4a7f', '#ff5c8f'],
  obelisk: ['#3a3a5e', '#5a3cff'], 'floating-rock': ['#5a4a6e', '#3b2a8f'],
  'water-plane': ['#2b7fff', '#1a4aaf'], mountain: ['#4a3a6e', '#000000'],
  candle: ['#f5e6c8', '#ff9a3c'], mirror: ['#dfe8ff', '#7dd7ff'],
};

function makeMats(color, emissive) {
  const c = new THREE.Color(color);
  const e = new THREE.Color(emissive);
  const std = (col, em, rough, metal, ei) => new THREE.MeshStandardMaterial({
    color: col, emissive: em, emissiveIntensity: ei, roughness: rough, metalness: metal,
  });
  const softC = c.clone().lerp(new THREE.Color('#ffffff'), 0.35);
  const darkC = c.clone().multiplyScalar(0.5);
  return {
    main: std(c, e, 0.55, 0.35, 0.25),
    glow: std(e.getHex() !== 0 ? e : c, e.getHex() !== 0 ? e : c, 0.3, 0.1, 0.9),
    soft: std(softC, e, 0.6, 0.2, 0.15),
    dark: std(darkC, new THREE.Color('#000000'), 0.7, 0.2, 0),
    mirror: std(new THREE.Color('#dfe8ff'), e, 0.1, 1.0, 0.3),
  };
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// Shared geometries (perf: built once, reused across objects).
const GEO = {};
function initGeo() {
  if (GEO.done) return;
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.sphere = new THREE.SphereGeometry(1, 20, 14);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  GEO.cone = new THREE.ConeGeometry(1, 1, 10);
  GEO.torus = new THREE.TorusGeometry(1, 0.12, 8, 32);
  GEO.octa = new THREE.OctahedronGeometry(1);
  GEO.dodeca = new THREE.DodecahedronGeometry(1);
  GEO.circle = new THREE.CircleGeometry(1, 28);
  GEO.plane = new THREE.PlaneGeometry(1, 1);
  GEO.done = true;
}

function scaled(geoMesh, sx, sy, sz) {
  geoMesh.scale.set(sx, sy, sz);
  return geoMesh;
}

function buildDreamObject(type) {
  initGeo();
  const [color, emissive] = TYPE_STYLE[type] || ['#6a5acd', '#3b2a8f'];
  const M = makeMats(color, emissive);
  const g = new THREE.Group();
  const add = (m) => { g.add(m); return m; };
  // helper: box(w,h,d) at (x,y,z) with material key
  const bx = (w, h, d, x, y, z, mk = 'main') => add(scaled(mesh(GEO.box, M[mk], x, y, z), w, h, d));
  const sp = (r, x, y, z, mk = 'main', w = 20, h = 14) => {
    const geo = (w === 20 && h === 14) ? GEO.sphere : new THREE.SphereGeometry(1, w, h);
    return add(scaled(mesh(geo, M[mk], x, y, z), r, r, r));
  };
  const cy = (rt, rb, h, x, y, z, mk = 'main', seg = 12) => {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    return add(mesh(geo, M[mk], x, y, z));
  };
  const cn = (r, h, x, y, z, mk = 'main', seg = 10) => {
    const geo = new THREE.ConeGeometry(r, h, seg);
    return add(mesh(geo, M[mk], x, y, z));
  };
  const to = (r, tube, x, y, z, mk = 'main', arc = Math.PI * 2) => {
    const geo = new THREE.TorusGeometry(r, tube, 8, 32, arc);
    return add(mesh(geo, M[mk], x, y, z));
  };

  switch (type) {
    case 'tower':
      cy(0.85, 1.05, 5, 0, 2.5, 0); cn(1.25, 1.4, 0, 5.6, 0, 'dark'); sp(0.22, 0, 6.6, 0, 'glow', 10, 10);
      break;
    case 'arch':
      bx(0.55, 3, 0.55, -1.5, 1.5, 0); bx(0.55, 3, 0.55, 1.5, 1.5, 0);
      add(mesh(new THREE.TorusGeometry(1.5, 0.3, 8, 20, Math.PI), M.main, 0, 3, 0));
      break;
    case 'staircase':
      for (let i = 0; i < 8; i++) bx(2, 0.22, 0.7, 0, 0.3 + i * 0.42, -i * 0.62, i % 2 ? 'main' : 'soft');
      sp(0.18, 0, 4.1, -5.2, 'glow', 8, 8);
      break;
    case 'door':
      bx(0.3, 3.2, 0.4, -0.85, 1.6, 0, 'dark'); bx(0.3, 3.2, 0.4, 0.85, 1.6, 0, 'dark');
      bx(2, 0.3, 0.4, 0, 3.3, 0, 'dark');
      { const dg = new THREE.Group(); dg.position.set(-0.68, 0, 0.1); dg.rotation.y = 0.55;
        const panel = scaled(mesh(GEO.box, M.main, 0.68, 1.5, 0), 1.35, 3, 0.12); dg.add(panel);
        dg.add(scaled(mesh(GEO.sphere, M.glow, 1.15, 1.5, 0.12), 0.09, 0.09, 0.09)); g.add(dg); }
      { const glow = mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: new THREE.Color(emissive), emissive: new THREE.Color(emissive), emissiveIntensity: 0.9, transparent: true, opacity: 0.35 }), 0, 1.5, -0.25);
        glow.scale.set(1.5, 3, 1); add(glow); }
      break;
    case 'monolith': bx(1.2, 4.5, 0.45, 0, 2.25, 0); break;
    case 'sphere': sp(1.2, 0, 1.2, 0, 'main', 24, 18); break;
    case 'crystal':
      add(mesh(GEO.octa, M.glow, 0, 1.3, 0)).scale.setScalar(0.85);
      cy(0.5, 0.7, 0.3, 0, 0.15, 0, 'dark', 6);
      break;
    case 'tree':
      cy(0.16, 0.3, 2.2, 0, 1.1, 0, 'dark', 7);
      sp(1.25, 0, 3, 0, 'soft', 14, 12); sp(0.8, 0.8, 2.5, 0.3, 'soft', 12, 10); sp(0.7, -0.7, 2.6, -0.3, 'main', 12, 10);
      break;
    case 'clock': {
      const face = cy(1.45, 1.45, 0.22, 0, 2, 0, 'dark', 28); face.rotation.x = Math.PI / 2;
      const inner = cy(1.28, 1.28, 0.05, 0, 2, 0.13, 'soft', 28); inner.rotation.x = Math.PI / 2;
      const h1 = bx(0.09, 0.85, 0.04, 0, 2.35, 0.2, 'dark'); h1.rotation.z = -0.7;
      const h2 = bx(0.09, 0.65, 0.04, 0.22, 2, 0.2, 'dark'); h2.rotation.z = Math.PI / 2.4;
      cn(0.35, 1.1, 0.5, 0.45, 0, 'soft'); sp(0.16, 0.5, -0.25, 0, 'soft', 8, 8);
      break; }
    case 'bridge':
      bx(7, 0.3, 1.6, 0, 1.1, 0);
      add(mesh(new THREE.TorusGeometry(3.2, 0.16, 8, 24, Math.PI), M.dark, 0, 0.35, 0));
      [-3, -1.5, 0, 1.5, 3].forEach((x) => bx(0.12, 0.8, 0.12, x, 1.6, 0.75, 'dark'));
      break;
    case 'island': {
      const under = cn(2.3, 2.6, 0, -1.1, 0, 'dark', 9); under.rotation.x = Math.PI;
      cy(2.3, 2.05, 0.5, 0, 0.25, 0, 'soft', 18);
      break; }
    case 'pillar':
      bx(1.3, 0.4, 1.3, 0, 0.2, 0, 'dark'); cy(0.42, 0.5, 4, 0, 2.4, 0, 'main', 12); bx(1.3, 0.4, 1.3, 0, 4.6, 0, 'dark');
      break;
    case 'ring': to(1.8, 0.18, 0, 1.8, 0); break;
    case 'pyramid':
      cn(2.2, 2.8, 0, 1.4, 0, 'main', 4); add(mesh(GEO.octa, M.glow, 0, 3, 0)).scale.setScalar(0.28);
      break;
    case 'dome':
      cy(1.9, 2.05, 0.7, 0, 0.35, 0, 'dark', 20);
      add(mesh(new THREE.SphereGeometry(1.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.main, 0, 0.7, 0));
      sp(0.16, 0, 2.75, 0, 'glow', 8, 8);
      break;
    case 'wall':
      bx(4.4, 2.2, 0.4, 0, 1.1, 0);
      [-1.8, -0.6, 0.6, 1.8].forEach((x) => bx(0.6, 0.5, 0.42, x, 2.45, 0, 'dark'));
      break;
    case 'gate':
      cy(0.32, 0.4, 3.8, -1.6, 1.9, 0, 'main', 10); cy(0.32, 0.4, 3.8, 1.6, 1.9, 0, 'main', 10);
      bx(4.1, 0.45, 0.6, 0, 4, 0, 'dark');
      { const veil = mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: new THREE.Color(emissive), emissive: new THREE.Color(emissive), emissiveIntensity: 0.9, transparent: true, opacity: 0.4 }), 0, 1.9, 0);
        veil.scale.set(2.9, 3.6, 1); add(veil); }
      sp(0.16, -1.6, 4, 0, 'glow', 8, 8); sp(0.16, 1.6, 4, 0, 'glow', 8, 8);
      break;
    case 'mushroom':
      cy(0.32, 0.5, 1.8, 0, 0.9, 0, 'soft', 9);
      add(mesh(new THREE.SphereGeometry(1.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glow, 0, 1.95, 0));
      break;
    case 'obelisk':
      cy(0.42, 0.62, 4, 0, 2, 0, 'main', 4);
      { const tip = cn(0.6, 0.7, 0, 4.3, 0, 'glow', 4); tip.rotation.y = Math.PI / 4; }
      break;
    case 'floating-rock':
      { const rock = add(mesh(GEO.dodeca, M.main, 0, 0, 0)); rock.rotation.set(0.4, 0.2, 0.15); rock.scale.setScalar(1.15);
        add(mesh(GEO.octa, M.glow, 0, 1.15, 0)).scale.setScalar(0.3); }
      break;
    case 'water-plane': {
      const w = mesh(new THREE.CircleGeometry(3, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(emissive), emissiveIntensity: 0.4, roughness: 0.25, metalness: 0.8, transparent: true, opacity: 0.85 }), 0, 0.06, 0);
      w.rotation.x = -Math.PI / 2; add(w); break; }
    case 'mountain':
      cn(2.6, 4.2, 0, 2, 0, 'main', 7); cn(1.05, 1.5, 0, 3.55, 0, 'soft', 7);
      break;
    case 'candle':
      cy(0.16, 0.2, 1, 0, 0.5, 0, 'soft', 10);
      add(scaled(mesh(GEO.sphere, M.glow, 0, 1.22, 0), 0.7 * 0.14, 1.5 * 0.14, 0.7 * 0.14));
      cy(0.34, 0.38, 0.08, 0, 0.04, 0, 'dark', 12);
      break;
    case 'mirror':
      to(1.35, 0.1, 0, 1.7, 0);
      add(mesh(new THREE.CircleGeometry(1.32, 36), M.mirror, 0, 1.7, 0));
      bx(1.1, 0.3, 0.5, 0, 0.15, 0, 'dark');
      break;
    default: bx(1, 2, 1, 0, 1, 0);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Gyro camera: DeviceOrientation -> camera quaternion (three.js
// DeviceOrientationControls formula). Smoothed each frame via slerp.
// ---------------------------------------------------------------------------
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _zee = new THREE.Vector3(0, 0, 1);
const _targetQ = new THREE.Quaternion();

function orientationToQuaternion(alpha, beta, gamma, screenOrient) {
  _euler.set(beta, alpha, -gamma, 'YXZ');
  _targetQ.setFromEuler(_euler);
  _targetQ.multiply(_q1);
  _targetQ.multiply(_q0.setFromAxisAngle(_zee, -screenOrient));
  return _targetQ;
}

export default function DreamARPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('intro'); // intro | starting | denied | active
  const [denyReason, setDenyReason] = useState('');
  const [gyroOn, setGyroOn] = useState(false);
  const [pickerType, setPickerType] = useState('crystal');
  const [selected, setSelected] = useState(null); // { type, name } of tapped object
  const [hint, setHint] = useState('');
  const stateRef = useRef(null);

  // Fallback look-around when gyro is unavailable: touch drag offsets.
  const lookRef = useRef({ yaw: 0, pitch: 0, dragging: false, lx: 0, ly: 0 });

  const startAR = async () => {
    setPhase('starting');
    setDenyReason('');
    // 1. Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setDenyReason('Camera blocked — AR needs the camera. Check Settings → Safari → Camera.');
      setPhase('denied');
      return;
    }
    // 2. Motion permission (iOS 13+)
    let motionOK = false;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        motionOK = res === 'granted';
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        motionOK = true; // Android / desktop: no permission gate
      }
    } catch (e) { motionOK = false; }
    setGyroOn(motionOK);
    setPhase('active');
    setHint(motionOK
      ? 'Turn your phone to look around — dream objects float in your room.'
      : 'Motion sensors off — drag to look around instead.');
    setTimeout(() => setHint(''), 5000);
  };

  const stopAR = () => {
    const st = stateRef.current;
    if (st) {
      st.cancelled = true;
      cancelAnimationFrame(st.raf);
      window.removeEventListener('deviceorientation', st.onOrient);
      window.removeEventListener('orientationchange', st.onScreenOrient);
      st.renderer.dispose();
    }
    const stream = videoRef.current?.srcObject;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    window.location.href = '/dream-engine';
  };

  useEffect(() => {
    if (phase !== 'active') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.6, 0); // eye height, standing

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.1);
    key.position.set(3, 8, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7a5cff, 0.5);
    rim.position.set(-4, 3, -5);
    scene.add(rim);

    // --- Dream objects: 6 placed in a 360° ring around the user ---
    const startTypes = ['crystal', 'clock', 'island', 'mushroom', 'arch', 'mirror'];
    const dreamObjs = [];
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    startTypes.forEach((t, i) => {
      const grp = buildDreamObject(t);
      const ang = (i / startTypes.length) * Math.PI * 2 + 0.4;
      const dist = 3.5 + (i % 3) * 1.8;
      grp.position.set(Math.sin(ang) * dist, 1.2 + (i % 2) * 1.1, -Math.cos(ang) * dist);
      grp.rotation.y = -ang;
      const s = 0.8 + (i % 3) * 0.35;
      grp.scale.setScalar(s);
      grp.userData = { type: t, name: TYPE_NAMES[t], phase: i * 1.7, baseY: grp.position.y, spin: i % 2 === 0 };
      scene.add(grp);
      dreamObjs.push(grp);
    });

    // --- Gyro state ---
    const orient = { alpha: 0, beta: 0, gamma: 0, has: false };
    let screenOrient = (window.orientation || 0) * Math.PI / 180;
    const onOrient = (e) => {
      if (e.alpha == null && e.beta == null) return;
      orient.alpha = (e.alpha || 0) * Math.PI / 180;
      orient.beta = (e.beta || 0) * Math.PI / 180;
      orient.gamma = (e.gamma || 0) * Math.PI / 180;
      orient.has = true;
    };
    const onScreenOrient = () => { screenOrient = (window.orientation || 0) * Math.PI / 180; };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('orientationchange', onScreenOrient);

    // --- Touch fallback: drag to look ---
    const lk = lookRef.current;
    const onTouchStart = (e) => {
      if (e.touches.length === 1) { lk.dragging = true; lk.lx = e.touches[0].clientX; lk.ly = e.touches[0].clientY; }
    };
    const onTouchMove = (e) => {
      if (!lk.dragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lk.lx;
      const dy = e.touches[0].clientY - lk.ly;
      lk.lx = e.touches[0].clientX; lk.ly = e.touches[0].clientY;
      lk.yaw -= dx * 0.005;
      lk.pitch = THREE.MathUtils.clamp(lk.pitch - dy * 0.005, -1.2, 1.2);
    };
    const onTouchEnd = () => { lk.dragging = false; };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    // --- Tap: select object, or place picked type in empty space ---
    let tapStart = null;
    const onPointerDown = (e) => { tapStart = { x: e.clientX, y: e.clientY, t: Date.now() }; };
    const onPointerUp = (e) => {
      if (!tapStart) return;
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
      const quick = Date.now() - tapStart.t < 400;
      tapStart = null;
      if (moved > 12 || !quick || lk.dragging) return; // was a drag, not a tap
      pointerNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(dreamObjs, true);
      if (hits.length) {
        let g = hits[0].object;
        while (g && !g.userData.type) g = g.parent;
        if (g) {
          setSelected({ type: g.userData.type, name: g.userData.name, ref: g });
          setHint(`${g.userData.name} selected — resize it below.`);
          setTimeout(() => setHint(''), 3000);
          return;
        }
      }
      // Empty space: place the picked type in the look direction, 4m out.
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const t = stateRef.current?.pickerType || 'crystal';
      const grp = buildDreamObject(t);
      grp.position.copy(camera.position).addScaledVector(dir, 4);
      grp.position.y = Math.max(0.8, grp.position.y);
      grp.scale.setScalar(1);
      grp.userData = { type: t, name: TYPE_NAMES[t], phase: Math.random() * 6, baseY: grp.position.y, spin: true };
      scene.add(grp);
      dreamObjs.push(grp);
      setSelected({ type: t, name: TYPE_NAMES[t], ref: grp });
      setHint(`${TYPE_NAMES[t]} placed — tap it to resize.`);
      setTimeout(() => setHint(''), 3000);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    const st = { cancelled: false, raf: 0, onOrient, onScreenOrient, pickerType: 'crystal' };
    stateRef.current = st;
    // keep pickerType fresh for the tap-to-place handler
    const pickerSync = setInterval(() => { st.pickerType = pickerTypeRef.current; }, 300);

    const clock = new THREE.Clock();
    const smoothQ = new THREE.Quaternion();
    let firstFrame = true;

    const frame = () => {
      if (st.cancelled) return;
      st.raf = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();

      // Gyro -> camera (smoothed), plus touch-drag offsets.
      if (orient.has) {
        orientationToQuaternion(orient.alpha, orient.beta, orient.gamma, screenOrient);
        if (firstFrame) { smoothQ.copy(_targetQ); firstFrame = false; }
        else smoothQ.slerp(_targetQ, 0.18); // smoothing kills jitter
        camera.quaternion.copy(smoothQ);
      }
      // Touch-drag look: applied as yaw/pitch on top (works with or without gyro).
      if (lk.yaw !== 0 || lk.pitch !== 0) {
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lk.yaw);
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lk.pitch);
        camera.quaternion.multiply(yawQ).multiply(pitchQ);
        // decay back toward gyro so drags don't fight it forever
        lk.yaw *= 0.995; lk.pitch *= 0.995;
      }

      // Dreamlike drift: bob + slow spin.
      for (const g of dreamObjs) {
        const u = g.userData;
        g.position.y = u.baseY + Math.sin(t * 0.7 + u.phase) * 0.25;
        if (u.spin) g.rotation.y += 0.003;
      }

      renderer.render(scene, camera);
    };
    st.raf = requestAnimationFrame(frame);

    return () => {
      st.cancelled = true;
      cancelAnimationFrame(st.raf);
      clearInterval(pickerSync);
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('orientationchange', onScreenOrient);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      scene.traverse((o) => {
        if (o.geometry && o.geometry !== GEO.box && o.geometry !== GEO.sphere) o.geometry.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      renderer.dispose();
    };
  }, [phase]);

  const pickerTypeRef = useRef(pickerType);
  useEffect(() => { pickerTypeRef.current = pickerType; }, [pickerType]);

  const resizeSelected = (dir) => {
    const s = selected?.ref;
    if (!s) return;
    const cur = s.scale.x;
    s.scale.setScalar(THREE.MathUtils.clamp(cur + dir * 0.25, 0.3, 4));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* Camera feed background */}
      <video
        ref={videoRef}
        playsInline muted autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: phase === 'active' ? 'block' : 'none' }}
      />
      {/* Transparent WebGL layer */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: phase === 'active' ? 'block' : 'none', touchAction: 'none' }} />

      {phase !== 'active' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'linear-gradient(180deg, #14102a, #0a0716)' }}>
          <div style={{ fontSize: 52 }}>🥽</div>
          <div style={{ color: '#f8fafc', fontSize: 24, fontWeight: 800 }}>Dream AR</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320, lineHeight: 1.5 }}>
            {phase === 'intro' && 'Your camera becomes the room. Dream objects float around you — turn your phone to look. Objects sit in your view, not pinned to walls.'}
            {phase === 'starting' && 'Waking the camera…'}
            {phase === 'denied' && (denyReason || 'Something blocked AR.')}
          </div>
          {phase === 'intro' && (
            <button type="button" onClick={startAR} style={{ marginTop: 6, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 36px', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>
              Enable Camera & Motion
            </button>
          )}
          {phase === 'denied' && (
            <button type="button" onClick={() => setPhase('intro')} style={{ marginTop: 6, background: '#334155', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Try Again
            </button>
          )}
          <a href="/dream-engine" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none', marginTop: 4 }}>← Back to Dream Engine</a>
        </div>
      )}

      {phase === 'active' && (
        <>
          {/* Top bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', zIndex: 5 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, textShadow: '0 1px 6px #000' }}>🥽 Dream AR {gyroOn ? '' : '(drag to look)'}</div>
            <button type="button" onClick={stopAR} style={{ background: 'rgba(15,23,42,0.75)', color: '#fff', border: '1px solid #475569', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ✕ Exit AR
            </button>
          </div>

          {/* Hint toast */}
          {hint && (
            <div style={{ position: 'absolute', top: 52, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5, pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(15,23,42,0.8)', color: '#e9d5ff', padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, maxWidth: '90%', textAlign: 'center' }}>{hint}</div>
            </div>
          )}

          {/* Selected object panel */}
          {selected && (
            <div style={{ position: 'absolute', bottom: 86, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5 }}>
              <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid #475569', borderRadius: 16, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 14 }}>{TYPE_EMOJI[selected.type]} {selected.name}</span>
                <button type="button" onClick={() => resizeSelected(-1)} style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: 999, width: 34, height: 34, fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>−</button>
                <button type="button" onClick={() => resizeSelected(1)} style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 999, width: 34, height: 34, fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>+</button>
                <button type="button" onClick={() => setSelected(null)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 13, cursor: 'pointer' }}>done</button>
              </div>
            </div>
          )}

          {/* Object picker */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5, padding: '10px 8px calc(10px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, rgba(5,3,12,0.85), transparent)' }}>
            <div style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>TAP EMPTY SPACE TO PLACE ↓</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
              {ALL_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setPickerType(t); setHint(`${TYPE_NAMES[t]} picked — tap empty space to place it.`); setTimeout(() => setHint(''), 2500); }}
                  style={{
                    flex: '0 0 auto', width: 56, height: 56, borderRadius: 14, fontSize: 24,
                    background: pickerType === t ? '#8b5cf6' : 'rgba(30,27,50,0.8)',
                    border: pickerType === t ? '2px solid #c4b5fd' : '1px solid #475569',
                    cursor: 'pointer',
                  }}
                  aria-label={TYPE_NAMES[t]}
                >
                  {TYPE_EMOJI[t]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
