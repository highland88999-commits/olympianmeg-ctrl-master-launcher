'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { tuningFor, stepFlight } from '@/lib/nova-flight';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { carState } from '@/lib/earth/parachute';
import { getCarModel, subscribeCarModel, ensureCarModel } from '@/lib/earth/car-model';
import { moveWithCollision } from '@/lib/earth/collision';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { effectiveEarthViewMode } from '@/lib/earth/view-mode';

// EarthSupercar — the summonable Lamborghini Aventador for hub
// Earth street view (Earth 1 expansion, 2026-10-26): Earth's
// fastest vehicle for rapid exploration.
//
// Pick: Merlin named the Lambo, the Aston Martin and the
// Maserati and left the choice open. The staged GTA fleet
// (~/workspace/gta-assets/raw) holds no Aston Martin and no
// Maserati — but its wedge-supercar.glb is byte-identical
// (md5 03787337417f7891bdf5074e6a5b4ba7) to Merlin's own
// "lamborghini aventador 3d model.glb" upload, so the Lambo IS
// in the fleet. It is copied into the repo at
// public/models/vehicles/wedge-supercar.glb and loaded here —
// OPTIMIZED 2026-10-26 (outage repair): the staged upload was
// 23.6 MB / 1.95M triangles with an 8192×8192 texture, and its
// main-thread decode killed the page on phones. The shipped file
// is ~1.7 MB / ~234k triangles / WebP-1024, same bounding size,
// and it loads LAZILY on summon only (lib/earth/car-model.js),
// never at street entry. No car was invented: if that file were
// missing, this component would simply render nothing.
//
// Drive pattern: the EarthBike pattern exactly — a shared
// singleton (carState, separate from bikeState so the two rides
// never fight), summon + auto-mount, great-circle stepping over
// the real heightmap, solid collision, and roamState sync so the
// street camera follows. Differences from the bike, all
// deliberate: supercar tuning (90 × 2.0 boost — faster than the
// Wisp bike's 60 × 1.8, so this is the fastest ride on Earth by
// the numbers), ground-hugging (no rise/sink — a car stays on
// the ground), and its own keys (V summon/dismiss, F mount /
// dismount) so it never collides with the bike's B / E.
//
// Dismount law (Merlin, 2026-10-26): exiting the car VANISHES it
// and the walker takes its place — same law as the bike. The
// character is hidden while driving (EarthWalker) and reappears
// exactly where the car was.
//
// Model orientation note: the GLB's nose direction is not
// encoded anywhere, so the longest horizontal axis is aligned
// to the heading and the nose is assumed to face +Z after that
// alignment. A 10-second device eyeball is still owed: if the
// car drives nose-backward, the fix is a half-turn on the inner
// rotation below, nothing structural.

const UPM = DISPLAY_UNITS_PER_METRE;
const CAR_RADIUS_M = 2.2;

