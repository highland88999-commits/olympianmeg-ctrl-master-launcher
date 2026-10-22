// app/communiverse/world/[id]/page.jsx — ONE WORLD (Merlin, 2026-10-22).
//
// Clicking a world — in the Communiverse or in a profile — brings you
// right here. Orbit view first (the forged planet, live), then
// "Descend to street level" for the ground view of the same world.
//
// If you OWN the planet, this page is also its control room:
// - Direct with Muse: describe the world you want; the synthesis AI
//   re-forges the planet from your words (World Engine billing applies).
// - Publish / unpublish it in the Communiverse.
// - List it for sale (the Auction House flow lives in your profile) —
//   a sale transfers this planet, its Communiverse place and these
//   owner rights to the buyer, and it leaves your profile.
// Visitors to a published world get the views, never the controls.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import MiniViewport from '@/components/world-engine/MiniViewport';
import StreetLevel from '@/components/communiverse/StreetLevel';
import { supabase } from '@/lib/supabase';

async function authHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session && session.access_token ? { Authorization: 'Bearer ' + session.access_token } : {};
  } catch {
    return {};
  }
}

async function apiCall(path, { method = 'GET', body } = {}) {
  const auth = await authHeader();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

export default function WorldPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [world, setWorld] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [state, setState] = useState('loading'); // loading | ok | error
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('orbit'); // orbit | street
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiCall('/api/communiverse/world/' + encodeURIComponent(id));
      setWorld(data.world);
      setIsOwner(!!data.is_owner);
      setState('ok');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (world) document.title = world.display_name + ' · Communiverse'; }, [world]);

  const togglePublish = async () => {
    if (!world || busy) return;
    setBusy(true); setNotice(null);
    try {
      const data = await apiCall('/api/communiverse/publish', {
        method: 'POST',
        body: { asset_id: id, publish: !world.in_communiverse },
      });
      setWorld((w) => ({ ...w, in_communiverse: data.in_communiverse }));
      setNotice(data.in_communiverse ? 'Your world is live in the Communiverse.' : 'Your world is out of the Communiverse. Only you can enter it now.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const directWithMuse = async (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true); setNotice(null);
    try {
      const data = await apiCall('/api/communiverse/direct', {
        method: 'POST',
        body: { asset_id: id, prompt: text },
      });
      setWorld((w) => ({ ...w, generation_params: data.parameters, prompt: text }));
      setPrompt('');
      setNotice('Muse has re-forged your world. This is the new planet — here, in your profile, and in the Communiverse.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#050508] text-neutral-200 flex flex-col">
      <div className="sticky top-0 z-20 bg-[#050508]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/communiverse" className="min-h-[44px] inline-flex items-center px-3 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10">
            ← Communiverse
          </Link>
          <div className="text-right min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80">
              {world ? (world.in_communiverse ? 'In the Communiverse' : 'Not published') : 'World'}
            </div>
            <h1 className="text-lg font-bold tracking-widest truncate">{world ? world.display_name : '…'}</h1>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-10 flex flex-col gap-4">
        {state === 'loading' && <p className="text-sm text-neutral-500">Approaching the world…</p>}
        {state === 'error' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-red-300">{error || 'This world could not be reached.'}</p>
            <p className="text-sm text-neutral-400 mt-2">
              If it is your world, sign in and open it from{' '}
              <Link href="/profile" className="text-cyan-300 hover:underline">your profile</Link>.
            </p>
          </div>
        )}

        {state === 'ok' && world && (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="View">
              <button
                type="button" role="tab" aria-selected={mode === 'orbit'}
                onClick={() => setMode('orbit')}
                className={'min-h-[44px] px-4 rounded-lg border text-sm ' + (mode === 'orbit' ? 'border-cyan-300/70 bg-cyan-300/10 text-white' : 'border-white/15 text-neutral-300 hover:bg-white/10')}
              >
                🪐 Orbit
              </button>
              <button
                type="button" role="tab" aria-selected={mode === 'street'}
                onClick={() => setMode('street')}
                className={'min-h-[44px] px-4 rounded-lg border text-sm ' + (mode === 'street' ? 'border-cyan-300/70 bg-cyan-300/10 text-white' : 'border-white/15 text-neutral-300 hover:bg-white/10')}
              >
                🚶 Street level
              </button>
              {isOwner && <span className="ml-auto self-center text-[11px] tracking-[0.2em] uppercase text-amber-300/90">You own this world</span>}
            </div>

            <div className="relative w-full h-[62vh] rounded-2xl border border-white/10 bg-[#07070c] overflow-hidden">
              {mode === 'orbit' ? (
                <MiniViewport category="world" params={world.generation_params || {}} />
              ) : (
                <StreetLevel params={world.generation_params || {}} />
              )}
            </div>

            {world.prompt && (
              <p className="text-xs text-neutral-500">
                Forged from: <span className="text-neutral-400">“{world.prompt}”</span>
              </p>
            )}

            {isOwner ? (
              <section aria-label="Owner controls" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-5">
                <div>
                  <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">Direct it with Muse</h2>
                  <p className="text-xs text-neutral-500 mb-3">
                    Describe the planet you want — terrain, colors, mood — and Muse re-forges
                    this world from your words. (World Engine generations: your free monthly
                    ones first, then Aether.)
                  </p>
                  <form onSubmit={directWithMuse} className="flex flex-col gap-2">
                    <label htmlFor="muse-direct" className="sr-only">Describe the change</label>
                    <textarea
                      id="muse-direct"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="e.g. A violet alien world, jagged crystal mountains, teal glowing basins, stormy sky…"
                      className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-300/70"
                    />
                    <button
                      type="submit"
                      disabled={busy || !prompt.trim()}
                      className="min-h-[44px] self-start px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold hover:bg-cyan-200 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {/* The Concourse Muse tile's own icon (components/Concourse.jsx TILES: muse). */}
                      <img src="/concourse-icons/muse.webp" alt="" width={20} height={20} className="rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      {busy ? 'Forging…' : '✦ Direct with Muse'}
                    </button>
                  </form>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={togglePublish}
                    disabled={busy}
                    className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    {world.in_communiverse ? 'Remove from Communiverse' : 'Publish to Communiverse'}
                  </button>
                  <Link
                    href="/profile"
                    className="min-h-[44px] inline-flex items-center px-4 rounded-lg border border-white/15 text-sm text-neutral-200 hover:bg-white/10"
                  >
                    Sell it in the Auction House (via Profile)
                  </Link>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Selling transfers this world — its Communiverse place and these owner
                  controls — to the buyer, and it leaves your profile.
                </p>
                {notice && <p className="text-sm text-cyan-200" role="status">{notice}</p>}
              </section>
            ) : (
              <p className="text-xs text-neutral-500">
                You are visiting this world. Its owner directs how it is built.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
