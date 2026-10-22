'use client';

// PlanetLandscape — the regional ground of a hub planet realm
// (Merlin, 2026-10-22: planetary procedural landscapes, invisible
// zone lines, organic transitions).
//
// A high-resolution ground SKIN laid over the shared realm terrain:
// displaced by lib/planets/landscape.js heightAt (the shared engine
// field + seeded regional detail) and coloured per-vertex by
// landscape.colorAt — the full blend of the planet's five region
// colours at that point. Because the colour is a continuous blend of
// smooth fields, the ground itself changes character as you cross
// the world and there is no boundary anywhere to see: the regions
// are in the mathematics, not drawn on the dirt. polygonOffset
// keeps the skin cleanly on top of the base terrain it skins.
//
// Regional FLORA rides the same field: scatter points drawn from the
// landscape's seeded stream, each dressed in its dominant region's
// form (cone spires/shards, blob blooms/mats/tufts) and colour, as
// two InstancedMeshes — a full regional flora for two draw calls.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getLandscape } from '@/lib/planets/landscape';

const CONE_FORMS = new Set(['spire', 'shard']);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function buildSkinGeometry(profile) {
  const ls = getLandscape(profile);
  const g = new THREE.PlaneGeometry(190, 190, 150, 150);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, ls.heightAt(x, z));
    const c = ls.colorAt(x, z, tmpC);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function FloraInstances({ profile, form }) {
  const { geo, count, apply } = useMemo(() => {
    const ls = getLandscape(profile);
    const pts = ls
      .scatterPoints(120)
      .filter((p) => (form === 'cone' ? CONE_FORMS.has(p.biome.floraForm) : !CONE_FORMS.has(p.biome.floraForm)));
    const geo =
      form === 'cone'
        ? new THREE.ConeGeometry(0.55, 2.4, 6)
        : new THREE.SphereGeometry(0.8, 8, 6);
    const apply = (mesh) => {
      pts.forEach((p, i) => {
        const density = p.biome.floraDensity;
        const h = p.scale * density * (0.6 + p.moisture * 0.9);
        tmpE.set(0, p.rot, 0);
        tmpQ.setFromEuler(tmpE);
        tmpV.set(p.x, p.y + (form === 'cone' ? h * 0.9 : h * 0.25), p.z);
        if (form === 'cone') tmpS.set(h, h * 1.6, h);
        else if (p.biome.floraForm === 'mat') tmpS.set(h * 2.2, h * 0.35, h * 2.2);
        else tmpS.set(h, h * 0.75, h);
        tmpM.compose(tmpV, tmpQ, tmpS);
        mesh.setMatrixAt(i, tmpM);
        tmpC.copy(p.biome.color).lerp(profile.groundAccentColor, 0.3);
        tmpC.offsetHSL(0, 0.05, 0.05);
        mesh.setColorAt(i, tmpC);
      });
      mesh.count = pts.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
    };
    return { geo, count: pts.length, apply };
  }, [profile, form]);

  useEffect(() => () => geo.dispose(), [geo]);
  if (count === 0) return null;
  return (
    <instancedMesh
      key={`${profile.seed}-${form}-${count}`}
      args={[geo, undefined, count]}
      ref={(mesh) => { if (mesh) apply(mesh); }}
    >
      <meshStandardMaterial vertexColors={false} roughness={0.85} metalness={0.08} />
    </instancedMesh>
  );
}

export default function PlanetLandscape({ profile }) {
  const skinGeo = useMemo(() => buildSkinGeometry(profile), [profile]);
  useEffect(() => () => skinGeo.dispose(), [skinGeo]);
  return (
    <group>
      <mesh geometry={skinGeo}>
        <meshStandardMaterial
          vertexColors
          roughness={0.94}
          metalness={0.05}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <FloraInstances profile={profile} form="cone" />
      <FloraInstances profile={profile} form="blob" />
    </group>
  );
}
