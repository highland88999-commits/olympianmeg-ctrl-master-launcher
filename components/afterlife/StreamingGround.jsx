// components/afterlife/StreamingGround.jsx
// AFTERLIFE ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — the streaming
// ground ring for the 25 afterlife realms. One implementation, not
// 25 copies: every realm's Ground() renders this with the material
// props it used to spread on its fixed r=400 disc.
//
// The ring follows the walker (followRef = the scene's playerRef),
// builds at most 2 chunks per frame centre-first, and disposes
// chunks the walker leaves behind — the Mars 2 streaming shape
// (components/mars2/Mars2Scene.jsx, Mars2StreamingTerrain), flat:
// the afterlife floor has no heightfield, so the chunks carry the
// realm's floor texture at the old disc's UVs (lib/afterlife/
// streaming.js discUV) and the home region reads byte-identical.
//
// materialProps is the complete material spread the old disc used
// (map / emissiveMap / emissive / emissiveIntensity / bumpMap /
// bumpScale / color / roughness / metalness) — the same object the
// realm's Ground() built. The material is rebuilt only when one of
// those FIELDS changes (the props object itself is recreated every
// render by some realms, so the fields, not the object, are the
// memo deps). The video floors' textures arrive with ClampToEdge
// wrapping — the ring needs RepeatWrapping past the old disc, so
// the maps are flipped here; the painted and canvas floors already
// repeat, and flipping them is a no-op. The texture is shared by
// all 49 chunk meshes; the material is one object for the ring.
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CHUNK_M,
  HOME_DISC_RADIUS_M,
  buildChunkGeometry,
  chunksAround,
} from '@/lib/afterlife/streaming';

export default function StreamingGround({ materialProps, followRef, discRadius = HOME_DISC_RADIUS_M }) {
  const { camera } = useThree();
  const groupRef = useRef();
  const chunksRef = useRef(new Map());
  const queueRef = useRef([]);

  const { map, emissiveMap, emissive, emissiveIntensity, bumpMap, bumpScale, color, roughness, metalness } =
    materialProps || {};

  const material = useMemo(() => {
    // The ring tiles past [0,1] UVs: every map must repeat.
    // (Painted + canvas floors already do; the video floors do not.)
    for (const tex of [map, emissiveMap, bumpMap]) {
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
      }
    }
    const m = new THREE.MeshStandardMaterial({
      map: map ?? null,
      emissiveMap: emissiveMap ?? null,
      emissive: emissive ?? '#000000',
      emissiveIntensity: emissiveIntensity ?? 1,
      bumpMap: bumpMap ?? null,
      bumpScale: bumpScale ?? 1,
      color: color ?? '#ffffff',
      roughness: roughness ?? 1,
      metalness: metalness ?? 0,
    });
    return m;
    // Fields, not the props object: some realms rebuild the object
    // every render while its fields stay stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, emissiveMap, emissive, emissiveIntensity, bumpMap, bumpScale, color, roughness, metalness]);

  useEffect(() => () => {
    for (const entry of chunksRef.current.values()) entry.geometry.dispose();
    chunksRef.current.clear();
    material.dispose();
  }, [material]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    // The walker is the camera in these first-person realms; the
    // ref is the source of truth, the camera the fallback.
    const p = followRef && followRef.current ? followRef.current : camera.position;
    const wanted = chunksAround(p.x, p.z);
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const chunks = chunksRef.current;
    for (const [key, entry] of chunks) {
      if (!wantedKeys.has(key)) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        chunks.delete(key);
      }
    }
    // Drop queued chunks the walker has already left behind, then
    // queue the missing ones — centre first, so the ground under
    // the walker builds before the far edge.
    const queue = queueRef.current.filter((k) => wantedKeys.has(k));
    for (const w of wanted) {
      if (!chunks.has(w.key) && !queue.includes(w.key)) queue.push(w.key);
    }
    queueRef.current = queue;
    let built = 0;
    while (queue.length && built < 2) {
      const key = queue.shift();
      if (chunks.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      const geometry = buildChunkGeometry(cx, cz, discRadius);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.position.set(cx * CHUNK_M, 0, cz * CHUNK_M);
      group.add(mesh);
      chunks.set(key, { mesh, geometry });
      built++;
    }
  });

  return <group ref={groupRef} />;
}
