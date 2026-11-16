'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getParticleTexture } from '@/lib/particles/sprites';
import { skyPalette } from '@/lib/aethelgard/data';

// AETHELGARD sky — the flat background colour is gone. A vertex-colour
// gradient dome (Star Wars CGI idiom: bottom -> horizon -> top, BackSide,
// fog off, depthWrite off, renderOrder -1) plus a visible SUN disc with
// a glow sprite and a MOON disc for the night. All emissive basic
// materials — no new real lights anywhere.
//
// Colours come from the live sky palette: zenith = sky.bg, horizon =
// sky.fog, below-horizon = fog darkened toward black. Sun position
// comes from sky.sunPos; the moon rides the sun's arc half a day
// later (skyPalette(t + 0.5)).

const DOME_RADIUS = 380;
const SUN_DIST = 360;
const MOON_DIST = 360;

function domeColors(geo, topHex, horHex, botHex) {
  const top = new THREE.Color(topHex);
  const hor = new THREE.Color(horHex);
  const bot = new THREE.Color(botHex);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / DOME_RADIUS + 1) / 2; // 0 bottom .. 1 top
    if (y01 < 0.5) c.copy(bot).lerp(hor, y01 * 2);
    else c.copy(hor).lerp(top, (y01 - 0.5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function discQuaternion(dir) {
  // Face the disc toward the origin: its +Z normal points at -dir.
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    dir.clone().negate(),
  );
}

export default function SkyDome({ sky, timeOfDay = 0.32 }) {
  // Colour the dome at creation, not in an effect: vertexColors with
  // no color attribute yet would paint the first frame black.
  // The effect below keeps the colours live as the palette moves.
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(DOME_RADIUS, 28, 16);
    const fog = new THREE.Color(sky.fog);
    domeColors(g, sky.bg, sky.fog, `#${fog.clone().multiplyScalar(0.35).getHexString()}`);
    return g;
    // Initial palette only — the effect re-colours on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowTex = useMemo(() => getParticleTexture('glow'), []);

  // Recolour the dome when the palette moves; the geometry itself
  // lives for the life of the component and is disposed on unmount.
  useEffect(() => {
    const fog = new THREE.Color(sky.fog);
    const bot = fog.clone().multiplyScalar(0.35);
    domeColors(geo, sky.bg, sky.fog, `#${bot.getHexString()}`);
  }, [geo, sky.bg, sky.fog]);
  useEffect(() => () => { geo.dispose(); }, [geo]);

  const sun = useMemo(() => {
    const dir = new THREE.Vector3(...sky.sunPos).normalize();
    return {
      pos: dir.clone().multiplyScalar(SUN_DIST),
      quat: discQuaternion(dir),
      opacity: Math.max(0, Math.min(1, sky.day)),
    };
  }, [sky.sunPos, sky.day]);

  const moon = useMemo(() => {
    const night = skyPalette(((timeOfDay + 0.5) % 1 + 1) % 1);
    const dir = new THREE.Vector3(...night.sunPos).normalize();
    return {
      pos: dir.clone().multiplyScalar(MOON_DIST),
      quat: discQuaternion(dir),
      opacity: Math.max(0, Math.min(1, 1 - sky.day)),
    };
  }, [timeOfDay, sky.day]);

  // Keep the dome centred on the walker: the camera roams ±170 m,
  // the dome is 380 m — recentring is cheap insurance against ever
  // poking a camera through the shell in fly mode.
  const domeRef = useRef(null);
  useFrame(({ camera }) => {
    if (domeRef.current) domeRef.current.position.copy(camera.position);
  });

  return (
    <group>
      <mesh ref={(m) => { domeRef.current = m; }} geometry={geo} frustumCulled={false} renderOrder={-1}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {/* sun disc + glow, riding the palette's sun arc */}
      <mesh position={sun.pos} quaternion={sun.quat}>
        <circleGeometry args={[13, 32]} />
        <meshBasicMaterial color="#fff3cf" transparent opacity={sun.opacity}
          fog={false} depthWrite={false} />
      </mesh>
      <sprite position={sun.pos} scale={[110, 110, 1]}>
        <spriteMaterial map={glowTex} color="#ffe9a8" transparent
          opacity={0.45 * sun.opacity} blending={THREE.AdditiveBlending}
          depthWrite={false} fog={false} />
      </sprite>
      {/* moon disc for the night */}
      <mesh position={moon.pos} quaternion={moon.quat}>
        <circleGeometry args={[9, 32]} />
        <meshBasicMaterial color="#dfe8ff" transparent opacity={moon.opacity}
          fog={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
