'use client';
// components/tidal-rush/TidalRushScene.jsx
// R3F rendering for Tidal Rush. Reads the pure engine state from a ref
// every frame and syncs three.js objects imperatively (no React
// re-renders in the hot loop). Bright ocean world: turquoise shader sea
// (the same three swells the engine simulates), gradient sky, golden
// sun, striped gate buoys, color-coded jet skis and spray.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WAVE,
  GATE_COUNT,
  gatePositions,
  waveHeight,
  waveSlope,
} from '@/app/tidal-rush/engine';

const SUN_DIR = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();

// ------------------------------------------------------------ ocean shader
function waveGLSL() {
  // Generated from the engine's WAVE table so sea and physics never drift.
  return WAVE.map(
    (w) =>
      `h += ${w.amp.toFixed(3)} * sin(p.x * ${w.kx.toFixed(4)} + p.y * ${w.kz.toFixed(4)} + uTime * ${w.speed.toFixed(3)});`
  ).join('\n      ');
}

function Ocean() {
  const matRef = useRef(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR },
      uFogColor: { value: new THREE.Color('#a8d8ea') },
      uFogNear: { value: 260 },
      uFogFar: { value: 1050 },
    }),
    []
  );
  const vertex = useMemo(
    () => /* glsl */ `
      uniform float uTime;
      varying float vH;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vViewZ;
      void main() {
        vec3 pos = position;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vec2 p = wp.xz;
        float h = 0.0;
        ${waveGLSL()}
        // analytic gradient for a believable normal
        float e = 2.0;
        float hx = 0.0;
        float hz = 0.0;
        ${WAVE.map(
          (w) =>
            `hx += ${w.amp.toFixed(3)} * ${w.kx.toFixed(4)} * cos(p.x * ${w.kx.toFixed(4)} + p.y * ${w.kz.toFixed(4)} + uTime * ${w.speed.toFixed(3)});`
        ).join('\n        ')}
        ${WAVE.map(
          (w) =>
            `hz += ${w.amp.toFixed(3)} * ${w.kz.toFixed(4)} * cos(p.x * ${w.kx.toFixed(4)} + p.y * ${w.kz.toFixed(4)} + uTime * ${w.speed.toFixed(3)});`
        ).join('\n        ')}
        wp.y += h;
        vH = h;
        vNormalW = normalize(vec3(-hx, 1.0, -hz));
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    []
  );
  const fragment = useMemo(
    () => /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uTime;
      varying float vH;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vViewZ;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 deep = vec3(0.023, 0.36, 0.55);
        vec3 shallow = vec3(0.13, 0.78, 0.85);
        vec3 col = mix(deep, shallow, smoothstep(-1.4, 1.7, vH));
        // sun glints dancing on the surface
        vec3 hv = normalize(viewDir + uSunDir);
        float spec = pow(max(dot(n, hv), 0.0), 140.0) * 1.4;
        float glint = pow(max(dot(n, hv), 0.0), 700.0) * 3.0;
        col += vec3(1.0, 0.9, 0.65) * (spec * 0.35 + glint);
        // fresnel toward the sky
        float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        col = mix(col, vec3(0.72, 0.88, 0.97), fres * 0.45);
        // foam on the crests
        float foam = smoothstep(1.25, 1.6, vH) * 0.4;
        col = mix(col, vec3(0.97), foam);
        // distance fog to the horizon
        float f = smoothstep(uFogNear, uFogFar, vViewZ);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    []
  );
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[1500, 1500, 150, 150]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------- sky dome
function SkyDome() {
  const uniforms = useMemo(() => ({ uSunDir: { value: SUN_DIR } }), []);
  return (
    <mesh scale={[1100, 1100, 1100]}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uSunDir;
          varying vec3 vDir;
          void main() {
            float y = clamp(vDir.y, -0.08, 1.0);
            vec3 horizon = vec3(0.78, 0.92, 0.98);
            vec3 zenith = vec3(0.16, 0.5, 0.86);
            vec3 col = mix(horizon, zenith, pow(max(y, 0.0), 0.62));
            float sunD = max(dot(normalize(vDir), uSunDir), 0.0);
            col += vec3(1.0, 0.85, 0.5) * pow(sunD, 220.0) * 1.6; // disc
            col += vec3(1.0, 0.8, 0.45) * pow(sunD, 7.0) * 0.22;   // halo
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// ----------------------------------------------------------------- islands
const ISLANDS = [
  { x: -470, z: -320, r: 86, h: 34 },
  { x: 500, z: 210, r: 70, h: 26 },
  { x: -180, z: 540, r: 96, h: 40 },
  { x: 420, z: -480, r: 62, h: 22 },
];

function Islands() {
  return (
    <group>
      {ISLANDS.map((isle, i) => (
        <group key={i} position={[isle.x, 0, isle.z]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[isle.r * 1.06, isle.r * 1.18, 2.4, 24]} />
            <meshStandardMaterial color="#e9d9a2" roughness={1} />
          </mesh>
          <mesh position={[0, isle.h / 2, 0]}>
            <coneGeometry args={[isle.r, isle.h, 8]} />
            <meshStandardMaterial color="#2f8f57" roughness={1} flatShading />
          </mesh>
          <mesh position={[isle.r * 0.28, isle.h * 0.55, isle.r * 0.12]}>
            <coneGeometry args={[isle.r * 0.45, isle.h * 0.8, 7]} />
            <meshStandardMaterial color="#27784a" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------- buoys
function Buoys({ stateRef }) {
  const groupRef = useRef(null);
  const gates = useMemo(() => gatePositions(), []);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    const player = s.racers[0];
    const nextIdx = player ? player.nextGate % GATE_COUNT : 0;
    let k = 0;
    for (let i = 0; i < gates.length; i++) {
      for (const side of ['left', 'right']) {
        const buoy = g.children[k++];
        if (!buoy) continue;
        const pos = gates[i][side];
        const bob = waveHeight(pos.x, pos.z, t) * 0.75;
        buoy.position.set(pos.x, bob + 0.7, pos.z);
        buoy.rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.1;
        buoy.rotation.x = Math.cos(t * 1.1 + i) * 0.08;
        const isNext = i === nextIdx && s.phase !== 'finished';
        const pulse = isNext ? 1 + Math.sin(t * 6) * 0.16 : 1;
        buoy.scale.setScalar(pulse);
        const body = buoy.children[0];
        if (body) {
          body.material.emissive.set(isNext ? '#00e5ff' : '#000000');
          body.material.emissiveIntensity = isNext ? 0.85 : 0;
        }
      }
    }
  });
  return (
    <group ref={groupRef}>
      {gates.flatMap((gate, i) =>
        ['left', 'right'].map((side) => (
          <group key={`${i}-${side}`}>
            <mesh>
              <cylinderGeometry args={[0.85, 1.05, 2.4, 10]} />
              <meshStandardMaterial color="#ff7b1c" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.92, 0.92, 0.55, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.45, 0]}>
              <sphereGeometry args={[0.42, 10, 8]} />
              <meshStandardMaterial color="#ff4757" roughness={0.5} />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}

// --------------------------------------------------------------- start arch
function StartArch() {
  const gate0 = useMemo(() => gatePositions()[0], []);
  const mid = useMemo(
    () => ({
      x: (gate0.left.x + gate0.right.x) / 2,
      z: (gate0.left.z + gate0.right.z) / 2,
      angle: Math.atan2(gate0.tx, gate0.tz),
      span: Math.hypot(gate0.left.x - gate0.right.x, gate0.left.z - gate0.right.z),
    }),
    [gate0]
  );
  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, mid.angle, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (mid.span / 2), 4.4, 0]}>
          <boxGeometry args={[1.2, 8.8, 1.2]} />
          <meshStandardMaterial color="#c99327" emissive="#8a5d00" emissiveIntensity={0.35} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 9.2, 0]}>
        <boxGeometry args={[mid.span + 2.4, 1.9, 0.7]} />
        <meshStandardMaterial color="#0b2a3f" emissive="#00b8d9" emissiveIntensity={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

// --------------------------------------------------------------------- orbs
function Orbs({ stateRef }) {
  const groupRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    s.orbs.forEach((orb, i) => {
      const orbMesh = g.children[i];
      if (!orbMesh) return;
      orbMesh.visible = orb.active;
      if (!orb.active) return;
      orbMesh.position.set(orb.x, waveHeight(orb.x, orb.z, t) + 1.7 + Math.sin(t * 2.2 + i) * 0.35, orb.z);
      orbMesh.rotation.y = t * 1.8 + i;
    });
  });
  return (
    <group ref={groupRef}>
      {Array.from({ length: 10 }).map((_, i) => (
        <group key={i}>
          <mesh>
            <icosahedronGeometry args={[0.95, 1]} />
            <meshStandardMaterial color="#67e8f9" emissive="#06b6d4" emissiveIntensity={1.6} roughness={0.2} />
          </mesh>
          <mesh scale={[2.6, 2.6, 2.6]}>
            <icosahedronGeometry args={[0.95, 0]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.14} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// -------------------------------------------------------------------- spray
const SPRAY_COUNT = 46;

function Spray({ stateRef, index }) {
  const pointsRef = useRef(null);
  const data = useMemo(() => {
    const pos = new Float32Array(SPRAY_COUNT * 3).fill(-999);
    return {
      pos,
      vel: new Float32Array(SPRAY_COUNT * 3),
      life: new Float32Array(SPRAY_COUNT),
      cursor: 0,
      acc: 0,
    };
  }, []);
  useFrame((_, delta) => {
    const s = stateRef.current;
    const points = pointsRef.current;
    if (!s || !points) return;
    const racer = s.racers[index];
    const dt = Math.min(delta, 0.05);
    const geo = points.geometry;
    if (!racer) {
      points.visible = false;
      return;
    }
    points.visible = true;
    // spawn ∝ speed
    data.acc += dt * (racer.speed > 4 ? racer.speed * 0.85 : 0);
    const fx = Math.sin(racer.heading);
    const fz = Math.cos(racer.heading);
    while (data.acc >= 1) {
      data.acc -= 1;
      const i = data.cursor;
      data.cursor = (data.cursor + 1) % SPRAY_COUNT;
      const side = (Math.random() - 0.5) * 1.1;
      data.pos[i * 3] = racer.x - fx * 1.7 + -fz * side;
      data.pos[i * 3 + 1] = Math.max(0.25, racer.y + 0.2);
      data.pos[i * 3 + 2] = racer.z - fz * 1.7 + fx * side;
      data.vel[i * 3] = -fx * (3 + Math.random() * 5) + -fz * side * 2;
      data.vel[i * 3 + 1] = 2.4 + Math.random() * 3.4 + (racer.boosting ? 1.6 : 0);
      data.vel[i * 3 + 2] = -fz * (3 + Math.random() * 5) + fx * side * 2;
      data.life[i] = 0.45 + Math.random() * 0.4;
    }
    for (let i = 0; i < SPRAY_COUNT; i++) {
      if (data.life[i] <= 0) continue;
      data.life[i] -= dt;
      if (data.life[i] <= 0) {
        data.pos[i * 3 + 1] = -999;
        continue;
      }
      data.vel[i * 3 + 1] -= 9.5 * dt;
      data.pos[i * 3] += data.vel[i * 3] * dt;
      data.pos[i * 3 + 1] += data.vel[i * 3 + 1] * dt;
      data.pos[i * 3 + 2] += data.vel[i * 3 + 2] * dt;
      if (data.pos[i * 3 + 1] < 0) data.life[i] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.85} color="#ffffff" transparent opacity={0.6} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// --------------------------------------------------------------------- skis
function Ski({ stateRef, index }) {
  const groupRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const racer = s.racers[index];
    if (!racer) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const t = clock.elapsedTime;
    const hx = Math.sin(racer.heading);
    const hz = Math.cos(racer.heading);
    g.position.set(racer.x, racer.y + 0.42, racer.z);
    g.rotation.set(0, racer.heading, 0);
    const slopeAlong = waveSlope(racer.x, racer.z, t, hx, hz);
    const slopeSide = waveSlope(racer.x, racer.z, t, -hz, hx);
    const pitch = racer.airborne
      ? THREE.MathUtils.clamp(-racer.vy * 0.03, -0.3, 0.35)
      : THREE.MathUtils.clamp(-slopeAlong * 0.4, -0.3, 0.3);
    g.rotateX(pitch);
    g.rotateZ(THREE.MathUtils.clamp(-racer.steer * 0.3 + slopeSide * 0.25, -0.45, 0.45));
  });
  const color = useMemo(() => {
    // Colors come from the engine's racer defs once the race exists; the
    // palette below mirrors engine RIVALS + player so first paint is right.
    const palette = ['#ffd60a', '#ff5964', '#ff9f1c', '#c77dff', '#4cc9f0', '#80ed99', '#f72585', '#ffd166', '#a8dadc', '#e0aaff'];
    return palette[index] || '#ffffff';
  }, [index]);
  return (
    <group ref={groupRef}>
      {/* hull — a capsule laid flat along the travel axis */}
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.62]}>
        <capsuleGeometry args={[0.78, 1.9, 4, 10]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
      </mesh>
      {/* deck + seat */}
      <mesh position={[0, 0.52, -0.45]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.95, 1.5, 0.22]} />
        <meshStandardMaterial color="#12212e" roughness={0.8} />
      </mesh>
      {/* handlebar */}
      <mesh position={[0, 0.78, 1.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.85, 8]} />
        <meshStandardMaterial color="#0d1620" roughness={0.6} />
      </mesh>
      {/* rider: torso + helmet */}
      <mesh position={[0, 1.05, -0.35]} rotation={[0.35, 0, 0]}>
        <capsuleGeometry args={[0.34, 0.62, 4, 10]} />
        <meshStandardMaterial color="#17384f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.72, -0.12]}>
        <sphereGeometry args={[0.3, 14, 12]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.3} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------- camera
function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 10, -30));
  const look = useRef(new THREE.Vector3());
  const fov = useRef(62);
  useFrame((_, delta) => {
    const s = stateRef.current;
    if (!s) return;
    const player = s.racers[0];
    if (!player) return;
    const dt = Math.min(delta, 0.05);
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const back = 13.5 + player.speed * 0.05;
    const desired = new THREE.Vector3(
      player.x - fx * back,
      player.y + 6.6,
      player.z - fz * back
    );
    const minY = waveHeight(desired.x, desired.z, performance.now() / 1000) + 2.2;
    desired.y = Math.max(desired.y, minY);
    pos.current.lerp(desired, 1 - Math.exp(-dt * 4.2));
    camera.position.copy(pos.current);
    look.current.lerp(
      new THREE.Vector3(player.x + fx * 17, player.y + 1.4, player.z + fz * 17),
      1 - Math.exp(-dt * 6)
    );
    camera.lookAt(look.current);
    const targetFov = player.boosting ? 76 : 62;
    fov.current += (targetFov - fov.current) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - fov.current) > 0.1) {
      camera.fov = fov.current;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

// --------------------------------------------------------------------- root
export default function TidalRushScene({ stateRef }) {
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(700).toArray(), []);
  return (
    <>
      <hemisphereLight args={['#cfeeff', '#0a4a66', 0.85]} />
      <directionalLight position={sunPos} intensity={1.7} color="#fff1cf" />
      <SkyDome />
      <Ocean />
      <Islands />
      <Buoys stateRef={stateRef} />
      <StartArch />
      <Orbs stateRef={stateRef} />
      {Array.from({ length: 10 }).map((_, i) => (
        <Ski key={i} stateRef={stateRef} index={i} />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <Spray key={`spray-${i}`} stateRef={stateRef} index={i} />
      ))}
      <CameraRig stateRef={stateRef} />
    </>
  );
}
