/**
 * lib/portal/scratched-textures.js
 *
 * THE COLORED SCRATCHED-METAL WRAPS (Merlin, 2026-11-15): eight
 * scratched-metal photos in eight colours — magenta, cyan, blue,
 * bright gold, red, green, purple, silver — each wrapped onto the
 * structures Merlin approved. A ninth upload (deep gold) is
 * byte-identical to the archway gold and is NOT copied again:
 * it already lives on every realm's archways
 * (public/textures/gold/gold-scratched.jpg) and the Moon flag pole.
 *
 * Sibling of lib/portal/gold-texture.js, same house patterns:
 * module-level texture cache per colour (one load per session,
 * however many structures ask), THREE.TextureLoader inside
 * useEffect, sRGB, and a plain-material fallback until the
 * texture lands so a surface never goes blank. No
 * document/window access at import time.
 *
 * Light-reflecting, honestly: the realm scenes carry NO
 * environment map, so the gleam comes from the scenes' own
 * lights hitting the high-metalness, low-roughness surface.
 * No new lights were added for any wrap.
 *
 * Placements, as built (see tests/scratched-wraps.test.mjs):
 *   cyan        Helheim ice (FrostPools / FrozenShore)
 *   blue        Flying Dutchman hull + cannon barrels, Tlalocan
 *               river + pools
 *   red         Mars 2 ARES-2 rover + ARES Outpost hardware
 *   green       Tlalocan stepped-pyramid tiers
 *   purple      Naraka landmark, Xibalba ballcourt, Kur throne hall
 *   silver      (not placed — see below)
 *   magenta     World Engine hologram ring + studio accents
 *   bright-gold Sun base interior, hub tower trim rings, Duat
 *               barque + hall columns
 * NOT placed, honestly (Merlin's call on each next step):
 *   cyan Fortress of Solitude — no 3D realm scene exists in the
 *     repo (app/fortress-of-solitude is the vault product UI);
 *     a real Fortress realm would have to be built first.
 *   cyan Hoth / green Endor / silver Coruscant — the Star Wars
 *     landmark worker was refused by a safety policy; not retried.
 *   red Ghost Rider — no metal structure exists (only the Rider's
 *     chain links, which are off-limits); needs new geometry.
 *   green Life / purple Anti-Life — both are 2D canvas renderers
 *     with no wrappable surface; a static photo would break the
 *     pieces' point.
 *   silver ARES prison — no metal frame mesh exists; the bars and
 *     rails are the blue-energy containment effect, not metal.
 *   silver Moon landing-pad hardware — follow-up; the flag worker
 *     was editing components/MoonScene.jsx live during this pass.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';

/* One shared file per colour, under public/textures/scratched/.
 * SHA-256 + byte size are pinned in tests/scratched-wraps.test.mjs. */
export const SCRATCHED_TEXTURES = {
  magenta: {
    url: '/textures/scratched/magenta.jpg',
    sha256:
      '236505251372255d798741717e68c0a2975363ecfc737d620288d50d22ebfa0a',
    bytes: 322587,
  },
  cyan: {
    url: '/textures/scratched/cyan.jpg',
    sha256:
      '3d7406b89f65377817c46574cd893bb71dae1040ed899b96e04855a928bdf613',
    bytes: 349638,
  },
  blue: {
    url: '/textures/scratched/blue.jpg',
    sha256:
      '321dc5be654002faea5cd2d5ee35bb4a42c3e99e0e2f46d3f23ad5918e18f673',
    bytes: 341255,
  },
  'bright-gold': {
    url: '/textures/scratched/bright-gold.jpg',
    sha256:
      '470800c83223b51dea2458ea4baa2831f571640ab5b04c5330e14235323bee0b',
    bytes: 399248,
  },
  red: {
    url: '/textures/scratched/red.jpg',
    sha256:
      'b6c8fd8ddfe5594e85d4ded17f8007950e9879ad192a95cbf5d4eab4aed57341',
    bytes: 291758,
  },
  green: {
    url: '/textures/scratched/green.jpg',
    sha256:
      '6a9ca8ccdb76972724f7ad9918d1d431aa4b34cd3fb0cb941ef929fdbd7e45b8',
    bytes: 356393,
  },
  purple: {
    url: '/textures/scratched/purple.jpg',
    sha256:
      '648a45acc0ba2f32ac77f3ef1b44354a68a4037fd780a9d606ed266d08b1dadb',
    bytes: 360141,
  },
  silver: {
    url: '/textures/scratched/silver.jpg',
    sha256:
      '17aca2a9a79374f67cd8252c7464d4c159212b7d9779ded5733aeec1a2644a17',
    bytes: 378271,
  },
};

