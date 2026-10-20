'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { roamState } from '@/lib/earth/roam';
import { parachuteState } from '@/lib/earth/parachute';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';

// QuantumSkyDome — the Quantum Realm's own sky (Merlin, 2026-10-20).
//
// A sky is only ever an inside-out sphere around the viewer, so this
// one is gated by SIZE ITSELF: it renders nothing at all while the
// traveler is at normal scale (from orbit, aerial view, or street
// level looking down, it simply does not exist), and fades in as the
// shrink crosses into the realm — replacing the day sky entirely.
//
// The scene down here is a subatomic cosmos: a deep violet void,
// drifting nebula bands in teal and magenta, a fine star filament
// field that twinkles, and a soft membrane glow at the horizon —
// like standing inside a living cell of light.
//
// The dome follows the walker (centered on their surface point) at
// ~28 world-metres radius: an entire sky from the walker's scale,
// a speck from the normal world's.
const DOME_RADIUS_U = 0.45;

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uOpacity;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float starLayer(vec3 d, float cells, float threshold, float size) {
    vec3 g = d * cells;
    vec3 id = floor(g);
    float h = hash13(id);
    if (h < threshold) return 0.0;
    vec3 f = fract(g) - 0.5;
    float dist = length(f);
    float tw = 0.65 + 0.35 * sin(uTime * 2.0 + h * 40.0);
    return smoothstep(size, 0.0, dist) * tw;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y * 0.5 + 0.5;

    // Base void gradient: violet horizon -> indigo -> near-black zenith.
    vec3 col = mix(vec3(0.16, 0.05, 0.32), vec3(0.05, 0.02, 0.14), smoothstep(0.35, 0.65, h));
    col = mix(col, vec3(0.008, 0.004, 0.03), smoothstep(0.62, 1.0, h));
    // Below the horizon the void deepens (the under-sky).
    col = mix(vec3(0.02, 0.01, 0.06), col, smoothstep(0.28, 0.5, h));

    // Drifting nebula bands — slow currents of teal and magenta.
    float n = sin(d.x * 4.0 + uTime * 0.030)
            * sin(d.y * 3.0 - uTime * 0.021)
            * sin(d.z * 5.0 + uTime * 0.026);
    float neb = smoothstep(0.25, 0.95, n);
    vec3 nebColor = mix(vec3(0.05, 0.65, 0.60), vec3(0.75, 0.20, 0.85), h);
    col += neb * nebColor * 0.38;

    // A second, finer nebula weave for depth.
    float n2 = sin(d.x * 9.0 - uTime * 0.017)
             * sin(d.y * 7.0 + uTime * 0.013)
             * sin(d.z * 8.0 - uTime * 0.019);
    col += smoothstep(0.45, 1.0, n2) * vec3(0.30, 0.15, 0.55) * 0.22;

    // Star filaments: two densities of twinkling points.
    float stars = starLayer(d, 46.0, 0.972, 0.10) * 0.9
                + starLayer(d, 90.0, 0.985, 0.07) * 0.7;
    col += vec3(0.85, 0.90, 1.0) * stars;

    // Membrane glow at eye level — the realm's horizon breathes.
    float glow = pow(1.0 - abs(d.y), 6.0);
    col += glow * vec3(0.42, 0.18, 0.85) * (0.45 + 0.10 * sin(uTime * 0.6));

    gl_FragColor = vec4(col, uOpacity);
  }
`;

export default function QuantumSkyDome() {
  const meshRef = useRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }),
    []
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scale = parachuteState?.scale || 1;
    const on = roamState.active && scale < 0.5;
    mesh.visible = on;
    if (!on) return;

    // Fade in across the crossing: gone at 0.5x, full by 0.1x.
    uniforms.uOpacity.value = Math.min(1, Math.max(0, (0.5 - scale) / 0.4));
    uniforms.uTime.value = state.clock.elapsedTime;

    // Center the sky on the walker's surface point.
    const r = surfaceRadiusOrBase(roamState.lat, roamState.lon);
    const p = latLonToVec3(roamState.lat, roamState.lon, r);
    mesh.position.set(p.x, p.y, p.z);
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS_U, 40, 24]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
