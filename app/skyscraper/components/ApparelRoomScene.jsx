"use client";
import React, { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Sparkles, Environment, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const Magic8Vortex = ({ onActivate }) => {
    const ring1 = useRef();
    const ring2 = useRef();
    const core = useRef();
    const [hover, setHover] = useState(false);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        // Swirling vortex math
        if (ring1.current) {
            ring1.current.rotation.x = t * 1.5;
            ring1.current.rotation.y = t * 2.2;
            ring1.current.scale.setScalar(hover ? 1.2 : 1);
        }
        if (ring2.current) {
            ring2.current.rotation.x = -t * 1.2;
            ring2.current.rotation.z = t * 1.8;
            ring2.current.scale.setScalar(hover ? 1.2 : 1);
        }
        if (core.current) {
            core.current.rotation.y = t * 0.5;
            core.current.position.y = 4 + Math.sin(t * 2) * 0.2;
        }
    });

    return (
        <group 
            position={[0, 0, 0]} 
            onPointerOver={() => setHover(true)}
            onPointerOut={() => setHover(false)}
            onPointerDown={(e) => { e.stopPropagation(); onActivate(); }}
            style={{ cursor: 'pointer' }}
        >
            <group ref={core}>
                {/* The 8-Ball Core */}
                <mesh>
                    <sphereGeometry args={[2, 64, 64]} />
                    <meshStandardMaterial color="#050505" roughness={0.1} metalness={0.9} />
                </mesh>

                {/* The '8' Symbol */}
                <group position={[0, 0, 2]}>
                    <mesh>
                        <circleGeometry args={[0.7, 32]} />
                        <meshBasicMaterial color="#ffffff" />
                    </mesh>
                    <Text position={[0, 0, 0.01]} fontSize={0.9} color="#000000" fontWeight="bold">
                        8
                    </Text>
                </group>

                {/* Swirling Portal Rings */}
                <mesh ref={ring1}>
                    <torusGeometry args={[2.6, 0.05, 16, 100]} />
                    <meshBasicMaterial color="#d4af37" transparent opacity={0.8} />
                </mesh>
                <mesh ref={ring2}>
                    <torusGeometry args={[2.9, 0.08, 16, 100]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
                </mesh>

                <Sparkles count={150} scale={6} size={3} speed={2} color="#d4af37" />
            </group>
        </group>
    );
};

const ChangeRoomEnvironment = () => {
    return (
        <group>
            {/* Mirrored Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#111" roughness={0.05} metalness={0.9} />
            </mesh>

            {/* Back Change-Room Mirror */}
            <mesh position={[0, 10, -15]} receiveShadow>
                <boxGeometry args={[40, 20, 1]} />
                <meshStandardMaterial color="#c0c0c0" metalness={1} roughness={0} />
            </mesh>

            {/* Glowing Strip Lights */}
            <mesh position={[-15, 10, -14.4]}>
                <boxGeometry args={[0.5, 20, 0.5]} />
                <meshStandardMaterial color="#d4af37" emissive="#d4af37" emissiveIntensity={2} />
            </mesh>
            <mesh position={[15, 10, -14.4]}>
                <boxGeometry args={[0.5, 20, 0.5]} />
                <meshStandardMaterial color="#d4af37" emissive="#d4af37" emissiveIntensity={2} />
            </mesh>

            {/* Display Pedestal */}
            <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[4, 5, 1, 64]} />
                <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 1.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <ringGeometry args={[3.8, 4, 64]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </mesh>
        </group>
    );
};

export default function ApparelRoomScene({ onOpenFullscreen }) {
    return (
        <div style={{ width: "100%", height: "100%", background: "#050508", cursor: "crosshair" }}>
            <Canvas camera={{ position: [0, 6, 16], fov: 55 }} shadows gl={{ antialias: true, alpha: false }}>
                <color attach="background" args={["#050508"]} />
                <fog attach="fog" args={["#050508", 10, 50]} />

                <ambientLight intensity={0.5} />
                <spotLight position={[0, 20, 10]} intensity={100} color="#ffffff" penumbra={0.5} castShadow />
                <pointLight position={[0, 5, 5]} intensity={20} color="#d4af37" distance={20} />

                <ChangeRoomEnvironment />
                <Magic8Vortex onActivate={onOpenFullscreen} />

                <Environment preset="city" />

                <EffectComposer disableNormalPass>
                    <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
                </EffectComposer>

                <OrbitControls maxPolarAngle={Math.PI / 2 - 0.1} minDistance={5} maxDistance={30} enablePan={false} dampingFactor={0.05} />
            </Canvas>
        </div>
    );
}
