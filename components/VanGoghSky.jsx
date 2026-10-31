'use client';

// VanGoghSky — the Starry-Night hub background (Merlin, 2026-10-31).
//
// A single sky sphere with a procedural Van Gogh shader: domain-warped
// swirls in cobalt/cerulean, glowing amber stars with halos, a pale
// gold moon, and subtle impasto banding + brush streaks. No textures,
// no post-processing — one draw call, phone-friendly.
//
// Toggle: Concourse Settings → Sky → "Van Gogh sky". HomeScene swaps
// this in for the drei <Stars> + black background when active.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDir;
  uniform float uTime;

  // --- value noise -------------------------------------------------
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = r * p * 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    // Equirect-ish UV from direction; stretch x so swirls wrap wide.
    vec2 uv = vec2(atan(d.z, d.x) * 1.6, asin(clamp(d.y, -1.0, 1.0)) * 2.2);
    float t = uTime * 0.02;

    // Domain-warped swirls — the Starry Night currents.
    vec2 q = vec2(
      fbm(uv * 2.6 + vec2(t, -t * 0.6)),
      fbm(uv * 2.6 + vec2(5.2, 1.3) - vec2(t * 0.7, 0.0))
    );
    vec2 r = vec2(
      fbm(uv * 2.6 + 3.5 * q + vec2(1.7, 9.2) + vec2(t * 0.4, 0.0)),
      fbm(uv * 2.6 + 3.5 * q + vec2(8.3, 2.8) - vec2(0.0, t * 0.3))
    );
    float f = fbm(uv * 2.6 + 3.5 * r);

    // Impasto banding: quantize softly so paint ridges read.
    f = mix(f, floor(f * 22.0) / 22.0, 0.45);

    // Palette: deep night navy -> cobalt -> cerulean swirl light.
    vec3 deep    = vec3(0.023, 0.039, 0.141); // #060a24
    vec3 cobalt  = vec3(0.078, 0.149, 0.369); // #14265e
    vec3 cerulean= vec3(0.169, 0.361, 0.722); // #2b5cb8
    vec3 glowBlu = vec3(0.302, 0.561, 0.839); // #4d8fd6
    vec3 col = mix(deep, cobalt, smoothstep(0.18, 0.62, f));
    col = mix(col, cerulean, smoothstep(0.62, 0.88, f));
    col = mix(col, glowBlu, smoothstep(0.88, 1.0, f) * 0.55);

    // Brush streaks: elongated grain along the swirl flow.
    float streak = vnoise(vec2(dot(uv, vec2(1.0, 0.12)) * 46.0, dot(uv, vec2(-0.12, 1.0)) * 7.0));
    col *= 0.93 + 0.07 * streak;

    // Deepen toward the nadir so the hub floor direction stays dark.
    col *= mix(0.55, 1.0, smoothstep(-1.0, 0.15, d.y));

    // --- stars: hash-grid points with warm halos -------------------
    vec2 sp = uv * 26.0;
    vec2 cell = floor(sp);
    vec2 pos = fract(sp) - 0.5;
    float h = hash12(cell);
    if (h > 0.72) {
      vec2 off = vec2(hash12(cell + 7.1), hash12(cell + 3.7)) - 0.5;
      float dist = length(pos - off * 0.7);
      float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h * 2.0) + h * 40.0);
      float core = smoothstep(0.10, 0.0, dist) * tw;
      float halo = pow(max(0.0, 1.0 - dist * 2.2), 2.0) * 0.55 * tw;
      vec3 starCol = mix(vec3(1.0, 0.85, 0.42), vec3(1.0, 0.96, 0.82), core);
      col += starCol * (core * 1.4 + halo);
    }

    // --- moon: pale gold disc + wide halo --------------------------
    vec3 moonDir = normalize(vec3(0.45, 0.42, -0.62));
    float md = distance(d, moonDir);
    float disc = smoothstep(0.055, 0.045, md);
    float halo = pow(max(0.0, 1.0 - md * 6.0), 3.0) * 0.5;
    // Paint ridges around the moon.
    halo *= 0.85 + 0.15 * vnoise(uv * 40.0);
    col += vec3(0.96, 0.85, 0.48) * (disc * 1.2 + halo);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const VANGOGH_SKY_RADIUS = 900;

export default function VanGoghSky() {
  const matRef = useRef(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += Math.min(dt, 0.1);
  });
  return (
    <mesh
      scale={[VANGOGH_SKY_RADIUS, VANGOGH_SKY_RADIUS, VANGOGH_SKY_RADIUS]}
      renderOrder={-10}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        args={[{ uniforms, vertexShader: VERT, fragmentShader: FRAG }]}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
