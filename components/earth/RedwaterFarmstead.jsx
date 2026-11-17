'use client';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import {
  displayPlacement,
  DISPLAY_UNITS_PER_METRE,
} from '@/lib/earth/placements';
import { TERRAIN_RADIUS } from '@/lib/terrain';
import { loadHeightData } from '@/lib/earth/heightmap';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';

// RedwaterFarmstead — the ONLY placed 3D objects left on hub
// Earth 1 after the 2026-10-26 simplification.
//
// What it is: the four Redwater spawn farm clones that
// EarthAssets used to render beside the Redwater town centre —
// barn, silo, farmhouse, windmill — kept as journey dressing
// at the spawn the player actually walks, per the staging
// order ("farm kit" stays as a journey marker).
//
// What it is NOT:
// - No colliders: the clones never had any (only the original
//   farm-kit singles at 53.45, -113.6 did, and those are staged
//   with their colliders gated in lib/earth/collision.js).
// - No windmill animation: the fan driver lived in EarthAssets
//   and went with it, so the windmill fan stands still now.
// - No interior room: the cloned farmhouse's door never opened
//   (only the original's did), and that stays true.
// - No aether shards, no ladders, no elevators — all staged.
//
// The full staged record (all 1,884 objects, positions,
// headings, scales, source GLBs) lives in
// ~/workspace/earth1-staged-objects/inventory.json. Nothing
// here places anything on Earth 2.
const REDWATER_TOWN = { lat: 53.9486, lon: -113.1067 };
const REDWATER_FARM_OFFSETS = {
  'e021-red-gambrel-barn': { eastM: -170, northM: -120 },
  'e022-grain-silo': { eastM: -145, northM: -100 },
  'e023-prairie-farmhouse': { eastM: -200, northM: -155 },
  'e024-farm-windmill': { eastM: -130, northM: -175 },
};
const FARM_IDS = Object.keys(REDWATER_FARM_OFFSETS);

// The farm offsets are DISPLAY metres (2026-11-16, Earth 1
// spawn video): the street world is the 55-unit globe with
// DISPLAY_UNITS_PER_METRE per display metre, so one degree of
// arc is (2π×55/360) units ≈ 0.96 units ≈ 60 display metres —
// NOT 111,320 real metres. Converting the 130–200 m offsets
// with the real-Earth figure put all four buildings within
// 0.0007 units of each other (their footprints are 0.08–0.26
// units), so the barn, silo, farmhouse and windmill rendered
// as one interpenetrating black pile with flat magenta/cyan
// faces at the spawn, and the camera started inside it. With
// the display scale the four buildings stand 130–200 display
// metres apart as a real farm, every one of them clear of the
// spawn point (nearest: the silo, ~176 display metres out).
const DISPLAY_M_PER_DEGREE =
  ((2 * Math.PI * TERRAIN_RADIUS) / 360) / DISPLAY_UNITS_PER_METRE;

function offsetLatLon(lat, lon, eastM, northM) {
  return {
    lat: lat + northM / DISPLAY_M_PER_DEGREE,
    lon:
      lon +
      eastM /
        (DISPLAY_M_PER_DEGREE *
          Math.max(0.2, Math.cos((lat * Math.PI) / 180))),
  };
}

export default function RedwaterFarmstead() {
  const [built, setBuilt] = useState(null);

  useEffect(() => {
    let alive = true;
    const disposables = [];
    (async () => {
      try {
        const height = await loadHeightData();
        if (!height || !alive) { if (alive) setBuilt([]); return; }
        const { data: gray, w: imgW, h: imgH } = height;
        const { GLTFLoader } = await import(
          'three/examples/jsm/loaders/GLTFLoader.js'
        );
        const { MeshoptDecoder } = await import(
          'three/examples/jsm/libs/meshopt_decoder.module.js'
        );
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const up = new THREE.Vector3(0, 1, 0);
        const nodes = [];
        for (const id of FARM_IDS) {
          const asset = EARTH_ASSETS.find((a) => a.id === id);
          if (!asset) continue;
          let gltf;
          try {
            gltf = await loader.loadAsync(asset.glbUrl);
          } catch {
            continue; // Honest skip: an unreachable asset just doesn't render.
          }
          if (!alive) return;
          tameTripoMaterials(gltf.scene);
          const off = REDWATER_FARM_OFFSETS[id];
          const at = offsetLatLon(REDWATER_TOWN.lat, REDWATER_TOWN.lon, off.eastM, off.northM);
          const p = displayPlacement(
            asset, gray, imgW, imgH, at.lat, at.lon,
            DISPLAY_UNITS_PER_METRE, undefined,
          );
          const holder = new THREE.Group();
          holder.add(gltf.scene);
          holder.position.set(p.position.x, p.position.y, p.position.z);
          const n = new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z);
          holder.quaternion.setFromUnitVectors(up, n);
          if (p.headingDeg) {
            const yaw = new THREE.Quaternion().setFromAxisAngle(
              n, (p.headingDeg * Math.PI) / 180,
            );
            holder.quaternion.premultiply(yaw);
          }
          holder.scale.setScalar(p.displayScale);
          nodes.push(holder);
          disposables.push(holder);
        }
        if (alive) setBuilt(nodes);
      } catch {
        if (alive) setBuilt([]);
      }
    })();
    return () => {
      alive = false;
      disposables.forEach((d) => {
        try {
          d.traverse?.((c) => {
            if (c.isMesh) {
              c.geometry?.dispose?.();
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach((mt) => mt?.dispose?.());
            }
          });
        } catch {
          /* already gone */
        }
      });
    };
  }, []);

  if (!built) return null;
  return (
    <group>
      {built.map((node, i) => (
        <primitive key={i} object={node} />
      ))}
    </group>
  );
}
