'use client';
import { useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, useVideoTexture, Html } from '@react-three/drei';
import { AdaptivePOM } from './POMMaterial';
import CityViewWindow from './CityViewWindow';

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

const Portal = ({ url, videoUrl, fallbackUrl, position, rotation, isMobile }) => {
    const { camera } = useThree();
    const [isActive, setIsActive] = useState(false);

    useFrame(() => {
        const dist = Math.hypot(camera.position.x - position[0], camera.position.z - position[2]);
        if (dist < 20 && !isActive) setIsActive(true);
        if (dist >= 20 && isActive) setIsActive(false);
    });

    return (
        <group position={position} rotation={rotation}>
            {isActive ? (
                <mesh>
                    <planeGeometry args={[60, 60]} />
                    <meshBasicMaterial color={0x000000} opacity={0} transparent blending={THREE.NoBlending} side={THREE.DoubleSide} />
                </mesh>
            ) : (
                <mesh>
                    <planeGeometry args={[60, 60]} />
                    {isMobile ? <StaticPoster url={fallbackUrl} /> : <VideoPoster url={videoUrl} />}
                </mesh>
            )}

            {isActive && (
                // CRITICAL MATH LOCK: 1920px * (60 / 1920) = Exactly 60 WebGL Units
                <Html transform scale={60 / 1920} position={[0, 0, 0.1]}>
                    <div style={{ width: '1920px', height: '1920px', backgroundColor: '#000', display: 'block' }}>
                        <iframe src={url} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
                    </div>
                </Html>
            )}
        </group>
    );
};

const ExtShell = () => {
    const extTex = useTexture('/media/skyscraper/0s2n0h.png');
    extTex.wrapS = extTex.wrapT = THREE.RepeatWrapping; extTex.repeat.set(4, 4);
    return <meshBasicMaterial map={extTex} side={THREE.DoubleSide} />;
};

export default function Floor2({ elevation, isMobile }) {
    return (
        <group position-y={elevation}>
            <mesh position={[0, 30, 0]}>
                <boxGeometry args={[60.2, 60.2, 60.2]} />
                <ExtShell />
            </mesh>

            <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[60, 60]} />
                <AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/mun0ip.mp4" scale={0.03} />
            </mesh>
            <mesh rotation-x={Math.PI / 2} position-y={60}>
                <planeGeometry args={[60, 60]} />
                <AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/mun0ip.mp4" scale={0.03} />
            </mesh>

            <Portal url="https://valkyries-of-olympus.vercel.app" videoUrl="/media/skyscraper/jbl8mg.mp4" fallbackUrl="/media/skyscraper/fwv664.jpeg" position={[0, 30, -30]} rotation={[0, 0, 0]} isMobile={isMobile} />

            {/* CGI: the city far below, seen from inside the tower —
                the height you can feel. Portal wall (z=-30) untouched;
                windows hang on the side walls. */}
            <CityViewWindow position={[29.7, 30, 0]} rotation={[0, -Math.PI / 2, 0]} />
            <CityViewWindow position={[-29.7, 30, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>
    );
}
