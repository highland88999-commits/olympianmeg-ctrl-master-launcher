'use client';

// PortalHallScene — the 3D hall inside the Concourse's Portals 3D
// panel: a gently curved wall of MINIMIZED portals (one per program
// in the active section, paged 42 at a time), each a mini Omega arch
// (the 288° torus + bottom gap of lib/omega-arch.js, Merlin
// 2026-10-21) cradling a swirling disc. Tap one and it EXPANDS — a
// true Omega arch grows to center stage wearing that program's own
// video, ready to step through. This is Merlin's spec: the 3D
// objects (portals) live inside the Concourse, minimized until the
// user expands them.
//
// Phone-first rendering discipline:
//   · the whole crowd is TWO instanced meshes (rings + discs) sharing
//     ONE swirl texture (lib/portal-swirl.js) — 2 draw calls, zero
//     per-portal materials, zero per-portal textures;
//   · exactly ONE video texture can be alive: the expanded portal's.
//     Minimized portals never create a <video> element;
//   · the Canvas exists only while the panel is open (the parent
//     unmounts it on close), with HomeScene's tuned GL props.
//
// Standing vs turning (Merlin, 2026-10-22): a portal whose program
// HAS its video (lib/portal-videos.js — the file-presence list) does
// not turn: its card settles upright and stands straight up and
// down, face square to the viewer. Portals still waiting for their
// video keep turning — the swirl spin is their attract state. The
// spin therefore lives in each disc's instance rotation, not in the
// shared texture (one texture rotation could never stop for a
// single card).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  OMEGA_ARCH,
  OMEGA_PORTAL_RADIUS,
  OMEGA_RING_CENTER_Y,
  omegaFootX,
  omegaFootY,
} from '@/lib/omega-arch';
import { SECTION_HUES, DEFAULT_SECTION_HUE, WALL_PAGE_SIZE } from '@/lib/portal-roster';
import { paintPortalSwirl, PORTAL_SWIRL_SIZE } from '@/lib/portal-swirl';
import { portalHasVideo, portalVideoCoverFit } from '@/lib/portal-videos';

const WALL_COLS = Math.ceil(Math.sqrt(WALL_PAGE_SIZE)); // 7
const WALL_ROWS = Math.ceil(WALL_PAGE_SIZE / WALL_COLS); // 6
const CELL_W = 2.1;
const CELL_H = 2.6;
const WALL_HALF_W = ((WALL_COLS - 1) / 2) * CELL_W;
const EXPAND_CENTER = new THREE.Vector3(0, 0, 3.4);
const ARCH_SCALE = 0.021; // OMEGA_ARCH proportions -> ~3.7 units tall
const TAP_SLOP_PX = 6; // tap-vs-drag threshold (the Concourse's discipline)
const SWIRL_SPIN_SPEED = 0.04; // rad/s — the turning cards' attract spin
const SETTLE_SECONDS = 0.45; // a video card easing upright (the expand's pace)

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Grid slot -> wall-local transform. The wall curves gently around
// the viewer: outer columns recede and turn inward.
function wallSlot(index) {
  const col = index % WALL_COLS;
  const row = Math.floor(index / WALL_COLS);
  const x = (col - (WALL_COLS - 1) / 2) * CELL_W;
  const y = ((WALL_ROWS - 1) / 2 - row) * CELL_H;
  const bend = Math.abs(x) / WALL_HALF_W;
  return {
    pos: new THREE.Vector3(x, y, -bend * bend * 1.7),
    rotY: -(x / WALL_HALF_W) * 0.38,
  };
}

function hueFor(section) {
  return new THREE.Color(SECTION_HUES[section] || DEFAULT_SECTION_HUE);
}

// Keep the whole wall in frame on narrow (portrait) stages by
// dollying the camera back as the aspect tightens.
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    camera.position.set(0, 0, aspect >= 1 ? 17.5 : Math.min(27, 17.5 / Math.max(0.55, aspect)));
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

