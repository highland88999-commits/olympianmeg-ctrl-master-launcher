import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { fx } from '@/lib/fx';

export default function RedwaterQuicksand({ playerPosition, onTeleportNYC }) {
  const { camera } = useThree();
  const [isFalling, setIsFalling] = useState(false);
  const [fallProgress, setFallProgress] = useState(0);
  const [reward, setReward] = useState(null);
  const quicksandTexRef = useRef(null);

  // Initialize the slow-upward sand video texture
  useEffect(() => {
    const video = document.createElement('video');
    video.src = '/media/quicksand_texture.mp4'; // The compact sand video
    video.loop = true;
    video.muted = true;
    video.play();
    const texture = new THREE.VideoTexture(video);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    quicksandTexRef.current = texture;
  }, []);

  // Trigger detection
  useFrame((state, delta) => {
    if (isFalling) {
      // Scroll the texture UP to create the illusion of falling DOWN
      if (quicksandTexRef.current) {
        quicksandTexRef.current.offset.y += delta * 0.5;
      }
      
      // Calculate depth (2km drop)
      setFallProgress((prev) => {
        const next = prev + delta * 50; // Fall speed
        if (next >= 2000 && !reward) {
          claimCoreReward();
        }
        return next;
      });

      // Shake camera during descent
      const shake = Math.sin(state.clock.elapsedTime * 20) * 0.1;
      camera.position.x += shake;
    } else {
      // Check if player walks over the pit (Assuming pit is at x: 100, z: -50 in Redwater)
      const dist = Math.hypot(playerPosition.x - 100, playerPosition.z + 50);
      if (dist < 3.0) {
        setIsFalling(true);
        fx.playAudio('quicksand_sink');
      }
    }
  });

  const claimCoreReward = async () => {
    const { data, error } = await supabase.rpc('claim_redwater_core');
    if (!error && data) {
      setReward(data); // 'gold_bar' or 'diamond_sniper'
      setTimeout(() => {
        onTeleportNYC(); // Trigger the portal logic to NYC
      }, 5000);
    }
  };

  if (!isFalling) {
    return (
      <mesh position={[100, 0.01, -50]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial map={quicksandTexRef.current} color="#aa7744" />
      </mesh>
    );
  }

  return (
    <group position={[100, -fallProgress, -50]}>
      {/* The 2KM Descent Tunnel */}
      <mesh position={[0, 1000, 0]}>
        <cylinderGeometry args={[5, 5, 2000, 16]} />
        {/* Replace with your unique rock/gem textures */}
        <meshStandardMaterial map={quicksandTexRef.current} side={THREE.BackSide} />
      </mesh>
      
      {/* The Core Chamber */}
      {fallProgress >= 1990 && (
        <group position={[0, -10, 0]}>
          <ambientLight intensity={2} color="#ff3300" />
          <mesh>
            <sphereGeometry args={[20, 32, 32]} />
            <meshStandardMaterial color="#220000" side={THREE.BackSide} roughness={0.9} />
          </mesh>
          
          {/* Reward Display */}
          {reward && (
            <mesh position={[0, 0, -5]}>
              <boxGeometry args={[1, 0.5, 2]} />
              <meshStandardMaterial color={reward === 'gold_bar' ? "#ffd700" : "#00ffff"} metalness={1} roughness={0.1} />
            </mesh>
          )}

          {/* NYC Portal */}
          {reward && (
            <mesh position={[0, 2, -10]}>
              <circleGeometry args={[2, 32]} />
              <meshBasicMaterial color="#00f2ff" />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}
