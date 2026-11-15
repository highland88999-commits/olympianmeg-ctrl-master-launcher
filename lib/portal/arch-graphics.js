/**
 * lib/portal/arch-graphics.js
 *
 * ARCH -> GRAPHIC MAP for the hell-realms portal arches (Merlin,
 * 2026-11-15): every stone arch in every nether-realm plaza wears the
 * illustrated art of the place it leads to, on its doorway disc.
 *
 * Sibling of lib/portal/portal-graphics.js, NOT part of it: that
 * module keys REALMS (one graphic per realm, hung on portal cards),
 * this one keys ARCH DESTINATIONS (the 9 places the plaza arches
 * lead to — styx, cerberus, medusa, persephone, afterlife, erebus,
 * zeus-v-hades, nether-realm, sanctuary) on a different surface (the
 * doorway disc inside the arch). One key space, one surface each.
 *
 * Pure module except for the useArchTextures hook: no document/window
 * access at import time. Art lives under public/art/arches/ so it
 * ships with the build. Generated (media pipeline) — no Tripo, no
 * paid assets. No text, logos, watermarks, or faces in any image.
 *
 * Medusa reuses the EXISTING /art/portals/medusas-lair.jpg — no new
 * image, no duplicate bytes. Cerberus is a normal entry: the door
 * gets the hound's art like every other door.
 *
 * The art hangs on the doorway only, Swamp Run menu-dressing
 * standard: NO layout, label, action, order, or size change anywhere;
 * everything still works exactly as before.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { LAIR_GRAPHIC } from './portal-graphics.js';

export const ARCH_ART_BASE = '/art/arches';

/* One distinct graphic per arch destination (the 9 keys the 13
 * nether-realm PORTALS exports use — 61 arch instances total). */
export const ARCH_GRAPHICS = {
  styx: `${ARCH_ART_BASE}/styx.jpg`,
  cerberus: `${ARCH_ART_BASE}/cerberus.jpg`,
  // Medusa's lair: the existing lair graphic, reused — no new image.
  medusa: LAIR_GRAPHIC,
  persephone: `${ARCH_ART_BASE}/persephone.jpg`,
  afterlife: `${ARCH_ART_BASE}/afterlife.jpg`,
  erebus: `${ARCH_ART_BASE}/erebus.jpg`,
  'zeus-v-hades': `${ARCH_ART_BASE}/zeus-v-hades.jpg`,
  'nether-realm': `${ARCH_ART_BASE}/nether-realm.jpg`,
  sanctuary: `${ARCH_ART_BASE}/sanctuary.jpg`,
};

/* What each graphic depicts (from ~/workspace/heaven-hell-purposes.md
 * "SHARED PORTAL-ARCH DESTINATIONS", the Hades entry in
 * PORTAL_DEPICTS, and app/sanctuary — the HESTIA therapy hub — for
 * Sanctuary; not invented). */
export const ARCH_DEPICTS = {
  styx: 'The Styx, the passage — Charon\'s ferry crossing the dark river, the fast-travel spine of the underworld',
  cerberus: 'Cerberus, the three-headed gate hound — the trial at Hades\' gates: feed each head to earn passage anywhere',
  medusa: 'Medusa\'s lair — the boss chamber: enter her lair, cut off her head, and take it as a reusable held weapon',
  persephone: 'Persephone\'s Hall — the seasonal audience: visit in her season and she grants the spring blessing',
  afterlife: 'The Afterlife — the gallery of the dead: painted scenes, each one a life that was lived',
  erebus: 'Erebus — the void universes: the dark between worlds, scout worlds you have not visited',
  'zeus-v-hades': 'Zeus v Hades — the race: the gods\' chariots, winning earns gold and the winner\'s blessing',
  'nether-realm': 'Hades — the palace plaza: the dark palace, the River Styx with its stone bridge, Cerberus at the gates',
  sanctuary: 'Sanctuary — the calm therapy hub: HESTIA\'s quiet chambers, a place to rest and heal between realms',
};

/**
 * Graphic for an arch destination key. Unknown keys return undefined
 * — deliberately NO fallback to Hades: a wrong image on a doorway is
 * worse than a plain glow disc, and the arch simply keeps its disc
 * until a real graphic exists.
 */
export function artForArch(archKey) {
  return ARCH_GRAPHICS[archKey];
}

/* Module-level cache: each destination texture loads once per session,
 * however many arches (up to 13 realms) ask for it. */
const textureCache = new Map();

function snapshotFor(keys) {
  const out = {};
  for (const k of keys) {
    const tex = textureCache.get(ARCH_GRAPHICS[k]);
    if (tex) out[k] = tex;
  }
  return out;
}

/**
 * useArchTextures(keys) — house TextureLoader pattern (HomeScene
 * Mars, ex-Medusa lair loader): load once, set state when ready —
 * before a texture loads the arch shows its plain glow disc.
 * The art is 3:2, the doorway is a circle: crop the centre square
 * (repeat.x 2/3, offset.x 1/6) so nothing is stretched.
 * Returns a key -> texture map ({} until the first texture lands;
 * keys with no graphic, or not yet loaded, are simply absent).
 */
export function useArchTextures(keys) {
  const keyList = Array.isArray(keys) ? keys : [];
  const cacheKey = keyList.join(',');
  const [textures, setTextures] = useState(() => snapshotFor(keyList));

  useEffect(() => {
    let live = true;
    const wanted = [...new Set(keyList.filter((k) => ARCH_GRAPHICS[k]))];
    const missing = wanted.filter((k) => !textureCache.has(ARCH_GRAPHICS[k]));
    if (missing.length === 0) {
      if (live) setTextures(snapshotFor(wanted));
      return undefined;
    }
    let remaining = missing.length;
    missing.forEach((k) => {
      new THREE.TextureLoader().load(ARCH_GRAPHICS[k], (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.repeat.set(2 / 3, 1);
        tex.offset.set(1 / 6, 0);
        textureCache.set(ARCH_GRAPHICS[k], tex);
        remaining -= 1;
        if (remaining === 0 && live) setTextures(snapshotFor(wanted));
      });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return textures;
}
