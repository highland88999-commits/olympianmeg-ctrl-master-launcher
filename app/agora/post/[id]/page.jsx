'use client';
// app/agora/post/[id]/page.jsx — post detail with comments and likes.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Starfield from '@/components/agora/Starfield';
import CommentSection from '@/components/agora/CommentSection';
import { categoryName } from '@/lib/agora/categories';
import { timeAgo, displayNameOf } from '@/lib/agora/format';

export default function PostDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [post, setPost] = useState(null);
  const [author, setAuthor] = useState(null);
  const [user, setUser] = useState(null);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    if (!id) return;
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
      const { data: p, error } = await supabase
        .from('agora_posts')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !p) { if (!cancelled) { setNotFound(true); setLoading(false); } return; }
      if (!cancelled) setPost(p);
      const { data: prof } = await supabase
        .from('agora_profiles')
        .select('display_name, bio')
        .eq('user_id', p.user_id)
        .single();
      if (!cancelled) setAuthor(prof || null);
      if (session?.user && !cancelled) {
        const { data: like } = await supabase
          .from('agora_likes')
          .select('post_id')
          .eq('post_id', id)
          .eq('user_id', session.user.id)
          .single();
        setLiked(!!like);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const deletePost = async () => {
    if (!user || user.id !== post.user_id) return;
    if (!window.confirm('Delete this post and all its comments?')) return;
    const { error } = await supabase.from('agora_posts').delete().eq('id', id);
    if (!error) router.push('/agora');
  };

  if (loading) {
    return <main className="min-h-screen bg-black p-10 text-center text-zinc-500">Loading…</main>;
  }

  if (cloudOffline) {
    return (
      <main className="min-h-screen bg-black p-10 text-center text-white">
        <p className="text-zinc-400">Cloud features are offline — this page needs the database connection.</p>
        <Link href="/agora" className="mt-4 inline-block text-amber-300 underline">Back to the feed</Link>
      </main>
    );
  }

  if (notFound || !post) {
    return (
      <main className="min-h-screen bg-black p-10 text-center text-white">
        <p className="text-zinc-400">That post doesn&apos;t exist or was deleted.</p>
        <Link href="/agora" className="mt-4 inline-block text-amber-300 underline">Back to the feed</Link>
      </main>
    );
  }

  const isOwner = user && user.id === post.user_id;

  return (
    <main className="relative min-h-screen bg-black text-white">
      <Starfield />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10">
        <Link href="/agora" className="text-sm text-zinc-500 underline hover:text-zinc-300">
          ← Back to the feed
        </Link>

        <article className="mt-4 rounded-xl border border-white/10 bg-black/50 p-6">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-amber-400/15 px-2.5 py-1 font-medium text-amber-300">
              {categoryName(post.category)}
            </span>
            <span className="text-zinc-500">{timeAgo(post.created_at)}</span>
          </div>
          <h1 className="mb-3 text-2xl font-black">{post.title}</h1>
          <p className="mb-4 text-sm text-zinc-500">
            by{' '}
            <Link href={`/agora/profile/${post.user_id}`} className="text-amber-300 underline">
              {displayNameOf(author)}
            </Link>
          </p>
          <p className="whitespace-pre-wrap text-zinc-200">{post.body}</p>
          {isOwner && (
            <button
              onClick={deletePost}
              className="mt-6 min-h-[44px] rounded-full bg-white/5 px-4 text-sm text-zinc-400 underline hover:text-red-400"
            >
              Delete this post
            </button>
          )}
        </article>

        <CommentSection postId={id} initialLikeCount={post.like_count} initialLiked={liked} />

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
