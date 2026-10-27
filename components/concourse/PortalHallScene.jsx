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
//
// Per-card tilt (Merlin, 2026-10-27): the card view IS the Portal
// Room's standard — no List mode, no toggle. Each card rotates
// individually, in place, from lib/portal-card-tilt.js: press-and-hold
// a card and pull left/right to tilt that card alone (it springs
// back on release), or, when motion access is granted, tilt the
// phone and every card leans with it. A quick tap still expands the
// portal (10px / 500ms tap-vs-drag rule). Drags that start on empty
// space still orbit the whole wall a little.

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
import {
  CARD_TAP_MAX_PX,
  classifyCardGesture,
  springTiltStep,
  tiltFromDrag,
  tiltFromOrientation,
} from '@/lib/portal-card-tilt';
import {
  TILT_PREF_KEY,
  classifyTiltEnv,
  classifyTiltPermission,
  smoothTiltInput,
} from '@/lib/tilt-control';

const WALL_COLS = Math.ceil(Math.sqrt(WALL_PAGE_SIZE)); // 7
const WALL_ROWS = Math.ceil(WALL_PAGE_SIZE / WALL_COLS); // 6
const CELL_W = 2.1;
const CELL_H = 2.6;
const WALL_HALF_W = ((WALL_COLS - 1) / 2) * CELL_W;
const EXPAND_CENTER = new THREE.Vector3(0, 0, 3.4);
const ARCH_SCALE = 0.021; // OMEGA_ARCH proportions -> ~3.7 units tall
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

// Drag on EMPTY space = orbit the wall a little. A drag that starts
// on a card belongs to that card (per-card tilt, lib/portal-card-tilt.js):
// while a card gesture is live (cardGestureRef set by the wall's own
// pointer handlers), DragOrbit stands down — checked on every move,
// so the ordering of the canvas listener vs the raycast handler
// cannot double-drive a gesture. Raw listeners on the canvas so a
// drag works even starting on empty space.
function DragOrbit({ orbitRef, cardGestureRef }) {
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
      if (cardGestureRef && cardGestureRef.current != null) return;
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
  }, [gl, orbitRef, cardGestureRef]);
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

