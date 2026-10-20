'use client';
// components/dream-engine/DreamScene.jsx
// THE BUILDER + RENDERER — stages 2 and 3 of the Dream Engine.
// Renders a normalized scene JSON as procedural Three.js geometry (no model
// files). Every object type in the vocabulary is a small composition of
// primitives with PBR materials taken from the scene's material words
// (color / roughness / metalness / emissive). Environment colors lerp toward
// their targets each frame, so directing a change ("make the sky obsidian")
// melts the world instead of snapping it. Dreamlike by default: fog,
// floating objects bob, slow spins, drifting particles.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const TMP_COLOR = new THREE.Color();
const TMP_COLOR2 = new THREE.Color();
const TARGET_POS = new THREE.Vector3();
const TARGET_LOOK = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Materials: register into the parent object's material set so DreamObject
// can lerp color/emissive toward the scene values every frame.
// Roles: main (the object's own material), glow (emissive-led), soft
// (lightened main), dark (deepened main), mirror (polished metal).
// ---------------------------------------------------------------------------
function PBR({ obj, role = 'main', roughMul = 1, metalMul = 1, transparent = false, opacity = 1, register }) {
  const ref = useRef(null);
  const setRef = (m) => {
    ref.current = m;
    if (m) m.userData.role = role;
    if (register) register(m);
  };
  return (
    <meshStandardMaterial
      ref={setRef}
      color={obj.color}
      roughness={THREE.MathUtils.clamp(obj.roughness * roughMul, 0, 1)}
      metalness={THREE.MathUtils.clamp(obj.metalness * metalMul, 0, 1)}
      emissive={obj.emissive}
      emissiveIntensity={obj.emissiveIntensity}
      transparent={transparent}
      opacity={opacity}
    />
  );
}

