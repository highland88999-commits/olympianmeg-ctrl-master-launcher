"use client";
import React, { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useSceneContextGuard } from "@/components/SceneContextGuard";
import { OrbitControls, useVideoTexture, Text, Sparkles, Environment } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// 🚀 THE CLICKABLE EYE OF OLYMPUS (PORTAL)
const HologramPortal = ({ onActivate }) => {
    const coreRef = useRef();
    const ring1Ref = useRef();
    const ring2Ref = useRef();
    const [hover, setHover] = useState(false);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const bounce = Math.sin(t * 2) * 5;
        
        if (coreRef.current) {
            coreRef.current.rotation.x = t * 1.5;
            coreRef.current.rotation.y = t * 1.2;
            coreRef.current.position.y = 50 + bounce;
            coreRef.current.scale.setScalar(hover ? 1.5 : 1);
        }
        if (ring1Ref.current) {
            ring1Ref.current.rotation.y = t;
            ring1Ref.current.position.y = 50 + bounce;
            ring1Ref.current.scale.setScalar(hover ? 1.2 : 1);
        }
        if (ring2Ref.current) {
            ring2Ref.current.rotation.y = -t;
            ring2Ref.current.position.y = 50 + bounce;
            ring2Ref.current.scale.setScalar(hover ? 1.2 : 1);
        }
    });

    return (
        <group 
            onPointerOver={() => setHover(true)} 
            onPointerOut={() => setHover(false)} 
            onPointerDown={(e) => { e.stopPropagation(); onActivate(); }}
            style={{ cursor: 'pointer' }}
        >
            <mesh ref={coreRef}>
                <octahedronGeometry args={[15, 0]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2.0} wireframe />
            </mesh>
            <mesh ref={ring1Ref}>
                <torusGeometry args={[30, 1, 16, 64]} />
                <meshBasicMaterial color="#00ffff" />
            </mesh>
            <mesh ref={ring2Ref} rotation-x={Math.PI / 2}>
                <torusGeometry args={[30, 1, 16, 64]} />
                <meshBasicMaterial color="#ff00ff" />
            </mesh>
            
            <pointLight position={[0, 50, 0]} color="#00ffff" intensity={200} distance={400} />
            
            {hover && (
                <Text position={[0, 100, 0]} fontSize={12} color="#00ffff" letterSpacing={0.2} fontWeight="bold">
                    ENTER COLOSSUS
                </Text>
            )}
        </group>
    );
};

const ArenaArchitecture = ({ energyTex }) => {
    const obsidianMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.4, metalness: 0.9 }), []);
    const neonCyanMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x00ffff }), []);
    const neonPinkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xff00ff }), []);

    // Instanced Rings for Tiers
    return (
        <group>
            {/* Tier 1 - Cyan */}
            <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[740, 810, 64]} />
                <meshBasicMaterial color="#00ffff" />
            </mesh>
            {/* Tier 2 - Pink */}
            <mesh position={[0, 120, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[700, 770, 64]} />
                <meshBasicMaterial color="#ff00ff" />
            </mesh>
            {/* Tier 3 - Cyan */}
            <mesh position={[0, 240, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[660, 730, 64]} />
                <meshBasicMaterial color="#00ffff" />
            </mesh>
            {/* Top Crown */}
            <mesh position={[0, 370, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[700, 10, 16, 64]} />
                <primitive object={obsidianMat} />
            </mesh>
            
            {/* Inner Wall */}
            <mesh position={[0, 120, 0]}>
                <cylinderGeometry args={[400, 400, 240, 64, 1, true]} />
                <primitive object={obsidianMat} />
            </mesh>

            {/* Glowing Pit Floor */}
            <mesh position={[0, 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[400, 64]} />
                <meshStandardMaterial map={energyTex} emissiveMap={energyTex} emissive="#ff4400" emissiveIntensity={1.5} color="#ff4400" />
            </mesh>
        </group>
    );
};

export default function ColosseumScene({ onOpenFullscreen }) {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'COLOSSEUM' });
    const skyTex = useVideoTexture('/media/skyscraper/YTDown.com_Shorts_above-the-clouds-sunset-ethereal-ocean-v_Media_FfDVZAOQIio_001_1080p.mp4', { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    const floorTex = useVideoTexture('/media/skyscraper/gemini_generated_video_B04513D4.mp4', { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    const energyTex = useVideoTexture('/media/skyscraper/4ab3h5.mp4', { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });

    skyTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.colorSpace = THREE.SRGBColorSpace;
    energyTex.colorSpace = THREE.SRGBColorSpace;
    
    floorTex.wrapS = floorTex.wrapT = THREE.MirroredRepeatWrapping;
    floorTex.repeat.set(16, 16);
    energyTex.wrapS = energyTex.wrapT = THREE.MirroredRepeatWrapping;
    energyTex.repeat.set(2, 2);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        energyTex.offset.y = t * 0.1;
        energyTex.offset.x = Math.sin(t * 0.05) * 0.1;
    });

    return (
        <div style={{ width: "100%", height: "100%", background: "#010103", cursor: "crosshair" }}>
            <Canvas camera={{ position: [0, 80, 350], fov: 60 }} gl={{ antialias: true, powerPreference: "high-performance" }} onCreated={sceneGuard.onCreated}>
                <fogExp2 attach="fog" args={[0x010103, 0.0008]} />
                
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 50, 0]} color="#ff4400" intensity={400} distance={1500} />
                <directionalLight position={[-500, 800, 500]} color="#ffd700" intensity={2.5} />

                {/* Sky Sphere */}
                <mesh>
                    <sphereGeometry args={[4500, 64, 32]} />
                    <meshBasicMaterial map={skyTex} side={THREE.BackSide} depthWrite={false} />
                </mesh>

                {/* Ocean/Grid Floor */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[6000, 6000]} />
                    <meshStandardMaterial map={floorTex} emissive="#ffffff" emissiveMap={floorTex} emissiveIntensity={0.1} roughness={0.3} metalness={0.9} />
                </mesh>

                <ArenaArchitecture energyTex={energyTex} />
                <HologramPortal onActivate={onOpenFullscreen} />

                {/* Swirling Sparkles */}
                <Sparkles count={4000} scale={[800, 400, 800]} position={[0, 200, 0]} size={8} speed={0.4} color="#ffd700" opacity={0.6} />

                <EffectComposer disableNormalPass>
                    <Bloom luminanceThreshold={0.3} mipmapBlur intensity={2.2} />
                </EffectComposer>

                <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={10} maxDistance={600} enablePan={false} dampingFactor={0.05} target={[0, 50, 0]} />
            </Canvas>
        </div>
    );
}
