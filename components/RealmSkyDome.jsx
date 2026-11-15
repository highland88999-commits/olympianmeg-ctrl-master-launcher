// components/RealmSkyDome.jsx
// REALM SKY DOME (Merlin, 2026-11-15) — the ceiling of a hell realm.
//
// A large BackSide sphere wearing the realm's generated sky image
// (public/art/realms/<slug>-sky.jpg, one per realm, made by the art
// worker — no text, logos, watermarks or faces). Before the image
// loads the dome renders nothing, so the scene keeps its existing
// sky; if the image never loads (missing file, offline) the dome
// simply never appears — it can never blank the scene.
//
// COEXISTENCE with DayNightRig (components/DayNightRig.jsx): the rig
// still drives light and fog on everything else. Two honest trades,
// flagged in the build report:
//   1. The dome hides the rig's background-colour cycle — the sky
//      image is static, it does not dim at night while the ground
//      does. The rig's sun/moon lights still cycle; only the sky
//      colour stops changing.
//   2. The dome's own material has fog={false}: at 520 m the rig's
//      fogExp2 would wash the whole sky out to fog colour. The fog
//      still bites every other surface in the realm.
// No real light is added here — the dome is meshBasicMaterial, unlit,
// and it is the ceiling texture, not a lamp.
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { skyUrlForRealm } from '@/lib/portal/realm-surfaces';

/** Encloses the whole walkable world (ground disc radius 400). */
export const REALM_SKY_DOME_RADIUS = 520;

export default function RealmSkyDome({ realmKey }) {
  const [tex, setTex] = useState(null);
  const texRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      skyUrlForRealm(realmKey),
      (t) => {
        if (!alive) return;
        t.colorSpace = THREE.SRGBColorSpace;
        texRef.current = t;
        setTex(t);
      },
      undefined,
      () => {
        // Missing image: stay invisible, never blank the scene.
      },
    );
    return () => {
      alive = false;
      if (texRef.current) {
        texRef.current.dispose();
        texRef.current = null;
      }
    };
  }, [realmKey]);

  if (!tex) return null;
  return (
    <mesh>
      <sphereGeometry args={[REALM_SKY_DOME_RADIUS, 32, 24]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
