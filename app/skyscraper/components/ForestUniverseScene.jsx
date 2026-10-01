'use client';
import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, PointerLockControls, Text, Html } from '@react-three/drei';

const BOUNDS = 20000; 
const MAX_TREES = 8000; 

// --------------------------------------------------------
// 1. DYNAMIC ENVIRONMENT & LIGHTING CYCLE
// --------------------------------------------------------
function DayNightCycle() {
    const dirLight = useRef(null);
    const skyColor = useMemo(() => new THREE.Color(), []);
    
    const initialTimeFraction = useMemo(() => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const pdtTime = new Date(utc - (3600000 * 7));
        return (pdtTime.getHours() + pdtTime.getMinutes() / 60 + pdtTime.getSeconds() / 3600) / 24;
    }, []);

    useFrame((state) => {
        const speedMultiplier = 0.005; // Visible progression of time
        const time = (initialTimeFraction + state.clock.elapsedTime * speedMultiplier) % 1;
        const theta = time * Math.PI * 2 - Math.PI / 2;
        
        const sunY = Math.sin(theta);
        const isDay = sunY > 0;
        
        if (dirLight.current) {
            dirLight.current.position.set(Math.cos(theta) * 1000, sunY * 1000, Math.sin(theta) * 1000);
            dirLight.current.intensity = Math.max(0.1, sunY) * 2;
        }
        
        const targetColor = isDay ? "#1a3c5a" : "#020408";
        if (!state.scene.background) state.scene.background = new THREE.Color("#020408");
        
        state.scene.fog.color.lerp(skyColor.set(targetColor), 0.01);
        state.scene.background.lerp(skyColor.set(targetColor), 0.01);
    });

    return (
        <>
            <fog attach="fog" args={["#020408", 10, 800]} />
            <ambientLight intensity={0.15} />
            <directionalLight ref={dirLight} castShadow />
            <pointLight position={[0, 50, 0]} intensity={0.8} color="#00ffff" distance={800} />
        </>
    );
}

// --------------------------------------------------------
// 2. STANDARD FPS LOCOMOTION
// --------------------------------------------------------
function PlayerMotion() {
    const keys = useRef({ w: false, a: false, s: false, d: false });
    
    useEffect(() => {
        const down = (e) => {
            const key = e.key.toLowerCase();
            if (keys.current.hasOwnProperty(key)) keys.current[key] = true;
        };
        const up = (e) => {
            const key = e.key.toLowerCase();
            if (keys.current.hasOwnProperty(key)) keys.current[key] = false;
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    const direction = useMemo(() => new THREE.Vector3(), []);
    const front = useMemo(() => new THREE.Vector3(), []);
    const side = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        const speed = 300 * delta;
        front.set(0, 0, (keys.current.s ? 1 : 0) - (keys.current.w ? 1 : 0));
        side.set((keys.current.a ? 1 : 0) - (keys.current.d ? 1 : 0), 0, 0);
        
        direction.subVectors(front, side).normalize().multiplyScalar(speed).applyEuler(state.camera.rotation);
        direction.y = 0; // Lock Y axis vector mapping
        
        state.camera.position.add(direction);

        // Map Boundaries
        const boundary = (BOUNDS / 2) - 200;
        state.camera.position.x = Math.max(-boundary, Math.min(boundary, state.camera.position.x));
        state.camera.position.z = Math.max(-boundary, Math.min(boundary, state.camera.position.z));
        state.camera.position.y = 80; // Eye-level lock
    });

    return (
        <>
            <PointerLockControls />
            <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: 4, height: 4, backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: '50%' }} />
            </Html>
        </>
    );
}

