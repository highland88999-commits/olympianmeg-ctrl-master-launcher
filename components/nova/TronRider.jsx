// components/nova/TronRider.jsx — The mounted rider for the TRON bike garage.
//
// A lightweight procedural rider (low-poly, neon TRON lines, no external
// assets) seated in riding pose on any of the three tron bikes: pelvis on
// the seat behind the canopy, torso leaning forward, arms to the grips,
// knees bent into the frame. Shares the bikes' design language so it reads
// as one machine: dark suit, glowing trim, glass visor.
//
// Profile hookup: on mount it reads the universal /profile character
// (lib/profile riderTheme — suit/helmet/glow colors) and the display name
// or callsign for the floating name tag. No profile yet -> the tasteful
// DEFAULT_RIDER_THEME fallback (lib/tron-rider.js), no tag.
//
// Lighting rule honored: all glow is meshBasicMaterial geometry, localized
// on the rider — no bloom, no point lights, nothing that can wash out the
// backdrop. Reduced motion: the rider is fully static when `reduced` is
// true; otherwise a gentle idle bob keeps the bike feeling alive.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { loadProfile, riderTheme } from '@/lib/profile';
import { riderFitFor, riderTagText, DEFAULT_RIDER_THEME } from '@/lib/tron-rider';

// Canvas name tag: dark pill with the rider's name, plain white text.
function makeTagTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '700 52px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(500, ctx.measureText(text).width + 72);
  ctx.fillStyle = 'rgba(2,6,16,0.62)';
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 20, w, 88, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 20, w, 88, 22);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 66, w - 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Bone: a low-poly limb segment from `from` to `to` (bike-local coords).
function Bone({ from, to, r, suitColor }) {
  const { mid, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(from[0], from[1], from[2]);
    const b = new THREE.Vector3(to[0], to[1], to[2]);
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 0.001);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize()
    );
    const mid = a.clone().add(b).multiplyScalar(0.5);
    return { mid, quat, len };
  }, [from, to]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[r, r * 0.85, len, 8]} />
      <meshStandardMaterial color={suitColor} roughness={0.65} metalness={0.15} />
    </mesh>
  );
}

// Torso group: leaning forward toward the nose (+Z), neon spine stripe.
function Torso({ suitColor, glowColor }) {
  return (
    <group position={[0, 1.62, -0.18]} rotation={[0.38, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.4, 0.62, 0.32]} />
        <meshStandardMaterial color={suitColor} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* neon spine stripe — local glow, no lights, no bloom */}
      <mesh position={[0, 0.02, 0.165]}>
        <boxGeometry args={[0.08, 0.5, 0.02]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.85} />
      </mesh>
      {/* chest light bar */}
      <mesh position={[0, 0.22, 0.14]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.26, 0.05, 0.02]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// Helmet: dark dome, glass visor facing +Z, thin glow rim.
function Helmet({ helmetColor, glowColor }) {
  return (
    <group position={[0, 2.02, 0.02]}>
      <mesh>
        <sphereGeometry args={[0.22, 18, 14]} />
        <meshStandardMaterial color={helmetColor} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* visor */}
      <mesh position={[0, 0.01, 0.17]}>
        <boxGeometry args={[0.28, 0.11, 0.05]} />
        <meshPhysicalMaterial color="#0a1420" metalness={0.9} roughness={0.08} />
      </mesh>
      {/* glow rim around the visor edge */}
      <mesh position={[0, 0.01, 0.185]}>
        <boxGeometry args={[0.32, 0.025, 0.012]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export default function TronRider({ bikeKey = 'wisp', reduced = false }) {
  const bob = useRef(null);
  const fit = riderFitFor(bikeKey);
  const [theme, setTheme] = useState(DEFAULT_RIDER_THEME);
  const [tag, setTag] = useState('');
  const [tagTex, setTagTex] = useState(null);

  // Read the /profile character on mount (client-only; loadProfile is
  // localStorage-backed and defensive, so this is free outside tests).
  useEffect(() => {
    const p = loadProfile();
    setTheme(riderTheme(p));
    setTag(riderTagText(p));
  }, []);

  useEffect(() => {
    if (!tag) return;
    const tex = makeTagTexture(tag);
    setTagTex(tex);
    return () => tex.dispose();
  }, [tag]);

  // Idle life: a gentle hover bob and sway — fully static when the user
  // has reduced motion on (the parent rig still carries the rider with
  // the bike, so the rider never drifts from the seat).
  useFrame((state) => {
    const g = bob.current;
    if (!g) return;
    if (reduced) {
      g.position.y = 0;
      g.rotation.z = 0;
      return;
    }
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 2.2) * 0.045;
    g.rotation.z = Math.sin(t * 1.7) * 0.02;
  });

  const { suit, helmet, glow } = theme;
  return (
    <group position={[0, fit.dy, fit.dz]} scale={fit.scale}>
      <group ref={bob}>
        {/* hips on the seat, just behind the canopy */}
        <mesh position={[0, 1.22, -0.42]}>
          <boxGeometry args={[0.34, 0.28, 0.32]} />
          <meshStandardMaterial color={suit} roughness={0.65} metalness={0.15} />
        </mesh>
        <Torso suitColor={suit} glowColor={glow} />
        <Helmet helmetColor={helmet} glowColor={glow} />
        {/* arms: shoulders to the handlebar grips */}
        {[-1, 1].map((s) => (
          <Bone key={`arm-${s}`} from={[s * 0.24, 1.74, -0.06]} to={[s * 0.17, 1.28, 0.52]} r={0.075} suitColor={suit} />
        ))}
        {/* gloves */}
        {[-1, 1].map((s) => (
          <mesh key={`glove-${s}`} position={[s * 0.17, 1.26, 0.54]}>
            <sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color={helmet} roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* thighs: hips forward to the knees tucked by the frame */}
        {[-1, 1].map((s) => (
          <Bone key={`thigh-${s}`} from={[s * 0.15, 1.16, -0.34]} to={[s * 0.24, 0.82, 0.2]} r={0.105} suitColor={suit} />
        ))}
        {/* calves: knees down to the foot pegs */}
        {[-1, 1].map((s) => (
          <Bone key={`calf-${s}`} from={[s * 0.24, 0.82, 0.2]} to={[s * 0.25, 0.66, -0.12]} r={0.085} suitColor={suit} />
        ))}
        {/* boots on the pegs */}
        {[-1, 1].map((s) => (
          <mesh key={`boot-${s}`} position={[s * 0.25, 0.64, -0.06]}>
            <boxGeometry args={[0.12, 0.1, 0.3]} />
            <meshStandardMaterial color={helmet} roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* name tag above the helmet — profile name/callsign only */}
        {tagTex && (
          <sprite position={[0, 2.52, -0.02]} scale={[3.2, 0.8, 1]}>
            <spriteMaterial map={tagTex} transparent depthWrite={false} fog={false} />
          </sprite>
        )}
      </group>
    </group>
  );
}