/* The colour keys, in the order Merlin sent them (gold duplicate
 * excluded — it is the archway gold, not a ninth wrap). */
export const SCRATCHED_COLORS = Object.keys(SCRATCHED_TEXTURES);

/* Light-reflecting metal, same law as the gold arches: mostly
 * metal, fairly smooth, so the scene lights give a sharp gleam
 * instead of a dull read. */
export const SCRATCHED_METALNESS = 0.9;
export const SCRATCHED_ROUGHNESS = 0.3;

/** URL for a colour — for DOM/CSS accents (studio, hologram
 * chrome) that cannot use the three.js hook. */
export function scratchedTextureUrl(color) {
  const entry = SCRATCHED_TEXTURES[color];
  if (!entry) throw new Error(`Unknown scratched wrap colour: ${color}`);
  return entry.url;
}

/* Module-level cache, one entry per colour: each texture loads
 * once per session, however many structures ask for it. */
const cache = {};

/**
 * useScratchedTexture(color) — the shared texture for a colour,
 * or null until it lands. Null is the honest "not yet" — callers
 * fall back to their existing material.
 */
export function useScratchedTexture(color) {
  const [tex, setTex] = useState(() => cache[color] || null);

  useEffect(() => {
    if (cache[color]) {
      setTex(cache[color]);
      return undefined;
    }
    const entry = SCRATCHED_TEXTURES[color];
    if (!entry) return undefined;
    let live = true;
    new THREE.TextureLoader().load(entry.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      cache[color] = t;
      if (live) setTex(t);
    });
    return () => {
      live = false;
    };
  }, [color]);

  return tex;
}

/**
 * useScratchedMaterial(color, fallback) — a structure's material
 * props: light-reflecting scratched metal once the texture lands,
 * the caller's existing material before that, so a surface never
 * goes blank. The fallback is the exact material the structure
 * wore before (passed in per site).
 */
export function useScratchedMaterial(color, fallback) {
  const tex = useScratchedTexture(color);
  if (tex) {
    return {
      map: tex,
      color: '#ffffff',
      metalness: SCRATCHED_METALNESS,
      roughness: SCRATCHED_ROUGHNESS,
    };
  }
  return fallback;
}

/**
 * applyScratchedToMaterial(material, color) — for imperative
 * three.js sites (the Star Wars landmarks are built with raw
 * THREE, not R3F, so there is no hook call site). Keeps the
 * material's existing props until the texture lands, then sets
 * the map + the light-reflecting metal props on the SAME material
 * object and flags needsUpdate, so a live scene updates without
 * a rebuild. Returns the material.
 */
export function applyScratchedToMaterial(material, color) {
  const entry = SCRATCHED_TEXTURES[color];
  if (!entry || !material) return material;
  if (cache[color]) {
    material.map = cache[color];
    material.color = new THREE.Color('#ffffff');
    material.metalness = SCRATCHED_METALNESS;
    material.roughness = SCRATCHED_ROUGHNESS;
    material.needsUpdate = true;
    return material;
  }
  new THREE.TextureLoader().load(entry.url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    cache[color] = t;
    material.map = t;
    material.color = new THREE.Color('#ffffff');
    material.metalness = SCRATCHED_METALNESS;
    material.roughness = SCRATCHED_ROUGHNESS;
    material.needsUpdate = true;
  });
  return material;
}
