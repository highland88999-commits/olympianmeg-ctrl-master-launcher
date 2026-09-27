import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function Bishop({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, bishopBookTex, onClick }) {
  const meshRef = useRef();
  const strikesRef = useRef();
  const points = useGeometryStore(state => state.bishop);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);

    if (isAlive) {
      target.y = 0.35 + Math.sin(state.clock.elapsedTime * 4) * 0.05; 
      meshRef.current.position.lerp(target, delta * 7);

      if (dist2D > 0.1) {
        strikesRef.current.rotation.y += delta * 20;
        strikesRef.current.scale.setScalar(1);
      } else {
        strikesRef.current.scale.lerp(new THREE.Vector3(0,0,0), delta * 15);
      }
    } else {
      const shake = (Math.sin(state.clock.elapsedTime * 50)) * 0.1;
      meshRef.current.position.x += shake;
      meshRef.current.scale.lerp(new THREE.Vector3(0.1, 2, 0.1), delta * 6);
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
      <group ref={strikesRef} scale={0} position={[0, 1, 0]}>
        {[0,1,2,3,4].map((i) => (
           <mesh key={i} position={[Math.cos(i)*0.8, (i*0.2)-0.4, Math.sin(i)*0.8]}><boxGeometry args={[0.3, 0.05, 0.3]} /><meshBasicMaterial color="#ffffff" map={bishopBookTex || null} /></mesh>
        ))}
      </group>
    </group>
  );
}


