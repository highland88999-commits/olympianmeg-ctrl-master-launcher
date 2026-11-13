'use client';

// PortalRoomGate — the Portal Room's client-side roster gate.
//
// The server page builds the base roster (every public realm, from
// the satellite registry) and hands it here. This gate watches the
// Supabase browser session and appends the signed-in portals
// (lib/portal-roster.js SIGNED_IN_PORTALS: Earth 2, open to every
// signed-in account since Merlin's 2026-10-31 unlock) for any
// signed-in session, and the owner-only portals for the owner
// (lib/owner.js — the one definition). For signed-out visitors the
// roster is the base roster untouched, exactly as the room has always
// rendered it. The Earth 2 entry simply appears once the session
// loads and proves whose it is.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { hasEarth2Access } from '@/lib/earth2/access';
import { withOwnerPortals, withSignedInPortals } from '@/lib/portal-roster';
import PortalRoom from './PortalRoom';

export default function PortalRoomGate({ basePrograms }) {
  const [sessionEmail, setSessionEmail] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email || null;
        if (alive) {
          setSessionEmail(email);
          setIsOwner(isOwnerEmail(email));
        }
      } catch {
        if (alive) {
          setSessionEmail(null);
          setIsOwner(false);
        }
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        const email = session?.user?.email || null;
        setSessionEmail(email);
        setIsOwner(isOwnerEmail(email));
      }
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  const programs = useMemo(
    () =>
      withOwnerPortals(
        withSignedInPortals(basePrograms, hasEarth2Access(sessionEmail)),
        isOwner
      ),
    [basePrograms, sessionEmail, isOwner]
  );

  return <PortalRoom programs={programs} />;
}
