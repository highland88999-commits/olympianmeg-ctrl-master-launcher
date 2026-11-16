/**
 * lib/portal/gold-texture.js
 *
 * THE GOLD WRAP (Merlin, 2026-11-15): every portal arch in every
 * realm wears the scratched-gold texture on its stone structure
 * (the two posts + the lintel), light-reflecting — high metalness,
 * low roughness — so the light plays off it. The doorway art discs
 * keep their own graphics; the gold never covers them. The Descent
 * portal's ring of stones is NOT an arch and keeps its stone. The
 * hub's realm gates (SpacePortalGates — rectangular pillar-and-bar
 * frames, not arches) and the hub Omega Arch (a video wrap by
 * design) are NOT wrapped — the order is the realm arches.
 *
 * Sibling of lib/portal/arch-graphics.js, same house patterns:
 * module-level texture cache (one load per session, however many
 * arches ask), THREE.TextureLoader inside useEffect, sRGB, and a
 * plain-stone fallback until the texture lands so an arch never
 * goes blank. No document/window access at import time.
 *
 * The gold photo is Merlin's upload (1170x653, scratched gold),
 * copied byte-for-byte to public/textures/gold/gold-scratched.jpg.
 * One shared file: the Moon flag-pole wrap uses this same path.
 *
 * Light-reflecting, honestly: the realm scenes carry NO environment
 * map, so the gleam comes from the scenes' own lights (the arch
 * flank lights + realm lights) hitting the high-metalness, low-
 * roughness surface. No new lights were added for this.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';

export const GOLD_TEXTURE_URL = '/textures/gold/gold-scratched.jpg';

/* SHA-256 of Merlin's uploaded gold photo — the repo copy must
 * match it byte-for-byte (see tests/gold-arches.test.mjs). */
export const GOLD_TEXTURE_SHA256 =
  '260de1b4ad6e465d00b5c5f4d4ccebfd315eeef84e6a5f551067b7fa151d4293';

/* Light-reflecting gold: mostly metal, fairly smooth, so the
 * scene lights give a sharp gleam instead of a dull stone read.
 * (Repo convention elsewhere is metalness 0–0.1; gold is the
 * deliberate exception — it is metal.) */
export const GOLD_ARCH_METALNESS = 0.9;
export const GOLD_ARCH_ROUGHNESS = 0.3;

/* Module-level cache: the gold texture loads once per session,
 * however many arches (25 scenes) ask for it. */
let cachedGoldTex = null;

/**
 * useGoldTexture() — the shared gold texture, or null until it
 * lands. Null is the honest "not yet" — callers fall back to stone.
 */
export function useGoldTexture() {
  const [tex, setTex] = useState(() => cachedGoldTex);

  useEffect(() => {
    if (cachedGoldTex) {
      setTex(cachedGoldTex);
      return undefined;
    }
    let live = true;
    new THREE.TextureLoader().load(GOLD_TEXTURE_URL, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      cachedGoldTex = t;
      if (live) setTex(t);
    });
    return () => {
      live = false;
    };
  }, []);

  return tex;
}

/**
 * useGoldArchMaterial(fallback) — the arch structure's material
 * props: light-reflecting gold once the texture lands, the
 * caller's stone props before that, so an arch never goes blank.
 * The fallback is the exact stone material the arch wore before
 * (passed in per scene — the nether scenes' {...stone} spread,
 * the higher scenes' plain STONE colour).
 */
export function useGoldArchMaterial(fallback) {
  const gold = useGoldTexture();
  if (gold) {
    return {
      map: gold,
      color: '#ffffff',
      metalness: GOLD_ARCH_METALNESS,
      roughness: GOLD_ARCH_ROUGHNESS,
    };
  }
  return fallback;
}