function roleTargets(obj, role, out) {
  // out: { color: THREE.Color, emissive: THREE.Color, intensity: number }
  switch (role) {
    case 'glow':
      out.color.set(obj.emissive !== '#000000' ? obj.emissive : obj.color);
      out.emissive.set(obj.emissive !== '#000000' ? obj.emissive : obj.color);
      out.intensity = Math.max(obj.emissiveIntensity, 0.9);
      break;
    case 'soft':
      out.color.set(obj.color).lerp(TMP_COLOR2.set('#ffffff'), 0.35);
      out.emissive.set(obj.emissive);
      out.intensity = obj.emissiveIntensity * 0.5;
      break;
    case 'dark':
      out.color.set(obj.color).multiplyScalar(0.5);
      out.emissive.set('#000000');
      out.intensity = 0;
      break;
    case 'mirror':
      out.color.set('#dfe8ff');
      out.emissive.set(obj.emissive);
      out.intensity = obj.emissiveIntensity * 0.3;
      break;
    default:
      out.color.set(obj.color);
      out.emissive.set(obj.emissive);
      out.intensity = obj.emissiveIntensity;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Object compositions. Each returns meshes in a unit-ish space; the parent
// group applies the scene scale/rotation/position.
// ---------------------------------------------------------------------------
function ObjectParts({ obj, register }) {
  const M = (role, extra = {}) => <PBR obj={obj} role={role} register={register} {...extra} />;
  switch (obj.type) {
    case 'tower':
      return (<>
        <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.85, 1.05, 5, 10]} />{M('main')}</mesh>
        <mesh position={[0, 5.6, 0]}><coneGeometry args={[1.25, 1.4, 10]} />{M('dark')}</mesh>
        <mesh position={[0, 6.6, 0]}><sphereGeometry args={[0.22, 10, 10]} />{M('glow')}</mesh>
      </>);
    case 'arch':
      return (<>
        <mesh position={[-1.5, 1.5, 0]}><boxGeometry args={[0.55, 3, 0.55]} />{M('main')}</mesh>
        <mesh position={[1.5, 1.5, 0]}><boxGeometry args={[0.55, 3, 0.55]} />{M('main')}</mesh>
        <mesh position={[0, 3, 0]} rotation={[0, 0, 0]}><torusGeometry args={[1.5, 0.3, 8, 20, Math.PI]} />{M('main')}</mesh>
      </>);
    case 'staircase':
      return (<>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0.3 + i * 0.42, -i * 0.62]}>
            <boxGeometry args={[2, 0.22, 0.7]} />{M(i % 2 ? 'main' : 'soft')}
          </mesh>
        ))}
        <mesh position={[0, 4.1, -5.2]}><sphereGeometry args={[0.18, 8, 8]} />{M('glow')}</mesh>
      </>);
    case 'door':
      return (<>
        <mesh position={[-0.85, 1.6, 0]}><boxGeometry args={[0.3, 3.2, 0.4]} />{M('dark')}</mesh>
        <mesh position={[0.85, 1.6, 0]}><boxGeometry args={[0.3, 3.2, 0.4]} />{M('dark')}</mesh>
        <mesh position={[0, 3.3, 0]}><boxGeometry args={[2, 0.3, 0.4]} />{M('dark')}</mesh>
        <group position={[-0.68, 0, 0.1]} rotation={[0, 0.55, 0]}>
          <mesh position={[0.68, 1.5, 0]}><boxGeometry args={[1.35, 3, 0.12]} />{M('main')}</mesh>
          <mesh position={[1.15, 1.5, 0.12]}><sphereGeometry args={[0.09, 8, 8]} />{M('glow')}</mesh>
        </group>
        <mesh position={[0, 1.5, -0.25]}><planeGeometry args={[1.5, 3]} />{M('glow', { transparent: true, opacity: 0.35 })}</mesh>
      </>);
    case 'monolith':
      return (<mesh position={[0, 2.25, 0]}><boxGeometry args={[1.2, 4.5, 0.45]} />{M('main')}</mesh>);
    case 'sphere':
      return (<mesh position={[0, 1.2, 0]}><sphereGeometry args={[1.2, 24, 18]} />{M('main')}</mesh>);
    case 'crystal':
      return (<>
        <mesh position={[0, 1.3, 0]}><octahedronGeometry args={[0.85]} />{M('glow', { roughMul: 0.3 })}</mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.5, 0.7, 0.3, 6]} />{M('dark')}</mesh>
      </>);
    case 'tree':
      return (<>
        <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.16, 0.3, 2.2, 7]} />{M('dark')}</mesh>
        <mesh position={[0, 3, 0]}><sphereGeometry args={[1.25, 14, 12]} />{M('soft')}</mesh>
        <mesh position={[0.8, 2.5, 0.3]}><sphereGeometry args={[0.8, 12, 10]} />{M('soft')}</mesh>
        <mesh position={[-0.7, 2.6, -0.3]}><sphereGeometry args={[0.7, 12, 10]} />{M('main')}</mesh>
      </>);
    case 'clock':
      return (<>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2, 0]}><cylinderGeometry args={[1.45, 1.45, 0.22, 28]} />{M('dark')}</mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2, 0.13]}><cylinderGeometry args={[1.28, 1.28, 0.05, 28]} />{M('soft')}</mesh>
        <mesh position={[0, 2.35, 0.2]} rotation={[0, 0, -0.7]}><boxGeometry args={[0.09, 0.85, 0.04]} />{M('dark')}</mesh>
        <mesh position={[0.22, 2, 0.2]} rotation={[0, 0, Math.PI / 2.4]}><boxGeometry args={[0.09, 0.65, 0.04]} />{M('dark')}</mesh>
        {/* the melt: a slow drip frozen mid-fall */}
        <mesh position={[0.5, 0.45, 0]}><coneGeometry args={[0.35, 1.1, 10]} />{M('soft')}</mesh>
        <mesh position={[0.5, -0.25, 0]}><sphereGeometry args={[0.16, 8, 8]} />{M('soft')}</mesh>
      </>);
    case 'bridge':
      return (<>
        <mesh position={[0, 1.1, 0]}><boxGeometry args={[7, 0.3, 1.6]} />{M('main')}</mesh>
        <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0]}><torusGeometry args={[3.2, 0.16, 8, 24, Math.PI]} />{M('dark')}</mesh>
        {[-3, -1.5, 0, 1.5, 3].map((x) => (
          <mesh key={x} position={[x, 1.6, 0.75]}><boxGeometry args={[0.12, 0.8, 0.12]} />{M('dark')}</mesh>
        ))}
      </>);
    case 'island':
      return (<>
        <mesh position={[0, -1.1, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[2.3, 2.6, 9]} />{M('dark')}</mesh>
        <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[2.3, 2.05, 0.5, 18]} />{M('soft')}</mesh>
      </>);
    case 'pillar':
      return (<>
        <mesh position={[0, 0.2, 0]}><boxGeometry args={[1.3, 0.4, 1.3]} />{M('dark')}</mesh>
        <mesh position={[0, 2.4, 0]}><cylinderGeometry args={[0.42, 0.5, 4, 12]} />{M('main')}</mesh>
        <mesh position={[0, 4.6, 0]}><boxGeometry args={[1.3, 0.4, 1.3]} />{M('dark')}</mesh>
      </>);
    case 'ring':
      return (<mesh position={[0, 1.8, 0]}><torusGeometry args={[1.8, 0.18, 10, 40]} />{M('main', { metalMul: 1.4 })}</mesh>);
    case 'pyramid':
      return (<>
        <mesh position={[0, 1.4, 0]}><coneGeometry args={[2.2, 2.8, 4]} />{M('main')}</mesh>
        <mesh position={[0, 3, 0]}><octahedronGeometry args={[0.28]} />{M('glow')}</mesh>
      </>);
    case 'dome':
      return (<>
        <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[1.9, 2.05, 0.7, 20]} />{M('dark')}</mesh>
        <mesh position={[0, 0.7, 0]}><sphereGeometry args={[1.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />{M('main', { metalMul: 1.2 })}</mesh>
        <mesh position={[0, 2.75, 0]}><sphereGeometry args={[0.16, 8, 8]} />{M('glow')}</mesh>
      </>);
    case 'wall':
      return (<>
        <mesh position={[0, 1.1, 0]}><boxGeometry args={[4.4, 2.2, 0.4]} />{M('main')}</mesh>
        {[-1.8, -0.6, 0.6, 1.8].map((x) => (
          <mesh key={x} position={[x, 2.45, 0]}><boxGeometry args={[0.6, 0.5, 0.42]} />{M('dark')}</mesh>
        ))}
      </>);
    case 'gate':
      return (<>
        <mesh position={[-1.6, 1.9, 0]}><cylinderGeometry args={[0.32, 0.4, 3.8, 10]} />{M('main')}</mesh>
        <mesh position={[1.6, 1.9, 0]}><cylinderGeometry args={[0.32, 0.4, 3.8, 10]} />{M('main')}</mesh>
        <mesh position={[0, 4, 0]}><boxGeometry args={[4.1, 0.45, 0.6]} />{M('dark')}</mesh>
        <mesh position={[0, 1.9, 0]}><planeGeometry args={[2.9, 3.6]} />{M('glow', { transparent: true, opacity: 0.4 })}</mesh>
        <mesh position={[-1.6, 4, 0]}><sphereGeometry args={[0.16, 8, 8]} />{M('glow')}</mesh>
        <mesh position={[1.6, 4, 0]}><sphereGeometry args={[0.16, 8, 8]} />{M('glow')}</mesh>
      </>);
    case 'mushroom':
      return (<>
        <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.32, 0.5, 1.8, 9]} />{M('soft')}</mesh>
        <mesh position={[0, 1.95, 0]}><sphereGeometry args={[1.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />{M('glow', { roughMul: 0.6 })}</mesh>
      </>);
    case 'obelisk':
      return (<>
        <mesh position={[0, 2, 0]}><cylinderGeometry args={[0.42, 0.62, 4, 4]} />{M('main')}</mesh>
        <mesh position={[0, 4.3, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.6, 0.7, 4]} />{M('glow', { metalMul: 1.3 })}</mesh>
      </>);
    case 'floating-rock':
      return (<>
        <mesh position={[0, 0, 0]} rotation={[0.4, 0.2, 0.15]}><dodecahedronGeometry args={[1.15]} />{M('main')}</mesh>
        <mesh position={[0, 1.15, 0]}><octahedronGeometry args={[0.3]} />{M('glow')}</mesh>
      </>);
    case 'water-plane':
      return (<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}><circleGeometry args={[3, 28]} />{M('main', { roughMul: 0.25, metalMul: 1.6, transparent: true, opacity: 0.85 })}</mesh>);
    case 'mountain':
      return (<>
        <mesh position={[0, 2, 0]}><coneGeometry args={[2.6, 4.2, 7]} />{M('main')}</mesh>
        <mesh position={[0, 3.55, 0]}><coneGeometry args={[1.05, 1.5, 7]} />{M('soft')}</mesh>
      </>);
    case 'candle':
      return (<>
        <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.16, 0.2, 1, 10]} />{M('soft')}</mesh>
        <mesh position={[0, 1.22, 0]} scale={[0.7, 1.5, 0.7]}><sphereGeometry args={[0.14, 8, 8]} />{M('glow')}</mesh>
        <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.34, 0.38, 0.08, 12]} />{M('dark', { metalMul: 1.5 })}</mesh>
      </>);
    case 'mirror':
      return (<>
        <mesh position={[0, 1.7, 0]}><torusGeometry args={[1.35, 0.1, 8, 36]} />{M('main', { metalMul: 1.5, roughMul: 0.5 })}</mesh>
        <mesh position={[0, 1.7, 0]}><circleGeometry args={[1.32, 36]} />{M('mirror', { roughMul: 0.1, metalMul: 2 })}</mesh>
        <mesh position={[0, 0.15, 0]}><boxGeometry args={[1.1, 0.3, 0.5]} />{M('dark')}</mesh>
      </>);
    default:
      return (<mesh position={[0, 1, 0]}><boxGeometry args={[1, 2, 1]} />{M('main')}</mesh>);
  }
}

