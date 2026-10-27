import { useState, useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

function ZeusAdPanel({ onLaunchExternal, adTex }) {
  const [hovered, setHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  
  const stakeUrl = 'https://stake.com/?c=1FofAXWx';

  const handleStakeClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    onLaunchExternal(stakeUrl);
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
        <meshBasicMaterial color="#00f2ff" />
      </mesh>

      <group 
        position={[0, -1.8, 0.11]} 
        onClick={handleStakeClick}
        onPointerOver={() => { setBtnHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setBtnHovered(false); document.body.style.cursor = 'default'; }}
      >
        <mesh>
          <boxGeometry args={[3.8, 0.8, 0.1]} />
          <meshStandardMaterial color={btnHovered ? "#ffffff" : "#00f2ff"} emissive="#00f2ff" emissiveIntensity={btnHovered ? 0.8 : 0.4} />
        </mesh>
        <Text position={[0, 0, 0.06]} fontSize={0.35} color="#000000" fontWeight="bold">ENTER NOW</Text>
      </group>

    </group>
  );
}

function Zeus({ position, onLaunchExternal, textures }) {
  const satelliteRef = useRef();
  useFrame((state, delta) => {
    if (satelliteRef.current) {
      satelliteRef.current.rotation.y += delta * 0.15; 
      satelliteRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime) * 0.5; 
    }
  });

  const { propTex, bodyTex, hullTex, tailTex, adTex } = textures;
  const darkMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.9, roughness: 0.2, emissive: '#121214', emissiveIntensity: 0.5 }), []);

  return (
    <group position={position}>
      <group ref={satelliteRef} scale={[0.8, 0.8, 0.8]}>
        
        <Billboard position={[0, 16, 0]}>
          <Text fontSize={1.6} color="#00f2ff" letterSpacing={0.2} fontWeight="bold">
            GAMES
          </Text>
        </Billboard>

        <mesh position={[0, 0, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 24, 32]} />
          <meshStandardMaterial map={bodyTex} color="#ffffff" metalness={0.6} roughness={0.4} emissive="#222222" emissiveIntensity={0.5} />
          
          <Text position={[0, 2, 2.55]} fontSize={1.5} color="#00f2ff" letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, 0, -Math.PI / 2]}>ZEUS</Text>
          <Text position={[0, 2, -2.55]} fontSize={1.5} color="#00f2ff" letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, Math.PI, Math.PI / 2]}>ZEUS</Text>
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
              <ZeusAdPanel onLaunchExternal={onLaunchExternal} adTex={adTex} />
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
export default memo(Zeus);
