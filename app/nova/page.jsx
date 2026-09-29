// app/nova/page.jsx — NOVA: Deep Space.
//
// Merlin's deep-space expansion. Pick a tron bike from the garage, then
// free-fly three sectors connected by wormholes: The Shallows (garage
// dock), The Gift Drift (THE GIFT — boardable), Spiral Reach (three named
// galaxies + two nebulae).
//
// Honesty rules:
// - No telemetry, no phone-home, zero network calls. Everything procedural.
// - Labels say what things are ("The Gift — fly close to board").
// - Reduced motion: no auto-rotation, wormhole jumps are instant fade cuts,
//   autopilot still flies (user-initiated) but jumps cut instantly.
// - Plain-English HUD. Touch controls built in (no dependencies).
// - Every panel scrolls; Safari bottom-bar clearance everywhere.

'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TRON_BIKES, bikeByKey } from '@/components/nova/TronBikes';
import TronRider from '@/components/nova/TronRider';
import { Starfield, SpiralReachField, Wormhole, TheGift, GiftInterior } from '@/components/nova/DeepSpace';
import {
  SECTORS,
  sectorByKey,
  WORMHOLES,
  wormholesIn,
  jumpThrough,
  SECTOR_SPAWN,
  DOCK_POS,
  GIFT_POS,
  GIFT_BOARD_RADIUS,
  canBoard,
  GALAXIES,
  TRON_BIKE_TUNING,
  tuningFor,
  dist3,
  headingOf,
  speedWord,
  stepFlight,
  steerToward,
} from '@/lib/nova-flight';

const TITLE = 'NOVA — Deep Space';
const PLAQUE_WORDS = 'Poverty needs to end.';

// Autopilot tour: waypoint legs per sector. 'wormhole' legs fly into the
// portal (the jump triggers on contact); 'look' legs dwell and admire.
const TOUR = {
  shallows: [{ kind: 'wormhole', id: 'wh-shallows-gift' }],
  'gift-drift': [
    { kind: 'look', pos: { x: GIFT_POS.x, y: GIFT_POS.y + 4, z: GIFT_POS.z + 42 }, dwell: 4 },
    { kind: 'wormhole', id: 'wh-gift-spiral' },
  ],
  'spiral-reach': [
    ...GALAXIES.map((g) => ({
      kind: 'look',
      pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z + g.radius + 34 },
      dwell: 4,
    })),
    { kind: 'wormhole', id: 'wh-spiral-shallows' },
  ],
};

function tourWaypoint(sectorKey, index) {
  const legs = TOUR[sectorKey] || [];
  const leg = legs[index % legs.length];
  if (!leg) return null;
  if (leg.kind === 'wormhole') {
    const w = WORMHOLES.find((x) => x.id === leg.id);
    return w ? { ...leg, pos: w.pos, wormhole: w } : null;
  }
  return leg;
}

// ---------------------------------------------------------------------------
// 3D: bike rig (flight physics + chase cam)
// ---------------------------------------------------------------------------

