'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeightData } from '@/lib/earth/heightmap';
import { roamState, cameraRig } from '@/lib/earth/roam';
import {
  buildStreetPatchGeometryData,
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
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

export function StreetFillLight({ active }) {
  const ref = useRef();

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
