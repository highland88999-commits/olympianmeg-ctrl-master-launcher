'use client';
import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

// THE SLIP: If a floor file doesn't exist, this generates instead of crashing
const UnderConstructionFloor = ({ floorNum }) => {
    return (
        <group>
            {/* Dark Concrete Floor */}
            <mesh rotation-x={-Math.PI / 2} position-y={0}>
                <planeGeometry args={[60, 60]} />
                <meshStandardMaterial color="#050505" roughness={0.9} />
            </mesh>
            
            {/* Holographic Wireframe Grid */}
            <gridHelper args={[60, 20, 0xff0044, 0x220011]} position={[0, 0.05, 0]} />

            {/* Glowing Warning Text */}
            <Text position={[0, 8, -25]} fontSize={4} color="#ff0044" letterSpacing={0.1}>
                FLOOR {floorNum}
            </Text>
            <Text position={[0, 4, -25]} fontSize={1.5} color="#00ffff" letterSpacing={0.2}>
                POCKET UNIVERSE UNDER CONSTRUCTION
            </Text>
        </group>
    );
};

export default function FloorLoader({ currentFloor, setCurrentFloor, isMobile }) {
    const [FloorComponent, setFloorComponent] = useState(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (currentFloor === 0) return; // Floor 0 is handled by Exterior.jsx

        let isMounted = true;
        setFloorComponent(null);
        setHasError(false);

        // Attempt to dynamically import the target floor
        import(`./Floor${currentFloor}`)
            .then((module) => {
                if (isMounted) setFloorComponent(() => module.default);
            })
            .catch((err) => {
                console.warn(`[SYSTEM LOG] Floor ${currentFloor} not found. Rerouting to construction void.`);
                if (isMounted) setHasError(true);
            });

        return () => { isMounted = false; };
    }, [currentFloor]);

    if (currentFloor === 0) return null;
    
    // Failsafe Triggered
    if (hasError) return <UnderConstructionFloor floorNum={currentFloor} />;
    
    // Still loading the file
    if (!FloorComponent) return null; 

    // File found, render the actual floor at elevation 0
    return <FloorComponent elevation={0} isMobile={isMobile} setCurrentFloor={setCurrentFloor} />;
}
