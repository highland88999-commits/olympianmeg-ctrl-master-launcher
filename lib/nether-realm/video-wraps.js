// lib/nether-realm/video-wraps.js
//
// NETHER VIDEO WRAPS (Merlin, Nov 15 ~15:03, batch 1): the sky and
// ground of the 13 nether realms, wrapped in VIDEO — inspired by the
// graphics I chose in the giant video
// (~/workspace/imagine_media/olympus-tonight-giant-video.mp4,
// hell/underworld frames: the Medusa-lair fire temple + the red
// vortex). Every video is a seamless loop: the generator's raw clip
// is finished with a short dissolve at the seam (see the loop
// measurements in the build report), so the last frame flows into
// the first with no cut.
//
// COUNT (revised Nov 15 ~15:07): 26 videos total = 13 unique SKY
// videos (lightning hell skies, one per realm) + 13 FLOOR videos
// (one per realm). Floors are hazard liquids — lava, acid, poison,
// etc., one type per realm; the lava look follows the Monsterverse
// (Hollow Earth) lava language: bright orange molten flow over dark
// cooling crust, white-hot cracks — which is also the giant video's
// fire-temple frame and the existing Hades lava palette (#ff5a00).
// (Honest note: Hollow Earth holds no lava renderer in code — its
// lava is a habitat label — so the lava style is the giant-video
// frame + the Hades palette, the same language.)
//
// BATCH 1 (this file's lists): three whole realms, sky + floor each
// = 6 videos: Hades (lightning hell sky + lava floor), Hell
// (lightning hell sky + lava/fire floor), Helheim (lightning hell
// sky + ice floor — Helheim's cold identity; the lava/acid/poison
// list covers the hot realms). Batch 2 = the other 10 realms x
// (sky + floor) = 20 videos, waiting on Merlin's next message.
//
// WIRING: the sky video is picked up by the shared RealmSkyDome
// (components/RealmSkyDome.jsx) — one component, all 13 realms; a
// realm with no video yet keeps its static sky image. Floors are
// per-realm: each realm's Ground() calls floorVideoUrlForRealm()
// and falls back to its painted floorSurface() when the video is
// not there yet. Muted, looping, no sound, no new real lights.

import { useEffect, useState } from 'react';
import * as THREE from 'three';

export const NETHER_VIDEO_BASE = '/videos/nether';

/** Batch 1 realms with a sky video (unique lightning hell sky each). */
export const NETHER_VIDEO_SKY_REALMS = ['hades', 'hell', 'helheim'];

/** Batch 1 realms with a floor video (one hazard-liquid floor each). */
export const NETHER_VIDEO_FLOOR_REALMS = ['hades', 'hell', 'helheim'];

/**
 * The hazard-liquid floor type per realm (worker's choice — Merlin's
 * list was lava, acid, poison, etc.; Helheim's cold identity is ice).
 * Batch-2 realms get their type when their videos land.
 */
export const NETHER_FLOOR_VIDEO_TYPES = {
  hades: 'lava',
  hell: 'lava',
  helheim: 'ice',
};

/** Public URL of a realm's sky video, or null when it has none yet. */
export function skyVideoUrlForRealm(realmKey) {
  if (!NETHER_VIDEO_SKY_REALMS.includes(realmKey)) return null;
  return `${NETHER_VIDEO_BASE}/${realmKey}-sky.mp4`;
}

/** Public URL of a realm's floor video, or null when it has none yet. */
export function floorVideoUrlForRealm(realmKey) {
  if (!NETHER_VIDEO_FLOOR_REALMS.includes(realmKey)) return null;
  return `${NETHER_VIDEO_BASE}/${realmKey}-floor.mp4`;
}

/** A realm's floor-video hazard type ('lava' | 'ice' | ...), or null. */
export function floorVideoTypeForRealm(realmKey) {
  return NETHER_FLOOR_VIDEO_TYPES[realmKey] ?? null;
}

/** Repo-relative paths of the batch-1 video files (for tests). */
export const NETHER_VIDEO_FILES = [
  ...NETHER_VIDEO_SKY_REALMS.map((k) => `public/videos/nether/${k}-sky.mp4`),
  ...NETHER_VIDEO_FLOOR_REALMS.map((k) => `public/videos/nether/${k}-floor.mp4`),
];

/**
 * A muted, looping video texture for a URL — or null while it loads,
 * when the URL is null, or when the video fails. The video element is
 * created once per URL; on unmount the texture is disposed and the
 * video paused. Callers fall back to their painted surface on null,
 * so a missing or blocked video can never blank the scene.
 *
 * Autoplay: the video is muted and carries no audio track, so play()
 * is allowed to autoplay; if it is ever refused, one tap anywhere
 * retries it (the phone-safe pattern).
 */
export function useNetherVideoTexture(url) {
  const [tex, setTex] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const onCanPlay = () => {
      if (!alive) return;
      setTex(texture);
    };
    const onError = () => {
      if (!alive) return;
      texture.dispose();
    };
    const retryOnTap = () => {
      video.play().catch(() => {});
    };
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.play().catch(() => {
      // Autoplay refused: one tap anywhere retries it.
      window.addEventListener('pointerdown', retryOnTap, { once: true });
    });
    return () => {
      alive = false;
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      window.removeEventListener('pointerdown', retryOnTap);
      video.pause();
      texture.dispose();
    };
  }, [url]);

  return tex;
}
