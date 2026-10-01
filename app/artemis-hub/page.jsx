'use client';

// /artemis-hub now lives inside the ARTEMIS pocket universe as the OS view
// (deduped — one codebase, no duplicate logic). This route redirects so
// registry links, god menus, and bookmarks keep working.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ArtemisHubRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/artemis?view=os');
  }, [router]);
  return null;
}
