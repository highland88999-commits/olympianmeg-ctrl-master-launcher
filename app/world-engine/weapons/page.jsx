'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ForgeSector from '@/components/world-engine/ForgeSector';
import PatronCommissions from '@/components/world-engine/PatronCommissions';
import { SECTORS } from '@/lib/world-engine/sectors';
import { patronFromForgeUrl } from '@/lib/world-engine/forge-agent';

// THE forge (Merlin, Nov 15, 2026): the World Engine weapons
// builder + the patron smiths' commissions, on one page. Realm
// links land here with a patron preselected
// (/world-engine/weapons?patron=<id>) — the matching smith's card
// scrolls into view. The old /weapons-forge page is gone; that
// URL redirects here (next.config.js).
function WeaponsPageInner() {
  const params = useSearchParams();
  const patron = patronFromForgeUrl(`/world-engine/weapons?${params.toString()}`);
  return (
    <>
      <ForgeSector config={SECTORS.weapons} />
      <div className="bg-black px-6 pb-24 font-mono md:px-8">
        <div className="mx-auto max-w-6xl">
          <PatronCommissions initialPatron={patron} accent={SECTORS.weapons.accent} />
        </div>
      </div>
      <div aria-hidden="true" className="player-clear" />
    </>
  );
}

export default function SectorPage() {
  return (
    <Suspense>
      <WeaponsPageInner />
    </Suspense>
  );
}
