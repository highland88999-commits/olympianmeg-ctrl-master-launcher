import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function Knight({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, onClick }) {
  const meshRef = useRef();
  const points = useGeometryStore(state => state.knight);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);
    
    if (isAlive) {
      if (dist2D > 0.1) {
        target.y = 0.25 + dist2D * 1.5; 
        meshRef.current.position.lerp(target, delta * 8);
      } else {
        target.y = 0.25 + Math.sin(state.clock.elapsedTime * 2 + gridZ) * 0.05; 
        meshRef.current.position.lerp(target, delta * 15); 
      }
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(1.5, 0.05, 1.5), delta * 12);
      meshRef.current.position.lerp(new THREE.Vector3(target.x, -0.2, target.z), delta * 5); 
    }
  });

  const activeTex = team === 'cyan' ? cyanSkinTex : pinkSkinTex;
  const wireColor = team === 'cyan' ? '#00f3ff' : '#ff2a85';

  return (
    <group ref={meshRef} onClick={onClick}>
      <mesh>
        <latheGeometry args={[points, 32]} />
        <meshStandardMaterial color="#111111" emissive="#ffffff" emissiveMap={activeTex || null} map={activeTex || null} emissiveIntensity={isSelected ? 2.5 : 1.2} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]}>
         <latheGeometry args={[points, 32]} />
         <meshBasicMaterial color={wireColor} wireframe transparent opacity={isSelected ? 0.8 : 0.25} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}


