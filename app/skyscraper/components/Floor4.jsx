'use client';
import React, { useState, useRef, useMemo, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { OrbitControls, useVideoTexture, Trail, Sparkles, Sphere } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

const GRAVITY = -60; 
const MOVE_SPEED = 30;
const NORMAL_BOUNCE = 25; 
const JUMP_BOUNCE = 48;   
const LEVEL_SPACING = 20; 
const PLATFORM_RADIUS = 7;
const PLAYER_RADIUS = 2;
const TOTAL_LEVELS = 99;

const GameScene = ({ gameState, setGameState, highestLevel, setHighestLevel }) => {
    const { camera } = useThree();
    
    const wallTex = useVideoTexture('/media/skyscraper/mjsj4i.mov', { muted: true, loop: true, playsInline: true });
    const ballTex = useVideoTexture('/media/skyscraper/tuw4of.mp4', { muted: true, loop: true, playsInline: true });
    
    const playerRef = useRef();
    const platformsRef = useRef();
    const velocity = useRef(new THREE.Vector3(0, 0, 0));
    const lockedDirection = useRef(new THREE.Vector3(0, 0, 0));
    const jumpRequested = useRef(false);
    const activeLevel = useRef(1);

    const platformsData = useMemo(() => {
        return Array.from({ length: TOTAL_LEVELS }).map((_, i) => {
            const level = i + 1;
            const hue = (level / TOTAL_LEVELS) * 300;
            return {
                level,
                color: new THREE.Color(`hsl(${hue}, 100%, 50%)`),
                initialY: level * LEVEL_SPACING,
                initialX: level <= 25 ? (level % 2 === 0 ? 15 : -15) : 0,
                initialZ: 0
            };
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (gameState !== 'playing') return;
            const k = e.key.toLowerCase();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();

            lockedDirection.current.set(0,0,0);
            if (k === 'w') lockedDirection.current.copy(forward);
            if (k === 's') lockedDirection.current.copy(forward).negate();
            if (k === 'd') lockedDirection.current.copy(right);
            if (k === 'a') lockedDirection.current.copy(right).negate();
            if (e.code === 'Space') jumpRequested.current = true;
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space') jumpRequested.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [camera, gameState]);

    useEffect(() => {
        const handleCustomInput = (e) => {
            const { type, action } = e.detail;
            if (type === 'jump') {
                jumpRequested.current = action === 'down';
            } else if (type === 'move' && action === 'down') {
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
                
                lockedDirection.current.set(0,0,0);
                if (e.detail.dir === 'w') lockedDirection.current.copy(forward);
                if (e.detail.dir === 's') lockedDirection.current.copy(forward).negate();
                if (e.detail.dir === 'd') lockedDirection.current.copy(right);
                if (e.detail.dir === 'a') lockedDirection.current.copy(right).negate();
            }
        };
        window.addEventListener('game-input', handleCustomInput);
        return () => window.removeEventListener('game-input', handleCustomInput);
    }, [camera]);

    useEffect(() => {
        if (gameState === 'playing' && playerRef.current) {
            playerRef.current.position.set(platformsData[0].initialX, LEVEL_SPACING + 10, platformsData[0].initialZ);
            velocity.current.set(0, 0, 0);
            lockedDirection.current.set(0, 0, 0);
            activeLevel.current = 1;
            setHighestLevel(1);
        }
    }, [gameState, platformsData, setHighestLevel]);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        const time = state.clock.getElapsedTime();

        if (platformsRef.current) {
            platformsRef.current.children.forEach((p, i) => {
                const level = i + 1;
                const speed = 1.5 + (level * 0.01);
                const amp = 20;
                
                if (level >= 26 && level <= 49) p.position.x = Math.sin(time * speed) * amp;
                else if (level >= 50 && level <= 74) p.position.z = Math.cos(time * speed) * amp;
                else if (level >= 75 && level <= 84) { p.position.x = Math.sin(time * speed) * amp; p.position.z = Math.cos(time * speed) * amp; }
                else if (level >= 85 && level <= 98) { p.position.x = Math.sin(-time * speed) * amp; p.position.z = Math.cos(-time * speed) * amp; }
                else if (level === 99) {
                    p.position.x = Math.sin(time * 2) * amp + Math.sin(time * 4.5) * 10;
                    p.position.z = Math.cos(time * 1.5) * amp + Math.cos(time * 3) * 10;
                }
            });
        }

        if (gameState === 'playing' && playerRef.current && platformsRef.current) {
            const pos = playerRef.current.position;
            
            velocity.current.x = lockedDirection.current.x * MOVE_SPEED;
            velocity.current.z = lockedDirection.current.z * MOVE_SPEED;
            velocity.current.y += GRAVITY * dt;
            
            pos.addScaledVector(velocity.current, dt);

            // Strict collision checking based exactly on HTML math
            for (let i = 0; i < platformsRef.current.children.length; i++) {
                const p = platformsRef.current.children[i];
                if (velocity.current.y < 0 && Math.abs(pos.y - PLAYER_RADIUS - (p.position.y + 0.5)) < 1.5) {
                    const dx = pos.x - p.position.x;
                    const dz = pos.z - p.position.z;
                    if (Math.sqrt(dx*dx + dz*dz) < PLATFORM_RADIUS + PLAYER_RADIUS) {
                        
                        pos.y = p.position.y + 0.5 + PLAYER_RADIUS;
                        
                        if (jumpRequested.current) {
                            velocity.current.y = JUMP_BOUNCE;
                            jumpRequested.current = false; 
                        } else {
                            velocity.current.y = NORMAL_BOUNCE;
                        }

                        const hitLevel = i + 1;
                        if (hitLevel > activeLevel.current) {
                            activeLevel.current = hitLevel;
                            setHighestLevel(hitLevel);
                        }
                        break;
                    }
                }
            }

            const minSafeHeight = (Math.max(1, activeLevel.current - 2) * LEVEL_SPACING) - 10;
            if (pos.y < minSafeHeight) {
                setGameState('gameover');
            }

            const targetCamPos = new THREE.Vector3(pos.x, pos.y + 20, pos.z + 45);
            camera.position.lerp(targetCamPos, 0.1);
            camera.lookAt(pos.x, pos.y, pos.z);
        }
    });

    return (
        <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[20, 100, 50]} intensity={1} color="#ffffff" />
            
            <mesh>
                <sphereGeometry args={[800, 32, 32]} />
                <meshBasicMaterial map={wallTex} side={THREE.BackSide} />
            </mesh>

            <group ref={platformsRef}>
                {platformsData.map((data, idx) => (
                    <group key={idx} position={[data.initialX, data.initialY, data.initialZ]}>
                        <mesh>
                            <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS, 1, 32]} />
                            <meshPhongMaterial color={data.color} transparent opacity={0.8} shininess={100} />
                        </mesh>
                        <mesh rotation-x={Math.PI / 2} position-y={0.5}>
                            <ringGeometry args={[PLATFORM_RADIUS + 0.5, PLATFORM_RADIUS + 1.5, 32]} />
                            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.5} />
                        </mesh>
                    </group>
                ))}
            </group>

            {(gameState === 'playing' || gameState === 'menu') && (
                <group ref={playerRef} position={[0, LEVEL_SPACING + 10, 0]}>
                    <Trail width={4} color="#00ffcc" length={10} decay={1.5}>
                        <Sphere args={[PLAYER_RADIUS, 32, 32]}>
                            <meshBasicMaterial map={ballTex} />
                        </Sphere>
                    </Trail>
                    <Sparkles count={40} scale={6} size={5} speed={0.4} opacity={1} color="#00ffcc" />
                    <pointLight intensity={2} distance={80} color="#ffffff" />
                </group>
            )}
        </>
    );
};

