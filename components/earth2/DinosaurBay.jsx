'use client';

// components/earth2/DinosaurBay.jsx
// DINOSAUR BAY — the foundry's real Tripo3D dinosaurs, live in the
// Earth 2 owner chamber (Merlin, 2026-10-22).
//
// The models (manifest: lib/earth2/models.js) are Merlin's own
// Studio generations: rigged skeletons, game-weight textures, and NO
// animation clips — Tripo's presets never ride the export. Delivery
// is locked (Merlin's isolation rule): the GLBs live in the private
// earth2-models bucket and reach this scene only as short-lived
// signed URLs minted for the owner's session by
// /api/earth2/model-urls, resolved through lib/earth2/models.js —
// see EARTH2_PUBLIC_FALLBACK there for the migration bridge. So the
// life here is in-engine and procedural, driven off
// the rigs by lib/earth2/bones.js: breathing, head look-arounds,
// tail sway, grazer head-dips, a few animals walking slow circuits
// on their own legs, and the Pteranodon circling overhead. Round 2
// adds the aquatic wing: a carved lake in the south-west with the
// eight sea creatures swimming it on their measured spine chains
// (bones.js resolveSwimRig), surfacing on their own periods — and
// Indominus Rex prowling the west rim as the second apex. Round 3
// adds the aerial wing: eight more flyers on per-species circuits
// (creatures.js FLYERS) — giants high and slow over the grounds,
// skimmers low over the lake — flapping in bursts and flattening
// into glides, their wings driven off each rig's measured chains
// (bones.js resolveFlyerWings). Eating,
// hunting, sleeping and the egg cycle are NOT this round — presence
// and idle life only, honestly labelled as such on the page.
//
// Plain-three scene (the chamber page is not an R3F surface), one
// shared clock, no per-animal React state. Loading is progressive:
// landforms, then plants, then creatures; a model that fails shows
// its name in the roster as failed instead of breaking the scene.

import { useEffect, useRef, useState } from 'react';
import { EARTH2_MODELS, EARTH2_MODEL_BY_SLUG, earth2PlacedModels, earth2PendingModels, earth2ModelUrl, fetchEarth2ModelUrls } from '@/lib/earth2/models';
import { supabase } from '@/lib/supabase';
import { useBackpack, updateBackpack } from '@/lib/backpack/store';
import { sacCount, collectSacInRecord } from '@/lib/backpack/earth2-bridge';
import { resolveBones, normalizeJointName, resolveMosquitoRig, resolveBatWings, resolveSwimRig, resolveFlyerWings } from '@/lib/earth2/bones';
import {
  COMPY_SWARM,
  MOSQUITO_CONFIG,
  BAT_SWARM,
  DRACULA_TIMINGS,
  LAKE,
  SWIMMERS,
  FLYERS,
  lakeBedDepthAt,
  lakeBedYAt,
  surfacePhase,
  mosquitoDropsSac,
  createDraculaMachine,
  stepDracula,
} from '@/lib/earth2/creatures';

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
  // The Rex: apex semi-aquatic stalker at the tar pit's north
  // edge, facing the water — clear of every walker's circuit.
  'spinosaurus-rex': { at: [10, 2], head: 0.18 },
  // Indominus Rex: the second apex (round 2). Where the
  // Spinosaurus Rex holds the tar pit in the north-east, the
  // Indominus prowls the WEST rim on a slow stalker circuit,
  // opposite territory across the whole Bay — its easternmost
  // reach just sights the lake's north shore, never entering.
  'indominus-rex': { walk: { cx: -50, cz: -28, r: 8, speed: 0.45, a0: 2.6 } },
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
  // Castle Transylvania (South Pole in the world; the Bay's far
  // south rim is its diorama stand-in) — Dracula's seat.
  'castle-transylvania': { at: [-24, -100], head: 0.35 },
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

