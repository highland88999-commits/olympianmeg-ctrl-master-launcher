// OLYMPIAN MONSTERVERSE — landmark art (G-03, WS4).
//
// One illustrated graphic per landmark type, hung on a flat
// face/disc of the landmark — the arch-graphics.js pattern:
// TextureLoader + module cache + plain-material fallback until
// the texture lands (a wrong image is worse than a plain face).
// No layout, label, size, or collider change anywhere.
// Throne + haven are EXCLUDED (do-not-touch); intro-arch keeps
// its plain face (it is the arrival marker, not a dressed wall).
// Art lives under public/art/hollow-earth/landmarks/, generated
// (media pipeline) — no text, logos, watermarks, or faces.

import { useEffect, useState } from 'react';
import * as THREE from 'three';

export const LANDMARK_ART_BASE = '/art/hollow-earth/landmarks';

/** The eight dressed landmark types (throne + haven excluded). */
export const LANDMARK_ART_TYPES = [
  'ooze-pool', 'ember-spire', 'storm-pylon', 'mire-arch',
  'gloom-monolith', 'wreck-hulk', 'peak-shrine', 'frost-spire',
];

/* One distinct graphic per dressed landmark type. */
export const LANDMARK_ART = {
  'ooze-pool': `${LANDMARK_ART_BASE}/ooze-pool.jpg`,
  'ember-spire': `${LANDMARK_ART_BASE}/ember-spire.jpg`,
  'storm-pylon': `${LANDMARK_ART_BASE}/storm-pylon.jpg`,
  'mire-arch': `${LANDMARK_ART_BASE}/mire-arch.jpg`,
  'gloom-monolith': `${LANDMARK_ART_BASE}/gloom-monolith.jpg`,
  'wreck-hulk': `${LANDMARK_ART_BASE}/wreck-hulk.jpg`,
  'peak-shrine': `${LANDMARK_ART_BASE}/peak-shrine.jpg`,
  'frost-spire': `${LANDMARK_ART_BASE}/frost-spire.jpg`,
};

/** What each graphic depicts (the landmark it dresses, nothing invented). */
export const LANDMARK_ART_DEPICTS = {
  'ooze-pool': 'A bubbling acid ooze pool — sickly green glowing liquid, rising bubbles, dark rocky rim',
  'ember-spire': 'A black basalt ember spire — dark jagged rock with glowing orange ember cracks and a burning tip',
  'storm-pylon': 'A storm pylon on pale lightning plains — slender stone pole, glowing yellow electric ring, crackling orb',
  'mire-arch': 'A stone archway in a violet poison grove — dark pillars framing a glowing violet mist doorway',
  'gloom-monolith': 'A tall dark gloom monolith in grey smoke wastes — black stone slab with faint pale runes',
  'wreck-hulk': 'A wrecked ship hulk half-buried in ochre desert dunes — tilted broken hull, ribs exposed',
  'peak-shrine': 'A mountain peak shrine — stacked grey stone tiers with a pale glowing crystal cone on top',
  'frost-spire': 'A pale ice crystal frost spire on a frozen plain — translucent blue-white ice tower on a frost base',
};

/**
 * Graphic for a landmark type. Unknown keys (throne, haven,
 * intro-arch, anything else) return undefined — deliberately NO
 * fallback: a wrong image on a landmark is worse than a plain face.
 */
export function artForLandmark(landmarkType) {
  return LANDMARK_ART[landmarkType];
}

/** Repo-relative paths of the eight expected art files (for tests). */
export const LANDMARK_ART_FILES = LANDMARK_ART_TYPES.map(
  (k) => `public/art/hollow-earth/landmarks/${k}.jpg`
);

/* Module-level cache: each type texture loads once per session,
 * however many landmarks of that type ask for it. */
const textureCache = new Map();

function snapshotFor(keys) {
  const out = {};
  for (const k of keys) {
    const tex = textureCache.get(LANDMARK_ART[k]);
    if (tex) out[k] = tex;
  }
  return out;
}

/**
 * useLandmarkArtTextures(keys) — the house TextureLoader pattern:
 * load once, set state when ready — before a texture loads the
 * landmark shows its plain face. Returns a type -> texture map
 * ({} until the first texture lands; types with no graphic, or
 * not yet loaded, are simply absent).
 */
export function useLandmarkArtTextures(keys) {
  const keyList = Array.isArray(keys) ? keys : [];
  const cacheKey = keyList.join(',');
  const [textures, setTextures] = useState(() => snapshotFor(keyList));

  useEffect(() => {
    let live = true;
    const wanted = [...new Set(keyList.filter((k) => LANDMARK_ART[k]))];
    const missing = wanted.filter((k) => !textureCache.has(LANDMARK_ART[k]));
    if (missing.length === 0) {
      if (live) setTextures(snapshotFor(wanted));
      return undefined;
    }
    let remaining = missing.length;
    missing.forEach((k) => {
      new THREE.TextureLoader().load(
        LANDMARK_ART[k],
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          textureCache.set(LANDMARK_ART[k], tex);
          remaining -= 1;
          if (remaining === 0 && live) setTextures(snapshotFor(wanted));
        },
        undefined,
        () => {
          // Missing image: the landmark keeps its plain face.
          remaining -= 1;
          if (remaining === 0 && live) setTextures(snapshotFor(wanted));
        }
      );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return textures;
}
