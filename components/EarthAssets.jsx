'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import {
  placementsFor,
  displayScaleFor,
  DISPLAY_UNITS_PER_METRE,
  HUB_UNITS_PER_DEGREE,
} from '@/lib/earth/placements';
import { loadHeightData } from '@/lib/earth/heightmap';

// EarthAssets — the generated-asset layer for the fallback terrain
// globe (TERRAFORM_PLAN.md §6). Renders the Tripo-generated Earth
// assets from lib/earth/assets.js (verified-hosted GLBs only) ON the
// displaced terrain: every placement is grounded with the real
// heightmap sampler (lib/earth/placements.js), oriented along the
// sphere normal, and drawn at the placement layer's capped display
// scale. Mounted inside NexusEarth's spin group so the assets
// rotate with the globe. Static geometry only: no rigs, no
// per-frame work. A failed asset is skipped, never a crash and
// never a hole in the globe.
//
// Day 2 (2026-10-15) — the E3/E4 audit fixes
// (earth-build/proof/street_audit_e3e4.md):
// - The bridge's nativeSize is now WORLD space (the GLB node
//   scale ≈0.5 is included), and the instanced path bakes the node
//   transform into the instanced geometry, so singles and
//   instances share one size convention and every model grounds
//   exactly (singles used to float ~displayHeight/4).
// - Scatter density is art-directed per species below (the bare
//   tri-budget rule gave the spiky winter snag the highest count
//   on the planet); scatter also honours terrain masks and
//   landmark exclusions from the placement layer, so trees no
//   longer plant in lakes or through landmarks.
// - Segment counts are geographic (short abutted runs), no longer
//   an accident of triangle count.

// Per-species instance budget for scatter: ~300K triangles
// aggregate. Species whose foliage hit the simplifier's floor
// above their nominal tri budget get fewer instances; light
// species get more presence.
function scatterCountFor(asset) {
  return Math.max(8, Math.min(64, Math.round(300000 / Math.max(1, asset.tris))));
}

// Audit-directed scatter overrides (§4.4): count and/or disc
// radius per species, replacing the tri-budget default.
const SCATTER_OVERRIDES = {
  'e002-prairie-grass-tufts': { count: 12, radiusDeg: 0.9 },
  'e003-rolling-grass-mound': { count: 8 },
  'e011-trembling-aspen': { count: 24 },
  'e014-saguaro-single': { count: 30 },
  'e015-date-palm': { count: 28 },
  'e016-baobab': { count: 24 },
  'e017-eucalyptus': { count: 28 },
  'e019-winter-snag': { count: 12, radiusDeg: 2.5 },
  'e020-shrub-cluster': { count: 16 },
  'e029-coast-redwood': { count: 20 },
  'e032-iceberg': { count: 6 },
  'e068-wind-turbine': { count: 10 },
};

// Segment run lengths (audit §4.5): copies abut at the placement
// layer's footprint-derived step, so a run is a short structure,
// not a 20-copy line across a province.
const SEGMENT_COUNTS = {
  'e004-riverbank-reeds': 12,
  'e006-beach-dune-segment': 8,
  'e033-sand-dune-ridge': 4,
  'e035-waterfall-cliff': 7,
  'e038-fjord-cliff-wall': 2,
  'e046-salt-flat-pan': 3,
  'e047-sea-cliff-segment': 2,
  'e056-great-wall-segment': 3,
  'e059-golden-gate-segment': 2,
};

// Terrain masks (audit §4.3): water species stay in the water,
// shoreline species in the shoreline band, everything else on
// land. Segments keep their anchor lines (no mask).
const WATER_SCATTER = new Set(['e032-iceberg', 'e034-coral-reef-cluster']);
const SHORE_SCATTER = new Set(['e015-date-palm', 'e025-mangrove-cluster', 'e031-bald-cypress']);
function terrainMaskFor(asset) {
  if (WATER_SCATTER.has(asset.id)) return 'water';
  if (SHORE_SCATTER.has(asset.id)) return 'shore';
  return 'land';
}

