'use client';
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getGroundVideoTexture,
  getGroundDetailTexture,
  getGroundEnvMap,
  getSceneGroundVideoTexture,
  onSceneGroundVideoReady,
  startGroundVideo,
  startSceneGroundVideo,
  GROUND_MIRROR_METALNESS,
  GROUND_MIRROR_ROUGHNESS,
  GROUND_MIRROR_EMISSIVE_INTENSITY,
  GROUND_MIRROR_ENV_INTENSITY,
  GROUND_DETAIL_BUMP_SCALE,
  GROUND_DETAIL_OVERLAY_LIFT,
  GROUND_DETAIL_OVERLAY_OFFSET_M,
} from '@/lib/earth/ground-video';
import { useEarthScene, earthSceneUrl, earthSceneAfter } from '@/lib/earth/earth-sky-scenes';
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
// ONE ground mesh plus a 5 cm overlay sphere, mounted while
// roaming at street level (phase === 'earth_roam'): a plain
// sphere at TERRAIN_RADIUS with smooth normals, so the ground
// reads as one unbroken colour with no faceted mosaic patches
// and no per-tile seams — and the overlay wears the tiled
// scratched-silver detail (round 3) as a multiply layer, so the
// scratches, hotspots and grain read at driving height. Same
// mirror law the lens sheets wore (metalness 1.0, roughness
// 0.08, the video as map AND emissive, RoomEnvironment sheen —
// no Reflector pass, too heavy for a phone). The video texture
// is the shared singleton; the sheets were its only other
// consumer, so it now wraps the full frame (the square crop it
// carried for them is gone from lib/earth/ground-video.js) —
// the component re-asserts the (1,1)/(0,0) wrap defensively.
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

  // Scene pairs (Merlin, 2026-11-25 ~19:14): the ground wears the
  // current scene's earth video when one has shipped, else the
  // 9-colour floor loop. displayScene lags the rotation by one
  // ready-gate: the swap only lands once the new scene's video
  // has data, so the ground never flashes black mid-drive. The
  // NEXT scene is warmed now, so it is ready by swap time.
  const scene = useEarthScene();
  const [displayScene, setDisplayScene] = useState(scene);
  useEffect(() => {
    if (!scene) {
      setDisplayScene(null);
      return undefined;
    }
    const next = earthSceneAfter(scene);
    if (next) getSceneGroundVideoTexture(earthSceneUrl(next, 'earth'));
    return onSceneGroundVideoReady(earthSceneUrl(scene, 'earth'), () => setDisplayScene(scene));
  }, [scene]);
  const displayUrl = displayScene ? earthSceneUrl(displayScene, 'earth') : null;

  const material = useMemo(() => {
    const videoTex = displayUrl ? getSceneGroundVideoTexture(displayUrl) : getGroundVideoTexture();
    if (!videoTex) return null;
    // Full-frame equirect wrap: the shared texture already
    // wraps the whole frame (the sheets' square crop is gone
    // from ground-video.js); the set below is defensive, so
    // the wrap holds even if the module default ever changes.
    videoTex.repeat.set(1, 1);
    videoTex.offset.set(0, 0);
    const env = getGroundEnvMap(gl);
    // Scratch detail (round 3): the video stretched once around
    // the sphere reads flat at driving height, so the static
    // silver scratched jpg — same pattern as all 9 colours —
    // rides as a tiled bump + roughness layer (~7 m tiles) over
    // the video colour. The video keeps the 9-colour fade (map
    // + emissive); the detail only shapes the mirror sheen, so
    // the scratches, hotspots and grain read as the car moves.
    const detailTex = getGroundDetailTexture();
    return new THREE.MeshStandardMaterial({
      map: videoTex,
      emissiveMap: videoTex,
      emissive: 0xffffff,
      emissiveIntensity: GROUND_MIRROR_EMISSIVE_INTENSITY,
      metalness: GROUND_MIRROR_METALNESS,
      roughness: GROUND_MIRROR_ROUGHNESS,
      bumpMap: detailTex || undefined,
      bumpScale: GROUND_DETAIL_BUMP_SCALE,
      roughnessMap: detailTex || undefined,
      envMap: env || undefined,
      envMapIntensity: GROUND_MIRROR_ENV_INTENSITY,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }, [gl, displayUrl]);

  // The detail OVERLAY (round 3 — the part that makes the
  // scratches plainly visible): a second sphere 5 cm above the
  // ground, wearing the same tiled silver jpg as a multiply
  // layer over the finished ground colour (emissive + sheen).
  // The bump/roughness above only shape the sheen — the flat
  // emissive would wash them out — so the overlay carries the
  // scratches in the COLOUR itself, lifted so the 9-colour fade
  // keeps its brightness. It sits below the pads and the car's
  // wheels, so it multiplies the ground only, never a vehicle;
  // depthWrite off, so it never occludes anything. No fade —
  // the ground's 0.4 s fade is the globe→video swap, and the
  // detail rides it as-is.
  const overlayMaterial = useMemo(() => {
    const detailTex = getGroundDetailTexture();
    if (!detailTex) return null;
    return new THREE.MeshBasicMaterial({
      map: detailTex,
      color: new THREE.Color(
        GROUND_DETAIL_OVERLAY_LIFT,
        GROUND_DETAIL_OVERLAY_LIFT,
        GROUND_DETAIL_OVERLAY_LIFT,
      ),
      transparent: true,
      blending: THREE.MultiplyBlending,
      depthWrite: false,
    });
  }, []);

  // Make sure the floor video is playing: getGroundVideoTexture
  // starts it on creation, but a mount-time play covers an
  // autoplay block at creation (this mount follows the user's
  // tap to dive to street). Same for a scene earth video, on
  // every scene change.
  useEffect(() => {
    if (displayUrl) startSceneGroundVideo(displayUrl);
    else startGroundVideo();
  }, [displayUrl]);

  // The map is the SHARED floor video texture — never disposed
  // (disposing it would kill the video for every other reader).
  // The materials themselves are ours: dispose them on unmount.
  useEffect(() => () => {
    if (material) material.dispose();
    if (overlayMaterial) overlayMaterial.dispose();
  }, [material, overlayMaterial]);

  useFrame((_, rawDt) => {
    if (!material) return;
    const dt = rawDt || 0.016;
    if (material.opacity < 1) material.opacity = Math.min(1, material.opacity + dt / 0.4);
  });

  if (!material) return null;
  return (
    <group>
      <mesh>
        <sphereGeometry args={[TERRAIN_RADIUS, 96, 64]} />
        <primitive object={material} attach="material" />
      </mesh>
      {overlayMaterial && (
        <mesh renderOrder={1}>
          <sphereGeometry args={[TERRAIN_RADIUS + GROUND_DETAIL_OVERLAY_OFFSET_M, 96, 64]} />
          <primitive object={overlayMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}
