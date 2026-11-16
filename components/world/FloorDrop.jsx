'use client';

// components/world/FloorDrop.jsx — the ONE floor-drop UI (WS-C, Merlin, Nov 16, 2026).
//
// ONE shared implementation for every underworld + heaven realm. No
// per-realm copies: each realm page mounts these same exports and
// passes only its origin key + spawn.
//
// WHAT IT IS — the Anti-Life shape, exactly (audit §1.3/§6):
// - <FloorDropDisc> (R3F, lives inside the realm's scene in
//   world3d.js, beside <AntiLifePortalDisc /> where one exists): a
//   visible disc on the floor — ashen core + violet rim at y 0.1/0.12
//   with a floating label, the Anti-Life disc's shape in the Land of
//   the Dead's colours. NO floor mesh is cut anywhere: the floor in
//   every realm is one flat r400 disc, and the "opening" is this
//   trigger disc + the gravity fall below, exactly like the Anti-Life
//   fall and the Hades lava drop. Nothing here claims a cut mesh.
// - The trigger is the CameraRig guard (one shared helper in
//   lib/world/floor-drop.js, own guard state per rig, 1500 ms re-arm
//   — the arch / Anti-Life pattern): stepping onto the disc fires the
//   page's onFloorDrop callback, which starts the drop sequence.
// - <FloorDropFallOverlay> (DOM): the fall itself. Every realm's
//   CameraRig pins the camera at y 2.4 each frame (verified in code),
//   so the fall is rendered as a gravity-timed shaft descent —
//   depth = 1/2 g t^2, driven by requestAnimationFrame — after the
//   disc fires. The user steps on the disc, the floor gives way,
//   then they fall.
// - <LandOfTheDeadReturn> (R3F) + <LandOfTheDeadReturnOrb> (DOM):
//   the way back — a visible portal in the Land of the Dead's floor.
//   Stepping/tapping it returns the user to the realm they dropped
//   from (Merlin, Nov 16 ~04:04 — DECIDED). The origin is read by
//   useLandOfTheDeadReturn(): URL ?from= first, then sessionStorage.
//
// ORIGIN (see lib/world/floor-drop.js): the drop stores the origin
// in sessionStorage AND carries it in the URL. The return consumes
// the stored origin (single-use). Missing origin -> the portal room.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import OrbButton from '@/components/world/OrbButton';
import {
  FLOOR_DROP_DEPTH,
  FLOOR_DROP_OPEN_MS,
  FLOOR_DROP_OPEN_PAUSE_MS,
  FLOOR_DROP_PORTAL_NAME,
  FLOOR_DROP_RETURN_RADIUS,
  FLOOR_DROP_STORAGE_KEY,
  clearDropOrigin,
  createFloorDropState,
  dropDestination,
  fallDistanceAtTime,
  floorDropDiscForSide,
  floorDropFallSeconds,
  floorDropNext,
  labelForRealmKey,
  resolveDropOrigin,
  returnRouteForOrigin,
  storeDropOrigin,
} from '@/lib/world/floor-drop';

const discLabelStyle = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 13,
  fontWeight: 700,
  color: '#e9d5ff',
  background: 'rgba(24, 8, 48, 0.82)',
  border: '1px solid rgba(167, 139, 250, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

/**
 * Drives one drop from a realm page. The page owns nothing but this
 * hook + the three components below.
 *
 *   const floorDrop = useFloorDrop({ origin: 'helheim' });
 *   // …in world3d.js: <FloorDropDisc side="nether" /> + the CameraRig
 *   // guard calling onFloorDrop={floorDrop.open}; in page.jsx:
 *   <FloorDropFallOverlay phase={floorDrop.phase} depth={floorDrop.depth} />
 */
