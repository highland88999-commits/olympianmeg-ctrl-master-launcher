// components/pvp/InviteInboxMount.jsx — Shell mount for the PvP invite inbox.
// Client wrapper: resolves the signed-in user from the shared Supabase
// client and mounts InviteInbox only when there is a session. Renders nothing
// for signed-out visitors (invites are a signed-in feature).
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import InviteInbox from './InviteInbox';

export default function InviteInboxMount() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession()
      .then(({ data: { session } }) => { if (!cancelled) setUserId(session?.user?.id || null); })
      .catch(() => { if (!cancelled) setUserId(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled) setUserId(session?.user?.id || null);
    });
    return () => { cancelled = true; subscription?.unsubscribe(); };
  }, []);

  if (!userId) return null;
  return <InviteInbox supabase={supabase} userId={userId} />;
}
