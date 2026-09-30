import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function Pawn({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, pawnLaserTex, onClick }) {
  const meshRef = useRef();
  const laserRef = useRef();
  const bleedRef = useRef();
  const points = useGeometryStore(state => state.pawn);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);
    
    if (isAlive) {
      target.y = 0.25 + Math.sin(state.clock.elapsedTime * 3 + gridX) * 0.035;
      if (dist2D > 0.05) {
        meshRef.current.lookAt(target.x, meshRef.current.position.y, target.z);
        laserRef.current.scale.set(1, 1, 1);
        laserRef.current.position.z -= delta * 20; 
        laserRef.current.children[0].rotation.y += delta * 40;
      } else {
        laserRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 15);
        laserRef.current.position.z = 0;
      }
      meshRef.current.position.lerp(target, delta * 8);
    } else {
      meshRef.current.position.lerp(new THREE.Vector3(target.x, -1, target.z), delta * 3);
      meshRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 5);
      bleedRef.current.scale.lerp(new THREE.Vector3(2, 2, 2), delta * 2);
      if (bleedRef.current.material) {
        bleedRef.current.material.opacity = Math.max(0, bleedRef.current.material.opacity - delta * 0.5); 
      }
    }
  });

  const activeTex = team === 'cyan' ? cyanSkinTex : pinkSkinTex;
  const wireColor = team === 'cyan' ? '#00f2ff' : '#ff2a85';
  const laserColor = pawnLaserTex ? '#ffffff' : (team === 'cyan' ? '#00f2ff' : '#ff0055');

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
      <group ref={laserRef} position={[0, 1, 0]} scale={0} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 1.5, 16]} />
          <meshBasicMaterial color={laserColor} map={pawnLaserTex || null} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <mesh ref={bleedRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} scale={0}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}


