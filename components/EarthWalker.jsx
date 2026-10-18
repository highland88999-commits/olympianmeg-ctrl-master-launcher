'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createWalkerEmbodiment } from '@/lib/gta/walker-embodiment';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { latLonToVec3 } from '@/lib/geo';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { parachuteState, getClimbAltM } from '@/lib/earth/parachute';

// EarthWalker — the traveler's body at street level (campaign
// Day 2). Mounted inside NexusEarth's spin group, so everything
// here is globe-local: a rig group is planted on the terrain each
// frame (position from the shared heightmap sampler, +Y along the
// sphere normal, +Z along the facing direction) and the SHARED
// Wave 1 walker adapter (lib/gta/walker-embodiment.js — the same
// adapter that embodies Mega City / Truman / Babel) is parented
// under it. The adapter resolves the pick chain for the 'earth'
// surface (surface override > profile character > native figure),
// attaches the character GLB at the native figure's footprint,
// and drives its walk/run/idle poses from the roam state.
//
// Fallback law, same as every walker surface: the native capsule
// stands until the embodiment reports ready, and forever if there
// is no pick or the load fails. The capsule is a hub-styled figure
// at the same 2 display-metre stature.
const UPM = DISPLAY_UNITS_PER_METRE;
const PROC_SIZE = { x: 1 * UPM, y: 2 * UPM, z: 1 * UPM };

export default function EarthWalker() {
  const rigRef = useRef();
  const capsuleRef = useRef();
  const embRef = useRef(null);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return undefined;
    const emb = createWalkerEmbodiment({
      scene: rig,
      surface: 'earth',
      procSize: PROC_SIZE,
    });
    embRef.current = emb;
    return () => {
      emb.dispose();
      embRef.current = null;
    };
  }, []);

  useFrame((state, dt) => {
    const rig = rigRef.current;
    if (!rig) return;
    if (!roamState.active) {
      rig.visible = false;
      return;
    }
    rig.visible = true;
    // Shrink scale: the avatar shrinks from normal size (1x) to micro
    // size (0.05x) into the tile world, grows back on reanimate.
    rig.scale.setScalar(parachuteState.scale);
    // Climb altitude: ladders and monument elevators lift the walker
    const altU = getClimbAltM() * UPM;
    const r = surfaceRadiusOrBase(roamState.lat, roamState.lon);
    const p = latLonToVec3(roamState.lat, roamState.lon, r + altU);
    rig.position.set(p.x, p.y, p.z);
    const frame = tangentFrame(roamState.lat, roamState.lon);
    const fwd = headingVector(frame, roamState.faceDeg);
    const xAxis = new THREE.Vector3().crossVectors(
      new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z),
      new THREE.Vector3(fwd.x, fwd.y, fwd.z),
    );
    const basis = new THREE.Matrix4().makeBasis(
      xAxis,
      new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z),
      new THREE.Vector3(fwd.x, fwd.y, fwd.z),
    );
    rig.quaternion.setFromRotationMatrix(basis);

    // The adapter tracks a flat-world player at the rig origin;
    // the rig carries the globe placement, the adapter carries
    // the body (pose + floor clamp in rig-local space).
    const emb = embRef.current;
    let showing = false;
    if (emb) {
      showing = emb.update(
        {
          x: 0, y: 0, z: 0, heading: 0,
          moving: roamState.moving,
          sprinting: roamState.sprinting,
          inVehicle: null,
        },
        Math.min(dt, 0.05),
        state.clock.elapsedTime,
        { hidden: false },
      );
    }
    if (capsuleRef.current) capsuleRef.current.visible = !showing;
  });

  return (
    <group ref={rigRef} visible={false}>
      {/* Native figure: a slim hub-cyan capsule, 2 display-metres. */}
      <mesh ref={capsuleRef} position={[0, PROC_SIZE.y / 2, 0]}>
        <capsuleGeometry args={[0.5 * UPM, 1.0 * UPM, 4, 12]} />
        <meshStandardMaterial
          color="#164e63"
          emissive="#22d3ee"
          emissiveIntensity={0.55}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
