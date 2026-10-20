'use client';
// app/agora/people/page.jsx — the town square's people directory.
// Every traveler with an Agora profile, each card opening their
// public profile. Profiles live in agora_profiles; post counts are
// tallied from agora_posts.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Starfield from '@/components/agora/Starfield';
import { aphroPanel } from '@/components/aphrodite/ambience';
import { displayNameOf } from '@/lib/agora/format';

export default function PeoplePage() {
  const [people, setPeople] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let auth;
      try {
        auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
      } catch {
        if (!cancelled) { setCloudOffline(true); setLoading(false); }
        return;
      }
      const { data: { session } } = await auth.getSession();
      if (!cancelled) setUser(session?.user || null);

      const { data: profiles } = await supabase
        .from('agora_profiles')
        .select('user_id, display_name, bio, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      const { data: posts } = await supabase
        .from('agora_posts')
        .select('user_id');
      if (cancelled) return;
      const counts = {};
      for (const p of posts || []) counts[p.user_id] = (counts[p.user_id] || 0) + 1;
      setPeople((profiles || []).map((p) => ({ ...p, postCount: counts[p.user_id] || 0 })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="relative min-h-dvh bg-[#070d1d] text-white">
      <Starfield />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10">
        <Link href="/agora" className="text-sm text-zinc-500 underline hover:text-zinc-300">
          ← Back to the feed
        </Link>

        <header className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Agora</p>
          <h1 className="mt-1 text-3xl font-black">People of the Town Square</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Every traveler with a profile. Tap a name to visit theirs.
          </p>
        </header>

        {user && (
          <Link
            href={`/agora/profile/${user.id}`}
            className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-rose-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-rose-300"
          >
            My profile
          </Link>
        )}

        <div className="mt-6 space-y-4">
          {loading ? (
            <p className="pt-4 text-center text-xs uppercase tracking-[0.3em] text-rose-300/60">
              Gathering travelers…
            </p>
          ) : cloudOffline ? (
            <div className="rounded-xl border border-white/10 bg-black/50 p-10 text-center">
              <p className="text-zinc-400">Cloud features are offline — this page needs the database connection.</p>
            </div>
          ) : people.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/50 p-10 text-center">
              <p className="text-zinc-400">No travelers have set up a profile yet.</p>
              {user ? (
                <Link href={`/agora/profile/${user.id}`} className="mt-3 inline-block text-rose-300 underline">
                  Be the first — set up yours
                </Link>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">Sign in and post in the square to create yours.</p>
              )}
            </div>
          ) : (
            people.map((p) => (
              <Link
                key={p.user_id}
                href={`/agora/profile/${p.user_id}`}
                className="block rounded-xl border border-rose-500/20 p-5 transition-all hover:border-rose-400/50 hover:shadow-[0_0_28px_rgba(244,114,182,0.12)]"
                style={aphroPanel({ backgroundColor: 'rgba(18,6,14,0.62)' })}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="truncate text-lg font-semibold text-white">{displayNameOf(p, 'Unnamed traveler')}</h2>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {p.postCount} {p.postCount === 1 ? 'post' : 'posts'}
                  </span>
                </div>
                {p.bio ? (
                  <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">{p.bio}</p>
                ) : (
                  <p className="mt-1.5 text-sm text-zinc-600">No bio yet.</p>
                )}
              </Link>
            ))
          )}
        </div>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