// Inverse of latLonToVec3 (same helper as EarthBike).
function vec3ToLatLon(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  let theta = Math.atan2(z, -x);
  let lon = (theta * 180) / Math.PI - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

export function summonCar() {
  if (!roamState.active) return false;
  carState.summoned = true;
  carState.mounted = true; // auto-mount: spawn driving
  carState.lat = roamState.lat;
  carState.lon = roamState.lon;
  carState.altM = 0.35;
  carState.yawDeg = roamState.yawDeg;
  carState.speed = 0;
  // LAZY LOAD (2026-10-26 outage repair): the model starts
  // downloading only now, on the summon — never at street entry.
  // The car appears when the load lands; a tap while loading
  // simply waits. See lib/earth/car-model.js.
  void ensureCarModel();
  // Nudge a few metres east so it sits beside the walker.
  const frame = tangentFrame(carState.lat, carState.lon);
  const r = surfaceRadiusOrBase(carState.lat, carState.lon);
  const p = latLonToVec3(carState.lat, carState.lon, r);
  const side = new THREE.Vector3(
    p.x + frame.east.x * 3 * UPM,
    p.y + frame.east.y * 3 * UPM,
    p.z + frame.east.z * 3 * UPM,
  );
  const ll = vec3ToLatLon(side.x, side.y, side.z);
  carState.lat = ll.lat;
  carState.lon = ll.lon;
  return true;
}

export function dismissCar() {
  carState.summoned = false;
  carState.mounted = false;
  carState.speed = 0;
}

export function toggleCarMount() {
  if (!carState.summoned) return false;
  carState.mounted = !carState.mounted;
  if (carState.mounted) {
    carState.yawDeg = roamState.yawDeg;
  } else {
    // Dismount: walker takes the car's position — and the car
    // vanishes (Merlin, 2026-10-26). The walker reappears exactly
    // where the car was; summoning again brings a fresh car.
    roamState.lat = carState.lat;
    roamState.lon = carState.lon;
    roamState.yawDeg = carState.yawDeg;
    carState.summoned = false;
    carState.speed = 0;
  }
  return carState.mounted;
}

export default function EarthSupercar({ controls }) {
  const groupRef = useRef();
  const { camera } = useThree();
  const tuning = useMemo(() => tuningFor('supercar'), []);
  const keys = useRef({});
  // The model arrives via subscription (lib/earth/car-model.js):
  // nothing loads at street entry — only the summon starts the
  // download, so descent never pays the car's cost. A missing or
  // failed file just leaves the car absent — never a crash.
  const [model, setModel] = useState(() => getCarModel());
  useEffect(() => subscribeCarModel(setModel), []);

  // V = summon/dismiss, F = mount/dismount.
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (!roamState.active) return;
      if (k === 'v') {
        if (carState.summoned) dismissCar();
        else summonCar();
      } else if (k === 'f') {
        toggleCarMount();
      }
    };
    const up = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, rawDt) => {
    const g = groupRef.current;
    if (!g || !carState.summoned || !roamState.active) {
      if (g) g.visible = false;
      return;
    }
    // First-person clean-view law (2026-10-26, street QA 3): the
    // walker already leaves the frame in first person; the car
    // does the same while mounted — its roof sits 0.44 m under
    // the lens, so any downward look filled the screen with
    // bodywork. Third person still shows the car.
    g.visible = !(carState.mounted && effectiveEarthViewMode() === 'first');
    const dt = Math.min(0.05, rawDt || 0.016);

    if (carState.mounted) {
      const c = controls?.current || {};
      const k = keys.current;
      const thrust = -((c.moveY || 0) + ((c.keyS ? 1 : 0) - (c.keyW ? 1 : 0)));
      const turn = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));
      const boost = !!(k['shift'] || c.carBoost);
      const brake = thrust < -0.5;
      // Grounded: no rise/sink — a car drives on the ground.
      const f = {
        pos: { x: 0, y: 0, z: 0 },
        yaw: (carState.yawDeg * Math.PI) / 180,
        pitch: 0,
        speed: carState.speed,
      };
      const next = stepFlight(f, { thrust, turn, pitch: 0, boost, brake }, dt, tuning);
      carState.speed = next.speed;
      carState.yawDeg = ((next.yaw * 180) / Math.PI) % 360;

      // Great-circle step along the heading (same stepping as
      // the bike, so the car and the camera agree exactly).
      const distM = next.speed * dt * 3;
      const distRad = (distM * UPM) / surfaceRadiusOrBase(carState.lat, carState.lon);
      const br = (carState.yawDeg * Math.PI) / 180;
      const p1 = (carState.lat * Math.PI) / 180;
      const l1 = (carState.lon * Math.PI) / 180;
      const lat2 = Math.asin(Math.max(-1, Math.min(1,
        Math.sin(p1) * Math.cos(distRad) + Math.cos(p1) * Math.sin(distRad) * Math.cos(br))));
      const lon2 = l1 + Math.atan2(
        Math.sin(br) * Math.sin(distRad) * Math.cos(p1),
        Math.cos(distRad) - Math.sin(p1) * Math.sin(lat2),
      );
      const newLat = Math.max(-85, Math.min(85, (lat2 * 180) / Math.PI));
      let lonD = (lon2 * 180) / Math.PI;
      while (lonD > 180) lonD -= 360;
      while (lonD < -180) lonD += 360;
      // Solid collision: mountains, large structures, oil rigs
      // block; vegetation pass-through, same rule as the bike.
      const carRadiusM = CAR_RADIUS_M;
      const moved = moveWithCollision(carState.lat, carState.lon, newLat, lonD, carRadiusM, true);
      carState.lat = moved.lat;
      carState.lon = moved.lon;

      // Sync the walker so the street camera follows the car.
      roamState.lat = carState.lat;
      roamState.lon = carState.lon;
      roamState.yawDeg = carState.yawDeg;
      roamState.moving = Math.abs(next.speed) > 0.5;
      roamState.speed01 = Math.min(1, Math.abs(next.speed) / tuning.maxSpeed);
    }

    // Position on the globe: ground-hugging, like the bike.
    // Never sink under the DRAWN world (2026-10-26, street QA 3):
    // ride the higher of the smooth heightmap surface and the
    // street patch's drawn facet — on concave ground the facet
    // stands above the smooth sample and the car drove roof-deep
    // into slopes. The facet is null off-patch; smooth stands.
    const surfR = surfaceRadiusOrBase(carState.lat, carState.lon);
    const facetR = patchFacetRadiusAt(carState.lat, carState.lon);
    const groundR = facetR != null ? Math.max(surfR, facetR) : surfR;
    const hoverM = Math.max(0.05, carState.altM);
    const r = groundR + hoverM * UPM;
    const p = latLonToVec3(carState.lat, carState.lon, r);
    g.position.set(p.x, p.y, p.z);

    // Orient: +Z along heading, +Y along surface normal.
    const frame = tangentFrame(carState.lat, carState.lon);
    const fwd = headingVector(frame, carState.yawDeg);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
    const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
    g.quaternion.setFromRotationMatrix(basis);
  });

  // Keep the camera variable referenced (the mount's frame loop
  // runs inside the Canvas; camera is intentionally unused here
  // — the street rig owns the lens, exactly like EarthBike).
  void camera;

  if (!model) return <group ref={groupRef} visible={false} />;
  return (
    <group
      ref={groupRef}
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        if (carState.summoned && roamState.active) toggleCarMount();
      }}
    >
      <group scale={model.scale} rotation={[0, model.rotY, 0]}>
        <group position={[0, model.liftY, 0]}>
          <primitive object={model.scene} />
        </group>
      </group>
      {/* Mounted indicator ring — display metres, not hub units
          (2026-10-26, street QA 3): the old 1.6–1.9 raw radii were
          ~100–119 display metres across and floated 6.25 m up, so
          edge-on it read as a giant gold line on the horizon and
          a flattened "squashed car" frame. Now a ~6 m ring at
          the car's feet, like the pit marker's UPM-scaled ring. */}
      <mesh position={[0, 0.15 * UPM, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.8 * UPM, 3.2 * UPM, 48]} />
        <meshBasicMaterial
          color={carState.mounted ? '#fbbf24' : '#64748b'}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
