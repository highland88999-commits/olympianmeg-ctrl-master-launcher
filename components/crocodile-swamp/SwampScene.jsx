'use client';
// components/crocodile-swamp/SwampScene.jsx
// R3F rendering for Crocodile Swamp. Reads the pure engine state from a ref
// every frame and syncs three.js objects imperatively (no React re-renders
// in the hot loop). Florida swamp: dark green water in an elliptical basin,
// muddy banks, cypress trees with hanging moss silhouettes, lily pads, a
// wooden canoe, and a long green shape that wants you dead.

import { useEffect, useMemo, useRef, useState, Component, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  WORLD,
  isLand,
  tileFor,
  tileBounds,
  tileParams,
  tileVegetation,
} from '@/lib/crocodile-swamp/levels';
import { MODEL_SLOTS, JAW_PARAMS, markSlotLoaded } from '@/lib/swamp-run/models';

const V3 = new THREE.Vector3();

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  useFrame(() => {
    const s = stateRef.current;
    if (!s) return;
    const p = s.player;
    target.current.set(p.x * 0.82, 26, p.z * 0.82 + 17);
    camera.position.lerp(target.current, 0.045);
    camera.lookAt(p.x * 0.9, 0, p.z * 0.9 + 1);
  });
  return null;
}

// One swamp tile: land base + water basin + muddy shoreline ring +
// cypress trees + lily pads, all from the tile's seeded law
// (lib/crocodile-swamp/levels.js). The home tile (0,0) renders exactly
// as the old fixed arena did.
function SwampTile({ tx, tz }) {
  const veg = useMemo(() => tileVegetation(tx, tz), [tx, tz]);
  const p = useMemo(() => tileParams(tx, tz), [tx, tz]);
  const b = tileBounds(tx, tz);
  const ccx = (b.x0 + b.x1) / 2;
  const ccz = (b.z0 + b.z1) / 2;
  const wx = ccx + p.cx;
  const wz = ccz + p.cz;
  return (
    <group>
      {/* land base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ccx, -0.06, ccz]}>
        <planeGeometry args={[WORLD.width, WORLD.depth]} />
        <meshStandardMaterial color="#1c2b12" roughness={1} />
      </mesh>
      {/* the water basin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, 0, wz]} scale={[p.rx, p.rz, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#0a2e1e" roughness={0.35} metalness={0.25} />
      </mesh>
      {/* muddy shoreline ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, -0.02, wz]} scale={[p.rx + 2.5, p.rz + 2.5, 1]}>
        <ringGeometry args={[0.94, 1, 48]} />
        <meshStandardMaterial color="#3a2c17" roughness={1} />
      </mesh>
      {veg.trees.map((t, i) => (
        <group key={`t${i}`} position={[t.x, 0, t.z]} rotation={[0, t.r, 0]} scale={t.s}>
          <mesh position={[0, t.h / 2, 0]}>
            <cylinderGeometry args={[0.24, 0.5, t.h, 7]} />
            <meshStandardMaterial color="#2e2118" roughness={0.95} />
          </mesh>
          <mesh position={[0, t.h + 1.1, 0]}>
            <coneGeometry args={[2.6, 3.2, 8]} />
            <meshStandardMaterial color="#14260f" roughness={0.9} />
          </mesh>
          {/* hanging moss veil */}
          <mesh position={[0.7, t.h + 0.1, 0.3]}>
            <coneGeometry args={[0.9, 2.4, 6]} />
            <meshStandardMaterial color="#1d3316" roughness={1} transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
      {veg.pads.map((pd, i) => (
        <mesh key={`p${i}`} position={[pd.x, 0.04, pd.z]} rotation={[-Math.PI / 2, 0, pd.r]} scale={pd.s}>
          <circleGeometry args={[0.55, 10]} />
          <meshStandardMaterial color="#1e4d22" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// The swamp streams in a 3x3 tile ring around the player (Merlin,
// Nov 18, 2026 — the swamp is endless). The ring re-centres only when
// the player crosses a tile border, so tiles never rebuild mid-frame;
// fog (45–95 m) hides the ring edge, which sits 124+ m out.
function SwampTiles({ stateRef }) {
  const [center, setCenter] = useState({ tx: 0, tz: 0 });
  const centerRef = useRef(center);
  useFrame(() => {
    const s = stateRef.current;
    if (!s) return;
    const t = tileFor(s.player.x, s.player.z);
    if (t.tx !== centerRef.current.tx || t.tz !== centerRef.current.tz) {
      centerRef.current = t;
      setCenter(t);
    }
  });
  const tiles = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({ tx: center.tx + dx, tz: center.tz + dz });
    }
  }
  return (
    <group>
      {tiles.map((t) => (
        <SwampTile key={`${t.tx},${t.tz}`} tx={t.tx} tz={t.tz} />
      ))}
    </group>
  );
}

function CanoeAndPlayer({ stateRef }) {
  const canoeRef = useRef(null);
  const playerRef = useRef(null);
  const splashRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    if (!s) return;
    const t = clock.elapsedTime;
    const inBoat = s.phase === 'paddling';
    if (canoeRef.current) {
      const c = s.canoe;
      canoeRef.current.position.set(c.x, 0.18 + Math.sin(t * 1.6) * 0.05, c.z);
      canoeRef.current.rotation.set(0, c.dir, s.canoe.adrift ? 0.16 : Math.sin(t * 1.3) * 0.02);
    }
    if (playerRef.current) {
      const p = s.player;
      const bobbing = !p.onLand;
      const y = inBoat ? 0.62 : p.onLand ? 0.75 : 0.22 + Math.sin(t * 5) * 0.07;
      playerRef.current.position.set(p.x, y, p.z);
      playerRef.current.rotation.set(0, p.dir, 0);
      playerRef.current.visible = s.status !== 'gameover';
      if (splashRef.current) {
        splashRef.current.visible = bobbing && s.status === 'playing';
        splashRef.current.position.set(p.x, 0.1, p.z);
        const sc = 1 + Math.sin(t * 6) * 0.25;
        splashRef.current.scale.set(sc, 1, sc);
      }
    }
  });
  return (
    <group>
      {/* the canoe — hull, seats, and a hopeful little lantern */}
      <group ref={canoeRef}>
        <mesh>
          <boxGeometry args={[0.9, 0.34, 3.4]} />
          <meshStandardMaterial color="#6b4423" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[1.0, 0.1, 3.7]} />
          <meshStandardMaterial color="#8a5a2b" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.5, -1.5]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#fff2b0" emissive="#ffcf4d" emissiveIntensity={2.4} />
        </mesh>
        <pointLight color="#ffcf4d" intensity={3} distance={5} position={[0, 0.6, -1.5]} />
      </group>
      {/* the paddler / swimmer / runner */}
      <group ref={playerRef}>
        <mesh position={[0, 0.35, 0]}>
          <capsuleGeometry args={[0.26, 0.55, 4, 10]} />
          <meshStandardMaterial color="#ffd23f" emissive="#8a6d1f" emissiveIntensity={0.35} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.21, 12, 12]} />
          <meshStandardMaterial color="#e8b98a" roughness={0.7} />
        </mesh>
        {/* wide-brim hat — Florida rules */}
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.42, 0.44, 0.07, 12]} />
          <meshStandardMaterial color="#c9a86a" roughness={0.9} />
        </mesh>
      </group>
      {/* swim ripples */}
      <mesh ref={splashRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.85, 20]} />
        <meshBasicMaterial color="#bfefff" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

