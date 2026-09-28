'use client';

import ForgeSector from '@/components/world-engine/ForgeSector';
import { SECTORS } from '@/lib/world-engine/sectors';

export default function SectorPage() {
  return (
    <>
      <ForgeSector config={SECTORS.objects} />
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </>
  );
}
