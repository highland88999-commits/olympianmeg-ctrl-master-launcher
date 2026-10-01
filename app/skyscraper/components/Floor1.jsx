'use client';
import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture, useVideoTexture, Html, Text, Sparkles } from '@react-three/drei';
import { AdaptivePOM } from './POMMaterial';

// OPTIMIZATION: Preload the heavy exterior texture so it caches before the user even reaches this floor
useTexture.preload('/media/skyscraper/0s2n0h.png');

const StaticPoster = ({ url }) => {
    const tex = useTexture(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return <meshBasicMaterial map={tex} side={THREE.DoubleSide} />;
};

const VideoPoster = ({ url }) => {
    const tex = useVideoTexture(url, { muted: true, loop: true, playsInline: true });
    tex.colorSpace = THREE.SRGBColorSpace;
    return <meshBasicMaterial map={tex} side={THREE.DoubleSide} />;
};

const HoloPortal = ({ url, videoUrl, fallbackUrl, position, rotation, isMobile }) => {
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsActive(true);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <group position={position} rotation={rotation}>
            <mesh>
                <planeGeometry args={[60, 60]} />
                {isActive ? (
                    <meshBasicMaterial color={0x000000} side={THREE.DoubleSide} />
                ) : (
                    isMobile ? <StaticPoster url={fallbackUrl} /> : <VideoPoster url={videoUrl} />
                )}
            </mesh>

            {isActive && (
                <Html 
                    transform 
                    occlude 
                    zIndexRange={[50, 0]} 
                    // Perfectly maps a 1920px CSS div to a 60-unit Three.js plane
                    scale={60 / 1920} 
                    // Placed perfectly flush against the plane (0.05 units off to prevent Z-fighting)
                    position={[0, 0, 0.05]} 
                >
                    <div style={{ width: '1920px', height: '1920px', backgroundColor: '#000', overflow: 'hidden', pointerEvents: 'auto', display: 'flex' }}>
                        <iframe 
                            src={url} 
                            style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent', pointerEvents: 'auto' }} 
                        />
                    </div>
                </Html>
            )}
        </group>
    );
};

const VortexExit = ({ onExit }) => {
    const ringRef = useRef();
    
    useFrame((state, delta) => {
        if (ringRef.current) {
            ringRef.current.rotation.z -= delta * 1.5;
        }
    });

    return (
        <group position={[0, 0, 29.9]} rotation={[0, Math.PI, 0]}>
            <mesh position={[0, 5, 0]}>
                <planeGeometry args={[12, 12]} />
                <meshBasicMaterial color="#000000" />
            </mesh>

            <group position={[0, 5, 0.2]}>
                <Sparkles count={200} scale={[10, 10, 2]} size={6} speed={1.5} color="#00ffff" opacity={0.8} />
                <Sparkles count={100} scale={[6, 6, 2]} size={4} speed={3} color="#39ff14" opacity={0.8} />
                <mesh ref={ringRef}>
                    <torusGeometry args={[3.5, 0.05, 16, 100]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
                </mesh>
            </group>

            <Text 
                position={[0, 12.5, 0.3]} 
                fontSize={1.8} 
                color="#ff0000" 
                letterSpacing={0.2}
                anchorX="center" 
                anchorY="middle"
            >
                EXIT
                <meshBasicMaterial color="#ff0000" toneMapped={false} />
            </Text>

            <mesh position={[0, 5, 0.5]} onClick={(e) => { e.stopPropagation(); onExit(); }}>
                <planeGeometry args={[12, 12]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
        </group>
    );
};

const ExtShell = () => {
    const extTex = useTexture('/media/skyscraper/0s2n0h.png');
    extTex.wrapS = extTex.wrapT = THREE.RepeatWrapping; 
    extTex.repeat.set(4, 4);
    return <meshBasicMaterial map={extTex} side={THREE.DoubleSide} />;
};

export default function Floor1({ elevation, isMobile, setCurrentFloor }) {
    return (
        <group position-y={elevation}>
            <mesh position={[0, 30, 0]}>
                <boxGeometry args={[60.2, 60.2, 60.2]} />
                <ExtShell />
            </mesh>

            <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[60, 60]} />
                <AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/4ab3h5.mp4" scale={0.03} />
            </mesh>
            <mesh rotation-x={Math.PI / 2} position-y={60}>
                <planeGeometry args={[60, 60]} />
                <AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="https://files.catbox.moe/h7317z.mp4" scale={0.03} />
            </mesh>

            <HoloPortal 
                url="https://georgia-aquarium.vercel.app" 
                videoUrl="/media/skyscraper/aaqd8a.mp4" 
                fallbackUrl="/media/skyscraper/fwv664.jpeg" 
                position={[0, 30, -30]} 
                rotation={[0, 0, 0]} 
                isMobile={isMobile} 
            />

            <VortexExit onExit={() => setCurrentFloor(0)} />
        </group>
    );
}