// --------------------------------------------------------
// 3. HOSTILE ENTITY AI
// --------------------------------------------------------
function BigfootEntity() {
    const bfRef = useRef(null);
    const [hp, setHp] = useState(600);
    const [flash, setFlash] = useState(false);
    const lastAttack = useRef(0);

    useFrame((state, delta) => {
        if (hp <= 0 || !bfRef.current) return;
        
        const speed = 70 * delta;
        const camPos = state.camera.position;
        const bfPos = bfRef.current.position;
        
        const dx = camPos.x - bfPos.x;
        const dz = camPos.z - bfPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance > 25) {
            // Hunt Logic
            bfPos.x += (dx / distance) * speed;
            bfPos.z += (dz / distance) * speed;
            bfRef.current.rotation.y = Math.atan2(dx, dz);
        } else {
            // Attack Logic 
            if (state.clock.elapsedTime - lastAttack.current > 1.5) {
                setFlash(true);
                setTimeout(() => setFlash(false), 200);
                lastAttack.current = state.clock.elapsedTime;
            }
        }
    });

    if (hp <= 0) return null;

    return (
        <>
            {flash && (
                <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
                    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'rgba(255,0,0,0.4)', transition: 'background-color 0.1s' }} />
                </Html>
            )}
            <group ref={bfRef} position={[250, 40, 250]}>
                <mesh 
                    onClick={(e) => { e.stopPropagation(); setHp(h => Math.max(0, h - 100)); }} 
                    castShadow 
                    receiveShadow
                >
                    <capsuleGeometry args={[8, 20, 4, 16]} />
                    <meshStandardMaterial color="#2c1a0f" roughness={1} />
                </mesh>
                <Text position={[0, 25, 0]} fontSize={6} color="#ff3333" outlineWidth={0.5} outlineColor="black">
                    HP: {hp}
                </Text>
            </group>
        </>
    );
}

// --------------------------------------------------------
// 4. MAIN SCENE ENGINE
// --------------------------------------------------------
export default function ForestUniverseScene() {
    const treesRef = useRef(null);
    const trunksRef = useRef(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const floorGeo = useMemo(() => new THREE.PlaneGeometry(BOUNDS, BOUNDS, 32, 32), []);
    const treeGeo = useMemo(() => new THREE.ConeGeometry(3, 14, 5), []);
    const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.8, 1.2, 6, 8), []);

    const treeData = useMemo(() => {
        const data = [];
        for (let i = 0; i < MAX_TREES; i++) {
            const x = (Math.random() - 0.5) * BOUNDS;
            const z = (Math.random() - 0.5) * BOUNDS;
            const scale = 0.8 + Math.random() * 1.5;
            data.push({ x, z, scale });
        }
        return data;
    }, []);

    useEffect(() => {
        if (!treesRef.current || !trunksRef.current) return;
        
        treeData.forEach((t, i) => {
            dummy.position.set(t.x, 3 * t.scale, t.z);
            dummy.scale.set(t.scale, t.scale, t.scale);
            dummy.updateMatrix();
            trunksRef.current.setMatrixAt(i, dummy.matrix);
            
            dummy.position.y += 6 * t.scale;
            dummy.scale.set(t.scale * 1.2, t.scale * 1.4, t.scale * 1.2);
            dummy.updateMatrix();
            treesRef.current.setMatrixAt(i, dummy.matrix);
        });
        
        treesRef.current.instanceMatrix.needsUpdate = true;
        trunksRef.current.instanceMatrix.needsUpdate = true;
    }, [treeData, dummy]);

    useFrame((state) => {
        if (treesRef.current) {
            treesRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
            trunksRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.01;
        }
    });

    return (
        <group>
            <PlayerMotion />
            <DayNightCycle />
            <BigfootEntity />

            <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={floorGeo} receiveShadow dispose={null}>
                <meshStandardMaterial color="#020408" roughness={0.9} />
            </mesh>

            <instancedMesh ref={trunksRef} args={[trunkGeo, null, MAX_TREES]} castShadow dispose={null}>
                <meshStandardMaterial color="#1a100a" />
            </instancedMesh>

            <instancedMesh ref={treesRef} args={[treeGeo, null, MAX_TREES]} castShadow dispose={null}>
                <meshStandardMaterial color="#051c0d" />
            </instancedMesh>

            <Sparkles count={1500} scale={[BOUNDS, 100, BOUNDS]} position={[0, 50, 0]} size={6} color="#39ff14" speed={0.2} opacity={0.6} />
        </group>
    );
}
