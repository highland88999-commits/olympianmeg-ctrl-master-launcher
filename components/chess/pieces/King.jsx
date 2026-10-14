import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';

export default function King({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, kingHoleTex, kingAsteroidTex, onClick }) {
  const meshRef = useRef();
  const asteroidRef = useRef();
  const blackHoleRef = useRef();
  const points = useGeometryStore(state => state.king);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const target = new THREE.Vector3(gridX - 3.5, 0.25, gridZ - 3.5);
    const dist2D = Math.hypot(meshRef.current.position.x - target.x, meshRef.current.position.z - target.z);

    if (isAlive) {
      target.y = 0.25;
      meshRef.current.position.lerp(target, delta * 6);

      if (dist2D > 0.1) {
        asteroidRef.current.position.y -= delta * 15;
        asteroidRef.current.rotation.x += delta * 10; 
        asteroidRef.current.rotation.y += delta * 10;
        blackHoleRef.current.scale.lerp(new THREE.Vector3(2, 2, 2), delta * 5);
      } else {
        asteroidRef.current.position.y = 5; 
        asteroidRef.current.rotation.set(0, 0, 0); 
        blackHoleRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 10);
      }
    } else {
      meshRef.current.position.y -= delta * 2;
      meshRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 3);
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
      <mesh ref={asteroidRef} position={[0, 5, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color={kingAsteroidTex ? "#ffffff" : "#ffd700"} map={kingAsteroidTex || null} />
      </mesh>
      <mesh ref={blackHoleRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} scale={0}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color={kingHoleTex ? "#ffffff" : "#000000"} map={kingHoleTex || null} />
      </mesh>
    </group>
  );
}


