'use client';
// app/agora/page.jsx — AGORA feed: the community town square.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Starfield from '@/components/agora/Starfield';
import CategoryTabs from '@/components/agora/CategoryTabs';
import PostCard from '@/components/agora/PostCard';
import { PAGE_SIZE, pageOffset } from '@/lib/agora/format';

export default function AgoraFeed() {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (cat, pg, append) => {
    setLoading(true);
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
    setLoading(false);
  }, []);

  useEffect(() => {
    setPage(1);
    load(category, 1, false);
  }, [category, load]);

  const showMore = () => {
    const next = page + 1;
    setPage(next);
    load(category, next, true);
  };

  return (
    <main className="relative min-h-screen bg-black text-white">
      <Starfield />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">Agora</p>
          <h1 className="mt-1 text-3xl font-black">The Town Square</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Conversations from across the multiverse. Read everything — sign in to join in.
          </p>
        </header>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CategoryTabs active={category} onChange={setCategory} />
          </div>
          {user ? (
            <Link
              href="/agora/new"
              className="min-h-[44px] shrink-0 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-300"
            >
              New post
            </Link>
          ) : (
            <Link
              href="/agora/new"
              className="min-h-[44px] shrink-0 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/15"
            >
              Sign in to post
            </Link>
          )}
        </div>

        {posts.length === 0 && !loading ? (
          <div className="rounded-xl border border-white/10 bg-black/50 p-10 text-center">
            <p className="text-zinc-400">Nothing here yet. Be the first to start a conversation.</p>
            {user && (
              <Link href="/agora/new" className="mt-4 inline-block text-amber-300 underline">
                Write the first post
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}

        {loading && <p className="mt-6 text-center text-sm text-zinc-500">Loading…</p>}

        {hasMore && !loading && (
          <div className="mt-6 text-center">
            <button
              onClick={showMore}
              className="min-h-[44px] rounded-full bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white/15"
            >
              Show more
            </button>
          </div>
        )}

        <footer className="mt-12 border-t border-white/10 pt-4 text-xs text-zinc-600">
          <Link href="/" className="underline hover:text-zinc-400">Back to the launcher</Link>
        </footer>
      </div>
    </main>
  );
}
