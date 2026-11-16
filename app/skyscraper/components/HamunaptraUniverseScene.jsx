'use client';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Sparkles, useTexture } from '@react-three/drei';
import { recordSoulArrival } from '../../../lib/land-of-the-dead/souls.js';

const SAND_COLOR = "#c2b280";
const TORCH_COLOR = "#ff8800";

// Helper to calculate repeating UVs based on geometry size for "True Size" mapping
function applyTrueScaleUV(geometry, scaleX, scaleY) {
    const uvAttribute = geometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i);
        const v = uvAttribute.getY(i);
        uvAttribute.setXY(i, u * scaleX, v * scaleY);
    }
}

export default function HamunaptraUniverseScene() {
    const { camera } = useThree();

    // 🚀 GAME STATE
    const [wave, setWave] = useState(1);
    const [kills, setKills] = useState(0);
    const [anubisHp, setAnubisHp] = useState(100);
    const [gameOver, setGameOver] = useState(false);

    // ────────────────────────────────────────────────
    // TEXTURES
    // ────────────────────────────────────────────────
    const wallTex = useTexture('/media/skyscraper/qxqnv5.jpeg');
    wallTex.wrapS = wallTex.wrapT = THREE.MirroredRepeatWrapping;
    wallTex.colorSpace = THREE.SRGBColorSpace;
    const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.1 }), [wallTex]);

    // ────────────────────────────────────────────────
    // GEOMETRIES (Pre-scaled for True UV Mapping)
    // ────────────────────────────────────────────────
    const groundGeo = useMemo(() => { const g = new THREE.PlaneGeometry(20000, 20000); applyTrueScaleUV(g, 100, 100); return g; }, []);
    const tunnelFloorGeo = useMemo(() => { const g = new THREE.PlaneGeometry(2000, 2000); applyTrueScaleUV(g, 20, 20); return g; }, []);
    const pyramidGeo = useMemo(() => { const g = new THREE.ConeGeometry(800, 600, 4); applyTrueScaleUV(g, 8, 8); return g; }, []);
    const castleWallGeo = useMemo(() => { const g = new THREE.BoxGeometry(400, 200, 50); applyTrueScaleUV(g, 4, 2); return g; }, []);
    const castleTowerGeo = useMemo(() => { const g = new THREE.CylinderGeometry(60, 60, 400, 16); applyTrueScaleUV(g, 2, 4); return g; }, []);
    const tunnelWallGeo = useMemo(() => { const g = new THREE.BoxGeometry(50, 100, 2000); applyTrueScaleUV(g, 1, 20); return g; }, []);
    
    // Minion Geometry (Instanced)
    const minionGeo = useMemo(() => { const g = new THREE.CapsuleGeometry(10, 30, 4, 8); g.translate(0, 25, 0); return g; }, []);
    const minionMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#222222", roughness: 1 }), []);

    // ────────────────────────────────────────────────
    // ENEMY AI ENGINE & MEMORY
    // ────────────────────────────────────────────────
    const minionsRef = useRef();
    const minionCount = 60; // 20 (Wave 1) + 40 (Wave 2)
    const anubisRef = useRef();

    const enemies = useMemo(() => {
        const data = [];
        for (let i = 0; i < minionCount; i++) {
            // Wave 1 = indices 0-19. Wave 2 = indices 20-59.
            const isActive = i < 20; 
            const angle = Math.random() * Math.PI * 2;
            const radius = 800 + Math.random() * 1000;
            data.push({
                active: isActive,
                hp: 100,
                pos: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
                vel: new THREE.Vector3()
            });
        }
        return data;
    }, []);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const targetDir = useMemo(() => new THREE.Vector3(), []);

    // ────────────────────────────────────────────────
    // SANDSTORM ENGINE
    // ────────────────────────────────────────────────
    const stormCount = 5000;
    const stormRef = useRef();
    const stormData = useMemo(() => {
        const pos = new Float32Array(stormCount * 3);
        for(let i=0; i<stormCount; i++) {
            pos[i*3] = (Math.random() - 0.5) * 4000;
            pos[i*3+1] = Math.random() * 500;
            pos[i*3+2] = (Math.random() - 0.5) * 4000;
        }
        return pos;
    }, []);

    // ────────────────────────────────────────────────
    // COMBAT HIT DETECTION
    // ────────────────────────────────────────────────
    const hitMinion = (e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id !== undefined && enemies[id].active) {
            enemies[id].hp -= 50; // 2 shots to kill
            if (enemies[id].hp <= 0) {
                enemies[id].active = false;
                // The Land of the Dead (Merlin, Nov 16 ~04:17): a
                // minion shot down arrives there too — additive only,
                // the kill count and wave advance below are untouched.
                // Guarded by `enemies[id].active` at the top of
                // hitMinion, so this fires once per minion.
                recordSoulArrival({ kind: 'monster', name: 'Minion', origin: 'skyscraper', diedAt: Date.now() });
                setKills(prev => {
                    const newKills = prev + 1;
                    if (newKills === 20) setWave(2);
                    if (newKills === 60) setWave(3);
                    return newKills;
                });
                // Yeet body under map
                dummy.position.set(0, -1000, 0);
                dummy.updateMatrix();
                minionsRef.current.setMatrixAt(id, dummy.matrix);
                minionsRef.current.instanceMatrix.needsUpdate = true;
            }
        }
    };

    const hitAnubis = (e) => {
        e.stopPropagation();
        if (wave === 3 && anubisHp > 0) {
            setAnubisHp(prev => {
                const nhp = Math.max(0, prev - 10);
                if (nhp === 0) { setGameOver(true); setWave(4); }
                return nhp;
            });
        }
    };

    // ────────────────────────────────────────────────
    // GAME LOOP
    // ────────────────────────────────────────────────
    useFrame((state, delta) => {
        const camPos = state.camera.position;
        const time = state.clock.elapsedTime;

        // --- CAMERA BOUNDARIES & TUNNEL DESCENSION ---
        const boundary = 9000;
        camPos.x = Math.max(-boundary, Math.min(boundary, camPos.x));
        camPos.z = Math.max(-boundary, Math.min(boundary, camPos.z));
        
        // If near the tunnel entrance origin [0,0], descend to Y=-100
        const distToOrigin = Math.sqrt(camPos.x*camPos.x + camPos.z*camPos.z);
        let targetY = 50; 
        if (distToOrigin < 400 && camPos.z > 0) {
            targetY = Math.max(-80, 50 - ((400 - distToOrigin) * 0.4));
        }
        camPos.y = THREE.MathUtils.lerp(camPos.y, targetY, 0.1);

        // --- SANDSTORM PHYSICS ---
        if (stormRef.current) {
            const sArr = stormRef.current.geometry.attributes.position.array;
            for(let i=0; i<stormCount; i++) {
                sArr[i*3] -= 1500 * delta; // Rip horizontally
                sArr[i*3+1] -= 200 * delta; // Fall slightly
                
                // Wrap around camera to maintain dense illusion
                if (sArr[i*3] < camPos.x - 2000) sArr[i*3] = camPos.x + 2000;
                if (sArr[i*3+1] < 0) sArr[i*3+1] = 500;
                if (Math.abs(sArr[i*3+2] - camPos.z) > 2000) sArr[i*3+2] = camPos.z + (Math.random() - 0.5) * 4000;
            }
            stormRef.current.geometry.attributes.position.needsUpdate = true;
        }

        // --- MINION AI ---
        if (minionsRef.current && (wave === 1 || wave === 2)) {
            // Activate Wave 2
            if (wave === 2) {
                for(let i=20; i<60; i++) { if (enemies[i].hp === 100) enemies[i].active = true; }
            }

            enemies.forEach((enemy, i) => {
                if (enemy.active) {
                    targetDir.subVectors(camPos, enemy.pos);
                    targetDir.y = 0;
                    if (targetDir.lengthSq() > 2500) {
                        targetDir.normalize();
                        enemy.pos.addScaledVector(targetDir, 350 * delta); // Run speed
                    }
                    dummy.position.copy(enemy.pos);
                    // Bobbing run animation
                    dummy.position.y = Math.abs(Math.sin(time * 15 + i)) * 10;
                    dummy.lookAt(camPos.x, dummy.position.y, camPos.z);
                    dummy.updateMatrix();
                    minionsRef.current.setMatrixAt(i, dummy.matrix);
                }
            });
            minionsRef.current.instanceMatrix.needsUpdate = true;
        }

        // --- ANUBIS BOSS AI ---
        if (wave === 3 && anubisRef.current && anubisHp > 0) {
            const aPos = anubisRef.current.position;
            targetDir.subVectors(camPos, aPos);
            targetDir.y = 0;
            if (targetDir.lengthSq() > 10000) {
                targetDir.normalize();
                aPos.addScaledVector(targetDir, 450 * delta); // Very fast
                anubisRef.current.lookAt(camPos.x, aPos.y, camPos.z);
            }
            aPos.y = Math.abs(Math.sin(time * 8)) * 20; // Aggressive stomp
        } else if (wave === 4 && anubisRef.current) {
            // Sink into sand
            anubisRef.current.position.y -= delta * 50;
            anubisRef.current.rotation.x -= delta;
        }
    });

    const Torches = useMemo(() => {
        const positions = [
            [-200, 20, 200], [200, 20, 200], // Tunnel Entrance
            [800, 50, -800], [1200, 50, -800], // Castle Gates
            [-500, 20, -500], [-800, 20, -500] // Sphinx Base
        ];
        return positions.map((p, i) => (
            <group key={i} position={p}>
                <pointLight color={TORCH_COLOR} intensity={800} distance={400} decay={1.5} />
                <Sparkles count={30} scale={[20, 40, 20]} size={6} color={TORCH_COLOR} speed={2} />
                <mesh position={[0, -10, 0]} dispose={null}>
                    <cylinderGeometry args={[2, 2, 20]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
            </group>
        ));
    }, []);

    return (
        <group>
            <OrbitControls enablePan={true} enableZoom={false} maxPolarAngle={Math.PI / 2} minPolarAngle={0.1} />
            
            {/* Blinding Sandstorm Fog */}
            <fogExp2 attach="fog" args={[SAND_COLOR, 0.0015]} />
            <ambientLight intensity={0.2} color="#ffffff" />
            <directionalLight position={[1000, 2000, 1000]} intensity={1.5} color={SAND_COLOR} castShadow />

            {/* UI HUD */}
            <Html position={[0, 0, 0]} center style={{ position: 'fixed', top: '20px', width: '100vw', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ color: '#fff', fontSize: '24px', fontWeight: 'bold', textShadow: '2px 2px 0 #000' }}>
                    {wave === 1 && `WAVE 1: MINIONS (${kills}/20)`}
                    {wave === 2 && `WAVE 2: SWARM (${kills}/60)`}
                    {wave === 3 && <div style={{ color: '#ff0000' }}>ANUBIS HP: {anubisHp}/100</div>}
                    {wave === 4 && <div style={{ color: '#00ffaa' }}>THE CURSE IS BROKEN</div>}
                </div>
            </Html>

            {/* 🚀 ARCHITECTURE & TERRAIN */}
            {/* Desert Surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={wallMat} geometry={groundGeo} dispose={null} receiveShadow />
            
            {/* Underground Tunnels */}
            <group position={[0, -100, 500]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} material={wallMat} geometry={tunnelFloorGeo} dispose={null} receiveShadow />
                <mesh position={[100, 50, 0]} material={wallMat} geometry={tunnelWallGeo} dispose={null} />
                <mesh position={[-100, 50, 0]} material={wallMat} geometry={tunnelWallGeo} dispose={null} />
                <pointLight position={[0, 50, 500]} color={TORCH_COLOR} intensity={500} distance={500} />
            </group>

            {/* Pyramids (Far Horizon) */}
            <group position={[0, 300, -3000]}>
                <mesh position={[-1500, 0, 0]} rotation={[0, Math.PI/4, 0]} material={wallMat} geometry={pyramidGeo} dispose={null} />
                <mesh position={[0, 0, -500]} rotation={[0, Math.PI/4, 0]} material={wallMat} geometry={pyramidGeo} dispose={null} />
                <mesh position={[1500, 0, 0]} rotation={[0, Math.PI/4, 0]} material={wallMat} geometry={pyramidGeo} dispose={null} />
            </group>

            {/* The Castle */}
            <group position={[1000, 100, -1000]}>
                <mesh position={[0, 0, 0]} material={wallMat} geometry={castleWallGeo} dispose={null} />
                <mesh position={[-200, 100, 0]} material={wallMat} geometry={castleTowerGeo} dispose={null} />
                <mesh position={[200, 100, 0]} material={wallMat} geometry={castleTowerGeo} dispose={null} />
            </group>

            {/* The Sphinx */}
            <group position={[-800, 0, -800]}>
                <mesh position={[0, 100, 0]} material={wallMat} dispose={null}><boxGeometry args={[400, 200, 600]} /></mesh>
                <mesh position={[0, 300, 200]} material={wallMat} dispose={null}><boxGeometry args={[150, 200, 150]} /></mesh>
                <mesh position={[0, 200, 350]} material={wallMat} dispose={null}><boxGeometry args={[200, 100, 200]} /></mesh>
            </group>

            {Torches}

            {/* 🚀 COMBAT SYSTEMS */}
            {/* Minions */}
            <instancedMesh ref={minionsRef} args={[minionGeo, minionMat, minionCount]} onPointerDown={hitMinion} dispose={null} castShadow />

            {/* Boss: Anubis */}
            <group ref={anubisRef} position={[0, -2000, 0]} onPointerDown={hitAnubis}>
                {wave >= 3 && (
                    <>
                        <mesh position={[0, 75, 0]} dispose={null} castShadow>
                            <capsuleGeometry args={[20, 100, 4, 8]} />
                            <meshStandardMaterial color="#111" metalness={0.8} />
                        </mesh>
                        <mesh position={[0, 160, 20]} rotation={[Math.PI/2, 0, 0]} dispose={null} castShadow>
                            <coneGeometry args={[25, 80, 4]} />
                            <meshStandardMaterial color="#000" />
                        </mesh>
                        {/* Red Glowing Eyes */}
                        <pointLight position={[10, 160, 40]} color="#ff0000" intensity={500} distance={100} />
                        <pointLight position={[-10, 160, 40]} color="#ff0000" intensity={500} distance={100} />
                    </>
                )}
            </group>

            {/* 🚀 HIGH VELOCITY SANDSTORM ENGINE */}
            <points ref={stormRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={stormCount} array={stormData} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial color={SAND_COLOR} size={15} transparent opacity={0.6} fog={true} />
            </points>
        </group>
    );
}