function DreamObject({ obj }) {
  const group = useRef(null);
  const mats = useRef(new Set());
  const phase = useMemo(() => (obj._i || 0) * 1.37, [obj._i]);
  const baseY = obj.position[1];
  const targets = useMemo(() => ({ color: new THREE.Color(), emissive: new THREE.Color(), intensity: 0 }), []);

  const register = (m) => {
    if (m) mats.current.add(m);
    else return;
  };

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (obj.float) {
      g.position.y = baseY + Math.sin(t * 0.6 + phase) * 0.35;
    }
    if (obj.spin === 'slow') {
      g.rotation.y = obj.rotationY + t * 0.12;
    }
    // Melt material colors toward the scene's current values.
    const k = 1 - Math.exp(-dt * 2.6);
    mats.current.forEach((m) => {
      roleTargets(obj, m.userData.role || 'main', targets);
      m.color.lerp(targets.color, k);
      m.emissive.lerp(targets.emissive, k);
      m.emissiveIntensity += (targets.intensity - m.emissiveIntensity) * k;
    });
  });

  return (
    <group ref={group} position={obj.position} rotation={[0, obj.rotationY, 0]} scale={obj.scale}>
      <ObjectParts obj={obj} register={register} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ground, particles, environment
// ---------------------------------------------------------------------------
function Ground({ env }) {
  const matRef = useRef(null);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    if (matRef.current) {
      target.set(env.groundColor);
      matRef.current.color.lerp(target, 1 - Math.exp(-dt * 2.6));
    }
  });
  if (env.groundType === 'void') {
    return (
      <mesh position={[0, -7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[110, 32]} />
        <meshStandardMaterial ref={matRef} color={env.groundColor} roughness={1} metalness={0} transparent opacity={0.55} />
      </mesh>
    );
  }
  if (env.groundType === 'water') {
    return (
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[110, 40]} />
        <meshStandardMaterial ref={matRef} color={env.groundColor} roughness={0.12} metalness={0.85} transparent opacity={0.96} />
      </mesh>
    );
  }
  if (env.groundType === 'dunes') {
    const dunes = useMemo(() => {
      const out = [];
      for (let i = 0; i < 14; i++) {
        const a = (Math.sin(i * 127.1) * 43758.5453) % 1;
        const r = 18 + Math.abs(a) * 55;
        const ang = i * 2.39996; // golden angle scatter
        out.push({
          pos: [Math.cos(ang) * r, -1.6 - (i % 3), Math.sin(ang) * r],
          s: [10 + (i % 4) * 4, 2.6 + (i % 3), 8 + (i % 5) * 3],
        });
      }
      return out;
    }, []);
    return (
      <group>
        <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[110, 32]} />
          <meshStandardMaterial ref={matRef} color={env.groundColor} roughness={1} metalness={0} />
        </mesh>
        {dunes.map((d, i) => (
          <mesh key={i} position={d.pos} scale={d.s}>
            <sphereGeometry args={[1, 18, 12]} />
            <meshStandardMaterial color={env.groundColor} roughness={1} metalness={0} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[110, 40]} />
      <meshStandardMaterial ref={matRef} color={env.groundColor} roughness={0.95} metalness={0.02} />
    </mesh>
  );
}

function Particles({ env }) {
  const ref = useRef(null);
  const matRef = useRef(null);
  const target = useMemo(() => new THREE.Color(), []);
  const { positions, count } = useMemo(() => {
    const count = 700;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const s = (n) => {
        const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      arr[i * 3] = (s(1) - 0.5) * 130;
      arr[i * 3 + 1] = s(2) * 42 + 0.5;
      arr[i * 3 + 2] = (s(3) - 0.5) * 130;
    }
    return { positions: arr, count };
  }, []);
  useFrame((state, dt) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.008;
    if (env.particles === 'snow' || env.particles === 'petals') {
      ref.current.position.y = -((t * 0.7) % 6);
    } else if (env.particles === 'sparks') {
      ref.current.position.y = (t * 0.5) % 5;
    } else {
      ref.current.position.y = Math.sin(t * 0.18) * 0.6;
    }
    if (matRef.current) {
      target.set(env.particleColor);
      matRef.current.color.lerp(target, 1 - Math.exp(-dt * 2.6));
    }
  });
  if (env.particles === 'none') return null;
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={env.particles === 'stars' ? 0.32 : 0.2}
        color={env.particleColor}
        transparent
        opacity={0.9}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function Environment({ env }) {
  const scene = useThree((s) => s.scene);
  const dirRef = useRef(null);
  const ambRef = useRef(null);
  const targets = useMemo(() => ({
    sky: new THREE.Color(env.skyColor),
    fog: new THREE.Color(env.fogColor),
    light: new THREE.Color(env.lightColor),
  }), []);

  useMemo(() => {
    scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
    if (!scene.background) scene.background = new THREE.Color(env.skyColor);
  }, [scene]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2.2);
    targets.sky.set(env.skyColor);
    targets.fog.set(env.fogColor);
    targets.light.set(env.lightColor);
    if (scene.background) scene.background.lerp(targets.sky, k);
    if (scene.fog) {
      scene.fog.color.lerp(targets.fog, k);
      scene.fog.density += (env.fogDensity - scene.fog.density) * k;
    }
    if (dirRef.current) {
      dirRef.current.color.lerp(targets.light, k);
      dirRef.current.intensity += (env.lightIntensity - dirRef.current.intensity) * k;
    }
    if (ambRef.current) {
      ambRef.current.intensity += (env.ambient - ambRef.current.intensity) * k;
    }
  });

  return (<>
    <ambientLight ref={ambRef} intensity={env.ambient} />
    <directionalLight ref={dirRef} position={[18, 28, 12]} intensity={env.lightIntensity} color={env.lightColor} />
    <hemisphereLight args={['#8a7dff', '#0a0618', 0.35]} />
    <pointLight position={[0, 4, 4]} intensity={12} distance={26} color="#ffd9a0" />
  </>);
}

