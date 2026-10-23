'use client';

// components/earth2/Earth2World.jsx
// EARTH 2 — THE WALKABLE PLANET (Merlin, 2026-10-22): the chamber's
// second stage. Where the Dinosaur Bay is a diorama you orbit, this
// is the planet itself, on foot: the full 50 × 50 parcel grid from
// lib/earth2/parcels.js laid out as 1.4 km of continuous terrain
// (lib/earth2/world.js — biome per parcel, seeded heightfield,
// water below the waterline), populated by the same foundry cast
// the Bay drives, distributed by habitat: herds on the plains,
// stalkers in the highlands, swimmers in the great sea, flyers
// overhead, and Castle Transylvania standing at the south-pole
// parcel with Dracula, his bats and his mosquitos.
//
// Walking follows the platform's walk pattern (the babel inputRef
// shape + the shared WalkJoystick) in the Bay's plain-three style:
// WASD + drag-look on desktop, joystick + drag-look on touch,
// feet glued to heightAt, radius push-out collision, wading in
// the shallows, deep water turns you back. Stepping onto a parcel
// is DISPLAY ONLY — the HUD reads the parcel out (id, name, tier,
// Commons/ownable, lat/lon, biome) and syncs the chamber map's
// selection; rent and buying stay with the chamber panels.
//
// Perf discipline (honest): the whole cast exists world-wide, but
// only the near population animates — land animals drive their
// rigs within 260 m and hide past 520 m, plants sway within
// 200 m and hide past it, labels show within 140 m. Swimmers,
// flyers, mosquitos and Dracula always run (they are few), with
// distance visibility caps. One static terrain draw (103k verts)
// + one water plane carry the ground.
//
// Delivery stays locked exactly as the Bay's: owner-signed URLs
// via /api/earth2/model-urls, resolved through lib/earth2/models.js.

import { useEffect, useRef, useState } from 'react';
import { EARTH2_MODEL_BY_SLUG, earth2PlacedModels, earth2ModelUrl, fetchEarth2ModelUrls } from '@/lib/earth2/models';
import { supabase } from '@/lib/supabase';
import { resolveBones, normalizeJointName, resolveMosquitoRig, resolveBatWings, resolveSwimRig, resolveFlyerWings } from '@/lib/earth2/bones';
import {
  COMPY_SWARM,
  MOSQUITO_CONFIG,
  BAT_SWARM,
  DRACULA_TIMINGS,
  surfacePhase,
  mosquitoDropsSac,
  createDraculaMachine,
  stepDracula,
} from '@/lib/earth2/creatures';
import { isCastleParcel } from '@/lib/earth2/parcels';
import {
  WORLD_SIZE_M,
  WORLD_HALF_M,
  WATER_Y,
  WALK_EYE_M,
  heightAt,
  groundColorAt,
  parcelAtWorld,
  parcelBorderPoints,
  worldToLatLon,
  biomeForParcel,
  resolveSpawnParcel,
  spawnPointFor,
  worldLandforms,
  worldCreatures,
  worldSwimmers,
  worldFlyers,
  worldPlants,
  worldMosquitoCenters,
  compySwarmCenter,
  draculaCourt,
  worldColliders,
  stepWorldWalker,
  applyWorldLook,
} from '@/lib/earth2/world';
import WalkJoystick from '@/components/world/WalkJoystick';

// Deterministic layout RNG (mulberry32) — the same generator the
// Bay arranges itself with; the world strikes the same poses on
// every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_LABEL = { standard: 'Standard', prime: 'Prime', landmark: 'Landmark' };
const CLIMATE_LABEL = {
  polar: 'Polar', subpolar: 'Subpolar', temperate: 'Temperate',
  subtropical: 'Subtropical', tropical: 'Tropical',
};

