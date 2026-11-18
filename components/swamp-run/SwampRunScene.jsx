'use client';
// components/swamp-run/SwampRunScene.jsx
// R3F rendering for Swamp Run. Reads the pure engine state from a ref every
// frame and syncs three.js objects imperatively (no React re-renders in the
// hot loop). Murky Everglades: green-brown heightfield islands, cypress
// canopy, lily pads, fog — under a low dusk sun.

import { useEffect, useMemo, useRef, useState, Component, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { terrainHeight, WORLD_SIZE } from '@/lib/swamp-run/world';
import {
  chunkHeightField,
  chunksAround,
  chunkIsFar,
  chunkVegetation,
  CHUNK_M,
} from '@/lib/swamp-run/streaming';
import { MODEL_SLOTS, JAW_PARAMS, markSlotLoaded } from '@/lib/swamp-run/models';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function groundY(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  return h <= 0 ? h * 0.6 - 0.5 : h;
}

// ── GLB machinery ────────────────────────────────────────────────
// The Batch 8 Tripo models (Merlin, 2026-11-01) step in for the
// procedural stand-ins. Every slot degrades gracefully: a missing or
// broken GLB renders the procedural stand-in — never a blank.

// Catches GLB parse/load failures inside the canvas.
class SwampGlbErrorBoundary extends Component {
  constructor(p) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// HEAD-checks a model slot; returns the URL when present, null when
// the file is missing — the caller renders the procedural stand-in.
function useSwampGlb(slotKey) {
  const slot = MODEL_SLOTS[slotKey];
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    setOk(false);
    fetch(slot.path, { method: 'HEAD' })
      .then((r) => {
        if (live) setOk(r.ok);
      })
      .catch(() => {
        if (live) setOk(false);
      });
    return () => {
      live = false;
    };
  }, [slot.path]);
  return ok ? slot.path : null;
}

// Fit a Tripo creature to the scene: head toward +z (the scene's
// facing), longest horizontal extent scaled to targetLen, grounded
// and centered. Returns { wrap, inner } — pitch inner for lunges.
function fitCreature(model, headNames, tailNames, targetLen) {
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(model);
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  const head = headNames.map((n) => model.getObjectByName(n)).find(Boolean);
  const tail = tailNames.map((n) => model.getObjectByName(n)).find(Boolean);
  if (head && tail) {
    const hp = new THREE.Vector3();
    const tp = new THREE.Vector3();
    head.getWorldPosition(hp);
    tail.getWorldPosition(tp);
    // Rotation.y = α maps +z to (sin α, 0, cos α): to bring the
    // head→tail vector onto +z, rotate by −its current yaw.
    inner.rotation.y = -Math.atan2(hp.x - tp.x, hp.z - tp.z);
  }
  wrap.updateMatrixWorld(true);
  // Exact fit: longest horizontal extent becomes targetLen.
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const k = targetLen / Math.max(size.x, size.z, 0.001);
  inner.scale.multiplyScalar(k);
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  inner.position.x -= (box2.min.x + box2.max.x) / 2;
  inner.position.z -= (box2.min.z + box2.max.z) / 2;
  inner.position.y -= box2.min.y;
  return { wrap, inner };
}

// All emissive-capable materials under a loaded model, for the
// burst-time glow.
function emissiveMats(root) {
  const arr = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (m && m.emissive && !arr.includes(m)) arr.push(m);
    }
  });
  return arr;
}

// ── Jaw hinges (Merlin, 2026-11-01: "I want the jaws") ──────────
// The Batch 8 Tripo rigs have no jaw bones and no animation clips,
// so the bite is a vertex-shader hinge: jaw-region vertices rotate
// about the jaw joint in BIND space (the `position` attribute), ahead
// of the skinning chunk — the static skeleton then carries the opened
// jaw rigidly into the posed mesh. Tuning lives in JAW_PARAMS
// (lib/swamp-run/models.js), measured from the real bind geometry.
// A dark mouth cavity rides inside the skull so the open mouth never
// shows hollow backfaces.

