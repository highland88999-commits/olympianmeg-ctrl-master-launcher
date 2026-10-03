// components/NotificationsWindow.jsx — floating notification inbox.
// A separate floating window (not a page, not a toast): friend requests and
// group invites with accept/decline, system messages, and an achievements
// section that is a defined-later seam (data model ready, UI shows a tasteful
// empty state until achievements are defined).
//
// Graphic slot: /images/ui/notifications-header.png (21:9, 800px wide) is
// rendered as the window header art when Merlin's graphic lands; an elegant
// gradient + particle rain sits underneath so it looks finished before then.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ParticleRain from '@/components/ParticleRain';
import {
  ACTIONABLE_TYPES,
  fetchNotifications,
  markNotificationsRead,
  respondToNotification,
} from '@/lib/notifications';
import { respondToFriendshipClient } from '@/lib/friends';

const HEADER_ART = '/images/ui/notifications-header.png';
const BELL_ART = '/images/ui/icon-notifications.png';

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function timeAgo(iso) {
  try {
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch {
    return '';
  }
}

const SECTION_LABELS = {
  friend_request: 'Friend Requests',
  group_invite: 'Group Invites',
  system: 'System',
  achievement: 'Achievements',
};

function ActionButtons({ id, busy, onRespond }) {
  const base =
    'min-h-[44px] px-5 rounded-lg text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50';
  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        data-ui="notif-accept"
        disabled={busy}
        onClick={() => onRespond(id, 'accept')}
        className={`${base} bg-emerald-400/90 text-emerald-950 hover:bg-emerald-300`}
      >
        Accept
      </button>
      <button
        type="button"
        data-ui="notif-decline"
        disabled={busy}
        onClick={() => onRespond(id, 'decline')}
        className={`${base} border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-white`}
      >
        Decline
      </button>
    </div>
  );
}