export default function Earth2World({ spawnParcelId, bloodSacs, onBloodSac, onOpenExchange, greetSignal, onParcelChange, onExit } = {}) {
  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const [hud, setHud] = useState(null); // { parcel, biome, lat, lon }
  const [notice, setNotice] = useState('');
  const [travel, setTravel] = useState(false);
  const [localSacs, setLocalSacs] = useState(0);
  const [status, setStatus] = useState({});

  // The walk input, in the platform's shape (babel's inputRef):
  // the page shell (keyboard, pointer, joystick) writes, the scene
  // consumes every frame.
  const inputRef = useRef({
    keys: { fwd: false, back: false, left: false, right: false, shift: false },
    joy: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 },
  });
  const travelRef = useRef(false);
  travelRef.current = travel;
  const exitRef = useRef(() => {});
  exitRef.current = () => { if (typeof onExit === 'function') onExit(); };
  const greetRef = useRef(false);
  const collectSacRef = useRef(() => {});
  collectSacRef.current = () => {
    if (typeof onBloodSac === 'function') onBloodSac();
    else setLocalSacs((n) => n + 1);
  };
  const openExchangeRef = useRef(() => {});
  openExchangeRef.current = () => {
    greetRef.current = true;
    if (typeof onOpenExchange === 'function') onOpenExchange();
  };
  const parcelChangeRef = useRef(() => {});
  parcelChangeRef.current = (id) => { if (typeof onParcelChange === 'function') onParcelChange(id); };
  const noticeRef = useRef(() => {});
  noticeRef.current = (msg) => setNotice(msg);
  useEffect(() => { if (greetSignal) greetRef.current = true; }, [greetSignal]);
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(''), 4200);
    return () => clearTimeout(id);
  }, [notice]);
  const sacsShown = typeof bloodSacs === 'number' ? bloodSacs : localSacs;
  const totalModels = earth2PlacedModels().length;
  const placedCount = earth2PlacedModels().filter((m) => status[m.slug] === 'placed').length;

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
      if (cancelled || !mountRef.current) return;

      // Earth 2 asset lock — identical to the Bay's: fetch the
      // owner-signed model URLs once, before anything loads.
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
      renderer.domElement.style.touchAction = 'none';

      const scene = new THREE.Scene();
      { // sky: soft vertical gradient (the Bay's sky)
        const c = document.createElement('canvas'); c.width = 4; c.height = 512;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#7db4e6'); grad.addColorStop(0.55, '#bcd9ef'); grad.addColorStop(1, '#e8f0e4');
        g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        scene.background = tex;
      }
      scene.fog = new THREE.Fog(0xcfe0ea, 130, 980);

      const camera = new THREE.PerspectiveCamera(66, 16 / 10, 0.1, 2400);
      camera.rotation.order = 'YXZ';

      scene.add(new THREE.HemisphereLight(0xd8ecff, 0x40543a, 1.05));
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
      sun.position.set(60, 90, 40);
      scene.add(sun);

      const rng = mulberry32(20261022);
      const animals = [];   // land creatures + flyers (life-driven)
      const swimmers = [];  // the sea's cast
      const sway = [];      // plant instances { obj, phase, amp, x, z }
      const labels = [];    // { el, obj, h, maxDist }
      const disposables = [];
      const track = (o) => { disposables.push(o); return o; };
      const setStatusFor = (slug, s) => { if (!cancelled) setStatus((prev) => ({ ...prev, [slug]: s })); };

      // ── Terrain: ONE static mesh sampled from world.js — the
      // same heightAt/groundColorAt the walker, the drivers and
      // the tests all read, so ground, feet and data can never
      // disagree. Vertex colours carry the biome tint blended
      // across parcel borders, the beach band and the bed shading.
      {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        g.fillStyle = '#8a9a7a'; g.fillRect(0, 0, 512, 512);
        const rngTex = mulberry32(77);
        const tones = ['#7d8f6e', '#96a583', '#a3ad8d', '#87977a', '#9aa58c'];
        for (let i = 0; i < 900; i++) {
          g.fillStyle = tones[Math.floor(rngTex() * tones.length)];
          g.globalAlpha = 0.10 + rngTex() * 0.14;
          const r = 6 + rngTex() * 30;
          g.beginPath(); g.arc(rngTex() * 512, rngTex() * 512, r, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(46, 46);
        const geo = new THREE.PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M, 320, 320);
        geo.rotateX(-Math.PI / 2);
        const posA = geo.attributes.position;
        const colors = new Float32Array(posA.count * 3);
        for (let i = 0; i < posA.count; i++) {
          const x = posA.getX(i);
          const z = posA.getZ(i);
          posA.setY(i, heightAt(x, z));
          const col = groundColorAt(x, z);
          colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, vertexColors: true }));
        scene.add(ground);
        track(ground);
      }

      // ── The water: one bright-blue plane at the waterline
      // (Merlin's water law — clear, never murky), translucent so
      // the swimmers read beneath it. Terrain below WATER_Y is
      // wet; everywhere else the ground covers the plane.
      let waterMat = null;
      let waterTex = null;
      {
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
        waterTex.repeat.set(30, 30);
        waterMat = new THREE.MeshStandardMaterial({
          color: 0x2f9fd8, map: waterTex, transparent: true, opacity: 0.5,
          roughness: 0.12, metalness: 0, depthWrite: false,
        });
        const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_Y;
        scene.add(water);
        track(water);
      }

      // ── The current-parcel highlight: an amber outline hugging
      // the terrain along the parcel's border, rebuilt whenever
      // the walker crosses into a new parcel.
      const highlightMat = new THREE.LineBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.95 });
      let highlight = null;
      function setHighlight(parcel) {
        const pts = parcelBorderPoints(parcel, 8);
        const verts = new Float32Array((pts.length + 1) * 3);
        pts.forEach(([x, z], i) => {
          verts[i * 3] = x;
          verts[i * 3 + 1] = heightAt(x, z) + 0.35;
          verts[i * 3 + 2] = z;
        });
        verts[pts.length * 3] = verts[0];
        verts[pts.length * 3 + 1] = verts[1];
        verts[pts.length * 3 + 2] = verts[2];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        if (highlight) {
          highlight.geometry.dispose();
          highlight.geometry = geo;
        } else {
          highlight = new THREE.Line(geo, highlightMat);
          scene.add(highlight);
        }
      }

      // ── The loader + rig machinery (the Bay's, re-based on
      // terrain): normalize, load, bone roles, bind poses, facing.
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

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
        const url = earth2ModelUrl(entry, signedModelUrls);
        if (!url) throw new Error(`No delivery URL for ${entry.slug}`);
        const gltf = await loader.loadAsync(url);
        track(gltf.scene);
        return gltf.scene;
      }

      function bonesOf(modelScene) {
        const bones = new Map();
        modelScene.traverse((o) => {
          if (o.isBone) bones.set(normalizeJointName(o.name), o);
        });
        return bones;
      }

      function makeLabel(text, obj, h, maxDist = 140) {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full border border-black/25 bg-black/45 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90';
        el.style.willChange = 'transform';
        el.style.display = 'none';
        labelsRef.current && labelsRef.current.appendChild(el);
        labels.push({ el, obj, h, maxDist });
      }

      function resolveRoles(modelScene) {
        const bones = bonesOf(modelScene);
        const roles = resolveBones([...bones.keys()]);
        const roleBone = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
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

      function bindQuats(resolved) {
        const bind = new Map();
        for (const b of [...resolved.spine, ...resolved.neck, ...(resolved.head ? [resolved.head] : []), ...resolved.tail,
          ...resolved.legs.flatMap((l) => [l.thigh, l.calf, l.foot]),
          ...resolved.wings.flatMap((w) => w.chain)]) {
          if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
        }
        return bind;
      }

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

      // ── Placement: landforms & plants (the set) ──────────────
      async function placeLandform(entry, rec) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const holder = normalize(modelScene, entry);
          const root = new THREE.Group();
          root.add(holder);
          const gy = heightAt(rec.x, rec.z);
          root.position.set(rec.x, gy - (rec.sink || 0), rec.z);
          root.rotation.y = rec.heading || 0;
          scene.add(root);
          if (entry.slug === 'active-volcano') {
            const light = new THREE.PointLight(0xff6a22, 900, 90, 1.8);
            light.position.set(rec.x, gy + entry.scaleM * 0.94, rec.z);
            scene.add(light);
            const c = document.createElement('canvas'); c.width = 128; c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,150,50,0.85)'); grad.addColorStop(0.4, 'rgba(255,90,20,0.35)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
            g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
            const tex = new THREE.CanvasTexture(c);
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            spr.scale.setScalar(16);
            spr.position.set(rec.x, gy + entry.scaleM * 0.97, rec.z);
            scene.add(spr);
            track(spr);
          }
          if (rec.extras) {
            for (const e of rec.extras) {
              const cloneRoot = new THREE.Group();
              cloneRoot.copy(root, true);
              cloneRoot.position.set(e.x, heightAt(e.x, e.z), e.z);
              cloneRoot.scale.setScalar(e.scale);
              scene.add(cloneRoot);
            }
          }
          makeLabel(entry.name, root, entry.scaleM * 0.8 + 2, 320);
          setStatusFor(entry.slug, 'placed');
          return root;
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      async function placePlantSpecies(entry, instances) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          instances.forEach((rec, i) => {
            const inst = i === 0 ? modelScene : modelScene.clone();
            const holder = normalize(inst, entry);
            const root = new THREE.Group();
            root.add(holder);
            root.position.set(rec.x, heightAt(rec.x, rec.z) - 0.1, rec.z);
            root.rotation.y = rec.heading;
            root.scale.setScalar(rec.scale);
            scene.add(root);
            sway.push({ obj: root, phase: rng() * 6.28, amp: entry.scaleM > 4 ? 0.016 : 0.03, x: rec.x, z: rec.z });
          });
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // ── Placement: land creatures (herds, packs, stalkers) ───
      // One load per species; herd copies are clones of the
      // foundry model, exactly as the compy swarm and the bat
      // swarm clone theirs.
      async function placeLandSpecies(entry, recs) {
        setStatusFor(entry.slug, 'loading');
        try {
          const baseScene = await loadModel(entry);
          for (let i = 0; i < recs.length; i++) {
            const rec = recs[i];
            const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
            const resolved = resolveRoles(modelScene);
            const facingYaw = measureFacing(modelScene, resolved);
            const spin = normalize(modelScene, entry);
            spin.rotation.y = facingYaw;
            const root = new THREE.Group();
            root.add(spin);
            root.position.set(rec.x, heightAt(rec.x, rec.z), rec.z);
            root.rotation.y = rec.heading;
            scene.add(root);
            animals.push({
              entry, root, roles: resolved, bind: bindQuats(resolved),
              phase: rng() * Math.PI * 2,
              breathRate: 0.75 + rng() * 0.35,
              tempo: 1,
              walker: rec.walk ? { ...rec.walk, theta: rec.walk.a0 } : null,
              flyer: false, dist: 0,
            });
            if (i === 0) makeLabel(entry.name, root, entry.scaleM * 0.72 + 1.2);
          }
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // ── Placement: flyers ────────────────────────────────────
      async function placeFlyer(entry, rec) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const resolved = resolveRoles(modelScene);
          const facingYaw = measureFacing(modelScene, resolved);
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          root.position.set(rec.cx + rec.r, rec.h, rec.cz);
          scene.add(root);
          animals.push({
            entry, root, roles: resolved, bind: bindQuats(resolved),
            phase: rng() * Math.PI * 2,
            breathRate: 0.75 + rng() * 0.35,
            tempo: 1,
            walker: null, flyer: true, dist: 0,
            fly: { ...rec, a: rng() * 6.28 },
            glideOff: rng(),
          });
          makeLabel(entry.name, root, entry.scaleM * 0.5 + 1.5, 260);
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // ── Placement: swimmers (the sea's cast) ─────────────────
      async function placeSwimmer(entry, rec) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
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
          const facingYaw = measureFacing(modelScene, {
            head: boneFor(rig.head),
            spine: axial.length ? [axial[axial.length - 1]] : [],
          });
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          const theta0 = rng() * Math.PI * 2;
          root.position.set(rec.cx + Math.cos(theta0) * rec.rx, rec.deep, rec.cz + Math.sin(theta0) * rec.rz);
          scene.add(root);
          swimmers.push({
            entry, root, profile: rec, axial, flippers, extras, bind,
            theta: theta0,
            phase: rng() * Math.PI * 2,
            phaseOff: rng(),
            y: rec.deep,
          });
          makeLabel(entry.name, root, entry.scaleM * 0.3 + 2.4, 300);
          setStatusFor(entry.slug, 'placed');
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
        }
      }

      // ── Build the population from the world plan ─────────────
      const landformRecs = worldLandforms();
      for (const rec of landformRecs) {
        if (cancelled) return;
        const entry = EARTH2_MODEL_BY_SLUG.get(rec.slug);
        if (entry && entry.file) await placeLandform(entry, rec);
      }
      const plantRecs = worldPlants();
      {
        const bySlug = new Map();
        for (const rec of plantRecs) {
          if (!bySlug.has(rec.slug)) bySlug.set(rec.slug, []);
          bySlug.get(rec.slug).push(rec);
        }
        for (const [slug, instances] of bySlug) {
          if (cancelled) return;
          const entry = EARTH2_MODEL_BY_SLUG.get(slug);
          if (entry && entry.file) await placePlantSpecies(entry, instances);
        }
      }
      {
        const bySlug = new Map();
        for (const rec of worldCreatures()) {
          if (!bySlug.has(rec.slug)) bySlug.set(rec.slug, []);
          bySlug.get(rec.slug).push(rec);
        }
        for (const [slug, recs] of bySlug) {
          if (cancelled) return;
          const entry = EARTH2_MODEL_BY_SLUG.get(slug);
          if (entry && entry.file) await placeLandSpecies(entry, recs);
        }
      }
      for (const rec of worldFlyers()) {
        if (cancelled) return;
        if (rec.slug === BAT_SWARM.sourceSlug) continue; // the bat belongs to the castle
        const entry = EARTH2_MODEL_BY_SLUG.get(rec.slug);
        if (entry && entry.file) await placeFlyer(entry, rec);
      }
      for (const rec of worldSwimmers()) {
        if (cancelled) return;
        const entry = EARTH2_MODEL_BY_SLUG.get(rec.slug);
        if (entry && entry.file) await placeSwimmer(entry, rec);
      }

      // ── Transylvania & the blood-sac loop, at planet scale ───
      const court = draculaCourt();
      const CASTLE_AT = [court.castle.x, court.castle.z];
      const CASTLE_BASE_Y = heightAt(CASTLE_AT[0], CASTLE_AT[1]);
      const DRACULA_SPOT = new THREE.Vector3(court.spot.x, court.spot.y, court.spot.z);
      const COMPY_CENTER = compySwarmCenter();
      const mosquitos = [];
      const sacs = []; // { group, core, baseY }
      const bursts = []; // { points, vels, life }
      const swarmBats = [];
      const drac = {
        machine: createDraculaMachine(),
        countForm: null, batForm: null, batWings: null,
        countRig: null,
        smoke: null, batAngle: 0, returnFrom: new THREE.Vector3(),
      };
      let dracBatBase = null;
      const tmpMove = new THREE.Vector3();
      const tmpTarget = new THREE.Vector3();
      const anchorV = new THREE.Vector3();

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
              COMPY_CENTER.x + Math.cos(ang) * rad, 0,
              COMPY_CENTER.z + Math.sin(ang) * rad,
            );
            root.position.y = heightAt(root.position.x, root.position.z);
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
          try { baseScene = await loadModel(entry); } catch (err) { baseScene = null; }
        }
        if (!baseScene) { setStatusFor('giant-mosquito', 'failed'); return; }
        const centers = worldMosquitoCenters();
        for (let i = 0; i < MOSQUITO_CONFIG.count; i++) {
          const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
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
          const home = centers.length ? centers[i % centers.length] : { cx: 0, cz: 0 };
          const mq = {
            group, proxy, parts,
            phase: 'cruising',
            a: rng() * Math.PI * 2,
            r: 18 + rng() * 22,
            h: MOSQUITO_CONFIG.cruiseHeight + rng() * 3,
            cx: home.cx + (rng() - 0.5) * 24, cz: home.cz + (rng() - 0.5) * 24,
            speed: MOSQUITO_CONFIG.cruiseSpeed * (0.85 + rng() * 0.3),
            feedT: 0, fedLevel: 0, target: null,
            cruiseT: 0,
            nextFeedIn: MOSQUITO_CONFIG.firstFeedDelay[0]
              + rng() * (MOSQUITO_CONFIG.firstFeedDelay[1] - MOSQUITO_CONFIG.firstFeedDelay[0]),
            vy: 0, goneT: 0, willDropSac: false,
          };
          mq.baseY = heightAt(mq.cx, mq.cz);
          proxy.userData.mosquito = mq;
          group.position.set(
            mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
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
          countGroup.rotation.y = court.facing; // face the world's heart
          scene.add(countGroup);
          drac.countForm = countGroup;
          setStatusFor('dracula', 'placed');
        } else {
          setStatusFor('dracula', 'failed');
        }

        const bEntry = EARTH2_MODEL_BY_SLUG.get('vampire-bat');
        if (bEntry && bEntry.file) {
          try { dracBatBase = await loadModel(bEntry); } catch (err) { dracBatBase = null; }
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
        const groundY = heightAt(at.x, at.z);
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
        group.position.set(at.x, groundY + 0.55, at.z);
        scene.add(group);
        const sac = { group, core, baseY: groundY + 0.55 };
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
        mq.baseY = heightAt(mq.cx, mq.cz);
        mq.group.position.set(
          mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
          mq.cz + Math.sin(mq.a) * mq.r,
        );
        applyAbdomen(mq);
      }

      function landMosquito(mq) {
        mq.group.position.y = heightAt(mq.group.position.x, mq.group.position.z) + 0.25;
        if (mq.willDropSac) spawnSac(mq.group.position);
        spawnBurst(mq.group.position, mq.willDropSac ? 0xd42a2a : 0x9a958c);
        mq.group.visible = false;
        mq.phase = 'gone';
        mq.goneT = 0;
      }

      function shootMosquito(mq) {
        if (mq.phase === 'falling' || mq.phase === 'gone') return;
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
              mq.baseY + mq.h + Math.sin(t * 1.3 + mq.a * 3) * 0.5,
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
              mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
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
            if (pos.y <= heightAt(pos.x, pos.z) + 0.25) landMosquito(mq);
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
            const x = CASTLE_AT[0] + Math.cos(drac.batAngle) * 30;
            const z = CASTLE_AT[1] + Math.sin(drac.batAngle) * 30;
            const nx = CASTLE_AT[0] + Math.cos(drac.batAngle + 0.06) * 30;
            const nz = CASTLE_AT[1] + Math.sin(drac.batAngle + 0.06) * 30;
            drac.batForm.position.set(x, CASTLE_BASE_Y + 19 + Math.sin(t * 2.1) * 1.2, z);
            drac.batForm.rotation.y = Math.atan2(nx - x, nz - z);
            drac.batForm.rotation.z = 0.28;
            flapWings(drac.batWings, t, 16);
          } else if (m.phase === 'return') {
            const p = Math.min(1, m.t / DRACULA_TIMINGS.returnSeconds);
            const e = p * p * (3 - 2 * p);
            tmpTarget.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
            drac.batForm.position.lerpVectors(drac.returnFrom, tmpTarget, e);
            flapWings(drac.batWings, t, 16);
          }
        }
        // The castle swarm — near enough to matter only when the
        // walker is in the south; positions always track, wings
        // flap when the court is within reach of the eye.
        const scatter = m.scatter;
        for (const b of swarmBats) {
          b.a += dt * b.speed * (1 + scatter * 1.8);
          const r = b.r * (1 + scatter * 1.15);
          const x = CASTLE_AT[0] + Math.cos(b.a) * r;
          const z = CASTLE_AT[1] + Math.sin(b.a) * r;
          const nx = CASTLE_AT[0] + Math.cos(b.a + 0.05) * r;
          const nz = CASTLE_AT[1] + Math.sin(b.a + 0.05) * r;
          b.group.position.set(x, CASTLE_BASE_Y + b.h + Math.sin(t * 0.9 + b.ph) * 0.8, z);
          b.group.rotation.y = Math.atan2(nx - x, nz - z);
          b.group.rotation.z = 0.28;
          if (castleNear) flapWings(b.wings, t + b.ph, 11);
        }
      }

      // ── The life driver (the Bay's, walking on real terrain) ──
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
          c.wx = COMPY_CENTER.x + Math.cos(ang) * rad;
          c.wz = COMPY_CENTER.z + Math.sin(ang) * rad;
          dx = c.wx - px; dz = c.wz - pz;
        }
        const distW = Math.hypot(dx, dz) || 1;
        c.scatterT = Math.max(0, c.scatterT - dt);
        const speed = c.baseSpeed * (c.scatterT > 0 ? COMPY_SWARM.scatterSpeedMultiplier : 1);
        const vx = (dx / distW) * speed, vz = (dz / distW) * speed;
        a.root.position.x += vx * dt;
        a.root.position.z += vz * dt;
        a.root.position.y = heightAt(a.root.position.x, a.root.position.z);
        const targetYaw = Math.atan2(vx, vz);
        let dyaw = targetYaw - a.root.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        a.root.rotation.y += dyaw * Math.min(1, dt * 9);
        a.dist += speed * dt;
        swingLegs(a, (a.dist / Math.max(0.2, a.entry.scaleM * 0.16)) * Math.PI);
      }

      function updateSwimmer(s, t, dt) {
        const P = s.profile;
        s.theta += dt * P.speed * P.dir;
        const th = s.theta;
        const x = P.cx + Math.cos(th) * P.rx;
        const z = P.cz + Math.sin(th) * P.rz;
        const vx = -Math.sin(th) * P.rx * P.dir;
        const vz = Math.cos(th) * P.rz * P.dir;
        const surf = surfacePhase(t / P.period + s.phaseOff, P.duty);
        let y = P.deep + (P.shallow - P.deep) * surf;
        const minY = heightAt(x, z) + s.entry.scaleM * 0.16 + 0.3;
        if (y < minY) y = minY;
        if (y > WATER_Y + 0.3) y = WATER_Y + 0.3;
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
        const br = Math.sin(t * a.breathRate + ph) * 0.02;
        R.spine.forEach((b, i) => bend(b, a.bind, AXIS_X, br * (0.6 + i * 0.3)));
        const yaw = (Math.sin(t * 0.23 * tempo + ph) * 0.6 + Math.sin(t * 0.117 * tempo + ph * 1.7) * 0.4) * 0.16;
        const pitch = Math.sin(t * 0.31 * tempo + ph) * 0.045;
        const neckShare = R.neck.length ? 0.45 / R.neck.length : 0;
        R.neck.forEach((b) => bend(b, a.bind, AXIS_Y, yaw * neckShare));
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
          // Cruise height, but never through a ridge: the flyer
          // lifts over rising terrain as it comes.
          const floorY = heightAt(x, z) + a.entry.scaleM * 0.8 + 2.5;
          const y = Math.max(f.h + Math.sin(t * 0.5 + ph) * f.bob, floorY);
          a.root.position.set(x, y, z);
          a.root.rotation.y = Math.atan2(nx - x, nz - z);
          a.root.rotation.z = 0.28 * f.dir;
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
          // Feet on the terrain, always (the land-layer law).
          a.root.position.y = heightAt(x, z) + Math.abs(Math.sin(stride)) * 0.02 * Math.sqrt(a.entry.scaleM);
          a.root.rotation.x = Math.sin(stride * 2) * 0.008;
        }
      }

      // ── The walker ───────────────────────────────────────────
      const spawnParcel = resolveSpawnParcel(spawnParcelId);
      const spawn = spawnPointFor(spawnParcel);
      const walker = {
        x: spawn.x, z: spawn.z,
        yaw: Math.atan2(spawn.x, spawn.z), // face the world's heart
        pitch: 0,
      };
      const staticColliders = worldColliders();
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let bobT = 0;
      let castleNear = false;
      let hudParcel = null;

      function syncParcel(force) {
        const p = parcelAtWorld(walker.x, walker.z);
        if (!force && hudParcel && p.index === hudParcel.index) return;
        hudParcel = p;
        setHighlight(p);
        const ll = worldToLatLon(walker.x, walker.z);
        if (!cancelled) {
          setHud({ parcel: p, biome: biomeForParcel(p), lat: ll.lat, lon: ll.lon });
        }
        parcelChangeRef.current(p.id);
      }
      syncParcel(true);
      camera.position.set(walker.x, heightAt(walker.x, walker.z) + WALK_EYE_M, walker.z);
      camera.rotation.set(0, walker.yaw, 0);

      // ── Input: keyboard (window), drag-look + tap (canvas) ──
      const KEYMAP = {
        KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      };
      function onKeyDown(e) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { inputRef.current.keys.shift = true; return; }
        if (e.code === 'Escape') { exitRef.current(); return; }
        const k = KEYMAP[e.code];
        if (k) {
          inputRef.current.keys[k] = true;
          if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
        }
      }
      function onKeyUp(e) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { inputRef.current.keys.shift = false; return; }
        const k = KEYMAP[e.code];
        if (k) inputRef.current.keys[k] = false;
      }
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // Tap-to-shoot (the Bay's interaction, first person): a tap
      // — not a drag — raycasts the mosquito proxies, the sac
      // pickups and Dracula himself.
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      function handleTap(e) {
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
      let dragId = null;
      let lastPX = 0;
      let lastPY = 0;
      let downT = 0;
      let dragMoved = 0;
      function onPointerDown(e) {
        dragId = e.pointerId;
        lastPX = e.clientX;
        lastPY = e.clientY;
        downT = performance.now();
        dragMoved = 0;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }
      function onPointerMove(e) {
        if (e.pointerId !== dragId) return;
        const dx = e.clientX - lastPX;
        const dy = e.clientY - lastPY;
        lastPX = e.clientX;
        lastPY = e.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);
        inputRef.current.look.dx += dx;
        inputRef.current.look.dy += dy;
      }
      function onPointerUp(e) {
        if (e.pointerId !== dragId) return;
        dragId = null;
        if (dragMoved < 7 && performance.now() - downT < 450) handleTap(e);
      }
      function onPointerCancel() { dragId = null; }
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerCancel);

      // ── The frame ────────────────────────────────────────────
      let raf = 0;
      const labelV = new THREE.Vector3();
      function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const inp = inputRef.current;

        // Look: consume the accumulated drag deltas.
        if (inp.look.dx !== 0 || inp.look.dy !== 0) {
          const l = applyWorldLook(walker.yaw, walker.pitch, inp.look.dx, inp.look.dy);
          walker.yaw = l.yaw;
          walker.pitch = l.pitch;
          inp.look.dx = 0;
          inp.look.dy = 0;
        }

        // Move: keyboard + joystick, Earth laws enforced inside
        // stepWorldWalker (colliders, wading, the world's edge).
        const fwdIn = (inp.keys.fwd ? 1 : 0) - (inp.keys.back ? 1 : 0) + inp.joy.y;
        const strafeIn = (inp.keys.right ? 1 : 0) - (inp.keys.left ? 1 : 0) + inp.joy.x;
        const travelNow = travelRef.current || inp.keys.shift;
        const dyn = [{ x: DRACULA_SPOT.x, z: DRACULA_SPOT.z, r: 1.3 }];
        for (const a of animals) {
          if (a.flyer || a.compy) continue;
          const dx = a.root.position.x - walker.x;
          const dz = a.root.position.z - walker.z;
          if (dx * dx + dz * dz < 3600) {
            dyn.push({ x: a.root.position.x, z: a.root.position.z, r: Math.max(1.0, a.entry.scaleM * 0.36) });
          }
        }
        const next = stepWorldWalker(walker, walker.yaw, { fwd: fwdIn, strafe: strafeIn }, dt, staticColliders.concat(dyn), travelNow);
        const movedDist = Math.hypot(next.x - walker.x, next.z - walker.z);
        walker.x = next.x;
        walker.z = next.z;
        const groundY = heightAt(walker.x, walker.z);
        const depth = Math.max(0, WATER_Y - groundY);
        let bob = 0;
        if (!reducedMotion && movedDist > 1e-4 && depth < 0.2) {
          bobT += dt * (travelNow ? 13 : 8.5);
          bob = Math.abs(Math.sin(bobT)) * 0.055;
        }
        camera.position.set(
          walker.x,
          groundY + WALK_EYE_M - Math.min(depth, 1.1) * 0.3 + bob,
          walker.z,
        );
        camera.rotation.set(walker.pitch, walker.yaw, 0);
        syncParcel(false);
        castleNear = Math.hypot(walker.x - CASTLE_AT[0], walker.z - CASTLE_AT[1]) < 800;

        // Life, by proximity: land animals animate within 260 m
        // and hide past 520 m; flyers and swimmers always run
        // (they are few) with far visibility caps.
        for (const a of animals) {
          const d = Math.hypot(a.root.position.x - walker.x, a.root.position.z - walker.z);
          if (a.flyer) {
            a.root.visible = d < 1000;
            if (a.root.visible) driveAnimal(a, t, dt);
          } else {
            a.root.visible = d < 520;
            if (d < 260) driveAnimal(a, t, dt);
            else if (a.walker) {
              // Frozen mid-stride is fine at range; keep the feet
              // planted on the terrain regardless.
              a.root.position.y = heightAt(a.root.position.x, a.root.position.z);
            }
          }
        }
        for (const s of swimmers) {
          const d = Math.hypot(s.root.position.x - walker.x, s.root.position.z - walker.z);
          s.root.visible = d < 750;
          if (s.root.visible) updateSwimmer(s, t, dt);
        }
        if (waterTex) waterTex.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
        if (waterMat) waterMat.opacity = 0.48 + Math.sin(t * 0.6) * 0.04;
        for (const mq of mosquitos) {
          const d = Math.hypot(mq.group.position.x - walker.x, mq.group.position.z - walker.z);
          if (mq.phase !== 'gone') mq.group.visible = d < 550;
          updateMosquito(mq, t, dt);
        }
        updateDracula(t, dt);
        // Blood sacs pulse; stepping up to one picks it up.
        for (let i = sacs.length - 1; i >= 0; i--) {
          const s = sacs[i];
          s.group.position.y = s.baseY + Math.sin(t * 2.4 + i) * 0.08;
          const pulse = 1 + Math.sin(t * 3.2 + i * 1.7) * 0.08;
          s.core.scale.set(pulse, 1.25 * pulse, pulse);
          const dx = s.group.position.x - walker.x;
          const dz = s.group.position.z - walker.z;
          if (dx * dx + dz * dz < 2.6 * 2.6) collectSac(s);
        }
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
          const d2 = (s.x - walker.x) ** 2 + (s.z - walker.z) ** 2;
          s.obj.visible = d2 < 260 * 260;
          if (d2 < 200 * 200) {
            s.obj.rotation.z = Math.sin(t * 0.85 + s.phase) * s.amp * 0.85;
            s.obj.rotation.x = Math.cos(t * 0.6 + s.phase) * s.amp * 0.5;
          }
        }
        renderer.render(scene, camera);
        // Labels: near creatures only, projected each frame.
        const w = mount.clientWidth, h = mount.clientHeight;
        for (const l of labels) {
          if (!l.obj.visible) { l.el.style.display = 'none'; continue; }
          const d = Math.hypot(l.obj.position.x - walker.x, l.obj.position.z - walker.z);
          if (d > l.maxDist) { l.el.style.display = 'none'; continue; }
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
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
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

  const parcel = hud ? hud.parcel : null;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-[#0a1410]">
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* The parcel readout — the chamber map, read from the ground. */}
      <div className="absolute left-2 top-2 flex max-w-[92%] flex-col items-start gap-1.5 sm:left-3 sm:top-3">
        <div className="rounded-2xl border border-amber-300/30 bg-black/55 px-3.5 py-2.5 text-zinc-100 backdrop-blur-sm">
          <div className="text-[10px] font-black tracking-[0.25em] text-amber-200">
            🚶 EARTH 2 — ON FOOT
          </div>
          {parcel ? (
            <>
              <div className="mt-0.5 text-lg font-black leading-tight text-white">
                {parcel.name}
                {isCastleParcel(parcel) ? ' 🏰' : ''}
              </div>
              <div className="text-[11px] leading-snug text-zinc-300">
                {parcel.id} · {TIER_LABEL[parcel.tier] || parcel.tier} land ·{' '}
                {parcel.ownable ? 'Ownable' : '🌿 Free Commons'}
              </div>
              <div className="text-[11px] leading-snug text-zinc-400">
                {hud.lat.toFixed(1)}° lat · {hud.lon.toFixed(1)}° lon ·{' '}
                {hud.biome.family} · {CLIMATE_LABEL[hud.biome.climate] || hud.biome.climate}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-zinc-500">
                Display only — no rent, no buying on foot. The chamber panels keep those jobs.
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-sm text-zinc-300">Stepping onto the planet…</div>
          )}
        </div>
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
        {notice && (
          <p className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-amber-100">
            {notice}
          </p>
        )}
      </div>

      <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5 sm:right-3 sm:top-3">
        <button
          type="button"
          onClick={() => { if (typeof onExit === 'function') onExit(); }}
          className="rounded-full border border-white/25 bg-black/55 px-3.5 py-2 text-[12px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          ✕ Leave the planet
        </button>
        {placedCount < totalModels && (
          <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-zinc-200">
            Placing the foundry… {placedCount}/{totalModels}
          </div>
        )}
      </div>

      {/* Touch controls: the shared walk joystick + travel toggle. */}
      <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5">
        <WalkJoystick
          size={118}
          onMove={(x, y) => { inputRef.current.joy.x = x; inputRef.current.joy.y = y; }}
        />
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 sm:bottom-5 sm:right-5">
        <button
          type="button"
          aria-pressed={travel}
          onClick={() => setTravel((v) => !v)}
          className={`rounded-full border px-3.5 py-2 text-[12px] font-bold backdrop-blur-sm transition ${
            travel
              ? 'border-amber-300/60 bg-amber-400/30 text-amber-100'
              : 'border-white/25 bg-black/55 text-white hover:bg-black/75'
          }`}
        >
          🏃 TRAVEL {travel ? 'ON' : 'OFF'}
        </button>
        <p className="hidden max-w-[240px] rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-right text-[11px] leading-snug text-zinc-300 sm:block">
          WASD / arrows to walk · drag to look · Shift = travel pace ·
          tap a mosquito to shoot it · Esc leaves
        </p>
        <p className="max-w-[200px] rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-right text-[11px] leading-snug text-zinc-300 sm:hidden">
          🦟 Tap a mosquito to shoot it — only the swollen red ones drop a blood sac.
        </p>
      </div>
    </div>
  );
}
