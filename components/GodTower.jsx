// components/GodTower.jsx
// One tower satellite per god-menu category — the Zeus.jsx pattern,
// parameterized the way Merlin described it: copy Zeus, change the name
// and the color, one for each of the categories in the menu (2026-09-30).
//
// Each tower carries the full native ad inventory (four stake.com panels +
// "Advertise Here" slots) — Merlin's own placements, never removed.
// Towers are solid: each registers its own sphere collider (bounce/deflect,
// never kill). They bob gently and rotate slowly, Zeus-style.

'use client';
import { useState, useRef, useMemo, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';

function GodAdPanel({ onLaunchExternal, adTex, color }) {
  const [hovered, setHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [emailHovered, setEmailHovered] = useState(false);

  const stakeUrl = 'https://stake.com/?c=1FofAXWx';
  const inquiriesEmail = 'olympianmeg@gmail.com';

  const handleStakeClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    onLaunchExternal(stakeUrl);
  };

  const handleEmailClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    window.location.href = `mailto:${inquiriesEmail}`;
  };

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[4.2, 7.2, 0.2]} />
        <meshStandardMaterial color="#222222" metalness={0.8} roughness={0.4} emissive="#121214" emissiveIntensity={0.5} />
      </mesh>

      <mesh
        position={[0, 1, 0.11]}
        onClick={handleStakeClick}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[3.8, 4.5]} />
        <meshStandardMaterial map={adTex} color={hovered ? "#dddddd" : "#ffffff"} metalness={0.2} roughness={0.8} />
      </mesh>

      <mesh position={[0, 1, 0.1]}>
        <planeGeometry args={[4.0, 4.7]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <group
        position={[0, -1.8, 0.11]}
        onClick={handleStakeClick}
        onPointerOver={() => { setBtnHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setBtnHovered(false); document.body.style.cursor = 'default'; }}
      >
        <mesh>
          <boxGeometry args={[3.8, 0.8, 0.1]} />
          <meshStandardMaterial color={btnHovered ? "#ffffff" : color} emissive={color} emissiveIntensity={btnHovered ? 0.8 : 0.4} />
        </mesh>
        <Text position={[0, 0, 0.06]} fontSize={0.35} color="#000000" fontWeight="bold">ENTER NOW</Text>
      </group>

      <group
        position={[0, -2.8, 0.11]}
        onClick={handleEmailClick}
        onPointerOver={() => { setEmailHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setEmailHovered(false); document.body.style.cursor = 'default'; }}
      >
        <mesh>
          <planeGeometry args={[3.8, 0.6]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.6} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.25} color={emailHovered ? "#ffffff" : "#aaaaaa"}>Advertise Here: Email Us</Text>
      </group>
    </group>
  );
}

function GodTower({ god, color, position, onLaunchExternal, textures }) {
  const satelliteRef = useRef();
  useFrame((state, delta) => {
    if (satelliteRef.current) {
      satelliteRef.current.rotation.y += delta * 0.15;
      // Bob around the mount point (inner group is already inside the
      // positioned outer group — offsetting by position[1] again would float
      // the tower at twice its height, away from its collider).
      satelliteRef.current.position.y = Math.sin(state.clock.elapsedTime + position[0]) * 0.5;
    }
  });

  // Solid: generous sphere covering the body + the four ad panels.
  useEffect(() => {
    registerCollider(`tower-${god}`, () => ({ x: position[0], y: position[1], z: position[2] }), 11);
    return () => unregisterCollider(`tower-${god}`);
  }, [god, position]);

  const { propTex, bodyTex, hullTex, tailTex, adTex } = textures;
  const darkMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.9, roughness: 0.2, emissive: '#121214', emissiveIntensity: 0.5 }), []);

  return (
    <group position={position}>
      <group ref={satelliteRef} scale={[0.8, 0.8, 0.8]}>

        <Billboard position={[0, 16, 0]}>
          <Text fontSize={1.6} color={color} letterSpacing={0.2} fontWeight="bold">
            {god}
          </Text>
        </Billboard>

        <mesh position={[0, 0, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 24, 32]} />
          <meshStandardMaterial map={bodyTex} color="#ffffff" metalness={0.6} roughness={0.4} emissive="#222222" emissiveIntensity={0.5} />

          <Text position={[0, 2, 2.55]} fontSize={1.5} color={color} letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, 0, -Math.PI / 2]}>{god}</Text>
          <Text position={[0, 2, -2.55]} fontSize={1.5} color={color} letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, Math.PI, Math.PI / 2]}>{god}</Text>
        </mesh>

        <mesh position={[0, -2, 0]} receiveShadow>
          <cylinderGeometry args={[4.5, 3.5, 8, 8, 1, true]} />
          <meshStandardMaterial map={hullTex} metalness={0.9} roughness={0.1} side={THREE.DoubleSide} color="#ffffff" transparent={true} opacity={0.35} depthWrite={false} emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        <mesh position={[0, -12, 0]} receiveShadow>
          <cylinderGeometry args={[3.5, 4.5, 2, 8, 1, true]} />
          <meshStandardMaterial map={tailTex} metalness={0.8} roughness={0.3} side={THREE.DoubleSide} color="#ffffff" emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => (
          <group key={`ad-${i}`} rotation={[0, angle, 0]}>
            <group position={[0, -1, 5.0]}>
              <GodAdPanel onLaunchExternal={onLaunchExternal} adTex={adTex} color={color} />
            </group>
          </group>
        ))}

        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((rot, i) => (
          <group key={`prop-${i}`} position={[0, 12, 0]} rotation={[0, rot, 0]}>
            <mesh position={[0, 0, 5.5]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
              <boxGeometry args={[1.5, 9, 0.1]} />
              <meshStandardMaterial map={propTex} metalness={0.6} roughness={0.4} color="#ffffff" emissive="#222222" emissiveIntensity={0.5} />
            </mesh>
            <mesh material={darkMetal} position={[0, 0, 1.5]} receiveShadow><cylinderGeometry args={[0.1, 0.1, 3]} rotation={[Math.PI / 2, 0, 0]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// Memoized around the ad inventory (stake.com panels inside) — internals untouched.
export default memo(GodTower);
