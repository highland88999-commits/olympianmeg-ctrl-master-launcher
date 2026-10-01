'use client';
import React, { useRef, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

export default function StreetLights({ gridSize = 40, blockSize = 100 }) {
    const postRef = useRef();
    const bulbRef = useRef();

    const { lightCount, positions } = useMemo(() => {
        const pos = [];
        const halfSize = (gridSize * blockSize) / 2;
        const step = blockSize / 2; // Places a lamp every 50 units

        for (let x = -halfSize; x <= halfSize; x += step) {
            for (let z = -halfSize; z <= halfSize; z += step) {
                // Only place lamps directly on the road boundary lines
                if (x % blockSize === 0 || z % blockSize === 0) {
                    // Prevent lamps from clipping into the Omega Tower at the exact dead center
                    if (Math.abs(x) < 50 && Math.abs(z) < 50) continue;
                    
                    // Offset by 6 units so they sit on the edge of the sidewalk, not the road center
                    pos.push(new THREE.Vector3(x + 6, 0, z + 6));
                }
            }
        }
        return { lightCount: pos.length, positions: pos };
    }, [gridSize, blockSize]);

    useLayoutEffect(() => {
        if (!postRef.current || !bulbRef.current) return;
        const dummy = new THREE.Object3D();
        
        positions.forEach((pos, i) => {
            // Position the metal post
            dummy.position.set(pos.x, 6, pos.z);
            dummy.updateMatrix();
            postRef.current.setMatrixAt(i, dummy.matrix);
            
            // Position the glowing bulb at the top of the post
            dummy.position.set(pos.x, 12.5, pos.z);
            dummy.updateMatrix();
            bulbRef.current.setMatrixAt(i, dummy.matrix);
        });
        
        postRef.current.instanceMatrix.needsUpdate = true;
        bulbRef.current.instanceMatrix.needsUpdate = true;
    }, [positions]);

    return (
        <group>
            {/* Draw Call 1: All metal posts */}
            <instancedMesh ref={postRef} args={[null, null, lightCount]}>
                <cylinderGeometry args={[0.2, 0.4, 12, 8]} />
                <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.2} />
            </instancedMesh>
            
            {/* Draw Call 2: All glowing neon bulbs */}
            <instancedMesh ref={bulbRef} args={[null, null, lightCount]}>
                <sphereGeometry args={[1, 16, 16]} />
                {/* Emissive basic material interacts perfectly with the Bloom post-processor */}
                <meshBasicMaterial color="#00ffff" />
            </instancedMesh>
        </group>
    );
}