// ── GLB machinery (same idiom as Swamp Run, components/swamp-run/
// SwampRunScene.jsx) ─────────────────────────────────────────────
// The Batch 8 rigged crocodile steps in for the procedural stand-in.
// Every load degrades gracefully: a missing or broken GLB renders the
// procedural stand-in — never a blank.

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

// The procedural crocodile — the GLB-failure fallback ONLY (same
// contract as Swamp Run's CrocProcedural). Body, eyes, jaw snap and
// tail sway exactly as before the swap.
function CrocodileProcedural({ stateRef }) {
  const ref = useRef(null);
  const tailRef = useRef(null);
  const jawRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = ref.current;
    if (!s || !g) return;
    const c = s.croc;
    const t = clock.elapsedTime;
    const onLand = isLand(c.x, c.z);
    const lurking = c.mode === 'lurk';
    // Lurking: just eyes and ridges above the surface. Hunting: full body up.
    const y = lurking ? -0.28 : onLand ? 0.28 : -0.02;
    g.position.set(c.x, y + Math.sin(t * 2.2) * 0.03, c.z);
    g.rotation.y = c.dir;
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(t * (lurking ? 1.5 : 4.5)) * 0.28;
    if (jawRef.current) {
      const snap = s.phase === 'hunted' ? (Math.sin(t * 3) > 0.72 ? 0.5 : 0.12) : 0.06;
      jawRef.current.rotation.x = snap;
    }
    const d = Math.hypot(s.player.x - c.x, s.player.z - c.z);
    g.scale.setScalar(d < 9 && s.phase !== 'swim' ? 1.12 : 1);
  });
  return (
    <group ref={ref}>
      {/* tail */}
      <group ref={tailRef} position={[0, 0, -2.2]}>
        <mesh position={[0, 0, -1.3]}>
          <boxGeometry args={[0.5, 0.3, 2.8]} />
          <meshStandardMaterial color="#243d1c" roughness={0.85} />
        </mesh>
      </group>
      {/* body */}
      <mesh position={[0, 0.05, -0.2]}>
        <boxGeometry args={[1.15, 0.5, 3.6]} />
        <meshStandardMaterial color="#2c4d20" roughness={0.85} />
      </mesh>
      {/* back ridges */}
      {[-1.2, -0.4, 0.4].map((z, i) => (
        <mesh key={i} position={[0, 0.36, z]}>
          <coneGeometry args={[0.16, 0.3, 4]} />
          <meshStandardMaterial color="#1a2f12" roughness={0.9} />
        </mesh>
      ))}
      {/* head + snout */}
      <group position={[0, 0.08, 1.9]}>
        <mesh position={[0, 0, 0.4]}>
          <boxGeometry args={[0.95, 0.42, 1.5]} />
          <meshStandardMaterial color="#2c4d20" roughness={0.85} />
        </mesh>
        <group ref={jawRef} position={[0, -0.1, 0.9]}>
          <mesh position={[0, -0.08, 0.35]}>
            <boxGeometry args={[0.8, 0.16, 1.3]} />
            <meshStandardMaterial color="#38592a" roughness={0.85} />
          </mesh>
        </group>
        {/* eyes — the part you see first */}
        <mesh position={[-0.3, 0.34, 0.55]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffae00" emissiveIntensity={1.8} />
        </mesh>
        <mesh position={[0.3, 0.34, 0.55]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffae00" emissiveIntensity={1.8} />
        </mesh>
      </group>
      <pointLight color="#ffae00" intensity={1.6} distance={4} position={[0, 0.5, 2]} />
    </group>
  );
}

// The Batch 8 rigged crocodile (public/models/swamp/
// crocodile-rigged.glb, 36 joints, no embedded animation clips and
// no jaw bone — the bite is the vertex-shader jaw hinge above,
// driven by the hunt state, plus the emissive aggression pulse).
// Same position / height / heading / scale contract as the
// procedural crocodile: lurk → charge → circle → hunt, tail sway
// on the rig's tail bone, jaw snap while hunted.
function CrocodileGlb({ stateRef, url }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef(null);
  const { wrap, inner, jaw, tailBone } = useMemo(() => {
    const m = cloneSkinned(scene);
    const fitted = fitCreature(
      m,
      ['tripo::Head_2', 'tripo::Head_1'],
      ['tripo::Tail_4', 'tripo::Tail_3'],
      5
    );
    const jaw = addJawHinge(m, JAW_PARAMS.crocodile);
    const tailBone =
      m.getObjectByName('tripo::Tail_1') || m.getObjectByName('tripo::Tail_2') || null;
    markSlotLoaded('crocodile');
    return { ...fitted, jaw, tailBone };
  }, [scene]);
  const mats = useMemo(() => emissiveMats(wrap), [wrap]);
  const jawState = useRef({ value: 0 });
  useFrame(({ clock }, dt) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const c = s.croc;
    const t = clock.elapsedTime;
    const onLand = isLand(c.x, c.z);
    const lurking = c.mode === 'lurk';
    const y = lurking ? -0.28 : onLand ? 0.28 : -0.02;
    g.position.set(c.x, y + Math.sin(t * 2.2) * 0.03, c.z);
    g.rotation.y = c.dir;
    if (tailBone) tailBone.rotation.y = Math.sin(t * (lurking ? 1.5 : 4.5)) * 0.28;
    // Jaw snap: same hunted-phase rhythm as the procedural jaw,
    // eased through the shader hinge (fast open, slow shut).
    const jawTarget = s.phase === 'hunted' ? (Math.sin(t * 3) > 0.72 ? 1 : 0.25) : 0.12;
    const je = stepJaw(jawState.current, jawTarget, dt);
    jaw.jawUniform.value = je;
    jaw.cavityMat.opacity = je * 0.95;
    inner.rotation.x = 0.02 + Math.sin(t * 0.8) * 0.01;
    const angry = c.mode === 'hunt' || c.mode === 'charge' || c.mode === 'circle';
    for (const m of mats) {
      m.emissive.set(angry ? '#ff2a1a' : '#1a0e00');
      m.emissiveIntensity = angry ? 0.55 : 0.12;
    }
    const d = Math.hypot(s.player.x - c.x, s.player.z - c.z);
    g.scale.setScalar(d < 9 && s.phase !== 'swim' ? 1.12 : 1);
  });
  return <primitive ref={groupRef} object={wrap} />;
}

function Crocodile({ stateRef }) {
  const url = useSwampGlb('crocodile');
  const fallback = <CrocodileProcedural stateRef={stateRef} />;
  if (!url) return fallback;
  return (
    <SwampGlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CrocodileGlb stateRef={stateRef} url={url} />
      </Suspense>
    </SwampGlbErrorBoundary>
  );
}

export default function SwampScene({ stateRef }) {
  return (
    <>
      <color attach="background" args={['#04140a']} />
      <fog attach="fog" args={['#04140a', 45, 95]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 6]} intensity={0.75} color="#ffe9b8" />
      <CameraRig stateRef={stateRef} />
      <SwampTiles stateRef={stateRef} />
      <CanoeAndPlayer stateRef={stateRef} />
      <Crocodile stateRef={stateRef} />
    </>
  );
}
