'use client';
import { memo } from 'react';
import * as THREE from 'three';

const TensegrityBuilding = memo(({ width, height, color }) => {
    return (
        <group>
            <mesh position={[0, 1, 0]}>
                <boxGeometry args={[width, 2, width]} />
                <meshStandardMaterial color="#0a0a0f" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, height / 2, 0]}>
                <cylinderGeometry args={[2, 2, height]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} transparent opacity={0.3} />
            </mesh>
            <mesh position={[0, height, 0]}>
                <octahedronGeometry args={[width * 0.6]} />
                <meshStandardMaterial color="#111" wireframe={false} metalness={0.9} roughness={0.1} />
                <lineSegments>
                    <edgesGeometry args={[new THREE.OctahedronGeometry(width * 0.6)]} />
                    <lineBasicMaterial color={color} />
                </lineSegments>
            </mesh>
            <lineSegments position={[0, height / 2, 0]}>
                <edgesGeometry args={[new THREE.ConeGeometry(width * 0.8, height, 4)]} />
                <lineBasicMaterial color={color} transparent opacity={0.4} />
            </lineSegments>
        </group>
    );
});

TensegrityBuilding.displayName = 'TensegrityBuilding';
export default TensegrityBuilding;