export function useFloorDrop({ origin }) {
  const router = useRouter();
  const [state, setState] = useState(() => createFloorDropState(origin));
  const [depth, setDepth] = useState(0);
  const timersRef = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const open = useCallback(() => {
    setState((prev) => {
      const next = floorDropNext(prev, 'open');
      if (next === prev) return prev;
      // The origin is stored the moment the drop starts, so the
      // return can find it even if the URL is ever stripped.
      if (typeof window !== 'undefined') {
        try { storeDropOrigin(next.origin, window.sessionStorage); } catch { /* the URL still carries it */ }
      }
      const t1 = setTimeout(() => {
        setState((s2) => floorDropNext(s2, 'opened'));
        const t2 = setTimeout(() => {
          setState((s3) => {
            const dropped = floorDropNext(s3, 'drop');
            if (dropped === s3) return s3;
            // The fall: a real gravity integration. Depth grows as
            // 1/2 g t^2 until the shaft depth is reached, then the
            // user arrives in the Land of the Dead.
            const startedAt = performance.now();
            const fallSeconds = floorDropFallSeconds();
            const tick = (now) => {
              const elapsed = (now - startedAt) / 1000;
              setDepth(fallDistanceAtTime(elapsed));
              if (elapsed < fallSeconds) {
                rafRef.current = requestAnimationFrame(tick);
              } else {
                router.push(dropDestination(dropped.origin));
              }
            };
            rafRef.current = requestAnimationFrame(tick);
            return dropped;
          });
        }, FLOOR_DROP_OPEN_PAUSE_MS);
        timersRef.current.push(t2);
      }, FLOOR_DROP_OPEN_MS);
      timersRef.current.push(t1);
      return next;
    });
  }, [router]);

  return { phase: state.phase, origin: state.origin, depth, open };
}

/**
 * The floor-drop disc (R3F — renders inside the realm's scene in
 * world3d.js, beside <AntiLifePortalDisc /> where one exists). It
 * mirrors components/afterlife/AntiLifePortalDisc.jsx exactly in
 * shape — an ashen core disc at y 0.1, a coloured rim ring at y 0.12,
 * a floating label naming where it takes you — but violet, not red:
 * the Land of the Dead is dusk violet, not Anti-Life blood-red. The
 * disc breathes (opacity pulse via useFrame, skipped when reduced
 * motion is on, the same pattern the Anti-Life disc uses). No light
 * of its own — the realm's light budget is untouched.
 *
 * `side` is 'nether' (mirror spot +70, 110) or 'heaven' (the
 * Anti-Life spot -70, 110, free there). The CameraRig guard — not
 * this disc — is the trigger: stepping onto the disc fires the page's
 * onFloorDrop callback. No floor mesh is cut; the disc IS the opening.
 */
export function FloorDropDisc({ side = 'nether', reduced } = {}) {
  const disc = floorDropDiscForSide(side);
  const coreRef = useRef(null);
  const rimRef = useRef(null);

  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    // Slow violet breath: the disc never sits still, but never flashes.
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    if (coreRef.current) coreRef.current.opacity = 0.55 + 0.25 * pulse;
    if (rimRef.current) rimRef.current.opacity = 0.5 + 0.4 * pulse;
  });

  return (
    <group position={[disc.x, 0, disc.z]}>
      {/* Ashen core: dead ground, darker than the realm floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[disc.r, 32]} />
        <meshBasicMaterial
          ref={coreRef}
          color="#14092b"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>
      {/* Violet rim: the edge of the fall. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <ringGeometry args={[disc.r - 0.6, disc.r, 32]} />
        <meshBasicMaterial
          ref={rimRef}
          color="#7c3aed"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* The label names where it takes you, like the arch labels
          name their realm and the lava labels name the World Engine. */}
      <Html center distanceFactor={90} position={[0, 2.2, 0]} zIndexRange={[20, 0]} style={discLabelStyle}>
        {FLOOR_DROP_PORTAL_NAME}
      </Html>
    </group>
  );
}

/** The fall overlay: a shaft rushing past, depth counted from real gravity. */
export function FloorDropFallOverlay({ phase, depth }) {
  if (phase !== 'dropping') return null;
  const metres = Math.min(FLOOR_DROP_DEPTH, Math.max(0, depth || 0));
  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        background: 'radial-gradient(ellipse at center, #1a0b2e 0%, #050208 70%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#e9d5ff', textAlign: 'center', pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 44, lineHeight: 1 }}>🕳️</div>
      <p style={{ marginTop: 12, fontSize: 18, fontWeight: 800 }}>Falling to the Land of the Dead…</p>
      <p style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{metres.toFixed(1)} m down the shaft</p>
      <div
        style={{
          marginTop: 16, width: 180, height: 6, borderRadius: 9999,
          background: 'rgba(255,255,255,0.15)', overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%', width: `${Math.min(100, (metres / FLOOR_DROP_DEPTH) * 100)}%`,
            background: '#b78cff', borderRadius: 9999,
          }}
        />
      </div>
    </div>
  );
}

