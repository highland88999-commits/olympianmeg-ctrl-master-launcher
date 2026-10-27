'use client';
// components/earth/EarthCracks.jsx — jagged, world-locked cracks
// across the whole Earth (Merlin, 2026-10-26 late-night video
// orders). This REPLACES EarthTronGrid.jsx.
//
// The old build drew a clean geometric TRON grid from
// player-relative world vectors, so the lines traveled with the
// car — exactly what Merlin flagged on his phone. That math is
// gone. What is here instead:
//
//   - WORLD-LOCKED: the crack pattern is a pure function of the
//     fragment's PLANET-FIXED direction. The street plane's
//     group already lives in spin-group (planet) space, so the
//     vertex shader rebuilds each fragment's planet-local
//     position from the group's own planet-local transform
//     (uGroupPos + uGroupQuat * position) — never from the
//     player, never from the camera, never from world space
//     after the spin rotation. Drive over the cracks and the
//     car moves over them; the cracks stay where they are on
//     the planet. The orbit sphere reads the same field from
//     its own local position, so street and globe agree.
//   - JAGGED, NOT TRON: domain-warped ridged noise — irregular,
//     branching fracture lines like real cracks. No straight
//     lines, no uniform spacing, no grid, no repetition.
//   - STATIC: the crack computation takes NO time input.
//     Merlin's correction is explicit — the cracks do NOT eat,
//     spread, grow, consume or move. The Earth is cracked and
//     WAITING for Oblivion, nothing more. Only the glow COLOR
//     cycles (7.5 s hold + 2.5 s fade = a new color every 10 s).
//   - GLOW, VERY SUBTLE BUT CLEARLY VISIBLE: a thin,
//     sharp-edged core at low brightness (legible contrast
//     against dark ground) with only a whisper of halo, plus
//     a scene light far dimmer than the street lantern. Never
//     garish, never a washout, never dimmed into invisibility.
//
// Two pieces, one shared color clock (lib/earth/earth-cracks.js):
//   - EarthCracks (street): a single shader plane on the flat
//     ground under the traveler, fading out by ~18 display
//     units, so its rim is never seen. One plane, one draw
//     call, no geometry ever rebuilt.
//   - EarthOrbitCracks (orbit): a slightly oversized shader
//     sphere over the 55-unit globe, same crack field wrapped
//     on the sphere. It never touches the globe shader (orbit
//     water illusion untouched) and carries no click handlers,
//     so globe clicks pass straight through.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { roamState, tangentFrame } from '@/lib/earth/roam';
import {
  CRACK_PLANE_UNITS,
  CRACK_FADE_IN_UNITS,
  CRACK_FADE_OUT_UNITS,
  CRACK_LIFT_UNITS,
  CRACK_ORBIT_RADIUS_FACTOR,
  CRACK_CORE_WIDTH,
  CRACK_HALO_WIDTH,
  CRACK_CORE_ALPHA_STREET,
  CRACK_CORE_ALPHA_ORBIT,
  CRACK_HALO_ALPHA,
  CRACK_GLOW_INTENSITY,
  CRACK_GLOW_DISTANCE,
  CRACK_FREQ,
  CRACK_WARP,
  crackColorAt,
} from '@/lib/earth/earth-cracks';

// Shared crack field (both shaders). No time input anywhere in
// this chunk — the pattern is static by construction; only
// uColor (set from the CPU clock) ever changes.
const CRACK_GLSL = `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
  }
  float fbm2(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 2; k++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v / 0.75;
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 3; k++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v / 0.875;
  }
  // Jagged crack ridge field over a planet-fixed direction:
  // 1 on a crack ridge, 0 far from any crack. Domain-warped
  // so the ridges branch and wobble like real fractures.
  float crackField(vec3 n, float freq, float warp) {
    vec3 q = vec3(
      fbm2(n * freq),
      fbm2(n * freq + vec3(5.2, 9.1, 3.7)),
      0.0
    );
    vec3 warped = n * freq + vec3((q.x - 0.5) * warp, (q.y - 0.5) * warp, 0.0);
    float f = fbm3(warped);
    return 1.0 - abs(f * 2.0 - 1.0);
  }
  // Sparse/dense regions so cracks cluster naturally instead
  // of wallpapering the ground at uniform density.
  float crackDensity(vec3 n) {
    float d = fbm2(n * 6.0);
    return 0.45 + 0.55 * smoothstep(0.35, 0.65, d);
  }
  // Full crack alpha for a direction: sharp thin core plus a
  // whisper of halo, scaled by the density field.
  float crackAlpha(vec3 n, float freq, float warp, float coreWidth, float haloWidth, float coreAlpha, float haloAlpha) {
    float r = crackField(n, freq, warp);
    float d = 1.0 - r;
    float core = 1.0 - smoothstep(0.0, coreWidth, d);
    float halo = (1.0 - smoothstep(0.0, haloWidth, d)) * haloAlpha;
    return (core * coreAlpha + halo) * crackDensity(n);
  }
`;

