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
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import StylizedGlobe from '@/components/argo/StylizedGlobe';
import { FLEET, fleetByKey } from '@/components/argo/VehicleArchetypes';
import TronRider from '@/components/nova/TronRider';
import { fx } from '@/lib/fx';
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
  return <Line points={points} color="#22d3ee" lineWidth={1} transparent opacity={0.45} />;
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
  onArrived,
  onProgress,
  onMount,
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[90, 45, 70]} intensity={1.6} />
      {/* Photorealistic tiles when Google delivers; honest stylized globe otherwise.
          The stylized globe sits at 54.85 (inside the 55-unit tile globe) so the
          two never z-fight during handoff. */}
      <GoogleEarthTiles onActive={onTilesActive} onInactive={onTilesInactive} />
      {layer !== 'photorealistic' && <StylizedGlobe />}
      <RouteArc fromKey={routeFrom} toKey={routeTo} visible={showRoute} />
      <SurfaceMarker destKey={atKey} color="#34d399" />
      {routeTo && routeTo !== atKey && <SurfaceMarker destKey={routeTo} color="#22d3ee" />}
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
  const [phase, setPhase] = useState('dock'); // dock | flying | arrived
  const [followCam, setFollowCam] = useState(true);
  const [progress, setProgress] = useState(0);
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

  const at = destinationByKey(atKey);
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
        <color attach="background" args={['#010204']} />
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
          onArrived={handleArrived}
          onProgress={handleProgress}
          onMount={() => startFlight(targetKey)}
        />
      </Canvas>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-amber-400/80 max-w-[78vw]">
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

      {/* Staging dock */}
      {phase === 'dock' && (
        <div className="absolute bottom-0 left-0 right-0 md:left-6 md:right-auto md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:w-[24rem] pointer-events-auto">
          <div className="bg-zinc-950/90 border border-zinc-800 md:rounded-xl backdrop-blur-md p-4 max-h-[58vh] md:max-h-[82vh] overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
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
              Launch — {target ? target.name : ''}
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
      {phase !== 'dock' && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto bg-zinc-950/90 border border-zinc-800 rounded-t-xl md:rounded-xl backdrop-blur-md px-4 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] w-full max-w-xl">
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
                  Follow
                </button>
                <button
                  onClick={() => setFollowCam(false)}
                  aria-pressed={!followCam}
                  className={`min-h-[44px] px-4 text-xs font-bold tracking-widest uppercase ${
                    !followCam ? 'bg-cyan-400/20 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  Free
                </button>
              </div>
              {atKey !== HOME_KEY && (
                <button
                  onClick={recall}
                  disabled={phase === 'flying'}
                  className="min-h-[44px] px-4 rounded-lg border border-amber-400/50 text-amber-300 text-xs font-bold tracking-widest uppercase disabled:opacity-40 hover:bg-amber-400/10 transition-colors"
                >
                  Recall to Edmonton
                </button>
              )}
              <button
                onClick={() => setPhase('dock')}
                disabled={phase === 'flying'}
                className="min-h-[44px] px-4 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-bold tracking-widest uppercase disabled:opacity-40 hover:bg-white/5 transition-colors ml-auto"
              >
                Dock
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
