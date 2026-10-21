'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createWalkerEmbodiment } from '@/lib/gta/walker-embodiment';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { latLonToVec3 } from '@/lib/geo';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { parachuteState, bikeState, getClimbAltM } from '@/lib/earth/parachute';
import { effectiveEarthViewMode } from '@/lib/earth/view-mode';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';

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
  const lightRef = useRef();
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
    // size (0.00001x) into the tile world, grows back on reanimate.
    rig.scale.setScalar(parachuteState.scale);
    // Climb altitude: ladders and monument elevators lift the walker.
    // Bike altitude: while mounted, the walker rides ON the bike —
    // lifted by the same scaled hover height the bike mesh and the
    // camera rig use, so all three agree (no more character standing
    // on the ground under a flying bike).
    const bikeAltU = bikeState.mounted ? bikeState.altM * parachuteState.scale * UPM : 0;
    // Swim lift (lib/earth/swim.js): in water the body floats at
    // the surface or hangs submerged above the seabed — the state
    // machine publishes the lift in display metres and the rig
    // rides it like the climb lift (the camera rig reads the same
    // number, so lens and body agree). The bike keeps its own
    // altitude story and never swims. A gentle bob while floating
    // at the surface sells the water without touching the rig's
    // pose (the pose driver has no swim gait — honest treading).
    const swimming = !bikeState.mounted && !!(roamState.swim && roamState.swim.active);
    let swimAltU = 0;
    if (swimming) {
      swimAltU = (roamState.swim.altM || 0) * UPM;
      if ((roamState.swim.submergeM || 0) < 0.05) {
        swimAltU += Math.sin(state.clock.elapsedTime * 2.2) * 0.06 * UPM;
      }
    }
    const altU = getClimbAltM() * UPM + bikeAltU + swimAltU;
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
    // First person (lib/earth/view-mode.js): the traveler's own
    // body leaves the frame entirely — the clean-view law. No
    // floating hands, no body parts hanging into the picture:
    // the embodiment's own hidden flag does the work, and the
    // capsule obeys the same rule. In the Quantum Realm the
    // effective mode is forced third person, so the shrunken
    // character stays visible there (Merlin, 2026-10-20).
    const firstPerson = effectiveEarthViewMode() === 'first';
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
        { hidden: firstPerson },
      );
      // The character GLB is a Tripo model: tame its materials
      // (metalness default 1 = pitch black under plain lights —
      // the black-clawed-hands disease). Idempotent; re-applied
      // until the late-loading model is in and tamed.
      if (emb.characterId()) tameTripoMaterials(emb.group);
      // Publish the embodied body's measured size for the street
      // camera (roamState.charSizeM, display metres): the boom
      // frames the WHOLE animal — a 3.5 m raptor is not framed by
      // a human's 7.5 m shot (round 3: "3rd person should put the
      // character fully in front of the camera"). Held across
      // loads: while a new pick streams in, the last measured
      // body keeps the framing steady.
      const bodySize = emb.bodySize ? emb.bodySize() : null;
      if (bodySize) {
        roamState.charSizeM = {
          heightM: bodySize.y / UPM,
          lengthM: Math.max(bodySize.x, bodySize.z) / UPM,
        };
      }
    }
    if (emb && !emb.characterId() && roamState.charSizeM) {
      roamState.charSizeM = null; // back to the native figure
    }
    // Only show the capsule when NO character is selected (not during loads).
    // A selected-but-loading character shows nothing briefly — no flash.
    const hasPick = !!(emb && emb.characterId());
    if (capsuleRef.current) {
      capsuleRef.current.visible = !showing && !hasPick && !firstPerson;
    }
    // Fill lantern: intensity/distance are WORLD-space quantities
    // in three.js, so they scale with the Ant-Man shrink (the
    // light's rig-local position already does) — otherwise the
    // lamp that is gentle at street size becomes a supernova at
    // micro size and a void at none.
    if (lightRef.current) {
      const s = parachuteState.scale || 1;
      lightRef.current.intensity = 0.0012 * s * s;
      lightRef.current.distance = 0.35 * s;
    }
  });

  return (
    <group ref={rigRef} visible={false}>
      {/* Fill lantern: keeps the character readable, not a
          silhouette. Rig-local units are HUB units (the whole
          avatar is 0.032 of them), so the lamp hovers ~3 display
          metres up on the camera side of the traveler — the old
          [0, 3, 2] / intensity 0.35 placement was authored as if
          the rig were metre-scale and sat ~190 m overhead,
          contributing almost nothing while the character read
          pitch black. Intensity + distance are compensated per
          frame for the Ant-Man scale (see useFrame). */}
      <pointLight ref={lightRef} position={[0, 0.05, -0.035]} intensity={0.0012} distance={0.35} color="#ffffff" />
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
