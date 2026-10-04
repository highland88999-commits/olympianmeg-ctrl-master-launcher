// app/argo/page.jsx — ARGO: Fleet Command over the real Earth.
//
// A hybrid of omega-fleet (fleet command) and the launcher's photorealistic
// Earth (Google 3D Tiles). Pick a skycraft, pick a destination, launch it and
// watch it fly a great-circle route over the real planet. Follow-cam included.
//
// Honesty rules:
// - Layer badge always says what the globe is: "Photorealistic · Google"
//   when Google's tiles are live, "Stylized Earth — photorealistic tiles
//   unavailable" when they are not. Never a blank screen, never a fake label.
// - No telemetry, no phone-home, no network calls except Google's tile
//   session (minted server-side; the API key never reaches the browser).
// - Reduced motion: flights jump-cut to the destination, no auto-rotation,
//   static composition.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import StreetEarth from '@/components/argo/StreetEarth';
import StreetScene from '@/components/argo/StreetScene';
import { getLiquidGold } from '@/lib/argo-street';
import StylizedGlobe from '@/components/argo/StylizedGlobe';
import { FLEET, fleetByKey } from '@/components/argo/VehicleArchetypes';
import TronRider from '@/components/nova/TronRider';
import { fx } from '@/lib/fx';
import { HermesPanelTexture } from '@/components/hermes-ui/HermesUi';
import {
  FastForwardIcon, BikeIcon, WingIcon, StepsIcon, PlayIcon, PauseIcon,
  OrbitIcon, ArrowUpIcon, ArrowDownIcon, RocketIcon, EyeIcon, AnchorIcon,
} from '@/lib/hermes-icons';

