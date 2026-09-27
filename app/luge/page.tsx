// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { LUGE_COURSES, LUGE_SLEDS } from '@/lib/luge_data';

// ==========================================
// 3D TRACK & PHYSICS ENGINE
// ==========================================
function LugeTrack({ course, sled, onFinish }) {
  const { camera } = useThree();
  const sledRef = useRef(null);
  
  const [trackTex, setTrackTex] = useState(null);
  const progress = useRef(0);
  const speed = useRef(0);
  const maxSpeed = 80 + (course.turns * 2); 
  
  // 1. Dynamic Texture Loader (Safe Fallbacks per Course)
  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    
    loader.load(course.texture, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      // Adjusted for 3x course length so it doesn't stretch 
      tex.repeat.set(4, course.length / 50); 
      tex.needsUpdate = true;
      if (isMounted) setTrackTex(tex);
    }, undefined, () => {
      console.warn(`[Luge Engine]: ${course.texture} missing. Injecting generic matrix.`);
      const blank = new THREE.DataTexture(new Uint8Array([30, 30, 35, 255]), 1, 1, THREE.RGBAFormat);
      blank.needsUpdate = true;
      if (isMounted) setTrackTex(blank);
    });

    return () => { isMounted = false; };
  }, [course]);

  // 2. Mathematically Generate the 3D Spline Curve
  const curve = useMemo(() => {
    const points = [];
    const numSegments = Math.max(50, course.length / 10);
    
    for(let i = 0; i <= numSegments; i++) {
       const t = i / numSegments; 
       const x = Math.sin(t * Math.PI * course.turns) * (30 + course.turns * 3);
       const y = -t * course.drop * 3; 
       const z = -t * course.length;
       points.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(points, false);
  }, [course]);

  // 3. The 60FPS Game Loop
  useFrame((state, delta) => {
    if (speed.current < maxSpeed) speed.current += delta * 15;
    
    progress.current += (speed.current * delta) / course.length;
    
    if (progress.current >= 0.999) {
      onFinish();
      return;
    }

    const safeProgress = Math.min(progress.current, 0.999);
    
    const pos = curve.getPointAt(safeProgress);
    const tangent = curve.getTangentAt(safeProgress);
    const lookAtPos = curve.getPointAt(Math.min(safeProgress + 0.02, 1.0));
    
    const roll = tangent.x * Math.PI * 1.2; 
    
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0,0,1), roll);
    const down = up.clone().negate();
    
    if (sledRef.current) {
        sledRef.current.position.copy(pos).addScaledVector(tangent, 15).addScaledVector(down, 8.5);
        const sledMatrix = new THREE.Matrix4().lookAt(sledRef.current.position, sledRef.current.position.clone().add(tangent), up);
        sledRef.current.quaternion.setFromRotationMatrix(sledMatrix);
    }
    
    camera.position.copy(pos).addScaledVector(up, -3); 
    camera.up.copy(up);
    camera.lookAt(lookAtPos);
    
    camera.fov = THREE.MathUtils.lerp(camera.fov, 65 + (speed.current * 0.25), delta * 2);
    camera.updateProjectionMatrix();
    
    if (trackTex && trackTex.isTexture) {
      trackTex.offset.y -= delta * speed.current * 0.02; // Scaled scrolling due to map repeats
    }
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, Math.floor(course.length / 5), 10, 24, false]} />
        {/* CHANGED TO BASIC MATERIAL: Forces the uploaded image textures to display brightly in the dark tunnel */}
        <meshBasicMaterial 
          map={trackTex} 
          side={THREE.BackSide} 
          color={course.bg === '#0a0a14' ? '#ffffff' : course.bg} 
        />
      </mesh>

      <group ref={sledRef}>
        <mesh castShadow>
          <boxGeometry args={[3, 1, 6]} />
          <meshStandardMaterial color={sled.color} roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[3.2, 0.2, 6.2]} />
          <meshBasicMaterial color={sled.accent} toneMapped={false} />
        </mesh>
        <pointLight color={sled.accent} intensity={3.0} distance={100} position={[0, 2, -5]} />
        <spotLight color="#ffffff" intensity={4.0} distance={150} angle={Math.PI / 4} penumbra={0.5} position={[0, 1, -3]} target-position={[0, 1, -20]} />
      </group>
    </group>
  );
}

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function LugeEngine() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [gameState, setGameState] = useState('menu'); 
  
  const [selectedCourse, setSelectedCourse] = useState(LUGE_COURSES[0]);
  const [selectedSled, setSelectedSled] = useState(LUGE_SLEDS[0]);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#00ffff; text-align:center; padding:50px;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);
      
      const REPO_NAME = window.location.hostname || 'Unknown-Node';
      supabase.from('central_telemetry').insert([{
          repository_name: REPO_NAME,
          action_type: 'game_load',
          details: { game: 'luge', url: window.location.href, timestamp: new Date().toISOString() }
      }]);
    });
  }, [router]);

  const handleFinish = () => {
    if (selectedCourse.id === 20) {
      setGameState('podium');
    } else {
      setGameState('menu');
    }
  };

  if (!mounted) return <div className="bg-black w-screen h-screen"></div>;

  return (
    <>
      <button 
        onClick={() => router.push('/')} 
        className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-cyan-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-white hover:border-cyan-400"
      >
        EXIT MATRIX
      </button>

      {gameState === 'menu' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
            <h1 className="mb-2 font-['Orbitron'] text-4xl text-cyan-400 drop-shadow-[0_0_15px_rgba(0,255,255,0.5)] uppercase tracking-widest">Cyberpunk Luge</h1>
            <p className="mb-8 text-sm tracking-widest text-zinc-500 uppercase">Neon Descent Engine</p>

            <div className="flex w-full max-w-5xl gap-8 h-[60vh]">
                <div className="flex flex-col flex-1 p-4 overflow-y-auto border rounded border-cyan-500/30 bg-black/50 custom-scrollbar">
                    <h2 className="mb-4 font-bold text-fuchsia-400">SELECT COURSE</h2>
                    {LUGE_COURSES.map(course => (
                        <div 
                            key={course.id} 
                            onClick={() => setSelectedCourse(course)}
                            className={`p-3 mb-2 text-left border rounded cursor-pointer transition-all ${selectedCourse.id === course.id ? 'border-cyan-400 bg-cyan-900/30' : 'border-zinc-800 hover:border-zinc-500'}`}
                        >
                            <div className="text-sm font-bold text-white uppercase">{course.name}</div>
                            <div className="text-[10px] text-zinc-400">{course.desc}</div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col flex-1 p-4 overflow-y-auto border rounded border-fuchsia-500/30 bg-black/50 custom-scrollbar">
                    <h2 className="mb-4 font-bold text-cyan-400">SELECT SLED</h2>
                    {LUGE_SLEDS.map(sled => (
                        <div 
                            key={sled.id} 
                            onClick={() => setSelectedSled(sled)}
                            className={`p-3 mb-2 text-left border rounded cursor-pointer transition-all ${selectedSled.id === sled.id ? 'border-fuchsia-400 bg-fuchsia-900/30' : 'border-zinc-800 hover:border-zinc-500'}`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white uppercase">{sled.name}</span>
                                <span className="text-[10px] uppercase text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">{sled.type}</span>
                            </div>
                            <div className="text-[10px] text-amber-400 mt-1">{sled.desc}</div>
                        </div>
                    ))}
                    <button 
                        onClick={() => setGameState('store')}
                        className="w-full py-3 mt-4 text-xs font-bold tracking-widest text-black uppercase transition-all bg-amber-400 rounded hover:bg-white"
                    >
                        OPEN PREMIUM STORE
                    </button>
                </div>
            </div>

            <button 
                onClick={() => setGameState('racing')}
                className="px-12 py-4 mt-8 font-['Orbitron'] text-lg font-bold text-black uppercase transition-all bg-cyan-400 rounded-full hover:bg-white hover:shadow-[0_0_30px_rgba(0,255,255,0.6)] tracking-widest"
            >
                INITIATE DESCENT
            </button>
        </div>
      )}

      {gameState === 'store' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
            <h1 className="mb-2 font-['Orbitron'] text-3xl text-amber-400 drop-shadow-[0_0_15px_rgba(255,215,0,0.5)] uppercase tracking-widest">Premium Sled Store</h1>
            <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">Unlock advanced telemetry matrices.</p>
            
            <div className="w-full max-w-3xl p-8 border rounded border-amber-500/30 bg-black/50">
                <div className="mb-6 text-xl text-fuchsia-400">STORE CONNECTION OFFLINE</div>
                <p className="text-sm text-zinc-400">The Olympus payment gateway is currently disconnected. All premium sleds have been temporarily unlocked for testing protocols.</p>
                <button 
                    onClick={() => setGameState('menu')}
                    className="px-8 py-3 mt-8 font-bold tracking-widest text-black uppercase bg-amber-400 rounded hover:bg-white"
                >
                    RETURN TO GARAGE
                </button>
            </div>
        </div>
      )}

      {gameState === 'racing' && (
        <div className="relative w-full h-full bg-black">
            <Canvas camera={{ position: [0, 0, 0], fov: 60 }} style={{ position: 'absolute', inset: 0 }}>
              <color attach="background" args={['#020202']} />
              <fogExp2 attach="fog" args={['#020202', 0.005]} />
              
              <ambientLight intensity={0.5} />
              
              {/* KEY ADDED: Forces the component to unmount/remount on course change, killing stale states */}
              <LugeTrack 
                key={selectedCourse.id}
                course={selectedCourse} 
                sled={selectedSled} 
                onFinish={handleFinish} 
              />

              <EffectComposer>
                <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.2} intensity={1.5} />
              </EffectComposer>
            </Canvas>

            <div className="absolute top-5 left-5 bg-black/80 border border-cyan-500/50 p-4 rounded backdrop-blur text-left z-10">
                <div className="text-cyan-400 font-bold uppercase tracking-widest text-sm mb-1">{selectedCourse.name}</div>
                <div className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">SLED: {selectedSled.name}</div>
                <div className="text-white text-xs font-mono">LENGTH: {selectedCourse.length}M</div>
                <div className="text-white text-xs font-mono">TURNS: {selectedCourse.turns}</div>
            </div>
            
            <div className="absolute bottom-10 w-full text-center text-zinc-500 text-[10px] tracking-[0.3em] animate-pulse pointer-events-none z-10">
                SLED IS AUTO-GUIDED. ANALYZING TELEMETRY...
            </div>
        </div>
      )}

      {gameState === 'podium' && (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center text-white bg-zinc-950">
            <h1 className="mb-2 font-['Orbitron'] text-4xl text-amber-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] uppercase tracking-widest">OLYMPUS CONQUERED</h1>
            <p className="mb-8 text-sm tracking-widest text-zinc-400 uppercase">You have survived all 20 descents.</p>
            
            <div className="w-full max-w-2xl p-8 border rounded border-amber-500/50 bg-black/60 shadow-[0_0_50px_rgba(255,215,0,0.1)]">
                <div className="mb-4 text-lg font-bold text-white">YOUR REWARD AWAITS</div>
                <p className="text-sm text-zinc-400 mb-6">Take a screenshot of this terminal and email it to <span className="text-cyan-400">stakeme10000@gmail.com</span> to claim your free Olympus physical artifact (Hoodie).</p>
                <button 
                    onClick={() => setGameState('menu')}
                    className="px-8 py-3 font-bold tracking-widest text-black uppercase bg-cyan-400 rounded hover:bg-white"
                >
                    RETURN TO MENU
                </button>
            </div>
        </div>
      )}
    </>
  );
}


