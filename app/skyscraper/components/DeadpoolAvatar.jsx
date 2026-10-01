'use client';
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export default function DeadpoolAvatar({ isDriving, velocity }) {
    const group = useRef();
    const bobRef = useRef();

    // ─────────────────────────────────────────────────────────
    // GLOBAL MEMORY CACHE (MATERIALS & GEOMETRIES)
    // ─────────────────────────────────────────────────────────
    
    // Materials
    const matSuitRed = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x9b111e, roughness: 0.45, metalness: 0.12 }), []);
    const matSuitRedDark = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x730b13, roughness: 0.5, metalness: 0.1 }), []);
    const matSuitBlack = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.6, metalness: 0.25 }), []);
    const matLeatherDark = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.35, metalness: 0.35 }), []);
    const matLeatherBrown = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x422617, roughness: 0.55, metalness: 0.15 }), []);
    const matMetalSteel = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.25, metalness: 0.92 }), []);
    const matMetalGold = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.85 }), []);
    const matEyes = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.1, metalness: 0.1, emissive: 0x222222 }), []);

    // Head Geometries
    const craniumGeo = useMemo(() => { const g = new THREE.SphereGeometry(0.145, 32, 28); g.scale(1, 1.22, 1.15); return g; }, []);
    const tipGeo = useMemo(() => { const g = new THREE.ConeGeometry(0.04, 0.12, 16); g.rotateX(-Math.PI / 3.8); return g; }, []);
    const jawGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.08, 0.11, 0.14, 16); g.scale(1, 1, 1.1); return g; }, []);
    const chinGeo = useMemo(() => new THREE.BoxGeometry(0.07, 0.06, 0.08), []);
    const patchGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.055, 0.05, 0.02, 20); g.scale(0.85, 0.3, 1.5); return g; }, []);
    const eyeGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.022, 0.015, 0.025, 12); g.scale(0.7, 0.2, 1.6); return g; }, []);
    const neckGeo = useMemo(() => new THREE.CylinderGeometry(0.085, 0.105, 0.14, 20), []);
    const neckCollarGeo = useMemo(() => new THREE.CylinderGeometry(0.106, 0.115, 0.05, 20), []);

    // Torso Geometries
    const chestPecGeo = useMemo(() => new THREE.BoxGeometry(0.18, 0.22, 0.16), []);
    const coreGeo = useMemo(() => new THREE.BoxGeometry(0.24, 0.42, 0.22), []);
    const sidePanelGeo = useMemo(() => new THREE.BoxGeometry(0.12, 0.38, 0.24), []);
    const abGeo = useMemo(() => new THREE.BoxGeometry(0.09, 0.065, 0.04), []);
    const spineGeo = useMemo(() => new THREE.BoxGeometry(0.08, 0.38, 0.05), []);
    
    // Harness & Katana Geometries
    const strapGeo = useMemo(() => new THREE.BoxGeometry(0.055, 0.48, 0.27), []);
    const harnessBuckleGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16); g.rotateX(Math.PI / 2); return g; }, []);
    const scabbardMountGeo = useMemo(() => new THREE.BoxGeometry(0.18, 0.16, 0.08), []);
    const sheathGeo = useMemo(() => new THREE.BoxGeometry(0.038, 0.75, 0.02), []);
    const sheathTrimGeo = useMemo(() => new THREE.BoxGeometry(0.042, 0.04, 0.024), []);
    const tsubaGeo = useMemo(() => new THREE.BoxGeometry(0.08, 0.015, 0.06), []);
    const handleGeo = useMemo(() => new THREE.CylinderGeometry(0.018, 0.02, 0.26, 12), []);
    const wrapGeo = useMemo(() => new THREE.CylinderGeometry(0.021, 0.021, 0.02, 12), []);
    const pommelGeo = useMemo(() => new THREE.CylinderGeometry(0.022, 0.022, 0.025, 12), []);

    // Belt Geometries
    const beltGeo = useMemo(() => new THREE.CylinderGeometry(0.21, 0.22, 0.075, 24), []);
    const buckleBaseGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.058, 0.058, 0.03, 32); g.rotateX(Math.PI / 2); return g; }, []);
    const buckleFaceGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.05, 0.05, 0.035, 32); g.rotateX(Math.PI / 2); return g; }, []);
    const buckleDivGeo = useMemo(() => new THREE.BoxGeometry(0.015, 0.095, 0.04), []);
    const bEyeGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.012, 0.01, 0.04, 12); g.rotateX(Math.PI / 2); g.scale(0.8, 1.4, 1); return g; }, []);

    // Limbs (Procedurally generated to complete the cut-off model)
    const shoulderGeo = useMemo(() => new THREE.SphereGeometry(0.12, 16, 16), []);
    const bicepGeo = useMemo(() => new THREE.CapsuleGeometry(0.08, 0.2, 8, 16), []);
    const forearmGeo = useMemo(() => new THREE.CapsuleGeometry(0.07, 0.2, 8, 16), []);
    const thighGeo = useMemo(() => new THREE.CapsuleGeometry(0.12, 0.35, 8, 16), []);
    const calfGeo = useMemo(() => new THREE.CapsuleGeometry(0.1, 0.35, 8, 16), []);

    useFrame((state) => {
        if (!bobRef.current) return;
        const time = state.clock.elapsedTime;
        
        // Procedural Animation Engine
        if (isDriving) {
            bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, -0.2, 0.1);
            bobRef.current.rotation.x = THREE.MathUtils.lerp(bobRef.current.rotation.x, 0.4, 0.1);
        } else {
            bobRef.current.rotation.x = THREE.MathUtils.lerp(bobRef.current.rotation.x, 0, 0.1);
            if (velocity > 0.01) {
                // Running Bob
                bobRef.current.position.y = Math.abs(Math.sin(time * 12)) * 0.1 - 1.2;
                bobRef.current.rotation.z = Math.sin(time * 6) * 0.05;
            } else {
                // Idle Breathe
                bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, Math.sin(time * 2) * 0.02 - 1.2, 0.1);
                bobRef.current.rotation.z = THREE.MathUtils.lerp(bobRef.current.rotation.z, 0, 0.1);
            }
        }
    });

    const EyePatch = ({ side }) => (
        <group position={[side * 0.065, 0.02, 0.135]} rotation={[-0.05, side * 0.35, 0]}>
            <mesh geometry={patchGeo} material={matSuitBlack} rotation={[Math.PI / 2 - 0.15, 0, side * 0.2]} castShadow />
            <mesh geometry={eyeGeo} material={matEyes} rotation={[Math.PI / 2 - 0.15, 0, side * 0.28]} position={[0, 0, 0.005]} castShadow />
        </group>
    );

    const Katana = ({ rotationZ }) => (
        <group position={[0, 0.18, -0.2]} rotation={[-0.15, 0, rotationZ]}>
            <mesh geometry={sheathGeo} material={matLeatherDark} position={[0, -0.15, 0]} castShadow />
            <mesh geometry={sheathTrimGeo} material={matMetalGold} position={[0, 0.2, 0]} castShadow />
            <mesh geometry={tsubaGeo} material={matMetalGold} position={[0, 0.23, 0]} castShadow />
            <mesh geometry={handleGeo} material={matSuitRed} position={[0, 0.36, 0]} castShadow />
            {[0, 1, 2, 3, 4].map(i => (
                <mesh key={i} geometry={wrapGeo} material={matSuitBlack} position={[0, 0.27 + (i * 0.042), 0]} castShadow />
            ))}
            <mesh geometry={pommelGeo} material={matMetalSteel} position={[0, 0.49, 0]} castShadow />
        </group>
    );

    return (
        <group ref={group} dispose={null} rotation={[0, Math.PI, 0]} scale={[3.5, 3.5, 3.5]}>
            <group ref={bobRef} position={[0, -1.2, 0]}>
                
                {/* HEAD */}
                <group position={[0, 1.88, 0]}>
                    <mesh geometry={craniumGeo} material={matSuitRed} castShadow />
                    <mesh geometry={tipGeo} material={matSuitRed} position={[0, 0.14, -0.09]} castShadow />
                    <mesh geometry={jawGeo} material={matSuitRed} position={[0, -0.08, 0.03]} castShadow />
                    <mesh geometry={chinGeo} material={matSuitRed} position={[0, -0.13, 0.09]} rotation={[0.2, 0, 0]} castShadow />
                    <EyePatch side={1} />
                    <EyePatch side={-1} />
                    <mesh geometry={neckGeo} material={matSuitRedDark} position={[0, -0.16, -0.01]} castShadow />
                    <mesh geometry={neckCollarGeo} material={matSuitBlack} position={[0, -0.18, -0.01]} castShadow />
                </group>

                {/* TORSO */}
                <group position={[0, 1.45, 0]}>
                    <mesh geometry={chestPecGeo} material={matSuitRed} position={[0.105, 0.12, 0.05]} rotation={[0.05, -0.05, -0.08]} castShadow />
                    <mesh geometry={chestPecGeo} material={matSuitRed} position={[-0.105, 0.12, 0.05]} rotation={[0.05, 0.05, 0.08]} castShadow />
                    <mesh geometry={coreGeo} material={matSuitRed} position={[0, 0.02, 0]} castShadow />
                    <mesh geometry={sidePanelGeo} material={matSuitBlack} position={[0.16, 0.03, 0]} rotation={[0, 0, -0.1]} castShadow />
                    <mesh geometry={sidePanelGeo} material={matSuitBlack} position={[-0.16, 0.03, 0]} rotation={[0, 0, 0.1]} castShadow />
                    {[0, 1, 2].map(i => (
                        <group key={i}>
                            <mesh geometry={abGeo} material={matSuitRedDark} position={[0.055, -0.04 - (i * 0.075), 0.11]} castShadow />
                            <mesh geometry={abGeo} material={matSuitRedDark} position={[-0.055, -0.04 - (i * 0.075), 0.11]} castShadow />
                        </group>
                    ))}
                    <mesh geometry={spineGeo} material={matSuitBlack} position={[0, 0.04, -0.11]} castShadow />
                    
                    {/* HARNESS */}
                    <mesh geometry={strapGeo} material={matLeatherDark} position={[0, 0.12, 0.02]} rotation={[0.1, 0, 0.62]} castShadow />
                    <mesh geometry={strapGeo} material={matLeatherDark} position={[0, 0.12, 0.02]} rotation={[0.1, 0, -0.62]} castShadow />
                    <mesh geometry={harnessBuckleGeo} material={matMetalSteel} position={[0, 0.12, 0.15]} castShadow />
                    <mesh geometry={scabbardMountGeo} material={matLeatherDark} position={[0, 0.14, -0.16]} castShadow />
                    
                    <Katana rotationZ={-0.65} />
                    <Katana rotationZ={0.65} />
                </group>

                {/* ARMS */}
                <group position={[0.28, 1.6, 0]} rotation={[0, 0, isDriving ? 0.8 : -0.2]}>
                    <mesh geometry={shoulderGeo} material={matSuitBlack} castShadow />
                    <mesh geometry={bicepGeo} material={matSuitRed} position={[0.05, -0.15, 0]} rotation={[0, 0, 0.1]} castShadow />
                    <mesh geometry={forearmGeo} material={matSuitBlack} position={[0.1, -0.35, isDriving ? 0.2 : 0]} rotation={[isDriving ? -0.5 : 0, 0, 0.1]} castShadow />
                </group>
                <group position={[-0.28, 1.6, 0]} rotation={[0, 0, isDriving ? -0.8 : 0.2]}>
                    <mesh geometry={shoulderGeo} material={matSuitBlack} castShadow />
                    <mesh geometry={bicepGeo} material={matSuitRed} position={[-0.05, -0.15, 0]} rotation={[0, 0, -0.1]} castShadow />
                    <mesh geometry={forearmGeo} material={matSuitBlack} position={[-0.1, -0.35, isDriving ? 0.2 : 0]} rotation={[isDriving ? -0.5 : 0, 0, -0.1]} castShadow />
                </group>

                {/* BELT */}
                <group position={[0, 1.22, 0]}>
                    <mesh geometry={beltGeo} material={matLeatherBrown} castShadow />
                    <mesh geometry={buckleBaseGeo} material={matMetalSteel} position={[0, 0, 0.21]} castShadow />
                    <mesh geometry={buckleFaceGeo} material={matSuitRed} position={[0, 0, 0.21]} castShadow />
                    <mesh geometry={buckleDivGeo} material={matSuitBlack} position={[0, 0, 0.212]} castShadow />
                    <mesh geometry={bEyeGeo} material={matEyes} position={[0.024, 0.005, 0.215]} castShadow />
                    <mesh geometry={bEyeGeo} material={matEyes} position={[-0.024, 0.005, 0.215]} castShadow />
                </group>

                {/* LEGS */}
                <group position={[0.12, 1.0, 0]} rotation={[isDriving ? -1.2 : 0, 0, 0]}>
                    <mesh geometry={thighGeo} material={matSuitRed} position={[0, -0.2, 0]} castShadow />
                    <mesh geometry={calfGeo} material={matSuitBlack} position={[0, -0.55, isDriving ? -0.2 : 0]} rotation={[isDriving ? 1.2 : 0, 0, 0]} castShadow />
                </group>
                <group position={[-0.12, 1.0, 0]} rotation={[isDriving ? -1.2 : 0, 0, 0]}>
                    <mesh geometry={thighGeo} material={matSuitRed} position={[0, -0.2, 0]} castShadow />
                    <mesh geometry={calfGeo} material={matSuitBlack} position={[0, -0.55, isDriving ? -0.2 : 0]} rotation={[isDriving ? 1.2 : 0, 0, 0]} castShadow />
                </group>

            </group>
        </group>
    );
}
