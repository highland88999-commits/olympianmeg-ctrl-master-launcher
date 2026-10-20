'use client';
// app/agora/page.jsx — AGORA feed: the community town square.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Starfield from '@/components/agora/Starfield';
import CategoryTabs from '@/components/agora/CategoryTabs';
import PostCard from '@/components/agora/PostCard';
import AphroIcon from '@/components/aphrodite/icons';
import { AphroVideoBg, aphroPanel } from '@/components/aphrodite/ambience';
import { PAGE_SIZE, pageOffset } from '@/lib/agora/format';

// APHRODITE treatment: ambient video town-square backdrop (Video→Still→Off,
// persisted), art-framed header, icon buttons, skeleton loading state.
function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading posts" role="status">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-rose-500/15 p-5"
          style={aphroPanel({ backgroundColor: 'rgba(20,6,14,0.55)' })}
        >
          <div className="mb-3 h-3 w-24 rounded-full bg-rose-400/20" />
          <div className="mb-2 h-5 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-full rounded bg-white/5" />
          <div className="mt-2 h-3 w-5/6 rounded bg-white/5" />
        </div>
      ))}
      <p className="pt-2 text-center text-xs uppercase tracking-[0.3em] text-rose-300/60">
        Gathering voices…
      </p>
    </div>
  );
}

export default function AgoraFeed() {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    let auth;
    try {
      auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
    } catch {
      setCloudOffline(true);
      setLoading(false);
      return;
    }
    auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
    const { data: sub } = auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (cat, pg, append) => {
    setLoading(true);
    try {
      let query = supabase
        .from('agora_posts')
        .select('id, title, body, category, like_count, comment_count, created_at, user_id')
        .order('created_at', { ascending: false })
        .range(pageOffset(pg), pageOffset(pg) + PAGE_SIZE);
      if (cat !== 'all') query = query.eq('category', cat);
      const { data } = await query;
      const raw = data || [];
      const list = raw.slice(0, PAGE_SIZE);
      // Batch-load author display names.
      const ids = [...new Set(list.map((p) => p.user_id))];
      let nameMap = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('agora_profiles')
          .select('user_id, display_name')
          .in('user_id', ids);
        for (const p of profiles || []) nameMap[p.user_id] = p;
      }
      const enriched = list.map((p) => ({ ...p, agora_profiles: nameMap[p.user_id] || null }));
      setPosts((prev) => (append ? [...prev, ...enriched] : enriched));
      setHasMore(raw.length > PAGE_SIZE);
    } catch {
      // Database unreachable (missing env vars or network down): degrade honestly.
      setCloudOffline(true);
      setPosts((prev) => (append ? prev : []));
      setHasMore(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (cloudOffline) { setLoading(false); return; }
    setPage(1);
    load(category, 1, false);
  }, [category, load, cloudOffline]);

  const showMore = () => {
    const next = page + 1;
    setPage(next);
    load(category, next, true);
  };

  return (
    <main className="relative min-h-dvh bg-black text-white">
      <AphroVideoBg
        video="/images/aphrodite/agora-loop.mp4"
        still="/images/aphrodite/agora-still.jpg"
        storageKey="agora-bg"
        opacity={0.4}
      />
      <Starfield />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10">
        {/* Header art: town-square banner in a rose-gold frame */}
        <header className="mb-6 overflow-hidden rounded-2xl border border-rose-400/25 shadow-[0_0_40px_rgba(244,114,182,0.12)]">
          <div className="relative">
            <img
              src="/images/aphrodite/agora-bg.webp"
              alt=""
              aria-hidden="true"
              className="h-36 w-full object-cover sm:h-44"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Agora</p>
              <h1 className="mt-1 text-3xl font-black text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                The Town Square
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                Conversations from across the multiverse. Read everything — sign in to join in.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CategoryTabs active={category} onChange={setCategory} />
          </div>
          {user ? (
            <Link
              href="/agora/new"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-rose-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-rose-300"
            >
              <AphroIcon name="plus" size={16} /> New post
            </Link>
          ) : (
            <Link
              href="/agora/new"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/15"
            >
              <AphroIcon name="user" size={16} /> Sign in to post
            </Link>
          )}
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/agora/people"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/15"
          >
            <AphroIcon name="user" size={16} /> People
          </Link>
          {user && (
            <Link
              href={`/agora/profile/${user.id}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/15"
            >
              <AphroIcon name="user" size={16} /> My profile
            </Link>
          )}
        </div>

        {cloudOffline ? (
          <div className="rounded-xl border border-white/10 bg-black/50 p-10 text-center">
            <p className="text-zinc-400">Cloud features are offline — this page needs the database connection.</p>
            <p className="mt-2 text-sm text-zinc-600">The feed will load once the database is connected.</p>
          </div>
        ) : posts.length === 0 && !loading ? (
          <div className="rounded-xl border border-white/10 bg-black/50 p-10 text-center">
            <p className="text-zinc-400">Nothing here yet. Be the first to start a conversation.</p>
            {user && (
              <Link href="/agora/new" className="mt-4 inline-flex items-center gap-2 text-rose-300 underline hover:text-rose-200">
                <AphroIcon name="pen" size={15} /> Write the first post
              </Link>
            )}
          </div>
        ) : posts.length === 0 ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}

        {loading && posts.length > 0 && (
          <p className="mt-6 text-center text-xs uppercase tracking-[0.3em] text-rose-300/60">Gathering more…</p>
        )}

        {hasMore && !loading && (
          <div className="mt-6 text-center">
            <button
              onClick={showMore}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white/15"
            >
              <AphroIcon name="chevron-down" size={16} /> Show more
            </button>
          </div>
        )}

        <footer className="mt-12 border-t border-white/10 pt-4 text-xs text-zinc-600">
          <Link href="/" className="inline-flex items-center gap-2 underline hover:text-zinc-400">
            <AphroIcon name="arrow-left" size={14} /> Back to the launcher
          </Link>
        </footer>

        {/* Safari bottom-bar clearance: keeps last content above the browser bar */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
