'use client';
// app/agora/profile/[id]/page.jsx — public profile. Owners can edit their own.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Starfield from '@/components/agora/Starfield';
import PostCard from '@/components/agora/PostCard';
import { validateProfile, sanitizeText, LIMITS } from '@/lib/agora/validation';
import { displayNameOf } from '@/lib/agora/format';

export default function ProfilePage() {
  const params = useParams();
  const id = params?.id;
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
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
      const { data: prof } = await supabase
        .from('agora_profiles')
        .select('*')
        .eq('user_id', id)
        .single();
      if (!cancelled) {
        setProfile(prof || null);
        setName(prof?.display_name || '');
        setBio(prof?.bio || '');
      }
      const { data: list } = await supabase
        .from('agora_posts')
        .select('id, title, body, category, like_count, comment_count, created_at, user_id')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) {
        setPosts((list || []).map((p) => ({ ...p, agora_profiles: prof || null })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const isOwner = user && user.id === id;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const err = validateProfile({ displayName: name, bio });
    if (err) { setError(err); return; }
    setSaving(true);
    const clean = {
      user_id: id,
      display_name: sanitizeText(name, LIMITS.nameMax),
      bio: sanitizeText(bio, LIMITS.bioMax),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('agora_profiles').upsert(clean);
    setSaving(false);
    if (error) { setError('Could not save your profile. Try again.'); return; }
    setProfile((p) => ({ ...(p || {}), ...clean }));
    setEditing(false);
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

  return (
    <main className="relative min-h-screen bg-black text-white">
      <Starfield />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10">
        <Link href="/agora" className="text-sm text-zinc-500 underline hover:text-zinc-300">
          ← Back to the feed
        </Link>

        <section className="mt-4 rounded-xl border border-white/10 bg-black/50 p-6">
          {!editing ? (
            <>
              <h1 className="text-2xl font-black">{displayNameOf(profile, 'Unnamed traveler')}</h1>
              {profile?.bio ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{profile.bio}</p>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">No bio yet.</p>
              )}
              {isOwner && (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-4 min-h-[44px] rounded-full bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Edit profile
                </button>
              )}
            </>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <h1 className="text-2xl font-black">Edit profile</h1>
              <div>
                <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-zinc-300">
                  Display name
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={LIMITS.nameMax}
                  placeholder="What should people call you?"
                  className="min-h-[44px] w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="profile-bio" className="mb-1 block text-sm font-medium text-zinc-300">
                  Bio
                </label>
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  maxLength={LIMITS.bioMax}
                  placeholder="A line or two about you."
                  className="w-full rounded-lg border border-white/10 bg-black/60 p-3 text-white placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] rounded-full bg-amber-400 px-6 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="min-h-[44px] rounded-full bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <h2 className="mb-4 mt-8 text-lg font-semibold">
          Posts by {displayNameOf(profile, 'this traveler')} ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">No posts yet.</p>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