function BikeRig({ flightRef, inputRef, bikeKey, autopilotRef, reduced, onWormhole, paused }) {
  const group = useRef(null);
  const { camera } = useThree();
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      h: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      zero: new THREE.Vector3(0, 0, 0),
      camGoal: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    []
  );
  const lastHud = useRef(0);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g || paused) return;
    const dt = Math.min(0.05, rawDt || 0.016);
    const f = flightRef.current;
    const tuning = tuningFor(bikeKey);

    // Autopilot overrides the input.
    let input = inputRef.current;
    const ap = autopilotRef.current;
    if (ap.active) {
      const wp = tourWaypoint(f.sector, ap.wpIndex);
      if (wp) {
        const steer = steerToward(f, wp.pos, tuning);
        const close = steer.dist < (wp.kind === 'wormhole' ? wp.wormhole.radius * 2.2 : 26);
        if (wp.kind === 'look' && close) {
          // Dwell: hold still, admire, then move on.
          if (!ap.dwellUntil) ap.dwellUntil = state.clock.elapsedTime + wp.dwell;
          input = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: true };
          if (state.clock.elapsedTime >= ap.dwellUntil) {
            ap.dwellUntil = 0;
            ap.wpIndex += 1;
          }
        } else {
          input = {
            thrust: close ? 0.35 : 0.85,
            turn: steer.turn,
            pitch: steer.pitch,
            boost: false,
            brake: false,
          };
        }
      } else {
        ap.wpIndex = 0;
        input = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
      }
    }

    const next = stepFlight(f, input, dt, tuning);
    f.pos = next.pos;
    f.yaw = next.yaw;
    f.pitch = next.pitch;
    f.speed = next.speed;
    f.boosting = !!(input.boost && (input.thrust || 0) > 0.1);

    // Wormhole contact?
    for (const w of wormholesIn(f.sector)) {
      if (dist3(f.pos, w.pos) < w.radius) {
        onWormhole(w.id);
        break;
      }
    }

    // Orient: nose (+Z) along heading, up = +Y (deep space, no planet).
    const s = scratch;
    const h = headingOf(f.yaw, f.pitch);
    s.h.set(h.x, h.y, h.z);
    s.m.lookAt(s.h, s.zero, s.up);
    g.position.set(f.pos.x, f.pos.y, f.pos.z);
    g.quaternion.setFromRotationMatrix(s.m);

    // Chase camera with smoothing — but snap instantly on launch / sector
    // jump / disembark so the bike loads right in front of the user.
    s.camGoal.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(s.h, -15).addScaledVector(s.up, 5.5);
    if (snapCamRef.current) {
      camera.position.copy(s.camGoal);
      snapCamRef.current = false;
    } else {
      const step = Math.min(1, Math.max(0, dt * 3.2));
      camera.position.lerp(s.camGoal, step);
    }
    s.look.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(s.h, 22);
    camera.lookAt(s.look);

    if (state.clock.elapsedTime - lastHud.current > 0.2) {
      lastHud.current = state.clock.elapsedTime;
      // HUD reads the ref directly; this just keeps React in sync cheaply.
      autopilotRef.current.hudTick = (autopilotRef.current.hudTick || 0) + 1;
    }
  });

  const Bike = bikeByKey(bikeKey).Cmp;
  return (
    <group ref={group}>
      <Bike color={bikeByKey(bikeKey).color} />
      <TronRider bikeKey={bikeKey} reduced={reduced} />
    </group>
  );
}

// Garage turntable: the chosen bike on its dock pad.
function GaragePreview({ bikeKey, reduced }) {
  const group = useRef(null);
  useFrame((state, dt) => {
    if (!reduced && group.current) group.current.rotation.y += dt * 0.35;
  });
  const Bike = bikeByKey(bikeKey).Cmp;
  return (
    <group position={[DOCK_POS.x, DOCK_POS.y, DOCK_POS.z]}>
      {/* dock pad */}
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[3.4, 4.0, 0.5, 32]} />
        <meshStandardMaterial color="#111827" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.0, 3.4, 48]} />
        <meshBasicMaterial color={bikeByKey(bikeKey).color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <group ref={group} position={[0, 0.4, 0]}>
        <Bike color={bikeByKey(bikeKey).color} />
        {/* the rider sits the docked bike on the turntable too */}
        <TronRider bikeKey={bikeKey} reduced={reduced} />
      </group>
    </group>
  );
}

function NovaScene({
  flightRef,
  inputRef,
  autopilotRef,
  bikeKey,
  phase,
  sectorKey,
  reduced,
  onWormhole,
}) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[60, 80, 40]} intensity={1.4} />
      {phase !== 'interior' && (
        <>
          <Starfield seed={sectorKey === 'shallows' ? 7 : sectorKey === 'gift-drift' ? 21 : 42} />
          {sectorKey === 'shallows' && phase === 'garage' && (
            <GaragePreview bikeKey={bikeKey} reduced={reduced} />
          )}
          {sectorKey === 'gift-drift' && <TheGift position={GIFT_POS} reduced={reduced} />}
          {sectorKey === 'spiral-reach' && <SpiralReachField reduced={reduced} />}
          {wormholesIn(sectorKey).map((w, i) => (
            <Wormhole key={w.id} wormhole={w} index={i} reduced={reduced} />
          ))}
        </>
      )}
      {phase === 'interior' && (
        <>
          <InteriorCameraSnap />
          <GiftInterior reduced={reduced} />
        </>
      )}
      {phase === 'flying' && (
        <BikeRig
          flightRef={flightRef}
          inputRef={inputRef}
          bikeKey={bikeKey}
          autopilotRef={autopilotRef}
          reduced={reduced}
          onWormhole={onWormhole}
          paused={false}
        />
      )}
      {phase === 'interior' && (
        <OrbitControls enablePan={false} minDistance={8} maxDistance={34} enableDamping={false} target={[0, 6, -8]} />
      )}
    </>
  );
}

