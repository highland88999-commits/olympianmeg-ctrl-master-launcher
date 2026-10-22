'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import {
  placementsFor,
  displayScaleFor,
  DISPLAY_UNITS_PER_METRE,
  HUB_UNITS_PER_DEGREE,
} from '@/lib/earth/placements';
import { loadHeightData, surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { publishColliders } from '@/lib/earth/collision';
import { tameTripoMaterials } from '@/lib/characters/tame-materials';
import {
  interiorById,
  interiorAt,
  nearestInterior,
  interiorLocal,
  liftPadAt,
  floorAltM,
  interiorState,
  haversineM,
} from '@/lib/earth/interiors';
import { isAetherCollected, collectAether } from '@/lib/earth/aether';
import {
  registerVertexAnimation,
  stepVertexAnimations,
  clearVertexAnimations,
} from '@/lib/earth/asset-anim';
import { buildInteriorRoom, registerRoom, getRooms, clearRooms } from '@/components/EarthInteriorRoom';
import { roamState } from '@/lib/earth/roam';
import { latLonToVec3 } from '@/lib/geo';
import { fx } from '@/lib/fx';

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

// Per-asset DISPLAY height caps (metres), the singles' analogue
// of SCATTER_OVERRIDES: the bridge scaleM stays honest in the
// manifest; only the street-level read is art-directed. The
// Moraine Lake peaks (e045, scaleM 250) are the standing case:
// at the globe's compressed geography they sit ~170 display
// metres from the Alberta street spawns, so a 250 m read filled
// the sky as a floating black slab (its base hidden below the
// horizon's curve — Merlin's "T-Rex", 2026-10-20). Capped to a
// deliberate 60 m diorama: still the biggest silhouette in the
// region, no longer a kaiju overhead.
const DISPLAY_HEIGHT_CAPS_M = {
  'e045-moraine-lake-peaks': 60,
};

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
            heightCapM: DISPLAY_HEIGHT_CAPS_M[asset.id],
            scatterCount: override.count ?? scatterCountFor(asset),
            scatterRadiusDeg: override.radiusDeg,
            segmentCount: SEGMENT_COUNTS[asset.id] ?? 9,
            terrainMask: mode === 'instanced-scatter' ? terrainMaskFor(asset) : null,
            exclusions: mode === 'instanced-scatter' ? EXCLUSIONS : null,
          });
          if (!placements.length) continue;
          // Publish colliders for solid objects (trees, rocks, structures).
          // Scatter instances get small trunk/base radii; singles are
          // already covered by buildColliders() but we include them for
          // the exact rendered positions.
          if (mode !== 'single') {
            const cat = asset.category || 'prop';
            // Only solid categories: vegetation (trees), terrain (rocks),
            // buildings, landmarks, props. Grass tufts and small plants
            // are pass-through (radius 0).
            const isSolid =
              cat === 'building' ||
              cat === 'landmark' ||
              cat === 'prop' ||
              (cat === 'vegetation' && (asset.scaleM || 0) > 1.5) ||
              (cat === 'terrain' && (asset.scaleM || 0) > 1.0);
            if (isSolid) {
              const radiusM =
                cat === 'vegetation'
                  ? 0.6 // tree trunk
                  : Math.max((asset.scaleM || 2) / 4, 0.8);
              const batch = placements.map((p) => ({
                lat: p.lat,
                lon: p.lon,
                radiusM,
                id: asset.id,
                category: cat,
                name: asset.name || asset.id,
              }));
              publishColliders(batch);
            }
          }
          let gltf;
          try {
            gltf = await loader.loadAsync(asset.glbUrl);
          } catch {
            // Honest skip: an unreachable asset just doesn't render.
            continue;
          }
          if (!alive) return;
          tameTripoMaterials(gltf.scene);
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
            // ANIMATION (Merlin, 2026-10-22): the farm windmill's
            // fan — vertex-level, the GLB is one fused mesh (see
            // lib/earth/asset-anim.js). Registered on the model's
            // own geometry; the shared-clock driver spins it.
            if (asset.id === 'e024-farm-windmill') {
              let fm = null;
              gltf.scene.traverse((c) => { if (!fm && c.isMesh) fm = c; });
              if (fm) registerVertexAnimation(fm.geometry, 'rotor');
            }
            // INTERIORS (Merlin, 2026-10-22): an enterable
            // construct gets its parametric room, placed on the
            // same surface point and registered for the driver
            // (shell swap at the door, lift, light, aether).
            const interior = interiorById(asset.id);
            if (interior) {
              const room = buildInteriorRoom(interior, placements[0]);
              nodes.push(room.group);
              disposables.current.push(room.group);
              registerRoom(interior.id, {
                shell: holder,
                group: room.group,
                aetherMeshes: room.aetherMeshes,
              });
              room.aetherMeshes.forEach((mesh, id) => {
                if (isAetherCollected(id)) mesh.visible = false;
              });
            }
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
            // ANIMATION (Merlin, 2026-10-22): wind turbines spin,
            // oil pumpjacks stroke — vertex-level on this shared
            // baked geometry, so every instance works together
            // (lib/earth/asset-anim.js).
            if (asset.id === 'e068-wind-turbine') registerVertexAnimation(geo, 'rotor');
            if (asset.id === 'e069-oil-pumpjack') registerVertexAnimation(geo, 'beam');
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
      clearRooms();
      clearVertexAnimations();
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
    <>
      <AssetAnimDriver />
      <InteriorsDriver />
      <group>
        {built.map((node, i) => (
          <primitive key={i} object={node} />
        ))}
      </group>
    </>
  );
}

