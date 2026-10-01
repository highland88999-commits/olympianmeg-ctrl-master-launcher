'use client';
import { useRef, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

export default function ProceduralRoads({ gridSize = 40, blockSize = 100, roadWidth = 12 }) {
    const roadRef = useRef();

    // Generates the horizontal and vertical road network
    const { count, transforms } = useMemo(() => {
        const positions = [];
        const half = Math.floor(gridSize / 2);
        
        for (let x = -half; x <= half; x++) {
            // Horizontal Avenues
            positions.push({
                pos: [0, 0.1, x * blockSize],
                scale: [gridSize * blockSize, 1, roadWidth]
            });
            // Vertical Streets
            positions.push({
                pos: [x * blockSize, 0.1, 0],
                scale: [roadWidth, 1, gridSize * blockSize]
            });
        }
        return { count: positions.length, transforms: positions };
    }, [gridSize, blockSize, roadWidth]);

    useLayoutEffect(() => {
        if (!roadRef.current) return;
        const dummy = new THREE.Object3D();
        transforms.forEach((t, i) => {
            dummy.position.set(...t.pos);
            dummy.scale.set(...t.scale);
            // Rotate the plane to lay flat on the ground
            dummy.rotation.x = -Math.PI / 2;
            dummy.updateMatrix();
            roadRef.current.setMatrixAt(i, dummy.matrix);
        });
        roadRef.current.instanceMatrix.needsUpdate = true;
    }, [transforms]);

    return (
        <instancedMesh ref={roadRef} args={[null, null, count]}>
            <planeGeometry args={[1, 1]} />
            {/* The light-up road material */}
            <meshStandardMaterial 
                color="#001133" 
                emissive="#0088ff" 
                emissiveIntensity={0.3} 
                transparent 
                opacity={0.8} 
                depthWrite={false} 
            />
        </instancedMesh>
    );
}
