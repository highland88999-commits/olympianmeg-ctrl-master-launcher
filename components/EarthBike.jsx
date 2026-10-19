'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WispBike } from '@/components/nova/TronBikes';
import { tuningFor, stepFlight, headingOf } from '@/lib/nova-flight';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { bikeState, parachuteState } from '@/lib/earth/parachute';
import { moveWithCollision } from '@/lib/earth/collision';

// EarthBike — summonable TRON Wisp bike for hub Earth street view.
//
// Summon with the B key or the EarthConsole button: the bike materializes
// next to the walker. Mount with E or by clicking the bike. While mounted,
// the bike handles like it does in Myriad (same Wisp tuning: maxSpeed,
// accel, turnRate, boostMult from lib/nova-flight), adapted to the globe:
// great-circle stepping over the real heightmap, altitude on Space/C.
//
// Ground collision: the bike's altitude is clamped every frame so it
// never passes through the floor — surfaceRadiusOrBase gives the true
// terrain radius at the bike's lat/lon, and altM never drops below
// the hover minimum.
//
// Dismount with E again (bike stays where it is, walker resumes).

const UPM = DISPLAY_UNITS_PER_METRE;
const HOVER_MIN_M = 0.6; // never below this altitude
const HOVER_MAX_M = 120; // ceiling

