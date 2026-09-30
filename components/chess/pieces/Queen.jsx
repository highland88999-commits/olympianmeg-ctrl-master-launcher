import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function Queen({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, queenSwordTex, onClick }) {
  const meshRef = useRef();
  const swordRef = useRef();
  const points = useGeometryStore(state => state.queen);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);

    if (isAlive) {
      target.y = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.position.lerp(target, delta * 9);

      if (dist2D > 0.1) {
        swordRef.current.scale.set(1, 1, 1);
        swordRef.current.rotation.z -= delta * 15; 
      } else {
        swordRef.current.scale.lerp(new THREE.Vector3(0,0,0), delta * 10);
        swordRef.current.rotation.z = Math.PI / 4; 
      }
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 8);
    }
  });

  const activeTex = team === 'cyan' ? cyanSkinTex : pinkSkinTex;
  const wireColor = team === 'cyan' ? '#00f2ff' : '#ff2a85';

  return (
    <group ref={meshRef} onClick={onClick}>
      <mesh>
        <latheGeometry args={[points, 32]} />
        <meshStandardMaterial color="#121214" emissive="#ffffff" emissiveMap={activeTex || null} map={activeTex || null} emissiveIntensity={isSelected ? 2.5 : 1.2} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]}>
         <latheGeometry args={[points, 32]} />
         <meshBasicMaterial color={wireColor} wireframe transparent opacity={isSelected ? 0.8 : 0.25} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={swordRef} position={[0, 1.5, 0]} rotation={[0, 0, Math.PI/4]} scale={0}>
        <mesh position={[1, 0, 0]}>
           <cylinderGeometry args={[0.08, 0.15, 2.8, 16]} />
           <meshBasicMaterial color="#ffffff" map={queenSwordTex || null} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}


