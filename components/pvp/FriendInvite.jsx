// components/pvp/FriendInvite.jsx — "Invite friends" picker for any PvP game.
//
// Merlin's baseline: friend invites are the default path into PvP. This
// component: lists your accepted friends (green dot when online), lets you
// pick who to invite, creates the OASIS room, sends the invites, and shows
// the waiting state with live accept/decline.
//
// Props:
//   supabase, userId, userName, gameSlug, gameName,
//   minPlayers = 2, maxPlayers = 2, existingRoomCode = '',
//   onRoomReady(code) — fires EXACTLY ONCE with the normalized 6-char room
//     code, at the moment the room exists for this picker: on mount when
//     existingRoomCode is supplied (the room pre-exists — e.g. battleship's
//     linked lobby), or immediately after the picker creates the room in
//     handleSend. Lets the host game mount its own waiting UI the moment
//     the room is real, instead of waiting for the picker to close.
//     Games that seat on picker close (battleship) may ignore it; the
//     guarantee is only that it fires once, with a string code.
//   onClose() — dismiss.
// existingRoomCode: for games that create their own room first (e.g.
// battleship's linked lobby) — invites attach to that code instead of
// creating a new OASIS room. When set, onRoomReady fires on mount because
// the room already exists; it does NOT fire again on send.
//
// States are honest: if friends can't load, it says so and offers the room
// code (the OASIS share path still works). If presence is down, friends show
// without dots and it says presence is unavailable.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoom, normalizeCode } from '@/lib/oasis/rooms';
import { createInvite, listSentInvites, INVITE_STATUS, sanitizeName } from '@/lib/pvp/invites';
import { subscribeOnlineFriends } from '@/lib/pvp/presence';

const panel = 'rounded-2xl border border-white/15 bg-black/90 backdrop-blur-xl shadow-2xl';

async function authedFetch(supabase, path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sign in to invite friends.');
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Friends unavailable.');
  return json;
}

