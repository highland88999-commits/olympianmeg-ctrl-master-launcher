'use client';
// components/earth/EarthTronGrid.jsx — the TRON-like grid that
// glows through cracks across the whole Earth (Merlin, 2026-10-26
// video orders).
//
// Two pieces, one shared color clock (lib/earth/tron-grid.js):
//   - EarthTronGrid (street): a single shader plane that rides
//     the ground under the traveler. Its grid lines are computed
//     in the fragment shader from TRUE WORLD position against
//     the player's tangent frame — so the plane can recenter
//     every frame without the lines ever swimming, and no
//     geometry is ever rebuilt (one plane, one draw call).
//     The plane fades out by ~18 display units, so its rim and
//     any far-field divergence from the flattened ground are
//     never seen. The glow is also a real light: a small
//     point light tinted with the current grid color, riding
//     just above the ground — subtle, never garish.
//   - EarthOrbitGrid (orbit): a slightly oversized shader
//     sphere over the 55-unit globe, lat/lon lines every 15°,
//     same color cycle. It never touches the globe shader
//     (orbit water illusion untouched) and carries no click
//     handlers, so globe clicks pass straight through.
//
// Color rule: each palette color holds 7.5 s, then fades
// smoothly into the next over 2.5 s — a new color every 10 s.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { roamState, tangentFrame } from '@/lib/earth/roam';
import {
  TRON_GRID_SPACING_UNITS,
  TRON_GRID_PLANE_UNITS,
  TRON_GRID_FADE_IN_UNITS,
  TRON_GRID_FADE_OUT_UNITS,
  TRON_GRID_LIFT_UNITS,
  TRON_ORBIT_RADIUS_FACTOR,
  TRON_ORBIT_SPACING_DEG,
  TRON_GLOW_INTENSITY,
  TRON_GLOW_DISTANCE,
  tronGridColorAt,
} from '@/lib/earth/tron-grid';

const STREET_VERTEX = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Grid lines from world position: le/ln are metres-along-east/
// north from the player. Brightness wobbles per cell so the
// lines read as cracks of light, not ruled graph paper.
const STREET_FRAGMENT = `
  uniform vec3 uColor;
  uniform vec3 uOrigin;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uSpacing;
  uniform float uFadeIn;
  uniform float uFadeOut;
  varying vec3 vWorldPosition;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec3 rel = vWorldPosition - uOrigin;
    float le = dot(rel, uEast);
    float ln = dot(rel, uNorth);
    float fu = fract(le / uSpacing);
    float fv = fract(ln / uSpacing);
    float du = min(fu, 1.0 - fu) * uSpacing;
    float dv = min(fv, 1.0 - fv) * uSpacing;
    float d = min(du, dv);
    vec2 cell = vec2(floor(le / uSpacing), floor(ln / uSpacing));
    float wob = 0.7 + 0.3 * hash(cell);
    float core = smoothstep(0.030, 0.0, d);
    float halo = smoothstep(0.22, 0.0, d) * 0.30;
    float radial = 1.0 - smoothstep(uFadeIn, uFadeOut, length(vec2(le, ln)));
    float a = (core + halo) * wob * radial;
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
  uniform float uSpacingRad;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vLocal);
    float lon = atan(n.z, n.x);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    float du = abs(mod(lon / uSpacingRad + 0.5, 1.0) - 0.5) * uSpacingRad;
    float dv = abs(mod(lat / uSpacingRad + 0.5, 1.0) - 0.5) * uSpacingRad;
    float d = min(du, dv);
    float core = smoothstep(0.006, 0.0, d);
    float halo = smoothstep(0.02, 0.0, d) * 0.25;
    float a = (core + halo) * 0.5;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function EarthTronGrid() {
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
      uOrigin: { value: new THREE.Vector3() },
      uEast: { value: new THREE.Vector3(1, 0, 0) },
      uNorth: { value: new THREE.Vector3(0, 1, 0) },
      uSpacing: { value: TRON_GRID_SPACING_UNITS },
      uFadeIn: { value: TRON_GRID_FADE_IN_UNITS },
      uFadeOut: { value: TRON_GRID_FADE_OUT_UNITS },
    },
  }), []);
  const geo = useMemo(
    () => new THREE.PlaneGeometry(TRON_GRID_PLANE_UNITS, TRON_GRID_PLANE_UNITS),
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
    const groundR = (facetR != null ? Math.max(surfR, facetR) : surfR) + TRON_GRID_LIFT_UNITS;
    const p = latLonToVec3(roamState.lat, roamState.lon, groundR);
    g.position.set(p.x, p.y, p.z);
    const frame = tangentFrame(roamState.lat, roamState.lon);
    const xAxis = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
    const yAxis = new THREE.Vector3(frame.north.x, frame.north.y, frame.north.z);
    const zAxis = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    // World-space frame for the shader (the spin group may hold
    // a rotation; world vectors keep the lines true regardless).
    g.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    g.getWorldPosition(wp);
    g.getWorldQuaternion(wq);
    mat.uniforms.uOrigin.value.copy(wp);
    mat.uniforms.uEast.value.copy(xAxis).applyQuaternion(wq);
    mat.uniforms.uNorth.value.copy(yAxis).applyQuaternion(wq);
    // One shared color clock: shader, orbit sphere and glow
    // light all change together, every 10 s.
    const c = tronGridColorAt(state.clock.elapsedTime * 1000);
    mat.uniforms.uColor.value.setRGB(c.r, c.g, c.b);
    if (lightRef.current) lightRef.current.color.setRGB(c.r, c.g, c.b);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      {/* The glow as a subtle light source: tints the ground and
          nearby bodies with the current grid color. Same gentle
          scale as the street lantern — never a washout. */}
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.05]}
        color="#22d3ee"
        intensity={TRON_GLOW_INTENSITY}
        distance={TRON_GLOW_DISTANCE}
        decay={2}
      />
    </group>
  );
}

export function EarthOrbitGrid() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color('#22d3ee') },
      uSpacingRad: { value: (TRON_ORBIT_SPACING_DEG * Math.PI) / 180 },
    },
  }), []);
  const geo = useMemo(
    () => new THREE.SphereGeometry(55 * TRON_ORBIT_RADIUS_FACTOR, 64, 48),
    [],
  );
  useFrame((state) => {
    const c = tronGridColorAt(state.clock.elapsedTime * 1000);
    mat.uniforms.uColor.value.setRGB(c.r, c.g, c.b);
  });
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
}