// Landmark exclusions (audit §4.3): scatter keeps off the exact
// singles. Radius grows with the single's displayed footprint,
// clamped so a giant (Fuji) thins its surrounding discs without
// sterilising a whole region.
const EXCLUSIONS = EARTH_ASSETS
  .filter((a) => a.placement?.mode === 'single'
    && a.placement.lat != null && a.placement.lon != null)
  .map((a) => {
    const fpDeg = displayScaleFor(a).footprint / HUB_UNITS_PER_DEGREE;
    return {
      lat: a.placement.lat,
      lon: a.placement.lon,
      radiusDeg: Math.max(0.5, Math.min(1.25, fpDeg * 0.5 + 0.25)),
    };
  });

export default function EarthAssets() {
  const [built, setBuilt] = useState(null);
  const disposables = useRef([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The shared decoded heightmap (lib/earth/heightmap.js):
        // one decode for the whole Earth stack, so assets sit on
        // the surface the visitor sees.
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

        const nodes = [];
        const up = new THREE.Vector3(0, 1, 0);
        for (const asset of EARTH_ASSETS) {
          if (!alive) return;
          const mode = asset.placement.mode;
          const override = SCATTER_OVERRIDES[asset.id] || {};
          const placements = placementsFor(asset, gray, imgW, imgH, {
            displayUnitsPerMetre: DISPLAY_UNITS_PER_METRE,
            scatterCount: override.count ?? scatterCountFor(asset),
            scatterRadiusDeg: override.radiusDeg,
            segmentCount: SEGMENT_COUNTS[asset.id] ?? 9,
            terrainMask: mode === 'instanced-scatter' ? terrainMaskFor(asset) : null,
            exclusions: mode === 'instanced-scatter' ? EXCLUSIONS : null,
          });
          if (!placements.length) continue;
          let gltf;
          try {
            gltf = await loader.loadAsync(asset.glbUrl);
          } catch {
            // Honest skip: an unreachable asset just doesn't render.
            continue;
          }
          if (!alive) return;
          disposables.current.push(gltf.scene);
          const place = (obj, p) => {
            obj.position.set(p.position.x, p.position.y, p.position.z);
            const n = new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z);
            obj.quaternion.setFromUnitVectors(up, n);
            if (p.headingDeg) {
              const yaw = new THREE.Quaternion().setFromAxisAngle(
                n, (p.headingDeg * Math.PI) / 180,
              );
              obj.quaternion.premultiply(yaw);
            }
            obj.scale.setScalar(p.displayScale);
          };
          if (mode === 'single') {
            const holder = new THREE.Group();
            const inner = gltf.scene;
            // The model keeps its GLB node transform; the bridge's
            // nativeSize is world space (node scale included), so
            // displayScale grounds it exactly.
            holder.add(inner);
            place(holder, placements[0]);
            nodes.push(holder);
          } else {
            // Instanced: bake the GLB node transform into a cloned
            // geometry so instances share the singles' world-space
            // size convention (raw geometry is attribute space,
            // ~2x the rendered size).
            let mesh = null;
            gltf.scene.traverse((c) => {
              if (!mesh && c.isMesh) mesh = c;
            });
            if (!mesh) continue;
            gltf.scene.updateMatrixWorld(true);
            const geo = mesh.geometry.clone();
            geo.applyMatrix4(mesh.matrixWorld);
            disposables.current.push(geo);
            const inst = new THREE.InstancedMesh(
              geo, mesh.material, placements.length,
            );
            const m = new THREE.Matrix4();
            const holder = new THREE.Object3D();
            placements.forEach((p, i) => {
              place(holder, p);
              holder.updateMatrix();
              m.copy(holder.matrix);
              inst.setMatrixAt(i, m);
            });
            inst.instanceMatrix.needsUpdate = true;
            nodes.push(inst);
            disposables.current.push(inst);
          }
        }
        if (alive) setBuilt(nodes);
      } catch {
        // Heightmap or loader failure: the globe renders without
        // the asset layer. Never a crash, never a flat picture.
        if (alive) setBuilt([]);
      }
    })();
    return () => {
      alive = false;
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
        } catch {
          /* already gone */
        }
      });
      disposables.current = [];
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
