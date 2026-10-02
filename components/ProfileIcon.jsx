// components/ProfileIcon.jsx — the signed-in user's persistent profile icon in
// the hub chrome. Shows the personal profile avatar (elegant initial glyph
// fallback). Tap → profile preview card: avatar, display name,
// personal/business badge, quick details, and a link into the full profile.
// Signed out → a sign-in prompt card.
//
// Graphic slot: /images/ui/icon-profile-frame.png (128px) is drawn over the
// icon as a frame when Merlin's graphic lands; a gold ring sits underneath
// so it looks finished before then.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const FRAME_ART = '/images/ui/icon-profile-frame.png';

function initialOf(name) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '✦';
}

export default function ProfileIcon() {
  const [profiles, setProfiles] = useState(null); // { personal, business } | null
  const [view, setView] = useState('personal');
  const [open, setOpen] = useState(false);
  const [frameArt, setFrameArt] = useState(true);
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    let headers = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers = { Authorization: `Bearer ${session.access_token}` };
      else return;
    } catch {
      return;
    }
    try {
      const res = await fetch('/api/profiles/me', { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.profiles) setProfiles(data.profiles);
    } catch {
      /* offline — keep signed-out look */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  const profile = profiles?.[view] || profiles?.personal || null;
  const displayName = profile?.display_name || profile?.username || 'Traveler';
  const avatarUrl = profile?.avatar_url || '';

  return (
    <div ref={rootRef} data-ui="profile-root" className="relative">
      <button
        type="button"
        data-ui="profile-icon"
        aria-label={profile ? `${displayName}'s profile` : 'Profile'}
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); }}
        className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full relative overflow-hidden flex items-center justify-center bg-zinc-950/85 backdrop-blur-md transition-transform hover:scale-105"
        style={{ boxShadow: '0 0 18px rgba(255,209,102,0.25)', border: '2px solid rgba(255,209,102,0.55)' }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-extrabold text-amber-200" aria-hidden="true">
            {initialOf(displayName)}
          </span>
        )}
        {frameArt && (
          <img
            src={FRAME_ART}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            onError={() => setFrameArt(false)}
          />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close profile preview"
            data-ui="profile-dismiss"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[88] cursor-default bg-transparent"
            style={{ touchAction: 'manipulation' }}
          />
          <div
            data-ui="profile-preview"
            role="dialog"
            aria-label="Profile preview"
            className="fixed z-[89] right-4 top-24 w-[min(20rem,calc(100vw-2rem))] rounded-2xl overflow-hidden border bg-zinc-950/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            style={{
              borderColor: 'rgba(255,209,102,0.25)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {!profile ? (
              <div className="px-5 py-6 text-center">
                <p className="text-base font-bold text-zinc-100">You're browsing as a guest</p>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                  Sign in to see your profile, your art, and your posts — right here at a glance.
                </p>
                <Link
                  href="/profile"
                  data-ui="profile-signin-link"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center min-h-[44px] px-6 mt-4 rounded-xl bg-amber-300 text-amber-950 text-sm font-extrabold tracking-widest uppercase"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <div className="px-5 pt-5">
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full overflow-hidden flex-none flex items-center justify-center bg-zinc-900"
                    style={{ border: '2px solid rgba(255,209,102,0.55)' }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-extrabold text-amber-200">
                        {initialOf(displayName)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold text-zinc-50 truncate">{displayName}</p>
                    <p className="text-xs text-zinc-500 truncate">@{profile.username}</p>
                    <span
                      data-ui="profile-type-badge"
                      className="inline-block mt-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-300 border border-cyan-400/40 rounded-full px-2.5 py-1"
                    >
                      {view === 'personal' ? 'Personal' : 'Business'}
                    </span>
                  </div>
                </div>

                {profile.bio && (
                  <p className="text-[13px] text-zinc-400 leading-relaxed mt-3 line-clamp-3">{profile.bio}</p>
                )}

                {/* Personal / business switcher */}
                {profiles?.personal && profiles?.business && (
                  <div
                    className="inline-flex rounded-full border border-amber-200/40 overflow-hidden mt-4"
                    role="group"
                    aria-label="Profile view"
                  >
                    {['personal', 'business'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        data-ui={`profile-view-${t}`}
                        onClick={() => setView(t)}
                        aria-pressed={view === t}
                        className={`px-5 min-h-[44px] text-xs font-bold tracking-widest uppercase transition-colors ${
                          view === t ? 'bg-amber-300 text-amber-950' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                <Link
                  href={`/u/${encodeURIComponent(profile.username)}${view === 'business' ? '?v=business' : ''}`}
                  data-ui="profile-open-full"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center min-h-[48px] mt-4 mb-5 rounded-xl border border-amber-200/40 text-amber-200 text-sm font-extrabold tracking-widest uppercase hover:bg-amber-200/10 transition-colors"
                >
                  View full profile →
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
