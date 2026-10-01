"use client";
import React, { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, Environment } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const DeathStar = ({ onActivate }) => {
    const [exploded, setExploded] = useState(false);
    const dsRef = useRef();
    const beamRef = useRef();
    const explosionRef = useRef();

    useFrame((state) => {
        if (!exploded) {
            // Spin the Death Star slowly
            if (dsRef.current) dsRef.current.rotation.y += 0.002;
            
            // Pulse the charging beam
            if (beamRef.current) {
                beamRef.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 15) * 0.2;
                beamRef.current.material.emissiveIntensity = 2 + Math.sin(state.clock.elapsedTime * 8) * 2;
            }
        } else {
            // Implode the Death Star geometry
            if (dsRef.current) dsRef.current.scale.setScalar(THREE.MathUtils.lerp(dsRef.current.scale.x, 0, 0.15));
            
            // Explode the shockwave outward while fading it out
            if (explosionRef.current) {
                explosionRef.current.scale.setScalar(THREE.MathUtils.lerp(explosionRef.current.scale.x, 40, 0.15));
                explosionRef.current.material.opacity = THREE.MathUtils.lerp(explosionRef.current.material.opacity, 0, 0.08);
            }
        }
    });

    const triggerExplosion = (e) => {
        e.stopPropagation();
        if (exploded) return;
        setExploded(true);
        
        // Wait for shockwave to pass the camera, then open the Holoframe website
        setTimeout(() => {
            onActivate();
            setTimeout(() => setExploded(false), 2000); // Reset for next time
        }, 800);
    };

    return (
        <group position={[0, 0, 0]}>
            {/* The Death Star Entity */}
            <group ref={dsRef} onPointerDown={triggerExplosion}>
                <mesh>
                    <sphereGeometry args={[4, 64, 64]} />
                    <meshStandardMaterial color="#555" metalness={0.7} roughness={0.5} />
                </mesh>
                {/* Equatorial Trench */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[4.05, 0.1, 32, 128]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                {/* Superlaser Dish */}
                <mesh position={[2.5, 2, 2.5]} rotation={[Math.PI / 4, 0, Math.PI / 4]}>
                    <cylinderGeometry args={[1.2, 1.2, 0.5, 32]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                {/* Charging Beam */}
                <mesh ref={beamRef} position={[4.5, 3.5, 4.5]} rotation={[Math.PI / 4, 0, Math.PI / 4]}>
                    <cylinderGeometry args={[0.15, 0.8, 6, 16]} />
                    <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={3} transparent opacity={0.8} />
                </mesh>
            </group>

            {/* Explosion Shockwave Sphere */}
            <mesh ref={explosionRef} scale={0.01}>
                <sphereGeometry args={[1, 64, 64]} />
                <meshBasicMaterial color="#ff0044" transparent opacity={1} side={THREE.DoubleSide} />
            </mesh>
            
            {/* Debris Sparkles */}
            {exploded && <Sparkles count={800} scale={50} size={15} color="#ffaa00" speed={4} />}
        </group>
    );
};

export default function DeathStarScene({ onOpenFullscreen }) {
    return (
        <div style={{ width: "100%", height: "100%", background: "#010102", cursor: "crosshair" }}>
            <Canvas camera={{ position: [0, 2, 15], fov: 55 }} shadows gl={{ antialias: true, alpha: false }}>
                <color attach="background" args={["#010102"]} />
                <fog attach="fog" args={["#010102", 10, 40]} />
                
                <ambientLight intensity={0.2} />
                <directionalLight position={[10, 10, 5]} intensity={1.5} color="#ffffff" />
                <pointLight position={[-10, -10, -5]} intensity={0.5} color="#0088ff" />
                
                <DeathStar onActivate={onOpenFullscreen} />
                
                {/* Distant Space Stars */}
                <Sparkles count={2000} scale={60} size={1} speed={0.1} opacity={0.5} color="#ffffff" />
                
                <Environment preset="night" />
                
                <EffectComposer disableNormalPass>
                    <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
                </EffectComposer>
                
                <OrbitControls maxPolarAngle={Math.PI / 1.5} minDistance={6} maxDistance={25} enablePan={false} dampingFactor={0.05} />
            </Canvas>
        </div>
    );
}