// ---------------------------------------------------------------------------
// The Projection Screen: a grand arched cinema of the subconscious standing
// at the back of the dreamscape. The Dream Engine's film of the dream (Veo)
// plays on it as a VideoTexture once the projection has formed — WebGL is
// instant, the film fades in when it is ready. The video material ignores
// fog on purpose: a projection is light, and light cuts through dream-fog.
// ---------------------------------------------------------------------------
function ProjectionScreen({ videoUrl }) {
  const [texture, setTexture] = useState(null);
  const matRef = useRef(null);

  useEffect(() => {
    if (!videoUrl) {
      setTexture(null);
      return undefined;
    }
    const video = document.createElement('video');
    video.src = videoUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    setTexture(tex);
    const played = video.play();
    if (played && typeof played.catch === 'function') played.catch(() => {});
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      tex.dispose();
      setTexture(null);
    };
  }, [videoUrl]);

  useFrame((_, dt) => {
    if (matRef.current) {
      matRef.current.opacity = THREE.MathUtils.damp(matRef.current.opacity, texture ? 0.96 : 0, 2.2, dt);
    }
  });

  const archShape = useMemo(() => {
    const hw = 14; // half width
    const side = 10; // straight side height before the arc
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(-hw, side);
    s.absarc(0, side, hw, Math.PI, 0, true);
    s.lineTo(hw, 0);
    s.lineTo(-hw, 0);
    return s;
  }, []);

  if (!videoUrl) return null;

  return (
    <group position={[0, 0, -46]}>
      {/* golden rim, slightly larger, behind the dark arch face */}
      <mesh position={[0, 0, -0.12]} scale={[1.045, 1.03, 1]}>
        <shapeGeometry args={[archShape]} />
        <meshStandardMaterial color="#8a6a1f" roughness={0.32} metalness={0.95} emissive="#5a4300" emissiveIntensity={0.55} />
      </mesh>
      {/* the arch face */}
      <mesh position={[0, 0, 0]}>
        <shapeGeometry args={[archShape]} />
        <meshStandardMaterial color="#17102e" roughness={0.45} metalness={0.65} emissive="#241545" emissiveIntensity={0.45} />
      </mesh>
      {/* pillars */}
      {[-14.6, 14.6].map((x) => (
        <mesh key={x} position={[x, 5.5, 0]}>
          <boxGeometry args={[1.3, 11, 1.3]} />
          <meshStandardMaterial color="#241a4a" roughness={0.5} metalness={0.6} emissive="#31205e" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {/* the film itself */}
      {texture && (
        <mesh position={[0, 10, 0.18]}>
          <planeGeometry args={[23, 13]} />
          <meshBasicMaterial
            ref={matRef}
            map={texture}
            transparent
            opacity={0}
            toneMapped={false}
            fog={false}
            color="#e9e5ff"
          />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera rig: walk (WASD + drag look + joystick) or slow orbit.
// rig ref shape: { mode, joyX, joyY } — owned by the page.
// ---------------------------------------------------------------------------
function CameraRig({ rig }) {
  const { camera, gl } = useThree();
  const pos = useRef(new THREE.Vector3(0, 1.7, 9));
  const yaw = useRef(0);
  const pitch = useRef(-0.04);
  const keys = useRef(new Set());
  const orbitTheta = useRef(0.6);
  const orbitPhi = useRef(1.12);
  const drag = useRef(null);
  const vel = useRef(new THREE.Vector3());

  useMemo(() => {
    const dom = gl.domElement;
    const down = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      if (rig.current.mode === 'orbit') {
        orbitTheta.current -= dx * 0.005;
        orbitPhi.current = THREE.MathUtils.clamp(orbitPhi.current - dy * 0.005, 0.25, 1.45);
      } else {
        yaw.current -= dx * 0.0042;
        pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.0042, -1.25, 1.25);
      }
    };
    const up = () => { drag.current = null; };
    const kd = (e) => { keys.current.add(e.code); };
    const ku = (e) => { keys.current.delete(e.code); };
    dom.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    dom.style.touchAction = 'none';
    return () => {
      dom.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [gl, rig]);

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    const mode = rig.current.mode;
    if (mode === 'orbit') {
      orbitTheta.current += step * 0.05;
      const r = 30;
      const cx = Math.sin(orbitPhi.current) * Math.sin(orbitTheta.current) * r;
      const cy = Math.cos(orbitPhi.current) * r + 2;
      const cz = Math.sin(orbitPhi.current) * Math.cos(orbitTheta.current) * r - 4;
      TARGET_POS.set(cx, cy, cz - 0);
      TARGET_LOOK.set(0, 3, -6);
      // Re-sync walk state so toggling back is seamless-ish.
      pos.current.copy(TARGET_POS);
    } else {
      const k = keys.current;
      let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      let iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      ix += rig.current.joyX || 0;
      iz += -(rig.current.joyY || 0);
      const len = Math.hypot(ix, iz);
      if (len > 1) { ix /= len; iz /= len; }
      const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 11 : 5.2;
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      // forward = (-sin yaw, 0, -cos yaw); right = (cos yaw, 0, -sin yaw)
      const mx = (-sin * iz + cos * ix) * speed;
      const mz = (-cos * iz - sin * ix) * speed;
      vel.current.x = THREE.MathUtils.damp(vel.current.x, mx, 8, step);
      vel.current.z = THREE.MathUtils.damp(vel.current.z, mz, 8, step);
      pos.current.x += vel.current.x * step;
      pos.current.z += vel.current.z * step;
      const rr = Math.hypot(pos.current.x, pos.current.z);
      if (rr > 75) { pos.current.x *= 75 / rr; pos.current.z *= 75 / rr; }
      pos.current.y = 1.7 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05; // dreamy hover-bob
      TARGET_POS.copy(pos.current);
      const cp = Math.cos(pitch.current);
      TARGET_LOOK.set(
        pos.current.x - Math.sin(yaw.current) * cp,
        pos.current.y + Math.sin(pitch.current),
        pos.current.z - Math.cos(yaw.current) * cp
      );
    }
    const k2 = 1 - Math.exp(-step * (mode === 'orbit' ? 2.2 : 18));
    camera.position.lerp(TARGET_POS, k2);
    camera.lookAt(TARGET_LOOK);
  });

  return null;
}

export default function DreamScene({ scene, rig, projectionUrl = null, showScreen = true }) {
  const env = scene.environment;
  return (<>
    <Environment env={env} />
    <Ground env={env} />
    <Particles env={env} />
    {scene.objects.map((obj, i) => (
      <DreamObject key={`${obj.type}-${i}`} obj={obj} />
    ))}
    {projectionUrl && showScreen ? <ProjectionScreen videoUrl={projectionUrl} /> : null}
    <CameraRig rig={rig} />
  </>);
}
