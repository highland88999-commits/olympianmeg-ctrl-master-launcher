'use client';

// ForgedAvatarPicker — "Forge your own avatar" for the Your rider panel.
//
// The Character Builder (/world-engine/characters) forges a character
// through the World Engine; the result is a creation row
// (world_engine_assets, category 'character') carrying
// generation_params — NOT an image. This picker lists the user's
// forged characters from the same creations read My Creations uses
// (GET /api/profiles/:id/creations?category=character), and each one
// is pickable as the rider picture. Thumbs render the live
// MiniViewport from the stored params — never a faked image, never
// a snapshot.
//
// Props:
//   value — the picked forged creation id, or null
//   onPick(id) — pick a forged character (the parent clears the photo
//     and default picture sources: one picture at a time)
//   onSelectedCreation(creation | null, meta) — reports the creation
//     behind `value` once it is known, so the panel preview can render
//     it; meta.state is 'signed-out' | 'loaded' | 'error'.
//
// Signed-out users get plain words, not a dead button: the forge
// needs a session to synthesize and save.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import MiniViewport from '@/components/world-engine/MiniViewport';
import { supabase } from '@/lib/supabase';
import { costFor, FREE_GENERATIONS_PER_MONTH } from '@/lib/world-engine/economy';

const FETCH_LIMIT = 24;

// Mounts the 3D thumb only once its row scrolls near the viewport, so
// a long forged list does not open dozens of WebGL contexts at once
// (same pattern as My Creations).
function InView({ children, className }) {
  const [ref, setRef] = useState(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
      });
    }, { rootMargin: '240px' });
    obs.observe(ref);
    return () => obs.disconnect();
  }, [ref]);
  return <div ref={setRef} className={className}>{visible ? children : null}</div>;
}

export default function ForgedAvatarPicker({ value, onPick, onSelectedCreation }) {
  const [authState, setAuthState] = useState('loading'); // loading | signed-out | signed-in
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session && session.user ? session.user.id : null;
      if (!uid) { setAuthState('signed-out'); return; }
      setAuthState('signed-in');
      const res = await fetch(
        '/api/profiles/' + encodeURIComponent(uid) +
        '/creations?category=character&limit=' + FETCH_LIMIT
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Could not load your forged characters.');
      }
      setCharacters(data.creations || []);
    } catch (err) {
      setError(err.message || 'Could not load your forged characters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Report the creation behind the current pick (or that it is gone)
  // once the list is known — the panel preview renders from this.
  // React bails out when the reported values are identical, so this
  // stays quiet after the first report per list.
  useEffect(() => {
    if (!onSelectedCreation) return;
    if (authState === 'loading' || loading) return;
    if (authState === 'signed-out') {
      onSelectedCreation(null, { state: 'signed-out' });
      return;
    }
    if (error) {
      onSelectedCreation(null, { state: 'error' });
      return;
    }
    if (!value) {
      onSelectedCreation(null, { state: 'loaded' });
      return;
    }
    onSelectedCreation(
      characters.find((c) => c.id === value) || null,
      { state: 'loaded' }
    );
  }, [authState, loading, error, characters, value, onSelectedCreation]);

  const cost = costFor('character');

  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-2">
        Forge your own avatar
      </div>
      <p className="text-xs text-neutral-400 mb-3">
        Dream up a character in the Character Builder and set it as your rider picture.
        Costs {cost} Aether — or one of your {FREE_GENERATIONS_PER_MONTH} free monthly generations.
      </p>
      {authState === 'signed-out' ? (
        <p className="text-xs text-neutral-400">
          Sign in to forge your own avatar — the forge needs a signed-in account.
        </p>
      ) : (
        <Link
          href="/world-engine/characters"
          className="min-h-[44px] inline-flex items-center px-4 rounded-lg border border-fuchsia-400/50 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-400/10"
        >
          Forge a character →
        </Link>
      )}
      {authState === 'signed-in' && (
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading your forged characters…</p>
          ) : error ? (
            <p className="text-sm text-red-300">
              Could not load your forged characters.{' '}
              <button type="button" onClick={load} className="underline">Try again</button>.
            </p>
          ) : characters.length === 0 ? (
            <p className="text-sm text-neutral-500">
              You have not forged a character yet — the Character Builder above is where they start.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {characters.map((c) => {
                const selected = value === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onPick && onPick(c.id)}
                    aria-pressed={selected}
                    aria-label={`Use your forged character ${c.display_name || 'Untitled character'} as your avatar`}
                    className={`flex w-full items-center gap-3 min-h-[56px] rounded-xl border-2 px-3 py-2 text-left transition-all ${
                      selected
                        ? 'border-cyan-400 ring-2 ring-cyan-400/40 bg-cyan-400/10'
                        : 'border-zinc-700 hover:border-zinc-400 bg-white/[0.03]'
                    }`}
                  >
                    <span className="relative block h-14 w-14 flex-none overflow-hidden rounded-full bg-[#07070c]">
                      <InView className="absolute inset-0 pointer-events-none">
                        <MiniViewport category="character" params={c.generation_params || {}} />
                      </InView>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-100">
                        {c.display_name || 'Untitled character'}
                      </span>
                      <span className="block text-[11px] uppercase tracking-widest text-zinc-500">
                        Your forged character
                      </span>
                    </span>
                    {selected && (
                      <span className="shrink-0 text-xs font-bold text-cyan-300">✓ Your rider</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
