// components/GodOrbitRings.jsx
// The hub's physical satellite constellation: EXACTLY 10 satellites — one per
// god menu — evenly spaced (36° apart) on 10 orbit rings around ORBIT_CENTER.
//
// - The whole assembly rotates AS ONE UNIT about the polar (Y) axis,
//   OPPOSITE Earth's spin (Earth: +0.05 rad/s; rings: rotation.y goes
//   negative at RING_SPIN). The analytic orbitPositionFor() in
//   lib/god-orbits.js mirrors this exactly.
// - Each satellite hull is UV-mapped with its god menu's self-hosted banner
//   art (public/textures/menus/<god>/banner.*) — proper exterior graphics,
//   never plain glowing orbs. Lighting is kept modest so the wraps read.
// - Satellites are solid: each registers a sphere collider in the hub
//   collision registry (bounce/deflect, never kill).
// - VISUAL/PHYSICAL ONLY. Program navigation lives in the floating
//   satellite menu; the rings no longer launch anything.

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import {
  GOD_BANDS,
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  RING_SPIN,
  orbitTime,
  menuSatellitePosition,
} from '@/lib/god-orbits';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';

// 2026-10-20 (Merlin): satellites baked 1.5× bigger (was 2.6) so the
// banner ads on their hulls read at hub distances; every satellite-
// derived dimension (accent ring, labels, number tag) scales in ratio.
// Later the same day Merlin asked for bigger still: 3.9 → 5.9, with
// the bands spread and the tower ring pushed out to match (below).
const SAT_RADIUS = 5.9;

// God-name label distance behaviour (demo fix, 2026-10-15): at spawn the
// camera sits ~46–68 units from every satellite, where the label's fixed
// world size reads exactly as designed. Flying close used to blow the
// name across the whole viewport ("DIONYSU…"), and a far-side label
// clipped through Earth unreadably. So inside LABEL_REF_DIST the label
// shrinks with distance — its on-screen size never exceeds the
// normal-orbit size — and fades out as you arrive; a label whose
// sightline passes through Earth fades to a whisper instead of
// clipping through the planet. At normal orbit distance nothing
// changes: full size, full opacity.
const LABEL_REF_DIST = 30; // at/above this distance: full size
const LABEL_FADE_NEAR = 5; // at/below this distance: fully faded
const LABEL_FADE_FULL = 16; // at/above this distance: fully opaque
const LABEL_MIN_SCALE = 0.1;
const EARTH_C = new THREE.Vector3(EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z);
const _wp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ec = new THREE.Vector3();

function useBannerTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        setTex(t);
      },
      undefined,
      () => {
        if (alive) setTex(null);
      }
    );
    return () => {
      alive = false;
      setTex((prev) => {
        if (prev) prev.dispose();
        return null;
      });
    };
  }, [url]);
  return tex;
}

