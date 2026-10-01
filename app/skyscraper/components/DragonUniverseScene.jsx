'use client';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useVideoTexture, Html, OrbitControls } from '@react-three/drei';

function getTerrainY(x, z) {
    return Math.sin(x * 0.0015) * Math.cos(z * 0.0015) * 800.0;
}

export default function DragonUniverseScene() {
    const { camera } = useThree();
    
    const [dragonHp, setDragonHp] = useState(100);
    const isDead = dragonHp <= 0;

    const floorVid = useVideoTexture('/media/skyscraper/y8nbym.mov', { muted: true, loop: true, playsInline: true });
    floorVid.colorSpace = THREE.SRGBColorSpace;
    floorVid.wrapS = floorVid.wrapT = THREE.RepeatWrapping;
    floorVid.repeat.set(16, 16); // Scaled for the massive new surface area

    const dragonSkin = useMemo(() => {
        const tex = new THREE.TextureLoader().load('/media/skyscraper/e4783o.png');
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(0.01, 0.01);
        return tex;
    }, []);

    const uniforms = useMemo(() => ({
        tVideo: { value: floorVid },
        uMonsterPos: { value: new THREE.Vector3(0,0,0) },
        uTime: { value: 0 }
    }), [floorVid]);

    const controlsRef = useRef();
    const dragonRef = useRef();
    const torsoRef = useRef();
    const neckGroupRef = useRef();
    const headRef = useRef();
    const wingLRef = useRef();
    const wingRRef = useRef();
    const tailRefs = useRef([]);
    const legFLRef = useRef();
    const legFRRef = useRef();
    const legBLRef = useRef();
    const legBRRef = useRef();

    const dirVec = useMemo(() => new THREE.Vector3(), []);
    
    const breathCount = 2500;
    const breathRef = useRef();
    const breathData = useMemo(() => {
        const pos = new Float32Array(breathCount * 3);
        const vel = [];
        for(let i=0; i<breathCount; i++) {
            vel.push({ z: 20 + Math.random() * 30, x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 });
        }
        return { pos, vel };
    }, []);

    const iceCount = 1200;
    const iceTrailRef = useRef();
    const iceDummy = useMemo(() => new THREE.Object3D(), []);
    const iceIndex = useRef(0);

    const lightningRefs = useRef([]);
    const lightningLightRef = useRef();
    const lightningData = useMemo(() => {
        return Array.from({ length: 4 }).map(() => new Float32Array(9 * 3));
    }, []);

    const dragonMat = useMemo(() => new THREE.MeshBasicMaterial({ map: dragonSkin, color: 0xffffff, side: THREE.DoubleSide }), [dragonSkin]);
    const floorGeo = useMemo(() => new THREE.PlaneGeometry(30000, 30000, 256, 256), []); // Massively expanded surface
    const iceConeGeo = useMemo(() => { const g = new THREE.ConeGeometry(30, 140, 5); g.translate(0, 70, 0); return g; }, []);
    
    const wingGeo = useMemo(() => {
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0); 
        wingShape.quadraticCurveTo(150, 200, 400, 250); 
        wingShape.quadraticCurveTo(380, 180, 500, 100); 
        wingShape.quadraticCurveTo(380, 50, 480, -50);  
        wingShape.quadraticCurveTo(300, -80, 400, -200);
        wingShape.quadraticCurveTo(200, -100, 250, -350);
        wingShape.quadraticCurveTo(100, -150, 0, -180);  
        wingShape.lineTo(0,0);
        return new THREE.ExtrudeGeometry(wingShape, { depth: 8, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 3 });
    }, []);

    useEffect(() => {
        if (!iceTrailRef.current) return;
        iceDummy.position.set(0, -5000, 0);
        for(let i=0; i<iceCount; i++) {
            iceDummy.updateMatrix();
            iceTrailRef.current.setMatrixAt(i, iceDummy.matrix);
        }
        iceTrailRef.current.instanceMatrix.needsUpdate = true;
    }, [iceDummy]);

    const handleDamage = (e) => {
        e.stopPropagation();
        if (!isDead) setDragonHp(prev => Math.max(0, prev - 25));
    };

    useFrame((state, delta) => {
        const time = state.clock.elapsedTime;
        uniforms.uTime.value = time;

        // 🚀 BOUNDARY & SURFACE LOCK ENGINE
        const boundary = 14500;
        const camPos = state.camera.position;
        
        // Strict Do-Not-Cross perimeter
        camPos.x = Math.max(-boundary, Math.min(boundary, camPos.x));
        camPos.z = Math.max(-boundary, Math.min(boundary, camPos.z));
        
        // Lock player elevation to the procedural terrain hills
        const groundY = getTerrainY(camPos.x, camPos.z);
        camPos.y = groundY + 400; // Constant eye-level above the ice
        
        if (controlsRef.current) {
            const target = controlsRef.current.target;
            target.x = Math.max(-boundary, Math.min(boundary, target.x));
            target.z = Math.max(-boundary, Math.min(boundary, target.z));
            target.y = getTerrainY(target.x, target.z) + 150; 
        }

        if (dragonRef.current) {
            const dragonPos = dragonRef.current.position;
            uniforms.uMonsterPos.value.copy(dragonPos);

            if (isDead) {
                dragonPos.y -= delta * 200;
                dragonRef.current.rotation.x = THREE.MathUtils.lerp(dragonRef.current.rotation.x, Math.PI, 0.05);
                if (lightningLightRef.current) lightningLightRef.current.intensity = THREE.MathUtils.lerp(lightningLightRef.current.intensity, 0, 0.1);
                return; 
            }

            const speed = 1200; 
            dirVec.subVectors(camPos, dragonPos);
            dirVec.y = 0; 
            
            if (dirVec.lengthSq() > 250000) {
                dirVec.normalize();
                dragonPos.addScaledVector(dirVec, speed * delta);
                dragonRef.current.lookAt(camPos.x, dragonPos.y, camPos.z);
            }
            
            const dGroundY = getTerrainY(dragonPos.x, dragonPos.z);
            const desiredY = dGroundY + 500; 
            dragonPos.y += (desiredY - dragonPos.y) * 0.05;

            const runCycle = time * 10.0;
            const flapSpeed = time * 12; 
            
            if (torsoRef.current) torsoRef.current.rotation.x = Math.sin(time * 2) * 0.1;
            if (wingLRef.current) wingLRef.current.rotation.z = Math.sin(flapSpeed) * 0.6 + 0.3;
            if (wingRRef.current) wingRRef.current.rotation.z = -(Math.sin(flapSpeed) * 0.6 + 0.3);
            
            tailRefs.current.forEach((seg, i) => {
                if(seg) {
                    seg.rotation.y = Math.sin(time * 5 - i * 0.6) * 0.3;
                    seg.rotation.x = Math.sin(time * 4 - i * 0.5) * 0.1;
                }
            });
            
            if (neckGroupRef.current) neckGroupRef.current.rotation.y = Math.sin(time * 2) * 0.3;
            if (headRef.current) headRef.current.rotation.x = Math.sin(time * 5) * 0.1;

            if (legFLRef.current) legFLRef.current.rotation.x = Math.sin(runCycle) * 0.8;
            if (legBRRef.current) legBRRef.current.rotation.x = Math.sin(runCycle) * 0.8;
            if (legFRRef.current) legFRRef.current.rotation.x = Math.sin(runCycle + Math.PI) * 0.8;
            if (legBLRef.current) legBLRef.current.rotation.x = Math.sin(runCycle + Math.PI) * 0.8;

            if (breathRef.current) {
                const bArray = breathRef.current.geometry.attributes.position.array;
                const bVel = breathData.vel;
                for(let i=0; i<breathCount; i++) {
                    bArray[i*3] += bVel[i].x;
                    bArray[i*3+1] += bVel[i].y;
                    bArray[i*3+2] += bVel[i].z; 
                    
                    bVel[i].x *= 1.03;
                    bVel[i].y *= 1.03;
                    
                    if (bArray[i*3+2] > 1200) {
                        bArray[i*3] = (Math.random() - 0.5) * 15;
                        bArray[i*3+1] = (Math.random() - 0.5) * 15;
                        bArray[i*3+2] = 0;
                        bVel[i].x = (Math.random() - 0.5) * 8;
                        bVel[i].y = (Math.random() - 0.5) * 8;
                    }
                }
                breathRef.current.geometry.attributes.position.needsUpdate = true;
            }

            if (iceTrailRef.current && Math.random() > 0.3) {
                iceDummy.position.copy(dragonPos);
                iceDummy.position.x += (Math.random() - 0.5) * 500;
                iceDummy.position.z += (Math.random() - 0.5) * 500;
                iceDummy.position.y = getTerrainY(iceDummy.position.x, iceDummy.position.z); 
                
                iceDummy.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
                iceDummy.scale.setScalar(Math.random() * 2.0 + 0.5);
                iceDummy.updateMatrix();
                
                iceTrailRef.current.setMatrixAt(iceIndex.current, iceDummy.matrix);
                iceTrailRef.current.instanceMatrix.needsUpdate = true;
                iceIndex.current = (iceIndex.current + 1) % iceCount;
            }

            if (Math.random() > 0.85) {
                lightningRefs.current.forEach((bolt, i) => {
                    if (bolt && Math.random() > 0.4) {
                        const posArr = lightningData[i];
                        const sX = (Math.random()-0.5)*500; const sY = (Math.random()-0.5)*300 + 100; const sZ = (Math.random()-0.5)*500;
                        const eX = (Math.random()-0.5)*500; const eY = (Math.random()-0.5)*300 + 100; const eZ = (Math.random()-0.5)*500;
                        
                        let cX = sX, cY = sY, cZ = sZ;
                        const stX = (eX-sX)/8, stY = (eY-sY)/8, stZ = (eZ-sZ)/8;
                        
                        for(let j=0; j<=8; j++) {
                            posArr[j*3] = cX + (Math.random()-0.5)*80; 
                            posArr[j*3+1] = cY + (Math.random()-0.5)*80; 
                            posArr[j*3+2] = cZ + (Math.random()-0.5)*80; 
                            cX+=stX; cY+=stY; cZ+=stZ;
                        }
                        bolt.geometry.attributes.position.needsUpdate = true;
                        bolt.visible = true;
                    } else if (bolt) {
                        bolt.visible = false;
                    }
                });
                if (lightningLightRef.current) lightningLightRef.current.intensity = 3000 + Math.random() * 4000;
            } else {
                lightningRefs.current.forEach(bolt => { if (bolt) bolt.visible = false; });
                if (lightningLightRef.current) lightningLightRef.current.intensity = THREE.MathUtils.lerp(lightningLightRef.current.intensity, 0, 0.2);
            }
        }
    });

    return (
        <group>
            <OrbitControls 
                ref={controlsRef} 
                enablePan={true} 
                enableZoom={false} // Disabled because Y is locked
                maxPolarAngle={Math.PI / 2 - 0.05} 
                minPolarAngle={0.1}
            />
            <fog attach="fog" args={["#01050a", 500, 10000]} />
            <ambientLight intensity={1.5} color="#050111" />
            
            <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={floorGeo} dispose={null}>
                <shaderMaterial 
                    uniforms={uniforms}
                    vertexShader={`
                        varying vec2 vUv;
                        varying vec3 vWorldPos;
                        void main() {
                            vUv = uv; 
                            vec3 pos = position;
                            pos.z += sin(pos.x * 0.0015) * cos(pos.y * 0.0015) * 800.0;
                            vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
                            vWorldPos = worldPosition.xyz;
                            gl_Position = projectionMatrix * viewMatrix * worldPosition;
                        }
                    `}
                    fragmentShader={`
                        uniform sampler2D tVideo;
                        uniform vec3 uMonsterPos;
                        varying vec2 vUv;
                        varying vec3 vWorldPos;
                        float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
                        void main() {
                            vec4 vidColor = texture2D(tVideo, vUv);
                            float dist = distance(vWorldPos, uMonsterPos);
                            float noise = rand(floor(vWorldPos.xz * 0.03)) * 150.0; 
                            float iceFactor = 1.0 - smoothstep(300.0, 800.0, dist + noise);
                            vec3 iceColor = vec3(0.5, 0.9, 1.0) * 1.8; 
                            vec3 finalColor = mix(vidColor.rgb, iceColor, iceFactor * 0.95);
                            gl_FragColor = vec4(finalColor, 1.0);
                        }
                    `}
                />
            </mesh>

            <instancedMesh ref={iceTrailRef} args={[iceConeGeo, null, iceCount]} dispose={null}>
                <meshBasicMaterial color="#00ffff" transparent opacity={0.85} />
            </instancedMesh>

            <group ref={dragonRef} position={[0, 800, -3000]}>
                <mesh onClick={handleDamage} visible={false}>
                    <sphereGeometry args={[400]} />
                    <meshBasicMaterial />
                </mesh>

                {!isDead && (
                    <Html position={[0, 400, 0]} center zIndexRange={[100, 0]}>
                        <div style={{ background: 'rgba(0,0,0,0.8)', border: '2px solid #ff0044', padding: '5px 15px', color: '#ff0044', fontWeight: 'bold', letterSpacing: '2px', borderRadius: '4px', textShadow: '0 0 10px #ff0044' }}>
                            DRAGON HP: {dragonHp} 
                        </div>
                    </Html>
                )}

                <pointLight color="#00ffff" intensity={4000} distance={2000} />
                <pointLight ref={lightningLightRef} color="#ffffff" intensity={0} distance={3000} position={[0, 100, 0]} />

                {lightningData.map((data, i) => (
                    <line key={`bolt-${i}`} ref={el => lightningRefs.current[i] = el} visible={false}>
                        <bufferGeometry>
                            <bufferAttribute attach="attributes-position" count={9} array={data} itemSize={3} />
                        </bufferGeometry>
                        <lineBasicMaterial color="#ffffff" transparent opacity={0.9} linewidth={3} />
                    </line>
                ))}

                <group ref={torsoRef} position={[0, 180, 0]}>
                    <mesh rotation-x={Math.PI / 2} material={dragonMat} dispose={null}>
                        <cylinderGeometry args={[40, 50, 240, 8]} />
                    </mesh>
                    
                    <group ref={wingLRef} position={[30, 40, 40]}>
                        <mesh geometry={wingGeo} material={dragonMat} dispose={null} />
                    </group>
                    <group ref={wingRRef} position={[-30, 40, 40]}>
                        <mesh geometry={wingGeo} material={dragonMat} scale={[-1, 1, 1]} dispose={null} />
                    </group>

                    <group ref={legFLRef} position={[45, -20, 80]}>
                        <mesh position={[0, -50, 0]} material={dragonMat} dispose={null}><cylinderGeometry args={[20, 15, 100, 8]} /></mesh>
                    </group>
                    <group ref={legFRRef} position={[-45, -20, 80]}>
                        <mesh position={[0, -50, 0]} material={dragonMat} dispose={null}><cylinderGeometry args={[20, 15, 100, 8]} /></mesh>
                    </group>
                    <group ref={legBLRef} position={[45, -20, -80]}>
                        <mesh position={[0, -50, 0]} material={dragonMat} dispose={null}><cylinderGeometry args={[20, 15, 100, 8]} /></mesh>
                    </group>
                    <group ref={legBRRef} position={[-45, -20, -80]}>
                        <mesh position={[0, -50, 0]} material={dragonMat} dispose={null}><cylinderGeometry args={[20, 15, 100, 8]} /></mesh>
                    </group>

                    <group ref={neckGroupRef} position={[0, 20, 100]}>
                        <mesh position={[0, 30, 30]} rotation-x={Math.PI / 4} material={dragonMat} dispose={null}>
                            <cylinderGeometry args={[20, 30, 100, 8]} />
                        </mesh>
                        <group ref={headRef} position={[0, 70, 70]}>
                            <mesh material={dragonMat} dispose={null}>
                                <boxGeometry args={[40, 35, 90]} />
                            </mesh>
                            <pointLight color="#ffffff" intensity={2000} distance={500} position={[0, 0, 40]} />
                            
                            <points ref={breathRef} position={[0, 0, 45]}>
                                <bufferGeometry>
                                    <bufferAttribute attach="attributes-position" count={breathCount} array={breathData.pos} itemSize={3} />
                                </bufferGeometry>
                                <pointsMaterial color="#ccffff" size={20} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
                            </points>
                        </group>
                    </group>

                    {Array.from({ length: 8 }).map((_, i) => (
                        <group key={`tail-${i}`} ref={el => tailRefs.current[i] = el} position={i === 0 ? [0, -10, -100] : [0, 0, -50]}>
                            <mesh rotation-x={Math.PI / 2} material={dragonMat} dispose={null}>
                                <cylinderGeometry args={[35 - (i * 4), 35 - ((i + 1) * 4), 50, 12]} />
                            </mesh>
                        </group>
                    ))}
                </group>
            </group>
        </group>
    );
}
