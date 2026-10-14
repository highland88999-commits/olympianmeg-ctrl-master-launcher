'use client';
// Profile — Characters: the platform character roster (Olympus 3D
// generator output), usable by every signed-in user in their profile
// (Merlin, 2026-10-13). Picking one sets it as your profile character:
// it shows here and on your public Agora profile.
//
// Persistence: the pick is stored per account on the PERSONAL
// user_profiles row (profile_character_id) through PATCH
// /api/profiles/me — the same pattern as the TikTok handle and
// preferred language. That column arrives with the
// 20261013_profile_character migration; until Merlin green-lights it,
// the API write is tolerated-but-skipped server-side and the pick is
// kept in localStorage on this device meanwhile (and mirrored back to
// localStorage on every save once account sync is live, so the two
// never disagree). Selection is free — no payment anywhere near this.
//
// Renders only when signed in — the account row needs the account id.
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { CHARACTERS, getCharacterById, isCharacterId } from '@/lib/characters/roster';

const LS_KEY = 'olympus.profileCharacterId';

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session && session.access_token
    ? { Authorization: 'Bearer ' + session.access_token }
    : null;
}

export default function MyCharacters() {
  const [userId, setUserId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [accountSync, setAccountSync] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || null;
        if (cancelled) return;
        setUserId(uid);
        if (!uid) { setLoaded(true); return; }

        let localId = null;
        try {
          const raw = window.localStorage.getItem(LS_KEY);
          if (isCharacterId(raw)) localId = raw;
        } catch { /* private mode etc. — local fallback just unavailable */ }

        const auth = await authHeader();
        if (auth) {
          const res = await fetch('/api/profiles/me', { headers: { ...auth } });
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          const personal = data?.profiles?.personal || null;
          if (personal && 'profile_character_id' in personal) {
            // Column live: the account row is the source of truth.
            const serverId = isCharacterId(personal.profile_character_id)
              ? personal.profile_character_id
              : null;
            setSelectedId(serverId);
            setAccountSync(true);
            try {
              if (serverId) window.localStorage.setItem(LS_KEY, serverId);
              else window.localStorage.removeItem(LS_KEY);
            } catch { /* mirror is best-effort */ }
          } else {
            // Migration not live yet: fall back to this device's pick.
            setSelectedId(localId);
            setAccountSync(false);
          }
        } else {
          setSelectedId(localId);
        }
      } catch {
        if (!cancelled) setSelectedId(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const choose = async (id) => {
    if (busyId) return;
    setBusyId(id || 'clear');
    setNote('');
    setSelectedId(id);
    try {
      if (id) window.localStorage.setItem(LS_KEY, id);
      else window.localStorage.removeItem(LS_KEY);
    } catch { /* best-effort */ }
    try {
      const auth = await authHeader();
      if (auth) {
        const res = await fetch('/api/profiles/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ type: 'personal', profile_character_id: id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.error || 'save failed');
        const persisted = data?.profileCharacter?.persisted;
        if (persisted === false) {
          setAccountSync(false);
          setNote('Saved on this device for now — account sync for characters switches on with a pending platform update, then your pick follows you everywhere.');
        } else if (persisted === true) {
          setAccountSync(true);
        }
      }
    } catch {
      setNote('Could not reach your account just now — your pick is saved on this device and will sync when you set it again.');
    } finally {
      setBusyId(null);
    }
  };

  if (!userId || !loaded) return null;

  const selected = getCharacterById(selectedId);

  return (
    <section aria-label="Characters" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">Characters</h2>
      <p className="text-xs text-neutral-500 mb-4">
        Characters from the Olympus roster, free for every account. Set one as your
        profile character and it represents you on your profile and your public
        Agora page.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CHARACTERS.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              disabled={busyId !== null}
              aria-pressed={active}
              onClick={() => choose(active ? null : c.id)}
              className="relative rounded-xl overflow-hidden border text-left transition-colors disabled:opacity-60"
              style={{
                borderColor: active ? '#67e8f9' : 'rgba(255,255,255,0.12)',
                background: active ? 'rgba(103,232,249,0.08)' : 'rgba(0,0,0,0.3)',
              }}
            >
              <span className="block aspect-square overflow-hidden">
                <Image
                  src={c.preview}
                  alt={c.name}
                  width={512}
                  height={512}
                  className="w-full h-full object-cover"
                />
              </span>
              <span className="block px-3 py-2.5">
                <span className="block text-sm font-semibold text-neutral-100 truncate">{c.name}</span>
                <span className="block text-[11px] text-neutral-500 tracking-widest uppercase">
                  Roster #{c.queueNumber}
                </span>
              </span>
              {active && (
                <span className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-cyan-300 text-black font-bold tracking-wide">
                  YOUR CHARACTER
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
        {selected ? (
          <p className="text-sm text-neutral-300">
            Your character: <span className="font-semibold text-neutral-100">{selected.name}</span>
            <span className="text-neutral-500"> — tap its card again, or Clear, to unset it.</span>
          </p>
        ) : (
          <p className="text-sm text-neutral-500">No character set yet — tap a card to make it yours.</p>
        )}
        {selected && (
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => choose(null)}
            className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>
      {!accountSync && selected && !note && (
        <p className="text-[11px] text-neutral-500 mt-2">
          Saved on this device for now — account sync for characters switches on with a pending platform update.
        </p>
      )}
      {note && <p className="text-[11px] text-amber-200/80 mt-2">{note}</p>}
    </section>
  );
}
