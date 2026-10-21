// components/BikeRig.jsx
// The user's TRON bike, parked just outside the constellation of satellites
// in the launcher home scene — directly ahead of the spawn viewpoint, so
// it's the first thing seen on load.
//
// Uses the existing WispBike model from components/nova/TronBikes.jsx
// (the same bike family flown in nova/argo/myriad), nose pointing +Z toward
// the constellation center. The bike idles with a gentle hover bob; the
// "Spawn to Bike" button flies the camera into the rider position.
//
// First step toward the queued mounted-rider work: for now the camera rides
// the bike (no visible rider yet — that comes later).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WispBike } from './nova/TronBikes';
import {
  BIKE_PARK_POS,
  RIDER_OFFSET,
  BIKE_LOOK_AHEAD,
} from '@/lib/god-orbits';
import { makeStormWrapCanvas } from '@/lib/olympus-storm-wrap';

export { BIKE_PARK_POS, RIDER_OFFSET, BIKE_LOOK_AHEAD };

function makeRideLabelTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = '800 40px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = ctx.measureText('YOUR RIDE').width + 56;
  ctx.beginPath();
  ctx.roundRect(256 - w / 2, 12, w, 72, 18);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('YOUR RIDE', 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// "Olympus Storm" livery for the hub bike (Merlin, 2026-10-21): the
// procedural wrap from lib/olympus-storm-wrap.js as a CanvasTexture.
// Per-instance — the Earth Wisp keeps its own shared brand wrap.
function makeStormTexture() {
  const c = makeStormWrapCanvas();
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export default function BikeRig({ bikeRef }) {
  const beaconRef = useRef();
  const [labelTex, setLabelTex] = useState(null);
  const [stormTex, setStormTex] = useState(null);

  useEffect(() => {
    const t = makeRideLabelTexture();
    setLabelTex(t);
    return () => t.dispose();
  }, []);

  useEffect(() => {
    const t = makeStormTexture();
    setStormTex(t);
    return () => {
      if (t) t.dispose();
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (bikeRef.current) {
      if (bikeRef.current.userData.flying) {
        // Mounted flight: SequenceController owns position/heading. The rig
        // only keeps the beacon/label alive — never fight the flight model.
      } else {
        // Gentle parked hover around wherever the bike was left (baseY is
        // set on dismount; initially the park spot). x/z stay pinned.
        const baseY =
          bikeRef.current.userData.baseY !== undefined
            ? bikeRef.current.userData.baseY
            : BIKE_PARK_POS[1];
        bikeRef.current.position.y = baseY + Math.sin(t * 1.1) * 0.35;
        bikeRef.current.rotation.z = Math.sin(t * 0.7) * 0.03;
      }
    }
    if (beaconRef.current) {
      const s = 1 + Math.sin(t * 2.4) * 0.16;
      beaconRef.current.scale.set(s, s, 1);
      beaconRef.current.material.opacity = 0.4 + Math.sin(t * 2.4) * 0.15;
    }
  });

  return (
    <group ref={bikeRef} position={BIKE_PARK_POS}>
      {/* Olympus Storm wrap — Merlin 2026-10-21: the hub bike wears its
          own livery (violet-black, molten-gold Greek key, cyan light
          lines). The cyan accent color drives the stripe / engine / pod
          glows so the wrap's pinstripes echo the bike's own light. */}
      <WispBike color="#00e5ff" wrapTexture={stormTex} />
      {/* Landing beacon: a soft pulsing ring under the bike so the parked
          ride reads instantly as the thing to walk toward. */}
      <mesh ref={beaconRef} position={[0, -0.7, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.7, 2.1, 48]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      {labelTex && (
        <sprite position={[0, 3.6, 0]} scale={[13, 2.44, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} fog={false} />
        </sprite>
      )}
    </group>
  );
}