// Snaps the camera to a good vantage once when entering the gift interior,
// before OrbitControls mounts and takes over.
function InteriorCameraSnap() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 8, 16);
    camera.lookAt(0, 6, -8);
  }, [camera]);
  return null;
}

// Camera drift for garage / interior establishing shots.
function CameraDirector({ phase, reduced }) {
  const { camera } = useThree();
  useFrame((state, dt) => {
    if (phase === 'garage') {
      if (reduced) {
        camera.position.set(14, 7, 20);
      } else {
        const a = state.clock.elapsedTime * 0.18;
        camera.position.set(Math.sin(a) * 24, 8, Math.cos(a) * 24);
      }
      camera.lookAt(DOCK_POS.x, 2, DOCK_POS.z);
    } else if (phase === 'interior' && reduced) {
      // keep a fixed establishing view; OrbitControls takes over on touch
      camera.position.set(0, 8, 16);
      camera.lookAt(0, 6, -8);
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// Touch controls
// ---------------------------------------------------------------------------

function TouchControls({ inputRef, autopilotRef, visible }) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const [nub, setNub] = useState({ x: 0, y: 0 });
  const [slide, setSlide] = useState(0);
  const leftId = useRef(null);
  const leftStart = useRef({ x: 0, y: 0 });
  const rightId = useRef(null);
  const rightStart = useRef({ y: 0 });

  if (!visible) return null;
  const stopAuto = () => {
    autopilotRef.current.active = false;
  };

  return (
    <>
      {/* left half: steer stick */}
      <div
        ref={leftRef}
        className="absolute left-0 bottom-0 w-1/2 h-[46%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          stopAuto();
          leftId.current = e.pointerId;
          leftStart.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== leftId.current) return;
          const dx = Math.max(-60, Math.min(60, e.clientX - leftStart.current.x));
          const dy = Math.max(-60, Math.min(60, e.clientY - leftStart.current.y));
          setNub({ x: dx, y: dy });
          inputRef.current.turn = -(dx / 60);
          inputRef.current.pitch = -(dy / 60);
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== leftId.current) return;
          leftId.current = null;
          setNub({ x: 0, y: 0 });
          inputRef.current.turn = 0;
          inputRef.current.pitch = 0;
        }}
        onPointerCancel={() => {
          leftId.current = null;
          setNub({ x: 0, y: 0 });
          inputRef.current.turn = 0;
          inputRef.current.pitch = 0;
        }}
        aria-label="Steer stick"
      >
        <div className="absolute left-8 bottom-10 w-28 h-28 rounded-full border-2 border-white/25 bg-white/5">
          <div
            className="absolute w-14 h-14 rounded-full bg-cyan-300/70 border border-cyan-100/60"
            style={{
              left: `calc(50% - 28px + ${nub.x * 0.55}px)`,
              top: `calc(50% - 28px + ${nub.y * 0.55}px)`,
            }}
          />
        </div>
        <div className="absolute left-8 bottom-40 text-[10px] uppercase tracking-[0.25em] text-white/50">
          Steer
        </div>
      </div>
      {/* right half: thrust slider */}
      <div
        ref={rightRef}
        className="absolute right-0 bottom-0 w-1/2 h-[46%] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          stopAuto();
          rightId.current = e.pointerId;
          rightStart.current = { y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== rightId.current) return;
          const dy = Math.max(-90, Math.min(90, e.clientY - rightStart.current.y));
          setSlide(-dy / 90);
          inputRef.current.thrust = Math.max(-1, Math.min(1, -dy / 90));
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== rightId.current) return;
          rightId.current = null;
          setSlide(0);
          inputRef.current.thrust = 0;
        }}
        onPointerCancel={() => {
          rightId.current = null;
          setSlide(0);
          inputRef.current.thrust = 0;
        }}
        aria-label="Thrust slider"
      >
        <div className="absolute right-10 bottom-10 w-16 h-40 rounded-full border-2 border-white/25 bg-white/5 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-amber-300/60"
            style={{ height: `${Math.max(0, slide) * 100}%` }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-sky-300/50"
            style={{ height: `${Math.max(0, -slide) * 100}%` }}
          />
        </div>
        <div className="absolute right-10 bottom-52 text-[10px] uppercase tracking-[0.25em] text-white/50">
          Thrust
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NovaPage() {
  const [reduced, setReduced] = useState(false);
  const [touchUI, setTouchUI] = useState(false);
  const [bikeKey, setBikeKey] = useState('wisp');
  const [phase, setPhase] = useState('garage'); // garage | flying | interior
  const [sectorKey, setSectorKey] = useState('shallows');
  const [flash, setFlash] = useState(false);
  const [hudTick, setHudTick] = useState(0);

  const flightRef = useRef({
    sector: 'shallows',
    pos: { ...SECTOR_SPAWN.shallows },
    yaw: Math.PI,
    pitch: 0,
    speed: 0,
    boosting: false,
  });
  const inputRef = useRef({ thrust: 0, turn: 0, pitch: 0, boost: false, brake: false });
  const autopilotRef = useRef({ active: false, wpIndex: 0, dwellUntil: 0, hudTick: 0 });
  const keysRef = useRef(new Set());
  // When true, the chase camera snaps to behind the bike on the next frame
  // instead of lerping — the bike loads right in front of the user.
  const snapCamRef = useRef(false);

  useEffect(() => {
    document.title = TITLE;
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(!!(mq && mq.matches));
      setTouchUI(navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    } catch {
      /* defaults stand */
    }
  }, []);

  // Sync HUD cheaply from the flight ref.
  useEffect(() => {
    if (phase !== 'flying') return;
    const id = setInterval(() => setHudTick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [phase]);

  const stopAutopilot = useCallback(() => {
    autopilotRef.current.active = false;
    autopilotRef.current.wpIndex = 0;
    autopilotRef.current.dwellUntil = 0;
  }, []);

  // --- sector jump ---------------------------------------------------------
  const doJump = useCallback(
    (wormholeId) => {
      const from = flightRef.current.sector;
      const to = jumpThrough(from, wormholeId);
      if (!to) return;
      const swap = () => {
        flightRef.current.sector = to;
        setSectorKey(to);
        flightRef.current.pos = { ...SECTOR_SPAWN[to] };
        flightRef.current.yaw = Math.PI;
        flightRef.current.pitch = 0;
        flightRef.current.speed = 0;
        autopilotRef.current.wpIndex = 0;
        autopilotRef.current.dwellUntil = 0;
        snapCamRef.current = true; // bike loads right in front of the user
      };
      if (reduced) {
        // Reduced motion: instant fade cut.
        setFlash(true);
        swap();
        setTimeout(() => setFlash(false), 80);
      } else {
        setFlash(true);
        setTimeout(() => {
          swap();
          setTimeout(() => setFlash(false), 220);
        }, 200);
      }
    },
    [reduced]
  );

  // --- keyboard ------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'flying') return;
    const down = (e) => {
      const k = e.key.toLowerCase();
      // Game keys must not scroll the page.
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      stopAutopilot();
      keysRef.current.add(k);
      syncKeys();
    };
    const up = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
      syncKeys();
    };
    const syncKeys = () => {
      const ks = keysRef.current;
      const fwd = ks.has('w') || ks.has('arrowup');
      const back = ks.has('s') || ks.has('arrowdown');
      const left = ks.has('a') || ks.has('arrowleft');
      const right = ks.has('d') || ks.has('arrowright');
      inputRef.current.thrust = (fwd ? 1 : 0) + (back ? -1 : 0);
      // Screen-right is -X when the chase cam looks along +Z, and yaw+
      // swings the nose toward +X — so Right needs negative turn.
      inputRef.current.turn = (left ? 1 : 0) + (right ? -1 : 0);
      inputRef.current.pitch = (ks.has('r') ? 1 : 0) + (ks.has('f') ? -1 : 0);
      inputRef.current.boost = ks.has('shift');
      inputRef.current.brake = ks.has(' ');
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keysRef.current.clear();
      inputRef.current = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false };
    };
  }, [phase, stopAutopilot]);

  // --- launch / board / disembark ------------------------------------------
  const launch = useCallback(() => {
    flightRef.current = {
      sector: 'shallows',
      pos: { ...SECTOR_SPAWN.shallows },
      yaw: Math.PI,
      pitch: 0,
      speed: 0,
      boosting: false,
    };
    setSectorKey('shallows');
    snapCamRef.current = true; // bike loads right in front of the user
    setPhase('flying');
  }, []);

  const boardGift = useCallback(() => {
    stopAutopilot();
    const swap = () => setPhase('interior');
    if (reduced) {
      swap();
    } else {
      setFlash(true);
      setTimeout(() => {
        swap();
        setTimeout(() => setFlash(false), 350);
      }, 320);
    }
  }, [reduced, stopAutopilot]);

  const disembark = useCallback(() => {
    // Park the bike just outside the gift, facing deep space.
    flightRef.current.pos = { x: GIFT_POS.x, y: GIFT_POS.y, z: GIFT_POS.z + GIFT_BOARD_RADIUS + 8 };
    flightRef.current.yaw = 0;
    flightRef.current.pitch = 0;
    flightRef.current.speed = 0;
    snapCamRef.current = true; // bike loads right in front of the user
    const swap = () => setPhase('flying');
    if (reduced) {
      swap();
    } else {
      setFlash(true);
      setTimeout(() => {
        swap();
        setTimeout(() => setFlash(false), 350);
      }, 320);
    }
  }, [reduced]);

  // --- derived HUD ----------------------------------------------------------
  const f = flightRef.current;
  const tuning = tuningFor(bikeKey);
  const sector = sectorByKey(sectorKey);
  const giftDist = sectorKey === 'gift-drift' ? dist3(f.pos, GIFT_POS) : Infinity;
  const nearGift = phase === 'flying' && canBoard(giftDist);
  const speedLabel = speedWord(f.speed || 0, tuning.maxSpeed, !!f.boosting);
  const bike = bikeByKey(bikeKey);
  const autopilot = autopilotRef.current.active;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white select-none"
      role="application"
      aria-label="NOVA — Deep Space on tron bikes"
    >
      <Canvas
        className="absolute inset-0"
        camera={{ position: [14, 7, 20], fov: 55, near: 0.5, far: 4000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#020208']} />
        <CameraDirector phase={phase} reduced={reduced} />
        <NovaScene
          flightRef={flightRef}
          inputRef={inputRef}
          autopilotRef={autopilotRef}
          bikeKey={bikeKey}
          phase={phase}
          sectorKey={sectorKey}
          reduced={reduced}
          onWormhole={doJump}
        />
      </Canvas>

      {/* white flash for wormhole jumps / boarding */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-white pointer-events-none ${reduced ? '' : 'transition-opacity duration-200'}`}
        style={{ opacity: flash ? 1 : 0 }}
      />

      {/* header */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-cyan-400/80 max-w-[70vw]">
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-cyan-300/90">
            Deep Space
          </div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest mt-0.5">NOVA</h1>
          {phase !== 'garage' && (
            <div className="text-[11px] sm:text-xs text-neutral-300 mt-1 tracking-wider">
              {sector ? sector.name : ''} · {bike.name} ·{' '}
              <span className="text-cyan-300 font-bold">{speedLabel}</span>
              {autopilot && <span className="text-amber-300"> · autopilot</span>}
            </div>
          )}
        </div>
        {phase === 'flying' && (
          <button
            onClick={() => {
              if (autopilotRef.current.active) stopAutopilot();
              else {
                autopilotRef.current.active = true;
                autopilotRef.current.wpIndex = 0;
                autopilotRef.current.dwellUntil = 0;
              }
              setHudTick((n) => n + 1);
            }}
            aria-pressed={autopilot}
            className={`pointer-events-auto min-h-[44px] px-4 rounded-lg border text-xs font-bold tracking-widest uppercase transition-colors ${
              autopilot
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 bg-black/60 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {autopilot ? 'Stop tour' : 'Autopilot tour'}
          </button>
        )}
      </div>

      {/* garage */}
      {phase === 'garage' && (
        <div className="absolute bottom-0 left-0 right-0 md:left-6 md:right-auto md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:w-[24rem] pointer-events-auto">
          <div className="bg-zinc-950/90 border border-zinc-800 md:rounded-xl backdrop-blur-md p-4 max-h-[58vh] md:max-h-[82vh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80 mb-1">
              Tron bike garage
            </div>
            <p className="text-[11px] text-zinc-400 mb-3 tracking-wide">
              Three sectors, three wormholes, one very large gift. Pick your ride.
            </p>
            <div className="grid grid-cols-1 gap-1.5 mb-4" role="radiogroup" aria-label="Choose tron bike">
              {TRON_BIKES.map((b) => (
                <button
                  key={b.key}
                  role="radio"
                  aria-checked={bikeKey === b.key}
                  onClick={() => setBikeKey(b.key)}
                  className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    bikeKey === b.key
                      ? 'border-cyan-400/70 bg-cyan-400/10'
                      : 'border-zinc-800 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-bold tracking-wider">{b.name}</span>
                    <span className="block text-[11px] text-zinc-400">{b.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={launch}
              className="w-full min-h-[52px] rounded-xl bg-cyan-300 text-black text-base font-black tracking-[0.2em] uppercase hover:bg-cyan-200 transition-colors"
            >
              Launch — The Shallows
            </button>
            <p className="text-[10px] text-zinc-500 mt-2 tracking-wider">
              {touchUI
                ? 'Left thumb steers, right thumb pushes thrust.'
                : 'WASD / arrows fly · R/F pitch · Shift boost · Space brake.'}
            </p>
          </div>
        </div>
      )}

      {/* touch controls */}
      {phase === 'flying' && (
        <TouchControls inputRef={inputRef} autopilotRef={autopilotRef} visible={touchUI} />
      )}

      {/* board-the-gift button */}
      {nearGift && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={boardGift}
            className="pointer-events-auto min-h-[56px] px-8 rounded-2xl bg-amber-300 text-black text-base font-black tracking-[0.15em] uppercase shadow-[0_0_30px_rgba(252,211,77,0.45)] hover:bg-amber-200 transition-colors"
          >
            Board the Gift
          </button>
        </div>
      )}

      {/* gift interior plaque */}
      {phase === 'interior' && (
        <div className="absolute inset-0 flex items-end sm:items-center justify-center pointer-events-none p-4">
          <div className="pointer-events-auto w-full max-w-md bg-zinc-950/92 border border-amber-200/30 rounded-2xl backdrop-blur-md p-6 max-h-[62vh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="text-[10px] tracking-[0.35em] uppercase text-amber-200/80 mb-3">
              Inside the gift
            </div>
            <blockquote className="text-xl sm:text-2xl font-serif italic text-amber-100 leading-relaxed">
              “{PLAQUE_WORDS}”
            </blockquote>
            <div className="text-xs text-zinc-400 mt-2 tracking-widest uppercase">— Merlin</div>
            <p className="text-[11px] text-zinc-500 mt-4 leading-relaxed">
              A quiet room at the heart of deep space. Drag to look around the golden star.
            </p>
            <button
              onClick={disembark}
              className="mt-5 w-full min-h-[52px] rounded-xl bg-amber-300 text-black text-base font-black tracking-[0.2em] uppercase hover:bg-amber-200 transition-colors"
            >
              Disembark
            </button>
          </div>
        </div>
      )}

      {/* desktop hint */}
      {phase === 'flying' && !touchUI && (
        <div className="absolute bottom-0 left-0 right-0 hidden md:flex justify-center pointer-events-none pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">
            WASD / arrows · R/F pitch · Shift boost · Space brake · fly into a ring to jump
          </div>
        </div>
      )}

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom)] pointer-events-none" />
    </div>
  );
}
