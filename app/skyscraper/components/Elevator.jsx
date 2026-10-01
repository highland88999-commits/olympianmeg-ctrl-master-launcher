'use client';
import * as THREE from 'three';
import { AdaptivePOM } from './POMMaterial';

export default function Elevator({ currentFloor, animState, setAnimState, isMobile }) {
    const triggerElevator = (e) => {
        e.stopPropagation();
        if (animState === 'FREE_ROAM' && e.distance < 8) {
            setAnimState('PULLING_IN');
        }
    };

    if (currentFloor === 0) return null;

    return (
        // No more position-y math. The elevator is always at ground zero of the pocket universe.
        <group>
            {/* The Solid Exterior */}
            <mesh position={[0, 8, 0]} visible={animState === 'FREE_ROAM' || animState === 'PULLING_IN'}>
                <boxGeometry args={[12, 16, 12]} />
                <AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.04} />
            </mesh>
            
            {/* The Glass Warp State */}
            <mesh position={[0, 8, 0]} visible={animState === 'ELEVATOR_MOVING'}>
                <boxGeometry args={[11.9, 15.9, 11.9]} />
                <meshPhysicalMaterial color={0x00ffff} metalness={0.2} roughness={0.1} transmission={0.9} opacity={0.3} transparent side={THREE.DoubleSide} />
            </mesh>
            
            {/* Call Button - Flashes green instantly upon clicking */}
            <mesh position={[3, 8, 6.05]} onClick={triggerElevator}>
                <boxGeometry args={[0.8, 1.2, 0.2]} />
                <meshStandardMaterial color={animState === 'FREE_ROAM' ? 0xff0000 : 0x39ff14} emissive={animState === 'FREE_ROAM' ? 0xff0000 : 0x39ff14} emissiveIntensity={2} />
            </mesh>
        </group>
    );
}
