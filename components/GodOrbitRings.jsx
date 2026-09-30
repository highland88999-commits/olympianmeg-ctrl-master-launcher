// components/GodOrbitRings.jsx
// The hub's physical satellite constellation: EXACTLY 10 satellites — one per
// god menu — evenly spaced (36° apart) on 10 orbit rings around ORBIT_CENTER.
//
// - The whole assembly rotates AS ONE UNIT about the polar (Y) axis,
//   OPPOSITE Earth's spin (Earth: +0.05 rad/s; rings: rotation.y goes
//   negative at RING_SPIN). The analytic orbitPositionFor() in
//   lib/god-orbits.js mirrors this exactly.
// - Each satellite hull is UV-mapped with its god menu's self-hosted banner
//   art (public/textures/menus/<god>/banner.*) — proper exterior graphics,
//   never plain glowing orbs. Lighting is kept modest so the wraps read.
// - Satellites are solid: each registers a sphere collider in the hub
//   collision registry (bounce/deflect, never kill).
// - VISUAL/PHYSICAL ONLY. Program navigation lives in the floating
//   satellite menu; the rings no longer launch anything.

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import {
  GOD_BANDS,
  ORBIT_CENTER,
  RING_SPIN,
  orbitTime,
  menuSatellitePosition,
} from '@/lib/god-orbits';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';

const SAT_RADIUS = 2.6;

function useBannerTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        setTex(t);
      },
      undefined,
      () => {
        if (alive) setTex(null);
      }
    );
    return () => {
      alive = false;
      setTex((prev) => {
        if (prev) prev.dispose();
        return null;
      });
    };
  }, [url]);
  return tex;
}

function HubSatellite({ band, index }) {
  const tex = useBannerTexture(band.texture);
  const angle = band.phase;
  const R = band.radius;

  // Solid satellite: register a live sphere collider at the analytic
  // position (matches the rendered transform exactly).
  useEffect(() => {
    registerCollider(
      `hubsat-${band.god}`,
      () => menuSatellitePosition(index, orbitTime()),
      SAT_RADIUS + 0.9
    );
    return () => unregisterCollider(`hubsat-${band.god}`);
  }, [band.god, index]);

  const hullMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex || null,
        color: tex ? '#ffffff' : band.color,
        roughness: 0.65,
        metalness: 0.15,
        // Gentle god-color sheen — never enough to wash out the wrap.
        emissive: new THREE.Color(band.color),
        emissiveIntensity: tex ? 0.12 : 0.55,
      }),
    [tex, band.color]
  );
  useEffect(() => () => hullMat.dispose(), [hullMat]);

  return (
    <group rotation={[0, 0, band.tiltRad]}>
      {/* Orbit ring */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[R, 0.14, 8, 160]} />
        <meshBasicMaterial color={band.color} transparent opacity={0.45} />
      </mesh>
      {/* The satellite, fixed at its even-spacing angle */}
      <group position={[R * Math.cos(angle), 0, R * Math.sin(angle)]}>
        <mesh>
          <sphereGeometry args={[SAT_RADIUS, 32, 24]} />
          <primitive object={hullMat} attach="material" />
        </mesh>
        {/* Equatorial accent ring in the god's color */}
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[SAT_RADIUS + 0.55, 0.09, 8, 64]} />
          <meshBasicMaterial color={band.color} fog={false} />
        </mesh>
        {/* God-name marker */}
        <Billboard position={[0, SAT_RADIUS + 1.7, 0]}>
          <Text
            fontSize={1.7}
            color={band.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {band.label}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

export default function GodOrbitRings() {
  const spinRef = useRef();

  useFrame(() => {
    // One unit, counter-rotating against Earth's +Y spin. Driven from the
    // shared orbitTime() clock so orbitPositionFor() always agrees.
    if (spinRef.current) spinRef.current.rotation.y = -RING_SPIN * orbitTime();
  });

  return (
    <group
      ref={spinRef}
      position={[ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z]}
    >
      {GOD_BANDS.map((band, i) => (
        <HubSatellite key={band.god} band={band} index={i} />
      ))}
    </group>
  );
}
