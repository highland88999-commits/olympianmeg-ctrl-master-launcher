'use client';

// components/RealmLifeLine.jsx — REALM LIFE LINE (Nov 14, 2026).
//
// One shared component for all 24 afterlife realms' realm-info
// overlays. It renders ONE seeded representative soul's life line
// for the realm (lifeLineFor(lifeFor(...)) — see
// lib/afterlife/realm-life-line.js) plus the soul census from
// populationFor(). The line is honest about what it is: one
// drifting soul, picked by day so it changes daily — the text
// says "One Shade today: ...", and the census beside it is the
// whole population.
//
// It lives INSIDE the per-realm overlay HUD block, so it fades
// with the overlay on any tap (useRealmInfoFade, 600 ms) and
// returns with the ⓘ Info button. That is the intended behaviour.
//
// Computed once per mount (the soul is day-seeded, so it is the
// same soul all day); the dead do not eat or hunt and no death
// law, diet, population minimum or behaviour rule is changed here.

import { useMemo } from 'react';
import { realmLifeLine } from '@/lib/afterlife/realm-life-line';

export function RealmLifeLine({ realmKey }) {
  const data = useMemo(() => realmLifeLine(realmKey), [realmKey]);
  if (!data || !data.line) return null;
  return (
    <p className="mt-3 max-w-md rounded-2xl bg-black/55 px-4 py-2 text-xs leading-relaxed text-stone-200">
      {data.censusLine} — One {data.kind} today: {data.line}
    </p>
  );
}
