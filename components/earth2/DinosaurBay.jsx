'use client';

// components/earth2/DinosaurBay.jsx
// DINOSAUR BAY — the foundry's real Tripo3D dinosaurs, live in the
// Earth 2 owner chamber (Merlin, 2026-10-22).
//
// The models (lib/earth2/models.js → public/models/earth2/*.glb) are
// Merlin's own Studio generations: rigged skeletons, game-weight
// textures, and NO animation clips — Tripo's presets never ride the
// export. So the life here is in-engine and procedural, driven off
// the rigs by lib/earth2/bones.js: breathing, head look-arounds,
// tail sway, grazer head-dips, a few animals walking slow circuits
// on their own legs, and the Pteranodon circling overhead. Eating,
// hunting, sleeping and the egg cycle are NOT this round — presence
// and idle life only, honestly labelled as such on the page.
//
// Plain-three scene (the chamber page is not an R3F surface), one
// shared clock, no per-animal React state. Loading is progressive:
// landforms, then plants, then creatures; a model that fails shows
// its name in the roster as failed instead of breaking the scene.

import { useEffect, useRef, useState } from 'react';
import { EARTH2_MODELS, earth2PlacedModels, earth2PendingModels } from '@/lib/earth2/models';
import { resolveBones, normalizeJointName } from '@/lib/earth2/bones';

// Deterministic layout RNG (mulberry32) — the Bay arranges itself
// the same way on every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where each creature stands (or walks). Herd species share the west
// meadow, the pack works the east side, the solo hunters keep their
// distance. Walkers get a circuit instead of a spot.
const SPOTS = {
  'triceratops': { walk: { cx: -20, cz: -4, r: 9, speed: 0.55, a0: 0.4 } },
  'ankylosaurus': { walk: { cx: 18, cz: -14, r: 10, speed: 0.5, a0: 2.2 } },
  'velociraptor': { walk: { cx: 26, cz: 6, r: 8, speed: 1.5, a0: 1.1 } },
  'gallimimus': { walk: { cx: 9, cz: 17, r: 7, speed: 1.35, a0: 4.0 } },
  'brachiosaurus': { at: [-6, -22], head: 0.5 },
  'diplodocus': { at: [-32, -14], head: 1.1 },
  'stegosaurus': { at: [-27, 9], head: 2.2 },
  'parasaurolophus': { at: [-12, 3], head: -0.6 },
  'iguanodon': { at: [-17, -13], head: 1.8 },
  'tyrannosaurus-rex': { at: [-40, 15], head: 2.4 },
  'spinosaurus': { at: [16, 9], head: -2.2 },
  'allosaurus': { at: [31, -3], head: -1.8 },
  'dilophosaurus': { at: [22, 13], head: -2.6 },
  'carnotaurus': { at: [36, -19], head: -2.4 },
  'compsognathus': { at: [3, 25], head: 0.9 },
};

const LANDFORM_SPOTS = {
  'mountain-range': { at: [0, -98], head: 0 },
  'active-volcano': { at: [-64, -56], head: 0.7 },
  'dormant-volcano': { at: [68, -50], head: -0.5 },
  'cliff-face': { at: [82, 10], head: -1.35 },
  'meteor-crater': { at: [30, -40], head: 0.3, sink: 2.5 },
  'tar-pit': { at: [12, 13], head: 0 },
  'rocky-outcrop': { at: [-50, 24], head: 1.2 },
  'giant-boulder': { at: [-31, 31], head: 0, extra: [[45, -7, 0.7], [7, -31, 1.25]] },
};

// Plant scatter counts per species (instances of the one model).
const PLANT_COUNTS = {
  'tree-fern': 5, 'cycad-palm': 6, 'ginkgo-tree': 3, 'giant-conifer': 4,
  'horsetail-reeds': 6, 'magnolia': 3, 'bennettitales': 5,
  'fern-ground-cover': 14, 'club-moss': 10, 'araucaria': 3,
};