function HubSatellite({ band, index }) {
  const tex = useBannerTexture(band.texture);
  const angle = band.phase;
  const R = band.radius;
  const satRef = useRef();
  const labelRef = useRef();
  const textRef = useRef();
  const numLabelRef = useRef();
  const numTextRef = useRef();
  const labelState = useRef({ scale: -1, opacity: -1 });

  // Distance-driven label scale cap + fade (see constants above).
  useFrame(({ camera }) => {
    const sat = satRef.current;
    const label = labelRef.current;
    if (!sat || !label) return;
    sat.getWorldPosition(_wp);
    const dist = camera.position.distanceTo(_wp);

    const scale = THREE.MathUtils.clamp(dist / LABEL_REF_DIST, LABEL_MIN_SCALE, 1);
    let opacity = THREE.MathUtils.smoothstep(dist, LABEL_FADE_NEAR, LABEL_FADE_FULL);

    // Far-side fade: does the camera→label sightline pass through Earth?
    _dir.copy(_wp).sub(camera.position);
    const len = _dir.length();
    if (len > 0.001) {
      _dir.divideScalar(len);
      _ec.copy(EARTH_C).sub(camera.position);
      const t = _ec.dot(_dir);
      if (t > 0) {
        const closestSq = _ec.lengthSq() - t * t;
        const earthDist = camera.position.distanceTo(EARTH_C);
        if (closestSq < (EARTH_RADIUS + 2) * (EARTH_RADIUS + 2) && dist > earthDist) {
          opacity *= 0.08;
        }
      }
    }

    const st = labelState.current;
    if (Math.abs(scale - st.scale) > 0.004) {
      st.scale = scale;
      label.scale.setScalar(scale);
      if (numLabelRef.current) numLabelRef.current.scale.setScalar(scale);
    }
    const text = textRef.current;
    if (text && Math.abs(opacity - st.opacity) > 0.02) {
      st.opacity = opacity;
      text.fillOpacity = opacity;
      text.outlineOpacity = opacity;
      const num = numTextRef.current;
      if (num) {
        num.fillOpacity = opacity;
        num.outlineOpacity = opacity;
      }
    }
    const vis = opacity > 0.02;
    if (label.visible !== vis) label.visible = vis;
    if (numLabelRef.current && numLabelRef.current.visible !== vis) numLabelRef.current.visible = vis;
  });

  // Solid satellite: register a live sphere collider at the analytic
  // position (matches the rendered transform exactly).
  useEffect(() => {
    registerCollider(
      `hubsat-${band.god}`,
      () => menuSatellitePosition(index, orbitTime()),
      SAT_RADIUS + 0.9
    );
    return () => unregisterCollider(`hubsat-${band.god}`);
  }, [band.god, index]);

  const hullMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex || null,
        color: tex ? '#ffffff' : band.color,
        roughness: 0.65,
        metalness: 0.15,
        // Gentle god-color sheen — never enough to wash out the wrap.
        emissive: new THREE.Color(band.color),
        emissiveIntensity: tex ? 0.12 : 0.55,
      }),
    [tex, band.color]
  );
  useEffect(() => () => hullMat.dispose(), [hullMat]);

  return (
    <group rotation={[0, 0, band.tiltRad]}>
      {/* Orbit ring */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[R, 0.14, 8, 160]} />
        <meshBasicMaterial color={band.color} transparent opacity={0.45} />
      </mesh>
      {/* The satellite, fixed at its even-spacing angle */}
      <group ref={satRef} position={[R * Math.cos(angle), 0, R * Math.sin(angle)]}>
        <mesh>
          <sphereGeometry args={[SAT_RADIUS, 32, 24]} />
          <primitive object={hullMat} attach="material" />
        </mesh>
        {/* Equatorial accent ring in the god's color */}
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[SAT_RADIUS + 1.24, 0.21, 8, 64]} />
          <meshBasicMaterial color={band.color} fog={false} />
        </mesh>
        {/* God-name marker — scale-capped and faded by camera distance
            (see the useFrame above), so it can never fill the viewport
            at close range or clip through Earth unreadably. */}
        <Billboard ref={labelRef} position={[0, SAT_RADIUS + 3.8, 0]}>
          <Text
            ref={textRef}
            fontSize={3.8}
            color={band.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.12}
            outlineColor="#000000"
          >
            {band.label}
          </Text>
        </Billboard>
        {/* Ad-space number (Merlin, 2026-10-20): a plain number under
            each satellite so ads can be mapped by number — "ad 4" is
            the 4th band's satellite. Same distance behaviour as the
            god-name label above. */}
        <Billboard ref={numLabelRef} position={[0, -(SAT_RADIUS + 3.6), 0]}>
          <Text
            ref={numTextRef}
            fontSize={3.2}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="#000000"
          >
            {String(index + 1)}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

export default function GodOrbitRings() {
  const spinRef = useRef();

  useFrame(() => {
    // One unit, counter-rotating against Earth's +Y spin. Driven from the
    // shared orbitTime() clock so orbitPositionFor() always agrees.
    if (spinRef.current) spinRef.current.rotation.y = -RING_SPIN * orbitTime();
  });

  return (
    <group
      ref={spinRef}
      position={[ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z]}
    >
      {GOD_BANDS.map((band, i) => (
        <HubSatellite key={band.god} band={band} index={i} />
      ))}
    </group>
  );
}