// Clones a creature's materials (never mutates the GLTF cache's),
// injects the jaw hinge into each, and tucks a mouth cavity inside
// the skull. Returns { jawUniform, cavityMat } for the frame loop.
function addJawHinge(root, p) {
  const jawUniform = { value: 0 };
  const seen = new Map();
  const hinge = new THREE.Vector3(p.hinge[0], p.hinge[1], p.hinge[2]);
  let skinned = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh && !skinned) skinned = o;
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const repl = ms.map((m) => {
      if (!m) return m;
      if (!seen.has(m)) {
        const c = m.clone();
        c.onBeforeCompile = (shader) => {
          shader.uniforms.uJawOpen = jawUniform;
          shader.uniforms.uJawHinge = { value: hinge };
          shader.uniforms.uJawMouth = {
            value: new THREE.Vector4(p.mouthA, p.mouthB, p.hingeX, p.feather),
          };
          shader.uniforms.uJawZ = {
            value: new THREE.Vector3(p.zc, p.zHalf, p.maxAngle),
          };
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              `#include <common>
              uniform float uJawOpen;
              uniform vec3 uJawHinge;
              uniform vec4 uJawMouth;
              uniform vec3 uJawZ;`
            )
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
              {
                float mouthY = uJawMouth.x + uJawMouth.y * (transformed.x - uJawMouth.z);
                float w = smoothstep(uJawHinge.x - uJawMouth.w, uJawHinge.x + uJawMouth.w * 0.5, transformed.x);
                w *= 1.0 - smoothstep(mouthY - uJawMouth.w * 0.5, mouthY + uJawMouth.w * 0.5, transformed.y);
                w *= 1.0 - smoothstep(uJawZ.y - uJawMouth.w, uJawZ.y + uJawMouth.w, abs(transformed.z - uJawZ.x));
                float ang = -uJawOpen * uJawZ.z * w;
                float jc = cos(ang);
                float js = sin(ang);
                vec2 jd = vec2(transformed.x - uJawHinge.x, transformed.y - uJawHinge.y);
                transformed.x = uJawHinge.x + jd.x * jc - jd.y * js;
                transformed.y = uJawHinge.y + jd.x * js + jd.y * jc;
              }`
            );
        };
        c.customProgramCacheKey = () => 'swamp-jaw-hinge';
        seen.set(m, c);
      }
      return seen.get(m);
    });
    // eslint-disable-next-line no-param-reassign
    o.material = Array.isArray(o.material) ? repl : repl[0];
  });
  const cavityMat = new THREE.MeshStandardMaterial({
    color: 0x5a0f0f,
    emissive: 0x2a0505,
    roughness: 1,
    transparent: true,
    opacity: 0,
  });
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), cavityMat);
  cavity.scale.set(p.cavityScale[0], p.cavityScale[1], p.cavityScale[2]);
  cavity.position.set(p.cavityPos[0], p.cavityPos[1], p.cavityPos[2]);
  (skinned || root).add(cavity);
  return { jawUniform, cavityMat };
}

// Eases a jaw value toward its target: snaps open fast, eases shut.
function stepJaw(jaw, target, dt) {
  const rate = target > jaw.value ? 1 / 0.15 : 1 / 0.6;
  const d = Math.sign(target - jaw.value) * rate * Math.min(dt, 0.05);
  jaw.value = THREE.MathUtils.clamp(jaw.value + d, 0, 1);
  const e = jaw.value * jaw.value * (3 - 2 * jaw.value);
  return e;
}

// --- Streaming terrain (Merlin, Nov 18, 2026 — the swamp is endless):
// the heightfield streams in 64 m chunks around the player, built from
// the same seeded terrainHeight the old fixed 620 m plane used, so the
// home region reads exactly as before and the ground never ends. At
// most 2 chunks build per frame, centre first, so the ground under the
// canoe appears before the far edge. The seed changes every run, so a
// seed change drops every built chunk.
function StreamingTerrain({ stateRef }) {
  const groupRef = useRef(null);
  const chunksRef = useRef(new Map());
  const queueRef = useRef([]);
  const seedRef = useRef(null);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    []
  );
  useEffect(() => () => {
    for (const entry of chunksRef.current.values()) entry.geometry.dispose();
    chunksRef.current.clear();
    material.dispose();
  }, [material]);
  useFrame(() => {
    const s = stateRef.current;
    const group = groupRef.current;
    if (!s || !group) return;
    if (seedRef.current !== s.seed) {
      seedRef.current = s.seed;
      for (const entry of chunksRef.current.values()) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
      }
      chunksRef.current.clear();
      queueRef.current = [];
    }
    const wanted = chunksAround(s.player.x, s.player.z);
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const chunks = chunksRef.current;
    for (const [key, entry] of chunks) {
      if (!wantedKeys.has(key)) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        chunks.delete(key);
      }
    }
    const queue = queueRef.current.filter((k) => wantedKeys.has(k));
    for (const w of wanted) {
      if (!chunks.has(w.key) && !queue.includes(w.key)) queue.push(w.key);
    }
    queueRef.current = queue;
    let built = 0;
    while (queue.length && built < 2) {
      const key = queue.shift();
      if (chunks.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      const field = chunkHeightField(s.seed, cx, cz);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(field.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(field.indices, 1));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx * CHUNK_M, 0, cz * CHUNK_M);
      group.add(mesh);
      chunks.set(key, { mesh, geometry });
      built++;
    }
  });
  return <group ref={groupRef} />;
}

function Water({ stateRef }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.material.opacity = 0.82 + Math.sin(t * 0.6) * 0.05;
    // The water sheet rides under the player (Merlin, Nov 18, 2026 —
    // endless swamp): the 992 m sheet is far wider than the fog, so
    // the player never paddles off it.
    const p = stateRef.current?.player;
    ref.current.position.set(p ? p.x : 0, Math.sin(t * 0.5) * 0.03, p ? p.z : 0);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[WORLD_SIZE * 1.6, WORLD_SIZE * 1.6]} />
      <meshStandardMaterial color="#3d4d2a" transparent opacity={0.85} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

function useCypressGeometry() {
  // One cypress tree, merged: flared buttress trunk + three layered
  // canopy puffs. Built once, instanced per tree. Slightly more
  // realistic than the old blob — Merlin's words, don't overdo it.
  return useMemo(() => {
    const parts = [];
    // Buttress trunk: flared at the base like a real cypress.
    const trunk = new THREE.CylinderGeometry(0.42, 0.95, 3.6, 7);
    trunk.translate(0, 1.8, 0);
    parts.push(trunk);
    // Three canopy puffs: wide low, medium mid, small top — Spanish-moss green.
    const puff1 = new THREE.SphereGeometry(2.6, 8, 6);
    puff1.scale(1.25, 0.62, 1.25);
    puff1.translate(0, 4.4, 0);
    parts.push(puff1);
    const puff2 = new THREE.SphereGeometry(1.9, 8, 6);
    puff2.scale(1.1, 0.6, 1.1);
    puff2.translate(0.7, 5.9, -0.4);
    parts.push(puff2);
    const puff3 = new THREE.SphereGeometry(1.25, 7, 6);
    puff3.scale(1, 0.65, 1);
    puff3.translate(-0.5, 7.1, 0.5);
    parts.push(puff3);
    // Merge into one geometry. (BufferGeometryUtils not imported to keep
    // the bundle lean — manual merge of position/normal/uv.)
    let vCount = 0;
    let iCount = 0;
    for (const p of parts) {
      vCount += p.attributes.position.count;
      iCount += p.index.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx = new Uint16Array(iCount);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array, vo * 3);
      nor.set(p.attributes.normal.array, vo * 3);
      uv.set(p.attributes.uv.array, vo * 2);
      const pi = p.index.array;
      for (let i = 0; i < pi.length; i++) idx[io + i] = pi[i] + vo;
      vo += n;
      io += pi.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }, []);
}

function TreesProcedural({ stateRef }) {
  const treeRef = useRef(null);
  const mossRef = useRef(null);
  const builtFor = useRef('');
  const geo = useCypressGeometry();
  const count = stateRef.current?.world.trees.length || 0;
  // Moss strands: only trees with moss > 0.55 get them (3 strands each).
  const mossCount = useMemo(() => {
    const trees = stateRef.current?.world.trees || [];
    return trees.filter((t) => (t.moss || 0) > 0.55).length * 3;
  }, [count]);
  useFrame(() => {
    const s = stateRef.current;
    const mesh = treeRef.current;
    const moss = mossRef.current;
    if (!s || !mesh) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    let mi = 0;
    s.world.trees.forEach((t, i) => {
      const baseY = t.water ? -0.5 : groundY(s.seed, t.x, t.z) - 0.25;
      dummy.position.set(t.x, baseY, t.z);
      const sc = t.water ? 0.62 : 0.85 + (t.h - 7) * 0.09;
      dummy.scale.set(t.r * 1.15, sc, t.r * 1.15);
      dummy.rotation.set(0, (t.x * 7 + t.z * 3) % Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(0.26 + ((i * 37) % 10) / 110, 0.38, 0.2 + ((i * 53) % 10) / 140);
      mesh.setColorAt(i, tmpColor);
      // Spanish moss: grey-green strands hanging from the low canopy.
      if (moss && (t.moss || 0) > 0.55) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + i;
          dummy.position.set(
            t.x + Math.cos(a) * 1.7 * sc,
            baseY + 4.1 * sc,
            t.z + Math.sin(a) * 1.7 * sc
          );
          dummy.scale.set(1, 0.8 + ((i + k) % 3) * 0.35, 1);
          dummy.rotation.set(0.08 * Math.sin(i + k), 0, 0.08 * Math.cos(i * 2 + k));
          dummy.updateMatrix();
          moss.setMatrixAt(mi++, dummy.matrix);
        }
      }
    });
    mesh.count = s.world.trees.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (moss) {
      moss.count = mi;
      moss.instanceMatrix.needsUpdate = true;
    }
  });
  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={treeRef} args={[geo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" roughness={1} flatShading={false} />
      </instancedMesh>
      {mossCount > 0 && (
        <instancedMesh ref={mossRef} args={[undefined, undefined, mossCount]} frustumCulled={false}>
          <cylinderGeometry args={[0.05, 0.015, 1.6, 4]} />
          <meshStandardMaterial color="#8a9578" roughness={1} transparent opacity={0.85} />
        </instancedMesh>
      )}
    </group>
  );
}

// The Batch 8 detailed cypress, decimated for instancing (Merlin,
// 2026-11-01): the full 1.9M-triangle Tripo model would cost ~800M
// triangles across 420 stands — the -low derivative keeps the look at
// ~14.5K tris each, one draw call. Same placement, same moss.
function TreesGlb({ stateRef, url }) {
  const { scene } = useGLTF(url);
  const treeRef = useRef(null);
  const mossRef = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.trees.length || 0;
  const { geo, mat, height, width } = useMemo(() => {
    let g = null;
    let m = null;
    scene.traverse((o) => {
      if (o.isMesh && !g) {
        g = o.geometry;
        m = o.material;
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    markSlotLoaded('cypress');
    return { geo: g, mat: m, height: size.y || 8, width: Math.max(size.x, size.z, 0.001) };
  }, [scene]);
  const mossCount = useMemo(() => {
    const trees = stateRef.current?.world.trees || [];
    return trees.filter((t) => (t.moss || 0) > 0.55).length * 3;
  }, [count]);
  useFrame(() => {
    const s = stateRef.current;
    const mesh = treeRef.current;
    const moss = mossRef.current;
    if (!s || !mesh || !geo) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    let mi = 0;
    s.world.trees.forEach((t, i) => {
      const baseY = t.water ? -0.5 : groundY(s.seed, t.x, t.z) - 0.25;
      // Height matches the old stands (t.h metres); footprint follows t.r.
      const ky = t.h / height;
      const kx = ((t.r * 2.3) / width) * ky;
      dummy.position.set(t.x, baseY, t.z);
      dummy.scale.set(kx, ky, kx);
      dummy.rotation.set(0, (t.x * 7 + t.z * 3) % Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(0.26 + ((i * 37) % 10) / 110, 0.38, 0.2 + ((i * 53) % 10) / 140);
      mesh.setColorAt(i, tmpColor);
      if (moss && (t.moss || 0) > 0.55) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + i;
          dummy.position.set(
            t.x + Math.cos(a) * 1.7 * ky,
            baseY + 4.1 * ky,
            t.z + Math.sin(a) * 1.7 * ky
          );
          dummy.scale.set(1, 0.8 + ((i + k) % 3) * 0.35, 1);
          dummy.rotation.set(0.08 * Math.sin(i + k), 0, 0.08 * Math.cos(i * 2 + k));
          dummy.updateMatrix();
          moss.setMatrixAt(mi++, dummy.matrix);
        }
      }
    });
    mesh.count = s.world.trees.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (moss) {
      moss.count = mi;
      moss.instanceMatrix.needsUpdate = true;
    }
  });
  if (!count || !geo) return null;
  return (
    <group>
      <instancedMesh ref={treeRef} args={[geo, mat, count]} frustumCulled={false}>
      </instancedMesh>
      {mossCount > 0 && (
        <instancedMesh ref={mossRef} args={[undefined, undefined, mossCount]} frustumCulled={false}>
          <cylinderGeometry args={[0.05, 0.015, 1.6, 4]} />
          <meshStandardMaterial color="#8a9578" roughness={1} transparent opacity={0.85} />
        </instancedMesh>
      )}
    </group>
  );
}

function Trees({ stateRef }) {
  const url = useSwampGlb('cypress');
  const fallback = <TreesProcedural stateRef={stateRef} />;
  if (!url) return fallback;
  return (
    <SwampGlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TreesGlb stateRef={stateRef} url={url} />
      </Suspense>
    </SwampGlbErrorBoundary>
  );
}

// Cypress for the streamed far chunks (endless swamp): the home square
// keeps its own Trees above; these instanced stands cover only chunks
// entirely past the home edge, grown from the same per-chunk law, so
// the tree line never ends. Rebuilt only when the wanted chunk set (or
// the run's seed) changes. Visual cover only — the engine's line of
// sight + trunk collision still read the home tree list.
function StreamedVegetation({ stateRef }) {
  const treeRef = useRef(null);
  const mossRef = useRef(null);
  const geo = useCypressGeometry();
  const builtFor = useRef('');
  const CAP = 512;
  useFrame(() => {
    const s = stateRef.current;
    const mesh = treeRef.current;
    if (!s || !mesh) return;
    const wanted = chunksAround(s.player.x, s.player.z).filter((w) => chunkIsFar(w.cx, w.cz));
    const sig = `seed:${s.seed}|${wanted.map((w) => w.key).join(';')}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    let i = 0;
    let mi = 0;
    const moss = mossRef.current;
    for (const w of wanted) {
      const { trees } = chunkVegetation(s.seed, w.cx, w.cz);
      for (const t of trees) {
        if (i >= CAP) break;
        const baseY = t.water ? -0.5 : groundY(s.seed, t.x, t.z) - 0.25;
        dummy.position.set(t.x, baseY, t.z);
        const sc = t.water ? 0.62 : 0.85 + (t.h - 7) * 0.09;
        dummy.scale.set(t.r * 1.15, sc, t.r * 1.15);
        dummy.rotation.set(0, (t.x * 7 + t.z * 3) % Math.PI, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHSL(0.26 + ((i * 37) % 10) / 110, 0.38, 0.2 + ((i * 53) % 10) / 140);
        mesh.setColorAt(i, tmpColor);
        if (moss && (t.moss || 0) > 0.55) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + i;
            dummy.position.set(
              t.x + Math.cos(a) * 1.7 * sc,
              baseY + 4.1 * sc,
              t.z + Math.sin(a) * 1.7 * sc
            );
            dummy.scale.set(1, 0.8 + ((i + k) % 3) * 0.35, 1);
            dummy.rotation.set(0.08 * Math.sin(i + k), 0, 0.08 * Math.cos(i * 2 + k));
            dummy.updateMatrix();
            moss.setMatrixAt(mi++, dummy.matrix);
          }
        }
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (moss) {
      moss.count = mi;
      moss.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh ref={treeRef} args={[geo, undefined, CAP]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={mossRef} args={[undefined, undefined, CAP * 3]} frustumCulled={false}>
        <cylinderGeometry args={[0.05, 0.015, 1.6, 4]} />
        <meshStandardMaterial color="#8a9578" roughness={1} transparent opacity={0.85} />
      </instancedMesh>
    </group>
  );
}

function Reeds({ stateRef }) {
  const reedRef = useRef(null);
  const tipRef = useRef(null);
  const builtFor = useRef('');
  const reeds = stateRef.current?.world.reeds || [];
  const count = reeds.length;
  const cattails = useMemo(() => reeds.filter((r) => r.kind === 'cattail').length, [count]);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = reedRef.current;
    if (!s || !mesh) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current !== sig) {
      builtFor.current = sig;
      let ci = 0;
      s.world.reeds.forEach((r, i) => {
        dummy.position.set(r.x, r.h / 2 - 0.1, r.z);
        dummy.scale.set(1, r.h / 2.2, 1);
        dummy.rotation.set(r.lean, r.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHSL(0.24 + (i % 5) / 90, 0.4, 0.3 + (i % 7) / 90);
        mesh.setColorAt(i, tmpColor);
      });
      mesh.count = s.world.reeds.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Cattail heads sit atop the cattail reeds.
      const tips = tipRef.current;
      if (tips) {
        s.world.reeds.forEach((r) => {
          if (r.kind !== 'cattail') return;
          dummy.position.set(
            r.x + Math.sin(r.lean) * r.h * 0.5,
            r.h - 0.25,
            r.z
          );
          dummy.scale.setScalar(1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          tips.setMatrixAt(ci++, dummy.matrix);
        });
        tips.count = ci;
        tips.instanceMatrix.needsUpdate = true;
      }
    }
    // Gentle sway.
    mesh.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.01;
  });
  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={reedRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <cylinderGeometry args={[0.035, 0.06, 2.2, 5]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </instancedMesh>
      {cattails > 0 && (
        <instancedMesh ref={tipRef} args={[undefined, undefined, cattails]} frustumCulled={false}>
          <capsuleGeometry args={[0.09, 0.32, 3, 8]} />
          <meshStandardMaterial color="#5a3d22" roughness={1} />
        </instancedMesh>
      )}
    </group>
  );
}

function Knees({ stateRef }) {
  const ref = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.knees.length || 0;
  useFrame(() => {
    const s = stateRef.current;
    const mesh = ref.current;
    if (!s || !mesh) return;
    if (builtFor.current === `seed:${s.seed}`) return;
    builtFor.current = `seed:${s.seed}`;
    s.world.knees.forEach((k, i) => {
      dummy.position.set(k.x, k.h / 2 - 0.15, k.z);
      dummy.scale.set(k.r / 0.2, k.h / 0.7, k.r / 0.2);
      dummy.rotation.set(0, (k.x * 3 + k.z * 5) % Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = s.world.knees.length;
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <coneGeometry args={[0.2, 0.7, 6]} />
      <meshStandardMaterial color="#5c4a30" roughness={1} />
    </instancedMesh>
  );
}

function Lilies({ stateRef }) {
  const ref = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.lilies.length || 0;
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = ref.current;
    if (!s || !mesh) return;
    if (builtFor.current !== `seed:${s.seed}`) {
      builtFor.current = `seed:${s.seed}`;
      s.world.lilies.forEach((l, i) => {
        dummy.position.set(l.x, 0.04, l.z);
        dummy.scale.setScalar(l.r);
        dummy.rotation.set(0, l.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = s.world.lilies.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.02;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <circleGeometry args={[1, 10]} />
      <meshStandardMaterial color="#51763a" roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function useDetailedCanoeGeometry() {
  // A proper dugout canoe: carved hull (lathe-formed), gunwale rails,
  // two thwart seats. Procedural stand-in until the Tripo detailed
  // canoe lands in /models/swamp/canoe-detailed.glb (see lib/swamp-run/models.js).
  return useMemo(() => {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4f2a', roughness: 0.85 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#54391c', roughness: 1 });
    const railWood = new THREE.MeshStandardMaterial({ color: '#7d5a30', roughness: 0.8 });

    // Hull: a stretched, hollowed half-capsule. Build from a lathe then
    // scale — gives the curved dugout profile the old box hull lacked.
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10; // 0 stern -> 1 bow
      const y = Math.sin(t * Math.PI) * 0.32; // rocker curve
      pts.push(new THREE.Vector2(0.42 * Math.sin(t * Math.PI * 0.92 + 0.08), y));
    }
    const hullGeo = new THREE.LatheGeometry(pts, 10, 0, Math.PI);
    hullGeo.scale(1, 1, 4.4);
    hullGeo.rotateY(Math.PI / 2);
    // Lathe makes a half-pipe; flip so the opening faces up.
    hullGeo.rotateZ(Math.PI);
    const hull = new THREE.Mesh(hullGeo, wood);
    hull.position.y = 0.1;
    group.add(hull);

    // Gunwale rails along both sheer lines.
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.09, 0.07, 3.5);
      // Bend the rail: approximate the sheer with 3 segments.
      for (let sgi = 0; sgi < 3; sgi++) {
        const rail = new THREE.Mesh(railGeo, railWood);
        const zt = (sgi - 1) * 1.15;
        rail.position.set(side * 0.4 * Math.cos(zt * 0.5), 0.32 + Math.abs(zt) * 0.06, zt);
        rail.rotation.x = -Math.sign(zt) * 0.1;
        rail.scale.z = 0.36;
        group.add(rail);
      }
    }

    // Two thwart seats.
    for (const zt of [-0.7, 0.7]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.28), darkWood);
      seat.position.set(0, 0.22, zt);
      group.add(seat);
    }

    // Bow and stern caps.
    for (const zt of [1.78, -1.78]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), railWood);
      cap.position.set(0, 0.3, zt);
      cap.rotation.x = zt > 0 ? 0.45 : -0.45;
      group.add(cap);
    }
    return group;
  }, []);
}

// The Batch 8 detailed canoe, decimated (Merlin, 2026-11-01): the
// full 1.9M-triangle model becomes ~48K in the -low derivative — one
// hero object, well within budget. Scaled to the old hull's 3.6 m,
// longest axis along z.
function CanoeGlb({ url }) {
  const { scene } = useGLTF(url);
  const fitted = useMemo(() => {
    const m = scene.clone();
    const wrap = new THREE.Group();
    wrap.add(m);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    // Longest horizontal axis becomes the 3.6 m hull, along z.
    if (size.x > size.z) wrap.rotation.y = Math.PI / 2;
    const k = 3.6 / Math.max(size.x, size.z, 0.001);
    m.scale.multiplyScalar(k);
    wrap.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(wrap);
    const c = box2.getCenter(new THREE.Vector3());
    m.position.x -= c.x;
    m.position.z -= c.z;
    m.position.y -= box2.min.y;
    markSlotLoaded('canoe');
    return wrap;
  }, [scene]);
  return <primitive object={fitted} />;
}

function PlayerAndCanoe({ stateRef, onCanoeClick }) {
  const canoeRef = useRef(null);
  const figureRef = useRef(null);
  const paddleRef = useRef(null);
  const canoeGroup = useDetailedCanoeGeometry();
  const canoeUrl = useSwampGlb('canoe');
  const canoeFallback = <primitive object={canoeGroup} />;
  useFrame(({ clock }) => {
    const s = stateRef.current;
    if (!s || !canoeRef.current || !figureRef.current) return;
    const t = clock.elapsedTime;
    const p = s.player;
    const bob = Math.sin(t * 2.1) * 0.05;

    // Canoe: with the player, parked at the shore, or gone (capsized).
    const canoe = canoeRef.current;
    canoe.visible = s.canoe.alive;
    if (s.canoe.alive) {
      canoe.position.set(s.canoe.x, 0.1 + bob, s.canoe.z);
      canoe.rotation.set(Math.sin(t * 1.7) * 0.02, s.canoe.heading, Math.sin(t * 1.3) * 0.03);
    }

    // Figure: rides in the canoe, swims low, or runs upright.
    const fig = figureRef.current;
    if (p.mode === 'canoe') {
      fig.position.set(p.x, 0.32 + bob, p.z);
      fig.rotation.set(0, p.heading, 0);
    } else if (p.mode === 'swim') {
      fig.position.set(p.x, -0.28 + Math.sin(t * 5) * 0.05, p.z);
      fig.rotation.set(1.15, p.heading, 0); // prone, paddling
    } else {
      const runBob = Math.abs(Math.sin(t * 9)) * 0.12 * Math.min(1, Math.abs(p.speed));
      fig.position.set(p.x, groundY(s.seed, p.x, p.z) + 0.85 + runBob, p.z);
      fig.rotation.set(0, p.heading, 0);
    }

    // Paddle strokes while canoeing.
    if (paddleRef.current) {
      const stroking = p.mode === 'canoe' && Math.abs(p.speed) > 0.3;
      paddleRef.current.visible = p.mode === 'canoe';
      paddleRef.current.rotation.x = stroking
        ? Math.sin(t * (s.input.sprint ? 11 : 6.5)) * 0.7
        : 0.25;
    }
  });
  return (
    <group>
      <group
        ref={canoeRef}
        onClick={(e) => {
          e.stopPropagation();
          onCanoeClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        {/* The Batch 8 hull when it loads; the procedural dugout until then. */}
        {canoeUrl ? (
          <SwampGlbErrorBoundary fallback={canoeFallback}>
            <Suspense fallback={canoeFallback}>
              <CanoeGlb url={canoeUrl} />
            </Suspense>
          </SwampGlbErrorBoundary>
        ) : (
          canoeFallback
        )}
        {/* Invisible fat hitbox so taps land easily on phones. */}
        <mesh visible={false}>
          <boxGeometry args={[2.2, 1.6, 4.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <group ref={figureRef}>
        {/* body */}
        <mesh position={[0, 0.35, 0]}>
          <capsuleGeometry args={[0.26, 0.55, 4, 10]} />
          <meshStandardMaterial color="#b8502e" roughness={0.8} />
        </mesh>
        {/* head + hat */}
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.21, 12, 10]} />
          <meshStandardMaterial color="#c98a5e" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.34, 0.36, 0.07, 12]} />
          <meshStandardMaterial color="#77663a" roughness={0.9} />
        </mesh>
        {/* paddle */}
        <group ref={paddleRef} position={[0.42, 0.55, 0.2]}>
          <mesh>
            <boxGeometry args={[0.07, 1.5, 0.16]} />
            <meshStandardMaterial color="#8a652f" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function CrocProcedural({ stateRef }) {
  const groupRef = useRef(null);
  const jawRef = useRef(null);
  const ripple1 = useRef(null);
  const ripple2 = useRef(null);
  const eyeMat = useRef(null);
  const deathAt = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    const c = s.croc;
    const inWater = terrainHeight(s.seed, c.x, c.z) <= 0;
    const hunting = c.mode === 'chase' || c.mode === 'hunt';

    let y = inWater ? -0.32 : groundY(s.seed, c.x, c.z) + 0.12;
    let x = c.x;
    let z = c.z;
    let jaw = hunting ? 0.35 + Math.sin(t * 3.2) * 0.12 : 0.06;

    if (s.status === 'dead' && s.death) {
      // Death cam: the lunge. It flies the last metres, jaws wide.
      if (deathAt.current === null) deathAt.current = t;
      const k = Math.min(1, (t - deathAt.current) / 0.45);
      x = THREE.MathUtils.lerp(s.death.crocX, s.death.x, k);
      z = THREE.MathUtils.lerp(s.death.crocZ, s.death.z, k);
      y = 0.35 + Math.sin(k * Math.PI) * 0.5;
      jaw = 0.25 + k * 0.75;
    }

    g.position.set(x, y, z);
    g.rotation.set(0, s.status === 'dead' && s.death ? s.death.crocHeading : c.heading, 0);
    if (jawRef.current) jawRef.current.rotation.x = jaw;
    if (eyeMat.current) {
      const angry = hunting || c.mode === 'circle';
      eyeMat.current.emissive.set(angry ? '#ff2a1a' : '#ffb300');
      eyeMat.current.emissiveIntensity = angry ? 1.6 : 0.8;
    }

    // Ripples trail the submerged body.
    const ripples = [ripple1.current, ripple2.current];
    ripples.forEach((r, i) => {
      if (!r) return;
      r.visible = inWater && s.status !== 'dead';
      const ph = (t * 0.55 + i * 0.5) % 1;
      r.position.set(c.x, 0.06, c.z);
      r.scale.setScalar(1 + ph * 5.5);
      r.material.opacity = (1 - ph) * 0.4;
    });
  });
  return (
    <group>
      <group ref={groupRef}>
        {/* snout + skull */}
        <mesh position={[0, 0.18, 1.35]}>
          <boxGeometry args={[0.62, 0.3, 1.5]} />
          <meshStandardMaterial color="#4c5a33" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.22, 0.45]}>
          <boxGeometry args={[0.85, 0.42, 0.9]} />
          <meshStandardMaterial color="#55653a" roughness={0.95} />
        </mesh>
        {/* lower jaw */}
        <group ref={jawRef} position={[0, 0.1, 0.6]}>
          <mesh position={[0, -0.06, 0.75]}>
            <boxGeometry args={[0.55, 0.12, 1.5]} />
            <meshStandardMaterial color="#66744a" roughness={0.95} />
          </mesh>
        </group>
        {/* eyes */}
        <mesh position={[-0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial ref={eyeMat} color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        {/* back + ridges */}
        <mesh position={[0, 0.16, -0.7]}>
          <boxGeometry args={[0.95, 0.36, 1.6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
        {[0.1, -0.6, -1.3].map((zz, i) => (
          <mesh key={i} position={[0, 0.4, zz]}>
            <coneGeometry args={[0.16, 0.3, 5]} />
            <meshStandardMaterial color="#3d4a29" roughness={1} />
          </mesh>
        ))}
        {/* tail */}
        <mesh position={[0, 0.12, -2.2]} rotation={[Math.PI / 2.25, 0, 0]}>
          <coneGeometry args={[0.4, 2.2, 6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
      </group>
      <mesh ref={ripple1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ripple2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// The Batch 8 rigged crocodile (Merlin, 2026-11-01): 36 joints, no
// embedded animation clips and no jaw bone — the bite is a
// vertex-shader jaw hinge (addJawHinge) driven by the hunt state,
// plus the emissive blood-pulse. Falls back to the box-built hunter
// on any load failure.
function CrocGlb({ stateRef, url }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef(null);
  const { wrap, inner, jaw } = useMemo(() => {
    const m = cloneSkinned(scene);
    const fitted = fitCreature(
      m,
      ['tripo::Head_2', 'tripo::Head_1'],
      ['tripo::Tail_4', 'tripo::Tail_3'],
      5
    );
    const jaw = addJawHinge(m, JAW_PARAMS.crocodile);
    markSlotLoaded('crocodile');
    return { ...fitted, jaw };
  }, [scene]);
  const mats = useMemo(() => emissiveMats(wrap), [wrap]);
  const jawState = useRef({ value: 0 });
  const ripple1 = useRef(null);
  const ripple2 = useRef(null);
  const deathAt = useRef(null);
  useFrame(({ clock }, dt) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    const c = s.croc;
    const inWater = terrainHeight(s.seed, c.x, c.z) <= 0;
    const hunting = c.mode === 'chase' || c.mode === 'hunt';

    let y = inWater ? -0.32 : groundY(s.seed, c.x, c.z) + 0.12;
    let x = c.x;
    let z = c.z;
    let heading = c.heading;

    if (s.status === 'dead' && s.death) {
      if (deathAt.current === null) deathAt.current = t;
      const k = Math.min(1, (t - deathAt.current) / 0.45);
      x = THREE.MathUtils.lerp(s.death.crocX, s.death.x, k);
      z = THREE.MathUtils.lerp(s.death.crocZ, s.death.z, k);
      y = 0.35 + Math.sin(k * Math.PI) * 0.5;
      heading = s.death.crocHeading;
    }

    g.position.set(x, y, z);
    g.rotation.set(0, heading, 0);
    // Jaws (Merlin, 2026-11-01): the bite is the jaw hinge, not the
    // old snout-dip. Death lunge keeps a small rear-up for body
    // language; the pulse still sells the aggression with the jaw.
    const biting = hunting || (s.status === 'dead' && s.death);
    const je = stepJaw(jawState.current, biting ? 1 : 0, dt);
    jaw.jawUniform.value = je;
    jaw.cavityMat.opacity = je * 0.95;
    inner.rotation.x =
      s.status === 'dead' && s.death
        ? Math.min(1, (t - (deathAt.current || t)) / 0.45) * 0.3
        : 0.02 + Math.sin(t * 0.8) * 0.01;
    const angry = hunting || c.mode === 'circle';
    for (const m of mats) {
      m.emissive.set(angry ? '#ff2a1a' : '#1a0e00');
      m.emissiveIntensity = angry ? 0.55 : 0.12;
    }

    const ripples = [ripple1.current, ripple2.current];
    ripples.forEach((r, i) => {
      if (!r) return;
      r.visible = inWater && s.status !== 'dead';
      const ph = (t * 0.55 + i * 0.5) % 1;
      r.position.set(c.x, 0.06, c.z);
      r.scale.setScalar(1 + ph * 5.5);
      r.material.opacity = (1 - ph) * 0.4;
    });
  });
  return (
    <group>
      <primitive ref={groupRef} object={wrap} />
      <mesh ref={ripple1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ripple2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Croc({ stateRef }) {
  const url = useSwampGlb('crocodile');
  const fallback = <CrocProcedural stateRef={stateRef} />;
  if (!url) return fallback;
  return (
    <SwampGlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CrocGlb stateRef={stateRef} url={url} />
      </Suspense>
    </SwampGlbErrorBoundary>
  );
}

function Fireflies({ stateRef }) {
  const ref = useRef(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        x: Math.sin(i * 39.7) * 240,
        z: Math.cos(i * 27.3) * 240,
        ph: i * 1.37,
      })),
    []
  );
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    // The swarm rides with the player (endless swamp) — the seeds are
    // offsets around the player, not fixed points near the origin.
    const px = stateRef.current?.player.x || 0;
    const pz = stateRef.current?.player.z || 0;
    seeds.forEach((f, i) => {
      dummy.position.set(
        px + f.x + Math.sin(t * 0.4 + f.ph) * 6,
        1.2 + Math.sin(t * 0.9 + f.ph * 2) * 0.5,
        pz + f.z + Math.cos(t * 0.3 + f.ph) * 6
      );
      dummy.scale.setScalar(0.5 + Math.sin(t * 2 + f.ph * 3) * 0.3);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 60]} frustumCulled={false}>
      <sphereGeometry args={[0.09, 6, 6]} />
      <meshBasicMaterial color="#ffe98a" transparent opacity={0.85} />
    </instancedMesh>
  );
}

function GatorProcedural({ stateRef }) {
  // Procedural alligator stand-in — dark olive, broad U snout, low and
  // lurking. Steps aside for /models/swamp/alligator-rigged.glb when
  // Merlin drops the Tripo model in (see lib/swamp-run/models.js).
  const groupRef = useRef(null);
  const jawRef = useRef(null);
  const eyeMat = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g || !s.gator) return;
    const t = clock.elapsedTime;
    const gt = s.gator;
    const bursting = gt.mode === 'burst';
    const y = -0.38 + (bursting ? Math.sin(t * 14) * 0.06 : Math.sin(t * 1.2) * 0.02);
    g.position.set(gt.x, y, gt.z);
    g.rotation.set(0, gt.heading, 0);
    if (jawRef.current) {
      jawRef.current.rotation.x = bursting
        ? 0.5 + Math.sin(t * 6) * 0.18
        : 0.04 + Math.sin(t * 0.8) * 0.02;
    }
    if (eyeMat.current) {
      eyeMat.current.emissive.set(bursting ? '#ff2a1a' : '#c9a227');
      eyeMat.current.emissiveIntensity = bursting ? 1.8 : 0.5;
    }
    // Lurking gators sit low — only eyes and snout break the surface.
    g.scale.y = gt.mode === 'lurk' ? 0.82 : 1;
  });
  return (
    <group ref={groupRef}>
      {/* broad U-shaped snout — the alligator's tell vs the croc's V */}
      <mesh position={[0, 0.14, 1.25]}>
        <boxGeometry args={[0.78, 0.26, 1.3]} />
        <meshStandardMaterial color="#3f4a26" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.18, 0.4]}>
        <boxGeometry args={[0.9, 0.38, 0.85]} />
        <meshStandardMaterial color="#46522c" roughness={0.95} />
      </mesh>
      <group ref={jawRef} position={[0, 0.08, 0.55]}>
        <mesh position={[0, -0.05, 0.7]}>
          <boxGeometry args={[0.68, 0.1, 1.3]} />
          <meshStandardMaterial color="#55632f" roughness={0.95} />
        </mesh>
      </group>
      {/* eyes — high on the skull, the lurker's periscope */}
      <mesh position={[-0.3, 0.42, 0.62]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial ref={eyeMat} color="#1a1408" emissive="#c9a227" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.3, 0.42, 0.62]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color="#1a1408" emissive="#c9a227" emissiveIntensity={0.5} />
      </mesh>
      {/* low armored back */}
      <mesh position={[0, 0.12, -0.75]}>
        <boxGeometry args={[1.0, 0.3, 1.7]} />
        <meshStandardMaterial color="#3f4a26" roughness={1} />
      </mesh>
      {[0.05, -0.65, -1.35].map((zz, i) => (
        <mesh key={i} position={[0, 0.32, zz]}>
          <coneGeometry args={[0.14, 0.24, 5]} />
          <meshStandardMaterial color="#333d1f" roughness={1} />
        </mesh>
      ))}
      {/* thick tail */}
      <mesh position={[0, 0.08, -2.3]} rotation={[Math.PI / 2.3, 0, 0]}>
        <coneGeometry args={[0.42, 2.4, 6]} />
        <meshStandardMaterial color="#3f4a26" roughness={1} />
      </mesh>
    </group>
  );
}

// The Batch 8 rigged alligator (Merlin, 2026-11-01): 29 joints, no
// embedded animation clips and no jaw bone — the burst bite is a
// vertex-shader jaw hinge (addJawHinge) plus the red pulse. The
// ambush behavior (lurk low, explode at 13 m) is untouched.
function GatorGlb({ stateRef, url }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef(null);
  const { wrap, inner, jaw } = useMemo(() => {
    const m = cloneSkinned(scene);
    const fitted = fitCreature(
      m,
      ['tripo::Head_3', 'tripo::Head_2', 'tripo::Head_1'],
      ['tripo::Tail_3', 'tripo::Tail_2'],
      4.5
    );
    const jaw = addJawHinge(m, JAW_PARAMS.alligator);
    markSlotLoaded('alligator');
    return { ...fitted, jaw };
  }, [scene]);
  const mats = useMemo(() => emissiveMats(wrap), [wrap]);
  const jawState = useRef({ value: 0 });
  useFrame(({ clock }, dt) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g || !s.gator) return;
    const t = clock.elapsedTime;
    const gt = s.gator;
    const bursting = gt.mode === 'burst';
    const y = -0.38 + (bursting ? Math.sin(t * 14) * 0.06 : Math.sin(t * 1.2) * 0.02);
    g.position.set(gt.x, y, gt.z);
    g.rotation.set(0, gt.heading, 0);
    // Lurking gators sit low — only eyes and snout break the surface.
    g.scale.y = gt.mode === 'lurk' ? 0.82 : 1;
    // Jaws (Merlin, 2026-11-01): snap open on the burst, ease shut
    // after — the bite is the hinge now, the snout-dip is gone.
    const je = stepJaw(jawState.current, bursting ? 1 : 0, dt);
    jaw.jawUniform.value = je;
    jaw.cavityMat.opacity = je * 0.95;
    inner.rotation.x = 0.02 + Math.sin(t * 0.8) * 0.01;
    for (const m of mats) {
      m.emissive.set(bursting ? '#ff2a1a' : '#201a00');
      m.emissiveIntensity = bursting ? 0.6 : 0.1;
    }
  });
  return <primitive ref={groupRef} object={wrap} />;
}

function Gator({ stateRef }) {
  const url = useSwampGlb('alligator');
  const fallback = <GatorProcedural stateRef={stateRef} />;
  if (!url) return fallback;
  return (
    <SwampGlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GatorGlb stateRef={stateRef} url={url} />
      </Suspense>
    </SwampGlbErrorBoundary>
  );
}

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const s = stateRef.current;
    if (!s) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = s.player;

    if (s.status === 'dead' && s.death) {
      // Death cam: swing low in front of the kill.
      const hx = Math.sin(s.death.crocHeading);
      const hz = Math.cos(s.death.crocHeading);
      target.set(s.death.x + hx * 5.5, 2.2, s.death.z + hz * 5.5);
      look.set(s.death.x, 0.4, s.death.z);
    } else {
      const back = p.mode === 'canoe' ? 10.5 : 7.5;
      const up = p.mode === 'canoe' ? 6.4 : 5;
      target.set(
        p.x - Math.sin(p.heading) * back,
        up + Math.max(0, groundY(s.seed, p.x, p.z)) * 0.4,
        p.z - Math.cos(p.heading) * back
      );
      look.set(p.x + Math.sin(p.heading) * 5, 0.6, p.z + Math.cos(p.heading) * 5);
    }
    const k = 1 - Math.pow(0.0015, dt); // smooth follow
    camera.position.lerp(target, k);
    camera.lookAt(look);
  });
  return null;
}

export default function SwampRunScene({ stateRef, onCanoeClick }) {
  return (
    <>
      <color attach="background" args={['#27351d']} />
      <fog attach="fog" args={['#2c3d21', 26, 135]} />
      <hemisphereLight args={['#e8e4b0', '#1c2a14', 0.75]} />
      <directionalLight position={[70, 90, -40]} intensity={1.5} color="#ffb469" />
      <directionalLight position={[-50, 40, 60]} intensity={0.3} color="#9db98a" />
      <StreamingTerrain stateRef={stateRef} />
      <Water stateRef={stateRef} />
      <Trees stateRef={stateRef} />
      <StreamedVegetation stateRef={stateRef} />
      <Reeds stateRef={stateRef} />
      <Knees stateRef={stateRef} />
      <Lilies stateRef={stateRef} />
      <PlayerAndCanoe stateRef={stateRef} onCanoeClick={onCanoeClick} />
      <Croc stateRef={stateRef} />
      <Gator stateRef={stateRef} />
      <Fireflies stateRef={stateRef} />
      <CameraRig stateRef={stateRef} />
    </>
  );
}