// Inverse of latLonToVec3: globe-local Cartesian → { lat, lon }.
function vec3ToLatLon(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  let theta = Math.atan2(z, -x);
  let lon = (theta * 180) / Math.PI - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

export function summonBike() {
  if (!roamState.active) return false;
  bikeState.summoned = true;
  bikeState.mounted = true; // auto-mount: spawn riding
  // Appear at the walker's position (they're already on it)
  bikeState.lat = roamState.lat;
  bikeState.lon = roamState.lon;
  bikeState.altM = HOVER_MIN_M + 0.6;
  bikeState.yawDeg = roamState.yawDeg;
  bikeState.speed = 0;
  // Nudge the bike a few metres east so it's beside the walker
  const frame = tangentFrame(bikeState.lat, bikeState.lon);
  const r = surfaceRadiusOrBase(bikeState.lat, bikeState.lon);
  const p = latLonToVec3(bikeState.lat, bikeState.lon, r);
  const side = new THREE.Vector3(
    p.x + frame.east.x * 3 * UPM,
    p.y + frame.east.y * 3 * UPM,
    p.z + frame.east.z * 3 * UPM
  );
  const ll = vec3ToLatLon(side.x, side.y, side.z);
  bikeState.lat = ll.lat;
  bikeState.lon = ll.lon;
  return true;
}

export function dismissBike() {
  bikeState.summoned = false;
  bikeState.mounted = false;
  bikeState.speed = 0;
}

export function toggleMount() {
  if (!bikeState.summoned) return false;
  bikeState.mounted = !bikeState.mounted;
  if (bikeState.mounted) {
    bikeState.yawDeg = roamState.yawDeg;
  } else {
    // Dismount: walker takes the bike's position
    roamState.lat = bikeState.lat;
    roamState.lon = bikeState.lon;
    roamState.yawDeg = bikeState.yawDeg;
  }
  return bikeState.mounted;
}

export default function EarthBike({ controls }) {
  const groupRef = useRef();
  const { camera } = useThree();
  const tuning = useMemo(() => tuningFor('wisp'), []);
  const keys = useRef({});

  // B = summon/dismiss, E = mount/dismount
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (!roamState.active) return;
      if (k === 'b') {
        if (bikeState.summoned) dismissBike();
        else summonBike();
      } else if (k === 'e') {
        toggleMount();
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
    if (!g || !bikeState.summoned || !roamState.active) {
      if (g) g.visible = false;
      return;
    }
    g.visible = true;
    const dt = Math.min(0.05, rawDt || 0.016);

    if (bikeState.mounted) {
      // --- Mounted: Myriad-style arcade flight, globe-adapted ---
      const c = controls?.current || {};
      const k = keys.current;
      const thrust = -((c.moveY || 0) + ((c.keyS ? 1 : 0) - (c.keyW ? 1 : 0)));
      const turn = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));
      const boost = !!(k['shift']);
      const brake = thrust < -0.5;
      const upIn = k[' '] ? 1 : 0;
      const downIn = (k['c'] || 0) ? 1 : 0;

      // Step speed/yaw with the Myriad flight model (same feel)
      const f = {
        pos: { x: 0, y: 0, z: 0 },
        yaw: (bikeState.yawDeg * Math.PI) / 180,
        pitch: 0,
        speed: bikeState.speed,
      };
      const next = stepFlight(
        f,
        { thrust, turn, pitch: 0, boost, brake },
        dt,
        tuning
      );
      bikeState.speed = next.speed;
      bikeState.yawDeg = ((next.yaw * 180) / Math.PI) % 360;

      // Move over the globe: great-circle step along the heading
      const distM = next.speed * dt * 3; // tune: flight units → metres feel
      const distRad = (distM * UPM) / surfaceRadiusOrBase(bikeState.lat, bikeState.lon);
      const br = (bikeState.yawDeg * Math.PI) / 180;
      const p1 = (bikeState.lat * Math.PI) / 180;
      const l1 = (bikeState.lon * Math.PI) / 180;
      const lat2 = Math.asin(
        Math.max(
          -1,
          Math.min(
            1,
            Math.sin(p1) * Math.cos(distRad) + Math.cos(p1) * Math.sin(distRad) * Math.cos(br)
          )
        )
      );
      const lon2 =
        l1 +
        Math.atan2(
          Math.sin(br) * Math.sin(distRad) * Math.cos(p1),
          Math.cos(distRad) - Math.sin(p1) * Math.sin(lat2)
        );
      const newLat = Math.max(-85, Math.min(85, (lat2 * 180) / Math.PI));
      let lonD = (lon2 * 180) / Math.PI;
      while (lonD > 180) lonD -= 360;
      while (lonD < -180) lonD += 360;
      // Solid collision on bike: mountains, large structures, oil rigs block.
      // (Vegetation pass-through allowed on bike per Merlin's rule.)
      const moved = moveWithCollision(bikeState.lat, bikeState.lon, newLat, lonD, 1.5, true);
      bikeState.lat = moved.lat;
      bikeState.lon = moved.lon;

      // Altitude: Space rises, C descends, clamped above the terrain
      bikeState.altM += (upIn - downIn) * 12 * dt;
      bikeState.altM = Math.max(HOVER_MIN_M, Math.min(HOVER_MAX_M, bikeState.altM));

      // Sync the walker's roam position so the street camera follows
      roamState.lat = bikeState.lat;
      roamState.lon = bikeState.lon;
      roamState.yawDeg = bikeState.yawDeg;
      roamState.moving = Math.abs(next.speed) > 0.5;
      roamState.speed01 = Math.min(1, Math.abs(next.speed) / tuning.maxSpeed);
    }

    // --- Position the bike mesh on the globe ---
    // Ground collision: radius is surface + altitude, never below surface.
    // Altitude scales with the walker (Ant-Man): at 0.05x the hover is tiny too.
    const surfR = surfaceRadiusOrBase(bikeState.lat, bikeState.lon);
    const scaledAltM = Math.max(HOVER_MIN_M, bikeState.altM) * parachuteState.scale;
    const r = surfR + scaledAltM * UPM;
    const p = latLonToVec3(bikeState.lat, bikeState.lon, r);
    g.position.set(p.x, p.y, p.z);

    // Orient: +Z along heading, +Y along surface normal
    const frame = tangentFrame(bikeState.lat, bikeState.lon);
    const fwd = headingVector(frame, bikeState.yawDeg);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
    const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
    g.quaternion.setFromRotationMatrix(basis);

    // Bank into turns for that TRON feel
    const c = controls?.current || {};
    const turn = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));
    g.rotateZ(-turn * 0.25);

    // Scale with the walker (Ant-Man): bike shrinks/grows in lockstep
    g.scale.setScalar(parachuteState.scale);
  });

  return (
    <group
      ref={groupRef}
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        if (bikeState.summoned && roamState.active) toggleMount();
      }}
    >
      <WispBike color="#00ffcc" />
      {/* Mounted indicator ring */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 1.9, 32]} />
        <meshBasicMaterial
          color={bikeState.mounted ? '#00ffcc' : '#64748b'}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
