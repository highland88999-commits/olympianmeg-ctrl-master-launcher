'use client';

// HubStars — the hub's endless star field (Merlin, Nov 25, 2026 —
// infinite space in the Olympus hub).
//
// The old drei <Stars> shell sat fixed on the origin: fly ~400 units out
// and you left the stars behind. This renders the SAME field (same
// params, same distribution, same shader) in a shell that rides on the
// camera every frame — the Mars 2 precedent (Mars2Stars). The stars are
// effectively at infinity, so zero parallax is the correct look: the
// field never ends in any direction, nothing pops in at a boundary, and
// there is no void to fly into. Near home the look is unchanged: same
// 20,000 stars, same shell thickness, same sizes, same fade.
//
// The shader is drei Stars' StarfieldMaterial, verbatim (MIT,
// @react-three/drei) — including its `vec4(position, 0.5)` quirk, which
// is inert here: the shell's model translation cancels the camera
// translation in the view x model multiply, so the halved translation
// is ~0 either way. The geometry is generated deterministically in
// lib/hub-stars.js (seeded), so the sky is identical on every load.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateHubStars, HUB_STAR_PARAMS, shellCenterForCamera } from '../lib/hub-stars';

const STAR_VERT = /* glsl */ `
  uniform float time;
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
    gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// three >= r154 renamed the colorspace include (drei picks the same way).
const STAR_FRAG = /* glsl */ `
  uniform sampler2D pointTexture;
  uniform float fade;
  varying vec3 vColor;
  void main() {
    float opacity = 1.0;
    if (fade == 1.0) {
      float d = distance(gl_PointCoord, vec2(0.5, 0.5));
      opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
    }
    gl_FragColor = vec4(vColor, opacity);

    #include <tonemapping_fragment>
    #include <${Number(THREE.REVISION) >= 154 ? 'colorspace_fragment' : 'encodings_fragment'}>
  }
`;

export default function HubStars() {
  const groupRef = useRef(null);

  const points = useMemo(() => {
    const field = generateHubStars();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(field.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(field.sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        fade: { value: HUB_STAR_PARAMS.fade ? 1.0 : 0.0 },
      },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      vertexColors: true,
    });
    const pts = new THREE.Points(geo, mat);
    // The camera always sits inside the shell; never let frustum
    // culling hide the sky on a frame the shell centre jumps.
    pts.frustumCulled = false;
    return pts;
  }, []);

  useEffect(() => () => {
    points.geometry.dispose();
    points.material.dispose();
  }, [points]);

  useFrame((state) => {
    // The shell rides on the camera — the whole endless-sky mechanism.
    const c = shellCenterForCamera(state.camera.position);
    if (groupRef.current) groupRef.current.position.set(c.x, c.y, c.z);
    points.material.uniforms.time.value = state.clock.elapsedTime * HUB_STAR_PARAMS.speed;
  });

  return (
    <group ref={groupRef}>
      <primitive object={points} />
    </group>
  );
}
