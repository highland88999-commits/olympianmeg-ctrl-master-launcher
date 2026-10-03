'use client';
// components/agora/CommentSection.jsx
// Comments list + add-comment form + like toggle for a post.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { validateComment, sanitizeText, LIMITS } from '@/lib/agora/validation';
import { timeAgo, displayNameOf } from '@/lib/agora/format';

export default function CommentSection({ postId, initialLikeCount, initialLiked }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [user, setUser] = useState(null);
  const [liked, setLiked] = useState(!!initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount || 0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setUser(session?.user || null);
        const { data } = await supabase
          .from('agora_comments')
          .select('id, body, created_at, user_id')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });
        const list = data || [];
        // Batch-load display names for the comment authors.
        const ids = [...new Set(list.map((c) => c.user_id))];
        let nameMap = {};
        if (ids.length) {
          const { data: profiles } = await supabase
            .from('agora_profiles')
            .select('user_id, display_name')
            .in('user_id', ids);
          for (const p of profiles || []) nameMap[p.user_id] = p;
        }
        if (!cancelled) {
          setComments(list.map((c) => ({ ...c, agora_profiles: nameMap[c.user_id] || null })));
          setLoading(false);
        }
      } catch (e) {
        // Cloud unreachable or unconfigured: show an honest message instead of a crash.
        if (!cancelled) {
          setLoading(false);
          setError('Comments are unavailable right now — the database connection is offline.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const addComment = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) { setError('Sign in to join the conversation.'); return; }
    const err = validateComment({ body });
    if (err) { setError(err); return; }
    const clean = sanitizeText(body, LIMITS.commentMax);
    const { data, error } = await supabase
      .from('agora_comments')
      .insert({ post_id: postId, user_id: user.id, body: clean })
      .select('id, body, created_at, user_id')
      .single();
    if (error) { setError('Could not post your comment. Try again.'); return; }
    setComments((c) => [...c, data]);
    setBody('');
  };

  const deleteComment = async (id, ownerId) => {
    if (!user || user.id !== ownerId) return;
    if (!window.confirm('Delete this comment?')) return;
    const { error } = await supabase.from('agora_comments').delete().eq('id', id);
    if (!error) setComments((c) => c.filter((x) => x.id !== id));
  };

  const toggleLike = async () => {
    if (!user) { setError('Sign in to like posts.'); return; }
    setError('');
    if (liked) {
      const { error } = await supabase
        .from('agora_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
      if (!error) { setLiked(false); setLikeCount((n) => Math.max(0, n - 1)); }
    } else {
      const { error } = await supabase
        .from('agora_likes')
        .insert({ post_id: postId, user_id: user.id });
      if (!error) { setLiked(true); setLikeCount((n) => n + 1); }
    }
  };

  return (
    <div className="mt-8">
      <button
        onClick={toggleLike}
        aria-pressed={liked}
        className={`min-h-[44px] rounded-full px-5 text-sm font-semibold transition-colors ${
          liked ? 'bg-[#3a86ff] text-white' : 'bg-white/5 text-zinc-200 hover:bg-white/10'
        }`}
      >
        {liked ? '♥ Liked' : '♡ Like'} · {likeCount}
      </button>

      <h2 className="mt-8 mb-4 text-lg font-semibold text-white">
        Comments ({comments.length})
      </h2>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-500">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-white/10 bg-[#0a1230]/50 p-4">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>{displayNameOf(c.agora_profiles)} · {timeAgo(c.created_at)}</span>
                {user && user.id === c.user_id && (
                  <button
                    onClick={() => deleteComment(c.id, c.user_id)}
                    className="min-h-[44px] px-2 text-zinc-500 underline hover:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-zinc-200">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addComment} className="mt-4">
        <label htmlFor="agora-comment" className="mb-2 block text-sm font-medium text-zinc-300">
          Add a comment
        </label>
        <textarea
          id="agora-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={LIMITS.commentMax}
          placeholder={user ? 'Share your thoughts…' : 'Sign in to join the conversation.'}
          className="w-full rounded-lg border border-white/10 bg-[#0a1230]/70 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#3a86ff]/60 focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="mt-2 min-h-[44px] rounded-full bg-[#3a86ff] px-5 text-sm font-semibold text-white hover:bg-[#2f6fe0]"
        >
          Post comment
        </button>
      </form>
    </div>
  );
}