export default function DinosaurBay({ bloodSacs, onBloodSac, onOpenExchange, greetSignal } = {}) {
  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const windRef = useRef(0.5);
  const [wind, setWind] = useState(25);
  // Blood sacs live in the backpack now (Merlin, 2026-10-23): the
  // standalone fallback reads/writes the pack, like the world.
  const backpackRecord = useBackpack();
  const localSacs = sacCount(backpackRecord);
  const [bayNotice, setBayNotice] = useState('');
  const [status, setStatus] = useState(() => {
    const init = {};
    for (const m of EARTH2_MODELS) {
      init[m.slug] = m.file ? 'queued' : m.status === 'placed' ? 'loading' : 'awaiting-upload';
    }
    return init;
  });
  // The scene (built once, in the effect below) talks to the chamber
  // through refs so its closure never goes stale.
  const greetRef = useRef(false);
  const collectSacRef = useRef(() => {});
  collectSacRef.current = () => {
    if (typeof onBloodSac === 'function') onBloodSac();
    else updateBackpack((rec) => collectSacInRecord(rec));
  };
  const openExchangeRef = useRef(() => {});
  openExchangeRef.current = () => {
    greetRef.current = true; // he greets visitors by transforming
    if (typeof onOpenExchange === 'function') onOpenExchange();
  };
  const noticeRef = useRef(() => {});
  noticeRef.current = (msg) => setBayNotice(msg);
  useEffect(() => {
    if (greetSignal) greetRef.current = true;
  }, [greetSignal]);
  useEffect(() => {
    if (!bayNotice) return undefined;
    const id = setTimeout(() => setBayNotice(''), 4200);
    return () => clearTimeout(id);
  }, [bayNotice]);
  const sacsShown = typeof bloodSacs === 'number' ? bloodSacs : localSacs;
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
      const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
      if (cancelled || !mountRef.current) return;

      // Earth 2 asset lock: fetch the owner-signed model URLs once,
      // before anything loads. Signed out, not the owner, or the
      // vault not set up yet → null, and earth2ModelUrl() falls back
      // per EARTH2_PUBLIC_FALLBACK (lib/earth2/models.js).
      let signedModelUrls = null;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) signedModelUrls = await fetchEarth2ModelUrls({ token });
      } catch { signedModelUrls = null; }
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
      // the animals live, rising gently toward the rim — with the
      // round-2 lake carved into the south-west. The disc is a
      // polar grid (rings × sectors), not a fan: a CircleGeometry
      // has no interior vertices to carve a bowl with. The height
      // field is the original lift + seeded bumps, minus the lake
      // dish from lib/earth2/creatures.js (the same pure function
      // the swim drivers clamp against). Vertex colours paint the
      // lake bed: bright sand at the shore easing to a deep bed
      // tone at full depth, with a pale beach band around the rim.
      let waterMat = null;
      let waterTex = null;
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
        const SEG = 128, RINGS = 72;
        const positions = [0, 0, 0];
        const uvs = [0.5, 0.5];
        for (let i = 1; i <= RINGS; i++) {
          const rr = 150 * Math.pow(i / RINGS, 1.12);
          for (let j = 0; j < SEG; j++) {
            const a = (j / SEG) * Math.PI * 2;
            positions.push(Math.cos(a) * rr, Math.sin(a) * rr, 0);
            uvs.push(0.5 + (Math.cos(a) * rr) / 300, 0.5 + (Math.sin(a) * rr) / 300);
          }
        }
        const indices = [];
        for (let j = 0; j < SEG; j++) indices.push(0, 1 + j, 1 + ((j + 1) % SEG));
        for (let i = 0; i < RINGS - 1; i++) {
          const inner0 = 1 + i * SEG, outer0 = 1 + (i + 1) * SEG;
          for (let j = 0; j < SEG; j++) {
            const j1 = (j + 1) % SEG;
            indices.push(inner0 + j, outer0 + j, outer0 + j1);
            indices.push(inner0 + j, outer0 + j1, inner0 + j1);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        const posA = geo.attributes.position;
        const colors = new Float32Array(posA.count * 3);
        const rngR = mulberry32(31);
        const bumps = Array.from({ length: 26 }, () => ({ x: (rngR() - 0.5) * 2, z: (rngR() - 0.5) * 2, h: 1 + rngR() * 3.2, w: 0.25 + rngR() * 0.5 }));
        for (let i = 0; i < posA.count; i++) {
          const x = posA.getX(i), y = posA.getY(i);
          // Local (x, y) maps to world (x, −y) once the disc is
          // laid flat — the carve and the colours work in world
          // coordinates so they agree with creatures.js.
          const wz = -y;
          const r = Math.hypot(x, y);
          const lift = Math.max(0, (r - 62) / 88);
          let z = lift * lift * 15;
          for (const b of bumps) {
            const d = Math.hypot(x / 150 - b.x, y / 150 - b.z);
            z += Math.max(0, 1 - d / b.w) * b.h * lift;
          }
          z -= lakeBedDepthAt(x, wz);
          posA.setZ(i, z);
          const dLake = Math.hypot(x - LAKE.center[0], wz - LAKE.center[1]);
          let cr = 1, cg = 1, cb = 1;
          if (z < -0.3) {
            const f = Math.min(1, -z / LAKE.depth);
            cr = 0.92 + (0.36 - 0.92) * f;
            cg = 0.84 + (0.47 - 0.84) * f;
            cb = 0.62 + (0.42 - 0.62) * f;
          } else if (dLake < LAKE.radius + 6) {
            cr = 1.03; cg = 0.98; cb = 0.83; // the pale beach band
          }
          colors[i * 3] = cr; colors[i * 3 + 1] = cg; colors[i * 3 + 2] = cb;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, vertexColors: true }));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        // ── The lake surface: clear bright blue (Merlin's water
        // law — never murky), translucent so the swimmers read
        // beneath it, with a slow-drifting light-blotch texture
        // for surface motion. It spans just past the carved rim
        // so the waterline always meets the beach, never air.
        const wc = document.createElement('canvas'); wc.width = 256; wc.height = 256;
        const wg = wc.getContext('2d');
        const rngW = mulberry32(97);
        for (let i = 0; i < 46; i++) {
          wg.fillStyle = `rgba(255,255,255,${0.04 + rngW() * 0.07})`;
          wg.beginPath();
          wg.ellipse(rngW() * 256, rngW() * 256, 12 + rngW() * 42, 5 + rngW() * 12, rngW() * 3.2, 0, 7);
          wg.fill();
        }
        for (let i = 0; i < 22; i++) {
          wg.fillStyle = `rgba(190,235,255,${0.05 + rngW() * 0.06})`;
          wg.beginPath();
          wg.ellipse(rngW() * 256, rngW() * 256, 8 + rngW() * 26, 4 + rngW() * 9, rngW() * 3.2, 0, 7);
          wg.fill();
        }
        waterTex = new THREE.CanvasTexture(wc);
        waterTex.colorSpace = THREE.SRGBColorSpace;
        waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
        waterTex.repeat.set(2.5, 2.5);
        waterMat = new THREE.MeshStandardMaterial({
          color: 0x14608c, map: waterTex, transparent: true, opacity: 0.5,
          roughness: 0.12, metalness: 0, depthWrite: false,
        });
        const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.radius + 1.5, 64), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(LAKE.center[0], LAKE.waterY, LAKE.center[1]);
        scene.add(water);
        track(water);
      }

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      const rng = mulberry32(20261022);
      const animals = []; // life-driven creatures
      const swimmers = []; // the lake's cast (round 2) — driven apart:
      // mosquitos never hunt them and the compies never scatter for them
      const sway = [];    // plant instances { obj, phase, amp }
      const labels = [];  // { el, obj, h }
      const disposables = [];
      const track = (o) => { disposables.push(o); return o; };
      let removePointer = () => {};

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
        // Locked delivery: the signed URL for this entry's key, or
        // the documented public fallback — never a hard-coded path.
        const url = earth2ModelUrl(entry, signedModelUrls);
        if (!url) throw new Error(`No delivery URL for ${entry.slug}`);
        const gltf = await loader.loadAsync(url);
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

      // ── Bone roles, shared by creatures and the compy clones ──
      // resolveBones works on the names as loaded; bones map keys
      // are already normalized, so re-map role names through the
      // same normalization the resolver applied.
      function resolveRoles(modelScene) {
        const bones = bonesOf(modelScene);
        const roles = resolveBones([...bones.keys()]);
        const roleBone = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
        // Wings: the generic resolver reads the humanoid template's
        // arm chains; the Tripo-native flyers carry theirs in
        // unnamed fans only the measured table knows — so the
        // flyer resolver (which itself passes the humanoid arms
        // through) wins whenever it finds a pair.
        const flyerWings = resolveFlyerWings([...bones.keys()]);
        const wingSource = flyerWings.length ? flyerWings : roles.wings;
        return {
          dialect: roles.dialect,
          spine: roles.spine.map(roleBone).filter(Boolean),
          neck: roles.neck.map(roleBone).filter(Boolean),
          head: roleBone(roles.head),
          tail: roles.tail.map(roleBone).filter(Boolean),
          legs: roles.legs.map((l) => ({
            side: l.side, pair: l.pair,
            thigh: roleBone(l.thigh), calf: roleBone(l.calf), foot: roleBone(l.foot),
          })).filter((l) => l.thigh),
          wings: wingSource.map((w) => ({ side: w.side, chain: w.chain.map(roleBone).filter(Boolean) })).filter((w) => w.chain.length),
        };
      }

      // Bind quaternions for every driven bone.
      function bindQuats(resolved) {
        const bind = new Map();
        for (const b of [...resolved.spine, ...resolved.neck, ...(resolved.head ? [resolved.head] : []), ...resolved.tail,
          ...resolved.legs.flatMap((l) => [l.thigh, l.calf, l.foot]),
          ...resolved.wings.flatMap((w) => w.chain)]) {
          if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
        }
        return bind;
      }

      // Facing: the head end of the spine is the front of the
      // animal. Measure it off the bind pose, never assume an axis.
      function measureFacing(modelScene, resolved) {
        const holder = new THREE.Group();
        holder.add(modelScene);
        holder.updateMatrixWorld(true);
        const headBone = resolved.head;
        const pelvisBone = resolved.spine[0] || null;
        if (headBone && pelvisBone) {
          const hp = headBone.getWorldPosition(new THREE.Vector3());
          const pp = pelvisBone.getWorldPosition(new THREE.Vector3());
          const fx = hp.x - pp.x, fz = hp.z - pp.z;
          if (Math.hypot(fx, fz) > 1e-4) return -Math.atan2(fx, fz);
        }
        return 0;
      }

      // ── Creatures ──────────────────────────────────────────────
      async function placeCreature(entry) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const resolved = resolveRoles(modelScene);
          const facingYaw = measureFacing(modelScene, resolved);
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          const animal = {
            entry, root, roles: resolved, bind: bindQuats(resolved),
            phase: rng() * Math.PI * 2,
            breathRate: 0.75 + rng() * 0.35,
            tempo: 1,
            walker: null, flyer: entry.kind === 'flyer',
            dist: 0,
          };
          const spot = SPOTS[entry.slug];
          if (entry.kind === 'flyer') {
            // Per-species circuit (creatures.js FLYERS) — the
            // Pteranodon's profile is its round-1 circle verbatim
            // (same centre, radius, height, pace). The fallback
            // mirrors it for any flyer without a profile.
            const fp = FLYERS[entry.slug] || { cx: 0, cz: -8, r: 58, h: 30, speed: 0.055, dir: 1, flapHz: 0.38, flapAmp: 0.22, cycle: 14, glideDuty: 0.3, bob: 1.6 };
            animal.fly = { ...fp, a: rng() * 6.28 };
            animal.glideOff = rng();
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

      // ── Swimmers: the lake's cast ──────────────────────────────
      // Each sea creature resolves its swim rig off the loaded
      // skeleton (bones.js resolveSwimRig — names for the
      // humanoid-retarget bodies, the joint TREE for the Tripo
      // spine chains), then swims the lake on its SWIMMERS
      // profile (creatures.js): an elliptical circuit, a spine
      // wave, flipper paddling, a surfacing rhythm.
      async function placeSwimmer(entry) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const profile = SWIMMERS[entry.slug];
          if (!profile) throw new Error(`No swim profile for ${entry.slug}`);
          const jointNames = [];
          const jointParents = [];
          modelScene.traverse((o) => {
            if (!o.isBone) return;
            jointNames.push(o.name);
            let p = o.parent;
            while (p && !p.isBone) p = p.parent;
            jointParents.push(p ? p.name : null);
          });
          const bones = bonesOf(modelScene);
          const rig = resolveSwimRig(jointNames, jointParents);
          const boneFor = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
          const axial = rig.axial.map(boneFor).filter(Boolean);
          const flippers = rig.flippers
            .map((f) => ({ pair: f.pair, side: f.side, chain: f.chain.map(boneFor).filter(Boolean) }))
            .filter((f) => f.chain.length);
          const extras = rig.extras
            .map((ch) => ch.map(boneFor).filter(Boolean))
            .filter((ch) => ch.length);
          const bind = new Map();
          for (const b of [...axial, ...flippers.flatMap((f) => f.chain), ...extras.flat()]) {
            if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
          }
          // Facing off the bind pose like the land creatures:
          // head against the TAIL end of the measured axis.
          const facingYaw = measureFacing(modelScene, {
            head: boneFor(rig.head),
            spine: axial.length ? [axial[axial.length - 1]] : [],
          });
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          const theta0 = rng() * Math.PI * 2;
          root.position.set(
            LAKE.center[0] + Math.cos(theta0) * profile.rx,
            profile.deep,
            LAKE.center[1] + Math.sin(theta0) * profile.rz,
          );
          scene.add(root);
          swimmers.push({
            entry, root, profile, axial, flippers, extras, bind,
            theta: theta0,
            phase: rng() * Math.PI * 2,
            phaseOff: rng(),
            y: profile.deep,
          });
          makeLabel(entry.name, root, entry.scaleM * 0.3 + 2.4);
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
            // Seeded scatter — with the lake's shore kept clear
            // (round 2): nothing roots in the water or the beach,
            // so a candidate inside the shore band is re-rolled.
            let px = 0, pz = 0;
            for (let tries = 0; tries < 8; tries++) {
              const ang = rng() * Math.PI * 2;
              const rad = entry.scaleM > 12 ? 62 + rng() * 30 : 14 + rng() * 62;
              px = Math.cos(ang) * rad; pz = Math.sin(ang) * rad;
              if (Math.hypot(px - LAKE.center[0], pz - LAKE.center[1]) > LAKE.radius + 3) break;
            }
            root.position.set(px, 0, pz);
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
        // The vampire bat is not a free flyer here — its Bay
        // presence is Dracula's own form and his castle swarm,
        // placed by the Transylvania section below.
        if (e.slug === BAT_SWARM.sourceSlug) continue;
        await placeCreature(e);
      }
      for (const e of placed.filter((m) => m.kind === 'marine')) {
        if (cancelled) return;
        await placeSwimmer(e);
      }

      // ── The compy swarm, the mosquitos, Dracula & his bats ────
      // (Merlin, 2026-10-22 — the blood-sac loop. The pure rules —
      // swarm config, the feeding cycle, the transformation — live
      // in lib/earth2/creatures.js; this section is their body.)
      const CASTLE_AT = LANDFORM_SPOTS['castle-transylvania'].at;
      // The Count stands before his castle's front face on the
      // south rim. With the real castle placed (40 m tall, ~39 m
      // across), the seat moved out from the old placeholder-era
      // spot — that point is inside the castle's walls now. The
      // height is the Bay ground's actual surface there, measured
      // off the ground geometry (the valley cone reaches ≈8.8 m
      // at this radius); the old seat's plinth height left him
      // sunk beneath it.
      const DRACULA_SPOT = new THREE.Vector3(-18, 8.7, -74);
      const mosquitos = [];
      const sacs = []; // { group, core }
      const bursts = []; // { points, vels, life }
      const swarmBats = [];
      const drac = {
        machine: createDraculaMachine(),
        countForm: null, batForm: null, batWings: null,
        countRig: null, // { roles, bind } — the Count's Mixamo rig, for his idle life
        smoke: null, batAngle: 0, returnFrom: new THREE.Vector3(),
      };
      // The bat model loads once (in placeDracula); his own bat
      // form and every swarm bat are SkeletonUtils clones of it.
      let dracBatBase = null;
      const tmpMove = new THREE.Vector3();
      const tmpTarget = new THREE.Vector3();
      const anchorV = new THREE.Vector3();

      // Bone lookup + bind-relative bending for the Transylvania
      // cast (shared by the mosquitos, the bats and the Count).
      function boneByName(bonesMap, name) {
        return name ? bonesMap.get(normalizeJointName(name)) || null : null;
      }
      const bendQ = new THREE.Quaternion();
      const BEND_X = new THREE.Vector3(1, 0, 0);
      const BEND_Y = new THREE.Vector3(0, 1, 0);
      function bendBoneTo(bone, bindQuat, axis, angle) {
        if (!bone || !bindQuat) return;
        bendQ.setFromAxisAngle(axis, angle);
        bone.quaternion.copy(bindQuat).multiply(bendQ);
      }

      // Wing bones for one bat clone, from the measured resolver.
      function batWingsOf(modelScene) {
        const bones = bonesOf(modelScene);
        return resolveBatWings([...bones.keys()])
          .map((w) => ({
            sign: w.sign,
            bones: w.chain
              .map((n) => boneByName(bones, n))
              .filter(Boolean)
              .map((bone) => ({ bone, bind: bone.quaternion.clone() })),
          }))
          .filter((w) => w.bones.length);
      }

      // One flap cycle across a bat's wing chains — root leads,
      // the rest of the chain follows at half strength.
      function flapWings(wings, t, rate, amp = 0.55) {
        if (!wings || !wings.length) return;
        const f = Math.sin(t * rate) * amp;
        for (const w of wings) {
          w.bones.forEach((b, i) => bendBoneTo(b.bone, b.bind, BEND_X, f * w.sign * (i === 0 ? 1 : 0.5)));
        }
      }

      function glowSprite(inner, outer) {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, inner); grad.addColorStop(1, outer);
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        track(spr);
        return spr;
      }

      // ── Compy swarm: clones of the compsognathus at 0.4 m, on
      // the shared bones/idle system at swarm tempo (creatures.js).
      async function placeCompySwarm() {
        const source = EARTH2_MODEL_BY_SLUG.get(COMPY_SWARM.sourceSlug);
        if (!source || !source.file) { setStatusFor('compy-swarm', 'failed'); return; }
        try {
          const baseScene = await loadModel(source);
          const pseudo = { ...source, scaleM: COMPY_SWARM.bodyLengthM };
          for (let i = 0; i < COMPY_SWARM.count; i++) {
            const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
            const resolved = resolveRoles(modelScene);
            const facingYaw = measureFacing(modelScene, resolved);
            const spin = normalize(modelScene, pseudo);
            spin.rotation.y = facingYaw;
            const root = new THREE.Group();
            root.add(spin);
            const ang = rng() * Math.PI * 2;
            const rad = rng() * COMPY_SWARM.radius;
            root.position.set(
              COMPY_SWARM.center[0] + Math.cos(ang) * rad, 0,
              COMPY_SWARM.center[1] + Math.sin(ang) * rad,
            );
            root.rotation.y = rng() * Math.PI * 2;
            scene.add(root);
            animals.push({
              entry: pseudo, root, roles: resolved, bind: bindQuats(resolved),
              phase: rng() * Math.PI * 2,
              breathRate: 1.5 + rng() * 0.7,
              tempo: COMPY_SWARM.tempo,
              walker: null, flyer: false, dist: 0,
              compy: {
                wx: root.position.x, wz: root.position.z,
                baseSpeed: COMPY_SWARM.baseSpeed * (0.8 + rng() * 0.5),
                scatterT: 0,
              },
            });
          }
          setStatusFor('compy-swarm', 'placed');
        } catch (err) {
          setStatusFor('compy-swarm', 'failed');
        }
      }

      // The feeding tell on the real rig (lib/earth2/bones.js,
      // resolveMosquitoRig — measured off the file): the abdomen
      // chain fattens across its width as it fills (a true local
      // swell on the skinned bones), and the mosquito's own
      // material instance takes a subtle whole-body redden — the
      // rig has no abdomen-NAMED bone and the model is a single
      // skinned mesh, so the colour cue cannot isolate the
      // abdomen; the swell is the precise half of the tell.
      const ABDOMEN_FULL = new THREE.Color(0xc01818);
      function applyAbdomen(mq) {
        const f = mq.fedLevel;
        for (const ab of mq.parts.abdomenBones || []) {
          const s = 1 + f * ab.swell;
          ab.bone.scale.set(ab.base.x * s, ab.base.y * s, ab.base.z);
        }
        if (mq.parts.bodyMat && mq.parts.bodyMatBase) {
          mq.parts.bodyMat.color.copy(mq.parts.bodyMatBase).lerp(ABDOMEN_FULL, f * 0.38);
        }
      }

      async function placeMosquitos() {
        const entry = EARTH2_MODEL_BY_SLUG.get('giant-mosquito');
        let baseScene = null;
        if (entry && entry.file) {
          try {
            baseScene = await loadModel(entry);
          } catch (err) {
            baseScene = null;
          }
        }
        if (!baseScene) {
          setStatusFor('giant-mosquito', 'failed');
          return;
        }
        for (let i = 0; i < MOSQUITO_CONFIG.count; i++) {
          const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
          // Each mosquito reddens on its own schedule, so each
          // carries its own material instance.
          let bodyMat = null;
          modelScene.traverse((o) => {
            if (o.isSkinnedMesh) {
              o.material = o.material.clone();
              if (!bodyMat) bodyMat = o.material;
            }
          });
          const bones = bonesOf(modelScene);
          const rig = resolveMosquitoRig([...bones.keys()]);
          const abdomenBones = rig.abdomen
            .map((n) => boneByName(bones, n))
            .filter(Boolean)
            .map((bone, idx, arr) => ({
              bone,
              base: bone.scale.clone(),
              // the swell grows toward the abdomen's tip
              swell: 0.3 + (arr.length > 1 ? (idx / (arr.length - 1)) * 0.45 : 0),
            }));
          const wingRoots = rig.wingRoots
            .map((w) => ({ bone: boneByName(bones, w.name), sign: w.sign }))
            .filter((w) => w.bone)
            .map((w) => ({ ...w, bind: w.bone.quaternion.clone() }));
          const parts = {
            abdomenBones,
            wingRoots,
            bodyMat,
            bodyMatBase: bodyMat && bodyMat.color ? bodyMat.color.clone() : null,
          };
          const group = normalize(modelScene, entry);
          const proxy = new THREE.Mesh(
            new THREE.SphereGeometry(0.85, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false }),
          );
          group.add(proxy);
          scene.add(group);
          const mq = {
            group, proxy, parts,
            phase: 'cruising',
            a: rng() * Math.PI * 2,
            r: 26 + rng() * 30,
            h: MOSQUITO_CONFIG.cruiseHeight + rng() * 3,
            cx: (rng() - 0.5) * 30, cz: (rng() - 0.5) * 30,
            speed: MOSQUITO_CONFIG.cruiseSpeed * (0.85 + rng() * 0.3),
            feedT: 0, fedLevel: 0, target: null,
            cruiseT: 0,
            nextFeedIn: MOSQUITO_CONFIG.firstFeedDelay[0]
              + rng() * (MOSQUITO_CONFIG.firstFeedDelay[1] - MOSQUITO_CONFIG.firstFeedDelay[0]),
            vy: 0, goneT: 0, willDropSac: false,
          };
          proxy.userData.mosquito = mq;
          group.position.set(
            mq.cx + Math.cos(mq.a) * mq.r, mq.h,
            mq.cz + Math.sin(mq.a) * mq.r,
          );
          mosquitos.push(mq);
        }
        setStatusFor('giant-mosquito', 'placed');
      }

      const dracProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 2.6, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      dracProxy.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
      dracProxy.userData.dracula = true;
      scene.add(dracProxy);

      async function placeDracula() {
        // His plinth + a violet court light on the rim.
        const plinth = new THREE.Mesh(
          new THREE.CircleGeometry(2.4, 24),
          new THREE.MeshStandardMaterial({ color: 0x211d2a, roughness: 1 }),
        );
        plinth.rotation.x = -Math.PI / 2;
        plinth.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y - 0.02, DRACULA_SPOT.z);
        scene.add(plinth);
        const courtLight = new THREE.PointLight(0x8a5adf, 60, 30, 1.8);
        courtLight.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 2.6, DRACULA_SPOT.z);
        scene.add(courtLight);

        // The Count himself — the real rigged model (Mixamo
        // dialect, resolved like every other rig in the Bay);
        // his bones drive a quiet idle life while he holds court.
        const dEntry = EARTH2_MODEL_BY_SLUG.get('dracula');
        let countGroup = null;
        if (dEntry && dEntry.file) {
          try {
            const modelScene = await loadModel(dEntry);
            const roles = resolveRoles(modelScene);
            drac.countRig = { roles, bind: bindQuats(roles) };
            countGroup = normalize(modelScene, dEntry);
          } catch (err) {
            countGroup = null;
          }
        }
        if (countGroup) {
          countGroup.position.copy(DRACULA_SPOT);
          countGroup.rotation.y = Math.atan2(-DRACULA_SPOT.x, -DRACULA_SPOT.z); // face the Bay
          scene.add(countGroup);
          drac.countForm = countGroup;
          setStatusFor('dracula', 'placed');
        } else {
          setStatusFor('dracula', 'failed');
        }

        // His bat form — the real vampire bat, cloned per flyer
        // (his own form now; the swarm clones in placeBatSwarm).
        const bEntry = EARTH2_MODEL_BY_SLUG.get('vampire-bat');
        if (bEntry && bEntry.file) {
          try {
            dracBatBase = await loadModel(bEntry);
          } catch (err) {
            dracBatBase = null;
          }
        }
        if (dracBatBase) {
          const batScene = SkeletonUtils.clone(dracBatBase);
          const batGroup = normalize(batScene, bEntry);
          drac.batWings = batWingsOf(batScene);
          batGroup.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
          batGroup.visible = false;
          scene.add(batGroup);
          drac.batForm = batGroup;
          setStatusFor('vampire-bat', 'placed');
        } else {
          setStatusFor('vampire-bat', 'failed');
        }

        // His transformation smoke: one dark particle cloud, reused
        // for both bursts, swelling and fading with the phase.
        const N = 70;
        const positions = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const th = rng() * Math.PI * 2;
          const ph = Math.acos(2 * rng() - 1);
          const rr = 0.25 + rng() * 0.55;
          positions[i * 3] = Math.sin(ph) * Math.cos(th) * rr;
          positions[i * 3 + 1] = Math.abs(Math.cos(ph)) * rr * 1.6;
          positions[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rr;
        }
        const smokeGeo = new THREE.BufferGeometry();
        smokeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const smokeMat = new THREE.PointsMaterial({
          color: 0x352c3d, size: 0.34, transparent: true, opacity: 0, depthWrite: false,
        });
        const smoke = new THREE.Points(smokeGeo, smokeMat);
        smoke.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 0.2, DRACULA_SPOT.z);
        scene.add(smoke);
        track(smoke);
        drac.smoke = smoke;
      }

      async function placeBatSwarm() {
        const entry = EARTH2_MODEL_BY_SLUG.get(BAT_SWARM.sourceSlug);
        if (!dracBatBase || !entry) return;
        for (let i = 0; i < BAT_SWARM.count; i++) {
          const modelScene = SkeletonUtils.clone(dracBatBase);
          const group = normalize(modelScene, entry);
          scene.add(group);
          swarmBats.push({
            group,
            wings: batWingsOf(modelScene),
            a: rng() * Math.PI * 2,
            r: BAT_SWARM.radius[0] + rng() * (BAT_SWARM.radius[1] - BAT_SWARM.radius[0]),
            h: BAT_SWARM.height[0] + rng() * (BAT_SWARM.height[1] - BAT_SWARM.height[0]),
            speed: BAT_SWARM.speed[0] + rng() * (BAT_SWARM.speed[1] - BAT_SWARM.speed[0]),
            ph: rng() * Math.PI * 2,
          });
        }
      }

      await placeCompySwarm();
      if (cancelled) return;
      await placeMosquitos();
      if (cancelled) return;
      await placeDracula();
      if (cancelled) return;
      await placeBatSwarm();

      // ── Behaviour: mosquitos feed, sacs drop, Dracula turns ──
      function moveToward(obj, target, speed, dt) {
        const pos = obj.position;
        tmpMove.copy(target).sub(pos);
        const len = tmpMove.length();
        if (len < 1e-4) return true;
        tmpMove.normalize();
        pos.addScaledVector(tmpMove, Math.min(len, speed * dt));
        obj.rotation.y = Math.atan2(tmpMove.x, tmpMove.z);
        return len <= speed * dt + 0.05;
      }

      function hostAnchor(animal, out) {
        out.copy(animal.root.position);
        out.y = animal.root.position.y + Math.max(0.7, animal.entry.scaleM * 0.5);
        return out;
      }

      function spawnBurst(at, colorHex) {
        const N = 26;
        const positions = new Float32Array(N * 3);
        const vels = [];
        for (let i = 0; i < N; i++) {
          positions[i * 3] = at.x; positions[i * 3 + 1] = at.y; positions[i * 3 + 2] = at.z;
          const th = rng() * Math.PI * 2;
          const ph = Math.acos(2 * rng() - 1);
          const sp = 1.5 + rng() * 2.5;
          vels.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 0.8, Math.sin(ph) * Math.sin(th) * sp]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: colorHex, size: 0.22, transparent: true, opacity: 1, depthWrite: false });
        const points = new THREE.Points(geo, mat);
        scene.add(points);
        track(points);
        bursts.push({ points, vels, life: 0 });
      }

      function spawnSac(at) {
        const group = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 18, 14),
          new THREE.MeshStandardMaterial({ color: 0xc01414, emissive: 0x8a0a0a, emissiveIntensity: 0.9, roughness: 0.35 }),
        );
        core.scale.y = 1.25;
        group.add(core);
        const spr = glowSprite('rgba(255,60,40,0.9)', 'rgba(200,10,10,0)');
        spr.scale.setScalar(2.2);
        group.add(spr);
        group.position.set(at.x, 0.55, at.z);
        scene.add(group);
        const sac = { group, core };
        group.traverse((o) => { o.userData.sacRef = sac; });
        sacs.push(sac);
      }

      function collectSac(sac) {
        const i = sacs.indexOf(sac);
        if (i < 0) return;
        sacs.splice(i, 1);
        scene.remove(sac.group);
        collectSacRef.current();
        noticeRef.current('🩸 Blood sac collected — Dracula trades sacs for gifts.');
      }

      function resetMosquito(mq) {
        mq.phase = 'cruising';
        mq.fedLevel = 0;
        mq.feedT = 0;
        mq.target = null;
        mq.cruiseT = 0;
        mq.nextFeedIn = MOSQUITO_CONFIG.refuelDelay[0]
          + rng() * (MOSQUITO_CONFIG.refuelDelay[1] - MOSQUITO_CONFIG.refuelDelay[0]);
        mq.group.visible = true;
        mq.group.rotation.set(0, 0, 0);
        mq.group.position.set(
          mq.cx + Math.cos(mq.a) * mq.r, mq.h,
          mq.cz + Math.sin(mq.a) * mq.r,
        );
        applyAbdomen(mq);
      }

      function landMosquito(mq) {
        mq.group.position.y = 0.25;
        if (mq.willDropSac) spawnSac(mq.group.position);
        spawnBurst(mq.group.position, mq.willDropSac ? 0xd42a2a : 0x9a958c);
        mq.group.visible = false;
        mq.phase = 'gone';
        mq.goneT = 0;
      }

      function shootMosquito(mq) {
        if (mq.phase === 'falling' || mq.phase === 'gone') return;
        // The rule (lib/earth2/creatures.js): only a mosquito that
        // has drunk — feeding now, or full — drops a blood sac.
        mq.willDropSac = mosquitoDropsSac(mq.phase);
        spawnBurst(mq.group.position, mq.willDropSac ? 0xd42a2a : 0x9a958c);
        if (!mq.willDropSac) {
          noticeRef.current("It hadn't drunk yet — no sac. Shoot the swollen red ones.");
        }
        mq.phase = 'falling';
        mq.vy = 0;
      }

      function updateMosquito(mq, t, dt) {
        const pos = mq.group.position;
        // Wing roots beat at mosquito tempo (the measured rig —
        // resolveMosquitoRig); a small angle, since the local
        // axis convention is assumed, not seen.
        if (mq.parts.wingRoots && mq.phase !== 'gone') {
          const flap = Math.sin(t * 42 + mq.a * 7) * 0.16;
          for (const w of mq.parts.wingRoots) {
            bendBoneTo(w.bone, w.bind, BEND_X, flap * w.sign);
          }
        }
        switch (mq.phase) {
          case 'cruising': {
            mq.cruiseT += dt;
            mq.a += dt * mq.speed * (mq.fedLevel > 0 ? MOSQUITO_CONFIG.fullSpeedFactor : 1);
            pos.set(
              mq.cx + Math.cos(mq.a) * mq.r,
              mq.h + Math.sin(t * 1.3 + mq.a * 3) * 0.5,
              mq.cz + Math.sin(mq.a) * mq.r,
            );
            mq.group.rotation.y = -mq.a;
            if (mq.fedLevel === 0 && mq.cruiseT > mq.nextFeedIn) {
              const targets = animals.filter((an) => !an.flyer);
              if (targets.length) {
                mq.target = targets[Math.floor(rng() * targets.length)];
                mq.phase = 'seeking';
              }
            }
            break;
          }
          case 'seeking': {
            if (!mq.target) { mq.phase = 'cruising'; break; }
            hostAnchor(mq.target, anchorV);
            if (moveToward(mq.group, anchorV, MOSQUITO_CONFIG.seekSpeed, dt)) {
              mq.phase = 'feeding';
              mq.feedT = 0;
            }
            break;
          }
          case 'feeding': {
            if (!mq.target) { mq.phase = 'cruising'; break; }
            hostAnchor(mq.target, anchorV);
            pos.copy(anchorV);
            mq.group.rotation.y = Math.atan2(
              mq.target.root.position.x - pos.x,
              mq.target.root.position.z - pos.z,
            );
            mq.feedT += dt;
            mq.fedLevel = Math.min(1, mq.feedT / MOSQUITO_CONFIG.feedSeconds);
            applyAbdomen(mq);
            if (mq.feedT >= MOSQUITO_CONFIG.feedSeconds) {
              mq.phase = 'full';
              mq.cruiseT = 0;
            }
            break;
          }
          case 'full': {
            tmpTarget.set(
              mq.cx + Math.cos(mq.a) * mq.r, mq.h,
              mq.cz + Math.sin(mq.a) * mq.r,
            );
            if (moveToward(mq.group, tmpTarget, 2.4, dt)) mq.phase = 'cruising';
            break;
          }
          case 'falling': {
            mq.vy -= 22 * dt;
            pos.y += mq.vy * dt;
            mq.group.rotation.z += dt * 7;
            mq.group.rotation.x += dt * 3;
            if (pos.y <= 0.25) landMosquito(mq);
            break;
          }
          case 'gone': {
            mq.goneT += dt;
            if (mq.goneT >= MOSQUITO_CONFIG.respawnSeconds) resetMosquito(mq);
            break;
          }
          default:
            break;
        }
      }

      function updateDracula(t, dt) {
        const ev = greetRef.current ? 'greet' : null;
        if (ev) greetRef.current = false;
        const prevPhase = drac.machine.phase;
        drac.machine = stepDracula(drac.machine, dt, ev);
        const m = drac.machine;
        if (prevPhase !== m.phase && m.phase === 'return' && drac.batForm) {
          drac.returnFrom.copy(drac.batForm.position);
        }
        // Transformation smoke — swells and fades across both bursts.
        if (drac.smoke) {
          let op = 0;
          let sc = 1;
          if (m.phase === 'smoke-out' || m.phase === 'smoke-in') {
            const p = Math.min(1, m.t / DRACULA_TIMINGS.smokeSeconds);
            op = Math.sin(p * Math.PI) * 0.85;
            sc = 1 + p * 2.4;
          }
          drac.smoke.material.opacity = op;
          drac.smoke.scale.setScalar(sc);
          drac.smoke.rotation.y += dt * 1.5;
        }
        if (drac.countForm) {
          drac.countForm.visible =
            m.phase === 'count'
            || (m.phase === 'smoke-out' && m.t < DRACULA_TIMINGS.smokeSeconds * 0.55)
            || (m.phase === 'smoke-in' && m.t > DRACULA_TIMINGS.smokeSeconds * 0.45);
          if (m.phase === 'count') {
            drac.countForm.position.y = DRACULA_SPOT.y + Math.sin(t * 0.8) * 0.04;
            // The Count's idle life on his real rig: a slow
            // breath down the spine, and his gaze drifting
            // across the Bay he is about to feed on.
            const rig = drac.countRig;
            if (rig) {
              const br = Math.sin(t * 0.85) * 0.016;
              rig.roles.spine.forEach((b, i) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_X, br * (0.6 + i * 0.3)));
              const yaw = (Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.131) * 0.4) * 0.22;
              const neckShare = rig.roles.neck.length ? 0.4 / rig.roles.neck.length : 0;
              rig.roles.neck.forEach((b) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_Y, yaw * neckShare));
              if (rig.roles.head) {
                bendBoneTo(rig.roles.head, rig.bind.get(rig.roles.head.uuid), BEND_Y, yaw * 0.6);
                bendQ.setFromAxisAngle(BEND_X, Math.sin(t * 0.37) * 0.045);
                rig.roles.head.quaternion.multiply(bendQ);
              }
            }
          }
        }
        if (drac.batForm) {
          drac.batForm.visible = m.phase === 'bat' || m.phase === 'return';
          if (m.phase === 'bat') {
            drac.batAngle += dt * 1.15;
            // The circuit rings the castle OUTSIDE its walls
            // (radius 30 > the footprint's half-diagonal ≈ 27).
            const x = CASTLE_AT[0] + Math.cos(drac.batAngle) * 30;
            const z = CASTLE_AT[1] + Math.sin(drac.batAngle) * 30;
            const nx = CASTLE_AT[0] + Math.cos(drac.batAngle + 0.06) * 30;
            const nz = CASTLE_AT[1] + Math.sin(drac.batAngle + 0.06) * 30;
            drac.batForm.position.set(x, 20 + Math.sin(t * 2.1) * 1.2, z);
            drac.batForm.rotation.y = Math.atan2(nx - x, nz - z);
            drac.batForm.rotation.z = 0.28; // bank into the circle
            flapWings(drac.batWings, t, 16);
          } else if (m.phase === 'return') {
            const p = Math.min(1, m.t / DRACULA_TIMINGS.returnSeconds);
            const e = p * p * (3 - 2 * p);
            tmpTarget.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
            drac.batForm.position.lerpVectors(drac.returnFrom, tmpTarget, e);
            flapWings(drac.batWings, t, 16);
          }
        }
        // The castle swarm: lazy circuits — scattering outward
        // whenever the Count transforms, then regrouping.
        const scatter = m.scatter;
        for (const b of swarmBats) {
          b.a += dt * b.speed * (1 + scatter * 1.8);
          const r = b.r * (1 + scatter * 1.15);
          const x = CASTLE_AT[0] + Math.cos(b.a) * r;
          const z = CASTLE_AT[1] + Math.sin(b.a) * r;
          const nx = CASTLE_AT[0] + Math.cos(b.a + 0.05) * r;
          const nz = CASTLE_AT[1] + Math.sin(b.a + 0.05) * r;
          b.group.position.set(x, b.h + Math.sin(t * 0.9 + b.ph) * 0.8, z);
          b.group.rotation.y = Math.atan2(nx - x, nz - z);
          b.group.rotation.z = 0.28; // bank into the circle
          flapWings(b.wings, t + b.ph, 11);
        }
      }

      // ── Tap-to-shoot (the test-build interaction): a tap — not
      // a drag — raycasts against the mosquito proxies, the sac
      // pickups and Dracula himself.
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let downX = 0;
      let downY = 0;
      function onPointerDown(e) {
        downX = e.clientX;
        downY = e.clientY;
      }
      function onPointerUp(e) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return; // it was a drag
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const targets = [
          ...mosquitos.map((mq) => mq.proxy),
          ...sacs.map((s) => s.group),
          dracProxy,
        ];
        const hits = raycaster.intersectObjects(targets, true);
        if (!hits.length) return;
        let obj = hits[0].object;
        while (obj && !obj.userData.mosquito && !obj.userData.sacRef && !obj.userData.dracula) {
          obj = obj.parent;
        }
        if (!obj) return;
        if (obj.userData.mosquito) shootMosquito(obj.userData.mosquito);
        else if (obj.userData.sacRef) collectSac(obj.userData.sacRef);
        else if (obj.userData.dracula) openExchangeRef.current();
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      removePointer = () => {
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
      };

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

      // Leg swing for one stride phase — shared by the walkers and
      // the compy swarm (which computes its stride from its own
      // scurry distance).
      function swingLegs(a, stride) {
        const R = a.roles;
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
      }

      // Compy steering: scurry between waypoints around the swarm
      // center; when a walker dinosaur passes close, scatter —
      // burst away, then regroup (the next waypoint pulls them back).
      function updateCompy(a, dt) {
        const c = a.compy;
        const px = a.root.position.x, pz = a.root.position.z;
        for (const other of animals) {
          if (!other.walker) continue;
          const d = Math.hypot(other.root.position.x - px, other.root.position.z - pz);
          if (d < COMPY_SWARM.scatterRadius) {
            c.scatterT = COMPY_SWARM.scatterSeconds;
            const away = Math.atan2(px - other.root.position.x, pz - other.root.position.z);
            c.wx = px + Math.sin(away) * 11;
            c.wz = pz + Math.cos(away) * 11;
          }
        }
        let dx = c.wx - px, dz = c.wz - pz;
        if (Math.hypot(dx, dz) < 0.9) {
          const ang = rng() * Math.PI * 2;
          const rad = rng() * COMPY_SWARM.radius;
          c.wx = COMPY_SWARM.center[0] + Math.cos(ang) * rad;
          c.wz = COMPY_SWARM.center[1] + Math.sin(ang) * rad;
          dx = c.wx - px; dz = c.wz - pz;
        }
        const distW = Math.hypot(dx, dz) || 1;
        c.scatterT = Math.max(0, c.scatterT - dt);
        const speed = c.baseSpeed * (c.scatterT > 0 ? COMPY_SWARM.scatterSpeedMultiplier : 1);
        const vx = (dx / distW) * speed, vz = (dz / distW) * speed;
        a.root.position.x += vx * dt;
        a.root.position.z += vz * dt;
        const targetYaw = Math.atan2(vx, vz);
        let dyaw = targetYaw - a.root.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        a.root.rotation.y += dyaw * Math.min(1, dt * 9);
        a.dist += speed * dt;
        swingLegs(a, (a.dist / Math.max(0.2, a.entry.scaleM * 0.16)) * Math.PI);
      }

      // ── The swim driver ────────────────────────────────────────
      // Circuit + surfacing + the spine wave. The animal rides an
      // ellipse around the lake centre; its depth eases between
      // the profile's deep cruise and shallow pass on its own
      // period (surfacePhase), and the bed clamp — the same pure
      // lakeBedYAt the ground was carved with — keeps the belly
      // off the lake floor wherever the circuit shallows, while
      // the cap just above the waterline lets backs and fins
      // break the surface without beaching the body. The wave is
      // a lateral bend about each axial bone's local Y (the
      // land driver's tail-sway axis), travelling head → tail
      // with amplitude growing to the tail end; flippers paddle
      // about local X (the leg-swing axis) — front pair leading,
      // hind pair lagging, both sides in phase like a
      // plesiosaur's underwater flight.
      function updateSwimmer(s, t, dt) {
        const P = s.profile;
        s.theta += dt * P.speed * P.dir;
        const th = s.theta;
        const x = LAKE.center[0] + Math.cos(th) * P.rx;
        const z = LAKE.center[1] + Math.sin(th) * P.rz;
        const vx = -Math.sin(th) * P.rx * P.dir;
        const vz = Math.cos(th) * P.rz * P.dir;
        const surf = surfacePhase(t / P.period + s.phaseOff, P.duty);
        let y = P.deep + (P.shallow - P.deep) * surf;
        const minY = lakeBedYAt(x, z) + s.entry.scaleM * 0.16 + 0.3;
        if (y < minY) y = minY;
        if (y > LAKE.waterY + 0.3) y = LAKE.waterY + 0.3;
        const vy = dt > 0 ? (y - s.y) / dt : 0;
        s.y = y;
        s.root.position.set(x, y, z);
        s.root.rotation.set(0, 0, 0);
        s.root.rotation.y = Math.atan2(vx, vz);
        s.root.rotation.x = THREE.MathUtils.clamp(-vy * 0.1, -0.16, 0.16);
        s.root.rotation.z = 0.05 * P.dir;
        const wave = t * P.waveHz * Math.PI * 2 + s.phase;
        const n = s.axial.length;
        s.axial.forEach((b, i) => {
          const f = n > 1 ? i / (n - 1) : 0;
          const amp = 0.03 + (P.ampTail - 0.03) * f * f;
          bend(b, s.bind, AXIS_Y, Math.sin(wave - f * P.waveSpan) * amp);
        });
        const pw = t * P.paddleHz * Math.PI * 2 + s.phase;
        for (const fl of s.flippers) {
          const lag = fl.pair === 'hind' ? 1.4 : fl.pair === 'mid' ? 0.7 : 0;
          const a = Math.sin(pw - lag) * P.paddleAmp;
          fl.chain.forEach((b, i) => bend(b, s.bind, AXIS_X, a * (i === 0 ? 1 : 0.45)));
        }
        for (const chain of s.extras) {
          chain.forEach((b, i) => bend(b, s.bind, AXIS_Y, Math.sin(wave - 1.2 - i * 0.4) * 0.05));
        }
      }

      function driveAnimal(a, t, dt) {
        const R = a.roles;
        const ph = a.phase;
        const tempo = a.tempo || 1;
        // Breathing — a slow swell down the spine.
        const br = Math.sin(t * a.breathRate + ph) * 0.02;
        R.spine.forEach((b, i) => bend(b, a.bind, AXIS_X, br * (0.6 + i * 0.3)));
        // Look-arounds — lazy noise from summed sines.
        const yaw = (Math.sin(t * 0.23 * tempo + ph) * 0.6 + Math.sin(t * 0.117 * tempo + ph * 1.7) * 0.4) * 0.16;
        const pitch = Math.sin(t * 0.31 * tempo + ph) * 0.045;
        const neckShare = R.neck.length ? 0.45 / R.neck.length : 0;
        R.neck.forEach((b) => bend(b, a.bind, AXIS_Y, yaw * neckShare));
        // Grazer dips: herbivores lower their heads in a slow cycle.
        let dip = 0;
        if (a.entry.diet === 'herbivore') {
          const cyc = (t * 0.045 * tempo + ph) % 1;
          if (cyc > 0.55 && cyc < 0.85) dip = Math.sin(((cyc - 0.55) / 0.3) * Math.PI) * 0.38;
        }
        R.neck.forEach((b, i) => bend(b, a.bind, AXIS_X, dip * (0.25 + i * 0.12)));
        if (R.head) {
          bend(R.head, a.bind, AXIS_Y, yaw * 0.55);
          bend(R.head, a.bind, AXIS_X, pitch + dip * 0.5);
        }
        // Tail sway — phase runs down the chain.
        R.tail.forEach((b, i) => {
          bend(b, a.bind, AXIS_Y, Math.sin(t * 1.05 * tempo - i * 0.55 + ph) * 0.055);
          bend(b, a.bind, AXIS_X, Math.sin(t * 0.7 * tempo - i * 0.3 + ph) * 0.015);
        });

        if (a.compy) {
          updateCompy(a, dt);
          return;
        }

        if (a.flyer && a.fly) {
          const f = a.fly;
          f.a += dt * f.speed * f.dir;
          const x = f.cx + Math.cos(f.a) * f.r;
          const z = f.cz + Math.sin(f.a) * f.r;
          const nx = f.cx + Math.cos(f.a + 0.05 * f.dir) * f.r;
          const nz = f.cz + Math.sin(f.a + 0.05 * f.dir) * f.r;
          a.root.position.set(x, f.h + Math.sin(t * 0.5 + ph) * f.bob, z);
          a.root.rotation.y = Math.atan2(nx - x, nz - z);
          a.root.rotation.z = 0.28 * f.dir; // bank into the circle
          // Wingbeat in bursts, then a flat-winged glide: the
          // envelope eases on surfacePhase — the same window the
          // swimmers surface on — with the species' glide share;
          // in the glide the wings settle to a slight dihedral.
          // The wing chains themselves come from the rig
          // (resolveFlyerWings via resolveRoles): arm chains on
          // the humanoid template, measured fans on the
          // Tripo-native three.
          const glide = surfacePhase(t / f.cycle + (a.glideOff || 0), f.glideDuty);
          const flap = Math.sin(t * f.flapHz * Math.PI * 2 + ph) * f.flapAmp * (1 - glide) + glide * 0.05;
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
          swingLegs(a, stride);
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
        for (const s of swimmers) updateSwimmer(s, t, dt);
        // The lake surface drifts and breathes (gentle motion).
        if (waterTex) waterTex.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
        if (waterMat) waterMat.opacity = 0.48 + Math.sin(t * 0.6) * 0.04;
        for (const mq of mosquitos) updateMosquito(mq, t, dt);
        updateDracula(t, dt);
        // Blood sacs pulse on the ground; walking the camera close
        // picks one up (a tap collects it too).
        for (let i = sacs.length - 1; i >= 0; i--) {
          const s = sacs[i];
          s.group.position.y = 0.55 + Math.sin(t * 2.4 + i) * 0.08;
          const pulse = 1 + Math.sin(t * 3.2 + i * 1.7) * 0.08;
          s.core.scale.set(pulse, 1.25 * pulse, pulse);
          if (camera.position.distanceTo(s.group.position) < 8) collectSac(s);
        }
        // Shot bursts: a quick puff, then gone.
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.life += dt;
          const attr = b.points.geometry.attributes.position;
          for (let j = 0; j < b.vels.length; j++) {
            b.vels[j][1] -= 4 * dt;
            attr.array[j * 3] += b.vels[j][0] * dt;
            attr.array[j * 3 + 1] += b.vels[j][1] * dt;
            attr.array[j * 3 + 2] += b.vels[j][2] * dt;
          }
          attr.needsUpdate = true;
          b.points.material.opacity = Math.max(0, 1 - b.life / 0.45);
          if (b.life > 0.45) {
            scene.remove(b.points);
            bursts.splice(i, 1);
          }
        }
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
        removePointer();
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

  // The museum + Hammond are worldOnly manifest entries: citizens
  // of the walkable planet, never Bay cast — the Bay's totals and
  // roster count only its own foundry.
  const total = earth2PlacedModels().filter((m) => !m.worldOnly).length;

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
        eating, hunting, sleeping and the egg cycle come in a later round. New this
        round: a swarm of compies scurries the west meadow, giant mosquitos hunt the
        herds for blood, Spinosaurus Rex stalks the tar pit's edge, and at the far
        south rim the real Dracula holds court before the real Castle Transylvania,
        his bats on the wing — shoot his mosquitos full and trade him the sacs.
        New this round: the west lake fills — mosasaurus, tylosaurus and a
        megalodon cruise its bright blue on spine-wave power, plesiosaurs paddle
        above the deep, and their backs and fins break the surface as they
        circle — and Indominus Rex prowls the west rim opposite the tar pit,
        the Bay's second apex.
        New this round: wings over the lake — a Quetzalcoatlus and a
        Hatzegopteryx circle high and slow above the grounds, Tapejara and
        Nyctosaurus ride the middle air, little Pterodactylus and
        Archaeopteryx flutter below them, and Dimorphodon and
        Rhamphorhynchus skim the water on quick wings, every flyer
        flapping in bursts and flattening into glides on its own rhythm.
        Drag to look around, scroll to zoom, tap a mosquito to shoot it.
      </p>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1410]">
        <div ref={mountRef} className="aspect-[16/10] w-full sm:aspect-[16/9]" />
        <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="absolute left-2 top-2 flex max-w-[88%] flex-col items-start gap-1.5">
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-red-300/25 bg-black/50 py-1.5 pl-3 pr-1.5 text-[11px] text-zinc-100">
            <span>🩸 Blood sacs: <strong className="text-red-200">{sacsShown}</strong></span>
            <button
              type="button"
              onClick={() => openExchangeRef.current()}
              className="rounded-full border border-purple-300/40 bg-purple-500/20 px-2.5 py-1 font-bold text-purple-100 transition hover:bg-purple-500/35"
            >
              🧛 Bring sacs to Dracula
            </button>
          </div>
          <p className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-300">
            🦟 Tap a mosquito to shoot it — only the swollen red ones drop a blood sac.
            Unfed ones drop nothing.
          </p>
          {bayNotice && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-amber-100">
              {bayNotice}
            </p>
          )}
        </div>
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
        {EARTH2_MODELS.filter((m) => !m.worldOnly).map((m) => (
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
        {earth2PendingModels().length} still outstanding:{' '}
        {earth2PendingModels().map((m) => m.name).join(', ')} — their slots wait rather
        than faking a model. The Transylvania cast is all real now: the Count, his
        castle, his bats and his mosquitos are the actual Studio models, driven by
        the same feeding, shooting and transformation systems that ran their
        stand-ins — no placeholders remain among them.
      </p>
    </section>
  );
}
