import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function Rook({ team, gridX, gridZ, isAlive, isSelected, isAttacking, cyanSkinTex, pinkSkinTex, rookWallTex, onClick }) {
  const meshRef = useRef();
  const wallsRef = useRef();
  const points = useGeometryStore(state => state.rook);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);
    
    if (isAlive) {
      target.y = 0.25; 
      meshRef.current.position.lerp(target, delta * 12); 
      
      if (isAttacking && dist2D > 0.1) {
         wallsRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 15);
      } else {
         wallsRef.current.scale.lerp(new THREE.Vector3(1, 0, 1), delta * 10);
      }
    } else {
      const shakeX = (Math.random() - 0.5) * 0.2;
      meshRef.current.position.lerp(new THREE.Vector3(target.x + shakeX, -1, target.z), delta * 3);
      meshRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 4);
    }
  });

  const activeTex = team === 'cyan' ? cyanSkinTex : pinkSkinTex;
  const wireColor = team === 'cyan' ? '#00f2ff' : '#ff2a85';
  const wallColor = rookWallTex ? "#ffffff" : "#ff3366";

  return (
    <group onClick={onClick}>
      <group ref={meshRef}>
        <mesh>
          <latheGeometry args={[points, 32]} />
          <meshStandardMaterial color="#121214" emissive="#ffffff" emissiveMap={activeTex || null} map={activeTex || null} emissiveIntensity={isSelected ? 2.5 : 1.2} roughness={0.4} metalness={0.1} />
        </mesh>
        <mesh scale={[1.02, 1.02, 1.02]}>
           <latheGeometry args={[points, 32]} />
           <meshBasicMaterial color={wireColor} wireframe transparent opacity={isSelected ? 0.8 : 0.25} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <group ref={wallsRef} scale={[1, 0, 1]} position={[gridX - 3.5, 1, gridZ - 3.5]}>
        <mesh position={[0.6, 0, 0]}><boxGeometry args={[0.1, 2, 1.2]} /><meshBasicMaterial color={wallColor} map={rookWallTex} transparent opacity={0.8} blending={THREE.AdditiveBlending}/></mesh>
        <mesh position={[-0.6, 0, 0]}><boxGeometry args={[0.1, 2, 1.2]} /><meshBasicMaterial color={wallColor} map={rookWallTex} transparent opacity={0.8} blending={THREE.AdditiveBlending}/></mesh>
        <mesh position={[0, 0, 0.6]}><boxGeometry args={[1.2, 2, 0.1]} /><meshBasicMaterial color={wallColor} map={rookWallTex} transparent opacity={0.8} blending={THREE.AdditiveBlending}/></mesh>
        <mesh position={[0, 0, -0.6]}><boxGeometry args={[1.2, 2, 0.1]} /><meshBasicMaterial color={wallColor} map={rookWallTex} transparent opacity={0.8} blending={THREE.AdditiveBlending}/></mesh>
      </group>
    </group>
  );
}