export default function Floor4() {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'FLOOR 4' });
    const [gameState, setGameState] = useState('menu');
    const [highestLevel, setHighestLevel] = useState(1);
    const [activeKey, setActiveKey] = useState(null);
    const [jumpActive, setJumpActive] = useState(false);

    const emitInput = (type, dir, action) => {
        if (type === 'move') setActiveKey(action === 'down' ? dir : null);
        if (type === 'jump') setJumpActive(action === 'down');
        window.dispatchEvent(new CustomEvent('game-input', { detail: { type, dir, action } }));
    };

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative', touchAction: 'none' }}>
            
            {gameState !== 'playing' && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', textAlign: 'center', color: '#fff', fontFamily: 'monospace' }}>
                    <h1 style={{ fontSize: '3rem', color: '#00ffcc', margin: '0 0 10px 0', textShadow: '0 0 15px #00ffcc', letterSpacing: '2px' }}>THE 99-LEVEL ASCENT</h1>
                    {gameState === 'gameover' && (
                        <p style={{ fontSize: '1.5rem', color: '#ff0055', marginBottom: '20px' }}>
                            SYSTEM FAILURE. HIGHEST LEVEL: {highestLevel}
                        </p>
                    )}
                    <p style={{ fontSize: '1.1rem', maxWidth: '600px', margin: '0 0 30px 0', opacity: 0.9 }}>
                        Tap a direction to lock in movement. Time your single JUMP perfectly on bounce to ascend!
                    </p>
                    <button 
                        onClick={() => setGameState('playing')}
                        style={{ padding: '15px 40px', fontSize: '24px', fontWeight: 'bold', background: '#00ffcc', color: '#000', border: 'none', borderRadius: '5px', cursor: 'pointer', textTransform: 'uppercase', boxShadow: '0 0 15px #00ffcc', fontFamily: 'monospace' }}
                    >
                        {gameState === 'gameover' ? 'RESTART' : 'START GAME'}
                    </button>
                </div>
            )}

            {gameState === 'playing' && (
                <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, color: '#fff', fontFamily: 'monospace', textShadow: '0 0 10px #000' }}>
                    <h1 style={{ margin: '0 0 5px 0', fontSize: '20px', textTransform: 'uppercase', letterSpacing: '2px' }}>Ascent Phase</h1>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>Click & drag to rotate camera</p>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: highestLevel === 99 ? '#ff0055' : '#00ffcc', marginTop: '10px' }}>
                        Level: {highestLevel}
                    </div>
                </div>
            )}

            {/* Mobile Controls mapping exactly to the HTML version layout */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, zIndex: 10, display: 'flex', justifyContent: 'space-between', userSelect: 'none', pointerEvents: gameState === 'playing' ? 'auto' : 'none', opacity: gameState === 'playing' ? 1 : 0, transition: 'opacity 0.3s' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px', gridTemplateRows: '60px 60px 60px', gap: '5px' }}>
                    {['w', 'a', 'd', 's'].map(key => {
                        const isUp = key === 'w'; const isDown = key === 's'; const isLeft = key === 'a'; const isRight = key === 'd';
                        const col = isLeft ? 1 : isRight ? 3 : 2;
                        const row = isUp ? 1 : isDown ? 3 : 2;
                        const isActive = activeKey === key;
                        return (
                            <div 
                                key={key}
                                onPointerDown={() => emitInput('move', key, 'down')} 
                                style={{ gridColumn: col, gridRow: row, background: isActive ? 'rgba(0, 255, 204, 0.5)' : 'rgba(255, 255, 255, 0.2)', border: `2px solid ${isActive ? '#00ffcc' : 'rgba(255, 255, 255, 0.5)'}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: 'bold' }}
                            >
                                {key.toUpperCase()}
                            </div>
                        )
                    })}
                </div>
                
                <div 
                    onPointerDown={() => emitInput('jump', null, 'down')}
                    onPointerUp={() => emitInput('jump', null, 'up')}
                    onPointerOut={() => emitInput('jump', null, 'up')}
                    style={{ alignSelf: 'flex-end', width: '100px', height: '100px', borderRadius: '50%', background: jumpActive ? 'rgba(255, 0, 85, 0.8)' : 'rgba(255, 0, 85, 0.3)', border: '2px solid #ff0055', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: 'bold', marginBottom: '40px', marginRight: '20px' }}
                >
                    JUMP
                </div>
            </div>

            <Canvas camera={{ position: [0, 20, 50], fov: 60 }} gl={{ antialias: true, alpha: false }} onCreated={sceneGuard.onCreated}>
                <color attach="background" args={['#000']} />
                <fogExp2 attach="fog" args={['#000000', 0.005]} />
                
                <Suspense fallback={null}>
                    <GameScene gameState={gameState} setGameState={setGameState} highestLevel={highestLevel} setHighestLevel={setHighestLevel} />
                </Suspense>
                
                <EffectComposer disableNormalPass><Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.4} /></EffectComposer>
                <OrbitControls enablePan={false} maxDistance={100} minDistance={20} enableDamping />
            </Canvas>
        </div>
    );
}
