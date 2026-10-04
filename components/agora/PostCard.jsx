'use client';
// components/agora/PostCard.jsx

import Link from 'next/link';
import { categoryName } from '@/lib/agora/categories';
import { timeAgo, displayNameOf } from '@/lib/agora/format';
import { aphroPanel } from '@/components/aphrodite/ambience';

export default function PostCard({ post }) {
  const profile = Array.isArray(post.agora_profiles) ? post.agora_profiles[0] : post.agora_profiles;
  return (
    <Link
      href={`/agora/post/${post.id}`}
      className="block rounded-xl border border-rose-500/20 p-5 transition-all hover:border-rose-400/50 hover:shadow-[0_0_28px_rgba(244,114,182,0.12)]"
      style={aphroPanel({ backgroundColor: 'rgba(18,6,14,0.62)' })}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-rose-400/15 px-2.5 py-1 font-medium text-rose-300">
          {categoryName(post.category)}
        </span>
        <span className="text-zinc-500">{timeAgo(post.created_at)}</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{post.title}</h3>
      <p className="mb-3 line-clamp-3 text-sm text-zinc-400">{post.body}</p>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>by {displayNameOf(profile)}</span>
        <span className="flex gap-3">
          <span aria-label={`${post.like_count || 0} likes`}>♥ {post.like_count || 0}</span>
          <span aria-label={`${post.comment_count || 0} comments`}>💬 {post.comment_count || 0}</span>
        </span>
      </div>
    </Link>
  );
}