const STATUS_CHIP = {
  placed: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100',
  loading: 'border-white/15 bg-white/5 text-zinc-300',
  queued: 'border-white/10 bg-white/[0.03] text-zinc-400',
  failed: 'border-red-300/40 bg-red-300/10 text-red-100',
  'awaiting-upload': 'border-amber-300/40 bg-amber-300/10 text-amber-100',
};

export default function DinosaurBay() {
  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const windRef = useRef(0.5);
  const [wind, setWind] = useState(25);
  const [status, setStatus] = useState(() => {
    const init = {};
    for (const m of EARTH2_MODELS) init[m.slug] = m.file ? 'queued' : 'awaiting-upload';
    return init;
  });
  const placedCount = earth2PlacedModels().filter((m) => status[m.slug] === 'placed').length;
  const failed = EARTH2_MODELS.filter((m) => status[m.slug] === 'failed');

  useEffect(() => {
    windRef.current = wind / 50;
  }, [wind]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (cancelled || !mountRef.current) return;

      const mount = mountRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';

      const scene = new THREE.Scene();
      { // sky: soft vertical gradient
        const c = document.createElement('canvas'); c.width = 4; c.height = 512;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#7db4e6'); grad.addColorStop(0.55, '#bcd9ef'); grad.addColorStop(1, '#e8f0e4');
        g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        scene.background = tex;
      }
      scene.fog = new THREE.Fog(0xcfe0ea, 150, 340);

      const camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.1, 900);
      camera.position.set(36, 21, 64);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 4, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.maxPolarAngle = 1.48;
      controls.minDistance = 10;
      controls.maxDistance = 190;

      scene.add(new THREE.HemisphereLight(0xd8ecff, 0x40543a, 1.05));
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
      sun.position.set(60, 90, 40);
      scene.add(sun);

      // ── Ground: a mottled valley disc, flat in the middle where
      // the animals live, rising gently toward the rim.
      {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        g.fillStyle = '#527a38'; g.fillRect(0, 0, 512, 512);
        const rngTex = mulberry32(77);
        const tones = ['#4a7033', '#5d8a42', '#679a48', '#6f7f3c', '#7a6a48'];
        for (let i = 0; i < 900; i++) {
          g.fillStyle = tones[Math.floor(rngTex() * tones.length)];
          g.globalAlpha = 0.16 + rngTex() * 0.2;
          const r = 6 + rngTex() * 30;
          g.beginPath(); g.arc(rngTex() * 512, rngTex() * 512, r, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6);
        const geo = new THREE.CircleGeometry(150, 72);
        const posA = geo.attributes.position;
        const rngR = mulberry32(31);
        const bumps = Array.from({ length: 26 }, () => ({ x: (rngR() - 0.5) * 2, z: (rngR() - 0.5) * 2, h: 1 + rngR() * 3.2, w: 0.25 + rngR() * 0.5 }));
        for (let i = 0; i < posA.count; i++) {
          const x = posA.getX(i), y = posA.getY(i);
          const r = Math.hypot(x, y);
          const lift = Math.max(0, (r - 62) / 88);
          let z = lift * lift * 15;
          for (const b of bumps) {
            const d = Math.hypot(x / 150 - b.x, y / 150 - b.z);
            z += Math.max(0, 1 - d / b.w) * b.h * lift;
          }
          posA.setZ(i, z);
        }
        geo.computeVertexNormals();
        const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
      }

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      const rng = mulberry32(20261022);
      const animals = []; // life-driven creatures
      const sway = [];    // plant instances { obj, phase, amp }
      const labels = [];  // { el, obj, h }
      const disposables = [];
      const track = (o) => { disposables.push(o); return o; };

      const setStatusFor = (slug, s) => { if (!cancelled) setStatus((prev) => ({ ...prev, [slug]: s })); };

      // Normalize a freshly loaded model: scale to the manifest's
      // real-world size, center it on its root, feet on the floor.
      // Returns the holder group to place in the world.
      function normalize(gltfScene, entry) {
        const spin = new THREE.Group();
        spin.add(gltfScene);
        spin.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(spin);
        const size = box.getSize(new THREE.Vector3());
        const extent = entry.scaleBasis === 'height' ? size.y : Math.max(size.x, size.z);
        const k = extent > 0 ? entry.scaleM / extent : 1;
        gltfScene.scale.multiplyScalar(k);
        spin.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(spin);
        const center = box.getCenter(new THREE.Vector3());
        gltfScene.position.x -= center.x;
        gltfScene.position.z -= center.z;
        gltfScene.position.y -= box.min.y;
        return spin;
      }

      async function loadModel(entry) {
        const gltf = await loader.loadAsync(entry.file);
        track(gltf.scene);
        return gltf.scene;
      }

      function bonesOf(modelScene) {
        const bones = new Map(); // normalized name -> bone
        modelScene.traverse((o) => {
          if (o.isBone) bones.set(normalizeJointName(o.name), o);
        });
        return bones;
      }

      function makeLabel(text, obj, h) {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full border border-black/25 bg-black/45 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90';
        el.style.willChange = 'transform';
        labelsRef.current && labelsRef.current.appendChild(el);
        labels.push({ el, obj, h });
      }

      // ── Creatures ──────────────────────────────────────────────
      async function placeCreature(entry) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const bones = bonesOf(modelScene);
          const roles = resolveBones([...bones.keys()].map((k) => k));
          // resolveBones works on the names as loaded; bones map keys
          // are already normalized, so re-map role names through the
          // same normalization the resolver applied.
          const roleBone = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
          const resolved = {
            dialect: roles.dialect,
            spine: roles.spine.map(roleBone).filter(Boolean),
            neck: roles.neck.map(roleBone).filter(Boolean),
            head: roleBone(roles.head),
            tail: roles.tail.map(roleBone).filter(Boolean),
            legs: roles.legs.map((l) => ({
              side: l.side, pair: l.pair,
              thigh: roleBone(l.thigh), calf: roleBone(l.calf), foot: roleBone(l.foot),
            })).filter((l) => l.thigh),
            wings: roles.wings.map((w) => ({ side: w.side, chain: w.chain.map(roleBone).filter(Boolean) })).filter((w) => w.chain.length),
          };
          // Facing: the head end of the spine is the front of the
          // animal. Measure it off the bind pose, never assume an axis.
          const holder = new THREE.Group();
          holder.add(modelScene);
          holder.updateMatrixWorld(true);
          let facingYaw = 0;
          const headBone = resolved.head;
          const pelvisBone = resolved.spine[0] || null;
          if (headBone && pelvisBone) {
            const hp = headBone.getWorldPosition(new THREE.Vector3());
            const pp = pelvisBone.getWorldPosition(new THREE.Vector3());
            const fx = hp.x - pp.x, fz = hp.z - pp.z;
            if (Math.hypot(fx, fz) > 1e-4) facingYaw = -Math.atan2(fx, fz);
          }
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          // bind quaternions for every driven bone
          const bind = new Map();
          for (const b of [...resolved.spine, ...resolved.neck, ...(resolved.head ? [resolved.head] : []), ...resolved.tail,
            ...resolved.legs.flatMap((l) => [l.thigh, l.calf, l.foot]),
            ...resolved.wings.flatMap((w) => w.chain)]) {
            if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
          }
          const animal = {
            entry, root, roles: resolved, bind,
            phase: rng() * Math.PI * 2,
            breathRate: 0.75 + rng() * 0.35,
            walker: null, flyer: entry.kind === 'flyer',
            dist: 0,
          };
          const spot = SPOTS[entry.slug];
          if (entry.kind === 'flyer') {
            animal.fly = { cx: 0, cz: -8, r: 58, h: 30, speed: 0.055, a: rng() * 6.28 };
            root.position.set(animal.fly.cx + animal.fly.r, animal.fly.h, animal.fly.cz);
          } else if (spot && spot.walk) {
            animal.walker = { ...spot.walk, theta: spot.walk.a0 };
            root.position.set(spot.walk.cx + spot.walk.r, 0, spot.walk.cz);
          } else if (spot && spot.at) {
            root.position.set(spot.at[0], 0, spot.at[1]);
            root.rotation.y = spot.head || 0;
          } else {
            root.position.set((rng() - 0.5) * 60, 0, (rng() - 0.5) * 60);
          }
          scene.add(root);
          animals.push(animal);
          makeLabel(entry.name, root, entry.scaleM * 0.72 + 1.2);
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // ── Plants & landforms ─────────────────────────────────────
      async function placeSimple(entry, spot, scaleJitter) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const holder = normalize(modelScene, entry);
          const root = new THREE.Group();
          root.add(holder);
          root.position.set(spot.at[0], -(spot.sink || 0), spot.at[1]);
          root.rotation.y = spot.head || 0;
          if (scaleJitter) root.scale.setScalar(scaleJitter);
          scene.add(root);
          if (entry.slug === 'active-volcano') {
            const light = new THREE.PointLight(0xff6a22, 900, 90, 1.8);
            light.position.set(spot.at[0], entry.scaleM * 0.94, spot.at[1]);
            scene.add(light);
            const c = document.createElement('canvas'); c.width = 128; c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,150,50,0.85)'); grad.addColorStop(0.4, 'rgba(255,90,20,0.35)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
            g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
            const tex = new THREE.CanvasTexture(c);
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            spr.scale.setScalar(16);
            spr.position.set(spot.at[0], entry.scaleM * 0.97, spot.at[1]);
            scene.add(spr);
            track(spr);
          }
          setStatusFor(entry.slug, 'placed');
          return root;
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      async function placePlants(entry) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const count = PLANT_COUNTS[entry.slug] || 3;
          for (let i = 0; i < count; i++) {
            const inst = i === 0 ? modelScene : modelScene.clone();
            const holder = normalize(inst, entry);
            const root = new THREE.Group();
            root.add(holder);
            const ang = rng() * Math.PI * 2;
            const rad = entry.scaleM > 12 ? 62 + rng() * 30 : 14 + rng() * 62;
            root.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
            root.rotation.y = rng() * Math.PI * 2;
            root.scale.setScalar(0.8 + rng() * 0.5);
            scene.add(root);
            sway.push({ obj: root, phase: rng() * 6.28, amp: entry.scaleM > 4 ? 0.016 : 0.03 });
          }
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // Load order: the set first, then the green, then the animals.
      const placed = earth2PlacedModels();
      for (const e of placed.filter((m) => m.kind === 'landform')) {
        if (cancelled) return;
        const spot = LANDFORM_SPOTS[e.slug] || { at: [0, -60], head: 0 };
        const root = await placeSimple(e, spot);
        if (root && LANDFORM_SPOTS[e.slug] && LANDFORM_SPOTS[e.slug].extra) {
          for (const [x, z, s] of LANDFORM_SPOTS[e.slug].extra) {
            const cloneRoot = new THREE.Group();
            // extra boulders reuse the loaded scene via a fresh load
            // from the loader cache path — simplest: clone the group
            cloneRoot.copy(root, true);
            cloneRoot.position.set(x, 0, z);
            cloneRoot.scale.setScalar(s);
            scene.add(cloneRoot);
          }
        }
      }
      for (const e of placed.filter((m) => m.kind === 'plant')) {
        if (cancelled) return;
        await placePlants(e);
      }
      for (const e of placed.filter((m) => m.kind === 'dinosaur' || m.kind === 'flyer')) {
        if (cancelled) return;
        await placeCreature(e);
      }

      // ── The life driver ────────────────────────────────────────
      const clock = new THREE.Clock();
      const tmpQ = new THREE.Quaternion();
      const AXIS_X = new THREE.Vector3(1, 0, 0);
      const AXIS_Y = new THREE.Vector3(0, 1, 0);
      const AXIS_Z = new THREE.Vector3(0, 0, 1);
      const bend = (bone, bindMap, axis, angle) => {
        const b = bindMap.get(bone.uuid);
        if (!b) return;
        tmpQ.setFromAxisAngle(axis, angle);
        bone.quaternion.copy(b).multiply(tmpQ);
      };
      const V = new THREE.Vector3();

      function driveAnimal(a, t, dt) {
        const R = a.roles;
        const ph = a.phase;
        // Breathing — a slow swell down the spine.
        const br = Math.sin(t * a.breathRate + ph) * 0.02;
        R.spine.forEach((b, i) => bend(b, a.bind, AXIS_X, br * (0.6 + i * 0.3)));
        // Look-arounds — lazy noise from summed sines.
        const yaw = (Math.sin(t * 0.23 + ph) * 0.6 + Math.sin(t * 0.117 + ph * 1.7) * 0.4) * 0.16;
        const pitch = Math.sin(t * 0.31 + ph) * 0.045;
        const neckShare = R.neck.length ? 0.45 / R.neck.length : 0;
        R.neck.forEach((b) => bend(b, a.bind, AXIS_Y, yaw * neckShare));
        // Grazer dips: herbivores lower their heads in a slow cycle.
        let dip = 0;
        if (a.entry.diet === 'herbivore') {
          const cyc = (t * 0.045 + ph) % 1;
          if (cyc > 0.55 && cyc < 0.85) dip = Math.sin(((cyc - 0.55) / 0.3) * Math.PI) * 0.38;
        }
        R.neck.forEach((b, i) => bend(b, a.bind, AXIS_X, dip * (0.25 + i * 0.12)));
        if (R.head) {
          bend(R.head, a.bind, AXIS_Y, yaw * 0.55);
          bend(R.head, a.bind, AXIS_X, pitch + dip * 0.5);
        }
        // Tail sway — phase runs down the chain.
        R.tail.forEach((b, i) => {
          bend(b, a.bind, AXIS_Y, Math.sin(t * 1.05 - i * 0.55 + ph) * 0.055);
          bend(b, a.bind, AXIS_X, Math.sin(t * 0.7 - i * 0.3 + ph) * 0.015);
        });

        if (a.flyer && a.fly) {
          const f = a.fly;
          f.a += dt * f.speed;
          const x = f.cx + Math.cos(f.a) * f.r;
          const z = f.cz + Math.sin(f.a) * f.r;
          const nx = f.cx + Math.cos(f.a + 0.05) * f.r;
          const nz = f.cz + Math.sin(f.a + 0.05) * f.r;
          a.root.position.set(x, f.h + Math.sin(t * 0.5 + ph) * 1.6, z);
          a.root.rotation.y = Math.atan2(nx - x, nz - z);
          a.root.rotation.z = 0.28; // bank into the circle
          const flap = Math.sin(t * 2.4 + ph) * 0.22;
          for (const w of R.wings) {
            const sgn = w.side === 'left' ? 1 : -1;
            w.chain.forEach((b, i) => bend(b, a.bind, AXIS_Z, flap * sgn * (i === 0 ? 1 : 0.45)));
          }
          return;
        }

        if (a.walker) {
          const w = a.walker;
          const prevX = a.root.position.x, prevZ = a.root.position.z;
          w.theta += (dt * w.speed) / w.r;
          const x = w.cx + Math.cos(w.theta) * w.r;
          const z = w.cz + Math.sin(w.theta) * w.r;
          a.root.position.x = x; a.root.position.z = z;
          const vx = x - prevX, vz = z - prevZ;
          if (Math.abs(vx) + Math.abs(vz) > 1e-6) a.root.rotation.y = Math.atan2(vx, vz);
          a.dist += Math.hypot(vx, vz);
          const stride = (a.dist / Math.max(0.5, a.entry.scaleM * 0.16)) * Math.PI;
          const quad = a.entry.posture === 'quadruped';
          for (const leg of R.legs) {
            const isFront = leg.pair === 'front';
            const diag = (leg.side === 'left') === (isFront === false);
            const phLeg = stride + (diag ? 0 : Math.PI);
            const amp = isFront && !quad ? 0.1 : 0.34;
            if (leg.thigh) bend(leg.thigh, a.bind, AXIS_X, Math.sin(phLeg) * amp);
            if (leg.calf) bend(leg.calf, a.bind, AXIS_X, Math.max(0, Math.sin(phLeg - 0.7)) * amp * 1.15);
            if (leg.foot) bend(leg.foot, a.bind, AXIS_X, Math.sin(phLeg - 1.4) * amp * 0.5);
          }
          a.root.position.y = Math.abs(Math.sin(stride)) * 0.02 * Math.sqrt(a.entry.scaleM);
          a.root.rotation.x = Math.sin(stride * 2) * 0.008;
        }
      }

      let raf = 0;
      const labelV = new THREE.Vector3();
      function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const windAmp = windRef.current;
        for (const a of animals) driveAnimal(a, t, dt);
        for (const s of sway) {
          s.obj.rotation.z = Math.sin(t * 0.85 + s.phase) * s.amp * (0.35 + windAmp);
          s.obj.rotation.x = Math.cos(t * 0.6 + s.phase) * s.amp * 0.6 * (0.35 + windAmp);
        }
        controls.update();
        renderer.render(scene, camera);
        // Labels ride along, projected each frame (DOM refs only).
        const w = mount.clientWidth, h = mount.clientHeight;
        for (const l of labels) {
          l.obj.getWorldPosition(labelV);
          labelV.y += l.h;
          labelV.project(camera);
          if (labelV.z > 1 || labelV.z < -1) { l.el.style.display = 'none'; continue; }
          l.el.style.display = '';
          const x = (labelV.x * 0.5 + 0.5) * w;
          const y = (-labelV.y * 0.5 + 0.5) * h;
          l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }

      const onResize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      onResize();
      const ro = new ResizeObserver(onResize);
      ro.observe(mount);
      tick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        for (const l of labels) l.el.remove();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              for (const key of Object.keys(m)) if (m[key] && m[key].isTexture) m[key].dispose();
              m.dispose();
            }
          }
        });
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
      if (cancelled) cleanup();
    })();
    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = earth2PlacedModels().length;

  return (
    <section className="mt-5 rounded-[1.5rem] border border-emerald-300/25 bg-emerald-400/[0.04] p-4 backdrop-blur-md sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-black tracking-[0.25em] text-emerald-100">
          🦕 DINOSAUR BAY
        </h2>
        <span className="text-xs text-zinc-400">
          {placedCount} of {total} foundry models placed
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
        The real thing at last: your Studio dinosaurs, rigged and breathing on Earth 2
        ground — herds in the west meadow, the pack in the east, the solo hunters keeping
        their distance, and the Pteranodon on the wing. Their motion is procedural life
        wired onto the rigs here (breathing, looking around, grazing dips, slow walks);
        eating, hunting, sleeping and the egg cycle come in a later round. Drag to look
        around, scroll to zoom.
      </p>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1410]">
        <div ref={mountRef} className="aspect-[16/10] w-full sm:aspect-[16/9]" />
        <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-zinc-200">
          <span aria-hidden="true">🌬️</span>
          <span className="tracking-widest">WIND</span>
          <input
            type="range" min="0" max="100" value={wind}
            onChange={(e) => setWind(Number(e.target.value))}
            className="w-24 accent-emerald-300"
            aria-label="Wind — plant sway"
          />
          <span>{wind < 34 ? 'Calm' : wind < 72 ? 'Fair' : 'Storm'}</span>
        </div>
        {placedCount < total && (
          <div className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-zinc-200">
            Placing the foundry… {placedCount}/{total}
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-300/30 bg-red-300/10 px-3 py-2 text-xs leading-relaxed text-red-100">
          Could not be placed: {failed.map((m) => m.name).join(', ')} — the rest of the
          Bay is unaffected; their name cards stay in the roster below.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {EARTH2_MODELS.map((m) => (
          <span
            key={m.slug}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CHIP[status[m.slug]] || STATUS_CHIP.queued}`}
            title={
              m.status === 'awaiting-upload'
                ? 'Still in the Studio — the model has not been uploaded yet'
                : `${m.kind}${m.diet ? ` · ${m.diet}` : ''}${m.social ? ` · ${m.social}` : ''} · ${m.scaleM} m`
            }
          >
            {m.name}
            {m.status === 'awaiting-upload' ? ' · in the Studio' : status[m.slug] === 'failed' ? ' · failed' : ''}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        {earth2PendingModels().length} still outstanding: Pachycephalosaurus was never
        uploaded from the Studio, so his slot waits empty rather than faking a stand-in.
      </p>
    </section>
  );
}