function WallGroup({ pageItems, expanded, swirlTex, failedKeysRef, orbitRef, cardGestureRef, deviceTiltRef, onTap }) {
  const groupRef = useRef(null);
  const ringsRef = useRef(null);
  const discsRef = useRef(null);
  // Per-card tilt state (lib/portal-card-tilt.js): slot index -> the
  // card's current drag yaw. A released card's yaw springs back to
  // rest in the frame loop; the actively dragged card is exempt.
  const tiltRef = useRef(new Map());
  // The live card gesture, if any: { index, item, startX, startY,
  // startT, dragged }. Stored once at pointerdown so a page change
  // mid-gesture can never retarget the tap.
  const activeCardRef = useRef(null);
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
      // Per-card tilt, in place: a dragging/released card wears its
      // own drag yaw; every other card wears the device tilt (zero
      // when motion is denied or unavailable). The tilt adds to the
      // slot yaw — it never moves the card off its slot, and it never
      // turns the wall as a group.
      let cardYaw = 0;
      let cardPitch = 0;
      const drag = tiltRef.current.get(i);
      if (drag !== undefined) {
        cardYaw = drag;
      } else if (deviceTiltRef && deviceTiltRef.current) {
        cardYaw = deviceTiltRef.current.yaw || 0;
        cardPitch = deviceTiltRef.current.pitch || 0;
      }
      rotY += cardYaw;
      // Mini Omega arch orientation: spin the arc in its own plane so
      // the gap sits at the bottom (OMEGA_ARCH.rotationZ, the same
      // tilt the expanded arch wears), then yaw to the wall slot.
      // Default Euler order applies the Z spin before the Y yaw.
      dummy.position.copy(cell.slot.pos);
      dummy.rotation.set(cardPitch, rotY, OMEGA_ARCH.rotationZ);
      dummy.scale.set(1, 1.25, 1);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
      dummy.position.z += 0.04; // the disc rides just inside its ring
      dummy.rotation.set(cardPitch, rotY, OMEGA_ARCH.rotationZ + discSpin);
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
    // A page/expand change retires collapsed slots: drop their
    // springing tilts (the live gesture, if any, is untouched — its
    // release resolves against the item stored at pointerdown).
    for (const idx of [...tiltRef.current.keys()]) {
      if (!layout[idx]) tiltRef.current.delete(idx);
    }
    composeInstances(lastTRef.current);
  }, [pageItems, expanded, tmpColor]);

  // The living wall: a slow sway over the user's drag orbit, and
  // every turning disc carrying the swirl's spin (standing cards
  // settle out of it inside composeInstances). Released cards spring
  // back to rest here — one decay step per frame, refs only, so the
  // 42-card wall costs no React renders.
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    lastTRef.current = t;
    if (groupRef.current) {
      groupRef.current.rotation.y = orbitRef.current.yaw + Math.sin(t * 0.5) * 0.02;
      groupRef.current.rotation.x = orbitRef.current.pitch;
    }
    const active = activeCardRef.current;
    for (const [idx, v] of tiltRef.current) {
      if (active && active.index === idx) continue;
      const next = springTiltStep(v, delta);
      if (next === 0) tiltRef.current.delete(idx);
      else tiltRef.current.set(idx, next);
    }
    composeInstances(t);
  });

  // One card gesture at a time, tracked on the window so a pull that
  // leaves the card (or the canvas) still resolves: below the tap
  // threshold it is a tap and opens; past it, the card tilts and the
  // release springs back with nothing opened. Cancellation never
  // opens. The wall's DragOrbit stands down for the whole gesture
  // (cardGestureRef), so a card pull never orbits the wall.
  useEffect(() => {
    const move = (e) => {
      const g = activeCardRef.current;
      if (!g) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > CARD_TAP_MAX_PX) {
        g.dragged = true;
        tiltRef.current.set(g.index, tiltFromDrag(dx));
      }
    };
    const end = (e, cancelled) => {
      const g = activeCardRef.current;
      if (!g) return;
      activeCardRef.current = null;
      if (cardGestureRef) cardGestureRef.current = null;
      if (cancelled) return; // spring-back only, never open
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (classifyCardGesture({ dx, dy, dtMs: now - g.startT }) === 'tap') {
        tiltRef.current.delete(g.index);
        if (g.item) onTap(g.item);
      }
      // drag: the tilt stays in the map and springs back in the loop.
    };
    const up = (e) => end(e, false);
    const cancel = (e) => end(e, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [onTap, cardGestureRef]);

  const onCardPointerDown = (e) => {
    if (activeCardRef.current) return; // single gesture at a time
    if (e.instanceId == null) return;
    const item = pageItems[e.instanceId];
    if (!item) return;
    activeCardRef.current = {
      index: e.instanceId,
      item,
      startX: e.clientX,
      startY: e.clientY,
      startT: typeof performance !== 'undefined' ? performance.now() : 0,
      dragged: false,
    };
    if (cardGestureRef) cardGestureRef.current = e.instanceId;
  };

  const expandedIndex = expanded ? pageItems.findIndex((p) => p.key === expanded.key) : -1;
  const expandedSlot = expandedIndex >= 0 ? wallSlot(expandedIndex) : { pos: new THREE.Vector3(), rotY: 0 };

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={ringsRef}
        args={[null, null, WALL_PAGE_SIZE]}
        frustumCulled={false}
        onPointerDown={onCardPointerDown}
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
        onPointerDown={onCardPointerDown}
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
  // Shared gesture flag: set while a card gesture is live so
  // DragOrbit stands down for it (checked on every move).
  const cardGestureRef = useRef(null);
  // Device tilt, written by the motion effect below and read by the
  // frame loop: { yaw, pitch } in radians, zero when motion is
  // denied, unavailable, or parked off. Refs only — no re-renders.
  const deviceTiltRef = useRef({ yaw: 0, pitch: 0 });
  // Wrapper around the Canvas: the engagement gate for the iOS
  // motion-permission flow (only taps on the hall itself count).
  const wrapRef = useRef(null);

  // Device motion → per-card tilt. Reuses the hub's tilt plumbing
  // (lib/tilt-control.js: env/permission classification, the ±8°
  // dead-zone ramp, the persisted preference) but writes its own
  // channel: each card's in-place tilt, never the hub's flight
  // input. Silent by design: denied, unavailable, reduced-motion,
  // or parked-off all mean drag-only, with no toast and no error.
  // The Concourse Settings switch parks/unparks this too, through
  // the same olympus:tilt-pref-changed event the hub listens to.
  useEffect(() => {
    let subscribed = false;
    let neutral = null;
    const smooth = { yaw: 0, pitch: 0 };
    const onOrientation = (e) => {
      const g = e.gamma;
      const b = e.beta;
      if (!Number.isFinite(g) || !Number.isFinite(b)) return;
      if (neutral === null) neutral = { gamma: g, beta: b };
      const t = tiltFromOrientation({
        gammaDelta: g - neutral.gamma,
        betaDelta: b - neutral.beta,
      });
      smooth.yaw = smoothTiltInput(smooth.yaw, t.yaw);
      smooth.pitch = smoothTiltInput(smooth.pitch, t.pitch);
      deviceTiltRef.current = { yaw: smooth.yaw, pitch: smooth.pitch };
    };
    const start = () => {
      if (subscribed) return;
      subscribed = true;
      neutral = null;
      smooth.yaw = 0;
      smooth.pitch = 0;
      window.addEventListener('deviceorientation', onOrientation);
    };
    const stop = () => {
      subscribed = false;
      window.removeEventListener('deviceorientation', onOrientation);
      deviceTiltRef.current = { yaw: 0, pitch: 0 };
    };
    const DOE =
      typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
    const reduced =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    const env = classifyTiltEnv({
      reducedMotion: reduced,
      hasDeviceOrientationEvent: !!DOE,
      hasRequestPermission: !!DOE && typeof DOE.requestPermission === 'function',
    });
    if (!env.ok) return undefined;
    const onFirstTap = (e) => {
      const el = e && e.target;
      if (!wrapRef.current || !el || typeof el.contains !== 'function' || !wrapRef.current.contains(el)) {
        // Ordinary browsing (panel chrome): stay silent, re-arm,
        // and wait for a real tap on the hall itself.
        window.addEventListener('pointerdown', onFirstTap, { once: true, capture: true });
        return;
      }
      try {
        DOE.requestPermission()
          .then((res) => {
            if (classifyTiltPermission(res).ok) start();
          })
          .catch(() => {});
      } catch {}
    };
    const arm = () => {
      if (env.reason === 'direct') start();
      else window.addEventListener('pointerdown', onFirstTap, { once: true, capture: true });
    };
    const onPref = (e) => {
      if (e && e.detail && e.detail.on) arm();
      else stop();
    };
    window.addEventListener('olympus:tilt-pref-changed', onPref);
    let parked = false;
    try {
      parked = window.localStorage.getItem(TILT_PREF_KEY) === '0';
    } catch {}
    if (!parked) arm();
    return () => {
      window.removeEventListener('pointerdown', onFirstTap, { capture: true });
      window.removeEventListener('olympus:tilt-pref-changed', onPref);
      stop();
    };
  }, []);

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
    <div ref={wrapRef} className="h-full w-full">
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
        <DragOrbit orbitRef={orbitRef} cardGestureRef={cardGestureRef} />
        <ambientLight intensity={0.75} />
        <pointLight position={[0, 4, 9]} intensity={1.6} distance={60} decay={0} color="#cfe8ff" />
        <WallGroup
          pageItems={pageItems}
          expanded={expanded}
          swirlTex={swirlTex}
          failedKeysRef={failedKeysRef}
          orbitRef={orbitRef}
          cardGestureRef={cardGestureRef}
          deviceTiltRef={deviceTiltRef}
          onTap={onTap}
        />
      </Canvas>
    </div>
  );
}