// AssetAnimDriver — the shared clock for construct animation
// (windmill fans, turbine rotors, pumpjack strokes). One useFrame
// for every registered geometry; no per-mesh state anywhere.
function AssetAnimDriver() {
  useFrame((state, dt) => {
    stepVertexAnimations(state.clock.elapsedTime, Math.min(dt, 0.05));
  });
  return null;
}

// InteriorsDriver — the interior experience, per frame:
// - shell swap: a construct's GLB shell hides while the walker is
//   inside it or on its door approach, so the lit parametric room
//   is what the threshold shows (the GLB is a closed solid; the
//   room lives inset within it).
// - the lift: standing on an interior's up/down pad rides the
//   walker's interior altitude (interiorState.altM — read by
//   EarthWalker + the street camera like the climb channel).
// - the light: ONE shared point light follows the walker into
//   whichever interior is occupied/approached, tinted by class.
// - aether: shards idle-spin; walking into one (same floor)
//   collects it with the standard pickup feedback (fx.coin).
const AETHER_COLLECT_RADIUS_M = 1.6;
const PAD_DWELL_S = 0.7;

function InteriorsDriver() {
  const lightRef = useRef();
  const dwellRef = useRef({ key: null, t: 0 });

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const rooms = getRooms();

    // Shard idle motion — every uncollected shard, everywhere.
    rooms.forEach((room) => {
      room.aetherMeshes.forEach((mesh) => {
        if (!mesh.visible) return;
        mesh.rotation.y += dt * 1.4;
        mesh.position.y = mesh.userData.baseY + Math.sin(t * 2 + mesh.position.x * 3) * 0.08;
      });
    });

    const light = lightRef.current;

    if (!roamState.active) {
      // Not roaming: every shell back on, altitude home, light out.
      rooms.forEach((room) => { if (room.shell && !room.shell.visible) room.shell.visible = true; });
      interiorState.activeId = null;
      interiorState.floor = 0;
      interiorState.altM = 0;
      if (light) light.intensity = 0;
      dwellRef.current.key = null;
      return;
    }

    const inside = interiorAt(roamState.lat, roamState.lon);
    const near = inside || nearestInterior(roamState.lat, roamState.lon);

    // Shell swap on inside / door approach.
    rooms.forEach((room, id) => {
      if (!room.shell) return;
      const spec = interiorById(id);
      if (!spec) return;
      const d = interiorLocal(spec, roamState.lat, roamState.lon).d;
      const approach = d < spec.radiusM + Math.max(2, spec.radiusM * 0.9);
      room.shell.visible = !approach;
    });

    // Lift + altitude.
    let targetAlt = 0;
    if (inside) {
      const spec = inside.spec;
      interiorState.activeId = spec.id;
      const settled = Math.abs(interiorState.altM - floorAltM(spec, interiorState.floor)) < 0.3;
      const pad = settled
        ? liftPadAt(spec, inside.local.eastM, inside.local.northM)
        : null;
      const dwell = dwellRef.current;
      const padUsable = pad === 'up'
        ? interiorState.floor < spec.floors - 1
        : pad === 'down'
          ? interiorState.floor > 0
          : false;
      if (pad && padUsable) {
        const key = spec.id + ':' + pad + ':' + interiorState.floor;
        if (dwell.key !== key) { dwell.key = key; dwell.t = 0; }
        dwell.t += dt;
        if (dwell.t > PAD_DWELL_S) {
          interiorState.floor += pad === 'up' ? 1 : -1;
          dwell.key = null;
          dwell.t = 0;
          try { fx.tap(); } catch { /* audio is garnish */ }
        }
      } else {
        dwell.key = null;
        dwell.t = 0;
      }
      targetAlt = floorAltM(spec, interiorState.floor);

      // Aether collect: same interior, same floor, within reach.
      const room = rooms.get(spec.id);
      if (room) {
        for (const a of spec.aether) {
          if (a.floor !== interiorState.floor) continue;
          if (isAetherCollected(a.id)) continue;
          if (haversineM(roamState.lat, roamState.lon, a.lat, a.lon) < AETHER_COLLECT_RADIUS_M) {
            if (collectAether(a.id)) {
              const mesh = room.aetherMeshes.get(a.id);
              if (mesh) mesh.visible = false;
              try { fx.coin(); } catch { /* audio is garnish */ }
            }
          }
        }
      }
    } else {
      interiorState.activeId = null;
      interiorState.floor = 0;
      dwellRef.current.key = null;
    }
    interiorState.altM += (targetAlt - interiorState.altM) * Math.min(1, dt * 3.2);
    if (!inside && interiorState.altM < 0.02) interiorState.altM = 0;

    // The one shared interior light.
    if (light) {
      if (near && near.local.d < near.spec.radiusM * 1.6) {
        const spec = near.spec;
        const r = surfaceRadiusOrBase(roamState.lat, roamState.lon)
          + (interiorState.altM + 2.2) * DISPLAY_UNITS_PER_METRE;
        const p = latLonToVec3(roamState.lat, roamState.lon, r);
        light.position.set(p.x, p.y, p.z);
        light.color.set(spec.lightColor);
        light.distance = Math.max(spec.widthM, spec.depthM) * DISPLAY_UNITS_PER_METRE * 1.6;
        const goal = inside ? 0.012 : 0.005;
        light.intensity += (goal - light.intensity) * Math.min(1, dt * 5);
      } else {
        light.intensity += (0 - light.intensity) * Math.min(1, dt * 5);
      }
    }
  });

  return <pointLight ref={lightRef} intensity={0} distance={0.4} decay={1.4} />;
}
