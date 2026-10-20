'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeightData } from '@/lib/earth/heightmap';
import { roamState, cameraRig, tangentFrame } from '@/lib/earth/roam';
import { parachuteState } from '@/lib/earth/parachute';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { sampleHeight } from '@/lib/terrain';
import {
  buildStreetPatchGeometryData,
  hypsometricColor,
  STREET_PATCH_RADIUS,
} from '@/lib/earth/street-patch';

// StreetGroundPatch — the street-level detail ground for the hub
// Earth (walkthrough flaw, 2026-10-17).
//
// The traveler walks on the fallback globe's 160×120 sphere: facets
// ~135 display metres wide, so at 1.62 m eye height the ground read
// as giant broken black shards. The ESRI lens covers only a 21 m
// photographic disc. This mesh is the middle ground: a
// high-resolution heightmap-draped disc (~75 m radius) that follows
// the traveler, vertex-colored with the hypsometric ramp plus fine
// grain. It rebuilds on the same throttled recenter beat as the
// street lens (the parent passes its roamCenter), floats just above
// the globe and just below the lens, and only renders while roaming
// on the terrain layer.
//
// StreetFillLight — a soft warm lantern that rides above the
// traveler's head while roaming. The hub's ambient is dim and the
// globe's day/night terminator is baked into its shader, so street
// level could go pitch black; the fill guarantees the ground around
// the traveler stays readable without washing out the scene.

export default function StreetGroundPatch({ center }) {
  const meshRef = useRef();
  const geoRef = useRef(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return undefined;
    if (!center) {
      mesh.visible = false;
      return undefined;
    }
    const hd = getHeightData();
    if (!hd) return undefined;
    const data = buildStreetPatchGeometryData(
      hd.data, hd.w, hd.h, center.lat, center.lon, STREET_PATCH_RADIUS,
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeVertexNormals();
    if (geoRef.current) geoRef.current.dispose();
    geoRef.current = geo;
    mesh.geometry = geo;
    mesh.visible = true;
    return undefined;
  }, [center ? `${center.lat.toFixed(5)},${center.lon.toFixed(5)}` : null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (geoRef.current) {
      geoRef.current.dispose();
      geoRef.current = null;
    }
  }, []);

  return (
    <mesh ref={meshRef} visible={false}>
      {/* DoubleSide by Merlin's absolute rule: the floor must never
          be see-through, from any angle — even if the camera grazes
          under the patch edge on a slope, the underside still renders
          as ground. */}
      <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function StreetFillLight({ active }) {  const ref = useRef();

  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    const on = !!active && roamState.active;
    l.visible = on;
    if (!on) return;
    // Globe-local coords: this light mounts inside NexusEarth's
    // spin group, same space as the walker rig.
    const hd = getHeightData();
    const rig = cameraRig(
      roamState, hd ? hd.data : null, hd ? hd.w : 0, hd ? hd.h : 0,
    );
    l.position.set(
      rig.head.x + rig.normal.x * 0.03,
      rig.head.y + rig.normal.y * 0.03,
      rig.head.z + rig.normal.z * 0.03,
    );
  });

  // Physical falloff in hub units (0.016 u = 1 m): 0.0009 reads as
  // a gentle lantern at the traveler's feet, negligible past ~25 m.
  return (
    <pointLight
      ref={ref}
      color="#ffe3c0"
      intensity={0.0009}
      distance={1.2}
      decay={2}
      visible={false}
    />
  );
}

// MicroGroundDisc — the Quantum Realm's own floor (Merlin, 2026-10-20:
// the floor must render all around and behind the user, and never be
// see-through — worst offender was the tiny layer).
//
// In micro mode the street patch floats ~12.5 world-cm overhead (2.5x
// the tiny walker's height) and the globe's facets are ~135 m wide, so
// the quantum layer had no floor of its own. This disc IS that floor:
// ~3.1 world-metres across (≈62 m from the walker's own scale), it
// hugs the terrain surface a hair above the globe, follows the walker
// every frame in every direction, is opaque from both sides, and is
// colored from the same hypsometric ramp as the terrain it covers.
const MICRO_DISC_RADIUS_U = 0.05; // hub units ≈ 3.1 m
const MICRO_DISC_LIFT_U = 0.00006; // ≈ 4 mm — under the tiny eye line

export function MicroGroundDisc() {
  const meshRef = useRef();
  const matRef = useRef();
  const colorRef = useRef({ key: '', color: new THREE.Color('#3a5f2a') });

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const micro = (parachuteState?.scale || 1) < 0.5;
    const on = micro && roamState.active;
    mesh.visible = !!on;
    if (!on) return;

    const { lat, lon } = roamState;
    const r = surfaceRadiusOrBase(lat, lon) + MICRO_DISC_LIFT_U;
    const p = latLonToVec3(lat, lon, r);
    mesh.position.set(p.x, p.y, p.z);

    // Lie flat on the local tangent plane.
    const frame = tangentFrame(lat, lon);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const north = new THREE.Vector3(frame.north.x, frame.north.y, frame.north.z);
    const east = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
    const basis = new THREE.Matrix4().makeBasis(east, north, normal);
    mesh.quaternion.setFromRotationMatrix(basis);

    // Match the terrain color underfoot (refresh on coarse moves only).
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (colorRef.current.key !== key) {
      colorRef.current.key = key;
      const hd = getHeightData();
      if (hd && matRef.current) {
        const hgt = sampleHeight(hd.data, hd.w, hd.h, (lon + 180) / 360, (lat + 90) / 180);
        const [cr, cg, cb] = hypsometricColor(hgt, (lat + 90) / 180);
        matRef.current.color.setRGB(cr, cg, cb);
      }
    }
  });

  return (
    <mesh ref={meshRef} visible={false} rotation={[0, 0, 0]} renderOrder={2}>
      <circleGeometry args={[MICRO_DISC_RADIUS_U, 48]} />
      <meshStandardMaterial
        ref={matRef}
        color="#3a5f2a"
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