export default function NotificationsWindow() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [headerArt, setHeaderArt] = useState(true);
  const [bellArt, setBellArt] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const rootRef = useRef(null);

  const load = useCallback(async (markRead) => {
    let token = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    } catch { /* offline */ }
    if (!token) {
      setSignedIn(false);
      setItems([]);
      setUnread(0);
      return;
    }
    setSignedIn(true);
    setLoading(true);
    try {
      const data = await fetchNotifications(token);
      setItems(data.items || []);
      setUnread(data.unread || 0);
      if (markRead && (data.unread || 0) > 0) {
        await markNotificationsRead(token, 'all');
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch {
      /* keep last state; offline */
    } finally {
      setLoading(false);
    }
  }, []);

  // Badge refresh: on mount + every 90s while mounted.
  useEffect(() => {
    load(false);
    const t = setInterval(() => { if (!open) load(false); }, 90000);
    return () => clearInterval(t);
  }, [load, open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load(true);
  };

  const onRespond = async (id, decision) => {
    setBusyId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) return;
      // Friend requests carrying a real friendship answer it for real —
      // everything else keeps the legacy metadata-only path.
      const item = items.find((n) => n.id === id);
      const friendshipId = item && item.type === 'friend_request' ? item.meta?.friendship_id : null;
      if (friendshipId) {
        await respondToFriendshipClient(token, friendshipId, decision);
      } else {
        await respondToNotification(token, id, decision);
      }
      setItems((prev) => prev.map((n) =>
        n.id === id ? { ...n, read: true, meta: { ...(n.meta || {}), handled: true, decision } } : n
      ));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* offline — leave the row as-is */
    } finally {
      setBusyId(null);
    }
  };

  const sections = ['friend_request', 'group_invite', 'system', 'achievement'].map((type) => ({
    type,
    rows: items.filter((n) => n.type === type),
  }));

  return (
    <div ref={rootRef} data-ui="notifications-root" className="relative">
      {/* Bell */}
      <button
        type="button"
        data-ui="notifications-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={toggle}
        className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center relative overflow-hidden border text-[#9dbfff] bg-zinc-950/85 backdrop-blur-md shadow-[0_0_18px_rgba(58,134,255,0.25)] hover:scale-105 transition-transform"
        style={{ borderColor: 'rgba(58,134,255,0.45)' }}
      >
        {bellArt ? (
          <img
            src={BELL_ART}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setBellArt(false)}
          />
        ) : null}
        <span className="relative"><BellGlyph /></span>
        {unread > 0 && (
          <span
            data-ui="notifications-badge"
            className="absolute top-0.5 right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Outside-tap dismiss */}
          <button
            type="button"
            aria-label="Close notifications"
            data-ui="notifications-dismiss"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[88] cursor-default bg-transparent"
            style={{ touchAction: 'manipulation' }}
          />
          {/* Floating window */}
          <div
            data-ui="notifications-window"
            role="dialog"
            aria-label="Notifications"
            className="fixed z-[89] right-4 top-24 w-[min(22rem,calc(100vw-2rem))] max-h-[70dvh] flex flex-col rounded-2xl overflow-hidden border bg-zinc-950/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            style={{
              borderColor: 'rgba(58,134,255,0.3)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Header: Merlin's art slot over gradient + particle rain */}
            <div className="relative h-20 flex-none overflow-hidden">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(23,48,110,0.9) 0%, rgba(10,10,18,0.95) 55%, rgba(4,40,44,0.9) 100%)',
                }}
              />
              <ParticleRain density={36} />
              {headerArt && (
                <img
                  src={HEADER_ART}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setHeaderArt(false)}
                />
              )}
              <div className="relative h-full flex items-center justify-between px-4">
                <h2 className="text-sm font-extrabold tracking-[0.25em] uppercase text-[#dce7ff]">
                  Notifications
                </h2>
                <button
                  type="button"
                  data-ui="notifications-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-zinc-300 hover:text-white border border-zinc-700/60 bg-black/40"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-4 py-3 flex flex-col gap-5" data-ui="notifications-list">
              {!signedIn && (
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Sign in to see friend requests, group invites, and system messages.
                </p>
              )}
              {signedIn && loading && items.length === 0 && (
                <p className="text-sm text-zinc-500">Loading…</p>
              )}
              {signedIn && !loading && items.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Nothing yet. Friend requests and group invites will land here.
                </p>
              )}
              {sections.map(({ type, rows }) => (
                <section key={type} aria-label={SECTION_LABELS[type]}>
                  <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9dbfff]/70 mb-2">
                    {SECTION_LABELS[type]}
                    {type !== 'achievement' && rows.length > 0 && (
                      <span className="ml-2 text-zinc-500">{rows.length}</span>
                    )}
                  </h3>
                  {type === 'achievement' ? (
                    <div className="rounded-xl border border-dashed border-[#3a86ff]/30 px-4 py-5 text-center">
                      <p className="text-sm text-[#dce7ff]/80 font-semibold">Achievements land here soon</p>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        Your victories across the launcher will be honored here.
                      </p>
                    </div>
                  ) : rows.length === 0 ? null : (
                    <ul className="flex flex-col gap-2">
                      {rows.map((n) => {
                        const actionable =
                          ACTIONABLE_TYPES.includes(n.type) && !n.meta?.handled;
                        return (
                          <li
                            key={n.id}
                            data-ui="notification-item"
                            data-type={n.type}
                            className={`rounded-xl border px-3.5 py-3 ${
                              n.read
                                ? 'border-zinc-800 bg-zinc-900/40'
                                : 'border-[#3a86ff]/30 bg-[#3a86ff]/[0.07]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-zinc-100 leading-snug">{n.title}</p>
                              <span className="text-[11px] text-zinc-500 flex-none mt-0.5">
                                {timeAgo(n.created_at)}
                              </span>
                            </div>
                            {n.body && (
                              <p className="text-[13px] text-zinc-400 leading-relaxed mt-1">{n.body}</p>
                            )}
                            {(n.meta?.kind === 'friend-request' || n.meta?.kind === 'friend-accepted') && n.actor_username ? (
                              <div className="mt-2">
                                <a
                                  href={`/u/${encodeURIComponent(n.actor_username)}${n.actor_profile_type === 'business' ? '?v=business' : ''}`}
                                  data-ui="notif-view-profile"
                                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[#3a86ff]/40 px-5 text-xs font-bold uppercase tracking-widest text-[#9dbfff] transition-all hover:border-[#3a86ff]/80 hover:text-[#dce7ff]"
                                >
                                  View profile
                                </a>
                              </div>
                            ) : null}
                            {n.type === 'system' && n.meta?.kind === 'order67-invite' && n.meta?.room_code && !n.meta?.handled ? (
                              <a
                                href={`/order-67?code=${n.meta.room_code}`}
                                data-ui="notif-join-call"
                                className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-cyan-400/90 px-5 text-xs font-bold uppercase tracking-widest text-cyan-950 transition-all hover:bg-cyan-300"
                              >
                                Join call
                              </a>
                            ) : null}
                            {actionable ? (
                              <ActionButtons id={n.id} busy={busyId === n.id} onRespond={onRespond} />
                            ) : n.meta?.handled ? (
                              <p className="text-[11px] text-zinc-500 mt-2 uppercase tracking-widest">
                                {n.meta.decision === 'accept' ? 'Accepted' : 'Declined'}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
