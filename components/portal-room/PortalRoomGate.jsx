'use client';

// PortalRoomGate — the Portal Room's client-side roster gate.
//
// The server page builds the base roster (every public realm, from
// the satellite registry) and hands it here. This gate watches the
// Supabase browser session and, only when the signed-in account is
// the owner (lib/owner.js — the one definition), appends the
// owner-only portals (lib/portal-roster.js OWNER_PORTALS: Earth 2,
// the Phase 2 test build). For everyone else — signed out or any
// other account — the roster is the base roster untouched, exactly as
// the room has always rendered it. The owner entry simply appears
// once the session loads and proves whose it is.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { withOwnerPortals } from '@/lib/portal-roster';
import PortalRoom from './PortalRoom';

export default function PortalRoomGate({ basePrograms }) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setIsOwner(isOwnerEmail(data?.session?.user?.email));
      } catch {
        if (alive) setIsOwner(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setIsOwner(isOwnerEmail(session?.user?.email));
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  const programs = useMemo(
    () => withOwnerPortals(basePrograms, isOwner),
    [basePrograms, isOwner]
  );

  return <PortalRoom programs={programs} />;
}