export default function FriendInvite({
  supabase, userId, userName = 'Player', gameSlug, gameName = 'game',
  minPlayers = 2, maxPlayers = 2, existingRoomCode = '', onRoomReady = null, onClose,
}) {
  const [friends, setFriends] = useState([]); // {id, name}
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [presenceOk, setPresenceOk] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [sent, setSent] = useState([]); // invite rows
  const pollRef = useRef(null);
  const roomReadyFired = useRef(false); // onRoomReady fires exactly once

  const fireRoomReady = (code) => {
    if (roomReadyFired.current || !onRoomReady || !code) return;
    roomReadyFired.current = true;
    onRoomReady(code);
  };

  // When the host game created the room first (existingRoomCode), the room
  // exists the moment this picker mounts — report it now so onRoomReady
  // keeps its contract on both paths (pre-existing vs picker-created).
  useEffect(() => {
    fireRoomReady(normalizeCode(existingRoomCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load accepted friends + display names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { friendships = [] } = await authedFetch(supabase, `/api/friends?user_id=${userId}`);
        const accepted = friendships.filter((f) => f.status === 'accepted');
        const ids = accepted.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
        if (ids.length === 0) { if (!cancelled) setFriends([]); return; }
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, username').in('user_id', ids);
        const byId = {};
        for (const p of profiles || []) {
          if (!byId[p.user_id]) byId[p.user_id] = p.display_name || p.username || 'Player';
        }
        if (!cancelled) setFriends(ids.map((id) => ({ id, name: sanitizeName(byId[id]) })));
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load friends.');
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, userId]);

  // Online dots.
  useEffect(() => {
    if (friends.length === 0) return;
    const unsub = subscribeOnlineFriends(supabase, friends.map((f) => f.id), ({ available, onlineIds: on }) => {
      setPresenceOk(available);
      setOnlineIds(on);
    });
    return unsub;
  }, [supabase, friends]);

  // After sending: poll invite statuses so the host sees accept/decline.
  useEffect(() => {
    if (!roomCode) return;
    const poll = async () => {
      const rows = await listSentInvites(supabase, userId, roomCode);
      setSent(rows);
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [supabase, userId, roomCode]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const acceptedCount = useMemo(() => sent.filter((s) => s.status === INVITE_STATUS.ACCEPTED).length, [sent]);

  const handleSend = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true); setSendError('');
    try {
      // Games with their own room creation (e.g. battleship's linked lobby)
      // pass the code in; otherwise we create a standard OASIS room.
      let code = normalizeCode(existingRoomCode);
      if (!code) {
        const room = await createRoom(supabase, { game: gameSlug, hostId: userId, minPlayers, maxPlayers });
        code = normalizeCode(room.room_code);
      }
      setRoomCode(code);
      // Self-created path: the room came into existence right here. (When
      // existingRoomCode was supplied, fireRoomReady already fired on mount;
      // the ref guard keeps the once-only guarantee.)
      fireRoomReady(code);
      for (const fid of selected) {
        try {
          await createInvite(supabase, {
            gameSlug, roomCode: code, inviterId: userId, inviteeId: fid, inviterName: userName,
          });
        } catch { /* one failed invite must not kill the rest */ }
      }
      const rows = await listSentInvites(supabase, userId, code);
      setSent(rows);
    } catch (e) {
      setSendError(e.message || 'Could not create the room.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-label={`Invite friends to ${gameName}`}>
      <div className={`${panel} w-full max-w-md p-5`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-widest text-white">INVITE FRIENDS — {String(gameName).toUpperCase()}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white">✕</button>
        </div>

        {!roomCode ? (
          <>
            <p className="mb-3 text-xs text-white/55">Pick friends to invite. They get an instant invite and join straight from it.</p>
            {loadError ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">{loadError} You can still share a room code instead.</p>
            ) : friends.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs leading-relaxed text-white/60">
                No friends yet — add friends from your profile, or share a room code and anyone with it can join.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {friends.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button" onClick={() => toggle(f.id)} aria-pressed={selected.has(f.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected.has(f.id) ? 'bg-teal-400/15 ring-1 ring-teal-300/50' : 'hover:bg-white/5'}`}
                    >
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/80" aria-hidden="true">
                        {f.name.charAt(0).toUpperCase()}
                        {presenceOk && onlineIds.has(f.id) && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black bg-emerald-400" title="Online" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{f.name}</span>
                      {selected.has(f.id) && <span className="text-teal-300" aria-hidden="true">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!presenceOk && friends.length > 0 && (
              <p className="mt-2 text-[11px] text-white/40">Online status is unavailable right now — the list still works.</p>
            )}
            {sendError && <p className="mt-2 text-xs text-red-300">{sendError}</p>}
            <button
              type="button" onClick={handleSend} disabled={selected.size === 0 || sending}
              className="mt-4 w-full rounded-xl bg-teal-300 px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? 'Creating room…' : `Send invite${selected.size === 1 ? '' : 's'} (${selected.size})`}
            </button>
          </>
        ) : (
          <>
            <p className="mb-1 text-xs text-white/55">Room created — invites sent. Friends join straight from the invite.</p>
            <p className="mb-3 text-center font-mono text-3xl font-bold tracking-[0.3em] text-teal-300">{roomCode}</p>
            <ul className="mb-3 space-y-1">
              {sent.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <span className="text-white/80">{sanitizeName(friends.find((f) => f.id === s.invitee_id)?.name)}</span>
                  <span className={
                    s.status === INVITE_STATUS.ACCEPTED ? 'text-emerald-300'
                    : s.status === INVITE_STATUS.DECLINED ? 'text-white/40'
                    : 'text-amber-200'
                  }>
                    {s.status === INVITE_STATUS.ACCEPTED ? 'Joined ✓' : s.status === INVITE_STATUS.DECLINED ? 'Declined' : 'Waiting…'}
                  </span>
                </li>
              ))}
            </ul>
            {acceptedCount > 0 && <p className="mb-2 text-center text-xs text-emerald-300">{acceptedCount} friend{acceptedCount === 1 ? '' : 's'} joined — head to the lobby.</p>}
            <button
              type="button" onClick={onClose}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
