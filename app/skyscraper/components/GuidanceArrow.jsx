'use client';
import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMapObjects } from './MapContext';

export default function GuidanceArrow() {
    const { camera } = useThree();
    const { selectedTarget } = useMapObjects();
    const arrowGroupRef = useRef();
    const arrowMeshRef = useRef();

    const targetPos = useMemo(() => new THREE.Vector3(), []);

    useFrame((state) => {
        if (!selectedTarget || !arrowGroupRef.current) return;

        // 🚀 ANT-MAN SCALING: Check if the camera has shrunk to the floor
        const isShrunk = camera.position.y < -479.0;
        const scaleFactor = isShrunk ? 0.05 : 1;

        // Lock arrow precisely in front of the view, scaled to the user's current size
        const offset = isShrunk 
            ? new THREE.Vector3(0, -0.05, -0.25) // Micro-arrow
            : new THREE.Vector3(0, -0.6, -2.5);  // Normal arrow

        offset.applyQuaternion(camera.quaternion);
        arrowGroupRef.current.position.copy(camera.position).add(offset);
        arrowGroupRef.current.scale.setScalar(scaleFactor);

        // Point arrow exactly at the selected target coordinates
        targetPos.set(selectedTarget.x, arrowGroupRef.current.position.y, selectedTarget.z);
        arrowGroupRef.current.lookAt(targetPos);

        // Gentle floating animation (scaled so the micro-arrow doesn't fly wildly)
        arrowMeshRef.current.position.z = Math.sin(state.clock.elapsedTime * 6) * (0.1 * scaleFactor);
    });

    if (!selectedTarget) return null;

    return (
        <group ref={arrowGroupRef}>
            <mesh ref={arrowMeshRef} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.15, 0.6, 16]} />
                <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={2} transparent opacity={0.8} />
            </mesh>
            <pointLight color="#39ff14" intensity={1} distance={3} />
        </group>
    );
}
