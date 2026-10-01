'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';

export default function EternalFlame({ position }) {
    const coreRef = useRef();

    useFrame(({ clock }) => {
        if (coreRef.current) {
            coreRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.1);
        }
    });

    return (
        <group position={position}>
            {/* The Obsidian Pedestal */}
            <mesh position={[0, 2, 0]}>
                <cylinderGeometry args={[3, 4, 4, 8]} />
                <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.1} />
            </mesh>

            <mesh position={[0, 4.5, 0]}>
                <cylinderGeometry args={[2.5, 3, 1, 8]} />
                <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.4} />
            </mesh>

            {/* The Flame Particles */}
            <Sparkles position={[0, 8, 0]} count={150} scale={[4, 8, 4]} size={8} speed={3} color="#ffaa00" opacity={0.8} />
            <Sparkles position={[0, 9, 0]} count={100} scale={[2, 6, 2]} size={5} speed={4} color="#ff3300" opacity={0.9} />

            {/* The Pulsing Core */}
            <mesh ref={coreRef} position={[0, 6, 0]}>
                <sphereGeometry args={[1.5, 16, 16]} />
                <meshBasicMaterial color="#ffaa00" />
            </mesh>

            {/* Localized Ground Illumination */}
            <pointLight position={[0, 8, 0]} color="#ffaa00" intensity={1.5} distance={15} decay={2} />
        </group>
    );
}
