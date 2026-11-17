'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { carState } from '@/lib/earth/parachute';
import {
  PAD_RENDER_M,
  PAD_VISUAL_RADIUS_M,
  PAD_VIDEO_URL,
  allBoostPads,
  padsNear,
  checkBoostPads,
  padBoostState,
  padVisual,
  padVideoModulation,
} from '@/lib/earth/boost-pads';

// EarthBoostPads — ground-level light-up boost pads for Earth 1
// racers (Merlin, 2026-11-15: "drivers pass over them for extra
// speed boosts").
//
// One pad per seeded grid slot: 15 latitude bands x 10 longitude
// slots = 150 pads, deterministic (lib/earth/boost-pads.js).
// Only pads within PAD_RENDER_M of the driver get meshes — the
// set changes only when the driver crosses the render boundary,
// so the React list almost never re-renders mid-drive.
//
// VIDEO WRAP (Merlin, 2026-11-15 — correction: the pad WEARS a
// video): the disc wears public/videos/earth1/boost-pad-wrap.mp4
// as its map — a looping top-down glowing boost-pad energy
// pattern, muted, looping, no audio. The three states modulate
// the video (lib/earth/boost-pads.js padVideoModulation): armed
// = cyan tint + gentle pulse, flare = white-hot, recharging =
// slate and dim. LIGHT-UP EFFECT (emissive only — no new real
// lights, the standing rule): pads are unlit bright materials,
// so they glow against the street in any light.
//
// TRIGGER: this component owns the one-per-frame check against
// the mounted driver's path (carState — Earth 1 is vehicles
// only, so the driver is always mounted). The car reads the
// shared pad boost in its own frame loop (one frame behind by
// design). Earth 1 stays bare of other objects — pads only.

const UPM = DISPLAY_UNITS_PER_METRE;

/** The shared pad-wrap video texture: one <video> element and
 *  one THREE.VideoTexture for every pad on the planet. Created
 *  lazily on first use (client-only); a failed play leaves the
 *  texture null and the disc falls back to its plain tint, never
 *  a blank pad and never a crash. */
let padVideoTexture = null;
let padVideoTried = false;

function getPadVideoTexture() {
  if (padVideoTexture || padVideoTried) return padVideoTexture;
  padVideoTried = true;
  try {
    if (typeof document === 'undefined') return null;
    const video = document.createElement('video');
    video.src = PAD_VIDEO_URL;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    const play = video.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    padVideoTexture = tex;
    return tex;
  } catch {
    return null;
  }
}

/** Pad transform: ground-hugging position + orientation. Same
 *  grounding law as the vehicles — the higher of the smooth
 *  heightmap surface and the street patch's drawn facet — plus
 *  0.08 m so the flat disc never z-fights the street. The pad's
 *  yaw is its seeded bearing, so the chevron points down a
 *  seeded street direction. */
function padTransform(pad) {
  const surfR = surfaceRadiusOrBase(pad.lat, pad.lon);
  const facetR = patchFacetRadiusAt(pad.lat, pad.lon);
  const groundR = facetR != null ? Math.max(surfR, facetR) : surfR;
  const r = groundR + 0.08 * UPM;
  const p = latLonToVec3(pad.lat, pad.lon, r);
  const frame = tangentFrame(pad.lat, pad.lon);
  const fwd = headingVector(frame, pad.bearingDeg);
  const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
  const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
  const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  return { position: [p.x, p.y, p.z], quaternion };
}

/** One pad's meshes. Visual state is read per frame from the
 *  shared pad state and written straight into the materials. */
function BoostPadMesh({ pad }) {
  const discRef = useRef();
  const ringRef = useRef();
  const chevRef = useRef();
  const { position, quaternion } = useMemo(() => padTransform(pad), [pad]);
  const videoTex = useMemo(() => getPadVideoTexture(), []);

  useFrame(({ clock }) => {
    const disc = discRef.current;
    const ring = ringRef.current;
    const chev = chevRef.current;
    if (!disc || !ring || !chev) return;
    const nowMs = performance.now();
    const visual = padVisual(pad.id, nowMs);
    const mod = padVideoModulation(visual);
    const t = clock.elapsedTime;
    // Armed: gentle pulse so the pad reads live from driving
    // distance — the light-up effect Merlin asked for. The pulse
    // multiplies the video's brightness through the disc opacity.
    const discOpacity = mod.pulseDisc
      ? mod.discOpacity * (0.72 + 0.28 * Math.sin(t * 2.4 + pad.slot))
      : mod.discOpacity;
    disc.material.color.set(mod.discColor);
    disc.material.opacity = discOpacity;
    ring.material.color.set(mod.ringColor);
    ring.material.opacity = mod.ringOpacity;
    chev.material.color.set(mod.chevColor);
    chev.material.opacity = mod.chevOpacity;
    chev.scale.setScalar(mod.chevScale);
  });

  return (
    <group position={position} quaternion={quaternion}>
      {/* The pad itself: a glowing disc lying flat on the street,
          wearing the boost-pad wrap video as its texture. Sizes
          are display metres × UPM (the house convention — cf.
          components/EarthKart.jsx): the raw constants are NOT
          world units (a 4-unit disc would be 250 display m
          across). */}
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <circleGeometry args={[PAD_VISUAL_RADIUS_M * UPM, 32]} />
        <meshBasicMaterial map={videoTex || undefined} color="#00ffcc" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Outer ring — the pad's edge, visible from far off. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02 * UPM, 0]} renderOrder={3}>
        <ringGeometry args={[(PAD_VISUAL_RADIUS_M - 0.45) * UPM, PAD_VISUAL_RADIUS_M * UPM, 32]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Chevron: a flat triangle pointing down the street (the
          pad's seeded bearing) — the "this way, faster" mark. */}
      <mesh ref={chevRef} position={[0, 0.05 * UPM, 0]} renderOrder={3}>
        <coneGeometry args={[1.6 * UPM, 0.25 * UPM, 3]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function EarthBoostPads() {
  // The full pad list is built once inside allBoostPads() from
  // the seeded grid — no landmark list is needed here.
  const pads = useMemo(() => allBoostPads(), []);
  const [near, setNear] = useState([]);
  const nearKeyRef = useRef('');

  useFrame(() => {
    const nowMs = performance.now();
    // The mounted driver (Earth 1 is vehicles only — the car is
    // always the driver). Before the first mount the roam position
    // is the reference and pads render armed but never trigger.
    const driver = carState.mounted ? carState : null;
    const lat = driver ? driver.lat : roamState.lat;
    const lon = driver ? driver.lon : roamState.lon;
    checkBoostPads(padBoostState, { lat, lon, driving: !!driver, nowMs });
    // Render set: only pads within PAD_RENDER_M. The set changes
    // only at the boundary, so React re-renders rarely.
    const next = padsNear(lat, lon, PAD_RENDER_M, pads);
    const key = next.map((p) => p.id).join(',');
    if (key !== nearKeyRef.current) {
      nearKeyRef.current = key;
      setNear(next);
    }
  });

  return (
    <group>
      {near.map((pad) => (
        <BoostPadMesh key={pad.id} pad={pad} />
      ))}
    </group>
  );
}
