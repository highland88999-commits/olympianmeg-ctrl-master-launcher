'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import { displayPlacement, DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { localDiscPlacements, localCellKey } from '@/lib/earth/global-scatter';
import { loadHeightData } from '@/lib/earth/heightmap';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';
import { roamState } from '@/lib/earth/roam';

// EarthLocalScatter — the street-level half of the Earth 1
// expansion (2026-10-26): dense props that FOLLOW the traveler,
// so every part of Earth 1 — including the dry seabed, where no
// anchor scatter ever reached — feels lived-in at street level
// without paying to draw the whole planet at once.
//
// How it streams: a small disc (~300 m radius, ~64 instances
// across four light species) is built around the traveler's cell
// and rebuilt only when the traveler crosses into a new cell
// (lib/earth/global-scatter.js localCellKey, ~280 m cells), so
// props are stable while walking and never pop every step. The
// GLBs are the same verified-hosted files EarthAssets already
// loads, so the browser cache serves them — no new downloads
// beyond the first. Instances share one InstancedMesh per
// species (four draw calls total), grounded through the same
// displayPlacement law as every other Earth asset.
//
// Guard: the Redwater quicksand pit mouth stays clear —
// localDiscPlacements excludes 150 m around the pit, so this
// layer can never cover or block the journey, wherever the
// traveler walks. Props here are visual only (no colliders):
// publishing a fresh collider set on every cell rebuild would
// churn the collision scan and could fence the traveler inside
// their own props.
// Mounted by NexusEarth on the terrain layer while roaming,
// never in micro mode. Never throws into the globe: any load or
// height failure just leaves this layer off.

const LOCAL_SPECIES = [
  { id: 'e001-rocky-outcrop', count: 16 },
  { id: 'e002-prairie-grass-tufts', count: 20 },
  { id: 'e020-shrub-cluster', count: 16 },
  { id: 'e009-lodgepole-pine', count: 12 },
];
const DISC_RADIUS_M = 300;

export default function EarthLocalScatter() {
  const [built, setBuilt] = useState(null);
  const disposables = useRef([]);
  const cellRef = useRef(null);
  const centerRef = useRef(null);

  // Rebuild trigger: watch the traveler's cell in the frame loop
  // (roamState mutates outside React, like the bike state).
  useFrame(() => {
    if (!roamState.active) {
      if (cellRef.current !== null) { cellRef.current = null; setBuilt(null); }
      return;
    }
    const key = localCellKey(roamState.lat, roamState.lon);
    if (key !== cellRef.current) {
      cellRef.current = key;
      centerRef.current = { lat: roamState.lat, lon: roamState.lon };
      setBuilt('pending');
    }
  });

  useEffect(() => {
    if (built !== 'pending' || !centerRef.current) return undefined;
    // The previous cell's meshes already unmounted with the
    // 'pending' render — release them before building the new cell
    // so a long walk doesn't accumulate GPU geometry per cell.
    disposables.current.forEach((d) => {
      try {
        d.traverse?.((c) => {
          if (c.isMesh) {
            c.geometry?.dispose?.();
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach((mt) => mt?.dispose?.());
          }
        });
        d.dispose?.();
      } catch { /* already gone */ }
    });
    disposables.current = [];
    let alive = true;
    (async () => {
      try {
        const height = await loadHeightData();
        if (!height || !alive) { if (alive) setBuilt(null); return; }
        const { data: gray, w: imgW, h: imgH } = height;
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const up = new THREE.Vector3(0, 1, 0);
        const nodes = [];
        for (const spec of LOCAL_SPECIES) {
          const asset = EARTH_ASSETS.find((a) => a.id === spec.id);
          if (!asset) continue;
          const spots = localDiscPlacements(
            spec.id, centerRef.current.lat, centerRef.current.lon,
            spec.count, DISC_RADIUS_M,
          );
          if (!spots.length) continue;
          let gltf;
          try {
            gltf = await loader.loadAsync(asset.glbUrl);
          } catch {
            continue;
          }
          if (!alive) return;
          tameTripoMaterials(gltf.scene);
          disposables.current.push(gltf.scene);
          let mesh = null;
          gltf.scene.traverse((c) => { if (!mesh && c.isMesh) mesh = c; });
          if (!mesh) continue;
          gltf.scene.updateMatrixWorld(true);
          const geo = mesh.geometry.clone();
          geo.applyMatrix4(mesh.matrixWorld);
          disposables.current.push(geo);
          const inst = new THREE.InstancedMesh(geo, mesh.material, spots.length);
          const m = new THREE.Matrix4();
          const holder = new THREE.Object3D();
          spots.forEach((spot, i) => {
            const p = displayPlacement(
              asset, gray, imgW, imgH, spot.lat, spot.lon, DISPLAY_UNITS_PER_METRE,
            );
            p.displayHeight = p.displayHeight * spot.jitter;
            p.displayScale = p.displayScale * spot.jitter;
            const lift = p.displayHeight / 2
              - (asset.placement?.sinkFrac || 0) * p.displayHeight;
            p.position = {
              x: p.surfacePoint.x + p.normal.x * lift,
              y: p.surfacePoint.y + p.normal.y * lift,
              z: p.surfacePoint.z + p.normal.z * lift,
            };
            holder.position.set(p.position.x, p.position.y, p.position.z);
            const n = new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z);
            holder.quaternion.setFromUnitVectors(up, n);
            if (spot.headingDeg) {
              const yaw = new THREE.Quaternion().setFromAxisAngle(n, (spot.headingDeg * Math.PI) / 180);
              holder.quaternion.premultiply(yaw);
            }
            holder.scale.setScalar(p.displayScale);
            holder.updateMatrix();
            m.copy(holder.matrix);
            inst.setMatrixAt(i, m);
          });
          inst.instanceMatrix.needsUpdate = true;
          nodes.push(inst);
          disposables.current.push(inst);
        }
        if (alive) setBuilt(nodes);
      } catch {
        if (alive) setBuilt(null);
      }
    })();
    return () => { alive = false; };
  }, [built]);

  useEffect(() => () => {
    disposables.current.forEach((d) => {
      try {
        d.traverse?.((c) => {
          if (c.isMesh) {
            c.geometry?.dispose?.();
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach((mt) => mt?.dispose?.());
          }
        });
        d.dispose?.();
      } catch { /* already gone */ }
    });
    disposables.current = [];
  }, []);

  if (!built || built === 'pending') return null;
  return (
    <group>
      {built.map((node, i) => (
        <primitive key={i} object={node} />
      ))}
    </group>
  );
}
