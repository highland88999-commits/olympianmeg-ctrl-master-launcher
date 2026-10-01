'use client';

// /architect-artemis now lives inside the ARTEMIS pocket universe as the
// ORACLE view (deduped — one codebase, no duplicate logic). This route
// redirects so registry links, god menus, and bookmarks keep working.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ArchitectArtemisRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/artemis?view=oracle');
  }, [router]);
  return null;
}
