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
//
// VIDEO WRAPS (Merlin, Nov 15 ~15:03, batch 1): realms with a sky video
// (lib/nether-realm/video-wraps.js — Hades, Hell, Helheim in batch 1)
// wear their looping video texture instead; the static image stays as
// the fallback while the video loads and for realms without one yet.
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyUrlForRealm } from '@/lib/portal/realm-surfaces';
import { skyVideoUrlForRealm, useNetherVideoTexture } from '@/lib/nether-realm/video-wraps';

/** Encloses the whole walkable world (ground disc radius 400). */
export const REALM_SKY_DOME_RADIUS = 520;

// ENDLESS FREE ROAM (Merlin, Nov 18, 2026): the dome is 520 m
// around the ORIGIN — a walker past ~520 m steps outside their
// own sky. followRef (the scene's playerRef, {x, z}) rides the
// dome along with the walker so the sky stays overhead anywhere.
// Absent, the dome stays origin-anchored exactly as before.
export default function RealmSkyDome({ realmKey, followRef = null }) {
  const meshRef = useRef(null);
  useFrame(() => {
    const m = meshRef.current;
    const p = followRef && followRef.current;
    if (m && p) m.position.set(p.x, 0, p.z);
  });
  const videoTex = useNetherVideoTexture(skyVideoUrlForRealm(realmKey));
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

  // Video when it is live, static image while it loads (or when the
  // realm has no video yet) — never a blank sky.
  const map = videoTex ?? tex;
  if (!map) return null;
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[REALM_SKY_DOME_RADIUS, 32, 24]} />
      <meshBasicMaterial map={map} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
