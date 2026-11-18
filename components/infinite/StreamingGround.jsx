// components/infinite/StreamingGround.jsx — endless flat ground for
// R3F worlds (Wave 4, Nov 18, 2026).
//
// Merlin: "Make all 3d worlds infinite space too please" — like Mars 2.
// The home ground (disc / plane, whatever the world already has) stays
// exactly as-is; this streams flat 64 m ground chunks around the
// camera, so the walker roams past the old edge and the ground keeps
// going. The chunk material is the caller's own (same texture as the
// home ground, cloned with repeat 1, so the UVs — world metres per
// tile — continue seamlessly across the home edge); the component
// never disposes it. Chunk geometries are freed when a chunk leaves
// the ring.
//
// Props:
//   material — THREE.Material shared by every chunk (caller-owned)
//   tileM — metres per texture repeat (UVs are world/tileM)
//   originX, originZ — UV origin (default 0; the home ground's own
//     planar offset when its UVs carry one)
//   y — chunk plane height (default -0.02, just under the home plane
//     so the two never z-fight where they overlap)
//   radius — ring radius in chunks (default 3 = 448 m; fog on these
//     worlds has hazed the edge by then)
//   budget — max chunks built per frame (default 2, Mars 2's pace)
//   name — mesh name (default 'endless-ground'; the Skyscraper
//     passes its DRIVE_ names so the bike raycast finds the ground)
//   focusRef — optional ref to a THREE.Vector3 to follow instead of
//     the camera (a walker ref when the camera orbits far from it)
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChunkRing, chunkBounds, chunkGroundGeometry } from '@/lib/infinite/streaming.js';

export default function StreamingGround({
  material,
  tileM,
  originX = 0,
  originZ = 0,
  y = -0.02,
  radius = 3,
  budget = 2,
  name = 'endless-ground',
  receiveShadow = true,
  focusRef = null,
}) {
  const groupRef = useRef();
  const { camera } = useThree();

  const ring = useMemo(() => new ChunkRing({
    radius,
    budget,
    onLoad: (key, cx, cz) => {
      const { x0, z0 } = chunkBounds(cx, cz);
      const mesh = new THREE.Mesh(chunkGroundGeometry(cx, cz, tileM, originX, originZ), material);
      mesh.position.set(x0, y, z0);
      mesh.receiveShadow = receiveShadow;
      mesh.name = name;
      if (groupRef.current) groupRef.current.add(mesh);
      return mesh;
    },
    onDrop: (key, mesh) => {
      if (!mesh) return;
      if (groupRef.current) groupRef.current.remove(mesh);
      mesh.geometry.dispose();
    },
  }), [material, tileM, originX, originZ, y, radius, budget, name, receiveShadow]);

  useEffect(() => () => ring.disposeAll(), [ring]);

  useFrame(() => {
    const f = focusRef && focusRef.current ? focusRef.current : camera.position;
    ring.update(f.x, f.z);
  });

  return <group ref={groupRef} />;
}
