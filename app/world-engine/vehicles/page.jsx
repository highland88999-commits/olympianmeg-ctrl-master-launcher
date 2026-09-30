'use client';

import ForgeSector from '@/components/world-engine/ForgeSector';
import { SECTORS } from '@/lib/world-engine/sectors';

export default function SectorPage() {
  return (
    <>
      <ForgeSector config={SECTORS.vehicles} />
      <div aria-hidden="true" className="player-clear" />
    </>
  );
}
