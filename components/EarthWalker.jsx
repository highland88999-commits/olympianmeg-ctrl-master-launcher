'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createWalkerEmbodiment } from '@/lib/gta/walker-embodiment';
import { resolveSurfaceCharacter, EARTH_DEFAULT_CHARACTER_ID } from '@/lib/characters/embodiment';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { surfaceRadiusOrBase, globeGridRadiusOrBase } from '@/lib/earth/heightmap';
import { latLonToVec3 } from '@/lib/geo';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { parachuteState, bikeState, carState, getClimbAltM } from '@/lib/earth/parachute';
import { getInteriorAltM } from '@/lib/earth/interiors';
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
// Fallback law, EARTH ONLY (video QA V2-1, 2026-10-26): the
// debug capsule NEVER renders on Earth. Other walker surfaces
// keep their native-capsule law; Earth resolves the pick chain
// and, when it yields nothing, spawns the Earth default
// character (Neo — a humanoid, available, hosted in the same
// fighter-models bucket as the proven Ghostface) instead of a
// bare turquoise capsule. While a picked character streams in,
// nothing shows briefly (the existing loading law) — never the
// capsule. If the default itself never becomes ready, the walker
// falls back once to Ghostface, which the QA footage proves
// renders on a real phone; only if that too fails does the
// walker stay invisible until the player picks a character —
// still never a capsule.
const UPM = DISPLAY_UNITS_PER_METRE;
const PROC_SIZE = { x: 1 * UPM, y: 2 * UPM, z: 1 * UPM };
const EARTH_FALLBACK_ID = 'q006-ghostface';
const EARTH_FALLBACK_AFTER_S = 8;

export default function EarthWalker() {
  const rigRef = useRef();
  const lightRef = useRef();
  const embRef = useRef(null);
  const fallbackRef = useRef({ t: 0, tried: false, lastId: null });

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return undefined;
    const emb = createWalkerEmbodiment({
      scene: rig,
      surface: 'earth',
      procSize: PROC_SIZE,
      // Earth default: the pick chain first (surface override >
      // profile character); only a null chain becomes Neo.
      characterId: (resolveSurfaceCharacter('earth') || {}).id || EARTH_DEFAULT_CHARACTER_ID,
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
    // Supercar seat: while driving, the walker sits in the car
    // (0.9 m seat height, scaled like the bike hover) instead of
    // standing through its bodywork at ground level.
    const carAltU = carState.mounted ? 0.9 * parachuteState.scale * UPM : 0;
    // No water on Earth 1 (2026-10-26): no swim lift, no surface
    // bob — the walker stands on the ground everywhere, seabed
    // included, at normal walk pace.
    // Interior altitude (lib/earth/interiors.js): inside a
    // construct, the lift rides the walker between floors — same
    // display-metre channel discipline as climb/bike.
    const altU = (getClimbAltM() + getInteriorAltM()) * UPM + bikeAltU + carAltU;
    // Never sink under the DRAWN world (placements law, joined
    // 2026-10-21): ride the higher of the true sampled surface and
    // the coarse globe grid's drawn surface. On steep facets the
    // true sampler alone read lower than the ground on screen and
    // the traveler walked waist-deep in the slope.
    const r = Math.max(
      surfaceRadiusOrBase(roamState.lat, roamState.lon),
      globeGridRadiusOrBase(roamState.lat, roamState.lon),
    );
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
    // Earth never shows the debug capsule (see header): a
    // loading character shows nothing briefly, and a default
    // that never becomes ready falls back once to Ghostface.
    // First person is excluded — the body is hidden by design
    // there, which is not a load failure.
    if (emb) {
      const cid = emb.characterId();
      const fb = fallbackRef.current;
      if (cid) {
        if (fb.lastId !== cid) { fb.lastId = cid; fb.t = 0; fb.tried = false; }
        if (!showing && !firstPerson && cid !== EARTH_FALLBACK_ID && !fb.tried) {
          fb.t += Math.min(dt, 0.05);
          if (fb.t > EARTH_FALLBACK_AFTER_S) {
            fb.tried = true;
            emb.setCharacter(EARTH_FALLBACK_ID);
          }
        } else if (showing) {
          fb.t = 0;
        }
      }
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
      {/* No capsule mesh on Earth, ever (video QA V2-1): the
          walker is always a real character (pick, profile, or
          the Earth default), or nothing while one loads. */}
    </group>
  );
}