const STREET_VERTEX = `
  uniform vec3 uGroupPos;
  uniform vec4 uGroupQuat;
  varying vec3 vPlanetLocal;
  varying float vRadial;
  vec3 qrot(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void main() {
    // Planet-local fragment position: the group's own
    // planet-local transform applied to the mesh-local vertex.
    // This is what makes the cracks world-locked — the player
    // position, the camera and the spin rotation never enter it.
    vPlanetLocal = uGroupPos + qrot(uGroupQuat, position);
    vRadial = length(position.xy);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const STREET_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uFreq;
  uniform float uWarp;
  uniform float uCoreWidth;
  uniform float uHaloWidth;
  uniform float uCoreAlpha;
  uniform float uHaloAlpha;
  uniform float uFadeIn;
  uniform float uFadeOut;
  varying vec3 vPlanetLocal;
  varying float vRadial;
  ${CRACK_GLSL}
  void main() {
    vec3 n = normalize(vPlanetLocal);
    float a = crackAlpha(n, uFreq, uWarp, uCoreWidth, uHaloWidth, uCoreAlpha, uHaloAlpha);
    float radial = 1.0 - smoothstep(uFadeIn, uFadeOut, vRadial);
    a *= radial;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const ORBIT_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORBIT_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uFreq;
  uniform float uWarp;
  uniform float uCoreWidth;
  uniform float uHaloWidth;
  uniform float uCoreAlpha;
  uniform float uHaloAlpha;
  varying vec3 vLocal;
  ${CRACK_GLSL}
  void main() {
    vec3 n = normalize(vLocal);
    float a = crackAlpha(n, uFreq, uWarp, uCoreWidth, uHaloWidth, uCoreAlpha, uHaloAlpha);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function EarthCracks() {
  const groupRef = useRef();
  const lightRef = useRef();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: STREET_VERTEX,
    fragmentShader: STREET_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#22d3ee') },
      uGroupPos: { value: new THREE.Vector3() },
      uGroupQuat: { value: new THREE.Vector4(0, 0, 0, 1) },
      uFreq: { value: CRACK_FREQ },
      uWarp: { value: CRACK_WARP },
      uCoreWidth: { value: CRACK_CORE_WIDTH },
      uHaloWidth: { value: CRACK_HALO_WIDTH },
      uCoreAlpha: { value: CRACK_CORE_ALPHA_STREET },
      uHaloAlpha: { value: CRACK_HALO_ALPHA },
      uFadeIn: { value: CRACK_FADE_IN_UNITS },
      uFadeOut: { value: CRACK_FADE_OUT_UNITS },
    },
  }), []);
  const geo = useMemo(
    () => new THREE.PlaneGeometry(CRACK_PLANE_UNITS, CRACK_PLANE_UNITS),
    [],
  );

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const on = roamState.active;
    g.visible = on;
    if (!on) return;
    // Ground the plane the way vehicles ground: the higher of
    // the smooth surface and the drawn street facet, plus a
    // hair's lift so it never z-fights the photo ground.
    const surfR = surfaceRadiusOrBase(roamState.lat, roamState.lon);
    const facetR = patchFacetRadiusAt(roamState.lat, roamState.lon);
    const groundR = (facetR != null ? Math.max(surfR, facetR) : surfR) + CRACK_LIFT_UNITS;
    const p = latLonToVec3(roamState.lat, roamState.lon, groundR);
    g.position.set(p.x, p.y, p.z);
    const frame = tangentFrame(roamState.lat, roamState.lon);
    const xAxis = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
    const yAxis = new THREE.Vector3(frame.north.x, frame.north.y, frame.north.z);
    const zAxis = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
    );
    g.quaternion.copy(q);
    // Planet-local transform for the shader: p and q are both
    // already in spin-group (planet) space, so the crack field
    // built from them is fixed to the planet. The old build
    // derived its pattern from world-space player vectors here
    // — that is what made the lines follow the car.
    mat.uniforms.uGroupPos.value.set(p.x, p.y, p.z);
    mat.uniforms.uGroupQuat.value.set(q.x, q.y, q.z, q.w);
    // One shared color clock: shader, orbit sphere and glow
    // light all change together, every 10 s. The color is the
    // ONLY thing that moves; the cracks themselves are static.
    const c = crackColorAt(state.clock.elapsedTime * 1000);
    mat.uniforms.uColor.value.setRGB(c.r, c.g, c.b);
    if (lightRef.current) lightRef.current.color.setRGB(c.r, c.g, c.b);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      {/* The glow as a barely-there light source: tints the
          ground with the current crack color. Far dimmer than
          the street lantern — a seep, never a washout. */}
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.05]}
        color="#22d3ee"
        intensity={CRACK_GLOW_INTENSITY}
        distance={CRACK_GLOW_DISTANCE}
        decay={2}
      />
    </group>
  );
}

export function EarthOrbitCracks() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color('#22d3ee') },
      uFreq: { value: CRACK_FREQ },
      uWarp: { value: CRACK_WARP },
      uCoreWidth: { value: CRACK_CORE_WIDTH },
      uHaloWidth: { value: CRACK_HALO_WIDTH },
      uCoreAlpha: { value: CRACK_CORE_ALPHA_ORBIT },
      uHaloAlpha: { value: CRACK_HALO_ALPHA },
    },
  }), []);
  const geo = useMemo(
    () => new THREE.SphereGeometry(55 * CRACK_ORBIT_RADIUS_FACTOR, 64, 48),
    [],
  );
  useFrame((state) => {
    const c = crackColorAt(state.clock.elapsedTime * 1000);
    mat.uniforms.uColor.value.setRGB(c.r, c.g, c.b);
  });
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
}
