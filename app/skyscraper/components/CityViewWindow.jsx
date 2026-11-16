'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { materialForSkyscraper } from '@/lib/skyscraper-cgi/textures.js';

// CGI (Nov 15, 2026): the tower interiors had no view out —
// four video-textured walls and no sense of the 480 m drop.
// A CityViewWindow hangs the night city far below on an interior
// wall: the street grid receding to a warm horizon haze, so the
// height can be felt from inside. The view is emissive (it glows
// like a lit city at night) and needs no new real light. Shared
// by Floor1, Floor2 and Floor3 so the three rooms match.
export default function CityViewWindow({ position = [0, 30, 0], rotation = [0, 0, 0], width = 40, height = 24 }) {
    const viewMat = useMemo(() => materialForSkyscraper('cityView', 'omega-tower-view', '#ffffff', {
        emissiveIntensity: 1.0,
    }), []);
    const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#0a0a0f', metalness: 0.8, roughness: 0.3,
        emissive: '#00f0ff', emissiveIntensity: 0.25,
    }), []);

    const barH = 0.8;
    const barV = 0.8;
    return (
        <group position={position} rotation={rotation}>
            <mesh material={viewMat} dispose={null}>
                <planeGeometry args={[width, height]} />
            </mesh>
            {/* Frame: top / bottom / left / right bars, thin cyan-lit steel. */}
            <mesh position={[0, height / 2 + barH / 2, 0.1]} material={frameMat} dispose={null}>
                <boxGeometry args={[width + barV * 2, barH, 0.4]} />
            </mesh>
            <mesh position={[0, -height / 2 - barH / 2, 0.1]} material={frameMat} dispose={null}>
                <boxGeometry args={[width + barV * 2, barH, 0.4]} />
            </mesh>
            <mesh position={[-width / 2 - barV / 2, 0, 0.1]} material={frameMat} dispose={null}>
                <boxGeometry args={[barV, height, 0.4]} />
            </mesh>
            <mesh position={[width / 2 + barV / 2, 0, 0.1]} material={frameMat} dispose={null}>
                <boxGeometry args={[barV, height, 0.4]} />
            </mesh>
        </group>
    );
}