// HERMES treatment: inline-flex icon+label wrapper for HUD buttons.
const HIcon = ({ children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>{children}</span>
);
import {
  DESTINATIONS,
  HOME_KEY,
  destinationByKey,
  hubUnit,
  angleBetween,
  easeInOut,
  flightDuration,
  flightPosition,
  parkedPosition,
  latLonToHub,
} from '@/lib/argo-flight';

const TITLE = 'ARGO — Fleet Command';
const VEHICLE_SCALE = 2.2;

// Deep-link: /argo?lat=53.55&lon=-113.49&mode=walk&label=Edmonton drops
// straight into the street world at those coordinates (used by the hub
// Earth's "street level" button). Client-only read: safe under SSR.
function readDeepLink() {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const lat = Number(q.get('lat'));
    const lon = Number(q.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const mode = q.get('mode');
    return {
      lat,
      lon,
      label: (q.get('label') || '').slice(0, 60) || 'Dropped pin',
      mode: mode === 'walk' || mode === 'fly' || mode === 'ride' ? mode : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3D pieces (inside the Canvas)
// ---------------------------------------------------------------------------

function RouteArc({ fromKey, toKey, visible }) {
  const points = useMemo(() => {
    if (!fromKey || !toKey) return [];
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const p = flightPosition(fromKey, toKey, i / 64);
      if (p) pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return pts;
  }, [fromKey, toKey]);
  if (!visible || points.length < 2) return null;
  return <Line points={points} color="#00f2ff" lineWidth={1} transparent opacity={0.45} />;
}

function SurfaceMarker({ destKey, color }) {
  const dest = destinationByKey(destKey);
  const pos = useMemo(() => {
    if (!dest) return null;
    return latLonToHub(dest.lat, dest.lon, 60000);
  }, [dest]);
  if (!pos) return null;
  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <sphereGeometry args={[0.9, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

// Drives the vehicle: great-circle slerp flight, parked hover, follow-cam.
// Click/tap the parked vehicle to mount — same action as the Launch button.
function FlightRig({
  flightRef,
  atKey,
  faceKey,
  followCam,
  reduced,
  snapCamRef,
  onArrived,
  onProgress,
  phase,
  onMount,
}) {
  const group = useRef(null);
  const { camera } = useThree();
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      pos: new THREE.Vector3(),
      up: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      pa: new THREE.Vector3(),
      pb: new THREE.Vector3(),
      zero: new THREE.Vector3(0, 0, 0),
      look: new THREE.Vector3(),
      camGoal: new THREE.Vector3(),
    }),
    []
  );
  const lastHud = useRef(0);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const s = scratch;
    const f = flightRef.current;
    const now = performance.now() / 1000;

    let pos3, vel3;
    if (f.phase === 'flying' && !f.done) {
      const raw = Math.min(1, (now - f.start) / f.duration);
      const t = easeInOut(raw);
      const p = flightPosition(f.fromKey, f.toKey, t);
      const eps = 0.004;
      const pa = flightPosition(f.fromKey, f.toKey, Math.min(1, t + eps));
      const pb = flightPosition(f.fromKey, f.toKey, Math.max(0, t - eps));
      pos3 = s.pos.set(p.x, p.y, p.z);
      vel3 = s.vel.set(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
      if (vel3.lengthSq() < 1e-8) vel3.set(p.x, p.y, p.z);
      vel3.normalize();
      if (now - lastHud.current > 0.25) {
        lastHud.current = now;
        onProgress(raw);
      }
      if (raw >= 1) {
        f.done = true;
        f.phase = 'arrived';
        onProgress(1);
        onArrived(f.toKey);
      }
    } else {
      // Parked: hover above the current dock with a gentle bob (still air
      // when reduced motion is on).
      const p = parkedPosition(atKey);
      pos3 = s.pos.set(p.x, p.y, p.z);
      s.up.set(p.x, p.y, p.z).normalize();
      if (!reduced) {
        const bob = Math.sin(now * 1.3) * 0.5;
        pos3.addScaledVector(s.up, bob);
      }
      const ahead = flightPosition(atKey, faceKey, 0.02);
      vel3 = s.vel.set(ahead.x - p.x, ahead.y - p.y, ahead.z - p.z);
      if (vel3.lengthSq() < 1e-8) vel3.set(-p.z, 0, p.x);
      vel3.normalize();
    }

    s.up.copy(pos3).normalize();
    // Nose (+Z) along velocity, belly toward Earth: Matrix4.lookAt puts +Z
    // on the eye->target axis, so eye = velocity dir, target = origin.
    s.m.lookAt(vel3, s.zero, s.up);
    g.position.copy(pos3);
    g.quaternion.setFromRotationMatrix(s.m);

    if (followCam && !reduced && f.phase !== 'docked-idle') {
      s.camGoal.copy(pos3).addScaledVector(vel3, -17).addScaledVector(s.up, 7.5);
      if (snapCamRef && snapCamRef.current) {
        // Bike/vehicle loads right in front of the user on launch.
        camera.position.copy(s.camGoal);
        snapCamRef.current = false;
      } else {
        const step = Math.min(1, Math.max(0, (dt || 0.016) * 2.2));
        camera.position.lerp(s.camGoal, step);
      }
      s.look.copy(pos3).addScaledVector(vel3, 14);
      camera.lookAt(s.look);
    }
  });

  const vehicleKey = flightRef.current.vehicleKey || 'skiff';
  const Vehicle = fleetByKey(vehicleKey).Cmp;
  // Only the two tron bike ports get a mounted rider; the fleet skycraft
  // have no open cockpits.
  const isTronBike = vehicleKey === 'wisp' || vehicleKey === 'comet';
  // The vehicle is clickable only while parked (dock/arrived) — never mid-flight.
  const parked = phase === 'dock' || phase === 'arrived';
  const handleVehicleClick = (e) => {
    if (e.delta > 10) return; // orbit-drag, not a tap
    if (parked && onMount) onMount();
  };
  const showPointer = (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const hidePointer = () => {
    document.body.style.cursor = '';
  };
  return (
    <group ref={group} scale={VEHICLE_SCALE}>
      <group
        onClick={parked ? handleVehicleClick : undefined}
        onPointerOver={parked ? showPointer : undefined}
        onPointerOut={parked ? hidePointer : undefined}
      >
        {/* generous invisible touch target around the vehicle */}
        {parked && (
          <mesh>
            <sphereGeometry args={[3.2, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <Vehicle color={fleetByKey(vehicleKey).color} />
        {isTronBike && <TronRider bikeKey={vehicleKey} reduced={reduced} />}
      </group>
    </group>
  );
}

function ArgoScene({
  flightRef,
  atKey,
  faceKey,
  phase,
  routeFrom,
  routeTo,
  showRoute,
  followCam,
  reduced,
  layer,
  snapCamRef,
  onTilesActive,
  onTilesInactive,
  onTilesRenderer,
  onArrived,
  onProgress,
  onMount,
  streetActive,
  streetLat,
  streetLon,
  streetSceneProps,
}) {
  return (
    <>
      <ambientLight intensity={streetActive ? 0.4 : 0.5} />
      {!streetActive && <directionalLight position={[90, 45, 70]} intensity={1.6} />}
      {/* Photorealistic tiles when Google delivers; honest stylized globe otherwise.
          The stylized globe sits at 54.85 (inside the 55-unit tile globe) so the
          two never z-fight during handoff. In street mode the SAME tileset is
          re-rooted to a local meter frame (x = east, y = up, z = south). */}
      <StreetEarth
        mode={streetActive ? 'street' : 'globe'}
        lat={streetLat}
        lon={streetLon}
        onActive={onTilesActive}
        onInactive={onTilesInactive}
        onRenderer={onTilesRenderer}
      />
      {!streetActive && (
        <>
          {layer !== 'photorealistic' && <StylizedGlobe />}
          <RouteArc fromKey={routeFrom} toKey={routeTo} visible={showRoute} />
          <SurfaceMarker destKey={atKey} color="#34d399" />
          {routeTo && routeTo !== atKey && <SurfaceMarker destKey={routeTo} color="#00f2ff" />}
          <FlightRig
            flightRef={flightRef}
            atKey={atKey}
            faceKey={faceKey}
            followCam={followCam && phase !== 'dock'}
            reduced={reduced}
            snapCamRef={snapCamRef}
            onArrived={onArrived}
            onProgress={onProgress}
            phase={phase}
            onMount={onMount}
          />
          {!(followCam && phase !== 'dock') && (
            <OrbitControls
              enablePan={false}
              minDistance={70}
              maxDistance={320}
              enableDamping={false}
            />
          )}
        </>
      )}
      {streetActive && streetSceneProps && <StreetScene {...streetSceneProps} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Street-level: descent rig, HUD, joystick
// ---------------------------------------------------------------------------

const DESCENT_MS = 14000;

// Cinematic orbit-to-street dive. Skippable via the haze overlay; reduced
// motion jumps straight to the street (handled by the caller).
function DescentRig({ lat, lon, onDone }) {
  const { camera } = useThree();
  const start = useRef(null);
  const t0 = useRef(0);
  const done = useRef(false);
  const target = useMemo(() => {
    const p = latLonToHub(lat, lon, 2600);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, [lat, lon]);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const cb = useRef(onDone);
  cb.current = onDone;

  useFrame(() => {
    if (done.current) return;
    if (!start.current) {
      start.current = { pos: camera.position.clone() };
      t0.current = performance.now();
    }
    const t = Math.min(1, (performance.now() - t0.current) / DESCENT_MS);
    // Dive profile: slow majestic start, accelerating plunge, soft settle.
    const eased = t < 0.45 ? 2.2 * t * t : 1 - Math.pow(-2 * t + 2, 2.4) / 2.4;
    const dive = Math.pow(eased, 2.6);
    goal.copy(start.current.pos).lerp(target, dive);
    // Gentle barrel roll on the way down — cinema, not nausea.
    const roll = Math.sin(t * Math.PI) * 0.35;
    camera.position.copy(goal);
    look.set(0, 0, 0);
    camera.lookAt(look);
    camera.rotateZ(roll);
    if (t >= 1) {
      done.current = true;
      cb.current();
    }
  });
  return null;
}

const hudBtn = {
  padding: '10px 14px',
  borderRadius: 12,
  background: 'rgba(5,8,16,0.55)',
  border: '1px solid rgba(255,255,255,0.25)',
  backdropFilter: 'blur(8px)',
  color: '#f5f2ea',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.1em',
  cursor: 'pointer',
};

function DescentHaze({ onSkip }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 100), 100);
    return () => clearInterval(id);
  }, []);
  const p = Math.min(1, t / DESCENT_MS);
  const haze = Math.sin(p * Math.PI); // peaks mid-dive
  return (
    <>
      <img
        src="/images/argo/bg.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ position: 'absolute', inset: 0, zIndex: 29, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55, pointerEvents: 'none' }}
      />
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, rgba(140,190,255,${0.25 + haze * 0.55}) 0%, rgba(255,240,200,${haze * 0.35}) 55%, rgba(10,20,40,${haze * 0.5}) 100%)`,
        }}
      />
      <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 31, textAlign: 'center' }}>
        <div style={{ color: '#ffd700', letterSpacing: '0.3em', fontSize: 13, marginBottom: 10 }}>
          ENTERING ATMOSPHERE
        </div>
        <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto' }}>
          <div style={{ width: `${p * 100}%`, height: '100%', background: '#ffd700', borderRadius: 2 }} />
        </div>
        <button onClick={onSkip} style={{ ...hudBtn, marginTop: 16 }}>
          <HIcon><FastForwardIcon size={13} />SKIP DESCENT</HIcon>
        </button>
      </div>
    </>
  );
}

function Joystick({ controlsRef, disabled }) {
  const pad = useRef(null);
  const knob = useRef(null);
  const active = useRef(false);

  const setKnob = (dx, dy) => {
    if (knob.current) knob.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  };

  const handle = (e) => {
    if (disabled || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    controlsRef.current.strafe = dx;
    controlsRef.current.thrust = -dy;
    setKnob(dx, dy);
  };

  const release = () => {
    active.current = false;
    controlsRef.current.strafe = 0;
    controlsRef.current.thrust = 0;
    setKnob(0, 0);
  };

  return (
    <div
      ref={pad}
      onPointerDown={(e) => {
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => active.current && handle(e)}
      onPointerUp={release}
      onPointerCancel={release}
      style={{
        width: 128,
        height: 128,
        borderRadius: '50%',
        border: '1px solid rgba(255,215,0,0.35)',
        background: 'rgba(5,8,16,0.45)',
        backdropFilter: 'blur(6px)',
        position: 'relative',
        touchAction: 'none',
        opacity: disabled ? 0.4 : 1,
      }}
      aria-label="Drive joystick"
    >
      <div
        ref={knob}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #ffe9a8, #c9a227)',
          position: 'absolute',
          left: 38,
          top: 38,
          boxShadow: '0 0 18px rgba(255,215,0,0.5)',
        }}
      />
    </div>
  );
}

function StreetHud({
  destName,
  gold,
  sessionFinds,
  mode,
  onMode,
  autopilot,
  onAutopilot,
  reduced,
  controlsRef,
  onExit,
}) {
  return (
    <>
      <div
        style={{
          position: 'absolute', top: 14, left: 14, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div
          style={{
            padding: '8px 14px', borderRadius: 12,
            background: 'rgba(5,8,16,0.55)', border: '1px solid rgba(255,215,0,0.3)',
            backdropFilter: 'blur(8px)', color: '#f5f2ea', fontSize: 13, letterSpacing: '0.14em',
          }}
        >
          {destName.toUpperCase()}
        </div>
        <div
          style={{
            padding: '8px 14px', borderRadius: 12,
            background: 'rgba(5,8,16,0.55)', border: '1px solid rgba(255,215,0,0.3)',
            backdropFilter: 'blur(8px)', color: '#ffd700', fontSize: 14, fontWeight: 700,
          }}
          title="Liquid gold — 1,000 per bar"
        >
          ◆ {gold.toLocaleString()}
          {sessionFinds > 0 && (
            <span style={{ color: '#f5f2ea', fontWeight: 400, fontSize: 12 }}>
              {' '}· +{sessionFinds} bar{sessionFinds === 1 ? '' : 's'} this visit
            </span>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={onMode} style={hudBtn} aria-label="Switch drive mode">
          {mode === 'ride' ? (<HIcon><BikeIcon size={14} />RIDE</HIcon>) : mode === 'fly' ? (<HIcon><WingIcon size={14} />FLY</HIcon>) : (<HIcon><StepsIcon size={14} />WALK</HIcon>)}
        </button>
        {!reduced && (
          <button
            onClick={onAutopilot}
            style={{ ...hudBtn, borderColor: autopilot ? '#ffd700' : 'rgba(255,255,255,0.25)', color: autopilot ? '#ffd700' : '#f5f2ea' }}
            aria-label="Toggle autopilot tour"
          >
            {autopilot ? (<HIcon><PauseIcon size={11} />TOUR</HIcon>) : (<HIcon><PlayIcon size={11} />TOUR</HIcon>)}
          </button>
        )}
        <button onClick={onExit} style={hudBtn} aria-label="Back to orbit">
          <HIcon><OrbitIcon size={13} />ORBIT</HIcon>
        </button>
      </div>

      <div style={{ position: 'absolute', left: 18, bottom: 96, zIndex: 10 }}>
        <Joystick controlsRef={controlsRef} disabled={autopilot} />
      </div>

      {mode === 'fly' && (
        <div style={{ position: 'absolute', right: 18, bottom: 96, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 10 }}>
          {[
            { label: '▲', v: 1, Icon: ArrowUpIcon },
            { label: '▼', v: -1, Icon: ArrowDownIcon },
          ].map((b) => (
            <button
              key={b.label}
              onPointerDown={() => { controlsRef.current.vertical = b.v; }}
              onPointerUp={() => { controlsRef.current.vertical = 0; }}
              onPointerLeave={() => { controlsRef.current.vertical = 0; }}
              style={{ ...hudBtn, width: 56, height: 56, fontSize: 20, borderRadius: '50%' }}
              aria-label={b.v > 0 ? 'Ascend' : 'Descend'}
            >
              <b.Icon size={18} />
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(245,242,234,0.55)', fontSize: 12, letterSpacing: '0.08em',
          zIndex: 10, textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}
      >
        WASD / arrows to move · drag right side to look · ride the gold ring portals to travel
      </div>
    </>
  );
}

function TilesFailedPanel({ onBack }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 40, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(1,2,4,0.85)', padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ color: '#ffd700', fontSize: 20, letterSpacing: '0.2em', marginBottom: 12 }}>
          STREET VIEW UNAVAILABLE
        </div>
        <div style={{ color: 'rgba(245,242,234,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          The photorealistic street tiles couldn't be reached right now — check
          your connection and try again. Nothing was faked in their place.
        </div>
        <button onClick={onBack} style={hudBtn}><HIcon><OrbitIcon size={13} />BACK TO ORBIT</HIcon></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArgoPage() {
  const [reduced, setReduced] = useState(false);
  const [layer, setLayer] = useState('loading'); // loading | photorealistic | stylized
  const [vehicleKey, setVehicleKey] = useState('skiff');
  const [atKey, setAtKey] = useState(HOME_KEY); // where the vehicle is parked
  const [targetKey, setTargetKey] = useState('paris'); // selected destination
  const [phase, setPhase] = useState('dock'); // dock | flying | arrived | descent | street
  const [followCam, setFollowCam] = useState(true);
  const [progress, setProgress] = useState(0);
  // Street-level state.
  const [tilesRenderer, setTilesRenderer] = useState(null);
  const [streetMode, setStreetMode] = useState('ride'); // ride | fly | walk
  const [autopilot, setAutopilot] = useState(false);
  const [gold, setGold] = useState(0);
  const [sessionFinds, setSessionFinds] = useState(0);
  const controlsRef = useRef({ thrust: 0, strafe: 0, vertical: 0, lookDX: 0, lookDY: 0 });
  const lookDrag = useRef(null);
  // Snap the follow camera on launch so the vehicle loads right in front.
  const snapCamRef = useRef(false);

  const flightRef = useRef({
    phase: 'docked-idle',
    vehicleKey: 'skiff',
    fromKey: HOME_KEY,
    toKey: null,
    start: 0,
    duration: 0,
    done: true,
  });
  flightRef.current.vehicleKey = vehicleKey;

  useEffect(() => {
    document.title = TITLE;
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(!!(mq && mq.matches));
    } catch {
      /* motion stays on */
    }
  }, []);

  const startFlight = useCallback(
    (toKey) => {
      if (toKey === atKey) return;
      // Mounting a tron bike plays the mount FX pair (engine-up sweep + haptics).
      const vk = flightRef.current.vehicleKey;
      if (vk === 'wisp' || vk === 'comet') fx.bikeMount();
      if (reduced) {
        // Reduced motion: jump-cut, no animation, static composition.
        flightRef.current = {
          phase: 'arrived',
          vehicleKey: flightRef.current.vehicleKey,
          fromKey: atKey,
          toKey,
          start: 0,
          duration: 0,
          done: true,
        };
        setAtKey(toKey);
        setPhase('arrived');
        setProgress(1);
        return;
      }
      const ang = angleBetween(hubUnitOf(atKey), hubUnitOf(toKey));
      flightRef.current = {
        phase: 'flying',
        vehicleKey: flightRef.current.vehicleKey,
        fromKey: atKey,
        toKey,
        start: performance.now() / 1000,
        duration: flightDuration(ang),
        done: false,
      };
      setProgress(0);
      snapCamRef.current = true; // vehicle loads right in front of the user
      setPhase('flying');
    },
    [atKey, reduced]
  );

  const handleArrived = useCallback((toKey) => {
    setAtKey(toKey);
    setPhase('arrived');
  }, []);

  const handleProgress = useCallback((p) => setProgress(p), []);

  const recall = useCallback(() => {
    startFlight(HOME_KEY);
  }, [startFlight]);

  // --- street-level -------------------------------------------------------
  const streetActive = phase === 'street';
  const at = destinationByKey(atKey);
  const bikeKeyForStreet = vehicleKey === 'comet' ? 'comet' : 'wisp';

  useEffect(() => {
    if (phase === 'street') setGold(getLiquidGold());
  }, [phase ]);

  // M cycles street drive mode.
  useEffect(() => {
    if (phase !== 'street') return;
    const h = (e) => {
      if (e.code === 'KeyM') {
        setStreetMode((m) => (m === 'ride' ? 'fly' : m === 'fly' ? 'walk' : 'ride'));
        try { fx.menuMove(); } catch { /* audio unavailable */ }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase]);

  const beginDescent = useCallback(() => {
    try { fx.satelliteDrop(); } catch { /* audio unavailable */ }
    if (reduced) {
      setPhase('street'); // reduced motion: no cinematic dive
    } else {
      setPhase('descent');
    }
  }, [reduced]);

  const exitStreet = useCallback(() => {
    try { fx.menuBack(); } catch { /* audio unavailable */ }
    setAutopilot(false);
    setSessionFinds(0);
    controlsRef.current = { thrust: 0, strafe: 0, vertical: 0, lookDX: 0, lookDY: 0 };
    setPhase('dock');
  }, []);

  const streetSceneProps = streetActive
    ? {
        destKey: atKey,
        bikeKey: bikeKeyForStreet,
        tilesRenderer,
        reduced,
        controlsRef,
        mode: streetMode,
        autopilot,
        onAutopilotEnd: () => setAutopilot(false),
        onGold: (total, finds) => {
          setGold(total);
          setSessionFinds(finds);
        },
      }
    : null;

  const target = destinationByKey(targetKey);
  const faceKey =
    phase === 'arrived' ? HOME_KEY : targetKey !== atKey ? targetKey : 'paris';
  const routeFrom = phase === 'flying' ? flightRef.current.fromKey : atKey;
  const routeTo = phase === 'flying' ? flightRef.current.toKey : targetKey;
  const showRoute = phase === 'flying' || (phase === 'dock' && targetKey !== atKey);

  const layerLabel =
    layer === 'photorealistic'
      ? 'Photorealistic · Google'
      : layer === 'stylized'
        ? 'Stylized Earth — photorealistic tiles unavailable'
        : 'Contacting Google tiles…';

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white select-none"
      role="application"
      aria-label="ARGO — Fleet Command over the real Earth"
    >
      <Canvas
        className="absolute inset-0"
        camera={{ position: [0, 62, 148], fov: 45, near: 0.5, far: 3000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[streetActive ? '#87aed6' : '#010204']} />
        <ArgoScene
          flightRef={flightRef}
          atKey={atKey}
          faceKey={faceKey}
          phase={phase}
          routeFrom={routeFrom}
          routeTo={routeTo}
          showRoute={showRoute}
          followCam={followCam}
          reduced={reduced}
          layer={layer}
          snapCamRef={snapCamRef}
          onTilesActive={() => setLayer('photorealistic')}
          onTilesInactive={() => setLayer('stylized')}
          onTilesRenderer={setTilesRenderer}
          onArrived={handleArrived}
          onProgress={handleProgress}
          onMount={() => startFlight(targetKey)}
          streetActive={streetActive}
          streetLat={at ? at.lat : 0}
          streetLon={at ? at.lon : 0}
          streetSceneProps={streetSceneProps}
        />
        {phase === 'descent' && at && (
          <DescentRig lat={at.lat} lon={at.lon} onDone={() => setPhase('street')} />
        )}
      </Canvas>

      {/* Descent haze + skip */}
      {phase === 'descent' && <DescentHaze onSkip={() => setPhase('street')} />}

      {/* Street HUD */}
      {streetActive && layer === 'photorealistic' && at && (
        <StreetHud
          destName={at.name}
          gold={gold}
          sessionFinds={sessionFinds}
          mode={streetMode}
          onMode={() => {
            setStreetMode((m) => (m === 'ride' ? 'fly' : m === 'fly' ? 'walk' : 'ride'));
            try { fx.menuMove(); } catch { /* audio unavailable */ }
          }}
          autopilot={autopilot}
          onAutopilot={() => {
            setAutopilot((a) => !a);
            try { fx.menuMove(); } catch { /* audio unavailable */ }
          }}
          reduced={reduced}
          controlsRef={controlsRef}
          onExit={exitStreet}
        />
      )}

      {/* Right-side drag-to-look (street, touch + mouse) */}
      {streetActive && (
        <div
          onPointerDown={(e) => {
            lookDrag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = lookDrag.current;
            if (!d || d.id !== e.pointerId) return;
            controlsRef.current.lookDX = Math.max(-40, Math.min(40, controlsRef.current.lookDX + (e.clientX - d.x) * 0.4));
            controlsRef.current.lookDY = Math.max(-24, Math.min(24, controlsRef.current.lookDY + (e.clientY - d.y) * 0.4));
            d.x = e.clientX;
            d.y = e.clientY;
          }}
          onPointerUp={() => {
            lookDrag.current = null;
          }}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '42%', zIndex: 5, touchAction: 'none',
          }}
          aria-hidden
        />
      )}

      {/* Street fallback: tiles failed */}
      {streetActive && layer === 'stylized' && <TilesFailedPanel onBack={exitStreet} />}

      {/* Header — hidden at street level (the street HUD takes over) */}
      {!streetActive && (
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none">
        <div className="relative overflow-hidden bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-amber-400/80 max-w-[78vw]">
          <HermesPanelTexture opacity={0.12} />
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-amber-300/90">
            Fleet Command
          </div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest mt-0.5">ARGO</h1>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-1 tracking-wider">
            {layerLabel}
          </div>
          {phase !== 'dock' && (
            <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
              {phase === 'flying' ? (
                <>
                  EN ROUTE — <span className="text-cyan-300 font-bold">{Math.round(progress * 100)}%</span>
                </>
              ) : (
                <>
                  ON STATION —{' '}
                  <span className="text-emerald-300 font-bold">{at ? at.name : ''}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Staging dock */}
      {phase === 'dock' && (
        <div className="absolute bottom-0 left-0 right-0 md:left-6 md:right-auto md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:w-[24rem] pointer-events-auto">
          <div className="relative bg-zinc-950/90 border border-zinc-800 md:rounded-xl backdrop-blur-md p-4 max-h-[58vh] md:max-h-[82vh] overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
            <HermesPanelTexture opacity={0.06} />
            <div className="text-[10px] tracking-[0.3em] uppercase text-amber-300/80 mb-2">
              Staging dock — {at ? at.name : ''}
            </div>

            <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">Skycraft</div>
            <div className="grid grid-cols-1 gap-1.5 mb-3" role="radiogroup" aria-label="Choose skycraft">
              {FLEET.map((v) => (
                <button
                  key={v.key}
                  role="radio"
                  aria-checked={vehicleKey === v.key}
                  onClick={() => setVehicleKey(v.key)}
                  className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    vehicleKey === v.key
                      ? 'border-amber-400/70 bg-amber-400/10'
                      : 'border-zinc-800 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: v.color }}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-sm font-bold tracking-wider">{v.name}</span>
                    <span className="block text-[11px] text-zinc-400">{v.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">Destination</div>
            <div className="grid grid-cols-2 gap-1.5 mb-4" role="radiogroup" aria-label="Choose destination">
              {DESTINATIONS.filter((d) => d.key !== atKey).map((d) => (
                <button
                  key={d.key}
                  role="radio"
                  aria-checked={targetKey === d.key}
                  onClick={() => setTargetKey(d.key)}
                  className={`min-h-[44px] px-3 py-2 rounded-lg border text-left transition-colors ${
                    targetKey === d.key
                      ? 'border-cyan-400/70 bg-cyan-400/10'
                      : 'border-zinc-800 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="block text-sm font-bold">{d.name}</span>
                  <span className="block text-[10px] text-zinc-500">{d.note}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => startFlight(targetKey)}
              disabled={!target || targetKey === atKey}
              className="w-full min-h-[52px] rounded-xl bg-amber-400 text-black text-base font-black tracking-[0.2em] uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-300 transition-colors"
            >
              <HIcon><RocketIcon size={16} />Launch — {target ? target.name : ''}</HIcon>
            </button>
            {reduced && (
              <p className="text-[10px] text-zinc-500 mt-2 tracking-wider">
                Reduced motion on — flights jump straight to the destination.
              </p>
            )}
          </div>
        </div>
      )}

      {/* In-flight / on-station bar */}
      {(phase === 'flying' || phase === 'arrived') && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none px-4">
          <div className="relative pointer-events-auto bg-zinc-950/90 border border-zinc-800 rounded-t-xl md:rounded-xl backdrop-blur-md px-4 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] w-full max-w-xl">
            <HermesPanelTexture opacity={0.06} />
            {phase === 'flying' && (
              <div
                className="h-1.5 bg-white/10 rounded overflow-hidden mb-3"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Flight progress"
              >
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-amber-300 rounded"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-zinc-800" role="group" aria-label="Camera">
                <button
                  onClick={() => setFollowCam(true)}
                  aria-pressed={followCam}
                  className={`min-h-[44px] px-4 text-xs font-bold tracking-widest uppercase ${
                    followCam ? 'bg-cyan-400/20 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  <HIcon><EyeIcon size={13} />Follow</HIcon>
                </button>
                <button
                  onClick={() => setFollowCam(false)}
                  aria-pressed={!followCam}
                  className={`min-h-[44px] px-4 text-xs font-bold tracking-widest uppercase ${
                    !followCam ? 'bg-cyan-400/20 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  <HIcon><EyeIcon size={13} />Free</HIcon>
                </button>
              </div>
              {atKey !== HOME_KEY && (
                <button
                  onClick={recall}
                  disabled={phase === 'flying'}
                  className="min-h-[44px] px-4 rounded-lg border border-amber-400/50 text-amber-300 text-xs font-bold tracking-widest uppercase disabled:opacity-40 hover:bg-amber-400/10 transition-colors"
                >
                  <HIcon><AnchorIcon size={13} />Recall to Edmonton</HIcon>
                </button>
              )}
              {phase === 'arrived' && layer === 'photorealistic' && (
                <button
                  onClick={beginDescent}
                  className="min-h-[44px] px-4 rounded-lg bg-amber-400 text-black text-xs font-black tracking-widest uppercase hover:bg-amber-300 transition-colors"
                >
                  <HIcon><ArrowDownIcon size={13} />Street level</HIcon>
                </button>
              )}
              <button
                onClick={() => setPhase('dock')}
                disabled={phase === 'flying'}
                className="min-h-[44px] px-4 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-bold tracking-widest uppercase disabled:opacity-40 hover:bg-white/5 transition-colors ml-auto"
              >
                <HIcon><AnchorIcon size={13} />Dock</HIcon>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom clearance so content always clears Safari's browser bar */}
      <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom)] pointer-events-none" />
    </div>
  );
}

function hubUnitOf(key) {
  const d = destinationByKey(key);
  if (!d) return { x: 1, y: 0, z: 0 };
  return hubUnit(d.lat, d.lon);
}
