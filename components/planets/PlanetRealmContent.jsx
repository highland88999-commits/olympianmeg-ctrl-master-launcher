'use client';

// PlanetRealmContent — a hub planet's seeded surface as in-Canvas
// content (Merlin, 2026-10-22: "Street level click enabled for all
// planets"), the Planet Program's twin of MarsRealmContent.
//
// WHY THIS IS A THIN WRAPPER, stated plainly: the Mars realm's scene
// composition (components/mars/MarsScene.jsx SceneContent — seeded
// terrain, basins, flora, the five fauna niches, their behavior
// driver, orbit/walk/fly rigs, selection) turned out to be FULLY
// profile-driven: nothing in it reads anything Mars-specific beyond
// the profile object itself. So a planet realm is that same
// composition fed a planet profile (lib/planets/profiles.js — same
// shape, planet palette, life-type species). Forking ~900 lines to
// change the name on the door would only buy drift; Mars's own door
// (MarsRealmContent) stays byte-untouched.
//
// THE REGIONAL LAYER (Merlin, 2026-10-22: planetary procedural
// landscapes + regional creatures, invisible zone lines, organic
// transitions): every planet EXCEPT Mars additionally grows —
//   · PlanetLandscape: a blended biome ground skin + regional flora
//     (lib/planets/landscape.js: five soft regions per planet as
//     continuous moisture/temperature/elevation weights — ground
//     colour, flora and fauna are blends of the two nearest
//     regions, so no boundary is ever drawn or seen);
//   · PlanetCreatures: the wild population (lib/planets/
//     creatures.js) whose body plans derive from the biome blend
//     at their spawn points — blend-band creatures are visible
//     intermediates between their two regions.
// Mars is skipped by the planetKey guard so the Mars realm stays
// pixel-identical to before this layer existed.
//
// CameraGroundTracker feeds the walker's ground position out to the
// DOM console through posRef (PlanetConsole names the region
// underfoot); in orbit mode it reports the landing clearing.
//
// Known Mars residue, honestly noted: the selection ring/label and
// the TouchControls accent are Mars orange inside the shared scene —
// cosmetic chrome, identical on every realm for now.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MarsRealmContent } from '@/components/mars/MarsScene';
import PlanetLandscape from '@/components/planets/PlanetLandscape';
import PlanetCreatures from '@/components/planets/PlanetCreatures';

function CameraGroundTracker({ posRef, mode }) {
  const { camera } = useThree();
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!posRef) return;
    acc.current += dt;
    if (acc.current < 0.12) return;
    acc.current = 0;
    if (mode === 'orbit') {
      posRef.current = { x: 10, z: 26 };
    } else {
      posRef.current = { x: camera.position.x, z: camera.position.z };
    }
  });
  return null;
}

export function PlanetRealmContent({ profile, timeOfDay, mode, inputRef, focusReq, onSelect, selectedId, posRef }) {
  const regional = profile.planetKey !== 'mars';
  return (
    <>
      <MarsRealmContent
        profile={profile}
        timeOfDay={timeOfDay}
        mode={mode}
        inputRef={inputRef}
        focusReq={focusReq}
        onSelect={onSelect}
        selectedId={selectedId}
      />
      {regional && <PlanetLandscape profile={profile} />}
      {regional && <PlanetCreatures profile={profile} />}
      {posRef && <CameraGroundTracker posRef={posRef} mode={mode} />}
    </>
  );
}
