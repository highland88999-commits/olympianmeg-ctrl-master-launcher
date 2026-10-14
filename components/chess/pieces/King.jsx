import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGeometryStore } from '@/store/chess/useGeometryStore';
import CharacterGlb from '@/components/characters/CharacterGlb';

// WAVE 3 (characters-everywhere, decision D1 — KING ONLY): when
// kingCharacterId is set, the king is embodied as that roster
// character via the shared Wave 0 module — the GLB stands on the
// king's square at the native king's measured footprint, idle
// pose, riding this group's existing movement/death animation.
// The native lathe king stays visible until the model is ready
// (and forever if the load fails): fallback is the native body,
// never a hole. The asteroid + black-hole set pieces are the
// game's own FX and stay either way; a team-colour ring under the
// character carries the selected state the lathe's emissive
// used to show. All chess logic is untouched — visual swap only.
const KING_PROC_SIZE = { x: 0.62, y: 0.97, z: 0.62 }; // native king: Ø0.62 × 0.97 tall

export default function King({ team, gridX, gridZ, isAlive, isSelected, cyanSkinTex, pinkSkinTex, kingHoleTex, kingAsteroidTex, onClick, kingCharacterId = null }) {
  const meshRef = useRef();
  const asteroidRef = useRef();
  const blackHoleRef = useRef();
  const points = useGeometryStore(state => state.king);

  const [embReady, setEmbReady] = useState(false);
  const embHost = useMemo(() => new THREE.Group(), []);
  const embPose = useRef('idle');
  // Models face +X at rest: cyan's king faces the pink home rank
  // (+z), pink's faces −z.
  embHost.rotation.y = team === 'cyan' ? -Math.PI / 2 : Math.PI / 2;
  useEffect(() => { setEmbReady(false); }, [kingCharacterId]);

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
      <mesh visible={!embReady}>
        <latheGeometry args={[points, 32]} />
        <meshStandardMaterial color="#121214" emissive="#ffffff" emissiveMap={activeTex || null} map={activeTex || null} emissiveIntensity={isSelected ? 2.5 : 1.2} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh visible={!embReady} scale={[1.02, 1.02, 1.02]}>
         <latheGeometry args={[points, 32]} />
         <meshBasicMaterial color={wireColor} wireframe transparent opacity={isSelected ? 0.8 : 0.25} blending={THREE.AdditiveBlending} />
      </mesh>
      {kingCharacterId && (
        <>
          <primitive object={embHost} />
          <CharacterGlb
            characterId={kingCharacterId}
            host={embHost}
            poseRef={embPose}
            procSize={KING_PROC_SIZE}
            onReady={setEmbReady}
          />
        </>
      )}
      {embReady && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.45, 32]} />
          <meshBasicMaterial color={wireColor} transparent opacity={isSelected ? 0.95 : 0.4} toneMapped={false} />
        </mesh>
      )}
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