// Drag = orbit the wall a little. Raw listeners on the canvas so a
// drag works even starting on empty space; taps are handled by the
// instanced meshes' own pointer handlers (with the slop check).
function DragOrbit({ orbitRef }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      orbitRef.current.yaw = THREE.MathUtils.clamp(orbitRef.current.yaw + dx * 0.005, -0.6, 0.6);
      orbitRef.current.pitch = THREE.MathUtils.clamp(orbitRef.current.pitch + dy * 0.003, -0.25, 0.25);
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl, orbitRef]);
  return null;
}

// The expanded portal: a real Omega arch (lib/omega-arch.js
// proportions, OmegaHubGate's material recipe) that grows from the
// tapped slot to center stage. Its disc wears the program's own
// video — the ONLY video texture in the hall — and falls back to the
// shared swirl if the video has not arrived (the common case until
// the Omega Portal Videos queue fills) or fails; a failed key is
// never retried this session.
function ExpandedPortal({ program, fromPos, fromRotY, swirlTex, failedKeysRef }) {
  const groupRef = useRef(null);
  const animRef = useRef(0);
  const [videoTex, setVideoTex] = useState(null);

  useEffect(() => {
    setVideoTex(null);
    if (!program || failedKeysRef.current.has(program.key)) return undefined;
    const vid = document.createElement('video');
    vid.src = `/videos/portals/${program.key}.mp4`;
    vid.crossOrigin = 'Anonymous';
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    const tex = new THREE.VideoTexture(vid);
    tex.colorSpace = THREE.SRGBColorSpace;
    let disposed = false;
    const onError = () => {
      failedKeysRef.current.add(program.key);
      if (!disposed) setVideoTex(null);
    };
    const onCanPlay = () => {
      if (disposed) return;
      // A portrait video (astra is 720x1280) would stretch sideways
      // on the square disc if mapped raw — crop it to cover instead,
      // per lib/portal-videos.js. Landscape sources keep the raw
      // mapping they have always worn here.
      const fit = portalVideoCoverFit(vid.videoWidth, vid.videoHeight);
      if (fit) {
        tex.repeat.set(fit.repeat[0], fit.repeat[1]);
        tex.offset.set(fit.offset[0], fit.offset[1]);
      }
      vid.play().catch(() => {});
      setVideoTex(tex);
    };
    vid.addEventListener('error', onError);
    vid.addEventListener('canplay', onCanPlay);
    vid.load();
    return () => {
      disposed = true;
      vid.removeEventListener('error', onError);
      vid.removeEventListener('canplay', onCanPlay);
      vid.pause();
      vid.removeAttribute('src');
      try {
        vid.load();
      } catch {}
      tex.dispose();
    };
  }, [program, failedKeysRef]);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    animRef.current = Math.min(1, animRef.current + delta / 0.45);
    const e = easeOutCubic(animRef.current);
    g.position.lerpVectors(fromPos, EXPAND_CENTER, e);
    const s = THREE.MathUtils.lerp(0.3, 1, e);
    g.scale.setScalar(s);
    g.rotation.y = THREE.MathUtils.lerp(fromRotY, 0, e);
  });

  if (!program) return null;
  const k = ARCH_SCALE;
  const footX = (omegaFootX() + OMEGA_ARCH.footLength / 2) * k;
  const footY = (OMEGA_RING_CENTER_Y + omegaFootY()) * k;
  const ringY = OMEGA_RING_CENTER_Y * k;
  const hasVideo = !!videoTex;

  return (
    <group ref={groupRef} position={fromPos.toArray()} rotation={[0, fromRotY, 0]}>
      {/* Inner group drops the feet plane below center so the whole
          arch — feet to crown — sits mid-stage. */}
      <group position={[0, -1.78, 0]}>
        <mesh position={[0, ringY, 0]} rotation={[0, 0, OMEGA_ARCH.rotationZ]}>
          <torusGeometry args={[OMEGA_ARCH.radius * k, OMEGA_ARCH.tube * k, 24, 72, OMEGA_ARCH.arc]} />
          <meshStandardMaterial
            color="#3b2d5c"
            emissive="#7a4fd0"
            emissiveIntensity={0.55}
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {[footX, -footX].map((x) => (
          <mesh key={x} position={[x, footY, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry
              args={[OMEGA_ARCH.tube * k, OMEGA_ARCH.tube * k, OMEGA_ARCH.footLength * k, 24]}
            />
            <meshStandardMaterial
              color="#3b2d5c"
              emissive="#7a4fd0"
              emissiveIntensity={0.55}
              roughness={0.3}
              metalness={0.7}
            />
          </mesh>
        ))}
        <mesh position={[0, ringY, 0]}>
          <circleGeometry args={[OMEGA_PORTAL_RADIUS * k, 48]} />
          {hasVideo ? (
            <meshBasicMaterial map={videoTex} side={THREE.DoubleSide} toneMapped={false} />
          ) : (
            <meshBasicMaterial
              map={swirlTex}
              color={hueFor(program.section)}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          )}
        </mesh>
        <pointLight position={[0, ringY, 1.6]} intensity={1.4} distance={14} decay={0} color="#00e5ff" />
      </group>
    </group>
  );
}

function WallGroup({ pageItems, expanded, swirlTex, failedKeysRef, orbitRef, onTap }) {
  const groupRef = useRef(null);
  const ringsRef = useRef(null);
  const discsRef = useRef(null);
  const downRef = useRef(null);
  // Per-slot layout for the frame loop: null for an empty or
  // collapsed slot, else the slot transform + whether this portal
  // stands (has its video) or turns (still waiting for one).
  const layoutRef = useRef([]);
  // A standing card's settle, per slot: where its yaw and its spin
  // were caught when the layout landed, so it eases upright from
  // there instead of snapping. Cleared on every layout.
  const settleRef = useRef(new Map());
  const lastTRef = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Compose every instance matrix for time t. Turning cards wear the
  // shared spin phase in their disc's own rotation; standing cards
  // unwind that spin to the nearest full turn and ease their yaw to
  // square (rotY 0) — face to the viewer, straight up and down, in
  // the slot they already hold. Rings never spin (the Omega gap
  // stays at the bottom); they only share the standing yaw.
  const composeInstances = (t) => {
    const rings = ringsRef.current;
    const discs = discsRef.current;
    if (!rings || !discs) return;
    const spin = (t * SWIRL_SPIN_SPEED) % (Math.PI * 2);
    for (let i = 0; i < WALL_PAGE_SIZE; i += 1) {
      const cell = layoutRef.current[i] || null;
      if (!cell) {
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        rings.setMatrixAt(i, dummy.matrix);
        discs.setMatrixAt(i, dummy.matrix);
        continue;
      }
      let rotY = cell.slot.rotY;
      let discSpin = spin;
      if (cell.stands) {
        let s = settleRef.current.get(i);
        if (!s) {
          s = { t0: t, fromSpin: spin, fromRotY: cell.slot.rotY };
          settleRef.current.set(i, s);
        }
        const e = easeOutCubic(Math.min(1, Math.max(0, (t - s.t0) / SETTLE_SECONDS)));
        rotY = THREE.MathUtils.lerp(s.fromRotY, 0, e);
        const upright = Math.round(s.fromSpin / (Math.PI * 2)) * Math.PI * 2;
        discSpin = THREE.MathUtils.lerp(s.fromSpin, upright, e);
      }
      // Mini Omega arch orientation: spin the arc in its own plane so
      // the gap sits at the bottom (OMEGA_ARCH.rotationZ, the same
      // tilt the expanded arch wears), then yaw to the wall slot.
      // Default Euler order applies the Z spin before the Y yaw.
      dummy.position.copy(cell.slot.pos);
      dummy.rotation.set(0, rotY, OMEGA_ARCH.rotationZ);
      dummy.scale.set(1, 1.25, 1);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
      dummy.position.z += 0.04; // the disc rides just inside its ring
      dummy.rotation.set(0, rotY, OMEGA_ARCH.rotationZ + discSpin);
      dummy.updateMatrix();
      discs.setMatrixAt(i, dummy.matrix);
    }
    rings.instanceMatrix.needsUpdate = true;
    discs.instanceMatrix.needsUpdate = true;
  };

  // Lay out the page: record each slot's transform and standing
  // state, set the per-instance section hues, and paint the first
  // frame. The expanded program's slot is collapsed to nothing —
  // its real arch stands in its place.
  useEffect(() => {
    const discs = discsRef.current;
    if (!discs) return;
    settleRef.current.clear();
    const layout = [];
    for (let i = 0; i < WALL_PAGE_SIZE; i += 1) {
      const item = pageItems[i] || null;
      const live = !!item && (!expanded || item.key !== expanded.key);
      layout.push(live ? { slot: wallSlot(i), stands: portalHasVideo(item.key) } : null);
      tmpColor.copy(item ? hueFor(item.section) : hueFor(null));
      discs.setColorAt(i, tmpColor);
    }
    layoutRef.current = layout;
    if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
    composeInstances(lastTRef.current);
  }, [pageItems, expanded, tmpColor]);

  // The living wall: a slow sway over the user's drag orbit, and
  // every turning disc carrying the swirl's spin (standing cards
  // settle out of it inside composeInstances).
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    lastTRef.current = t;
    if (groupRef.current) {
      groupRef.current.rotation.y = orbitRef.current.yaw + Math.sin(t * 0.5) * 0.02;
      groupRef.current.rotation.x = orbitRef.current.pitch;
    }
    composeInstances(t);
  });

  const onPointerDown = (e) => {
    downRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    const down = downRef.current;
    downRef.current = null;
    if (!down || e.instanceId == null) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX) return;
    const item = pageItems[e.instanceId];
    if (item) onTap(item);
  };

  const expandedIndex = expanded ? pageItems.findIndex((p) => p.key === expanded.key) : -1;
  const expandedSlot = expandedIndex >= 0 ? wallSlot(expandedIndex) : { pos: new THREE.Vector3(), rotY: 0 };

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={ringsRef}
        args={[null, null, WALL_PAGE_SIZE]}
        frustumCulled={false}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <torusGeometry args={[0.82, 0.13, 12, 40, OMEGA_ARCH.arc]} />
        <meshStandardMaterial
          color="#2a1b4d"
          emissive="#6d4bd8"
          emissiveIntensity={0.4}
          roughness={0.35}
          metalness={0.6}
        />
      </instancedMesh>
      <instancedMesh
        ref={discsRef}
        args={[null, null, WALL_PAGE_SIZE]}
        frustumCulled={false}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <circleGeometry args={[0.8, 40]} />
        <meshBasicMaterial map={swirlTex} toneMapped={false} />
      </instancedMesh>
      {expanded ? (
        <ExpandedPortal
          key={expanded.key}
          program={expanded}
          fromPos={expandedSlot.pos}
          fromRotY={expandedSlot.rotY}
          swirlTex={swirlTex}
          failedKeysRef={failedKeysRef}
        />
      ) : null}
    </group>
  );
}

