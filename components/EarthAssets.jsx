'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EARTH_ASSETS } from '@/lib/earth/assets';
import { placementsFor, DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { TERRAIN_TEXTURES } from '@/lib/terrain';

// EarthAssets — the generated-asset layer for the fallback terrain
// globe (TERRAFORM_PLAN.md §6). Renders the Tripo-generated Earth
// assets from lib/earth/assets.js (verified-hosted GLBs only) ON the
// displaced terrain: every placement is grounded with the real
// heightmap sampler (lib/earth/placements.js), oriented along the
// sphere normal, and drawn at a fixed display exaggeration — true
// scale on a 55-unit globe would be invisible (a 22 m pine is
// 0.00019 units). Mounted inside NexusEarth's spin group so the
// assets rotate with the globe. Static geometry only: no rigs, no
// per-frame work. A failed asset is skipped, never a crash and never
// a hole in the globe.

// Per-species instance budget: ~300K triangles aggregate. Species
// whose foliage hit the simplifier's floor above their nominal tri
// budget get fewer instances; light species get more presence.
function scatterCountFor(asset) {
  return Math.max(8, Math.min(64, Math.round(300000 / Math.max(1, asset.tris))));
}

export default function EarthAssets() {
  const [built, setBuilt] = useState(null);
  const disposables = useRef([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Decode the same self-hosted heightmap the globe displaces
        // by, so assets sit on the surface the visitor sees.
        const tex = await new THREE.TextureLoader().loadAsync(
          TERRAIN_TEXTURES.height,
        );
        const img = tex.image;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, img.width, img.height).data;
        const gray = new Uint8Array(img.width * img.height);
        for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
        tex.dispose();

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
          const placements = placementsFor(asset, gray, img.width, img.height, {
            displayUnitsPerMetre: DISPLAY_UNITS_PER_METRE,
            scatterCount: scatterCountFor(asset),
            segmentCount: scatterCountFor(asset),
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
          if (asset.placement.mode === 'single') {
            const holder = new THREE.Group();
            const inner = gltf.scene;
            // Centre the model on its own origin (Tripo models are
            // origin-centred already; the bridge's nativeSize keeps
            // the grounding honest via displayHeight/2).
            holder.add(inner);
            place(holder, placements[0]);
            nodes.push(holder);
          } else {
            // Instanced: Tripo output is a single mesh; instance it.
            let mesh = null;
            gltf.scene.traverse((c) => {
              if (!mesh && c.isMesh) mesh = c;
            });
            if (!mesh) continue;
            const inst = new THREE.InstancedMesh(
              mesh.geometry, mesh.material, placements.length,
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
        // Heightmap or loader failure: the globe renders without the
        // asset layer. Never a crash, never a flat picture.
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
