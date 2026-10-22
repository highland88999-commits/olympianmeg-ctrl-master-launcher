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
  MICRO_DISC_RADIUS_U,
  microDiscLiftU,
  microGrainTileU,
} from '@/lib/earth/street-patch';

// StreetGroundPatch — the street-level detail ground for the hub
// Earth (walkthrough flaw, 2026-10-17).
//
// The traveler walks on the fallback globe's 160×120 sphere: facets
// ~135 display metres wide, so at 1.62 m eye height the ground read
// as giant broken black shards. The ESRI lens covers a 90 m
// photographic disc. This mesh is the middle ground: a
// high-resolution heightmap-draped disc (~338 m radius) that follows
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
// it hugs the terrain surface a hair above the globe, follows the
// walker every frame in every direction, is opaque from both sides,
// and is colored from the same hypsometric ramp as the terrain it
// covers.
//
// 2026-10-20 repair (Merlin: "no motion controls in the Quantum
// Realm" + "the world feels inverted"): the disc's lift was an
// UNSCALED 0.00006 hub units while the tiny eye sits ~2.6e-7 units
// above the ground — the floor floated ~230 eye-heights OVERHEAD.
// The world was literally upside down (ground in the sky), and with
// a featureless ceiling overhead plus a walker-locked sky, walking
// produced zero visible motion. Two fixes:
//   1. The lift now scales with the shrink (microDiscLiftU) — the
//      floor is underfoot again at every scale.
//   2. The disc carries a fine grain texture sized in WALKER metres
//      (microGrainTileU) and anchored to the world: as the walker
//      moves, the texture offset compensates the disc's follow, so
//      the ground pattern stays fixed to the Earth and streams past
//      underfoot — motion you can SEE, on foot and on the bike.
export function MicroGroundDisc() {
  const meshRef = useRef();
  const matRef = useRef();
  const texRef = useRef(null);
  const anchorRef = useRef(null); // { lat, lon, east, north, offU, offV }
  const colorRef = useRef({ key: '', color: new THREE.Color('#3a5f2a') });

  // Grain texture: near-white speckle so the terrain tint (material
  // color) multiplies through. Built client-side only.
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 987654321;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // Fine grain: thousands of 1-2px motes across a WIDE value
    // range (round 4, defect 3): the old 150-250-on-#ececec grain
    // multiplied by the near-white polar tint averaged to a flat
    // white void on screen — the contrast was there in the file
    // and invisible in the world. The range now runs dark enough
    // (100-240, plus a dark speckle pass at 55-110) that the
    // ground keeps visible texture after the terrain tint and
    // the scene lighting have their way with it.
    for (let i = 0; i < 3200; i++) {
      const g = 100 + Math.floor(rnd() * 140);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 500; i++) {
      const g = 55 + Math.floor(rnd() * 55);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // Soft blotches for larger-scale variation.
    for (let i = 0; i < 22; i++) {
      const g = 175 + Math.floor(rnd() * 60);
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 10 + rnd() * 30;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${g},${g},${g},0.35)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    texRef.current = tex;
    if (matRef.current) {
      matRef.current.map = tex;
      matRef.current.needsUpdate = true;
    }
    return () => {
      tex.dispose();
      texRef.current = null;
    };
  }, []);

  // Disc-scale mottling (round 4, defect 3): the grain texture is
  // sized in WALKER metres (one tile = 3 m of the traveler's own
  // scale), so across most of the visible floor — an expanse of
  // hundreds of thousands of walker-metres — it mip-averages to
  // its mean value and the realm's floor reads as a flat void no
  // matter the grain's contrast. A second, LOW-frequency layer
  // lives in the vertex colors instead: two octaves of hashed
  // cells (~1/8 and ~1/25 of the disc across) tinting 0.72–1.0,
  // structure at the scale the eye can actually resolve from
  // inside the realm. The disc geometry is a ring grid (see the
  // JSX) precisely so it HAS interior vertices to carry this.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (geo.getAttribute('color')) return;
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const cellHash = (cx, cy) => {
      let x = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) >>> 0;
      x = (x ^ (x >>> 13)) >>> 0;
      x = Math.imul(x, 1274126177) >>> 0;
      return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + MICRO_DISC_RADIUS_U;
      const y = pos.getY(i) + MICRO_DISC_RADIUS_U;
      const coarse = cellHash(Math.floor(x / 0.0125), Math.floor(y / 0.0125));
      const fine = cellHash(Math.floor(x / 0.004), Math.floor(y / 0.004));
      const v = 0.72 + 0.19 * coarse + 0.09 * fine;
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (matRef.current) {
      matRef.current.vertexColors = true;
      matRef.current.needsUpdate = true;
    }
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scale = parachuteState?.scale || 1;
    const micro = scale < 0.5;
    const on = micro && roamState.active;
    mesh.visible = !!on;
    if (!on) {
      anchorRef.current = null;
      return;
    }

    const { lat, lon } = roamState;
    const r = surfaceRadiusOrBase(lat, lon) + microDiscLiftU(scale);
    const p = latLonToVec3(lat, lon, r);
    mesh.position.set(p.x, p.y, p.z);

    // Lie flat on the local tangent plane.
    const frame = tangentFrame(lat, lon);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const north = new THREE.Vector3(frame.north.x, frame.north.y, frame.north.z);
    const east = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
    const basis = new THREE.Matrix4().makeBasis(east, north, normal);
    mesh.quaternion.setFromRotationMatrix(basis);

    // World-anchored grain: the disc follows the walker, so shift
    // the texture by the walker's displacement from the anchor —
    // the pattern then belongs to the Earth, not to the disc, and
    // walking (or riding) visibly moves the ground.
    const tex = texRef.current;
    if (tex) {
      const tileU = microGrainTileU(scale);
      tex.repeat.setScalar((2 * MICRO_DISC_RADIUS_U) / tileU);
      let a = anchorRef.current;
      if (!a) {
        a = { lat, lon, east: frame.east, north: frame.north, offU: 0, offV: 0 };
        anchorRef.current = a;
      }
      const pa = latLonToVec3(a.lat, a.lon, r);
      let dE = (p.x - pa.x) * a.east.x + (p.y - pa.y) * a.east.y + (p.z - pa.z) * a.east.z;
      let dN = (p.x - pa.x) * a.north.x + (p.y - pa.y) * a.north.y + (p.z - pa.z) * a.north.z;
      if (Math.hypot(dE, dN) > 0.005) {
        // Re-anchor before the tangent frame drifts: fold the
        // travelled displacement into the accumulated offset so
        // the pattern never jumps.
        a = {
          lat, lon, east: frame.east, north: frame.north,
          offU: a.offU + dE / tileU, offV: a.offV + dN / tileU,
        };
        anchorRef.current = a;
        dE = 0;
        dN = 0;
      }
      const wrap01 = (x) => ((x % 1) + 1) % 1;
      tex.offset.set(wrap01(a.offU + dE / tileU), wrap01(a.offV + dN / tileU));
    }

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
      {/* Ring grid, not a fan: interior vertices carry the
          disc-scale vertex mottling (see the effect above). The
          UVs stay planar over the bounding square, so the grain
          texture math is unchanged. */}
      <ringGeometry args={[0, MICRO_DISC_RADIUS_U, 48, 6]} />
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
