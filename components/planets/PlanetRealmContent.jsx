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
// (MarsRealmContent) stays byte-untouched, and this wrapper is where
// planet-only scene behavior will live if a planet ever needs it.
//
// Known Mars residue, honestly noted: the selection ring/label and
// the TouchControls accent are Mars orange inside the shared scene —
// cosmetic chrome, identical on every realm for now.

import { MarsRealmContent } from '@/components/mars/MarsScene';

export function PlanetRealmContent({ profile, timeOfDay, mode, inputRef, focusReq, onSelect, selectedId }) {
  return (
    <MarsRealmContent
      profile={profile}
      timeOfDay={timeOfDay}
      mode={mode}
      inputRef={inputRef}
      focusReq={focusReq}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
}