// --- the way back: a portal in the Land of the Dead's floor --------------

/**
 * Reads where the user dropped from (URL ?from= first, then
 * sessionStorage) and returns the way home: the origin realm's route
 * and label — or the portal room when no origin survived the drop.
 * The stored origin is consumed (single-use) once the return fires.
 */
export function useLandOfTheDeadReturn() {
  const router = useRouter();
  const [origin, setOrigin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let found = null;
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
      found = resolveDropOrigin(search, storage);
    } catch { found = null; }
    setOrigin(found);
    setReady(true);
  }, []);

  const returnRoute = returnRouteForOrigin(origin);
  const returnLabel = origin ? labelForRealmKey(origin) : null;

  const returnToOrigin = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { clearDropOrigin(window.sessionStorage); } catch { /* the URL stays harmless */ }
    }
    router.push(returnRoute);
  }, [router, returnRoute]);

  return { origin, ready, returnRoute, returnLabel, returnToOrigin };
}

/**
 * The return portal in the Land of the Dead's floor (R3F — mount
 * inside the Land of the Dead <Canvas>). A glowing ringed portal
 * disc lying flat in the floor at `anchor`; tapping it (or walking
 * onto it when `playerRef` is passed) carries the user back to the
 * realm they dropped from. `position` + `quaternion` place it on any
 * floor: flat realms pass an `anchor` ({ x, y: 0, z }); sphere worlds
 * pass the surface point + the surface quaternion (local +Y onto the
 * surface up). The destination label lives on the DOM orb, not here.
 */
export function LandOfTheDeadReturn({ anchor, position, quaternion, playerRef, onReturn }) {
  const pos = position || anchor || { x: 0, y: 0, z: 148 };
  const returnedRef = useRef(false);
  const ringRef = useRef(null);

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.4;
    }
    if (playerRef && !returnedRef.current && onReturn) {
      const p = playerRef.current;
      if (p && Math.hypot(p.x - pos.x, p.z - pos.z) < FLOOR_DROP_RETURN_RADIUS + 0.8) {
        returnedRef.current = true;
        onReturn();
      }
    }
  });

  return (
    <group position={[pos.x, pos.y, pos.z]} quaternion={quaternion}>
      {/* the portal mouth: a glowing disc lying flat in the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} onClick={onReturn}>
        <circleGeometry args={[FLOOR_DROP_RETURN_RADIUS, 40]} />
        <meshStandardMaterial
          color="#b78cff"
          emissive="#7c3aed"
          emissiveIntensity={1.4}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* the marked ring around it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} onClick={onReturn}>
        <ringGeometry args={[FLOOR_DROP_RETURN_RADIUS, FLOOR_DROP_RETURN_RADIUS + 0.4, 40]} />
        <meshBasicMaterial color="#e9d5ff" transparent opacity={0.95} side={2} />
      </mesh>
      {/* a slow-turning inner ring, so the portal reads as a way back, not a hole */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} onClick={onReturn}>
        <ringGeometry args={[FLOOR_DROP_RETURN_RADIUS * 0.45, FLOOR_DROP_RETURN_RADIUS * 0.62, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} side={2} />
      </mesh>
      {/* an upward beam marking the way home */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[FLOOR_DROP_RETURN_RADIUS * 0.5, FLOOR_DROP_RETURN_RADIUS * 0.8, 16, 24, 1, true]} />
        <meshBasicMaterial color="#b78cff" transparent opacity={0.18} side={2} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The circle-orb return trigger for the Land of the Dead HUD. */
export function LandOfTheDeadReturnOrb({ ready, originLabel, onReturn }) {
  return (
    <OrbButton
      ariaLabel={ready && originLabel ? `Step through the floor portal back to ${originLabel}` : 'Step through the floor portal back to the Portal Room'}
      title={ready && originLabel ? `Back to ${originLabel}` : 'Back to the Portal Room'}
      accent="#b78cff"
      onClick={onReturn}
    >
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>↩️</span>
      <span aria-hidden="true">{ready && originLabel ? originLabel : 'Portal Room'}</span>
    </OrbButton>
  );
}

// Re-exported so realm pages import the storage key from one place.
export { FLOOR_DROP_STORAGE_KEY };
