'use client';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useVideoTexture, Sparkles, OrbitControls } from '@react-three/drei';

export default function BillboardUniverseScene() {
    const videoTex = useVideoTexture('/media/skyscraper/dwurko.mp4', { muted: true, loop: true, playsInline: true });
    videoTex.colorSpace = THREE.SRGBColorSpace;
    
    const controlsRef = useRef();
    const matrixRef = useRef();

    const billboards = useMemo(() => {
        const items = [];
        const radius = 60;
        const count = 32;
        for (let i = 0; i < count; i++) {
            const theta = (i / count) * Math.PI * 2;
            const y = (Math.random() - 0.5) * 80;
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;
            
            items.push({
                position: [x, y, z],
                rotation: [0, -theta + Math.PI / 2, 0], 
                scale: [32, 18, 1], 
                lightIntensity: 2 + Math.random() * 3
            });
        }
        return items;
    }, []);

    useFrame((state, delta) => {
        // 🚀 BOUNDARY ENGINE (Prevents flying out into the empty void)
        const boundary = 300;
        const camPos = state.camera.position;
        camPos.x = Math.max(-boundary, Math.min(boundary, camPos.x));
        camPos.y = Math.max(-boundary, Math.min(boundary, camPos.y));
        camPos.z = Math.max(-boundary, Math.min(boundary, camPos.z));

        if (controlsRef.current) {
            // Target locked to the core so the user perfectly orbits the cylinder
            controlsRef.current.target.set(0, 0, 0); 
        }

        if (matrixRef.current) {
            matrixRef.current.rotation.y += delta * 0.05; 
            matrixRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 5; 
        }
    });

    return (
        <group>
            <OrbitControls ref={controlsRef} enablePan={false} enableZoom={true} minDistance={10} maxDistance={250} />
            <fog attach="fog" args={["#010204", 20, 400]} />
            <ambientLight intensity={0.2} />

            <group ref={matrixRef}>
                {billboards.map((b, i) => (
                    <group key={i} position={b.position} rotation={b.rotation}>
                        <mesh scale={b.scale} dispose={null}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial map={videoTex} transparent opacity={0.9} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
                        </mesh>
                        <pointLight color="#00e5ff" intensity={b.lightIntensity} distance={100} position={[0, 0, 2]} />
                    </group>
                ))}
            </group>

            <Sparkles count={2000} scale={[400, 400, 400]} size={4} color="#00ffff" opacity={0.4} speed={0.5} />
        </group>
    );
}
