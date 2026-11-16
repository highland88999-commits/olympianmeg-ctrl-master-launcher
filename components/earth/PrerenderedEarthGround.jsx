'use client';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getGroundVideoTexture,
  getGroundEnvMap,
  startGroundVideo,
  GROUND_MIRROR_METALNESS,
  GROUND_MIRROR_ROUGHNESS,
  GROUND_MIRROR_EMISSIVE_INTENSITY,
  GROUND_MIRROR_ENV_INTENSITY,
} from '@/lib/earth/ground-video';
import { TERRAIN_RADIUS } from '@/lib/terrain';

// PrerenderedEarthGround — the Earth 1 ground, baked once.
//
// Merlin, 2026-11-15: "The tiles should no longer render either
// in earth 1, they should be prerendered around the entire map."
// There is no more live per-position tile building while driving
// (no startLensBuild / render queue / restore path — the whole
// lens system is deleted from components/NexusEarth.jsx): the
// ground is the whole planet sphere, wearing the ground-loop
// video (one fading colour + mirror sheen) once, up front. The
// car just drives over finished ground.
//
// ONE mesh, mounted while roaming at street level (phase ===
// 'earth_roam'): a plain sphere at TERRAIN_RADIUS with smooth
// normals, so the ground reads as one unbroken colour with no
// faceted mosaic patches and no per-tile seams. Same mirror law
// the lens sheets wore (metalness 1.0, roughness 0.08, the video
// as map AND emissive, RoomEnvironment sheen — no Reflector
// pass, too heavy for a phone). The video texture is the shared
// singleton; the sheets were its only other consumer, so it now
// wraps the full frame (the square crop it carried for them is
// gone from lib/earth/ground-video.js) — the component
// re-asserts the (1,1)/(0,0) wrap defensively.
//
// The photographic globe stays mounted underneath (hidden only
// while the prerender is up, so pads/cracks/the car keep their
// exact heights above the ground radius); on ascend the globe
// is already there and the video sphere unmounts. Fade-in:
// the material ramps 0 → 1 over ~0.4 s on mount so the swap
// from photographic globe to video ground lands soft, not as
// a hard pop.

export default function PrerenderedEarthGround() {
  const gl = useThree((s) => s.gl);

  const material = useMemo(() => {
    const videoTex = getGroundVideoTexture();
    if (!videoTex) return null;
    // Full-frame equirect wrap: the shared texture already
    // wraps the whole frame (the sheets' square crop is gone
    // from ground-video.js); the set below is defensive, so
    // the wrap holds even if the module default ever changes.
    videoTex.repeat.set(1, 1);
    videoTex.offset.set(0, 0);
    const env = getGroundEnvMap(gl);
    return new THREE.MeshStandardMaterial({
      map: videoTex,
      emissiveMap: videoTex,
      emissive: 0xffffff,
      emissiveIntensity: GROUND_MIRROR_EMISSIVE_INTENSITY,
      metalness: GROUND_MIRROR_METALNESS,
      roughness: GROUND_MIRROR_ROUGHNESS,
      envMap: env || undefined,
      envMapIntensity: GROUND_MIRROR_ENV_INTENSITY,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }, [gl]);

  // Make sure the floor video is playing: getGroundVideoTexture
  // starts it on creation, but a mount-time play covers an
  // autoplay block at creation (this mount follows the user's
  // tap to dive to street).
  useEffect(() => {
    startGroundVideo();
  }, []);

  // The map is the SHARED floor video texture — never disposed
  // (disposing it would kill the video for every other reader).
  // The material itself is ours: dispose it on unmount.
  useEffect(() => () => {
    if (material) material.dispose();
  }, [material]);

  useFrame((_, rawDt) => {
    if (!material) return;
    const dt = rawDt || 0.016;
    if (material.opacity < 1) material.opacity = Math.min(1, material.opacity + dt / 0.4);
  });

  if (!material) return null;
  return (
    <mesh>
      <sphereGeometry args={[TERRAIN_RADIUS, 96, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