export default function PortalHallScene({ pageItems, expanded, onTap, onGlFail }) {
  const orbitRef = useRef({ yaw: 0, pitch: 0 });
  const failedKeysRef = useRef(new Set());

  // The ONE swirl texture for the whole hall, painted once.
  const swirlTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = PORTAL_SWIRL_SIZE;
    canvas.height = PORTAL_SWIRL_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) paintPortalSwirl(ctx, PORTAL_SWIRL_SIZE);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.center.set(0.5, 0.5);
    return tex;
  }, []);
  useEffect(() => () => swirlTex.dispose(), [swirlTex]);

  return (
    <Canvas
      gl={{ alpha: true, antialias: false, powerPreference: 'default' }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 17.5], fov: 50, near: 0.1, far: 120 }}
      style={{ touchAction: 'none' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          if (onGlFail) onGlFail();
        });
      }}
    >
      <FitCamera />
      <DragOrbit orbitRef={orbitRef} />
      <ambientLight intensity={0.75} />
      <pointLight position={[0, 4, 9]} intensity={1.6} distance={60} decay={0} color="#cfe8ff" />
      <WallGroup
        pageItems={pageItems}
        expanded={expanded}
        swirlTex={swirlTex}
        failedKeysRef={failedKeysRef}
        orbitRef={orbitRef}
        onTap={onTap}
      />
    </Canvas>
  );
}
