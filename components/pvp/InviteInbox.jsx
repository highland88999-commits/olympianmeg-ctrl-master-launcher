// components/pvp/InviteInbox.jsx — Incoming PvP invite toasts.
//
// Mount once near the launcher shell (or any page that wants invites). It
// listens for directed invites two ways: instant Realtime broadcast, plus a
// 12s poll of the pvp_invites table as the honest fallback. Accept drops the
// invitee straight into the game's ?code= deep link (every PvP game
// auto-joins from it); Decline answers quietly.
//
// Props: supabase, userId. Renders nothing when there are no live invites.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listPendingInvites, respondInvite, subscribeInvites, isInviteFresh, sanitizeName,
} from '@/lib/pvp/invites';

const POLL_MS = 12000;

export default function InviteInbox({ supabase, userId }) {
  const router = useRouter();
  const [invites, setInvites] = useState([]);
  const seenRef = useRef(new Set());

  const mergeInvite = useCallback((inv) => {
    if (!inv || !isInviteFresh(inv)) return;
    setInvites((prev) => {
      if (prev.some((i) => i.id === inv.id) || seenRef.current.has(inv.id)) return prev;
      return [...prev, inv];
    });
  }, []);

  const refresh = useCallback(async () => {
    const rows = await listPendingInvites(supabase, userId);
    for (const r of rows) mergeInvite(r);
    // Drop invites that are no longer fresh (answered elsewhere / expired).
    setInvites((prev) => prev.filter((i) => isInviteFresh(i)));
  }, [supabase, userId, mergeInvite]);

  useEffect(() => {
    if (!supabase || !userId) return;
    refresh();
    const unsubBroadcast = subscribeInvites(supabase, userId, mergeInvite);
    const timer = setInterval(refresh, POLL_MS);
    return () => { unsubBroadcast(); clearInterval(timer); };
  }, [supabase, userId, refresh, mergeInvite]);

  const dismiss = (id) => {
    seenRef.current.add(id);
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  const answer = async (inv, accept) => {
    const row = await respondInvite(supabase, inv.id, userId, accept);
    dismiss(inv.id);
    if (accept && row) {
      router.push(`/${row.game_slug}?code=${row.room_code}`);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-4" role="region" aria-label="Game invites">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-teal-300/40 bg-black/92 p-4 shadow-2xl backdrop-blur-xl"
        >
          <p className="text-sm text-white">
            <span className="font-bold text-teal-300">{sanitizeName(inv.inviter_name)}</span>
            {' '}invited you to play <span className="font-bold">{sanitizeName(inv.game_slug.replace(/-/g, ' '), inv.game_slug)}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs tracking-[0.25em] text-white/45">ROOM {inv.room_code}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={() => answer(inv, true)}
              className="flex-1 rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-black hover:opacity-90"
            >
              Accept — play now
            </button>
            <button
              type="button" onClick={() => answer(inv, false)}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/75 hover:bg-white/10"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
