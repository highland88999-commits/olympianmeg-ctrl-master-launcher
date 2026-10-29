'use client';

// Concourse notifications (Merlin, 2026-10-29).
//
// The keeper's announcements live here: a bell in the Concourse
// header opens the notifications menu, and the menu's separate
// portal button — Announcements — hosts every past broadcast for
// replay. The bell carries a dot while there is an announcement
// the user hasn't opened yet (the site-wide broadcast listener
// announces each latest id on a 'broadcast-latest' window event).
import { useEffect, useRef, useState } from 'react';

const LS_LAST_ID = 'broadcast-last-id';
const LS_LAST_OPENED = 'broadcast-last-opened';

export function useAnnouncementUnread() {
  const [hasUnread, setHasUnread] = useState(false);
  useEffect(() => {
    const check = (id) => {
      try {
        const opened = localStorage.getItem(LS_LAST_OPENED);
        setHasUnread(!!id && id !== opened);
      } catch {}
    };
    try { check(localStorage.getItem(LS_LAST_ID)); } catch {}
    const onLatest = (e) => check(e && e.detail && e.detail.id);
    window.addEventListener('broadcast-latest', onLatest);
    return () => window.removeEventListener('broadcast-latest', onLatest);
  }, []);
  const markSeen = () => {
    try { localStorage.setItem(LS_LAST_OPENED, localStorage.getItem(LS_LAST_ID) || ''); } catch {}
    setHasUnread(false);
  };
  return [hasUnread, markSeen];
}

export function AnnouncementsBell({ hasUnread, onOpen }) {
  return (
    <button
      type="button"
      aria-label="Notifications"
      onClick={onOpen}
      className="ui-element pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-all hover:border-cyan-300/60 hover:text-white"
    >
      <span aria-hidden="true" className="text-sm leading-none">🔔</span>
      {hasUnread && (
        <span aria-hidden="true" className="absolute right-1 top-1 block h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
      )}
    </button>
  );
}

function fmtTime(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}
function fmtDur(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  return s > 0 ? `${s}s` : '';
}

export function AnnouncementsMenu({ open, onClose, onSeen }) {
  const [view, setView] = useState('menu'); // menu | list
  const [items, setItems] = useState(null); // null = not loaded, 'signed-out', or array
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (open) setView('menu');
    return () => { stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  function stopAudio() {
    try { if (audioRef.current) audioRef.current.pause(); } catch {}
    audioRef.current = null;
    setPlayingId(null);
  }

  async function openList() {
    setView('list');
    onSeen();
    if (items) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session && session.access_token;
      const res = await fetch('/api/broadcasts/history', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      if (res.status === 401) { setItems('signed-out'); return; }
      const json = await res.json().catch(() => null);
      setItems(json && json.ok && Array.isArray(json.items) ? json.items : []);
    } catch { setItems([]); }
  }

  function togglePlay(item) {
    if (playingId === item.id) { stopAudio(); return; }
    stopAudio();
    try {
      const el = new Audio(item.audio_url);
      audioRef.current = el;
      setPlayingId(item.id);
      el.onended = () => { setPlayingId(null); audioRef.current = null; };
      el.onerror = () => { setPlayingId(null); audioRef.current = null; };
      el.play().catch(() => { setPlayingId(null); audioRef.current = null; });
    } catch { setPlayingId(null); }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-cyan-200/25 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'menu' ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Notifications</p>
              <button type="button" aria-label="Close notifications" onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white">
                <span aria-hidden="true" className="text-xs">✕</span>
              </button>
            </div>
            {/* The separate portal button that hosts the announcements. */}
            <button
              type="button"
              onClick={openList}
              className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] p-4 text-left transition-all hover:border-cyan-300/50 hover:bg-cyan-400/10 active:scale-[0.98]"
            >
              <span aria-hidden="true" className="text-2xl">📢</span>
              <span>
                <span className="block text-sm font-black uppercase tracking-wider text-zinc-100">Announcements</span>
                <span className="block text-xs text-zinc-400">Past broadcasts from the keeper — tap to listen</span>
              </span>
              <span aria-hidden="true" className="ml-auto text-zinc-500">›</span>
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <button type="button" aria-label="Back to notifications" onClick={() => { stopAudio(); setView('menu'); }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white">
                <span aria-hidden="true" className="text-xs">‹</span>
              </button>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Announcements</p>
              <button type="button" aria-label="Close notifications" onClick={onClose}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white">
                <span aria-hidden="true" className="text-xs">✕</span>
              </button>
            </div>
            {items === null && <p className="py-6 text-center text-sm text-zinc-400">Loading announcements…</p>}
            {items === 'signed-out' && (
              <p className="py-6 text-center text-sm text-zinc-400">Sign in to hear past announcements.</p>
            )}
            {Array.isArray(items) && items.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-400">No announcements yet — the keeper hasn't sent one.</p>
            )}
            {Array.isArray(items) && items.length > 0 && (
              <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <button
                      type="button"
                      onClick={() => togglePlay(item)}
                      aria-label={playingId === item.id ? 'Pause announcement' : 'Play announcement'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-400 text-base text-black transition hover:bg-sky-300"
                    >
                      <span aria-hidden="true">{playingId === item.id ? '❚❚' : '▶'}</span>
                    </button>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-zinc-100">
                        {playingId === item.id ? 'Playing…' : 'Announcement'} · {(item.preset || 'original')}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {fmtTime(item.created_at)}{fmtDur(item.duration_ms) ? ` · ${fmtDur(item.duration_ms)}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
