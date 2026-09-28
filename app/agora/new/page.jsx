'use client';
// app/agora/new/page.jsx — write a new post. Sign-in required.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import Starfield from '@/components/agora/Starfield';
import { CATEGORIES } from '@/lib/agora/categories';
import { validatePost, sanitizeText, LIMITS } from '@/lib/agora/validation';

export default function NewPost() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let auth;
    try {
      auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
    } catch {
      setCloudOffline(true);
      setChecking(false);
      return;
    }
    auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setChecking(false);
    });
    const { data: sub } = auth.onAuthStateChange((_e, s) => {
      setUser(s?.user || null);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const err = validatePost({ title, body, category });
    if (err) { setError(err); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('agora_posts')
      .insert({
        user_id: user.id,
        title: sanitizeText(title, LIMITS.titleMax),
        body: sanitizeText(body, LIMITS.bodyMax),
        category,
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) { setError('Could not publish your post. Try again.'); return; }
    router.push(`/agora/post/${data.id}`);
  };

  if (cloudOffline) {
    return (
      <main className="relative min-h-screen bg-black text-white">
        <Starfield />
        <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-16 text-center">
          <h1 className="mb-2 text-2xl font-black">New post</h1>
          <p className="mb-6 text-sm text-zinc-400">
            Cloud features are offline — this page needs the database connection.
            Sign-in and publishing are unavailable until it&apos;s back.
          </p>
          <Link href="/agora" className="text-sm text-zinc-500 underline">
            Back to the feed
          </Link>
          <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
        </div>
      </main>
    );
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-black p-10 text-center text-zinc-500">Loading…</main>
    );
  }

  if (!user) {
    return (
      <main className="relative min-h-screen bg-black text-white">
        <Starfield />
        <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-16">
          <h1 className="mb-2 text-2xl font-black">Sign in to post</h1>
          <p className="mb-6 text-sm text-zinc-400">
            You need an account to write in the Agora. Reading is free for everyone.
          </p>
          <Auth onLogin={() => {}} />
          <Link href="/agora" className="mt-6 inline-block text-sm text-zinc-500 underline">
            Back to the feed
          </Link>
          <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      <Starfield />
      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-10">
        <h1 className="mb-6 text-2xl font-black">New post</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="post-title" className="mb-1 block text-sm font-medium text-zinc-300">
              Title
            </label>
            <input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={LIMITS.titleMax}
              placeholder="Give it a clear title"
              className="min-h-[44px] w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="post-category" className="mb-1 block text-sm font-medium text-zinc-300">
              Category
            </label>
            <select
              id="post-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white focus:border-amber-400/50 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="post-body" className="mb-1 block text-sm font-medium text-zinc-300">
              What do you want to say?
            </label>
            <textarea
              id="post-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={LIMITS.bodyMax}
              placeholder="Write your post…"
              className="w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-zinc-600">{body.trim().length}/{LIMITS.bodyMax}</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-full bg-amber-400 px-6 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? 'Publishing…' : 'Publish'}
            </button>
            <Link
              href="/agora"
              className="inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white/15"
            >
              Cancel
            </Link>
          </div>
        </form>
        <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
